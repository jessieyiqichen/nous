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
          confidence: {
            type: "string" as const,
            enum: ["high", "medium", "low"],
          },
        },
        required: [
          "name",
          "description",
          "behavioral_predictions",
          "confidence",
        ],
      },
    },
    summary: { type: "string" as const },
  },
  required: ["dimensions", "summary"],
};

const REFINE_MODEL_PROMPT = `You are refining a cognitive model based on new conversation data.

You have:
1. An EXISTING cognitive model (some dimensions may be inaccurate)
2. A NEW conversation transcript focused on specific dimensions
3. A list of dimensions that need refinement

## Rules:
- For FOCUS dimensions: Replace the existing description and predictions with NEW analysis
  based on the conversation. Be thorough — this is why we had the conversation.
- For NON-FOCUS dimensions: Keep the existing model's description and predictions UNCHANGED.
  Only update if the conversation provides strong contradictory evidence.
- Confidence for refined dimensions should reflect the NEW evidence quality.
- Update the summary to reflect the refinements.

`;

function formatContradictions(conflicts: unknown[]): string {
  if (!Array.isArray(conflicts) || conflicts.length === 0) return "";
  const lines = conflicts.map((c, i) => {
    const cc = c as Record<string, string>;
    return `${i + 1}. Stated: "${cc.stated_claim || ""}" → Actual: "${cc.actual_behavior || ""}" (${cc.blind_spot_evidence || ""})`;
  });
  return `\n\nKNOWN CONTRADICTIONS (from observed behavioral data — use these to ground your analysis):\n${lines.join("\n")}\n`;
}

function formatSignals(signals: unknown[]): string {
  if (!Array.isArray(signals) || signals.length === 0) return "";
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

interface BuildRequest {
  transcript: string;
  existingModel?: {
    dimensions: Array<{
      name: string;
      description: string;
      behavioral_predictions: string[];
      confidence: string;
    }>;
    summary: string;
  };
  focusDimensions?: string[];
  conflicts?: unknown[];
  signals?: unknown[];
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as BuildRequest;
    const { transcript, existingModel, focusDimensions, conflicts, signals } = body;
    const evidenceSection = formatContradictions(conflicts || []) + formatSignals(signals || []);

    if (
      !transcript ||
      typeof transcript !== "string" ||
      transcript.trim().length === 0
    ) {
      return Response.json(
        { error: "No transcript provided" },
        { status: 400 }
      );
    }

    let prompt: string;
    if (existingModel && focusDimensions && focusDimensions.length > 0) {
      // Refine mode
      const focusStr = focusDimensions.map((d) => `- ${d}`).join("\n");
      prompt =
        REFINE_MODEL_PROMPT +
        "EXISTING MODEL:\n" +
        JSON.stringify(existingModel, null, 2) +
        "\n\nFOCUS DIMENSIONS (these need refinement):\n" +
        focusStr +
        evidenceSection +
        "\n\nNEW CONVERSATION TRANSCRIPT:\n" +
        transcript;
    } else {
      // New model — inject known evidence alongside transcript
      prompt = BUILD_MODEL_PROMPT + transcript + evidenceSection;
    }

    const client = new Anthropic();
    const response = await client.messages.create({
      model: "claude-sonnet-4-5-20250929",
      max_tokens: 16384,
      messages: [{ role: "user", content: prompt }],
      tools: [
        {
          name: "cognitive_model",
          description: "Report the cognitive model.",
          input_schema: MODEL_SCHEMA,
        },
      ],
      tool_choice: { type: "tool" as const, name: "cognitive_model" },
    });

    for (const block of response.content) {
      if (block.type === "tool_use") {
        return Response.json(block.input);
      }
    }

    return Response.json(
      { error: "No model returned" },
      { status: 500 }
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("Interview build API error:", message);
    return Response.json({ error: message }, { status: 500 });
  }
}
