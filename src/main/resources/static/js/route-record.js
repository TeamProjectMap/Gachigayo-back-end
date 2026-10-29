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

        // 걷는 구간만 기록한다. 기록은 촬영 화면에서 사진을 남기는 것으로 한다.
        if (step.walking) {
            $card.append(createPhotoList(step));
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

        var text = step.recorded ? "기록되었어요" : "아직 기록되지 않았어요";

        if (step.photos && step.photos.length) {
            text += " · 사진 " + step.photos.length + "장";
        }

        return text;
    }

    /* ---------------------------- 구간 사진 ---------------------------- */

    /** 찍어둔 사진 미리보기. 누르면 촬영 화면으로 간다. */
    function createPhotoList(step) {
        var $list = $("<div>").addClass("photo-list");

        if (!step.photos || !step.photos.length) {
            return $list;
        }

        $.each(step.photos, function (index, photo) {
            $list.append($("<div>")
                    .addClass("photo-item")
                    .append($("<img>")
                            .attr("src", photo.photoUrl)
                            .attr("alt", photo.title || "경로 사진"))
                    .on("click", function () {
                        goToPhotoScreen(step.routeStepId);
                    }));
        });

        return $list;
    }

    /**
     * 구간 기록 버튼.
     * 누르면 촬영 화면으로 간다. 거기서 사진을 남기면 기록된 것으로 본다.
     */
    function createRecordButton(step) {
        if (!step.recorded) {
            return $("<button>")
                    .attr("type", "button")
                    .addClass("step-button")
                    .text("이 구간 기록하기")
                    .on("click", function () {
                        goToPhotoScreen(step.routeStepId);
                    });
        }

        // 기록이 끝난 구간은 상태를 보여주고, 옆에서 사진을 고칠 수 있게 한다
        return $("<div>")
                .addClass("step-actions")
                .append($("<span>")
                        .addClass("step-button done")
                        .text("이 구간 기록 완료"))
                .append($("<button>")
                        .attr("type", "button")
                        .addClass("step-button edit")
                        .text("편집")
                        .on("click", function () {
                            goToPhotoScreen(step.routeStepId);
                        }));
    }

    function goToPhotoScreen(routeStepId) {
        window.location.href = "/route-photo.html?stepId=" + routeStepId;
    }

    function setMessage(message, success) {
        $("#recordMessage").text(message || "").toggleClass("error", success === false);
    }
})(jQuery);
