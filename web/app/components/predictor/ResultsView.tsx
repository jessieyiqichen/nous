"use client";

import type { CognitiveModel } from "./types";
import { ERROR_TYPES } from "./types";
import type { PredictorState } from "./usePredictorState";
import type { PredictorActions } from "./usePredictorActions";
import { ScoreCard, ScoreBadge, TierBadge, GradientBar } from "./ui";
import { RoundHistoryChart, AccuracyChart } from "./charts";

interface ResultsViewProps {
  state: PredictorState;
  actions: PredictorActions;
  onRequestRefine?: (req: {
    model: CognitiveModel;
    focusDimensions: string[];
  }) => void;
}

/* ── RENDER: Step 4 — Results ── */
export default function ResultsView({ state, actions, onRequestRefine }: ResultsViewProps) {
  const {
    scores, predictions, cognitiveModel, testRound, roundHistory,
    refinement, setRefinement, refining, error, topRef,
  } = state;
  const { handleReset, handleRefine, handleApplyRefinement } = actions;

  if (!scores) return null;

  return (
    <div ref={topRef} className="max-w-3xl mx-auto space-y-6">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div>
          <p className="eyebrow" style={{ marginBottom: 8 }}>
            预测准确率{testRound > 1 ? ` · 第 ${testRound} 轮` : ""}
          </p>
          <h2 style={{ fontFamily: "var(--font-display)", fontSize: 24, fontWeight: 400, margin: 0 }}>
            报告
          </h2>
        </div>
        <button
          onClick={handleReset}
          style={{ fontSize: 12, color: "var(--muted-soft)", background: "transparent", border: 0, cursor: "pointer", textDecoration: "underline", textUnderlineOffset: 4, fontFamily: "inherit" }}
        >
          重新测试
        </button>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 1, border: "1px solid var(--card-border)" }}>
        <ScoreCard label="偏好预测" value={scores.tier_1_accuracy} color="" />
        <ScoreCard label="推理预测" value={scores.tier_2_accuracy} color="" />
        <ScoreCard label="盲区（自动）" value={scores.tier_3_accuracy} color="" />
        <ScoreCard label="综合准确率" value={scores.overall_accuracy} color="" />
      </div>

      {/* Random baseline comparison */}
      {predictions && (() => {
        const t1Opts = predictions.tier_1[0]?.options?.length || 4;
        const t2Opts = predictions.tier_2[0]?.options?.length || 4;
        const t1Baseline = 1 / t1Opts;
        const t2Baseline = 1 / t2Opts;
        const t1Lift = scores.tier_1_accuracy - t1Baseline;
        const t2Lift = scores.tier_2_accuracy - t2Baseline;
        return (
          <div style={{ border: "1px solid var(--card-border)", padding: 20 }}>
            <p className="eyebrow" style={{ marginBottom: 12 }}>vs 随机基线</p>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, fontSize: 14 }}>
              <div>
                <span style={{ color: "var(--muted)" }}>T1 随机猜中率：</span>
                <span style={{ fontFamily: "var(--font-mono)", color: "#5e7a8a" }}>{(t1Baseline * 100).toFixed(0)}%</span>
                <span style={{ fontSize: 12, marginLeft: 8 }}>{t1Lift > 0 ? "+" : ""}{(t1Lift * 100).toFixed(0)}pp</span>
              </div>
              <div>
                <span style={{ color: "var(--muted)" }}>T2 随机猜中率：</span>
                <span style={{ fontFamily: "var(--font-mono)", color: "#a86c3a" }}>{(t2Baseline * 100).toFixed(0)}%</span>
                <span style={{ fontSize: 12, marginLeft: 8 }}>{t2Lift > 0 ? "+" : ""}{(t2Lift * 100).toFixed(0)}pp</span>
              </div>
            </div>
            <p style={{ fontSize: 12, color: "var(--muted)", marginTop: 8 }}>
              pp = percentage points above random guessing. 高于基线越多，模型信号越强。
            </p>
          </div>
        );
      })()}

      {/* Context-based diagnosis */}
      {predictions && (() => {
        type CtxKey = "time_pressure" | "social_pressure" | "caring_level" | "energy_state";
        const ctxLabels: Record<CtxKey, string> = {
          time_pressure: "时间压力",
          social_pressure: "社交压力",
          caring_level: "在乎程度",
          energy_state: "能量状态",
        };
        // Collect per-context-value accuracy
        const buckets: Record<string, { correct: number; total: number }> = {};
        for (const ps of scores.pair_scores) {
          if (ps.tier === 3) continue; // T3 has no user answers to compare
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const q: any = ps.tier === 1
            ? predictions.tier_1.find((qq) => qq.id === ps.id)
            : predictions.tier_2.find((qq) => qq.id === ps.id);
          const ctx = q?.context as Record<string, string> | undefined;
          if (!ctx) continue;
          for (const [key, val] of Object.entries(ctx)) {
            const label = ctxLabels[key as CtxKey] || key;
            const tag = `${label}=${val}`;
            if (!buckets[tag]) buckets[tag] = { correct: 0, total: 0 };
            buckets[tag].total++;
            if (ps.score >= 0.5) buckets[tag].correct++;
          }
        }
        const entries = Object.entries(buckets)
          .filter(([, v]) => v.total >= 2)
          .map(([tag, v]) => ({ tag, acc: v.correct / v.total, n: v.total }))
          .sort((a, b) => a.acc - b.acc);
        if (entries.length === 0) return null;
        return (
          <div style={{ border: "1px solid var(--card-border)", padding: 20 }}>
            <p className="eyebrow" style={{ marginBottom: 12 }}>情境诊断（T1+T2，按 context 分组）</p>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {entries.map(({ tag, acc, n }) => (
                <div key={tag} style={{ display: "flex", alignItems: "center", gap: 12, fontSize: 14 }}>
                  <span style={{ width: 144, color: "var(--muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{tag}</span>
                  <div style={{ flex: 1, height: 2, background: "var(--card-border)", borderRadius: 9999, overflow: "hidden" }}>
                    <div
                      style={{ height: "100%", borderRadius: 9999, background: acc >= 0.5 ? "var(--success)" : "var(--error)", width: `${acc * 100}%` }}
                    />
                  </div>
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, width: 64, textAlign: "right" }}>{(acc * 100).toFixed(0)}% ({n})</span>
                </div>
              ))}
            </div>
            <p style={{ fontSize: 12, color: "var(--muted)", marginTop: 8 }}>
              红色 = 模型在此情境下系统性失败（&lt;50%），绿色 = 有效。数字括号内为题数。
            </p>
          </div>
        );
      })()}

      <div style={{ border: "1px solid var(--card-border)", padding: 20 }}>
        <p className="eyebrow" style={{ marginBottom: 16 }}>准确率梯度</p>
        <GradientBar report={scores} />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 32 }}>
        <div style={{ border: "1px solid var(--card-border)", padding: 20 }}>
          <p className="eyebrow" style={{ marginBottom: 8 }}>三层对比</p>
          <AccuracyChart report={scores} />
        </div>
        <div>
          <p className="eyebrow" style={{ marginBottom: 8 }}>核心发现</p>
          <p className="pull-quote">{scores.key_findings}</p>
        </div>
      </div>

      {/* Round history — only show if we have 2+ rounds */}
      {roundHistory.length >= 2 && (
        <div style={{ border: "1px solid var(--card-border)", padding: 20 }}>
          <p className="eyebrow" style={{ marginBottom: 12 }}>迭代趋势（{roundHistory.length} 轮）</p>
          <RoundHistoryChart history={roundHistory} />
        </div>
      )}

      {/* Error type distribution for current round */}
      {(() => {
        const errorCounts: Record<string, number> = {};
        for (const ps of scores.pair_scores) {
          if (ps.score < 0.5 && ps.surprise) {
            for (const et of ERROR_TYPES) {
              if (ps.surprise.includes(et)) {
                errorCounts[et] = (errorCounts[et] || 0) + 1;
              }
            }
          }
        }
        const hasErrors = Object.keys(errorCounts).length > 0;
        if (!hasErrors) return null;
        return (
          <div style={{ border: "1px solid var(--card-border)", padding: 20 }}>
            <p className="eyebrow" style={{ marginBottom: 12 }}>错误类型分布</p>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 12 }}>
              {ERROR_TYPES.map((et) => {
                const count = errorCounts[et] || 0;
                if (count === 0) return null;
                const tone =
                  et === "过度理想化" ? "#a86c3a" :
                  et === "认知架构错误" ? "#b85c4a" :
                  et === "情境缺失" ? "#5e7a8a" :
                  "#9a5a6e";
                return (
                  <div key={et} style={{ padding: "8px 12px", borderRadius: 8, border: `1px solid ${tone}66`, background: `${tone}1a`, textAlign: "center" }}>
                    <p style={{ fontFamily: "var(--font-display)", fontSize: 18, fontWeight: 400, margin: "0 0 2px", color: tone }}>{count}</p>
                    <p style={{ fontSize: 11, margin: 0, color: tone }}>{et}</p>
                  </div>
                );
              })}
            </div>
            <p style={{ fontSize: 12, color: "var(--muted)", marginTop: 12 }}>
              基于评分中 surprise 字段的错误标注（仅统计得分 &lt; 50% 的预测）
            </p>
          </div>
        );
      })()}

      {cognitiveModel && (
        <div style={{ border: "1px solid var(--card-border)", padding: 20 }}>
          <p className="eyebrow" style={{ marginBottom: 8 }}>认知模型摘要</p>
          <p style={{ fontSize: 14, color: "var(--muted)", lineHeight: 1.65, margin: 0 }}>{cognitiveModel.summary}</p>
        </div>
      )}

      <div style={{ border: "1px solid var(--card-border)", padding: 20 }}>
        <p className="eyebrow" style={{ marginBottom: 16 }}>逐题评分</p>
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {scores.pair_scores.map((ps) => (
            <div key={`score_t${ps.tier}_${ps.id}`} style={{ borderBottom: "1px solid var(--card-border)", paddingBottom: 12 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                <TierBadge tier={ps.tier} />
                <span style={{ fontSize: 14 }}>{ps.id}</span>
                <ScoreBadge score={ps.score} />
              </div>
              <p style={{ fontSize: 14, color: "var(--muted)", margin: 0, lineHeight: 1.6 }}>{ps.reasoning}</p>
              {ps.surprise && <p style={{ fontSize: 12, color: "var(--warning)", marginTop: 4 }}>意外发现：{ps.surprise}</p>}
            </div>
          ))}
        </div>
      </div>

      {/* Refinement section */}
      {!refinement && (
        <div style={{ borderTop: "2px solid var(--accent)", paddingTop: 20 }}>
          <p className="eyebrow" style={{ marginBottom: 8 }}>闭环修正</p>
          <p style={{ fontSize: 13, color: "var(--muted)", margin: "0 0 16px", lineHeight: 1.6 }}>
            基于本轮预测错误，AI 会分析模型哪些维度需要修正，然后用修正后的模型生成新一轮预测题。
          </p>
          <button
            onClick={handleRefine}
            disabled={refining}
            style={{ fontSize: 13, fontWeight: 500, padding: "10px 24px", borderRadius: 9999, border: 0, cursor: "pointer", background: "var(--accent)", color: "#fff", opacity: refining ? 0.4 : 1, transition: "opacity 200ms" }}
          >
            {refining ? "正在分析错误并修正模型..." : "修正模型，进入下一轮"}
          </button>
          {error && <p style={{ fontSize: 13, color: "var(--error)", marginTop: 8 }}>{error}</p>}
        </div>
      )}

      {refinement && (
        <div style={{ border: "1px solid var(--card-border)", padding: 20 }}>
          <p className="eyebrow" style={{ marginBottom: 8 }}>模型修正建议</p>
          <p style={{ fontSize: 14, color: "var(--muted)", lineHeight: 1.65, margin: "0 0 16px" }}>{refinement.refinement_summary}</p>

          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {refinement.corrections.map((c, i) => (
              <div key={i} style={{ borderBottom: "1px solid var(--card-border)", paddingBottom: 12 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ fontSize: 14 }}>{c.dimension}</span>
                  {(() => {
                    const tone =
                      c.error_type === "过度理想化" ? "#a86c3a" :
                      c.error_type === "认知架构错误" ? "#b85c4a" :
                      c.error_type === "情境缺失" ? "#5e7a8a" :
                      "#9a5a6e";
                    return (
                      <span style={{ fontSize: 10, padding: "2px 8px", borderRadius: 9999, border: `1px solid ${tone}66`, background: `${tone}1a`, color: tone }}>
                        {c.error_type}
                      </span>
                    );
                  })()}
                </div>
                <p style={{ fontSize: 12, color: "var(--muted)", margin: "4px 0 0" }}>证据：{c.evidence}</p>
                <p style={{ fontSize: 12, color: "var(--success)", margin: "4px 0 0" }}>修正：{c.corrected}</p>
              </div>
            ))}
          </div>

          <div style={{ display: "flex", gap: 12, marginTop: 16 }}>
            <button
              onClick={handleApplyRefinement}
              style={{ fontSize: 13, fontWeight: 500, padding: "10px 24px", borderRadius: 9999, border: 0, cursor: "pointer", background: "var(--accent)", color: "#fff", transition: "opacity 200ms" }}
            >
              应用修正，开始第 {testRound + 1} 轮
            </button>
            <button
              onClick={() => setRefinement(null)}
              style={{ fontSize: 12, color: "var(--muted-soft)", background: "transparent", border: 0, cursor: "pointer", textDecoration: "underline", textUnderlineOffset: 4, fontFamily: "inherit" }}
            >
              取消
            </button>
          </div>
        </div>
      )}

      {/* Deep conversation refinement */}
      {onRequestRefine && cognitiveModel && (
        <div style={{ borderTop: "1px solid var(--card-border)", paddingTop: 20 }}>
          <p className="eyebrow" style={{ marginBottom: 8 }}>对话修正</p>
          <p style={{ fontSize: 13, color: "var(--muted)", margin: "0 0 16px", lineHeight: 1.6 }}>
            通过深度对话修正不准的维度。AI 会针对预测错误最多的维度展开自然对话，获取更多行为证据来修正模型。
          </p>
          <button
            onClick={() => {
              if (!cognitiveModel || !scores) return;
              // Find dimensions with lowest accuracy from pair_scores
              const dimErrors: Record<string, number> = {};
              for (const ps of scores.pair_scores) {
                if (ps.score < 0.5 && ps.surprise) {
                  // Extract dimension from surprise text or use tier mapping
                  const dim = ps.surprise;
                  dimErrors[dim] = (dimErrors[dim] || 0) + 1;
                }
              }
              // Identify weak dimensions: tier accuracy < 60% → those dimensions
              const weakDims: string[] = [];
              if (scores.tier_1_accuracy < 0.6) {
                weakDims.push("Decision Architecture", "Value Hierarchy");
              }
              if (scores.tier_2_accuracy < 0.6) {
                weakDims.push("Reasoning Style", "Response to Uncertainty");
              }
              if (scores.tier_3_accuracy < 0.6) {
                weakDims.push("Blind Spots", "Execution-Layer Flexibility");
              }
              // Also add any dimension with low confidence
              for (const dim of cognitiveModel.dimensions) {
                if (dim.confidence === "low" && !weakDims.includes(dim.name)) {
                  weakDims.push(dim.name);
                }
              }
              // Deduplicate and limit to 4
              const uniqueDims = [...new Set(weakDims)].slice(0, 4);
              if (uniqueDims.length === 0) {
                // If everything is >60%, pick the weakest tier's dimensions
                const minTier = Math.min(scores.tier_1_accuracy, scores.tier_2_accuracy, scores.tier_3_accuracy);
                if (minTier === scores.tier_3_accuracy) {
                  uniqueDims.push("Blind Spots", "Execution-Layer Flexibility");
                } else if (minTier === scores.tier_2_accuracy) {
                  uniqueDims.push("Reasoning Style", "Response to Uncertainty");
                } else {
                  uniqueDims.push("Decision Architecture", "Value Hierarchy");
                }
              }
              onRequestRefine({
                model: cognitiveModel,
                focusDimensions: uniqueDims,
              });
            }}
            style={{ fontSize: 13, padding: "9px 19px", borderRadius: 9999, border: "1px solid var(--card-border)", cursor: "pointer", background: "transparent", color: "var(--muted)", transition: "all 200ms" }}
          >
            开始对话修正（针对弱维度深聊）
          </button>
        </div>
      )}
    </div>
  );
}
