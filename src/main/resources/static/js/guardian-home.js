(function ($) {

    // 알림 종류별 제목 (NOTIFICATIONS.notifyType 기준)
    var NOTIFY_TITLE = {
        DEPARTURE: "출발",
        CHECKPOINT: "체크포인트 통과",
        DEVIATION: "경로 이탈",
        HELP_REQUEST: "도움요청",
        ARRIVED: "도착"
    };

    // 이동 중일 때 화면을 다시 불러오는 간격
    var REFRESH_INTERVAL = 15000;

    var refreshTimer = null;
    var unreadCount = 0;

    $(function () {
        checkSession();

        $(".action-card").on("click", function () {
            setMessage($(this).data("ready-message") || "다음 단계에서 연결 예정입니다.");
        });

        $("#noticeButton, #notificationMore").on("click", function () {
            window.location.href = "/notifications.html";
        });

        $("#routeButton").on("click", function () {
            window.location.href = "/route-manage.html";
        });

        // 설정 화면에서 연결 관리와 로그아웃을 한다
        $("#settingButton").on("click", function () {
            window.location.href = "/settings.html";
        });
    });

    /* ---------------------------- 세션 확인 ---------------------------- */

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

                $("#guardianHomePage").removeClass("hidden");
                loadHomeInfo(false);
            },
            error: function () {
                window.location.replace("/login.html");
            }
        });
    }

    /* ---------------------------- 홈 정보 ---------------------------- */

    /**
     * @param isRefresh 자동 갱신으로 부른 것인지 여부.
     *                  자동 갱신은 조용히 실패해야 해서 오류 문구를 띄우지 않는다.
     */
    function loadHomeInfo(isRefresh) {
        $.ajax({
            url: "/guardian/home",
            type: "get",
            dataType: "JSON",
            success: function (json) {
                if (!json.success) {
                    if (!isRefresh) {
                        setMessage(json.message || "홈 정보를 불러오지 못했습니다.");
                    }
                    return;
                }

                renderLinkedUser(json);
                renderTrip(json);
                renderNotifications(json.notifications, json.unreadCount);

                // 이동 중일 때만 계속 다시 불러온다
                if (json.moving) {
                    startRefresh();
                } else {
                    stopRefresh();
                }
            },
            error: function () {
                if (!isRefresh) {
                    setMessage("홈 정보를 불러오는 중 오류가 발생했습니다.");
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
                loadHomeInfo(true);
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

    /** 연결된 이용자 + 연결 상태 카드 */
    function renderLinkedUser(json) {
        if (!json.linked) {
            $("#linkedUserName").text("연결된 사용자 없음");
            $("#connectionTitle").text("아직 연결된 사용자가 없어요");
            $("#connectionDesc").text("연결코드로 사용자와 연결해주세요");
            return;
        }

        $("#linkedUserName").text(json.linkedUserName);
        $("#connectionTitle").text("사용자와 연결되어 있어요");
        $("#connectionDesc").text("이동을 시작하면 위치가 공유됩니다");
    }

    /**
     * 이동 상태 / 현재 위치 / 체크포인트 / 예상 도착
     *
     * 자동 갱신 중에 이동이 끝날 수도 있어서, 두 경우 모두 값을 끝까지 채운다.
     */
    function renderTrip(json) {
        if (!json.moving) {
            $("#tripStatusBadge").text("이동 정보 없음").addClass("off");
            $("#tripRoute").text("경로 정보 없음");

            $("#currentPlace").text("위치 정보 없음");
            $("#locationTime").text("이동을 시작하면 위치가 공유됩니다");

            $("#checkpointName").text("정보 없음");
            $("#checkpointDistance").text("이동 중이 아닙니다");

            $("#arrivalTime").text("정보 없음");
            $("#arrivalDesc").text("이동 기록이 없습니다");
            return;
        }

        $("#tripStatusBadge").text("이동 중").removeClass("off");
        $("#tripRoute").text(json.startName + " → " + json.endName);

        // 현재 위치 : 장소 이름이 없으면 위경도로 대신 보여준다
        if (json.currentPlaceName) {
            $("#currentPlace").text(json.currentPlaceName);
        } else if (json.currentLat && json.currentLng) {
            $("#currentPlace").text(json.currentLat + ", " + json.currentLng);
        } else {
            $("#currentPlace").text("위치 정보 없음");
        }

        $("#locationTime").text(json.locationTime
                ? json.locationTime + " 업데이트"
                : "아직 위치가 기록되지 않았습니다");

        if (json.nextCheckpointName) {
            $("#checkpointName").text(json.nextCheckpointName);
            $("#checkpointDistance").text(formatDistance(json.nextCheckpointDistance));
        } else {
            $("#checkpointName").text("없음");
            $("#checkpointDistance").text("남은 체크포인트가 없습니다");
        }

        $("#arrivalTime").text(formatRemainMinutes(json.remainMinutes));
        $("#arrivalDesc").text("");
    }

    /** 최근 알림 목록 + 종 아이콘 빨간 점 */
    function renderNotifications(notifications, newUnreadCount) {
        unreadCount = newUnreadCount || 0;
        $("#bellDot").toggleClass("hidden", unreadCount === 0);

        var $list = $("#notificationList");

        if (!notifications || !notifications.length) {
            $list.empty().addClass("hidden");
            $("#notificationEmpty").removeClass("hidden");
            return;
        }

        $list.empty();

        $.each(notifications, function (index, notification) {
            $list.append(createNotificationItem(notification));
        });

        $list.removeClass("hidden");
        $("#notificationEmpty").addClass("hidden");
    }

    function createNotificationItem(notification) {
        var title = NOTIFY_TITLE[notification.notifyType] || "알림";

        var $text = $("<div>")
                .append($("<strong>").text(title));

        if (notification.content) {
            $text.append($("<p>").text(notification.content));
        }

        return $("<li>")
                .addClass("notification-item")
                // 도움요청은 목록에서 바로 눈에 띄어야 한다
                .toggleClass("urgent", notification.notifyType === "HELP_REQUEST")
                .append($text)
                .append($("<span>").addClass("notification-time").text(notification.time || ""));
    }

    /* ---------------------------- 표시 형식 ---------------------------- */

    function formatDistance(distance) {
        if (distance === null || distance === undefined) {
            return "거리 정보 없음";
        }

        if (distance >= 1000) {
            return "약 " + (distance / 1000).toFixed(1) + "km 남음";
        }

        return "약 " + distance + "m 남음";
    }

    function formatRemainMinutes(minutes) {
        if (minutes === null || minutes === undefined) {
            return "정보 없음";
        }

        if (minutes <= 0) {
            return "곧 도착";
        }

        return "약 " + minutes + "분 남음";
    }

    function setMessage(message) {
        $("#guardianMessage").text(message);
    }
})(jQuery);
