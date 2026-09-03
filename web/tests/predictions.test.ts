import { describe, expect, it } from "vitest";
import {
  isStaleSchema,
  normalizePredictions,
  validatePredictions,
} from "@/app/components/predictor/predictions";
import type { Predictions, T2Question, T3Question } from "@/app/components/predictor/types";

const t2 = (over: Partial<T2Question> = {}): T2Question =>
  ({ id: "T2-1", scenario: "s", options: ["a", "b"], predicted_answer: "a", predicted_reasoning: "r", confidence: 0.8, ...over }) as T2Question;

const t3 = (over: Partial<T3Question> = {}): T3Question =>
  ({ id: "T3-1", predicted_blind_spot: "b", statement: "st", predicted_response: "agree", confidence: 0.7, reasoning_from_model: "r", ...over }) as T3Question;

describe("normalizePredictions", () => {
  it("passes arrays through unchanged", () => {
    const result = normalizePredictions({ tier_1: [{ id: "T1-1" }], tier_2: [], tier_3: [] });
    expect(result.tier_1).toHaveLength(1);
    expect(result.tier_2).toEqual([]);
  });

  it("parses tiers returned as JSON strings (Anthropic tool_choice quirk)", () => {
    const result = normalizePredictions({
      tier_1: JSON.stringify([{ id: "T1-1" }, { id: "T1-2" }]),
      tier_2: [],
      tier_3: [],
    });
    expect(result.tier_1).toHaveLength(2);
    expect(result.tier_1[0].id).toBe("T1-1");
  });

  it("returns empty array for malformed JSON strings instead of crashing", () => {
    const result = normalizePredictions({ tier_1: "{broken", tier_2: 42, tier_3: null });
    expect(result).toEqual({ tier_1: [], tier_2: [], tier_3: [] });
  });
});

describe("validatePredictions", () => {
  it("accepts predictions with T1+T2 filled and T3 empty", () => {
    const preds = { tier_1: [{ id: "a" }], tier_2: [t2()], tier_3: [] } as unknown as Predictions;
    expect(() => validatePredictions(preds)).not.toThrow();
  });

  it("throws a Chinese error naming the empty tiers", () => {
    const preds = { tier_1: [], tier_2: [], tier_3: [] } as unknown as Predictions;
    expect(() => validatePredictions(preds)).toThrow("T1(偏好)、T2(推理)");
  });
});

describe("isStaleSchema", () => {
  it("flags old T2 schema without options array", () => {
    const preds = {
      tier_1: [],
      tier_2: [t2({ options: undefined as unknown as string[] })],
      tier_3: [],
    } as unknown as Predictions;
    expect(isStaleSchema(preds)).toBe(true);
  });

  it("flags old T3 schema without predicted_blind_spot", () => {
    const preds = {
      tier_1: [],
      tier_2: [],
      tier_3: [t3({ predicted_blind_spot: undefined as unknown as string })],
    } as unknown as Predictions;
    expect(isStaleSchema(preds)).toBe(true);
  });

  it("accepts current schema", () => {
    const preds = { tier_1: [], tier_2: [t2()], tier_3: [t3()] } as unknown as Predictions;
    expect(isStaleSchema(preds)).toBe(false);
  });
});
