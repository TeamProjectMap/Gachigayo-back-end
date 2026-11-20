/*
 * 보호자: 새 경로의 경로 후보 고르기
 *
 * 후보를 고르는 규칙과 카드 모양은 이용자 경로 선택 화면(route-compare.js)과 같다.
 *  - 버스/지하철: 같이가요 추천 · 가장 빨라요 · 환승이 적어요 · 덜 걸어요 (최대 4개)
 *  - 걷기: 도보 경로 하나
 * 이용자 화면과 다른 점: 실시간 도착 정보는 없고, 버튼을 누르면 길안내 대신
 * 고른 경로를 저장하고 구간 기록 화면으로 간다.
 */
(function ($) {
  var DRAFT_KEY = "guardianRouteDraft";

  var GACHIGAYO_SCORE = {
    TRANSFER_WEIGHT: 0.35,
    COMPLEXITY_WEIGHT: 0.25,
    WALKING_WEIGHT: 0.15,
    FAMILIARITY_WEIGHT: 0.15,
    TOTAL_TIME_WEIGHT: 0.1,
    NEUTRAL_FAMILIARITY_SCORE: 50,
  };

  var draft = null;
  var comparisonMap = null;
  var routeSearchResult = null;
  var allTransitRoutes = [];
  var publicTransitCandidates = [];
  var transitFilter = "all";
  var activeTab = null;
  var selectedRoute = null;
  var currentScoreContext = null;
  var isSaving = false;

  $(function () {
    $("#backButton").on("click", function () {
      window.location.href = "/route-new.html";
    });

    $(".route-tab").on("click", function () {
      selectTab($(this).data("tab"));
    });

    $("[data-route-filter]").on("click", function () {
      transitFilter = $(this).data("route-filter");
      $("[data-route-filter]").attr("aria-pressed", "false");
      $(this).attr("aria-pressed", "true");

      var filtered = allTransitRoutes.filter(function (route) {
        var hasBus = (route.steps || []).some(isBusStep);
        var hasSubway = (route.steps || []).some(isSubwayStep);
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
      renderPublicTransit();
      previewSelectedRoute();
    });

    $("#routeList").on("click", ".route-card", function () {
      if (isSaving) {
        return;
      }

      setMessage("");

      if ($(this).data("mode") === "PUBLIC_TRANSIT") {
        var candidate = publicTransitCandidates[Number($(this).data("candidate-index"))];
        selectedRoute = { mode: "PUBLIC_TRANSIT", route: candidate.route };
      } else {
        selectedRoute = { mode: "WALKING", route: routeSearchResult.walking };
      }

      markSelectedRouteCard();
    });

    $("#guideButton").on("click", function () {
      if (!isSaving) {
        saveSelectedRoute();
      }
    });

    checkSession();
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

        loadOptions();
      },
      error: function () {
        window.location.replace("/login.html");
      },
    });
  }

  /** 새 경로 등록에서 넘겨준 이름·출발지·도착지로 경로 후보를 찾는다 */
  function loadOptions() {
    draft = readJson(DRAFT_KEY);

    if (!draft || !draft.routeName || !draft.start || !draft.end) {
      window.location.replace("/route-new.html");
      return;
    }

    $("#compareOriginName").text(draft.start.placeName || "출발지");
    $("#destinationName").text(draft.end.placeName || "도착지");
    $("#routeComparePage").removeClass("hidden");
    setMessage("경로를 찾는 중입니다.");

    NavigationUI.create(document.getElementById("compareMap"), draft.start)
      .then(function (view) {
        comparisonMap = view;
        previewSelectedRoute();
      })
      .catch(function () {});

    $.ajax({
      url: "/route/options",
      type: "get",
      dataType: "JSON",
      data: placeParams(),
      success: function (json) {
        if (!json.success) {
          setMessage(json.message || "경로를 찾지 못했습니다.");
          return;
        }

        setMessage("");
        routeSearchResult = {
          publicTransit: json.publicTransit,
          walking: json.walking,
        };
        allTransitRoutes =
          (json.publicTransit && json.publicTransit.available && json.publicTransit.routes) || [];
        publicTransitCandidates = allTransitRoutes.length
          ? selectRepresentativeRoutes(allTransitRoutes)
          : [];

        if (allTransitRoutes.length) {
          selectTab("publicTransit");
          return;
        }

        if (json.walking && json.walking.available) {
          selectTab("walking");
          return;
        }

        selectTab("publicTransit");
        setMessage("이동 가능한 경로를 찾지 못했습니다.");
      },
      error: function () {
        setMessage("경로를 찾는 중 오류가 발생했습니다.");
      },
    });
  }

  /* ------------------------- 후보 고르기 (이용자 화면과 같은 규칙) ------------------------- */

  function selectRepresentativeRoutes(routes) {
    var candidates = [];
    currentScoreContext = buildScoreContext(routes);

    addCandidateFromSorted(candidates, [findGachigayoRecommendedRoute(routes, currentScoreContext)],
      "같이가요 추천", "GACHIGAYO_RECOMMENDED", createRecommendationReason);
    addCandidateFromSorted(candidates, sortByTotalTime(routes), "가장 빨라요", "FASTEST", noReason);
    addCandidateFromSorted(candidates, sortByTransfers(routes), "환승이 적어요", "FEWEST_TRANSFER", noReason);
    addCandidateFromSorted(candidates, sortByWalkingTime(routes), "덜 걸어요", "LEAST_WALKING", noReason);

    return candidates.slice(0, 4);
  }

  function noReason() {
    return "";
  }

  function addCandidateFromSorted(candidates, routes, label, selectionLabel, reasonFactory) {
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
      route: route,
    });
  }

  function findGachigayoRecommendedRoute(routes, scoreContext) {
    return (
      routes.slice().sort(function (a, b) {
        var scoreDiff =
          calculateGachigayoScore(b, scoreContext) - calculateGachigayoScore(a, scoreContext);
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

  function sortByTotalTime(routes) {
    return routes.slice().sort(function (a, b) {
      return safeNumber(a.totalTime) - safeNumber(b.totalTime);
    });
  }

  function sortByTransfers(routes) {
    return routes.slice().sort(function (a, b) {
      var transferDiff = safeNumber(a.transfers) - safeNumber(b.transfers);
      return transferDiff !== 0 ? transferDiff : safeNumber(a.totalTime) - safeNumber(b.totalTime);
    });
  }

  function sortByWalkingTime(routes) {
    return routes.slice().sort(function (a, b) {
      var walkingDiff = calculateWalkingTime(a) - calculateWalkingTime(b);
      return walkingDiff !== 0 ? walkingDiff : safeNumber(a.totalTime) - safeNumber(b.totalTime);
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
        return { min: Math.min(range.min, value), max: Math.max(range.max, value) };
      },
      { min: Number.POSITIVE_INFINITY, max: Number.NEGATIVE_INFINITY },
    );
  }

  function calculateGachigayoScore(route, scoreContext) {
    var context = scoreContext || buildScoreContext([route]);
    var metric = findScoreMetric(route, context);
    var score =
      normalizeLowerIsBetter(metric.transfers, context.transfers) * GACHIGAYO_SCORE.TRANSFER_WEIGHT +
      normalizeLowerIsBetter(metric.complexity, context.complexity) * GACHIGAYO_SCORE.COMPLEXITY_WEIGHT +
      normalizeLowerIsBetter(metric.walkingTime, context.walkingTime) * GACHIGAYO_SCORE.WALKING_WEIGHT +
      GACHIGAYO_SCORE.NEUTRAL_FAMILIARITY_SCORE * GACHIGAYO_SCORE.FAMILIARITY_WEIGHT +
      normalizeLowerIsBetter(metric.totalTime, context.totalTime) * GACHIGAYO_SCORE.TOTAL_TIME_WEIGHT;

    return Math.round(clamp(score, 0, 100));
  }

  function findScoreMetric(route, scoreContext) {
    var metrics = scoreContext && scoreContext.metrics ? scoreContext.metrics : [];
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
    if (!range || !Number.isFinite(range.min) || !Number.isFinite(range.max) || range.min === range.max) {
      return 100;
    }
    return clamp(((range.max - safeNumber(value)) / (range.max - range.min)) * 100, 0, 100);
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
            getVehicleName(step) || step.guidance || "",
            getStopsText(step.stops || []),
            safeNumber(step.time),
          ].join(":");
        })
        .join("/"),
    ].join("|");
  }

  /* ------------------------- 화면 ------------------------- */

  function selectTab(tabName) {
    $(".route-filter-toolbar").toggle(tabName !== "walking");
    if (activeTab !== tabName) {
      selectedRoute = null;
    }

    activeTab = tabName;
    $(".route-tab").removeClass("active").attr("aria-selected", "false");
    $('.route-tab[data-tab="' + tabName + '"]').addClass("active").attr("aria-selected", "true");
    setMessage("");

    if (tabName === "walking") {
      renderWalking();
    } else {
      renderPublicTransit();
    }
    previewSelectedRoute();
  }

  function renderPublicTransit() {
    var $list = $("#routeList").empty();
    var publicTransit = routeSearchResult && routeSearchResult.publicTransit;

    if (!publicTransit || !publicTransit.available || !publicTransitCandidates.length) {
      selectedRoute = null;
      updateButton(false);
      $list.append(
        $("<div>")
          .addClass("empty-card")
          .text(
            transitFilter === "bus"
              ? "버스만 이용하는 경로가 없습니다. 전체 경로를 확인해주세요."
              : transitFilter === "subway"
                ? "지하철만 이용하는 경로가 없습니다. 전체 경로를 확인해주세요."
                : (publicTransit && publicTransit.message) || "대중교통 경로를 찾지 못했습니다.",
          ),
      );
      return;
    }

    if (!selectedRoute) {
      selectedRoute = { mode: "PUBLIC_TRANSIT", route: publicTransitCandidates[0].route };
    }
    updateButton(true);

    $.each(publicTransitCandidates, function (index, candidate) {
      var route = candidate.route;
      var $card = $("<button>")
        .attr("type", "button")
        .addClass("route-card")
        .toggleClass("recommended", candidate.selectionLabel === "GACHIGAYO_RECOMMENDED")
        .toggleClass("selected", selectedRoute.route === route)
        .attr("aria-pressed", String(selectedRoute.route === route))
        .data("mode", "PUBLIC_TRANSIT")
        .data("candidate-index", index);

      $card.append($("<span>").addClass("route-card-label").text(candidate.label));
      if (candidate.reason) {
        $card.append($("<p>").addClass("route-reason").text(candidate.reason));
      }
      $card.append(createTimeBlock(route.totalTime));
      $card.append(createMeta(route));
      $card.append(createSegmentBar(withAccessWalks(route)));
      $card.append($("<div>").addClass("route-summary").text(createTransitSummary(route)));
      $card.append(createTransitDetails(route.steps || []));

      $list.append($card);
    });
  }

  function renderWalking() {
    var $list = $("#routeList").empty();
    var walking = routeSearchResult && routeSearchResult.walking;

    if (!walking || !walking.available) {
      selectedRoute = null;
      updateButton(false);
      $list.append(
        $("<div>")
          .addClass("empty-card")
          .text((walking && walking.message) || "도보 경로를 찾지 못했습니다."),
      );
      return;
    }

    updateButton(true);
    selectedRoute = { mode: "WALKING", route: walking };

    var $card = $("<button>")
      .attr("type", "button")
      .addClass("route-card selected")
      .attr("aria-pressed", "true")
      .data("mode", "WALKING");

    $card.append($("<span>").addClass("route-card-label").text("걸어서 이동해요"));
    $card.append(createTimeBlock(walking.totalTime));
    $card.append($("<div>").addClass("route-meta").append($("<span>").text(formatDistance(walking.totalDistance))));

    var $bar = $("<div>").addClass("segment-bar");
    $bar.append($("<span>").addClass("segment walking").css("width", "100%"));
    $card.append($bar);
    $card.append(createWalkingDetails(walking.steps || []));

    $list.append($card);
  }

  function markSelectedRouteCard() {
    $("#routeList .route-card").each(function () {
      var $card = $(this);
      var isSelected =
        selectedRoute &&
        $card.data("mode") === selectedRoute.mode &&
        (selectedRoute.mode !== "PUBLIC_TRANSIT" ||
          publicTransitCandidates[Number($card.data("candidate-index"))].route === selectedRoute.route);
      $card.toggleClass("selected", !!isSelected).attr("aria-pressed", String(!!isSelected));
    });
    previewSelectedRoute();
  }

  function previewSelectedRoute() {
    if (!comparisonMap) {
      return;
    }
    if (!selectedRoute || !selectedRoute.route) {
      comparisonMap.route([]);
      return;
    }
    comparisonMap.route(
      selectedRoute.mode === "PUBLIC_TRANSIT"
        ? withAccessWalks(selectedRoute.route)
        : selectedRoute.route.steps || [],
    );
  }

  /**
   * 카카오 대중교통 경로에는 출발지 → 타는 곳, 내린 곳 → 도착지 도보가 빠져 있다.
   * (총 21분인데 단계는 버스 12분 하나뿐인 식)
   * 빠진 시간·거리를 앞뒤 도보 구간으로 채워서 막대와 지도에 출발지부터 도착지까지 다 보이게 한다.
   * 앞뒤 나누기는 출발지~타는 곳, 내린 곳~도착지 직선거리 비율로 한다.
   * 화면에 보여주기만 하고, 저장은 서버가 따로 앞뒤 도보 구간을 붙인다.
   */
  function withAccessWalks(route) {
    var steps = getValidSteps(route);
    if (!steps.length || !draft) {
      return steps;
    }

    var stepTime = 0;
    var stepDistance = 0;
    $.each(steps, function (_, step) {
      stepTime += Math.max(safeNumber(step.time), 0);
      stepDistance += Math.max(safeNumber(step.distance), 0);
    });

    var missingTime = safeNumber(route.totalTime) - stepTime;
    var missingDistance = Math.max(safeNumber(route.totalDistance) - stepDistance, 0);
    if (missingTime < 30) {
      return steps;
    }

    var firstPoint = firstPathPoint(steps);
    var lastPoint = lastPathPoint(steps);
    var before = firstPoint ? straightDistance(draft.start, firstPoint) : 0;
    var after = lastPoint ? straightDistance(lastPoint, draft.end) : 0;
    var beforeShare = before + after > 0 ? before / (before + after) : 0.5;

    var result = steps.slice();
    var beforeTime = Math.round(missingTime * beforeShare);
    var afterTime = missingTime - beforeTime;

    if (beforeTime >= 30) {
      result.unshift(accessWalk(beforeTime, missingDistance * beforeShare, draft.start, firstPoint));
    }
    if (afterTime >= 30) {
      result.push(accessWalk(afterTime, missingDistance * (1 - beforeShare), lastPoint, draft.end));
    }
    return result;
  }

  function accessWalk(time, distance, from, to) {
    var points = [from, to].filter(function (point) {
      return NavigationUI.coordinate(point);
    }).map(function (point) {
      return { longitude: Number(point.longitude), latitude: Number(point.latitude) };
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

  /** 두 지점 사이 직선거리(m) */
  function straightDistance(a, b) {
    if (!NavigationUI.coordinate(a) || !NavigationUI.coordinate(b)) {
      return 0;
    }
    var rad = Math.PI / 180;
    var lat1 = Number(a.latitude) * rad;
    var lat2 = Number(b.latitude) * rad;
    var dLat = lat2 - lat1;
    var dLng = (Number(b.longitude) - Number(a.longitude)) * rad;
    var h = Math.sin(dLat / 2) * Math.sin(dLat / 2)
      + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
    return 6371000 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
  }

  function createTimeBlock(totalTime) {
    return $("<div>")
      .addClass("route-time")
      .append($("<strong>").text(formatMinutes(totalTime)))
      .append($("<span>").text(formatArrival(totalTime)));
  }

  function createMeta(route) {
    var $meta = $("<div>").addClass("route-meta");
    $meta.append($("<span>").text("환승 " + safeNumber(route.transfers) + "회"));
    if (safeNumber(route.fare) > 0) {
      $meta.append($("<span>").text(safeNumber(route.fare).toLocaleString("ko-KR") + "원"));
    }
    return $meta;
  }

  function createSegmentBar(steps) {
    var $bar = $("<div>").addClass("segment-bar");
    var total = steps.reduce(function (sum, step) {
      return sum + Math.max(safeNumber(step.time), 0);
    }, 0);

    if (total <= 0) {
      return $bar.append($("<span>").addClass("segment walking").css("width", "100%"));
    }

    $.each(steps, function (_, step) {
      var percent = Math.max(4, (safeNumber(step.time) / total) * 100);
      var minutes = Math.max(secondsToMinutes(step.time), 1);
      var $segment = $("<span>")
        .addClass("segment " + getSegmentClass(step))
        .css("width", percent + "%")
        .attr("title", minutes + "분");

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
        $list.append($("<li>").append($("<span>").addClass("step-main").text(text)));
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
    var vehicleName = getVehicleName(step);
    var stopsText = getStopsText(step.stops || []);
    var baseText = vehicleName || step.guidance || getTransitTypeName(step.type);

    if (baseText && stopsText) {
      return baseText + " · " + stopsText;
    }
    return baseText || stopsText || null;
  }

  function getVehicleName(step) {
    var vehicle = (step.vehicles || []).find(function (item) {
      return item && item.name;
    });
    return vehicle ? vehicle.name : "";
  }

  function getStopsText(stops) {
    var normalized = Array.isArray(stops)
      ? stops
          .map(function (stop) {
            return $.trim(String(stop || ""));
          })
          .filter(Boolean)
      : [];
    return normalized.length < 2 ? "" : normalized[0] + " -> " + normalized[normalized.length - 1];
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
    if (isSubwayStep(step)) {
      return "subway";
    }
    if (isBusStep(step)) {
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
      ((!step.vehicles || !step.vehicles.length) && !(step.type || "").toUpperCase().match(/BUS|SUBWAY/))
    );
  }

  /* ------------------------- 저장 ------------------------- */

  /** 고른 경로로 등록하고 바로 구간 기록 화면으로 간다 */
  function saveSelectedRoute() {
    if (!selectedRoute) {
      setMessage("경로를 선택해주세요.");
      return;
    }

    // 서버는 처음 받은 순서(몇 번째 경로인지)로 고른 경로를 찾는다
    var routeIndex = selectedRoute.mode === "PUBLIC_TRANSIT"
      ? allTransitRoutes.indexOf(selectedRoute.route)
      : 0;

    isSaving = true;
    $("#guideButton").prop("disabled", true).text("저장하는 중...");

    $.ajax({
      url: "/route",
      type: "post",
      dataType: "JSON",
      data: $.extend(placeParams(), {
        routeName: draft.routeName,
        startName: draft.start.placeName,
        mode: selectedRoute.mode,
        routeIndex: routeIndex,
      }),
      success: function (json) {
        if (!json.success) {
          isSaving = false;
          updateButton(true);
          setMessage(json.message || "경로를 등록하지 못했습니다.");
          return;
        }

        try {
          sessionStorage.removeItem(DRAFT_KEY);
        } catch (e) {}

        // 뒤로 가기로 이 화면에 다시 와서 같은 경로를 또 저장하지 않게 replace
        window.location.replace("/route-record.html?id=" + json.routeId);
      },
      error: function () {
        isSaving = false;
        updateButton(true);
        setMessage("경로 등록 중 오류가 발생했습니다.");
      },
    });
  }

  function placeParams() {
    return {
      startLongitude: draft.start.longitude,
      startLatitude: draft.start.latitude,
      endName: draft.end.placeName,
      endLongitude: draft.end.longitude,
      endLatitude: draft.end.latitude,
    };
  }

  function updateButton(isRouteAvailable) {
    $("#guideButton").prop("disabled", !isRouteAvailable || isSaving).text("이 경로로 기록하기");
  }

  /* ------------------------- 도움 함수 ------------------------- */

  function readJson(key) {
    try {
      var raw = sessionStorage.getItem(key);
      return raw ? JSON.parse(raw) : null;
    } catch (e) {
      return null;
    }
  }

  function formatMinutes(seconds) {
    return "약 " + Math.max(secondsToMinutes(seconds), 1) + "분";
  }

  function formatArrival(seconds) {
    var date = new Date(Date.now() + safeNumber(seconds) * 1000);
    var hours = date.getHours();
    var period = hours < 12 ? "오전" : "오후";
    return period + " " + (hours % 12 || 12) + "시 " + date.getMinutes() + "분 도착";
  }

  function formatDistance(distance) {
    var meters = safeNumber(distance);
    return meters < 1000 ? meters + "m" : (meters / 1000).toFixed(1) + "km";
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
    $("#compareMessage").text(message || "");
  }
})(jQuery);
