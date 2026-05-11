"use client";

import { useState, useCallback } from "react";
import Research from "./components/Research";
import Predictor from "./components/Predictor";
import Interview from "./components/Interview";
import Validator from "./components/Validator";
import Playground from "./components/Playground";
import Landing from "./components/Landing";

const TABS = [
  { key: "landing", label: "概览" },
  { key: "interview", label: "认知访谈" },
  { key: "validate", label: "模型验证" },
  { key: "predict", label: "认知预测" },
  { key: "playground", label: "Playground" },
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
  const [tab, setTab] = useState<Tab>("landing");
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

  const handleNavigate = useCallback((target: string) => {
    setTab(target as Tab);
  }, []);

  return (
    <main className="min-h-screen flex flex-col">
      {/* Header */}
      <header className="border-b border-[var(--card-border)]">
        <div className="max-w-4xl mx-auto flex items-center justify-between" style={{ padding: "14px 24px" }}>
          <h1
            className="text-[18px] tracking-[-0.011em] text-[var(--foreground)]"
            style={{ margin: 0, fontFamily: "var(--font-display)", fontWeight: 400, cursor: "pointer" }}
            onClick={() => setTab("landing")}
          >
            Nous
          </h1>
          <nav className="flex rounded-lg bg-[var(--card)]" style={{ gap: 2, padding: 4 }}>
            {TABS.map((t) => (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                className={`text-[13px] transition-all duration-200 ${
                  tab === t.key
                    ? "bg-[var(--accent-soft)] text-[var(--accent)] font-medium"
                    : "text-[var(--muted)] hover:text-[var(--foreground)]"
                }`}
                style={{ padding: "6px 14px", borderRadius: 6, border: 0, cursor: "pointer", fontFamily: "inherit" }}
              >
                {t.label}
              </button>
            ))}
          </nav>
        </div>
      </header>

      {/* Content */}
      <div className="flex-1 max-w-4xl w-full mx-auto px-6 py-8">
        {tab === "landing" && <Landing onNavigate={handleNavigate} />}
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
        {tab === "predict" && (
          <Predictor
            onRequestRefine={handleRequestRefine}
            predictModel={predictModel}
            onPredictModelConsumed={handlePredictModelConsumed}
          />
        )}
        {tab === "playground" && <Playground />}
        {tab === "research" && <Research />}
      </div>
    </main>
  );
}
