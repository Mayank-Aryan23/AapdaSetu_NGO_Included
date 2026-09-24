// ==========================================================
// AAPDASETU SECURE LOGIN GATEWAY
// Admin + NGO
// 4-Hour Absolute Session
// ==========================================================

const CONFIG_ENDPOINT = "/api/config";

// 4 hours
const SESSION_DURATION = 4 * 60 * 60 * 1000;

let supabaseClient = null;
let loginMode = "admin";


// ==========================================================
// INITIALIZATION
// ==========================================================

document.addEventListener("DOMContentLoaded", async () => {

    await initializeSupabase();

    if (!supabaseClient) {
        return;
    }

    await checkExistingSession();

    startLiveFeed();

    initializeLoginMode();

    initializePasswordToggle();

    const loginForm =
        document.getElementById("loginForm");

    if (loginForm) {
        loginForm.addEventListener(
            "submit",
            handleLogin
        );
    }

});


// ==========================================================
// SUPABASE INITIALIZATION
// ==========================================================

async function initializeSupabase() {

    try {

        const response =
            await fetch(CONFIG_ENDPOINT);

        if (!response.ok) {
            throw new Error("Config load failed");
        }

        const config =
            await response.json();

        supabaseClient =
            window.supabase.createClient(
                config.supabaseUrl,
                config.supabaseAnonKey
            );

        console.log(
            "✅ Secure Supabase initialized"
        );

    } catch (err) {

        console.error(
            "Supabase initialization failed:",
            err
        );

        alert(
            "Unable to establish secure connection."
        );
    }
}


// ==========================================================
// CHECK EXISTING SESSION
// ==========================================================

async function checkExistingSession() {

    if (!supabaseClient) {
        return;
    }

    try {

        const {
            data: {
                session
            }
        } =
            await supabaseClient.auth.getSession();


        // No Supabase session
        if (!session) {

            clearLocalSessionData();

            return;
        }


        const sessionStarted =
            Number(
                localStorage.getItem(
                    "aapdasetu_session_started"
                )
            );


        // No timestamp means this session was created
        // before our new session system.
        if (!sessionStarted) {

            console.log(
                "⚠️ Session timestamp missing. Re-authentication required."
            );

            await supabaseClient.auth.signOut();

            clearLocalSessionData();

            return;
        }


        // Check 4-hour expiration
        if (
            Date.now() - sessionStarted >=
            SESSION_DURATION
        ) {

            console.log(
                "⏰ AapdaSetu session expired."
            );

            await supabaseClient.auth.signOut();

            clearLocalSessionData();

            return;
        }


        const userId =
            session.user.id;


        // ==================================================
        // CHECK ADMIN
        // ==================================================

        const {
            data: admin,
            error: adminError
        } =
            await supabaseClient
                .from("admin_users")
                .select(`
                    status,
                    admin_directory (
                        name
                    )
                `)
                .eq(
                    "auth_user_id",
                    userId
                )
                .maybeSingle();


        if (
            !adminError &&
            admin &&
            admin.status === "ACTIVE"
        ) {

            localStorage.setItem(
                "aapdasetu_user_type",
                "admin"
            );

            sessionStorage.setItem(
                "admin_name",
                admin.admin_directory?.name || ""
            );

            window.location.href =
                "admin/index.html";

            return;
        }


        // ==================================================
        // CHECK NGO
        // ==================================================

        const {
            data: ngoUser,
            error: ngoError
        } =
            await supabaseClient
                .from("ngo_users")
                .select(`
                    status,
                    role,
                    ngo_id,
                    ngos (
                        ngo_code,
                        name,
                        status
                    )
                `)
                .eq(
                    "auth_user_id",
                    userId
                )
                .maybeSingle();


        if (
            !ngoError &&
            ngoUser &&
            ngoUser.status === "ACTIVE" &&
            ngoUser.ngos &&
            ngoUser.ngos.status === "ACTIVE"
        ) {

            localStorage.setItem(
                "aapdasetu_user_type",
                "ngo"
            );

            sessionStorage.setItem(
                "ngo_code",
                ngoUser.ngos.ngo_code
            );

            sessionStorage.setItem(
                "ngo_name",
                ngoUser.ngos.name
            );

            window.location.href =
                "ngo/index.html";

            return;
        }


        // ==================================================
        // SESSION EXISTS BUT USER IS NOT AUTHORIZED
        // ==================================================

        console.warn(
            "⚠️ Authenticated user is not authorized."
        );

        await supabaseClient.auth.signOut();

        clearLocalSessionData();

    } catch (err) {

        console.error(
            "Session verification failed:",
            err
        );

    }
}


// ==========================================================
// LOGIN MODE
// ==========================================================

function initializeLoginMode() {

    const adminModeBtn =
        document.getElementById(
            "adminModeBtn"
        );

    const ngoModeBtn =
        document.getElementById(
            "ngoModeBtn"
        );


    if (!adminModeBtn || !ngoModeBtn) {
        return;
    }


    adminModeBtn.addEventListener(
        "click",
        () => {

            loginMode = "admin";

            updateLoginModeUI();

        }
    );


    ngoModeBtn.addEventListener(
        "click",
        () => {

            loginMode = "ngo";

            updateLoginModeUI();

        }
    );


    updateLoginModeUI();
}


// ==========================================================
// UPDATE LOGIN UI
// ==========================================================

function updateLoginModeUI() {

    const adminModeBtn =
        document.getElementById(
            "adminModeBtn"
        );

    const ngoModeBtn =
        document.getElementById(
            "ngoModeBtn"
        );

    const title =
        document.getElementById(
            "loginTitle"
        );

    const subtitle =
        document.getElementById(
            "loginSubtitle"
        );

    const identifierLabel =
        document.getElementById(
            "identifierLabel"
        );

    const identifierInput =
        document.getElementById(
            "loginIdentifier"
        );

    const passwordLabel =
        document.getElementById(
            "passwordLabel"
        );

    const loginButton =
        document.getElementById(
            "loginAccessBtn"
        );

    const accessNotice =
        document.getElementById(
            "accessNotice"
        );


    if (
        !adminModeBtn ||
        !ngoModeBtn ||
        !title ||
        !subtitle ||
        !identifierLabel ||
        !identifierInput ||
        !passwordLabel ||
        !loginButton ||
        !accessNotice
    ) {
        return;
    }


    // ======================================================
    // ADMIN
    // ======================================================

    if (loginMode === "admin") {

        adminModeBtn.classList.add("active");
        ngoModeBtn.classList.remove("active");


        title.textContent =
            "Admin Identity Verification";

        subtitle.textContent =
            "Authorized disaster management personnel only.";


        identifierLabel.innerHTML =
            '<i class="bi bi-person-badge me-1"></i> Government ID';

        identifierInput.placeholder =
            "admin@ndma.gov.in";

        identifierInput.type =
            "email";


        passwordLabel.innerHTML =
            '<i class="bi bi-key-fill me-1"></i> Clearance Password';


        loginButton.textContent =
            "AUTHENTICATE ADMIN SESSION";


        accessNotice.innerHTML =
            '<i class="bi bi-shield-x me-1"></i>' +
            "Authorized administrative access only.";

    }


    // ======================================================
    // NGO
    // ======================================================

    else {

        adminModeBtn.classList.remove("active");
        ngoModeBtn.classList.add("active");


        title.textContent =
            "NGO Identity Verification";

        subtitle.textContent =
            "Authorized partner organizations only.";


        identifierLabel.innerHTML =
            '<i class="bi bi-building me-1"></i> NGO ID';

        identifierInput.placeholder =
            "NGO-TEST-001";

        identifierInput.type =
            "text";


        passwordLabel.innerHTML =
            '<i class="bi bi-key-fill me-1"></i> Access Password';


        loginButton.textContent =
            "AUTHENTICATE NGO SESSION";


        accessNotice.innerHTML =
            '<i class="bi bi-shield-check me-1"></i>' +
            "Authorized NGO access only.";

    }
}


// ==========================================================
// PASSWORD TOGGLE
// ==========================================================

function initializePasswordToggle() {

    const toggle =
        document.getElementById(
            "passwordToggle"
        );

    const password =
        document.getElementById(
            "loginPassword"
        );


    if (!toggle || !password) {
        return;
    }


    toggle.addEventListener(
        "click",
        () => {

            const icon =
                toggle.querySelector("i");


            if (
                password.type ===
                "password"
            ) {

                password.type =
                    "text";

                icon.classList.remove(
                    "bi-eye"
                );

                icon.classList.add(
                    "bi-eye-slash"
                );

            } else {

                password.type =
                    "password";

                icon.classList.remove(
                    "bi-eye-slash"
                );

                icon.classList.add(
                    "bi-eye"
                );

            }

        }
    );
}


// ==========================================================
// COMMON LOGIN
// ==========================================================

async function handleLogin(e) {

    e.preventDefault();


    if (loginMode === "admin") {

        await handleAdminLogin();

    } else {

        await handleNgoLogin();

    }
}


// ==========================================================
// ADMIN LOGIN
// ==========================================================

async function handleAdminLogin() {

    const identifierInput =
        document.getElementById(
            "loginIdentifier"
        );

    const passwordInput =
        document.getElementById(
            "loginPassword"
        );

    const loginBtn =
        document.getElementById(
            "loginAccessBtn"
        );


    const email =
        identifierInput.value.trim();

    const password =
        passwordInput.value;


    if (!email || !password) {

        alert(
            "Please enter Government ID and password."
        );

        return;
    }


    const original =
        loginBtn.innerHTML;


    loginBtn.disabled = true;

    loginBtn.innerHTML =
        '<span class="spinner-border spinner-border-sm me-2"></span>' +
        "AUTHENTICATING...";


    try {

        // --------------------------------------------------
        // SUPABASE AUTH
        // --------------------------------------------------

        const {
            data,
            error
        } =
            await supabaseClient.auth
                .signInWithPassword({
                    email,
                    password
                });


        if (error) {
            throw error;
        }


        // --------------------------------------------------
        // VERIFY ADMIN
        // --------------------------------------------------

        const {
            data: admin,
            error: adminError
        } =
            await supabaseClient
                .from("admin_users")
                .select(`
                    status,
                    admin_directory (
                        name
                    )
                `)
                .eq(
                    "auth_user_id",
                    data.user.id
                )
                .maybeSingle();


        if (
            adminError ||
            !admin ||
            admin.status !== "ACTIVE"
        ) {

            await supabaseClient.auth.signOut();

            throw new Error(
                "Unauthorized Admin"
            );
        }


        // --------------------------------------------------
        // CREATE OUR 4-HOUR SESSION
        // --------------------------------------------------

        localStorage.setItem(
            "aapdasetu_session_started",
            Date.now().toString()
        );

        localStorage.setItem(
            "aapdasetu_user_type",
            "admin"
        );


        sessionStorage.setItem(
            "admin_name",
            admin.admin_directory?.name || ""
        );


        // --------------------------------------------------
        // REDIRECT
        // --------------------------------------------------

        window.location.href =
            "admin/index.html";

    } catch (err) {

        console.error(
            "Admin login failed:",
            err
        );

        alert(
            "❌ Invalid Admin credentials."
        );

        passwordInput.value = "";

        loginBtn.disabled = false;

        loginBtn.innerHTML =
            original;
    }
}


// ==========================================================
// NGO LOGIN
// ==========================================================

async function handleNgoLogin() {

    const identifierInput =
        document.getElementById("loginIdentifier");

    const passwordInput =
        document.getElementById("loginPassword");

    const loginBtn =
        document.getElementById("loginAccessBtn");

    const ngoCode =
        identifierInput.value.trim();

    const password =
        passwordInput.value;

    if (!ngoCode || !password) {
        alert("Please enter NGO ID and password.");
        return;
    }

    const original = loginBtn.innerHTML;

    loginBtn.disabled = true;
    loginBtn.innerHTML =
        '<span class="spinner-border spinner-border-sm me-2"></span>' +
        "AUTHENTICATING...";

    try {

        // ==================================================
        // 1. AUTHENTICATE NGO THROUGH BACKEND
        // ==================================================

        const response = await fetch(
            "/api/auth/ngo-login",
            {
                method: "POST",
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({
                    ngoCode,
                    password
                })
            }
        );

        const result = await response.json();

        console.log("NGO LOGIN RESPONSE:", result);

        if (!response.ok) {
            throw new Error(
                result.error ||
                "NGO authentication failed."
            );
        }

        // ==================================================
        // 2. VERIFY AUTHENTICATION RESPONSE
        // ==================================================

        if (
            !result.session ||
            !result.session.access_token ||
            !result.session.refresh_token
        ) {
            console.error(
                "Invalid session response:",
                result
            );

            throw new Error(
                "Authentication succeeded but no valid session was returned."
            );
        }

        // ==================================================
        // 3. ESTABLISH SUPABASE SESSION
        // ==================================================

        const {
            data: sessionData,
            error: sessionError
        } =
            await supabaseClient.auth.setSession({
                access_token:
                    result.session.access_token,

                refresh_token:
                    result.session.refresh_token
            });

        if (sessionError) {
            console.error(
                "Supabase session error:",
                sessionError
            );

            throw sessionError;
        }

        console.log(
            "✅ NGO Supabase session established:",
            sessionData?.user?.id
        );

        // ==================================================
        // 4. VERIFY NGO DATA FROM BACKEND RESPONSE
        // ==================================================

        if (!result.ngo) {

            console.error(
                "Backend authenticated NGO but NGO data is missing:",
                result
            );

            throw new Error(
                "NGO authentication succeeded, but NGO profile data was not returned."
            );
        }

        const authenticatedNgoCode =
            result.ngo.ngo_code || ngoCode;

        const authenticatedNgoName =
            result.ngo.name || "Authorized NGO";

        // ==================================================
        // 5. CREATE 4-HOUR APPLICATION SESSION
        // ==================================================

        localStorage.setItem(
            "aapdasetu_session_started",
            Date.now().toString()
        );

        localStorage.setItem(
            "aapdasetu_user_type",
            "ngo"
        );

        // ==================================================
        // 6. STORE NGO INFORMATION
        // ==================================================

        sessionStorage.setItem(
            "ngo_code",
            authenticatedNgoCode
        );

        sessionStorage.setItem(
            "ngo_name",
            authenticatedNgoName
        );

        // ==================================================
        // 7. REDIRECT
        // ==================================================

        console.log(
            "✅ NGO authenticated:",
            authenticatedNgoCode
        );

        window.location.href =
            "ngo/index.html";

    } catch (err) {

        console.error(
            "🚨 NGO login failed:",
            err
        );

        // IMPORTANT:
        // Don't call this a password failure when
        // authentication may already have succeeded.

        alert(
            "❌ NGO login could not be completed.\n\n" +
            err.message
        );

        passwordInput.value = "";

        loginBtn.disabled = false;
        loginBtn.innerHTML = original;
    }
}


// ==========================================================
// CLEAR LOCAL SESSION DATA
// ==========================================================

function clearLocalSessionData() {

    localStorage.removeItem(
        "aapdasetu_session_started"
    );

    localStorage.removeItem(
        "aapdasetu_user_type"
    );

    sessionStorage.removeItem(
        "admin_name"
    );

    sessionStorage.removeItem(
        "ngo_name"
    );

    sessionStorage.removeItem(
        "ngo_code"
    );
}


// ==========================================================
// LIVE COMMAND ANIMATION
// ==========================================================

const logMessages = [

    "CITIZEN_RPT: Anomalous wind speeds detected.",

    "SYS_CHK: Verifying IMD satellite downlink.",

    "ALERT: Water level rising.",

    "AI_CORE: Risk analysis completed.",

    "LOG: Rescue teams on standby."

];


function spawnLiveLog() {

    const container =
        document.getElementById(
            "liveFeedContainer"
        );


    if (!container) {
        return;
    }


    const node =
        document.createElement(
            "div"
        );


    node.className =
        "floating-log";


    node.innerText =
        `[${new Date().toLocaleTimeString(
            "en-US",
            { hour12: false }
        )}] ` +
        logMessages[
            Math.floor(
                Math.random() *
                logMessages.length
            )
        ];


    node.style.left =
        `${10 + Math.random() * 70}%`;


    container.appendChild(node);


    setTimeout(
        () => {

            if (node.parentNode) {
                node.remove();
            }

        },
        8000
    );
}


function startLiveFeed() {

    (function loop() {

        setTimeout(
            () => {

                spawnLiveLog();

                loop();

            },

            1500 +
            Math.random() * 2000
        );

    })();
}