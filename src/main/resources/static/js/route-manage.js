(function ($) {

    $(function () {
        checkSession();

        $("#homeButton").on("click", function () {
            window.location.href = "/guardian-home.html";
        });

        $("#settingButton").on("click", function () {
            window.location.href = "/settings.html";
        });

        $("#newRouteButton").on("click", function () {
            window.location.href = "/route-new.html";
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

                $("#routePage").removeClass("hidden");
                loadRoutes();
            },
            error: function () {
                window.location.replace("/login.html");
            }
        });
    }

    function loadRoutes() {
        $.ajax({
            url: "/route/list",
            type: "get",
            dataType: "JSON",
            success: function (json) {
                if (!json.success) {
                    setMessage(json.message, false);
                    return;
                }

                // 연결된 사용자가 없으면 경로를 등록할 대상이 없다
                if (!json.linked) {
                    $("#routeEmpty").html("연결된 사용자가 없어요.<br>설정에서 먼저 연결해주세요.").removeClass("hidden");
                    $("#newRouteButton").prop("disabled", true);
                    return;
                }

                render(json.routes);
            },
            error: function () {
                setMessage("경로를 불러오는 중 오류가 발생했습니다.", false);
            }
        });
    }

    function render(routes) {
        if (!routes || !routes.length) {
            $("#routeEmpty").removeClass("hidden");
            return;
        }

        var $list = $("#routeList");

        $.each(routes, function (index, route) {
            $list.append(createItem(route));
        });
    }

    function createItem(route) {
        var $text = $("<div>")
                .append($("<strong>").addClass("route-name").text(route.routeName))
                .append($("<span>").addClass("route-sub").text("최근 수정 " + (route.updatedText || "-")));

        return $("<li>").append($("<button>")
                .attr("type", "button")
                .addClass("route-item")
                .append($text)
                .append($("<span>").addClass("route-arrow").text("›"))
                .on("click", function () {
                    window.location.href = "/route-record.html?id=" + route.routeId;
                }));
    }

    function setMessage(message, success) {
        $("#routeMessage").text(message || "").toggleClass("error", success === false);
    }
})(jQuery);
