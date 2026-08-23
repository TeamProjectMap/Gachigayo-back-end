(function ($) {
    var selectedDestination = null;
    var currentOrigin = null;
    var routeSearchResult = null;
    var publicTransitRoutes = [];
    var selectedPublicRouteIndex = null;
    var activeTab = null;
    var selectedRoute = null;

    $(function () {
        checkSession();

        $("#backButton").on("click", function () {
            window.location.href = "/place-detail.html";
        });

        $(".route-tab").on("click", function () {
            selectTab($(this).data("tab"));
        });

        $("#guideButton").on("click", function () {
            saveSelectedRoute();
        });

        $("#routeList").on("click", ".route-card", function () {
            var mode = $(this).data("mode");

            if (mode === "PUBLIC_TRANSIT") {
                selectedPublicRouteIndex = Number($(this).data("route-index"));
                selectedRoute = {
                    mode: "PUBLIC_TRANSIT",
                    route: publicTransitRoutes[selectedPublicRouteIndex]
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
        publicTransitRoutes = getPublicTransitRoutes(routeSearchResult.publicTransit);
        $("#routeComparePage").removeClass("hidden");

        if (publicTransitRoutes.length) {
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

    function getPublicTransitRoutes(publicTransit) {
        if (!publicTransit || !publicTransit.available || !publicTransit.routes || !publicTransit.routes.length) {
            return [];
        }

        return publicTransit.routes;
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

        if (!publicTransitRoutes.length) {
            selectedRoute = null;
            $("#guideButton").prop("disabled", true);
            $list.append($("<div>").addClass("empty-card").text("이 목적지까지 이용 가능한 대중교통 경로를 찾지 못했습니다."));
            return;
        }

        if (selectedPublicRouteIndex === null || !publicTransitRoutes[selectedPublicRouteIndex]) {
            selectedPublicRouteIndex = 0;
        }

        selectedRoute = {
            mode: "PUBLIC_TRANSIT",
            route: publicTransitRoutes[selectedPublicRouteIndex]
        };
        $("#guideButton").prop("disabled", false);

        $.each(publicTransitRoutes, function (index, route) {
            var $card = $("<button>")
                    .attr("type", "button")
                    .addClass("route-card")
                    .toggleClass("selected", index === selectedPublicRouteIndex)
                    .data("mode", "PUBLIC_TRANSIT")
                    .data("route-index", index);

            $card.append($("<span>").addClass("route-card-label").text("대중교통 경로 " + (index + 1)));
            $card.append(createTimeBlock(route.totalTime));
            $card.append(createMeta(route));
            $card.append(createSegmentBar(route.steps || []));
            $card.append($("<div>").addClass("route-summary").text(createTransitSummary(route)));
            $card.append(createTransitDetails(route.steps || []));

            $list.append($card);
        });
    }

    function renderWalking() {
        var $list = $("#routeList");
        $list.empty();

        if (!routeSearchResult.walking || !routeSearchResult.walking.available) {
            selectedRoute = null;
            $("#guideButton").prop("disabled", true);
            $list.append($("<div>").addClass("empty-card").text("이 목적지까지 이용 가능한 도보 경로를 찾지 못했습니다."));
            return;
        }

        selectedRoute = {
            mode: "WALKING",
            route: routeSearchResult.walking
        };
        $("#guideButton").prop("disabled", false);

        var walking = routeSearchResult.walking;
        var $card = $("<button>")
                .attr("type", "button")
                .addClass("route-card selected")
                .data("mode", "WALKING");

        $card.append($("<span>").addClass("route-card-label").text("걸어서 이동"));
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

        $.each(steps, function (_, step) {
            if (detailCount >= 4) {
                return false;
            }

            var text = createStepText(step);
            if (text) {
                $list.append($("<li>").append($("<span>").addClass("step-main").text(text)));
                detailCount++;
            }
        });

        return $list;
    }

    function createWalkingDetails(steps) {
        var $list = $("<ul>").addClass("route-detail-list");
        var shown = 0;

        $.each(steps, function (_, step) {
            if (shown >= 4) {
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
            return "WALKING · 도보 " + formatMinutes(step.time);
        }

        var vehicleName = getVehicleName(step);
        var stopsText = getStopsText(step.stops || []);
        var typeName = getTransitTypeName(step.type);
        var baseText = vehicleName || step.guidance || typeName;

        if (baseText && stopsText) {
            return typeName + " · " + baseText + " · " + stopsText;
        }

        return typeName ? typeName + " · " + (baseText || stopsText || "") : baseText || stopsText || null;
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
            return "SUBWAY";
        }

        if (normalized.indexOf("BUS") >= 0) {
            return "BUS";
        }

        return "";
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

    function isWalkingStep(step) {
        return (step.type || "").toUpperCase().indexOf("WALK") >= 0
                || (!step.vehicles || !step.vehicles.length) && !(step.type || "").toUpperCase().match(/BUS|SUBWAY/);
    }

    function saveSelectedRoute() {
        if (!selectedRoute) {
            setMessage("선택한 경로가 없습니다.");
            return;
        }

        sessionStorage.setItem("selectedRoute", JSON.stringify({
            mode: selectedRoute.mode,
            selectedAt: Date.now(),
            route: selectedRoute.route
        }));
        setMessage("경로를 선택했습니다.");
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

    function safeNumber(value) {
        var number = Number(value);

        return Number.isFinite(number) ? number : 0;
    }

    function setMessage(message) {
        $("#compareMessage").text(message);
    }
})(jQuery);
