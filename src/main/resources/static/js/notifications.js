(function ($) {

    var linkedUserName = null;

    $(function () {
        checkSession();

        $("#backButton").on("click", function () {
            window.location.href = "/guardian-home.html";
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

                $("#notiPage").removeClass("hidden");
                loadNotifications();
            },
            error: function () {
                window.location.replace("/login.html");
            }
        });
    }

    function loadNotifications() {
        $.ajax({
            url: "/guardian/notifications",
            type: "get",
            dataType: "JSON",
            success: function (json) {
                if (!json.success) {
                    setMessage(json.message || "알림을 불러오지 못했습니다.");
                    return;
                }

                linkedUserName = json.linkedUserName;
                render(json.notifications);

                // 목록을 열었으면 확인한 것으로 보고 홈의 빨간 점을 끈다
                markAllRead();
            },
            error: function () {
                setMessage("알림을 불러오는 중 오류가 발생했습니다.");
            }
        });
    }

    function render(notifications) {
        if (!notifications || !notifications.length) {
            $("#notiEmpty").removeClass("hidden");
            return;
        }

        var $list = $("#notiList");

        $.each(notifications, function (index, notification) {
            $list.append(createItem(notification));
        });
    }

    function createItem(notification) {
        var isHelp = notification.notifyType === "HELP_REQUEST";

        var $text = $("<div>")
                .append($("<strong>").addClass("noti-title").text(buildTitle(notification)))
                .append($("<span>").addClass("noti-sub").text(buildSubText(notification)));

        return $("<li>").append($("<button>")
                .attr("type", "button")
                .addClass("noti-item")
                .toggleClass("urgent", isHelp)
                .append($text)
                .append($("<span>").addClass("noti-arrow").text("›"))
                .on("click", function () {
                    window.location.href = "/notification-detail.html?id=" + notification.notificationId;
                }));
    }

    /**
     * 알림 제목은 종류를 보고 만든다.
     * 도착 알림은 목적지 이름이 들어오면 "○○에 도착했어요" 로 보여준다.
     */
    function buildTitle(notification) {
        var who = linkedUserName ? linkedUserName + "님이" : "사용자가";

        switch (notification.notifyType) {
            case "HELP_REQUEST":
                return who + " 도움을 요청했어요";
            case "DEPARTURE":
                return who + " 이동을 시작했어요";
            case "CHECKPOINT":
                return "체크포인트를 통과했어요";
            case "DEVIATION":
                return "경로를 벗어났어요";
            case "ARRIVED":
                return notification.content
                        ? notification.content + "에 도착했어요"
                        : "목적지에 도착했어요";
            default:
                return "알림이 도착했어요";
        }
    }

    /** 시각 + 보충 설명 (예: "어제 12:58 · CU편의점") */
    function buildSubText(notification) {
        var timeText = notification.timeText || "";

        // 도착 알림은 목적지를 제목에 이미 썼다
        if (notification.notifyType === "ARRIVED" || !notification.content) {
            return timeText;
        }

        return timeText + " · " + notification.content;
    }

    function markAllRead() {
        $.ajax({
            url: "/guardian/notifications/read",
            type: "post",
            dataType: "JSON"
        });
    }

    function setMessage(message) {
        $("#notiMessage").text(message);
    }
})(jQuery);
