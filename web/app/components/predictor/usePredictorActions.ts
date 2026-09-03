"use client";

import { postJSON } from "@/lib/fetch";
import { syncSnapshot } from "@/lib/sync";
import type { CognitiveModel, PairScore, RefinementResult, RoundRecord, ScoreReport } from "./types";
import { ERROR_TYPES } from "./types";
import { LS_KEYS, lsSet, lsClear, appendResultsLog } from "./storage";
import { normalizePredictions, validatePredictions } from "./predictions";
import { getConflicts, getSignals } from "./interviewData";
import type { PredictorState } from "./usePredictorState";

export function usePredictorActions(state: PredictorState) {
  const {
    setStep, profileText, cognitiveModel, setCognitiveModel,
    predictions, setPredictions, scores, setScores, setError,
    setBuildProgress, setRefining, refinement, setRefinement,
    testRound, setTestRound, topRef, modelJson, setModelJson,
    setModelFileName, setProfileText, t1Answers, setT1Answers,
    t2Answers, setT2Answers, setT3Answers, roundHistory, setRoundHistory,
  } = state;

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
      const data = await postJSON<{ predictions: Record<string, unknown> }>(
        "/api/predict",
        { model: cognitiveModel, conflicts: getConflicts(), signals: getSignals() },
      );

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
      const data = await postJSON<{ predictions: Record<string, unknown> }>(
        "/api/predict",
        { model: parsed },
      );

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
      const data = await postJSON<{ model: CognitiveModel; predictions: Record<string, unknown> }>(
        "/api/predict",
        { profile: profileText, conflicts: getConflicts(), signals: getSignals() },
      );

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
        return postJSON<{ tier: number; pair_scores: PairScore[]; tier_accuracy: number; key_findings: string }>(
          "/api/score",
          body,
        );
      };

      const [r1, r2, r3] = await Promise.all([fetchTier(1), fetchTier(2), fetchTier(3)]);

      // Normalize pair_scores in case the LLM returns them as JSON strings
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
      // 永久成绩日志：清理/重来/schema 迁移都不会删（S01 数据丢失的教训）
      appendResultsLog({
        savedAt: new Date().toISOString(),
        round: testRound,
        scores: combined,
        questions: predictions,
      });
      // 服务端快照（有邀请码时自动同步）
      syncSnapshot("scores", { round: testRound, scores: combined, questions: predictions });

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

      const data = await postJSON<RefinementResult>(
        "/api/refine",
        { model: cognitiveModel, scores, predictions, responses, conflicts: getConflicts() },
      );
      setRefinement(data);
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
      const data = await postJSON<{ predictions: Record<string, unknown> }>(
        "/api/predict",
        { model: newModel, conflicts: getConflicts(), signals: getSignals() },
      );

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

  return {
    handleResume, handleRegenerate, handleFileSelect, handleImportModel,
    handleBuild, handleSubmit, handleRefine, handleApplyRefinement, handleReset,
  };
}

export type PredictorActions = ReturnType<typeof usePredictorActions>;
