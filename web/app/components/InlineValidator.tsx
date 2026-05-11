"use client";

import { useState, useEffect, useCallback, useRef } from "react";

// ── Types ─────────────────────────────────────────────────────

interface CognitiveModel {
  dimensions: Array<{
    name: string;
    description: string;
    behavioral_predictions: string[];
    confidence: string;
  }>;
  summary: string;
}

interface BehaviorPrediction {
  id: string;
  statement: string;
  reasoning: string;
  confidence: number;
}

interface DimensionPrediction {
  dimension: string;
  dimension_zh: string;
  description: string;
  predictions: BehaviorPrediction[];
}

type Verdict = "correct" | "wrong" | "partial";
type Phase = "generating" | "judging" | "updating" | "results";

interface Props {
  model: CognitiveModel;
  onModelCorrected: (correctedModel: CognitiveModel) => void;
  onGoPredict: (model: CognitiveModel) => void;
}

// ── LocalStorage helpers (nous_iv_* prefix) ──────────────────

const LS_KEYS = {
  predictions: "nous_iv_predictions",
  judgments: "nous_iv_judgments",
  corrections: "nous_iv_corrections",
  phase: "nous_iv_phase",
  correctedModel: "nous_iv_corrected",
  changesSummary: "nous_iv_changes",
  modelHash: "nous_iv_model_hash",
} as const;

function lsGet<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const v = localStorage.getItem(key);
    return v ? (JSON.parse(v) as T) : fallback;
  } catch {
    return fallback;
  }
}

function lsSet(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch { /* quota */ }
}

function lsClear() {
  Object.values(LS_KEYS).forEach((k) => localStorage.removeItem(k));
}

/** Simple hash from model summary prefix for change detection */
function modelHash(model: CognitiveModel): string {
  const s = model.summary.slice(0, 50) + model.dimensions.length;
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = ((h << 5) - h + s.charCodeAt(i)) | 0;
  }
  return String(h);
}

// ── Component ─────────────────────────────────────────────────

export default function InlineValidator({ model, onModelCorrected, onGoPredict }: Props) {
  const [phase, setPhase] = useState<Phase | null>(null);
  const [predictions, setPredictions] = useState<DimensionPrediction[]>([]);
  const [judgments, setJudgments] = useState<Record<string, Verdict>>({});
  const [corrections, setCorrections] = useState<Record<string, string>>({});
  const [correctedModel, setCorrectedModel] = useState<CognitiveModel | null>(null);
  const [changesSummary, setChangesSummary] = useState("");
  const [error, setError] = useState("");
  const [hydrated, setHydrated] = useState(false);
  const [expandedDims, setExpandedDims] = useState<Record<string, boolean>>({});

  const startedRef = useRef(false);

  // ── Hydrate & model change detection ──────────────────────

  useEffect(() => {
    const savedHash = lsGet<string>(LS_KEYS.modelHash, "");
    const currentHash = modelHash(model);

    if (savedHash && savedHash === currentHash) {
      // Restore saved state
      const savedPhase = lsGet<string>(LS_KEYS.phase, "");
      if (savedPhase === "generating" || savedPhase === "updating") {
        // Don't restore transient phases
        setPhase(null);
      } else if (savedPhase) {
        setPhase(savedPhase as Phase);
      }
      setPredictions(lsGet<DimensionPrediction[]>(LS_KEYS.predictions, []));
      setJudgments(lsGet<Record<string, Verdict>>(LS_KEYS.judgments, {}));
      setCorrections(lsGet<Record<string, string>>(LS_KEYS.corrections, {}));
      setCorrectedModel(lsGet<CognitiveModel | null>(LS_KEYS.correctedModel, null));
      setChangesSummary(lsGet<string>(LS_KEYS.changesSummary, ""));
    } else {
      // Model changed — clear old state and auto-start
      lsClear();
      lsSet(LS_KEYS.modelHash, currentHash);
    }
    setHydrated(true);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Persist state ─────────────────────────────────────────

  useEffect(() => { if (hydrated && phase) lsSet(LS_KEYS.phase, phase); }, [phase, hydrated]);
  useEffect(() => { if (hydrated) lsSet(LS_KEYS.predictions, predictions); }, [predictions, hydrated]);
  useEffect(() => { if (hydrated) lsSet(LS_KEYS.judgments, judgments); }, [judgments, hydrated]);
  useEffect(() => { if (hydrated) lsSet(LS_KEYS.corrections, corrections); }, [corrections, hydrated]);
  useEffect(() => { if (hydrated) lsSet(LS_KEYS.correctedModel, correctedModel); }, [correctedModel, hydrated]);
  useEffect(() => { if (hydrated) lsSet(LS_KEYS.changesSummary, changesSummary); }, [changesSummary, hydrated]);

  // ── Auto-start on mount if no saved state ─────────────────

  useEffect(() => {
    if (hydrated && !phase && !startedRef.current) {
      startedRef.current = true;
      generatePredictions(model);
    }
  }, [hydrated, phase]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Generate predictions ──────────────────────────────────

  const generatePredictions = useCallback(async (m: CognitiveModel) => {
    setPhase("generating");
    setError("");
    setPredictions([]);
    setJudgments({});
    setCorrections({});
    setCorrectedModel(null);
    setChangesSummary("");

    try {
      const res = await fetch("/api/validate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model: m }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);

      const preds = data.predictions as DimensionPrediction[];
      if (!preds || preds.length === 0) {
        throw new Error("未生成任何行为预测");
      }

      setPredictions(preds);
      const expanded: Record<string, boolean> = {};
      for (const dp of preds) {
        expanded[dp.dimension] = true;
      }
      setExpandedDims(expanded);
      setPhase("judging");
    } catch (err) {
      setError(err instanceof Error ? err.message : "生成行为预测失败");
      setPhase(null);
    }
  }, []);

  // ── Judgment helpers ──────────────────────────────────────

  const setVerdict = useCallback((id: string, verdict: Verdict) => {
    setJudgments((prev) => ({ ...prev, [id]: verdict }));
  }, []);

  const setCorrection = useCallback((id: string, text: string) => {
    setCorrections((prev) => ({ ...prev, [id]: text }));
  }, []);

  const toggleDim = useCallback((dim: string) => {
    setExpandedDims((prev) => ({ ...prev, [dim]: !prev[dim] }));
  }, []);

  // ── Compute stats ─────────────────────────────────────────

  const totalPredictions = predictions.reduce((sum, dp) => sum + dp.predictions.length, 0);
  const judgedCount = Object.keys(judgments).length;
  const correctCount = Object.values(judgments).filter((v) => v === "correct").length;
  const wrongCount = Object.values(judgments).filter((v) => v === "wrong").length;
  const partialCount = Object.values(judgments).filter((v) => v === "partial").length;
  const accuracy = judgedCount > 0 ? (correctCount + partialCount * 0.5) / judgedCount : 0;

  const dimAccuracy = predictions.map((dp) => {
    const dimJudged = dp.predictions.filter((p) => judgments[p.id]);
    const dimCorrect = dimJudged.filter((p) => judgments[p.id] === "correct").length;
    const dimPartial = dimJudged.filter((p) => judgments[p.id] === "partial").length;
    const total = dimJudged.length;
    return {
      dimension: dp.dimension,
      dimension_zh: dp.dimension_zh,
      accuracy: total > 0 ? (dimCorrect + dimPartial * 0.5) / total : -1,
      total,
      correct: dimCorrect,
      wrong: dimJudged.filter((p) => judgments[p.id] === "wrong").length,
      partial: dimPartial,
    };
  });

  // ── Update model with corrections ─────────────────────────

  const handleUpdateModel = useCallback(async () => {
    setPhase("updating");
    setError("");

    const judgmentList = Object.entries(judgments).map(([id, verdict]) => ({
      id,
      verdict,
      correction: corrections[id] || undefined,
    }));

    const correctionList = Object.entries(corrections)
      .filter(([, text]) => text.trim())
      .map(([id, text]) => ({ id, text }));

    try {
      const res = await fetch("/api/validate/update", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model, judgments: judgmentList, corrections: correctionList }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);

      const updated = data.corrected_model as CognitiveModel;
      setCorrectedModel(updated);
      setChangesSummary(data.changes_summary as string);
      setPhase("results");
      onModelCorrected(updated);
    } catch (err) {
      setError(err instanceof Error ? err.message : "模型更新失败");
      setPhase("judging");
    }
  }, [model, judgments, corrections, onModelCorrected]);

  const handleViewResults = useCallback(() => {
    setPhase("results");
  }, []);

  // ── Download JSON ─────────────────────────────────────────

  const handleDownload = useCallback(() => {
    const m = correctedModel || model;
    const json = JSON.stringify(m, null, 2);
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `cognitive_model_validated_${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }, [correctedModel, model]);

  // ── Render: Generating ────────────────────────────────────

  if (phase === "generating") {
    return (
      <div style={{ textAlign: "center", padding: "48px 0", display: "flex", flexDirection: "column", alignItems: "center", gap: 12 }}>
        <div style={{ width: 32, height: 32, border: "2px solid var(--accent)", borderTopColor: "transparent", borderRadius: 9999 }} className="animate-spin" />
        <p style={{ fontSize: 13, color: "var(--muted)", margin: 0 }}>正在生成行为预测</p>
        <p style={{ fontSize: 12, color: "var(--muted-soft)", margin: 0 }}>AI 正在分析 9 个认知维度</p>
      </div>
    );
  }

  // ── Render: Updating ──────────────────────────────────────

  if (phase === "updating") {
    return (
      <div style={{ textAlign: "center", padding: "48px 0", display: "flex", flexDirection: "column", alignItems: "center", gap: 12 }}>
        <div style={{ width: 32, height: 32, border: "2px solid var(--success)", borderTopColor: "transparent", borderRadius: 9999 }} className="animate-spin" />
        <p style={{ fontSize: 13, color: "var(--muted)", margin: 0 }}>正在修正模型</p>
      </div>
    );
  }

  // ── Render: Results ───────────────────────────────────────

  if (phase === "results") {
    const accColor = accuracy >= 0.7 ? "var(--success)" : accuracy >= 0.4 ? "var(--accent)" : "var(--error)";
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
        {/* Overall accuracy */}
        <div style={{ background: "var(--card)", border: "1px solid var(--card-border)", borderRadius: 12, padding: 24, textAlign: "center" }}>
          <p style={{ fontSize: 36, fontWeight: 700, color: accColor, margin: 0 }}>
            {(accuracy * 100).toFixed(0)}%
          </p>
          <p style={{ fontSize: 13, color: "var(--muted)", margin: "4px 0 0" }}>整体理解准确率</p>
          <div style={{ display: "flex", justifyContent: "center", gap: 20, marginTop: 16, fontSize: 13 }}>
            <span style={{ color: "var(--success)" }}>{correctCount} 正确</span>
            <span style={{ color: "var(--accent)" }}>{partialCount} 部分对</span>
            <span style={{ color: "var(--error)" }}>{wrongCount} 不对</span>
            <span style={{ color: "var(--muted-soft)" }}>{totalPredictions - judgedCount} 跳过</span>
          </div>
        </div>

        {/* Per-dimension accuracy */}
        <div style={{ background: "var(--card)", border: "1px solid var(--card-border)", borderRadius: 12, padding: 20, display: "flex", flexDirection: "column", gap: 12 }}>
          <h3 style={{ fontSize: 13, fontWeight: 500, color: "var(--muted)", margin: 0 }}>按维度准确率</h3>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {dimAccuracy.filter((d) => d.total > 0).map((d) => {
              const dColor = d.accuracy >= 0.7 ? "var(--success)" : d.accuracy >= 0.4 ? "var(--accent)" : "var(--error)";
              return (
                <div key={d.dimension} style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", fontSize: 13 }}>
                    <span>{d.dimension_zh}</span>
                    <span style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: dColor }}>
                      {(d.accuracy * 100).toFixed(0)}%
                    </span>
                  </div>
                  <div style={{ height: 6, background: "var(--background)", borderRadius: 9999, overflow: "hidden" }}>
                    <div
                      style={{ height: "100%", borderRadius: 9999, transition: "all 500ms", background: dColor, width: `${Math.max(d.accuracy * 100, 2)}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Changes summary */}
        {changesSummary && (
          <div style={{ background: "rgba(79,122,77,0.05)", border: "1px solid rgba(79,122,77,0.15)", borderRadius: 12, padding: 20, display: "flex", flexDirection: "column", gap: 4 }}>
            <h3 style={{ fontSize: 13, fontWeight: 500, color: "var(--success)", margin: 0 }}>模型已修正</h3>
            <p style={{ fontSize: 13, color: "var(--muted)", lineHeight: 1.65, margin: 0 }}>{changesSummary}</p>
          </div>
        )}

        {/* Action buttons */}
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          {!correctedModel && (wrongCount > 0 || partialCount > 0) && (
            <button
              onClick={handleUpdateModel}
              style={{ fontSize: 13, fontWeight: 500, padding: "10px 20px", borderRadius: 9999, border: 0, cursor: "pointer", background: "var(--success)", color: "#fff", transition: "opacity 200ms" }}
            >
              用修正更新模型
            </button>
          )}
          {correctedModel && (
            <button
              onClick={() => {
                lsClear();
                lsSet(LS_KEYS.modelHash, modelHash(correctedModel));
                startedRef.current = false;
                setPhase(null);
                generatePredictions(correctedModel);
              }}
              style={{ fontSize: 13, fontWeight: 500, padding: "9px 19px", borderRadius: 9999, border: "1px solid var(--card-border)", cursor: "pointer", background: "transparent", color: "var(--muted)", transition: "all 200ms" }}
            >
              重新验证
            </button>
          )}
          <button
            onClick={() => onGoPredict(correctedModel || model)}
            style={{ fontSize: 13, fontWeight: 500, padding: "10px 20px", borderRadius: 9999, border: 0, cursor: "pointer", background: "var(--accent)", color: "#fff", transition: "opacity 200ms" }}
          >
            出题
          </button>
          <button
            onClick={handleDownload}
            style={{ fontSize: 13, fontWeight: 500, padding: "9px 19px", borderRadius: 9999, border: "1px solid var(--card-border)", cursor: "pointer", background: "transparent", color: "var(--muted)", transition: "all 200ms" }}
          >
            下载 JSON
          </button>
        </div>

        {error && (
          <div style={{ borderRadius: 12, padding: 16, background: "rgba(168,69,58,0.05)", border: "1px solid rgba(168,69,58,0.15)" }}>
            <p style={{ fontSize: 13, color: "var(--error)", margin: 0 }}>{error}</p>
          </div>
        )}
      </div>
    );
  }

  // ── Render: Judging ───────────────────────────────────────

  if (phase === "judging") {
    const verdictStyles = (v: Verdict | undefined, target: Verdict) => {
      const active = v === target;
      const colors: Record<Verdict, string> = { correct: "var(--success)", wrong: "var(--error)", partial: "var(--accent)" };
      const c = colors[target];
      return {
        flex: 1, padding: "8px 0", fontSize: 13, borderRadius: 8, border: 0, cursor: "pointer",
        transition: "all 200ms", fontFamily: "inherit",
        background: active ? `color-mix(in srgb, ${c} 15%, transparent)` : "var(--background)",
        color: active ? c : "var(--muted)",
        boxShadow: active ? `inset 0 0 0 1px color-mix(in srgb, ${c} 30%, transparent)` : "none",
      } as const;
    };

    const predCardBorder = (v: Verdict | undefined) => {
      if (v === "correct") return "1px solid rgba(79,122,77,0.25)";
      if (v === "wrong") return "1px solid rgba(168,69,58,0.25)";
      if (v === "partial") return "1px solid rgba(138,74,42,0.25)";
      return "1px solid var(--card-border)";
    };
    const predCardBg = (v: Verdict | undefined) => {
      if (v === "correct") return "rgba(79,122,77,0.05)";
      if (v === "wrong") return "rgba(168,69,58,0.05)";
      if (v === "partial") return "var(--accent-soft)";
      return "transparent";
    };

    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
        {/* Progress bar */}
        <div style={{ background: "var(--card)", border: "1px solid var(--card-border)", borderRadius: 12, padding: 16 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", fontSize: 13, marginBottom: 8 }}>
            <span style={{ color: "var(--muted)" }}>已判断 {judgedCount} / {totalPredictions}</span>
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: judgedCount > 0 ? (accuracy >= 0.7 ? "var(--success)" : accuracy >= 0.4 ? "var(--accent)" : "var(--error)") : "var(--muted-soft)" }}>
              {judgedCount > 0 ? `${(accuracy * 100).toFixed(0)}%` : "-"}
            </span>
          </div>
          <div style={{ height: 6, background: "var(--background)", borderRadius: 9999, overflow: "hidden" }}>
            <div
              style={{ height: "100%", background: "var(--accent)", borderRadius: 9999, transition: "all 300ms", width: `${totalPredictions > 0 ? (judgedCount / totalPredictions) * 100 : 0}%` }}
            />
          </div>
        </div>

        {/* Dimension sections */}
        {predictions.map((dp) => {
          const isExpanded = expandedDims[dp.dimension] !== false;
          const dimJudgedCount = dp.predictions.filter((p) => judgments[p.id]).length;
          const dimTotal = dp.predictions.length;

          return (
            <div key={dp.dimension} style={{ background: "var(--card)", border: "1px solid var(--card-border)", borderRadius: 12, overflow: "hidden" }}>
              <button
                onClick={() => toggleDim(dp.dimension)}
                style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between", padding: 16, background: "transparent", border: 0, cursor: "pointer", fontFamily: "inherit", textAlign: "left", transition: "background 200ms" }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <span style={{ fontSize: 13, fontWeight: 500 }}>{dp.dimension_zh}</span>
                  <span style={{ fontSize: 11, fontWeight: 500, padding: "3px 9px", borderRadius: 9999, background: "var(--background)", color: "var(--muted)" }}>
                    {dimJudgedCount}/{dimTotal}
                  </span>
                </div>
                <svg
                  width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="var(--muted-soft)" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"
                  style={{ transition: "transform 200ms", transform: isExpanded ? "rotate(180deg)" : "rotate(0deg)" }}
                >
                  <path d="M19 9l-7 7-7-7" />
                </svg>
              </button>

              {isExpanded && (
                <div style={{ borderTop: "1px solid var(--card-border)" }}>
                  <div style={{ padding: "10px 16px", background: "rgba(255,255,255,0.01)" }}>
                    <p style={{ fontSize: 12, color: "var(--muted-soft)", lineHeight: 1.65, margin: 0 }}>{dp.description}</p>
                  </div>

                  <div style={{ padding: 16, display: "flex", flexDirection: "column", gap: 12 }}>
                    {dp.predictions.map((pred) => {
                      const verdict = judgments[pred.id];
                      const showCorrection = verdict === "wrong" || verdict === "partial";

                      return (
                        <div
                          key={pred.id}
                          style={{ border: predCardBorder(verdict), borderRadius: 12, padding: 16, background: predCardBg(verdict), transition: "all 200ms" }}
                        >
                          <p style={{ fontSize: 13, lineHeight: 1.65, margin: "0 0 12px" }}>{pred.statement}</p>

                          <details style={{ marginBottom: 12 }}>
                            <summary style={{ fontSize: 12, color: "var(--muted-soft)", cursor: "pointer", transition: "color 200ms" }}>
                              推理依据
                            </summary>
                            <p style={{ fontSize: 12, color: "var(--muted-soft)", marginTop: 6, paddingLeft: 12, borderLeft: "2px solid var(--card-border)", margin: "6px 0 0" }}>
                              {pred.reasoning}
                            </p>
                          </details>

                          <div style={{ display: "flex", gap: 8 }}>
                            <button onClick={() => setVerdict(pred.id, "correct")} style={verdictStyles(verdict, "correct")}>
                              对
                            </button>
                            <button onClick={() => setVerdict(pred.id, "wrong")} style={verdictStyles(verdict, "wrong")}>
                              不对
                            </button>
                            <button onClick={() => setVerdict(pred.id, "partial")} style={verdictStyles(verdict, "partial")}>
                              部分对
                            </button>
                          </div>

                          {showCorrection && (
                            <div style={{ marginTop: 12 }}>
                              <textarea
                                value={corrections[pred.id] || ""}
                                onChange={(e) => setCorrection(pred.id, e.target.value)}
                                placeholder="实际情况是...（可选）"
                                rows={2}
                                style={{ width: "100%", background: "var(--background)", border: "1px solid var(--card-border)", borderRadius: 12, padding: "10px 12px", fontSize: 13, resize: "none", outline: "none", fontFamily: "inherit", color: "var(--foreground)", transition: "border-color 200ms", boxSizing: "border-box" }}
                              />
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          );
        })}

        {/* Bottom actions */}
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 12, padding: "8px 0 16px" }}>
          <div style={{ display: "flex", gap: 8 }}>
            {(wrongCount > 0 || partialCount > 0) && (
              <button
                onClick={handleUpdateModel}
                style={{ fontSize: 13, fontWeight: 500, padding: "10px 20px", borderRadius: 9999, border: 0, cursor: "pointer", background: "var(--success)", color: "#fff", transition: "opacity 200ms" }}
              >
                用修正更新模型
              </button>
            )}
            <button
              onClick={handleViewResults}
              disabled={judgedCount === 0}
              style={{ fontSize: 13, fontWeight: 500, padding: "10px 20px", borderRadius: 9999, border: 0, cursor: "pointer", background: "var(--accent)", color: "#fff", opacity: judgedCount === 0 ? 0.4 : 1, transition: "opacity 200ms" }}
            >
              查看结果
            </button>
          </div>
          {judgedCount < totalPredictions && (
            <p style={{ fontSize: 12, color: "var(--muted-soft)", margin: 0 }}>
              还有 {totalPredictions - judgedCount} 条未判断（可以跳过）
            </p>
          )}
          {error && <p style={{ fontSize: 13, color: "var(--error)", margin: 0 }}>{error}</p>}
        </div>
      </div>
    );
  }

  // ── Render: Not started yet (waiting for hydration) ───────

  return (
    <div style={{ textAlign: "center", padding: "40px 0" }}>
      <p style={{ fontSize: 13, color: "var(--muted-soft)", margin: 0 }}>准备验证...</p>
    </div>
  );
}

/** Clear all InlineValidator localStorage keys (for external use) */
export function clearInlineValidatorStorage() {
  Object.values(LS_KEYS).forEach((k) => localStorage.removeItem(k));
}
