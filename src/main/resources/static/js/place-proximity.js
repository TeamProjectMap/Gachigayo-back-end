((root) => {
  const valid = (p) =>
    p &&
    p.longitude != null &&
    p.latitude != null &&
    String(p.longitude).trim() !== "" &&
    String(p.latitude).trim() !== "" &&
    Number.isFinite(Number(p.longitude)) &&
    Number.isFinite(Number(p.latitude)) &&
    Math.abs(Number(p.longitude)) <= 180 &&
    Math.abs(Number(p.latitude)) <= 90;
  const distance = (a, b) => {
    if (!valid(a) || !valid(b)) return Infinity;
    const rad = (n) => (n * Math.PI) / 180,
      dlat = rad(b.latitude - a.latitude),
      dlon = rad(b.longitude - a.longitude),
      h =
        Math.sin(dlat / 2) ** 2 +
        Math.cos(rad(a.latitude)) *
          Math.cos(rad(b.latitude)) *
          Math.sin(dlon / 2) ** 2;
    return 12742000 * Math.atan2(Math.sqrt(h), Math.sqrt(Math.max(0, 1 - h)));
  };
  const normalize = (value) =>
    String(value || "")
      .normalize("NFKC")
      .toLocaleLowerCase()
      .replace(/\s+/g, "");
  function relevance(place, keyword) {
    const query = normalize(keyword),
      name = normalize(place.placeName);
    if (!query) return 0;
    if (name === query) return 0;
    // Station line annotations are still the station itself, not a nearby shop.
    const base = name
      .replace(/\([^)]*\)/g, "")
      .replace(
        /(?:\d+호선|ktx|srt|경강선|경의중앙선|수인분당선|공항철도)$/,
        "",
      );
    if (base === query) return 0;
    if (name.startsWith(query)) return 2;
    if (name.includes(query)) return 3;
    const tokens = String(keyword)
      .trim()
      .split(/\s+/)
      .map(normalize)
      .filter(Boolean);
    if (tokens.length > 1 && tokens.every((token) => name.includes(token)))
      return 4;
    if (normalize(place.roadAddressName || place.addressName).includes(query))
      return 5;
    return 6;
  }
  const rank = (places, origin, keyword = "") => {
    return places
      .map((place, index) => ({
        ...place,
        distanceMeters: valid(origin) ? distance(origin, place) : null,
        relevance: relevance(place, keyword),
        sourceOrder: index,
      }))
      .sort(
        (a, b) =>
          a.relevance - b.relevance ||
          (valid(origin) ? a.distanceMeters - b.distanceMeters : 0) ||
          a.sourceOrder - b.sourceOrder,
      );
  };
  const format = (meters) =>
    Number.isFinite(meters)
      ? meters < 1000
        ? `${Math.round(meters)}m`
        : `${(meters / 1000).toFixed(1)}km`
      : "";
  root.PlaceProximity = { valid, distance, rank, format, relevance };
  if (typeof module !== "undefined") module.exports = root.PlaceProximity;
})(globalThis);
