((root) => {
  const geometry =
    typeof module !== "undefined"
      ? require("./navigation-geometry.js")
      : root.NavigationGeometry;

  // 사진 지점에 이만큼 가까워지면 띄운다 (길 정보가 없는 구간)
  const NEAR_PHOTO_METERS = 40;
  // 이보다 빠르면 버스·지하철을 타고 지나가는 중으로 보고 띄우지 않는다 (약 25km/h)
  const VEHICLE_SPEED = 7;

  /**
   * 지금 위치에서 띄울 보호자 사진 (없으면 null)
   *
   * - 도보 단계: 지금 걷는 길 위에 있고, 그 길 근처에 찍힌 사진만 띄운다.
   * - 버스·지하철 단계이거나 길 정보가 없을 때:
   *   카카오 대중교통 경로에는 출발지 → 정류장, 정류장 → 도착지 도보가 빠져 있어서
   *   그 사이를 걷는 동안에도 단계는 '버스'로 잡혀 있다. 보호자가 사진을 찍는 곳이 바로 거기라
   *   이때는 사진 지점까지의 거리만 본다. 차를 타고 빠르게 지나가는 중이면 띄우지 않는다.
   */
  function nearby(photos, step, fix, dismissed = []) {
    if (
      !geometry.valid(fix) ||
      !Number.isFinite(Number(fix.accuracy)) ||
      Number(fix.accuracy) > 50 ||
      Number(fix.speed) > VEHICLE_SPEED
    )
      return null;

    const candidates = (photos || []).filter(
      (photo) => geometry.valid(photo) && !dismissed.includes(photo.id),
    );
    const points = (step?.pathPoints || []).filter(geometry.valid);
    const walkingPath = !/BUS|SUBWAY/.test(step?.type || "") && points.length >= 2;

    if (walkingPath) {
      if (geometry.match(fix, points).distance > 70) return null;
      return closest(
        candidates.filter((photo) => geometry.match(photo, points).distance <= 40),
        fix,
        60,
      );
    }

    return closest(candidates, fix, NEAR_PHOTO_METERS);
  }

  function closest(photos, fix, limit) {
    return (
      photos
        .map((photo) => ({ ...photo, distance: geometry.distance(fix, photo) }))
        .filter((photo) => photo.distance <= limit)
        .sort((a, b) => a.distance - b.distance)[0] || null
    );
  }

  if (typeof module !== "undefined") module.exports = { nearby };
  else root.NavigationLandmarks = { nearby };
})(typeof window === "undefined" ? globalThis : window);
