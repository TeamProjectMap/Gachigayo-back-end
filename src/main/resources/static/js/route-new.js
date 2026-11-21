(function ($) {

    // 출발지 / 도착지에 고른 장소
    var picked = {
        start: null,
        end: null
    };

    // 칸마다 따로: 글자 칠 때 잠깐 멈추면 찾고, 늦게 온 예전 결과는 버린다
    var searchTimers = {};
    var searchRevisions = { start: 0, end: 0 };

    // 경로 선택 화면(route-choose.html)에 넘겨주는 입력 내용
    var DRAFT_KEY = "guardianRouteDraft";

    $(function () {
        checkSession();

        $("#backButton").on("click", function () {
            try {
                sessionStorage.removeItem(DRAFT_KEY);
            } catch (e) {}
            window.location.href = "/route-manage.html";
        });

        // 출발지·도착지 칸에서 바로 검색 (다른 화면으로 넘어가지 않는다)
        $(".place-search").each(function () {
            var $box = $(this);
            var target = $box.data("target");
            var $input = $box.find(".place-search-input");

            $input.on("input", function () {
                // 고른 뒤에 글자를 고치면 다시 골라야 한다
                picked[target] = null;
                window.clearTimeout(searchTimers[target]);
                searchTimers[target] = window.setTimeout(function () {
                    searchPlaces(target, true);
                }, 250);
            });

            $input.on("keydown", function (event) {
                if (event.key === "Enter" && !event.originalEvent.isComposing) {
                    event.preventDefault();
                    window.clearTimeout(searchTimers[target]);
                    searchPlaces(target, false);
                } else if (event.key === "Escape") {
                    closeList(target);
                }
            });

            // 다시 누르면 아직 안 골랐을 때 목록을 다시 보여준다
            $input.on("focus", function () {
                if (!picked[target] && $input.val().trim().length >= 2) {
                    searchPlaces(target, true);
                }
            });
        });

        // 칸 밖을 누르면 목록을 닫는다
        $(document).on("pointerdown", function (event) {
            $(".place-search").each(function () {
                if (!this.contains(event.target)) {
                    closeList($(this).data("target"));
                }
            });
        });

        $("#saveButton").on("click", function () {
            showOptions();
        });

        $("#startHereButton").on("click", useCurrentLocation);

        restoreDraft();
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

    function box(target) {
        return $('.place-search[data-target="' + target + '"]');
    }

    /** @param typing 글자를 치는 중이면 true: 두 글자 미만이거나 자음·모음만 있으면 아직 찾지 않는다 */
    function searchPlaces(target, typing) {
        var query = box(target).find(".place-search-input").val().trim();
        var revision = ++searchRevisions[target];

        if (!query || (typing && (query.length < 2 || /[ㄱ-ㅎㅏ-ㅣ]/.test(query)))) {
            renderPlaces(target, [], query);
            if (!query && !typing) {
                setMessage("검색어를 입력해주세요.", false);
            }
            return;
        }

        $.ajax({
            url: "/route/places",
            type: "get",
            dataType: "JSON",
            data: { query: query },
            success: function (json) {
                if (revision !== searchRevisions[target]) {
                    return;
                }
                if (!json.success) {
                    renderPlaces(target, [], query);
                    setMessage(json.message || "검색에 실패했습니다.", false);
                    return;
                }

                renderPlaces(target, json.places, query);
                setMessage(json.places && json.places.length ? "" : "검색 결과가 없습니다.", json.places && json.places.length ? undefined : false);
            },
            error: function () {
                if (revision === searchRevisions[target]) {
                    setMessage("장소 검색 중 오류가 발생했습니다.", false);
                }
            }
        });
    }

    function renderPlaces(target, places, query) {
        var $box = box(target);
        var $list = $box.find(".place-list").empty();
        var open = !!(places && places.length);

        // 목록이 열리면 검색창과 한 칸처럼 붙여 보인다
        $box.toggleClass("is-open", open);

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
                        pickPlace(target, place);
                    })));
        });
    }

    function closeList(target) {
        searchRevisions[target]++;
        renderPlaces(target, [], "");
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

    function pickPlace(target, place) {
        // 칸에 고른 장소 이름을 넣고 목록을 닫는다 (input 이벤트가 아니라 picked는 그대로)
        box(target).find(".place-search-input").val(place.placeName);
        picked[target] = place;
        closeList(target);
        setMessage("");
    }

    /* ---------------------------- 경로 선택으로 ---------------------------- */

    /** "경로 보기": 입력을 확인하고 경로 후보를 고르는 화면(route-choose.html)으로 간다 */
    function showOptions() {
        var routeName = $("#routeName").val().trim();

        if (!routeName) {
            setMessage("경로 이름을 입력해주세요.", false);
            return;
        }

        if (!picked.start || !picked.end) {
            setMessage("출발지와 도착지를 검색해서 목록에서 골라주세요.", false);
            return;
        }

        try {
            sessionStorage.setItem(DRAFT_KEY, JSON.stringify({
                routeName: routeName,
                start: picked.start,
                end: picked.end
            }));
        } catch (e) {
            setMessage("입력한 내용을 넘기지 못했습니다. 다시 시도해주세요.", false);
            return;
        }

        window.location.href = "/route-choose.html";
    }

    /**
     * 출발지를 지금 서 있는 곳으로. 좌표를 주소로 바꿔 출발지 이름으로 쓴다.
     * (주소를 못 찾으면 '현재 위치'라는 이름으로 좌표만 쓴다)
     */
    function useCurrentLocation() {
        var $button = $("#startHereButton");

        if (!navigator.geolocation) {
            setMessage("이 기기에서는 현재 위치를 쓸 수 없어요. 출발지를 검색해주세요.", false);
            return;
        }

        $button.prop("disabled", true).addClass("is-loading");
        setMessage("현재 위치를 찾는 중이에요...", true);

        navigator.geolocation.getCurrentPosition(function (position) {
            var longitude = String(position.coords.longitude);
            var latitude = String(position.coords.latitude);

            $.ajax({
                url: "/route/here",
                type: "get",
                dataType: "JSON",
                data: { longitude: longitude, latitude: latitude },
                complete: function () {
                    $button.prop("disabled", false).removeClass("is-loading");
                },
                success: function (json) {
                    setStartHere(longitude, latitude, json && json.success ? json.addressName : "");
                },
                error: function () {
                    setStartHere(longitude, latitude, "");
                }
            });
        }, function (error) {
            $button.prop("disabled", false).removeClass("is-loading");
            setMessage(error.code === 1
                    ? "위치 권한을 허용해야 현재 위치를 쓸 수 있어요."
                    : "현재 위치를 찾지 못했어요. 다시 눌러주세요.", false);
        }, { enableHighAccuracy: true, timeout: 12000, maximumAge: 15000 });
    }

    function setStartHere(longitude, latitude, address) {
        var place = {
            placeName: address || "현재 위치",
            roadAddressName: address || "",
            addressName: address || "",
            longitude: longitude,
            latitude: latitude
        };
        // input 이벤트가 아니라 picked는 지워지지 않는다
        $("#startInput").val(place.placeName);
        picked.start = place;
        closeList("start");
        setMessage("출발지를 현재 위치로 정했어요.", true);
    }

    /** 경로 선택 화면에서 뒤로 왔을 때 입력했던 내용을 다시 채운다 */
    function restoreDraft() {
        var draft = null;
        try {
            draft = JSON.parse(sessionStorage.getItem(DRAFT_KEY) || "null");
        } catch (e) {
            draft = null;
        }

        if (!draft) {
            return;
        }

        $("#routeName").val(draft.routeName || "");
        $.each(["start", "end"], function (_, target) {
            if (draft[target]) {
                picked[target] = draft[target];
                box(target).find(".place-search-input").val(draft[target].placeName || "");
            }
        });
    }

    function setMessage(message, success) {
        $("#newRouteMessage").text(message || "").toggleClass("error", success === false);
    }
})(jQuery);
