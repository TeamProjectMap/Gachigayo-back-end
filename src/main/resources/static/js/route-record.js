(function ($) {

    // 위치를 오래 기다리면 답답해서 10초까지만 기다린다
    var LOCATION_TIMEOUT = 10000;

    var routeId = null;

    $(function () {
        routeId = new URLSearchParams(window.location.search).get("id");

        if (!routeId) {
            window.location.replace("/route-manage.html");
            return;
        }

        checkSession();

        $("#backButton").on("click", function () {
            window.location.href = "/route-manage.html";
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

                $("#recordPage").removeClass("hidden");
                loadRoute();
            },
            error: function () {
                window.location.replace("/login.html");
            }
        });
    }

    function loadRoute() {
        $.ajax({
            url: "/route/" + routeId,
            type: "get",
            dataType: "JSON",
            success: function (json) {
                if (!json.success) {
                    setMessage(json.message, false);
                    return;
                }

                render(json);
            },
            error: function () {
                setMessage("경로를 불러오는 중 오류가 발생했습니다.", false);
            }
        });
    }

    function render(json) {
        $("#routeName").text(json.routeName);
        $("#recordSummary").text(
                "걷는 구간 " + json.walkCount + "개 중 " + json.recordedCount + "개 기록 완료");

        var $list = $("#stepList").empty();

        $.each(json.steps, function (index, step) {
            $list.append(createStep(step));
        });
    }

    function createStep(step) {
        var $card = $("<div>")
                .addClass("step-card")
                .toggleClass("transit", !step.walking)
                .append($("<strong>").text(step.title || "구간"))
                .append($("<p>").text(buildSubText(step)));

        // 걷는 구간만 기록한다
        if (step.walking) {
            $card.append(createRecordButton(step));
        }

        return $("<li>")
                .addClass("step-item")
                .append($("<span>").addClass("step-number").text(step.stepOrder))
                .append($card);
    }

    function buildSubText(step) {
        if (!step.walking) {
            return step.mainText || "이동 구간";
        }

        return step.recorded ? "기록되었어요" : "아직 기록되지 않았어요";
    }

    function createRecordButton(step) {
        if (step.recorded) {
            return $("<button>")
                    .attr("type", "button")
                    .addClass("step-button done")
                    .prop("disabled", true)
                    .text("이 구간 기록 완료");
        }

        return $("<button>")
                .attr("type", "button")
                .addClass("step-button")
                .text("이 구간 기록하기")
                .on("click", function () {
                    recordStep($(this), step.routeStepId);
                });
    }

    /**
     * 지금 있는 위치를 그 구간의 위치로 남긴다.
     * 지점별 사진은 다음 단계에서 붙인다.
     */
    function recordStep($button, routeStepId) {
        if (!navigator.geolocation) {
            setMessage("이 기기에서는 위치를 확인할 수 없습니다.", false);
            return;
        }

        $button.prop("disabled", true).text("위치를 확인하고 있어요...");

        navigator.geolocation.getCurrentPosition(
                function (position) {
                    postRecord($button, routeStepId, position.coords.latitude, position.coords.longitude);
                },
                function () {
                    setMessage("위치를 확인할 수 없어 기록하지 못했습니다. 위치 권한을 켜주세요.", false);
                    $button.prop("disabled", false).text("이 구간 기록하기");
                },
                { enableHighAccuracy: true, timeout: LOCATION_TIMEOUT, maximumAge: 0 });
    }

    function postRecord($button, routeStepId, latitude, longitude) {
        $.ajax({
            url: "/route/steps/" + routeStepId + "/record",
            type: "post",
            dataType: "JSON",
            data: { latitude: latitude, longitude: longitude },
            success: function (json) {
                setMessage(json.message, json.success);

                if (json.success) {
                    loadRoute();
                    return;
                }

                $button.prop("disabled", false).text("이 구간 기록하기");
            },
            error: function () {
                setMessage("구간 기록 중 오류가 발생했습니다.", false);
                $button.prop("disabled", false).text("이 구간 기록하기");
            }
        });
    }

    function setMessage(message, success) {
        $("#recordMessage").text(message || "").toggleClass("error", success === false);
    }
})(jQuery);
