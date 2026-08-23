(function ($) {

    // 위치를 오래 기다리면 급할 때 답답해서 10초까지만 기다린다
    var LOCATION_TIMEOUT = 10000;

    var selectedMessage = null;

    $(function () {
        checkSession();

        $("#backButton, #homeButton").on("click", function () {
            window.location.href = "/user-home.html";
        });

        $(".help-card-link").on("click", function () {
            window.location.href = "/help-card.html";
        });

        $(".reason").on("click", function () {
            selectReason($(this));
        });

        $("#helpButton").on("click", function () {
            sendHelpRequest($(this));
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

                $("#helpPage").removeClass("hidden");
            },
            error: function () {
                window.location.replace("/login.html");
            }
        });
    }

    /** 같은 항목을 다시 누르면 선택이 풀린다 */
    function selectReason($button) {
        var message = $button.data("message");

        if (selectedMessage === message) {
            selectedMessage = null;
            $button.removeClass("selected");
            return;
        }

        selectedMessage = message;
        $(".reason").removeClass("selected");
        $button.addClass("selected");
    }

    /* ---------------------------- 도움 요청 ---------------------------- */

    function sendHelpRequest($button) {
        if (!navigator.geolocation) {
            setMessage("이 기기에서는 위치를 확인할 수 없습니다.");
            return;
        }

        $button.prop("disabled", true).text("위치를 확인하고 있어요...");

        navigator.geolocation.getCurrentPosition(
                function (position) {
                    postHelpRequest($button, position.coords.latitude, position.coords.longitude);
                },
                function () {
                    // 위치 없이 보내면 보호자가 찾아갈 수 없어 보내지 않는다
                    setMessage("위치를 확인할 수 없어 요청을 보내지 못했습니다. 위치 권한을 켜주세요.");
                    resetButton($button);
                },
                { enableHighAccuracy: true, timeout: LOCATION_TIMEOUT, maximumAge: 0 });
    }

    function postHelpRequest($button, latitude, longitude) {
        $button.text("보내는 중...");

        $.ajax({
            url: "/event/help",
            type: "post",
            dataType: "JSON",
            data: {
                latitude: latitude,
                longitude: longitude,
                message: selectedMessage
            },
            success: function (json) {
                if (!json.success) {
                    setMessage(json.message || "도움요청을 보내지 못했습니다.");
                    resetButton($button);
                    return;
                }

                showDone(json);
            },
            error: function () {
                setMessage("도움요청을 보내는 중 오류가 발생했습니다.");
                resetButton($button);
            }
        });
    }

    function showDone(json) {
        $("#requestSection").addClass("hidden");
        $("#doneSection").removeClass("hidden");

        if (!json.notified) {
            $("#doneTitle").text("도움요청을 기록했어요");
            $("#doneDesc").text("연결된 보호자가 없어 전달되지는 않았습니다");
            return;
        }

        $("#doneTitle").text(json.guardianName + "님에게 알렸어요");
        $("#doneDesc").text("보호자가 확인할 때까지 이 자리에서 기다려주세요");

        if (json.guardianPhone) {
            $("#callButton")
                    .attr("href", "tel:" + json.guardianPhone)
                    .removeClass("hidden");
        }
    }

    function resetButton($button) {
        $button.prop("disabled", false).text("도움 요청하기");
    }

    function setMessage(message) {
        $("#helpMessage").text(message);
    }
})(jQuery);
