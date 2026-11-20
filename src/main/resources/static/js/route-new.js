(function ($) {

    // 출발지 / 도착지에 고른 장소
    var picked = {
        start: null,
        end: null
    };

    // 지금 검색창이 어느 쪽을 고르는 중인지
    var searchTarget = null;

    // 글자 칠 때마다 바로 찾지 않고 잠깐 멈추면 찾는다. 늦게 온 예전 결과는 버린다
    var searchTimer = null;
    var searchRevision = 0;

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

        // 이용자 길안내 검색창처럼 글자를 치면 바로 아래에 장소가 뜬다 (엔터는 바로 찾기)
        $("#searchInput").on("input", function () {
            window.clearTimeout(searchTimer);
            searchTimer = window.setTimeout(function () {
                searchPlaces(true);
            }, 250);
        });

        $("#searchInput").on("keydown", function (event) {
            if (event.key === "Enter" && !event.originalEvent.isComposing) {
                window.clearTimeout(searchTimer);
                searchPlaces(false);
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
        renderPlaces([], "");
        setSearchMessage("");
        $("#searchLayer").removeClass("hidden");
        $("#searchInput").trigger("focus");
    }

    function closeSearch() {
        $("#searchLayer").addClass("hidden");
        searchTarget = null;
    }

    /** @param typing 글자를 치는 중이면 true: 두 글자 미만이거나 자음·모음만 있으면 아직 찾지 않는다 */
    function searchPlaces(typing) {
        var query = $("#searchInput").val().trim();
        var revision = ++searchRevision;

        if (!query || (typing && (query.length < 2 || /[ㄱ-ㅎㅏ-ㅣ]/.test(query)))) {
            renderPlaces([], query);
            setSearchMessage(!query && !typing ? "검색어를 입력해주세요." : "");
            return;
        }

        $.ajax({
            url: "/route/places",
            type: "get",
            dataType: "JSON",
            data: { query: query },
            success: function (json) {
                if (revision !== searchRevision) {
                    return;
                }
                if (!json.success) {
                    renderPlaces([], query);
                    setSearchMessage(json.message || "검색에 실패했습니다.");
                    return;
                }

                renderPlaces(json.places, query);
                setSearchMessage(json.places && json.places.length ? "" : "검색 결과가 없습니다.");
            },
            error: function () {
                if (revision === searchRevision) {
                    setSearchMessage("장소 검색 중 오류가 발생했습니다.");
                }
            }
        });
    }

    function renderPlaces(places, query) {
        var $list = $("#placeList").empty();
        var open = !!(places && places.length);

        // 목록이 열리면 검색창과 한 칸처럼 붙여 보인다
        $("#placeSearch").toggleClass("is-open", open);

        $.each(places || [], function (index, place) {
            $list.append($("<li>").append($("<button>")
                    .attr("type", "button")
                    .attr("role", "option")
                    .addClass("place-item")
                    .append($("<span>").addClass("place-item-icon").attr("aria-hidden", "true").text("↗"))
                    .append($("<span>").addClass("place-item-copy")
                            .append(highlight($("<strong>"), place.placeName, query))
                            .append($("<span>").text(place.roadAddressName || place.addressName || "")))
                    .on("click", function () {
                        pickPlace(place);
                    })));
        });
    }

    /** 이름에서 검색어 부분만 초록색으로 */
    function highlight($element, text, query) {
        text = text || "";
        var index = query ? text.indexOf(query) : -1;
        if (index < 0) {
            return $element.text(text);
        }
        return $element
                .append(document.createTextNode(text.slice(0, index)))
                .append($("<mark>").text(text.slice(index, index + query.length)))
                .append(document.createTextNode(text.slice(index + query.length)));
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
