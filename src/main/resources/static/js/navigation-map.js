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
  const locate = () =>
    new Promise((resolve, reject) => {
      if (!navigator.geolocation)
        return reject(
          new Error("이 브라우저에서는 현재 위치를 사용할 수 없습니다."),
        );
      navigator.geolocation.getCurrentPosition(
        (p) =>
          resolve({
            longitude: p.coords.longitude,
            latitude: p.coords.latitude,
            accuracy: p.coords.accuracy,
            capturedAt: Date.now(),
            placeName: "현재 위치",
          }),
        (e) =>
          reject(
            new Error(
              e.code === 1
                ? "위치 권한을 허용하거나 출발지를 직접 검색해주세요."
                : "현재 위치를 찾지 못했습니다. 다시 시도해주세요.",
            ),
          ),
        { enableHighAccuracy: true, timeout: 12000, maximumAge: 15000 },
      );
    });
  window.NavigationUI = { read, api, create, locate, coordinate, color };
})();
