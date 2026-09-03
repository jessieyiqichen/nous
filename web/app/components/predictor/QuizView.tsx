"use client";

import type { PredictorState } from "./usePredictorState";
import type { PredictorActions } from "./usePredictorActions";
import { getConflicts } from "./interviewData";
import { Section, ContextTags, QCard } from "./ui";

interface QuizViewProps {
  state: PredictorState;
  actions: PredictorActions;
}

/* ── RENDER: Step 2 — Quiz ── */
export default function QuizView({ state, actions }: QuizViewProps) {
  const {
    predictions, setStep, t1Answers, setT1Answers, t2Answers, setT2Answers,
    totalQ, answered, error, topRef,
  } = state;
  const { handleSubmit } = actions;

  if (!predictions) return null;

  return (
    <div ref={topRef} className="max-w-2xl mx-auto space-y-8">
      {/* Header */}
      <div className="text-center space-y-2 pt-2">
        <button
          onClick={() => setStep("input")}
          style={{ fontSize: 12, color: "var(--muted-soft)", background: "transparent", border: 0, cursor: "pointer", textDecoration: "underline", textUnderlineOffset: 4, fontFamily: "inherit", marginBottom: 8 }}
        >
          返回
        </button>
        <h2 style={{ fontFamily: "var(--font-display)", fontSize: 24, fontWeight: 400, margin: 0 }}>AI 能预测你的行为吗？</h2>
        <p style={{ fontFamily: "var(--font-display)", fontSize: 13, fontStyle: "italic", color: "var(--muted)", margin: 0 }}>
          共 {totalQ} 题，凭直觉回答。盲区部分自动评估。
        </p>
        <div className="flex items-center justify-center gap-3 pt-1">
          <div className="w-48 h-1.5 bg-[var(--card-border)] rounded-full overflow-hidden">
            <div
              className="h-full bg-[var(--accent)] transition-all duration-300 rounded-full"
              style={{ width: `${totalQ > 0 ? (answered / totalQ) * 100 : 0}%` }}
            />
          </div>
          <span className="text-xs text-[var(--muted)]">{answered}/{totalQ}</span>
        </div>
      </div>

      {/* Tier 1 — 4-option multiple choice */}
      <Section tier={1} title="偏好选择" desc="选一个最符合你的答案" color="blue" />
      {predictions.tier_1.map((q, i) => (
        <QCard key={`t1_${q.id}`} num={i + 1}>
          <ContextTags context={q.context} />
          <p className="text-sm mb-4">{q.scenario}</p>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {q.options.map((opt, oi) => {
              const sel = t1Answers[q.id] === opt;
              const letter = String.fromCharCode(65 + oi);
              return (
                <label
                  key={oi}
                  onClick={() => setT1Answers({ ...t1Answers, [q.id]: opt })}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 12,
                    padding: "10px 16px",
                    borderRadius: 12,
                    border: sel ? "1px solid var(--accent)" : "1px solid var(--card-border)",
                    background: sel ? "var(--accent-soft)" : "transparent",
                    cursor: "pointer",
                    transition: "all 150ms",
                  }}
                >
                  <span style={{
                    width: 24,
                    height: 24,
                    borderRadius: 9999,
                    border: sel ? "1px solid var(--accent)" : "1px solid var(--card-border)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontFamily: "var(--font-mono)",
                    fontSize: 12,
                    color: sel ? "var(--accent)" : "var(--muted-soft)",
                    flexShrink: 0,
                  }}>
                    {letter}
                  </span>
                  <span style={{
                    fontFamily: sel ? "var(--font-display)" : "inherit",
                    fontSize: sel ? 15 : 14,
                    fontStyle: sel ? "italic" : "normal",
                    color: sel ? "var(--accent)" : "var(--foreground)",
                  }}>
                    {opt}
                  </span>
                  <input type="radio" name={`t1_${q.id}`} checked={sel} onChange={() => {}} className="sr-only" />
                </label>
              );
            })}
          </div>
        </QCard>
      ))}

      {/* Tier 2 — Scenario + 4-option MCQ */}
      <Section tier={2} title="推理判断" desc="选一个最符合你的答案" color="orange" />
      {predictions.tier_2.map((q, i) => (
        <QCard key={`t2_${q.id}`} num={predictions.tier_1.length + i + 1}>
          <ContextTags context={q.context} />
          <p className="text-sm mb-3">{q.scenario}</p>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {(q.options || []).map((opt, oi) => {
              const sel = t2Answers[q.id] === opt;
              const letter = String.fromCharCode(65 + oi);
              return (
                <label
                  key={oi}
                  onClick={() => setT2Answers({ ...t2Answers, [q.id]: opt })}
                  style={{
                    display: "flex",
                    alignItems: "flex-start",
                    gap: 12,
                    padding: "10px 16px",
                    borderRadius: 12,
                    border: sel ? "1px solid var(--accent)" : "1px solid var(--card-border)",
                    background: sel ? "var(--accent-soft)" : "transparent",
                    cursor: "pointer",
                    transition: "all 150ms",
                  }}
                >
                  <span style={{
                    width: 24,
                    height: 24,
                    borderRadius: 9999,
                    border: sel ? "1px solid var(--accent)" : "1px solid var(--card-border)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontFamily: "var(--font-mono)",
                    fontSize: 12,
                    color: sel ? "var(--accent)" : "var(--muted-soft)",
                    flexShrink: 0,
                    marginTop: 1,
                  }}>
                    {letter}
                  </span>
                  <span style={{
                    fontFamily: sel ? "var(--font-display)" : "inherit",
                    fontSize: sel ? 15 : 14,
                    fontStyle: sel ? "italic" : "normal",
                    color: sel ? "var(--accent)" : "var(--foreground)",
                    lineHeight: 1.6,
                  }}>
                    {opt}
                  </span>
                  <input type="radio" name={q.id} checked={sel} onChange={() => {}} className="sr-only" />
                </label>
              );
            })}
          </div>
        </QCard>
      ))}

      {/* Tier 3 — Auto-scored from contradiction data */}
      {(() => {
        const conflicts = getConflicts();
        return (
          <div style={{ borderTop: "2px solid #9a5a6e", paddingTop: 20, marginTop: 24 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 12 }}>
              <span style={{ fontSize: 11, padding: "2px 8px", borderRadius: 9999, border: "1px solid #9a5a6e66", background: "#9a5a6e1a", color: "#9a5a6e" }}>第3层</span>
              <div>
                <span style={{ fontSize: 14 }}>认知盲区</span>
                <span style={{ fontSize: 12, color: "var(--muted)", marginLeft: 8 }}>自动评估（无需作答）</span>
              </div>
            </div>
            <p style={{ fontSize: 14, color: "var(--muted)", margin: "0 0 12px", lineHeight: 1.65 }}>
              盲区是你看不见的东西，自评没有意义。T3 会用认知访谈中检测到的「述行矛盾」自动比对模型预测的盲区。
            </p>
            {conflicts.length > 0 ? (
              <p style={{ fontSize: 14, color: "var(--success)", margin: "0 0 12px" }}>
                已检测到 {conflicts.length} 条矛盾数据，提交后将自动评估 {predictions.tier_3.length} 个盲区预测。
              </p>
            ) : (
              <p style={{ fontSize: 14, color: "var(--warning)", margin: "0 0 12px" }}>
                未检测到矛盾数据。建议先完成「认知访谈」积累行为证据，T3 评分会更准确。当前将以模型推理的合理性评分。
              </p>
            )}
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              {predictions.tier_3.map((q) => (
                <p key={`t3_${q.id}`} style={{ fontSize: 12, color: "var(--muted)", margin: 0, paddingLeft: 12, borderLeft: "2px solid #9a5a6e4d" }}>
                  {q.predicted_blind_spot || q.statement}
                </p>
              ))}
            </div>
          </div>
        );
      })()}

      {/* Submit */}
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 12, paddingTop: 16, paddingBottom: 32 }}>
        <button
          onClick={handleSubmit}
          disabled={answered < totalQ}
          style={{ fontSize: 14, fontWeight: 500, padding: "12px 32px", borderRadius: 9999, border: 0, cursor: "pointer", background: "var(--accent)", color: "#fff", opacity: answered < totalQ ? 0.4 : 1, transition: "opacity 200ms" }}
        >
          提交问卷
        </button>
        {answered < totalQ && (
          <p style={{ fontSize: 12, color: "var(--muted)" }}>还有 {totalQ - answered} 题未作答</p>
        )}
        {error && <p style={{ fontSize: 13, color: "var(--error)" }}>{error}</p>}
      </div>
    </div>
  );
}
