// ==========================================================
// AAPDASETU PROTECTED SESSION GUARD
// ==========================================================

const AAPDASETU_SESSION_DURATION =
    4 * 60 * 60 * 1000;


// ==========================================================
// INITIALIZE PROTECTED PAGE
// ==========================================================

async function initializeProtectedSession(expectedRole) {

    try {

        const response =
            await fetch("/api/config");

        if (!response.ok) {
            throw new Error(
                "Unable to load secure configuration."
            );
        }

        const config =
            await response.json();


        const client =
            window.supabase.createClient(
                config.supabaseUrl,
                config.supabaseAnonKey
            );


        const {
            data: {
                session
            }
        } =
            await client.auth.getSession();


        // --------------------------------------------------
        // No Supabase session
        // --------------------------------------------------

        if (!session) {

            redirectToLogin();

            return null;
        }


        // --------------------------------------------------
        // Check our 4-hour session
        // --------------------------------------------------

        const started =
            Number(
                localStorage.getItem(
                    "aapdasetu_session_started"
                )
            );


        if (!started) {

            await logoutAndRedirect(client);

            return null;
        }


        const elapsed =
            Date.now() - started;


        if (
            elapsed >=
            AAPDASETU_SESSION_DURATION
        ) {

            console.log(
                "⏰ AapdaSetu session expired."
            );

            await logoutAndRedirect(client);

            return null;
        }


        // --------------------------------------------------
        // Check expected role
        // --------------------------------------------------

        const storedRole =
            localStorage.getItem(
                "aapdasetu_user_type"
            );


        if (
            expectedRole &&
            storedRole !== expectedRole
        ) {

            console.warn(
                "Unauthorized role access attempt."
            );

            await logoutAndRedirect(client);

            return null;
        }


        // --------------------------------------------------
        // Start expiration timer
        // --------------------------------------------------

        const remaining =
            AAPDASETU_SESSION_DURATION -
            elapsed;


        setTimeout(
            async () => {

                console.log(
                    "⏰ AapdaSetu session expired."
                );

                await logoutAndRedirect(client);

            },
            remaining
        );


        // --------------------------------------------------
        // Detect logout from another browser tab
        // --------------------------------------------------

        window.addEventListener(
            "storage",
            async (event) => {

                if (
                    event.key ===
                    "aapdasetu_session_started" &&
                    event.newValue === null
                ) {

                    await logoutAndRedirect(
                        client,
                        false
                    );
                }

            }
        );


        console.log(
            `🔐 Protected session active. ` +
            `Remaining: ${formatRemaining(remaining)}`
        );


        return {
            client,
            session
        };


    } catch (error) {

        console.error(
            "Protected session verification failed:",
            error
        );

        redirectToLogin();

        return null;
    }
}


// ==========================================================
// LOGOUT
// ==========================================================

async function logout() {

    console.log(
        "🔒 AapdaSetu logout initiated."
    );


    try {

        const response =
            await fetch("/api/config");

        if (response.ok) {

            const config =
                await response.json();


            const client =
                window.supabase.createClient(
                    config.supabaseUrl,
                    config.supabaseAnonKey
                );


            await client.auth.signOut();
        }

    } catch (error) {

        console.error(
            "Logout error:",
            error
        );

    } finally {

        clearAapdaSetuSession();

        window.location.href =
            "/index.html";
    }
}


// ==========================================================
// INTERNAL LOGOUT
// ==========================================================

async function logoutAndRedirect(
    client,
    clearSupabase = true
) {

    try {

        if (
            clearSupabase &&
            client
        ) {

            await client.auth.signOut();

        }

    } catch (error) {

        console.error(
            "Session cleanup error:",
            error
        );

    } finally {

        clearAapdaSetuSession();

        redirectToLogin();
    }
}


// ==========================================================
// CLEAR SESSION
// ==========================================================

function clearAapdaSetuSession() {

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
// REDIRECT
// ==========================================================

function redirectToLogin() {

    window.location.href =
        "/index.html";
}


// ==========================================================
// FORMAT TIMER
// ==========================================================

function formatRemaining(milliseconds) {

    const totalSeconds =
        Math.max(
            0,
            Math.floor(
                milliseconds / 1000
            )
        );


    const hours =
        Math.floor(
            totalSeconds / 3600
        );


    const minutes =
        Math.floor(
            (totalSeconds % 3600) / 60
        );


    const seconds =
        totalSeconds % 60;


    return `${hours}h ${minutes}m ${seconds}s`;
}