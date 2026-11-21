(function (root) {
  "use strict";
  function forStep(step, state = {}) {
    if (state.complete) return { kind: "arrival", label: "도착" };
    const type = String(step?.type || "WALKING");
    if (/BUS|SUBWAY/.test(type)) {
      return { kind: state.boarded ? "alight" : "board", label: state.boarded ? "내리기" : "타기" };
    }
    // Match the instruction currently displayed. Do not guess turns from map orientation.
    const text = String(step?.easyGuidance || step?.guidance || "");
    const actions = [
      ["uturn", "돌아가기", /유턴|뒤로\s*돌|돌아서\s*(?:가|이동)/],
      ["slight-left", "왼쪽 대각선", /(?:왼쪽|좌측)\s*(?:대각선|비스듬)|좌회전\s*방향으로\s*비스듬/],
      ["slight-right", "오른쪽 대각선", /(?:오른쪽|우측)\s*(?:대각선|비스듬)|우회전\s*방향으로\s*비스듬/],
      ["left", "좌회전", /좌회전|(?:왼쪽|좌측)(?:으로|으로는)?\s*(?:돌|도세|도십|꺾|회전|가세|가요|이동)/],
      ["right", "우회전", /우회전|(?:오른쪽|우측)(?:으로|으로는)?\s*(?:돌|도세|도십|꺾|회전|가세|가요|이동)/],
      ["straight", "직진", /직진|앞으로\s*(?:쭉|가|걸|이동)|곧장|똑바로/],
      ["crosswalk", "횡단보도", /횡단보도[^.!?]*(?:건너|건너세)|길을\s*건너/],
      ["stairs-up", "계단 올라가기", /계단[^.!?]*(?:올라|오르)/],
      ["stairs-down", "계단 내려가기", /계단[^.!?]*(?:내려|내리)/],
    ];
    const matches = actions.map(([kind, label, pattern], priority) => {
      const match = pattern.exec(text);
      return match && { kind, label, offset: match.index, priority };
    }).filter(Boolean).sort((a, b) => a.offset - b.offset || a.priority - b.priority);
    // Ambiguous or negated instructions keep the neutral walking symbol.
    if (/하지\s*마|하지\s*않|말고/.test(text)) return { kind: "walking", label: "도보" };
    return matches.length ? { kind: matches[0].kind, label: matches[0].label } : { kind: "walking", label: "도보" };
  }
  const api = { forStep };
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.NavigationCue = api;
})(typeof window !== "undefined" ? window : globalThis);
