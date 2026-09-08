(function ($) {
    $(function () {
        checkSession();

        $(".route-search-link").on("click", function () {
            window.location.href = "/route-search.html";
        });

        $(".action-card").not(".route-search-link").on("click", function () {
            setMessage($(this).data("ready-message") || "다음 단계에서 연결 예정입니다.");
        });

        $(".favorite-places-link").on("click", function () {
            window.location.href = "/route-search.html?view=favorites";
        });

        $("#homeNavButton").on("click", function () {
            window.location.href = "/user-home.html";
        });

        $("#settingNavButton").on("click", function () {
            setMessage("USER 설정 화면을 찾을 수 없습니다.");
        });

        $(".logout-button").on("click", function () {
            logout();
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

                $("#userHomePage").removeClass("hidden");
                loadHomeInfo();
                renderNotificationSummary();
            },
            error: function () {
                window.location.replace("/login.html");
            }
        });
    }

    function loadHomeInfo() {
        $.ajax({
            url: "/user/home-info",
            type: "get",
            dataType: "JSON",
            success: function (json) {
                if (!json.success) {
                    window.location.replace("/login.html");
                    return;
                }

                if (json.linkedName) {
                    $("#linkedGuardianText").text("연결된 보호자가 있어요");
                } else {
                    $("#linkedGuardianText").text("연결된 보호자가 없습니다");
                }
            },
            error: function () {
                $("#linkedGuardianText").text("연결 상태를 확인할 수 없습니다");
            }
        });
    }

    function renderNotificationSummary() {
        $("#notificationSummaryText").text("새로운 알림이 없어요");
    }

    function logout() {
        $.ajax({
            url: "/user/logout",
            type: "post",
            dataType: "JSON",
            success: function () {
                window.location.replace("/login.html");
            },
            error: function () {
                setMessage("로그아웃 처리 중 오류가 발생했습니다.");
            }
        });
    }

    function setMessage(message) {
        $("#homeMessage").text(message);
    }
})(jQuery);
