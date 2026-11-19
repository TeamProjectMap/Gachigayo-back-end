(function ($) {
  var selectedDestination = null;
  // 자주 가는 곳 추가에서 들어오면 길안내 대신 '등록하기'를 한다
  var favoriteMode = new URLSearchParams(location.search).get("mode") === "favorite";
  var destinationKey = favoriteMode ? "favoriteCandidate" : "selectedDestination";
  var searchPage = favoriteMode ? "/route-search.html?select=favorite" : "/route-search.html";
  // 자주 가는 곳(목록·홈)에서 열면 검색창·즐겨찾기 없이 지도·이름·이곳으로 가기만
  var fromParam = new URLSearchParams(location.search).get("from");
  var savedPlaceMode = fromParam === "favorites" || fromParam === "home";
  var backPage = fromParam === "favorites" ? "/route-search.html?view=favorites"
      : fromParam === "home" ? "/user-home.html" : searchPage;
  var favorite = false;
  var placeMap = null;
  var endpointRevision = 0;
  var routeRequest = null;
  function invalidateEndpoints() {
    endpointRevision++;
    routeRequest?.abort();
    routeRequest = null;
    ["routeSearchResult", "selectedRoute", "navigationProgress"].forEach(
      function (key) {
        sessionStorage.removeItem(key);
      },
    );
    setLoading(false);
  }
  function drawEndpoints() {
    if (!placeMap || !selectedDestination) return;
    var origin = NavigationUI.read("currentOrigin");
    placeMap.clear();
    placeMap.pin(selectedDestination, "도착");
    if (NavigationUI.coordinate(origin)) {
      placeMap.pin(origin, "출발");
      placeMap.fit([origin, selectedDestination]);
    } else placeMap.fit([selectedDestination]);
  }
  async function swapEndpoints() {
    var version = endpointRevision;
    var origin = NavigationUI.read("currentOrigin");
    if (!NavigationUI.coordinate(origin)) {
      setMessage("현재 위치를 확인하고 출발·도착을 바꾸고 있습니다…");
      try {
        origin = await NavigationUI.locate();
      } catch (error) {
        setMessage(error.message);
        return;
      }
    }
    if (!NavigationUI.coordinate(selectedDestination) || version !== endpointRevision) return;
    invalidateEndpoints();
    var nextOrigin = Object.assign({}, selectedDestination, {
      manual: true,
      capturedAt: Date.now(),
    });
    selectedDestination = normalizePlace(
      Object.assign({}, origin, {
        placeName: origin.placeName || "현재 위치로 지정한 지점",
      }),
    );
    sessionStorage.setItem("currentOrigin", JSON.stringify(nextOrigin));
    sessionStorage.setItem(
      "selectedDestination",
      JSON.stringify(selectedDestination),
    );
    $("#originSelectionName").text(nextOrigin.placeName);
    renderDestination(selectedDestination);
    checkFavorite();
    drawEndpoints();
    setMessage("출발지와 도착지를 바꿨습니다. 경로를 다시 검색해주세요.");
  }

  $(function () {
    checkSession();
    // 출발지 고르기 버튼을 없앴으므로 출발은 항상 현재 위치. 예전에 직접 고른 출발지가 남아 있으면 지운다
    var origin = NavigationUI.read("currentOrigin");
    if (origin && origin.manual) {
      sessionStorage.removeItem("currentOrigin");
    }
    $("#useCurrentOrigin").on("click", async function () {
      invalidateEndpoints();
      var version = endpointRevision;
      $("#originSelectionName").text("현재 위치 확인 중…");
      try {
        var origin = await NavigationUI.locate();
        if (version !== endpointRevision) return;
        sessionStorage.setItem("currentOrigin", JSON.stringify(origin));
        $("#originSelectionName").text("현재 위치");
        drawEndpoints();
        setMessage("현재 위치를 출발지로 지정했습니다.");
      } catch (error) {
        if (version === endpointRevision) {
          var original = NavigationUI.read("currentOrigin");
          $("#originSelectionName").text(original && original.manual ? original.placeName : "현재 위치");
          setMessage(error.message);
        }
      }
    });
    $("#swapEndpoints").on("click", swapEndpoints);

    $("#backButton").on("click", function () {
      window.location.href = backPage;
    });

    if (savedPlaceMode) {
      $("#placeDetailPage").addClass("is-saved-place");
      $("#favoriteButton").remove();
    }

    if (favoriteMode) {
      $("#favoriteButton").remove();
      $("#confirmDestinationButton").text("등록하기");
    }

    $("#favoriteButton").on("click", function () {
      toggleFavorite();
    });

    $("#confirmDestinationButton").on("click", function () {
      if (favoriteMode) {
        registerFavorite();
        return;
      }
      requestCurrentOrigin();
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

        loadSelectedDestination();
      },
      error: function () {
        window.location.replace("/login.html");
      },
    });
  }

  function loadSelectedDestination() {
    var rawDestination = sessionStorage.getItem(destinationKey);

    if (!rawDestination) {
      window.location.replace(searchPage);
      return;
    }

    try {
      selectedDestination = JSON.parse(rawDestination);
    } catch (e) {
      sessionStorage.removeItem(destinationKey);
      window.location.replace(searchPage);
      return;
    }

    if (!selectedDestination || !selectedDestination.placeName) {
      window.location.replace(searchPage);
      return;
    }

    selectedDestination = normalizePlace(selectedDestination);
    renderDestination(selectedDestination);
    $("#placeDetailPage").removeClass("hidden");
    checkFavorite();
    NavigationUI.create(
      document.getElementById("placeMap"),
      selectedDestination,
    )
      .then(function (view) {
        placeMap = view;
        drawEndpoints();
      })
      .catch(function () {});
  }

  function renderDestination(place) {
    var address =
      place.roadAddressName || place.addressName || "주소 정보 없음";

    $("#headerPlaceName").text(place.placeName);
    $("#placeName").text(place.placeName);
    $("#placeAddress").text(address);

    $("#placeCategory, #placePhone").addClass("hidden").text("");
    if (place.categoryName) {
      $("#placeCategory").text(place.categoryName).removeClass("hidden");
    }

    if (place.phone) {
      $("#placePhone").text(place.phone).removeClass("hidden");
    }
  }

  function checkFavorite() {
    if (!selectedDestination.id) {
      renderFavorite(false);
      return;
    }

    $.ajax({
      url: "/place/favorites/check",
      type: "GET",
      dataType: "JSON",
      data: {
        placeId: selectedDestination.id,
      },
      success: function (json) {
        renderFavorite(!!(json.success && json.favorite));
      },
      error: function () {
        renderFavorite(false);
      },
    });
  }

  function toggleFavorite() {
    if (!selectedDestination || !selectedDestination.id) {
      setMessage("선택한 장소 정보를 확인할 수 없습니다.");
      return;
    }

    $("#favoriteButton").prop("disabled", true);

    if (favorite) {
      deleteFavorite();
    } else {
      addFavorite();
    }
  }

  function addFavorite() {
    $.ajax({
      url: "/place/favorites",
      type: "POST",
      dataType: "JSON",
      data: toPlaceRequest(selectedDestination),
      success: function (json) {
        if (!json.success) {
          setMessage(json.message || "즐겨찾기 저장 중 오류가 발생했습니다.");
          return;
        }

        renderFavorite(true);
        setMessage(json.message || "자주 가는 곳에 저장했습니다.");
      },
      error: function () {
        setMessage("즐겨찾기 저장 중 오류가 발생했습니다.");
      },
      complete: function () {
        $("#favoriteButton").prop("disabled", false);
      },
    });
  }

  /** 자주 가는 곳 등록하기: 저장하고 자주 가는 곳 목록으로 돌아간다 */
  function registerFavorite() {
    if (!selectedDestination || !selectedDestination.id) {
      setMessage("선택한 장소 정보를 확인할 수 없습니다.");
      return;
    }

    if (favorite) {
      setMessage("이미 자주 가는 곳에 있어요.");
      return;
    }

    var $button = $("#confirmDestinationButton").prop("disabled", true);
    $.ajax({
      url: "/place/favorites",
      type: "POST",
      dataType: "JSON",
      data: toPlaceRequest(selectedDestination),
      success: function (json) {
        if (!json.success) {
          $button.prop("disabled", false);
          setMessage(json.message || "자주 가는 곳을 등록하지 못했습니다.");
          return;
        }

        sessionStorage.removeItem(destinationKey);
        setMessage("자주 가는 곳에 등록했어요.");
        window.setTimeout(function () {
          window.location.href = "/route-search.html?view=favorites";
        }, 500);
      },
      error: function () {
        $button.prop("disabled", false);
        setMessage("자주 가는 곳 등록 중 오류가 발생했습니다.");
      },
    });
  }

  function deleteFavorite() {
    $.ajax({
      url: "/place/favorites/delete",
      type: "POST",
      dataType: "JSON",
      data: {
        placeId: selectedDestination.id,
      },
      success: function (json) {
        if (!json.success) {
          setMessage(json.message || "즐겨찾기 삭제 중 오류가 발생했습니다.");
          return;
        }

        renderFavorite(false);
        setMessage(json.message || "자주 가는 곳에서 삭제했습니다.");
      },
      error: function () {
        setMessage("즐겨찾기 삭제 중 오류가 발생했습니다.");
      },
      complete: function () {
        $("#favoriteButton").prop("disabled", false);
      },
    });
  }

  function renderFavorite(isFavorite) {
    favorite = isFavorite;
    $("#favoriteButton")
      .attr("aria-pressed", String(favorite))
      .text(favorite ? "★ 즐겨찾기" : "☆ 즐겨찾기");
  }

  function requestCurrentOrigin() {
    if (!hasSelectedDestination()) {
      setMessage("선택한 목적지가 없습니다.");
      setTimeout(function () {
        window.location.href = "/route-search.html";
      }, 800);
      return;
    }

    var manualOrigin = NavigationUI.read("currentOrigin");
    if (
      manualOrigin &&
      manualOrigin.manual &&
      NavigationUI.coordinate(manualOrigin)
    ) {
      setLoading(true);
      searchRoutes(manualOrigin);
      return;
    }

    if (
      manualOrigin &&
      !manualOrigin.manual &&
      NavigationUI.coordinate(manualOrigin) &&
      Date.now() - Number(manualOrigin.capturedAt) < 30000
    ) {
      setLoading(true);
      searchRoutes(manualOrigin);
      return;
    }
    var version = endpointRevision;
    if (!navigator.geolocation) {
      setMessage("현재 위치를 확인할 수 없는 브라우저입니다.");
      return;
    }

    setLoading(true);
    setMessage("현재 위치 확인 중...");

    navigator.geolocation.getCurrentPosition(
      function (position) {
        if (version !== endpointRevision) return;
        var currentOrigin = {
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracy: position.coords.accuracy,
          capturedAt: Date.now(),
        };

        sessionStorage.setItem("currentOrigin", JSON.stringify(currentOrigin));
        searchRoutes(currentOrigin);
      },
      function (error) {
        if (version !== endpointRevision) return;
        setMessage(getGeolocationErrorMessage(error));
        setLoading(false);
      },
      {
        enableHighAccuracy: true,
        timeout: 15000,
        maximumAge: 0,
      },
    );
  }

  function searchRoutes(currentOrigin) {
    if (PlaceProximity.distance(currentOrigin, selectedDestination) < 10) {
      setMessage(
        "출발지와 도착지가 같은 위치입니다. 다른 장소를 선택해주세요.",
      );
      setLoading(false);
      return;
    }
    var version = endpointRevision;
    setMessage("경로 찾는 중...");
    $("#confirmDestinationButton").text("경로 찾는 중…");
    routeRequest = $.ajax({
      url: "/map/routes",
      timeout: 40000,
      type: "GET",
      dataType: "JSON",
      data: {
        startLongitude: currentOrigin.longitude,
        startLatitude: currentOrigin.latitude,
        endLongitude: selectedDestination.longitude,
        endLatitude: selectedDestination.latitude,
        destinationName: selectedDestination.placeName,
      },
      success: function (json) {
        if (version !== endpointRevision) return;
        if (!json.success) {
          setMessage(json.message || "경로 검색 중 오류가 발생했습니다.");
          return;
        }

        if (
          !(json.walking && json.walking.available) &&
          !(json.publicTransit && json.publicTransit.available)
        ) {
          setMessage(
            ((json.walking && json.walking.message) || "") +
              " " +
              ((json.publicTransit && json.publicTransit.message) || ""),
          );
          return;
        }
        sessionStorage.setItem("routeSearchResult", JSON.stringify(json));
        setMessage(createRouteSummaryMessage(json));
        window.location.href = "/route-compare.html";
      },
      error: function (_, status) {
        if (version === endpointRevision && status !== "abort")
          setMessage(
            status === "timeout"
              ? "경로 검색이 지연되고 있습니다. 다시 시도해주세요."
              : "경로 검색 중 오류가 발생했습니다.",
          );
      },
      complete: function () {
        if (version === endpointRevision) setLoading(false);
      },
    });
  }

  function createRouteSummaryMessage(routeResult) {
    var publicTransitCount =
      routeResult.publicTransit && routeResult.publicTransit.routes
        ? routeResult.publicTransit.routes.length
        : 0;
    var walkingAvailable = routeResult.walking && routeResult.walking.available;

    if (publicTransitCount > 0 && walkingAvailable) {
      return (
        "경로를 찾았습니다. 대중교통 경로 " +
        publicTransitCount +
        "개와 도보 경로를 확인했습니다."
      );
    }

    if (publicTransitCount > 0) {
      return (
        "경로를 찾았습니다. 대중교통 경로 " +
        publicTransitCount +
        "개를 확인했습니다."
      );
    }

    if (walkingAvailable) {
      return "경로를 찾았습니다. 도보 경로를 확인했습니다.";
    }

    return routeResult.message || "이동 가능한 경로를 찾지 못했습니다.";
  }

  function hasSelectedDestination() {
    var rawDestination = sessionStorage.getItem("selectedDestination");

    return (
      !!rawDestination &&
      !!selectedDestination &&
      !!selectedDestination.longitude &&
      !!selectedDestination.latitude
    );
  }

  function getGeolocationErrorMessage(error) {
    if (!error) {
      return "현재 위치를 확인하는 중 오류가 발생했습니다.";
    }

    if (error.code === error.PERMISSION_DENIED) {
      return "현재 위치 권한이 필요합니다. 브라우저에서 위치 권한을 허용해주세요.";
    }

    if (error.code === error.POSITION_UNAVAILABLE) {
      return "현재 위치를 확인할 수 없습니다. 잠시 후 다시 시도해주세요.";
    }

    if (error.code === error.TIMEOUT) {
      return "현재 위치 확인 시간이 초과되었습니다. 다시 시도해주세요.";
    }

    return "현재 위치를 확인하는 중 오류가 발생했습니다.";
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
      placeUrl: value(place.placeUrl),
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
      placeUrl: place.placeUrl,
    };
  }

  function value(source) {
    return source == null ? "" : String(source);
  }

  function setLoading(isLoading) {
    $("#confirmDestinationButton")
      .prop("disabled", isLoading)
      .text(isLoading ? "현재 위치 확인 중..." : "이곳으로 가기");
  }

  function setMessage(message) {
    $("#detailMessage").text(message);
  }
})(jQuery);
