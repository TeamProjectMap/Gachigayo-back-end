(function ($) {
    var currentPlaces = [];
    var savedPlaces = [];
    var activeTab = "favorite";
    var editMode = false;
    var autocompletePlaces = [];
    var autocompleteTimer = null;
    var autocompleteRequest = null;
    var autocompleteDelay = 300;
    var autocompleteMinLength = 2;
    var autocompleteMaxResults = 5;

    $(function () {
        checkSession();

        $("#destinationSearchButton").on("click", function () {
            closeAutocomplete();
            searchPlaces();
        });

        $("#destinationSearchInput").on("input", function () {
            requestAutocomplete();
        });

        $("#destinationSearchInput").on("keydown", function (event) {
            if (event.key === "Enter") {
                event.preventDefault();
                closeAutocomplete();
                searchPlaces();
            }
        });

        $(".tab-button").on("click", function () {
            selectTab($(this).data("tab"));
        });

        $("#editSavedListButton").on("click", function () {
            setEditMode(!editMode);
            renderSavedPlaces(savedPlaces, getEmptyMessage());
        });

        $("#backToTabsButton").on("click", function () {
            showDefaultPanel();
            loadActiveTabPlaces();
        });

        $("#homeButton").on("click", function () {
            window.location.href = "/user-home.html";
        });

        $("#settingButton").on("click", function () {
            setNotice("설정 화면은 다음 단계에서 연결 예정입니다.");
        });

        $("#placeResultList").on("click", ".place-result-item", function () {
            selectPlace(currentPlaces[$(this).data("place-index")]);
        });

        $("#autocompleteList").on("mousedown", ".autocomplete-item", function (event) {
            event.preventDefault();
            selectPlace(autocompletePlaces[$(this).data("place-index")]);
        });

        $("#defaultPlaceList").on("click", ".saved-place-item", function () {
            if (editMode) {
                return;
            }

            selectPlace(savedPlaces[$(this).data("place-index")]);
        });

        $("#defaultPlaceList").on("click", ".delete-place-button", function (event) {
            event.preventDefault();
            event.stopPropagation();
            deleteSavedPlace(savedPlaces[$(this).data("place-index")]);
        });

        $(document).on("click", function (event) {
            if (!$(event.target).closest(".search-panel").length) {
                closeAutocomplete();
            }
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

                $("#routeSearchPage").removeClass("hidden");
                selectTab("favorite");
            },
            error: function () {
                window.location.replace("/login.html");
            }
        });
    }

    function searchPlaces() {
        var keyword = $.trim($("#destinationSearchInput").val());

        setNotice("");

        if (!keyword) {
            showDefaultPanel();
            loadActiveTabPlaces();
            setMessage("장소 이름을 입력해주세요.");
            return;
        }

        setLoading(true);
        setMessage("검색 중...");
        $("#defaultPanel").addClass("hidden");
        $("#resultPanel").removeClass("hidden");
        $("#placeResultList").empty();

        $.ajax({
            url: "/map/search",
            type: "GET",
            dataType: "JSON",
            data: {
                query: keyword
            },
            success: function (json) {
                if (!json.success) {
                    setMessage(json.message || "장소 검색 중 오류가 발생했습니다.");
                    $("#placeResultList").empty();
                    return;
                }

                renderPlaces(json.places || []);
                setMessage(json.message || "");
            },
            error: function () {
                setMessage("장소 검색 중 오류가 발생했습니다.");
                $("#placeResultList").empty();
            },
            complete: function () {
                setLoading(false);
            }
        });
    }

    function requestAutocomplete() {
        var keyword = $.trim($("#destinationSearchInput").val());

        if (autocompleteTimer) {
            clearTimeout(autocompleteTimer);
        }

        if (keyword.length < autocompleteMinLength) {
            abortAutocompleteRequest();
            closeAutocomplete();
            return;
        }

        autocompleteTimer = setTimeout(function () {
            loadAutocomplete(keyword);
        }, autocompleteDelay);
    }

    function loadAutocomplete(keyword) {
        abortAutocompleteRequest();

        autocompleteRequest = $.ajax({
            url: "/map/search",
            type: "GET",
            dataType: "JSON",
            data: {
                query: keyword
            },
            success: function (json) {
                if ($.trim($("#destinationSearchInput").val()) !== keyword) {
                    return;
                }

                if (!json.success) {
                    closeAutocomplete();
                    return;
                }

                renderAutocomplete((json.places || []).slice(0, autocompleteMaxResults));
            },
            error: function (xhr, status) {
                if (status !== "abort") {
                    closeAutocomplete();
                }
            },
            complete: function () {
                autocompleteRequest = null;
            }
        });
    }

    function abortAutocompleteRequest() {
        if (autocompleteRequest) {
            autocompleteRequest.abort();
            autocompleteRequest = null;
        }
    }

    function renderAutocomplete(places) {
        var $list = $("#autocompleteList");
        $list.empty();
        autocompletePlaces = places;

        if (!places.length) {
            closeAutocomplete();
            return;
        }

        $.each(places, function (index, place) {
            var $item = createPlaceButton(place)
                    .removeClass("place-result-item")
                    .addClass("autocomplete-item")
                    .data("place-index", index);

            $list.append($item);
        });

        $list.removeClass("hidden");
    }

    function closeAutocomplete() {
        autocompletePlaces = [];
        $("#autocompleteList").empty().addClass("hidden");
    }

    function renderPlaces(places) {
        var $list = $("#placeResultList");
        $list.empty();
        currentPlaces = places;

        if (!places.length) {
            $list.append($("<div>").addClass("empty-state").text("검색 결과가 없습니다."));
            return;
        }

        $.each(places, function (index, place) {
            $list.append(createPlaceButton(place).data("place-index", index));
        });
    }

    function createPlaceButton(place) {
        var address = place.roadAddressName || place.addressName || "주소 정보 없음";
        var $item = $("<button>")
                .attr("type", "button")
                .addClass("place-result-item");

        $item.append($("<span>").addClass("place-text")
                .append($("<strong>").text(place.placeName || "이름 없는 장소"))
                .append($("<span>").addClass("place-address").text(address)));

        if (place.categoryName) {
            $item.find(".place-text").append($("<span>").addClass("place-category").text(place.categoryName));
        }

        return $item;
    }

    function selectPlace(place) {
        if (!place) {
            setNotice("선택한 장소 정보를 확인할 수 없습니다.");
            return;
        }

        var selectedDestination = normalizePlace(place);

        sessionStorage.setItem("selectedDestination", JSON.stringify(selectedDestination));
        saveRecentPlace(selectedDestination).always(function () {
            window.location.href = "/place-detail.html";
        });
    }

    function saveRecentPlace(place) {
        return $.ajax({
            url: "/place/recent",
            type: "POST",
            dataType: "JSON",
            data: toPlaceRequest(place)
        }).fail(function () {
            setNotice("");
        });
    }

    function selectTab(tabName) {
        activeTab = tabName === "recent" ? "recent" : "favorite";
        setEditMode(false);
        $(".tab-button").removeClass("active").attr("aria-selected", "false");
        $('.tab-button[data-tab="' + activeTab + '"]').addClass("active").attr("aria-selected", "true");

        showDefaultPanel();
        loadActiveTabPlaces();
    }

    function loadActiveTabPlaces() {
        var isRecent = activeTab === "recent";

        savedPlaces = [];
        $("#defaultPlaceList").empty();
        $("#savedListTitle").text(isRecent ? "최근 검색" : "자주 가는 곳");
        $("#editSavedListButton").addClass("hidden").prop("disabled", true).text("편집");
        $("#defaultEmptyText").removeClass("hidden").text("목록을 불러오는 중입니다.");

        $.ajax({
            url: isRecent ? "/place/recent" : "/place/favorites",
            type: "GET",
            dataType: "JSON",
            success: function (json) {
                if (!json.success) {
                    showEmptyDefault("목록을 불러오지 못했습니다.");
                    return;
                }

                renderSavedPlaces(json.places || [], getEmptyMessage());
            },
            error: function () {
                showEmptyDefault("목록을 불러오지 못했습니다.");
            }
        });
    }

    function renderSavedPlaces(places, emptyMessage) {
        var $list = $("#defaultPlaceList");
        $list.empty();
        savedPlaces = $.map(places, function (place) {
            return normalizePlace(place);
        });

        if (!savedPlaces.length) {
            showEmptyDefault(emptyMessage);
            return;
        }

        $("#defaultEmptyText").addClass("hidden");
        $("#editSavedListButton")
                .removeClass("hidden")
                .prop("disabled", false)
                .text(editMode ? "완료" : "편집");

        $.each(savedPlaces, function (index, place) {
            var $item = createPlaceButton(place)
                    .removeClass("place-result-item")
                    .addClass("saved-place-item")
                    .toggleClass("editing", editMode)
                    .data("place-index", index);

            if (editMode) {
                $item.append($("<button>")
                        .attr("type", "button")
                        .attr("aria-label", "삭제")
                        .addClass("delete-place-button")
                        .data("place-index", index)
                        .text("×"));
            }

            $list.append($item);
        });
    }

    function showEmptyDefault(message) {
        savedPlaces = [];
        $("#defaultPlaceList").empty();
        setEditMode(false);
        $("#editSavedListButton").addClass("hidden").prop("disabled", true).text("편집");
        $("#defaultEmptyText").removeClass("hidden").text(message);
    }

    function showDefaultPanel() {
        $("#resultPanel").addClass("hidden");
        $("#placeResultList").empty();
        $("#defaultPanel").removeClass("hidden");
    }

    function setEditMode(enabled) {
        editMode = enabled;
        $("#editSavedListButton").text(editMode ? "완료" : "편집");
    }

    function deleteSavedPlace(place) {
        if (!place || !place.id) {
            setNotice("삭제할 장소 정보를 확인할 수 없습니다.");
            return;
        }

        var isRecent = activeTab === "recent";
        var confirmMessage = isRecent ? "최근 검색에서 삭제할까요?" : "자주 가는 곳에서 삭제할까요?";

        if (!window.confirm(confirmMessage)) {
            return;
        }

        $.ajax({
            url: isRecent ? "/place/recent/delete" : "/place/favorites/delete",
            type: "POST",
            dataType: "JSON",
            data: {
                placeId: place.id
            },
            success: function (json) {
                if (!json.success) {
                    setNotice(json.message || "삭제 중 오류가 발생했습니다.");
                    return;
                }

                setNotice("");
                loadActiveTabPlaces();
            },
            error: function () {
                setNotice("삭제 중 오류가 발생했습니다.");
            }
        });
    }

    function getEmptyMessage() {
        return activeTab === "recent" ? "최근 검색한 장소가 없습니다." : "아직 저장한 장소가 없습니다.";
    }

    function normalizePlace(place) {
        return {
            id: value(place.id || place.kakaoPlaceId),
            placeName: value(place.placeName),
            categoryName: value(place.categoryName),
            addressName: value(place.addressName || place.address),
            roadAddressName: value(place.roadAddressName || place.roadAddress),
            longitude: value(place.longitude || place.lng),
            latitude: value(place.latitude || place.lat),
            phone: value(place.phone),
            placeUrl: value(place.placeUrl)
        };
    }

    function toPlaceRequest(place) {
        return {
            placeId: place.id,
            placeName: place.placeName,
            categoryName: place.categoryName,
            addressName: place.addressName,
            roadAddressName: place.roadAddressName,
            longitude: place.longitude,
            latitude: place.latitude,
            phone: place.phone,
            placeUrl: place.placeUrl
        };
    }

    function value(source) {
        return source == null ? "" : String(source);
    }

    function setLoading(isLoading) {
        $("#destinationSearchButton").prop("disabled", isLoading);
    }

    function setMessage(message) {
        $("#searchMessage").text(message);
    }

    function setNotice(message) {
        $("#routeSearchNotice").text(message);
    }
})(jQuery);
