/* Completed journeys: identity excludes changing time/fare and preserves travel direction. */
(function (root) {
  "use strict";
  const text = value => String(value ?? "").normalize("NFKC").toLowerCase().replace(/\s+/g, "");
  const point = p => {
    if (!p) return null;
    const lat = Array.isArray(p) ? p[1] : (p.latitude ?? p.lat);
    const lng = Array.isArray(p) ? p[0] : (p.longitude ?? p.lng);
    if (lat == null || lng == null || String(lat).trim() === "" || String(lng).trim() === "") return null;
    const a = Number(lat), b = Number(lng);
    return Number.isFinite(a) && Number.isFinite(b) && Math.abs(a) <= 90 && Math.abs(b) <= 180 ? [a,b] : null;
  };
  function distance(a,b) {
    a=point(a); b=point(b); if (!a || !b) return Infinity;
    const rad=x=>x*Math.PI/180, dlat=rad(b[0]-a[0]), dlng=rad(b[1]-a[1]);
    const h=Math.sin(dlat/2)**2+Math.cos(rad(a[0]))*Math.cos(rad(b[0]))*Math.sin(dlng/2)**2;
    return 12742000*Math.asin(Math.sqrt(Math.min(1,h)));
  }
  function identity(route) {
    const steps = route?.steps || [];
    const transit = [];
    for (const step of steps) {
      const type = String(step.type || "WALKING").toUpperCase();
      if (type === "WALKING" || type === "WALK") continue;
      if (type !== "BUS" && type !== "SUBWAY") return null;
      const vehicles = [...new Set((step.vehicles || []).map(v=>text(v.name)).filter(Boolean))].sort();
      const stops = (step.stops || []).map(s=>text(typeof s === "string" ? s : s?.name || s?.stationName || s?.stopName)).filter(Boolean);
      if (!vehicles.length || stops.length < 2) return null;
      transit.push([type,vehicles,stops[0],stops[stops.length-1]]);
    }
    if (transit.length) return JSON.stringify(["TRANSIT",transit]);
    // Walking needs actual geometry; a shared destination alone never establishes the same route.
    const vertices = steps.flatMap(s=>s.pathPoints || s.path?.points || s.geometry || []);
    const points = (vertices.length ? vertices : route?.geometry || []).map(point).filter(Boolean)
      .map(p=>p.map(n=>Number(n.toFixed(4))));
    const unique = points.filter((p,i)=>!i || p[0]!==points[i-1][0] || p[1]!==points[i-1][1]);
    if (unique.length < 2) return null;
    return JSON.stringify(["WALKING",unique]);
  }
  async function key(route) {
    const value = identity(route);
    if (!value || !root.crypto?.subtle) return "";
    const bytes = await root.crypto.subtle.digest("SHA-256",new TextEncoder().encode(value));
    return "v1:" + [...new Uint8Array(bytes)].map(b=>b.toString(16).padStart(2,"0")).join("");
  }
  function matches(record, signature, origin, destination) {
    const [saved,lat,lng] = String(record?.eventMessage || "").split("|");
    return !!signature && saved === signature
      && distance(origin,{latitude:record.lat,longitude:record.lng}) <= 100
      && distance(destination,{latitude:lat,longitude:lng}) <= 100;
  }
  function prioritize(candidates,routes,ranks) {
    const visited = routes.filter(r=>ranks.has(r)).sort((a,b)=>ranks.get(a)-ranks.get(b))[0];
    if (!visited) return candidates;
    return [{route:visited,label:"가봤던 길",selectionLabel:"PREVIOUSLY_COMPLETED",reason:"전에 이용해 도착한 경로예요"},
      ...candidates.filter(c=>c.route !== visited)];
  }
  root.RouteHistory = {key,matches,prioritize,identity};
  if (typeof module !== "undefined") module.exports = root.RouteHistory;
})(globalThis);
