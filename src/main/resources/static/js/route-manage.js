(function ($) {

    // 하단 메뉴 아이콘과 같이 인라인 SVG 로 둔다. 기기마다 모양이 달라지지 않는다
    var TRASH_ICON =
            '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"' +
            ' stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
            '<path d="M4 7h16"/>' +
            '<path d="M10 4h4a1 1 0 0 1 1 1v2H9V5a1 1 0 0 1 1-1z"/>' +
            '<path d="M6 7l1 13a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1l1-13"/>' +
            '<path d="M10 11v6M14 11v6"/>' +
            '</svg>';

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
        // 삭제 후 다시 그리므로 이전 목록을 비우고 시작한다
        var $list = $("#routeList").empty();

        if (!routes || !routes.length) {
            $("#routeEmpty").removeClass("hidden");
            return;
        }

        $("#routeEmpty").addClass("hidden");

        $.each(routes, function (index, route) {
            $list.append(createItem(route));
        });
    }

    function createItem(route) {
        var $text = $("<div>")
                .append($("<strong>").addClass("route-name").text(route.routeName))
                .append($("<span>").addClass("route-sub").text("최근 수정 " + (route.updatedText || "-")));

        var $open = $("<button>")
                .attr("type", "button")
                .addClass("route-item")
                .append($text)
                .append($("<span>").addClass("route-arrow").text("›"))
                .on("click", function () {
                    window.location.href = "/route-record.html?id=" + route.routeId;
                });

        // 지우면 되돌릴 수 없어서 한 번 물어본다
        var $delete = $("<button>")
                .attr("type", "button")
                .attr("aria-label", route.routeName + " 삭제")
                .addClass("route-delete")
                .html(TRASH_ICON)
                .on("click", function () {
                    var ok = window.confirm(
                            "'" + route.routeName + "' 경로를 삭제할까요?\n기록한 구간도 함께 지워집니다.");

                    if (ok) {
                        deleteRoute(route.routeId, $(this));
                    }
                });

        return $("<li>").addClass("route-row").append($open).append($delete);
    }

    function deleteRoute(routeId, $button) {
        $button.prop("disabled", true);

        $.ajax({
            url: "/route/" + routeId + "/delete",
            type: "post",
            dataType: "JSON",
            success: function (json) {
                setMessage(json.message, json.success);

                if (json.success) {
                    loadRoutes();
                    return;
                }

                $button.prop("disabled", false);
            },
            error: function () {
                setMessage("경로 삭제 중 오류가 발생했습니다.", false);
                $button.prop("disabled", false);
            }
        });
    }

    function setMessage(message, success) {
        $("#routeMessage").text(message || "").toggleClass("error", success === false);
    }
})(jQuery);
