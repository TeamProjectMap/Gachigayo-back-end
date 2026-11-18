/* Shared arrival matching, freshness and polling for route selection and guidance. */
((root) => {
  "use strict";
  const station = (value) =>
    String(value || "")
      .replace(/\([^)]*\)/g, "")
      .replace(/\s/g, "")
      .replace(/역$/, "");
  const line = (value) =>
    String(value || "").replace(/수도권|서울지하철|\s/g, "");
  const number = (value) =>
    value != null &&
    String(value).trim() !== "" &&
    Number.isFinite(Number(value))
      ? Number(value)
      : null;
  function target(step) {
    const mode = String(step?.type || "")
      .toUpperCase()
      .includes("SUBWAY")
      ? "SUBWAY"
      : String(step?.type || "")
            .toUpperCase()
            .includes("BUS")
        ? "BUS"
        : null;
    if (!mode) return null;
    const stops = (step.stops || [])
        .map((s) => String(s || "").trim())
        .filter(Boolean),
      vehicle = step.vehicles?.[0]?.name;
    if (!stops[0] || !vehicle) return null;
    return {
      mode,
      stop: stops[0],
      next: stops[1] || "",
      end: stops.at(-1) || "",
      vehicle:
        mode === "BUS"
          ? String(vehicle)
              .replace(/^[^:]+:/, "")
              .trim()
          : line(vehicle),
      guidance: step.guidance || "",
    };
  }
  const key = (t) => JSON.stringify([t.mode, t.stop, t.vehicle, t.next, t.end]);
  function sourceTime(value) {
    if (!value) return null;
    const s = String(value).trim();
    const stamp = Date.parse(
      /^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}:\d{2}$/.test(s)
        ? s.replace(" ", "T") + "+09:00"
        : s,
    );
    return Number.isFinite(stamp) ? stamp : null;
  }
  function matches(arrival, t) {
    const next = station(t.next),
      end = station(t.end),
      description = String(arrival.trainLineName || "").replace(/\s/g, ""),
      terminal = station(arrival.destinationStationName);
    // Match named travel direction, never guess from arrival time alone.
    return !!(
      (next && description.includes(next)) ||
      (end && (description.includes(end) || terminal === end))
    );
  }
  function rows(data, t, fetchedAt, now = Date.now()) {
    if (
      !data?.success ||
      !data.available ||
      data.status !== "OK" ||
      now - fetchedAt > 60000
    )
      return [];
    const arrivals =
      t.mode === "BUS"
        ? [data.firstArrival, data.secondArrival].filter(Boolean)
        : (data.arrivals || []).filter((a) => matches(a, t));
    return arrivals
      .map((a) => {
        const generated = t.mode === "SUBWAY" ? sourceTime(a.receivedAt) : null;
        if (
          generated != null &&
          (now - generated > 120000 || generated - now > 30000)
        )
          return null;
        const seconds = number(t.mode === "BUS" ? a.seconds : a.arrivalSeconds),
          age = Math.max(0, (now - (generated ?? fetchedAt)) / 1000);
        return {
          seconds:
            seconds == null ? null : Math.max(0, Math.floor(seconds - age)),
          message: t.mode === "BUS" ? a.message : a.arrivalMessage,
          direction: a.trainLineName || a.direction || "",
          tags: [
            a.lowFloor ? "저상" : null,
            a.full ? "만차" : null,
            a.trainStatus === "급행" ? "급행" : null,
          ].filter(Boolean),
        };
      })
      .filter(Boolean)
      .sort((a, b) => (a.seconds ?? Infinity) - (b.seconds ?? Infinity))
      .slice(0, 2);
  }
  const arrivalText = (row) =>
    row.seconds == null
      ? row.message || "도착정보 확인 중"
      : row.seconds < 30
        ? "곧 도착"
        : `${Math.floor(row.seconds / 60)}분 ${row.seconds % 60}초 후`;
  const core = {
    station,
    line,
    target,
    key,
    sourceTime,
    matches,
    rows,
    arrivalText,
  };
  root.TransitRealtime = core;
  if (typeof module !== "undefined") module.exports = core;
  if (typeof document === "undefined") return;
  const views = new Set(),
    cache = new Map(),
    requests = new Map();
  let timer;
  async function load(t, force = false) {
    const id = key(t),
      cached = cache.get(id);
    if (
      requests.has(id) ||
      (!force && cached && Date.now() - cached.fetchedAt < 30000)
    )
      return;
    const controller = new AbortController();
    requests.set(id, controller);
    try {
      const params = new URLSearchParams(
        t.mode === "BUS"
          ? {
              stopName: t.stop,
              routeName: t.vehicle,
              nextStopName: t.next,
              directionHint: t.guidance,
            }
          : { stationName: t.stop, lineName: t.vehicle },
      );
      const response = await fetch(
        `/${t.mode === "BUS" ? "bus" : "subway"}/realtime?${params}`,
        {
          credentials: "same-origin",
          signal: AbortSignal.any([
            controller.signal,
            AbortSignal.timeout(12000),
          ]),
        },
      );
      if (!response.ok) throw new Error("HTTP");
      cache.set(id, { data: await response.json(), fetchedAt: Date.now() });
    } catch (error) {
      if (error.name !== "AbortError")
        cache.set(id, { data: null, fetchedAt: Date.now() });
    } finally {
      if (requests.get(id) === controller) requests.delete(id);
      renderAll();
    }
  }
  function render(view) {
    const entry = cache.get(key(view.target)),
      arrivals = entry ? rows(entry.data, view.target, entry.fetchedAt) : [];
    view.body.replaceChildren();
    if (!arrivals.length) {
      view.body.textContent = !entry
        ? "도착정보 확인 중…"
        : view.target.mode === "SUBWAY" && entry.data?.available
          ? "해당 방향의 도착정보를 확인할 수 없어요"
          : "실시간 정보 미제공 또는 연결 지연";
    }
    arrivals.forEach((arrival, index) => {
      const item = document.createElement("div");
      item.className = "live-arrival";
      const value = document.createElement("strong");
      value.textContent = (index ? "다음 · " : "") + arrivalText(arrival);
      item.append(value);
      if (arrival.direction) {
        const direction = document.createElement("small");
        direction.textContent = arrival.direction;
        item.append(direction);
      }
      if (arrival.tags.length) {
        const tags = document.createElement("small");
        tags.textContent = arrival.tags.join(" · ");
        item.append(tags);
      }
      view.body.append(item);
    });
    view.stamp.textContent =
      entry?.data?.available && Date.now() - entry.fetchedAt <= 60000
        ? `${new Date(entry.fetchedAt).toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit", second: "2-digit" })} 조회 · 30초마다 갱신`
        : "실시간 정보는 제공 지역·운행 상황에 따라 달라집니다";
  }
  function renderAll() {
    for (const view of views) if (view.host.isConnected) render(view);
  }
  function tick() {
    if (document.hidden) return;
    for (const view of views) {
      if (!view.host.isConnected) {
        views.delete(view);
        continue;
      }
      load(view.target);
    }
    renderAll();
  }
  function mount(host, steps) {
    const own = [];
    host.replaceChildren();
    for (const step of steps) {
      const t = target(step);
      if (!t) continue;
      const section = document.createElement("section");
      section.className = "live-transit";
      section.setAttribute("aria-label", `${t.vehicle} 도착정보`);
      const heading = document.createElement("strong");
      heading.className = "live-transit-title";
      heading.textContent = `${t.mode === "BUS" ? "버스" : "지하철"} ${t.vehicle} · ${t.stop}`;
      const direction = document.createElement("small");
      direction.textContent = t.next ? `${t.next} 방면` : "이동 방향 확인 필요";
      const body = document.createElement("div");
      body.className = "live-transit-body";
      const stamp = document.createElement("small");
      stamp.className = "live-transit-stamp";
      section.append(heading, direction, body, stamp);
      host.append(section);
      const view = { host, target: t, body, stamp };
      views.add(view);
      own.push(view);
      render(view);
    }
    host.hidden = !own.length;
    tick();
    if (!timer) timer = setInterval(tick, 1000);
    return () => {
      own.forEach((view) => views.delete(view));
    };
  }
  function refresh() {
    for (const view of views) {
      const entry = cache.get(key(view.target));
      if (!entry || Date.now() - entry.fetchedAt >= 5000)
        load(view.target, true);
    }
  }
  function pause() {
    clearInterval(timer);
    timer = null;
    requests.forEach((c) => c.abort());
    requests.clear();
  }
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) pause();
    else {
      tick();
      if (!timer) timer = setInterval(tick, 1000);
    }
  });
  window.addEventListener("pagehide", pause);
  window.addEventListener("pageshow", () => {
    tick();
    if (!timer) timer = setInterval(tick, 1000);
  });
  Object.assign(core, { mount, refresh });
})(globalThis);
