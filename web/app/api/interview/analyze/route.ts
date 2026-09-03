import { NextRequest } from "next/server";
import { deepseekStructured } from "@/lib/deepseek";

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

    // Run coverage check and signal extraction in parallel
    const [coverageResult, signalResult] = await Promise.all([
      deepseekStructured({
        prompt: DIMENSION_CHECK_PROMPT + transcript,
        schema: COVERAGE_SCHEMA,
        maxTokens: 4096,
      }),
      // Signal extraction (use recent transcript if provided, else full)
      deepseekStructured({
        prompt: INLINE_SIGNAL_PROMPT + (recentTranscript || transcript),
        schema: INLINE_SIGNAL_SCHEMA,
        maxTokens: 4096,
      }),
    ]);

    // LLM 结构化输出偶发把数组字段返回成 JSON 字符串——在边界归一化，
    // 否则前端 [...prev, ...signals] 会把字符串按字符打散（S01 实测踩中）
    const safeArray = (v: unknown): unknown[] => {
      if (Array.isArray(v)) return v;
      if (typeof v === "string") {
        try {
          const p = JSON.parse(v);
          if (Array.isArray(p)) return p;
        } catch { /* fall through */ }
      }
      return [];
    };
    const cov = coverageResult as Record<string, unknown> | null;
    const sig = signalResult as Record<string, unknown> | null;

    return Response.json({
      coverage: cov ? { ...cov, dimensions: safeArray(cov.dimensions) } : null,
      signals: sig
        ? { ...sig, signals: safeArray(sig.signals), conflicts: safeArray(sig.conflicts) }
        : null,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("Interview analyze API error:", message);
    return Response.json({ error: message }, { status: 500 });
  }
}
