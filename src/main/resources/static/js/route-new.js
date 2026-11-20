(function ($) {

    // 출발지 / 도착지에 고른 장소
    var picked = {
        start: null,
        end: null
    };

    // 칸마다 따로: 글자 칠 때 잠깐 멈추면 찾고, 늦게 온 예전 결과는 버린다
    var searchTimers = {};
    var searchRevisions = { start: 0, end: 0 };

    // 경로 후보와 고른 후보 번호
    var options = [];
    var chosen = -1;

    $(function () {
        checkSession();

        $("#backButton").on("click", function () {
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
            showOptions($(this));
        });

        // 경로 선택 화면에서 뒤로: 입력한 내용은 그대로 두고 첫 화면으로
        $("#choiceBackButton").on("click", function () {
            $("#choiceView").addClass("hidden");
            $("#formView").removeClass("hidden");
        });

        $("#chooseButton").on("click", function () {
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

    /* ---------------------------- 경로 후보 ---------------------------- */

    /** "경로 보기": 입력을 확인하고 경로 후보를 찾아 고르는 화면을 연다 */
    function showOptions($button) {
        var routeName = $("#routeName").val().trim();

        if (!routeName) {
            setMessage("경로 이름을 입력해주세요.", false);
            return;
        }

        if (!picked.start || !picked.end) {
            setMessage("출발지와 도착지를 검색해서 목록에서 골라주세요.", false);
            return;
        }

        setMessage("");
        $button.prop("disabled", true).text("경로를 찾는 중...");

        $.ajax({
            url: "/route/options",
            type: "get",
            dataType: "JSON",
            data: placeParams(),
            success: function (json) {
                resetButton($button);

                if (!json.success) {
                    setMessage(json.message || "경로를 찾지 못했습니다.", false);
                    return;
                }

                options = buildOptions(json);
                if (!options.length) {
                    setMessage("이동할 수 있는 경로를 찾지 못했습니다.", false);
                    return;
                }

                chosen = 0;
                renderOptions();
                $("#choiceStart").text(picked.start.placeName);
                $("#choiceEnd").text(picked.end.placeName);
                setChoiceMessage("");
                $("#formView").addClass("hidden");
                $("#choiceView").removeClass("hidden");
                window.scrollTo(0, 0);
            },
            error: function () {
                resetButton($button);
                setMessage("경로를 찾는 중 오류가 발생했습니다.", false);
            }
        });
    }

    /** 버스·지하철 후보 + 걷기 하나. routeIndex는 서버가 준 순서 그대로 */
    function buildOptions(json) {
        var list = [];
        var transit = json.publicTransit;

        if (transit && transit.available) {
            $.each(transit.routes || [], function (index, route) {
                list.push({ mode: "PUBLIC_TRANSIT", routeIndex: index, route: route });
            });
        }

        if (json.walking && json.walking.available) {
            list.push({
                mode: "WALKING",
                routeIndex: 0,
                route: {
                    totalTime: json.walking.totalTime,
                    totalDistance: json.walking.totalDistance,
                    steps: [{ type: "WALKING", time: json.walking.totalTime }]
                }
            });
        }

        return list;
    }

    function renderOptions() {
        var $list = $("#choiceList").empty();

        $.each(options, function (index, option) {
            var route = option.route;
            var walking = option.mode === "WALKING";
            var $card = $("<button>")
                    .attr("type", "button")
                    .attr("aria-pressed", index === chosen ? "true" : "false")
                    .addClass("choice-card")
                    .toggleClass("selected", index === chosen)
                    .on("click", function () {
                        chosen = index;
                        renderOptions();
                    });

            var detail = walking
                    ? "걸어서 " + formatDistance(route.totalDistance)
                    : "환승 " + (route.transfers || 0) + "회"
                      + (route.fare > 0 ? " · " + Number(route.fare).toLocaleString() + "원" : "");

            $card.append($("<div>").addClass("choice-head")
                            .append($("<strong>").text(formatMinutes(route.totalTime)))
                            .append($("<span>").text(detail)))
                 .append(segmentBar(route.steps || []))
                 .append($("<p>").addClass("choice-summary").text(walking ? "도보로만 이동해요" : summary(route)));

            $list.append($("<li>").append($card));
        });

        $("#chooseButton").prop("disabled", chosen < 0);
    }

    /** 도보 초록, 버스 파랑, 지하철 보라 막대. 칸 안에 걸리는 시간 */
    function segmentBar(steps) {
        var $bar = $("<div>").addClass("choice-bar");
        var total = 0;
        $.each(steps, function (_, step) {
            total += Math.max(Number(step.time) || 0, 0);
        });

        if (total <= 0) {
            return $bar.append($("<span>").addClass("seg walking").css("width", "100%"));
        }

        $.each(steps, function (_, step) {
            var percent = Math.max(4, ((Number(step.time) || 0) / total) * 100);
            var minutes = Math.max(Math.round((Number(step.time) || 0) / 60), 1);
            var $seg = $("<span>").addClass("seg " + segmentClass(step))
                    .css("width", percent + "%")
                    .attr("title", minutes + "분");
            if (percent >= 12) {
                $seg.text(minutes + "분");
            }
            $bar.append($seg);
        });

        return $bar;
    }

    function segmentClass(step) {
        var type = (step.type || "").toUpperCase();
        if (type.indexOf("SUBWAY") >= 0) {
            return "subway";
        }
        if (type.indexOf("BUS") >= 0) {
            return "bus";
        }
        return "walking";
    }

    /** 타는 버스·지하철 이름: 5714 → 9호선 */
    function summary(route) {
        var names = [];
        $.each(route.steps || [], function (_, step) {
            $.each(step.vehicles || [], function (_, vehicle) {
                if (vehicle && vehicle.name && names.indexOf(vehicle.name) < 0) {
                    names.push(vehicle.name);
                    return false;
                }
            });
        });
        return names.length ? names.slice(0, 3).join(" → ") : "도보 이동 포함";
    }

    function formatMinutes(seconds) {
        var minutes = Math.max(Math.round((Number(seconds) || 0) / 60), 1);
        if (minutes < 60) {
            return minutes + "분";
        }
        return Math.floor(minutes / 60) + "시간" + (minutes % 60 ? " " + (minutes % 60) + "분" : "");
    }

    function formatDistance(meters) {
        meters = Number(meters) || 0;
        return meters >= 1000 ? (meters / 1000).toFixed(1) + "km" : meters + "m";
    }

    /* ---------------------------- 저장 ---------------------------- */

    /** 고른 경로로 등록하고 바로 구간 기록 화면으로 간다 */
    function saveRoute($button) {
        var option = options[chosen];
        if (!option) {
            setChoiceMessage("경로를 골라주세요.", false);
            return;
        }

        $button.prop("disabled", true).text("저장하는 중...");

        $.ajax({
            url: "/route",
            type: "post",
            dataType: "JSON",
            data: $.extend(placeParams(), {
                routeName: $("#routeName").val().trim(),
                startName: picked.start.placeName,
                mode: option.mode,
                routeIndex: option.routeIndex
            }),
            success: function (json) {
                if (!json.success) {
                    setChoiceMessage(json.message || "경로를 등록하지 못했습니다.", false);
                    $button.prop("disabled", false).text("이 경로로 기록하기");
                    return;
                }

                // 뒤로 가기로 이 화면에 다시 오면 같은 경로가 또 저장될 수 있어 replace
                window.location.replace("/route-record.html?id=" + json.routeId);
            },
            error: function () {
                setChoiceMessage("경로 등록 중 오류가 발생했습니다.", false);
                $button.prop("disabled", false).text("이 경로로 기록하기");
            }
        });
    }

    function placeParams() {
        return {
            startLongitude: picked.start.longitude,
            startLatitude: picked.start.latitude,
            endName: picked.end.placeName,
            endLongitude: picked.end.longitude,
            endLatitude: picked.end.latitude
        };
    }

    function resetButton($button) {
        $button.prop("disabled", false).text("경로 보기");
    }

    function setChoiceMessage(message, success) {
        $("#choiceMessage").text(message || "").toggleClass("error", success === false);
    }

    function setMessage(message, success) {
        $("#newRouteMessage").text(message || "").toggleClass("error", success === false);
    }
})(jQuery);
