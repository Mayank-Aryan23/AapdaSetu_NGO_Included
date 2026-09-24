const CONFIG_ENDPOINT = "/api/config";

let supabaseClient = null;
let currentNGO = null;

let reportsCache = [];
let reportActionsCache = {};

let mapInstance = null;
let mapMarkers = [];

let mapReady = false;
let reportsReady = false;
let markerLibraryReady = false;

let activeOperationView = "sos";


/* =========================================================
   INITIALIZATION
   ========================================================= */

document.addEventListener("DOMContentLoaded", async () => {

    console.log("🚀 NGO Dashboard initializing...");

    await initializeSupabase();

    if (!supabaseClient) {
        return;
    }

    const authenticated =
        await verifyNGOSession();

    if (!authenticated) {
        return;
    }

    bindEvents();

    await loadNGODashboard();
});


async function loadNGODashboard() {

    await Promise.allSettled([
        fetchCitizenReports(),
        fetchPublicBroadcasts(),
        fetchActiveAlerts(),
        fetchMyActivity()
    ]);

    await updateDashboardView();
}


/* =========================================================
   SUPABASE
   ========================================================= */

async function initializeSupabase() {

    try {

        const response =
            await fetch(CONFIG_ENDPOINT);

        if (!response.ok) {
            throw new Error(
                "Config load failed."
            );
        }

        const config =
            await response.json();

        supabaseClient =
            window.supabase.createClient(
                config.supabaseUrl,
                config.supabaseAnonKey
            );

        console.log(
            "✅ NGO Supabase initialized"
        );

    } catch (error) {

        console.error(
            "❌ Supabase initialization failed:",
            error
        );

        alert(
            "Unable to establish a secure connection."
        );
    }
}


/* =========================================================
   NGO SESSION
   ========================================================= */

async function verifyNGOSession() {

    try {

        const {
            data,
            error
        } =
            await supabaseClient.auth.getSession();

        if (
            error ||
            !data.session
        ) {

            console.warn(
                "No active NGO session."
            );

            redirectToLogin();

            return false;
        }

        const authUser =
            data.session.user;

        const {
            data: ngoUser,
            error: ngoError
        } =
            await supabaseClient
                .from("ngo_users")
                .select(`
                    id,
                    auth_user_id,
                    ngo_id,
                    role,
                    status,
                    ngos (
                        id,
                        ngo_code,
                        name,
                        email,
                        phone,
                        address,
                        status
                    )
                `)
                .eq(
                    "auth_user_id",
                    authUser.id
                )
                .single();

        if (
            ngoError ||
            !ngoUser ||
            ngoUser.status !== "ACTIVE" ||
            !ngoUser.ngos ||
            ngoUser.ngos.status !== "ACTIVE"
        ) {

            console.error(
                "NGO authorization failed:",
                ngoError
            );

            await supabaseClient.auth.signOut();

            redirectToLogin();

            return false;
        }

        currentNGO = {

            userId:
                ngoUser.id,

            authUserId:
                ngoUser.auth_user_id,

            ngoId:
                ngoUser.ngo_id,

            role:
                ngoUser.role,

            code:
                ngoUser.ngos.ngo_code,

            name:
                ngoUser.ngos.name,

            email:
                ngoUser.ngos.email,

            phone:
                ngoUser.ngos.phone,

            address:
                ngoUser.ngos.address
        };

        console.log(
            "✅ NGO verified:",
            currentNGO
        );

        updateNGOIdentity();

        return true;

    } catch (error) {

        console.error(
            "NGO session verification error:",
            error
        );

        redirectToLogin();

        return false;
    }
}


function updateNGOIdentity() {

    if (!currentNGO) {
        return;
    }

    const elements = {

        headerName:
            document.getElementById(
                "header-ngo-name"
            ),

        headerCode:
            document.getElementById(
                "header-ngo-code"
            ),

        sidebarName:
            document.getElementById(
                "sidebar-ngo-name"
            ),

        sidebarCode:
            document.getElementById(
                "sidebar-ngo-code"
            )
    };

    if (elements.headerName) {

        elements.headerName.textContent =
            currentNGO.name;
    }

    if (elements.headerCode) {

        elements.headerCode.textContent =
            currentNGO.code;
    }

    if (elements.sidebarName) {

        elements.sidebarName.textContent =
            currentNGO.name;
    }

    if (elements.sidebarCode) {

        elements.sidebarCode.textContent =
            currentNGO.code;
    }
}


/* =========================================================
   CITIZEN REPORTS
   ========================================================= */

async function fetchCitizenReports() {

    const container =
        document.getElementById(
            "citizen-reports-feed"
        );

    if (!container) {
        return;
    }

    container.innerHTML = `
        <div class="loading-state">
            <div class="spinner-border text-primary"></div>
            <p>Loading citizen reports...</p>
        </div>
    `;

    try {

        const {
            data,
            error
        } =
            await supabaseClient
                .from("citizen_reports")
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

        /*
         * IMPORTANT:
         *
         * reportsCache contains ONLY operational report data.
         *
         * NO citizen profile information is attached here.
         *
         * This means:
         *
         * report.citizen_info
         *
         * will NEVER exist inside reportsCache.
         */
        reportsCache =
            Array.isArray(data)
                ? data.map(
                    report => {

                        const safeReport = {
                            ...report
                        };

                        /*
                         * Remove any old/private field if
                         * it happens to come from the database.
                         */
                        delete safeReport.citizen_info;

                        return safeReport;
                    }
                )
                : [];

        reportsReady = true;

        /*
         * Load action history separately.
         */
        await fetchReportActionHistory();

        await applyReportFilter();

        if (
            mapReady &&
            reportsReady
        ) {
            renderMapMarkers();
        }

    } catch (error) {

        console.error(
            "Citizen reports error:",
            error
        );

        container.innerHTML = `
            <div class="empty-state">
                <i class="bi bi-exclamation-circle"></i>
                <p>Unable to load citizen reports.</p>
            </div>
        `;
    }
}


/* =========================================================
   PRIVATE CITIZEN INFORMATION
   ========================================================= */

/*
 * =========================================================
 * IMPORTANT PRIVACY RULE
 * =========================================================
 *
 * Citizen information MUST NOT be loaded globally.
 *
 * It is fetched ONLY when:
 *
 * 1. NGO is authenticated.
 * 2. Report belongs to the current NGO.
 * 3. Report is not RELEASED.
 * 4. Report is not COMPLETED.
 *
 * The returned profile is kept ONLY as a local variable
 * while the report card is being rendered.
 *
 * It is NEVER written into reportsCache.
 * =========================================================
 */

async function getPrivateCitizenInfo(report) {

    if (!currentNGO) {
        return null;
    }

    if (!report) {
        return null;
    }

    const status =
        normalizeStatus(
            report.status
        );

    /*
     * RELEASED:
     * The previous NGO must lose access.
     *
     * COMPLETED:
     * Private information should no longer be displayed.
     */
    if (
        status === "released" ||
        status === "completed"
    ) {
        return null;
    }

    /*
     * STRICT NGO OWNERSHIP CHECK.
     */
    if (
        !isAssignedToCurrentNGO(
            report
        )
    ) {
        return null;
    }

    /*
     * Citizen ID associated with this report.
     */
    const citizenId =
        Number(
            report.reported_for
        );

    if (
        !Number.isFinite(
            citizenId
        )
    ) {
        return null;
    }

    try {

        /*
         * IMPORTANT:
         *
         * This query is made ONLY after the ownership
         * check above.
         *
         * Do NOT move this query outside this function.
         */
        const {
            data,
            error
        } =
            await supabaseClient
                .from("profiles")
                .select(`
                    id,
                    citizen_id,
                    name,
                    age,
                    email,
                    phone,
                    latitude,
                    longitude
                `)
                .eq(
                    "citizen_id",
                    citizenId
                )
                .maybeSingle();

        if (error) {

            console.error(
                "Private citizen profile error:",
                error
            );

            return null;
        }

        if (!data) {
            return null;
        }

        return {

            name:
                data.name ||
                "N/A",

            age:
                data.age ??
                "N/A",

            email:
                data.email ||
                "N/A",

            phone:
                data.phone ||
                "N/A",

            latitude:
                data.latitude ??
                null,

            longitude:
                data.longitude ??
                null
        };

    } catch (error) {

        console.error(
            "Private citizen information failed:",
            error
        );

        return null;
    }
}


/* =========================================================
   REPORT ACTION HISTORY
   ========================================================= */

async function fetchReportActionHistory() {

    reportActionsCache = {};

    if (!reportsCache.length) {
        return;
    }

    const reportIds =
        reportsCache
            .map(
                report =>
                    Number(
                        report.id
                    )
            )
            .filter(
                id =>
                    Number.isFinite(id)
            );

    if (!reportIds.length) {
        return;
    }

    try {

        const {
            data,
            error
        } =
            await supabaseClient
                .from("ngo_report_actions")
                .select(`
                    id,
                    report_id,
                    ngo_id,
                    action,
                    reason,
                    notes,
                    created_by,
                    created_at
                `)
                .in(
                    "report_id",
                    reportIds
                )
                .order(
                    "created_at",
                    {
                        ascending: false
                    }
                );

        if (error) {

            console.warn(
                "⚠️ Report action history unavailable:",
                error
            );

            return;
        }

        /*
         * Store actions grouped by report.
         */
        (data || []).forEach(
            action => {

                const reportId =
                    Number(
                        action.report_id
                    );

                if (
                    !reportActionsCache[
                        reportId
                    ]
                ) {

                    reportActionsCache[
                        reportId
                    ] = [];
                }

                reportActionsCache[
                    reportId
                ].push(
                    action
                );
            }
        );

    } catch (error) {

        console.warn(
            "⚠️ Action history loading failed:",
            error
        );

        reportActionsCache = {};
    }
}


/* =========================================================
   NGO INFORMATION FOR ACTION HISTORY
   ========================================================= */

async function fetchActionNGOMap() {

    const allActions =
        Object.values(
            reportActionsCache
        ).flat();

    const ngoIds =
        [
            ...new Set(
                allActions
                    .map(
                        action =>
                            Number(
                                action.ngo_id
                            )
                    )
                    .filter(
                        id =>
                            Number.isFinite(id)
                    )
            )
        ];

    if (!ngoIds.length) {
        return {};
    }

    try {

        const {
            data,
            error
        } =
            await supabaseClient
                .from("ngos")
                .select(`
                    id,
                    ngo_code,
                    name,
                    status
                `)
                .in(
                    "id",
                    ngoIds
                );

        if (error) {

            console.warn(
                "⚠️ NGO action information unavailable:",
                error
            );

            return {};
        }

        const ngoMap = {};

        (data || []).forEach(
            ngo => {

                ngoMap[
                    Number(
                        ngo.id
                    )
                ] = ngo;

            }
        );

        return ngoMap;

    } catch (error) {

        console.warn(
            "⚠️ NGO action map failed:",
            error
        );

        return {};
    }
}


/* =========================================================
   REPORT FILTER
   ========================================================= */

async function applyReportFilter() {

    const filter =
        document.getElementById(
            "stateFilter"
        )?.value || "ALL";

    /*
     * SOS and normal reports are separate.
     *
     * SOS must NEVER appear in Citizen Reports.
     */
    let filteredReports =
        reportsCache.filter(
            report => {

                return String(
                    report.category || ""
                )
                    .trim()
                    .toLowerCase() !==
                    "sos";
            }
        );

    /*
     * State filter.
     */
    if (filter === "Bihar") {

        filteredReports =
            filteredReports.filter(
                report => {

                    return String(
                        report.state || ""
                    )
                        .trim()
                        .toLowerCase() ===
                        "bihar";

                }
            );
    }

    await renderReports(
        filteredReports
    );

    updateReportCounts(
        filteredReports
    );
}


/* =========================================================
   REPORT PRIORITY
   ========================================================= */

function getReportPriority(report) {

    const status =
        normalizeStatus(
            report.status
        );

    const category =
        String(
            report.category || ""
        )
            .trim()
            .toLowerCase();

    /*
     * SOS always highest.
     */
    if (
        category === "sos" &&
        status !== "completed"
    ) {
        return 0;
    }

    /*
     * Released cases need another NGO.
     */
    if (
        status === "released"
    ) {
        return 1;
    }

    /*
     * Open cases.
     */
    if (
        status === "open"
    ) {
        return 2;
    }

    /*
     * In process.
     */
    if (
        status === "in process"
    ) {
        return 3;
    }

    /*
     * Completed last.
     */
    if (
        status === "completed"
    ) {
        return 100;
    }

    return 50;
}


/* =========================================================
   RENDER NORMAL REPORTS
   ========================================================= */

async function renderReports(
    reports
) {

    const container =
        document.getElementById(
            "citizen-reports-feed"
        );

    if (!container) {
        return;
    }

    /*
     * SOS must NEVER appear here.
     */
    reports =
        reports.filter(
            report => {

                return String(
                    report.category || ""
                )
                    .trim()
                    .toLowerCase() !==
                    "sos";

            }
        );

    if (!reports.length) {

        container.innerHTML = `
            <div class="empty-state">

                <i class="
                    bi
                    bi-inbox
                "></i>

                <p>
                    No reports found for this filter.
                </p>

            </div>
        `;

        return;
    }

    /*
     * Sort by operational priority.
     */
    reports.sort(
        (a, b) => {

            const priorityDifference =
                getReportPriority(a) -
                getReportPriority(b);

            if (
                priorityDifference !== 0
            ) {
                return priorityDifference;
            }

            return (
                new Date(
                    b.created_at || 0
                ) -
                new Date(
                    a.created_at || 0
                )
            );
        }
    );

    /*
     * createReportCard() is async because private
     * citizen information may need to be fetched.
     */
    const reportCards =
        await Promise.all(
            reports.map(
                report =>
                    createReportCard(
                        report
                    )
            )
        );

    container.innerHTML =
        reportCards.join("");

    updateReportStats(
        reports
    );
}


/* =========================================================
   REPORT COUNTS
   ========================================================= */

function updateReportCounts(
    reports
) {

    const sosCount =
        reportsCache.filter(
            report => {

                const isSOS =
                    String(
                        report.category || ""
                    )
                        .trim()
                        .toLowerCase() ===
                    "sos";

                return (
                    isSOS &&
                    normalizeStatus(
                        report.status
                    ) !== "completed"
                );

            }
        ).length;

    const openCount =
        reports.filter(
            report =>
                normalizeStatus(
                    report.status
                ) === "open"
        ).length;

    const releasedCount =
        reports.filter(
            report =>
                normalizeStatus(
                    report.status
                ) === "released"
        ).length;

    const sosBadge =
        document.getElementById(
            "sos-count-badge"
        );

    const reportBadge =
        document.getElementById(
            "reports-count-badge"
        );

    const sosStat =
        document.getElementById(
            "stat-sos"
        );

    const openStat =
        document.getElementById(
            "stat-open"
        );

    if (sosBadge) {

        sosBadge.textContent =
            sosCount;
    }

    if (reportBadge) {

        reportBadge.textContent =
            openCount;
    }

    if (sosStat) {

        sosStat.textContent =
            sosCount;
    }

    if (openStat) {

        openStat.textContent =
            openCount;
    }

    const releasedStat =
        document.getElementById(
            "stat-released"
        );

    if (releasedStat) {

        releasedStat.textContent =
            releasedCount;
    }
}


/* =========================================================
   REPORT CARD
   ========================================================= */

async function createReportCard(
    report
) {

    const status =
        normalizeStatus(
            report.status
        );

    const category =
        String(
            report.category ||
            "Unknown"
        ).trim();

    const isSOS =
        category
            .toLowerCase() ===
        "sos";

    const isCompleted =
        status ===
        "completed";

    const isInProcess =
        status ===
        "in process";

    const isReleased =
        status ===
        "released";

    /*
     * STRICT OWNERSHIP CHECK.
     */
    const isAssigned =
        isAssignedToCurrentNGO(
            report
        );


    /* =====================================================
       PRIVATE CITIZEN DATA
       ===================================================== */

    let citizen = null;

    /*
     * ONLY the destined/current NGO gets this query.
     *
     * Unassigned NGO:
     *     NO QUERY
     *
     * Different NGO:
     *     NO QUERY
     *
     * Released:
     *     NO QUERY
     *
     * Completed:
     *     NO QUERY
     */
    if (
        isAssigned &&
        !isReleased &&
        !isCompleted
    ) {

        citizen =
            await getPrivateCitizenInfo(
                report
            );
    }


    /* =====================================================
       RELEASE INFORMATION
       ===================================================== */

    const latestRelease =
        isReleased
            ? getLatestRelease(
                report
            )
            : null;


    /* =====================================================
       CARD CLASS
       ===================================================== */

    let cardClass =
        "report-card";

    if (isSOS) {

        cardClass =
            "sos-card";
    }

    if (isInProcess) {

        cardClass +=
            " in-process";
    }

    if (isReleased) {

        cardClass +=
            " released";
    }

    if (isCompleted) {

        cardClass +=
            " completed";
    }


    /* =====================================================
       STATUS
       ===================================================== */

    let statusClass =
        "open";

    let statusText =
        "OPEN";

    if (
        isSOS &&
        !isCompleted
    ) {

        statusClass =
            "sos";

        statusText =
            "SOS PRIORITY";

    } else if (
        isInProcess
    ) {

        statusClass =
            "in-process";

        statusText =
            "IN PROCESS";

    } else if (
        isReleased
    ) {

        statusClass =
            "released";

        statusText =
            "RELEASED • PRIORITY";

    } else if (
        isCompleted
    ) {

        statusClass =
            "completed";

        statusText =
            "COMPLETED";
    }


    /* =====================================================
       LOCATION
       ===================================================== */

    const latitude =
        parseFloat(
            report.latitude
        );

    const longitude =
        parseFloat(
            report.longitude
        );

    const hasLocation =
        Number.isFinite(
            latitude
        ) &&
        Number.isFinite(
            longitude
        );


    /* =====================================================
       MEDIA
       ===================================================== */

    const mediaHtml =
        buildReportMedia(
            report
        );


    /* =====================================================
       RELEASE INFORMATION
       ===================================================== */

    let releaseHtml = "";

    if (
        isReleased &&
        latestRelease
    ) {

        releaseHtml = `

            <div class="
                released-information
            ">

                <div class="
                    released-title
                ">

                    <i class="
                        bi
                        bi-exclamation-triangle-fill
                    "></i>

                    RELEASED CASE —
                    NEEDS NGO RESPONSE

                </div>


                <div class="
                    released-row
                ">

                    <strong>
                        Previously handled by:
                    </strong>

                    ${escapeHTML(
                        latestRelease.ngoName ||
                        "Previous NGO"
                    )}

                    ${
                        latestRelease.ngoCode
                            ?
                            `
                                <span class="
                                    ngo-code
                                ">

                                    (${escapeHTML(
                                        latestRelease.ngoCode
                                    )})

                                </span>
                            `
                            :
                            ""
                    }

                </div>


                <div class="
                    released-row
                ">

                    <strong>
                        Release reason:
                    </strong>

                    ${escapeHTML(
                        latestRelease.reason ||
                        "No reason provided."
                    )}

                </div>


                <div class="
                    released-row
                    released-time
                ">

                    <i class="
                        bi
                        bi-clock
                    "></i>

                    Released:
                    ${formatDate(
                        latestRelease.created_at
                    )}

                </div>

            </div>

        `;
    }


    /* =====================================================
       ACTION BUTTONS
       ===================================================== */

    let actionsHtml = "";


    /*
     * LOCATE
     */

    if (hasLocation) {

        actionsHtml += `

            <button
                type="button"
                class="
                    btn
                    btn-sm
                    btn-outline-primary
                "
                onclick="focusMap(
                    ${latitude},
                    ${longitude}
                )"
            >

                <i class="
                    bi
                    bi-crosshair
                "></i>

                LOCATE

            </button>

        `;
    }


    /*
     * TAKE RESPONSE
     *
     * Open AND Released cases can be taken.
     */
    const canTake =
        (
            status === "open" ||
            status === "released"
        ) &&
        !isAssigned &&
        !isCompleted;

    if (canTake) {

        actionsHtml += `

            <button
                type="button"
                class="
                    btn
                    btn-sm
                    btn-primary
                    take-btn
                "
                onclick="handleTakeReport(
                    ${report.id}
                )"
            >

                <i class="
                    bi
                    bi-hand-index-thumb
                "></i>

                TAKE RESPONSE

            </button>

        `;
    }


    /*
     * COMPLETE
     */

    if (
        isAssigned &&
        !isCompleted
    ) {

        actionsHtml += `

            <button
                type="button"
                class="
                    btn
                    btn-sm
                    btn-success
                    complete-btn
                "
                onclick="handleCompleteReport(
                    ${report.id}
                )"
            >

                <i class="
                    bi
                    bi-check-circle
                "></i>

                COMPLETE

            </button>

        `;
    }


    /*
     * RELEASE
     */

    if (
        isAssigned &&
        !isCompleted
    ) {

        actionsHtml += `

            <button
                type="button"
                class="
                    btn
                    btn-sm
                    btn-outline-danger
                "
                onclick="handleReleaseReport(
                    ${report.id}
                )"
            >

                <i class="
                    bi
                    bi-arrow-return-left
                "></i>

                RELEASE

            </button>

        `;
    }


    /* =====================================================
       PRIVATE CITIZEN INFORMATION
       ===================================================== */

    let citizenHtml = "";

    /*
     * FINAL SAFETY CHECK.
     *
     * Even if citizen somehow exists, it is rendered only
     * when:
     *
     *     current NGO owns report
     *     AND report is not released
     *     AND report is not completed
     */
    if (
        isAssigned &&
        !isReleased &&
        !isCompleted &&
        citizen
    ) {

        citizenHtml = `

            <div class="
                citizen-private-info
                visible
            ">

                <div class="
                    citizen-private-title
                ">

                    <i class="
                        bi
                        bi-shield-lock-fill
                    "></i>

                    PRIVATE CITIZEN INFORMATION

                </div>


                <div class="
                    citizen-private-grid
                ">


                    <div>

                        <small>
                            NAME
                        </small>

                        <span>

                            ${escapeHtml(
                                citizen.name ||
                                "N/A"
                            )}

                        </span>

                    </div>


                    <div>

                        <small>
                            EMAIL
                        </small>

                        <span>

                            ${escapeHtml(
                                citizen.email ||
                                "N/A"
                            )}

                        </span>

                    </div>


                    <div>

                        <small>
                            PHONE
                        </small>

                        <span>

                            ${escapeHtml(
                                citizen.phone ||
                                "N/A"
                            )}

                        </span>

                    </div>


                    <div>

                        <small>
                            AGE
                        </small>

                        <span>

                            ${escapeHtml(
                                citizen.age ??
                                "N/A"
                            )}

                        </span>

                    </div>


                    <div>

                        <small>
                            LOCATION
                        </small>

                        <span>

                            ${
                                citizen.latitude !== null &&
                                citizen.longitude !== null

                                    ?

                                    `${Number(
                                        citizen.latitude
                                    ).toFixed(5)},
                                    ${Number(
                                        citizen.longitude
                                    ).toFixed(5)}`

                                    :

                                    "N/A"
                            }

                        </span>

                    </div>

                </div>

            </div>

        `;
    }


    /* =====================================================
       FINAL CARD
       ===================================================== */

    return `

        <div
            class="${cardClass}"
            data-report-id="${report.id}"
        >

            <div class="
                report-card-header
            ">

                <div class="
                    report-card-title
                ">

                    ${
                        isSOS
                            ?
                            `
                                <i
                                    class="
                                        bi
                                        bi-exclamation-octagon-fill
                                        text-danger
                                        me-1
                                    "
                                ></i>
                            `
                            :
                            `
                                <i
                                    class="
                                        bi
                                        bi-person-exclamation
                                        text-primary
                                        me-1
                                    "
                                ></i>
                            `
                    }

                    ${escapeHtml(
                        category
                    )}

                </div>


                <span
                    class="
                        report-status
                        ${statusClass}
                    "
                >

                    ${statusText}

                </span>

            </div>


            <div class="
                small
                text-muted
            ">

                <i class="
                    bi
                    bi-clock
                "></i>

                ${formatDate(
                    report.created_at
                )}

            </div>


            <div class="
                report-description
            ">

                ${escapeHtml(
                    report.details ||
                    "No description provided."
                )}

            </div>


            ${releaseHtml}


            ${mediaHtml}


            ${
                hasLocation
                    ?
                    `
                        <div class="
                            report-meta
                        ">

                            <span>

                                <i class="
                                    bi
                                    bi-geo-alt-fill
                                "></i>

                                ${latitude.toFixed(5)},
                                ${longitude.toFixed(5)}

                            </span>

                        </div>
                    `
                    :
                    ""
            }


            ${citizenHtml}


            ${
                actionsHtml
                    ?
                    `
                        <div class="
                            report-actions
                        ">

                            ${actionsHtml}

                        </div>
                    `
                    :
                    ""
            }

        </div>

    `;
}


/* =========================================================
   STATUS HELPERS
   ========================================================= */

function normalizeStatus(
    status
) {

    const value =
        String(
            status || "Open"
        )
            .trim()
            .toLowerCase();

    if (
        value === "in_process" ||
        value === "inprocess" ||
        value === "taken" ||
        value === "processing"
    ) {

        return "in process";
    }

    return value;
}


function getStatusClass(
    status
) {

    switch (
        normalizeStatus(
            status
        )
    ) {

        case "open":
            return "status-open";

        case "in process":
            return "status-process";

        case "released":
            return "status-released";

        case "completed":
            return "status-completed";

        default:
            return "status-open";
    }
}


/* =========================================================
   NGO OWNERSHIP CHECK
   ========================================================= */

function isAssignedToCurrentNGO(
    report
) {

    if (!currentNGO) {
        return false;
    }

    if (!report) {
        return false;
    }

    const assignedNGO =
        String(
            report.assigned_to || ""
        )
            .trim()
            .toLowerCase();

    const currentNGOCode =
        String(
            currentNGO.code || ""
        )
            .trim()
            .toLowerCase();

    if (
        !assignedNGO ||
        !currentNGOCode
    ) {
        return false;
    }

    return (
        assignedNGO ===
        currentNGOCode
    );
}


/* =========================================================
   RELEASE HISTORY HELPERS
   ========================================================= */

function getReportActions(
    reportId
) {

    return (
        reportActionsCache[
            Number(reportId)
        ] || []
    )
        .slice()
        .sort(
            (a, b) =>
                new Date(
                    b.created_at
                ) -
                new Date(
                    a.created_at
                )
        );
}


function getLatestRelease(
    report
) {

    const releases =
        getReportActions(
            report.id
        ).filter(
            action =>
                String(
                    action.action || ""
                )
                    .trim()
                    .toUpperCase() ===
                "RELEASE"
        );

    if (!releases.length) {
        return null;
    }

    const release =
        releases[0];

    return {

        ...release,

        ngoName:
            release.ngoName ||
            (
                release.ngo_id
                    ?
                    `NGO #${release.ngo_id}`
                    :
                    "Previous NGO"
            ),

        ngoCode:
            release.ngoCode ||
            ""
    };
}


function getMyLatestAction(
    reportId
) {

    if (!currentNGO) {
        return null;
    }

    const actions =
        getReportActions(
            reportId
        ).filter(
            action =>
                Number(
                    action.ngo_id
                ) ===
                Number(
                    currentNGO.ngoId
                )
        );

    return actions.length
        ? actions[0]
        : null;
}


/* =========================================================
   PUBLIC BROADCASTS
   ========================================================= */

async function fetchPublicBroadcasts() {

    const container =
        document.getElementById(
            "active-broadcasts-container"
        );

    if (!container) {
        return;
    }

    try {

        const {
            data,
            error
        } =
            await supabaseClient
                .from("alerts")
                .select("*")
                .eq(
                    "status",
                    "Broadcasted"
                )
                .order(
                    "created_at",
                    {
                        ascending: false
                    }
                );

        if (error) {
            throw error;
        }

        renderBroadcasts(
            data || []
        );

    } catch (error) {

        console.error(
            "Broadcast error:",
            error
        );

        container.innerHTML = `

            <div class="
                empty-state
            ">

                <i class="
                    bi
                    bi-broadcast
                "></i>

                <p>
                    Unable to load public broadcasts.
                </p>

            </div>

        `;
    }
}


function renderBroadcasts(
    alerts
) {

    const container =
        document.getElementById(
            "active-broadcasts-container"
        );

    if (!container) {
        return;
    }

    if (!alerts.length) {

        container.innerHTML = `

            <div class="
                empty-state
            ">

                <i class="
                    bi
                    bi-broadcast-pin
                "></i>

                <p>
                    No active public broadcasts.
                </p>

            </div>

        `;

        return;
    }

    container.innerHTML =
        alerts
            .map(
                alert => `

                    <div class="
                        broadcast-item
                    ">

                        <div class="
                            d-flex
                            justify-content-between
                        ">

                            <strong>

                                ${escapeHTML(
                                    alert.title ||
                                    "Emergency Alert"
                                )}

                            </strong>


                            <span class="
                                badge
                                bg-danger
                            ">

                                ${escapeHTML(
                                    alert.severity ||
                                    "ALERT"
                                )}

                            </span>

                        </div>


                        <div class="
                            small
                            text-muted
                            mt-2
                        ">

                            ${escapeHTML(
                                alert.summary ||
                                "No additional information."
                            )}

                        </div>

                    </div>

                `
            )
            .join("");
}


/* =========================================================
   ACTIVE ALERTS
   ========================================================= */

async function fetchActiveAlerts() {

    try {

        const {
            data,
            error
        } =
            await supabaseClient
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

        const alerts =
            data || [];

        const active =
            alerts.filter(
                alert =>
                    String(
                        alert.status || ""
                    )
                        .toLowerCase() !==
                    "resolved"
            );

        const countElement =
            document.getElementById(
                "active-alert-count"
            );

        if (countElement) {

            countElement.textContent =
                `${active.length} Active Alerts`;
        }

    } catch (error) {

        console.error(
            "Alert loading error:",
            error
        );
    }
}


/* =========================================================
   SOS
   ========================================================= */

async function renderSOSReports() {

    const container =
        document.getElementById(
            "sos-feed"
        );

    if (!container) {
        return;
    }

    const sosReports =
        reportsCache.filter(
            report => {

                return String(
                    report.category || ""
                )
                    .trim()
                    .toLowerCase() ===
                    "sos";
            }
        );

    const activeSOS =
        sosReports.filter(
            report =>
                normalizeStatus(
                    report.status
                ) !==
                "completed"
        );

    const badge =
        document.getElementById(
            "sos-count-badge"
        );

    const stat =
        document.getElementById(
            "stat-sos"
        );

    if (badge) {

        badge.textContent =
            activeSOS.length;
    }

    if (stat) {

        stat.textContent =
            activeSOS.length;
    }

    if (!sosReports.length) {

        container.innerHTML = `

            <div class="
                empty-state
            ">

                <i class="
                    bi
                    bi-shield-check
                "></i>

                <p>
                    No SOS emergencies reported.
                </p>

            </div>

        `;

        return;
    }

    sosReports.sort(
        (a, b) => {

            const aCompleted =
                normalizeStatus(
                    a.status
                ) ===
                "completed";

            const bCompleted =
                normalizeStatus(
                    b.status
                ) ===
                "completed";

            if (
                aCompleted &&
                !bCompleted
            ) {
                return 1;
            }

            if (
                !aCompleted &&
                bCompleted
            ) {
                return -1;
            }

            return (
                new Date(
                    b.created_at || 0
                ) -
                new Date(
                    a.created_at || 0
                )
            );
        }
    );

    /*
     * createReportCard() is async.
     */
    const sosCards =
        await Promise.all(
            sosReports.map(
                report =>
                    createReportCard(
                        report
                    )
            )
        );

    container.innerHTML =
        sosCards.join("");
}


/* =========================================================
   OPERATION VIEW
   ========================================================= */

async function switchOperationView(
    view
) {

    const sosTab =
        document.getElementById(
            "sosTab"
        );

    const reportsTab =
        document.getElementById(
            "reportsTab"
        );

    const sosView =
        document.getElementById(
            "sos-view"
        );

    const reportsView =
        document.getElementById(
            "reports-view"
        );

    activeOperationView =
        view;

    if (
        view === "sos"
    ) {

        sosTab?.classList.add(
            "active"
        );

        reportsTab?.classList.remove(
            "active"
        );

        sosView?.classList.add(
            "active"
        );

        reportsView?.classList.remove(
            "active"
        );

        await renderSOSReports();

    } else {

        sosTab?.classList.remove(
            "active"
        );

        reportsTab?.classList.add(
            "active"
        );

        sosView?.classList.remove(
            "active"
        );

        reportsView?.classList.add(
            "active"
        );

        await applyReportFilter();
    }
}


async function updateDashboardView() {

    if (
        activeOperationView ===
        "sos"
    ) {

        await renderSOSReports();

    } else {

        await applyReportFilter();
    }

    /*
     * Map is independent from report panel.
     */
    if (
        mapReady &&
        reportsReady
    ) {

        renderMapMarkers();
    }
}


/* =========================================================
   MY ACTIVITY
   ========================================================= */

async function fetchMyActivity() {

    if (!currentNGO) {
        return;
    }

    const container =
        document.getElementById(
            "my-work-container"
        );

    try {

        const {
            data,
            error
        } =
            await supabaseClient
                .from(
                    "ngo_report_actions"
                )
                .select("*")
                .eq(
                    "ngo_id",
                    currentNGO.ngoId
                )
                .order(
                    "created_at",
                    {
                        ascending: false
                    }
                );

        if (error) {
            throw error;
        }

        renderMyActivity(
            data || []
        );

    } catch (error) {

        console.error(
            "Activity error:",
            error
        );

        if (container) {

            container.innerHTML = `
                <div class="empty-state">

                    <i class="
                        bi
                        bi-exclamation-circle
                    "></i>

                    <p>
                        Unable to load response activity.
                    </p>

                </div>
            `;
        }
    }
}


function renderMyActivity(
    actions
) {

    const container =
        document.getElementById(
            "my-work-container"
        );

    const processCount =
        actions.filter(
            action =>
                String(
                    action.action || ""
                ).toUpperCase() ===
                "TAKE"
        ).length;

    const completedCount =
        actions.filter(
            action =>
                String(
                    action.action || ""
                ).toUpperCase() ===
                "COMPLETE"
        ).length;

    const releasedCount =
        actions.filter(
            action =>
                String(
                    action.action || ""
                ).toUpperCase() ===
                "RELEASE"
        ).length;

    const processElement =
        document.getElementById(
            "stat-process"
        );

    const completeElement =
        document.getElementById(
            "stat-complete"
        );

    const releasedElement =
        document.getElementById(
            "stat-released"
        );

    if (processElement) {

        processElement.textContent =
            processCount;
    }

    if (completeElement) {

        completeElement.textContent =
            completedCount;
    }

    if (releasedElement) {

        releasedElement.textContent =
            releasedCount;
    }

    if (!container) {
        return;
    }

    if (!actions.length) {

        container.innerHTML = `

            <div class="
                empty-state
            ">

                <i class="
                    bi
                    bi-clipboard
                "></i>

                <p>
                    No response activity yet.
                </p>

            </div>

        `;

        return;
    }

    container.innerHTML =
        actions
            .slice(
                0,
                10
            )
            .map(
                action => {

                    const actionName =
                        String(
                            action.action || ""
                        ).toUpperCase();

                    let badgeClass =
                        "bg-secondary";

                    if (
                        actionName ===
                        "TAKE"
                    ) {

                        badgeClass =
                            "bg-primary";
                    }

                    if (
                        actionName ===
                        "COMPLETE"
                    ) {

                        badgeClass =
                            "bg-success";
                    }

                    if (
                        actionName ===
                        "RELEASE"
                    ) {

                        badgeClass =
                            "bg-danger";
                    }

                    return `

                        <div class="
                            my-work-item
                        ">

                            <div class="
                                d-flex
                                justify-content-between
                                align-items-center
                            ">

                                <strong>

                                    Report #${escapeHTML(
                                        action.report_id
                                    )}

                                </strong>

                                <span class="
                                    badge
                                    ${badgeClass}
                                ">

                                    ${escapeHTML(
                                        actionName
                                    )}

                                </span>

                            </div>


                            ${
                                action.reason
                                    ?
                                    `
                                        <div class="
                                            small
                                            text-muted
                                            mt-1
                                        ">

                                            ${escapeHTML(
                                                action.reason
                                            )}

                                        </div>
                                    `
                                    :
                                    ""
                            }


                            ${
                                action.notes
                                    ?
                                    `
                                        <div class="
                                            small
                                            text-muted
                                            mt-1
                                        ">

                                            ${escapeHTML(
                                                action.notes
                                            )}

                                        </div>
                                    `
                                    :
                                    ""
                            }


                            <div class="
                                small
                                text-muted
                                mt-1
                            ">

                                ${formatDate(
                                    action.created_at
                                )}

                            </div>

                        </div>

                    `;
                }
            )
            .join("");
}


/* =========================================================
   REPORT STATISTICS
   ========================================================= */

function updateReportStats(
    reports
) {

    const openCount =
        reports.filter(
            report =>
                normalizeStatus(
                    report.status
                ) ===
                "open"
        ).length;

    const element =
        document.getElementById(
            "stat-open"
        );

    if (element) {

        element.textContent =
            openCount;
    }
}


/* =========================================================
   EVENTS
   ========================================================= */

function bindEvents() {

    const filter =
        document.getElementById(
            "stateFilter"
        );

    if (filter) {

        filter.addEventListener(
            "change",
            async () => {

                await applyReportFilter();

            }
        );
    }


    const refresh =
        document.getElementById(
            "refreshReportsBtn"
        );

    if (refresh) {

        refresh.addEventListener(
            "click",
            async () => {

                await fetchCitizenReports();

                await fetchMyActivity();

                await updateDashboardView();
            }
        );
    }


    const myRefresh =
        document.getElementById(
            "refreshMyWorkBtn"
        );

    if (myRefresh) {

        myRefresh.addEventListener(
            "click",
            fetchMyActivity
        );
    }


    const logout =
        document.getElementById(
            "ngoLogoutBtn"
        );

    if (logout) {

        logout.addEventListener(
            "click",
            handleNGOLogout
        );
    }


    const sosTab =
        document.getElementById(
            "sosTab"
        );

    const reportsTab =
        document.getElementById(
            "reportsTab"
        );

    if (sosTab) {

        sosTab.addEventListener(
            "click",
            async () =>
                await switchOperationView(
                    "sos"
                )
        );
    }

    if (reportsTab) {

        reportsTab.addEventListener(
            "click",
            async () =>
                await switchOperationView(
                    "reports"
                )
        );
    }
}


/* =========================================================
   LOGOUT
   ========================================================= */

async function handleNGOLogout() {

    try {

        await supabaseClient.auth.signOut();

    } catch (error) {

        console.error(
            "Logout error:",
            error
        );

    } finally {

        sessionStorage.clear();

        /*
         * Also clear all in-memory operational data.
         */
        reportsCache = [];
        reportActionsCache = {};

        currentNGO = null;

        redirectToLogin();
    }
}


function redirectToLogin() {

    window.location.href =
        "../index.html";
}


/* =========================================================
   GOOGLE MAP
   ========================================================= */

async function initMap() {

    const mapElement =
        document.getElementById(
            "googleMap"
        );

    if (!mapElement) {

        console.warn(
            "⚠️ Google Map container not found."
        );

        return;
    }

    if (mapInstance) {

        console.log(
            "ℹ️ NGO map already initialized."
        );

        return;
    }

    try {

        console.log(
            "🗺️ Initializing NGO incident map..."
        );

        /*
         * Wait until Google Maps exists.
         */
        if (
            !window.google ||
            !google.maps
        ) {

            console.warn(
                "⏳ Google Maps API not ready yet."
            );

            setTimeout(
                initMap,
                200
            );

            return;
        }

        /*
         * Load marker library safely.
         */
        const markerLibrary =
            await google.maps.importLibrary(
                "marker"
            );

        if (
            !markerLibrary ||
            !markerLibrary.AdvancedMarkerElement
        ) {

            throw new Error(
                "Google Maps marker library failed to load."
            );
        }

        markerLibraryReady = true;

        /*
         * Create map.
         */
        mapInstance =
            new google.maps.Map(
                mapElement,
                {

                    center: {
                        lat: 20.9517,
                        lng: 85.0985
                    },

                    zoom: 6,

                    mapId:
                        "DEMO_MAP_ID",

                    mapTypeControl:
                        false,

                    streetViewControl:
                        false,

                    fullscreenControl:
                        true
                }
            );

        mapReady = true;

        console.log(
            "✅ NGO incident map initialized."
        );

        if (reportsReady) {
            renderMapMarkers();
        }

    } catch (error) {

        mapReady = false;

        console.error(
            "❌ NGO map initialization failed:",
            error
        );
    }
}


/* =========================================================
   MAP MARKERS
   ========================================================= */

async function renderMapMarkers() {

    if (
        !mapReady ||
        !mapInstance
    ) {
        return;
    }

    if (!reportsReady) {
        return;
    }

    if (!markerLibraryReady) {
        return;
    }

    if (
        !window.google ||
        !google.maps
    ) {
        return;
    }

    try {

        const {
            AdvancedMarkerElement
        } =
            await google.maps.importLibrary(
                "marker"
            );

        if (!AdvancedMarkerElement) {

            console.warn(
                "⚠️ AdvancedMarkerElement unavailable."
            );

            return;
        }

        /*
         * Remove old markers.
         */
        mapMarkers.forEach(
            marker => {

                try {

                    marker.map = null;

                } catch (error) {

                    console.warn(
                        "Unable to remove old marker:",
                        error
                    );
                }
            }
        );

        mapMarkers = [];

        if (
            !Array.isArray(
                reportsCache
            )
        ) {
            return;
        }

        /*
         * IMPORTANT:
         *
         * Map markers contain ONLY operational
         * information.
         *
         * NEVER put:
         *
         * name
         * email
         * phone
         * age
         *
         * into the marker.
         */
        reportsCache.forEach(
            report => {

                try {

                    const lat =
                        Number(
                            report.latitude
                        );

                    const lng =
                        Number(
                            report.longitude
                        );

                    if (
                        !Number.isFinite(
                            lat
                        ) ||
                        !Number.isFinite(
                            lng
                        )
                    ) {
                        return;
                    }

                    const marker =
                        new AdvancedMarkerElement({

                            map:
                                mapInstance,

                            position: {
                                lat,
                                lng
                            },

                            title:
                                report.category ||
                                "Citizen Report"

                        });

                    const infoWindow =
                        new google.maps.InfoWindow({

                            content: `

                                <div
                                    style="
                                        padding:8px;
                                        min-width:180px;
                                    "
                                >

                                    <strong>

                                        ${escapeHTML(
                                            report.category ||
                                            "Citizen Report"
                                        )}

                                    </strong>

                                    <br>

                                    <span
                                        style="
                                            font-size:12px;
                                            color:#666;
                                        "
                                    >

                                        Report #${
                                            report.id
                                        }

                                    </span>

                                    <br>

                                    <span
                                        style="
                                            font-size:12px;
                                            color:#666;
                                        "
                                    >

                                        ${
                                            lat.toFixed(5)
                                        },
                                        ${
                                            lng.toFixed(5)
                                        }

                                    </span>

                                </div>

                            `
                        });

                    marker.addListener(
                        "gmp-click",
                        () => {

                            try {

                                infoWindow.open({
                                    map:
                                        mapInstance,

                                    anchor:
                                        marker
                                });

                            } catch (error) {

                                console.warn(
                                    "InfoWindow error:",
                                    error
                                );
                            }
                        }
                    );

                    mapMarkers.push(
                        marker
                    );

                } catch (markerError) {

                    console.error(
                        "❌ Marker creation failed for report:",
                        report?.id,
                        markerError
                    );
                }
            }
        );

        console.log(
            `📍 ${mapMarkers.length} report marker(s) rendered.`
        );

    } catch (error) {

        console.error(
            "❌ Map marker rendering failed:",
            error
        );
    }
}


/* =========================================================
   TAKE RESPONSE MODAL
   ========================================================= */

function ensureTakeResponseModal() {

    if (
        document.getElementById(
            "takeResponseModal"
        )
    ) {
        return;
    }

    const modalHTML = `

        <div
            class="modal fade"
            id="takeResponseModal"
            tabindex="-1"
            aria-hidden="true"
        >

            <div class="
                modal-dialog
                modal-dialog-centered
            ">

                <div class="
                    modal-content
                ">

                    <div class="
                        modal-header
                    ">

                        <div>

                            <h5 class="
                                modal-title
                                fw-bold
                            ">

                                <i class="
                                    bi
                                    bi-hand-index-thumb
                                    text-primary
                                    me-2
                                "></i>

                                Take Response

                            </h5>

                            <small
                                class="text-muted"
                                id="takeResponseReportLabel"
                            >
                                Report
                            </small>

                        </div>

                        <button
                            type="button"
                            class="btn-close"
                            data-bs-dismiss="modal"
                            aria-label="Close"
                        ></button>

                    </div>


                    <div class="modal-body">

                        <div class="
                            alert
                            alert-light
                            border
                            small
                            mb-3
                        ">

                            <i class="
                                bi
                                bi-info-circle
                                text-primary
                                me-1
                            "></i>

                            Enter the NGO contact responsible
                            for handling this response.

                        </div>


                        <div class="mb-3">

                            <label
                                for="responseContactPerson"
                                class="
                                    form-label
                                    fw-semibold
                                "
                            >

                                Contact Person

                                <span class="
                                    text-danger
                                ">*</span>

                            </label>

                            <input
                                type="text"
                                class="form-control"
                                id="responseContactPerson"
                                maxlength="100"
                                placeholder="Name of response coordinator"
                                autocomplete="off"
                            >

                        </div>


                        <div class="mb-3">

                            <label
                                for="responseContactNumber"
                                class="
                                    form-label
                                    fw-semibold
                                "
                            >

                                Contact Number

                                <span class="
                                    text-danger
                                ">*</span>

                            </label>

                            <input
                                type="tel"
                                class="form-control"
                                id="responseContactNumber"
                                maxlength="15"
                                placeholder="Primary contact number"
                                autocomplete="off"
                            >

                        </div>


                        <div class="mb-3">

                            <label
                                for="responseTeam"
                                class="
                                    form-label
                                    fw-semibold
                                "
                            >

                                Response Team

                            </label>

                            <input
                                type="text"
                                class="form-control"
                                id="responseTeam"
                                maxlength="100"
                                placeholder="Team / unit name (optional)"
                                autocomplete="off"
                            >

                        </div>


                        <div class="mb-2">

                            <label
                                for="responseOperationalNotes"
                                class="
                                    form-label
                                    fw-semibold
                                "
                            >

                                Operational Notes

                            </label>

                            <textarea
                                class="form-control"
                                id="responseOperationalNotes"
                                rows="3"
                                maxlength="500"
                                placeholder="Any important operational information..."
                            ></textarea>

                        </div>


                        <input
                            type="hidden"
                            id="takeResponseReportId"
                        >

                    </div>


                    <div class="
                        modal-footer
                    ">

                        <button
                            type="button"
                            class="
                                btn
                                btn-outline-secondary
                            "
                            data-bs-dismiss="modal"
                        >
                            Cancel
                        </button>

                        <button
                            type="button"
                            class="
                                btn
                                btn-primary
                            "
                            id="confirmTakeResponseBtn"
                        >

                            <i class="
                                bi
                                bi-hand-index-thumb
                                me-1
                            "></i>

                            TAKE RESPONSE

                        </button>

                    </div>

                </div>

            </div>

        </div>

    `;

    document.body.insertAdjacentHTML(
        "beforeend",
        modalHTML
    );
}


/* =========================================================
   TAKE RESPONSE
   ========================================================= */

async function handleTakeReport(
    reportId
) {

    if (!supabaseClient) {

        alert(
            "Secure connection is not available."
        );

        return;
    }

    if (!currentNGO) {

        alert(
            "NGO session is not available."
        );

        return;
    }

    const report =
        reportsCache.find(
            item =>
                Number(
                    item.id
                ) ===
                Number(
                    reportId
                )
        );

    if (!report) {

        alert(
            "Report could not be found."
        );

        return;
    }

    const status =
        normalizeStatus(
            report.status
        );

    /*
     * TAKE is allowed for OPEN and RELEASED.
     */
    if (
        status !== "open" &&
        status !== "released"
    ) {

        alert(
            "This report is no longer available."
        );

        await safeRefreshReports();

        return;
    }

    /*
     * If already assigned, another NGO owns it.
     */
    if (report.assigned_to) {

        alert(
            "This report has already been assigned."
        );

        await safeRefreshReports();

        return;
    }

    ensureTakeResponseModal();

    const modalElement =
        document.getElementById(
            "takeResponseModal"
        );

    const reportLabel =
        document.getElementById(
            "takeResponseReportLabel"
        );

    const reportIdInput =
        document.getElementById(
            "takeResponseReportId"
        );

    const contactPerson =
        document.getElementById(
            "responseContactPerson"
        );

    const contactNumber =
        document.getElementById(
            "responseContactNumber"
        );

    const responseTeam =
        document.getElementById(
            "responseTeam"
        );

    const operationalNotes =
        document.getElementById(
            "responseOperationalNotes"
        );

    const confirmButton =
        document.getElementById(
            "confirmTakeResponseBtn"
        );

    reportIdInput.value =
        reportId;

    reportLabel.textContent =
        `Report #${reportId}`;

    contactPerson.value =
        currentNGO.name || "";

    contactNumber.value =
        currentNGO.phone || "";

    responseTeam.value =
        "";

    operationalNotes.value =
        "";

    const modal =
        bootstrap.Modal.getOrCreateInstance(
            modalElement
        );

    modal.show();

    confirmButton.onclick =
        async function () {

            const person =
                contactPerson.value.trim();

            const phone =
                contactNumber.value.trim();

            const team =
                responseTeam.value.trim();

            const notes =
                operationalNotes.value.trim();

            if (!person) {

                alert(
                    "Please enter the response contact person's name."
                );

                contactPerson.focus();

                return;
            }

            if (!phone) {

                alert(
                    "Please enter the primary contact number."
                );

                contactNumber.focus();

                return;
            }

            const phonePattern =
                /^\+?[0-9\s-]{10,15}$/;

            if (
                !phonePattern.test(
                    phone
                )
            ) {

                alert(
                    "Please enter a valid contact number."
                );

                contactNumber.focus();

                return;
            }

            confirmButton.disabled =
                true;

            confirmButton.innerHTML = `

                <span
                    class="
                        spinner-border
                        spinner-border-sm
                        me-2
                    "
                ></span>

                PROCESSING...

            `;

            try {

                const {
                    data,
                    error
                } =
                    await supabaseClient.rpc(
                        "ngo_take_response",
                        {

                            p_report_id:
                                Number(
                                    reportId
                                ),

                            p_contact_person:
                                person,

                            p_contact_number:
                                phone,

                            p_alternate_number:
                                null,

                            p_response_team:
                                team ||
                                null,

                            p_operational_notes:
                                notes ||
                                null
                        }
                    );

                if (error) {
                    throw error;
                }

                if (
                    !data ||
                    data.success !== true
                ) {

                    throw new Error(
                        "The server did not confirm the response."
                    );
                }

                console.log(
                    "✅ TAKE RESPONSE successful:",
                    data
                );

                modal.hide();

                alert(
                    `✅ Response accepted.\n\n` +
                    `Report #${reportId} is now assigned to ` +
                    `${currentNGO.code}.`
                );

                await safeRefreshReports();

                try {

                    await fetchMyActivity();

                } catch (activityError) {

                    console.error(
                        "Activity refresh failed after TAKE:",
                        activityError
                    );
                }

                try {

                    await updateDashboardView();

                } catch (viewError) {

                    console.error(
                        "Dashboard refresh failed after TAKE:",
                        viewError
                    );
                }

            } catch (error) {

                console.error(
                    "❌ TAKE RESPONSE failed:",
                    error
                );

                alert(
                    "❌ Unable to take this report.\n\n" +
                    (
                        error?.message ||
                        "The report may have already been taken."
                    )
                );

            } finally {

                confirmButton.disabled =
                    false;

                confirmButton.innerHTML = `

                    <i class="
                        bi
                        bi-hand-index-thumb
                        me-1
                    "></i>

                    TAKE RESPONSE

                `;
            }
        };
}


/* =========================================================
   COMPLETE RESPONSE
   ========================================================= */

async function handleCompleteReport(
    reportId
) {

    if (!supabaseClient) {

        alert(
            "Secure connection is not available."
        );

        return;
    }

    if (!currentNGO) {

        alert(
            "NGO session is not available."
        );

        return;
    }

    const report =
        reportsCache.find(
            item =>
                Number(
                    item.id
                ) ===
                Number(
                    reportId
                )
        );

    if (!report) {

        alert(
            "Report could not be found."
        );

        return;
    }

    if (
        !isAssignedToCurrentNGO(
            report
        )
    ) {

        alert(
            "You can only complete a report assigned to your NGO."
        );

        return;
    }

    if (
        normalizeStatus(
            report.status
        ) === "completed"
    ) {

        alert(
            "This report is already completed."
        );

        return;
    }

    const confirmed =
        window.confirm(
            `Mark Report #${reportId} as COMPLETED?\n\n` +
            `This will close the active response for ${currentNGO.code}.`
        );

    if (!confirmed) {
        return;
    }

    try {

        const {
            data,
            error
        } =
            await supabaseClient.rpc(
                "ngo_complete_response",
                {
                    p_report_id:
                        Number(
                            reportId
                        )
                }
            );

        if (error) {
            throw error;
        }

        if (
            data &&
            typeof data === "object" &&
            data.success === false
        ) {

            throw new Error(
                data.message ||
                "The server rejected completion."
            );
        }

        console.log(
            "✅ COMPLETE successful:",
            data
        );

        alert(
            `✅ Report #${reportId} has been marked as COMPLETED.`
        );

        await safeRefreshReports();

        try {

            await fetchMyActivity();

        } catch (activityError) {

            console.error(
                "Activity refresh failed after COMPLETE:",
                activityError
            );
        }

        await updateDashboardView();

    } catch (error) {

        console.error(
            "❌ COMPLETE RESPONSE failed:",
            error
        );

        alert(
            "❌ Unable to complete this report.\n\n" +
            (
                error?.message ||
                "The completion operation failed."
            )
        );
    }
}


/* =========================================================
   RELEASE MODAL
   ========================================================= */

function ensureReleaseResponseModal() {

    if (
        document.getElementById(
            "releaseResponseModal"
        )
    ) {
        return;
    }

    const modalHTML = `

        <div
            class="modal fade"
            id="releaseResponseModal"
            tabindex="-1"
            aria-hidden="true"
        >

            <div class="
                modal-dialog
                modal-dialog-centered
            ">

                <div class="
                    modal-content
                ">

                    <div class="
                        modal-header
                    ">

                        <div>

                            <h5 class="
                                modal-title
                                fw-bold
                            ">

                                <i class="
                                    bi
                                    bi-arrow-return-left
                                    text-danger
                                    me-2
                                "></i>

                                Release Response

                            </h5>

                            <small
                                class="text-muted"
                                id="releaseResponseReportLabel"
                            >
                                Report
                            </small>

                        </div>

                        <button
                            type="button"
                            class="btn-close"
                            data-bs-dismiss="modal"
                            aria-label="Close"
                        ></button>

                    </div>


                    <div class="modal-body">

                        <div class="
                            alert
                            alert-warning
                            border
                            small
                            mb-3
                        ">

                            <i class="
                                bi
                                bi-info-circle
                                me-1
                            "></i>

                            Releasing this response will make
                            the case available to another NGO.

                        </div>


                        <label
                            for="releaseReason"
                            class="
                                form-label
                                fw-semibold
                            "
                        >

                            Release Reason

                            <span class="
                                text-danger
                            ">*</span>

                        </label>

                        <textarea
                            id="releaseReason"
                            class="form-control"
                            rows="4"
                            maxlength="500"
                            placeholder="Explain why your NGO is unable to continue handling this case..."
                        ></textarea>

                        <div class="
                            form-text
                        ">

                            This reason will be visible to
                            other NGOs so they understand
                            why the case was released.

                        </div>

                        <input
                            type="hidden"
                            id="releaseResponseReportId"
                        >

                    </div>


                    <div class="
                        modal-footer
                    ">

                        <button
                            type="button"
                            class="
                                btn
                                btn-outline-secondary
                            "
                            data-bs-dismiss="modal"
                        >
                            Cancel
                        </button>

                        <button
                            type="button"
                            class="
                                btn
                                btn-danger
                            "
                            id="confirmReleaseResponseBtn"
                        >

                            <i class="
                                bi
                                bi-arrow-return-left
                                me-1
                            "></i>

                            RELEASE RESPONSE

                        </button>

                    </div>

                </div>

            </div>

        </div>

    `;

    document.body.insertAdjacentHTML(
        "beforeend",
        modalHTML
    );
}


/* =========================================================
   RELEASE RESPONSE
   ========================================================= */

async function handleReleaseReport(
    reportId
) {

    if (!supabaseClient) {

        alert(
            "Secure connection is not available."
        );

        return;
    }

    if (!currentNGO) {

        alert(
            "NGO session is not available."
        );

        return;
    }

    const report =
        reportsCache.find(
            item =>
                Number(
                    item.id
                ) ===
                Number(
                    reportId
                )
        );

    if (!report) {

        alert(
            "Report could not be found."
        );

        return;
    }

    if (
        !isAssignedToCurrentNGO(
            report
        )
    ) {

        alert(
            "You can only release a report assigned to your NGO."
        );

        return;
    }

    if (
        normalizeStatus(
            report.status
        ) ===
        "completed"
    ) {

        alert(
            "A completed report cannot be released."
        );

        return;
    }

    ensureReleaseResponseModal();

    const modalElement =
        document.getElementById(
            "releaseResponseModal"
        );

    const reportLabel =
        document.getElementById(
            "releaseResponseReportLabel"
        );

    const reportIdInput =
        document.getElementById(
            "releaseResponseReportId"
        );

    const reasonInput =
        document.getElementById(
            "releaseReason"
        );

    const confirmButton =
        document.getElementById(
            "confirmReleaseResponseBtn"
        );

    reportLabel.textContent =
        `Report #${reportId}`;

    reportIdInput.value =
        reportId;

    reasonInput.value =
        "";

    const modal =
        bootstrap.Modal.getOrCreateInstance(
            modalElement
        );

    modal.show();

    confirmButton.onclick =
        async function () {

            const reason =
                reasonInput.value.trim();

            if (!reason) {

                alert(
                    "Please provide a reason for releasing this response."
                );

                reasonInput.focus();

                return;
            }

            if (
                reason.length < 5
            ) {

                alert(
                    "Please provide a more descriptive release reason."
                );

                reasonInput.focus();

                return;
            }

            confirmButton.disabled =
                true;

            confirmButton.innerHTML = `

                <span
                    class="
                        spinner-border
                        spinner-border-sm
                        me-2
                    "
                ></span>

                RELEASING...

            `;

            try {

                const {
                    data,
                    error
                } =
                    await supabaseClient.rpc(
                        "ngo_release_response",
                        {

                            p_report_id:
                                Number(
                                    reportId
                                ),

                            p_reason:
                                reason
                        }
                    );

                if (error) {
                    throw error;
                }

                if (
                    data &&
                    typeof data === "object" &&
                    data.success === false
                ) {

                    throw new Error(
                        data.message ||
                        "The server rejected the release."
                    );
                }

                console.log(
                    "✅ RELEASE RESPONSE successful:",
                    data
                );

                modal.hide();

                alert(
                    `✅ Report #${reportId} has been released.\n\n` +
                    `The case is now available to another NGO.`
                );

                await safeRefreshReports();

                try {

                    await fetchMyActivity();

                } catch (activityError) {

                    console.error(
                        "Activity refresh failed after RELEASE:",
                        activityError
                    );
                }

                await updateDashboardView();

            } catch (error) {

                console.error(
                    "❌ RELEASE RESPONSE failed:",
                    error
                );

                alert(
                    "❌ Unable to release this report.\n\n" +
                    (
                        error?.message ||
                        "The release operation failed."
                    )
                );

            } finally {

                confirmButton.disabled =
                    false;

                confirmButton.innerHTML = `

                    <i class="
                        bi
                        bi-arrow-return-left
                        me-1
                    "></i>

                    RELEASE RESPONSE

                `;
            }
        };
}


/* =========================================================
   SAFE REFRESH
   ========================================================= */

async function safeRefreshReports() {

    try {

        await fetchCitizenReports();

    } catch (error) {

        console.error(
            "Report refresh failed:",
            error
        );
    }

    try {

        await updateDashboardView();

    } catch (error) {

        console.error(
            "Dashboard refresh failed:",
            error
        );
    }
}


/* =========================================================
   LOCATION
   ========================================================= */

function getLocationText(
    report
) {

    if (report.state) {

        return escapeHTML(
            report.state
        );
    }

    if (
        report.latitude &&
        report.longitude
    ) {

        return `

            ${Number(
                report.latitude
            ).toFixed(4)},

            ${Number(
                report.longitude
            ).toFixed(4)}

        `;
    }

    return "Location unavailable";
}


function focusMap(
    lat,
    lng
) {

    if (!mapInstance) {

        console.warn(
            "Map is not initialized."
        );

        return;
    }

    lat =
        parseFloat(
            lat
        );

    lng =
        parseFloat(
            lng
        );

    if (
        Number.isNaN(lat) ||
        Number.isNaN(lng)
    ) {

        console.warn(
            "Invalid report coordinates:",
            lat,
            lng
        );

        return;
    }

    mapInstance.setZoom(
        7
    );

    setTimeout(
        () => {

            if (!mapInstance) {
                return;
            }

            mapInstance.panTo({
                lat,
                lng
            });

            setTimeout(
                () => {

                    if (!mapInstance) {
                        return;
                    }

                    mapInstance.setZoom(
                        13
                    );

                },
                800
            );

        },
        300
    );
}


/* =========================================================
   MEDIA
   ========================================================= */

function buildReportMedia(
    report
) {

    let html = "";

    if (report.audio_url) {

        html += `

            <div
                class="
                    report-media
                    p-2
                    bg-light
                    border
                    rounded
                "
            >

                <div
                    class="
                        small
                        fw-bold
                        text-danger
                        mb-1
                    "
                >

                    <i class="
                        bi
                        bi-mic-fill
                    "></i>

                    DISTRESS AUDIO

                </div>


                <audio
                    controls
                    class="w-100"
                    preload="none"
                >

                    <source
                        src="${escapeHtml(
                            report.audio_url
                        )}"
                        type="audio/webm"
                    >

                    Your browser does not support audio.

                </audio>

            </div>

        `;
    }


    if (report.image_url) {

        html += `

            <div class="
                report-media
            ">

                <a
                    href="${escapeHtml(
                        report.image_url
                    )}"
                    target="_blank"
                    rel="noopener noreferrer"
                    class="
                        btn
                        btn-sm
                        btn-outline-secondary
                        w-100
                    "
                >

                    <i class="
                        bi
                        bi-camera-fill
                        me-1
                    "></i>

                    VIEW EVIDENCE

                </a>

            </div>

        `;
    }

    return html;
}


/* =========================================================
   DATE
   ========================================================= */

function formatDate(
    value
) {

    if (!value) {
        return "Unknown time";
    }

    const date =
        new Date(
            value
        );

    if (
        Number.isNaN(
            date.getTime()
        )
    ) {

        return "Unknown time";
    }

    return date.toLocaleString(
        "en-IN",
        {
            dateStyle:
                "medium",

            timeStyle:
                "short"
        }
    );
}


/* =========================================================
   HTML ESCAPING
   ========================================================= */

function escapeHtml(
    value
) {

    if (
        value === null ||
        value === undefined
    ) {

        return "";
    }

    return String(
        value
    )
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


function escapeHTML(
    value
) {

    return escapeHtml(
        value
    );
}


/* =========================================================
   GLOBAL FUNCTIONS
   ========================================================= */

window.initMap =
    initMap;

window.handleTakeReport =
    handleTakeReport;

window.handleCompleteReport =
    handleCompleteReport;

window.handleReleaseReport =
    handleReleaseReport;

window.focusMap =
    focusMap;

window.switchOperationView =
    switchOperationView;

window.fetchCitizenReports =
    fetchCitizenReports;

window.fetchMyActivity =
    fetchMyActivity;