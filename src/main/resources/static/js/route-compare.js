(function ($) {
    var GACHIGAYO_SCORE = {
        TRANSFER_WEIGHT: 0.35,
        COMPLEXITY_WEIGHT: 0.25,
        WALKING_WEIGHT: 0.15,
        FAMILIARITY_WEIGHT: 0.15,
        TOTAL_TIME_WEIGHT: 0.10,
        NEUTRAL_FAMILIARITY_SCORE: 50
    };

    var selectedDestination = null;
    var currentOrigin = null;
    var routeSearchResult = null;
    var publicTransitCandidates = [];
    var selectedPublicRouteIndex = null;
    var activeTab = null;
    var selectedRoute = null;
    var busRealtimeCache = {};
    var subwayRealtimeCache = {};
    var currentScoreContext = null;
    var isSavingSelectedRoute = false;

    $(function () {
        checkSession();

        $("#backButton").on("click", function () {
            window.location.href = "/place-detail.html";
        });

        $(".route-tab").on("click", function () {
            selectTab($(this).data("tab"));
        });

        $("#guideButton").on("click", function () {
            if (isSavingSelectedRoute) {
                return;
            }

            saveSelectedRoute();
        });

        $("#routeList").on("click", ".route-card", function () {
            if (isSavingSelectedRoute) {
                return;
            }

            var mode = $(this).data("mode");

            if (mode === "PUBLIC_TRANSIT") {
                selectedPublicRouteIndex = Number($(this).data("route-index"));
                selectedRoute = {
                    mode: "PUBLIC_TRANSIT",
                    route: publicTransitCandidates[selectedPublicRouteIndex].route,
                    selectionLabel: publicTransitCandidates[selectedPublicRouteIndex].selectionLabel
                };
                renderPublicTransit();
                return;
            }

            if (mode === "WALKING") {
                selectedRoute = {
                    mode: "WALKING",
                    route: routeSearchResult.walking
                };
                renderWalking();
            }
        });
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

                loadRouteData();
            },
            error: function () {
                window.location.replace("/login.html");
            }
        });
    }

    function loadRouteData() {
        selectedDestination = readJson("selectedDestination");
        currentOrigin = readJson("currentOrigin");
        routeSearchResult = readJson("routeSearchResult");

        if (!selectedDestination || !routeSearchResult) {
            window.location.replace("/route-search.html");
            return;
        }

        $("#destinationName").text(selectedDestination.placeName || "목적지");
        publicTransitCandidates = buildPublicTransitCandidates(routeSearchResult.publicTransit);
        $("#routeComparePage").removeClass("hidden");

        if (routeSearchResult.publicTransit && routeSearchResult.publicTransit.available) {
            selectTab("publicTransit");
            return;
        }

        if (routeSearchResult.walking && routeSearchResult.walking.available) {
            selectTab("walking");
            return;
        }

        selectTab("publicTransit");
        setMessage("이동 가능한 경로를 찾지 못했습니다.");
    }

    function buildPublicTransitCandidates(publicTransit) {
        if (!publicTransit || !publicTransit.available || !publicTransit.routes || !publicTransit.routes.length) {
            return [];
        }

        return selectRepresentativeRoutes(publicTransit.routes);
    }

    function selectRepresentativeRoutes(routes) {
        var candidates = [];
        currentScoreContext = buildScoreContext(routes);
        var recommended = findGachigayoRecommendedRoute(routes, currentScoreContext);
        var fastestRoutes = sortByTotalTime(routes);
        var fewestTransferRoutes = sortByTransfers(routes);
        var leastWalkingRoutes = sortByWalkingTime(routes);

        addCandidateFromSorted(candidates, [recommended], "같이가요 추천", "GACHIGAYO_RECOMMENDED", createRecommendationReason);
        addCandidateFromSorted(candidates, fastestRoutes, "가장 빨라요", "FASTEST", function () {
            return "";
        });
        addCandidateFromSorted(candidates, fewestTransferRoutes, "환승이 적어요", "FEWEST_TRANSFER", function () {
            return "";
        });
        addCandidateFromSorted(candidates, leastWalkingRoutes, "덜 걸어요", "LEAST_WALKING", function () {
            return "";
        });

        return candidates.slice(0, 4);
    }

    function addCandidateFromSorted(candidates, routes, label, selectionLabel, reasonFactory) {
        if (!routes || !routes.length) {
            return;
        }

        var route = routes.find(function (nextRoute) {
            return nextRoute && !hasSameRoute(candidates, nextRoute);
        });

        if (!route) {
            return;
        }

        candidates.push({
            label: label,
            selectionLabel: selectionLabel,
            reason: reasonFactory(route),
            gachigayoScore: calculateGachigayoScore(route, currentScoreContext),
            route: route
        });
    }

    function findGachigayoRecommendedRoute(routes, scoreContext) {
        return routes.slice().sort(function (a, b) {
            var scoreDiff = calculateGachigayoScore(b, scoreContext) - calculateGachigayoScore(a, scoreContext);

            if (scoreDiff !== 0) {
                return scoreDiff;
            }

            var transferDiff = safeNumber(a.transfers) - safeNumber(b.transfers);

            if (transferDiff !== 0) {
                return transferDiff;
            }

            var walkingDiff = calculateWalkingTime(a) - calculateWalkingTime(b);

            if (walkingDiff !== 0) {
                return walkingDiff;
            }

            return safeNumber(a.totalTime) - safeNumber(b.totalTime);
        })[0] || null;
    }

    function findFastestRoute(routes) {
        return sortByTotalTime(routes)[0] || null;
    }

    function findFewestTransferRoute(routes) {
        return sortByTransfers(routes)[0] || null;
    }

    function findLeastWalkingRoute(routes) {
        return sortByWalkingTime(routes)[0] || null;
    }

    function sortByTotalTime(routes) {
        return routes.slice().sort(function (a, b) {
            return safeNumber(a.totalTime) - safeNumber(b.totalTime);
        });
    }

    function sortByTransfers(routes) {
        return routes.slice().sort(function (a, b) {
            var transferDiff = safeNumber(a.transfers) - safeNumber(b.transfers);

            if (transferDiff !== 0) {
                return transferDiff;
            }

            return safeNumber(a.totalTime) - safeNumber(b.totalTime);
        });
    }

    function sortByWalkingTime(routes) {
        return routes.slice().sort(function (a, b) {
            var walkingDiff = calculateWalkingTime(a) - calculateWalkingTime(b);

            if (walkingDiff !== 0) {
                return walkingDiff;
            }

            return safeNumber(a.totalTime) - safeNumber(b.totalTime);
        });
    }

    function buildScoreContext(routes) {
        var metrics = (routes || []).map(function (route) {
            return {
                route: route,
                transfers: safeNumber(route && route.transfers),
                complexity: calculateMeaningfulStepCount(route),
                walkingTime: calculateWalkingTime(route),
                totalTime: safeNumber(route && route.totalTime)
            };
        });

        return {
            metrics: metrics,
            transfers: buildRange(metrics, "transfers"),
            complexity: buildRange(metrics, "complexity"),
            walkingTime: buildRange(metrics, "walkingTime"),
            totalTime: buildRange(metrics, "totalTime")
        };
    }

    function buildRange(metrics, key) {
        return metrics.reduce(function (range, metric) {
            var value = safeNumber(metric[key]);
            return {
                min: Math.min(range.min, value),
                max: Math.max(range.max, value)
            };
        }, {
            min: Number.POSITIVE_INFINITY,
            max: Number.NEGATIVE_INFINITY
        });
    }

    function calculateGachigayoScore(route, scoreContext) {
        var context = scoreContext || buildScoreContext([route]);
        var metric = findScoreMetric(route, context);
        var score = normalizeLowerIsBetter(metric.transfers, context.transfers) * GACHIGAYO_SCORE.TRANSFER_WEIGHT
                + normalizeLowerIsBetter(metric.complexity, context.complexity) * GACHIGAYO_SCORE.COMPLEXITY_WEIGHT
                + normalizeLowerIsBetter(metric.walkingTime, context.walkingTime) * GACHIGAYO_SCORE.WALKING_WEIGHT
                + getFamiliarityScore(route) * GACHIGAYO_SCORE.FAMILIARITY_WEIGHT
                + normalizeLowerIsBetter(metric.totalTime, context.totalTime) * GACHIGAYO_SCORE.TOTAL_TIME_WEIGHT;

        return Math.round(clamp(score, 0, 100));
    }

    function findScoreMetric(route, scoreContext) {
        var metrics = scoreContext && scoreContext.metrics ? scoreContext.metrics : [];
        var metric = metrics.find(function (nextMetric) {
            return nextMetric.route === route;
        });

        return metric || {
            transfers: safeNumber(route && route.transfers),
            complexity: calculateMeaningfulStepCount(route),
            walkingTime: calculateWalkingTime(route),
            totalTime: safeNumber(route && route.totalTime)
        };
    }

    function normalizeLowerIsBetter(value, range) {
        if (!range || !Number.isFinite(range.min) || !Number.isFinite(range.max) || range.min === range.max) {
            return 100;
        }

        return clamp(((range.max - safeNumber(value)) / (range.max - range.min)) * 100, 0, 100);
    }

    function getFamiliarityScore() {
        return GACHIGAYO_SCORE.NEUTRAL_FAMILIARITY_SCORE;
    }

    function calculateMeaningfulStepCount(route) {
        return getValidSteps(route).filter(function (step) {
            return !!(step.type || safeNumber(step.time) || safeNumber(step.distance)
                    || step.vehicles && step.vehicles.length
                    || step.stops && step.stops.length);
        }).length;
    }

    function calculateWalkingTime(route) {
        return getValidSteps(route).reduce(function (sum, step) {
            return isWalkingStep(step) ? sum + safeNumber(step.time) : sum;
        }, 0);
    }

    function getValidSteps(route) {
        return route && Array.isArray(route.steps)
                ? route.steps.filter(function (step) {
                    return !!step;
                })
                : [];
    }

    function createRecommendationReason(route) {
        var transfers = safeNumber(route.transfers);
        var walkingMinutes = secondsToMinutes(calculateWalkingTime(route));

        if (transfers === 0 && walkingMinutes <= 5) {
            return "환승 없이 걷는 시간이 짧아요";
        }

        if (transfers === 0) {
            return "환승 없이 이동할 수 있어요";
        }

        if (walkingMinutes <= 5) {
            return "걷는 시간이 비교적 짧아요";
        }

        if (transfers <= 1) {
            return "환승 부담이 적은 편이에요";
        }

        return "시간과 환승, 도보 구간을 함께 고려했어요";
    }

    function hasSameRoute(candidates, route) {
        return candidates.some(function (candidate) {
            return getRouteSignature(candidate.route) === getRouteSignature(route);
        });
    }

    function getRouteSignature(route) {
        return [
            safeNumber(route.totalTime),
            safeNumber(route.totalDistance),
            safeNumber(route.transfers),
            safeNumber(route.fare),
            getValidSteps(route).map(function (step) {
                return [
                    step.type || "",
                    getVehicleName(step),
                    getStopsText(step.stops || []),
                    safeNumber(step.time)
                ].join(":");
            }).join("/")
        ].join("|");
    }

    function selectTab(tabName) {
        activeTab = tabName;
        $(".route-tab").removeClass("active").attr("aria-selected", "false");
        $('.route-tab[data-tab="' + tabName + '"]').addClass("active").attr("aria-selected", "true");
        setMessage("");

        if (tabName === "walking") {
            renderWalking();
            return;
        }

        renderPublicTransit();
    }

    function renderPublicTransit() {
        var $list = $("#routeList");
        $list.empty();

        if (!routeSearchResult.publicTransit || !routeSearchResult.publicTransit.available || !publicTransitCandidates.length) {
            selectedRoute = null;
            updateGuideButton(false);
            $list.append($("<div>").addClass("empty-card").text("이 목적지까지 이용 가능한 대중교통 경로를 찾지 못했습니다."));
            return;
        }

        if (selectedPublicRouteIndex === null || !publicTransitCandidates[selectedPublicRouteIndex]) {
            selectedPublicRouteIndex = 0;
        }

        selectedRoute = {
            mode: "PUBLIC_TRANSIT",
            route: publicTransitCandidates[selectedPublicRouteIndex].route,
            selectionLabel: publicTransitCandidates[selectedPublicRouteIndex].selectionLabel
        };
        updateGuideButton(true);

        $.each(publicTransitCandidates, function (index, candidate) {
            var route = candidate.route;
            var isRecommended = candidate.selectionLabel === "GACHIGAYO_RECOMMENDED";
            var $card = $("<button>")
                    .attr("type", "button")
                    .addClass("route-card")
                    .toggleClass("recommended", isRecommended)
                    .toggleClass("selected", index === selectedPublicRouteIndex)
                    .data("mode", "PUBLIC_TRANSIT")
                    .data("route-index", index);

            $card.append($("<span>").addClass("route-card-label").text(candidate.label));
            if (candidate.reason) {
                $card.append($("<p>").addClass("route-reason").text(candidate.reason));
            }
            $card.append(createTimeBlock(route.totalTime));
            $card.append(createMeta(route));
            $card.append(createSegmentBar(route.steps || []));
            $card.append($("<div>").addClass("route-summary").text(createTransitSummary(route)));
            $card.append(createTransitDetails(route.steps || []));

            $list.append($card);
            requestBusRealtimeForCard($card, route);
            requestSubwayRealtimeForCard($card, route);
        });
    }

    function renderWalking() {
        var $list = $("#routeList");
        $list.empty();

        if (!routeSearchResult.walking || !routeSearchResult.walking.available) {
            selectedRoute = null;
            updateGuideButton(false);
            $list.append($("<div>").addClass("empty-card").text("이 목적지까지 이용 가능한 도보 경로를 찾지 못했습니다."));
            return;
        }

        selectedRoute = {
            mode: "WALKING",
            route: routeSearchResult.walking
        };
        updateGuideButton(true);

        var walking = routeSearchResult.walking;
        var $card = $("<button>")
                .attr("type", "button")
                .addClass("route-card selected")
                .data("mode", "WALKING");

        $card.append($("<span>").addClass("route-card-label").text("걸어서 이동해요"));
        $card.append(createTimeBlock(walking.totalTime));

        var $meta = $("<div>").addClass("route-meta");
        $meta.append($("<span>").text(formatDistance(walking.totalDistance)));
        $card.append($meta);

        var $bar = $("<div>").addClass("segment-bar");
        $bar.append($("<span>").addClass("segment walking").css("width", "100%"));
        $card.append($bar);
        $card.append(createWalkingDetails(walking.steps || []));

        $list.append($card);
    }

    function createTimeBlock(totalTime) {
        var $block = $("<div>").addClass("route-time");
        $block.append($("<strong>").text(formatMinutes(totalTime)));
        $block.append($("<span>").text(formatArrival(totalTime)));

        return $block;
    }

    function createMeta(route) {
        var $meta = $("<div>").addClass("route-meta");
        $meta.append($("<span>").text("환승 " + safeNumber(route.transfers) + "회"));

        if (safeNumber(route.fare) > 0) {
            $meta.append($("<span>").text(formatWon(route.fare)));
        }

        return $meta;
    }

    function createSegmentBar(steps) {
        var $bar = $("<div>").addClass("segment-bar");
        var total = steps.reduce(function (sum, step) {
            return sum + Math.max(safeNumber(step.time), 0);
        }, 0);

        if (total <= 0) {
            $bar.append($("<span>").addClass("segment walking").css("width", "100%"));
            return $bar;
        }

        $.each(steps, function (_, step) {
            var percent = Math.max(4, (safeNumber(step.time) / total) * 100);
            $bar.append($("<span>").addClass("segment " + getSegmentClass(step)).css("width", percent + "%"));
        });

        return $bar;
    }

    function createTransitSummary(route) {
        var names = [];
        $.each(route.steps || [], function (_, step) {
            var name = getVehicleName(step);

            if (name && names.indexOf(name) < 0) {
                names.push(name);
            }
        });

        return names.length ? names.slice(0, 3).join(" -> ") : "도보 이동 포함";
    }

    function createTransitDetails(steps) {
        var $list = $("<ul>").addClass("route-detail-list");
        var detailCount = 0;
        var firstTransitIndex = getFirstTransitStepIndex(steps);

        $.each(steps, function (stepIndex, step) {
            if (detailCount >= 3) {
                return false;
            }

            var text = createStepText(step);
            if (text) {
                var $item = $("<li>").append($("<span>").addClass("step-main").text(text));

                if (stepIndex === firstTransitIndex && isBusStep(step)) {
                    var stopName = getBoardingStopName(step);
                    var routeName = getBoardingRouteName(step);

                    if (stopName && routeName) {
                        $item.append($("<div>")
                                .addClass("bus-arrival-slot hidden")
                                .attr("data-realtime-key", createRealtimeCacheKey(stopName, routeName)));
                    }
                }

                if (stepIndex === firstTransitIndex && isSubwayStep(step)) {
                    var subwayTarget = getBoardingSubwayTargetFromStep(step);

                    if (subwayTarget) {
                        $item.append($("<div>")
                                .addClass("subway-arrival-slot hidden")
                                .attr("data-realtime-key", createSubwayRealtimeCacheKey(subwayTarget.stationName, subwayTarget.lineName))
                                .data("subway-target", subwayTarget));
                    }
                }

                $list.append($item);
                detailCount++;
            }
        });

        return $list;
    }

    function createWalkingDetails(steps) {
        var $list = $("<ul>").addClass("route-detail-list");
        var shown = 0;

        $.each(steps, function (_, step) {
            if (shown >= 3) {
                return false;
            }

            if (step.guidance) {
                $list.append($("<li>").text(step.guidance));
                shown++;
            }
        });

        if (!shown) {
            $list.append($("<li>").text("도보 경로 안내를 준비했습니다."));
        }

        return $list;
    }

    function createStepText(step) {
        if (isWalkingStep(step)) {
            return "도보 " + formatMinutes(step.time);
        }

        var vehicleName = getVehicleName(step);
        var stopsText = getStopsText(step.stops || []);
        var baseText = vehicleName || step.guidance || getTransitTypeName(step.type);

        if (baseText && stopsText) {
            return baseText + " · " + stopsText;
        }

        return baseText || stopsText || null;
    }

    function getVehicleName(step) {
        if (step.vehicles && step.vehicles.length) {
            var vehicle = step.vehicles.find(function (item) {
                return item && item.name;
            });

            if (vehicle && vehicle.name) {
                return vehicle.name;
            }
        }

        return step.guidance || "";
    }

    function getStopsText(stops) {
        if (!Array.isArray(stops) || stops.length < 2) {
            return "";
        }

        return String(stops[0]) + " -> " + String(stops[stops.length - 1]);
    }

    function getTransitTypeName(type) {
        var normalized = (type || "").toUpperCase();

        if (normalized.indexOf("SUBWAY") >= 0) {
            return "지하철";
        }

        if (normalized.indexOf("BUS") >= 0) {
            return "버스";
        }

        return "";
    }

    function requestBusRealtimeForCard($card, route) {
        var target = getFirstBoardingBusTarget(route);

        if (!target) {
            return;
        }

        var cacheKey = createRealtimeCacheKey(target.stopName, target.routeName);
        if (busRealtimeCache[cacheKey]) {
            busRealtimeCache[cacheKey].done(function (json) {
                updateBusArrivalSlots(cacheKey, json);
            }).fail(function () {
                hideBusArrivalSlots(cacheKey);
            });
            return;
        }

        console.info("[route-compare] /bus/realtime request", {
            stopName: target.stopName,
            routeName: target.routeName,
            nextStopName: target.nextStopName
        });

        busRealtimeCache[cacheKey] = $.ajax({
            url: "/bus/realtime",
            method: "GET",
            dataType: "JSON",
            data: {
                stopName: target.stopName,
                routeName: target.routeName,
                nextStopName: target.nextStopName,
                directionHint: target.directionHint
            }
        });

        busRealtimeCache[cacheKey].done(function (json) {
            console.info("[route-compare] /bus/realtime response", {
                stopName: target.stopName,
                routeName: target.routeName,
                success: json && json.success,
                available: json && json.available,
                status: json && json.status
            });
            updateBusArrivalSlots(cacheKey, json);
        }).fail(function () {
            console.info("[route-compare] /bus/realtime failed", {
                stopName: target.stopName,
                routeName: target.routeName
            });
            hideBusArrivalSlots(cacheKey);
        });
    }

    function requestSubwayRealtimeForCard($card, route) {
        var target = getFirstBoardingSubwayTarget(route);

        if (!target) {
            return;
        }

        var cacheKey = createSubwayRealtimeCacheKey(target.stationName, target.lineName);
        if (subwayRealtimeCache[cacheKey]) {
            subwayRealtimeCache[cacheKey].done(function (json) {
                updateSubwayArrivalSlots(cacheKey, json);
            }).fail(function () {
                hideSubwayArrivalSlots(cacheKey);
            });
            return;
        }

        console.info("[route-compare] /subway/realtime request", {
            stationName: target.stationName,
            lineName: target.lineName
        });

        subwayRealtimeCache[cacheKey] = $.ajax({
            url: "/subway/realtime",
            method: "GET",
            dataType: "JSON",
            data: {
                stationName: target.stationName,
                lineName: target.lineName
            }
        });

        subwayRealtimeCache[cacheKey].done(function (json) {
            console.info("[route-compare] /subway/realtime response", {
                stationName: target.stationName,
                lineName: target.lineName,
                success: json && json.success,
                available: json && json.available,
                status: json && json.status,
                subwayId: json && json.subwayId
            });
            updateSubwayArrivalSlots(cacheKey, json);
        }).fail(function () {
            console.info("[route-compare] /subway/realtime failed", {
                stationName: target.stationName,
                lineName: target.lineName
            });
            hideSubwayArrivalSlots(cacheKey);
        });
    }

    function getFirstBoardingBusTarget(route) {
        var firstTransitStep = getFirstTransitStep(route);

        if (!firstTransitStep || !isBusStep(firstTransitStep)) {
            return null;
        }

        var stopName = getBoardingStopName(firstTransitStep);
        var routeName = getBoardingRouteName(firstTransitStep);
        var nextStopName = getNextStopName(firstTransitStep);

        if (!stopName || !routeName) {
            return null;
        }

        return {
            stopName: stopName,
            routeName: routeName,
            nextStopName: nextStopName,
            directionHint: firstTransitStep.guidance || ""
        };
    }

    function getFirstBoardingSubwayTarget(route) {
        var firstTransitStep = getFirstTransitStep(route);

        if (!firstTransitStep || !isSubwayStep(firstTransitStep)) {
            return null;
        }

        return getBoardingSubwayTargetFromStep(firstTransitStep);
    }

    function getBoardingSubwayTargetFromStep(step) {
        var stationName = getBoardingStopName(step);
        var lineName = normalizeSubwayLineName(getBoardingRouteName(step));

        if (!stationName || !lineName) {
            return null;
        }

        var stops = Array.isArray(step.stops) ? step.stops.map(function (stop) {
            return String(stop || "");
        }).filter(function (stop) {
            return !!$.trim(stop);
        }) : [];

        return {
            stationName: stationName,
            lineName: lineName,
            nextStationName: stops.length > 1 ? stops[1] : "",
            destinationStationName: stops.length > 1 ? stops[stops.length - 1] : "",
            guidance: step.guidance || ""
        };
    }

    function getFirstTransitStep(route) {
        var steps = getValidSteps(route);
        var index = getFirstTransitStepIndex(steps);

        return index >= 0 ? steps[index] : null;
    }

    function getFirstTransitStepIndex(steps) {
        if (!Array.isArray(steps)) {
            return -1;
        }

        for (var i = 0; i < steps.length; i++) {
            var step = steps[i];

            if (isWalkingStep(step)) {
                continue;
            }

            if (isBusStep(step) || isSubwayStep(step)) {
                return i;
            }
        }

        return -1;
    }

    function getBoardingStopName(step) {
        return Array.isArray(step.stops) && step.stops.length ? String(step.stops[0]) : "";
    }

    function getNextStopName(step) {
        return Array.isArray(step.stops) && step.stops.length > 1 ? String(step.stops[1]) : "";
    }

    function getBoardingRouteName(step) {
        if (!Array.isArray(step.vehicles)) {
            return "";
        }

        var vehicle = step.vehicles.find(function (item) {
            return item && item.name;
        });

        return vehicle && vehicle.name ? String(vehicle.name) : "";
    }

    function updateBusArrivalSlots(cacheKey, json) {
        var $targets = $('.bus-arrival-slot[data-realtime-key="' + escapeSelectorValue(cacheKey) + '"]');

        if (!json || !json.success || !json.available || json.status !== "OK") {
            hideBusArrivalSlots(cacheKey);
            return;
        }

        $targets.each(function () {
            renderBusArrivalSlot($(this), json);
        });
    }

    function hideBusArrivalSlots(cacheKey) {
        $('.bus-arrival-slot[data-realtime-key="' + escapeSelectorValue(cacheKey) + '"]')
                .empty()
                .addClass("hidden");
    }

    function renderBusArrivalSlot($slot, realtime) {
        var firstMessage = getArrivalMessage(realtime.firstArrival);
        var secondMessage = getArrivalMessage(realtime.secondArrival);

        if (!firstMessage && !secondMessage) {
            $slot.empty().addClass("hidden");
            return;
        }

        var $timeLine = $("<div>").addClass("bus-arrival-time");

        if (firstMessage) {
            $timeLine.append($("<strong>").text(firstMessage));
        }

        if (secondMessage) {
            if (firstMessage) {
                $timeLine.append(document.createTextNode(" · "));
            }
            $timeLine.append($("<span>").text("다음 버스 " + secondMessage));
        }

        var $tags = $("<div>").addClass("bus-arrival-tags");
        appendArrivalTags($tags, realtime.firstArrival, "");
        appendArrivalTags($tags, realtime.secondArrival, "다음 버스 ");

        $slot.empty().removeClass("hidden").append($timeLine);

        if ($tags.children().length) {
            $slot.append($tags);
        }
    }

    function getArrivalMessage(arrival) {
        if (!arrival) {
            return "";
        }

        var seconds = Number(arrival.seconds);
        if (Number.isFinite(seconds) && seconds >= 0) {
            if (seconds < 60) {
                return "곧 도착";
            }

            return Math.ceil(seconds / 60) + "분 뒤 도착";
        }

        return arrival.message ? $.trim(String(arrival.message)) : "";
    }

    function appendArrivalTags($tags, arrival, prefix) {
        if (!arrival) {
            return;
        }

        if (arrival.lowFloor === true) {
            $tags.append($("<em>").text(prefix + "저상버스"));
        }

        if (arrival.full === true) {
            $tags.append($("<em>").addClass("full").text(prefix + "만차"));
        }
    }

    function updateSubwayArrivalSlots(cacheKey, json) {
        var $targets = $('.subway-arrival-slot[data-realtime-key="' + escapeSelectorValue(cacheKey) + '"]');

        if (!json || !json.success || !json.available || json.status !== "OK" || !Array.isArray(json.arrivals)) {
            hideSubwayArrivalSlots(cacheKey);
            return;
        }

        $targets.each(function () {
            renderSubwayArrivalSlot($(this), json);
        });
    }

    function hideSubwayArrivalSlots(cacheKey) {
        $('.subway-arrival-slot[data-realtime-key="' + escapeSelectorValue(cacheKey) + '"]')
                .empty()
                .addClass("hidden");
    }

    function renderSubwayArrivalSlot($slot, realtime) {
        var target = $slot.data("subway-target");
        var matchedArrivals = findDirectionMatchedSubwayArrivals(realtime.arrivals, target);

        if (!matchedArrivals.length) {
            $slot.empty().addClass("hidden");
            return;
        }

        var firstArrival = matchedArrivals[0];
        var secondArrival = matchedArrivals.length > 1 ? matchedArrivals[1] : null;
        var firstMessage = formatSubwayArrivalMessage(firstArrival);
        var secondMessage = formatSubwayArrivalMessage(secondArrival);

        if (!firstMessage && !secondMessage) {
            $slot.empty().addClass("hidden");
            return;
        }

        var $timeLine = $("<div>").addClass("subway-arrival-time");

        if (firstMessage) {
            $timeLine.append($("<strong>").text(firstMessage));
        }

        if (secondMessage) {
            if (firstMessage) {
                $timeLine.append(document.createTextNode(" · "));
            }
            $timeLine.append($("<span>").text("다음 열차 " + secondMessage));
        }

        var directionLabel = getSubwayDirectionLabel(firstArrival);
        $slot.empty().removeClass("hidden").append($timeLine);

        if (directionLabel) {
            $slot.append($("<div>").addClass("subway-arrival-direction").text(directionLabel));
        }
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
            if (seconds < 60) {
                return "곧 도착";
            }

            return Math.ceil(seconds / 60) + "분 뒤 도착";
        }

        return message;
    }

    function getSubwayDirectionLabel(arrival) {
        if (!arrival) {
            return "";
        }

        var destination = $.trim(String(arrival.destinationStationName || ""));

        if (destination) {
            return destination + "행";
        }

        return $.trim(String(arrival.direction || ""));
    }

    function compareArrivalSeconds(first, second) {
        var a = Number(first);
        var b = Number(second);
        var safeA = Number.isFinite(a) ? a : Number.MAX_SAFE_INTEGER;
        var safeB = Number.isFinite(b) ? b : Number.MAX_SAFE_INTEGER;

        return safeA - safeB;
    }

    function createRealtimeCacheKey(stopName, routeName) {
        return "BUS|" + normalizeRealtimeKey(stopName) + "|" + normalizeRealtimeKey(routeName);
    }

    function createSubwayRealtimeCacheKey(stationName, lineName) {
        return "SUBWAY|" + normalizeRealtimeKey(stationName) + "|" + normalizeRealtimeKey(lineName);
    }

    function normalizeRealtimeKey(value) {
        return $.trim(String(value || "")).replace(/\s+/g, " ");
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
        var matches = text.match(/[가-힣A-Za-z0-9()]+역?/g) || [];
        var stationNames = [];

        matches.forEach(function (match) {
            var stationName = normalizeStationForCompare(match);

            if (stationName && stationNames.indexOf(stationName) < 0) {
                stationNames.push(stationName);
            }
        });

        return stationNames;
    }

    function escapeSelectorValue(value) {
        if ($.escapeSelector) {
            return $.escapeSelector(value);
        }

        return String(value).replace(/(["\\])/g, "\\$1");
    }

    function getSegmentClass(step) {
        var type = (step.type || "").toUpperCase();

        if (type.indexOf("SUBWAY") >= 0) {
            return "subway";
        }

        if (type.indexOf("BUS") >= 0) {
            return "bus";
        }

        return "walking";
    }

    function isBusStep(step) {
        return (step.type || "").toUpperCase().indexOf("BUS") >= 0;
    }

    function isSubwayStep(step) {
        return (step.type || "").toUpperCase().indexOf("SUBWAY") >= 0;
    }

    function isWalkingStep(step) {
        return (step.type || "").toUpperCase().indexOf("WALK") >= 0
                || (!step.vehicles || !step.vehicles.length) && !(step.type || "").toUpperCase().match(/BUS|SUBWAY/);
    }

    function saveSelectedRoute() {
        if (!selectedRoute) {
            setMessage("선택한 경로가 없습니다.");
            return;
        }

        isSavingSelectedRoute = true;
        updateGuideButton(false);

        var finalizedRoute = buildFinalSelectedRoute(selectedRoute);

        try {
            sessionStorage.setItem("selectedRoute", JSON.stringify(finalizedRoute));

            if (!isSelectedRouteSaved(finalizedRoute)) {
                throw new Error("selectedRoute save verification failed");
            }
        } catch (e) {
            isSavingSelectedRoute = false;
            updateGuideButton(true);
            setMessage("?좏깮??寃쎈줈瑜 ??ν븯吏 紐삵뻽?듬땲??");
            return;
        }
        setMessage("경로를 선택했습니다.");
        showSelectedRouteFeedback();
    }

    function showSelectedRouteFeedback() {
        markSelectedRouteCard();
        updateGuideButton(true);
        setMessage("경로가 선택되었습니다.");
    }

    function markSelectedRouteCard() {
        var $cards = $("#routeList .route-card");

        if (selectedRoute.mode === "PUBLIC_TRANSIT") {
            $cards.removeClass("selected");
            $cards.filter(function () {
                return $(this).data("mode") === "PUBLIC_TRANSIT"
                        && Number($(this).data("route-index")) === selectedPublicRouteIndex;
            }).addClass("selected");
            return;
        }

        if (selectedRoute.mode === "WALKING") {
            $cards.removeClass("selected");
            $cards.filter(function () {
                return $(this).data("mode") === "WALKING";
            }).addClass("selected");
        }
    }

    function updateGuideButton(isRouteAvailable) {
        $("#guideButton")
                .prop("disabled", !isRouteAvailable || isSavingSelectedRoute)
                .text(isSavingSelectedRoute ? "선택 완료" : "안내하기");
    }

    function buildFinalSelectedRoute(selection) {
        var route = selection.route || {};
        var routeType = route.type || selection.mode;

        return {
            mode: selection.mode,
            type: routeType,
            selectedAt: Date.now(),
            selectionLabel: selection.selectionLabel || "",
            navigationReady: true,
            nextPath: "/navigation.html",
            origin: normalizeOrigin(currentOrigin),
            destination: normalizeSelectedDestination(selectedDestination),
            route: normalizeRouteForNavigation(route, routeType)
        };
    }

    function normalizeRouteForNavigation(route, routeType) {
        return {
            type: routeType,
            totalTime: safeNumber(route.totalTime),
            totalDistance: safeNumber(route.totalDistance),
            transfers: safeNumber(route.transfers),
            fare: safeNumber(route.fare),
            steps: getValidSteps(route).map(function (step) {
                return {
                    type: step.type || routeType || "WALKING",
                    guidance: step.guidance || "",
                    distance: safeNumber(step.distance),
                    time: safeNumber(step.time),
                    stops: Array.isArray(step.stops) ? step.stops.slice() : [],
                    vehicles: Array.isArray(step.vehicles) ? step.vehicles.slice() : []
                };
            })
        };
    }

    function normalizeOrigin(origin) {
        return {
            latitude: origin && origin.latitude != null ? origin.latitude : null,
            longitude: origin && origin.longitude != null ? origin.longitude : null,
            accuracy: origin && origin.accuracy != null ? origin.accuracy : null,
            capturedAt: origin && origin.capturedAt != null ? origin.capturedAt : null
        };
    }

    function normalizeSelectedDestination(destination) {
        return {
            id: destination && destination.id || "",
            placeName: destination && destination.placeName || "",
            categoryName: destination && destination.categoryName || "",
            addressName: destination && destination.addressName || "",
            roadAddressName: destination && destination.roadAddressName || "",
            longitude: destination && destination.longitude || "",
            latitude: destination && destination.latitude || "",
            phone: destination && destination.phone || "",
            placeUrl: destination && destination.placeUrl || ""
        };
    }

    function isSelectedRouteSaved(expectedRoute) {
        var savedRoute = readJson("selectedRoute");

        return !!savedRoute
                && savedRoute.selectedAt === expectedRoute.selectedAt
                && savedRoute.type === expectedRoute.type
                && !!savedRoute.route
                && Array.isArray(savedRoute.route.steps);
    }

    function readJson(key) {
        var raw = sessionStorage.getItem(key);

        if (!raw) {
            return null;
        }

        try {
            return JSON.parse(raw);
        } catch (e) {
            return null;
        }
    }

    function formatMinutes(seconds) {
        return "약 " + Math.max(secondsToMinutes(seconds), 1) + "분";
    }

    function formatArrival(seconds) {
        var date = new Date(Date.now() + safeNumber(seconds) * 1000);
        var hours = date.getHours();
        var minutes = date.getMinutes();
        var period = hours < 12 ? "오전" : "오후";
        var displayHours = hours % 12 || 12;

        return period + " " + displayHours + "시 " + minutes + "분 도착";
    }

    function formatDistance(distance) {
        var meters = safeNumber(distance);

        if (meters < 1000) {
            return meters + "m";
        }

        return (meters / 1000).toFixed(1) + "km";
    }

    function formatWon(value) {
        return safeNumber(value).toLocaleString("ko-KR") + "원";
    }

    function secondsToMinutes(seconds) {
        return Math.ceil(safeNumber(seconds) / 60);
    }

    function clamp(value, min, max) {
        return Math.min(Math.max(value, min), max);
    }

    function safeNumber(value) {
        var number = Number(value);

        return Number.isFinite(number) ? number : 0;
    }

    function setMessage(message) {
        $("#compareMessage").text(message);
    }
})(jQuery);
