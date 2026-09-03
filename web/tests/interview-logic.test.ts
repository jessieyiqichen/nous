import { describe, expect, it } from "vitest";
import {
  applyBlindSpotsOverride,
  buildCoverageHint,
  formatTranscript,
  shouldAutoEnd,
} from "@/app/components/interview/logic";
import type { DimensionCoverage } from "@/app/components/interview/types";

const dim = (name: string, confidence: DimensionCoverage["confidence"]): DimensionCoverage =>
  ({ name, confidence }) as DimensionCoverage;

const nineDims = (confidence: DimensionCoverage["confidence"]): DimensionCoverage[] =>
  [
    "Decision Architecture", "Attention Allocation", "Reasoning Style",
    "Emotional Processing", "Social Cognition", "Blind Spots",
    "Value Hierarchy", "Response to Uncertainty", "Execution-Layer Flexibility",
  ].map((n) => dim(n, confidence));

describe("applyBlindSpotsOverride", () => {
  it("returns dims unchanged below 2 conflicts", () => {
    const dims = [dim("Blind Spots", "low")];
    expect(applyBlindSpotsOverride(dims, 1)).toBe(dims);
  });

  it("raises low Blind Spots to medium at 2 conflicts, immutably", () => {
    const dims = [dim("Blind Spots", "low")];
    const result = applyBlindSpotsOverride(dims, 2);
    expect(result[0].confidence).toBe("medium");
    expect(dims[0].confidence).toBe("low");
  });

  it("raises to high at 4 conflicts and leaves other dims alone", () => {
    const dims = [dim("Blind Spots", "none"), dim("Reasoning Style", "low")];
    const result = applyBlindSpotsOverride(dims, 4);
    expect(result[0].confidence).toBe("high");
    expect(result[1].confidence).toBe("low");
  });
});

describe("shouldAutoEnd", () => {
  it("new interview: needs 9 dims at medium+ and 10+ turns", () => {
    expect(shouldAutoEnd(nineDims("medium"), 10, [], false)).toBe(true);
    expect(shouldAutoEnd(nineDims("medium"), 9, [], false)).toBe(false);
    const withLow = [...nineDims("medium").slice(0, 8), dim("Blind Spots", "low")];
    expect(shouldAutoEnd(withLow, 15, [], false)).toBe(false);
  });

  it("refine mode: focus dims must all be high after 8 turns", () => {
    const dims = [dim("Blind Spots", "high"), dim("Reasoning Style", "low")];
    expect(shouldAutoEnd(dims, 8, ["Blind Spots"], true)).toBe(true);
    expect(shouldAutoEnd(dims, 7, ["Blind Spots"], true)).toBe(false);
    expect(shouldAutoEnd(dims, 8, ["Reasoning Style"], true)).toBe(false);
  });

  it("refine mode: hard stop at 30 turns regardless of coverage", () => {
    expect(shouldAutoEnd([], 30, ["Blind Spots"], true)).toBe(true);
  });
});

describe("buildCoverageHint", () => {
  it("names weak dimensions in new-interview mode", () => {
    const hint = buildCoverageHint([dim("Blind Spots", "low"), dim("Reasoning Style", "high")], [], false);
    expect(hint).toContain("Blind Spots");
    expect(hint).not.toContain("Reasoning Style");
  });

  it("returns empty string when focus dims are all high", () => {
    expect(buildCoverageHint([dim("Blind Spots", "high")], ["Blind Spots"], true)).toBe("");
  });
});

describe("formatTranscript", () => {
  it("labels roles and joins with blank lines", () => {
    const text = formatTranscript([
      { role: "user", content: "你好" },
      { role: "assistant", content: "想聊什么？" },
    ]);
    expect(text).toBe("User: 你好\n\nInterviewer: 想聊什么？");
  });
});
