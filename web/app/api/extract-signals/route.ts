import Anthropic from "@anthropic-ai/sdk";
import { NextRequest } from "next/server";

export const maxDuration = 120;

const EXTRACT_SIGNALS_PROMPT = `You are a cognitive signal extractor analyzing a conversation between
a human and an AI. Your goal is twofold:

1. FILTER: Determine if the conversation has cognitive signal value
2. EXTRACT: If yes, extract structured behavioral signals

## Cognitive Signal Value

Conversations WITH value: deep discussions, decisions, trade-offs, value conflicts,
pushback, avoidance, emotional reactions, stated-vs-revealed behavior gaps.

Conversations WITHOUT value: purely instructional, simple Q&A, admin/logistics, too short.

If the conversation has no signal value, set has_signal to false and return empty arrays.

## Signal Types (7 categories):

1. **pushback** — User rejects or argues against AI's suggestion/analysis
   T3 value: HIGH — reveals real value boundaries

2. **acceptance** — User accepts without resistance
   T3 value: MEDIUM — reveals default modes and unexamined assumptions

3. **inquiry** — User digs deeper, asks follow-ups
   T3 value: MEDIUM — reveals what draws exploration

4. **avoidance** — User deflects, changes topic, ignores directions
   T3 value: HIGH — directly exposes blind spots

5. **decision** — User makes a choice or commitment
   T3 value: HIGH — revealed preference

6. **emotion_leak** — Emotional response breaks through analytical layer
   T3 value: HIGH — reveals sub-analytical processing

7. **value_reveal** — User inadvertently exposes values/priorities
   T3 value: HIGH — stated vs revealed preference gap

## Dual-Track Analysis (CRITICAL for T3):

For each signal, classify as:
- **stated** — What the user explicitly claims about themselves
- **behavioral** — What the user actually does in the conversation

When stated != behavioral → OBJECTIVE blind spot evidence.

## T3 Comparison:

If a cognitive model is provided, compare signals against Blind Spots (dim 6)
and Execution-Layer Flexibility (dim 9). Generate deltas where actual behavior
diverges from model predictions.

RULES:
- Only extract signals with DIRECT evidence (quote the conversation)
- Quality > quantity — 3 high-confidence signals > 10 weak ones
- Not every conversation has T3-relevant signals — that's fine

`;

const SIGNAL_TYPES = [
  "pushback", "acceptance", "inquiry", "avoidance",
  "decision", "emotion_leak", "value_reveal",
] as const;

const EXTRACT_SCHEMA = {
  type: "object" as const,
  properties: {
    has_signal: { type: "boolean" as const },
    filter_reasoning: { type: "string" as const },
    signals: {
      type: "array" as const,
      items: {
        type: "object" as const,
        properties: {
          signal_type: {
            type: "string" as const,
            enum: [...SIGNAL_TYPES],
          },
          track: {
            type: "string" as const,
            enum: ["stated", "behavioral"],
          },
          turn_range: { type: "string" as const },
          evidence: { type: "string" as const },
          cognitive_dimension: { type: "string" as const },
          interpretation: { type: "string" as const },
          confidence: { type: "number" as const },
        },
        required: [
          "signal_type", "track", "turn_range", "evidence",
          "cognitive_dimension", "interpretation", "confidence",
        ],
      },
    },
    stated_vs_behavioral_conflicts: {
      type: "array" as const,
      items: {
        type: "object" as const,
        properties: {
          stated_claim: { type: "string" as const },
          actual_behavior: { type: "string" as const },
          blind_spot_evidence: { type: "string" as const },
          confidence: { type: "number" as const },
        },
        required: ["stated_claim", "actual_behavior", "blind_spot_evidence", "confidence"],
      },
    },
    conversation_summary: { type: "string" as const },
    t3_deltas: {
      type: "array" as const,
      items: {
        type: "object" as const,
        properties: {
          blind_spot_dimension: { type: "string" as const },
          current_model_says: { type: "string" as const },
          actual_behavior: { type: "string" as const },
          delta: { type: "string" as const },
          confidence: { type: "number" as const },
        },
        required: [
          "blind_spot_dimension", "current_model_says",
          "actual_behavior", "delta", "confidence",
        ],
      },
    },
  },
  required: [
    "has_signal", "filter_reasoning", "signals",
    "stated_vs_behavioral_conflicts", "conversation_summary", "t3_deltas",
  ],
};

interface CognitiveModel {
  dimensions: Array<{
    name: string;
    description: string;
    behavioral_predictions: string[];
    confidence: string;
  }>;
  summary: string;
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { conversation, model } = body as {
      conversation: string;
      model?: CognitiveModel;
    };

    if (!conversation || typeof conversation !== "string" || conversation.trim().length === 0) {
      return Response.json({ error: "No conversation text provided" }, { status: 400 });
    }

    // Build model context
    let modelContext = "";
    if (model?.dimensions) {
      const t3Dims = model.dimensions.filter(
        (d) => d.name === "Blind Spots" || d.name === "Execution-Layer Flexibility"
      );
      modelContext =
        "\n## Current Cognitive Model (T3-relevant dimensions):\n\n" +
        JSON.stringify(t3Dims, null, 2) +
        "\n\nCompare extracted signals against these dimensions. " +
        "Generate deltas where actual behavior diverges from model predictions.\n";
    } else {
      modelContext =
        "\n## No cognitive model provided.\n" +
        "Skip T3 comparison — just extract signals and note which ones " +
        "would be relevant to blind spot analysis.\n";
    }

    const fullPrompt = EXTRACT_SIGNALS_PROMPT + modelContext + "\nCONVERSATION TO ANALYZE:\n" + conversation;

    const client = new Anthropic();
    const response = await client.messages.create({
      model: "claude-sonnet-4-5-20250929",
      max_tokens: 16384,
      messages: [{ role: "user", content: fullPrompt }],
      tools: [{
        name: "extract_signals",
        description: "Report cognitive signal extraction results.",
        input_schema: EXTRACT_SCHEMA,
      }],
      tool_choice: { type: "tool" as const, name: "extract_signals" },
    });

    for (const block of response.content) {
      if (block.type === "tool_use") {
        return Response.json(block.input);
      }
    }

    return Response.json({ error: "No extraction returned" }, { status: 500 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("Extract signals API error:", message);
    return Response.json({ error: message }, { status: 500 });
  }
}
