import type { DimensionCoverage, Message } from "./types";

/** Override Blind Spots confidence based on contradiction evidence.
 *  Blind spots can't reach high confidence through conversation alone.
 *  Use conflict count as proxy: >=2 -> medium, >=4 -> high. */
export function applyBlindSpotsOverride(
  dims: DimensionCoverage[],
  conflictCount: number
): DimensionCoverage[] {
  if (conflictCount < 2) return dims;
  return dims.map((d) => {
    if (d.name !== "Blind Spots") return d;
    if (conflictCount >= 4) return { ...d, confidence: "high" as const };
    if (d.confidence === "low" || d.confidence === "none")
      return { ...d, confidence: "medium" as const };
    return d;
  });
}

// Format transcript for API
export const formatTranscript = (msgs: Message[]) =>
  msgs
    .map(
      (m) =>
        `${m.role === "user" ? "User" : "Interviewer"}: ${m.content}`
    )
    .join("\n\n");

export const formatRecentTranscript = (msgs: Message[], n = 6) =>
  formatTranscript(msgs.slice(-n));

// Build coverage hint for AI
export function buildCoverageHint(
  dims: DimensionCoverage[],
  focus: string[],
  refine: boolean
): string {
  if (refine && focus.length > 0) {
    const focusCoverage = dims.filter((d) => focus.includes(d.name));
    const notHigh = focusCoverage.filter((d) => d.confidence !== "high");
    if (notHigh.length === 0) return "";
    return (
      `[INTERNAL — not visible to user] ` +
      `Focus dimensions not yet at HIGH: ${notHigh.map((d) => d.name).join(", ")}. ` +
      `Dig deeper into these with concrete scenarios.`
    );
  }
  const weak = dims.filter(
    (d) => d.confidence === "low" || d.confidence === "none"
  );
  if (weak.length === 0) return "";
  return (
    `[INTERNAL — not visible to user] ` +
    `Dimensions still weak: ${weak.map((d) => d.name).join(", ")}. ` +
    `Naturally steer toward these.`
  );
}

// Check auto-end condition
export function shouldAutoEnd(
  dims: DimensionCoverage[],
  turnNum: number,
  focus: string[],
  refine: boolean
): boolean {
  // Hard turn limit for refine mode (prevent runaway sessions)
  if (refine && turnNum >= 30) return true;

  if (refine && focus.length > 0) {
    // Refine: focus dims must be "high", min 8 turns
    if (turnNum < 8) return false;
    const focusCoverage = dims.filter((d) => focus.includes(d.name));
    return (
      focusCoverage.length === focus.length &&
      focusCoverage.every((d) => d.confidence === "high")
    );
  }
  // New: all dims medium+, min 10 turns
  if (dims.length < 9 || turnNum < 10) return false;
  return dims.every(
    (d) => d.confidence === "high" || d.confidence === "medium"
  );
}
