(function ($) {

    $(function () {
        checkSession();

        $("#backButton").on("click", function () {
            window.location.href = "/user-home.html";
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

                $("#cardPage").removeClass("hidden");
                loadHelpCard();
            },
            error: function () {
                window.location.replace("/login.html");
            }
        });
    }

    function loadHelpCard() {
        $.ajax({
            url: "/event/help-card",
            type: "get",
            dataType: "JSON",
            success: function (json) {
                if (json.success) {
                    render(json);
                }
            }
        });
    }

    function render(json) {
        $("#userName").text(json.userName ? json.userName + "입니다" : "-");

        // 이동 중일 때만 목적지를 보여준다
        if (json.destination) {
            $("#destination").text(json.destination);
            $("#destinationCard").removeClass("hidden");
        }

        if (!json.guardianName) {
            $("#guardianName").text("없음");
            $("#noGuardian").removeClass("hidden");
            return;
        }

        // 관계를 앞에 붙이면 도와주는 분이 전화할 때 설명하기 쉽다
        $("#guardianName").text(json.relation
                ? json.relation + " " + json.guardianName
                : json.guardianName);

        if (json.guardianPhone) {
            $("#guardianPhone").text(json.guardianPhone);
            $("#callButton")
                    .attr("href", "tel:" + json.guardianPhone)
                    .removeClass("hidden");
        } else {
            $("#noGuardian").text("등록된 연락처가 없습니다").removeClass("hidden");
        }
    }
})(jQuery);
