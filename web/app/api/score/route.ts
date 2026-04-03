import Anthropic from "@anthropic-ai/sdk";
import { NextRequest } from "next/server";

export const maxDuration = 60;

// T3 only — LLM scoring for blind spot vs contradiction matching
const T3_PROMPT = `You are evaluating BLIND SPOT predictions by comparing them against observed stated-vs-behavioral contradictions from real conversations.
All your output must be in Chinese (中文).

A "blind spot" is a systematic gap between what a person says/believes and what they actually do.
The model predicted 7 blind spots. You have a set of observed contradictions from real conversations.

Scoring rule — For each blind spot prediction, score 0.0-1.0:
- Strong match: A contradiction directly confirms this blind spot exists (0.8-1.0)
- Partial match: Related evidence, supports but doesn't directly confirm (0.4-0.6)
- No evidence: No contradictions relate to this blind spot (0.0)
- Contradicted: Evidence shows the person IS aware of and compensates for this supposed blind spot (0.0)

IMPORTANT: If there is no contradiction data at all, score ALL predictions 0.0.

For each prediction, provide:
- score (0.0-1.0)
- reasoning (which contradiction(s) support or contradict this, in Chinese)
- surprise (anything unexpected, in Chinese)
- In the "surprise" field, ALSO label the error type if the prediction scored low:
  - "认知架构错误" — the model got the cognitive structure wrong
  - "过度理想化" — the model predicted an idealized blind spot that doesn't exist in practice
  Distinguishing these two error types is critical for model calibration.

Then compute tier_accuracy (average of all scores) and key_findings (1-2 sentences in Chinese).

BLIND SPOT PREDICTIONS AND CONTRADICTION EVIDENCE:
`;

const T3_SCHEMA = {
  type: "object" as const,
  properties: {
    pair_scores: {
      type: "array" as const,
      items: {
        type: "object" as const,
        properties: {
          id: { type: "string" as const },
          score: { type: "number" as const },
          reasoning: { type: "string" as const },
          surprise: { type: "string" as const },
        },
        required: ["id", "score", "reasoning"],
      },
    },
    tier_accuracy: { type: "number" as const },
    key_findings: { type: "string" as const },
  },
  required: ["pair_scores", "tier_accuracy", "key_findings"],
};

interface T1Q { id: string; scenario: string; predicted_answer: string }
interface T1R { id: string; actual_answer: string }
interface T2Q { id: string; scenario: string; options: string[]; predicted_answer: string; predicted_reasoning: string }
interface T2R { id: string; actual_answer: string }
interface T3Q { id: string; predicted_blind_spot: string; statement: string; predicted_response: string; reasoning_from_model: string; confidence: number }
interface Conflict { stated_claim: string; actual_behavior: string; blind_spot_evidence: string }

interface PairScore {
  id: string;
  tier: number;
  score: number;
  reasoning: string;
  surprise?: string;
}

// ── Deterministic scoring for T1/T2 ──────────────────────────

function scoreT1Deterministic(predictions: Record<string, unknown>, responses: Record<string, unknown>): {
  pair_scores: PairScore[];
  tier_accuracy: number;
  key_findings: string;
} {
  const qs = (predictions.tier_1 || []) as T1Q[];
  const rs = (responses.tier_1 || []) as T1R[];
  const pair_scores: PairScore[] = [];

  for (let i = 0; i < qs.length; i++) {
    const q = qs[i], r = rs[i];
    if (!q || !r) continue;
    const match = q.predicted_answer.trim() === r.actual_answer.trim();
    pair_scores.push({
      id: q.id,
      tier: 1,
      score: match ? 1.0 : 0.0,
      reasoning: match ? `预测正确：选了「${r.actual_answer}」` : `预测错误：预测「${q.predicted_answer}」，实际选了「${r.actual_answer}」`,
    });
  }

  const total = pair_scores.length;
  const correct = pair_scores.filter((p) => p.score === 1.0).length;
  const tier_accuracy = total > 0 ? correct / total : 0;

  return {
    pair_scores,
    tier_accuracy,
    key_findings: `T1 偏好预测：${correct}/${total} 命中 (${(tier_accuracy * 100).toFixed(0)}%)`,
  };
}

function scoreT2Deterministic(predictions: Record<string, unknown>, responses: Record<string, unknown>): {
  pair_scores: PairScore[];
  tier_accuracy: number;
  key_findings: string;
} {
  const qs = (predictions.tier_2 || []) as T2Q[];
  const rs = (responses.tier_2 || []) as T2R[];
  const pair_scores: PairScore[] = [];

  for (let i = 0; i < qs.length; i++) {
    const q = qs[i], r = rs[i];
    if (!q || !r) continue;
    const match = q.predicted_answer.trim() === r.actual_answer.trim();
    pair_scores.push({
      id: q.id,
      tier: 2,
      score: match ? 1.0 : 0.0,
      reasoning: match ? `预测正确：选了「${r.actual_answer}」` : `预测错误：预测「${q.predicted_answer}」，实际选了「${r.actual_answer}」`,
    });
  }

  const total = pair_scores.length;
  const correct = pair_scores.filter((p) => p.score === 1.0).length;
  const tier_accuracy = total > 0 ? correct / total : 0;

  return {
    pair_scores,
    tier_accuracy,
    key_findings: `T2 推理预测：${correct}/${total} 命中 (${(tier_accuracy * 100).toFixed(0)}%)`,
  };
}

// ── T3 text builder for LLM scoring ──────────────────────────

function buildT3Text(predictions: Record<string, unknown>, extra?: Record<string, unknown>): string {
  const parts: string[] = [];
  const qs = (predictions.tier_3 || []) as T3Q[];

  parts.push("## BLIND SPOT PREDICTIONS:\n");
  for (const q of qs) {
    if (!q) continue;
    parts.push(`[${q.id}] Predicted blind spot: ${q.predicted_blind_spot || "(not specified)"}\nDiagnostic statement: ${q.statement}\nPredicted response: ${q.predicted_response}\nModel reasoning: ${q.reasoning_from_model || "(none)"}\nConfidence: ${q.confidence}`);
  }

  const conflicts = (extra?.conflicts || []) as Conflict[];
  if (conflicts.length > 0) {
    parts.push("\n## OBSERVED CONTRADICTIONS (stated vs behavioral):\n");
    for (let i = 0; i < conflicts.length; i++) {
      const c = conflicts[i];
      parts.push(`Contradiction ${i + 1}:\n  Stated: ${c.stated_claim}\n  Actual behavior: ${c.actual_behavior}\n  Evidence: ${c.blind_spot_evidence}`);
    }
  } else {
    parts.push("\n## NO CONTRADICTION DATA AVAILABLE\nScore ALL predictions 0.0 since there is no behavioral evidence.");
  }

  return parts.join("\n\n---\n\n");
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { predictions, responses, tier, conflicts } = body;

    if (!predictions || !tier) {
      return Response.json({ error: "Missing predictions or tier" }, { status: 400 });
    }
    if (![1, 2, 3].includes(tier)) {
      return Response.json({ error: "tier must be 1, 2, or 3" }, { status: 400 });
    }
    // T1/T2 require responses; T3 uses conflicts for auto-scoring
    if (tier !== 3 && !responses) {
      return Response.json({ error: "Missing responses for tier " + tier }, { status: 400 });
    }

    // T1 and T2: deterministic scoring (no LLM needed)
    if (tier === 1) {
      const result = scoreT1Deterministic(predictions, responses);
      if (result.pair_scores.length === 0) {
        return Response.json({ error: "T1(偏好) 没有有效的预测-回答配对。可能该层预测为空，请返回重新生成。" }, { status: 400 });
      }
      return Response.json({ tier: 1, ...result });
    }

    if (tier === 2) {
      const result = scoreT2Deterministic(predictions, responses);
      if (result.pair_scores.length === 0) {
        return Response.json({ error: "T2(推理) 没有有效的预测-回答配对。可能该层预测为空，请返回重新生成。" }, { status: 400 });
      }
      return Response.json({ tier: 2, ...result });
    }

    // T3: LLM scoring (semantic matching of blind spots vs contradictions)
    const t3Text = buildT3Text(predictions, { conflicts });
    if (!t3Text) {
      return Response.json({ error: "T3(盲区) 没有有效的盲区预测数据。" }, { status: 400 });
    }

    const client = new Anthropic();
    const response = await client.messages.create({
      model: "claude-sonnet-4-5-20250929",
      max_tokens: 4096,
      messages: [{ role: "user", content: T3_PROMPT + t3Text }],
      tools: [{
        name: "tier_report",
        description: "Report tier 3 scoring results.",
        input_schema: T3_SCHEMA as Anthropic.Tool.InputSchema,
      }],
      tool_choice: { type: "tool" as const, name: "tier_report" },
    });

    for (const block of response.content) {
      if (block.type === "tool_use") {
        const raw = block.input as Record<string, unknown>;
        let pairScores = raw.pair_scores;
        if (typeof pairScores === "string") {
          try { pairScores = JSON.parse(pairScores); } catch { /* keep as-is */ }
        }
        if (!Array.isArray(pairScores)) {
          console.error("pair_scores is not an array:", typeof pairScores);
          pairScores = [];
        }
        return Response.json({ tier: 3, ...raw, pair_scores: pairScores });
      }
    }

    return Response.json({ error: "No score returned" }, { status: 500 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("Score API error:", message);
    return Response.json({ error: message }, { status: 500 });
  }
}
