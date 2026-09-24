/* ==========================================================
   AAPDASETU NGO
   PUBLIC ALERTS
   CONNECTED TO EXISTING alerts TABLE
   ========================================================== */


let supabaseClient = null;

let allPublicAlerts = [];

let alertsChannel = null;


/* ==========================================================
   CONFIG
   ========================================================== */

const CONFIG_ENDPOINT = "/api/config";


/* ==========================================================
   INITIALIZATION
   ========================================================== */

document.addEventListener(
    "DOMContentLoaded",
    async () => {

        await initializeSupabase();

        if (!supabaseClient) {

            showError(
                "Unable to establish secure connection."
            );

            return;
        }


        loadNGOIdentity();

        await loadPublicAlerts();

        subscribeToAlerts();

    }
);


/* ==========================================================
   SUPABASE INITIALIZATION
   ========================================================== */

async function initializeSupabase() {

    try {

        const response =
            await fetch(CONFIG_ENDPOINT);


        if (!response.ok) {

            throw new Error(
                "Unable to load Supabase configuration."
            );

        }


        const config =
            await response.json();


        if (
            !config.supabaseUrl ||
            !config.supabaseAnonKey
        ) {

            throw new Error(
                "Invalid Supabase configuration."
            );

        }


        supabaseClient =
            window.supabase.createClient(
                config.supabaseUrl,
                config.supabaseAnonKey
            );


        console.log(
            "✅ Public Alerts Supabase initialized."
        );

    }
    catch (error) {

        console.error(
            "Supabase initialization failed:",
            error
        );

        supabaseClient = null;

    }

}


/* ==========================================================
   NGO IDENTITY
   ========================================================== */

function loadNGOIdentity() {

    const ngoName =
        sessionStorage.getItem(
            "ngo_name"
        );


    const ngoCode =
        sessionStorage.getItem(
            "ngo_code"
        );


    /*
     * Support both the Public Alerts page IDs
     * and the IDs used by the existing NGO layout.
     */

    const nameElements = [

        document.getElementById("ngoName"),

        document.getElementById("header-ngo-name"),

        document.getElementById("sidebar-ngo-name")

    ].filter(Boolean);


    const codeElements = [

        document.getElementById("ngoCode"),

        document.getElementById("header-ngo-code"),

        document.getElementById("sidebar-ngo-code")

    ].filter(Boolean);


    nameElements.forEach(
        element => {

            element.textContent =
                ngoName || "Authorized NGO";

        }
    );


    codeElements.forEach(
        element => {

            element.textContent =
                ngoCode || "-";

        }
    );

}


/* ==========================================================
   LOAD PUBLIC ALERTS
   ========================================================== */

async function loadPublicAlerts() {

    if (!supabaseClient) {

        return;

    }


    const refreshButton =
        document.getElementById(
            "refreshAlertsBtn"
        );


    const originalHTML =
        refreshButton
            ? refreshButton.innerHTML
            : "";


    if (refreshButton) {

        refreshButton.disabled = true;

        refreshButton.innerHTML = `
            <span
                class="spinner-border
                       spinner-border-sm
                       me-1"
            ></span>
            Loading...
        `;

    }


    showLoading();


    try {

        /*
         * IMPORTANT
         *
         * The existing AapdaSetu Admin system uses:
         *
         *     alerts
         *
         * and broadcasts using:
         *
         *     status = 'Active'
         *
         * Therefore we query the same table here.
         */

        const {
            data,
            error
        } = await supabaseClient

            .from("alerts")

            .select("*")

            .order(
                "created_at",
                {
                    ascending: false
                }
            );


        if (error) {

            throw error;

        }


        allPublicAlerts =
            Array.isArray(data)
                ? data
                : [];


        console.log(
            "✅ Alerts received:",
            allPublicAlerts.length
        );


        updateStatistics();

        renderAlerts();

    }
    catch (error) {

        console.error(
            "Public alerts loading failed:",
            error
        );


        /*
         * Show the actual Supabase error in console,
         * while keeping the UI user-friendly.
         */

        showError(
            "Unable to load public alerts."
        );

    }
    finally {

        if (refreshButton) {

            refreshButton.disabled = false;

            refreshButton.innerHTML =
                originalHTML;

        }

    }

}


/* ==========================================================
   REALTIME ALERT UPDATES
   ========================================================== */

function subscribeToAlerts() {

    if (!supabaseClient) {

        return;

    }


    /*
     * Prevent duplicate subscriptions.
     */

    if (alertsChannel) {

        supabaseClient
            .removeChannel(
                alertsChannel
            );

    }


    alertsChannel =
        supabaseClient

            .channel(
                "ngo-public-alerts"
            )

            .on(
                "postgres_changes",
                {
                    event: "*",
                    schema: "public",
                    table: "alerts"
                },
                payload => {

                    console.log(
                        "🔄 Public alert update:",
                        payload
                    );


                    loadPublicAlerts();

                }
            )

            .subscribe(
                status => {

                    console.log(
                        "Public alerts realtime:",
                        status
                    );

                }
            );

}


/* ==========================================================
   STATISTICS
   ========================================================== */

function updateStatistics() {

    const activeAlerts =
        allPublicAlerts.filter(
            alert =>
                isActiveAlert(
                    alert
                )
        );


    const criticalAlerts =
        activeAlerts.filter(
            alert =>
                normalizeSeverity(
                    alert.severity
                ) === "CRITICAL"
        );


    const highAlerts =
        activeAlerts.filter(
            alert =>
                normalizeSeverity(
                    alert.severity
                ) === "HIGH"
        );


    const resolvedAlerts =
        allPublicAlerts.filter(
            alert =>
                isResolvedAlert(
                    alert
                )
        );


    setText(
        "activeAlertCount",
        activeAlerts.length
    );


    setText(
        "criticalAlertCount",
        criticalAlerts.length
    );


    setText(
        "highAlertCount",
        highAlerts.length
    );


    setText(
        "resolvedAlertCount",
        resolvedAlerts.length
    );

}


/* ==========================================================
   RENDER ALERTS
   ========================================================== */

function renderAlerts() {

    const feed =
        document.getElementById(
            "publicAlertsFeed"
        );


    /*
     * If this page is using the old broadcast
     * container ID, support it as well.
     */

    const fallbackFeed =
        document.getElementById(
            "active-broadcasts-container"
        );


    const target =
        feed || fallbackFeed;


    if (!target) {

        console.warn(
            "Public Alerts container not found."
        );

        return;

    }


    const statusFilter =
        document.getElementById(
            "statusFilter"
        )?.value || "ALL";


    const severityFilter =
        document.getElementById(
            "severityFilter"
        )?.value || "ALL";


    let filteredAlerts =
        allPublicAlerts.filter(
            alert => {

                const status =
                    getDisplayStatus(
                        alert
                    );


                const severity =
                    normalizeSeverity(
                        alert.severity
                    );


                const statusMatches =
                    statusFilter === "ALL"
                    ||
                    status === statusFilter;


                const severityMatches =
                    severityFilter === "ALL"
                    ||
                    severity === severityFilter;


                return (
                    statusMatches
                    &&
                    severityMatches
                );

            }
        );


    /*
     * Priority:
     *
     * ACTIVE
     *   CRITICAL
     *   HIGH
     *   MODERATE
     *   INFO
     *
     * RESOLVED
     *   newest first
     */

    filteredAlerts.sort(
        compareAlerts
    );


    if (!filteredAlerts.length) {

        target.innerHTML = `

            <div class="empty-state">

                <i
                    class="bi bi-shield-check"
                ></i>

                <h5>
                    No public alerts found
                </h5>

                <p>
                    There are no alerts
                    matching the selected filters.
                </p>

            </div>

        `;

        return;

    }


    target.innerHTML =
        filteredAlerts
            .map(
                alert =>
                    createAlertCard(
                        alert
                    )
            )
            .join("");

}


/* ==========================================================
   SORTING
   ========================================================== */

function compareAlerts(
    a,
    b
) {

    const statusA =
        getDisplayStatus(a);


    const statusB =
        getDisplayStatus(b);


    /*
     * Active first
     */

    if (
        statusA !== statusB
    ) {

        if (
            statusA === "ACTIVE"
        ) {

            return -1;

        }


        if (
            statusB === "ACTIVE"
        ) {

            return 1;

        }

    }


    /*
     * Severity priority
     */

    const severityRank = {

        CRITICAL: 1,

        HIGH: 2,

        MODERATE: 3,

        INFO: 4

    };


    const rankA =
        severityRank[
            normalizeSeverity(
                a.severity
            )
        ] || 5;


    const rankB =
        severityRank[
            normalizeSeverity(
                b.severity
            )
        ] || 5;


    if (
        rankA !== rankB
    ) {

        return rankA - rankB;

    }


    /*
     * Newest first
     */

    return (
        new Date(
            b.created_at || 0
        )
        -
        new Date(
            a.created_at || 0
        )
    );

}


/* ==========================================================
   ALERT CARD
   ========================================================== */

function createAlertCard(
    alert
) {

    const severity =
        normalizeSeverity(
            alert.severity
        );


    const status =
        getDisplayStatus(
            alert
        );


    const severityClass =
        status === "RESOLVED"
            ? "resolved"
            : severity.toLowerCase();


    const severityText =
        status === "RESOLVED"
            ? "RESOLVED"
            : formatSeverity(
                severity
            );


    const title =
        escapeHTML(
            alert.title ||
            "Public Safety Alert"
        );


    /*
     * Existing alerts table uses "summary".
     */

    const message =
        escapeHTML(
            alert.summary ||
            alert.description ||
            "No additional information available."
        );


    /*
     * Existing alerts table stores coordinates
     * rather than a single location text field.
     */

    const location =
        formatLocation(
            alert
        );


    const source =
        escapeHTML(
            alert.source ||
            alert.origin ||
            "AapdaSetu Alert Network"
        );


    const time =
        formatDate(
            alert.created_at
        );


    return `

        <div
            class="
                public-alert-card
                ${severityClass}
            "
        >

            <div class="alert-card-header">

                <div>

                    <div class="alert-title">

                        ${title}

                    </div>

                    <div class="alert-type">

                        Official Public Safety Alert

                    </div>

                </div>


                <span
                    class="
                        severity-badge
                        ${severityClass}
                    "
                >

                    ${severityText}

                </span>

            </div>


            <div class="alert-message">

                ${message}

            </div>


            <div class="alert-meta">

                <span>

                    <i
                        class="bi bi-geo-alt-fill"
                    ></i>

                    ${location}

                </span>


                <span>

                    <i
                        class="bi bi-clock"
                    ></i>

                    ${time}

                </span>

            </div>


            <div class="alert-source">

                Source:

                <strong>
                    ${source}
                </strong>

            </div>

        </div>

    `;

}


/* ==========================================================
   STATUS
   ========================================================== */

function getDisplayStatus(
    alert
) {

    const value =
        String(
            alert?.status || ""
        )
        .trim()
        .toLowerCase();


    /*
     * Existing Admin flow:
     *
     * Pending
     * Active
     * Resolved
     */

    if (
        value === "resolved"
        ||
        value === "completed"
        ||
        value === "closed"
    ) {

        return "RESOLVED";

    }


    return "ACTIVE";

}


function isActiveAlert(
    alert
) {

    return (
        getDisplayStatus(
            alert
        ) === "ACTIVE"
    );

}


function isResolvedAlert(
    alert
) {

    return (
        getDisplayStatus(
            alert
        ) === "RESOLVED"
    );

}


/* ==========================================================
   SEVERITY
   ========================================================== */

function normalizeSeverity(
    severity
) {

    if (!severity) {

        return "INFO";

    }


    const value =
        String(severity)
            .trim()
            .toUpperCase();


    if (
        value === "CRITICAL"
        ||
        value === "CRIT"
    ) {

        return "CRITICAL";

    }


    if (
        value === "HIGH"
        ||
        value === "SEVERE"
    ) {

        return "HIGH";

    }


    if (
        value === "MODERATE"
        ||
        value === "MEDIUM"
        ||
        value === "WARNING"
    ) {

        return "MODERATE";

    }


    return "INFO";

}


function formatSeverity(
    severity
) {

    switch (
        severity
    ) {

        case "CRITICAL":

            return "CRITICAL";


        case "HIGH":

            return "HIGH PRIORITY";


        case "MODERATE":

            return "MODERATE";


        default:

            return "INFORMATION";

    }

}


/* ==========================================================
   LOCATION
   ========================================================== */

function formatLocation(
    alert
) {

    const lat =
        parseFloat(
            alert.latitude
        );


    const lng =
        parseFloat(
            alert.longitude
        );


    /*
     * If an alert already has a textual
     * location field, use it.
     */

    if (
        alert.location
    ) {

        return escapeHTML(
            alert.location
        );

    }


    /*
     * Otherwise display coordinates
     * from the existing alerts table.
     */

    if (
        Number.isFinite(lat)
        &&
        Number.isFinite(lng)
    ) {

        return (
            lat.toFixed(5)
            +
            ", "
            +
            lng.toFixed(5)
        );

    }


    return "Location not specified";

}


/* ==========================================================
   DATE
   ========================================================== */

function formatDate(
    value
) {

    if (!value) {

        return "Time unavailable";

    }


    const date =
        new Date(value);


    if (
        Number.isNaN(
            date.getTime()
        )
    ) {

        return "Time unavailable";

    }


    return date.toLocaleString(
        "en-IN",
        {
            dateStyle: "short",
            timeStyle: "short"
        }
    );

}


/* ==========================================================
   SAFE TEXT
   ========================================================== */

function escapeHTML(
    value
) {

    return String(value)
        .replace(
            /&/g,
            "&amp;"
        )
        .replace(
            /</g,
            "&lt;"
        )
        .replace(
            />/g,
            "&gt;"
        )
        .replace(
            /"/g,
            "&quot;"
        )
        .replace(
            /'/g,
            "&#039;"
        );

}


/* ==========================================================
   SET TEXT
   ========================================================== */

function setText(
    elementId,
    value
) {

    const element =
        document.getElementById(
            elementId
        );


    if (element) {

        element.textContent =
            value;

    }

}


/* ==========================================================
   LOADING
   ========================================================== */

function showLoading() {

    const feed =
        document.getElementById(
            "publicAlertsFeed"
        )
        ||
        document.getElementById(
            "active-broadcasts-container"
        );


    if (!feed) {

        return;

    }


    feed.innerHTML = `

        <div class="loading-state">

            <div
                class="
                    spinner-border
                    text-primary
                "
                role="status"
            ></div>

            <p>
                Loading public alerts...
            </p>

        </div>

    `;

}


/* ==========================================================
   ERROR
   ========================================================== */

function showError(
    message
) {

    const feed =
        document.getElementById(
            "publicAlertsFeed"
        )
        ||
        document.getElementById(
            "active-broadcasts-container"
        );


    if (!feed) {

        return;

    }


    feed.innerHTML = `

        <div class="empty-state">

            <i
                class="bi bi-exclamation-circle"
            ></i>

            <h5>
                Something went wrong
            </h5>

            <p>
                ${escapeHTML(message)}
            </p>

        </div>

    `;

}


/* ==========================================================
   CLEANUP
   ========================================================== */

window.addEventListener(
    "beforeunload",
    () => {

        if (
            supabaseClient &&
            alertsChannel
        ) {

            supabaseClient
                .removeChannel(
                    alertsChannel
                );

        }

    }
);