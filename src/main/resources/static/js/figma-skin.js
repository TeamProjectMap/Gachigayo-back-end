/* Presentation adapter: decorates existing controls; never calls app APIs or changes route data. */
(() => {
  const asset = (file, alt = "") => {
    const image = document.createElement("img");
    image.src = "/images/figma/" + file;
    image.alt = alt;
    image.className = "figma-asset";
    image.dataset.figmaAsset = file;
    return image;
  };
  const logo = (element) => {
    if (!element || element.querySelector(".figma-logo")) return;
    const crop = document.createElement("span"); crop.className = "figma-logo";
    crop.append(asset("83a34.png", "같이가요")); element.replaceChildren(crop);
  };
  document.body.classList.add("figma-theme");
  logo(document.querySelector(".home-header h1"));
  logo(document.querySelector(".guardian-header .brand"));
  logo(document.querySelector(".logo-area h1"));
  document.querySelectorAll(".bottom-nav").forEach(nav => {
    [...nav.children].forEach((button,index) => {
      const active = button.classList.contains("active");
      const files = [active ? "f1171.svg" : "ce633.svg", active ? "9dde6.svg" : "8b74f.svg", active ? "45fb8.svg" : "d78b3.svg"];
      const slot = document.createElement("i"); slot.className = "nav-icon-slot"; slot.setAttribute("aria-hidden","true");
      slot.append(asset(files[index]));
      const old = button.querySelector("svg");
      if (old) old.replaceWith(slot); else button.prepend(slot);
    });
  });
  document.querySelectorAll(".back-button").forEach(button => {
    button.replaceChildren(asset("2a1b6.svg"));
  });
  const searchBack = document.getElementById("searchBackButton");
  if (searchBack) {
    searchBack.replaceChildren(asset("2a1b6.svg"));
    const query = new URLSearchParams(location.search);
    if (query.get("select") === "origin") document.getElementById("routeSearchPage").classList.add("is-origin");
    if (query.get("view") === "favorites") {
      document.getElementById("routeSearchPage").classList.add("is-favorites");
      document.getElementById("searchTitle").textContent = "자주 가는 곳";
      const add = document.createElement("a"); add.className = "favorites-add-link"; add.href = "/route-search.html"; add.textContent = "+ 추가";
      document.querySelector(".map-header").insertAdjacentElement("afterend",add);
    }
  }
  // Keep current-location / sorting controls in the Figma search panel as optional tools.
  const searchTools = document.querySelector(".search-tools");
  if (searchTools) {
    const details = document.createElement("details"); details.className = "search-options";
    const summary = document.createElement("summary"); summary.textContent = "내 위치 · 검색 설정";
    searchTools.before(details); details.append(summary,searchTools);
  }
  const mapPanel = document.getElementById("searchMapPanel");
  const options = document.querySelector(".search-options");
  if (mapPanel && options) {
    mapPanel.querySelector("summary").textContent = "지도 · 검색 설정";
    mapPanel.querySelector("summary").after(options.querySelector(".search-tools"));
    options.remove();
  }
  const controls = document.querySelector(".settings-page #userSettingsSection");
  const linkTitle = document.getElementById("linkSectionTitle");
  if (controls && linkTitle) {
    const shareTitle = [...controls.querySelectorAll(".section-title")].find(h => h.textContent.includes("공유"));
    if (shareTitle) {
      const share = document.createElement("section"); share.className = "figma-share-settings";
      const card = shareTitle.nextElementSibling, note = card?.nextElementSibling;
      share.append(shareTitle); if (card) share.append(card); if (note?.classList.contains("device-setting-note")) share.append(note);
      linkTitle.nextElementSibling?.insertAdjacentElement("afterend",share);
      // Role visibility stays driven by the existing settings section.
      new MutationObserver(() => { share.hidden = controls.classList.contains("hidden"); }).observe(controls,{attributes:true,attributeFilter:["class"]});
      share.hidden = controls.classList.contains("hidden");
    }
  }
  const favoriteIcon = (name) => /집|아파트|우리집/.test(name) ? "61888.svg" : /학교|회사/.test(name) ? "e56c4.svg" : /복지/.test(name) ? "4091a.svg" : "113a4.svg";
  const decorateFavorites = () => {
    document.querySelectorAll("#homeFavorites .favorite-select strong").forEach(title => {
      if (title.querySelector(".favorite-title")) return;
      const name = title.textContent, text = document.createElement("span"); text.className = "favorite-title"; text.textContent = name;
      title.replaceChildren(asset(favoriteIcon(name)),text);
    });
    document.querySelectorAll("#homeFavorites .favorite-add").forEach(button => {
      if (button.querySelector("img")) return;
      button.setAttribute("aria-label","자주 가는 곳 추가"); button.replaceChildren(asset("cc4de.svg"));
    });
  };
  const favorites = document.getElementById("homeFavorites");
  if (favorites) { decorateFavorites(); new MutationObserver(decorateFavorites).observe(favorites,{childList:true,subtree:true}); }
  const destinationBox = document.getElementById("destinationBox");
  if (destinationBox) destinationBox.prepend(asset("003c1.svg"));
  // Visual role labels from existing controllers remain untouched.
})();
