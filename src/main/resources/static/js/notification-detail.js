(function ($) {

    var notificationId = null;

    $(function () {
        notificationId = new URLSearchParams(window.location.search).get("id");

        if (!notificationId) {
            window.location.replace("/notifications.html");
            return;
        }

        checkSession();

        $("#backButton").on("click", function () {
            window.location.href = "/notifications.html";
        });

        $("#confirmButton").on("click", function () {
            confirmNotification($(this));
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

                $("#detailPage").removeClass("hidden");
                loadDetail();
            },
            error: function () {
                window.location.replace("/login.html");
            }
        });
    }

    function loadDetail() {
        $.ajax({
            url: "/guardian/notifications/" + notificationId,
            type: "get",
            dataType: "JSON",
            success: function (json) {
                if (!json.success) {
                    setMessage(json.message || "알림을 불러오지 못했습니다.", false);
                    return;
                }

                render(json);
            },
            error: function () {
                setMessage("알림을 불러오는 중 오류가 발생했습니다.", false);
            }
        });
    }

    function render(json) {
        var isHelp = json.notifyType === "HELP_REQUEST";

        // 도움요청이 아니면 경고 느낌을 뺀다
        $("#detailMark").toggleClass("normal", !isHelp);

        $("#detailTitle").text(buildTitle(json));
        $("#detailTime").text(buildTimeText(json));

        if (json.address) {
            $("#address").text(json.address);
            $("#locationCard").removeClass("hidden");
        }

        // 주소를 못 찾았어도 좌표만 있으면 지도는 보여줄 수 있다
        if (json.lat && json.lng) {
            if (!json.address) {
                $("#address").text("주소를 확인할 수 없어요");
                $("#locationCard").removeClass("hidden");
            }

            showMap(Number(json.lat), Number(json.lng));
        }

        // 도움요청은 어디로 가던 중이었는지가 중요해서 비어 있어도 칸을 보여준다
        if (json.destination) {
            $("#destination").text(json.destination);
            $("#destinationCard").removeClass("hidden");
        } else if (isHelp) {
            $("#destination").text("이동 중이 아니었어요");
            $("#destinationCard").removeClass("hidden");
        }

        // 도움요청의 content는 이용자가 주변 사람에게 보여주는 카드 문구라
        // 보호자 화면에는 띄우지 않는다
        if (json.content && !isHelp && json.notifyType !== "ARRIVED") {
            $("#content").text(json.content);
            $("#contentCard").removeClass("hidden");
        }
    }

    /* ---------------------------- 지도 ---------------------------- */

    /**
     * 요청이 들어온 자리를 지도에 찍는다.
     * 지도 키는 서버에서 받아오고, 키가 없거나 불러오지 못하면
     * 주소 글자만 남기고 조용히 넘어간다.
     */
    function showMap(latitude, longitude) {
        $.ajax({
            url: "/map/config",
            type: "get",
            dataType: "JSON",
            success: function (json) {
                if (!json || !json.success || !json.available || !json.javascriptKey) {
                    setMapMessage("지도를 사용할 수 없어요");
                    return;
                }

                loadKakaoMap(json.javascriptKey, latitude, longitude);
            },
            error: function () {
                setMapMessage("지도를 불러오지 못했어요");
            }
        });
    }

    function loadKakaoMap(javascriptKey, latitude, longitude) {
        // 이미 불러와 있으면 스크립트를 또 넣지 않는다
        if (window.kakao && window.kakao.maps) {
            window.kakao.maps.load(function () {
                drawMap(latitude, longitude);
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
                drawMap(latitude, longitude);
            });
        };

        script.onerror = function () {
            setMapMessage("지도를 불러오지 못했어요");
        };

        document.head.appendChild(script);
    }

    function drawMap(latitude, longitude) {
        var mapArea = document.getElementById("mapArea");

        if (!mapArea) {
            return;
        }

        $("#mapMessage").remove();

        var center = new window.kakao.maps.LatLng(latitude, longitude);
        var map = new window.kakao.maps.Map(mapArea, {
            center: center,
            level: 4
        });

        new window.kakao.maps.Marker({
            map: map,
            position: center
        });

        // 보여주기만 하는 작은 지도라 확대/축소는 막아둔다
        map.setZoomable(false);
    }

    function setMapMessage(message) {
        $("#mapMessage").text(message);
    }

    function buildTitle(json) {
        var who = json.linkedUserName ? json.linkedUserName + "님이" : "사용자가";

        switch (json.notifyType) {
            case "HELP_REQUEST":
                return who + " 도움을 요청했어요";
            case "DEPARTURE":
                return who + " 이동을 시작했어요";
            case "CHECKPOINT":
                return "체크포인트를 통과했어요";
            case "DEVIATION":
                return "경로를 벗어났어요";
            case "ARRIVED":
                return json.destination
                        ? json.destination + "에 도착했어요"
                        : "목적지에 도착했어요";
            default:
                return "알림이 도착했어요";
        }
    }

    function buildTimeText(json) {
        if (json.timeText && json.time) {
            return json.timeText + " · " + json.time;
        }

        return json.timeText || json.time || "";
    }

    function confirmNotification($button) {
        $button.prop("disabled", true);

        $.ajax({
            url: "/guardian/notifications/" + notificationId + "/read",
            type: "post",
            dataType: "JSON",
            success: function () {
                window.location.href = "/notifications.html";
            },
            error: function () {
                setMessage("처리 중 오류가 발생했습니다.", false);
                $button.prop("disabled", false);
            }
        });
    }

    function setMessage(message, success) {
        $("#detailMessage").text(message || "").toggleClass("error", success === false);
    }
})(jQuery);
