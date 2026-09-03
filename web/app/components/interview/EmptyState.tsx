"use client";

import { DIM_NAMES_ZH } from "./types";

interface EmptyStateProps {
  isRefineMode: boolean;
  focusDims: string[];
  loading: boolean;
  error: string;
  onStart: () => void;
}

// ── Render: Empty state ──────────────────────────────────────
export default function EmptyState({ isRefineMode, focusDims, loading, error, onStart }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center" style={{ minHeight: "60vh" }}>
      <div className="text-center" style={{ maxWidth: 480 }}>
        {isRefineMode && focusDims.length > 0 ? (
          <>
            <p style={{ fontFamily: "var(--font-display)", fontSize: 24, fontWeight: 400, fontStyle: "italic", lineHeight: 1.5, margin: "0 0 16px" }}>
              针对以下维度进行深度对话修正
            </p>
            <div className="flex flex-wrap gap-2 justify-center" style={{ marginBottom: 32 }}>
              {focusDims.map((d) => (
                <span
                  key={d}
                  style={{ fontSize: 11, padding: "3px 10px", borderRadius: 9999, border: "1px solid rgba(138,74,42,0.25)", background: "rgba(138,74,42,0.06)", color: "var(--accent)" }}
                >
                  {DIM_NAMES_ZH[d] || d}
                </span>
              ))}
            </div>
          </>
        ) : (
          <p style={{ fontFamily: "var(--font-display)", fontSize: 24, fontWeight: 400, fontStyle: "italic", lineHeight: 1.5, margin: "0 0 32px" }}>
            随便聊聊。聊到第几句，<br/>我就开始懂你怎么想了。
          </p>
        )}
        <button
          onClick={onStart}
          disabled={loading}
          style={{ fontSize: 13, fontWeight: 500, padding: "10px 24px", borderRadius: 9999, border: 0, cursor: "pointer", background: "var(--accent)", color: "#fff", opacity: loading ? 0.4 : 1, transition: "opacity 200ms" }}
        >
          {loading
            ? "正在准备..."
            : isRefineMode
              ? "开始修正对话"
              : "开始对话"}
        </button>
        {error && <p style={{ fontSize: 14, color: "var(--error)", marginTop: 8 }}>{error}</p>}
      </div>
    </div>
  );
}
