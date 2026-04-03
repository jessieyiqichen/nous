import Anthropic from "@anthropic-ai/sdk";
import { NextRequest } from "next/server";

export const maxDuration = 60;

const REFINE_MODEL_PROMPT = `You are a cognitive scientist reviewing a cognitive model's prediction accuracy
and generating specific corrections.

You will receive:
1. The current cognitive model (9 dimensions)
2. The score report showing which predictions were accurate and which failed
3. The prediction-response pairs with detailed scoring

Your task: Identify WHERE the model was wrong and produce a CORRECTED model.

CRITICAL RULES:
- Focus on predictions that FAILED (score < 0.5) — these reveal model errors
- Classify each error as:
  - "认知架构错误" — the model got the cognitive structure fundamentally wrong
  - "过度理想化" — the model predicted the principled/ideal response but the person was more pragmatic
  - "情境缺失" — the model didn't account for contextual factors (pressure, fatigue, social cost)
  - "维度遗漏" — a relevant cognitive pattern wasn't captured in any dimension
- For each dimension that needs correction, provide:
  - What was wrong in the original description
  - What the prediction errors reveal about the person's ACTUAL behavior
  - The corrected description
- DO NOT change dimensions where predictions were accurate
- Preserve the original model structure (9 dimensions + summary)
- Output the FULL corrected model, not just the changes
- All corrections should be evidence-based (cite specific prediction IDs)

CURRENT MODEL AND SCORE REPORT:
`;

function formatContradictions(conflicts: unknown[]): string {
  if (!Array.isArray(conflicts) || conflicts.length === 0) return "";
  const lines = conflicts.map((c, i) => {
    const cc = c as Record<string, string>;
    return `${i + 1}. Stated: "${cc.stated_claim || ""}" → Actual: "${cc.actual_behavior || ""}" (${cc.blind_spot_evidence || ""})`;
  });
  return `\n\nKNOWN CONTRADICTIONS (objective behavioral evidence — weight these heavily in corrections):\n${lines.join("\n")}\n`;
}

const REFINE_SCHEMA = {
  type: "object" as const,
  properties: {
    corrections: {
      type: "array" as const,
      items: {
        type: "object" as const,
        properties: {
          dimension: { type: "string" as const },
          error_type: { type: "string" as const },
          evidence: { type: "string" as const },
          original: { type: "string" as const },
          corrected: { type: "string" as const },
        },
        required: ["dimension", "error_type", "evidence", "corrected"],
      },
    },
    corrected_model: {
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
    },
    refinement_summary: { type: "string" as const },
  },
  required: ["corrections", "corrected_model", "refinement_summary"],
};

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { model, scores, predictions, responses, conflicts } = body;

    if (!model || !scores) {
      return Response.json({ error: "Missing model or scores" }, { status: 400 });
    }

    const contradictionSection = formatContradictions(conflicts || []);

    // Build detailed context for the refinement
    const context = JSON.stringify({
      current_model: model,
      score_report: {
        tier_1_accuracy: scores.tier_1_accuracy,
        tier_2_accuracy: scores.tier_2_accuracy,
        tier_3_accuracy: scores.tier_3_accuracy,
        overall_accuracy: scores.overall_accuracy,
        pair_scores: scores.pair_scores,
        key_findings: scores.key_findings,
      },
      predictions_and_responses: predictions && responses ? { predictions, responses } : undefined,
    }, null, 2);

    const client = new Anthropic();
    const response = await client.messages.create({
      model: "claude-sonnet-4-5-20250929",
      max_tokens: 16384,
      messages: [{ role: "user", content: REFINE_MODEL_PROMPT + context + contradictionSection }],
      tools: [{
        name: "model_refinement",
        description: "Report model refinement results.",
        input_schema: REFINE_SCHEMA as Anthropic.Tool.InputSchema,
      }],
      tool_choice: { type: "tool" as const, name: "model_refinement" },
    });

    for (const block of response.content) {
      if (block.type === "tool_use") {
        return Response.json(block.input);
      }
    }

    return Response.json({ error: "No refinement returned" }, { status: 500 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("Refine API error:", message);
    return Response.json({ error: message }, { status: 500 });
  }
}
