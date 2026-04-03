"use client";

import { useState, useCallback } from "react";
import Analyzer from "./components/Analyzer";
import Research from "./components/Research";
import Predictor from "./components/Predictor";
import Interview from "./components/Interview";
import Validator from "./components/Validator";

const TABS = [
  { key: "interview", label: "认知访谈" },
  { key: "validate", label: "模型验证" },
  { key: "analyze", label: "偏差检测" },
  { key: "predict", label: "认知预测" },
  { key: "research", label: "研究数据" },
] as const;
type Tab = (typeof TABS)[number]["key"];

export interface CognitiveModelType {
  dimensions: Array<{
    name: string;
    description: string;
    behavioral_predictions: string[];
    confidence: string;
  }>;
  summary: string;
}

export interface RefineRequest {
  model: CognitiveModelType;
  focusDimensions: string[];
}

export default function Home() {
  const [tab, setTab] = useState<Tab>("interview");
  const [refineRequest, setRefineRequest] = useState<RefineRequest | null>(null);
  const [predictModel, setPredictModel] = useState<CognitiveModelType | null>(null);
  const [validateModel, setValidateModel] = useState<CognitiveModelType | null>(null);

  const handleRequestRefine = useCallback(
    (req: RefineRequest) => {
      setRefineRequest(req);
      setTab("interview");
    },
    []
  );

  const handleRefineConsumed = useCallback(() => {
    setRefineRequest(null);
  }, []);

  const handleModelReady = useCallback(
    (model: CognitiveModelType) => {
      setPredictModel(model);
      setTab("predict");
    },
    []
  );

  const handlePredictModelConsumed = useCallback(() => {
    setPredictModel(null);
  }, []);

  const handleValidateModel = useCallback(
    (model: CognitiveModelType) => {
      setValidateModel(model);
      setTab("validate");
    },
    [],
  );

  const handleValidateModelConsumed = useCallback(() => {
    setValidateModel(null);
  }, []);

  const handleGoPredict = useCallback(
    (model: CognitiveModelType) => {
      setPredictModel(model);
      setTab("predict");
    },
    [],
  );

  return (
    <main className="min-h-screen">
      {/* Header */}
      <header className="border-b border-[var(--card-border)] px-6 py-5">
        <div className="max-w-5xl mx-auto flex items-baseline justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Nous</h1>
            <p className="text-sm text-[var(--muted)] mt-1">
              AI 认知偏差检测与行为预测
            </p>
          </div>
          <nav className="flex gap-1">
            {TABS.map((t) => (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                className={`px-4 py-1.5 text-sm rounded-md transition-colors ${
                  tab === t.key
                    ? "bg-white/10 text-white"
                    : "text-[var(--muted)] hover:text-white"
                }`}
              >
                {t.label}
              </button>
            ))}
          </nav>
        </div>
      </header>

      {/* Content */}
      <div className="max-w-5xl mx-auto px-6 py-8">
        {tab === "interview" && (
          <Interview
            refineRequest={refineRequest}
            onRefineConsumed={handleRefineConsumed}
            onModelReady={handleModelReady}
            onValidateModel={handleValidateModel}
          />
        )}
        {tab === "validate" && (
          <Validator
            validateModel={validateModel}
            onValidateModelConsumed={handleValidateModelConsumed}
            onGoPredict={handleGoPredict}
          />
        )}
        {tab === "analyze" && <Analyzer />}
        {tab === "predict" && (
          <Predictor
            onRequestRefine={handleRequestRefine}
            predictModel={predictModel}
            onPredictModelConsumed={handlePredictModelConsumed}
          />
        )}
        {tab === "research" && <Research />}
      </div>
    </main>
  );
}
