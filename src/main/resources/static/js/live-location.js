(function ($) {

    // 이동 중일 때 위치를 다시 받아오는 간격
    var REFRESH_INTERVAL = 15000;

    var refreshTimer = null;

    var map = null;
    var overlays = [];
    var pathLine = null;

    $(function () {
        checkSession();

        $("#backButton").on("click", function () {
            window.location.href = "/guardian-home.html";
        });

        $("#refreshButton").on("click", function () {
            loadLive(false);
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

                if (json.userRole !== "GUARDIAN") {
                    window.location.replace("/user-home.html");
                    return;
                }

                $("#livePage").removeClass("hidden");
                loadLive(false);
            },
            error: function () {
                window.location.replace("/login.html");
            }
        });
    }

    /* ---------------------------- 조회 ---------------------------- */

    /**
     * @param isRefresh 자동 갱신으로 부른 것인지.
     *                  자동 갱신은 조용히 실패해야 해서 오류 문구를 띄우지 않는다.
     */
    function loadLive(isRefresh) {
        $.ajax({
            url: "/guardian/live",
            type: "get",
            dataType: "JSON",
            success: function (json) {
                if (!json.success) {
                    if (!isRefresh) {
                        setMessage(json.message, false);
                    }
                    return;
                }

                render(json);

                // 이동 중일 때만 계속 다시 불러온다
                if (json.moving) {
                    startRefresh();
                } else {
                    stopRefresh();
                }
            },
            error: function () {
                if (!isRefresh) {
                    setMessage("위치를 불러오는 중 오류가 발생했습니다.", false);
                }
            }
        });
    }

    function startRefresh() {
        if (refreshTimer !== null) {
            return;
        }

        refreshTimer = window.setInterval(function () {
            // 다른 탭을 보고 있으면 굳이 부르지 않는다
            if (!document.hidden) {
                loadLive(true);
            }
        }, REFRESH_INTERVAL);
    }

    function stopRefresh() {
        if (refreshTimer === null) {
            return;
        }

        window.clearInterval(refreshTimer);
        refreshTimer = null;
    }

    function render(json) {
        var name = json.linkedUserName || "사용자";

        if (!json.moving) {
            $("#liveTitle").text(name + "님은 이동 중이 아니에요");
            $("#startName").text("-");
            $("#endName").text("-");
            $("#currentPlace").text("이동 정보 없음");
            $("#checkpoint").text("-");
            $("#arrival").text("-");
            setMapMessage("이동을 시작하면 위치가 표시됩니다");
            return;
        }

        $("#liveTitle").text(name + "님 현재 이동 중");
        $("#startName").text(json.startName || "-");
        $("#endName").text(json.endName || "-");

        $("#currentPlace").text(buildCurrentPlace(json));
        $("#checkpoint").text(buildCheckpoint(json));
        $("#arrival").text(buildArrival(json));

        showMap(json);
    }

    function buildCurrentPlace(json) {
        if (json.currentPlaceName) {
            return json.currentPlaceName;
        }

        if (json.currentLat && json.currentLng) {
            return json.currentLat + ", " + json.currentLng;
        }

        return "아직 위치가 들어오지 않았어요";
    }

    function buildCheckpoint(json) {
        if (!json.nextCheckpointName) {
            return "없음";
        }

        if (json.nextCheckpointDistance === null || json.nextCheckpointDistance === undefined) {
            return json.nextCheckpointName;
        }

        return json.nextCheckpointName + " (" + json.nextCheckpointDistance + "m)";
    }

    function buildArrival(json) {
        if (json.remainMinutes === null || json.remainMinutes === undefined) {
            return "정보 없음";
        }

        if (json.remainMinutes <= 0) {
            return "곧 도착";
        }

        var remain = "약 " + json.remainMinutes + "분";

        return json.arrivalTime ? json.arrivalTime + " (" + remain + ")" : remain;
    }

    /* ---------------------------- 지도 ---------------------------- */

    function showMap(json) {
        if (!json.currentLat || !json.currentLng) {
            setMapMessage("아직 위치가 들어오지 않았어요");
            return;
        }

        $.ajax({
            url: "/map/config",
            type: "get",
            dataType: "JSON",
            success: function (config) {
                if (!config || !config.success || !config.available || !config.javascriptKey) {
                    setMapMessage("지도를 사용할 수 없어요");
                    return;
                }

                loadKakaoMap(config.javascriptKey, json);
            },
            error: function () {
                setMapMessage("지도를 불러오지 못했어요");
            }
        });
    }

    function loadKakaoMap(javascriptKey, json) {
        if (window.kakao && window.kakao.maps) {
            window.kakao.maps.load(function () {
                drawMap(json);
            });
            return;
        }

        var script = document.createElement("script");
        script.src = "https://dapi.kakao.com/v2/maps/sdk.js?appkey="
                + encodeURIComponent(javascriptKey)
                + "&autoload=false";
        script.async = true;

        script.onload = function () {
            window.kakao.maps.load(function () {
                drawMap(json);
            });
        };

        script.onerror = function () {
            setMapMessage("지도를 불러오지 못했어요");
        };

        document.head.appendChild(script);
    }

    /**
     * 지금 있는 자리는 빨간 점, 체크포인트는 번호로 찍는다.
     * 경로를 걸으며 기록해둔 구간이 있으면 선으로 이어준다.
     */
    function drawMap(json) {
        var mapArea = document.getElementById("liveMap");

        if (!mapArea) {
            return;
        }

        $("#mapMessage").remove();

        var now = new window.kakao.maps.LatLng(json.currentLat, json.currentLng);

        if (map === null) {
            map = new window.kakao.maps.Map(mapArea, { center: now, level: 4 });
        }

        clearOverlays();

        var bounds = new window.kakao.maps.LatLngBounds();
        bounds.extend(now);

        var steps = json.steps || [];
        var path = [];

        $.each(steps, function (index, step) {
            var position = new window.kakao.maps.LatLng(step.lat, step.lng);
            path.push(position);
            bounds.extend(position);

            overlays.push(new window.kakao.maps.CustomOverlay({
                map: map,
                position: position,
                content: '<span class="map-pin">' + (index + 1) + "</span>",
                yAnchor: 0.5
            }));
        });

        if (path.length > 1) {
            pathLine = new window.kakao.maps.Polyline({
                map: map,
                path: path,
                strokeWeight: 5,
                strokeColor: "#018B38",
                strokeOpacity: 0.8
            });
        }

        // 현재 위치를 마지막에 올려 다른 표시에 가리지 않게 한다
        overlays.push(new window.kakao.maps.CustomOverlay({
            map: map,
            position: now,
            content: '<span class="map-now"></span>',
            yAnchor: 0.5,
            zIndex: 10
        }));

        if (steps.length) {
            map.setBounds(bounds);
        } else {
            map.setCenter(now);
        }
    }

    function clearOverlays() {
        $.each(overlays, function (index, overlay) {
            overlay.setMap(null);
        });
        overlays = [];

        if (pathLine !== null) {
            pathLine.setMap(null);
            pathLine = null;
        }
    }

    function setMapMessage(message) {
        $("#mapMessage").text(message);
    }

    function setMessage(message, success) {
        $("#liveMessage").text(message || "").toggleClass("error", success === false);
    }
})(jQuery);
