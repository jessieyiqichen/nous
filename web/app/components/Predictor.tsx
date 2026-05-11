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
  predictModel?: CognitiveModel | null;
  onPredictModelConsumed?: () => void;
}

export default function Predictor({ onRequestRefine, predictModel, onPredictModelConsumed }: PredictorProps = {}) {
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

  /* Handle incoming model from Interview tab */
  const predictModelConsumedRef = useRef(false);
  useEffect(() => {
    if (predictModel && !predictModelConsumedRef.current) {
      predictModelConsumedRef.current = true;
      onPredictModelConsumed?.();

      // Set model and auto-generate predictions
      setCognitiveModel(predictModel);
      lsSet(LS_KEYS.model, predictModel);
      setStep("building");
      setBuildProgress("正在用访谈模型生成预测题...");
      setError("");

      (async () => {
        try {
          const res = await fetch("/api/predict", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ model: predictModel, conflicts: getConflicts(), signals: getSignals() }),
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
        } finally {
          predictModelConsumedRef.current = false;
        }
      })();
    }
  }, [predictModel, onPredictModelConsumed]);

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

  /* ── RENDER: Step 3 — Scoring ── */
  if (step === "scoring") {
    return (
      <div className="flex flex-col items-center justify-center" style={{ minHeight: "60vh" }}>
        <div className="text-center">
          <div style={{ width: 32, height: 32, margin: "0 auto 20px", border: "1.5px solid var(--accent)", borderTopColor: "transparent", borderRadius: 9999 }} className="animate-spin" />
          <p style={{ fontFamily: "var(--font-display)", fontSize: 17, fontWeight: 400, fontStyle: "italic", margin: "0 0 8px" }}>
            正在评分
          </p>
          <p style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--muted-soft)", margin: 0 }}>
            对比 AI 预测与你的实际回答
          </p>
        </div>
      </div>
    );
  }

  /* ── RENDER: Step 1 — Building ── */
  if (step === "building") {
    return (
      <div className="flex flex-col items-center justify-center" style={{ minHeight: "60vh" }}>
        <div className="text-center">
          <div style={{ width: 32, height: 32, margin: "0 auto 20px", border: "1.5px solid var(--accent)", borderTopColor: "transparent", borderRadius: 9999 }} className="animate-spin" />
          <p style={{ fontFamily: "var(--font-display)", fontSize: 17, fontWeight: 400, fontStyle: "italic", margin: "0 0 8px" }}>
            {buildProgress}
          </p>
          <p style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--muted-soft)", margin: 0 }}>
            建模 + 生成预测题
          </p>
        </div>
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

  /* ── RENDER: Step 0 — Input ── */
  return (
    <div ref={topRef} className="max-w-2xl mx-auto space-y-6 pt-4">
      <div className="text-center" style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <h2 style={{ fontFamily: "var(--font-display)", fontSize: 28, fontWeight: 400, margin: 0 }}>AI 能预测你的行为吗？</h2>
        <p style={{ fontFamily: "var(--font-display)", fontSize: 14, fontStyle: "italic", color: "var(--muted)", margin: 0 }}>
          粘贴对话记录或认知画像，系统会构建认知模型并生成个性化预测题
        </p>
      </div>

      {/* Quick actions when saved state exists */}
      {(hasSavedPredictions || hasSavedModel) && (
        <div style={{ border: "1px solid var(--card-border)", padding: 20 }}>
          <p className="eyebrow" style={{ marginBottom: 8 }}>检测到已有数据</p>
          {cognitiveModel && (
            <p style={{ fontSize: 12, color: "var(--muted)", margin: "0 0 12px" }}>
              模型：{cognitiveModel.dimensions.length} 个维度 · {cognitiveModel.summary.slice(0, 60)}...
            </p>
          )}
          <div style={{ display: "flex", flexWrap: "wrap", gap: 12 }}>
            {hasSavedPredictions && hasSavedAnswers && (
              <button
                onClick={handleResume}
                style={{ fontSize: 13, fontWeight: 500, padding: "9px 20px", borderRadius: 9999, border: 0, cursor: "pointer", background: "var(--accent)", color: "#fff", transition: "opacity 200ms" }}
              >
                继续上次的问卷
              </button>
            )}
            {hasSavedPredictions && !hasSavedAnswers && (
              <button
                onClick={handleResume}
                style={{ fontSize: 13, fontWeight: 500, padding: "9px 20px", borderRadius: 9999, border: 0, cursor: "pointer", background: "var(--accent)", color: "#fff", transition: "opacity 200ms" }}
              >
                开始答题
              </button>
            )}
            {hasSavedModel && (
              <button
                onClick={handleRegenerate}
                style={{ fontSize: 13, padding: "9px 19px", borderRadius: 9999, border: "1px solid var(--card-border)", cursor: "pointer", background: "transparent", color: "var(--muted)", transition: "all 200ms" }}
              >
                已有模型，重新出题
              </button>
            )}
            <button
              onClick={handleReset}
              style={{ fontSize: 12, color: "var(--muted-soft)", background: "transparent", border: 0, cursor: "pointer", textDecoration: "underline", textUnderlineOffset: 4, fontFamily: "inherit" }}
            >
              重新开始
            </button>
          </div>
        </div>
      )}

      <div style={{ border: "1px solid var(--card-border)", padding: 20 }}>
        {/* Mode tabs */}
        <div style={{ display: "flex", gap: 0, borderBottom: "1px solid var(--card-border)", marginBottom: 20 }}>
          <button
            onClick={() => setInputMode("text")}
            style={{ flex: 1, fontSize: 13, padding: "8px 0", background: "transparent", border: "none", borderBottom: inputMode === "text" ? "2px solid var(--accent)" : "2px solid transparent", cursor: "pointer", color: inputMode === "text" ? "var(--foreground)" : "var(--muted)", transition: "all 150ms" }}
          >
            粘贴对话文本
          </button>
          <button
            onClick={() => setInputMode("model")}
            style={{ flex: 1, fontSize: 13, padding: "8px 0", background: "transparent", border: "none", borderBottom: inputMode === "model" ? "2px solid var(--accent)" : "2px solid transparent", cursor: "pointer", color: inputMode === "model" ? "var(--foreground)" : "var(--muted)", transition: "all 150ms" }}
          >
            导入认知模型
          </button>
        </div>

        {inputMode === "text" ? (
          <>
            <div style={{ borderLeft: "2px solid var(--accent)", paddingLeft: 20, marginBottom: 16 }}>
              <textarea
                value={profileText}
                onChange={(e) => setProfileText(e.target.value)}
                placeholder={"粘贴你与 AI 的对话记录、认知画像文本、或任何能反映你思维方式的文本...\n\n越丰富的文本 → 越精准的认知模型 → 越有区分度的预测题。\n\n建议至少 500 字。"}
                rows={12}
                style={{ width: "100%", background: "transparent", border: "none", padding: 0, fontSize: 14, color: "var(--foreground)", fontFamily: "inherit", lineHeight: 1.75, outline: "none", resize: "vertical", boxSizing: "border-box" }}
              />
            </div>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <span style={{ fontSize: 12, color: "var(--muted)" }}>
                {profileText.trim().length} 字
                {profileText.trim().length > 0 && profileText.trim().length < 50 && " (至少需要 50 字)"}
              </span>
              <button
                onClick={handleBuild}
                disabled={profileText.trim().length < 50}
                style={{ fontSize: 13, fontWeight: 500, padding: "10px 24px", borderRadius: 9999, border: 0, cursor: "pointer", background: "var(--accent)", color: "#fff", opacity: profileText.trim().length < 50 ? 0.4 : 1, transition: "opacity 200ms" }}
              >
                开始建模
              </button>
            </div>
          </>
        ) : (
          <>
            <p style={{ fontSize: 12, color: "var(--muted)", margin: "0 0 12px" }}>
              上传 cognitive_model JSON 文件，跳过建模直接生成预测题。
            </p>
            <div
              style={{ border: "2px dashed var(--card-border)", padding: 32, textAlign: "center", cursor: "pointer", transition: "border-color 150ms" }}
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
                style={{ display: "none" }}
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) handleFileSelect(file);
                }}
              />
              {modelJson ? (
                <div>
                  <p style={{ fontSize: 14, color: "var(--success)", margin: "0 0 4px" }}>已加载模型</p>
                  <p style={{ fontSize: 12, color: "var(--muted)", margin: "0 0 4px" }}>{modelFileName}</p>
                  <p style={{ fontSize: 12, color: "var(--muted)", margin: 0 }}>点击重新选择文件</p>
                </div>
              ) : (
                <div>
                  <p style={{ fontSize: 14, margin: "0 0 4px" }}>点击选择文件或拖拽到这里</p>
                  <p style={{ fontSize: 12, color: "var(--muted)", margin: 0 }}>支持 .json 格式</p>
                </div>
              )}
            </div>
            <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 16 }}>
              <button
                onClick={handleImportModel}
                disabled={!modelJson.trim()}
                style={{ fontSize: 13, fontWeight: 500, padding: "10px 24px", borderRadius: 9999, border: 0, cursor: "pointer", background: "var(--accent)", color: "#fff", opacity: !modelJson.trim() ? 0.4 : 1, transition: "opacity 200ms" }}
              >
                导入并出题
              </button>
            </div>
          </>
        )}
      </div>

      {error && (
        <p style={{ fontSize: 13, color: "var(--error)" }}>{error}</p>
      )}

      <div style={{ borderTop: "1px solid var(--card-border)", paddingTop: 20 }}>
        <p className="eyebrow" style={{ marginBottom: 12 }}>流程说明</p>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12 }}>
          {[
            { step: "1", label: "粘贴文本", desc: "对话记录或画像" },
            { step: "2", label: "AI 建模", desc: "~30-60 秒" },
            { step: "3", label: "回答问卷", desc: "14 题，凭直觉" },
            { step: "4", label: "查看报告", desc: "准确率 + 分析" },
          ].map((s) => (
            <div key={s.step} style={{ textAlign: "center" }}>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--accent)", marginBottom: 4 }}>{s.step}</div>
              <p style={{ fontSize: 13, margin: "0 0 2px" }}>{s.label}</p>
              <p style={{ fontSize: 11, color: "var(--muted)", margin: 0 }}>{s.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ── Sub-components ── */

function Section({ tier, title, desc }: { tier: number; title: string; desc: string; color: string }) {
  return (
    <div style={{ paddingTop: 16, borderTop: "1px solid var(--card-border)" }}>
      <p className="eyebrow" style={{ marginBottom: 4 }}>
        第{tier}层 · {title}
      </p>
      <p style={{ fontFamily: "var(--font-display)", fontSize: 13, fontStyle: "italic", color: "var(--muted-soft)", margin: 0 }}>
        {desc}
      </p>
    </div>
  );
}

const CTX_LABELS: Record<string, Record<string, string>> = {
  time_pressure: { none: "无时间压力", low: "轻度时间压力", high: "高时间压力" },
  social_pressure: { none: "无社交压力", low: "轻度社交压力", high: "高社交压力" },
  caring_level: { low: "低关心度", medium: "中关心度", high: "高关心度" },
  energy_state: { rested: "精力充沛", normal: "正常状态", depleted: "疲惫" },
};
function ContextTags({ context }: { context?: SituationContext }) {
  if (!context) return null;
  const tags = Object.entries(context).filter(([, v]) => v && v !== "none" && v !== "normal");
  if (tags.length === 0) return null;
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 8 }}>
      {tags.map(([key, val]) => (
        <span key={key} style={{ fontSize: 10, padding: "2px 8px", borderRadius: 9999, border: "1px solid var(--card-border)", color: "var(--muted-soft)" }}>
          {CTX_LABELS[key]?.[val] || val}
        </span>
      ))}
    </div>
  );
}

function QCard({ num, children }: { num: number; children: React.ReactNode }) {
  return (
    <div style={{ borderBottom: "1px solid var(--card-border)", padding: "20px 0" }}>
      <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: "0.05em", color: "var(--muted-soft)", display: "block", marginBottom: 8 }}>
        Q{num}
      </span>
      {children}
    </div>
  );
}

function TierBadge({ tier }: { tier: number }) {
  const tone = tier === 1 ? "#5e7a8a" : tier === 2 ? "#a86c3a" : "#9a5a6e";
  return (
    <span style={{ fontSize: 11, padding: "2px 8px", borderRadius: 9999, border: `1px solid ${tone}66`, background: `${tone}1a`, color: tone }}>
      {TIER_LABELS[tier]}
    </span>
  );
}

function ScoreCard({ label, value }: { label: string; value: number; color: string }) {
  return (
    <div style={{ border: "1px solid var(--card-border)", padding: "16px 20px", textAlign: "center" }}>
      <p style={{ fontFamily: "var(--font-display)", fontSize: 24, fontWeight: 400, margin: "0 0 4px" }}>
        {(value * 100).toFixed(0)}%
      </p>
      <p style={{ fontSize: 12, color: "var(--muted)", margin: 0 }}>{label}</p>
    </div>
  );
}

function ScoreBadge({ score }: { score: number }) {
  const pct = Math.round(score * 100);
  const tone = pct >= 80 ? "#4f7a4d" : pct >= 50 ? "#b07a2e" : "#a8453a";
  return (
    <span style={{ fontSize: 11, padding: "2px 8px", borderRadius: 9999, border: `1px solid ${tone}66`, background: `${tone}1a`, color: tone }}>
      {pct}%
    </span>
  );
}

function GradientBar({ report }: { report: ScoreReport }) {
  const t1 = Math.round(report.tier_1_accuracy * 100);
  const t2 = Math.round(report.tier_2_accuracy * 100);
  const t3 = Math.round(report.tier_3_accuracy * 100);
  const bars = [
    { label: "偏好", pct: t1, tone: "#5e7a8a" },
    { label: "推理", pct: t2, tone: "#a86c3a" },
    { label: "盲区", pct: t3, tone: "#9a5a6e" },
  ];
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {bars.map((b) => (
        <div key={b.label} style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <span style={{ fontSize: 12, width: 40, color: b.tone }}>{b.label}</span>
          <div style={{ flex: 1, height: 4, background: "var(--card-border)", borderRadius: 9999, overflow: "hidden" }}>
            <div style={{ height: "100%", width: `${b.pct}%`, background: b.tone, borderRadius: 9999, transition: "width 500ms" }} />
          </div>
          <span style={{ fontFamily: "var(--font-mono)", fontSize: 12, width: 48, textAlign: "right" }}>{b.pct}%</span>
        </div>
      ))}
      <p style={{ fontSize: 12, color: "var(--muted)", margin: 0 }}>
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
      textStyle: { color: "#6b5f50", fontSize: 11 },
      bottom: 0,
    },
    grid: { top: 10, right: 20, bottom: 35, left: 40 },
    xAxis: {
      type: "category" as const,
      data: rounds,
      axisLabel: { color: "#948774", fontSize: 11 },
      axisLine: { lineStyle: { color: "#e4dccb" } },
    },
    yAxis: {
      type: "value" as const,
      min: 0,
      max: 1,
      axisLabel: { color: "#948774", fontSize: 11, formatter: (v: number) => `${Math.round(v * 100)}%` },
      splitLine: { lineStyle: { color: "#e4dccb" } },
    },
    series: [
      { name: "综合", type: "line" as const, data: sorted.map((r) => r.overall_accuracy), lineStyle: { width: 2, color: "#8a4a2a" }, itemStyle: { color: "#8a4a2a" } },
      { name: "偏好", type: "line" as const, data: sorted.map((r) => r.tier_1_accuracy), lineStyle: { width: 1, color: "#5e7a8a" }, itemStyle: { color: "#5e7a8a" } },
      { name: "推理", type: "line" as const, data: sorted.map((r) => r.tier_2_accuracy), lineStyle: { width: 1, color: "#a86c3a" }, itemStyle: { color: "#a86c3a" } },
      { name: "盲区", type: "line" as const, data: sorted.map((r) => r.tier_3_accuracy), lineStyle: { width: 1, color: "#9a5a6e" }, itemStyle: { color: "#9a5a6e" } },
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
      axisName: { color: "#6b5f50", fontSize: 13, fontFamily: "var(--font-display)", fontStyle: "italic" },
      splitArea: { areaStyle: { color: ["transparent"] } },
      splitLine: { lineStyle: { color: "#e4dccb" } },
      axisLine: { lineStyle: { color: "#e4dccb" } },
    },
    series: [{
      type: "radar",
      data: [{
        value: [report.tier_1_accuracy, report.tier_2_accuracy, report.tier_3_accuracy],
        areaStyle: { color: "rgba(138,74,42,0.1)" },
        lineStyle: { color: "#8a4a2a", width: 2 },
        itemStyle: { color: "#8a4a2a" },
      }],
    }],
  };
  return <ReactEChartsSSR option={option} style={{ height: 240 }} />;
}
