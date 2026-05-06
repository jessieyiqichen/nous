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
      <div className="text-center py-10 space-y-3">
        <div className="w-8 h-8 mx-auto border-2 border-[var(--accent)] border-t-transparent rounded-full animate-spin" />
        <p className="text-sm text-[var(--muted)]">正在生成行为预测...</p>
        <p className="text-xs text-[var(--muted)]">AI 正在分析 9 个认知维度，为每个维度生成具体行为预测</p>
      </div>
    );
  }

  // ── Render: Updating ──────────────────────────────────────

  if (phase === "updating") {
    return (
      <div className="text-center py-10 space-y-3">
        <div className="w-8 h-8 mx-auto border-2 border-green-500 border-t-transparent rounded-full animate-spin" />
        <p className="text-sm text-[var(--muted)]">正在根据你的反馈修正模型...</p>
      </div>
    );
  }

  // ── Render: Results ───────────────────────────────────────

  if (phase === "results") {
    return (
      <div className="space-y-4">
        {/* Overall accuracy */}
        <div className="bg-[var(--card)] border border-[var(--card-border)] rounded-lg p-5 text-center">
          <p className={`text-4xl font-bold ${accuracy >= 0.7 ? "text-green-400" : accuracy >= 0.4 ? "text-yellow-400" : "text-red-400"}`}>
            {(accuracy * 100).toFixed(0)}%
          </p>
          <p className="text-sm text-[var(--muted)] mt-1">整体理解准确率</p>
          <div className="flex justify-center gap-4 mt-3 text-sm">
            <span className="text-green-400">{correctCount} 正确</span>
            <span className="text-yellow-400">{partialCount} 部分对</span>
            <span className="text-red-400">{wrongCount} 不对</span>
            <span className="text-[var(--muted)]">{totalPredictions - judgedCount} 跳过</span>
          </div>
        </div>

        {/* Per-dimension accuracy */}
        <div className="bg-[var(--card)] border border-[var(--card-border)] rounded-lg p-4 space-y-3">
          <h3 className="text-sm font-medium">按维度准确率</h3>
          <div className="space-y-2">
            {dimAccuracy.filter((d) => d.total > 0).map((d) => (
              <div key={d.dimension} className="space-y-1">
                <div className="flex items-center justify-between text-sm">
                  <span>{d.dimension_zh}</span>
                  <span className={`font-mono text-xs ${d.accuracy >= 0.7 ? "text-green-400" : d.accuracy >= 0.4 ? "text-yellow-400" : "text-red-400"}`}>
                    {(d.accuracy * 100).toFixed(0)}%
                  </span>
                </div>
                <div className="h-1.5 bg-[var(--background)] rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all duration-500 ${d.accuracy >= 0.7 ? "bg-green-500" : d.accuracy >= 0.4 ? "bg-yellow-500" : "bg-red-500"}`}
                    style={{ width: `${Math.max(d.accuracy * 100, 2)}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Changes summary */}
        {changesSummary && (
          <div className="bg-green-500/5 border border-green-500/20 rounded-lg p-4 space-y-1">
            <h3 className="text-sm font-medium text-green-400">模型已修正</h3>
            <p className="text-sm text-[var(--muted)] leading-relaxed">{changesSummary}</p>
          </div>
        )}

        {/* Action buttons */}
        <div className="flex flex-wrap gap-2">
          {!correctedModel && (wrongCount > 0 || partialCount > 0) && (
            <button
              onClick={handleUpdateModel}
              className="px-4 py-2 bg-green-600 text-white text-sm font-medium rounded-lg hover:opacity-90 transition-opacity"
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
              className="px-4 py-2 border border-[var(--card-border)] text-sm rounded-lg hover:bg-white/5 transition-colors"
            >
              重新验证
            </button>
          )}
          <button
            onClick={() => onGoPredict(correctedModel || model)}
            className="px-4 py-2 bg-[var(--accent)] text-white text-sm font-medium rounded-lg hover:opacity-90 transition-opacity"
          >
            出题
          </button>
          <button
            onClick={handleDownload}
            className="px-4 py-2 border border-[var(--card-border)] text-sm rounded-lg hover:bg-white/5 transition-colors"
          >
            下载 JSON
          </button>
        </div>

        {error && (
          <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-3">
            <p className="text-sm text-red-400">{error}</p>
          </div>
        )}
      </div>
    );
  }

  // ── Render: Judging ───────────────────────────────────────

  if (phase === "judging") {
    return (
      <div className="space-y-4">
        {/* Progress bar */}
        <div className="bg-[var(--card)] border border-[var(--card-border)] rounded-lg p-3">
          <div className="flex items-center justify-between text-sm mb-2">
            <span>已判断 {judgedCount} / {totalPredictions}</span>
            <span className={`font-mono text-xs ${accuracy >= 0.7 ? "text-green-400" : accuracy >= 0.4 ? "text-yellow-400" : "text-red-400"}`}>
              {judgedCount > 0 ? `${(accuracy * 100).toFixed(0)}%` : "-"}
            </span>
          </div>
          <div className="h-1.5 bg-[var(--background)] rounded-full overflow-hidden">
            <div
              className="h-full bg-[var(--accent)] rounded-full transition-all duration-300"
              style={{ width: `${totalPredictions > 0 ? (judgedCount / totalPredictions) * 100 : 0}%` }}
            />
          </div>
        </div>

        {/* Dimension sections */}
        {predictions.map((dp) => {
          const isExpanded = expandedDims[dp.dimension] !== false;
          const dimJudgedCount = dp.predictions.filter((p) => judgments[p.id]).length;
          const dimTotal = dp.predictions.length;

          return (
            <div key={dp.dimension} className="bg-[var(--card)] border border-[var(--card-border)] rounded-lg overflow-hidden">
              <button
                onClick={() => toggleDim(dp.dimension)}
                className="w-full flex items-center justify-between p-3 hover:bg-white/5 transition-colors text-left"
              >
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium">{dp.dimension_zh}</span>
                  <span className="text-xs text-[var(--muted)]">{dp.dimension}</span>
                  <span className="text-xs px-1.5 py-0.5 rounded bg-[var(--background)]">
                    {dimJudgedCount}/{dimTotal}
                  </span>
                </div>
                <svg
                  className={`w-4 h-4 text-[var(--muted)] transition-transform ${isExpanded ? "rotate-180" : ""}`}
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>

              {isExpanded && (
                <div className="border-t border-[var(--card-border)]">
                  <div className="px-3 py-2 bg-white/[0.02]">
                    <p className="text-xs text-[var(--muted)] leading-relaxed">{dp.description}</p>
                  </div>

                  <div className="p-3 space-y-3">
                    {dp.predictions.map((pred) => {
                      const verdict = judgments[pred.id];
                      const showCorrection = verdict === "wrong" || verdict === "partial";

                      return (
                        <div
                          key={pred.id}
                          className={`border rounded-lg p-3 transition-colors ${
                            verdict === "correct"
                              ? "border-green-500/30 bg-green-500/5"
                              : verdict === "wrong"
                                ? "border-red-500/30 bg-red-500/5"
                                : verdict === "partial"
                                  ? "border-yellow-500/30 bg-yellow-500/5"
                                  : "border-[var(--card-border)]"
                          }`}
                        >
                          <div className="flex items-center justify-between mb-1.5">
                            <span className="text-xs text-[var(--muted)] font-mono">{pred.id}</span>
                            <span className="text-xs text-[var(--muted)] font-mono">{pred.confidence.toFixed(1)}</span>
                          </div>

                          <p className="text-sm leading-relaxed mb-2">{pred.statement}</p>

                          <details className="mb-2">
                            <summary className="text-xs text-[var(--muted)] cursor-pointer hover:text-white transition-colors">
                              模型推理依据
                            </summary>
                            <p className="text-xs text-[var(--muted)] mt-1 pl-3 border-l border-[var(--card-border)]">
                              {pred.reasoning}
                            </p>
                          </details>

                          <div className="flex gap-2">
                            <button
                              onClick={() => setVerdict(pred.id, "correct")}
                              className={`flex-1 py-1.5 text-sm rounded-lg transition-all ${
                                verdict === "correct"
                                  ? "bg-green-500/20 text-green-300 ring-1 ring-green-500/40"
                                  : "bg-[var(--background)] text-[var(--muted)] hover:text-green-300 hover:bg-green-500/10"
                              }`}
                            >
                              对
                            </button>
                            <button
                              onClick={() => setVerdict(pred.id, "wrong")}
                              className={`flex-1 py-1.5 text-sm rounded-lg transition-all ${
                                verdict === "wrong"
                                  ? "bg-red-500/20 text-red-300 ring-1 ring-red-500/40"
                                  : "bg-[var(--background)] text-[var(--muted)] hover:text-red-300 hover:bg-red-500/10"
                              }`}
                            >
                              不对
                            </button>
                            <button
                              onClick={() => setVerdict(pred.id, "partial")}
                              className={`flex-1 py-1.5 text-sm rounded-lg transition-all ${
                                verdict === "partial"
                                  ? "bg-yellow-500/20 text-yellow-300 ring-1 ring-yellow-500/40"
                                  : "bg-[var(--background)] text-[var(--muted)] hover:text-yellow-300 hover:bg-yellow-500/10"
                              }`}
                            >
                              部分对
                            </button>
                          </div>

                          {showCorrection && (
                            <div className="mt-2">
                              <textarea
                                value={corrections[pred.id] || ""}
                                onChange={(e) => setCorrection(pred.id, e.target.value)}
                                placeholder="实际情况是...（可选，帮助 AI 修正模型）"
                                rows={2}
                                className="w-full bg-[var(--background)] border border-[var(--card-border)] rounded-lg px-3 py-2 text-sm resize-none focus:outline-none focus:border-[var(--accent)] transition-colors"
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
        <div className="flex flex-col items-center gap-2 pt-2 pb-4">
          <div className="flex gap-2">
            {(wrongCount > 0 || partialCount > 0) && (
              <button
                onClick={handleUpdateModel}
                className="px-6 py-2.5 bg-green-600 text-white font-medium rounded-lg hover:opacity-90 transition-opacity"
              >
                用修正更新模型
              </button>
            )}
            <button
              onClick={handleViewResults}
              disabled={judgedCount === 0}
              className="px-6 py-2.5 bg-[var(--accent)] text-white font-medium rounded-lg hover:opacity-90 disabled:opacity-40 transition-opacity"
            >
              查看结果
            </button>
          </div>
          {judgedCount < totalPredictions && (
            <p className="text-xs text-[var(--muted)]">
              还有 {totalPredictions - judgedCount} 条未判断（可以跳过）
            </p>
          )}
          {error && <p className="text-sm text-red-400">{error}</p>}
        </div>
      </div>
    );
  }

  // ── Render: Not started yet (waiting for hydration) ───────

  return (
    <div className="text-center py-8">
      <p className="text-sm text-[var(--muted)]">准备验证...</p>
    </div>
  );
}

/** Clear all InlineValidator localStorage keys (for external use) */
export function clearInlineValidatorStorage() {
  Object.values(LS_KEYS).forEach((k) => localStorage.removeItem(k));
}
