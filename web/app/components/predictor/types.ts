/* ── Types ── */

export interface SituationContext {
  time_pressure?: "none" | "low" | "high";
  social_pressure?: "none" | "low" | "high";
  caring_level?: "low" | "medium" | "high";
  energy_state?: "rested" | "normal" | "depleted";
}
export interface T1Question {
  id: string;
  scenario: string;
  context?: SituationContext;
  options: string[];
  predicted_answer: string;
  confidence: number;
  reasoning_from_model: string;
}
export interface T2Question {
  id: string;
  scenario: string;
  context?: SituationContext;
  options: string[];
  predicted_answer: string;
  predicted_reasoning?: string;
  predicted_conclusion?: string;
  predicted_objection?: string;
  confidence: number;
  reasoning_from_model: string;
}
export interface T3Question {
  id: string;
  predicted_blind_spot: string;
  statement: string;
  scenario?: string;
  context?: SituationContext;
  predicted_response: string;
  confidence: number;
  reasoning_from_model: string;
}

export interface ConflictData {
  stated_claim: string;
  actual_behavior: string;
  blind_spot_evidence: string;
}
export interface Predictions {
  tier_1: T1Question[];
  tier_2: T2Question[];
  tier_3: T3Question[];
}
export interface CognitiveModel {
  dimensions: { name: string; description: string; behavioral_predictions: string[]; confidence: string }[];
  summary: string;
}
export interface PairScore {
  id: string;
  tier: number;
  score: number;
  reasoning: string;
  surprise?: string;
}
export interface ScoreReport {
  pair_scores: PairScore[];
  tier_1_accuracy: number;
  tier_2_accuracy: number;
  tier_3_accuracy: number;
  overall_accuracy: number;
  accuracy_gradient: number;
  key_findings: string;
}

export interface Correction {
  dimension: string;
  error_type: string;
  evidence: string;
  original?: string;
  corrected: string;
}
export interface RefinementResult {
  corrections: Correction[];
  corrected_model: CognitiveModel;
  refinement_summary: string;
}

export interface RoundRecord {
  round: number;
  timestamp: string;
  tier_1_accuracy: number;
  tier_2_accuracy: number;
  tier_3_accuracy: number;
  overall_accuracy: number;
  error_types: Record<string, number>; // error_type → count
}

export type Step = "input" | "building" | "quiz" | "scoring" | "results";

export const TIER_LABELS: Record<number, string> = { 1: "偏好", 2: "推理", 3: "盲区" };
export const ERROR_TYPES = ["认知架构错误", "过度理想化", "情境缺失", "维度遗漏"] as const;
