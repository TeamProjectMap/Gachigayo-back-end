(function ($) {
  var GACHIGAYO_SCORE = {
    TRANSFER_WEIGHT: 0.35,
    COMPLEXITY_WEIGHT: 0.25,
    WALKING_WEIGHT: 0.15,
    FAMILIARITY_WEIGHT: 0.15,
    TOTAL_TIME_WEIGHT: 0.1,
    NEUTRAL_FAMILIARITY_SCORE: 50,
  };
  var NAVIGATION_PROGRESS_KEY = "navigationProgress";
  var sessionUserId = null;

  var completedRanks = new Map();
  var comparisonMap = null;
  var transitFilter = "all";
  var allTransitRoutes = [];
  var arrivalDisposers = [];
  function clearArrivalPanels() {
    arrivalDisposers.forEach(function (dispose) {
      dispose();
    });
    arrivalDisposers = [];
  }
  var detailsRouteRef = null;
  function renderSelectedItinerary() {
    var previous = document.getElementById("selectedRouteDetails");
    if (selectedRoute && selectedRoute.route === detailsRouteRef && previous)
      return;
    previous?.remove();
    detailsRouteRef = selectedRoute && selectedRoute.route;
    if (!selectedRoute) return;
    var card = $("#routeList .route-card").filter(function () {
      return $(this).data("mode") === selectedRoute.mode && (selectedRoute.mode !== "PUBLIC_TRANSIT" || Number($(this).data("route-index")) === selectedPublicRouteIndex);
    }).get(0);
    if (!card) return;
    var details = document.createElement("details");
    details.id = "selectedRouteDetails";
    details.className = "selected-itinerary";
    var summary = document.createElement("summary");
    var steps = selectedRoute.route.steps || [];
    summary.textContent = "전체 이동 순서 · " + steps.length + "단계";
    var list = document.createElement("ol");
    steps.forEach(function (step) {
      var item = document.createElement("li"),
        title = document.createElement("strong"),
        meta = document.createElement("small");
      var mode = isBusStep(step)
        ? "버스"
        : isSubwayStep(step)
          ? "지하철"
          : "도보";
      title.textContent =
        mode + " · " + (step.guidance || createStepText(step));
      var stops = getStopsText(step.stops || []);
      meta.textContent = [
        stops,
        formatMinutes(step.time),
        formatDistance(step.distance),
      ]
        .filter(Boolean)
        .join(" · ");
      item.append(title, meta);
      list.append(item);
    });
    details.append(summary, list);
    card.insertAdjacentElement("afterend", details);
  }
  function previewSelectedRoute() {
    renderSelectedItinerary();
    if (comparisonMap) {
      comparisonMap.route(
        selectedRoute && selectedRoute.route
          ? selectedRoute.mode === "PUBLIC_TRANSIT"
            ? withAccessWalks(selectedRoute.route)
            : selectedRoute.route.steps || []
          : [],
      );
    }
  }

  /**
   * 카카오 대중교통 경로에는 출발지 → 타는 곳, 내린 곳 → 도착지 도보가 빠져 있다.
   * (총 21분인데 단계는 버스 12분 하나뿐인 식)
   * 빠진 시간·거리를 앞뒤 도보 구간으로 채워서 막대와 지도에 출발지부터 도착지까지 다 보이게 한다.
   * 앞뒤 나누기는 출발지~타는 곳, 내린 곳~도착지 직선거리 비율로 한다.
   * 화면에 보여주기만 하고, 길안내에 넘기는 경로 데이터는 바꾸지 않는다.
   */
  function withAccessWalks(route) {
    var steps = getValidSteps(route);
    if (!steps.length) {
      return steps;
    }

    var stepTime = 0;
    var stepDistance = 0;
    steps.forEach(function (step) {
      stepTime += Math.max(safeNumber(step.time), 0);
      stepDistance += Math.max(safeNumber(step.distance), 0);
    });

    var missingTime = safeNumber(route.totalTime) - stepTime;
    var missingDistance = Math.max(
      safeNumber(route.totalDistance) - stepDistance,
      0,
    );
    if (missingTime < 30) {
      return steps;
    }

    var firstPoint = firstPathPoint(steps);
    var lastPoint = lastPathPoint(steps);
    var before = straightDistance(currentOrigin, firstPoint);
    var after = straightDistance(lastPoint, selectedDestination);
    var beforeShare = before + after > 0 ? before / (before + after) : 0.5;

    var result = steps.slice();
    var beforeTime = Math.round(missingTime * beforeShare);
    var afterTime = missingTime - beforeTime;

    if (beforeTime >= 30) {
      result.unshift(
        accessWalk(beforeTime, missingDistance * beforeShare, currentOrigin, firstPoint),
      );
    }
    if (afterTime >= 30) {
      result.push(
        accessWalk(afterTime, missingDistance * (1 - beforeShare), lastPoint, selectedDestination),
      );
    }
    return result;
  }

  function accessWalk(time, distance, from, to) {
    var points = [from, to]
      .filter(isCoordinate)
      .map(function (point) {
        return {
          longitude: Number(point.longitude),
          latitude: Number(point.latitude),
        };
      });
    return {
      type: "WALKING",
      time: time,
      distance: Math.round(distance),
      pathPoints: points.length === 2 ? points : [],
      stops: [],
      vehicles: [],
    };
  }

  function firstPathPoint(steps) {
    for (var i = 0; i < steps.length; i++) {
      var points = steps[i].pathPoints || [];
      if (points.length) {
        return points[0];
      }
    }
    return null;
  }

  function lastPathPoint(steps) {
    for (var i = steps.length - 1; i >= 0; i--) {
      var points = steps[i].pathPoints || [];
      if (points.length) {
        return points[points.length - 1];
      }
    }
    return null;
  }

  function isCoordinate(point) {
    return !!(window.NavigationUI && NavigationUI.coordinate(point));
  }

  /** 두 지점 사이 직선거리(m). 좌표가 없으면 0 */
  function straightDistance(a, b) {
    if (!isCoordinate(a) || !isCoordinate(b)) {
      return 0;
    }
    var rad = Math.PI / 180;
    var lat1 = Number(a.latitude) * rad;
    var lat2 = Number(b.latitude) * rad;
    var dLat = lat2 - lat1;
    var dLng = (Number(b.longitude) - Number(a.longitude)) * rad;
    var h =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
    return 6371000 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
  }
  var selectedDestination = null;
  var currentOrigin = null;
  var routeSearchResult = null;
  var publicTransitCandidates = [];
  var selectedPublicRouteIndex = null;
  var activeTab = null;
  var selectedRoute = null;
  var currentScoreContext = null;
  var isSavingSelectedRoute = false;

  $(function () {
    $("[data-route-filter]").on("click", function () {
      transitFilter = $(this).data("route-filter");
      $("[data-route-filter]").attr("aria-pressed", "false");
      $(this).attr("aria-pressed", "true");
      var filtered = allTransitRoutes.filter(function (route) {
        var hasBus = (route.steps || []).some(isBusStep),
          hasSubway = (route.steps || []).some(isSubwayStep);
        return (
          transitFilter === "all" ||
          (transitFilter === "bus" && hasBus && !hasSubway) ||
          (transitFilter === "subway" && hasSubway && !hasBus)
        );
      });
      publicTransitCandidates = filtered.length
        ? selectRepresentativeRoutes(filtered)
        : [];
      selectedRoute = null;
      selectedPublicRouteIndex = null;
      renderPublicTransit();
      previewSelectedRoute();
    });
    $("#refreshArrivals").on("click", function () {
      TransitRealtime.refresh();
    });
    checkSession();

    $("#backButton").on("click", function () {
      window.location.href = "/place-detail.html";
    });

    // 출발·도착 칸을 누르면 그 칸에 넣을 장소를 검색한다 (카카오맵처럼)
    $(".route-points .point-row")
      .attr("role", "button")
      .attr("tabindex", "0")
      .on("click keydown", function (event) {
        if (event.type === "keydown" && event.key !== "Enter" && event.key !== " ") return;
        event.preventDefault();
        var side = $(this).hasClass("destination") ? "destination" : "origin";
        window.location.href = "/route-search.html?select=" + side;
      });

    $(".route-tab").on("click", function () {
      selectTab($(this).data("tab"));
    });

    $("#guideButton").on("click", function () {
      if (isSavingSelectedRoute) {
        return;
      }

      saveSelectedRoute();
    });

    $("#routeList").on("click", ".route-card", function () {
      if (isSavingSelectedRoute) {
        return;
      }

      var mode = $(this).data("mode");
      setMessage("");

      if (mode === "PUBLIC_TRANSIT") {
        selectedPublicRouteIndex = Number($(this).data("route-index"));
        selectedRoute = {
          mode: "PUBLIC_TRANSIT",
          route: publicTransitCandidates[selectedPublicRouteIndex].route,
          selectionLabel:
            publicTransitCandidates[selectedPublicRouteIndex].selectionLabel,
        };
        markSelectedRouteCard();
        return;
      }

      if (mode === "WALKING") {
        selectedPublicRouteIndex = null;
        selectedRoute = {
          mode: "WALKING",
          route: routeSearchResult.walking,
        };
        markSelectedRouteCard();
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

        sessionUserId = json.userId;
        loadRouteData();
      },
      error: function () {
        window.location.replace("/login.html");
      },
    });
  }

  async function loadRouteData() {
    selectedDestination = readJson("selectedDestination");
    currentOrigin = readJson("currentOrigin");
    if (!NavigationUI.coordinate(selectedDestination)) selectedDestination = null;
    var hasOrigin = NavigationUI.coordinate(currentOrigin);
    routeSearchResult = readJson("routeSearchResult");
    showIncomplete(hasOrigin);
    // 출발지를 따로 고르지 않았으면 기본은 '현재 위치'
    $("#compareOriginName")
      .text(hasOrigin ? (currentOrigin.placeName || "현재 위치") : "현재 위치")
      .removeClass("is-empty");
    if (selectedDestination) {
      try {
        sessionStorage.setItem("lastDestination", JSON.stringify(selectedDestination));
      } catch (e) {}
    }
    NavigationUI.create(
      document.getElementById("compareMap"),
      hasOrigin ? currentOrigin : selectedDestination,
    )
      .then(function (view) {
        comparisonMap = view;
        previewSelectedRoute();
        // 한쪽만 정해졌으면 그 장소에 핀을 찍어 둔다
        if (!routeSearchResult || !hasOrigin || !selectedDestination) {
          if (hasOrigin) view.pin(currentOrigin, "출발");
          if (NavigationUI.coordinate(selectedDestination)) view.pin(selectedDestination, "도착");
          view.fit([currentOrigin, selectedDestination].filter(NavigationUI.coordinate));
        }
      })
      .catch(function () {});
    if (!selectedDestination) return;

    if (!hasOrigin) {
      setMessage("현재 위치를 확인하고 있어요. 출발지를 직접 선택할 수도 있어요.");
      try {
        currentOrigin = await NavigationUI.locate();
        hasOrigin = NavigationUI.coordinate(currentOrigin);
        if (!hasOrigin) throw new Error("현재 위치를 확인하지 못했습니다.");
        sessionStorage.setItem("currentOrigin", JSON.stringify(currentOrigin));
        // 출발지가 새로 정해졌으므로 이전 검색 결과는 사용하지 않는다.
        routeSearchResult = null;
        sessionStorage.removeItem("routeSearchResult");
        $("#compareOriginName").text(currentOrigin.placeName || "현재 위치");
      } catch (error) {
        showIncomplete(false);
        setMessage((error.message || "현재 위치를 확인하지 못했습니다.") + " 위의 출발 칸을 눌러 출발지를 선택해주세요.");
        return;
      }
    }

    if (!routeSearchResult) {
      setMessage("경로를 찾고 있어요.");
      try {
        var query = new URLSearchParams({
          startLongitude: currentOrigin.longitude,
          startLatitude: currentOrigin.latitude,
          endLongitude: selectedDestination.longitude,
          endLatitude: selectedDestination.latitude,
          destinationName: selectedDestination.placeName || "목적지",
        });
        routeSearchResult = await NavigationUI.api("/map/routes?" + query, {
          signal: AbortSignal.timeout(40000),
        });
        sessionStorage.setItem("routeSearchResult", JSON.stringify(routeSearchResult));
      } catch (error) {
        showIncomplete(hasOrigin);
        setMessage(error.message || "경로를 찾지 못했습니다. 다시 시도해주세요.");
        $("#routeList").append($("<button>").attr("type", "button")
          .addClass("walking-retry-button").text("경로 다시 찾기")
          .on("click", function () { window.location.reload(); }));
        return;
      }
    }

    $(".route-tab, [data-route-filter]").prop("disabled", false);
    allTransitRoutes =
      (routeSearchResult.publicTransit &&
        routeSearchResult.publicTransit.routes) ||
      [];
    await loadCompletedRanks(allTransitRoutes.concat(routeSearchResult.walking || []));
    publicTransitCandidates = buildPublicTransitCandidates(
      routeSearchResult.publicTransit,
    );
    $("#routeComparePage").removeClass("hidden");

    if (
      routeSearchResult.publicTransit &&
      routeSearchResult.publicTransit.available
    ) {
      selectTab("publicTransit");
      return;
    }

    if (routeSearchResult.walking && routeSearchResult.walking.available) {
      selectTab("walking");
      return;
    }

    selectTab("publicTransit");
    setMessage("이동 가능한 경로를 찾지 못했습니다.");
  }

  function showIncomplete(hasOrigin) {
    $("#routeComparePage").removeClass("hidden");
    $("#destinationName").text(selectedDestination ? selectedDestination.placeName || "목적지" : "도착지를 선택해주세요");
    $(".route-tab, [data-route-filter]").prop("disabled", true);
    $(".route-filter-toolbar").hide();
    clearArrivalPanels();
    $("#routeList").empty();
    selectedRoute = null;
    updateGuideButton(false);
    setMessage(!selectedDestination
      ? "위의 도착 칸을 눌러 도착지를 선택해주세요."
      : !hasOrigin ? "위의 출발 칸을 눌러 출발지를 선택해주세요." : "경로를 찾고 있어요.");
  }

  async function loadCompletedRanks(routes) {
    completedRanks.clear();
    try {
      var response = await NavigationUI.api("/trip/completed-routes", {signal: AbortSignal.timeout(2000)});
      if (!response.success || !Array.isArray(response.routes) || !response.routes.length) return;
      await Promise.all(routes.map(async function (route) {
        var signature = await RouteHistory.key(route);
        var rank = response.routes.findIndex(function (record) {
          return RouteHistory.matches(record, signature, currentOrigin, selectedDestination);
        });
        if (rank >= 0) completedRanks.set(route, rank);
      }));
    } catch (_) { /* History is optional: preserve the existing recommendation list on failure. */ }
  }

  function buildPublicTransitCandidates(publicTransit) {
    if (
      !publicTransit ||
      !publicTransit.available ||
      !publicTransit.routes ||
      !publicTransit.routes.length
    ) {
      return [];
    }

    return selectRepresentativeRoutes(publicTransit.routes);
  }

  function selectRepresentativeRoutes(routes) {
    var candidates = [];
    currentScoreContext = buildScoreContext(routes);
    var recommended = findGachigayoRecommendedRoute(
      routes,
      currentScoreContext,
    );
    var fastestRoutes = sortByTotalTime(routes);
    var fewestTransferRoutes = sortByTransfers(routes);
    var leastWalkingRoutes = sortByWalkingTime(routes);

    addCandidateFromSorted(
      candidates,
      [recommended],
      "같이가요 추천",
      "GACHIGAYO_RECOMMENDED",
      createRecommendationReason,
    );
    addCandidateFromSorted(
      candidates,
      fastestRoutes,
      "가장 빨라요",
      "FASTEST",
      function () {
        return "";
      },
    );
    addCandidateFromSorted(
      candidates,
      fewestTransferRoutes,
      "환승이 적어요",
      "FEWEST_TRANSFER",
      function () {
        return "";
      },
    );
    addCandidateFromSorted(
      candidates,
      leastWalkingRoutes,
      "덜 걸어요",
      "LEAST_WALKING",
      function () {
        return "";
      },
    );

    return RouteHistory.prioritize(candidates.slice(0, 4), routes, completedRanks);
  }

  function addCandidateFromSorted(
    candidates,
    routes,
    label,
    selectionLabel,
    reasonFactory,
  ) {
    if (!routes || !routes.length) {
      return;
    }

    var route = routes.find(function (nextRoute) {
      return nextRoute && !hasSameRoute(candidates, nextRoute);
    });

    if (!route) {
      return;
    }

    candidates.push({
      label: label,
      selectionLabel: selectionLabel,
      reason: reasonFactory(route),
      gachigayoScore: calculateGachigayoScore(route, currentScoreContext),
      route: route,
    });
  }

  function findGachigayoRecommendedRoute(routes, scoreContext) {
    return (
      routes.slice().sort(function (a, b) {
        var scoreDiff =
          calculateGachigayoScore(b, scoreContext) -
          calculateGachigayoScore(a, scoreContext);

        if (scoreDiff !== 0) {
          return scoreDiff;
        }

        var transferDiff = safeNumber(a.transfers) - safeNumber(b.transfers);

        if (transferDiff !== 0) {
          return transferDiff;
        }

        var walkingDiff = calculateWalkingTime(a) - calculateWalkingTime(b);

        if (walkingDiff !== 0) {
          return walkingDiff;
        }

        return safeNumber(a.totalTime) - safeNumber(b.totalTime);
      })[0] || null
    );
  }

  function findFastestRoute(routes) {
    return sortByTotalTime(routes)[0] || null;
  }

  function findFewestTransferRoute(routes) {
    return sortByTransfers(routes)[0] || null;
  }

  function findLeastWalkingRoute(routes) {
    return sortByWalkingTime(routes)[0] || null;
  }

  function sortByTotalTime(routes) {
    return routes.slice().sort(function (a, b) {
      return safeNumber(a.totalTime) - safeNumber(b.totalTime);
    });
  }

  function sortByTransfers(routes) {
    return routes.slice().sort(function (a, b) {
      var transferDiff = safeNumber(a.transfers) - safeNumber(b.transfers);

      if (transferDiff !== 0) {
        return transferDiff;
      }

      return safeNumber(a.totalTime) - safeNumber(b.totalTime);
    });
  }

  function sortByWalkingTime(routes) {
    return routes.slice().sort(function (a, b) {
      var walkingDiff = calculateWalkingTime(a) - calculateWalkingTime(b);

      if (walkingDiff !== 0) {
        return walkingDiff;
      }

      return safeNumber(a.totalTime) - safeNumber(b.totalTime);
    });
  }

  function buildScoreContext(routes) {
    var metrics = (routes || []).map(function (route) {
      return {
        route: route,
        transfers: safeNumber(route && route.transfers),
        complexity: calculateMeaningfulStepCount(route),
        walkingTime: calculateWalkingTime(route),
        totalTime: safeNumber(route && route.totalTime),
      };
    });

    return {
      metrics: metrics,
      transfers: buildRange(metrics, "transfers"),
      complexity: buildRange(metrics, "complexity"),
      walkingTime: buildRange(metrics, "walkingTime"),
      totalTime: buildRange(metrics, "totalTime"),
    };
  }

  function buildRange(metrics, key) {
    return metrics.reduce(
      function (range, metric) {
        var value = safeNumber(metric[key]);
        return {
          min: Math.min(range.min, value),
          max: Math.max(range.max, value),
        };
      },
      {
        min: Number.POSITIVE_INFINITY,
        max: Number.NEGATIVE_INFINITY,
      },
    );
  }

  function calculateGachigayoScore(route, scoreContext) {
    var context = scoreContext || buildScoreContext([route]);
    var metric = findScoreMetric(route, context);
    var score =
      normalizeLowerIsBetter(metric.transfers, context.transfers) *
        GACHIGAYO_SCORE.TRANSFER_WEIGHT +
      normalizeLowerIsBetter(metric.complexity, context.complexity) *
        GACHIGAYO_SCORE.COMPLEXITY_WEIGHT +
      normalizeLowerIsBetter(metric.walkingTime, context.walkingTime) *
        GACHIGAYO_SCORE.WALKING_WEIGHT +
      getFamiliarityScore(route) * GACHIGAYO_SCORE.FAMILIARITY_WEIGHT +
      normalizeLowerIsBetter(metric.totalTime, context.totalTime) *
        GACHIGAYO_SCORE.TOTAL_TIME_WEIGHT;

    return Math.round(clamp(score, 0, 100));
  }

  function findScoreMetric(route, scoreContext) {
    var metrics =
      scoreContext && scoreContext.metrics ? scoreContext.metrics : [];
    var metric = metrics.find(function (nextMetric) {
      return nextMetric.route === route;
    });

    return (
      metric || {
        transfers: safeNumber(route && route.transfers),
        complexity: calculateMeaningfulStepCount(route),
        walkingTime: calculateWalkingTime(route),
        totalTime: safeNumber(route && route.totalTime),
      }
    );
  }

  function normalizeLowerIsBetter(value, range) {
    if (
      !range ||
      !Number.isFinite(range.min) ||
      !Number.isFinite(range.max) ||
      range.min === range.max
    ) {
      return 100;
    }

    return clamp(
      ((range.max - safeNumber(value)) / (range.max - range.min)) * 100,
      0,
      100,
    );
  }

  function getFamiliarityScore() {
    return GACHIGAYO_SCORE.NEUTRAL_FAMILIARITY_SCORE;
  }

  function calculateMeaningfulStepCount(route) {
    return getValidSteps(route).filter(function (step) {
      return !!(
        step.type ||
        safeNumber(step.time) ||
        safeNumber(step.distance) ||
        (step.vehicles && step.vehicles.length) ||
        (step.stops && step.stops.length)
      );
    }).length;
  }

  function calculateWalkingTime(route) {
    return getValidSteps(route).reduce(function (sum, step) {
      return isWalkingStep(step) ? sum + safeNumber(step.time) : sum;
    }, 0);
  }

  function getValidSteps(route) {
    return route && Array.isArray(route.steps)
      ? route.steps.filter(function (step) {
          return !!step;
        })
      : [];
  }

  function createRecommendationReason(route) {
    var transfers = safeNumber(route.transfers);
    var walkingMinutes = secondsToMinutes(calculateWalkingTime(route));

    if (transfers === 0 && walkingMinutes <= 5) {
      return "환승 없이 걷는 시간이 짧아요";
    }

    if (transfers === 0) {
      return "환승 없이 이동할 수 있어요";
    }

    if (walkingMinutes <= 5) {
      return "걷는 시간이 비교적 짧아요";
    }

    if (transfers <= 1) {
      return "환승 부담이 적은 편이에요";
    }

    return "시간과 환승, 도보 구간을 함께 고려했어요";
  }

  function hasSameRoute(candidates, route) {
    return candidates.some(function (candidate) {
      return getRouteSignature(candidate.route) === getRouteSignature(route);
    });
  }

  function getRouteSignature(route) {
    return [
      safeNumber(route.totalTime),
      safeNumber(route.totalDistance),
      safeNumber(route.transfers),
      safeNumber(route.fare),
      getValidSteps(route)
        .map(function (step) {
          return [
            step.type || "",
            getRouteSignatureVehicleName(step),
            getStopsText(step.stops || []),
            safeNumber(step.time),
          ].join(":");
        })
        .join("/"),
    ].join("|");
  }

  function selectTab(tabName) {
    $(".route-filter-toolbar").toggle(tabName !== "walking");
    if (activeTab !== tabName) {
      selectedRoute = null;
      selectedPublicRouteIndex = null;
    }

    activeTab = tabName;
    $(".route-tab").removeClass("active").attr("aria-selected", "false");
    $('.route-tab[data-tab="' + tabName + '"]')
      .addClass("active")
      .attr("aria-selected", "true");
    setMessage("");

    if (tabName === "walking") {
      renderWalking();
      previewSelectedRoute();
      return;
    }

    renderPublicTransit();
    previewSelectedRoute();
  }

  function renderPublicTransit() {
    clearArrivalPanels();
    var $list = $("#routeList");
    $list.empty();

    if (
      !routeSearchResult.publicTransit ||
      !routeSearchResult.publicTransit.available ||
      !publicTransitCandidates.length
    ) {
      selectedRoute = null;
      updateGuideButton(false);
      $list.append(
        $("<div>")
          .addClass("empty-card")
          .text(
            (routeSearchResult.publicTransit &&
              (publicTransitCandidates.length
                ? routeSearchResult.publicTransit.message
                : transitFilter === "bus"
                  ? "버스만 이용하는 경로가 없습니다. 전체 경로를 확인해주세요."
                  : transitFilter === "subway"
                    ? "지하철만 이용하는 경로가 없습니다. 전체 경로를 확인해주세요."
                    : routeSearchResult.publicTransit.message)) ||
              "대중교통 경로를 찾지 못했습니다.",
          ),
      );
      return;
    }

    if (!selectedRoute) {
      selectedPublicRouteIndex = 0;
      selectedRoute = {
        mode: "PUBLIC_TRANSIT",
        route: publicTransitCandidates[0].route,
        selectionLabel: publicTransitCandidates[0].selectionLabel,
      };
    }
    updateGuideButton(true);

    $.each(publicTransitCandidates, function (index, candidate) {
      var route = candidate.route;
      var isRecommended = candidate.selectionLabel === "GACHIGAYO_RECOMMENDED";
      var $card = $("<button>")
        .attr("type", "button")
        .addClass("route-card")
        .toggleClass("recommended", isRecommended)
        .toggleClass("previously-completed", candidate.selectionLabel === "PREVIOUSLY_COMPLETED")
        .toggleClass(
          "selected",
          selectedRoute &&
            selectedRoute.mode === "PUBLIC_TRANSIT" &&
            index === selectedPublicRouteIndex,
        )
        .data("mode", "PUBLIC_TRANSIT")
        .data("route-index", index);

      $card.append(
        $("<span>").addClass("route-card-label").text(candidate.label),
      );
      if (candidate.reason) {
        $card.append($("<p>").addClass("route-reason").text(candidate.reason));
      }
      $card.append(createTimeBlock(route.totalTime));
      $card.append(createMeta(route));
      $card.append(createSegmentBar(withAccessWalks(route)));
      $card.append(
        $("<div>").addClass("route-summary").text(createTransitSummary(route)),
      );
      $card.append(createTransitDetails(route.steps || []));

      $list.append($card);
      var arrivals = document.createElement("div");
      arrivals.className = "route-arrivals";
      $card.append(arrivals);
      arrivalDisposers.push(TransitRealtime.mount(arrivals, route.steps || []));
    });
  }

  function renderWalking() {
    clearArrivalPanels();
    var $list = $("#routeList");
    $list.empty();

    if (!routeSearchResult.walking || !routeSearchResult.walking.available) {
      selectedRoute = null;
      updateGuideButton(false);
      $list.append(
        $("<div>")
          .addClass("empty-card")
          .text(
            (routeSearchResult.walking && routeSearchResult.walking.message) ||
              "도보 경로를 찾지 못했습니다.",
          ),
      );
      var retry = $("<button>")
        .attr("type", "button")
        .addClass("walking-retry-button")
        .text("도보 경로 다시 찾기");
      retry.on("click", refreshWalkingRoute);
      $list.append(retry);
      return;
    }

    updateGuideButton(true);

    var walking = routeSearchResult.walking;
    selectedRoute = { mode: "WALKING", route: walking };
    var $card = $("<button>")
      .attr("type", "button")
      .addClass("route-card")
      .toggleClass(
        "selected",
        selectedRoute && selectedRoute.mode === "WALKING",
      )
      .toggleClass("previously-completed", completedRanks.has(walking))
      .data("mode", "WALKING");

    $card.append(
      $("<span>").addClass("route-card-label").text(completedRanks.has(walking) ? "가봤던 길" : "걸어서 이동해요"),
    );
    $card.append(createTimeBlock(walking.totalTime));

    var $meta = $("<div>").addClass("route-meta");
    $meta.append($("<span>").text(formatDistance(walking.totalDistance)));
    $card.append($meta);

    var $bar = $("<div>").addClass("segment-bar");
    $bar.append($("<span>").addClass("segment walking").css("width", "100%"));
    $card.append($bar);
    $card.append(createWalkingDetails(walking.steps || []));

    $list.append($card);
  }

  async function refreshWalkingRoute() {
    if (
      !NavigationUI.coordinate(currentOrigin) ||
      !NavigationUI.coordinate(selectedDestination)
    ) {
      setMessage("출발지와 목적지를 다시 선택해주세요.");
      return;
    }
    $(".walking-retry-button")
      .prop("disabled", true)
      .text("도보 경로를 찾고 있습니다…");
    try {
      var query = new URLSearchParams({
        startLongitude: currentOrigin.longitude,
        startLatitude: currentOrigin.latitude,
        endLongitude: selectedDestination.longitude,
        endLatitude: selectedDestination.latitude,
        destinationName: selectedDestination.placeName || "목적지",
      });
      var result = await NavigationUI.api("/map/routes?" + query, {
        signal: AbortSignal.timeout(40000),
      });
      routeSearchResult.walking = result.walking;
      sessionStorage.setItem(
        "routeSearchResult",
        JSON.stringify(routeSearchResult),
      );
      if (activeTab === "walking") {
        selectedRoute = null;
        renderWalking();
        previewSelectedRoute();
      }
    } catch (error) {
      setMessage(error.message);
    } finally {
      $(".walking-retry-button")
        .prop("disabled", false)
        .text("도보 경로 다시 찾기");
    }
  }

  function createTimeBlock(totalTime) {
    var $block = $("<div>").addClass("route-time");
    $block.append($("<strong>").text(formatMinutes(totalTime)));
    $block.append($("<span>").text(formatArrival(totalTime)));

    return $block;
  }

  function createMeta(route) {
    var $meta = $("<div>").addClass("route-meta");
    $meta.append(
      $("<span>").text("환승 " + safeNumber(route.transfers) + "회"),
    );

    if (safeNumber(route.fare) > 0) {
      $meta.append($("<span>").text(formatWon(route.fare)));
    }

    return $meta;
  }

  function createSegmentBar(steps) {
    var $bar = $("<div>").addClass("segment-bar");
    var total = steps.reduce(function (sum, step) {
      return sum + Math.max(safeNumber(step.time), 0);
    }, 0);

    if (total <= 0) {
      $bar.append($("<span>").addClass("segment walking").css("width", "100%"));
      return $bar;
    }

    $.each(steps, function (_, step) {
      var percent = Math.max(4, (safeNumber(step.time) / total) * 100);
      var minutes = Math.max(secondsToMinutes(step.time), 1);
      var $segment = $("<span>")
        .addClass("segment " + getSegmentClass(step))
        .css("width", percent + "%")
        .attr("title", minutes + "분");

      // 구간마다 걸리는 시간. 칸이 너무 좁으면 글씨가 안 들어가서 생략한다
      if (percent >= 12) {
        $segment.append($("<span>").addClass("segment-label").text(minutes + "분"));
      }
      $bar.append($segment);
    });

    return $bar;
  }

  function createTransitSummary(route) {
    var names = [];
    $.each(route.steps || [], function (_, step) {
      var name = getVehicleName(step);

      if (name && names.indexOf(name) < 0) {
        names.push(name);
      }
    });

    return names.length ? names.slice(0, 3).join(" -> ") : "도보 이동 포함";
  }

  function createTransitDetails(steps) {
    var $list = $("<ul>").addClass("route-detail-list");
    var detailCount = 0;

    $.each(steps, function (_, step) {
      if (detailCount >= 3) {
        return false;
      }

      if (isWalkingStep(step)) {
        return;
      }

      var text = createStepText(step);
      if (text) {
        var $item = $("<li>").append(
          $("<span>").addClass("step-main").text(text),
        );

        $list.append($item);
        detailCount++;
      }
    });

    if (!detailCount) {
      $list.append($("<li>").text("도보 이동 포함"));
    }

    return $list;
  }

  function createWalkingDetails(steps) {
    var $list = $("<ul>").addClass("route-detail-list");
    var shown = 0;

    $.each(steps, function (_, step) {
      if (shown >= 3) {
        return false;
      }

      if (step.guidance) {
        $list.append($("<li>").text(step.guidance));
        shown++;
      }
    });

    if (!shown) {
      $list.append($("<li>").text("도보 경로 안내를 준비했습니다."));
    }

    return $list;
  }

  function createStepText(step) {
    if (isWalkingStep(step)) {
      return "도보 " + formatMinutes(step.time);
    }

    var vehicleName = getVehicleName(step);
    var stopsText = getStopsText(step.stops || []);
    var baseText =
      vehicleName || step.guidance || getTransitTypeName(step.type);

    if (baseText && stopsText) {
      return baseText + " · " + stopsText;
    }

    return baseText || stopsText || null;
  }

  function getVehicleName(step) {
    if (step.vehicles && step.vehicles.length) {
      var vehicle = step.vehicles.find(function (item) {
        return item && item.name;
      });

      if (vehicle && vehicle.name) {
        return vehicle.name;
      }
    }

    return "";
  }

  function getRouteSignatureVehicleName(step) {
    return getVehicleName(step) || step.guidance || "";
  }

  function getStopsText(stops) {
    var normalizedStops = getNormalizedStops(stops);

    if (normalizedStops.length < 2) {
      return "";
    }

    return (
      normalizedStops[0] + " -> " + normalizedStops[normalizedStops.length - 1]
    );
  }

  function getNormalizedStops(stops) {
    return Array.isArray(stops)
      ? stops
          .map(function (stop) {
            return $.trim(String(stop || ""));
          })
          .filter(function (stop) {
            return !!stop;
          })
      : [];
  }

  function getTransitTypeName(type) {
    var normalized = (type || "").toUpperCase();

    if (normalized.indexOf("SUBWAY") >= 0) {
      return "지하철";
    }

    if (normalized.indexOf("BUS") >= 0) {
      return "버스";
    }

    return "";
  }

  function getSegmentClass(step) {
    var type = (step.type || "").toUpperCase();

    if (type.indexOf("SUBWAY") >= 0) {
      return "subway";
    }

    if (type.indexOf("BUS") >= 0) {
      return "bus";
    }

    return "walking";
  }

  function isBusStep(step) {
    return (step.type || "").toUpperCase().indexOf("BUS") >= 0;
  }

  function isSubwayStep(step) {
    return (step.type || "").toUpperCase().indexOf("SUBWAY") >= 0;
  }

  function isWalkingStep(step) {
    return (
      (step.type || "").toUpperCase().indexOf("WALK") >= 0 ||
      ((!step.vehicles || !step.vehicles.length) &&
        !(step.type || "").toUpperCase().match(/BUS|SUBWAY/))
    );
  }

  function saveSelectedRoute() {
    if (!selectedRoute) {
      setMessage("경로를 선택해주세요.");
      return;
    }

    isSavingSelectedRoute = true;
    updateGuideButton(false);

    var finalizedRoute = buildFinalSelectedRoute(selectedRoute);

    try {
      sessionStorage.setItem("selectedRoute", JSON.stringify(finalizedRoute));
      resetNavigationProgress(finalizedRoute);

      if (!isSelectedRouteSaved(finalizedRoute)) {
        throw new Error("selectedRoute save verification failed");
      }
    } catch (e) {
      isSavingSelectedRoute = false;
      updateGuideButton(true);
      setMessage("선택한 경로를 저장하지 못했습니다.");
      return;
    }
    window.location.href = finalizedRoute.nextPath || "/navigation.html";
  }

  function showSelectedRouteFeedback() {
    markSelectedRouteCard();
    updateGuideButton(true);
    setMessage("");
  }

  function markSelectedRouteCard() {
    previewSelectedRoute();
    $("#routeList .route-card").each(function () {
      var isSelected =
        selectedRoute &&
        $(this).data("mode") === selectedRoute.mode &&
        (selectedRoute.mode !== "PUBLIC_TRANSIT" ||
          Number($(this).data("route-index")) === selectedPublicRouteIndex);
      $(this).attr("aria-pressed", String(!!isSelected));
    });
    var $cards = $("#routeList .route-card");

    if (selectedRoute.mode === "PUBLIC_TRANSIT") {
      $cards.removeClass("selected");
      $cards
        .filter(function () {
          return (
            $(this).data("mode") === "PUBLIC_TRANSIT" &&
            Number($(this).data("route-index")) === selectedPublicRouteIndex
          );
        })
        .addClass("selected");
      return;
    }

    if (selectedRoute.mode === "WALKING") {
      $cards.removeClass("selected");
      $cards
        .filter(function () {
          return $(this).data("mode") === "WALKING";
        })
        .addClass("selected");
    }
  }

  function updateGuideButton(isRouteAvailable) {
    $("#guideButton")
      .prop("disabled", !isRouteAvailable || isSavingSelectedRoute)
      .text("안내하기");
  }

  function buildFinalSelectedRoute(selection) {
    var route = selection.route || {};
    var routeType = route.type || selection.mode;

    return {
      mode: selection.mode,
      type: routeType,
      selectedAt: Date.now(),
      selectionLabel: selection.selectionLabel || "",
      navigationReady: true,
      nextPath: "/navigation.html",
      origin: normalizeOrigin(currentOrigin),
      destination: normalizeSelectedDestination(selectedDestination),
      route: normalizeRouteForNavigation(route, routeType),
    };
  }

  function normalizeRouteForNavigation(route, routeType) {
    return {
      type: routeType,
      totalTime: safeNumber(route.totalTime),
      totalDistance: safeNumber(route.totalDistance),
      transfers: safeNumber(route.transfers),
      fare: safeNumber(route.fare),
      geometry: normalizeGeometry(
        route.geometry || route.coordinates || route.vertexes,
      ),
      steps: getValidSteps(route).map(function (step) {
        return {
          type: step.type || routeType || "WALKING",
          guidance: step.guidance || "",
          // AI가 쉬운 말로 바꾼 안내 (없으면 길안내 화면이 guidance를 쓴다)
          easyGuidance: step.easyGuidance || "",
          distance: safeNumber(step.distance),
          time: safeNumber(step.time),
          longitude: step.longitude != null ? step.longitude : null,
          latitude: step.latitude != null ? step.latitude : null,
          pathPoints: normalizePathPoints(
            step.pathPoints || (step.path && step.path.points),
          ),
          geometry: normalizeGeometry(
            step.geometry || step.coordinates || step.vertexes,
          ),
          stops: Array.isArray(step.stops) ? step.stops.slice() : [],
          vehicles: Array.isArray(step.vehicles) ? step.vehicles.slice() : [],
        };
      }),
    };
  }

  function normalizePathPoints(source) {
    return normalizeGeometry(source);
  }

  function normalizeGeometry(source) {
    if (!Array.isArray(source)) {
      return [];
    }

    return source.reduce(function (result, item) {
      var coordinate = normalizeGeometryCoordinate(item);
      if (coordinate) {
        result.push(coordinate);
        return result;
      }

      return result.concat(normalizeGeometry(item));
    }, []);
  }

  function normalizeGeometryCoordinate(item) {
    if (Array.isArray(item) && item.length >= 2) {
      return normalizeCoordinatePair(item[1], item[0]);
    }

    if (item && typeof item === "object") {
      return normalizeCoordinatePair(
        item.latitude != null ? item.latitude : item.lat,
        item.longitude != null ? item.longitude : item.lng,
      );
    }

    return null;
  }

  function normalizeCoordinatePair(latitudeSource, longitudeSource) {
    var latitude = Number(latitudeSource);
    var longitude = Number(longitudeSource);

    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
      return null;
    }

    if (
      latitude < -90 ||
      latitude > 90 ||
      longitude < -180 ||
      longitude > 180
    ) {
      return null;
    }

    return {
      latitude: latitude,
      longitude: longitude,
    };
  }

  function normalizeOrigin(origin) {
    return {
      placeName: (origin && origin.placeName) || (origin && origin.name) || "",
      addressName: (origin && origin.addressName) || "",
      roadAddressName: (origin && origin.roadAddressName) || "",
      latitude: origin && origin.latitude != null ? origin.latitude : null,
      longitude: origin && origin.longitude != null ? origin.longitude : null,
      accuracy: origin && origin.accuracy != null ? origin.accuracy : null,
      capturedAt:
        origin && origin.capturedAt != null ? origin.capturedAt : null,
    };
  }

  function normalizeSelectedDestination(destination) {
    return {
      id: (destination && destination.id) || "",
      placeName: (destination && destination.placeName) || "",
      categoryName: (destination && destination.categoryName) || "",
      addressName: (destination && destination.addressName) || "",
      roadAddressName: (destination && destination.roadAddressName) || "",
      longitude: (destination && destination.longitude) || "",
      latitude: (destination && destination.latitude) || "",
      phone: (destination && destination.phone) || "",
      placeUrl: (destination && destination.placeUrl) || "",
    };
  }

  function isSelectedRouteSaved(expectedRoute) {
    var savedRoute = readJson("selectedRoute");

    return (
      !!savedRoute &&
      savedRoute.selectedAt === expectedRoute.selectedAt &&
      savedRoute.type === expectedRoute.type &&
      !!savedRoute.route &&
      Array.isArray(savedRoute.route.steps)
    );
  }

  function resetNavigationProgress(route) {
    var routeKey = JourneyState.key(route);

    try {
      sessionStorage.setItem(
        NAVIGATION_PROGRESS_KEY,
        JSON.stringify({
          routeKey: routeKey,
          selectedRouteId: routeKey,
          stepIndex: 0,
          boarded: [],
          completed: false,
          updatedAt: Date.now(),
        }),
      );
    } catch (e) {
      sessionStorage.removeItem(NAVIGATION_PROGRESS_KEY);
    }
  }

  function readJson(key) {
    var raw = sessionStorage.getItem(key);

    if (!raw) {
      return null;
    }

    try {
      return JSON.parse(raw);
    } catch (e) {
      return null;
    }
  }

  /** 걸리는 시간: 60분 이상이면 "1시간 25분"(정각이면 "2시간"), 그보다 짧으면 "35분" */
  function formatMinutes(seconds) {
    var minutes = Math.max(secondsToMinutes(seconds), 1);
    if (minutes < 60) {
      return minutes + "분";
    }
    var hours = Math.floor(minutes / 60);
    var rest = minutes % 60;
    return hours + "시간" + (rest ? " " + rest + "분" : "");
  }

  function formatArrival(seconds) {
    var date = new Date(Date.now() + safeNumber(seconds) * 1000);
    var hours = date.getHours();
    var minutes = date.getMinutes();
    var period = hours < 12 ? "오전" : "오후";
    var displayHours = hours % 12 || 12;

    return period + " " + displayHours + "시 " + minutes + "분 도착";
  }

  function formatDistance(distance) {
    var meters = safeNumber(distance);

    if (meters < 1000) {
      return meters + "m";
    }

    return (meters / 1000).toFixed(1) + "km";
  }

  function formatWon(value) {
    return safeNumber(value).toLocaleString("ko-KR") + "원";
  }

  function secondsToMinutes(seconds) {
    return Math.ceil(safeNumber(seconds) / 60);
  }

  function clamp(value, min, max) {
    return Math.min(Math.max(value, min), max);
  }

  function safeNumber(value) {
    var number = Number(value);

    return Number.isFinite(number) ? number : 0;
  }

  function setMessage(message) {
    $("#compareMessage").text(message);
  }
})(jQuery);
