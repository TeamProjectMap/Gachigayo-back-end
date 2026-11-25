(function (root) {
  "use strict";
  function detector() {
    let since = null, samples = 0, lastSample = null, lastRequest = -Infinity;
    function reset() { since = null; samples = 0; lastSample = null; }
    return {
      reset,
      requested(now) { lastRequest = now; reset(); },
      applied() { lastRequest = -Infinity; reset(); },
      observe({ now, accuracy, distance, active }) {
        if (!active || !Number.isFinite(accuracy) || accuracy <= 0 || accuracy > 40
            || !Number.isFinite(distance) || distance <= 70) { reset(); return false; }
        if (lastSample !== null && (now < lastSample || now - lastSample > 15000)) reset();
        if (lastSample !== null && now - lastSample < 1000) return false;
        if (since === null) since = now;
        lastSample = now; samples++;
        return samples >= 3 && now - since >= 5000 && now - lastRequest >= 45000;
      },
    };
  }
  const walkingOnly = (selection, remainingSteps) => selection.mode === "WALKING"
    || !remainingSteps.some(s => /BUS|SUBWAY/.test(s?.type || ""));
  function choose(result, selection, remainingSteps) {
    const transit = s => /BUS|SUBWAY/.test(s?.type || "");
    const valid = r => r && r.available !== false && Array.isArray(r.steps) && r.steps.length > 0;
    const remainingTransit = remainingSteps.filter(transit);
    if (walkingOnly(selection, remainingSteps)) {
      return valid(result.walking) && result.walking.available ? { mode: "WALKING", route: result.walking } : null;
    }
    const signature = steps => steps.filter(transit).map(s => s.type + ":" + (s.vehicles || []).map(v => v.name || "").join(",")).join("|");
    const original = signature(remainingTransit);
    const candidates = result.publicTransit?.available ? (result.publicTransit.routes || []).filter(valid) : [];
    candidates.sort((a, b) => Number(signature(b.steps) === original) - Number(signature(a.steps) === original)
      || Number(a.transfers || 0) - Number(b.transfers || 0) || Number(a.totalTime || 0) - Number(b.totalTime || 0));
    return candidates.length ? { mode: "PUBLIC_TRANSIT", route: candidates[0] } : null;
  }
  const api = { detector, choose, walkingOnly };
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.NavigationReroute = api;
})(typeof window === "undefined" ? globalThis : window);
