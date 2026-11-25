/* Phone compass only: relative gyro angles and GPS travel headings are not north. */
((root) => {
  "use strict";
  const number = value => typeof value === "number" && Number.isFinite(value);
  const normalize = angle => ((angle % 360) + 360) % 360;
  function heading(event, screenAngle = 0) {
    const angle = number(screenAngle) ? screenAngle : 0;
    if (number(event.webkitCompassHeading)) {
      if (event.webkitCompassHeading < 0 || event.webkitCompassHeading > 360) return null;
      if (event.webkitCompassAccuracy != null && (!number(event.webkitCompassAccuracy)
          || event.webkitCompassAccuracy < 0 || event.webkitCompassAccuracy > 25)) return null;
      return normalize(event.webkitCompassHeading + angle);
    }
    // A relative alpha starts at an arbitrary direction, so it cannot be used as a compass.
    if (event.absolute !== true || !number(event.alpha) || !number(event.beta) || !number(event.gamma)) return null;
    if (event.alpha < 0 || event.alpha > 360 || Math.abs(event.beta) > 180 || Math.abs(event.gamma) > 90) return null;
    const rad = Math.PI / 180, a = event.alpha * rad, b = event.beta * rad, g = event.gamma * rad, s = angle * rad;
    // Project the screen's top edge onto the Earth's horizontal plane, Rz(alpha) Rx(beta) Ry(gamma).
    const x = (Math.cos(a) * Math.cos(g) - Math.sin(a) * Math.sin(b) * Math.sin(g)) * Math.sin(s)
      - Math.sin(a) * Math.cos(b) * Math.cos(s);
    const y = (Math.sin(a) * Math.cos(g) + Math.cos(a) * Math.sin(b) * Math.sin(g)) * Math.sin(s)
      + Math.cos(a) * Math.cos(b) * Math.cos(s);
    // An almost vertical top edge has no reliable horizontal direction.
    return Math.hypot(x, y) < 0.15 ? null : normalize(Math.atan2(x, y) / rad);
  }
  function create(onChange, onStatus, win = root) {
    let running = false, listening = false, granted = false, requesting = false, denied = false, timer = null, lastEvent = null;
    const doc = win.document, orientation = win.screen?.orientation;
    const needsPermission = () => typeof win.DeviceOrientationEvent?.requestPermission === "function";
    const screenAngle = () => number(orientation?.angle) ? orientation.angle : (number(win.orientation) ? win.orientation : 0);
    function clearTimer() { if (timer !== null) win.clearTimeout(timer); timer = null; }
    function clear(status) { clearTimer(); lastEvent = null; onChange(null); onStatus(status); }
    function receive(event) {
      if (!running || doc.hidden) return;
      const value = heading(event, screenAngle());
      // Browsers may emit relative and absolute streams together: do not erase a valid absolute reading with a relative event.
      if (value === null && event.absolute !== true && !number(event.webkitCompassHeading)) return;
      clearTimer(); lastEvent = value === null ? null : event;
      onChange(value); onStatus(value === null ? "unreliable" : "active");
      timer = win.setTimeout(() => clear("unavailable"), 15000);
    }
    function screenChanged() { if (lastEvent) receive(lastEvent); }
    function detach() {
      win.removeEventListener("deviceorientationabsolute", receive);
      win.removeEventListener("deviceorientation", receive);
      win.removeEventListener("orientationchange", screenChanged);
      orientation?.removeEventListener?.("change", screenChanged);
      listening = false;
    }
    function attach() {
      if (!running || doc.hidden || listening) return;
      listening = true; clear("waiting");
      win.addEventListener("deviceorientationabsolute", receive);
      win.addEventListener("deviceorientation", receive);
      win.addEventListener("orientationchange", screenChanged);
      orientation?.addEventListener?.("change", screenChanged);
      timer = win.setTimeout(() => clear("unavailable"), 8000);
    }
    function visibility() {
      if (doc.hidden) { detach(); clear("paused"); }
      else if (granted || !needsPermission()) attach();
    }
    function start() {
      if (running) return;
      running = true;
      if (!win.isSecureContext || !win.DeviceOrientationEvent) { clear("unsupported"); return; }
      doc.addEventListener("visibilitychange", visibility);
      if (denied) clear("denied");
      else if (needsPermission() && !granted) clear("permission");
      else attach();
    }
    async function enable() {
      if (!running || requesting || !win.isSecureContext || !win.DeviceOrientationEvent) return;
      if (!needsPermission() || granted) { detach(); attach(); return; }
      requesting = true; onStatus("requesting");
      try {
        // Called directly in the button gesture; never prompt on page load.
        granted = await win.DeviceOrientationEvent.requestPermission(true) === "granted";
        denied = !granted;
        if (!running) return;
        if (granted) attach(); else clear("denied");
      } catch {
        denied = true;
        if (running) clear("denied");
      } finally { requesting = false; }
    }
    function stop() {
      running = false; detach(); clear("paused");
      doc.removeEventListener("visibilitychange", visibility);
    }
    return { start, enable, stop };
  }
  const api = { heading, normalize, create };
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.NavigationCompass = api;
})(typeof window === "undefined" ? globalThis : window);
