(function ($) {

    // 출발지 / 도착지에 고른 장소
    var picked = {
        start: null,
        end: null
    };

    // 지금 검색창이 어느 쪽을 고르는 중인지
    var searchTarget = null;

    $(function () {
        checkSession();

        $("#backButton").on("click", function () {
            window.location.href = "/route-manage.html";
        });

        $(".place-button").on("click", function () {
            openSearch($(this).data("target"));
        });

        $("#searchCloseButton").on("click", function () {
            closeSearch();
        });

        $("#searchButton").on("click", function () {
            searchPlaces();
        });

        $("#searchInput").on("keydown", function (event) {
            if (event.key === "Enter") {
                searchPlaces();
            }
        });

        $("#saveButton").on("click", function () {
            saveRoute($(this));
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

                $("#newRoutePage").removeClass("hidden");
                loadLinkedUser();
            },
            error: function () {
                window.location.replace("/login.html");
            }
        });
    }

    /** 안내 문구에 이용자 이름을 넣는다 */
    function loadLinkedUser() {
        $.ajax({
            url: "/link/status",
            type: "get",
            dataType: "JSON",
            success: function (json) {
                if (json.success && json.linkedName) {
                    $("#guideTitle").text(json.linkedName + "님과 함께 걸으며 기록해요");
                }
            }
        });
    }

    /* ---------------------------- 장소 검색 ---------------------------- */

    function openSearch(target) {
        searchTarget = target;

        $("#searchTitle").text(target === "start" ? "출발지 검색" : "도착지 검색");
        $("#searchInput").val("");
        $("#placeList").empty();
        setSearchMessage("");
        $("#searchLayer").removeClass("hidden");
        $("#searchInput").trigger("focus");
    }

    function closeSearch() {
        $("#searchLayer").addClass("hidden");
        searchTarget = null;
    }

    function searchPlaces() {
        var query = $("#searchInput").val().trim();

        if (!query) {
            setSearchMessage("검색어를 입력해주세요.");
            return;
        }

        $.ajax({
            url: "/route/places",
            type: "get",
            dataType: "JSON",
            data: { query: query },
            success: function (json) {
                if (!json.success) {
                    setSearchMessage(json.message || "검색에 실패했습니다.");
                    return;
                }

                renderPlaces(json.places);
            },
            error: function () {
                setSearchMessage("장소 검색 중 오류가 발생했습니다.");
            }
        });
    }

    function renderPlaces(places) {
        var $list = $("#placeList").empty();

        if (!places || !places.length) {
            setSearchMessage("검색 결과가 없습니다.");
            return;
        }

        setSearchMessage("");

        $.each(places, function (index, place) {
            $list.append($("<li>").append($("<button>")
                    .attr("type", "button")
                    .addClass("place-item")
                    .append($("<strong>").text(place.placeName))
                    .append($("<span>").text(place.roadAddressName || place.addressName || ""))
                    .on("click", function () {
                        pickPlace(place);
                    })));
        });
    }

    function pickPlace(place) {
        picked[searchTarget] = place;

        var $text = searchTarget === "start" ? $("#startText") : $("#endText");
        $text.text(place.placeName).removeClass("placeholder");

        closeSearch();
    }

    /* ---------------------------- 저장 ---------------------------- */

    function saveRoute($button) {
        var routeName = $("#routeName").val().trim();

        if (!routeName) {
            setMessage("경로 이름을 입력해주세요.", false);
            return;
        }

        if (!picked.start || !picked.end) {
            setMessage("출발지와 도착지를 모두 선택해주세요.", false);
            return;
        }

        $button.prop("disabled", true).text("경로를 찾는 중...");

        $.ajax({
            url: "/route",
            type: "post",
            dataType: "JSON",
            data: {
                routeName: routeName,
                startName: picked.start.placeName,
                startLongitude: picked.start.longitude,
                startLatitude: picked.start.latitude,
                endName: picked.end.placeName,
                endLongitude: picked.end.longitude,
                endLatitude: picked.end.latitude
            },
            success: function (json) {
                if (!json.success) {
                    setMessage(json.message || "경로를 등록하지 못했습니다.", false);
                    resetButton($button);
                    return;
                }

                setMessage("경로를 등록했어요. (구간 " + json.stepCount + "개)", true);

                window.setTimeout(function () {
                    window.location.href = "/route-manage.html";
                }, 900);
            },
            error: function () {
                setMessage("경로 등록 중 오류가 발생했습니다.", false);
                resetButton($button);
            }
        });
    }

    function resetButton($button) {
        $button.prop("disabled", false).text("경로 보기");
    }

    function setMessage(message, success) {
        $("#newRouteMessage").text(message || "").toggleClass("error", success === false);
    }

    function setSearchMessage(message) {
        $("#searchMessage").text(message || "");
    }
})(jQuery);
