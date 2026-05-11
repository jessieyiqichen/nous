import Anthropic from "@anthropic-ai/sdk";
import { NextRequest } from "next/server";
import { readFile } from "fs/promises";
import { join } from "path";

export const maxDuration = 60;

const PREDICT_PROMPT = `You are a cognitive scientist who has built a detailed cognitive model of a specific person.
Given a scenario, predict how this person would ACTUALLY behave — not how they'd ideally behave.

RULES:
- Base predictions on the cognitive model's dimensions, especially Execution-Layer Flexibility and Blind Spots
- Distinguish between what they'd SAY they'd do vs what they'd ACTUALLY do
- Consider real-world constraints: time pressure, social cost, energy level, caring level
- Be specific and concrete — not vague platitudes
- All output in Chinese (中文)
- Keep predictions grounded and realistic — avoid over-idealizing

COGNITIVE MODEL:
`;

const RESULT_SCHEMA = {
  type: "object" as const,
  properties: {
    predicted_behavior: {
      type: "string" as const,
      description: "What this person would actually do in this scenario (2-3 sentences, Chinese)",
    },
    stated_vs_actual: {
      type: "string" as const,
      description: "If there's a gap between what they'd SAY and what they'd DO, describe it. Otherwise null.",
    },
    confidence: {
      type: "string" as const,
      enum: ["high", "medium", "low"],
      description: "How confident the prediction is based on model coverage",
    },
    reasoning_chain: {
      type: "array" as const,
      items: {
        type: "object" as const,
        properties: {
          dimension: { type: "string" as const, description: "Which cognitive dimension drives this part of the prediction" },
          contribution: { type: "string" as const, description: "How this dimension influences behavior in this scenario (1 sentence, Chinese)" },
          weight: { type: "string" as const, enum: ["primary", "secondary", "minor"] },
        },
        required: ["dimension", "contribution", "weight"],
      },
      description: "Which cognitive dimensions influence this prediction and how",
    },
    contextual_factors: {
      type: "object" as const,
      properties: {
        caring_level: { type: "string" as const, enum: ["low", "medium", "high"] },
        time_pressure: { type: "string" as const, enum: ["none", "low", "high"] },
        social_pressure: { type: "string" as const, enum: ["none", "low", "high"] },
      },
      required: ["caring_level", "time_pressure", "social_pressure"],
    },
  },
  required: ["predicted_behavior", "confidence", "reasoning_chain", "contextual_factors"],
};

async function loadCognitiveModel(): Promise<Record<string, unknown>> {
  const modelPath = join(process.cwd(), "..", "data", "cognitive_model_v2.json");
  const raw = await readFile(modelPath, "utf-8");
  return JSON.parse(raw);
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { scenario } = body;

    if (!scenario || typeof scenario !== "string" || scenario.trim().length < 5) {
      return Response.json(
        { error: "请输入至少 5 个字的场景描述。" },
        { status: 400 },
      );
    }

    const model = await loadCognitiveModel();
    const modelText = JSON.stringify(model, null, 2);

    const client = new Anthropic();
    const response = await client.messages.create({
      model: "claude-sonnet-4-5-20250929",
      max_tokens: 4096,
      messages: [
        {
          role: "user",
          content: `${PREDICT_PROMPT}${modelText}\n\nSCENARIO:\n${scenario.trim()}`,
        },
      ],
      tools: [
        {
          name: "behavior_prediction",
          description: "Report the behavioral prediction for this scenario.",
          input_schema: RESULT_SCHEMA as Anthropic.Tool.InputSchema,
        },
      ],
      tool_choice: { type: "tool" as const, name: "behavior_prediction" },
    });

    for (const block of response.content) {
      if (block.type === "tool_use") {
        return Response.json({ prediction: block.input });
      }
    }

    return Response.json(
      { error: "预测生成失败，请重试。" },
      { status: 500 },
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return Response.json({ error: message }, { status: 500 });
  }
}
