// 1. Load environment variables
require('dotenv').config();

const cron = require('node-cron');
const express = require('express');
const cors = require('cors');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');
const { GoogleGenerativeAI } = require('@google/generative-ai'); 

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname))); 
app.use('/admin', express.static(path.join(__dirname, 'admin')));

// ============================================================
// ADMIN AUTHENTICATION MIDDLEWARE
// ============================================================

async function requireAdmin(req, res, next) {
    try {
        const authHeader = req.headers.authorization;

        if (!authHeader || !authHeader.startsWith("Bearer ")) {
            return res.status(401).json({
                error: "Authentication required."
            });
        }

        const accessToken = authHeader.substring(7);

        // Verify the Supabase access token
        const {
            data: { user },
            error: authError
        } = await supabase.auth.getUser(accessToken);

        if (authError || !user) {
            return res.status(401).json({
                error: "Invalid or expired session."
            });
        }

        // Verify that the authenticated user is an ACTIVE Admin
        const {
            data: adminUser,
            error: adminError
        } = await supabase
            .from("admin_users")
            .select(`
                id,
                admin_id,
                auth_user_id,
                status
            `)
            .eq("auth_user_id", user.id)
            .eq("status", "ACTIVE")
            .maybeSingle();

        if (adminError) {
            console.error("Admin authorization error:", adminError);

            return res.status(500).json({
                error: "Failed to verify administrator."
            });
        }

        if (!adminUser) {
            return res.status(403).json({
                error: "Administrator privileges required."
            });
        }

        // Attach verified Admin information to request
        req.admin = {
            id: adminUser.id,
            adminId: adminUser.admin_id,
            authUserId: adminUser.auth_user_id
        };

        next();

    } catch (error) {

        console.error("Admin middleware error:", error);

        return res.status(500).json({
            error: "Authentication verification failed."
        });
    }
}

// Initialize Supabase & Gemini
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// ============================================================================
// GLOBAL HELPER FUNCTION (Must be up here so ALL routes can see it!)
// ============================================================================
const fetchSafely = async (url) => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 900000); // 90-second timeout

    try {
        const response = await fetch(url, { signal: controller.signal });
        clearTimeout(timeout);

        if (response.status === 502) {
            console.warn(`⚠️ API (502) - Server Overloaded: ${url}`);
            return null;
        }

        return response.ok ? await response.json() : null;
    } catch (e) {
        if (e.name === 'AbortError') {
            console.error(`🚨 Timeout: API took too long (>90s) for ${url}`);
        } else {
            console.error(`🚨 Fetch failed for ${url} | Reason: ${e.message}`);
        }
        return null;
    } finally {
        clearTimeout(timeout);
    }
};
// ============================================================================
// ==========================================================
// NGO AUTHENTICATION
// NGO logs in using NGO CODE + PASSWORD
// ==========================================================

app.post('/api/auth/ngo-login', async (req, res) => {

    try {

        const { ngoCode, password } = req.body;

        // --------------------------------------------------
        // Validate input
        // --------------------------------------------------

        if (!ngoCode || !password) {

            return res.status(400).json({
                error: "NGO ID and password are required."
            });

        }


        // --------------------------------------------------
        // Find NGO
        // --------------------------------------------------

        const { data: ngo, error: ngoError } =
            await supabase
                .from('ngos')
                .select(`
                    id,
                    ngo_code,
                    name,
                    email,
                    status
                `)
                .eq('ngo_code', ngoCode.trim())
                .maybeSingle();


        if (ngoError) {

            console.error(
                "NGO lookup error:",
                ngoError
            );

            return res.status(500).json({
                error: "Unable to verify NGO."
            });
        }


        // --------------------------------------------------
        // NGO does not exist
        // --------------------------------------------------

        if (!ngo) {

            return res.status(401).json({
                error: "Invalid NGO credentials."
            });
        }


        // --------------------------------------------------
        // NGO must be ACTIVE
        // --------------------------------------------------

        if (ngo.status !== 'ACTIVE') {

            return res.status(403).json({
                error: "NGO account is inactive."
            });
        }


        // --------------------------------------------------
        // Find NGO USER
        // --------------------------------------------------

        const {
            data: ngoUser,
            error: ngoUserError
        } =
            await supabase
                .from('ngo_users')
                .select(`
                    id,
                    auth_user_id,
                    ngo_id,
                    role,
                    status
                `)
                .eq('ngo_id', ngo.id)
                .maybeSingle();


        if (ngoUserError) {

            console.error(
                "NGO user lookup error:",
                ngoUserError
            );

            return res.status(500).json({
                error: "Unable to verify NGO user."
            });
        }


        // --------------------------------------------------
        // NGO USER must exist
        // --------------------------------------------------

        if (!ngoUser) {

            return res.status(401).json({
                error: "NGO authorization record not found."
            });
        }


        // --------------------------------------------------
        // NGO USER must be ACTIVE
        // --------------------------------------------------

        if (ngoUser.status !== 'ACTIVE') {

            return res.status(403).json({
                error: "NGO user account is inactive."
            });
        }


        // --------------------------------------------------
        // NGO email must exist for Supabase Auth
        // --------------------------------------------------

        if (!ngo.email) {

            return res.status(500).json({
                error: "NGO authentication email is not configured."
            });
        }


        // --------------------------------------------------
        // Authenticate through Supabase Auth
        // --------------------------------------------------

        const {
            data: authData,
            error: authError
        } =
            await supabase.auth.signInWithPassword({
                email: ngo.email,
                password: password
            });


        if (authError || !authData?.user) {

            console.warn(
                "NGO authentication failed:",
                authError?.message
            );

            return res.status(401).json({
                error: "Invalid NGO credentials."
            });
        }


        // --------------------------------------------------
        // CRITICAL: Verify Auth ID matches ngo_users
        // --------------------------------------------------

        if (
            authData.user.id !==
            ngoUser.auth_user_id
        ) {

            console.error(
                "🚨 NGO AUTH MAPPING MISMATCH"
            );

            // Sign out the server-side client
            await supabase.auth.signOut();

            return res.status(403).json({
                error: "NGO authorization mismatch."
            });
        }


        // --------------------------------------------------
        // SUCCESS
        // --------------------------------------------------

        console.log(
            `✅ NGO authenticated: ${ngo.ngo_code}`
        );


        return res.status(200).json({

            success: true,

            message:
                "NGO authentication verified.",

            session: {

                access_token:
                    authData.session.access_token,

                refresh_token:
                    authData.session.refresh_token

            },

            ngo: {

                id: ngo.id,

                ngo_code:
                    ngo.ngo_code,

                name:
                    ngo.name,

                role:
                    ngoUser.role
            }

        });

    }

    catch (error) {

        console.error(
            "🚨 NGO LOGIN ERROR:",
            error
        );

        return res.status(500).json({
            error: "NGO authentication failed."
        });

    }

});

// --- SECURE CONFIG ROUTE ---
app.get('/api/config', (req, res) => {
    res.status(200).json({
        supabaseUrl: process.env.SUPABASE_URL,
        supabaseAnonKey: process.env.SUPABASE_ANON_KEY,
        googleMapsKey: process.env.GOOGLE_MAPS_KEY
    });
});

// --- HEALTH CHECK ---
app.get('/api/status', (req, res) => {
    res.status(200).json({ status: "Online", message: "AapdaSetu Backend is running." });
});

// --- AI DISPATCH ROUTE ---
app.post('/api/ai-dispatch', async (req, res) => {
    try {
        const { system, user } = req.body; 
        const model = genAI.getGenerativeModel({ 
            model: "gemini-1.5-flash", 
            generationConfig: { responseMimeType: "text/plain" } 
        });

        const fullPrompt = `${system}\n\n${user}`;
        const result = await model.generateContent(fullPrompt);
        const aiText = result.response.text().trim();

        res.status(200).json({ decision: aiText });
    } catch (error) {
        console.error("🚨 REAL ERROR CAUSE:", error);
        res.status(500).json({ error: "Failed to dispatch via AI Core." });
    }
});

// --- MANUAL AI MESH SYNC ROUTE ---
app.post('/api/mesh/update-predictions', async (req, res) => {
    const startTime = Date.now();
    try {
        const { nodes } = req.body; 
        if (!nodes || nodes.length === 0) return res.status(400).json({ error: "No nodes provided." });

        const nodePromises = nodes.map(async (node) => {
            const { latitude: lat, longitude: lon } = node;

            const [heatRes, cycRes, floodRes] = await Promise.all([
                fetchSafely(`${process.env.RENDER_HEATWAVE_URL}/predict?lat=${lat}&lon=${lon}`),
                fetchSafely(`${process.env.RENDER_CYCLONE_URL}/predict?lat=${lat}&lon=${lon}`),
                fetchSafely(`${process.env.RENDER_FLOOD_URL}/predict?lat=${lat}&lon=${lon}`)
            ]);

            const telemetry = {
                timestamp: new Date().toISOString(),
                heatwave: heatRes ? heatRes.result : null,
                cyclone: cycRes ? cycRes.result : null,
                flood: floodRes ? floodRes.result : null
            };

            const heatProb = telemetry.heatwave ? Math.round(telemetry.heatwave.probability_heat * 100) : node.heatwave_prob;
            const cycProb = telemetry.cyclone ? Math.round(telemetry.cyclone.probability_cyclone * 100) : node.landslide_prob;
            const floodProb = telemetry.flood ? Math.round(telemetry.flood.probability_flood * 100) : node.flood_prob;

            return {
                id: node.id,
                heatwave_prob: heatProb,
                landslide_prob: cycProb,
                flood_prob: floodProb,
                ai_telemetry: telemetry, 
                last_updated: new Date().toISOString()
            };
        });

        const bulkUpdateData = await Promise.all(nodePromises);
        
        const { error } = await supabase.from('ai_mesh_nodes').upsert(bulkUpdateData);
        if (error) throw error;

        console.log(`✅ Multi-Model Sync Complete in ${Date.now() - startTime}ms`);
        res.status(200).json({ success: true });

    } catch (error) {
        console.error("🚨 Mesh Sync Error:", error);
        res.status(500).json({ error: "Failed to sync Multi-Model AI" });
    }
});

// --- AUTOMATED CRON SYNC (Every 30 Mins) ---
cron.schedule('*/30 * * * *', async () => {
    console.log("\n⏳ CRON INITIATED: Running 30-Minute Automated Mesh Sync...");
    
    try {
        const { data: nodes, error: dbError } = await supabase.from('ai_mesh_nodes').select('*');
        if (dbError || !nodes || nodes.length === 0) return console.log("No nodes found.");

        const nodePromises = nodes.map(async (node) => {
            const { latitude: lat, longitude: lon } = node;

            const [heatRes, cycRes, floodRes] = await Promise.all([
                fetchSafely(`${process.env.RENDER_HEATWAVE_URL}/predict?lat=${lat}&lon=${lon}`),
                fetchSafely(`${process.env.RENDER_CYCLONE_URL}/predict?lat=${lat}&lon=${lon}`),
                fetchSafely(`${process.env.RENDER_FLOOD_URL}/predict?lat=${lat}&lon=${lon}`)
            ]);

            const telemetry = {
                timestamp: new Date().toISOString(),
                heatwave: heatRes ? heatRes.result : null,
                cyclone: cycRes ? cycRes.result : null,
                flood: floodRes ? floodRes.result : null
            };

            return {
                id: node.id,
                heatwave_prob: telemetry.heatwave ? Math.round(telemetry.heatwave.probability_heat * 100) : node.heatwave_prob,
                landslide_prob: telemetry.cyclone ? Math.round(telemetry.cyclone.probability_cyclone * 100) : node.landslide_prob,
                flood_prob: telemetry.flood ? Math.round(telemetry.flood.probability_flood * 100) : node.flood_prob,
                ai_telemetry: telemetry,
                last_updated: new Date().toISOString()
            };
        });

        const bulkUpdateData = await Promise.all(nodePromises);
        const { error: upsertError } = await supabase.from('ai_mesh_nodes').upsert(bulkUpdateData);

        if (upsertError) throw upsertError;
        console.log("✅ CRON SUCCESS: Background mesh synchronization complete.");

    } catch (error) {
        console.error("🚨 CRON FAILED:", error);
    }
});
// ============================================================
// TEMPORARY ADMIN AUTH TEST
// ============================================================

app.get('/api/admin/test-auth', requireAdmin, (req, res) => {
    res.status(200).json({
        success: true,
        message: 'Admin authentication verified.',
        admin: req.admin
    });
});


// ============================================================
// ADMIN → NGO PROVISIONING
// ============================================================

app.post(
    "/api/admin/ngos/provision",
    requireAdmin,
    async (req, res) => {

        try {

            const {
                ngoCode,
                password
            } = req.body;

            // ------------------------------------------------
            // Basic validation
            // ------------------------------------------------

            if (!ngoCode || !password) {
                return res.status(400).json({
                    error: "NGO code and password are required."
                });
            }

            if (password.length < 8) {
                return res.status(400).json({
                    error: "Password must contain at least 8 characters."
                });
            }

            // ------------------------------------------------
            // Find existing NGO
            // ------------------------------------------------

            const {
                data: ngo,
                error: ngoError
            } = await supabase
                .from("ngos")
                .select("*")
                .eq("ngo_code", ngoCode)
                .maybeSingle();

            if (ngoError) {
                console.error("NGO lookup error:", ngoError);
                throw ngoError;
            }

            if (!ngo) {
                return res.status(404).json({
                    error: "NGO not found."
                });
            }

            if (ngo.status !== "ACTIVE") {
                return res.status(403).json({
                    error: "This NGO is not active."
                });
            }

            // ------------------------------------------------
            // Check whether NGO already has a login
            // ------------------------------------------------

            const {
                data: existingUser,
                error: existingError
            } = await supabase
                .from("ngo_users")
                .select("id, auth_user_id, role, status")
                .eq("ngo_id", ngo.id)
                .maybeSingle();

            if (existingError) {
                console.error(
                    "Existing NGO user lookup error:",
                    existingError
                );

                throw existingError;
            }

            if (existingUser) {
                return res.status(409).json({
                    error: "This NGO already has a login account."
                });
            }

            // ------------------------------------------------
            // Internal Auth email
            // ------------------------------------------------
            // NGO users will log in using NGO CODE.
            // This email is an internal authentication identity.

            const internalEmail =
                `${ngo.ngo_code.toLowerCase()}@aapdasetu.internal`;

            // ------------------------------------------------
            // Create Supabase Auth user
            // ------------------------------------------------

            const {
                data: authData,
                error: authError
            } = await supabase.auth.admin.createUser({
                email: internalEmail,
                password: password,
                email_confirm: true,
                user_metadata: {
                    account_type: "NGO",
                    ngo_id: ngo.id,
                    ngo_code: ngo.ngo_code
                }
            });

            if (authError) {
                console.error(
                    "Supabase Auth NGO creation error:",
                    authError
                );

                throw authError;
            }

            // ------------------------------------------------
            // Create NGO user mapping
            // ------------------------------------------------

            const {
                data: ngoUser,
                error: ngoUserError
            } = await supabase
                .from("ngo_users")
                .insert({
                    auth_user_id: authData.user.id,
                    ngo_id: ngo.id,
                    role: "NGO_MEMBER",
                    status: "ACTIVE"
                })
                .select()
                .single();

            if (ngoUserError) {

                // --------------------------------------------
                // Roll back Auth user if DB mapping fails
                // --------------------------------------------

                await supabase.auth.admin.deleteUser(
                    authData.user.id
                );

                console.error(
                    "NGO user creation failed:",
                    ngoUserError
                );

                throw ngoUserError;
            }

            // ------------------------------------------------
            // Success
            // ------------------------------------------------

            console.log(
                `✅ NGO login provisioned: ${ngo.ngo_code}`
            );

            return res.status(201).json({
                success: true,

                ngo: {
                    id: ngo.id,
                    ngoCode: ngo.ngo_code,
                    name: ngo.name,
                    status: ngo.status
                },

                user: {
                    id: ngoUser.id,
                    role: ngoUser.role,
                    status: ngoUser.status
                }
            });

        } catch (error) {

            console.error(
                "🚨 NGO Provisioning Error:",
                error
            );

            return res.status(500).json({
                error: "Failed to provision NGO login."
            });
        }
    }
);

// --- START SERVER ---
app.listen(PORT, () => {
    console.log(`🚀 Secure Server running on http://localhost:${PORT}`);
});