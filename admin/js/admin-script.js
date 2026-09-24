// ==========================================================
// ADMIN SESSION PROTECTION
// ==========================================================

let adminSupabaseClient = null;

(async () => {

    const session =
        await initializeProtectedSession("admin");

    if (!session) {
        return;
    }

    adminSupabaseClient =
        session.client;

    console.log(
        "🔐 Admin protected session verified."
    );

})();

// --- 1. DYNAMIC ENVIRONMENT CONFIGURATION ---
// Using "/" ensures it works on localhost and Render without changing code
const CONFIG_ENDPOINT = '/api/config'; 

// State Variables
let supabaseClient; 
let map;
let activeAlertsCache = []; 

// --- 2. ASYNC SECURE INITIALIZATION ---
document.addEventListener('DOMContentLoaded', async () => {
    try {
        console.log("🔒 Fetching secure environment config...");
        const response = await fetch(CONFIG_ENDPOINT);
        
        if (!response.ok) throw new Error("Failed to load environment configuration.");
        
        const config = await response.json();

        // Initialize Supabase with the fetched ANON key
        supabaseClient = window.supabase.createClient(config.supabaseUrl, config.supabaseAnonKey);
        console.log("✅ Supabase Client Initialized Securely.");

        // DYNAMICALLY load Google Maps script using the key from the backend
        loadGoogleMaps(config.googleMapsKey);

    } catch (error) {
        console.error("🚨 INITIALIZATION FATAL ERROR:", error);
        document.body.innerHTML = `<div class="alert alert-danger text-center m-5"><h4>System Offline</h4><p>Failed to establish secure connection to Backend.</p></div>`;
    }
});

// --- 3. DYNAMIC SCRIPT INJECTION ---
function loadGoogleMaps(apiKey) {
    if (window.google && window.google.maps) return; 

    const script = document.createElement('script');
    script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&callback=initMap&libraries=marker&loading=async`;
    script.async = true;
    script.defer = true;
    document.head.appendChild(script);
}

// --- 4. GOOGLE MAPS INITIALIZATION ---
window.initMap = function() {
    if (!supabaseClient) {
        setTimeout(window.initMap, 100); 
        return;
    }

    console.log("🗺️ Map Initializing...");
    const center = { lat: 20.2961, lng: 85.8245 };
    
    map = new google.maps.Map(document.getElementById("googleMap"), {
        zoom: 7, 
        center: center, 
        mapTypeId: 'terrain',
        mapId: "DEMO_MAP_ID"
    });
    
    setupRealtimeListeners();
    fetchActiveBroadcasts();
    fetchPendingAlerts();
    fetchCitizenReports(); 
}

// --- 5. REALTIME SUBSCRIPTIONS ---
function setupRealtimeListeners() {
    if (supabaseClient.getChannels().length > 0) return; 

    supabaseClient.channel('admin-global')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'alerts' }, payload => {
            if (payload.new.status === 'Pending') createPendingCard(payload.new);
            if (payload.new.status === 'Active' || payload.new.status === 'Resolved') {
                fetchActiveBroadcasts();
                setTimeout(fetchCitizenReports, 1000); 
            }
        })
        .subscribe();

    supabaseClient.channel('admin-reports-live')
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'citizen_reports' }, payload => {
            addReportMarker(payload.new);
            fetchCitizenReports(); 
        })
        .subscribe();
}

// --- 6. CITIZEN REPORTS MANAGEMENT ---
async function fetchCitizenReports() {
    const { data: reports, error } = await supabaseClient
        .from('citizen_reports')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(50);
        
    if (error) return console.error("Error fetching reports:", error);

    const { data: activeAlerts } = await supabaseClient.from('alerts').select('*').eq('status', 'Active');
    const currentAlerts = activeAlerts || [];
    const container = document.getElementById('citizen-reports-feed');
    
    container.innerHTML = '';

    if (!reports || reports.length === 0) {
        container.innerHTML = '<div class="text-center mt-5 text-muted">No reports yet.</div>';
        return;
    }

    const processedReports = reports.map(report => {
        let isCritical = false;
        let matchedAlert = null;

        currentAlerts.forEach(alert => {
            if (alert.latitude && alert.longitude && report.latitude && report.longitude) {
                const d = getDistanceKm(report.latitude, report.longitude, alert.latitude, alert.longitude);
                if (d <= (alert.radius_km || 50)) {
                    isCritical = true;
                    matchedAlert = alert.title;
                }
            }
        });
        return { ...report, isCritical, matchedAlert };
    });

    processedReports.sort((a, b) => {
        const isAssignedA = a.status === 'Assigned' ? 1 : 0;
        const isAssignedB = b.status === 'Assigned' ? 1 : 0;
        if (isAssignedA !== isAssignedB) return isAssignedA - isAssignedB;
        if (a.isCritical !== b.isCritical) return a.isCritical ? -1 : 1;
        return new Date(b.created_at) - new Date(a.created_at);
    });

    processedReports.forEach(r => {
        let badgeHtml = '';
        let borderClass = '';
        let cardStyle = '';

        if (r.status === 'Assigned') {
            badgeHtml = `<span class="badge bg-success float-end"><i class="bi bi-check-circle-fill"></i> Assigned: ${r.assigned_to || 'Rescue Team'}</span>`;
            borderClass = 'border-start border-5 border-success';
            cardStyle = 'opacity: 0.7; background-color: #f8f9fa;'; 
        } else {
            badgeHtml = r.isCritical 
                ? `<span class="badge bg-danger blinking float-end"><i class="bi bi-exclamation-triangle-fill"></i> CRITICAL: ${r.matchedAlert}</span>` 
                : `<span class="badge bg-secondary float-end">General Report</span>`;
            borderClass = r.isCritical ? 'report-card-critical' : 'report-card-normal';
        }

        let audioHtml = r.audio_url ? `
            <div class="mt-2 p-2 bg-white rounded border">
                <small class="text-danger fw-bold"><i class="bi bi-mic-fill"></i> DISTRESS CALL:</small>
                <audio controls class="w-100 mt-1" style="height: 30px;"><source src="${r.audio_url}" type="audio/webm"></audio>
            </div>` : '';

        container.innerHTML += `
            <div class="card mb-3 shadow-sm ${borderClass}" style="${cardStyle}">
                <div class="card-body p-3">
                    <div class="d-flex justify-content-between mb-2 align-items-center">
                        <strong class="text-dark fs-5">${r.category || 'Unknown'}</strong>
                        ${badgeHtml}
                    </div>
                    <small class="text-muted mb-2 d-block"><i class="bi bi-clock"></i> ${new Date(r.created_at).toLocaleTimeString()}</small>
                    <div class="p-2 bg-white border rounded mb-2 shadow-sm">
                        <p class="small mb-0 text-dark" style="white-space: pre-wrap;">${r.details || 'No description.'}</p>
                    </div>
                    ${audioHtml} 
                    <div class="d-flex gap-2 mt-3">
                        <button class="btn btn-sm btn-outline-primary flex-fill fw-bold" onclick="focusMap(${r.latitude}, ${r.longitude})"><i class="bi bi-crosshair"></i> Locate</button>
                        ${r.image_url ? `<a href="${r.image_url}" target="_blank" class="btn btn-sm btn-outline-secondary flex-fill fw-bold"><i class="bi bi-camera"></i> Evidence</a>` : ''}
                    </div>
                </div>
            </div>`;
        
        if (r.status !== 'Assigned') addReportMarker(r); 
    });
}

// --- UTILITIES ---
function getDistanceKm(lat1, lon1, lat2, lon2) {
    var R = 6371; 
    var dLat = (lat2-lat1) * (Math.PI/180);
    var dLon = (lon2-lon1) * (Math.PI/180);
    var a = Math.sin(dLat/2) * Math.sin(dLat/2) + Math.cos(lat1*(Math.PI/180)) * Math.cos(lat2*(Math.PI/180)) * Math.sin(dLon/2) * Math.sin(dLon/2); 
    return R * (2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a)));
}

function focusMap(lat, lng) {
    if (!map) return;
    map.setZoom(7); 
    setTimeout(() => {
        map.panTo({ lat: parseFloat(lat), lng: parseFloat(lng) });
        setTimeout(() => map.setZoom(13), 800);
    }, 300);
}

function addReportMarker(data) {
    if(!map) return;
    const lat = parseFloat(data.latitude);
    const lng = parseFloat(data.longitude);
    if (isNaN(lat) || isNaN(lng)) return;
    
    let iconUrl = "https://maps.google.com/mapfiles/ms/icons/red-dot.png"; 
    
    const marker = new google.maps.marker.AdvancedMarkerElement({
        position: { lat: lat, lng: lng },
        map: map,
        title: data.category
    });
    
    const info = new google.maps.InfoWindow({ 
        content: `<div style="padding: 5px;"><strong>${data.category}</strong></div>` 
    });
    
    marker.addListener("gmp-click", () => info.open(map, marker));
}

// --- ALERT MANAGEMENT ---
async function fetchActiveBroadcasts() {
    const { data } = await supabaseClient.from('alerts').select('*').eq('status', 'Active');
    activeAlertsCache = data || [];
    document.getElementById('active-alerts-count-badge').innerText = `${activeAlertsCache.length} Active Alerts`;
    const container = document.getElementById('active-broadcasts-container');
    container.innerHTML = '';
    
    if (activeAlertsCache.length === 0) {
        container.innerHTML = '<p class="text-muted small">No active disasters.</p>';
        return;
    }

    activeAlertsCache.forEach(alert => {
        const lat = parseFloat(alert.latitude);
        const lng = parseFloat(alert.longitude);
        if (map && !isNaN(lat) && !isNaN(lng)) {
            new google.maps.Circle({
                strokeColor: "#FF0000", strokeOpacity: 0.8, strokeWeight: 2,
                fillColor: "#FF0000", fillOpacity: 0.35, map,
                center: { lat: lat, lng: lng },
                radius: (parseFloat(alert.radius_km) || 50) * 1000, 
            });
        }
        container.innerHTML += `
            <div class="d-flex justify-content-between align-items-center border-bottom pb-2 mb-2">
                <div><strong class="text-danger">● LIVE:</strong> ${alert.title}</div>
                <button class="btn btn-outline-success btn-sm" onclick="resolveAlert(${alert.id})">✅ Resolve</button>
            </div>`;
    });
}

async function fetchPendingAlerts() {
    const { data } = await supabaseClient.from('alerts').select('*').eq('status', 'Pending');
    if (data) data.forEach(createPendingCard);
}

function createPendingCard(data) {
    if (document.getElementById(`alert-${data.id}`)) return;
    document.getElementById('ai-empty-state').style.display = 'none';
    const html = `
        <div class="card mb-3 border-warning shadow-sm" id="alert-${data.id}">
            <div class="card-body">
                <div class="d-flex justify-content-between align-items-center">
                    <h6 class="fw-bold text-danger mb-0">⚠️ ${data.title}</h6>
                    <span class="badge bg-danger">${data.severity || 'Urgent'}</span>
                </div>
                <div class="bg-light p-2 rounded mt-2 mb-2 border-start border-3 border-warning">
                    <small class="text-secondary fw-bold"><i class="bi bi-robot"></i> AI ANALYSIS:</small><br>
                    <span class="small">${data.summary}</span>
                </div>
                <button class="btn btn-danger btn-sm fw-bold w-100" onclick="broadcast(${data.id})">VERIFY & BROADCAST 📡</button>
            </div>
        </div>`;
    document.getElementById('incoming-alerts').insertAdjacentHTML('afterbegin', html);
}

async function broadcast(id) {
    await supabaseClient.from('alerts').update({ status: 'Active' }).eq('id', id);
    const card = document.getElementById(`alert-${id}`);
    if (card) card.remove();
}

async function resolveAlert(id) {
    if (confirm("End alert?")) {
        await supabaseClient.from('alerts').update({ status: 'Resolved' }).eq('id', id);
        location.reload(); 
    }
}