import { NextRequest } from "next/server";
import { deepseekStructured } from "@/lib/deepseek";

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
- ANTI-MEMORIZATION: Predictions MUST use NEW scenarios that were NOT mentioned in the model text
  - NEVER directly quote or paraphrase examples/evidence from the model description
  - Extract the underlying COGNITIVE PATTERN, then apply it to a NOVEL situation
  - OK: Model says "在乎驱动" → predict behavior in a new scenario like "参加一个无聊的团队会议时"
  - BAD: Model says "不在乎的事情敷衍" → repeat "你在不在乎的事情上会敷衍"
  - The goal is to test whether the model truly UNDERSTANDS the person, not just echoes their words
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

    const modelText = JSON.stringify(model, null, 2);

    const result = await deepseekStructured({
      prompt: GENERATE_PREDICTIONS_PROMPT + modelText,
      schema: PREDICTION_SCHEMA,
      maxTokens: 8192,
    });

    return Response.json({ predictions: result.dimensions });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return Response.json({ error: message }, { status: 500 });
  }
}
