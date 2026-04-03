"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import dynamic from "next/dynamic";

const ReactEChartsSSR = dynamic(() => import("echarts-for-react"), { ssr: false });

/* ── Types ── */

interface SituationContext {
  time_pressure?: "none" | "low" | "high";
  social_pressure?: "none" | "low" | "high";
  caring_level?: "low" | "medium" | "high";
  energy_state?: "rested" | "normal" | "depleted";
}
interface T1Question {
  id: string;
  scenario: string;
  context?: SituationContext;
  options: string[];
  predicted_answer: string;
  confidence: number;
  reasoning_from_model: string;
}
interface T2Question {
  id: string;
  scenario: string;
  context?: SituationContext;
  options: string[];
  predicted_answer: string;
  predicted_reasoning?: string;
  predicted_conclusion?: string;
  predicted_objection?: string;
  confidence: number;
  reasoning_from_model: string;
}
interface T3Question {
  id: string;
  predicted_blind_spot: string;
  statement: string;
  scenario?: string;
  context?: SituationContext;
  predicted_response: string;
  confidence: number;
  reasoning_from_model: string;
}

interface ConflictData {
  stated_claim: string;
  actual_behavior: string;
  blind_spot_evidence: string;
}
interface Predictions {
  tier_1: T1Question[];
  tier_2: T2Question[];
  tier_3: T3Question[];
}
interface CognitiveModel {
  dimensions: { name: string; description: string; behavioral_predictions: string[]; confidence: string }[];
  summary: string;
}
interface PairScore {
  id: string;
  tier: number;
  score: number;
  reasoning: string;
  surprise?: string;
}
interface ScoreReport {
  pair_scores: PairScore[];
  tier_1_accuracy: number;
  tier_2_accuracy: number;
  tier_3_accuracy: number;
  overall_accuracy: number;
  accuracy_gradient: number;
  key_findings: string;
}

interface Correction {
  dimension: string;
  error_type: string;
  evidence: string;
  original?: string;
  corrected: string;
}
interface RefinementResult {
  corrections: Correction[];
  corrected_model: CognitiveModel;
  refinement_summary: string;
}

interface RoundRecord {
  round: number;
  timestamp: string;
  tier_1_accuracy: number;
  tier_2_accuracy: number;
  tier_3_accuracy: number;
  overall_accuracy: number;
  error_types: Record<string, number>; // error_type → count
}

type Step = "input" | "building" | "quiz" | "scoring" | "results";

const TIER_LABELS: Record<number, string> = { 1: "偏好", 2: "推理", 3: "盲区" };
const ERROR_TYPES = ["认知架构错误", "过度理想化", "情境缺失", "维度遗漏"] as const;


/** Check if cached predictions use the old schema */
function isStaleSchema(preds: Predictions): boolean {
  const hasOldT2 = preds.tier_2.length > 0 && !Array.isArray(preds.tier_2[0].options);
  const hasOldT3 = preds.tier_3.length > 0 && !preds.tier_3[0].predicted_blind_spot;
  return hasOldT2 || hasOldT3;
}

const LS_KEYS = {
  step: "nous_step",
  profile: "nous_profile",
  model: "nous_model",
  predictions: "nous_predictions",
  t1: "nous_t1",
  t2: "nous_t2",
  t3: "nous_t3",
  scores: "nous_scores",
  history: "nous_history",
} as const;

/* ── localStorage helpers ── */

function lsGet<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function lsSet(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch { /* quota exceeded — ignore */ }
}

function lsClear() {
  Object.values(LS_KEYS).forEach((k) => localStorage.removeItem(k));
}

/** Anthropic tool_choice sometimes returns tiers as JSON strings instead of arrays */
function normalizePredictions(raw: Record<string, unknown>): Predictions {
  const parse = (v: unknown): unknown[] => {
    if (Array.isArray(v)) return v;
    if (typeof v === "string") {
      try {
        const parsed = JSON.parse(v);
        if (Array.isArray(parsed)) return parsed;
      } catch {
        // Malformed JSON string from Anthropic — return empty to avoid crash
        return [];
      }
    }
    return [];
  };
  return {
    tier_1: parse(raw.tier_1) as T1Question[],
    tier_2: parse(raw.tier_2) as T2Question[],
    tier_3: parse(raw.tier_3) as T3Question[],
  };
}

/** Validate predictions have questions in T1 and T2 (T3 is auto-scored, can be empty) */
function validatePredictions(preds: Predictions): void {
  const empty: string[] = [];
  if (preds.tier_1.length === 0) empty.push("T1(偏好)");
  if (preds.tier_2.length === 0) empty.push("T2(推理)");
  if (empty.length > 0) {
    throw new Error(`预测生成不完整：${empty.join("、")} 为空，请重试。`);
  }
}

/* ── Main Component ── */

interface PredictorProps {
  onRequestRefine?: (req: {
    model: CognitiveModel;
    focusDimensions: string[];
  }) => void;
}

export default function Predictor({ onRequestRefine }: PredictorProps = {}) {
  /* SSR-safe defaults — hydrated from localStorage in useEffect */
  const [step, setStep] = useState<Step>("input");
  const [profileText, setProfileText] = useState("");
  const [cognitiveModel, setCognitiveModel] = useState<CognitiveModel | null>(null);
  const [predictions, setPredictions] = useState<Predictions | null>(null);
  const [scores, setScores] = useState<ScoreReport | null>(null);
  const [error, setError] = useState("");
  const [buildProgress, setBuildProgress] = useState("");
  const [refining, setRefining] = useState(false);
  const [refinement, setRefinement] = useState<RefinementResult | null>(null);
  const [testRound, setTestRound] = useState(1);
  const topRef = useRef<HTMLDivElement>(null);

  const [inputMode, setInputMode] = useState<"text" | "model">("text");
  const [modelJson, setModelJson] = useState("");
  const [modelFileName, setModelFileName] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [t1Answers, setT1Answers] = useState<Record<string, string>>({});
  const [t2Answers, setT2Answers] = useState<Record<string, string>>({});
  const [t3Answers, setT3Answers] = useState<Record<string, string>>({});
  const [roundHistory, setRoundHistory] = useState<RoundRecord[]>([]);

  // Hydration guard
  const [hydrated, setHydrated] = useState(false);

  /* Hydrate from localStorage on mount (SSR-safe) */
  useEffect(() => {
    const savedStep = lsGet<string>(LS_KEYS.step, "input");
    setStep((savedStep === "building" || savedStep === "scoring") ? "input" : savedStep as Step);
    setProfileText(lsGet<string>(LS_KEYS.profile, ""));
    setCognitiveModel(lsGet<CognitiveModel | null>(LS_KEYS.model, null));
    const raw = lsGet<Record<string, unknown> | null>(LS_KEYS.predictions, null);
    if (raw) {
      try {
        const parsed = normalizePredictions(raw);
        if (!isStaleSchema(parsed)) { setPredictions(parsed); }
        else { Object.values(LS_KEYS).forEach((k) => localStorage.removeItem(k)); }
      } catch { /* ignore */ }
    }
    setScores(lsGet<ScoreReport | null>(LS_KEYS.scores, null));
    setTestRound(lsGet<number>("nous_round", 1));
    setT1Answers(lsGet<Record<string, string>>(LS_KEYS.t1, {}));
    setT2Answers(lsGet<Record<string, string>>(LS_KEYS.t2, {}));
    setT3Answers(lsGet<Record<string, string>>(LS_KEYS.t3, {}));
    setRoundHistory(lsGet<RoundRecord[]>(LS_KEYS.history, []));
    setHydrated(true);
  }, []);

  /* Persist step + answers to localStorage (only after hydration) */
  useEffect(() => { if (hydrated) lsSet(LS_KEYS.step, step); }, [step, hydrated]);
  useEffect(() => { if (hydrated) lsSet(LS_KEYS.t1, t1Answers); }, [t1Answers, hydrated]);
  useEffect(() => { if (hydrated) lsSet(LS_KEYS.t2, t2Answers); }, [t2Answers, hydrated]);
  useEffect(() => { if (hydrated) lsSet(LS_KEYS.t3, t3Answers); }, [t3Answers, hydrated]);

  /* Check what's recoverable from localStorage */
  const hasSavedModel = !!cognitiveModel;
  const hasSavedPredictions = !!predictions;
  const hasSavedAnswers = Object.keys(t1Answers).length > 0 || Object.values(t2Answers).some((v) => !!v);

  // T3 is auto-scored from contradiction data — only T1+T2 need user answers
  const totalQ = predictions ? predictions.tier_1.length + predictions.tier_2.length : 0;
  const answered = predictions
    ? Object.keys(t1Answers).length +
      Object.values(t2Answers).filter((v) => !!v).length
    : 0;

  // Get contradiction data from Interview tab's localStorage
  const getConflicts = (): ConflictData[] => {
    try {
      const raw = localStorage.getItem("nous_interview_conflicts");
      return raw ? JSON.parse(raw) : [];
    } catch { return []; }
  };

  // Get signal data from Interview tab's localStorage
  const getSignals = (): unknown[] => {
    try {
      const raw = localStorage.getItem("nous_interview_signals");
      return raw ? JSON.parse(raw) : [];
    } catch { return []; }
  };

  /* ── Resume: go straight to quiz with existing predictions ── */
  const handleResume = () => {
    if (predictions) {
      setStep("quiz");
    }
  };

  /* ── Regenerate: reuse model, generate new predictions ── */
  const handleRegenerate = async () => {
    if (!cognitiveModel) return;
    setError("");
    setStep("building");
    setBuildProgress("正在用已有模型生成新题目...");

    try {
      const res = await fetch("/api/predict", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model: cognitiveModel, conflicts: getConflicts(), signals: getSignals() }),
      });
      const text = await res.text();
      let data;
      try {
        data = JSON.parse(text);
      } catch {
        throw new Error(`API 返回非 JSON: ${text.slice(0, 200)}`);
      }
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);

      const preds = normalizePredictions(data.predictions);
      validatePredictions(preds);
      setPredictions(preds);
      lsSet(LS_KEYS.predictions, preds);

      // Clear stale answers and scores
      setT1Answers({});
      setT2Answers({});
      setT3Answers({});
      setScores(null);
      localStorage.removeItem(LS_KEYS.scores);

      setStep("quiz");
    } catch (err) {
      setError(err instanceof Error ? err.message : "生成预测失败");
      setStep("input");
    }
  };

  /* ── File upload handler ── */
  const handleFileSelect = (file: File) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;
      setModelJson(text);
      setModelFileName(file.name);
      setError("");
    };
    reader.readAsText(file);
  };

  /* ── Import model JSON → generate predictions only ── */
  const handleImportModel = async () => {
    let parsed: CognitiveModel;
    try {
      parsed = JSON.parse(modelJson);
      if (!parsed.dimensions || !parsed.summary) throw new Error("缺少 dimensions 或 summary 字段");
    } catch (e) {
      setError(e instanceof Error ? `JSON 解析失败: ${e.message}` : "JSON 格式错误");
      return;
    }

    setCognitiveModel(parsed);
    lsSet(LS_KEYS.model, parsed);
    setError("");
    setStep("building");
    setBuildProgress("正在用导入的模型生成预测题...");

    try {
      const res = await fetch("/api/predict", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model: parsed }),
      });
      const text = await res.text();
      let data;
      try { data = JSON.parse(text); } catch { throw new Error(`API 返回非 JSON: ${text.slice(0, 200)}`); }
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);

      const preds = normalizePredictions(data.predictions);
      validatePredictions(preds);
      setPredictions(preds);
      lsSet(LS_KEYS.predictions, preds);
      setT1Answers({});
      setT2Answers({});
      setT3Answers({});
      setStep("quiz");
    } catch (err) {
      setError(err instanceof Error ? err.message : "生成预测失败");
      setStep("input");
    }
  };

  /* ── Step 0 → Step 1: Build model + predictions ── */
  const handleBuild = async () => {
    if (!profileText.trim() || profileText.trim().length < 50) {
      setError("请粘贴至少 50 字的对话或认知画像文本。");
      return;
    }
    setError("");
    setStep("building");
    setBuildProgress("正在构建认知模型...");
    lsSet(LS_KEYS.profile, profileText);

    try {
      const res = await fetch("/api/predict", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ profile: profileText, conflicts: getConflicts(), signals: getSignals() }),
      });
      const text = await res.text();
      let data;
      try {
        data = JSON.parse(text);
      } catch {
        throw new Error(`API 返回非 JSON: ${text.slice(0, 200)}`);
      }
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);

      const model = data.model as CognitiveModel;
      const preds = normalizePredictions(data.predictions);
      validatePredictions(preds);

      setCognitiveModel(model);
      setPredictions(preds);
      lsSet(LS_KEYS.model, model);
      lsSet(LS_KEYS.predictions, preds);

      // Clear any stale answers
      setT1Answers({});
      setT2Answers({});
      setT3Answers({});

      setStep("quiz");
    } catch (err) {
      setError(err instanceof Error ? err.message : "建模失败");
      setStep("input");
    }
  };

  /* ── Step 2 → Step 3: Score answers ── */
  const handleSubmit = async () => {
    if (!predictions) return;

    const responses = {
      tier_1: predictions.tier_1.map((q) => ({ id: q.id, actual_answer: t1Answers[q.id] || "" })),
      tier_2: predictions.tier_2.map((q) => ({ id: q.id, actual_answer: t2Answers[q.id] || "" })),
    };

    // T3 auto-scoring: use contradiction data from Interview tab
    const conflicts = getConflicts();

    setStep("scoring");
    setError("");
    try {
      const fetchTier = async (tier: number) => {
        const body: Record<string, unknown> = { predictions, tier };
        if (tier === 3) {
          // T3: auto-score with contradiction data, no user responses needed
          body.conflicts = conflicts;
        } else {
          body.responses = responses;
        }
        const res = await fetch("/api/score", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        const text = await res.text();
        let data;
        try { data = JSON.parse(text); } catch { throw new Error(`Tier ${tier} 返回非 JSON: ${text.slice(0, 100)}`); }
        if (!res.ok) throw new Error(data.error || `Tier ${tier} HTTP ${res.status}`);
        return data as { tier: number; pair_scores: PairScore[]; tier_accuracy: number; key_findings: string };
      };

      const [r1, r2, r3] = await Promise.all([fetchTier(1), fetchTier(2), fetchTier(3)]);

      // Normalize pair_scores in case Anthropic returns them as JSON strings
      const normScores = (r: { pair_scores: PairScore[] | string }) => {
        let ps = r.pair_scores;
        if (typeof ps === "string") {
          try { ps = JSON.parse(ps); } catch { ps = []; }
        }
        return (Array.isArray(ps) ? ps : []) as PairScore[];
      };
      const allScores = [
        ...normScores(r1).map((s: PairScore) => ({ ...s, tier: 1 })),
        ...normScores(r2).map((s: PairScore) => ({ ...s, tier: 2 })),
        ...normScores(r3).map((s: PairScore) => ({ ...s, tier: 3 })),
      ];
      const t1a = r1.tier_accuracy;
      const t2a = r2.tier_accuracy;
      const t3a = r3.tier_accuracy;
      const combined: ScoreReport = {
        pair_scores: allScores,
        tier_1_accuracy: t1a,
        tier_2_accuracy: t2a,
        tier_3_accuracy: t3a,
        overall_accuracy: t1a * 0.2 + t2a * 0.4 + t3a * 0.4,
        accuracy_gradient: t1a - t3a,
        key_findings: [r1.key_findings, r2.key_findings, r3.key_findings].join(" "),
      };

      setScores(combined);
      lsSet(LS_KEYS.scores, combined);

      // Persist round history for error accumulation
      const errorCounts: Record<string, number> = {};
      for (const ps of allScores) {
        if (ps.score < 0.5 && ps.surprise) {
          for (const et of ERROR_TYPES) {
            if (ps.surprise.includes(et)) {
              errorCounts[et] = (errorCounts[et] || 0) + 1;
            }
          }
        }
      }
      const record: RoundRecord = {
        round: testRound,
        timestamp: new Date().toISOString(),
        tier_1_accuracy: t1a,
        tier_2_accuracy: t2a,
        tier_3_accuracy: t3a,
        overall_accuracy: combined.overall_accuracy,
        error_types: errorCounts,
      };
      const newHistory = [...roundHistory.filter((r) => r.round !== testRound), record];
      setRoundHistory(newHistory);
      lsSet(LS_KEYS.history, newHistory);

      setStep("results");
      topRef.current?.scrollIntoView({ behavior: "smooth" });
    } catch (err) {
      setError(err instanceof Error ? err.message : "评分失败");
      setStep("quiz");
    }
  };

  /* ── Refine model based on score errors ── */
  const handleRefine = async () => {
    if (!cognitiveModel || !scores) return;
    setRefining(true);
    setError("");

    try {
      const responses = predictions ? {
        tier_1: predictions.tier_1.map((q) => ({ id: q.id, actual_answer: t1Answers[q.id] || "" })),
        tier_2: predictions.tier_2.map((q) => ({ id: q.id, actual_answer: t2Answers[q.id] || "" })),
      } : undefined;

      const res = await fetch("/api/refine", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model: cognitiveModel, scores, predictions, responses, conflicts: getConflicts() }),
      });
      const text = await res.text();
      let data;
      try { data = JSON.parse(text); } catch { throw new Error(`API 返回非 JSON: ${text.slice(0, 200)}`); }
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);

      setRefinement(data as RefinementResult);
    } catch (err) {
      setError(err instanceof Error ? err.message : "模型修正失败");
    } finally {
      setRefining(false);
    }
  };

  /* ── Apply refinement and start new round ── */
  const handleApplyRefinement = async () => {
    if (!refinement) return;
    const newModel = refinement.corrected_model;
    setCognitiveModel(newModel);
    lsSet(LS_KEYS.model, newModel);
    setRefinement(null);
    setScores(null);
    localStorage.removeItem(LS_KEYS.scores);

    // Increment round
    const newRound = testRound + 1;
    setTestRound(newRound);
    lsSet("nous_round", newRound);

    // Generate new predictions from corrected model
    setStep("building");
    setBuildProgress(`第 ${newRound} 轮：用修正后的模型生成新题目...`);
    setError("");

    try {
      const res = await fetch("/api/predict", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model: newModel, conflicts: getConflicts(), signals: getSignals() }),
      });
      const text = await res.text();
      let data;
      try { data = JSON.parse(text); } catch { throw new Error(`API 返回非 JSON: ${text.slice(0, 200)}`); }
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);

      const preds = normalizePredictions(data.predictions);
      validatePredictions(preds);
      setPredictions(preds);
      lsSet(LS_KEYS.predictions, preds);
      setT1Answers({});
      setT2Answers({});
      setT3Answers({});
      setStep("quiz");
    } catch (err) {
      setError(err instanceof Error ? err.message : "生成预测失败");
      setStep("results");
    }
  };

  /* ── Full reset ── */
  const handleReset = () => {
    setStep("input");
    setProfileText("");
    setCognitiveModel(null);
    setPredictions(null);
    setScores(null);
    setT1Answers({});
    setT2Answers({});
    setT3Answers({});
    setError("");
    setRefinement(null);
    setTestRound(1);
    setRoundHistory([]);
    lsClear();
    localStorage.removeItem("nous_round");
    topRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  /* ── RENDER: Step 4 — Results ── */
  if (step === "results" && scores) {
    return (
      <div ref={topRef} className="max-w-3xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <h2 className="text-xl font-bold">预测准确率报告</h2>
            {testRound > 1 && (
              <span className="text-xs px-2 py-0.5 rounded bg-[var(--accent)]/20 text-[var(--accent)]">
                第 {testRound} 轮
              </span>
            )}
          </div>
          <button onClick={handleReset} className="text-sm text-[var(--muted)] hover:text-white transition-colors">
            重新测试
          </button>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <ScoreCard label="偏好预测" value={scores.tier_1_accuracy} color="text-blue-400" />
          <ScoreCard label="推理预测" value={scores.tier_2_accuracy} color="text-orange-400" />
          <ScoreCard label="盲区（自动）" value={scores.tier_3_accuracy} color="text-purple-400" />
          <ScoreCard label="综合准确率" value={scores.overall_accuracy} color="text-white" />
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
            <div className="bg-[var(--card)] border border-[var(--card-border)] rounded-lg p-4">
              <h3 className="text-sm font-medium mb-3">vs 随机基线</h3>
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="text-[var(--muted)]">T1 随机猜中率：</span>
                  <span className="text-blue-400 font-mono">{(t1Baseline * 100).toFixed(0)}%</span>
                  <span className="ml-2 text-xs">{t1Lift > 0 ? "+" : ""}{(t1Lift * 100).toFixed(0)}pp</span>
                </div>
                <div>
                  <span className="text-[var(--muted)]">T2 随机猜中率：</span>
                  <span className="text-orange-400 font-mono">{(t2Baseline * 100).toFixed(0)}%</span>
                  <span className="ml-2 text-xs">{t2Lift > 0 ? "+" : ""}{(t2Lift * 100).toFixed(0)}pp</span>
                </div>
              </div>
              <p className="text-xs text-[var(--muted)] mt-2">
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
            <div className="bg-[var(--card)] border border-[var(--card-border)] rounded-lg p-4 space-y-3">
              <h3 className="text-sm font-medium">情境诊断（T1+T2，按 context 分组）</h3>
              <div className="space-y-1.5">
                {entries.map(({ tag, acc, n }) => (
                  <div key={tag} className="flex items-center gap-3 text-sm">
                    <span className="w-36 text-[var(--muted)] truncate">{tag}</span>
                    <div className="flex-1 h-2 bg-[var(--background)] rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full ${acc >= 0.5 ? "bg-green-500" : "bg-red-500"}`}
                        style={{ width: `${acc * 100}%` }}
                      />
                    </div>
                    <span className="font-mono text-xs w-16 text-right">{(acc * 100).toFixed(0)}% ({n})</span>
                  </div>
                ))}
              </div>
              <p className="text-xs text-[var(--muted)]">
                红色 = 模型在此情境下系统性失败（&lt;50%），绿色 = 有效。数字括号内为题数。
              </p>
            </div>
          );
        })()}

        <div className="bg-[var(--card)] border border-[var(--card-border)] rounded-lg p-5">
          <h3 className="text-sm font-medium mb-4">准确率梯度</h3>
          <GradientBar report={scores} />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-[var(--card)] border border-[var(--card-border)] rounded-lg p-4">
            <h3 className="text-sm font-medium mb-2">三层对比</h3>
            <AccuracyChart report={scores} />
          </div>
          <div className="bg-[var(--card)] border border-[var(--card-border)] rounded-lg p-4">
            <h3 className="text-sm font-medium mb-2">核心发现</h3>
            <p className="text-sm text-[var(--muted)] leading-relaxed">{scores.key_findings}</p>
          </div>
        </div>

        {/* Round history — only show if we have 2+ rounds */}
        {roundHistory.length >= 2 && (
          <div className="bg-[var(--card)] border border-[var(--card-border)] rounded-lg p-4 space-y-3">
            <h3 className="text-sm font-medium">迭代趋势（{roundHistory.length} 轮）</h3>
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
            <div className="bg-[var(--card)] border border-[var(--card-border)] rounded-lg p-4 space-y-3">
              <h3 className="text-sm font-medium">错误类型分布</h3>
              <div className="flex flex-wrap gap-3">
                {ERROR_TYPES.map((et) => {
                  const count = errorCounts[et] || 0;
                  if (count === 0) return null;
                  const cls =
                    et === "过度理想化" ? "bg-orange-500/20 text-orange-300" :
                    et === "认知架构错误" ? "bg-red-500/20 text-red-300" :
                    et === "情境缺失" ? "bg-blue-500/20 text-blue-300" :
                    "bg-purple-500/20 text-purple-300";
                  return (
                    <div key={et} className={`px-3 py-2 rounded-lg ${cls} text-center`}>
                      <p className="text-lg font-bold">{count}</p>
                      <p className="text-xs">{et}</p>
                    </div>
                  );
                })}
              </div>
              <p className="text-xs text-[var(--muted)]">
                基于评分中 surprise 字段的错误标注（仅统计得分 &lt; 50% 的预测）
              </p>
            </div>
          );
        })()}

        {cognitiveModel && (
          <div className="bg-[var(--card)] border border-[var(--card-border)] rounded-lg p-4 space-y-3">
            <h3 className="text-sm font-medium">认知模型摘要</h3>
            <p className="text-sm text-[var(--muted)] leading-relaxed">{cognitiveModel.summary}</p>
          </div>
        )}

        <div className="bg-[var(--card)] border border-[var(--card-border)] rounded-lg p-4 space-y-3">
          <h3 className="text-sm font-medium">逐题评分</h3>
          {scores.pair_scores.map((ps) => (
            <div key={`score_t${ps.tier}_${ps.id}`} className="border-b border-[var(--card-border)] pb-3 last:border-b-0 last:pb-0">
              <div className="flex items-center gap-2 mb-1">
                <TierBadge tier={ps.tier} />
                <span className="text-sm font-medium">{ps.id}</span>
                <ScoreBadge score={ps.score} />
              </div>
              <p className="text-sm text-[var(--muted)]">{ps.reasoning}</p>
              {ps.surprise && <p className="text-xs text-yellow-400 mt-1">意外发现：{ps.surprise}</p>}
            </div>
          ))}
        </div>

        {/* Refinement section */}
        {!refinement && (
          <div className="bg-[var(--card)] border border-[var(--accent)]/30 rounded-lg p-5 space-y-3">
            <h3 className="text-sm font-medium">闭环修正</h3>
            <p className="text-xs text-[var(--muted)]">
              基于本轮预测错误，AI 会分析模型哪些维度需要修正，然后用修正后的模型生成新一轮预测题。
            </p>
            <button
              onClick={handleRefine}
              disabled={refining}
              className="px-5 py-2 bg-[var(--accent)] text-white text-sm font-medium rounded-lg hover:opacity-90 disabled:opacity-40 transition-opacity"
            >
              {refining ? "正在分析错误并修正模型..." : "修正模型，进入下一轮"}
            </button>
            {error && <p className="text-sm text-red-400">{error}</p>}
          </div>
        )}

        {refinement && (
          <div className="bg-[var(--card)] border border-green-500/30 rounded-lg p-5 space-y-4">
            <h3 className="text-sm font-medium">模型修正建议</h3>
            <p className="text-sm text-[var(--muted)] leading-relaxed">{refinement.refinement_summary}</p>

            <div className="space-y-3">
              {refinement.corrections.map((c, i) => (
                <div key={i} className="border border-[var(--card-border)] rounded-lg p-3 space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium">{c.dimension}</span>
                    <span className={`text-xs px-1.5 py-0.5 rounded ${
                      c.error_type === "过度理想化" ? "bg-orange-500/20 text-orange-300" :
                      c.error_type === "认知架构错误" ? "bg-red-500/20 text-red-300" :
                      c.error_type === "情境缺失" ? "bg-blue-500/20 text-blue-300" :
                      "bg-purple-500/20 text-purple-300"
                    }`}>{c.error_type}</span>
                  </div>
                  <p className="text-xs text-[var(--muted)]">证据：{c.evidence}</p>
                  <p className="text-xs text-green-400">修正：{c.corrected}</p>
                </div>
              ))}
            </div>

            <div className="flex gap-3">
              <button
                onClick={handleApplyRefinement}
                className="px-5 py-2 bg-green-600 text-white text-sm font-medium rounded-lg hover:opacity-90 transition-opacity"
              >
                应用修正，开始第 {testRound + 1} 轮
              </button>
              <button
                onClick={() => setRefinement(null)}
                className="px-4 py-2 text-sm text-[var(--muted)] hover:text-white transition-colors"
              >
                取消
              </button>
            </div>
          </div>
        )}

        {/* Deep conversation refinement */}
        {onRequestRefine && cognitiveModel && (
          <div className="bg-[var(--card)] border border-orange-500/20 rounded-lg p-5 space-y-3">
            <h3 className="text-sm font-medium">对话修正</h3>
            <p className="text-xs text-[var(--muted)]">
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
              className="px-5 py-2 bg-orange-600 text-white text-sm font-medium rounded-lg hover:opacity-90 transition-opacity"
            >
              开始对话修正（针对弱维度深聊）
            </button>
          </div>
        )}
      </div>
    );
  }

  /* ── RENDER: Step 3 — Scoring ── */
  if (step === "scoring") {
    return (
      <div className="max-w-md mx-auto text-center py-20 space-y-4">
        <div className="w-10 h-10 mx-auto border-2 border-[var(--accent)] border-t-transparent rounded-full animate-spin" />
        <p className="text-sm text-[var(--muted)]">正在对比 AI 预测与你的实际回答...</p>
        <p className="text-xs text-[var(--muted)]">大约需要 30 秒</p>
      </div>
    );
  }

  /* ── RENDER: Step 1 — Building ── */
  if (step === "building") {
    return (
      <div className="max-w-md mx-auto text-center py-20 space-y-4">
        <div className="w-10 h-10 mx-auto border-2 border-[var(--accent)] border-t-transparent rounded-full animate-spin" />
        <p className="text-sm text-[var(--muted)]">{buildProgress}</p>
        <p className="text-xs text-[var(--muted)]">需要 30-60 秒（建模 + 生成预测题）</p>
      </div>
    );
  }

  /* ── RENDER: Step 2 — Quiz ── */
  if (step === "quiz" && predictions) {
    return (
      <div ref={topRef} className="max-w-2xl mx-auto space-y-8">
        {/* Header */}
        <div className="text-center space-y-2 pt-2">
          <button
            onClick={() => setStep("input")}
            className="text-xs text-[var(--muted)] hover:text-[var(--foreground)] transition-colors mb-2"
          >
            ← 返回
          </button>
          <h2 className="text-xl font-bold">AI 能预测你的行为吗？</h2>
          <p className="text-sm text-[var(--muted)]">
            共 {totalQ} 题（偏好+推理），凭直觉回答。盲区部分自动评估，无需作答。
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
            <div className="space-y-2">
              {q.options.map((opt, oi) => {
                const sel = t1Answers[q.id] === opt;
                return (
                  <label
                    key={oi}
                    className={`flex items-center gap-3 px-4 py-3 rounded-lg cursor-pointer transition-all border ${
                      sel
                        ? "border-blue-500 bg-blue-500/10"
                        : "border-[var(--card-border)] hover:border-blue-500/40"
                    }`}
                  >
                    <input
                      type="radio"
                      name={`t1_${q.id}`}
                      checked={sel}
                      onChange={() => setT1Answers({ ...t1Answers, [q.id]: opt })}
                      className="accent-blue-500"
                    />
                    <span className="text-sm">{opt}</span>
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
            <div className="space-y-1.5">
              {(q.options || []).map((opt, oi) => {
                const sel = t2Answers[q.id] === opt;
                return (
                  <label
                    key={oi}
                    className={`flex items-start gap-3 px-3 py-2.5 rounded-lg cursor-pointer transition-all ${
                      sel ? "bg-orange-500/10 ring-1 ring-orange-500/40" : "hover:bg-white/5"
                    }`}
                  >
                    <span className={`mt-0.5 w-4 h-4 rounded-full border-2 flex-shrink-0 flex items-center justify-center transition-colors ${
                      sel ? "border-orange-400 bg-orange-400" : "border-[var(--muted)]"
                    }`}>
                      {sel && <span className="w-1.5 h-1.5 rounded-full bg-white" />}
                    </span>
                    <span className="text-sm leading-relaxed">{opt}</span>
                    <input type="radio" name={q.id} checked={sel} onChange={() => setT2Answers({ ...t2Answers, [q.id]: opt })} className="sr-only" />
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
            <div className="bg-[var(--card)] border border-purple-500/20 rounded-lg p-5 mt-6 space-y-3">
              <div className="flex items-center gap-3">
                <span className="text-xs font-bold px-2.5 py-1 rounded bg-purple-500/20 text-purple-300">第3层</span>
                <div>
                  <span className="text-sm font-medium">认知盲区</span>
                  <span className="text-xs text-[var(--muted)] ml-2">自动评估（无需作答）</span>
                </div>
              </div>
              <p className="text-sm text-[var(--muted)]">
                盲区是你看不见的东西，自评没有意义。T3 会用认知访谈中检测到的「述行矛盾」自动比对模型预测的盲区。
              </p>
              {conflicts.length > 0 ? (
                <p className="text-sm text-green-400">
                  已检测到 {conflicts.length} 条矛盾数据，提交后将自动评估 {predictions.tier_3.length} 个盲区预测。
                </p>
              ) : (
                <p className="text-sm text-yellow-400">
                  未检测到矛盾数据。建议先完成「认知访谈」积累行为证据，T3 评分会更准确。当前将以模型推理的合理性评分。
                </p>
              )}
              <div className="text-xs text-[var(--muted)] space-y-1">
                {predictions.tier_3.map((q) => (
                  <p key={`t3_${q.id}`} className="pl-3 border-l-2 border-purple-500/30">
                    {q.predicted_blind_spot || q.statement}
                  </p>
                ))}
              </div>
            </div>
          );
        })()}

        {/* Submit */}
        <div className="flex flex-col items-center gap-3 pt-4 pb-8">
          <button
            onClick={handleSubmit}
            disabled={answered < totalQ}
            className="px-8 py-3 bg-[var(--accent)] text-white font-medium rounded-lg hover:opacity-90 disabled:opacity-40 transition-opacity"
          >
            提交问卷
          </button>
          {answered < totalQ && (
            <p className="text-xs text-[var(--muted)]">还有 {totalQ - answered} 题未作答</p>
          )}
          {error && <p className="text-sm text-red-400">{error}</p>}
        </div>
      </div>
    );
  }

  /* ── RENDER: Step 0 — Input ── */
  return (
    <div ref={topRef} className="max-w-2xl mx-auto space-y-6 pt-4">
      <div className="text-center space-y-2">
        <h2 className="text-xl font-bold">AI 能预测你的行为吗？</h2>
        <p className="text-sm text-[var(--muted)]">
          粘贴你与 AI 的对话记录或个人认知画像，系统会构建认知模型并生成个性化预测题。
        </p>
      </div>

      {/* Quick actions when saved state exists */}
      {(hasSavedPredictions || hasSavedModel) && (
        <div className="bg-[var(--card)] border border-[var(--accent)]/30 rounded-lg p-5 space-y-3">
          <h3 className="text-sm font-medium">检测到已有数据</h3>
          {cognitiveModel && (
            <p className="text-xs text-[var(--muted)]">
              模型：{cognitiveModel.dimensions.length} 个维度 · {cognitiveModel.summary.slice(0, 60)}...
            </p>
          )}
          <div className="flex flex-wrap gap-3">
            {hasSavedPredictions && hasSavedAnswers && (
              <button
                onClick={handleResume}
                className="px-4 py-2 bg-[var(--accent)] text-white text-sm font-medium rounded-lg hover:opacity-90 transition-opacity"
              >
                继续上次的问卷
              </button>
            )}
            {hasSavedPredictions && !hasSavedAnswers && (
              <button
                onClick={handleResume}
                className="px-4 py-2 bg-[var(--accent)] text-white text-sm font-medium rounded-lg hover:opacity-90 transition-opacity"
              >
                开始答题
              </button>
            )}
            {hasSavedModel && (
              <button
                onClick={handleRegenerate}
                className="px-4 py-2 bg-[var(--card)] border border-[var(--card-border)] text-sm font-medium rounded-lg hover:bg-white/5 transition-colors"
              >
                已有模型，重新出题
              </button>
            )}
            <button
              onClick={handleReset}
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
            onClick={() => setInputMode("text")}
            className={`flex-1 text-sm py-1.5 rounded-md transition-colors ${inputMode === "text" ? "bg-[var(--card)] font-medium" : "text-[var(--muted)] hover:text-white"}`}
          >
            粘贴对话文本
          </button>
          <button
            onClick={() => setInputMode("model")}
            className={`flex-1 text-sm py-1.5 rounded-md transition-colors ${inputMode === "model" ? "bg-[var(--card)] font-medium" : "text-[var(--muted)] hover:text-white"}`}
          >
            导入认知模型
          </button>
        </div>

        {inputMode === "text" ? (
          <>
            <textarea
              value={profileText}
              onChange={(e) => setProfileText(e.target.value)}
              placeholder={"粘贴你与 AI 的对话记录、认知画像文本、或任何能反映你思维方式的文本...\n\n越丰富的文本 → 越精准的认知模型 → 越有区分度的预测题。\n\n建议至少 500 字。"}
              rows={12}
              className="w-full bg-[var(--background)] border border-[var(--card-border)] rounded-lg p-4 text-sm resize-y focus:outline-none focus:border-[var(--accent)] transition-colors leading-relaxed"
            />
            <div className="flex items-center justify-between">
              <span className="text-xs text-[var(--muted)]">
                {profileText.trim().length} 字
                {profileText.trim().length > 0 && profileText.trim().length < 50 && " (至少需要 50 字)"}
              </span>
              <button
                onClick={handleBuild}
                disabled={profileText.trim().length < 50}
                className="px-6 py-2.5 bg-[var(--accent)] text-white font-medium rounded-lg hover:opacity-90 disabled:opacity-40 transition-opacity"
              >
                开始建模
              </button>
            </div>
          </>
        ) : (
          <>
            <p className="text-xs text-[var(--muted)]">
              上传 cognitive_model JSON 文件，跳过建模直接生成预测题。
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
            <div className="flex justify-end">
              <button
                onClick={handleImportModel}
                disabled={!modelJson.trim()}
                className="px-6 py-2.5 bg-[var(--accent)] text-white font-medium rounded-lg hover:opacity-90 disabled:opacity-40 transition-opacity"
              >
                导入并出题
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
        <h3 className="text-sm font-medium">流程说明</h3>
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
          {[
            { step: "1", label: "粘贴文本", desc: "对话记录或画像" },
            { step: "2", label: "AI 建模", desc: "~30-60 秒" },
            { step: "3", label: "回答问卷", desc: "14 题，凭直觉" },
            { step: "4", label: "查看报告", desc: "准确率 + 分析" },
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

/* ── Sub-components ── */

function Section({ tier, title, desc, color }: { tier: number; title: string; desc: string; color: string }) {
  const cls: Record<string, string> = {
    blue: "bg-blue-500/20 text-blue-300",
    orange: "bg-orange-500/20 text-orange-300",
    purple: "bg-purple-500/20 text-purple-300",
  };
  return (
    <div className="flex items-center gap-3 pt-4">
      <span className={`text-xs font-bold px-2.5 py-1 rounded ${cls[color]}`}>第{tier}层</span>
      <div>
        <span className="text-sm font-medium">{title}</span>
        <span className="text-xs text-[var(--muted)] ml-2">{desc}</span>
      </div>
    </div>
  );
}

const CTX_LABELS: Record<string, Record<string, string>> = {
  time_pressure: { none: "无时间压力", low: "轻度时间压力", high: "高时间压力" },
  social_pressure: { none: "无社交压力", low: "轻度社交压力", high: "高社交压力" },
  caring_level: { low: "低关心度", medium: "中关心度", high: "高关心度" },
  energy_state: { rested: "精力充沛", normal: "正常状态", depleted: "疲惫" },
};
const CTX_COLORS: Record<string, string> = {
  time_pressure: "bg-red-500/10 text-red-300",
  social_pressure: "bg-yellow-500/10 text-yellow-300",
  caring_level: "bg-green-500/10 text-green-300",
  energy_state: "bg-cyan-500/10 text-cyan-300",
};

function ContextTags({ context }: { context?: SituationContext }) {
  if (!context) return null;
  const tags = Object.entries(context).filter(([, v]) => v && v !== "none" && v !== "normal");
  if (tags.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-1.5 mb-2">
      {tags.map(([key, val]) => (
        <span key={key} className={`text-[10px] px-1.5 py-0.5 rounded ${CTX_COLORS[key] || "bg-white/10 text-white/60"}`}>
          {CTX_LABELS[key]?.[val] || val}
        </span>
      ))}
    </div>
  );
}

function QCard({ num, children }: { num: number; children: React.ReactNode }) {
  return (
    <div className="bg-[var(--card)] border border-[var(--card-border)] rounded-lg p-5">
      <span className="text-xs text-[var(--muted)] mb-2 block">Q{num}</span>
      {children}
    </div>
  );
}

function TierBadge({ tier }: { tier: number }) {
  const cls = tier === 1 ? "bg-blue-500/20 text-blue-300" : tier === 2 ? "bg-orange-500/20 text-orange-300" : "bg-purple-500/20 text-purple-300";
  return <span className={`text-xs px-1.5 py-0.5 rounded ${cls}`}>{TIER_LABELS[tier]}</span>;
}

function ScoreCard({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="bg-[var(--card)] border border-[var(--card-border)] rounded-lg p-4 text-center">
      <p className={`text-3xl font-bold ${color}`}>{(value * 100).toFixed(0)}%</p>
      <p className="text-sm text-[var(--muted)] mt-1">{label}</p>
    </div>
  );
}

function ScoreBadge({ score }: { score: number }) {
  const pct = Math.round(score * 100);
  const cls = pct >= 80 ? "bg-green-500/20 text-green-300" : pct >= 50 ? "bg-yellow-500/20 text-yellow-300" : "bg-red-500/20 text-red-300";
  return <span className={`text-xs px-1.5 py-0.5 rounded ${cls}`}>{pct}%</span>;
}

function GradientBar({ report }: { report: ScoreReport }) {
  const t1 = Math.round(report.tier_1_accuracy * 100);
  const t2 = Math.round(report.tier_2_accuracy * 100);
  const t3 = Math.round(report.tier_3_accuracy * 100);
  const bars = [
    { label: "偏好", pct: t1, color: "bg-blue-500", text: "text-blue-300" },
    { label: "推理", pct: t2, color: "bg-orange-500", text: "text-orange-300" },
    { label: "盲区", pct: t3, color: "bg-purple-500", text: "text-purple-300" },
  ];
  return (
    <div className="space-y-3">
      {bars.map((b) => (
        <div key={b.label} className="flex items-center gap-3">
          <span className={`text-xs w-10 ${b.text}`}>{b.label}</span>
          <div className="flex-1 h-4 bg-[var(--background)] rounded-full overflow-hidden">
            <div className={`h-full ${b.color} rounded-full transition-all duration-500`} style={{ width: `${b.pct}%` }} />
          </div>
          <span className="text-sm font-medium w-12 text-right">{b.pct}%</span>
        </div>
      ))}
      <p className="text-xs text-[var(--muted)] pt-1">
        梯度 {t1}% → {t3}% = {t1 - t3}pp —{" "}
        {t1 - t3 > 30 ? "AI 对深层认知理解显著弱于表面偏好" : t1 - t3 > 15 ? "存在明显的深浅理解差异" : "三层准确率相近，模型一致性较高"}
      </p>
    </div>
  );
}

function RoundHistoryChart({ history }: { history: RoundRecord[] }) {
  const sorted = [...history].sort((a, b) => a.round - b.round);
  const rounds = sorted.map((r) => `第${r.round}轮`);

  const option = {
    backgroundColor: "transparent",
    tooltip: { trigger: "axis" as const },
    legend: {
      data: ["综合", "偏好", "推理", "盲区"],
      textStyle: { color: "#999", fontSize: 11 },
      bottom: 0,
    },
    grid: { top: 10, right: 20, bottom: 35, left: 40 },
    xAxis: {
      type: "category" as const,
      data: rounds,
      axisLabel: { color: "#999", fontSize: 11 },
      axisLine: { lineStyle: { color: "#333" } },
    },
    yAxis: {
      type: "value" as const,
      min: 0,
      max: 1,
      axisLabel: { color: "#999", fontSize: 11, formatter: (v: number) => `${Math.round(v * 100)}%` },
      splitLine: { lineStyle: { color: "#222" } },
    },
    series: [
      { name: "综合", type: "line" as const, data: sorted.map((r) => r.overall_accuracy), lineStyle: { width: 2, color: "#fff" }, itemStyle: { color: "#fff" } },
      { name: "偏好", type: "line" as const, data: sorted.map((r) => r.tier_1_accuracy), lineStyle: { width: 1, color: "#3b82f6" }, itemStyle: { color: "#3b82f6" } },
      { name: "推理", type: "line" as const, data: sorted.map((r) => r.tier_2_accuracy), lineStyle: { width: 1, color: "#f97316" }, itemStyle: { color: "#f97316" } },
      { name: "盲区", type: "line" as const, data: sorted.map((r) => r.tier_3_accuracy), lineStyle: { width: 1, color: "#a855f7" }, itemStyle: { color: "#a855f7" } },
    ],
  };
  return <ReactEChartsSSR option={option} style={{ height: 220 }} />;
}

function AccuracyChart({ report }: { report: ScoreReport }) {
  const option = {
    backgroundColor: "transparent",
    radar: {
      indicator: [
        { name: "偏好", max: 1 },
        { name: "推理", max: 1 },
        { name: "盲区", max: 1 },
      ],
      axisName: { color: "#e5e5e5", fontSize: 13 },
      splitArea: { areaStyle: { color: ["transparent"] } },
      splitLine: { lineStyle: { color: "#333" } },
      axisLine: { lineStyle: { color: "#333" } },
    },
    series: [{
      type: "radar",
      data: [{
        value: [report.tier_1_accuracy, report.tier_2_accuracy, report.tier_3_accuracy],
        areaStyle: { color: "rgba(59,130,246,0.15)" },
        lineStyle: { color: "#3b82f6", width: 2 },
        itemStyle: { color: "#3b82f6" },
      }],
    }],
  };
  return <ReactEChartsSSR option={option} style={{ height: 240 }} />;
}
