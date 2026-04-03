import Anthropic from "@anthropic-ai/sdk";
import { NextRequest } from "next/server";

export const maxDuration = 120;

const BUILD_MODEL_PROMPT = `You are a cognitive scientist building a formal cognitive model of a person
based on conversation data or a psychological profile.

Your model should capture HOW this person thinks, not just WHAT they like.

IMPORTANT CALIBRATION: Models systematically over-idealize — they overweight cognitive architecture
and underweight execution-layer flexibility. For each dimension, actively look for GAPS between
stated/ideal behavior and revealed/actual behavior. People are messier, more pragmatic, and more
context-dependent than their self-descriptions suggest.

ANTI-BIAS RULES:
- MULTIPLE ATTRIBUTION: For each dimension, identify 2-3 contributing factors. Avoid
  "the core reason is..." or "fundamentally it's about..." — real people are driven by
  multiple, sometimes contradictory forces. A single elegant explanation is almost always wrong.
- HUMAN LANGUAGE: Describe cognition in human terms (intuition, habit, gut feeling, instinct,
  impulse, mood), NOT computational metaphors (information processing, pattern recognition system,
  parallel processing, cognitive module). The person is a human, not a CPU.
- PROPORTIONAL INTERPRETATION: Match interpretation depth to evidence strength. A casual remark
  deserves a casual interpretation. Don't build a grand theory from a throwaway comment.

Extract the following dimensions:

1. **Decision Architecture**: How do they make decisions? (intuition-first? analysis-first?
   Do they decide fast or slow? What triggers action vs continued deliberation?)

2. **Attention Allocation**: What captures their attention? What do they ignore?
   Is this conscious or automatic? How do they triage importance?

3. **Reasoning Style**: Linear vs lateral? Abstract vs concrete? Do they reason
   by analogy, by system, by narrative? What's their default mental model type?

4. **Emotional Processing**: How do emotions interact with cognition? Are emotions
   inputs to decisions, outputs, or parallel? What triggers emotional override?

5. **Social Cognition**: How do they model other people? What do they track
   (intentions, emotions, status, logic)? How do they adjust their own output
   for different audiences?

6. **Blind Spots**: Based on the evidence, what are they likely to systematically
   miss or underweight? (Not character flaws — cognitive tendencies that create
   consistent gaps in perception or judgment.)

7. **Value Hierarchy**: What do they actually optimize for (revealed preference,
   not stated preference)? How do they resolve conflicts between values?

8. **Response to Uncertainty**: How do they handle ambiguity? Do they seek more data,
   make a framework, go with gut, or avoid? What level of uncertainty is tolerable?

9. **Execution-Layer Flexibility**: How much does this person compromise under real-world pressure?
   - Facing a hard deadline, do they sacrifice quality or miss the deadline?
   - Under social pressure, do they hold their position or yield?
   - How do they handle sunk costs — cut losses or persist?
   - When tired or stressed, what default mode do they fall back to?
   - CRITICAL: Distinguish between their STATED principles and REVEALED behavior under pressure.
     Everyone thinks they'd hold firm; track what actually happens.

For each dimension, provide:
- A concise description (2-3 sentences)
- 1-2 specific behavioral predictions this implies
- Confidence level (high / medium / low) based on evidence quality

INPUT (profile or conversation):
`;

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

const MODEL_SCHEMA = {
  type: "object" as const,
  properties: {
    dimensions: {
      type: "array" as const,
      items: {
        type: "object" as const,
        properties: {
          name: { type: "string" as const },
          description: { type: "string" as const },
          behavioral_predictions: {
            type: "array" as const,
            items: { type: "string" as const },
          },
          confidence: { type: "string" as const, enum: ["high", "medium", "low"] },
        },
        required: ["name", "description", "behavioral_predictions", "confidence"],
      },
    },
    summary: { type: "string" as const },
  },
  required: ["dimensions", "summary"],
};

const CONTEXT_SCHEMA = {
  type: "object" as const,
  properties: {
    time_pressure: { type: "string" as const, enum: ["none", "low", "high"] },
    social_pressure: { type: "string" as const, enum: ["none", "low", "high"] },
    caring_level: { type: "string" as const, enum: ["low", "medium", "high"] },
    energy_state: { type: "string" as const, enum: ["rested", "normal", "depleted"] },
  },
  required: ["time_pressure", "social_pressure", "caring_level", "energy_state"],
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
  client: Anthropic,
  prompt: string,
  inputText: string,
  schema: Record<string, unknown>,
  toolName: string,
): Promise<Record<string, unknown>> {
  const response = await client.messages.create({
    model: "claude-sonnet-4-5-20250929",
    max_tokens: 16384,
    messages: [{ role: "user", content: prompt + inputText }],
    tools: [{ name: toolName, description: `Report ${toolName} results.`, input_schema: schema as Anthropic.Tool.InputSchema }],
    tool_choice: { type: "tool" as const, name: toolName },
  });

  for (const block of response.content) {
    if (block.type === "tool_use") {
      return block.input as Record<string, unknown>;
    }
  }
  throw new Error("No tool use response");
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { profile, model: existingModel, conflicts, signals } = body;

    // Format known evidence for prompt injection
    const contradictionSection = formatContradictions(conflicts || []);
    const signalSection = formatSignals(signals || []);

    const client = new Anthropic();
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
      model = await callApi(client, BUILD_MODEL_PROMPT, buildInput, MODEL_SCHEMA, "cognitive_model");
    }

    const modelText = JSON.stringify(model, null, 2) + contradictionSection;

    // Defensive: Anthropic tool_choice sometimes returns arrays as JSON strings
    const safeArray = (v: unknown): unknown[] => {
      if (Array.isArray(v)) return v;
      if (typeof v === "string") {
        try { const p = JSON.parse(v); if (Array.isArray(p)) return p; } catch { /* fall through */ }
      }
      return [];
    };

    // Generate a single tier with retry on empty questions
    async function generateTier(tier: number): Promise<unknown[]> {
      const tierNames: Record<number, string> = { 1: "tier_1_predictions", 2: "tier_2_predictions", 3: "tier_3_predictions" };
      for (let attempt = 0; attempt < 2; attempt++) {
        const raw = await callApi(client, TIER_PROMPTS[tier], modelText, TIER_SCHEMAS[tier], tierNames[tier]);
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
