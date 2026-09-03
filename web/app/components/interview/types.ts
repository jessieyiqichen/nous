// ── Types ─────────────────────────────────────────────────────

export interface Message {
  role: "user" | "assistant";
  content: string;
}

export interface DimensionCoverage {
  name: string;
  confidence: "high" | "medium" | "low" | "none";
  evidence_summary?: string;
}

export interface Signal {
  signal_type: string;
  track: "stated" | "behavioral";
  cognitive_dimension: string;
  evidence: string;
  interpretation?: string;
}

export interface Conflict {
  stated_claim: string;
  actual_behavior: string;
  blind_spot_evidence: string;
}

export interface CognitiveModel {
  dimensions: Array<{
    name: string;
    description: string;
    behavioral_predictions: string[];
    confidence: string;
  }>;
  summary: string;
}

export type Phase = "chat" | "building" | "result";

// ── Dimension display names ───────────────────────────────────

export const DIM_NAMES_ZH: Record<string, string> = {
  "Decision Architecture": "决策架构",
  "Attention Allocation": "注意力分配",
  "Reasoning Style": "推理风格",
  "Emotional Processing": "情感处理",
  "Social Cognition": "社会认知",
  "Blind Spots": "盲区",
  "Value Hierarchy": "价值层级",
  "Response to Uncertainty": "面对不确定性",
  "Execution-Layer Flexibility": "执行层弹性",
};
