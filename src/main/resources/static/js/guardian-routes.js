/*
 * 이용자: 보호자가 등록해 준 경로 목록
 *
 * 하나를 고르면 보호자가 고른 경로 그대로 바로 길안내를 시작한다. (이용자가 경로를 다시 고르지 않는다)
 * 길안내는 이 경로 번호로 이동을 잇고, 걷다가 보호자가 찍어 둔 체크포인트 근처에 오면 사진이 뜬다.
 */
(function ($) {

    $(function () {
        $("#backButton").on("click", function () {
            window.location.href = "/user-home.html";
        });

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

                $("#guardianRoutesPage").removeClass("hidden");
                loadRoutes();
            },
            error: function () {
                window.location.replace("/login.html");
            }
        });
    }

    function loadRoutes() {
        $.ajax({
            url: "/trip/guardian-routes",
            type: "get",
            dataType: "JSON",
            success: function (json) {
                if (!json.success) {
                    setMessage(json.message || "경로를 불러오지 못했어요.");
                    return;
                }
                render(json.routes || []);
            },
            error: function () {
                setMessage("경로를 불러오는 중 오류가 발생했어요.");
            }
        });
    }

    function render(routes) {
        var $list = $("#routesList").empty();

        if (!routes.length) {
            $("#routesIntro").addClass("hidden");
            $list.append($("<li>").addClass("routes-empty")
                    .append($("<strong>").text("아직 보호자가 등록한 길이 없어요"))
                    .append($("<p>").text("보호자가 같이 걸으며 길을 등록하면 여기에 보여요.")));
            return;
        }

        $.each(routes, function (_, route) {
            var $button = $("<button>")
                    .attr("type", "button")
                    .addClass("route-card")
                    .on("click", function () {
                        startRoute(route, $(this));
                    });

            $button.append($("<strong>").addClass("route-card-name").text(route.routeName || route.endName));
            $button.append($("<p>").addClass("route-card-path")
                    .append($("<span>").text(route.startName || "출발지"))
                    .append($("<span>").addClass("route-card-arrow").attr("aria-hidden", "true").text("→"))
                    .append($("<span>").addClass("route-card-end").text(route.endName || "도착지")));

            if (route.photoCount > 0) {
                $button.append($("<span>").addClass("route-card-chip")
                        .text("체크포인트 사진 " + route.photoCount + "장"));
            }

            // 길 전체를 저장하기 전에 등록한 경로는 그대로 안내할 수 없다
            if (!route.guideReady) {
                $button.append($("<p>").addClass("route-card-note")
                        .text("보호자가 다시 등록하면 이 길 그대로 안내할 수 있어요"));
            }

            $list.append($("<li>").append($button));
        });
    }

    /**
     * 보호자가 고른 경로 그대로 길안내를 시작한다. (경로를 다시 찾거나 고르지 않는다)
     * 출발지·도착지도 보호자가 등록한 그대로 쓴다.
     */
    function startRoute(route, $button) {
        $button.prop("disabled", true);
        setMessage("길안내를 준비하는 중이에요...", true);

        $.ajax({
            url: "/trip/guardian-routes/" + encodeURIComponent(route.routeId),
            type: "get",
            dataType: "JSON",
            success: function (json) {
                if (!json.success || !json.guide || !json.guide.route) {
                    $button.prop("disabled", false);
                    setMessage(json.message || "경로를 불러오지 못했어요.");
                    return;
                }

                try {
                    var selection = buildSelection(route.routeId, json.guide);
                    sessionStorage.setItem("selectedRoute", JSON.stringify(selection));
                    sessionStorage.setItem("selectedDestination", JSON.stringify(selection.destination));
                    sessionStorage.setItem("currentOrigin", JSON.stringify(selection.origin));
                    // 새 길안내: 진행 상황을 처음부터
                    var key = JourneyState.key(selection);
                    sessionStorage.setItem("navigationProgress", JSON.stringify({
                        routeKey: key,
                        selectedRouteId: key,
                        stepIndex: 0,
                        boarded: [],
                        completed: false,
                        updatedAt: Date.now()
                    }));
                } catch (e) {
                    $button.prop("disabled", false);
                    setMessage("길안내를 준비하지 못했어요. 다시 시도해주세요.");
                    return;
                }

                window.location.href = "/navigation.html";
            },
            error: function () {
                $button.prop("disabled", false);
                setMessage("경로를 불러오는 중 오류가 발생했어요.");
            }
        });
    }

    /** 길안내 화면이 읽는 모양으로 (경로 선택 화면이 만드는 것과 같은 모양) */
    function buildSelection(routeId, guide) {
        var route = guide.route || {};
        var walking = guide.mode === "WALKING";
        var type = walking ? "WALKING" : "PUBLIC_TRANSIT";
        var steps = (route.steps || []).filter(Boolean).map(normalizeStep);

        if (!walking) {
            steps = withAccessWalks(route, steps, guide.start, guide.end);
        }

        return {
            mode: type,
            type: type,
            selectedAt: Date.now(),
            selectionLabel: "GUARDIAN_ROUTE",
            guardianRouteId: routeId,
            navigationReady: true,
            nextPath: "/navigation.html",
            origin: toPlace(guide.start),
            destination: toPlace(guide.end),
            route: {
                type: type,
                totalTime: number(route.totalTime),
                totalDistance: number(route.totalDistance),
                transfers: number(route.transfers),
                fare: number(route.fare),
                geometry: [],
                steps: steps
            }
        };
    }

    function normalizeStep(step) {
        return {
            type: step.type || "WALKING",
            guidance: step.guidance || "",
            easyGuidance: step.easyGuidance || "",
            distance: number(step.distance),
            time: number(step.time),
            longitude: step.longitude != null ? step.longitude : null,
            latitude: step.latitude != null ? step.latitude : null,
            pathPoints: points(step.pathPoints),
            geometry: [],
            stops: Array.isArray(step.stops) ? step.stops.slice() : [],
            vehicles: Array.isArray(step.vehicles) ? step.vehicles.slice() : []
        };
    }

    /**
     * 카카오 대중교통 경로에는 출발지 → 타는 곳, 내린 곳 → 도착지 도보가 빠져 있다.
     * 그대로 안내하면 첫 단계가 바로 '버스 타기'라서, 빠진 시간만큼 앞뒤 도보 단계를 붙인다.
     * (경로 선택 화면 막대와 같은 방식: 직선거리 비율로 앞뒤를 나눈다)
     */
    function withAccessWalks(route, steps, start, end) {
        if (!steps.length) {
            return steps;
        }

        var stepTime = 0;
        var stepDistance = 0;
        $.each(steps, function (_, step) {
            stepTime += Math.max(step.time, 0);
            stepDistance += Math.max(step.distance, 0);
        });

        var missingTime = number(route.totalTime) - stepTime;
        var missingDistance = Math.max(number(route.totalDistance) - stepDistance, 0);
        var firstPoint = firstPathPoint(steps);
        var lastPoint = lastPathPoint(steps);
        var before = firstPoint ? meters(start, firstPoint) : 0;
        var after = lastPoint ? meters(lastPoint, end) : 0;

        if (!Number.isFinite(before)) before = 0;
        if (!Number.isFinite(after)) after = 0;

        var share = before + after > 0 ? before / (before + after) : 0.5;
        var beforeTime = missingTime > 0 ? Math.round(missingTime * share) : 0;
        var afterTime = missingTime > 0 ? missingTime - beforeTime : 0;
        var result = steps.slice();

        // 시간이 비어 있어도 거리가 30m 넘게 떨어져 있으면 걸어가는 단계를 둔다
        if (beforeTime >= 30 || before > 30) {
            var boarding = firstStop(steps);
            result.unshift(walkStep(
                    (boarding || "타는 곳") + "까지 걸어가요",
                    Math.max(beforeTime, Math.round(before / 1.1)),
                    Math.round(missingDistance * share) || Math.round(before),
                    start, firstPoint));
        }
        if (afterTime >= 30 || after > 30) {
            result.push(walkStep(
                    (end && end.placeName ? end.placeName : "도착지") + "까지 걸어가요",
                    Math.max(afterTime, Math.round(after / 1.1)),
                    Math.round(missingDistance * (1 - share)) || Math.round(after),
                    lastPoint, end));
        }
        return result;
    }

    function walkStep(text, time, distance, from, to) {
        var path = points([from, to]);
        return {
            type: "WALKING",
            guidance: text,
            easyGuidance: text,
            distance: distance,
            time: time,
            longitude: null,
            latitude: null,
            pathPoints: path.length === 2 ? path : [],
            geometry: [],
            stops: [],
            vehicles: []
        };
    }

    function firstStop(steps) {
        for (var i = 0; i < steps.length; i++) {
            if (steps[i].stops.length) {
                return steps[i].stops[0];
            }
        }
        return null;
    }

    function firstPathPoint(steps) {
        for (var i = 0; i < steps.length; i++) {
            if (steps[i].pathPoints.length) {
                return steps[i].pathPoints[0];
            }
        }
        return null;
    }

    function lastPathPoint(steps) {
        for (var i = steps.length - 1; i >= 0; i--) {
            var list = steps[i].pathPoints;
            if (list.length) {
                return list[list.length - 1];
            }
        }
        return null;
    }

    function points(source) {
        return (Array.isArray(source) ? source : []).map(function (point) {
            if (!point) {
                return null;
            }
            var latitude = Number(point.latitude != null ? point.latitude : point.lat);
            var longitude = Number(point.longitude != null ? point.longitude : point.lng);
            return Number.isFinite(latitude) && Number.isFinite(longitude)
                    ? { latitude: latitude, longitude: longitude }
                    : null;
        }).filter(Boolean);
    }

    function toPlace(place) {
        place = place || {};
        return {
            id: "",
            placeName: place.placeName || "",
            categoryName: "",
            addressName: "",
            roadAddressName: "",
            longitude: place.longitude != null ? String(place.longitude) : "",
            latitude: place.latitude != null ? String(place.latitude) : "",
            phone: "",
            placeUrl: ""
        };
    }

    function number(value) {
        var n = Number(value);
        return Number.isFinite(n) ? n : 0;
    }

    /** 두 지점 사이 직선거리(m). 좌표가 없으면 아주 큰 값 */
    function meters(a, b) {
        var lat1 = Number(a.latitude), lng1 = Number(a.longitude);
        var lat2 = Number(b.latitude), lng2 = Number(b.longitude);
        if (![lat1, lng1, lat2, lng2].every(Number.isFinite)) {
            return Infinity;
        }
        var rad = Math.PI / 180;
        var dLat = (lat2 - lat1) * rad;
        var dLng = (lng2 - lng1) * rad;
        var h = Math.sin(dLat / 2) * Math.sin(dLat / 2)
                + Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
        return 6371000 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
    }

    /** @param info true면 안내(회색), 아니면 오류(빨강) */
    function setMessage(message, info) {
        $("#routesMessage").text(message || "").toggleClass("info", !!info);
    }
})(jQuery);
