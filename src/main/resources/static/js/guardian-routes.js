/*
 * 이용자: 보호자가 등록해 준 경로 목록
 *
 * 하나를 고르면 그 도착지를 목적지로 정해 장소 화면(이곳으로 가기)으로 간다.
 * 길안내를 시작하면 서버가 같은 목적지의 보호자 경로를 찾아 이 이동에 잇고,
 * 걷다가 보호자가 찍어 둔 체크포인트 근처에 오면 사진이 뜬다.
 */
(function ($) {

    // 이름으로 다시 찾은 장소가 이 안이면 보호자가 고른 그 장소로 본다 (m)
    var SAME_PLACE_METERS = 300;

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

            $list.append($("<li>").append($button));
        });
    }

    /**
     * 이 경로의 도착지로 길안내를 시작한다.
     * 주소까지 보여주려고 도착지 이름으로 장소를 다시 찾고, 보호자가 등록한 좌표와 가까운 것을 쓴다.
     * 예전 경로처럼 좌표가 없으면 이름으로 찾은 첫 장소를 쓴다.
     */
    function startRoute(route, $button) {
        $button.prop("disabled", true);
        setMessage("");

        $.ajax({
            url: "/map/search",
            type: "get",
            dataType: "JSON",
            data: { query: route.endName },
            success: function (json) {
                var place = pickPlace(route, (json && json.places) || []);
                if (!place) {
                    $button.prop("disabled", false);
                    setMessage("도착지를 찾지 못했어요. 길안내에서 직접 검색해주세요.");
                    return;
                }
                goToPlace(place);
            },
            error: function () {
                // 검색이 안 돼도 좌표가 있으면 그대로 간다
                var place = fromCoordinates(route);
                if (place) {
                    goToPlace(place);
                    return;
                }
                $button.prop("disabled", false);
                setMessage("도착지를 찾는 중 오류가 발생했어요.");
            }
        });
    }

    function pickPlace(route, places) {
        var target = fromCoordinates(route);

        if (!target) {
            return places[0] || null;
        }

        var nearest = null;
        var nearestDistance = Infinity;
        $.each(places, function (_, place) {
            var distance = meters(target, place);
            if (distance < nearestDistance) {
                nearest = place;
                nearestDistance = distance;
            }
        });

        return nearest && nearestDistance <= SAME_PLACE_METERS ? nearest : target;
    }

    function fromCoordinates(route) {
        if (route.endLatitude == null || route.endLongitude == null) {
            return null;
        }
        return {
            placeName: route.endName,
            latitude: String(route.endLatitude),
            longitude: String(route.endLongitude)
        };
    }

    function goToPlace(place) {
        try {
            sessionStorage.setItem("selectedDestination", JSON.stringify(place));
        } catch (e) {
            setMessage("목적지를 저장하지 못했어요. 다시 시도해주세요.");
            return;
        }
        window.location.href = "/place-detail.html?from=guardian-routes";
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

    function setMessage(message) {
        $("#routesMessage").text(message || "");
    }
})(jQuery);
