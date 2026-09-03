"use client";

import type { CognitiveModel } from "./predictor/types";
import { usePredictorState } from "./predictor/usePredictorState";
import { usePredictorActions } from "./predictor/usePredictorActions";
import ResultsView from "./predictor/ResultsView";
import QuizView from "./predictor/QuizView";
import InputView from "./predictor/InputView";

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
  const state = usePredictorState({ predictModel, onPredictModelConsumed });
  const actions = usePredictorActions(state);

  /* ── RENDER: Step 4 — Results ── */
  if (state.step === "results" && state.scores) {
    return <ResultsView state={state} actions={actions} onRequestRefine={onRequestRefine} />;
  }

  /* ── RENDER: Step 3 — Scoring ── */
  if (state.step === "scoring") {
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
  if (state.step === "building") {
    return (
      <div className="flex flex-col items-center justify-center" style={{ minHeight: "60vh" }}>
        <div className="text-center">
          <div style={{ width: 32, height: 32, margin: "0 auto 20px", border: "1.5px solid var(--accent)", borderTopColor: "transparent", borderRadius: 9999 }} className="animate-spin" />
          <p style={{ fontFamily: "var(--font-display)", fontSize: 17, fontWeight: 400, fontStyle: "italic", margin: "0 0 8px" }}>
            {state.buildProgress}
          </p>
          <p style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--muted-soft)", margin: 0 }}>
            建模 + 生成预测题
          </p>
        </div>
      </div>
    );
  }

  /* ── RENDER: Step 2 — Quiz ── */
  if (state.step === "quiz" && state.predictions) {
    return <QuizView state={state} actions={actions} />;
  }

  /* ── RENDER: Step 0 — Input ── */
  return <InputView state={state} actions={actions} />;
}
