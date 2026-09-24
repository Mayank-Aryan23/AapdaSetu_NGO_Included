// Database Configuration
const SUPABASE_URL = 'https://cphqdgqtrosaxosdwdrz.supabase.co'; 
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNwaHFkZ3F0cm9zYXhvc2R3ZHJ6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjM3MjU4NDQsImV4cCI6MjA3OTMwMTg0NH0.CGhmghdxQaPpD6uxDjaoAmnhZZsOKiiwacNw-ZrpDQc';
const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

// Initialization
window.onload = function() {
    console.log("🚀 Command Center Initialized.");
    fetchDataAndRender(); 
    setupRealtimeListeners();
};

// Realtime Updates
function setupRealtimeListeners() {
    supabaseClient.channel('custom-all-channel')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'resources' }, () => {
            fetchDataAndRender(); 
        })
        .on('postgres_changes', { event: '*', schema: 'public', table: 'citizen_reports' }, () => {
            fetchDataAndRender(); 
        })
        .subscribe();
}

// Data Fetch & Render
async function fetchDataAndRender() {
    try {
        const { data: resources, error: resError } = await supabaseClient
            .from('resources')
            .select('*')
            .order('id');
            
        if (resError) throw resError;

        const { data: activeMissions, error: repError } = await supabaseClient
            .from('citizen_reports')
            .select('*')
            .eq('status', 'Assigned');
            
        if (repError) throw repError;

        renderResourceTable(resources, activeMissions);
        fetchPendingReports();

    } catch (err) {
        console.error("❌ Data Sync Error:", err);
    }
}

function renderResourceTable(resources, activeMissions) {
    const tbody = document.getElementById('resource-table-body');
    tbody.innerHTML = ''; 
    
    let availableCount = 0;
    let deployedCount = 0;

    resources.forEach(r => {
        if (r.status === 'Available') availableCount++;
        if (r.status === 'Deployed') deployedCount++;

        // Coordinate Matching
        let locationDisplay = `<span class="text-muted"><i class="bi bi-house-door-fill"></i> Base Camp</span>`;
        
        if (r.status === 'Deployed') {
            const mission = activeMissions.find(m => 
                m.assigned_to && m.assigned_to.trim().toLowerCase() === r.name.trim().toLowerCase()
            );

            if (mission) {
                const lat = mission.latitude || 0;
                const lng = mission.longitude || 0;
                locationDisplay = `
                    <div class="d-flex flex-column" data-bs-toggle="tooltip" data-bs-placement="top" title="GPS: ${lat}, ${lng}">
                        <span class="fw-bold text-dark" style="font-family: monospace;">
                            <i class="bi bi-geo-alt-fill text-danger"></i> ${Number(lat).toFixed(4)}, ${Number(lng).toFixed(4)}
                        </span>
                        <small class="text-primary" style="cursor: help; font-size: 0.75rem;">
                            <i class="bi bi-crosshair"></i> View Precision
                        </small>
                    </div>`;
            } else {
                locationDisplay = `<span class="text-warning"><i class="bi bi-broadcast"></i> On Mission</span>`;
            }
        }

        const dotClass = `dot-${r.status}`;
        const actionBtn = r.status === 'Available' 
            ? `<span class="badge bg-light text-muted border">Standby</span>` 
            : `<button class="btn btn-sm btn-outline-danger" onclick="recallResource(${r.id}, '${r.name}')">
                <i class="bi bi-arrow-return-left"></i> Recall
               </button>`;

        const row = `
            <tr>
                <td class="ps-4 fw-bold text-dark">${r.name}</td>
                <td><span class="badge bg-secondary">${r.type}</span></td>
                <td>${locationDisplay}</td>
                <td><span class="status-dot ${dotClass}"></span> ${r.status}</td>
                <td>${actionBtn}</td>
            </tr>`;
            
        tbody.innerHTML += row;
    });

    document.getElementById('count-total').innerText = resources.length;
    document.getElementById('count-avail').innerText = availableCount;
    document.getElementById('count-dep').innerText = deployedCount;
    
    // Initialize Tooltips
    var tooltipTriggerList = [].slice.call(document.querySelectorAll('[data-bs-toggle="tooltip"]'))
    var tooltipList = tooltipTriggerList.map(function (tooltipTriggerEl) { 
        return new bootstrap.Tooltip(tooltipTriggerEl) 
    });
}

// AI Dispatcher
async function fetchPendingReports() {
    const { data: reports } = await supabaseClient
        .from('citizen_reports')
        .select('*')
        .eq('status', 'Open')
        .order('created_at', { ascending: false })
        .limit(3); 

    document.getElementById('count-req').innerText = reports ? reports.length : 0;
    const container = document.getElementById('ai-suggestions');
    container.innerHTML = '';

    if (!reports || reports.length === 0) {
        container.innerHTML = `
            <div class="text-center text-muted mt-5 fade-in">
                <i class="bi bi-shield-check text-success display-4"></i>
                <p class="mt-3 fw-bold">All sectors clear.</p>
            </div>`;
        return;
    }

    const { data: availableResources } = await supabaseClient
        .from('resources')
        .select('*')
        .eq('status', 'Available');

    if (!availableResources || availableResources.length === 0) {
         container.innerHTML = `
            <div class="alert alert-danger text-center mt-3">
                <strong>CRITICAL WARNING:</strong> Zero resources available at Base Camp. Recall units immediately!
            </div>`;
         return;
    }

    for (let report of reports) {
        const loadingId = `loading-${report.id}`;
        container.innerHTML += `
            <div id="${loadingId}" class="card ai-suggestion mb-3 shadow-sm border-0 border-start border-5 border-secondary bg-light">
                <div class="card-body p-3 text-center">
                    <div class="spinner-border spinner-border-sm text-primary mb-2"></div>
                    <p class="small text-muted mb-0">AI is analyzing Report #${report.id}...</p>
                </div>
            </div>`;
        
        // 1. Request AI Decision
        let aiDecision = await askAIDispatcher(report, availableResources);
        let match = null;

        // 2. Fallback Routing Logic
        if (aiDecision === "ERROR" || !aiDecision) {
            console.warn(`[Report #${report.id}] AI API failed. Engaging Local Routing Fallback.`);
            const routingLogic = {
                'Medical': ['Medical'],
                'Flood': ['Rescue', 'Surveillance'],
                'Infra': ['Rescue', 'Fire'],
                'Fire': ['Fire'],
                'Food': ['Supplies']
            };
            const allowed = routingLogic[report.category] || ['Rescue'];
            match = availableResources.find(r => allowed.includes(r.type));
        } 
        // 3. Parse AI Decision
        else if (aiDecision !== "NONE") {
            const extractedNumbers = aiDecision.match(/\d+/);
            if (extractedNumbers) {
                const numericId = extractedNumbers[0];
                match = availableResources.find(r => r.id.toString() === numericId);
            }
        }
        
        document.getElementById(loadingId).remove();

        const lat = Number(report.latitude || 0).toFixed(4);
        const lng = Number(report.longitude || 0).toFixed(4);

        if (match) {
            const card = `
                <div class="card ai-suggestion mb-3 shadow-sm border-0 border-start border-5 border-primary">
                    <div class="card-body p-3">
                        <div class="d-flex justify-content-between align-items-center mb-2">
                            <h6 class="fw-bold text-dark mb-0"><i class="bi bi-robot text-primary"></i> DISPATCH MATCH</h6>
                            ${report.category === 'Medical' || report.category === 'Infra' ? '<span class="badge bg-danger pulse">CRITICAL</span>' : '<span class="badge bg-warning text-dark">URGENT</span>'}
                        </div>
                        <div class="bg-light p-2 rounded small text-dark mb-3">
                            <div class="d-flex justify-content-between border-bottom pb-1 mb-1">
                                <span class="text-muted">Analysis of:</span>
                                <strong class="text-danger">${report.category} Emergency</strong>
                            </div>
                            <div class="d-flex justify-content-between border-bottom pb-1 mb-1">
                                <span class="text-muted">Target GPS:</span>
                                <span style="font-family: monospace;">${lat}, ${lng}</span>
                            </div>
                            <div class="d-flex justify-content-between">
                                <span class="text-muted">Recommended Unit:</span>
                                <strong class="text-success">${match.name} (${match.type})</strong>
                            </div>
                        </div>
                        <button class="btn btn-primary fw-bold w-100 shadow-sm" 
                            onclick="generateOfficialOrder('${match.id}', '${match.name}', '${report.id}', this)">
                            <i class="bi bi-file-earmark-pdf"></i> ISSUE DEPLOYMENT ORDER
                        </button>
                    </div>
                </div>`;
            container.innerHTML += card;
        } else {
            const warningCard = `
                <div class="card ai-suggestion mb-3 shadow-sm border-0 border-start border-5 border-danger bg-danger bg-opacity-10">
                    <div class="card-body p-3">
                        <div class="d-flex justify-content-between align-items-center mb-2">
                            <h6 class="fw-bold text-danger mb-0"><i class="bi bi-exclamation-triangle-fill"></i> NO UNIT AVAILABLE</h6>
                        </div>
                        <div class="small text-dark mb-2">
                            Analysis of Report #${report.id} (<strong>${report.category}</strong>). No currently available unit has the correct capability profile to safely respond to this specific threat.
                        </div>
                        <div class="alert alert-danger p-2 mb-0 small border-danger text-center fw-bold">
                            Recall appropriate units to Base Camp.
                        </div>
                    </div>
                </div>`;
            container.innerHTML += warningCard;
        }
    }
}

// Secure Gemini Proxy Caller
// Secure Gemini Proxy Caller
async function askAIDispatcher(report, availableResources) {
    const teamsList = availableResources.map(r => `ID: ${r.id} | Name: ${r.name} | Type: ${r.type}`).join('\n');
    
    const systemPrompt = `
        You are the Chief AI Dispatcher for AapdaSetu.
        Assign the single most appropriate team from the AVAILABLE TEAMS list below.
        RULES:
        1. Medical emergencies MUST get Medical units.
        2. Floods MUST get Rescue or Surveillance units.
        3. Fires MUST get Fire Brigade.
        4. Food/Supplies MUST get Supply convoys.
        5. If no team safely matches, output NONE.
        6. Output ONLY the numerical ID. Example: "2"
        AVAILABLE TEAMS:
        ${teamsList}
    `;

    const userPrompt = `
        EMERGENCY REPORT:
        Category: ${report.category}
        Details: ${report.details || "No details provided."}
    `;

    try {
        // 1. Point explicitly to your new secure Node.js server
        const response = await fetch('/api/ai-dispatch', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                system: systemPrompt,
                user: userPrompt
            })
        });

        // 2. Read as text FIRST to prevent the JSON crash
        const rawText = await response.text();

        // 3. Catch Backend Errors gracefully
        if (!response.ok) {
            console.error(`❌ Backend Error (${response.status}):`, rawText);
            return "ERROR";
        }

        if (!rawText || rawText.trim() === "") {
            console.error("❌ Backend returned empty response.");
            return "ERROR";
        }

        // 4. Safe Parse
        const data = JSON.parse(rawText);
        
        if (data.error) {
            console.error("AI Proxy Error:", data.error);
            return "ERROR";
        }

        // 5. Read the decision correctly (No more OpenAI 'choices' structure)
        const aiDecision = data.decision ? data.decision.toString().trim() : data.toString().trim();
        
        console.log(`✅ AI Output for Report ${report.id}:`, aiDecision);
        return aiDecision;

    } catch (error) {
        console.error("❌ AI Dispatch Request Failed:", error);
        return "ERROR";
    }
}
// Official Order Generator (jsPDF & Supabase Storage)
async function generateOfficialOrder(resId, resName, reportId, btnElement) {
    
    const originalText = btnElement.innerHTML;
    btnElement.innerHTML = '<span class="spinner-border spinner-border-sm"></span> Signing...';
    btnElement.disabled = true;

    try {
        // 1. Fetch Details
        const { data: reportData, error } = await supabaseClient
            .from('citizen_reports')
            .select('*')
            .eq('id', reportId)
            .single();

        if (error) throw error;

        const lat = reportData.latitude;
        const lng = reportData.longitude;
        const targetLocation = `${reportData.location_text || "Field Loc"} (${lat}, ${lng})`;
        const missionCode = `ORD-${new Date().getFullYear()}-${Math.floor(1000 + Math.random() * 9000)}`;
        const dateStr = new Date().toLocaleDateString();

        // 2. Generate PDF Document
        const { jsPDF } = window.jspdf;
        const doc = new jsPDF();

        doc.setFont("times", "bold");
        doc.setFontSize(16);
        doc.text("GOVERNMENT OF INDIA", 105, 20, null, null, "center");
        doc.setFontSize(12);
        doc.text("DEPARTMENT OF DISASTER MANAGEMENT", 105, 28, null, null, "center");
        doc.text("EMERGENCY OPERATIONS CENTER (EOC)", 105, 34, null, null, "center");
        
        doc.setLineWidth(0.5);
        doc.line(20, 38, 190, 38); 

        doc.setFont("times", "normal");
        doc.setFontSize(10);
        doc.text(`Order No: ${missionCode}`, 20, 48);
        doc.text(`Date: ${dateStr}`, 150, 48);

        doc.setFont("times", "bold");
        doc.text("To,", 20, 60);
        doc.text(`The Unit Commander,`, 20, 65);
        doc.text(`${resName}`, 20, 70);
        doc.setFont("times", "normal");
        doc.text("Base Camp HQ", 20, 75);

        doc.setFont("times", "bold");
        doc.text(`Subject: IMMEDIATE DEPLOYMENT ORDER - ${reportData.category.toUpperCase()} RESPONSE`, 20, 90);

        doc.setFont("times", "normal");
        const bodyText = `1. In exercise of powers conferred under Section 24 of the Disaster Management Act, the Competent Authority has ordered the immediate mobilization of ${resName}.\n\n2. You are hereby directed to move with immediate effect to the following target location:`;
        doc.text(doc.splitTextToSize(bodyText, 170), 20, 105);

        doc.setDrawColor(0);
        doc.setFillColor(245, 245, 245);
        doc.rect(30, 135, 150, 30, 'FD');
        doc.setFont("times", "bold");
        doc.text(`TARGET: ${targetLocation}`, 40, 145);
        doc.text(`PRIORITY: CRITICAL / IMMEDIATE`, 40, 155);
        doc.text(`INCIDENT ID: #${reportId}`, 130, 155);

        doc.setFont("times", "normal");
        doc.text("3. The Unit Commander is directed to establish communication with Control Room upon arrival.", 20, 180);
        doc.text("4. Strict adherence to safety protocols is mandatory.", 20, 188);

        doc.setFont("times", "bold");
        doc.text("(Signed)", 150, 220);
        doc.text("CHIEF OPERATIONS OFFICER", 130, 225);
        doc.text("AapdaSetu Command Center", 130, 230);
        doc.text("Government of India", 130, 235);

        doc.setDrawColor(255, 0, 0); 
        doc.setLineWidth(1);
        doc.circle(160, 225, 15);
        doc.setTextColor(255, 0, 0);
        doc.setFontSize(8);
        doc.text("DIGITALLY", 152, 222);
        doc.text("AUTHORIZED", 149, 228);
        
        // 3. Upload to Supabase Storage
        const pdfBlob = doc.output('blob');
        const fileName = `Deployment_Order_${resName.replace(/\s/g, '_')}_${missionCode}.pdf`;

        const { data: uploadData, error: uploadError } = await supabaseClient.storage
            .from('reports') 
            .upload(fileName, pdfBlob, { contentType: 'application/pdf' });

        if (uploadError) throw uploadError;

        const { data: urlData } = supabaseClient.storage.from('reports').getPublicUrl(fileName);
        const finalPdfUrl = urlData.publicUrl;

        // 4. Update Database States
        await supabaseClient.from('mission_logs').insert([{
            mission_code: missionCode,
            team_name: resName,
            team_id: resId,
            incident_report_id: reportId,
            target_location: targetLocation,
            mission_type: reportData.category,
            pdf_url: finalPdfUrl 
        }]);

        await supabaseClient.from('resources').update({ 
            status: 'Deployed', 
            location: 'On Mission', 
            last_updated: new Date().toISOString()
        }).eq('id', resId);
        
        await supabaseClient.from('citizen_reports').update({ 
            status: 'Assigned', 
            assigned_to: resName, 
            deployment_time: new Date().toISOString() 
        }).eq('id', reportId);

        // Open Document & Update UI
        window.open(finalPdfUrl, '_blank');

        setTimeout(() => {
            fetchDataAndRender();
        }, 500);

        btnElement.innerHTML = '<i class="bi bi-check-circle"></i> Deployed!';
        btnElement.classList.remove('btn-primary');
        btnElement.classList.add('btn-success');

    } catch (err) {
        console.error(err);
        alert("Deployment Error: " + err.message);
        btnElement.innerHTML = originalText;
        btnElement.disabled = false;
    }
}

// Resource Control
async function recallResource(id, name) {
    if(confirm(`Recall ${name} to Base Camp?`)) {
        await supabaseClient.from('resources').update({ 
            status: 'Available', 
            location: 'Base Camp' 
        }).eq('id', id);
        
        setTimeout(() => { 
            fetchDataAndRender(); 
        }, 200);
    }
}