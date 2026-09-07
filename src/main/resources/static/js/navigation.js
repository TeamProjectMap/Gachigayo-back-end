(function ($) {
    var REALTIME_FALLBACK = "실시간 도착정보를 확인할 수 없어요";
    var GPS_ACCURACY_LIMIT_METERS = 80;
    var STEP_TRANSITION_MAX_ACCURACY_METERS = 50;
    var STEP_COMPLETE_CONFIRMATIONS = 2;
    var MAX_PATH_DEVIATION_FOR_STEP_COMPLETE_METERS = 70;
    var MIN_PATH_PROGRESS_FOR_STEP_COMPLETE = 0.75;
    var STEP_COMPLETE_DISTANCE_METERS = {
        WALKING: 25,
        BUS: 50,
        SUBWAY: 50
    };
    var DISTANCE_JITTER_METERS = 8;
    var NAV_DEFAULT_LEVEL = 4;
    var NAV_MAX_OVERVIEW_LEVEL = 5;
    var NAV_BOUNDS_PADDING = {
        top: 54,
        right: 48,
        bottom: 150,
        left: 48
    };
    var NAVIGATION_PROGRESS_KEY = "navigationProgress";
    var AUTO_TRANSITION_FALLBACK_DELAY_MS = 20000;

    var selectedRoute = null;
    var steps = [];
    var currentStepIndex = 0;
    var currentPosition = null;
    var watchId = null;
    var realtimeRequestToken = 0;
    var realtimeCountdownTimer = null;
    var currentSpeechText = "";
    var currentWalkingDistanceText = "";
    var walkingWatchContext = null;
    var navigationMap = null;
    var currentMarker = null;
    var originMarker = null;
    var destinationMarker = null;
    var navigationTargetMarker = null;
    var completedPathPolyline = null;
    var remainingPathPolyline = null;
    var currentPathProgressIndex = null;
    var currentPathProgressStepIndex = null;
    var latestPathProgressMatch = null;
    var latestCurrentLatLng = null;
    var isMapInitializationAttempted = false;
    var isMapReady = false;
    var hasFocusedInitialNavigationArea = false;
    var focusedStepIndex = null;
    var isFollowingCurrentLocation = true;
    var mapRelayoutFrame = null;
    var mapRelayoutTimer = null;
    var stepCompletionCandidate = null;
    var lastAutoTransitionUnavailableLogKey = "";
    var isTransitioningStep = false;
    var PATH_PROGRESS_BACKTRACK_JITTER_INDEX = 2;
    var autoTransitionFallbackTimer = null;
    var autoTransitionFallbackReason = "";
    var autoTransitionFallbackStepIndex = null;
    var isAutoTransitionFallbackVisible = false;
    var mapDragStartHandler = null;

    $(function () {
        $("#backButton, #compareButton").on("click", function () {
            cleanupNavigationWatchers();
            window.location.href = "/route-compare.html";
        });

        $("#helpButton").on("click", function () {
            alert("도움 요청 기능은 준비 중입니다.");
        });

        $("#replayButton").on("click", function () {
            replayCurrentGuide();
        });

        $("#navigationMap").on("click", "#myLocationButton", function () {
            panMapToCurrentLocation();
        });

        $("#guideCard").on("click", "#nextStepFallbackButton", function () {
            manuallyMoveToNextStep();
        });

        $(window).on("pagehide.navigation beforeunload.navigation", cleanupNavigationResources);

        checkSession();
    });

    function checkSession() {
        $.ajax({
            url: "/user/session",
            type: "get",
            dataType: "JSON",
            success: function (json) {
                if (!json.success) {
                    window.location.replace("/login.html");
                    return;
                }

                if (json.userRole !== "USER") {
                    window.location.replace("/guardian-home.html");
                    return;
                }

                loadSelectedRoute();
            },
            error: function () {
                window.location.replace("/login.html");
            }
        });
    }

    function loadSelectedRoute() {
        selectedRoute = readJson("selectedRoute");

        if (!isNavigationRoute(selectedRoute)) {
            showEmptyState();
            return;
        }

        steps = selectedRoute.route.steps.filter(function (step) {
            return !!step;
        });
        currentStepIndex = restoreNavigationProgress();
        resetStepCompletionCandidate();
        resetAutoTransitionUnavailableLog();
        resetCurrentPathProgressState();
        isFollowingCurrentLocation = true;
        updateFollowButtonState();
        $("#originName").text(getOriginName(selectedRoute.origin));
        $("#destinationName").text(getDestinationName(selectedRoute.destination));
        $("#routeSummaryCard, #navigationMap, #guideCard").removeClass("hidden");
        $("#emptyPanel").addClass("hidden");
        $("#navigationPage").removeClass("hidden");

        initializeNavigationMap();
        ensurePositionWatch();
        renderCurrentStep();
    }

    function showEmptyState() {
        cleanupNavigationResources();
        selectedRoute = null;
        steps = [];
        currentStepIndex = 0;
        resetStepCompletionCandidate();
        resetAutoTransitionUnavailableLog();
        currentSpeechText = "";
        isFollowingCurrentLocation = true;
        updateFollowButtonState();

        $("#routeSummaryCard, #guideCard").addClass("hidden");
        $("#navigationMap").removeClass("hidden");
        $("#emptyPanel").removeClass("hidden");
        $("#progressFill").css("width", "0%");
        $("#navigationPage").removeClass("hidden");
        renderMapFallback("지도를 표시할 수 없습니다.");
    }

    function renderCurrentStep() {
        stopRealtimeCountdown();
        realtimeRequestToken++;
        updateProgress();
        hideAutoTransitionFallback();

        if (!steps.length) {
            walkingWatchContext = null;
            updateCurrentStepMap();
            clearNavigationProgress();
            renderNoStep();
            return;
        }

        if (currentStepIndex >= steps.length) {
            walkingWatchContext = null;
            persistNavigationProgress(true);
            stopRealtimeCountdown();
            resetStepCompletionCandidate();
            resetAutoTransitionUnavailableLog();
            stopAutoTransitionFallbackTimer();
            updateCurrentStepMap();
            renderArrival();
            return;
        }

        var step = steps[currentStepIndex];
        var mode = normalizeStepMode(step);
        scheduleAutoTransitionFallbackIfNeeded(step);

        $("#transportVisual")
                .removeClass("walking bus subway arrival")
                .addClass(mode.toLowerCase());
        $("#transportText").text(getTransportVisualText(mode, getVehicles(step)));
        updateCurrentStepMap();

        if (mode === "BUS") {
            walkingWatchContext = null;
            renderBusStep(step, currentStepIndex);
            return;
        }

        if (mode === "SUBWAY") {
            walkingWatchContext = null;
            renderSubwayStep(step, currentStepIndex);
            return;
        }

        renderWalkingStep(step, currentStepIndex);
    }

    function renderBusStep(step, stepIndex) {
        var target = getBusRealtimeTarget(step);
        var vehicleName = getPrimaryVehicleName(getVehicles(step));
        var stopText = formatStops(getStops(step));
        var initialRealtimeText = target ? "실시간 도착정보를 확인 중이에요" : REALTIME_FALLBACK;

        $("#guideTitle").text((vehicleName || "버스") + " 버스를 타요");
        renderGuideLines([stopText, initialRealtimeText], initialRealtimeText);
        updateSpeechText(buildBusSpeechText(step, initialRealtimeText));

        if (!target) {
            scheduleAutoTransitionFallback("no_target");
            return;
        }

        requestBusRealtime(target, stepIndex);
    }

    function renderSubwayStep(step, stepIndex) {
        var target = getSubwayRealtimeTarget(step);
        var vehicleName = getPrimaryVehicleName(getVehicles(step));
        var stopText = formatStops(getStops(step));
        var initialRealtimeText = target ? "실시간 도착정보를 확인 중이에요" : REALTIME_FALLBACK;

        $("#guideTitle").text(vehicleName ? vehicleName + " 지하철을 타요" : "지하철을 타요");
        renderGuideLines([stopText, initialRealtimeText], initialRealtimeText);
        updateSpeechText(buildSubwaySpeechText(step, initialRealtimeText));

        if (!target) {
            scheduleAutoTransitionFallback("no_target");
            return;
        }

        requestSubwayRealtime(target, stepIndex);
    }

    function renderWalkingStep(step, stepIndex) {
        var guidance = $.trim(String(step && step.guidance || "")) || "걸어서 이동해요";
        var fallbackText = getWalkingFallbackText(step);

        currentWalkingDistanceText = fallbackText;
        $("#guideTitle").text(guidance);
        renderGuideLines([fallbackText], fallbackText);
        updateSpeechText(buildWalkingSpeechText(guidance, fallbackText));
        startWalkingWatch(step, stepIndex);
    }

    function renderNoStep() {
        $("#transportVisual")
                .removeClass("walking bus subway arrival")
                .addClass("walking");
        $("#transportText").text("-");
        $("#guideTitle").text("안내 정보가 없습니다.");
        $("#guideSubtitle").text("경로를 다시 선택해주세요.");
        currentSpeechText = "";
    }

    function renderArrival() {
        $("#transportVisual")
                .removeClass("walking bus subway")
                .addClass("arrival");
        $("#transportText").text("도착");
        $("#guideTitle").text("목적지에 도착했어요");
        $("#guideSubtitle").text("길안내가 완료되었습니다.");
        $("#progressFill").css("width", "100%");
        updateSpeechText("목적지에 도착했어요. 길안내가 완료되었습니다.");
    }

    function requestBusRealtime(target, stepIndex) {
        var token = ++realtimeRequestToken;

        $.ajax({
            url: "/bus/realtime",
            method: "GET",
            dataType: "JSON",
            data: {
                stopName: target.stopName,
                routeName: target.routeName,
                nextStopName: target.nextStopName,
                directionHint: target.directionHint
            }
        }).done(function (json) {
            if (!isCurrentStepResponse(stepIndex, token, "BUS")) {
                return;
            }

            var arrival = getPrimaryBusArrival(json);
            var message = formatBusArrivalMessage(arrival);

            if (!json || !json.success || !json.available || json.status !== "OK" || !message) {
                updateRealtimeLineForStep(stepIndex, "BUS", REALTIME_FALLBACK);
                return;
            }

            updateRealtimeLineForStep(stepIndex, "BUS", message);
            startRealtimeCountdown(arrival.seconds, stepIndex, "BUS", function (seconds) {
                return formatArrivalSeconds(seconds, " 후 도착");
            });
        }).fail(function () {
            if (isCurrentStepResponse(stepIndex, token, "BUS")) {
                updateRealtimeLineForStep(stepIndex, "BUS", REALTIME_FALLBACK);
            }
        });
    }

    function requestSubwayRealtime(target, stepIndex) {
        var token = ++realtimeRequestToken;

        $.ajax({
            url: "/subway/realtime",
            method: "GET",
            dataType: "JSON",
            data: {
                stationName: target.stationName,
                lineName: target.lineName
            }
        }).done(function (json) {
            if (!isCurrentStepResponse(stepIndex, token, "SUBWAY")) {
                return;
            }

            if (!json || !json.success || !json.available || json.status !== "OK" || !Array.isArray(json.arrivals)) {
                updateRealtimeLineForStep(stepIndex, "SUBWAY", REALTIME_FALLBACK);
                return;
            }

            var matchedArrivals = findDirectionMatchedSubwayArrivals(json.arrivals, target);
            var arrival = matchedArrivals[0] || null;
            var message = formatSubwayArrivalMessage(arrival);

            if (!message) {
                updateRealtimeLineForStep(stepIndex, "SUBWAY", REALTIME_FALLBACK);
                return;
            }

            updateRealtimeLineForStep(stepIndex, "SUBWAY", message);
            startRealtimeCountdown(arrival.arrivalSeconds, stepIndex, "SUBWAY", function (seconds) {
                return formatArrivalSeconds(seconds, " 후 도착");
            });
        }).fail(function () {
            if (isCurrentStepResponse(stepIndex, token, "SUBWAY")) {
                updateRealtimeLineForStep(stepIndex, "SUBWAY", REALTIME_FALLBACK);
            }
        });
    }

    function updateRealtimeLineForStep(stepIndex, mode, realtimeText) {
        if (currentStepIndex !== stepIndex || normalizeStepMode(steps[stepIndex]) !== mode) {
            return;
        }

        var step = steps[stepIndex];
        var stopText = formatStops(getStops(step));

        renderGuideLines([stopText, realtimeText], realtimeText);

        if (mode === "BUS") {
            updateSpeechText(buildBusSpeechText(step, realtimeText));
        } else {
            updateSpeechText(buildSubwaySpeechText(step, realtimeText));
        }
    }

    function startRealtimeCountdown(seconds, stepIndex, mode, formatter) {
        var remaining = Number(seconds);

        stopRealtimeCountdown();

        if (!Number.isFinite(remaining) || remaining < 0) {
            return;
        }

        realtimeCountdownTimer = window.setInterval(function () {
            remaining = Math.max(remaining - 1, 0);

            if (currentStepIndex !== stepIndex || normalizeStepMode(steps[stepIndex]) !== mode) {
                stopRealtimeCountdown();
                return;
            }

            updateRealtimeLineForStep(stepIndex, mode, formatter(remaining));
        }, 1000);
    }

    function stopRealtimeCountdown() {
        if (realtimeCountdownTimer !== null) {
            window.clearInterval(realtimeCountdownTimer);
            realtimeCountdownTimer = null;
        }
    }

    function startWalkingWatch(step, stepIndex) {
        var target = getWalkingTargetCoordinate(step);

        walkingWatchContext = null;

        if (!target) {
            scheduleAutoTransitionFallback("no_target");
            return;
        }

        if (!navigator.geolocation) {
            scheduleAutoTransitionFallback("gps_unavailable");
            applyWalkingFallback(step, stepIndex, "현재 위치를 확인할 수 없어요");
            return;
        }

        walkingWatchContext = {
            target: target,
            step: step,
            stepIndex: stepIndex
        };
        ensurePositionWatch();
    }

    function ensurePositionWatch() {
        if (watchId !== null || !navigator.geolocation) {
            return;
        }

        watchId = navigator.geolocation.watchPosition(
                function (position) {
                    handleNavigationPosition(position);
                },
                function () {
                    if (walkingWatchContext) {
                        applyWalkingFallback(
                                walkingWatchContext.step,
                                walkingWatchContext.stepIndex,
                                getWalkingFallbackText(walkingWatchContext.step)
                        );
                    }
                    scheduleAutoTransitionFallback("gps_error");
                },
                {
                    enableHighAccuracy: true,
                    timeout: 15000,
                    maximumAge: 0
                }
        );
    }

    function stopWalkingWatch() {
        if (watchId !== null && navigator.geolocation) {
            navigator.geolocation.clearWatch(watchId);
        }

        watchId = null;
        walkingWatchContext = null;
    }

    function handleNavigationPosition(position) {
        if (!position || !position.coords) {
            return;
        }

        var accuracy = Number(position.coords.accuracy);
        currentPosition = {
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
            accuracy: position.coords.accuracy,
            capturedAt: Date.now()
        };

        if (Number.isFinite(accuracy) && accuracy > GPS_ACCURACY_LIMIT_METERS) {
            if (walkingWatchContext) {
                applyWalkingFallback(walkingWatchContext.step, walkingWatchContext.stepIndex, "현재 정확한 위치를 확인 중이에요");
            }
            scheduleAutoTransitionFallback("gps_accuracy");
            resetStepCompletionCandidate();
            return;
        }

        scheduleAutoTransitionFallbackIfNeeded(getCurrentStep());
        updateCurrentLocationMarker(currentPosition);
        updateWalkingDistanceFromCurrentPosition();
        updateCurrentStepPathProgress(currentPosition);
        evaluateCurrentStepProgress(currentPosition);
    }

    function updateWalkingDistanceFromCurrentPosition() {
        if (!walkingWatchContext) {
            return;
        }

        var target = walkingWatchContext.target;
        var stepIndex = walkingWatchContext.stepIndex;

        if (currentStepIndex !== stepIndex || normalizeStepMode(steps[stepIndex]) !== "WALKING") {
            return;
        }

        var distance = calculateDistanceMeters(
                currentPosition.latitude,
                currentPosition.longitude,
                target.latitude,
                target.longitude
        );
        var nextText = "약 " + formatDistance(distance) + " 남았어요";
        var previousDistance = parseDisplayDistanceMeters(currentWalkingDistanceText);

        if (Number.isFinite(previousDistance)
                && Math.abs(previousDistance - distance) < DISTANCE_JITTER_METERS) {
            return;
        }

        currentWalkingDistanceText = nextText;
        renderGuideLines([nextText], nextText);
        updateSpeechText(buildWalkingSpeechText($("#guideTitle").text(), nextText));
    }

    function applyWalkingFallback(step, stepIndex, text) {
        if (currentStepIndex !== stepIndex || normalizeStepMode(steps[stepIndex]) !== "WALKING") {
            return;
        }

        currentWalkingDistanceText = text || getWalkingFallbackText(step);
        renderGuideLines([currentWalkingDistanceText], currentWalkingDistanceText);
        updateSpeechText(buildWalkingSpeechText($("#guideTitle").text(), currentWalkingDistanceText));
    }

    function evaluateCurrentStepProgress(position) {
        var accuracy = Number(position && position.accuracy);
        var coordinate = getValidCoordinate(position);

        if (isTransitioningStep || !coordinate || currentStepIndex >= steps.length) {
            return;
        }

        if (!Number.isFinite(accuracy) || accuracy > STEP_TRANSITION_MAX_ACCURACY_METERS) {
            scheduleAutoTransitionFallback("gps_accuracy");
            resetStepCompletionCandidate();
            return;
        }

        var step = getCurrentStep();
        var result = shouldCompleteCurrentStep(step, position);

        if (!result.available) {
            resetStepCompletionCandidate();
            if (result.reason === "no-target") {
                logAutoTransitionUnavailable(result.reason);
            }
            scheduleAutoTransitionFallback(normalizeFallbackReason(result.reason));
            return;
        }

        hideAutoTransitionFallback();

        if (!result.complete) {
            resetStepCompletionCandidate();
            return;
        }

        stepCompletionCandidate = stepCompletionCandidate || {
            stepIndex: currentStepIndex,
            count: 0
        };

        if (stepCompletionCandidate.stepIndex !== currentStepIndex) {
            stepCompletionCandidate = {
                stepIndex: currentStepIndex,
                count: 0
            };
        }

        stepCompletionCandidate.count += 1;
        if (stepCompletionCandidate.count >= STEP_COMPLETE_CONFIRMATIONS) {
            completeCurrentStep();
        }
    }

    function shouldCompleteCurrentStep(step, position) {
        var mode = normalizeStepMode(step);
        var target = getCurrentNavigationTarget(step);
        var pathPoints = getCurrentStepPathPoints(step);
        var threshold = STEP_COMPLETE_DISTANCE_METERS[mode] || STEP_COMPLETE_DISTANCE_METERS.WALKING;

        if (!target) {
            return {
                available: false,
                reason: "no-target"
            };
        }

        if ((mode === "BUS" || mode === "SUBWAY") && pathPoints.length < 2) {
            return {
                available: false,
                reason: "transit-path-required"
            };
        }

        var distanceToTarget = calculateDistanceMeters(
                position.latitude,
                position.longitude,
                target.latitude,
                target.longitude
        );
        var pathProgress = null;
        var distanceToPath = null;

        if (pathPoints.length >= 2) {
            var pathMatch = getStepPathProgressMatch(position, pathPoints);
            pathProgress = pathMatch.progress;
            distanceToPath = pathMatch.distance;

            if (distanceToPath > MAX_PATH_DEVIATION_FOR_STEP_COMPLETE_METERS
                    || pathProgress < MIN_PATH_PROGRESS_FOR_STEP_COMPLETE) {
                return {
                    available: true,
                    complete: false,
                    distanceToTarget: distanceToTarget,
                    distanceToPath: distanceToPath,
                    pathProgress: pathProgress
                };
            }
        }

        return {
            available: true,
            complete: distanceToTarget <= threshold,
            distanceToTarget: distanceToTarget,
            distanceToPath: distanceToPath,
            pathProgress: pathProgress
        };
    }

    function completeCurrentStep() {
        if (isTransitioningStep || currentStepIndex >= steps.length) {
            return;
        }

        isTransitioningStep = true;

        try {
            moveToNextStep();
        } finally {
            isTransitioningStep = false;
        }
    }

    function moveToNextStep() {
        currentStepIndex = Math.min(currentStepIndex + 1, steps.length);
        persistNavigationProgress(currentStepIndex >= steps.length);
        resetStepCompletionCandidate();
        resetAutoTransitionUnavailableLog();
        resetCurrentPathProgressState();
        hideAutoTransitionFallback();
        renderCurrentStep();
    }

    function manuallyMoveToNextStep() {
        if (isTransitioningStep || currentStepIndex >= steps.length) {
            return;
        }

        isTransitioningStep = true;

        try {
            moveToNextStep();
        } finally {
            isTransitioningStep = false;
        }
    }

    function resetStepCompletionCandidate() {
        stepCompletionCandidate = null;
    }

    function resetAutoTransitionUnavailableLog() {
        lastAutoTransitionUnavailableLogKey = "";
    }

    function logAutoTransitionUnavailable(reason) {
        var key = currentStepIndex + "|" + reason;

        if (lastAutoTransitionUnavailableLogKey === key) {
            return;
        }

        lastAutoTransitionUnavailableLogKey = key;
    }

    function getNearestPathProgress(position, pathPoints) {
        var nearestDistance = Number.POSITIVE_INFINITY;
        var nearestIndex = 0;

        pathPoints.forEach(function (point, index) {
            var distance = calculateDistanceMeters(
                    position.latitude,
                    position.longitude,
                    point.latitude,
                    point.longitude
            );

            if (distance < nearestDistance) {
                nearestDistance = distance;
                nearestIndex = index;
            }
        });

        return {
            distance: nearestDistance,
            nearestIndex: nearestIndex,
            progress: pathPoints.length > 1 ? nearestIndex / (pathPoints.length - 1) : 0
        };
    }

    function getStepPathProgressMatch(position, pathPoints) {
        var coordinate = getValidCoordinate(position);
        var capturedAt = Number(position && position.capturedAt);

        if (!coordinate || pathPoints.length < 2) {
            return {
                distance: Number.POSITIVE_INFINITY,
                nearestIndex: null,
                progress: 0
            };
        }

        if (latestPathProgressMatch
                && latestPathProgressMatch.stepIndex === currentStepIndex
                && latestPathProgressMatch.capturedAt === capturedAt
                && latestPathProgressMatch.pointCount === pathPoints.length) {
            return latestPathProgressMatch.result;
        }

        latestPathProgressMatch = {
            stepIndex: currentStepIndex,
            capturedAt: capturedAt,
            pointCount: pathPoints.length,
            result: getNearestPathProgress(coordinate, pathPoints)
        };

        return latestPathProgressMatch.result;
    }

    function cleanupNavigationWatchers() {
        cleanupNavigationResources();
    }

    function cleanupNavigationResources() {
        stopWalkingWatch();
        stopRealtimeCountdown();
        realtimeRequestToken++;
        stopAutoTransitionFallbackTimer();
        hideAutoTransitionFallback();
        cleanupMapResizeHandling();
        cleanupMapListeners();
        resetStepCompletionCandidate();
        resetAutoTransitionUnavailableLog();
        resetCurrentPathProgressState();

        if ("speechSynthesis" in window) {
            window.speechSynthesis.cancel();
        }

    }

    function restoreNavigationProgress() {
        var progress = readJson(NAVIGATION_PROGRESS_KEY);
        var routeKey = getSelectedRouteProgressKey();
        var stepIndex = Number(progress && progress.currentStepIndex);
        var isCompleted = progress && progress.completed === true;

        if (!progress || !routeKey || progress.routeKey !== routeKey) {
            persistNavigationProgress(false);
            return 0;
        }

        if (isCompleted && stepIndex === steps.length) {
            return steps.length;
        }

        if (!Number.isFinite(stepIndex) || Math.floor(stepIndex) !== stepIndex || stepIndex < 0 || stepIndex >= steps.length) {
            persistNavigationProgress(false);
            return 0;
        }

        return stepIndex;
    }

    function persistNavigationProgress(completed) {
        var routeKey = getSelectedRouteProgressKey();

        if (!routeKey) {
            clearNavigationProgress();
            return;
        }

        try {
            sessionStorage.setItem(NAVIGATION_PROGRESS_KEY, JSON.stringify({
                routeKey: routeKey,
                selectedRouteId: routeKey,
                currentStepIndex: Math.max(0, Math.min(currentStepIndex, steps.length)),
                completed: completed === true,
                updatedAt: Date.now()
            }));
        } catch (e) {
            console.warn("[NAV STATE] progress save failed");
        }
    }

    function clearNavigationProgress() {
        try {
            sessionStorage.removeItem(NAVIGATION_PROGRESS_KEY);
        } catch (e) {
            console.warn("[NAV STATE] progress clear failed");
        }
    }

    function getSelectedRouteProgressKey() {
        if (!selectedRoute) {
            return "";
        }

        if (selectedRoute.selectedAt != null) {
            return "selectedAt:" + String(selectedRoute.selectedAt);
        }

        return [
            selectedRoute.type || selectedRoute.mode || "",
            getDestinationName(selectedRoute.destination),
            selectedRoute.destination && selectedRoute.destination.latitude,
            selectedRoute.destination && selectedRoute.destination.longitude,
            selectedRoute.route && selectedRoute.route.totalTime,
            steps.length
        ].join("|");
    }

    function scheduleAutoTransitionFallbackIfNeeded(step) {
        var reason = getAutoTransitionFallbackReason(step);

        if (reason) {
            scheduleAutoTransitionFallback(reason);
            return;
        }

        hideAutoTransitionFallback();
    }

    function getAutoTransitionFallbackReason(step) {
        var mode;
        var accuracy;

        if (!steps.length || currentStepIndex >= steps.length) {
            return "";
        }

        if (!navigator.geolocation) {
            return "gps_unavailable";
        }

        if (!step || !getCurrentNavigationTarget(step)) {
            return "no_target";
        }

        mode = normalizeStepMode(step);
        if ((mode === "BUS" || mode === "SUBWAY") && getCurrentStepPathPoints(step).length < 2) {
            return mode === "SUBWAY" ? "subway_gps_unavailable" : "path_unavailable";
        }

        if (!currentPosition) {
            return "gps_waiting";
        }

        accuracy = Number(currentPosition.accuracy);
        if (!Number.isFinite(accuracy) || accuracy > STEP_TRANSITION_MAX_ACCURACY_METERS) {
            return "gps_accuracy";
        }

        return "";
    }

    function scheduleAutoTransitionFallback(reason) {
        reason = normalizeFallbackReason(reason);

        if (!reason || currentStepIndex >= steps.length) {
            hideAutoTransitionFallback();
            return;
        }

        if (isAutoTransitionFallbackVisible
                && autoTransitionFallbackReason === reason
                && autoTransitionFallbackStepIndex === currentStepIndex) {
            return;
        }

        if (autoTransitionFallbackTimer !== null
                && autoTransitionFallbackReason === reason
                && autoTransitionFallbackStepIndex === currentStepIndex) {
            return;
        }

        stopAutoTransitionFallbackTimer();
        autoTransitionFallbackReason = reason;
        autoTransitionFallbackStepIndex = currentStepIndex;
        autoTransitionFallbackTimer = window.setTimeout(function () {
            autoTransitionFallbackTimer = null;
            if (autoTransitionFallbackStepIndex !== currentStepIndex || currentStepIndex >= steps.length) {
                return;
            }

            showAutoTransitionFallback(reason);
        }, AUTO_TRANSITION_FALLBACK_DELAY_MS);
    }

    function normalizeFallbackReason(reason) {
        if (reason === "no-target") {
            return "no_target";
        }

        if (reason === "transit-path-required") {
            return normalizeStepMode(getCurrentStep()) === "SUBWAY" ? "subway_gps_unavailable" : "path_unavailable";
        }

        return String(reason || "");
    }

    function showAutoTransitionFallback(reason) {
        var $fallback = $("#stepFallback");

        if (!$fallback.length) {
            return;
        }

        isAutoTransitionFallbackVisible = true;
        autoTransitionFallbackReason = reason;
        autoTransitionFallbackStepIndex = currentStepIndex;
        $fallback.removeClass("hidden");
    }

    function hideAutoTransitionFallback() {
        stopAutoTransitionFallbackTimer();
        isAutoTransitionFallbackVisible = false;
        autoTransitionFallbackReason = "";
        autoTransitionFallbackStepIndex = null;
        $("#stepFallback").addClass("hidden");
    }

    function stopAutoTransitionFallbackTimer() {
        if (autoTransitionFallbackTimer !== null) {
            window.clearTimeout(autoTransitionFallbackTimer);
            autoTransitionFallbackTimer = null;
        }
    }

    function initializeNavigationMap() {
        if (isMapInitializationAttempted) {
            return;
        }

        isMapInitializationAttempted = true;
        prepareMapContainer();

        if (window.kakao && window.kakao.maps) {
            window.kakao.maps.load(function () {
                createNavigationMap(0);
            });
            return;
        }

        loadKakaoMapsSdk();
    }

    function prepareMapContainer() {
        var $map = $("#navigationMap");

        if ($map.find("#navigationMapCanvas").length) {
            return;
        }

        $map.empty()
                .append($("<div>").attr("id", "navigationMapCanvas").addClass("navigation-map-canvas"))
                .append($("<div>").addClass("map-fallback").text("지도를 불러오는 중입니다."))
                .append($("<button>")
                        .attr("type", "button")
                        .attr("id", "myLocationButton")
                        .attr("aria-pressed", "true")
                        .attr("aria-label", "내 위치로 이동")
                        .addClass("my-location-button")
                        .text("\u25CE"));
    }

    function createNavigationMap(attempt) {
        if (isMapReady && navigationMap) {
            return;
        }

        try {
            attempt = Number(attempt) || 0;
            var centerCoordinate = getInitialCenterCoordinate();
            var center = toKakaoLatLng(centerCoordinate);
            var container = document.getElementById("navigationMapCanvas");

            if (!container || !center) {
                console.error("[NAV MAP] map container or center coordinate is unavailable.");
                renderMapFallback("지도를 표시할 수 없습니다.");
                return;
            }

            if (container.clientWidth <= 0 || container.clientHeight <= 0) {
                if (attempt < 2) {
                    window.requestAnimationFrame(function () {
                        createNavigationMap(attempt + 1);
                    });
                    return;
                }

                console.error("[NAV MAP] map container has no visible size.");
                renderMapFallback("지도를 표시할 수 없습니다.");
                return;
            }

            navigationMap = new window.kakao.maps.Map(container, {
                center: center,
                level: NAV_DEFAULT_LEVEL
            });
            navigationMap.setDraggable(true);
            navigationMap.setZoomable(true);
            navigationMap.addControl(
                    new window.kakao.maps.ZoomControl(),
                    window.kakao.maps.ControlPosition.RIGHT
            );
            mapDragStartHandler = function () {
                setFollowingCurrentLocation(false);
            };
            window.kakao.maps.event.addListener(navigationMap, "dragstart", mapDragStartHandler);

            isMapReady = true;
            $("#navigationMap").addClass("map-ready");
            setupMapResizeHandling();
            updateFollowButtonState();
            focusedStepIndex = currentStepIndex;

            initializeMapOverlays();
        } catch (e) {
            console.error("[NAV MAP] map creation failed.", e);
            renderMapFallback("지도를 표시할 수 없습니다.");
        }
    }

    function initializeMapOverlays() {
        try {
            renderStaticRouteMarkers();
        } catch (e) {
            console.error("[NAV MAP] static marker update failed.", e);
        }

        try {
            updateCurrentStepMap();
        } catch (e) {
            console.error("[NAV MAP] current step map update failed.", e);
        }

        if (currentPosition) {
            updateCurrentLocationMarker(currentPosition);
        }
    }

    function loadKakaoMapsSdk() {
        $.ajax({
            url: "/map/config",
            type: "GET",
            dataType: "JSON"
        }).done(function (json) {
            var javascriptKey = $.trim(String(json && json.javascriptKey || ""));

            if (!json || !json.success || !json.available || !javascriptKey) {
                console.error("[NAV MAP] Kakao Maps JavaScript Key is not configured. Set KAKAO_MAP_JAVASCRIPT_KEY.");
                renderMapFallback("지도를 표시할 수 없습니다.");
                return;
            }

            appendKakaoMapsScript(javascriptKey);
        }).fail(function () {
            console.error("[NAV MAP] failed to load Kakao Maps config.");
                renderMapFallback("지도를 표시할 수 없습니다.");
        });
    }

    function appendKakaoMapsScript(javascriptKey) {
        var script = document.createElement("script");

        script.type = "text/javascript";
        script.src = "https://dapi.kakao.com/v2/maps/sdk.js?appkey="
                + encodeURIComponent(javascriptKey)
                + "&autoload=false";
        script.async = true;
        script.onload = function () {
            if (window.kakao && window.kakao.maps) {
                window.kakao.maps.load(function () {
                    createNavigationMap(0);
                });
                return;
            }

            console.error("[NAV MAP] Kakao Maps SDK loaded but kakao.maps is unavailable.");
            renderMapFallback("지도를 표시할 수 없습니다.");
        };
        script.onerror = function () {
            console.error("[NAV MAP] failed to load Kakao Maps SDK. Check JavaScript Key and JavaScript SDK domain.");
            renderMapFallback("지도를 표시할 수 없습니다.");
        };
        document.head.appendChild(script);
    }

    function setupMapResizeHandling() {
        var mapElement = document.getElementById("navigationMap");

        if (!mapElement || !isMapReady) {
            return;
        }

        cleanupMapResizeHandling();

        $(window).on("orientationchange.navigationMap", scheduleOrientationRelayout);
    }

    function cleanupMapResizeHandling() {
        if (mapRelayoutFrame !== null) {
            window.cancelAnimationFrame(mapRelayoutFrame);
            mapRelayoutFrame = null;
        }
        if (mapRelayoutTimer !== null) {
            window.clearTimeout(mapRelayoutTimer);
            mapRelayoutTimer = null;
        }

        $(window).off("orientationchange.navigationMap");
    }

    function cleanupMapListeners() {
        if (navigationMap && mapDragStartHandler && window.kakao && window.kakao.maps && window.kakao.maps.event) {
            window.kakao.maps.event.removeListener(navigationMap, "dragstart", mapDragStartHandler);
        }

        mapDragStartHandler = null;
    }

    function scheduleOrientationRelayout() {
        if (mapRelayoutFrame !== null) {
            window.cancelAnimationFrame(mapRelayoutFrame);
        }
        if (mapRelayoutTimer !== null) {
            window.clearTimeout(mapRelayoutTimer);
            mapRelayoutTimer = null;
        }

        mapRelayoutFrame = window.requestAnimationFrame(function () {
            mapRelayoutFrame = null;
            mapRelayoutTimer = window.setTimeout(function () {
                mapRelayoutTimer = null;
                relayoutNavigationMap();
            }, 0);
        });
    }

    function relayoutNavigationMap() {
        if (!isMapReady || !navigationMap) {
            return;
        }

        var container = document.getElementById("navigationMapCanvas");
        if (!container || container.clientWidth <= 0 || container.clientHeight <= 0) {
            return;
        }

        var center = navigationMap.getCenter();

        navigationMap.relayout();

        if (center) {
            navigationMap.setCenter(center);
        }
    }

    function getInitialCenterCoordinate() {
        return getValidCoordinate(currentPosition)
                || getValidCoordinate(selectedRoute && selectedRoute.origin)
                || getValidCoordinate(selectedRoute && selectedRoute.destination)
                || { latitude: 37.5665, longitude: 126.9780 };
    }

    function renderStaticRouteMarkers() {
        var origin = getValidCoordinate(selectedRoute && selectedRoute.origin);
        var destination = getValidCoordinate(selectedRoute && selectedRoute.destination);

        originMarker = createOrMoveMarker(originMarker, origin, "출발지", 2);
        destinationMarker = createOrMoveMarker(destinationMarker, destination, "목적지", 2);
    }

    function updateCurrentStepMap() {
        var step = getCurrentStep();
        var target = getCurrentNavigationTarget(step);

        updateCurrentNavigationTargetMarker(target);
        updateCurrentStepPolyline(step);

        if (isMapReady && ((currentPosition && !hasFocusedInitialNavigationArea)
                || (isFollowingCurrentLocation && focusedStepIndex !== currentStepIndex))) {
            focusCurrentNavigationArea();
        }
    }

    function updateCurrentStepPolyline(step) {
        var points = getCurrentStepPathPoints(step);

        if (currentPathProgressStepIndex !== currentStepIndex) {
            resetCurrentPathProgressState();
        }

        if (!isMapReady || points.length < 2) {
            clearCurrentStepPolylines();
            return;
        }

        currentPathProgressStepIndex = currentStepIndex;

        if (currentPathProgressIndex === null) {
            applyCurrentStepPathSplit(points, null);
        }

        if (currentPosition) {
            updateCurrentStepPathProgress(currentPosition);
        }
    }

    function updateCurrentStepPathProgress(position) {
        var accuracy = Number(position && position.accuracy);
        var coordinate = getValidCoordinate(position);
        var step = getCurrentStep();
        var points = getCurrentStepPathPoints(step);

        if (!isMapReady || !coordinate || currentStepIndex >= steps.length || points.length < 2) {
            return;
        }

        if (!Number.isFinite(accuracy) || accuracy > STEP_TRANSITION_MAX_ACCURACY_METERS) {
            return;
        }

        var pathMatch = getStepPathProgressMatch(position, points);

        if (!Number.isFinite(pathMatch.distance)
                || pathMatch.distance > MAX_PATH_DEVIATION_FOR_STEP_COMPLETE_METERS) {
            return;
        }

        var nearestPathIndex = normalizePathProgressIndex(pathMatch.nearestIndex, points.length);

        if (nearestPathIndex === null) {
            return;
        }

        currentPathProgressStepIndex = currentStepIndex;
        var previousPathProgressIndex = currentPathProgressIndex;
        currentPathProgressIndex = stabilizePathProgressIndex(nearestPathIndex);
        applyCurrentStepPathSplit(points, currentPathProgressIndex);

    }

    function stabilizePathProgressIndex(nearestPathIndex) {
        if (currentPathProgressIndex === null || currentPathProgressStepIndex !== currentStepIndex) {
            return nearestPathIndex;
        }

        if (nearestPathIndex < currentPathProgressIndex
                && currentPathProgressIndex - nearestPathIndex <= PATH_PROGRESS_BACKTRACK_JITTER_INDEX) {
            return currentPathProgressIndex;
        }

        return nearestPathIndex;
    }

    function normalizePathProgressIndex(index, pointCount) {
        var value = Number(index);

        if (!Number.isFinite(value) || pointCount < 2) {
            return null;
        }

        return Math.max(0, Math.min(Math.floor(value), pointCount - 1));
    }

    function applyCurrentStepPathSplit(points, progressIndex) {
        var hasProgress = Number.isFinite(Number(progressIndex));
        var completedPoints = hasProgress ? points.slice(0, progressIndex + 1) : [];
        var remainingPoints = hasProgress ? points.slice(progressIndex) : points.slice();

        updatePathPolyline("completed", completedPoints);
        updatePathPolyline("remaining", remainingPoints);
    }

    function updatePathPolyline(kind, points) {
        var path = points.map(toKakaoLatLng).filter(function (point) {
            return !!point;
        });
        var polyline = kind === "completed" ? completedPathPolyline : remainingPathPolyline;

        if (path.length < 2) {
            if (polyline) {
                polyline.setMap(null);
            }
            setPathPolyline(kind, polyline);
            return;
        }

        try {
            if (polyline) {
                polyline.setPath(path);
                polyline.setMap(navigationMap);
                return;
            }

            setPathPolyline(kind, new window.kakao.maps.Polyline({
                map: navigationMap,
                path: path,
                strokeWeight: kind === "completed" ? 5 : 6,
                strokeColor: kind === "completed" ? "#BDBDBD" : "#018B38",
                strokeOpacity: kind === "completed" ? 0.85 : 0.95,
                strokeStyle: "solid"
            }));
        } catch (e) {
            console.error("[NAV MAP] " + kind + " polyline update failed.", e);
            if (polyline) {
                polyline.setMap(null);
            }
            setPathPolyline(kind, null);
        }
    }

    function setPathPolyline(kind, polyline) {
        if (kind === "completed") {
            completedPathPolyline = polyline;
            return;
        }

        remainingPathPolyline = polyline;
    }

    function resetCurrentPathProgressState() {
        currentPathProgressIndex = null;
        currentPathProgressStepIndex = null;
        latestPathProgressMatch = null;
        clearCurrentStepPolylines();
    }

    function clearCurrentStepPolylines() {
        if (completedPathPolyline) {
            completedPathPolyline.setMap(null);
            completedPathPolyline = null;
        }

        if (remainingPathPolyline) {
            remainingPathPolyline.setMap(null);
            remainingPathPolyline = null;
        }
    }

    function focusCurrentNavigationArea() {
        if (!isMapReady) {
            return;
        }

        var current = getValidCoordinate(currentPosition);
        var target = getCurrentNavigationTarget(getCurrentStep());
        var anchor = current || target || getValidCoordinate(selectedRoute && selectedRoute.origin) || getInitialCenterCoordinate();
        var pathPoints = getCurrentStepPathPoints(getCurrentStep());

        if (!anchor) {
            return;
        }

        try {
            if (current && target) {
                var bounds = new window.kakao.maps.LatLngBounds();
                bounds.extend(toKakaoLatLng(current));
                bounds.extend(toKakaoLatLng(target));
                pathPoints.forEach(function (point) {
                    var latLng = toKakaoLatLng(point);
                    if (latLng) {
                        bounds.extend(latLng);
                    }
                });
                navigationMap.setBounds(
                        bounds,
                        NAV_BOUNDS_PADDING.top,
                        NAV_BOUNDS_PADDING.right,
                        NAV_BOUNDS_PADDING.bottom,
                        NAV_BOUNDS_PADDING.left
                );

                if (navigationMap.getLevel() > NAV_MAX_OVERVIEW_LEVEL) {
                    navigationMap.setLevel(NAV_MAX_OVERVIEW_LEVEL, {
                        anchor: toKakaoLatLng(current)
                    });
                }
            } else {
                navigationMap.setCenter(toKakaoLatLng(anchor));
                navigationMap.setLevel(NAV_DEFAULT_LEVEL);
            }
        } catch (e) {
            console.error("[NAV MAP] focus update failed.", e);
            return;
        }

        hasFocusedInitialNavigationArea = !!current;
        focusedStepIndex = currentStepIndex;
    }

    function updateCurrentLocationMarker(position) {
        var coordinate = getValidCoordinate(position);

        if (!coordinate || !isMapReady) {
            return;
        }

        latestCurrentLatLng = toKakaoLatLng(coordinate);
        currentMarker = createOrMoveMarker(currentMarker, coordinate, "현재 위치", 4);

        if (!hasFocusedInitialNavigationArea) {
            focusCurrentNavigationArea();
        } else if (isFollowingCurrentLocation) {
            navigationMap.panTo(latestCurrentLatLng);
        }

    }

    function updateCurrentNavigationTargetMarker(target) {
        if (!isMapReady) {
            return;
        }

        navigationTargetMarker = createOrMoveMarker(navigationTargetMarker, target, "현재 안내 지점", 3);
    }

    function createOrMoveMarker(marker, coordinate, title, zIndex) {
        if (!isMapReady || !coordinate) {
            if (marker) {
                marker.setMap(null);
            }
            return null;
        }

        var position = toKakaoLatLng(coordinate);
        if (!position) {
            if (marker) {
                marker.setMap(null);
            }
            return null;
        }

        try {
            if (marker) {
                marker.setPosition(position);
                marker.setMap(navigationMap);
                return marker;
            }

            return new window.kakao.maps.Marker({
                map: navigationMap,
                position: position,
                title: title,
                zIndex: zIndex
            });
        } catch (e) {
            console.error("[NAV MAP] marker update failed.", e);
            return marker || null;
        }
    }

    function setFollowingCurrentLocation(isFollowing) {
        isFollowingCurrentLocation = !!isFollowing;
        updateFollowButtonState();
    }

    function updateFollowButtonState() {
        $("#myLocationButton")
                .toggleClass("is-following", isFollowingCurrentLocation)
                .attr("aria-pressed", isFollowingCurrentLocation ? "true" : "false");
    }

    function panMapToCurrentLocation() {
        if (!isMapReady || !latestCurrentLatLng) {
            return;
        }

        setFollowingCurrentLocation(true);
        navigationMap.panTo(latestCurrentLatLng);
    }

    function renderMapFallback(message) {
        prepareMapContainer();
        $("#navigationMap")
                .removeClass("map-ready")
                .find(".map-fallback")
                .text(message || "지도를 표시할 수 없습니다.");
    }

    function getCurrentStepPathPoints(step) {
        var pathPoints = normalizeGeometryCoordinates(step && step.pathPoints);

        if (pathPoints.length >= 2) {
            return pathPoints;
        }

        return [];
    }

    function getCurrentNavigationTarget(step) {
        var pathPoints = normalizeGeometryCoordinates(step && step.pathPoints);

        if (pathPoints.length) {
            return pathPoints[pathPoints.length - 1];
        }

        return getValidCoordinate(step);
    }

    function getCurrentStep() {
        return currentStepIndex >= 0 && currentStepIndex < steps.length ? steps[currentStepIndex] : null;
    }

    function normalizeGeometryCoordinates(source) {
        if (!Array.isArray(source)) {
            return [];
        }

        return source.reduce(function (result, item) {
            var coordinate = normalizeGeometryCoordinate(item);

            if (coordinate) {
                result.push(coordinate);
                return result;
            }

            return result.concat(normalizeGeometryCoordinates(item));
        }, []);
    }

    function normalizeGeometryCoordinate(item) {
        if (Array.isArray(item) && item.length >= 2) {
            return getValidCoordinate({
                longitude: item[0],
                latitude: item[1]
            });
        }

        if (item && typeof item === "object") {
            return getValidCoordinate(item);
        }

        return null;
    }

    function getValidCoordinate(source) {
        var latitude = Number(source && (source.latitude != null ? source.latitude : source.lat));
        var longitude = Number(source && (source.longitude != null ? source.longitude : source.lng));

        if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
            return null;
        }

        if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) {
            return null;
        }

        if (latitude === 0 && longitude === 0) {
            return null;
        }

        return {
            latitude: latitude,
            longitude: longitude
        };
    }

    function toKakaoLatLng(coordinate) {
        var valid = getValidCoordinate(coordinate);

        return valid ? new window.kakao.maps.LatLng(valid.latitude, valid.longitude) : null;
    }

    function replayCurrentGuide() {
        if (!("speechSynthesis" in window)) {
            alert("이 브라우저에서는 음성 안내를 사용할 수 없습니다.");
            return;
        }

        var text = $.trim(currentSpeechText || $("#guideTitle").text() + ". " + $("#guideSubtitle").text());
        if (!text) {
            return;
        }

        window.speechSynthesis.cancel();
        window.speechSynthesis.speak(new SpeechSynthesisUtterance(text));
    }

    function updateSpeechText(text) {
        currentSpeechText = $.trim(String(text || ""));
    }

    function buildBusSpeechText(step, realtimeText) {
        var routeName = getPrimaryVehicleName(getVehicles(step));
        var stops = getStops(step);
        var lines = [];

        if (routeName) {
            lines.push(formatBusRouteSpeechName(routeName) + " 버스를 타요");
        } else {
            lines.push("버스를 타요");
        }

        if (stops[0]) {
            lines.push(stops[0] + " 정류장에서 탑승하세요");
        }

        if (isReadableRealtimeText(realtimeText)) {
            lines.push(realtimeText + "입니다");
        }

        return lines.join(" ");
    }

    function buildSubwaySpeechText(step, realtimeText) {
        var lineName = getPrimaryVehicleName(getVehicles(step));
        var lines = [];

        lines.push(lineName ? lineName + " 지하철을 타요" : "지하철을 타요");

        if (isReadableRealtimeText(realtimeText)) {
            lines.push(realtimeText + "입니다");
        }

        return lines.join(" ");
    }

    function formatBusRouteSpeechName(routeName) {
        var text = $.trim(String(routeName || ""));

        if (!text || text.indexOf("번") >= 0 || text.indexOf("버스") >= 0) {
            return text;
        }

        return text + "번";
    }

    function isReadableRealtimeText(text) {
        var value = $.trim(String(text || ""));

        return !!value
                && value !== REALTIME_FALLBACK
                && value !== "실시간 도착정보를 확인 중이에요"
                && value !== "현재 정확한 위치를 확인 중이에요";
    }

    function buildWalkingSpeechText(guidance, distanceText) {
        return [guidance, distanceText].filter(function (value) {
            return !!$.trim(String(value || ""));
        }).join(". ");
    }

    function renderGuideLines(lines, emphasisText) {
        var $subtitle = $("#guideSubtitle");

        $subtitle.empty();
        lines.filter(function (line) {
            return !!$.trim(String(line || ""));
        }).forEach(function (line, index) {
            if (index > 0) {
                $subtitle.append(document.createElement("br"));
            }

            if (line === emphasisText) {
                $subtitle.append($("<strong>").addClass("realtime-arrival-text").text(line));
                return;
            }

            $subtitle.append(document.createTextNode(line));
        });
    }

    function updateProgress() {
        var percent = 0;

        if (steps.length > 0) {
            percent = (currentStepIndex / steps.length) * 100;
        }

        if (!Number.isFinite(percent)) {
            percent = 0;
        }

        percent = Math.max(0, Math.min(percent, 100));
        $("#progressFill").css("width", percent + "%");
    }

    function isCurrentStepResponse(stepIndex, token, mode) {
        return currentStepIndex === stepIndex
                && realtimeRequestToken === token
                && normalizeStepMode(steps[stepIndex]) === mode;
    }

    function getBusRealtimeTarget(step) {
        var stopName = getBoardingStopName(step);
        var routeName = getPrimaryVehicleName(getVehicles(step));

        if (!stopName || !routeName) {
            return null;
        }

        return {
            stopName: stopName,
            routeName: routeName,
            nextStopName: getNextStopName(step),
            directionHint: step.guidance || ""
        };
    }

    function getSubwayRealtimeTarget(step) {
        var stationName = getBoardingStopName(step);
        var lineName = normalizeSubwayLineName(getPrimaryVehicleName(getVehicles(step)));
        var stops = getStops(step);

        if (!stationName || !lineName) {
            return null;
        }

        return {
            stationName: stationName,
            lineName: lineName,
            nextStationName: stops.length > 1 ? stops[1] : "",
            destinationStationName: stops.length > 1 ? stops[stops.length - 1] : "",
            guidance: step.guidance || ""
        };
    }

    function getPrimaryBusArrival(json) {
        if (!json || !json.success || !json.available || json.status !== "OK") {
            return null;
        }

        return json.firstArrival || json.secondArrival || null;
    }

    function formatBusArrivalMessage(arrival) {
        if (!arrival) {
            return "";
        }

        var seconds = Number(arrival.seconds);
        if (Number.isFinite(seconds) && seconds >= 0) {
            return formatArrivalSeconds(seconds, " 후 도착");
        }

        return arrival.message ? $.trim(String(arrival.message)) : "";
    }

    function formatSubwayArrivalMessage(arrival) {
        if (!arrival) {
            return "";
        }

        var message = $.trim(String(arrival.arrivalMessage || ""));
        if (message && !/^\d+\s*분/.test(message)) {
            return message;
        }

        var seconds = Number(arrival.arrivalSeconds);
        if (Number.isFinite(seconds) && seconds >= 0) {
            return formatArrivalSeconds(seconds, " 후 도착");
        }

        return message;
    }

    function formatArrivalSeconds(seconds, suffix) {
        var value = Math.max(Math.floor(Number(seconds)), 0);
        var minutes = Math.floor(value / 60);
        var remainder = value % 60;

        if (value < 60) {
            return "곧 도착";
        }

        if (remainder === 0) {
            return minutes + "분" + suffix;
        }

        return minutes + "분 " + remainder + "초" + suffix;
    }

    function findDirectionMatchedSubwayArrivals(arrivals, target) {
        if (!Array.isArray(arrivals) || !target) {
            return [];
        }

        return arrivals.filter(function (arrival) {
            return isReliableSubwayDirectionMatch(arrival, target);
        }).sort(function (a, b) {
            return compareArrivalSeconds(a.arrivalSeconds, b.arrivalSeconds);
        }).slice(0, 2);
    }

    function isReliableSubwayDirectionMatch(arrival, target) {
        if (!arrival) {
            return false;
        }

        var nextStationName = normalizeStationForCompare(target.nextStationName);
        var destinationStationName = normalizeStationForCompare(target.destinationStationName);
        var guidanceStations = extractStationNamesFromText(target.guidance);
        var trainLineName = normalizeStationForCompare(arrival.trainLineName);
        var terminalStationName = normalizeStationForCompare(arrival.destinationStationName);

        if (nextStationName && containsStationName(trainLineName, nextStationName)) {
            return true;
        }

        if (destinationStationName && containsStationName(trainLineName, destinationStationName)) {
            return true;
        }

        for (var i = 0; i < guidanceStations.length; i++) {
            if (containsStationName(trainLineName, guidanceStations[i])
                    || terminalStationName === guidanceStations[i]) {
                return true;
            }
        }

        return destinationStationName && terminalStationName === destinationStationName;
    }

    function getWalkingTargetCoordinate(step) {
        return getCurrentNavigationTarget(step);
    }

    function calculateDistanceMeters(currentLat, currentLng, targetLat, targetLng) {
        var earthRadiusMeters = 6371000;
        var dLat = toRadians(targetLat - currentLat);
        var dLng = toRadians(targetLng - currentLng);
        var lat1 = toRadians(currentLat);
        var lat2 = toRadians(targetLat);
        var a = Math.sin(dLat / 2) * Math.sin(dLat / 2)
                + Math.cos(lat1) * Math.cos(lat2)
                * Math.sin(dLng / 2) * Math.sin(dLng / 2);
        var c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

        return earthRadiusMeters * c;
    }

    function toRadians(value) {
        return Number(value) * Math.PI / 180;
    }

    function parseDisplayDistanceMeters(text) {
        var value = String(text || "").match(/([\d.]+)\s*(km|m)/i);

        if (!value) {
            return Number.NaN;
        }

        var number = Number(value[1]);
        if (!Number.isFinite(number)) {
            return Number.NaN;
        }

        return value[2].toLowerCase() === "km" ? number * 1000 : number;
    }

    function getWalkingFallbackText(step) {
        var distance = formatDistance(step && step.distance);

        if (distance) {
            return "약 " + distance + " 이동";
        }

        return "현재 위치를 확인할 수 없어요";
    }

    function isNavigationRoute(value) {
        return !!value
                && !!value.route
                && Array.isArray(value.route.steps);
    }

    function getOriginName(origin) {
        if (!origin) {
            return "현재 위치";
        }

        return origin.placeName || origin.name || origin.addressName || origin.roadAddressName || "현재 위치";
    }

    function getDestinationName(destination) {
        if (!destination) {
            return "목적지";
        }

        return destination.placeName || destination.name || destination.addressName || destination.roadAddressName || "목적지";
    }

    function getTransportVisualText(mode, vehicles) {
        var vehicleName = getPrimaryVehicleName(vehicles);

        if (mode === "BUS") {
            return vehicleName || "BUS";
        }

        if (mode === "SUBWAY") {
            return vehicleName || "지하철";
        }

        return "도보";
    }

    function normalizeStepMode(step) {
        var type = String(step && step.type || "").toUpperCase();

        if (type.indexOf("SUBWAY") >= 0) {
            return "SUBWAY";
        }

        if (type.indexOf("BUS") >= 0) {
            return "BUS";
        }

        return "WALKING";
    }

    function getVehicles(step) {
        return Array.isArray(step && step.vehicles)
                ? step.vehicles.filter(function (vehicle) {
                    return !!vehicle;
                })
                : [];
    }

    function getStops(step) {
        return Array.isArray(step && step.stops)
                ? step.stops.map(function (stop) {
                    return String(stop || "");
                }).filter(function (stop) {
                    return !!$.trim(stop);
                })
                : [];
    }

    function getPrimaryVehicleName(vehicles) {
        var vehicle = vehicles.find(function (item) {
            return item && item.name;
        });

        return vehicle && vehicle.name ? String(vehicle.name) : "";
    }

    function getBoardingStopName(step) {
        var stops = getStops(step);

        return stops.length ? stops[0] : "";
    }

    function getNextStopName(step) {
        var stops = getStops(step);

        return stops.length > 1 ? stops[1] : "";
    }

    function formatStops(stops) {
        if (!stops.length) {
            return "";
        }

        if (stops.length === 1) {
            return stops[0];
        }

        return stops[0] + " → " + stops[stops.length - 1];
    }

    function normalizeSubwayLineName(value) {
        var text = $.trim(String(value || ""));
        var numberedLine = text.match(/(\d+)\s*호선/);

        if (numberedLine) {
            return numberedLine[1] + "호선";
        }

        return text;
    }

    function normalizeStationForCompare(value) {
        var text = $.trim(String(value || "")).replace(/\s+/g, "");

        if (text.length > 1 && text.charAt(text.length - 1) === "역") {
            return text.substring(0, text.length - 1);
        }

        return text;
    }

    function containsStationName(text, stationName) {
        return !!text && !!stationName && text.indexOf(stationName) >= 0;
    }

    function extractStationNamesFromText(value) {
        var text = String(value || "");
        var matches = text.match(/[가-힣A-Za-z0-9()]+역/g) || [];
        var stationNames = [];

        matches.forEach(function (match) {
            var stationName = normalizeStationForCompare(match);

            if (stationName && stationNames.indexOf(stationName) < 0) {
                stationNames.push(stationName);
            }
        });

        return stationNames;
    }

    function compareArrivalSeconds(first, second) {
        var a = Number(first);
        var b = Number(second);
        var safeA = Number.isFinite(a) ? a : Number.MAX_SAFE_INTEGER;
        var safeB = Number.isFinite(b) ? b : Number.MAX_SAFE_INTEGER;

        return safeA - safeB;
    }

    function formatDistance(distance) {
        var meters = safeNumber(distance);

        if (meters <= 0) {
            return "";
        }

        if (meters < 1000) {
            return Math.round(meters) + "m";
        }

        return (meters / 1000).toFixed(1) + "km";
    }

    function safeNumber(value) {
        var number = Number(value);

        return Number.isFinite(number) ? number : 0;
    }

    function readJson(key) {
        var raw = sessionStorage.getItem(key);

        if (!raw || raw === "null") {
            return null;
        }

        try {
            return JSON.parse(raw);
        } catch (e) {
            return null;
        }
    }
})(jQuery);
