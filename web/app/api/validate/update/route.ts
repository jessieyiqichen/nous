import Anthropic from "@anthropic-ai/sdk";
import { NextRequest } from "next/server";

export const maxDuration = 120;

const UPDATE_MODEL_PROMPT = `You are a cognitive scientist correcting a cognitive model based on the user's direct feedback.

The user has reviewed behavioral predictions derived from their cognitive model and judged each one as:
- CORRECT (✅): The prediction accurately describes their behavior
- WRONG (❌): The prediction does NOT match their behavior. The user may have provided a correction explaining the actual behavior.
- PARTIAL (⚠️): The prediction is partially correct. The user may have provided a correction.

YOUR TASK:
1. Analyze all judgments and corrections
2. For dimensions where predictions were mostly CORRECT: Keep the description unchanged
3. For dimensions where predictions were WRONG or PARTIAL: Revise the description to incorporate the user's corrections
4. ONLY modify dimensions that have clear evidence of inaccuracy (❌ or ⚠️ judgments with corrections)
5. Do NOT over-correct: if 3 out of 4 predictions were correct and 1 was wrong, make a targeted adjustment, not a complete rewrite
6. Preserve the model's overall structure and summary coherence

OUTPUT: The corrected cognitive model with the same structure as the input, plus a changes_summary in Chinese describing what was changed and why.

ORIGINAL MODEL:
`;

const CORRECTED_MODEL_SCHEMA = {
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
    changes_summary: { type: "string" as const, description: "Chinese summary of what was changed and why" },
  },
  required: ["dimensions", "summary", "changes_summary"],
};

interface Judgment {
  id: string;
  verdict: "correct" | "wrong" | "partial";
  correction?: string;
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { model, judgments, corrections } = body;

    if (!model || !judgments) {
      return Response.json(
        { error: "缺少模型或判断数据" },
        { status: 400 },
      );
    }

    // Format judgments for the prompt
    const judgmentLines = (judgments as Judgment[]).map((j) => {
      const verdict = j.verdict === "correct" ? "✅ 正确" : j.verdict === "wrong" ? "❌ 错误" : "⚠️ 部分正确";
      const correctionText = j.correction ? `\n   用户修正: "${j.correction}"` : "";
      return `- ${j.id}: ${verdict}${correctionText}`;
    }).join("\n");

    // Format corrections separately for emphasis
    const correctionsList = (corrections as Array<{ id: string; text: string }> || [])
      .filter((c) => c.text)
      .map((c) => `- ${c.id}: "${c.text}"`)
      .join("\n");

    const inputText = JSON.stringify(model, null, 2) +
      "\n\nUSER JUDGMENTS:\n" + judgmentLines +
      (correctionsList ? "\n\nUSER CORRECTIONS (important — these describe ACTUAL behavior):\n" + correctionsList : "");

    const client = new Anthropic();

    const response = await client.messages.create({
      model: "claude-sonnet-4-5-20250929",
      max_tokens: 16384,
      messages: [{ role: "user", content: UPDATE_MODEL_PROMPT + inputText }],
      tools: [{
        name: "corrected_model",
        description: "Report the corrected cognitive model.",
        input_schema: CORRECTED_MODEL_SCHEMA as Anthropic.Tool.InputSchema,
      }],
      tool_choice: { type: "tool" as const, name: "corrected_model" },
    });

    for (const block of response.content) {
      if (block.type === "tool_use") {
        const result = block.input as Record<string, unknown>;
        return Response.json({
          corrected_model: {
            dimensions: result.dimensions,
            summary: result.summary,
          },
          changes_summary: result.changes_summary,
        });
      }
    }

    throw new Error("No tool use response from model");
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return Response.json({ error: message }, { status: 500 });
  }
}
