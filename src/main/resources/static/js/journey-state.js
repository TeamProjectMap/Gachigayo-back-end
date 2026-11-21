/* Shared navigation identity and account-scoped device preferences. */
((root) => {
  const key = (selection) =>
    String(selection?.selectedAt || "") +
    "|" +
    String(
      selection?.destination?.id || selection?.destination?.placeName || "",
    );
  const mode = (step) =>
    String(step?.type || "").includes("SUBWAY")
      ? "SUBWAY"
      : String(step?.type || "").includes("BUS")
        ? "BUS"
        : "WALKING";
  const read = (storage, name) => {
    try {
      return JSON.parse(storage.getItem(name) || "null");
    } catch {
      return null;
    }
  };
  const progress = (selection, saved) => {
    const length = selection?.route?.steps?.length || 0;
    if (saved?.routeKey !== key(selection))
      return { stepIndex: 0, completed: false, boarded: [] };
    const stepIndex = Number.isInteger(saved.stepIndex)
      ? Math.max(0, Math.min(length, saved.stepIndex))
      : 0;
    return {
      stepIndex,
      completed: length > 0 && stepIndex >= length,
      boarded: Array.isArray(saved.boarded)
        ? saved.boarded.filter(Number.isInteger)
        : [],
    };
  };
  const preferenceKey = (userId) => `gachigayo:device:${userId}`;
  const canResume = (selection, saved, userId, now = Date.now()) => {
    if (!userId || !selection?.navigationReady || !selection.route?.steps?.length ||
        (selection.userId != null && selection.userId !== userId) ||
        saved?.userId !== userId || saved.routeKey !== key(selection) ||
        !Number.isInteger(saved.stepIndex) || saved.stepIndex < 0 ||
        saved.completed === true || progress(selection, saved).completed) return false;
    return Number.isFinite(saved.startedAt) && saved.startedAt > 0 && saved.startedAt <= now &&
      Number.isFinite(saved.updatedAt) && saved.updatedAt >= saved.startedAt && saved.updatedAt <= now &&
      now - saved.updatedAt < 6 * 60 * 60 * 1000;
  };
  const defaults = { shareLocation: true };
  const preferences = (userId, storage) => ({
    ...defaults,
    ...Object.fromEntries(
      Object.entries(read(storage, preferenceKey(userId)) || {}).filter(
        ([name, value]) => name in defaults && typeof value === "boolean",
      ),
    ),
  });
  const savePreference = (userId, name, value, storage) => {
    if (!userId || !(name in defaults) || typeof value !== "boolean")
      throw new Error("설정을 저장할 수 없습니다.");
    const next = { ...preferences(userId, storage), [name]: value };
    storage.setItem(preferenceKey(userId), JSON.stringify(next));
    return next;
  };
  const clear = (storage) =>
    [
      "selectedRoute",
      "navigationProgress",
      "currentTripId",
      "tripRouteKey",
      "routeSearchResult",
      "selectedDestination",
      "currentOrigin",
      "currentHelpRequestState",
      "helpRequestEntryFromNavigation",
      "navigationSearchQuery",
      "homeResumeDismissed",
    ].forEach((name) => storage.removeItem(name));
  const api = { key, mode, read, progress, canResume, preferences, savePreference, clear };
  if (typeof module !== "undefined") module.exports = api;
  else root.JourneyState = api;
})(typeof window === "undefined" ? globalThis : window);
