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

  const handleGoPredict = useCallback(
    (model: CognitiveModelType) => {
      setPredictModel(model);
      setTab("predict");
    },
    [],
  );

  return (
    <main className="min-h-screen flex flex-col">
      {/* Header */}
      <header className="border-b border-[var(--card-border)]">
        <div className="max-w-4xl mx-auto px-6 py-4 flex items-center justify-between">
          <h1 className="text-lg font-semibold tracking-tight text-[var(--foreground)]">
            Nous
          </h1>
          <nav className="flex gap-0.5 rounded-lg bg-[var(--card)] p-1">
            {TABS.map((t) => (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                className={`px-3.5 py-1.5 text-[13px] rounded-md transition-all duration-200 ${
                  tab === t.key
                    ? "bg-[var(--accent-soft)] text-[var(--accent)] font-medium"
                    : "text-[var(--muted)] hover:text-[var(--foreground)]"
                }`}
              >
                {t.label}
              </button>
            ))}
          </nav>
        </div>
      </header>

      {/* Content */}
      <div className="flex-1 max-w-4xl w-full mx-auto px-6 py-8">
        {tab === "interview" && (
          <Interview
            refineRequest={refineRequest}
            onRefineConsumed={handleRefineConsumed}
            onModelReady={handleModelReady}
          />
        )}
        {tab === "validate" && (
          <Validator
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
