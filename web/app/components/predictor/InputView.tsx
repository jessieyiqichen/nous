"use client";

import type { PredictorState } from "./usePredictorState";
import type { PredictorActions } from "./usePredictorActions";

interface InputViewProps {
  state: PredictorState;
  actions: PredictorActions;
}

/* ── RENDER: Step 0 — Input ── */
export default function InputView({ state, actions }: InputViewProps) {
  const {
    profileText, setProfileText, cognitiveModel, error, topRef,
    inputMode, setInputMode, modelJson, modelFileName, fileInputRef,
    hasSavedModel, hasSavedPredictions, hasSavedAnswers,
  } = state;
  const {
    handleResume, handleRegenerate, handleReset,
    handleFileSelect, handleImportModel, handleBuild,
  } = actions;

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
