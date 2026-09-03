"use client";

import type { Dispatch, SetStateAction } from "react";
import InlineValidator from "../InlineValidator";
import PilotSubmit from "./PilotSubmit";
import type { CognitiveModel, Conflict, Message, Signal } from "./types";
import { DIM_NAMES_ZH } from "./types";

interface ResultViewProps {
  model: CognitiveModel;
  turn: number;
  signals: Signal[];
  conflicts: Conflict[];
  isRefineMode: boolean;
  focusDims: string[];
  showInlineValidator: boolean;
  setShowInlineValidator: Dispatch<SetStateAction<boolean>>;
  onModelReady?: (model: CognitiveModel) => void;
  onModelCorrected: (correctedModel: CognitiveModel) => void;
  onReset: () => void;
  /** 内测模式：隐藏验证/出题入口，展示提交结果面板 */
  pilot?: boolean;
  messages?: Message[];
}

// ── Render: Result state ─────────────────────────────────────
export default function ResultView({
  model, turn, signals, conflicts, isRefineMode, focusDims,
  showInlineValidator, setShowInlineValidator,
  onModelReady, onModelCorrected, onReset,
  pilot, messages,
}: ResultViewProps) {
  /** Shared dimension card renderer — hairline border, literary style */
  const renderDimCard = (dim: { name: string; description: string; behavioral_predictions: string[]; confidence: string }) => {
    const isFocus = isRefineMode && focusDims.includes(dim.name);
    return (
      <div
        key={dim.name}
        style={{
          border: `1px solid ${isFocus ? "var(--accent)" : "var(--card-border)"}`,
          background: isFocus ? "var(--accent-soft)" : "transparent",
          borderRadius: 0,
          padding: "16px 20px",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 8 }}>
          <h3 style={{ fontFamily: "var(--font-display)", fontSize: 15, fontWeight: 400, margin: 0 }}>
            {DIM_NAMES_ZH[dim.name] || dim.name}
          </h3>
          <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: "0.05em", textTransform: "uppercase" as const, color: "var(--muted-soft)" }}>
            {dim.confidence}
          </span>
        </div>
        <p style={{ fontSize: 13, color: "var(--muted)", lineHeight: 1.65, margin: "0 0 12px" }}>
          {dim.description.length > 60 ? dim.description.slice(0, 60) + "..." : dim.description}
        </p>
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {dim.behavioral_predictions.map((pred, i) => (
            <p
              key={i}
              style={{ fontSize: 12, color: "var(--muted-soft)", paddingLeft: 12, borderLeft: "1px solid var(--card-border)", margin: 0, lineHeight: 1.55 }}
            >
              {pred}
            </p>
          ))}
        </div>
      </div>
    );
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 28 }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div>
          <p className="eyebrow" style={{ marginBottom: 8 }}>
            {isRefineMode ? "修正后的模型" : "认知模型"} · {turn} 轮对话
          </p>
          <h2 style={{ fontFamily: "var(--font-display)", fontSize: 24, fontWeight: 400, margin: "0 0 4px" }}>
            {signals.length} 个信号，{conflicts.length} 个矛盾
          </h2>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          {!pilot && (
            <button
              onClick={() => setShowInlineValidator((v) => !v)}
              style={{ fontSize: 13, fontWeight: 500, padding: "10px 20px", borderRadius: 9999, border: 0, cursor: "pointer", background: "var(--accent)", color: "#fff", transition: "opacity 200ms" }}
            >
              {showInlineValidator ? "收起验证" : "开始验证"}
            </button>
          )}
          {!pilot && onModelReady && (
            <button
              onClick={() => onModelReady(model)}
              style={{ fontSize: 13, fontWeight: 500, padding: "9px 19px", borderRadius: 9999, border: "1px solid var(--card-border)", cursor: "pointer", background: "transparent", color: "var(--muted)", transition: "all 200ms" }}
            >
              直接出题
            </button>
          )}
          <button
            onClick={() => {
              const json = JSON.stringify(model, null, 2);
              const blob = new Blob([json], { type: "application/json" });
              const url = URL.createObjectURL(blob);
              const a = document.createElement("a");
              a.href = url;
              a.download = `cognitive_model_${new Date().toISOString().slice(0, 10)}.json`;
              a.click();
              URL.revokeObjectURL(url);
            }}
            style={{ fontSize: 13, fontWeight: 500, padding: "9px 19px", borderRadius: 9999, border: "1px solid var(--card-border)", cursor: "pointer", background: "transparent", color: "var(--muted)", transition: "all 200ms" }}
          >
            下载
          </button>
          {!pilot && (
            <button
              onClick={onReset}
              style={{ fontSize: 13, fontWeight: 500, padding: "9px 19px", borderRadius: 9999, border: "1px solid var(--card-border)", cursor: "pointer", background: "transparent", color: "var(--muted)", transition: "all 200ms" }}
            >
              重来
            </button>
          )}
        </div>
      </div>

      {/* Model details — collapsible when validator is shown */}
      {showInlineValidator ? (
        <details>
          <summary style={{ cursor: "pointer", fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: "0.05em", textTransform: "uppercase" as const, color: "var(--muted-soft)", padding: "4px 0" }}>
            查看模型详情 · {model.dimensions.length} 维度
          </summary>
          <div style={{ display: "flex", flexDirection: "column", gap: 20, marginTop: 16 }}>
            <p className="pull-quote">{model.summary}</p>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 1, border: "1px solid var(--card-border)" }}>
              {(model.dimensions || []).map(renderDimCard)}
            </div>
          </div>
        </details>
      ) : (
        <>
          {/* Summary — pull-quote */}
          <p className="pull-quote">{model.summary}</p>

          {/* Dimensions grid */}
          <div>
            <p className="eyebrow" style={{ marginBottom: 12 }}>9 个认知维度</p>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 1, border: "1px solid var(--card-border)" }}>
              {(model.dimensions || []).map(renderDimCard)}
            </div>
          </div>

          {/* Conflicts */}
          {conflicts.length > 0 && (
            <div>
              <p className="eyebrow" style={{ marginBottom: 12 }}>
                述行矛盾 · {conflicts.length}
              </p>
              <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
                {conflicts.map((c, i) => (
                  <div
                    key={i}
                    style={{ padding: "16px 0", borderBottom: "1px solid var(--card-border)", fontSize: 13, display: "flex", flexDirection: "column", gap: 4 }}
                  >
                    <p style={{ margin: 0 }}>
                      <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: "0.05em", textTransform: "uppercase" as const, color: "var(--muted-soft)", marginRight: 8 }}>声称</span>
                      {c.stated_claim}
                    </p>
                    <p style={{ margin: 0 }}>
                      <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: "0.05em", textTransform: "uppercase" as const, color: "var(--accent)", marginRight: 8 }}>实际</span>
                      {c.actual_behavior}
                    </p>
                    <p style={{ fontSize: 12, fontStyle: "italic", color: "var(--muted-soft)", margin: 0, paddingTop: 4 }}>
                      {c.blind_spot_evidence}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Signal stats */}
          {signals.length > 0 && (
            <div>
              <p className="eyebrow" style={{ marginBottom: 12 }}>
                认知信号 · {signals.length}
              </p>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                {Object.entries(
                  signals.reduce(
                    (acc, s) => {
                      acc[s.signal_type] = (acc[s.signal_type] || 0) + 1;
                      return acc;
                    },
                    {} as Record<string, number>
                  )
                ).map(([type, count]) => (
                  <span
                    key={type}
                    style={{ fontSize: 11, padding: "3px 10px", borderRadius: 9999, border: "1px solid var(--card-border)", color: "var(--muted)" }}
                  >
                    {type} <span style={{ fontFamily: "var(--font-mono)", fontSize: 10 }}>{count}</span>
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Next steps */}
          {!pilot && !showInlineValidator && (
            <div style={{ borderLeft: "1px solid var(--card-border)", paddingLeft: 20, marginTop: 8 }}>
              <p style={{ fontSize: 13, color: "var(--muted)", margin: 0, lineHeight: 1.65 }}>
                推荐先「开始验证」确认模型是否准确，再用「直接出题」进入认知预测。
              </p>
            </div>
          )}
        </>
      )}

      {/* Pilot: 提交测试结果 */}
      {pilot && (
        <PilotSubmit
          model={model} turn={turn}
          signals={signals} conflicts={conflicts}
          messages={messages || []}
        />
      )}

      {/* Inline Validator */}
      {showInlineValidator && (
        <InlineValidator
          model={model}
          onModelCorrected={onModelCorrected}
          onGoPredict={(m) => onModelReady?.(m)}
        />
      )}
    </div>
  );
}
