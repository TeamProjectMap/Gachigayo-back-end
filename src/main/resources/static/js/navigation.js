(() => {
  "use strict";
  const { api, read, create, locate, color } = NavigationUI,
    { valid, distance, match, summarize } = NavigationGeometry;
  const $ = (id) => document.getElementById(id),
    text = (id, value) => ($(id).textContent = value);
  let selection,
    steps = [],
    index = 0,
    view,
    position,
    locationMarker,
    watchId,
    confirmations = 0,
    lastConfirmation = 0;
  let following = true,
    stepRemaining = null,
    stepProgress = 0,
    tripId = null,
    lastSent = 0,
    tripStarting = false;
  let navigationStartedAt = null;
  let arrivalOutcome = null;
  let arrivalSent = false,
    live = true;
  let landmarks = [],
    shownLandmark = null,
    announcedLandmarkId = null,
    dismissedLandmarks = [];
  let sessionUserId = null,
    shareLocation = true,
    boarded = new Set();
  // 탑승 자동 감지 + 막혔을 때만 버튼 보이기
  const BOARD_SPEED = 4.2; // m/s (약 15km/h) 넘게 노선을 따라 움직이면 탄 것으로 본다
  const NO_FIX_STUCK_MS = 45000; // 이만큼 쓸 만한 위치가 없으면(지하·실내) 손으로 넘기게 한다
  let stepStartedAt = Date.now(),
    lastGoodFixAt = 0,
    prevFix = null,
    boardConfirm = 0;
  const mode = (step) =>
    String(step?.type || "WALKING").includes("SUBWAY")
      ? "SUBWAY"
      : String(step?.type || "").includes("BUS")
        ? "BUS"
        : "WALKING";
  const path = (step) => (step?.pathPoints || []).filter(valid);
  const label = (step) =>
    mode(step) === "BUS" ? "버스" : mode(step) === "SUBWAY" ? "지하철" : "도보";
  // AI가 쉬운 말로 바꾼 안내가 있으면 그걸, 없으면 카카오 원래 문구를 보여준다
  const guideText = (step) => step?.easyGuidance || step?.guidance || "";
  const routeKey = () => JourneyState.key(selection);
  function persist() {
    try {
      sessionStorage.setItem(
        "navigationProgress",
        JSON.stringify({
          routeKey: routeKey(),
          userId: sessionUserId,
          startedAt: navigationStartedAt,
          updatedAt: Date.now(),
          stepIndex: index,
          completed: index >= steps.length,
          boarded: [...boarded],
          dismissedLandmarks,
          arrivalOutcome,
        }),
      );
    } catch {
      text("gpsStatus", "안내 진행 상황을 저장하지 못했습니다.");
    }
  }
  function render() {
    const complete = index >= steps.length,
      step = steps[index],
      next = steps[index + 1];
    text("transportText", complete ? "도착" : label(step));
    $("transportVisual").className =
      "transport-visual " + (complete ? "arrival" : mode(step).toLowerCase());
    text(
      "guideTitle",
      complete
        ? "목적지에 도착했어요"
        : guideText(step) || `${label(step)}로 이동하세요`,
    );
    text(
      "guideSubtitle",
      complete
        ? "길안내가 완료되었습니다."
        : mode(step) === "WALKING"
          ? `약 ${Math.round(stepRemaining ?? Number(step.distance ?? 0))}m 이동`
          : (step.stops || []).filter(Boolean).join(" → "),
    );
    const transit = !complete && mode(step) !== "WALKING";
    // 버튼은 renderFallback이 막혔을 때만 보인다 (탑승은 자동 감지)
    text("boardingButton", `${label(step || {})}에 탔어요`);
    if (transit) {
      const stops = (step.stops || []).filter(Boolean);
      text(
        "guideTitle",
        boarded.has(index)
          ? `${stops.at(-1) || "하차 지점"}에서 내리세요`
          : `${label(step)}에 타세요`,
      );
      text(
        "guideSubtitle",
        boarded.has(index)
          ? guideText(step) || stops.join(" → ")
          : guideText(step) || stops.join(" → "),
      );
    }
    const cue = NavigationCue.forStep(step, { complete, boarded: boarded.has(index) });
    const transport = transit ? mode(step).toLowerCase() : cue.kind;
    $("transportIcon").src = transport === "subway"
      ? "/images/figma/13d6c.svg" : `/images/navigation/${transport}.svg`;
    text("guideCueLabel", transit ? "" : cue.label);
    $("transportVisual").dataset.cue = cue.kind;
    $("arrivalActions").classList.toggle("hidden", !complete);
    $("rerouteButton").hidden = complete;
    text(
      "nextGuide",
      next
        ? `다음 · ${guideText(next) || label(next) + "로 이동하세요"}`
        : complete
          ? ""
          : "마지막 구간입니다. 목적지를 확인해주세요.",
    );
    renderJourneySummary();
    $("stepFallback").querySelector("span").textContent =
      "위치가 잘 안 잡혀요. 이동을 마쳤다면 눌러주세요.";
    text(
      "nextStepFallbackButton",
      index === steps.length - 1 ? "도착했어요" : "다음 안내로",
    );
    renderFallback();
    $("journeySteps").replaceChildren();
    steps.forEach((s, i) => {
      const row = document.createElement("div");
      row.className =
        "journey-step" + (i === index ? " current" : i < index ? " done" : "");
      if (i === index) row.setAttribute("aria-current", "step");
      row.textContent = `${i + 1}. ${guideText(s) || label(s) + "로 이동하세요"}`;
      const meta = document.createElement("small");
      meta.textContent = `${label(s)} · 약 ${Math.ceil(Number(s.time || 0) / 60)}분 · ${Number(s.distance || 0)}m`;
      row.append(meta);
      $("journeySteps").append(row);
    });
    refreshRealtime();
    renderLandmark();
    if (complete) {
      stopWatch();
      // 도착 알림을 보낸 뒤(실패해도) 도착 팝업을 띄우고 잠시 후 홈으로
      Promise.resolve(notifyArrival()).finally(showArrivalPopup);
    }
  }
  function renderJourneySummary() {
    const result = summarize(steps, index, stepProgress),
      complete = index >= steps.length;
    const metres = Math.round(result.remainingDistance);
    const distanceText =
      metres >= 1000 ? (metres / 1000).toFixed(1) + "km" : metres + "m";
    text(
      "journeyRemaining",
      complete
        ? "도착"
        : `약 ${Math.ceil(result.remainingTime / 60)}분 · ${distanceText} 남음 · ${index + 1}/${steps.length}단계`,
    );
    text(
      "journeyArrival",
      complete
        ? "길안내 완료"
        : new Date(Date.now() + result.remainingTime * 1000).toLocaleTimeString(
            "ko-KR",
            { hour: "numeric", minute: "2-digit" },
          ) + " 도착 예정",
    );
    $("progressFill").style.width = `${result.progress * 100}%`;
  }
  /**
   * 막혔는지: 쓸 만한 위치가 한동안 없거나(지하철·실내), 길 정보가 없거나,
   * 예상 시간보다 한참(1.5배 + 2분) 지나도 이 단계가 안 끝났을 때. 이때만 손으로 넘기는 버튼을 보인다.
   */
  function isStuck() {
    if (index >= steps.length) return false;
    const step = steps[index];
    if (Date.now() - lastGoodFixAt > NO_FIX_STUCK_MS) return true;
    if (path(step).length < 2) return true;
    const expected = Math.max(Number(step.time) || 0, 60) * 1000;
    return Date.now() - stepStartedAt > expected * 1.5 + 120000;
  }
  /**
   * 이용자가 걷는 중에 폰을 보고 누르지 않아도 되게 손으로 넘기는 버튼은 보이지 않는다.
   * 탑승·도착·지하철 뒤 따라잡기는 모두 위치로 자동 처리한다.
   * 막혔을 때는 위치가 다시 잡히면 이어서 안내한다고만 알린다.
   */
  function renderFallback() {
    $("boardingButton").hidden = true;
    $("stepFallback").classList.add("hidden");
    if (index < steps.length && isStuck() && Date.now() - lastGoodFixAt > NO_FIX_STUCK_MS) {
      text("gpsStatus", "위치가 잘 안 잡혀요. 다시 잡히면 이어서 안내할게요.");
    }
  }
  /**
   * 목적지 가까이(보통 25m, 역·공원처럼 넓은 곳은 60m) 들어오면
   * 어느 단계에 있든 도착 (두 번 연속 확인)
   */
  let arriveConfirm = 0;
  function autoArrive(fix) {
    const dest = selection?.destination;
    if (!valid(dest) || distance(fix, dest) > NavigationUI.arrivalRadius(dest)) {
      arriveConfirm = 0;
      return false;
    }
    if (++arriveConfirm < 2) return false;
    index = steps.length;
    persist();
    render();
    return true;
  }
  /**
   * 지하철·실내에서 위치를 잃었다가 다시 잡혔을 때, 이미 뒤 단계의 걷는 길 위에 있으면 그 단계로 건너뛴다.
   * (예전에는 '다음 안내로'를 눌러야 했다) GPS 튐을 막으려고 같은 단계로 두 번 연속 확인한다.
   */
  let catchUpTarget = -1,
    catchUpConfirm = 0;
  function autoCatchUp(fix) {
    let found = -1;
    for (let i = index + 1; i < steps.length; i++) {
      const pts = path(steps[i]);
      if (mode(steps[i]) === "WALKING" && pts.length >= 2 && match(fix, pts).distance <= 30) {
        found = i;
        break;
      }
    }
    // 지금 단계의 길 위에 있으면 건너뛰지 않는다
    const current = path(steps[index]);
    if (found < 0 || (current.length >= 2 && match(fix, current).distance <= 30)) {
      catchUpTarget = -1;
      catchUpConfirm = 0;
      return false;
    }
    catchUpConfirm = found === catchUpTarget ? catchUpConfirm + 1 : 1;
    catchUpTarget = found;
    if (catchUpConfirm < 2) return false;
    for (let i = index; i < found; i++) {
      if (mode(steps[i]) !== "WALKING") boarded.add(i);
    }
    index = found;
    catchUpTarget = -1;
    catchUpConfirm = 0;
    confirmations = 0;
    stepRemaining = null;
    stepProgress = 0;
    stepStartedAt = Date.now();
    persist();
    render();
    focusCurrent();
    return true;
  }
  /** 버스·지하철에 탔다 (자동 감지 또는 버튼) → '내리세요' 안내로 */
  function markBoarded(auto) {
    if (index >= steps.length || boarded.has(index)) return;
    boarded.add(index);
    confirmations = 0;
    lastConfirmation = 0;
    boardConfirm = 0;
    stepStartedAt = Date.now();
    persist();
    render();
    text(
      "gpsStatus",
      auto
        ? `${label(steps[index])}에 탄 것을 확인했어요. 내릴 곳을 안내할게요.`
        : "탑승을 확인했습니다. 하차할 곳을 안내합니다.",
    );
  }
  function advance() {
    if (index >= steps.length) return;
    if (mode(steps[index]) !== "WALKING" && !boarded.has(index)) {
      text("gpsStatus", "버스나 지하철에 탄 뒤 다시 눌러주세요.");
      return;
    }
    stepStartedAt = Date.now();
    index++;
    confirmations = 0;
    lastConfirmation = 0;
    stepRemaining = null;
    stepProgress = 0;
    persist();
    render();
    focusCurrent();
  }
  function focusCurrent() {
    if (!view || !following) return;
    const anchor = position || path(steps[index])[0] || selection.origin;
    if (valid(anchor)) {
      view.map.setLevel(4);
      view.map.setCenter(
        new kakao.maps.LatLng(anchor.latitude, anchor.longitude),
      );
    }
  }
  function overview() {
    if (!view) return;
    following = false;
    updateFollow();
    view.fit(steps.flatMap(path));
  }
  function updateFollow() {
    const b = $("myLocationButton");
    if (b) {
      b.classList.toggle("is-following", following);
      b.setAttribute("aria-pressed", String(following));
    }
  }
  async function initMap() {
    const shell = $("navigationMap");
    shell.replaceChildren();
    const canvas = shell;
    try {
      view = await create(canvas, selection.origin || selection.destination);
      if (!live) return;
      view.route(steps);
      // 피그마에 없는 +/− 확대 버튼은 달지 않는다 (손가락으로 확대·축소)
      const button = document.createElement("button");
      button.type = "button";
      button.id = "myLocationButton";
      button.className = "my-location-button is-following";
      button.textContent = "◎";
      button.setAttribute("aria-label", "내 위치를 따라가기");
      button.setAttribute("aria-pressed", "true");
      button.addEventListener("click", () => {
        following = true;
        updateFollow();
        if (position) focusCurrent();
        else
          locate()
            .then(onPosition)
            .catch((e) => text("gpsStatus", e.message));
      });
      shell.append(button);
      shell.classList.add("map-ready");
      kakao.maps.event.addListener(view.map, "dragstart", () => {
        following = false;
        updateFollow();
      });
      if (position) paintPosition();
    } catch {
      canvas.textContent =
        "지도를 불러오지 못했습니다. 연결 상태를 확인하고 새로고침해주세요.";
    }
  }
  function paintPosition() {
    if (!view || !valid(position)) return;
    const ll = new kakao.maps.LatLng(position.latitude, position.longitude);
    if (!locationMarker) {
      const dot = document.createElement("div");
      dot.className = "current-location-dot";
      dot.setAttribute("aria-label", "현재 위치");
      locationMarker = new kakao.maps.CustomOverlay({
        map: view.map,
        position: ll,
        content: dot,
        zIndex: 10,
      });
    } else locationMarker.setPosition(ll);
    if (following) view.map.setCenter(ll);
  }
  function onPosition(fix) {
    if (!live || index >= steps.length) return;
    if (!valid(fix)) return;
    position = fix;
    paintPosition();
    renderLandmark();
    const accuracy = Number(fix.accuracy),
      step = steps[index],
      points = path(step),
      target = points.at(-1) || step;
    text(
      "gpsStatus",
      Number.isFinite(accuracy)
        ? `GPS 정확도 약 ${Math.round(accuracy)}m`
        : "위치 정확도를 확인 중입니다.",
    );
    if (!Number.isFinite(accuracy) || accuracy > 50) {
      confirmations = 0;
      text("gpsStatus", "위치 오차가 커서 자동 단계 전환을 기다리고 있습니다.");
      return;
    }
    sendLocation();
    lastGoodFixAt = Date.now();
    const before = prevFix;
    prevFix = fix;
    // 버튼 없이 알아서: 목적지 근처면 바로 도착, 뒤 단계 길 위에 있으면 그 단계로 건너뛴다
    if (autoArrive(fix) || autoCatchUp(fix)) return;
    if (mode(step) !== "WALKING" && !boarded.has(index)) {
      confirmations = 0;
      // 탑승 자동 감지: 노선 근처에서 빠르게(약 15km/h↑) 움직이면 두 번 연속 확인 후 탄 것으로 본다
      const speed = Number.isFinite(Number(fix.speed)) && fix.speed !== null
        ? Number(fix.speed)
        : before
          ? distance(before, fix) /
            Math.max(((Number(fix.capturedAt) || Date.now()) - (Number(before.capturedAt) || 0)) / 1000, 1)
          : 0;
      const nearLine = points.length < 2 || match(fix, points).distance <= 70;
      boardConfirm = speed >= BOARD_SPEED && nearLine ? boardConfirm + 1 : 0;
      if (boardConfirm >= 2) {
        markBoarded(true);
        return;
      }
      text("gpsStatus", `${label(step)}${mode(step) === "SUBWAY" ? "이" : "가"} 오면 타세요. 출발하면 자동으로 내릴 곳을 안내해요.`);
      renderFallback();
      return;
    }
    if (points.length < 2) {
      confirmations = 0;
      text(
        "gpsStatus",
        "이 구간은 길 정보가 없어요. 다음 길에 들어서면 이어서 안내할게요.",
      );
      return;
    }
    const progress = match(fix, points);
    if (mode(step) === "WALKING") {
      stepRemaining = progress.remaining;
      text("guideSubtitle", `약 ${Math.round(progress.remaining)}m 남았어요`);
      if (progress.distance > 70) {
        text(
          "gpsStatus",
          "경로에서 벗어난 것 같아요. 위치를 확인하고 경로를 다시 찾아주세요.",
        );
        confirmations = 0;
        return;
      }
    }
    if (progress.distance <= 70) {
      stepProgress = progress.progress;
      renderJourneySummary();
    }
    const endDistance = distance(fix, target),
      threshold = mode(step) === "WALKING" ? 25 : 50;
    if (
      endDistance <= threshold &&
      progress.progress >= 0.75 &&
      progress.distance <= 70
    ) {
      const capturedAt = Number(fix.capturedAt) || Date.now();
      if (capturedAt - lastConfirmation >= 1000) {
        lastConfirmation = capturedAt;
        confirmations++;
      }
      if (confirmations >= 2) advance();
    } else {
      confirmations = 0;
      lastConfirmation = 0;
    }
  }
  function startWatch() {
    if (watchId != null || index >= steps.length) return;
    if (!navigator.geolocation) {
      text(
        "gpsStatus",
        "현재 위치를 사용할 수 없습니다. 이동 단계를 확인해주세요.",
      );
      return;
    }
    watchId = navigator.geolocation.watchPosition(
      (p) =>
        onPosition({
          longitude: p.coords.longitude,
          latitude: p.coords.latitude,
          accuracy: p.coords.accuracy,
          // 버스·지하철로 빠르게 지나갈 때 보호자 사진을 띄우지 않으려고 (m/s, 없으면 null)
          speed: p.coords.speed,
          capturedAt: p.timestamp,
        }),
      (e) => {
        confirmations = 0;
        text(
          "gpsStatus",
          e.code === 1
            ? "브라우저에서 위치 권한을 허용해주세요. 이동 단계는 직접 확인할 수 있습니다."
            : "GPS를 찾고 있습니다. 위치가 확인되면 안내를 계속합니다.",
        );
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 },
    );
  }
  function stopWatch() {
    if (watchId != null) navigator.geolocation?.clearWatch(watchId);
    watchId = null;
  }
  async function startTrip() {
    const savedTripKey = sessionStorage.getItem("tripRouteKey");
    tripId =
      savedTripKey === routeKey()
        ? Number(sessionStorage.getItem("currentTripId")) || null
        : null;
    if (index >= steps.length) {
      if (tripId) notifyArrival();
      return;
    }
    if (tripId) {
      loadLandmarks();
      return;
    }
    if (tripStarting) return;
    tripStarting = true;
    try {
      // 실제 안내를 시작한 일반 경로만 기록한다. 식별 실패 시에도 기존 안내는 계속한다.
      const historyKey = selection.guardianRouteId ? "" : await RouteHistory.key(selection.route).catch(() => "");
      const r = await api("/trip/start", {
        method: "POST",
        body: new URLSearchParams({
          startName: selection.origin?.placeName || "현재 위치",
          endName: selection.destination?.placeName || "목적지",
          // 보호자가 같은 목적지로 등록한 경로를 이름이 조금 달라도 좌표로 찾게
          endLatitude: selection.destination?.latitude ?? "",
          endLongitude: selection.destination?.longitude ?? "",
          // '보호자 경로'에서 고른 길안내면 그 경로로 이동을 잇는다 (체크포인트 사진·알림)
          guardianRouteId: selection.guardianRouteId ?? "",
          totalDistance: selection.route.totalDistance || 0,
          totalDuration: selection.route.totalTime || 0,
          historyKey,
          startLatitude: selection.origin?.latitude ?? "",
          startLongitude: selection.origin?.longitude ?? "",
        }),
      });
      tripId = r.tripId;
      if (tripId) {
        sessionStorage.setItem("currentTripId", String(tripId));
        sessionStorage.setItem("tripRouteKey", routeKey());
        loadLandmarks();
      }
      if (index >= steps.length) notifyArrival();
      else sendLocation();
    } catch {
      text(
        "gpsStatus",
        "보호자에게 이동 시작을 알리지 못했습니다. 길안내는 계속됩니다.",
      );
    } finally {
      tripStarting = false;
    }
  }
  async function loadLandmarks() {
    if (!tripId) return;
    try {
      const response = await api(
        `/trip/${encodeURIComponent(tripId)}/landmarks`,
      );
      if (!live) return;
      landmarks = response.landmarks || [];
      renderLandmark();
    } catch {
      /* Optional photos do not block GPS guidance. */
    }
  }
  function renderLandmark() {
    shownLandmark =
      index < steps.length
        ? NavigationLandmarks.nearby(
            landmarks,
            steps[index],
            position,
            dismissedLandmarks,
          arrivalOutcome,
          )
        : null;
    $("landmarkCard").hidden = !shownLandmark;
    if (!shownLandmark) {
      announcedLandmarkId = null;
      return;
    }
    // 새 사진이 뜰 때 한 번 진동해서 화면을 안 보고 걷던 이용자도 알게 한다
    if (announcedLandmarkId !== shownLandmark.id) {
      announcedLandmarkId = shownLandmark.id;
      try {
        navigator.vibrate?.([200, 100, 200]);
      } catch {}
    }
    text("landmarkTitle", shownLandmark.title || "주변 장소를 확인해주세요");
    text(
      "landmarkDescription",
      shownLandmark.description || "사진 속 장소를 찾아보세요.",
    );
    const photo = $("landmarkPhoto");
    photo.alt = shownLandmark.title || "보호자가 등록한 장소 사진";
    let imageUrl;
    try {
      const candidate = new URL(shownLandmark.photoUrl || "", location.origin);
      if (candidate.origin === location.origin && candidate.pathname !== "/")
        imageUrl = candidate.href;
    } catch {}
    if (imageUrl && photo.src !== imageUrl) {
      photo.hidden = false;
      photo.src = imageUrl;
    } else if (!imageUrl) {
      photo.hidden = true;
      photo.removeAttribute("src");
    }
  }
  $("landmarkPhoto").addEventListener("error", () => {
    $("landmarkPhoto").hidden = true;
  });
  $("dismissLandmarkButton").addEventListener("click", () => {
    if (shownLandmark) dismissedLandmarks.push(shownLandmark.id);
    persist();
    renderLandmark();
  });
  async function sendLocation() {
    if (
      !shareLocation ||
      !tripId ||
      !position ||
      !Number.isFinite(Number(position.accuracy)) ||
      Number(position.accuracy) > 50 ||
      arrivalSent ||
      Date.now() - lastSent < 20000
    )
      return;
    lastSent = Date.now();
    try {
      await api("/trip/location", {
        method: "POST",
        body: new URLSearchParams({
          tripId,
          latitude: position.latitude,
          longitude: position.longitude,
        }),
      });
    } catch {
      text("gpsStatus", "위치 공유 연결을 확인 중입니다. 길안내는 계속됩니다.");
    }
  }
  function arrivalMessage(notified) {
    return notified ? "보호자에게 도착 알림을 보냈어요." : "도착을 기록했어요. 보호자 연결 또는 알림 설정에 따라 알림은 전송되지 않았어요.";
  }
  /**
   * 목적지 도착: 큰 팝업으로 알리고 4초 뒤 홈으로 나간다. 팝업을 누르면 바로 나간다.
   * 이용자가 폰을 조작하지 않아도 되게 버튼 없이 자동으로.
   */
  let arrivalPopupShown = false;
  function showArrivalPopup() {
    if (arrivalPopupShown) return;
    arrivalPopupShown = true;
    const goHome = () => {
      try {
        JourneyState.clear(sessionStorage);
      } catch {}
      location.replace("/user-home.html");
    };
    const popup = document.createElement("div");
    popup.className = "arrival-popup";
    popup.setAttribute("role", "alertdialog");
    popup.setAttribute("aria-label", "목적지 도착");
    popup.innerHTML =
      '<div class="arrival-popup-box"><span class="arrival-popup-check" aria-hidden="true"></span>' +
      "<strong>목적지에 도착했어요!</strong><p></p><small>잠시 후 홈으로 돌아가요</small></div>";
    popup.querySelector("p").textContent = selection?.destination?.placeName || "";
    popup.addEventListener("click", goHome);
    document.body.append(popup);
    try {
      navigator.vibrate?.([200, 100, 200]);
    } catch {}
    setTimeout(goHome, 4000);
  }
  async function notifyArrival() {
    if (arrivalOutcome) { text("arrivalNotificationStatus", arrivalMessage(arrivalOutcome.notified)); return; }
    if (arrivalSent) return;
    if (!tripId) {
      text(
        "arrivalNotificationStatus",
        "길안내가 완료되었습니다. 보호자 도착 알림을 보낼 이동 기록이 없습니다.",
      );
      return;
    }
    arrivalSent = true;
    try {
      text("arrivalNotificationStatus", "도착 처리를 하고 있습니다…");
      $("retryArrivalButton").hidden = true;
      const result = await api("/trip/arrived", {
        method: "POST",
        body: new URLSearchParams({
          tripId,
          destinationName: selection.destination?.placeName || "목적지",
        }),
      });
      arrivalOutcome = {notified: result.notified === true};
      text("arrivalNotificationStatus", arrivalMessage(arrivalOutcome.notified));
      persist();
      sessionStorage.removeItem("currentTripId");
      sessionStorage.removeItem("tripRouteKey");
      tripId = null;
    } catch {
      arrivalSent = false;
      $("retryArrivalButton").hidden = false;
      text(
        "arrivalNotificationStatus",
        "도착 처리를 하지 못했어요. 다시 시도해주세요.",
      );
      text(
        "gpsStatus",
        "도착 알림을 보내지 못했습니다. 다시 연결한 후 안내를 새로고침해주세요.",
      );
    }
  }
  let disposeArrivals;
  function stopRealtime() {
    disposeArrivals?.();
    disposeArrivals = null;
  }
  function refreshRealtime() {
    stopRealtime();
    const upcoming = steps
      .slice(index)
      .filter((step) => mode(step) !== "WALKING");
    disposeArrivals = TransitRealtime.mount(
      document.getElementById("liveTransitCard"),
      upcoming.slice(0, 2),
    );
  }
  async function reroute() {
    $("rerouteButton").disabled = true;
    try {
      const origin = await locate(),
        d = selection.destination;
      text("gpsStatus", "현재 위치에서 경로를 다시 찾고 있습니다…");
      const params = new URLSearchParams({
        startLongitude: origin.longitude,
        startLatitude: origin.latitude,
        endLongitude: d.longitude,
        endLatitude: d.latitude,
        destinationName: d.placeName || "목적지",
      });
      const r = await api("/map/routes?" + params, {
        signal: AbortSignal.timeout(40000),
      });
      if (!r.walking?.available && !r.publicTransit?.available)
        throw new Error(
          "현재 위치에서 경로를 찾지 못했습니다. 다시 시도해주세요.",
        );
      sessionStorage.setItem("currentOrigin", JSON.stringify(origin));
      sessionStorage.setItem("routeSearchResult", JSON.stringify(r));
      location.href = "/route-compare.html";
    } catch (e) {
      text("gpsStatus", e.message);
    } finally {
      $("rerouteButton").disabled = false;
    }
  }
  function cleanup() {
    if (navigationStartedAt && steps.length) persist();
    live = false;
    stopWatch();
    stopRealtime();
  }
  $("backButton").addEventListener(
    "click",
    () => (location.href = "/route-compare.html"),
  );
  $("compareButton").addEventListener(
    "click",
    () => (location.href = "/route-compare.html"),
  );
  $("overviewButton").addEventListener("click", overview);
  $("rerouteButton").addEventListener("click", reroute);
  $("boardingButton").addEventListener("click", () => markBoarded(false));
  // 시간이 지나 '막힘'이 될 수 있어 주기적으로 버튼을 다시 본다
  setInterval(() => {
    if (live && steps.length) renderFallback();
  }, 15000);
  $("retryArrivalButton").addEventListener("click", notifyArrival);
  $("nextStepFallbackButton").addEventListener("click", advance);
  $("helpButton").addEventListener("click", () => {
    sessionStorage.setItem("helpRequestEntryFromNavigation", "true");
    sessionStorage.removeItem("currentHelpRequestState");
    location.href = "/help-request.html";
  });
  window.addEventListener("pagehide", cleanup);
  function applyDevicePreferences() {
    const prefs = JourneyState.preferences(sessionUserId, localStorage);
    shareLocation = prefs.shareLocation;
  }
  window.addEventListener("storage", (event) => {
    if (
      sessionUserId &&
      (!event.key || event.key === `gachigayo:device:${sessionUserId}`)
    )
      applyDevicePreferences();
  });
  window.addEventListener("pageshow", (e) => {
    if (e.persisted && selection) {
      live = true;
      applyDevicePreferences();
      startWatch();
      refreshRealtime();
    }
  });
  (async () => {
    try {
      const s = await api("/user/session");
      sessionUserId = s.userId;
      const prefs = JourneyState.preferences(sessionUserId, localStorage);
      shareLocation = prefs.shareLocation;
      if (s.userRole !== "USER") {
        location.replace("/guardian-home.html");
        return;
      }
    } catch {
      location.replace("/login.html");
      return;
    }
    selection = read("selectedRoute");
    if (selection?.userId && selection.userId !== sessionUserId) {
      JourneyState.clear(sessionStorage);
      selection = null;
    }
    steps = selection?.route?.steps?.filter(Boolean) || [];
    $("navigationPage").classList.remove("hidden");
    if (!steps.length) {
      ["routeSummaryCard", "navigationMap", "guideCard"].forEach((id) =>
        $(id).classList.add("hidden"),
      );
      $("emptyPanel").classList.remove("hidden");
      document.querySelector(".journey-toolbar").hidden = true;
      document.querySelector(".journey-steps").hidden = true;
      text("gpsStatus", "선택한 경로가 없습니다.");
      return;
    }
    const progress = JourneyState.progress(
      selection,
      read("navigationProgress"),
    );
    index = progress.stepIndex;
    boarded = new Set(progress.boarded);
    const savedProgress = read("navigationProgress");
    navigationStartedAt = savedProgress?.routeKey === routeKey() && Number.isFinite(savedProgress.startedAt) && savedProgress.startedAt > 0 ? savedProgress.startedAt : Date.now();
    dismissedLandmarks =
      savedProgress?.routeKey === routeKey() &&
      Array.isArray(savedProgress.dismissedLandmarks)
        ? savedProgress.dismissedLandmarks
        : [];
    arrivalOutcome = savedProgress?.routeKey === routeKey() && typeof savedProgress.arrivalOutcome?.notified === "boolean" ? savedProgress.arrivalOutcome : null;
    text("originName", selection.origin?.placeName || "현재 위치");
    text("destinationName", selection.destination?.placeName || "목적지");
    persist();
    render();
    initMap();
    startTrip();
    startWatch();
  })();
})();
