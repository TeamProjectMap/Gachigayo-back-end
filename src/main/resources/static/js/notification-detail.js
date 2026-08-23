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

        if (json.destination) {
            $("#destination").text(json.destination);
            $("#destinationCard").removeClass("hidden");
        }

        // 이용자가 골라 보낸 상황 설명이 있으면 보여준다
        if (json.content && json.notifyType !== "ARRIVED") {
            $("#content").text(json.content);
            $("#contentCard").removeClass("hidden");
        }
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
