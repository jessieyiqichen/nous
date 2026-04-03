import Anthropic from "@anthropic-ai/sdk";
import { NextRequest } from "next/server";

export const maxDuration = 120;

const GENERATE_PREDICTIONS_PROMPT = `You are a cognitive scientist validating a cognitive model of a specific person.

Your task: For each dimension in the model, generate 3-5 concrete behavioral predictions.

CRITICAL RULES:
- ALL output must be in Chinese (中文)
- Each prediction uses the pattern: "你在...时/面对...时，会..."
- Predictions must be SPECIFIC VERIFIABLE BEHAVIORS, not personality labels
  - BAD: "你是理性的人"
  - GOOD: "朋友来找你倾诉时，你会先分析问题而不是先表达共情"
- Predictions should have DISCRIMINATIVE POWER:
  - "This person would do X, but most people wouldn't"
  - OR "This person wouldn't do X, but most people would"
- Each prediction needs a reasoning field explaining WHY the model implies this behavior
- Each prediction needs a confidence score (0.0-1.0) based on how strongly the model supports it
- Generate an ID for each prediction: dimension abbreviation + number (e.g., "DA-1", "AA-2")

DIMENSION ABBREVIATIONS:
- Decision Architecture → DA
- Attention Allocation → AA
- Reasoning Style → RS
- Emotional Processing → EP
- Social Cognition → SC
- Blind Spots → BS
- Value Hierarchy → VH
- Response to Uncertainty → RU
- Execution-Layer Flexibility → EF

For each dimension, also echo back the original model description so the user can see what the model says about them.

COGNITIVE MODEL:
`;

const PREDICTION_SCHEMA = {
  type: "object" as const,
  properties: {
    dimensions: {
      type: "array" as const,
      items: {
        type: "object" as const,
        properties: {
          dimension: { type: "string" as const, description: "English dimension name" },
          dimension_zh: { type: "string" as const, description: "Chinese dimension name" },
          description: { type: "string" as const, description: "Original model description for this dimension (echoed back)" },
          predictions: {
            type: "array" as const,
            items: {
              type: "object" as const,
              properties: {
                id: { type: "string" as const, description: "e.g. DA-1, AA-2" },
                statement: { type: "string" as const, description: "Behavioral prediction in Chinese, using 你在...时/面对...时，会... pattern" },
                reasoning: { type: "string" as const, description: "Why the model implies this behavior, in Chinese" },
                confidence: { type: "number" as const, description: "0.0-1.0" },
              },
              required: ["id", "statement", "reasoning", "confidence"],
            },
          },
        },
        required: ["dimension", "dimension_zh", "description", "predictions"],
      },
    },
  },
  required: ["dimensions"],
};

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { model } = body;

    if (!model || !model.dimensions || !model.summary) {
      return Response.json(
        { error: "缺少认知模型数据" },
        { status: 400 },
      );
    }

    const client = new Anthropic();
    const modelText = JSON.stringify(model, null, 2);

    const response = await client.messages.create({
      model: "claude-sonnet-4-5-20250929",
      max_tokens: 16384,
      messages: [{ role: "user", content: GENERATE_PREDICTIONS_PROMPT + modelText }],
      tools: [{
        name: "behavior_predictions",
        description: "Report behavior predictions for each cognitive dimension.",
        input_schema: PREDICTION_SCHEMA as Anthropic.Tool.InputSchema,
      }],
      tool_choice: { type: "tool" as const, name: "behavior_predictions" },
    });

    for (const block of response.content) {
      if (block.type === "tool_use") {
        const result = block.input as Record<string, unknown>;
        return Response.json({ predictions: result.dimensions });
      }
    }

    throw new Error("No tool use response from model");
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return Response.json({ error: message }, { status: 500 });
  }
}
