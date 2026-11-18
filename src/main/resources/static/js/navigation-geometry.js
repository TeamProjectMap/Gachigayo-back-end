/* Pure GPS geometry in metres. Also exported for the regression checks. */
((root) => {
  "use strict";
  const valid = (p) =>
    p &&
    p.latitude != null &&
    p.longitude != null &&
    String(p.latitude).trim() !== "" &&
    String(p.longitude).trim() !== "" &&
    Number.isFinite(Number(p.latitude)) &&
    Number.isFinite(Number(p.longitude)) &&
    Math.abs(Number(p.latitude)) <= 90 &&
    Math.abs(Number(p.longitude)) <= 180;
  const radians = (n) => (n * Math.PI) / 180;
  const distance = (a, b) => {
    if (!valid(a) || !valid(b)) return Infinity;
    const lat = radians(Number(b.latitude) - Number(a.latitude)),
      lon = radians(Number(b.longitude) - Number(a.longitude));
    const h =
      Math.sin(lat / 2) ** 2 +
      Math.cos(radians(a.latitude)) *
        Math.cos(radians(b.latitude)) *
        Math.sin(lon / 2) ** 2;
    return (
      6371000 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(Math.max(0, 1 - h)))
    );
  };
  function match(position, source) {
    const points = source.filter(valid);
    if (points.length < 2 || !valid(position))
      return { distance: Infinity, progress: 0, remaining: Infinity };
    const scaleX = 111320 * Math.cos(radians(position.latitude)),
      scaleY = 111320;
    let total = 0,
      travelled = 0,
      best = { distance: Infinity, along: 0 };
    const lengths = points.slice(1).map((p, i) => distance(points[i], p));
    total = lengths.reduce((a, b) => a + b, 0);
    for (let i = 0; i < points.length - 1; i++) {
      const x = (points[i].longitude - position.longitude) * scaleX,
        y = (points[i].latitude - position.latitude) * scaleY;
      const dx = (points[i + 1].longitude - points[i].longitude) * scaleX,
        dy = (points[i + 1].latitude - points[i].latitude) * scaleY;
      const t = Math.max(
          0,
          Math.min(1, -(x * dx + y * dy) / (dx * dx + dy * dy || 1)),
        ),
        offset = Math.hypot(x + t * dx, y + t * dy);
      if (offset < best.distance)
        best = { distance: offset, along: travelled + t * lengths[i] };
      travelled += lengths[i];
    }
    return {
      distance: best.distance,
      progress: total ? best.along / total : 0,
      remaining: Math.max(0, total - best.along),
    };
  }
  function summarize(steps, index, progress = 0) {
    const fraction = Math.max(0, Math.min(1, Number(progress) || 0));
    let remainingTime = 0,
      remainingDistance = 0,
      totalDistance = 0;
    steps.forEach((step, i) => {
      const metres = Math.max(0, Number(step.distance) || 0),
        seconds = Math.max(0, Number(step.time) || 0);
      totalDistance += metres;
      if (i < index) return;
      const ratio = i === index ? 1 - fraction : 1;
      remainingTime += seconds * ratio;
      remainingDistance += metres * ratio;
    });
    return {
      remainingTime,
      remainingDistance,
      progress: totalDistance
        ? Math.max(0, Math.min(1, 1 - remainingDistance / totalDistance))
        : index >= steps.length
          ? 1
          : 0,
    };
  }
  const geometry = { valid, distance, match, summarize };
  root.NavigationGeometry = geometry;
  if (typeof module !== "undefined") module.exports = geometry;
})(globalThis);
