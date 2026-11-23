(() => {
  "use strict";
  let sdkPromise;
  const read = (key) => {
    try {
      return JSON.parse(sessionStorage.getItem(key) || "null");
    } catch {
      return null;
    }
  };
  const api = async (path, options = {}) => {
    const response = await fetch(path, {
      credentials: "same-origin",
      ...options,
      signal: options.signal || AbortSignal.timeout(20000),
    });
    if (response.status === 401 || response.status === 403) {
      const error = new Error("로그인이 만료되었습니다. 다시 로그인해주세요.");
      error.code = "AUTH_REQUIRED";
      throw error;
    }
    if (!response.ok)
      throw new Error("요청을 처리하지 못했습니다. 다시 시도해주세요.");
    const data = await response.json();
    if (!data.success) {
      const error = new Error(data.message || "요청을 처리하지 못했습니다.");
      if (
        data.status === "AUTH_ERROR" ||
        /로그인이 필요|로그인.*만료/.test(data.message || "")
      )
        error.code = "AUTH_REQUIRED";
      throw error;
    }
    return data;
  };
  const sdk = () =>
    (sdkPromise ||= (async () => {
      if (window.kakao?.maps)
        return new Promise((resolve) => kakao.maps.load(resolve));
      const config = await api("/map/config");
      if (!config.available)
        throw new Error(
          "지도를 불러올 수 없습니다. 잠시 후 다시 시도해주세요.",
        );
      await new Promise((resolve, reject) => {
        const script = document.createElement("script");
        const timer = setTimeout(() => {
          script.remove();
          reject(new Error("지도 연결이 지연되고 있습니다. 새로고침해주세요."));
        }, 15000);
        script.src = `https://dapi.kakao.com/v2/maps/sdk.js?appkey=${encodeURIComponent(config.javascriptKey)}&autoload=false`;
        script.onload = () => {
          clearTimeout(timer);
          resolve();
        };
        script.onerror = () => {
          clearTimeout(timer);
          reject(new Error("지도를 연결하지 못했습니다."));
        };
        document.head.append(script);
      });
      await new Promise((resolve) => kakao.maps.load(resolve));
    })());
  const coordinate = (p) =>
    p &&
    p.longitude != null &&
    p.latitude != null &&
    String(p.longitude).trim() !== "" &&
    String(p.latitude).trim() !== "" &&
    Number.isFinite(Number(p.longitude)) &&
    Number.isFinite(Number(p.latitude)) &&
    Math.abs(Number(p.longitude)) <= 180 &&
    Math.abs(Number(p.latitude)) <= 90;
  const latLng = (p) =>
    new kakao.maps.LatLng(Number(p.latitude), Number(p.longitude));
  const color = (mode) =>
    String(mode).includes("SUBWAY")
      ? "#8555d9"
      : String(mode).includes("BUS")
        ? "#2878ef"
        : "#169c61";
  async function create(element, center) {
    try {
      await sdk();
    } catch (error) {
      element.textContent = error.message;
      element.classList.add("map-error");
      throw error;
    }
    element.replaceChildren();
    const map = new kakao.maps.Map(element, {
      center: latLng(
        coordinate(center) ? center : { longitude: 126.978, latitude: 37.5665 },
      ),
      level: 5,
    });
    let overlays = [];
    const resize = new ResizeObserver(() => {
      const position = map.getCenter();
      map.relayout();
      map.setCenter(position);
    });
    resize.observe(element);
    const clear = () => {
      overlays.forEach((overlay) => overlay.setMap(null));
      overlays = [];
    };
    const fit = (points) => {
      const valid = points.filter(coordinate);
      if (!valid.length) return;
      if (valid.length === 1) {
        map.setCenter(latLng(valid[0]));
        map.setLevel(3);
        return;
      }
      const bounds = new kakao.maps.LatLngBounds();
      valid.forEach((p) => bounds.extend(latLng(p)));
      map.setBounds(bounds, 50, 40, 50, 40);
    };
    const pin = (point, text, action) => {
      if (!coordinate(point)) return;
      const button = document.createElement("button");
      button.type = "button";
      button.className = "map-number-pin";
      button.textContent = text;
      button.setAttribute("aria-label", `${point.placeName || "위치"} ${text}`);
      if (action) button.addEventListener("click", action);
      overlays.push(
        new kakao.maps.CustomOverlay({
          map,
          position: latLng(point),
          content: button,
          yAnchor: 1.1,
        }),
      );
    };
    const route = (steps = []) => {
      clear();
      const all = [];
      steps.forEach((step) => {
        const points = (step.pathPoints || []).filter(coordinate);
        all.push(...points);
        if (points.length < 2) return;
        overlays.push(
          new kakao.maps.Polyline({
            map,
            path: points.map(latLng),
            strokeWeight: 6,
            strokeColor: color(step.type),
            strokeOpacity: 0.9,
            strokeStyle: "solid",
          }),
        );
      });
      if (all.length) {
        pin(all[0], "출발");
        pin(all.at(-1), "도착");
        fit(all);
      }
    };
    window.addEventListener(
      "pagehide",
      () => {
        resize.disconnect();
        clear();
      },
      { once: true },
    );
    return {
      map,
      clear,
      fit,
      pin,
      route,
      center: (point) => {
        if (coordinate(point)) map.panTo(latLng(point));
      },
    };
  }
  /**
   * 현재 위치. 처음 잡히는 위치는 와이파이·기지국 기준이라 수백 m 틀릴 때가 많아서
   * 몇 초 동안 위치를 받아 가장 정확한 값을 쓴다. 50m 안으로 잡히면 바로 끝낸다.
   * 빨리 끝내려고 방금(20초 안) 잡은 정확한 위치는 다시 찾지 않고 그대로 쓰고,
   * 이미 찾는 중이면 새로 찾지 않고 그 결과를 같이 기다린다.
   */
  const GOOD_ACCURACY = 50;
  const ROUGH_ACCURACY = 100;
  const RECENT_FIX_MS = 20000;
  let locating = null;
  const recentFix = () => {
    const fix = read("recentFix");
    return fix &&
      coordinate(fix) &&
      Date.now() - Number(fix.at) < RECENT_FIX_MS &&
      Number(fix.accuracy) <= GOOD_ACCURACY
      ? fix
      : null;
  };
  const locate = (options = {}) => {
    const recent = recentFix();
    if (recent)
      return Promise.resolve({
        longitude: recent.longitude,
        latitude: recent.latitude,
        accuracy: recent.accuracy,
        capturedAt: Date.now(),
        placeName: "현재 위치",
      });
    return (locating ||= findPosition(options).finally(() => {
      locating = null;
    }));
  };
  const findPosition = (options) =>
    new Promise((resolve, reject) => {
      if (!navigator.geolocation)
        return reject(
          new Error("이 브라우저에서는 현재 위치를 사용할 수 없습니다."),
        );
      const maxWait = options.maxWait ?? 4000;
      const giveUp = options.timeout ?? 15000;
      let best = null;
      let lastError = null;
      let watchId = null;
      let waitTimer = null;
      let giveUpTimer = null;
      const finish = () => {
        if (watchId != null) navigator.geolocation.clearWatch(watchId);
        clearTimeout(waitTimer);
        clearTimeout(giveUpTimer);
        if (best) {
          try {
            sessionStorage.setItem("recentFix", JSON.stringify({ ...best, at: Date.now() }));
          } catch {}
          resolve({ ...best, capturedAt: Date.now(), placeName: "현재 위치" });
          return;
        }
        reject(
          new Error(
            lastError && lastError.code === 1
              ? "위치 권한을 허용하거나 출발지를 직접 검색해주세요."
              : "현재 위치를 찾지 못했습니다. 다시 시도해주세요.",
          ),
        );
      };
      watchId = navigator.geolocation.watchPosition(
        (p) => {
          const fix = {
            longitude: p.coords.longitude,
            latitude: p.coords.latitude,
            accuracy: p.coords.accuracy,
          };
          if (!best || !(Number(best.accuracy) <= Number(fix.accuracy))) best = fix;
          if (Number(fix.accuracy) <= GOOD_ACCURACY) return finish();
          // 첫 위치가 잡힌 뒤로는 maxWait 만큼만 더 기다린다
          if (!waitTimer) waitTimer = setTimeout(finish, maxWait);
        },
        (e) => {
          lastError = e;
          if (e.code === 1) finish();
        },
        { enableHighAccuracy: true, timeout: giveUp, maximumAge: 0 },
      );
      giveUpTimer = setTimeout(finish, giveUp);
    });
  /** 오차가 커서 믿기 어려운 현재 위치인지 */
  const isRough = (point) =>
    !!point &&
    !point.manual &&
    Number.isFinite(Number(point.accuracy)) &&
    Number(point.accuracy) > ROUGH_ACCURACY;
  const roughText = (point) =>
    isRough(point) ? `오차 약 ${Math.round(Number(point.accuracy) / 10) * 10}m` : "";

  const meters = (a, b) => {
    const r = Math.PI / 180;
    const dLat = (b.latitude - a.latitude) * r;
    const dLng = (b.longitude - a.longitude) * r;
    const s =
      Math.sin(dLat / 2) ** 2 +
      Math.cos(a.latitude * r) * Math.cos(b.latitude * r) * Math.sin(dLng / 2) ** 2;
    return 2 * 6371000 * Math.asin(Math.sqrt(s));
  };
  /** 지하철역이면 '○○역' 이름을, 아니면 null */
  const stationBase = (name, category) => {
    const text = String(name || "").trim();
    if (!text || /출구/.test(text)) return null;
    const isStation = /지하철|전철/.test(String(category || "")) || (!category && /역$/.test(text));
    const match = text.match(/^(.+?역)(?:\s|$)/);
    return isStation && match ? match[1] : null;
  };
  /**
   * 역 좌표는 역 한가운데 한 점이라 출구가 아닌 곳으로 안내된다.
   * 역을 도착지로 고르면 출발지에서 가장 가까운 출구로 바꾼다. 못 찾으면 그대로 둔다.
   */
  async function nearestStationExit(destination, origin) {
    if (!coordinate(destination) || !coordinate(origin)) return destination;
    const station = destination.stationPoint || destination;
    const base = stationBase(destination.stationName || destination.placeName, destination.categoryName);
    if (!base || !coordinate(station)) return destination;
    try {
      const query = new URLSearchParams({
        query: `${base} 출구`,
        page: 1,
        longitude: station.longitude,
        latitude: station.latitude,
        sort: "accuracy",
      });
      const result = await api(`/map/search?${query}`, { signal: AbortSignal.timeout(6000) });
      const from = { latitude: Number(origin.latitude), longitude: Number(origin.longitude) };
      const center = { latitude: Number(station.latitude), longitude: Number(station.longitude) };
      const exits = (result.places || [])
        .filter(coordinate)
        .map((p) => ({ ...p, latitude: Number(p.latitude), longitude: Number(p.longitude) }))
        .filter(
          (p) =>
            String(p.placeName || "").startsWith(base) &&
            /\d+\s*번\s*출구/.test(p.placeName) &&
            meters(p, center) < 600,
        )
        .sort((a, b) => meters(a, from) - meters(b, from));
      if (!exits.length) return destination;
      const exit = exits[0];
      return {
        ...destination,
        placeName: exit.placeName,
        latitude: String(exit.latitude),
        longitude: String(exit.longitude),
        stationName: destination.stationName || destination.placeName,
        stationPoint: { latitude: center.latitude, longitude: center.longitude },
      };
    } catch {
      return destination;
    }
  }
  /** 역·공원처럼 넓은 곳은 좌표 한 점에서 멀리 떨어져 도착할 수 있어 도착 판정 거리를 넓힌다 */
  const arrivalRadius = (destination) => {
    const name = String(destination?.placeName || "");
    const category = String(destination?.categoryName || "");
    if (/출구/.test(name)) return 25;
    if (/지하철|전철|기차|공원|대학교|병원|시장|아파트|운동장|경기장|터미널|공항|백화점|대형마트|테마파크|관광|궁/.test(category)) return 60;
    if (/(역|공원|대학교|병원|시장|터미널)$/.test(name)) return 60;
    return 25;
  };
  window.NavigationUI = {
    read,
    api,
    create,
    locate,
    coordinate,
    color,
    isRough,
    roughText,
    meters,
    nearestStationExit,
    arrivalRadius,
  };
})();
