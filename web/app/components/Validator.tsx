"use client";

import { useState, useRef, useEffect, useCallback } from "react";

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

interface Judgment {
  id: string;
  verdict: Verdict;
  correction?: string;
}

interface ConflictItem {
  entryIndex: number;
  conflictIndex: number;
  source: string;
  timestamp: string;
  conflict: {
    stated_claim: string;
    actual_behavior: string;
    blind_spot_evidence: string;
    confidence: number;
  };
  review?: "valid" | "invalid" | "uncertain";
}

type Phase = "input" | "generating" | "judging" | "updating" | "results" | "conflicts";

interface Props {
  validateModel?: CognitiveModel | null;
  onValidateModelConsumed?: () => void;
  onModelUpdated?: (model: CognitiveModel) => void;
  onGoPredict?: (model: CognitiveModel) => void;
}

// ── LocalStorage helpers ──────────────────────────────────────

const LS_KEYS = {
  predictions: "nous_validate_predictions",
  judgments: "nous_validate_judgments",
  corrections: "nous_validate_corrections",
  phase: "nous_validate_phase",
  model: "nous_validate_model",
  correctedModel: "nous_validate_corrected",
  changesSummary: "nous_validate_changes",
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

// ── Component ─────────────────────────────────────────────────

export default function Validator({
  validateModel,
  onValidateModelConsumed,
  onModelUpdated,
  onGoPredict,
}: Props) {
  const [phase, setPhase] = useState<Phase>("input");
  const [model, setModel] = useState<CognitiveModel | null>(null);
  const [predictions, setPredictions] = useState<DimensionPrediction[]>([]);
  const [judgments, setJudgments] = useState<Record<string, Verdict>>({});
  const [corrections, setCorrections] = useState<Record<string, string>>({});
  const [correctedModel, setCorrectedModel] = useState<CognitiveModel | null>(null);
  const [changesSummary, setChangesSummary] = useState("");
  const [error, setError] = useState("");
  const [hydrated, setHydrated] = useState(false);

  // Input mode state
  const [inputMode, setInputMode] = useState<"text" | "model">("model");
  const [modelJson, setModelJson] = useState("");
  const [modelFileName, setModelFileName] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Expanded dimension sections
  const [expandedDims, setExpandedDims] = useState<Record<string, boolean>>({});

  // Consumed ref to prevent double-trigger
  const consumedRef = useRef(false);

  // Hydrate from localStorage
  useEffect(() => {
    const savedPhase = lsGet<string>(LS_KEYS.phase, "input");
    // Don't restore generating/updating phases
    setPhase(
      savedPhase === "generating" || savedPhase === "updating"
        ? "input"
        : (savedPhase as Phase),
    );
    setModel(lsGet<CognitiveModel | null>(LS_KEYS.model, null));
    setPredictions(lsGet<DimensionPrediction[]>(LS_KEYS.predictions, []));
    setJudgments(lsGet<Record<string, Verdict>>(LS_KEYS.judgments, {}));
    setCorrections(lsGet<Record<string, string>>(LS_KEYS.corrections, {}));
    setCorrectedModel(lsGet<CognitiveModel | null>(LS_KEYS.correctedModel, null));
    setChangesSummary(lsGet<string>(LS_KEYS.changesSummary, ""));
    setHydrated(true);
  }, []);

  // Persist state
  useEffect(() => { if (hydrated) lsSet(LS_KEYS.phase, phase); }, [phase, hydrated]);
  useEffect(() => { if (hydrated) lsSet(LS_KEYS.model, model); }, [model, hydrated]);
  useEffect(() => { if (hydrated) lsSet(LS_KEYS.predictions, predictions); }, [predictions, hydrated]);
  useEffect(() => { if (hydrated) lsSet(LS_KEYS.judgments, judgments); }, [judgments, hydrated]);
  useEffect(() => { if (hydrated) lsSet(LS_KEYS.corrections, corrections); }, [corrections, hydrated]);
  useEffect(() => { if (hydrated) lsSet(LS_KEYS.correctedModel, correctedModel); }, [correctedModel, hydrated]);
  useEffect(() => { if (hydrated) lsSet(LS_KEYS.changesSummary, changesSummary); }, [changesSummary, hydrated]);

  // Handle incoming model from Interview tab
  useEffect(() => {
    if (validateModel && !consumedRef.current) {
      consumedRef.current = true;
      onValidateModelConsumed?.();
      setModel(validateModel);
      setError("");
      generatePredictions(validateModel);
    }
  }, [validateModel, onValidateModelConsumed]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Generate predictions ────────────────────────────────────

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
      // Expand all dimensions by default
      const expanded: Record<string, boolean> = {};
      for (const dp of preds) {
        expanded[dp.dimension] = true;
      }
      setExpandedDims(expanded);
      setPhase("judging");
    } catch (err) {
      setError(err instanceof Error ? err.message : "生成行为预测失败");
      setPhase("input");
    } finally {
      consumedRef.current = false;
    }
  }, []);

  // ── Import model from JSON ──────────────────────────────────

  const handleImportModel = useCallback(() => {
    let parsed: CognitiveModel;
    try {
      parsed = JSON.parse(modelJson);
      if (!parsed.dimensions || !parsed.summary) {
        throw new Error("缺少 dimensions 或 summary 字段");
      }
    } catch (e) {
      setError(e instanceof Error ? `JSON 解析失败: ${e.message}` : "JSON 格式错误");
      return;
    }
    setModel(parsed);
    generatePredictions(parsed);
  }, [modelJson, generatePredictions]);

  // ── File upload handler ─────────────────────────────────────

  const handleFileSelect = useCallback((file: File) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;
      setModelJson(text);
      setModelFileName(file.name);
      setError("");
    };
    reader.readAsText(file);
  }, []);

  // ── Judgment helpers ────────────────────────────────────────

  const setVerdict = useCallback((id: string, verdict: Verdict) => {
    setJudgments((prev) => ({ ...prev, [id]: verdict }));
  }, []);

  const setCorrection = useCallback((id: string, text: string) => {
    setCorrections((prev) => ({ ...prev, [id]: text }));
  }, []);

  const toggleDim = useCallback((dim: string) => {
    setExpandedDims((prev) => ({ ...prev, [dim]: !prev[dim] }));
  }, []);

  // ── Compute stats ───────────────────────────────────────────

  const totalPredictions = predictions.reduce((sum, dp) => sum + dp.predictions.length, 0);
  const judgedCount = Object.keys(judgments).length;
  const correctCount = Object.values(judgments).filter((v) => v === "correct").length;
  const wrongCount = Object.values(judgments).filter((v) => v === "wrong").length;
  const partialCount = Object.values(judgments).filter((v) => v === "partial").length;
  const accuracy = judgedCount > 0 ? (correctCount + partialCount * 0.5) / judgedCount : 0;

  // Per-dimension accuracy
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

  // ── Submit corrections to update model ──────────────────────

  const handleUpdateModel = useCallback(async () => {
    if (!model) return;
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

      setCorrectedModel(data.corrected_model as CognitiveModel);
      setChangesSummary(data.changes_summary as string);
      setPhase("results");
    } catch (err) {
      setError(err instanceof Error ? err.message : "模型更新失败");
      setPhase("judging");
    }
  }, [model, judgments, corrections]);

  // ── Go to results without updating ──────────────────────────

  const handleViewResults = useCallback(() => {
    setPhase("results");
  }, []);

  // ── Reset ───────────────────────────────────────────────────

  const reset = useCallback(() => {
    lsClear();
    setPhase("input");
    setModel(null);
    setPredictions([]);
    setJudgments({});
    setCorrections({});
    setCorrectedModel(null);
    setChangesSummary("");
    setError("");
    setModelJson("");
    setModelFileName("");
  }, []);

  // ── Conflict review state & handlers ────────────────────────

  const [conflicts, setConflicts] = useState<ConflictItem[]>([]);
  const [conflictVerdicts, setConflictVerdicts] = useState<Record<string, "valid" | "invalid" | "uncertain">>({});
  const [conflictCount, setConflictCount] = useState(0);
  const [conflictsLoading, setConflictsLoading] = useState(false);
  const [conflictsSaving, setConflictsSaving] = useState(false);

  const loadConflicts = useCallback(async () => {
    setConflictsLoading(true);
    try {
      const res = await fetch("/api/conflicts");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setConflicts(data.conflicts || []);
      setConflictCount(data.unreviewed || 0);
    } catch {
      setConflicts([]);
      setConflictCount(0);
    } finally {
      setConflictsLoading(false);
    }
  }, []);

  // Load conflict count on mount
  useEffect(() => {
    if (hydrated) loadConflicts();
  }, [hydrated, loadConflicts]);

  const submitConflictReviews = useCallback(async () => {
    const reviews = Object.entries(conflictVerdicts).map(([key, verdict]) => {
      const [ei, ci] = key.split("-").map(Number);
      return { entryIndex: ei, conflictIndex: ci, verdict };
    });
    if (reviews.length === 0) return;

    setConflictsSaving(true);
    try {
      const res = await fetch("/api/conflicts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reviews }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setConflictVerdicts({});
      await loadConflicts();
      setPhase("input");
    } catch (err) {
      setError(err instanceof Error ? err.message : "提交失败");
    } finally {
      setConflictsSaving(false);
    }
  }, [conflictVerdicts, loadConflicts]);

  // ── Render: Input phase ─────────────────────────────────────

  if (phase === "input") {
    return (
      <div className="max-w-2xl mx-auto space-y-6 pt-4">
        <div className="text-center space-y-2">
          <h2 className="text-xl font-bold">模型验证</h2>
          <p className="text-sm text-[var(--muted)]">
            验证认知模型对你的理解是否准确。AI 会基于模型生成具体行为预测，你逐条判断对不对。
          </p>
        </div>

        {/* Conflict review entry */}
        {conflictCount > 0 && (
          <div className="bg-orange-500/5 border border-orange-500/30 rounded-lg p-5 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-lg">&#9888;&#65039;</span>
                <h3 className="text-sm font-medium text-orange-300">
                  {conflictCount} 条新矛盾待 Review
                </h3>
              </div>
              <span className="text-xs text-[var(--muted)]">来自被动采集</span>
            </div>
            <p className="text-xs text-[var(--muted)]">
              被动信号采集发现了新的「自述 vs 实际行为」矛盾。请判断这些矛盾是否有效，有效的将用于改进模型。
            </p>
            <button
              onClick={() => setPhase("conflicts")}
              className="px-4 py-2 bg-orange-600 text-white text-sm font-medium rounded-lg hover:opacity-90 transition-opacity"
            >
              开始 Review
            </button>
          </div>
        )}

        {/* Saved state recovery */}
        {predictions.length > 0 && (
          <div className="bg-[var(--card)] border border-[var(--accent)]/30 rounded-lg p-5 space-y-3">
            <h3 className="text-sm font-medium">检测到已有验证数据</h3>
            <p className="text-xs text-[var(--muted)]">
              {predictions.length} 个维度，共 {totalPredictions} 条预测，已判断 {judgedCount} 条
            </p>
            <div className="flex flex-wrap gap-3">
              <button
                onClick={() => setPhase("judging")}
                className="px-4 py-2 bg-[var(--accent)] text-white text-sm font-medium rounded-lg hover:opacity-90 transition-opacity"
              >
                继续验证
              </button>
              <button
                onClick={reset}
                className="px-4 py-2 text-sm text-[var(--muted)] hover:text-white transition-colors"
              >
                重新开始
              </button>
            </div>
          </div>
        )}

        <div className="bg-[var(--card)] border border-[var(--card-border)] rounded-lg p-5 space-y-4">
          {/* Mode tabs */}
          <div className="flex gap-1 bg-[var(--background)] rounded-lg p-1">
            <button
              onClick={() => setInputMode("model")}
              className={`flex-1 text-sm py-1.5 rounded-md transition-colors ${inputMode === "model" ? "bg-[var(--card)] font-medium" : "text-[var(--muted)] hover:text-white"}`}
            >
              导入认知模型
            </button>
            <button
              onClick={() => setInputMode("text")}
              className={`flex-1 text-sm py-1.5 rounded-md transition-colors ${inputMode === "text" ? "bg-[var(--card)] font-medium" : "text-[var(--muted)] hover:text-white"}`}
            >
              粘贴 JSON
            </button>
          </div>

          {inputMode === "model" ? (
            <>
              <p className="text-xs text-[var(--muted)]">
                上传 cognitive_model JSON 文件，或从「认知访谈」tab 点击「验证模型理解」自动导入。
              </p>
              <div
                className="border-2 border-dashed border-[var(--card-border)] rounded-lg p-8 text-center hover:border-[var(--accent)]/50 transition-colors cursor-pointer"
                onClick={() => fileInputRef.current?.click()}
                onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); }}
                onDrop={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  const file = e.dataTransfer.files[0];
                  if (file) handleFileSelect(file);
                }}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".json"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) handleFileSelect(file);
                  }}
                />
                {modelJson ? (
                  <div className="space-y-2">
                    <p className="text-sm font-medium text-green-400">已加载模型</p>
                    <p className="text-xs text-[var(--muted)]">{modelFileName}</p>
                    <p className="text-xs text-[var(--muted)]">点击重新选择文件</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <div className="w-10 h-10 mx-auto rounded-full bg-[var(--accent)]/10 flex items-center justify-center">
                      <svg className="w-5 h-5 text-[var(--accent)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                      </svg>
                    </div>
                    <p className="text-sm">点击选择文件或拖拽到这里</p>
                    <p className="text-xs text-[var(--muted)]">支持 .json 格式</p>
                  </div>
                )}
              </div>
              {modelJson && (
                <div className="flex justify-end">
                  <button
                    onClick={handleImportModel}
                    className="px-6 py-2.5 bg-[var(--accent)] text-white font-medium rounded-lg hover:opacity-90 transition-opacity"
                  >
                    开始验证
                  </button>
                </div>
              )}
            </>
          ) : (
            <>
              <textarea
                value={modelJson}
                onChange={(e) => setModelJson(e.target.value)}
                placeholder='粘贴 cognitive_model JSON...\n\n{\n  "dimensions": [...],\n  "summary": "..."\n}'
                rows={10}
                className="w-full bg-[var(--background)] border border-[var(--card-border)] rounded-lg p-4 text-sm resize-y focus:outline-none focus:border-[var(--accent)] transition-colors font-mono leading-relaxed"
              />
              <div className="flex justify-end">
                <button
                  onClick={handleImportModel}
                  disabled={!modelJson.trim()}
                  className="px-6 py-2.5 bg-[var(--accent)] text-white font-medium rounded-lg hover:opacity-90 disabled:opacity-40 transition-opacity"
                >
                  开始验证
                </button>
              </div>
            </>
          )}
        </div>

        {error && (
          <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-4">
            <p className="text-sm text-red-400">{error}</p>
          </div>
        )}

        <div className="bg-[var(--card)] border border-[var(--card-border)] rounded-lg p-5 space-y-3">
          <h3 className="text-sm font-medium">验证流程</h3>
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
            {[
              { step: "1", label: "导入模型", desc: "访谈或上传" },
              { step: "2", label: "AI 生成预测", desc: "~15 秒" },
              { step: "3", label: "逐条判断", desc: "对/不对/部分对" },
              { step: "4", label: "查看结果", desc: "准确率 + 修正" },
            ].map((s) => (
              <div key={s.step} className="text-center space-y-1">
                <div className="w-8 h-8 mx-auto rounded-full bg-[var(--accent)]/20 flex items-center justify-center text-sm font-bold text-[var(--accent)]">
                  {s.step}
                </div>
                <p className="text-sm font-medium">{s.label}</p>
                <p className="text-xs text-[var(--muted)]">{s.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  // ── Render: Generating phase ────────────────────────────────

  if (phase === "generating") {
    return (
      <div className="max-w-md mx-auto text-center py-20 space-y-4">
        <div className="w-10 h-10 mx-auto border-2 border-[var(--accent)] border-t-transparent rounded-full animate-spin" />
        <p className="text-sm text-[var(--muted)]">正在生成行为预测...</p>
        <p className="text-xs text-[var(--muted)]">AI 正在分析 9 个认知维度，为每个维度生成 3-5 条具体行为预测</p>
      </div>
    );
  }

  // ── Render: Conflict review phase ──────────────────────────

  if (phase === "conflicts") {
    const reviewedCount = Object.keys(conflictVerdicts).length;
    return (
      <div className="max-w-3xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xl font-bold">矛盾 Review</h2>
            <p className="text-sm text-[var(--muted)] mt-1">
              被动采集发现的「自述 vs 实际行为」矛盾。判断是否有效。
            </p>
          </div>
          <button
            onClick={() => setPhase("input")}
            className="text-sm text-[var(--muted)] hover:text-white transition-colors"
          >
            返回
          </button>
        </div>

        {/* Progress */}
        <div className="bg-[var(--card)] border border-[var(--card-border)] rounded-lg p-4">
          <div className="flex items-center justify-between text-sm mb-2">
            <span>已判断 {reviewedCount} / {conflicts.length}</span>
          </div>
          <div className="h-2 bg-[var(--background)] rounded-full overflow-hidden">
            <div
              className="h-full bg-orange-500 rounded-full transition-all duration-300"
              style={{ width: `${conflicts.length > 0 ? (reviewedCount / conflicts.length) * 100 : 0}%` }}
            />
          </div>
        </div>

        {conflictsLoading ? (
          <div className="text-center py-10">
            <div className="w-8 h-8 mx-auto border-2 border-orange-500 border-t-transparent rounded-full animate-spin" />
            <p className="text-sm text-[var(--muted)] mt-3">加载矛盾数据...</p>
          </div>
        ) : conflicts.length === 0 ? (
          <div className="text-center py-10">
            <p className="text-sm text-[var(--muted)]">没有待 review 的矛盾</p>
          </div>
        ) : (
          <div className="space-y-4">
            {conflicts.map((item) => {
              const key = `${item.entryIndex}-${item.conflictIndex}`;
              const verdict = conflictVerdicts[key];
              return (
                <div
                  key={key}
                  className={`bg-[var(--card)] border rounded-lg p-5 space-y-3 transition-colors ${
                    verdict === "valid"
                      ? "border-green-500/30"
                      : verdict === "invalid"
                        ? "border-red-500/30"
                        : verdict === "uncertain"
                          ? "border-yellow-500/30"
                          : "border-[var(--card-border)]"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-[var(--muted)] font-mono">
                      {item.source.replace("passive:", "")}
                    </span>
                    <span className="text-xs text-[var(--muted)]">
                      置信度 {(item.conflict.confidence * 100).toFixed(0)}%
                    </span>
                  </div>

                  <div className="space-y-2">
                    <div className="flex gap-2">
                      <span className="text-xs px-1.5 py-0.5 rounded bg-blue-500/20 text-blue-300 shrink-0">自述</span>
                      <p className="text-sm">{item.conflict.stated_claim}</p>
                    </div>
                    <div className="flex gap-2">
                      <span className="text-xs px-1.5 py-0.5 rounded bg-orange-500/20 text-orange-300 shrink-0">实际</span>
                      <p className="text-sm">{item.conflict.actual_behavior}</p>
                    </div>
                    <div className="flex gap-2">
                      <span className="text-xs px-1.5 py-0.5 rounded bg-purple-500/20 text-purple-300 shrink-0">盲区</span>
                      <p className="text-sm text-[var(--muted)]">{item.conflict.blind_spot_evidence}</p>
                    </div>
                  </div>

                  <div className="flex gap-2 pt-1">
                    <button
                      onClick={() => setConflictVerdicts((prev) => ({ ...prev, [key]: "valid" }))}
                      className={`flex-1 py-2 text-sm rounded-lg transition-all ${
                        verdict === "valid"
                          ? "bg-green-500/20 text-green-300 ring-1 ring-green-500/40"
                          : "bg-[var(--background)] text-[var(--muted)] hover:text-green-300 hover:bg-green-500/10"
                      }`}
                    >
                      有效
                    </button>
                    <button
                      onClick={() => setConflictVerdicts((prev) => ({ ...prev, [key]: "invalid" }))}
                      className={`flex-1 py-2 text-sm rounded-lg transition-all ${
                        verdict === "invalid"
                          ? "bg-red-500/20 text-red-300 ring-1 ring-red-500/40"
                          : "bg-[var(--background)] text-[var(--muted)] hover:text-red-300 hover:bg-red-500/10"
                      }`}
                    >
                      无效
                    </button>
                    <button
                      onClick={() => setConflictVerdicts((prev) => ({ ...prev, [key]: "uncertain" }))}
                      className={`flex-1 py-2 text-sm rounded-lg transition-all ${
                        verdict === "uncertain"
                          ? "bg-yellow-500/20 text-yellow-300 ring-1 ring-yellow-500/40"
                          : "bg-[var(--background)] text-[var(--muted)] hover:text-yellow-300 hover:bg-yellow-500/10"
                      }`}
                    >
                      不确定
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Submit */}
        <div className="flex justify-center gap-3 pt-4 pb-8">
          <button
            onClick={submitConflictReviews}
            disabled={reviewedCount === 0 || conflictsSaving}
            className="px-8 py-3 bg-orange-600 text-white font-medium rounded-lg hover:opacity-90 disabled:opacity-40 transition-opacity"
          >
            {conflictsSaving ? "提交中..." : `提交 Review (${reviewedCount})`}
          </button>
        </div>

        {error && (
          <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-4">
            <p className="text-sm text-red-400">{error}</p>
          </div>
        )}
      </div>
    );
  }

  // ── Render: Updating phase ──────────────────────────────────

  if (phase === "updating") {
    return (
      <div className="max-w-md mx-auto text-center py-20 space-y-4">
        <div className="w-10 h-10 mx-auto border-2 border-green-500 border-t-transparent rounded-full animate-spin" />
        <p className="text-sm text-[var(--muted)]">正在根据你的反馈修正模型...</p>
        <p className="text-xs text-[var(--muted)]">只修正有误判证据的维度，保留准确的部分</p>
      </div>
    );
  }

  // ── Render: Results phase ───────────────────────────────────

  if (phase === "results") {
    return (
      <div className="max-w-3xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-bold">验证结果</h2>
          <button onClick={reset} className="text-sm text-[var(--muted)] hover:text-white transition-colors">
            重新验证
          </button>
        </div>

        {/* Overall accuracy */}
        <div className="bg-[var(--card)] border border-[var(--card-border)] rounded-lg p-6 text-center">
          <p className={`text-5xl font-bold ${accuracy >= 0.7 ? "text-green-400" : accuracy >= 0.4 ? "text-yellow-400" : "text-red-400"}`}>
            {(accuracy * 100).toFixed(0)}%
          </p>
          <p className="text-sm text-[var(--muted)] mt-2">整体理解准确率</p>
          <div className="flex justify-center gap-6 mt-4 text-sm">
            <span className="text-green-400">{correctCount} 正确</span>
            <span className="text-yellow-400">{partialCount} 部分对</span>
            <span className="text-red-400">{wrongCount} 不对</span>
            <span className="text-[var(--muted)]">{totalPredictions - judgedCount} 跳过</span>
          </div>
        </div>

        {/* Per-dimension accuracy */}
        <div className="bg-[var(--card)] border border-[var(--card-border)] rounded-lg p-5 space-y-4">
          <h3 className="text-sm font-medium">按维度准确率</h3>
          <div className="space-y-3">
            {dimAccuracy.filter((d) => d.total > 0).map((d) => (
              <div key={d.dimension} className="space-y-1">
                <div className="flex items-center justify-between text-sm">
                  <span>{d.dimension_zh}</span>
                  <span className={`font-mono ${d.accuracy >= 0.7 ? "text-green-400" : d.accuracy >= 0.4 ? "text-yellow-400" : "text-red-400"}`}>
                    {(d.accuracy * 100).toFixed(0)}%
                  </span>
                </div>
                <div className="h-2 bg-[var(--background)] rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all duration-500 ${d.accuracy >= 0.7 ? "bg-green-500" : d.accuracy >= 0.4 ? "bg-yellow-500" : "bg-red-500"}`}
                    style={{ width: `${Math.max(d.accuracy * 100, 2)}%` }}
                  />
                </div>
                <p className="text-xs text-[var(--muted)]">
                  {d.correct} 正确 / {d.partial} 部分对 / {d.wrong} 不对（共 {d.total} 条）
                </p>
              </div>
            ))}
          </div>
        </div>

        {/* Corrections summary */}
        {(wrongCount > 0 || partialCount > 0) && (
          <div className="bg-[var(--card)] border border-[var(--card-border)] rounded-lg p-5 space-y-3">
            <h3 className="text-sm font-medium">修正汇总</h3>
            <div className="space-y-2">
              {predictions.flatMap((dp) =>
                dp.predictions
                  .filter((p) => judgments[p.id] === "wrong" || judgments[p.id] === "partial")
                  .map((p) => (
                    <div key={p.id} className="border-b border-[var(--card-border)] pb-2 last:border-b-0 last:pb-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className={`text-xs px-1.5 py-0.5 rounded ${judgments[p.id] === "wrong" ? "bg-red-500/20 text-red-300" : "bg-yellow-500/20 text-yellow-300"}`}>
                          {judgments[p.id] === "wrong" ? "不对" : "部分对"}
                        </span>
                        <span className="text-xs text-[var(--muted)]">{p.id}</span>
                      </div>
                      <p className="text-sm text-[var(--muted)]">{p.statement}</p>
                      {corrections[p.id] && (
                        <p className="text-sm text-green-400 mt-1">实际：{corrections[p.id]}</p>
                      )}
                    </div>
                  )),
              )}
            </div>
          </div>
        )}

        {/* Changes summary from model update */}
        {changesSummary && (
          <div className="bg-green-500/5 border border-green-500/20 rounded-lg p-5 space-y-2">
            <h3 className="text-sm font-medium text-green-400">模型已修正</h3>
            <p className="text-sm text-[var(--muted)] leading-relaxed">{changesSummary}</p>
          </div>
        )}

        {/* Action buttons */}
        <div className="flex flex-wrap gap-3">
          {!correctedModel && (wrongCount > 0 || partialCount > 0) && (
            <button
              onClick={handleUpdateModel}
              className="px-5 py-2.5 bg-green-600 text-white text-sm font-medium rounded-lg hover:opacity-90 transition-opacity"
            >
              用修正更新模型
            </button>
          )}
          {onGoPredict && (correctedModel || model) && (
            <button
              onClick={() => onGoPredict(correctedModel || model!)}
              className="px-5 py-2.5 bg-[var(--accent)] text-white text-sm font-medium rounded-lg hover:opacity-90 transition-opacity"
            >
              用这个模型出题
            </button>
          )}
          {correctedModel && (
            <button
              onClick={() => {
                setModel(correctedModel);
                generatePredictions(correctedModel);
              }}
              className="px-5 py-2.5 border border-[var(--card-border)] text-sm rounded-lg hover:bg-white/5 transition-colors"
            >
              用修正后的模型重新验证
            </button>
          )}
          <button
            onClick={() => {
              const m = correctedModel || model;
              if (!m) return;
              const json = JSON.stringify(m, null, 2);
              const blob = new Blob([json], { type: "application/json" });
              const url = URL.createObjectURL(blob);
              const a = document.createElement("a");
              a.href = url;
              a.download = `cognitive_model_validated_${new Date().toISOString().slice(0, 10)}.json`;
              a.click();
              URL.revokeObjectURL(url);
            }}
            className="px-5 py-2.5 border border-[var(--card-border)] text-sm rounded-lg hover:bg-white/5 transition-colors"
          >
            下载模型 JSON
          </button>
        </div>

        {error && (
          <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-4">
            <p className="text-sm text-red-400">{error}</p>
          </div>
        )}
      </div>
    );
  }

  // ── Render: Judging phase ───────────────────────────────────

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold">判断行为预测</h2>
          <p className="text-sm text-[var(--muted)] mt-1">
            逐条判断 AI 基于你的认知模型做出的行为预测是否准确
          </p>
        </div>
        <button
          onClick={reset}
          className="text-sm text-[var(--muted)] hover:text-white transition-colors"
        >
          重新开始
        </button>
      </div>

      {/* Progress bar */}
      <div className="bg-[var(--card)] border border-[var(--card-border)] rounded-lg p-4">
        <div className="flex items-center justify-between text-sm mb-2">
          <span>已判断 {judgedCount} / {totalPredictions}</span>
          <span className={`font-mono ${accuracy >= 0.7 ? "text-green-400" : accuracy >= 0.4 ? "text-yellow-400" : "text-red-400"}`}>
            {judgedCount > 0 ? `${(accuracy * 100).toFixed(0)}%` : "-"}
          </span>
        </div>
        <div className="h-2 bg-[var(--background)] rounded-full overflow-hidden">
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
            {/* Dimension header */}
            <button
              onClick={() => toggleDim(dp.dimension)}
              className="w-full flex items-center justify-between p-4 hover:bg-white/5 transition-colors text-left"
            >
              <div className="flex items-center gap-3">
                <span className="text-sm font-medium">{dp.dimension_zh}</span>
                <span className="text-xs text-[var(--muted)]">{dp.dimension}</span>
                <span className="text-xs px-2 py-0.5 rounded bg-[var(--background)]">
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
                {/* Model description */}
                <div className="px-4 py-3 bg-white/[0.02]">
                  <p className="text-xs text-[var(--muted)] leading-relaxed">{dp.description}</p>
                </div>

                {/* Prediction cards */}
                <div className="p-4 space-y-4">
                  {dp.predictions.map((pred) => {
                    const verdict = judgments[pred.id];
                    const showCorrection = verdict === "wrong" || verdict === "partial";

                    return (
                      <div
                        key={pred.id}
                        className={`border rounded-lg p-4 transition-colors ${
                          verdict === "correct"
                            ? "border-green-500/30 bg-green-500/5"
                            : verdict === "wrong"
                              ? "border-red-500/30 bg-red-500/5"
                              : verdict === "partial"
                                ? "border-yellow-500/30 bg-yellow-500/5"
                                : "border-[var(--card-border)]"
                        }`}
                      >
                        {/* Prediction header */}
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-xs text-[var(--muted)] font-mono">{pred.id}</span>
                          <span className="text-xs text-[var(--muted)] font-mono">{pred.confidence.toFixed(1)}</span>
                        </div>

                        {/* Prediction statement */}
                        <p className="text-sm leading-relaxed mb-3">{pred.statement}</p>

                        {/* Reasoning (collapsed by default) */}
                        <details className="mb-3">
                          <summary className="text-xs text-[var(--muted)] cursor-pointer hover:text-white transition-colors">
                            模型推理依据
                          </summary>
                          <p className="text-xs text-[var(--muted)] mt-1 pl-3 border-l border-[var(--card-border)]">
                            {pred.reasoning}
                          </p>
                        </details>

                        {/* Verdict buttons */}
                        <div className="flex gap-2">
                          <button
                            onClick={() => setVerdict(pred.id, "correct")}
                            className={`flex-1 py-2 text-sm rounded-lg transition-all ${
                              verdict === "correct"
                                ? "bg-green-500/20 text-green-300 ring-1 ring-green-500/40"
                                : "bg-[var(--background)] text-[var(--muted)] hover:text-green-300 hover:bg-green-500/10"
                            }`}
                          >
                            对
                          </button>
                          <button
                            onClick={() => setVerdict(pred.id, "wrong")}
                            className={`flex-1 py-2 text-sm rounded-lg transition-all ${
                              verdict === "wrong"
                                ? "bg-red-500/20 text-red-300 ring-1 ring-red-500/40"
                                : "bg-[var(--background)] text-[var(--muted)] hover:text-red-300 hover:bg-red-500/10"
                            }`}
                          >
                            不对
                          </button>
                          <button
                            onClick={() => setVerdict(pred.id, "partial")}
                            className={`flex-1 py-2 text-sm rounded-lg transition-all ${
                              verdict === "partial"
                                ? "bg-yellow-500/20 text-yellow-300 ring-1 ring-yellow-500/40"
                                : "bg-[var(--background)] text-[var(--muted)] hover:text-yellow-300 hover:bg-yellow-500/10"
                            }`}
                          >
                            部分对
                          </button>
                        </div>

                        {/* Correction input */}
                        {showCorrection && (
                          <div className="mt-3">
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
      <div className="flex flex-col items-center gap-3 pt-4 pb-8">
        <div className="flex gap-3">
          {wrongCount > 0 || partialCount > 0 ? (
            <button
              onClick={handleUpdateModel}
              className="px-8 py-3 bg-green-600 text-white font-medium rounded-lg hover:opacity-90 transition-opacity"
            >
              用修正更新模型
            </button>
          ) : null}
          <button
            onClick={handleViewResults}
            disabled={judgedCount === 0}
            className="px-8 py-3 bg-[var(--accent)] text-white font-medium rounded-lg hover:opacity-90 disabled:opacity-40 transition-opacity"
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
