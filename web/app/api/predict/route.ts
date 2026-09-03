import { NextRequest } from "next/server";
import { BUILD_MODEL_PROMPT, MODEL_SCHEMA, CONTEXT_SCHEMA } from "@/lib/generated/shared-prompts";
import { deepseekStructured } from "@/lib/deepseek";

export const maxDuration = 120;

// BUILD_MODEL_PROMPT / MODEL_SCHEMA / CONTEXT_SCHEMA 与 Python 端共享，
// 单一来源在 core/prompts/ 与 core/schemas/，经 prebuild 生成。

// Formats known contradictions as a prompt section
function formatContradictions(conflicts: unknown[]): string {
  if (!Array.isArray(conflicts) || conflicts.length === 0) return "";
  const lines = conflicts.map((c, i) => {
    const cc = c as Record<string, string>;
    return `${i + 1}. Stated: "${cc.stated_claim || ""}" → Actual behavior: "${cc.actual_behavior || ""}" (${cc.blind_spot_evidence || ""})`;
  });
  return `\n\nKNOWN CONTRADICTIONS (from observed behavioral data — use these to ground your analysis):\n${lines.join("\n")}\n`;
}

// Formats known signals as a prompt section
function formatSignals(signals: unknown[]): string {
  if (!Array.isArray(signals) || signals.length === 0) return "";
  // Take up to 20 highest-confidence signals to stay within token budget
  const sorted = [...signals]
    .map((s) => s as Record<string, unknown>)
    .filter((s) => typeof s.confidence === "number" && (s.confidence as number) >= 0.8)
    .slice(0, 20);
  if (sorted.length === 0) return "";
  const lines = sorted.map((s, i) =>
    `${i + 1}. [${s.signal_type}/${s.track}] ${s.cognitive_dimension}: "${(s.evidence as string || "").slice(0, 150)}" (conf: ${s.confidence})`
  );
  return `\n\nKNOWN BEHAVIORAL SIGNALS (from real conversation analysis):\n${lines.join("\n")}\n`;
}

// ── Shared rules injected into every per-tier prompt ───────────
const SHARED_RULES = `
CRITICAL RULES:
- ALL scenarios and ALL text must be in Chinese (中文)
- **KEEP SCENARIOS SHORT** — each scenario MUST be 1-3 sentences (50 characters max).
- Scenarios must be NOVEL — not things from the profile/conversation
- Scenarios should be concrete and specific, not abstract
- Each prediction must include explicit reasoning from the cognitive model
- Consider real-world constraints (time pressure, social cost, fatigue)

CONTEXT TAGGING (required for every question):
Annotate each prediction's situational context:
- **time_pressure**: "none" | "low" | "high"
- **social_pressure**: "none" | "low" | "high"
- **caring_level**: "low" | "medium" | "high"
- **energy_state**: "rested" | "normal" | "depleted"
Vary contexts across questions.
`;

// ── Per-tier prompts ──────────────────────────────────────────
const TIER_PROMPTS: Record<number, string> = {
  1: `You are designing behavioral preference predictions to validate a cognitive model.
Generate exactly 7 preference prediction questions in Chinese (中文).

Format: Multiple choice (4 options, one predicted answer). Keep each option SHORT and specific (under 20 characters preferred). At least 2 questions must create tension between "principled" and "pragmatic" answers.
Keep each option SHORT (under 15 characters preferred, max 25).
Tests: Basic preferences, reactions, choices.
At least 2 questions must create tension between "principled" and "pragmatic" answers.
${SHARED_RULES}
COGNITIVE MODEL:
`,
  2: `You are designing behavioral reasoning predictions to validate a cognitive model.
Generate exactly 7 reasoning prediction questions in Chinese (中文).

Format: Short scenario (1-2 sentences, max 50 chars) + 4 options representing different reasoning approaches.
Each option = a distinct reasoning framework or decision path.
Tests: HOW the person would think through a novel problem.
At least 2 scenarios must include genuine constraints (boss pressure, limited time, team dynamics).
Questions must be impossible to answer correctly just by knowing preferences — they require modeling cognitive PROCESS.
${SHARED_RULES}
COGNITIVE MODEL:
`,
  3: `You are designing blind spot predictions to validate a cognitive model.
Generate exactly 7 blind spot predictions in Chinese (中文).

For each prediction provide:
- **predicted_blind_spot**: Concise description of the specific blind spot (1-2 sentences)
- **statement**: A diagnostic statement that would reveal this blind spot
- **predicted_response**: How they'd respond on a 5-point scale (strongly_disagree/disagree/neutral/agree/strongly_agree)
- **confidence** and **reasoning_from_model**

NOTE: These will be auto-evaluated against observed behavioral contradictions (stated vs actual behavior), NOT self-reported. Make predictions specific and falsifiable against behavioral evidence.
Blind spot predictions should come from EXECUTION-LAYER compromises, not just cognitive architecture gaps.
${SHARED_RULES}
COGNITIVE MODEL:
`,
};

// ── Per-tier output schemas (each returns { questions: [...] }) ──────
const TIER_SCHEMAS: Record<number, Record<string, unknown>> = {
  1: {
    type: "object" as const,
    properties: {
      questions: {
        type: "array" as const,
        items: {
          type: "object" as const,
          properties: {
            id: { type: "string" as const },
            scenario: { type: "string" as const },
            context: CONTEXT_SCHEMA,
            options: { type: "array" as const, items: { type: "string" as const } },
            predicted_answer: { type: "string" as const },
            confidence: { type: "number" as const },
            reasoning_from_model: { type: "string" as const },
          },
          required: ["id", "scenario", "context", "options", "predicted_answer", "confidence", "reasoning_from_model"],
        },
      },
    },
    required: ["questions"],
  },
  2: {
    type: "object" as const,
    properties: {
      questions: {
        type: "array" as const,
        items: {
          type: "object" as const,
          properties: {
            id: { type: "string" as const },
            scenario: { type: "string" as const },
            context: CONTEXT_SCHEMA,
            options: { type: "array" as const, items: { type: "string" as const } },
            predicted_answer: { type: "string" as const },
            predicted_reasoning: { type: "string" as const },
            confidence: { type: "number" as const },
            reasoning_from_model: { type: "string" as const },
          },
          required: ["id", "scenario", "context", "options", "predicted_answer", "predicted_reasoning", "confidence", "reasoning_from_model"],
        },
      },
    },
    required: ["questions"],
  },
  3: {
    type: "object" as const,
    properties: {
      questions: {
        type: "array" as const,
        items: {
          type: "object" as const,
          properties: {
            id: { type: "string" as const },
            predicted_blind_spot: { type: "string" as const, description: "Concise description of the specific blind spot" },
            statement: { type: "string" as const, description: "Diagnostic statement that reveals this blind spot" },
            context: CONTEXT_SCHEMA,
            predicted_response: { type: "string" as const, enum: ["strongly_disagree", "disagree", "neutral", "agree", "strongly_agree"] },
            confidence: { type: "number" as const },
            reasoning_from_model: { type: "string" as const },
          },
          required: ["id", "predicted_blind_spot", "statement", "context", "predicted_response", "confidence", "reasoning_from_model"],
        },
      },
    },
    required: ["questions"],
  },
};

async function callApi(
  prompt: string,
  inputText: string,
  schema: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  return deepseekStructured({
    prompt: prompt + inputText,
    schema,
    maxTokens: 8192,
  });
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { profile, model: existingModel, conflicts, signals } = body;

    // Format known evidence for prompt injection
    const contradictionSection = formatContradictions(conflicts || []);
    const signalSection = formatSignals(signals || []);

    let model: Record<string, unknown>;

    if (existingModel) {
      model = existingModel;
    } else {
      if (!profile || typeof profile !== "string" || profile.trim().length < 50) {
        return Response.json(
          { error: "请提供至少 50 字的对话或认知画像文本。" },
          { status: 400 },
        );
      }
      // Inject known evidence into model building
      const buildInput = profile + contradictionSection + signalSection;
      model = await callApi(BUILD_MODEL_PROMPT, buildInput, MODEL_SCHEMA);
    }

    const modelText = JSON.stringify(model, null, 2) + contradictionSection;

    // Defensive: LLM structured output sometimes returns arrays as JSON strings
    const safeArray = (v: unknown): unknown[] => {
      if (Array.isArray(v)) return v;
      if (typeof v === "string") {
        try { const p = JSON.parse(v); if (Array.isArray(p)) return p; } catch { /* fall through */ }
      }
      return [];
    };

    // Generate a single tier with retry on empty questions
    async function generateTier(tier: number): Promise<unknown[]> {
      for (let attempt = 0; attempt < 2; attempt++) {
        const raw = await callApi(TIER_PROMPTS[tier], modelText, TIER_SCHEMAS[tier]);
        const questions = safeArray(raw.questions);
        if (questions.length > 0) return questions;
        console.error(`[predict] Tier ${tier} returned 0 questions (attempt ${attempt + 1}), raw:`, JSON.stringify(raw).slice(0, 500));
      }
      return []; // still empty after retry
    }

    // Generate all 3 tiers in parallel (~3x faster than sequential)
    const [tier1, tier2, tier3] = await Promise.all([
      generateTier(1),
      generateTier(2),
      generateTier(3),
    ]);

    // Validate: at least T1 and T2 must have questions (T3 is auto-scored)
    const emptyTiers = [
      ...(tier1.length === 0 ? ["T1(偏好)"] : []),
      ...(tier2.length === 0 ? ["T2(推理)"] : []),
      ...(tier3.length === 0 ? ["T3(盲区)"] : []),
    ];
    if (tier1.length === 0 || tier2.length === 0) {
      return Response.json(
        { error: `预测生成失败：${emptyTiers.join("、")} 返回为空，请重试。` },
        { status: 500 },
      );
    }

    const predictions = { tier_1: tier1, tier_2: tier2, tier_3: tier3 };

    return Response.json({ model, predictions });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return Response.json({ error: message }, { status: 500 });
  }
}
