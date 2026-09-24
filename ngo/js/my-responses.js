/* =========================================================
   AAPDASETU NGO
   MY RESOURCE / MY RESPONSES
   =========================================================

   PURPOSE:
   ---------------------------------------------------------
   This page displays cases that have been handled by the
   currently authenticated NGO.

   CASES INCLUDED:
   ---------------------------------------------------------
   1. IN PROGRESS
   2. COMPLETED
   3. RELEASED

   IMPORTANT:
   ---------------------------------------------------------
   Released cases remain in this NGO's history even after
   citizen_reports.assigned_to is cleared.

   This is achieved by reconstructing the NGO's portfolio
   from ngo_report_actions.

   PRIVATE CITIZEN INFORMATION:
   ---------------------------------------------------------
   Private citizen information is available only when:

       - current NGO is authenticated
       - NGO is ACTIVE
       - report belongs to this NGO
       - report is currently assigned to this NGO
       - report is not released

   Completed cases retain NGO attribution and may continue
   showing the private information associated with the case.

   SECURITY:
   ---------------------------------------------------------
   Frontend checks are NOT the actual security boundary.

   Supabase Auth + database RLS/RPC policies must enforce:
       - authenticated NGO access
       - NGO ownership
       - action ownership
       - response ownership
       - profile access restrictions

   NO RLS IS CREATED OR MODIFIED BY THIS FILE.

   TABLES:
   ---------------------------------------------------------
   ngo_users
   ngos
   citizen_reports
   ngo_response_details
   ngo_report_actions
   profiles
   ========================================================= */


/* =========================================================
   CONFIGURATION
   ========================================================= */

const CONFIG_ENDPOINT =
    "/api/config";


/* =========================================================
   GLOBAL VARIABLES
   ========================================================= */

let supabaseClient = null;

let currentUser = null;

let currentNGOUser = null;

let currentNGO = null;

/*
 * Complete historical portfolio of the current NGO.
 *
 * This includes:
 *
 *   IN PROGRESS
 *   COMPLETED
 *   RELEASED
 */
let myResponseCases = [];


/* =========================================================
   INITIALIZATION
   ========================================================= */

document.addEventListener(
    "DOMContentLoaded",
    initializeMyResponses
);


async function initializeMyResponses() {

    console.log(
        "🚀 Initializing AapdaSetu My Resource..."
    );

    try {

        /*
         * STEP 1
         * Initialize Supabase.
         */
        await initializeSupabase();


        /*
         * STEP 2
         * Verify authenticated Supabase session.
         */
        const authenticated =
            await verifySession();

        if (!authenticated) {
            return;
        }


        /*
         * STEP 3
         * Load and validate NGO account.
         */
        const ngoLoaded =
            await loadCurrentNGO();

        if (!ngoLoaded) {
            return;
        }


        /*
         * STEP 4
         * Load this NGO's complete response history.
         */
        await loadMyResponses();


        /*
         * STEP 5
         * Bind page controls.
         */
        bindResponseEvents();


        /*
         * STEP 6
         * Bind logout.
         */
        bindLogout();


        console.log(
            "✅ My Resource initialized successfully."
        );

    } catch (error) {

        console.error(
            "❌ My Resource initialization failed:",
            error
        );

        showPageError(
            error?.message ||
            "Unable to load My Resource."
        );
    }
}


/* =========================================================
   SUPABASE INITIALIZATION
   ========================================================= */

async function initializeSupabase() {

    /*
     * Reuse an existing Supabase client if the main
     * NGO dashboard already created one.
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
     * Make sure Supabase library is available.
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
     * Load public configuration.
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
   SESSION VERIFICATION
   ========================================================= */

async function verifySession() {

    if (!supabaseClient) {

        throw new Error(
            "Supabase client is unavailable."
        );
    }


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

        console.warn(
            "⚠️ No active NGO session."
        );

        redirectToLogin();

        return false;
    }


    console.log(
        "✅ Authenticated NGO user:",
        currentUser.id
    );


    return true;
}


/* =========================================================
   LOAD CURRENT NGO
   ========================================================= */

async function loadCurrentNGO() {

    if (!currentUser) {

        throw new Error(
            "Authenticated user is unavailable."
        );
    }


    /*
     * -----------------------------------------------------
     * STEP 1
     * Find provisioned NGO user.
     * -----------------------------------------------------
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
     * NGO USER MUST BE ACTIVE.
     */
    if (
        String(
            ngoUser.status || ""
        )
            .trim()
            .toUpperCase() !==
        "ACTIVE"
    ) {

        console.error(
            "❌ NGO user account is not ACTIVE."
        );

        await safeSignOut();

        redirectToLogin();

        return false;
    }


    currentNGOUser =
        ngoUser;


    /*
     * -----------------------------------------------------
     * STEP 2
     * Load organization.
     * -----------------------------------------------------
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
     * NGO organization must also be ACTIVE.
     */
    if (
        String(
            ngo.status || ""
        )
            .trim()
            .toUpperCase() !==
        "ACTIVE"
    ) {

        console.error(
            "❌ NGO organisation is not ACTIVE."
        );

        await safeSignOut();

        redirectToLogin();

        return false;
    }


    currentNGO =
        ngo;


    updateNGOIdentity(
        ngo.name,
        ngo.ngo_code
    );


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

function updateNGOIdentity(
    name,
    code
) {

    const ngoName =
        name ||
        "Authorized NGO";


    const ngoCode =
        code ||
        "NGO";


    /*
     * Sidebar.
     */
    setText(
        "sidebar-ngo-name",
        ngoName
    );


    setText(
        "sidebar-ngo-code",
        ngoCode
    );


    /*
     * Header.
     */
    setText(
        "header-ngo-name",
        ngoName
    );


    setText(
        "header-ngo-code",
        ngoCode
    );
}


/* =========================================================
   LOAD MY RESPONSE HISTORY
   =========================================================

   IMPORTANT ARCHITECTURE:

   We DO NOT start by asking:

       citizen_reports
       WHERE assigned_to = current NGO

   because a RELEASE operation can clear assigned_to.

   Instead:

       ngo_report_actions
              ↓
       report IDs previously handled by NGO
              ↓
       citizen_reports
              ↓
       response details
              ↓
       citizen profile where permitted
              ↓
       My Resource portfolio

   This allows released cases to remain in history.
   ========================================================= */

async function loadMyResponses() {

    if (
        !currentNGOUser ||
        !currentNGO
    ) {

        throw new Error(
            "NGO information is not available."
        );
    }


    showLoading();


    const ngoId =
        Number(
            currentNGO.id
        );


    if (
        !Number.isFinite(
            ngoId
        )
    ) {

        throw new Error(
            "Invalid NGO identifier."
        );
    }


    console.log(
        "🔎 Loading response history for NGO:",
        currentNGO.ngo_code
    );


    /* =====================================================
       STEP 1
       LOAD ALL ACTIONS BELONGING TO THIS NGO
       ===================================================== */

    const {
        data: actions,
        error: actionsError
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
                ngoId
            )
            .order(
                "created_at",
                {
                    ascending: false
                }
            );


    if (actionsError) {
        throw actionsError;
    }


    const actionRows =
        Array.isArray(actions)
            ? actions
            : [];


    console.log(
        `📜 ${actionRows.length} NGO action(s) found.`
    );


    /*
     * Extract unique report IDs.
     */
    const reportIds =
        [
            ...new Set(
                actionRows
                    .map(
                        action =>
                            Number(
                                action.report_id
                            )
                    )
                    .filter(
                        id =>
                            Number.isFinite(id)
                    )
            )
        ];


    /*
     * No historical actions means no response cases.
     */
    if (!reportIds.length) {

        myResponseCases = [];

        updateCounters();

        renderResponses();

        return;
    }


    console.log(
        "📋 Historical report IDs:",
        reportIds
    );


    /* =====================================================
       STEP 2
       LOAD REPORTS BY HISTORICAL REPORT IDs
       ===================================================== */

    const {
        data: reports,
        error: reportsError
    } =
        await supabaseClient
            .from("citizen_reports")
            .select(`
                id,
                report_type,
                latitude,
                longitude,
                created_at,
                category,
                details,
                image_url,
                status,
                assigned_to,
                deployment_time,
                audio_url,
                reported_for,
                created_by,
                state
            `)
            .in(
                "id",
                reportIds
            )
            .order(
                "created_at",
                {
                    ascending: false
                }
            );


    if (reportsError) {
        throw reportsError;
    }


    const reportRows =
        Array.isArray(reports)
            ? reports
            : [];


    console.log(
        `📋 ${reportRows.length} historical report(s) loaded.`
    );


    if (!reportRows.length) {

        myResponseCases = [];

        updateCounters();

        renderResponses();

        return;
    }


    /* =====================================================
       STEP 3
       LOAD NGO RESPONSE DETAILS
       ===================================================== */

    let responseDetails = [];


    const {
        data: responseData,
        error: responseError
    } =
        await supabaseClient
            .from("ngo_response_details")
            .select(`
                id,
                report_id,
                ngo_id,
                contact_person,
                contact_number,
                alternate_number,
                response_team,
                operational_notes,
                created_by,
                created_at,
                updated_at
            `)
            .eq(
                "ngo_id",
                ngoId
            )
            .in(
                "report_id",
                reportIds
            );


    if (responseError) {
        throw responseError;
    }


    responseDetails =
        Array.isArray(responseData)
            ? responseData
            : [];


    /* =====================================================
       STEP 4
       LOAD PRIVATE CITIZEN PROFILES
       =====================================================

       SECURITY RULE:

       We only request profiles for cases that are
       currently assigned to this NGO OR completed while
       this NGO retains attribution.

       RELEASED cases are intentionally excluded because
       assigned_to has been cleared and another NGO may now
       handle the case.

       The database RLS policy MUST independently enforce
       the same restriction.
       ===================================================== */

    let profiles = [];


    /*
     * Only currently-owned / completed cases may expose
     * private information.
     */
    const profileEligibleReports =
        reportRows.filter(
            report =>
                canAccessPrivateCitizenProfile(
                    report
                )
        );


    const citizenIds =
        [
            ...new Set(
                profileEligibleReports
                    .map(
                        report =>
                            Number(
                                report.reported_for
                            )
                    )
                    .filter(
                        id =>
                            Number.isFinite(id)
                    )
            )
        ];


    console.log(
        "👤 Private profile IDs eligible:",
        citizenIds
    );


    if (citizenIds.length) {

        const {
            data: profileData,
            error: profileError
        } =
            await supabaseClient
                .from("profiles")
                .select(`
                    id,
                    name,
                    age,
                    latitude,
                    longitude,
                    citizen_id,
                    email,
                    phone
                `)
                .in(
                    "citizen_id",
                    citizenIds
                );


        if (profileError) {

            /*
             * Do not silently expose an incomplete privacy
             * state. If profiles cannot be loaded, simply
             * continue without attaching profile data.
             */
            console.warn(
                "⚠️ Private profile loading failed:",
                profileError
            );

        } else {

            profiles =
                Array.isArray(profileData)
                    ? profileData
                    : [];
        }
    }


    /* =====================================================
       STEP 5
       BUILD ACTION MAP
       ===================================================== */

    const actionsByReport =
        {};


    actionRows.forEach(
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
                !actionsByReport[
                    reportId
                ]
            ) {

                actionsByReport[
                    reportId
                ] = [];
            }


            actionsByReport[
                reportId
            ].push(
                action
            );
        }
    );


    /*
     * Sort each report's actions newest first.
     */
    Object.values(
        actionsByReport
    ).forEach(
        actionList => {

            actionList.sort(
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
            );
        }
    );


    /* =====================================================
       STEP 6
       BUILD RESPONSE DETAIL MAP
       ===================================================== */

    const responseByReport =
        {};


    responseDetails.forEach(
        response => {

            const reportId =
                Number(
                    response.report_id
                );


            if (
                !Number.isFinite(
                    reportId
                )
            ) {
                return;
            }


            /*
             * Normally there should be one response detail
             * record per NGO/report combination.
             *
             * Keep the latest one if duplicates exist.
             */
            const existing =
                responseByReport[
                    reportId
                ];


            if (!existing) {

                responseByReport[
                    reportId
                ] =
                    response;

                return;
            }


            const existingTime =
                new Date(
                    existing.updated_at ||
                    existing.created_at ||
                    0
                ).getTime();


            const newTime =
                new Date(
                    response.updated_at ||
                    response.created_at ||
                    0
                ).getTime();


            if (
                newTime >=
                existingTime
            ) {

                responseByReport[
                    reportId
                ] =
                    response;
            }
        }
    );


    /* =====================================================
       STEP 7
       BUILD PROFILE MAP
       ===================================================== */

    const profileByCitizen =
        {};


    profiles.forEach(
        profile => {

            const citizenId =
                Number(
                    profile.citizen_id
                );


            if (
                !Number.isFinite(
                    citizenId
                )
            ) {
                return;
            }


            profileByCitizen[
                citizenId
            ] =
                profile;
        }
    );


    /* =====================================================
       STEP 8
       COMBINE EVERYTHING
       ===================================================== */

    myResponseCases =
        reportRows
            .map(
                report => {

                    const reportId =
                        Number(
                            report.id
                        );


                    const reportActions =
                        actionsByReport[
                            reportId
                        ] ||
                        [];


                    const response =
                        responseByReport[
                            reportId
                        ] ||
                        null;


                    const citizenProfile =
                        canAccessPrivateCitizenProfile(
                            report
                        )
                            ?
                            (
                                profileByCitizen[
                                    Number(
                                        report.reported_for
                                    )
                                ] ||
                                null
                            )
                            :
                            null;


                    const latestTake =
                        getLatestActionByName(
                            reportActions,
                            "TAKE"
                        );


                    const latestRelease =
                        getLatestActionByName(
                            reportActions,
                            "RELEASE"
                        );


                    const latestComplete =
                        getLatestActionByName(
                            reportActions,
                            "COMPLETE"
                        );


                    return {

                        ...report,

                        responseDetails:
                            response,

                        actions:
                            reportActions,

                        citizenProfile:
                            citizenProfile,

                        latestTake:
                            latestTake,

                        latestRelease:
                            latestRelease,

                        latestComplete:
                            latestComplete
                    };
                }
            )
            .filter(
                report =>
                    /*
                     * Only keep cases where this NGO has
                     * genuinely performed an action.
                     */
                    Array.isArray(
                        report.actions
                    ) &&
                    report.actions.length > 0
            );


    /*
     * Sort according to operational priority.
     */
    myResponseCases.sort(
        responseCaseSort
    );


    updateCounters();

    renderResponses();


    console.log(
        "✅ My Resource cases rendered:",
        myResponseCases.length
    );
}


/* =========================================================
   PRIVATE PROFILE ACCESS
   ========================================================= */

function canAccessPrivateCitizenProfile(
    report
) {

    if (
        !report ||
        !currentNGO
    ) {
        return false;
    }


    const status =
        normalizeStatus(
            report.status
        );


    const assignedTo =
        normalizeCode(
            report.assigned_to
        );


    const currentNGOCode =
        normalizeCode(
            currentNGO.ngo_code
        );


    /*
     * Current ownership is required.
     */
    const currentlyAssigned =
        Boolean(
            assignedTo &&
            currentNGOCode &&
            assignedTo ===
                currentNGOCode
        );


    if (!currentlyAssigned) {

        /*
         * Released cases are explicitly excluded.
         *
         * assigned_to is cleared after release.
         */
        return false;
    }


    /*
     * Do not expose profile information for an
     * explicitly released state.
     */
    if (
        status ===
        "released"
    ) {
        return false;
    }


    /*
     * Completed cases retain NGO attribution.
     */
    if (
        status ===
        "completed"
    ) {
        return true;
    }


    /*
     * In-progress cases are allowed.
     */
    if (
        status ===
        "in_progress"
    ) {
        return true;
    }


    /*
     * Open should normally not appear in My Resource,
     * but do not expose private information if it does.
     */
    return false;
}


/* =========================================================
   REPORT SORTING
   =========================================================

   PRIORITY:

   1. IN PROGRESS
   2. OPEN
   3. RELEASED
   4. COMPLETED

   Within the same status:

   1. SOS
   2. newest deployment
   3. newest report

   Completed always remains at the bottom.
   ========================================================= */

function responseCaseSort(
    a,
    b
) {

    const statusRank = {

        "in_progress":
            0,

        "open":
            1,

        "released":
            2,

        "completed":
            3
    };


    const aStatus =
        normalizeStatus(
            a.status
        );


    const bStatus =
        normalizeStatus(
            b.status
        );


    const aRank =
        statusRank[
            aStatus
        ] ??
        99;


    const bRank =
        statusRank[
            bStatus
        ] ??
        99;


    /*
     * Status first.
     */
    if (
        aRank !==
        bRank
    ) {

        return (
            aRank -
            bRank
        );
    }


    /*
     * SOS before normal reports within
     * the same status.
     */
    const aSOS =
        isSOS(a);


    const bSOS =
        isSOS(b);


    if (
        aSOS !==
        bSOS
    ) {

        return aSOS
            ? -1
            : 1;
    }


    /*
     * Newest operational time first.
     */
    const aTime =
        new Date(
            a.deployment_time ||
            a.created_at ||
            0
        ).getTime();


    const bTime =
        new Date(
            b.deployment_time ||
            b.created_at ||
            0
        ).getTime();


    return (
        bTime -
        aTime
    );
}


/* =========================================================
   ACTION HELPERS
   ========================================================= */

function getLatestActionByName(
    actions,
    actionName
) {

    if (
        !Array.isArray(
            actions
        )
    ) {
        return null;
    }


    const target =
        String(
            actionName ||
            ""
        )
            .trim()
            .toUpperCase();


    return (
        actions.find(
            action =>
                String(
                    action.action ||
                    ""
                )
                    .trim()
                    .toUpperCase() ===
                target
        ) ||
        null
    );
}


/* =========================================================
   RENDER RESPONSE LIST
   ========================================================= */

function renderResponses() {

    const container =
        document.getElementById(
            "responsesList"
        );


    if (!container) {
        return;
    }


    const filter =
        document.getElementById(
            "responseStatusFilter"
        )?.value ||
        "all";


    let filteredCases =
        myResponseCases;


    /*
     * Status filter.
     */
    if (
        filter !==
        "all"
    ) {

        filteredCases =
            myResponseCases.filter(
                report =>
                    normalizeStatus(
                        report.status
                    ) ===
                    normalizeStatus(
                        filter
                    )
            );
    }


    /*
     * Empty state.
     */
    if (
        !filteredCases.length
    ) {

        container.innerHTML = `

            <div class="empty-state">

                <i class="
                    bi
                    bi-clipboard-check
                "></i>

                <h5 class="mt-3">
                    No response cases
                </h5>

                <p>
                    ${
                        filter === "all"
                            ?
                            "Your NGO has not handled any response cases yet."
                            :
                            "No cases match the selected status."
                    }
                </p>

            </div>

        `;

        return;
    }


    container.innerHTML =
        filteredCases
            .map(
                report =>
                    renderResponseCard(
                        report
                    )
            )
            .join("");
}


/* =========================================================
   RESPONSE CARD
   ========================================================= */

function renderResponseCard(
    report
) {

    const status =
        normalizeStatus(
            report.status
        );


    const sos =
        isSOS(report);


    const reportId =
        Number(
            report.id
        );


    const category =
        report.category ||
        "Citizen Report";


    const details =
        report.details ||
        "No additional details provided.";


    const reportDate =
        formatDate(
            report.created_at
        );


    const deploymentDate =
        formatDate(
            report.deployment_time
        );


    const cardClasses = [

        "response-card",

        sos
            ? "sos-card"
            : "",

        status ===
        "completed"
            ? "completed"
            : "",

        status ===
        "in_progress"
            ? "in-process"
            : "",

        status ===
        "released"
            ? "released"
            : ""

    ]
        .filter(Boolean)
        .join(" ");


    return `

        <article
            class="${cardClasses}"
            data-report-id="${reportId}"
        >

            <!-- =========================================
                 CARD HEADER
            ========================================== -->

            <div
                class="
                    response-card-header
                "
            >

                <div>

                    <div
                        class="
                            response-card-title
                        "
                    >

                        ${
                            sos
                                ?
                                `
                                    <i
                                        class="
                                            bi
                                            bi-exclamation-octagon-fill
                                            text-danger
                                            me-2
                                        "
                                    ></i>
                                `
                                :
                                `
                                    <i
                                        class="
                                            bi
                                            bi-file-earmark-text
                                            text-primary
                                            me-2
                                        "
                                    ></i>
                                `
                        }

                        ${escapeHTML(
                            category
                        )}

                    </div>


                    <div
                        class="
                            response-card-meta
                        "
                    >

                        Report #${reportId}

                        <span class="mx-2">
                            •
                        </span>

                        Reported:
                        ${escapeHTML(
                            reportDate
                        )}

                        ${
                            report.deployment_time
                                ?
                                `
                                    <span class="mx-2">
                                        •
                                    </span>

                                    Taken:
                                    ${escapeHTML(
                                        deploymentDate
                                    )}
                                `
                                :
                                ""
                        }

                    </div>

                </div>


                ${getStatusBadge(
                    status
                )}

            </div>


            <!-- =========================================
                 REPORT DESCRIPTION
            ========================================== -->

            <div
                class="
                    response-description
                "
            >

                ${escapeHTML(
                    details
                )}

            </div>


            <!-- =========================================
                 RELEASE INFORMATION
            ========================================== -->

            ${
                status ===
                "released" &&
                report.latestRelease
                    ?
                    renderReleaseInformation(
                        report
                    )
                    :
                    ""
            }


            <!-- =========================================
                 LOCATION
            ========================================== -->

            ${
                hasCoordinates(
                    report
                )
                    ?
                    `
                        <div
                            class="
                                response-meta
                            "
                        >

                            <i
                                class="
                                    bi
                                    bi-geo-alt-fill
                                    me-1
                                "
                            ></i>

                            Location:

                            ${Number(
                                report.latitude
                            ).toFixed(5)},

                            ${Number(
                                report.longitude
                            ).toFixed(5)}

                        </div>
                    `
                    :
                    `
                        <div
                            class="
                                response-meta
                            "
                        >

                            <i
                                class="
                                    bi
                                    bi-geo-alt
                                    me-1
                                "
                            ></i>

                            Location not available

                        </div>
                    `
            }


            <!-- =========================================
                 PRIVATE CITIZEN INFORMATION
            ========================================== -->

            ${
                report.citizenProfile
                    ?
                    renderPrivateCitizenSection(
                        report
                    )
                    :
                    ""
            }


            <!-- =========================================
                 NGO RESPONSE INFORMATION
            ========================================== -->

            ${
                report.responseDetails
                    ?
                    renderResponseDetails(
                        report.responseDetails
                    )
                    :
                    ""
            }


            <!-- =========================================
                 EVIDENCE / AUDIO / LOCATION
            ========================================== -->

            <div
                class="
                    response-media
                "
            >

                ${
                    report.image_url
                        ?
                        `
                            <a
                                class="
                                    btn
                                    btn-sm
                                    btn-outline-secondary
                                "
                                href="${safeURL(
                                    report.image_url
                                )}"
                                target="_blank"
                                rel="noopener noreferrer"
                            >

                                <i
                                    class="
                                        bi
                                        bi-camera
                                        me-1
                                    "
                                ></i>

                                VIEW EVIDENCE

                            </a>
                        `
                        :
                        ""
                }


                ${
                    report.audio_url
                        ?
                        `
                            <button
                                class="
                                    btn
                                    btn-sm
                                    btn-outline-secondary
                                "
                                type="button"
                                onclick="playResponseAudio(
                                    '${safeAttribute(
                                        report.audio_url
                                    )}'
                                )"
                            >

                                <i
                                    class="
                                        bi
                                        bi-volume-up
                                        me-1
                                    "
                                ></i>

                                PLAY AUDIO

                            </button>
                        `
                        :
                        ""
                }


                ${
                    hasCoordinates(
                        report
                    )
                        ?
                        `
                            <button
                                class="
                                    btn
                                    btn-sm
                                    btn-outline-primary
                                "
                                type="button"
                                onclick="locateResponse(
                                    ${Number(
                                        report.latitude
                                    )},
                                    ${Number(
                                        report.longitude
                                    )}
                                )"
                            >

                                <i
                                    class="
                                        bi
                                        bi-geo-alt
                                        me-1
                                    "
                                ></i>

                                LOCATE

                            </button>
                        `
                        :
                        ""
                }

            </div>


            <!-- =========================================
                 OPERATION HISTORY
            ========================================== -->

            ${
                renderOperationHistory(
                    report
                )
            }


            <!-- =========================================
                 OPERATION BUTTONS
            ========================================== -->

            ${
                status ===
                "in_progress"
                    ?
                    `
                        <div
                            class="
                                response-actions
                            "
                        >

                            <button
                                class="
                                    btn
                                    btn-sm
                                    btn-success
                                "
                                type="button"
                                onclick="completeResponse(
                                    ${reportId}
                                )"
                            >

                                <i
                                    class="
                                        bi
                                        bi-check-circle
                                        me-1
                                    "
                                ></i>

                                COMPLETE

                            </button>


                            <button
                                class="
                                    btn
                                    btn-sm
                                    btn-outline-danger
                                "
                                type="button"
                                onclick="releaseResponse(
                                    ${reportId}
                                )"
                            >

                                <i
                                    class="
                                        bi
                                        bi-arrow-return-left
                                        me-1
                                    "
                                ></i>

                                RELEASE

                            </button>

                        </div>
                    `
                    :
                    ""
            }

        </article>

    `;
}


/* =========================================================
   RELEASE INFORMATION
   ========================================================= */

function renderReleaseInformation(
    report
) {

    const release =
        report.latestRelease;


    if (!release) {
        return "";
    }


    return `

        <div
            class="
                released-information
            "
        >

            <div
                class="
                    released-title
                "
            >

                <i
                    class="
                        bi
                        bi-exclamation-triangle-fill
                    "
                ></i>

                RELEASED CASE

            </div>


            <div
                class="
                    released-row
                "
            >

                <strong>
                    Your NGO released this case.
                </strong>

            </div>


            ${
                release.reason
                    ?
                    `
                        <div
                            class="
                                released-row
                            "
                        >

                            <strong>
                                Release reason:
                            </strong>

                            ${escapeHTML(
                                release.reason
                            )}

                        </div>
                    `
                    :
                    ""
            }


            <div
                class="
                    released-row
                    released-time
                "
            >

                <i
                    class="
                        bi
                        bi-clock
                    "
                ></i>

                Released:
                ${formatDate(
                    release.created_at
                )}

            </div>

        </div>

    `;
}


/* =========================================================
   PRIVATE CITIZEN INFORMATION
   ========================================================= */

function renderPrivateCitizenSection(
    report
) {

    const profile =
        report.citizenProfile;


    if (!profile) {
        return "";
    }


    return `

        <div
            class="
                citizen-private-info
            "
        >

            <div
                class="
                    citizen-private-title
                "
            >

                <i
                    class="
                        bi
                        bi-shield-lock-fill
                    "
                ></i>

                PRIVATE CITIZEN INFORMATION

                <span
                    class="
                        text-muted
                    "
                >

                    • Authorized response case

                </span>

            </div>


            <div
                class="
                    citizen-private-grid
                "
            >

                <div>

                    <small>
                        NAME
                    </small>

                    <span>
                        ${escapeHTML(
                            profile.name ||
                            "Not provided"
                        )}
                    </span>

                </div>


                <div>

                    <small>
                        AGE
                    </small>

                    <span>
                        ${escapeHTML(
                            profile.age ??
                            "Not provided"
                        )}
                    </span>

                </div>


                <div>

                    <small>
                        EMAIL
                    </small>

                    <span>
                        ${escapeHTML(
                            profile.email ||
                            "Not provided"
                        )}
                    </span>

                </div>


                <div>

                    <small>
                        PHONE
                    </small>

                    <span>
                        ${escapeHTML(
                            profile.phone ||
                            "Not provided"
                        )}
                    </span>

                </div>


                ${
                    profile.latitude !== null &&
                    profile.latitude !== undefined &&
                    profile.longitude !== null &&
                    profile.longitude !== undefined
                        ?
                        `
                            <div>

                                <small>
                                    CITIZEN LOCATION
                                </small>

                                <span>

                                    ${Number(
                                        profile.latitude
                                    ).toFixed(5)},

                                    ${Number(
                                        profile.longitude
                                    ).toFixed(5)}

                                </span>

                            </div>
                        `
                        :
                        ""
                }

            </div>

        </div>

    `;
}


/* =========================================================
   NGO RESPONSE DETAILS
   ========================================================= */

function renderResponseDetails(
    response
) {

    if (!response) {
        return "";
    }


    const rows = [];


    if (
        response.contact_person
    ) {

        rows.push(`

            <div
                class="
                    response-detail-row
                "
            >

                <i
                    class="
                        bi
                        bi-person-badge
                    "
                ></i>

                <span>

                    <strong>
                        Contact Person:
                    </strong>

                    ${escapeHTML(
                        response.contact_person
                    )}

                </span>

            </div>

        `);
    }


    if (
        response.contact_number
    ) {

        rows.push(`

            <div
                class="
                    response-detail-row
                "
            >

                <i
                    class="
                        bi
                        bi-telephone
                    "
                ></i>

                <span>

                    <strong>
                        Contact Number:
                    </strong>

                    ${escapeHTML(
                        response.contact_number
                    )}

                </span>

            </div>

        `);
    }


    if (
        response.alternate_number
    ) {

        rows.push(`

            <div
                class="
                    response-detail-row
                "
            >

                <i
                    class="
                        bi
                        bi-telephone-plus
                    "
                ></i>

                <span>

                    <strong>
                        Alternate Number:
                    </strong>

                    ${escapeHTML(
                        response.alternate_number
                    )}

                </span>

            </div>

        `);
    }


    if (
        response.response_team
    ) {

        rows.push(`

            <div
                class="
                    response-detail-row
                "
            >

                <i
                    class="
                        bi
                        bi-people
                    "
                ></i>

                <span>

                    <strong>
                        Response Team:
                    </strong>

                    ${escapeHTML(
                        response.response_team
                    )}

                </span>

            </div>

        `);
    }


    if (
        response.operational_notes
    ) {

        rows.push(`

            <div
                class="
                    response-detail-row
                "
            >

                <i
                    class="
                        bi
                        bi-journal-text
                    "
                ></i>

                <span>

                    <strong>
                        Operational Notes:
                    </strong>

                    ${escapeHTML(
                        response.operational_notes
                    )}

                </span>

            </div>

        `);
    }


    if (!rows.length) {
        return "";
    }


    return `

        <div
            class="
                response-details
            "
        >

            <div
                class="
                    response-details-title
                "
            >

                <i
                    class="
                        bi
                        bi-clipboard-check
                        me-1
                    "
                ></i>

                NGO RESPONSE DETAILS

            </div>

            ${rows.join("")}

        </div>

    `;
}


/* =========================================================
   OPERATION HISTORY
   ========================================================= */

function renderOperationHistory(
    report
) {

    if (
        !Array.isArray(
            report.actions
        ) ||
        !report.actions.length
    ) {
        return "";
    }


    const visibleActions =
        report.actions
            .slice(0, 10);


    const rows =
        visibleActions
            .map(
                action => {

                    const actionName =
                        String(
                            action.action ||
                            "ACTION"
                        )
                            .trim()
                            .toUpperCase();


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

                        <div
                            class="
                                response-history-row
                            "
                        >

                            <div>

                                <span
                                    class="
                                        badge
                                        ${badgeClass}
                                    "
                                >

                                    ${escapeHTML(
                                        actionName
                                    )}

                                </span>

                            </div>


                            <div
                                class="
                                    response-history-content
                                "
                            >

                                ${
                                    action.reason
                                        ?
                                        `
                                            <div>
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
                                                    small
                                                    text-muted
                                                    mt-1
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


                                <div
                                    class="
                                        small
                                        text-muted
                                        mt-1
                                    "
                                >

                                    ${formatDate(
                                        action.created_at
                                    )}

                                </div>

                            </div>

                        </div>

                    `;
                }
            )
            .join("");


    return `

        <div
            class="
                response-history
            "
        >

            <div
                class="
                    response-history-title
                "
            >

                <i
                    class="
                        bi
                        bi-clock-history
                        me-1
                    "
                ></i>

                RESPONSE HISTORY

            </div>


            ${rows}

        </div>

    `;
}


/* =========================================================
   COMPLETE RESPONSE
   ========================================================= */

async function completeResponse(
    reportId
) {

    if (
        !supabaseClient ||
        !currentNGO
    ) {

        alert(
            "Your NGO session is not available."
        );

        return;
    }


    const report =
        findMyResponseCase(
            reportId
        );


    if (!report) {

        alert(
            "Response case could not be found."
        );

        return;
    }


    /*
     * Only the currently assigned NGO can complete.
     */
    if (
        !isCurrentlyAssignedToCurrentNGO(
            report
        )
    ) {

        alert(
            "You can only complete a response currently assigned to your NGO."
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
            "This response is already completed."
        );

        return;
    }


    if (
        normalizeStatus(
            report.status
        ) !==
        "in_progress"
    ) {

        alert(
            "Only an in-progress response can be completed."
        );

        return;
    }


    const confirmed =
        window.confirm(
            `Mark Report #${reportId} as COMPLETED?\n\n` +
            `This will close the active response for ${currentNGO.ngo_code}.`
        );


    if (!confirmed) {
        return;
    }


    try {

        console.log(
            "Completing report:",
            reportId
        );


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
            typeof data ===
                "object" &&
            data.success ===
                false
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


        await loadMyResponses();

    } catch (error) {

        console.error(
            "❌ Complete response failed:",
            error
        );


        alert(
            "❌ Unable to complete this response.\n\n" +
            (
                error?.message ||
                "Unexpected error."
            )
        );
    }
}


/* =========================================================
   RELEASE RESPONSE
   ========================================================= */

async function releaseResponse(
    reportId
) {

    if (
        !supabaseClient ||
        !currentNGO
    ) {

        alert(
            "Your NGO session is not available."
        );

        return;
    }


    const report =
        findMyResponseCase(
            reportId
        );


    if (!report) {

        alert(
            "Response case could not be found."
        );

        return;
    }


    /*
     * Only the current owner can release.
     */
    if (
        !isCurrentlyAssignedToCurrentNGO(
            report
        )
    ) {

        alert(
            "You can only release a response currently assigned to your NGO."
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
            "A completed response cannot be released."
        );

        return;
    }


    if (
        normalizeStatus(
            report.status
        ) !==
        "in_progress"
    ) {

        alert(
            "Only an in-progress response can be released."
        );

        return;
    }


    const reason =
        window.prompt(
            "Reason for releasing this report:"
        );


    if (
        reason ===
        null
    ) {
        return;
    }


    const trimmedReason =
        reason.trim();


    if (!trimmedReason) {

        alert(
            "A release reason is required."
        );

        return;
    }


    if (
        trimmedReason.length <
        5
    ) {

        alert(
            "Please provide a more descriptive release reason."
        );

        return;
    }


    try {

        console.log(
            "Releasing report:",
            reportId
        );


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
                        trimmedReason
                }
            );


        if (error) {
            throw error;
        }


        if (
            data &&
            typeof data ===
                "object" &&
            data.success ===
                false
        ) {

            throw new Error(
                data.message ||
                "The server rejected the release."
            );
        }


        console.log(
            "✅ RELEASE successful:",
            data
        );


        alert(
            `✅ Report #${reportId} has been released.\n\n` +
            `The case is now available to another NGO.`
        );


        /*
         * IMPORTANT:
         *
         * loadMyResponses() reconstructs this NGO's
         * history from ngo_report_actions, so the released
         * case remains visible in My Resource even though
         * assigned_to is now cleared.
         */
        await loadMyResponses();

    } catch (error) {

        console.error(
            "❌ Release response failed:",
            error
        );


        alert(
            "❌ Unable to release this response.\n\n" +
            (
                error?.message ||
                "Unexpected error."
            )
        );
    }
}


/* =========================================================
   FIND MY RESPONSE CASE
   ========================================================= */

function findMyResponseCase(
    reportId
) {

    const id =
        Number(
            reportId
        );


    return (
        myResponseCases.find(
            report =>
                Number(
                    report.id
                ) ===
                id
        ) ||
        null
    );
}


/* =========================================================
   CURRENT NGO OWNERSHIP
   ========================================================= */

function isCurrentlyAssignedToCurrentNGO(
    report
) {

    if (
        !report ||
        !currentNGO
    ) {
        return false;
    }


    return (
        normalizeCode(
            report.assigned_to
        ) ===
        normalizeCode(
            currentNGO.ngo_code
        )
    );
}


/* =========================================================
   LOCATE REPORT
   ========================================================= */

function locateResponse(
    latitude,
    longitude
) {

    const lat =
        Number(
            latitude
        );


    const lng =
        Number(
            longitude
        );


    if (
        !Number.isFinite(
            lat
        ) ||
        !Number.isFinite(
            lng
        )
    ) {

        alert(
            "Location is not available for this report."
        );

        return;
    }


    const mapsURL =
        "https://www.google.com/maps/search/" +
        "?api=1" +
        `&query=${lat},${lng}`;


    window.open(
        mapsURL,
        "_blank",
        "noopener,noreferrer"
    );
}


/* =========================================================
   PLAY REPORT AUDIO
   ========================================================= */

function playResponseAudio(
    audioURL
) {

    if (!audioURL) {

        alert(
            "Audio is not available."
        );

        return;
    }


    const audio =
        new Audio(
            audioURL
        );


    audio.play()
        .catch(
            error => {

                console.error(
                    "Audio playback failed:",
                    error
                );


                alert(
                    "Unable to play the report audio."
                );
            }
        );
}


/* =========================================================
   EVENT BINDING
   ========================================================= */

function bindResponseEvents() {

    /*
     * Refresh.
     */
    const refreshButton =
        document.getElementById(
            "refreshResponsesBtn"
        );


    if (refreshButton) {

        refreshButton.addEventListener(
            "click",
            async () => {

                refreshButton.disabled =
                    true;


                const originalHTML =
                    refreshButton.innerHTML;


                refreshButton.innerHTML = `

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

                    await loadMyResponses();

                } catch (error) {

                    console.error(
                        "Refresh failed:",
                        error
                    );


                    showPageError(
                        error?.message ||
                        "Unable to refresh responses."
                    );

                } finally {

                    refreshButton.disabled =
                        false;

                    refreshButton.innerHTML =
                        originalHTML;
                }
            }
        );
    }


    /*
     * Status filter.
     */
    const statusFilter =
        document.getElementById(
            "responseStatusFilter"
        );


    if (statusFilter) {

        statusFilter.addEventListener(
            "change",
            renderResponses
        );
    }
}


/* =========================================================
   LOGOUT
   ========================================================= */

function bindLogout() {

    const logoutButton =
        document.getElementById(
            "ngoLogoutBtn"
        );


    if (!logoutButton) {
        return;
    }


    logoutButton.addEventListener(
        "click",
        async () => {

            logoutButton.disabled =
                true;


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
    );
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


    try {

        await supabaseClient
            .auth
            .signOut();

    } catch (error) {

        console.warn(
            "Supabase sign out failed:",
            error
        );
    }
}


/* =========================================================
   REDIRECT
   ========================================================= */

function redirectToLogin() {

    window.location.href =
        "../index.html";
}


/* =========================================================
   STATISTICS
   ========================================================= */

function updateCounters() {

    /*
     * Active responses.
     */
    const activeCount =
        myResponseCases.filter(
            report =>
                normalizeStatus(
                    report.status
                ) ===
                "in_progress"
        ).length;


    /*
     * SOS responses.
     */
    const sosCount =
        myResponseCases.filter(
            report =>
                isSOS(report)
        ).length;


    /*
     * Completed.
     */
    const completedCount =
        myResponseCases.filter(
            report =>
                normalizeStatus(
                    report.status
                ) ===
                "completed"
        ).length;


    /*
     * Released.
     */
    const releasedCount =
        myResponseCases.filter(
            report =>
                normalizeStatus(
                    report.status
                ) ===
                "released"
        ).length;


    setText(
        "activeResponseCount",
        activeCount
    );


    setText(
        "sosResponseCount",
        sosCount
    );


    setText(
        "completedResponseCount",
        completedCount
    );


    /*
     * Support additional released counter if
     * the HTML contains it.
     */
    setText(
        "releasedResponseCount",
        releasedCount
    );


    /*
     * Support dashboard-style stat IDs too.
     */
    setText(
        "stat-process",
        activeCount
    );


    setText(
        "stat-complete",
        completedCount
    );


    setText(
        "stat-released",
        releasedCount
    );
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


    /*
     * Normalize all known variants of IN PROCESS.
     */
    if (
        value ===
            "inprocess" ||
        value ===
            "in_process" ||
        value ===
            "processing" ||
        value ===
            "taken" ||
        value ===
            "in_progress"
    ) {

        return "in_progress";
    }


    if (
        value ===
            "complete" ||
        value ===
            "closed" ||
        value ===
            "completed"
    ) {

        return "completed";
    }


    if (
        value ===
            "release" ||
        value ===
            "released"
    ) {

        return "released";
    }


    if (
        value ===
            "open"
    ) {

        return "open";
    }


    return value;
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
   STATUS BADGE
   ========================================================= */

function getStatusBadge(
    status
) {

    switch (
        normalizeStatus(
            status
        )
    ) {

        case "in_progress":

            return `

                <span
                    class="
                        status-badge
                        status-progress
                    "
                >

                    IN PROGRESS

                </span>

            `;


        case "completed":

            return `

                <span
                    class="
                        status-badge
                        status-completed
                    "
                >

                    COMPLETED

                </span>

            `;


        case "released":

            return `

                <span
                    class="
                        status-badge
                        status-released
                    "
                >

                    RELEASED

                </span>

            `;


        case "open":

            return `

                <span
                    class="
                        status-badge
                        status-progress
                    "
                >

                    OPEN

                </span>

            `;


        default:

            return `

                <span
                    class="
                        status-badge
                    "
                >

                    ${escapeHTML(
                        String(
                            status ||
                            "UNKNOWN"
                        )
                            .replace(
                                /_/g,
                                " "
                            )
                            .toUpperCase()
                    )}

                </span>

            `;
    }
}


/* =========================================================
   COORDINATE CHECK
   ========================================================= */

function hasCoordinates(
    report
) {

    if (!report) {
        return false;
    }


    const lat =
        Number(
            report.latitude
        );


    const lng =
        Number(
            report.longitude
        );


    return (
        Number.isFinite(
            lat
        ) &&
        Number.isFinite(
            lng
        )
    );
}


/* =========================================================
   NGO CODE NORMALIZATION
   ========================================================= */

function normalizeCode(
    value
) {

    return String(
        value ||
        ""
    )
        .trim()
        .toLowerCase();
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
   LOADING STATE
   ========================================================= */

function showLoading() {

    const container =
        document.getElementById(
            "responsesList"
        );


    if (!container) {
        return;
    }


    container.innerHTML = `

        <div
            class="
                loading-state
            "
        >

            <div
                class="
                    spinner-border
                    text-primary
                    mb-3
                "
            ></div>

            <p>
                Loading your response cases...
            </p>

        </div>

    `;
}


/* =========================================================
   ERROR STATE
   ========================================================= */

function showPageError(
    message
) {

    const container =
        document.getElementById(
            "responsesList"
        );


    if (!container) {
        return;
    }


    container.innerHTML = `

        <div
            class="
                empty-state
            "
        >

            <i
                class="
                    bi
                    bi-exclamation-triangle
                    text-danger
                "
            ></i>


            <h5
                class="
                    mt-3
                "
            >

                Unable to load responses

            </h5>


            <p>

                ${escapeHTML(
                    message
                )}

            </p>


            <button
                class="
                    btn
                    btn-outline-primary
                    mt-2
                "
                type="button"
                onclick="retryMyResponses()"
            >

                <i
                    class="
                        bi
                        bi-arrow-clockwise
                        me-1
                    "
                ></i>

                Try Again

            </button>

        </div>

    `;
}


/* =========================================================
   RETRY
   ========================================================= */

async function retryMyResponses() {

    try {

        const authenticated =
            await verifySession();


        if (!authenticated) {
            return;
        }


        /*
         * Reload NGO information as well.
         */
        await loadCurrentNGO();


        await loadMyResponses();

    } catch (error) {

        console.error(
            "❌ Retry failed:",
            error
        );


        showPageError(
            error?.message ||
            "Unable to load responses."
        );
    }
}


/* =========================================================
   SAFE TEXT HELPER
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
   SAFE ATTRIBUTE
   ========================================================= */

function safeAttribute(
    value
) {

    return String(
        value ||
        ""
    )
        .replace(
            /\\/g,
            "\\\\"
        )
        .replace(
            /'/g,
            "\\'"
        )
        .replace(
            /\r?\n/g,
            " "
        );
}


/* =========================================================
   SAFE URL
   ========================================================= */

function safeURL(
    value
) {

    const url =
        String(
            value ||
            ""
        )
            .trim();


    /*
     * Only allow HTTP/HTTPS URLs.
     */
    if (
        /^https?:\/\//i.test(
            url
        )
    ) {

        return escapeHTML(
            url
        );
    }


    return "#";
}


/* =========================================================
   GLOBAL FUNCTIONS
   ========================================================= */

window.retryMyResponses =
    retryMyResponses;


window.locateResponse =
    locateResponse;


window.playResponseAudio =
    playResponseAudio;


window.completeResponse =
    completeResponse;


window.releaseResponse =
    releaseResponse;


window.renderResponses =
    renderResponses;


window.loadMyResponses =
    loadMyResponses;