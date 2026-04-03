import Anthropic from "@anthropic-ai/sdk";
import { NextRequest } from "next/server";

export const maxDuration = 60;

// ── Coverage check ───────────────────────────────────────────

const DIMENSION_CHECK_PROMPT = `Given this conversation transcript, assess coverage of each cognitive dimension.

For each dimension, rate confidence as:
- "high" — clear behavioral evidence from multiple angles
- "medium" — some evidence, enough to form initial hypotheses
- "low" — only hints, not enough for reliable modeling
- "none" — no evidence at all

Dimensions:
1. Decision Architecture
2. Attention Allocation
3. Reasoning Style
4. Emotional Processing
5. Social Cognition
6. Blind Spots
7. Value Hierarchy
8. Response to Uncertainty
9. Execution-Layer Flexibility

Conversation transcript:
`;

const COVERAGE_SCHEMA = {
  type: "object" as const,
  properties: {
    dimensions: {
      type: "array" as const,
      items: {
        type: "object" as const,
        properties: {
          name: { type: "string" as const },
          confidence: {
            type: "string" as const,
            enum: ["high", "medium", "low", "none"],
          },
          evidence_summary: { type: "string" as const },
        },
        required: ["name", "confidence"],
      },
    },
    suggested_next_topic: {
      type: "string" as const,
      description: "What to explore next to fill the biggest gap",
    },
    overall_readiness: {
      type: "string" as const,
      enum: ["ready", "almost", "needs_more"],
      description: "Whether enough data exists to build a reliable model",
    },
  },
  required: ["dimensions", "suggested_next_topic", "overall_readiness"],
};

// ── Inline signal extraction ────────────────────────────────

const INLINE_SIGNAL_PROMPT = `Analyze the LATEST few turns of this cognitive interview.
Extract any cognitive signals from the interviewee's responses.

Signal types: pushback, acceptance, inquiry, avoidance, decision, emotion_leak, value_reveal

For each signal, note:
- Whether it's "stated" (what they claim) or "behavioral" (what they actually do)
- Which cognitive dimension it relates to
- Brief evidence quote

Also flag any stated-vs-behavioral CONFLICTS (person says one thing but does another).

Keep it concise — only high-confidence signals.

TRANSCRIPT (focus on the last 2-4 turns):
`;

const INLINE_SIGNAL_SCHEMA = {
  type: "object" as const,
  properties: {
    signals: {
      type: "array" as const,
      items: {
        type: "object" as const,
        properties: {
          signal_type: {
            type: "string" as const,
            enum: [
              "pushback", "acceptance", "inquiry", "avoidance",
              "decision", "emotion_leak", "value_reveal",
            ],
          },
          track: {
            type: "string" as const,
            enum: ["stated", "behavioral"],
          },
          cognitive_dimension: { type: "string" as const },
          evidence: { type: "string" as const },
          interpretation: { type: "string" as const },
        },
        required: ["signal_type", "track", "cognitive_dimension", "evidence"],
      },
    },
    conflicts: {
      type: "array" as const,
      items: {
        type: "object" as const,
        properties: {
          stated_claim: { type: "string" as const },
          actual_behavior: { type: "string" as const },
          blind_spot_evidence: { type: "string" as const },
        },
        required: ["stated_claim", "actual_behavior", "blind_spot_evidence"],
      },
    },
  },
  required: ["signals", "conflicts"],
};

// ── Route handler ───────────────────────────────────────────

interface AnalyzeRequest {
  transcript: string;
  recentTranscript?: string;
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as AnalyzeRequest;
    const { transcript, recentTranscript } = body;

    if (!transcript || typeof transcript !== "string") {
      return Response.json(
        { error: "No transcript provided" },
        { status: 400 }
      );
    }

    const client = new Anthropic();

    // Run coverage check and signal extraction in parallel
    const [coverageResult, signalResult] = await Promise.all([
      // Coverage check
      client.messages
        .create({
          model: "claude-sonnet-4-5-20250929",
          max_tokens: 4096,
          messages: [
            { role: "user", content: DIMENSION_CHECK_PROMPT + transcript },
          ],
          tools: [
            {
              name: "dimension_coverage",
              description: "Report dimension coverage assessment.",
              input_schema: COVERAGE_SCHEMA,
            },
          ],
          tool_choice: { type: "tool" as const, name: "dimension_coverage" },
        })
        .then((res) => {
          for (const block of res.content) {
            if (block.type === "tool_use") return block.input;
          }
          return null;
        }),

      // Signal extraction (use recent transcript if provided, else full)
      client.messages
        .create({
          model: "claude-sonnet-4-5-20250929",
          max_tokens: 4096,
          messages: [
            {
              role: "user",
              content:
                INLINE_SIGNAL_PROMPT + (recentTranscript || transcript),
            },
          ],
          tools: [
            {
              name: "inline_signals",
              description: "Report extracted cognitive signals.",
              input_schema: INLINE_SIGNAL_SCHEMA,
            },
          ],
          tool_choice: { type: "tool" as const, name: "inline_signals" },
        })
        .then((res) => {
          for (const block of res.content) {
            if (block.type === "tool_use") return block.input;
          }
          return null;
        }),
    ]);

    return Response.json({
      coverage: coverageResult,
      signals: signalResult,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("Interview analyze API error:", message);
    return Response.json({ error: message }, { status: 500 });
  }
}
