/* =========================================================
   AAPDASETU NGO
   ANALYTICS
   =========================================================

   PURPOSE:
   ---------------------------------------------------------
   Display performance analytics for the currently
   authenticated and authorized NGO.

   DATA MODEL:
   ---------------------------------------------------------

       AUTH USER
           ↓
       ngo_users
           ↓
       ngos
           ↓
       ngo_report_actions
           ↓
       citizen_reports

   IMPORTANT:
   ---------------------------------------------------------
   Analytics are NGO-specific.

   We DO NOT calculate NGO history from:

       citizen_reports.assigned_to

   alone.

   Why?

   Because RELEASE clears current assignment.

   Therefore historical NGO activity is reconstructed from:

       ngo_report_actions

   This ensures released cases remain part of the
   original NGO's historical analytics.

   PRIVATE INFORMATION:
   ---------------------------------------------------------
   No citizen profiles are queried.

   This page contains operational analytics only.

   SECURITY:
   ---------------------------------------------------------
   Frontend authorization is NOT the database security
   boundary.

   Supabase Auth + RLS/RPC must enforce NGO isolation.

   NO RLS IS CREATED OR MODIFIED BY THIS FILE.
   ========================================================= */


/* =========================================================
   GLOBAL VARIABLES
   ========================================================= */

let supabaseClient = null;

let currentUser = null;

let currentNGOUser = null;

let currentNGO = null;


/*
 * Raw NGO actions.
 */
let ngoActions = [];


/*
 * Historical reports associated with this NGO.
 */
let ngoReports = [];


/*
 * Current analytics period.
 *
 * Default:
 * 30 days.
 */
let currentPeriod = 30;


/*
 * Chart instances.
 */
let statusChart = null;

let trendChart = null;


/*
 * Last calculated analytics object.
 */
let analyticsData = null;


/*
 * Configuration endpoint.
 */
const CONFIG_ENDPOINT =
    "/api/config";


/* =========================================================
   INITIALIZATION
   ========================================================= */

document.addEventListener(
    "DOMContentLoaded",
    initializeAnalytics
);


async function initializeAnalytics() {

    console.log(
        "🚀 Initializing AapdaSetu Analytics..."
    );


    try {

        /*
         * STEP 1
         * Initialize Supabase.
         */
        await initializeSupabase();


        /*
         * STEP 2
         * Verify authenticated session.
         */
        const authenticated =
            await verifySession();


        if (!authenticated) {
            return;
        }


        /*
         * STEP 3
         * Load NGO identity.
         */
        const ngoLoaded =
            await loadCurrentNGO();


        if (!ngoLoaded) {
            return;
        }


        /*
         * STEP 4
         * Bind controls.
         */
        bindAnalyticsEvents();


        /*
         * STEP 5
         * Load analytics data.
         */
        await loadAnalyticsData();


        console.log(
            "✅ Analytics initialized successfully."
        );


    } catch (error) {

        console.error(
            "❌ Analytics initialization failed:",
            error
        );


        showAnalyticsError(
            error?.message ||
            "Unable to load analytics."
        );
    }
}


/* =========================================================
   SUPABASE INITIALIZATION
   ========================================================= */

async function initializeSupabase() {

    /*
     * Reuse existing client when available.
     */
    if (
        window.supabaseClient &&
        typeof window.supabaseClient.from ===
            "function"
    ) {

        supabaseClient =
            window.supabaseClient;


        console.log(
            "✅ Existing Supabase client reused."
        );


        return;
    }


    /*
     * Verify Supabase library.
     */
    if (
        !window.supabase ||
        typeof window.supabase.createClient !==
            "function"
    ) {

        throw new Error(
            "Supabase library is not loaded."
        );
    }


    /*
     * Fetch public configuration.
     */
    const response =
        await fetch(
            CONFIG_ENDPOINT
        );


    if (!response.ok) {

        throw new Error(
            "Unable to load Supabase configuration."
        );
    }


    const config =
        await response.json();


    const supabaseUrl =
        config.supabaseUrl ||
        config.url;


    const supabaseAnonKey =
        config.supabaseAnonKey ||
        config.anonKey ||
        config.key;


    if (
        !supabaseUrl ||
        !supabaseAnonKey
    ) {

        throw new Error(
            "Supabase configuration is incomplete."
        );
    }


    supabaseClient =
        window.supabase.createClient(
            supabaseUrl,
            supabaseAnonKey
        );


    console.log(
        "✅ Supabase initialized."
    );
}


/* =========================================================
   SESSION
   ========================================================= */

async function verifySession() {

    const {
        data,
        error
    } =
        await supabaseClient.auth.getSession();


    if (error) {
        throw error;
    }


    currentUser =
        data?.session?.user ||
        null;


    if (!currentUser) {

        redirectToLogin();

        return false;
    }


    console.log(
        "✅ Authenticated user:",
        currentUser.id
    );


    return true;
}


/* =========================================================
   LOAD NGO
   ========================================================= */

async function loadCurrentNGO() {

    if (!currentUser) {

        throw new Error(
            "Authenticated user is unavailable."
        );
    }


    /*
     * Find provisioned NGO user.
     */
    const {
        data: ngoUser,
        error: ngoUserError
    } =
        await supabaseClient
            .from("ngo_users")
            .select(`
                id,
                auth_user_id,
                ngo_id,
                role,
                status
            `)
            .eq(
                "auth_user_id",
                currentUser.id
            )
            .maybeSingle();


    if (ngoUserError) {
        throw ngoUserError;
    }


    if (!ngoUser) {

        await safeSignOut();

        redirectToLogin();

        return false;
    }


    /*
     * NGO user must be active.
     */
    if (
        String(
            ngoUser.status ||
            ""
        )
            .trim()
            .toUpperCase() !==
        "ACTIVE"
    ) {

        await safeSignOut();

        redirectToLogin();

        return false;
    }


    currentNGOUser =
        ngoUser;


    /*
     * Load organization.
     */
    const {
        data: ngo,
        error: ngoError
    } =
        await supabaseClient
            .from("ngos")
            .select(`
                id,
                ngo_code,
                name,
                email,
                phone,
                address,
                description,
                status
            `)
            .eq(
                "id",
                ngoUser.ngo_id
            )
            .maybeSingle();


    if (ngoError) {
        throw ngoError;
    }


    if (!ngo) {

        throw new Error(
            "The NGO organisation record could not be found."
        );
    }


    /*
     * Organization must be active.
     */
    if (
        String(
            ngo.status ||
            ""
        )
            .trim()
            .toUpperCase() !==
        "ACTIVE"
    ) {

        await safeSignOut();

        redirectToLogin();

        return false;
    }


    currentNGO =
        ngo;


    updateNGOIdentity();


    console.log(
        "✅ NGO loaded:",
        ngo.name,
        ngo.ngo_code
    );


    return true;
}


/* =========================================================
   NGO IDENTITY
   ========================================================= */

function updateNGOIdentity() {

    if (!currentNGO) {
        return;
    }


    setText(
        "header-ngo-name",
        currentNGO.name ||
        "Authorized NGO"
    );


    setText(
        "header-ngo-code",
        currentNGO.ngo_code ||
        "NGO"
    );


    setText(
        "sidebar-ngo-name",
        currentNGO.name ||
        "Authorized NGO"
    );


    setText(
        "sidebar-ngo-code",
        currentNGO.ngo_code ||
        "NGO"
    );
}


/* =========================================================
   LOAD ANALYTICS DATA
   ========================================================= */

async function loadAnalyticsData() {

    showAnalyticsLoading();


    try {

        /*
         * -----------------------------------------------------
         * STEP 1
         * Load NGO historical actions.
         * -----------------------------------------------------
         */

        const {
            data: actions,
            error: actionError
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
                .eq(
                    "ngo_id",
                    Number(
                        currentNGO.id
                    )
                )
                .order(
                    "created_at",
                    {
                        ascending: false
                    }
                );


        if (actionError) {
            throw actionError;
        }


        ngoActions =
            Array.isArray(actions)
                ? actions
                : [];


        console.log(
            `📜 Loaded ${ngoActions.length} NGO action(s).`
        );


        /*
         * -----------------------------------------------------
         * STEP 2
         * Extract historical report IDs.
         * -----------------------------------------------------
         */

        const reportIds =
            [
                ...new Set(
                    ngoActions
                        .map(
                            action =>
                                Number(
                                    action.report_id
                                )
                        )
                        .filter(
                            id =>
                                Number.isFinite(
                                    id
                                )
                        )
                )
            ];


        /*
         * No history.
         */
        if (!reportIds.length) {

            ngoReports = [];

            calculateAndRenderAnalytics();

            return;
        }


        /*
         * -----------------------------------------------------
         * STEP 3
         * Load reports.
         * -----------------------------------------------------
         */

        const {
            data: reports,
            error: reportError
        } =
            await supabaseClient
                .from("citizen_reports")
                .select(`
                    id,
                    report_type,
                    category,
                    details,
                    status,
                    assigned_to,
                    deployment_time,
                    created_at,
                    state,
                    latitude,
                    longitude
                `)
                .in(
                    "id",
                    reportIds
                );


        if (reportError) {
            throw reportError;
        }


        ngoReports =
            Array.isArray(reports)
                ? reports
                : [];


        console.log(
            `📋 Loaded ${ngoReports.length} NGO report(s).`
        );


        /*
         * -----------------------------------------------------
         * STEP 4
         * Calculate analytics.
         * -----------------------------------------------------
         */

        calculateAndRenderAnalytics();


    } catch (error) {

        console.error(
            "❌ Analytics data loading failed:",
            error
        );


        showAnalyticsError(
            error?.message ||
            "Unable to load NGO analytics."
        );
    }
}


/* =========================================================
   CALCULATE + RENDER
   ========================================================= */

function calculateAndRenderAnalytics() {

    const filtered =
        getFilteredData();


    analyticsData =
        calculateAnalytics(
            filtered.actions,
            filtered.reports
        );


    renderStatistics(
        analyticsData
    );


    renderStatusChart(
        analyticsData
    );


    renderCategoryBreakdown(
        analyticsData
    );


    renderPerformance(
        analyticsData
    );


    renderSummary(
        analyticsData
    );


    renderTrendChart(
        filtered.actions,
        filtered.reports
    );


    renderRecentActivity(
        filtered.actions,
        filtered.reports
    );


    updatePeriodUI();


    updateLastUpdated();


    hideAnalyticsLoading();
}


/* =========================================================
   FILTER DATA
   ========================================================= */

function getFilteredData() {

    /*
     * ALL TIME
     */
    if (
        currentPeriod ===
        "all"
    ) {

        return {

            actions:
                [...ngoActions],

            reports:
                [...ngoReports]
        };
    }


    const days =
        Number(
            currentPeriod
        );


    if (
        !Number.isFinite(
            days
        )
    ) {

        return {

            actions:
                [...ngoActions],

            reports:
                [...ngoReports]
        };
    }


    const cutoff =
        Date.now() -
        (
            days *
            24 *
            60 *
            60 *
            1000
        );


    /*
     * Filter actions by their actual
     * event timestamp.
     */
    const actions =
        ngoActions.filter(
            action => {

                const time =
                    new Date(
                        action.created_at ||
                        0
                    ).getTime();


                return (
                    Number.isFinite(time) &&
                    time >= cutoff
                );
            }
        );


    /*
     * Reports are included if either:
     *
     * 1. their report creation is inside period
     *
     * OR
     *
     * 2. their NGO action occurred inside period.
     *
     * This is important because a case can be created
     * earlier but handled by the NGO during the selected
     * period.
     */
    const actionReportIds =
        new Set(
            actions
                .map(
                    action =>
                        Number(
                            action.report_id
                        )
                )
                .filter(
                    id =>
                        Number.isFinite(
                            id
                        )
                )
        );


    const reports =
        ngoReports.filter(
            report => {

                const reportId =
                    Number(
                        report.id
                    );


                if (
                    actionReportIds.has(
                        reportId
                    )
                ) {
                    return true;
                }


                const createdTime =
                    new Date(
                        report.created_at ||
                        0
                    ).getTime();


                return (
                    Number.isFinite(
                        createdTime
                    ) &&
                    createdTime >= cutoff
                );
            }
        );


    return {

        actions,

        reports
    };
}


/* =========================================================
   CALCULATE ANALYTICS
   ========================================================= */

function calculateAnalytics(
    actions,
    reports
) {

    /*
     * -----------------------------------------------------
     * Build report map.
     * -----------------------------------------------------
     */

    const reportMap =
        new Map();


    reports.forEach(
        report => {

            reportMap.set(
                Number(
                    report.id
                ),
                report
            );
        }
    );


    /*
     * -----------------------------------------------------
     * Group actions by report.
     * -----------------------------------------------------
     */

    const actionsByReport =
        new Map();


    actions.forEach(
        action => {

            const reportId =
                Number(
                    action.report_id
                );


            if (
                !Number.isFinite(
                    reportId
                )
            ) {
                return;
            }


            if (
                !actionsByReport.has(
                    reportId
                )
            ) {

                actionsByReport.set(
                    reportId,
                    []
                );
            }


            actionsByReport
                .get(reportId)
                .push(action);
        }
    );


    /*
     * Sort actions.
     */
    actionsByReport.forEach(
        list => {

            list.sort(
                (
                    a,
                    b
                ) =>
                    new Date(
                        a.created_at || 0
                    ) -
                    new Date(
                        b.created_at || 0
                    )
            );
        }
    );


    /*
     * -----------------------------------------------------
     * Unique handled cases.
     *
     * A case counts as handled when the NGO has a TAKE
     * action.
     * -----------------------------------------------------
     */

    const handledReportIds =
        new Set();


    actions.forEach(
        action => {

            if (
                normalizeAction(
                    action.action
                ) ===
                "take"
            ) {

                handledReportIds.add(
                    Number(
                        action.report_id
                    )
                );
            }
        }
    );


    const handledReports =
        Array.from(
            handledReportIds
        )
            .map(
                id =>
                    reportMap.get(id)
            )
            .filter(Boolean);


    /*
     * -----------------------------------------------------
     * STATUS COUNTS
     * -----------------------------------------------------
     */

    const activeReports =
        handledReports.filter(
            report =>
                normalizeStatus(
                    report.status
                ) ===
                "in_progress"
        );


    const completedReports =
        handledReports.filter(
            report =>
                normalizeStatus(
                    report.status
                ) ===
                "completed"
        );


    const releasedReports =
        handledReports.filter(
            report => {

                const reportId =
                    Number(
                        report.id
                    );


                const reportActions =
                    actionsByReport.get(
                        reportId
                    ) ||
                    [];


                return (
                    normalizeStatus(
                        report.status
                    ) ===
                    "released"
                    ||
                    reportActions.some(
                        action =>
                            normalizeAction(
                                action.action
                            ) ===
                            "release"
                    )
                );
            }
        );


    /*
     * -----------------------------------------------------
     * SOS
     * -----------------------------------------------------
     */

    const sosReports =
        handledReports.filter(
            report =>
                isSOS(
                    report
                )
        );


    /*
     * -----------------------------------------------------
     * CATEGORY
     * -----------------------------------------------------
     */

    const categories =
        {};


    handledReports.forEach(
        report => {

            const category =
                String(
                    report.category ||
                    "Other"
                )
                    .trim() ||
                "Other";


            categories[
                category
            ] =
                (
                    categories[
                        category
                    ] ||
                    0
                ) +
                1;
        }
    );


    /*
     * -----------------------------------------------------
     * RESPONSE TIME
     *
     * Report created →
     * first TAKE action.
     * -----------------------------------------------------
     */

    const responseTimes = [];


    handledReports.forEach(
        report => {

            const reportId =
                Number(
                    report.id
                );


            const reportActions =
                actionsByReport.get(
                    reportId
                ) ||
                [];


            const takeAction =
                reportActions.find(
                    action =>
                        normalizeAction(
                            action.action
                        ) ===
                        "take"
                );


            if (
                !takeAction ||
                !report.created_at
            ) {
                return;
            }


            const reportTime =
                new Date(
                    report.created_at
                ).getTime();


            const takeTime =
                new Date(
                    takeAction.created_at
                ).getTime();


            if (
                Number.isFinite(
                    reportTime
                ) &&
                Number.isFinite(
                    takeTime
                ) &&
                takeTime >=
                    reportTime
            ) {

                responseTimes.push(
                    takeTime -
                    reportTime
                );
            }
        }
    );


    /*
     * -----------------------------------------------------
     * COMPLETION TIME
     *
     * TAKE → COMPLETE
     * -----------------------------------------------------
     */

    const completionTimes = [];


    handledReports.forEach(
        report => {

            const reportId =
                Number(
                    report.id
                );


            const reportActions =
                actionsByReport.get(
                    reportId
                ) ||
                [];


            const takeAction =
                reportActions.find(
                    action =>
                        normalizeAction(
                            action.action
                        ) ===
                        "take"
                );


            const completeAction =
                reportActions.find(
                    action =>
                        normalizeAction(
                            action.action
                        ) ===
                        "complete"
                );


            if (
                !takeAction ||
                !completeAction
            ) {
                return;
            }


            const takeTime =
                new Date(
                    takeAction.created_at
                ).getTime();


            const completeTime =
                new Date(
                    completeAction.created_at
                ).getTime();


            if (
                Number.isFinite(
                    takeTime
                ) &&
                Number.isFinite(
                    completeTime
                ) &&
                completeTime >=
                    takeTime
            ) {

                completionTimes.push(
                    completeTime -
                    takeTime
                );
            }
        }
    );


    /*
     * -----------------------------------------------------
     * RATES
     * -----------------------------------------------------
     */

    const total =
        handledReports.length;


    const completionRate =
        total > 0
            ?
            (
                completedReports.length /
                total
            ) *
            100
            :
            0;


    const releaseRate =
        total > 0
            ?
            (
                releasedReports.length /
                total
            ) *
            100
            :
            0;


    const sosShare =
        total > 0
            ?
            (
                sosReports.length /
                total
            ) *
            100
            :
            0;


    const activeShare =
        total > 0
            ?
            (
                activeReports.length /
                total
            ) *
            100
            :
            0;


    return {

        total,

        active:
            activeReports.length,

        completed:
            completedReports.length,

        released:
            releasedReports.length,

        sos:
            sosReports.length,

        completionRate,

        releaseRate,

        sosShare,

        activeShare,

        categories,

        responseTimes,

        completionTimes,

        handledReports,

        actionsByReport
    };
}


/* =========================================================
   RENDER STATISTICS
   ========================================================= */

function renderStatistics(
    data
) {

    setText(
        "stat-total",
        data.total
    );


    setText(
        "stat-active",
        data.active
    );


    setText(
        "stat-completed",
        data.completed
    );


    setText(
        "stat-released",
        data.released
    );


    setText(
        "stat-sos",
        data.sos
    );


    setText(
        "stat-completion-rate",
        formatNumber(
            data.completionRate
        )
    );
}


/* =========================================================
   STATUS CHART
   ========================================================= */

function renderStatusChart(
    data
) {

    const canvas =
        document.getElementById(
            "statusChart"
        );


    const empty =
        document.getElementById(
            "statusChartEmpty"
        );


    if (!canvas) {
        return;
    }


    const total =
        data.total;


    if (
        !total
    ) {

        if (statusChart) {

            statusChart.destroy();

            statusChart =
                null;
        }


        canvas.classList.add(
            "d-none"
        );


        empty?.classList.remove(
            "d-none"
        );


        return;
    }


    canvas.classList.remove(
        "d-none"
    );


    empty?.classList.add(
        "d-none"
    );


    if (statusChart) {

        statusChart.destroy();
    }


    statusChart =
        new Chart(
            canvas,
            {

                type:
                    "doughnut",

                data: {

                    labels: [
                        "Active",
                        "Completed",
                        "Released"
                    ],

                    datasets: [

                        {

                            data: [

                                data.active,

                                data.completed,

                                data.released

                            ],

                            backgroundColor: [

                                "#f0ad00",

                                "#198754",

                                "#8c6bb1"

                            ],

                            borderColor:
                                "#ffffff",

                            borderWidth:
                                3

                        }

                    ]

                },

                options: {

                    responsive:
                        true,

                    maintainAspectRatio:
                        false,

                    cutout:
                        "68%",

                    plugins: {

                        legend: {

                            position:
                                "bottom",

                            labels: {

                                boxWidth:
                                    10,

                                boxHeight:
                                    10,

                                padding:
                                    15,

                                font: {

                                    size:
                                        10

                                }

                            }

                        },

                        tooltip: {

                            callbacks: {

                                label:
                                    function(
                                        context
                                    ) {

                                        const value =
                                            context.raw;

                                        const percentage =
                                            total
                                                ?
                                                (
                                                    value /
                                                    total
                                                ) *
                                                100
                                                :
                                                0;


                                        return (
                                            " " +
                                            context.label +
                                            ": " +
                                            value +
                                            " (" +
                                            formatNumber(
                                                percentage
                                            ) +
                                            "%)"
                                        );
                                    }
                            }
                        }

                    }
                }
            }
        );
}


/* =========================================================
   CATEGORY BREAKDOWN
   ========================================================= */

function renderCategoryBreakdown(
    data
) {

    const container =
        document.getElementById(
            "categoryBreakdown"
        );


    if (!container) {
        return;
    }


    const entries =
        Object.entries(
            data.categories
        )
            .sort(
                (
                    a,
                    b
                ) =>
                    b[1] -
                    a[1]
            );


    if (!entries.length) {

        container.innerHTML = `

            <div class="analytics-empty">

                <i
                    class="
                        bi
                        bi-grid
                    "
                ></i>

                <span>
                    No category data available.
                </span>

            </div>

        `;

        return;
    }


    container.innerHTML =
        entries
            .map(
                (
                    [
                        category,
                        count
                    ]
                ) => {

                    const percentage =
                        data.total
                            ?
                            (
                                count /
                                data.total
                            ) *
                            100
                            :
                            0;


                    return `

                        <div
                            class="
                                breakdown-item
                            "
                        >

                            <div
                                class="
                                    breakdown-icon
                                "
                            >

                                <i
                                    class="
                                        bi
                                        bi-tag-fill
                                    "
                                ></i>

                            </div>


                            <div
                                class="
                                    breakdown-main
                                "
                            >

                                <strong>

                                    ${escapeHTML(
                                        category
                                    )}

                                </strong>


                                <small>

                                    ${formatNumber(
                                        percentage
                                    )}% of handled cases

                                </small>

                            </div>


                            <div
                                class="
                                    breakdown-value
                                "
                            >

                                <strong>

                                    ${count}

                                </strong>


                                <small>
                                    cases
                                </small>

                            </div>

                        </div>

                    `;
                }
            )
            .join("");
}


/* =========================================================
   PERFORMANCE
   ========================================================= */

function renderPerformance(
    data
) {

    const avgResponse =
        average(
            data.responseTimes
        );


    const avgCompletion =
        average(
            data.completionTimes
        );


    setText(
        "avgResponseTime",
        formatDuration(
            avgResponse
        )
    );


    setText(
        "avgCompletionTime",
        formatDuration(
            avgCompletion
        )
    );


    setText(
        "releaseRate",
        formatNumber(
            data.releaseRate
        ) +
        "%"
    );
}


/* =========================================================
   SUMMARY
   ========================================================= */

function renderSummary(
    data
) {

    setText(
        "summary-sos-share",
        formatNumber(
            data.sosShare
        ) +
        "%"
    );


    setText(
        "summary-completion-share",
        formatNumber(
            data.completionRate
        ) +
        "%"
    );


    setText(
        "summary-release-share",
        formatNumber(
            data.releaseRate
        ) +
        "%"
    );


    setText(
        "summary-active-share",
        formatNumber(
            data.activeShare
        ) +
        "%"
    );
}


/* =========================================================
   TREND CHART
   ========================================================= */

function renderTrendChart(
    actions,
    reports
) {

    const canvas =
        document.getElementById(
            "trendChart"
        );


    const empty =
        document.getElementById(
            "trendChartEmpty"
        );


    if (!canvas) {
        return;
    }


    const buckets =
        buildTrendBuckets(
            actions,
            reports
        );


    const hasData =
        buckets.labels.length >
        0 &&
        buckets.datasets.some(
            dataset =>
                dataset.data.some(
                    value =>
                        value > 0
                )
        );


    if (!hasData) {

        if (trendChart) {

            trendChart.destroy();

            trendChart =
                null;
        }


        canvas.classList.add(
            "d-none"
        );


        empty?.classList.remove(
            "d-none"
        );


        return;
    }


    canvas.classList.remove(
        "d-none"
    );


    empty?.classList.add(
        "d-none"
    );


    if (trendChart) {

        trendChart.destroy();
    }


    trendChart =
        new Chart(
            canvas,
            {

                type:
                    "line",

                data: {

                    labels:
                        buckets.labels,

                    datasets: [

                        {

                            label:
                                "Taken",

                            data:
                                buckets.datasets[0].data,

                            borderColor:
                                "#1769aa",

                            backgroundColor:
                                "rgba(23, 105, 170, 0.08)",

                            fill:
                                true,

                            tension:
                                0.35,

                            pointRadius:
                                3,

                            pointHoverRadius:
                                5

                        },


                        {

                            label:
                                "Completed",

                            data:
                                buckets.datasets[1].data,

                            borderColor:
                                "#198754",

                            backgroundColor:
                                "transparent",

                            fill:
                                false,

                            tension:
                                0.35,

                            pointRadius:
                                3,

                            pointHoverRadius:
                                5

                        },


                        {

                            label:
                                "Released",

                            data:
                                buckets.datasets[2].data,

                            borderColor:
                                "#8c6bb1",

                            backgroundColor:
                                "transparent",

                            fill:
                                false,

                            tension:
                                0.35,

                            pointRadius:
                                3,

                            pointHoverRadius:
                                5

                        }

                    ]

                },

                options: {

                    responsive:
                        true,

                    maintainAspectRatio:
                        false,

                    interaction: {

                        intersect:
                            false,

                        mode:
                            "index"

                    },

                    plugins: {

                        legend: {

                            position:
                                "top",

                            align:
                                "end",

                            labels: {

                                boxWidth:
                                    10,

                                boxHeight:
                                    10,

                                font: {

                                    size:
                                        9

                                }

                            }

                        }

                    },

                    scales: {

                        x: {

                            grid: {

                                display:
                                    false

                            },

                            ticks: {

                                color:
                                    "#8993a0",

                                font: {

                                    size:
                                        8

                                },

                                maxRotation:
                                    0

                            }

                        },

                        y: {

                            beginAtZero:
                                true,

                            ticks: {

                                precision:
                                    0,

                                color:
                                    "#8993a0",

                                font: {

                                    size:
                                        8

                                }

                            },

                            grid: {

                                color:
                                    "#edf0f4"

                            }

                        }

                    }

                }

            }
        );
}


/* =========================================================
   BUILD TREND BUCKETS
   ========================================================= */

function buildTrendBuckets(
    actions,
    reports
) {

    /*
     * All-time gets monthly buckets.
     * Short periods get daily buckets.
     */
    const useMonthly =
        currentPeriod ===
            "all" ||
        Number(
            currentPeriod
        ) >
            90;


    const bucketMap =
        new Map();


    /*
     * -----------------------------------------------------
     * TAKE
     * -----------------------------------------------------
     */

    actions.forEach(
        action => {

            const actionName =
                normalizeAction(
                    action.action
                );


            if (
                actionName !==
                "take"
            ) {
                return;
            }


            const date =
                new Date(
                    action.created_at
                );


            if (
                Number.isNaN(
                    date.getTime()
                )
            ) {
                return;
            }


            const key =
                getTrendKey(
                    date,
                    useMonthly
                );


            if (
                !bucketMap.has(
                    key
                )
            ) {

                bucketMap.set(
                    key,
                    {
                        date:
                            date,

                        taken:
                            0,

                        completed:
                            0,

                        released:
                            0
                    }
                );
            }


            bucketMap.get(
                key
            ).taken++;
        }
    );


    /*
     * -----------------------------------------------------
     * COMPLETE / RELEASE
     * -----------------------------------------------------
     */

    actions.forEach(
        action => {

            const actionName =
                normalizeAction(
                    action.action
                );


            if (
                actionName !==
                    "complete" &&
                actionName !==
                    "release"
            ) {
                return;
            }


            const date =
                new Date(
                    action.created_at
                );


            if (
                Number.isNaN(
                    date.getTime()
                )
            ) {
                return;
            }


            const key =
                getTrendKey(
                    date,
                    useMonthly
                );


            if (
                !bucketMap.has(
                    key
                )
            ) {

                bucketMap.set(
                    key,
                    {
                        date:
                            date,

                        taken:
                            0,

                        completed:
                            0,

                        released:
                            0
                    }
                );
            }


            if (
                actionName ===
                "complete"
            ) {

                bucketMap.get(
                    key
                ).completed++;

            } else {

                bucketMap.get(
                    key
                ).released++;
            }
        }
    );


    const entries =
        Array.from(
            bucketMap.values()
        )
            .sort(
                (
                    a,
                    b
                ) =>
                    a.date -
                    b.date
            );


    const labels =
        entries.map(
            item =>
                formatTrendLabel(
                    item.date,
                    useMonthly
                )
        );


    return {

        labels,

        datasets: [

            {
                label:
                    "Taken",

                data:
                    entries.map(
                        item =>
                            item.taken
                    )
            },

            {
                label:
                    "Completed",

                data:
                    entries.map(
                        item =>
                            item.completed
                    )
            },

            {
                label:
                    "Released",

                data:
                    entries.map(
                        item =>
                            item.released
                    )
            }

        ]

    };
}


/* =========================================================
   TREND KEY
   ========================================================= */

function getTrendKey(
    date,
    monthly
) {

    if (monthly) {

        return (
            date.getFullYear() +
            "-" +
            String(
                date.getMonth() + 1
            )
                .padStart(
                    2,
                    "0"
                )
        );
    }


    return (
        date.getFullYear() +
        "-" +
        String(
            date.getMonth() + 1
        )
            .padStart(
                2,
                "0"
            ) +
        "-" +
        String(
            date.getDate()
        )
            .padStart(
                2,
                "0"
            )
    );
}


/* =========================================================
   TREND LABEL
   ========================================================= */

function formatTrendLabel(
    date,
    monthly
) {

    if (monthly) {

        return date.toLocaleDateString(
            "en-IN",
            {
                month:
                    "short",

                year:
                    "numeric"
            }
        );
    }


    return date.toLocaleDateString(
        "en-IN",
        {
            day:
                "numeric",

            month:
                "short"
        }
    );
}


/* =========================================================
   RECENT ACTIVITY
   ========================================================= */

function renderRecentActivity(
    actions,
    reports
) {

    const container =
        document.getElementById(
            "recentActivityContainer"
        );


    const countElement =
        document.getElementById(
            "activityCount"
        );


    if (!container) {
        return;
    }


    const reportMap =
        new Map();


    reports.forEach(
        report => {

            reportMap.set(
                Number(
                    report.id
                ),
                report
            );
        }
    );


    const recent =
        [...actions]
            .sort(
                (
                    a,
                    b
                ) =>
                    new Date(
                        b.created_at || 0
                    ) -
                    new Date(
                        a.created_at || 0
                    )
            )
            .slice(
                0,
                30
            );


    if (
        countElement
    ) {

        countElement.textContent =
            `${recent.length} event${
                recent.length === 1
                    ? ""
                    : "s"
            }`;
    }


    if (!recent.length) {

        container.innerHTML = `

            <div class="analytics-empty">

                <i
                    class="
                        bi
                        bi-clock-history
                    "
                ></i>

                <span>
                    No response activity in this period.
                </span>

            </div>

        `;

        return;
    }


    container.innerHTML =
        recent
            .map(
                action => {

                    const actionName =
                        normalizeAction(
                            action.action
                        );


                    const report =
                        reportMap.get(
                            Number(
                                action.report_id
                            )
                        );


                    const reportCategory =
                        report?.category ||
                        "Response Case";


                    const actionLabel =
                        getActionLabel(
                            actionName
                        );


                    const icon =
                        getActionIcon(
                            actionName
                        );


                    const badgeClass =
                        actionName ||
                        "other";


                    return `

                        <div
                            class="
                                activity-item
                            "
                        >

                            <div
                                class="
                                    activity-dot
                                    ${badgeClass}
                                "
                            >

                                <i
                                    class="
                                        ${icon}
                                    "
                                ></i>

                            </div>


                            <div
                                class="
                                    activity-main
                                "
                            >

                                <div
                                    class="
                                        activity-title
                                    "
                                >

                                    <strong>

                                        Report #${Number(
                                            action.report_id
                                        )}

                                    </strong>


                                    <span
                                        class="
                                            activity-badge
                                            ${badgeClass}
                                        "
                                    >

                                        ${escapeHTML(
                                            actionLabel
                                        )}

                                    </span>

                                </div>


                                <div
                                    class="
                                        activity-meta
                                    "
                                >

                                    ${escapeHTML(
                                        reportCategory
                                    )}

                                    &nbsp; • &nbsp;

                                    ${formatDate(
                                        action.created_at
                                    )}

                                </div>


                                ${
                                    action.reason
                                        ?
                                        `
                                            <div
                                                class="
                                                    activity-reason
                                                "
                                            >

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
                                            <div
                                                class="
                                                    activity-reason
                                                "
                                            >

                                                ${escapeHTML(
                                                    action.notes
                                                )}

                                            </div>
                                        `
                                        :
                                        ""
                                }

                            </div>

                        </div>

                    `;
                }
            )
            .join("");
}


/* =========================================================
   ACTION LABEL
   ========================================================= */

function getActionLabel(
    action
) {

    switch (
        normalizeAction(
            action
        )
    ) {

        case "take":

            return "TAKEN";


        case "complete":

            return "COMPLETED";


        case "release":

            return "RELEASED";


        default:

            return String(
                action ||
                "ACTION"
            )
                .replace(
                    /_/g,
                    " "
                )
                .toUpperCase();
    }
}


/* =========================================================
   ACTION ICON
   ========================================================= */

function getActionIcon(
    action
) {

    switch (
        normalizeAction(
            action
        )
    ) {

        case "take":

            return "bi bi-hand-index-thumb-fill";


        case "complete":

            return "bi bi-check-circle-fill";


        case "release":

            return "bi bi-arrow-return-left";


        default:

            return "bi bi-activity";
    }
}


/* =========================================================
   EVENT BINDING
   ========================================================= */

function bindAnalyticsEvents() {

    /*
     * Period buttons.
     */
    const periodButtons =
        document.querySelectorAll(
            ".period-btn"
        );


    periodButtons.forEach(
        button => {

            button.addEventListener(
                "click",
                () => {

                    const period =
                        button.dataset.period;


                    currentPeriod =
                        period === "all"
                            ?
                            "all"
                            :
                            Number(
                                period
                            );


                    periodButtons.forEach(
                        item =>
                            item.classList.remove(
                                "active"
                            )
                    );


                    button.classList.add(
                        "active"
                    );


                    calculateAndRenderAnalytics();
                }
            );
        }
    );


    /*
     * Refresh.
     */
    const refresh =
        document.getElementById(
            "refreshAnalyticsBtn"
        );


    if (refresh) {

        refresh.addEventListener(
            "click",
            async () => {

                refresh.disabled =
                    true;


                const originalHTML =
                    refresh.innerHTML;


                refresh.innerHTML = `

                    <span
                        class="
                            spinner-border
                            spinner-border-sm
                            me-1
                        "
                    ></span>

                    Refreshing...

                `;


                try {

                    await loadAnalyticsData();

                } catch (error) {

                    console.error(
                        "Analytics refresh failed:",
                        error
                    );

                } finally {

                    refresh.disabled =
                        false;

                    refresh.innerHTML =
                        originalHTML;
                }
            }
        );
    }


    /*
     * Logout.
     */
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
}


/* =========================================================
   PERIOD UI
   ========================================================= */

function updatePeriodUI() {

    const label =
        document.getElementById(
            "analyticsPeriodLabel"
        );


    const trendNote =
        document.getElementById(
            "trendPeriodNote"
        );


    let text =
        "All Time";


    if (
        currentPeriod ===
        7
    ) {

        text =
            "Last 7 Days";

    } else if (
        currentPeriod ===
        30
    ) {

        text =
            "Last 30 Days";

    } else if (
        currentPeriod ===
        90
    ) {

        text =
            "Last 90 Days";
    }


    if (label) {
        label.textContent =
            text;
    }


    if (trendNote) {
        trendNote.textContent =
            text;
    }
}


/* =========================================================
   LAST UPDATED
   ========================================================= */

function updateLastUpdated() {

    setText(
        "lastUpdatedAt",
        new Date().toLocaleString(
            "en-IN",
            {
                dateStyle:
                    "medium",

                timeStyle:
                    "short"
            }
        )
    );
}


/* =========================================================
   LOADING
   ========================================================= */

function showAnalyticsLoading() {

    const categoryContainer =
        document.getElementById(
            "categoryBreakdown"
        );


    const activityContainer =
        document.getElementById(
            "recentActivityContainer"
        );


    if (categoryContainer) {

        categoryContainer.innerHTML = `

            <div
                class="
                    analytics-loading
                "
            >

                <div
                    class="
                        spinner-border
                        spinner-border-sm
                        text-primary
                    "
                ></div>

                Loading categories...

            </div>

        `;
    }


    if (activityContainer) {

        activityContainer.innerHTML = `

            <div
                class="
                    analytics-loading
                "
            >

                <div
                    class="
                        spinner-border
                        spinner-border-sm
                        text-primary
                    "
                ></div>

                Loading response activity...

            </div>

        `;
    }
}


/* =========================================================
   HIDE LOADING
   ========================================================= */

function hideAnalyticsLoading() {

    /*
     * Rendering functions replace their own loading
     * containers, so no additional action is required.
     */
}


/* =========================================================
   ERROR
   ========================================================= */

function showAnalyticsError(
    message
) {

    const categoryContainer =
        document.getElementById(
            "categoryBreakdown"
        );


    const activityContainer =
        document.getElementById(
            "recentActivityContainer"
        );


    const errorHTML = `

        <div
            class="
                analytics-empty
            "
        >

            <i
                class="
                    bi
                    bi-exclamation-triangle
                    text-danger
                "
            ></i>

            <span>
                ${escapeHTML(
                    message
                )}
            </span>

        </div>

    `;


    if (categoryContainer) {

        categoryContainer.innerHTML =
            errorHTML;
    }


    if (activityContainer) {

        activityContainer.innerHTML =
            errorHTML;
    }
}


/* =========================================================
   LOGOUT
   ========================================================= */

async function handleNGOLogout() {

    try {

        await safeSignOut();

    } catch (error) {

        console.error(
            "Logout error:",
            error
        );

    } finally {

        sessionStorage.clear();

        redirectToLogin();
    }
}


/* =========================================================
   SAFE SIGN OUT
   ========================================================= */

async function safeSignOut() {

    if (
        !supabaseClient ||
        !supabaseClient.auth
    ) {
        return;
    }


    await supabaseClient
        .auth
        .signOut();
}


/* =========================================================
   REDIRECT
   ========================================================= */

function redirectToLogin() {

    window.location.href =
        "../index.html";
}


/* =========================================================
   STATUS NORMALIZATION
   ========================================================= */

function normalizeStatus(
    status
) {

    const value =
        String(
            status ||
            ""
        )
            .trim()
            .toLowerCase()
            .replace(
                /-/g,
                "_"
            )
            .replace(
                /\s+/g,
                "_"
            );


    if (
        value === "inprocess" ||
        value === "in_process" ||
        value === "processing" ||
        value === "taken" ||
        value === "in_progress"
    ) {

        return "in_progress";
    }


    if (
        value === "complete" ||
        value === "closed" ||
        value === "completed"
    ) {

        return "completed";
    }


    if (
        value === "release" ||
        value === "released"
    ) {

        return "released";
    }


    if (
        value === "open"
    ) {

        return "open";
    }


    return value;
}


/* =========================================================
   ACTION NORMALIZATION
   ========================================================= */

function normalizeAction(
    action
) {

    return String(
        action ||
        ""
    )
        .trim()
        .toLowerCase()
        .replace(
            /-/g,
            "_"
        )
        .replace(
            /\s+/g,
            "_"
        );
}


/* =========================================================
   SOS CHECK
   ========================================================= */

function isSOS(
    report
) {

    if (!report) {
        return false;
    }


    return (
        String(
            report.category ||
            ""
        )
            .trim()
            .toLowerCase() ===
        "sos"
    );
}


/* =========================================================
   AVERAGE
   ========================================================= */

function average(
    values
) {

    if (
        !Array.isArray(
            values
        ) ||
        !values.length
    ) {

        return null;
    }


    const valid =
        values.filter(
            value =>
                Number.isFinite(
                    value
                )
        );


    if (!valid.length) {
        return null;
    }


    return (
        valid.reduce(
            (
                sum,
                value
            ) =>
                sum +
                value,
            0
        ) /
        valid.length
    );
}


/* =========================================================
   FORMAT DURATION
   ========================================================= */

function formatDuration(
    milliseconds
) {

    if (
        !Number.isFinite(
            milliseconds
        )
    ) {

        return "—";
    }


    const totalMinutes =
        Math.max(
            0,
            Math.round(
                milliseconds /
                60000
            )
        );


    const days =
        Math.floor(
            totalMinutes /
            1440
        );


    const hours =
        Math.floor(
            (
                totalMinutes %
                1440
            ) /
            60
        );


    const minutes =
        totalMinutes %
        60;


    if (days > 0) {

        return `${days}d ${hours}h`;

    }


    if (hours > 0) {

        return `${hours}h ${minutes}m`;

    }


    return `${minutes}m`;
}


/* =========================================================
   FORMAT NUMBER
   ========================================================= */

function formatNumber(
    value
) {

    if (
        !Number.isFinite(
            Number(value)
        )
    ) {

        return "0";
    }


    return Number(
        value
    )
        .toFixed(
            1
        )
        .replace(
            /\.0$/,
            ""
        );
}


/* =========================================================
   DATE FORMAT
   ========================================================= */

function formatDate(
    value
) {

    if (!value) {
        return "Not available";
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

        return String(
            value
        );
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
   TEXT HELPER
   ========================================================= */

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


/* =========================================================
   HTML ESCAPING
   ========================================================= */

function escapeHTML(
    value
) {

    return String(
        value ??
        ""
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


/* =========================================================
   GLOBAL DEBUG FUNCTIONS
   ========================================================= */

window.loadAnalyticsData =
    loadAnalyticsData;


window.calculateAndRenderAnalytics =
    calculateAndRenderAnalytics;