(() => {
  "use strict";
  const { api, create, locate, coordinate } = NavigationUI;
  const $ = (id) => document.getElementById(id);
  let mapView,
    places = [],
    page = 1,
    center,
    mode = "results";
  let searchController,
    suggestController,
    timer,
    suggestions = [],
    activeSuggestion = -1,
    revision = 0,
    suggestionRevision = 0,
    composing = false,
    selectingSuggestion = false;
  const suggestionCache = new Map();
  let currentLocation,
    locatingPromise,
    locationState = "idle",
    locationAttemptedAt = 0;
  function locationLabel() {
    return currentLocation
      ? "검색어 일치도 우선 · 비슷한 장소는 가까운 순"
      : locationState === "loading"
        ? "현재 위치 확인 중 · 우선 관련도순"
        : "위치 확인 불가 · 관련도순";
  }
  function ensureCurrentLocation(force = false) {
    if (locatingPromise) return locatingPromise;
    if (!force && Date.now() - locationAttemptedAt < 30000)
      return Promise.resolve(currentLocation);
    locationAttemptedAt = Date.now();
    locationState = "loading";
    locatingPromise = locate()
      .then((point) => {
        currentLocation = point;
        center = point;
        locationState = "ready";
        suggestionCache.clear();
        mapView?.center(point);
        return point;
      })
      .catch(() => {
        if (center === currentLocation) center = undefined;
        currentLocation = undefined;
        locationState = "unavailable";
        return null;
      })
      .finally(() => {
        locatingPromise = null;
        if (document.activeElement === input && input.value.trim().length >= 2)
          requestSuggestions();
      });
    return locatingPromise;
  }
  function showAuthNotice() {
    showSuggestionStatus("로그인이 만료되어 추천 장소를 불러올 수 없습니다.");
    $("autocompleteList").replaceChildren();
    const row = document.createElement("li"),
      link = document.createElement("a");
    link.href = "/login.html";
    link.textContent = "다시 로그인하고 장소 검색하기";
    row.addEventListener("pointerdown", () => {
      selectingSuggestion = true;
    });
    row.append(link);
    $("autocompleteList").append(row);
  }
  const input = $("destinationSearchInput");
  const message = (text) => ($("searchMessage").textContent = text);
  const normalize = (p) => ({
    ...p,
    id: p.id || p.kakaoPlaceId,
    longitude: p.longitude ?? p.lng,
    latitude: p.latitude ?? p.lat,
    addressName: p.addressName || p.address,
    roadAddressName: p.roadAddressName || p.roadAddress,
  });
  const closeSuggestions = () => {
    $("autocompleteList").hidden = true;
    $("autocompleteStatus").hidden = true;
    document.querySelector(".map-sidebar").classList.remove("is-suggesting");
    input.setAttribute("aria-expanded", "false");
    input.removeAttribute("aria-activedescendant");
    activeSuggestion = -1;
  };
  const cancelSuggestions = () => {
    suggestionRevision++;
    suggestions = [];
    clearTimeout(timer);
    suggestController?.abort();
    closeSuggestions();
  };
  function showSuggestionStatus(text) {
    document.querySelector(".map-sidebar").classList.add("is-suggesting");
    $("autocompleteStatus").hidden = false;
    $("autocompleteStatus").textContent = text;
    $("autocompleteList").hidden = false;
    input.setAttribute("aria-expanded", "true");
  }
  function highlight(element, value, keyword) {
    const source = String(value || ""),
      index = source.toLocaleLowerCase().indexOf(keyword.toLocaleLowerCase());
    if (index < 0) {
      element.textContent = source;
      return;
    }
    const mark = document.createElement("mark");
    mark.textContent = source.slice(index, index + keyword.length);
    element.append(
      document.createTextNode(source.slice(0, index)),
      mark,
      document.createTextNode(source.slice(index + keyword.length)),
    );
  }
  function renderSuggestions(keyword, result) {
    suggestions = PlaceProximity.rank(
      (result.places || []).map(normalize),
      currentLocation,
      keyword,
    ).slice(0, 7);
    $("autocompleteList").replaceChildren();
    activeSuggestion = -1;
    input.removeAttribute("aria-activedescendant");
    suggestions.forEach((place, index) => {
      const item = document.createElement("li");
      item.id = `suggestion-${index}`;
      item.setAttribute("role", "option");
      item.setAttribute("aria-selected", "false");
      const icon = document.createElement("span");
      icon.className = "suggestion-icon";
      icon.textContent = "↗";
      icon.setAttribute("aria-hidden", "true");
      const copy = document.createElement("span");
      copy.className = "suggestion-copy";
      const name = document.createElement("strong");
      highlight(name, place.placeName, keyword);
      const address = document.createElement("small");
      highlight(
        address,
        place.roadAddressName ||
          place.addressName ||
          place.categoryName ||
          "주소 정보 없음",
        keyword,
      );
      copy.append(name, address);
      if (currentLocation) {
        const distance = document.createElement("span");
        distance.className = "suggestion-distance";
        distance.textContent = PlaceProximity.format(place.distanceMeters);
        copy.append(distance);
      }
      item.append(icon, copy);
      let pointerStart,
        picked = false;
      const choose = () => {
        if (picked) return;
        picked = true;
        cancelSuggestions();
        openPlace(place);
      };
      item.addEventListener("pointerdown", (event) => {
        selectingSuggestion = true;
        pointerStart = { x: event.clientX, y: event.clientY };
        if (event.pointerType === "mouse") event.preventDefault();
      });
      item.addEventListener("pointerup", (event) => {
        if (
          event.pointerType !== "mouse" &&
          pointerStart &&
          Math.abs(event.clientX - pointerStart.x) < 12 &&
          Math.abs(event.clientY - pointerStart.y) < 12
        ) {
          event.preventDefault();
          choose();
        }
      });
      item.addEventListener("click", choose);
      $("autocompleteList").append(item);
    });
    showSuggestionStatus(
      suggestions.length
        ? `‘${keyword}’ · ${locationLabel()}`
        : `‘${keyword}’ 관련 장소가 없습니다. 검색어를 더 입력해보세요.`,
    );
  }
  function requestSuggestions() {
    cancelSuggestions();
    searchController?.abort();
    revision++;
    $("moreResults").hidden = true;
    const keyword = input.value.trim();
    if (keyword.length < 2 || /[ㄱ-ㅎㅏ-ㅣ]/.test(keyword)) return;
    ensureCurrentLocation();
    const token = suggestionRevision,
      query = suggestionParams(keyword).toString();
    const cached = suggestionCache.get(query);
    if (cached && Date.now() - cached.at < 30000) {
      renderSuggestions(keyword, cached.result);
      return;
    }
    $("autocompleteList").replaceChildren();
    showSuggestionStatus(
      `‘${keyword}’ 관련 장소를 찾고 있습니다… ${locationLabel()}`,
    );
    timer = setTimeout(async () => {
      const controller = new AbortController();
      suggestController = controller;
      const timeout = setTimeout(() => controller.abort(), 10000);
      try {
        const result = await api(`/map/search?${query}`, {
          signal: controller.signal,
        });
        if (token !== suggestionRevision || input.value.trim() !== keyword)
          return;
        if (suggestionCache.size >= 20) suggestionCache.clear();
        suggestionCache.set(query, { result, at: Date.now() });
        renderSuggestions(keyword, result);
      } catch (error) {
        if (token !== suggestionRevision) return;
        if (error.code === "AUTH_REQUIRED") {
          showAuthNotice();
          return;
        }
        showSuggestionStatus(
          error.name === "AbortError"
            ? "추천 장소 연결이 지연되고 있습니다. 검색 버튼으로 다시 시도해주세요."
            : "추천 장소를 불러오지 못했습니다. 검색 버튼으로 다시 시도해주세요.",
        );
      } finally {
        clearTimeout(timeout);
      }
    }, 250);
  }
  function suggestionParams(keyword) {
    const query = new URLSearchParams({
      query: keyword,
      page: 1,
      sort: "accuracy",
    });
    if (coordinate(currentLocation)) {
      query.set("longitude", currentLocation.longitude);
      query.set("latitude", currentLocation.latitude);
    }
    return query;
  }
  function params(keyword, nextPage) {
    const p = new URLSearchParams({
      query: keyword,
      page: nextPage,
      sort: "accuracy",
    });
    if (coordinate(center)) {
      p.set("longitude", center.longitude);
      p.set("latitude", center.latitude);
    }
    return p;
  }
  /** 검색하면 지도를 배경에 깔고 장소는 아래 시트로 보여준다 (카카오맵처럼) */
  function setSearching(on) {
    $("routeSearchPage").classList.toggle("is-searching", on);
    $("clearSearchButton").hidden = !on;
    if (!on) $("searchThisArea").hidden = true;
  }
  function selectMode(next) {
    mode = next;
    document
      .querySelectorAll("[data-list]")
      .forEach((b) =>
        b.setAttribute("aria-pressed", String(b.dataset.list === mode)),
      );
  }
  async function search(append = false) {
    cancelSuggestions();
    const query = input.value.trim();
    if (!query) {
      message("장소 이름이나 주소를 입력해주세요.");
      return;
    }
    selectMode("results");
    setSearching(true);
    searchController?.abort();
    searchController = new AbortController();
    const currentRevision = ++revision,
      nextPage = append ? page + 1 : 1;
    $("moreResults").disabled = true;
    message("장소를 검색하고 있습니다…");
    if (!append) {
      places = [];
      render();
    }
    try {
      const result = await api(`/map/search?${params(query, nextPage)}`, {
        signal: searchController.signal,
      });
      if (currentRevision !== revision) return;
      page = nextPage;
      const seen = new Set(places.map((p) => p.id));
      places = [
        ...places,
        ...(result.places || []).map(normalize).filter((p) => !seen.has(p.id)),
      ];
      render();
      message(
        places.length
          ? `${query} · ${result.totalCount ?? places.length}개 중 ${places.length}개 표시`
          : "검색 결과가 없습니다. 다른 장소 이름이나 주소로 검색해주세요.",
      );
      $("moreResults").hidden = result.end !== false || page >= 45;
      sessionStorage.setItem("navigationSearchQuery", query);
    } catch (error) {
      if (error.name !== "AbortError" && currentRevision === revision)
        message(error.message);
    } finally {
      if (currentRevision === revision) $("moreResults").disabled = false;
    }
  }
  function render() {
    $("placeResultList").replaceChildren();
    $("moreResults").hidden = true;
    places.forEach((place, index) => {
      const row = document.createElement("article");
      row.className = "map-place-row";
      row.dataset.index = index;
      const select = document.createElement("button");
      select.type = "button";
      select.className = "place-select";
      const number = document.createElement("span");
      number.className = "place-number";
      number.textContent = index + 1;
      const copy = document.createElement("span");
      copy.className = "place-copy";
      const title = document.createElement("strong");
      title.textContent = place.placeName;
      const category = document.createElement("small");
      category.textContent = place.categoryName || "장소";
      const address = document.createElement("span");
      address.textContent =
        place.roadAddressName || place.addressName || "주소 정보 없음";
      copy.append(title, category, address);
      if (place.distance && center) {
        const distance = document.createElement("small");
        distance.textContent = `${Number(place.distance).toLocaleString("ko-KR")}m`;
        copy.append(distance);
      }
      select.append(number, copy);
      select.addEventListener("click", () => openPlace(place));
      row.append(select);
      if (mode !== "results") {
        const remove = document.createElement("button");
        remove.type = "button";
        remove.className = "remove-place";
        remove.textContent = "삭제";
        remove.setAttribute("aria-label", `${place.placeName} 목록에서 삭제`);
        remove.addEventListener("click", async () => {
          remove.disabled = true;
          const list = mode;
          try {
            await api(`/place/${list}/delete`, {
              method: "POST",
              body: new URLSearchParams({ placeId: place.id }),
            });
            await saved(list);
          } catch (error) {
            message(error.message);
            remove.disabled = false;
          }
        });
        row.append(remove);
      }
      $("placeResultList").append(row);
    });
    drawPins();
  }
  function drawPins() {
    if (!mapView) return;
    mapView.clear();
    places.forEach((place, index) =>
      mapView.pin(place, String(index + 1), () => {
        document
          .querySelectorAll(".map-place-row")
          .forEach((row) =>
            row.classList.toggle(
              "highlighted",
              Number(row.dataset.index) === index,
            ),
          );
        const row = $("placeResultList").children[index];
        row?.scrollIntoView({ behavior: "smooth", block: "nearest" });
        row?.querySelector("button")?.focus({ preventScroll: true });
        mapView.center(place);
      }),
    );
    mapView.fit(places);
    // 아래 시트가 지도 아래쪽을 가리므로, 핀들이 시트 위 보이는 곳에 오게 지도를 내린다
    if ($("routeSearchPage").classList.contains("is-searching") && places.length) {
      const sheet = $("resultSheet").getBoundingClientRect().height;
      mapView.map.setLevel(mapView.map.getLevel() + (places.length > 1 ? 1 : 0));
      mapView.map.panBy(0, Math.round(sheet / 2));
    }
  }
  async function openPlace(place) {
    if (!coordinate(place)) {
      message(
        "이 장소의 위치 정보를 확인할 수 없습니다. 다른 검색 결과를 선택해주세요.",
      );
      return;
    }
    try {
      if (new URLSearchParams(location.search).get("select") === "origin") {
        sessionStorage.setItem(
          "currentOrigin",
          JSON.stringify({ ...place, capturedAt: Date.now(), manual: true }),
        );
        location.href = "/place-detail.html";
        return;
      }
      sessionStorage.setItem("selectedDestination", JSON.stringify(place));
      const data = { ...place, placeId: place.id };
      delete data.id;
      await api("/place/recent", {
        method: "POST",
        body: new URLSearchParams(data),
        signal: AbortSignal.timeout(3000),
      }).catch(() => {});
      location.href = "/place-detail.html";
    } catch {
      message(
        "선택한 장소를 저장할 수 없습니다. 브라우저 저장 공간을 확인해주세요.",
      );
    }
  }
  async function saved(next) {
    cancelSuggestions();
    searchController?.abort();
    const currentRevision = ++revision;
    selectMode(next);
    setSearching(false);
    message("목록을 불러오고 있습니다…");
    $("moreResults").hidden = true;
    try {
      const result = await api(`/place/${next}`);
      if (currentRevision !== revision) return;
      places = (result.places || []).map(normalize);
      render();
      message(
        places.length
          ? `${next === "recent" ? "최근 검색" : "자주 가는 곳"} ${places.length}개`
          : "아직 저장된 장소가 없습니다.",
      );
    } catch (error) {
      if (currentRevision === revision) message(error.message);
    }
  }
  input.addEventListener("compositionstart", () => {
    composing = true;
    cancelSuggestions();
  });
  input.addEventListener("compositionend", () => {
    composing = false;
    requestSuggestions();
  });
  // Korean input can keep the final full syllable in composition until blur.
  // Query complete syllables while typing; only isolated jamo are deferred.
  input.addEventListener("input", requestSuggestions);
  input.addEventListener("focus", () => {
    if (input.value.trim().length >= 2) requestSuggestions();
  });
  input.addEventListener("keydown", (event) => {
    if (event.isComposing || composing || event.keyCode === 229) return;
    if (event.key === "Escape") {
      event.preventDefault();
      cancelSuggestions();
      return;
    }
    if ($("autocompleteList").hidden || !suggestions.length) return;
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      activeSuggestion =
        (activeSuggestion +
          (event.key === "ArrowDown" ? 1 : -1) +
          suggestions.length) %
        suggestions.length;
      [...$("autocompleteList").children].forEach((item, index) =>
        item.setAttribute("aria-selected", String(index === activeSuggestion)),
      );
      input.setAttribute(
        "aria-activedescendant",
        `suggestion-${activeSuggestion}`,
      );
      $("autocompleteList").children[activeSuggestion]?.scrollIntoView({
        block: "nearest",
      });
    } else if (event.key === "Enter" && activeSuggestion >= 0) {
      event.preventDefault();
      const selected = suggestions[activeSuggestion];
      cancelSuggestions();
      openPlace(selected);
    }
  });
  input.addEventListener("blur", (event) => {
    if (
      !selectingSuggestion &&
      !$("autocompleteList").contains(event.relatedTarget)
    )
      cancelSuggestions();
  });
  document.addEventListener("pointerup", () => {
    setTimeout(() => {
      selectingSuggestion = false;
    }, 0);
  });
  document.addEventListener("pointercancel", () => {
    selectingSuggestion = false;
  });
  document.addEventListener("pointerdown", (event) => {
    if (!event.target.closest("#autocompleteList, #searchForm"))
      cancelSuggestions();
  });
  $("searchForm").addEventListener("submit", (event) => {
    event.preventDefault();
    if (!composing) search();
  });
  $("moreResults").addEventListener("click", () => search(true));
  // 지도 위 내 위치 버튼: 지도만 내 위치로 옮긴다
  $("locateButton").addEventListener("click", async () => {
    $("locateButton").disabled = true;
    const location = await ensureCurrentLocation(true);
    if (location) mapView?.center(location);
    else message("현재 위치를 확인하지 못했습니다. 브라우저 위치 권한을 확인해주세요.");
    $("locateButton").disabled = false;
  });
  // 검색어를 지우면 지도를 닫고 장소 목록으로 돌아간다
  $("clearSearchButton").addEventListener("click", () => {
    input.value = "";
    sessionStorage.removeItem("navigationSearchQuery");
    saved("recent");
    input.focus();
  });
  $("searchThisArea").addEventListener("click", () => {
    const p = mapView.map.getCenter();
    center = { latitude: p.getLat(), longitude: p.getLng() };
    search();
  });
  document
    .querySelectorAll("[data-list]")
    .forEach((b) =>
      b.addEventListener("click", () =>
        saved(b.dataset.list),
      ),
    );
  window.addEventListener("pagehide", () => {
    cancelSuggestions();
    searchController?.abort();
  });
  (async () => {
    try {
      const session = await api("/user/session");
      if (session.userRole !== "USER") {
        location.replace("/guardian-home.html");
        return;
      }
    } catch {
      location.replace("/login.html");
      return;
    }
    $("routeSearchPage").hidden = false;
    ensureCurrentLocation();
    if (new URLSearchParams(location.search).get("select") === "origin")
      $("searchTitle").textContent = "출발지를 선택해주세요";
    document.getElementById("searchBackButton").href =
      new URLSearchParams(location.search).get("select") === "origin"
        ? "/place-detail.html"
        : "/user-home.html";
    create($("searchMap"))
      .then((view) => {
        mapView = view;
        if (currentLocation) mapView.center(currentLocation);
        drawPins();
        kakao.maps.event.addListener(view.map, "dragend", () => {
          $("searchThisArea").hidden = false;
        });
      })
      .catch(() => {});
    const favorite =
        new URLSearchParams(location.search).get("view") === "favorites",
      previous = sessionStorage.getItem("navigationSearchQuery");
    if (favorite) saved("favorites");
    else if (previous) {
      input.value = previous;
      search();
    } else saved("recent");
  })();
})();
