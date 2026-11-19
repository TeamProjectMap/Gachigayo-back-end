(() => {
  "use strict";
  const { api } = NavigationUI,
    state = JourneyState;
  const $ = (id) => document.getElementById(id);
  const go = (path) => {
    location.href = path;
  };
  const message = (value) => {
    $("homeMessage").textContent = value;
  };
  let authenticatedUserId = null;
  function renderJourney() {
    const selection = state.read(sessionStorage, "selectedRoute"),
      saved = state.read(sessionStorage, "navigationProgress"),
      dismissed = state.read(sessionStorage, "homeResumeDismissed");
    const ready = state.canResume(selection, saved, authenticatedUserId) && dismissed?.routeKey !== state.key(selection);
    $("journeyResumePopup").hidden = !ready;
    $("userHomePage").classList.toggle("has-active-journey", ready);
    if (ready) {
      const progress = state.progress(selection, saved);
      $("activeJourneyTitle").textContent = `${selection.destination?.placeName || "목적지"} 가는 길`;
      $("activeJourneyDescription").textContent = (selection.route.steps[progress.stepIndex]?.easyGuidance || selection.route.steps[progress.stepIndex]?.guidance) || "누르면 길안내로 돌아가요";
    }
  }
  $("dismissJourneyButton").addEventListener("click", () => {
    const selection = state.read(sessionStorage, "selectedRoute");
    try { sessionStorage.setItem("homeResumeDismissed", JSON.stringify({routeKey: state.key(selection)})); }
    catch { message("팝업을 숨겼습니다. 새로고침하면 다시 표시될 수 있습니다."); }
    $("journeyResumePopup").hidden = true;
    $("userHomePage").classList.remove("has-active-journey");
  });
  let favoritePlaces = [];
  const deletingFavorites = new Set();
  const favoriteId = (place) => String(place.id || place.kakaoPlaceId || "");
  function renderFavorites() {
    const list = $("homeFavorites");
    list.replaceChildren();
    $("allFavoritesLink").textContent = `전체 보기 (${favoritePlaces.length})`;
    favoritePlaces.slice(0, 4).forEach((place) => {
      const tile = document.createElement("div"), button = document.createElement("button"),
        title = document.createElement("strong"), address = document.createElement("span"),
        remove = document.createElement("button");
      const id = favoriteId(place);
      tile.className = "favorite-tile";
      button.type = "button";
      button.className = "feature-card favorite-select";
      title.textContent = place.placeName;
      title.title = place.placeName;
      address.textContent = place.roadAddressName || place.roadAddress || place.addressName || place.address || "주소 정보 없음";
      button.setAttribute("aria-label", `${place.placeName}, ${address.textContent}`);
      button.append(title, address);
      button.addEventListener("click", () => {
        try {
          sessionStorage.setItem("selectedDestination", JSON.stringify({ ...place, id }));
          go("/place-detail.html");
        } catch { message("장소를 저장하지 못했습니다. 브라우저 저장 공간을 확인해주세요."); }
      });
      remove.type = "button";
      remove.className = "favorite-delete";
      remove.textContent = "×";
      remove.title = "즐겨찾기 삭제";
      remove.setAttribute("aria-label", `${place.placeName} 즐겨찾기 삭제`);
      remove.disabled = !id || deletingFavorites.has(id);
      remove.addEventListener("click", async () => {
        if (deletingFavorites.size || !window.confirm(`‘${place.placeName}’을 즐겨찾기에서 삭제할까요?`)) return;
        deletingFavorites.add(id);
        document.querySelectorAll("#homeFavorites .favorite-delete").forEach(button => { button.disabled = true; });
        try {
          await api("/place/favorites/delete", { method: "POST", body: new URLSearchParams({ placeId: id }) });
          favoritePlaces = favoritePlaces.filter(item => favoriteId(item) !== id);
          message(`${place.placeName}을 즐겨찾기에서 삭제했습니다.`);
          renderFavorites();
          $("allFavoritesLink").focus({ preventScroll: true });
        } catch (error) { message(error.message); remove.disabled = false; }
        finally {
          deletingFavorites.delete(id);
          document.querySelectorAll("#homeFavorites .favorite-delete").forEach(button => { button.disabled = false; });
        }
      });
      tile.append(button, remove);
      list.append(tile);
    });
    if (favoritePlaces.length < 4) {
      const add = document.createElement("button");
      add.type = "button";
      add.className = "feature-card favorite-add";
      add.textContent = "＋ 자주 가는 곳 추가";
      add.addEventListener("click", () => go("/route-search.html?view=favorites"));
      list.append(add);
    }
  }
  async function favorites() {
    try {
      const json = await api("/place/favorites");
      favoritePlaces = json.places || [];
      renderFavorites();
    } catch (error) { message(error.message); }
  }
  window.addEventListener("pageshow", event => { if (event.persisted) { renderJourney(); favorites(); } });
  document
    .querySelectorAll(".route-search-link")
    .forEach((button) =>
      button.addEventListener("click", () => go("/route-search.html")),
    );
  document
    .querySelectorAll(".favorite-places-link")
    .forEach((button) =>
      button.addEventListener("click", () =>
        go("/route-search.html?view=favorites"),
      ),
    );
  $("homeNavButton").addEventListener("click", () => go("/user-home.html"));
  $("settingNavButton").addEventListener("click", () => go("/settings.html"));
  $("connectionManageButton").addEventListener("click", () =>
    go("/settings.html#linkSectionTitle"),
  );
  $("resumeJourneyButton").addEventListener("click", () =>
    go("/navigation.html"),
  );
  document.querySelectorAll(".help-request-link").forEach((button) =>
    button.addEventListener("click", () => {
      sessionStorage.removeItem("helpRequestEntryFromNavigation");
      sessionStorage.removeItem("currentHelpRequestState");
      go("/help-request.html");
    }),
  );
  document
    .querySelector(".logout-button")
    .addEventListener("click", async () => {
      try {
        await api("/user/logout", { method: "POST" });
        state.clear(sessionStorage);
        location.replace("/login.html");
      } catch (error) {
        message(error.message);
      }
    });
  (async () => {
    let session;
    try {
      session = await api("/user/session");
    } catch {
      location.replace("/login.html");
      return;
    }
    if (session.userRole !== "USER") {
      location.replace("/guardian-home.html");
      return;
    }
    authenticatedUserId = session.userId;
    const saved = state.read(sessionStorage, "selectedRoute");
    if (saved?.userId && saved.userId !== session.userId)
      state.clear(sessionStorage);
    $("userHomePage").classList.remove("hidden");
    renderJourney();
    favorites();
    try {
      const json = await api("/user/home-info");
      $("linkedGuardianText").textContent = json.linkedName
        ? `${json.linkedName}님과 연결되어 있어요`
        : "보호자와 연결해주세요";
    } catch {
      $("linkedGuardianText").textContent = "연결 상태를 확인하지 못했어요";
    }
  })();
})();
