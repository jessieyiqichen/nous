import type { Predictions, T1Question, T2Question, T3Question } from "./types";

/** Check if cached predictions use the old schema */
export function isStaleSchema(preds: Predictions): boolean {
  const hasOldT2 = preds.tier_2.length > 0 && !Array.isArray(preds.tier_2[0].options);
  const hasOldT3 = preds.tier_3.length > 0 && !preds.tier_3[0].predicted_blind_spot;
  return hasOldT2 || hasOldT3;
}

/** LLM structured output sometimes returns tiers as JSON strings instead of arrays */
export function normalizePredictions(raw: Record<string, unknown>): Predictions {
  const parse = (v: unknown): unknown[] => {
    if (Array.isArray(v)) return v;
    if (typeof v === "string") {
      try {
        const parsed = JSON.parse(v);
        if (Array.isArray(parsed)) return parsed;
      } catch {
        // Malformed JSON string from the LLM — return empty to avoid crash
        return [];
      }
    }
    return [];
  };
  return {
    tier_1: parse(raw.tier_1) as T1Question[],
    tier_2: parse(raw.tier_2) as T2Question[],
    tier_3: parse(raw.tier_3) as T3Question[],
  };
}

/** Validate predictions have questions in T1 and T2 (T3 is auto-scored, can be empty) */
export function validatePredictions(preds: Predictions): void {
  const empty: string[] = [];
  if (preds.tier_1.length === 0) empty.push("T1(偏好)");
  if (preds.tier_2.length === 0) empty.push("T2(推理)");
  if (empty.length > 0) {
    throw new Error(`预测生成不完整：${empty.join("、")} 为空，请重试。`);
  }
}
