(function ($) {
    $(function () {
        checkSession();

        $(".action-card").on("click", function () {
            setMessage($(this).data("ready-message") || "다음 단계에서 연결 예정입니다.");
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

                if (json.userRole !== "GUARDIAN") {
                    window.location.replace("/user-home.html");
                    return;
                }

                $("#guardianHomePage").removeClass("hidden");
                loadHomeInfo();
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
                    $("#linkedUserName").text(json.linkedName);
                } else {
                    $("#linkedUserName").text("연결된 사용자가 없습니다");
                }
            },
            error: function () {
                $("#linkedUserName").text("연결 상태를 확인할 수 없습니다");
            }
        });
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
        $("#guardianMessage").text(message);
    }
})(jQuery);
