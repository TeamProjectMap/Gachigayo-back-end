((root) => {
  const geometry =
    typeof module !== "undefined"
      ? require("./navigation-geometry.js")
      : root.NavigationGeometry;
  function nearby(photos, step, fix, dismissed = []) {
    if (
      !geometry.valid(fix) ||
      !Number.isFinite(Number(fix.accuracy)) ||
      Number(fix.accuracy) > 50 ||
      /BUS|SUBWAY/.test(step?.type || "")
    )
      return null;
    const points = (step?.pathPoints || []).filter(geometry.valid);
    if (points.length < 2 || geometry.match(fix, points).distance > 70)
      return null;
    return (
      (photos || [])
        .filter(
          (photo) =>
            geometry.valid(photo) &&
            !dismissed.includes(photo.id) &&
            geometry.match(photo, points).distance <= 40,
        )
        .map((photo) => ({ ...photo, distance: geometry.distance(fix, photo) }))
        .filter((photo) => photo.distance <= 60)
        .sort((a, b) => a.distance - b.distance)[0] || null
    );
  }
  if (typeof module !== "undefined") module.exports = { nearby };
  else root.NavigationLandmarks = { nearby };
})(typeof window === "undefined" ? globalThis : window);
