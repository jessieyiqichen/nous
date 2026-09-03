"use client";

import { useState, useRef, useEffect } from "react";
import { postJSON } from "@/lib/fetch";
import type { CognitiveModel, Predictions, RefinementResult, RoundRecord, ScoreReport, Step } from "./types";
import { LS_KEYS, lsGet, lsSet } from "./storage";
import { isStaleSchema, normalizePredictions, validatePredictions } from "./predictions";
import { getConflicts, getSignals } from "./interviewData";

interface PredictModelProps {
  predictModel?: CognitiveModel | null;
  onPredictModelConsumed?: () => void;
}

export function usePredictorState({ predictModel, onPredictModelConsumed }: PredictModelProps) {
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
          const data = await postJSON<{ predictions: Record<string, unknown> }>(
            "/api/predict",
            { model: predictModel, conflicts: getConflicts(), signals: getSignals() },
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
        else {
          // 旧 schema：只清题目和作答。成绩/模型/轮次历史保留——
          // 原先全量清除连成绩一起删（S01 数据丢失的根因）
          [LS_KEYS.predictions, LS_KEYS.t1, LS_KEYS.t2, LS_KEYS.t3, LS_KEYS.step]
            .forEach((k) => localStorage.removeItem(k));
          // step 已在上方读入，题目没了不能停在 quiz/results（会查不到题）
          setStep("input");
        }
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

  return {
    step, setStep,
    profileText, setProfileText,
    cognitiveModel, setCognitiveModel,
    predictions, setPredictions,
    scores, setScores,
    error, setError,
    buildProgress, setBuildProgress,
    refining, setRefining,
    refinement, setRefinement,
    testRound, setTestRound,
    topRef,
    inputMode, setInputMode,
    modelJson, setModelJson,
    modelFileName, setModelFileName,
    fileInputRef,
    t1Answers, setT1Answers,
    t2Answers, setT2Answers,
    t3Answers, setT3Answers,
    roundHistory, setRoundHistory,
    hasSavedModel, hasSavedPredictions, hasSavedAnswers,
    totalQ, answered,
  };
}

export type PredictorState = ReturnType<typeof usePredictorState>;
