"use client";

import type { Dispatch, RefObject, SetStateAction } from "react";
import type { Conflict, DimensionCoverage, Message, Signal } from "./types";
import { DIM_NAMES_ZH } from "./types";

interface ChatViewProps {
  messages: Message[];
  turn: number;
  coverage: DimensionCoverage[];
  signals: Signal[];
  conflicts: Conflict[];
  isRefineMode: boolean;
  focusDims: string[];
  input: string;
  setInput: (v: string) => void;
  loading: boolean;
  analyzing: boolean;
  building: boolean;
  error: string;
  showPanel: boolean;
  setShowPanel: Dispatch<SetStateAction<boolean>>;
  inputRef: RefObject<HTMLTextAreaElement | null>;
  chatEndRef: RefObject<HTMLDivElement | null>;
  onSend: () => void;
  onEnd: () => void;
  onKeyDown: (e: React.KeyboardEvent) => void;
}

// ── Render: Chat phase ───────────────────────────────────────
export default function ChatView({
  messages, turn, coverage, signals, conflicts, isRefineMode, focusDims,
  input, setInput, loading, analyzing, building, error,
  showPanel, setShowPanel, inputRef, chatEndRef, onSend, onEnd, onKeyDown,
}: ChatViewProps) {
  return (
    <div style={{ display: "flex", gap: 20, height: "calc(100vh - 160px)" }}>
      {/* Chat area */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0 }}>
        {/* Mode indicator */}
        {isRefineMode && (
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12, paddingBottom: 12, borderBottom: "1px solid var(--card-border)", fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: "0.05em", textTransform: "uppercase" as const }}>
            <span style={{ color: "var(--accent)" }}>修正模式</span>
            <span style={{ color: "var(--card-border)" }}>/</span>
            <span style={{ color: "var(--muted-soft)" }}>
              {focusDims.map((d) => DIM_NAMES_ZH[d] || d).join(" · ")}
            </span>
          </div>
        )}

        {/* Messages — gutter labels, no bubbles */}
        <div style={{ flex: 1, overflowY: "auto", paddingBottom: 16 }}>
          {messages.map((msg, i) => (
            msg.role === "assistant" ? (
              <div key={i} style={{ display: "flex", gap: 16, padding: "20px 0", borderBottom: "1px solid var(--card-border)" }}>
                <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: "0.05em", textTransform: "uppercase", color: "var(--muted-soft)", flexShrink: 0, paddingTop: 3, width: 20 }}>
                  AI
                </span>
                <div style={{ fontSize: 14, lineHeight: 1.65, flex: 1 }}>
                  {msg.content}
                </div>
              </div>
            ) : (
              <div key={i} style={{ display: "flex", flexDirection: "row-reverse", gap: 16, padding: "20px 0", borderBottom: "1px solid var(--card-border)" }}>
                <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: "0.05em", textTransform: "uppercase", color: "var(--muted-soft)", flexShrink: 0, paddingTop: 3, width: 20, textAlign: "right" }}>
                  你
                </span>
                <div style={{ fontSize: 14, lineHeight: 1.75, flex: 1, textAlign: "right" }}>
                  {msg.content}
                </div>
              </div>
            )
          ))}
          {loading && (
            <div style={{ display: "flex", gap: 16, padding: "20px 0" }}>
              <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: "0.05em", textTransform: "uppercase", color: "var(--muted-soft)", flexShrink: 0, paddingTop: 3, width: 20 }}>
                AI
              </span>
              <div style={{ paddingTop: 3 }}>
                <span className="inline-flex gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-[var(--muted)] animate-bounce" style={{ animationDelay: "0ms" }} />
                  <span className="w-1.5 h-1.5 rounded-full bg-[var(--muted)] animate-bounce" style={{ animationDelay: "150ms" }} />
                  <span className="w-1.5 h-1.5 rounded-full bg-[var(--muted)] animate-bounce" style={{ animationDelay: "300ms" }} />
                </span>
              </div>
            </div>
          )}
          <div ref={chatEndRef} />
        </div>

        {/* Status bar */}
        <div style={{ display: "flex", justifyContent: "space-between", fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: "0.02em", color: "var(--muted-soft)", padding: "12px 0 8px", borderTop: "1px solid var(--card-border)" }}>
          <span>
            第 {turn} 轮
            {analyzing && " · 分析中"}
            {signals.length > 0 && ` · ${signals.length} 信号`}
            {conflicts.length > 0 && ` · ${conflicts.length} 矛盾`}
          </span>
          <div style={{ display: "flex", gap: 16 }}>
            <button
              onClick={() => setShowPanel(!showPanel)}
              style={{ background: "transparent", border: 0, color: "var(--muted-soft)", fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: "0.02em", cursor: "pointer", textDecoration: "underline", textUnderlineOffset: 4 }}
            >
              {showPanel ? "隐藏" : "面板"}
            </button>
            <button
              onClick={onEnd}
              disabled={loading || building || messages.length < 6}
              style={{ background: "transparent", border: 0, color: "var(--muted-soft)", fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: "0.02em", cursor: "pointer", textDecoration: "underline", textUnderlineOffset: 4, opacity: (loading || building || messages.length < 6) ? 0.3 : 1 }}
            >
              结束建模
            </button>
          </div>
        </div>

        {/* Input area — manuscript margin */}
        <div style={{ position: "relative", borderLeft: "2px solid var(--accent)", paddingLeft: 16 }}>
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="说点什么..."
            disabled={loading || building}
            rows={1}
            style={{ width: "100%", background: "transparent", border: "none", padding: "8px 40px 8px 0", fontSize: 14, color: "var(--foreground)", fontFamily: "inherit", outline: "none", resize: "none", opacity: (loading || building) ? 0.5 : 1, boxSizing: "border-box" }}
          />
          <button
            onClick={onSend}
            disabled={loading || !input.trim()}
            style={{ position: "absolute", right: 0, top: "50%", transform: "translateY(-50%)", background: "transparent", border: 0, color: "var(--accent)", cursor: "pointer", opacity: (loading || !input.trim()) ? 0.2 : 1, transition: "opacity 200ms", padding: 4 }}
          >
            <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
              <path d="M5 12h14M12 5l7 7-7 7" />
            </svg>
          </button>
        </div>

        {error && <p style={{ fontSize: 12, color: "var(--error)", marginTop: 8 }}>{error}</p>}
      </div>

      {/* Right panel: thin hairline track */}
      {showPanel && (
        <div style={{ width: 208, flexShrink: 0, paddingTop: 8 }}>
          <p className="eyebrow" style={{ marginBottom: 16 }}>
            {isRefineMode ? "修正进度" : "维度覆盖"}
          </p>
          {coverage.length === 0 ? (
            <p style={{ fontSize: 11, color: "var(--muted-soft)", margin: 0 }}>
              第 5 轮后开始追踪
            </p>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              {coverage.map((dim) => {
                const isFocus = focusDims.includes(dim.name);
                const fillWidths: Record<string, string> = { high: "100%", medium: "66%", low: "33%", none: "0%" };
                const fillColors: Record<string, string> = { high: "var(--success)", medium: "var(--accent)", low: "var(--muted)", none: "transparent" };
                return (
                  <div
                    key={dim.name}
                    style={{ opacity: isRefineMode && !isFocus ? 0.3 : 1 }}
                  >
                    <div style={{ height: 1, background: "var(--card-border)", position: "relative", marginBottom: 6 }}>
                      <div style={{ position: "absolute", top: 0, left: 0, height: "100%", background: fillColors[dim.confidence] || "transparent", width: fillWidths[dim.confidence] || "0%", transition: "width 500ms" }} />
                    </div>
                    <span style={{ fontFamily: "var(--font-display)", fontSize: 11, fontStyle: "italic", color: "var(--muted)", display: "block" }}>
                      {DIM_NAMES_ZH[dim.name] || dim.name}
                    </span>
                  </div>
                );
              })}
            </div>
          )}

          {/* Signal summary */}
          {signals.length > 0 && (
            <div style={{ marginTop: 20, paddingTop: 16, borderTop: "1px solid var(--card-border)" }}>
              <p style={{ fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: "0.02em", color: "var(--muted-soft)", margin: 0, lineHeight: 1.8 }}>
                {signals.length} 信号 · 行为 {signals.filter((s) => s.track === "behavioral").length} · 自述 {signals.filter((s) => s.track === "stated").length}
                {conflicts.length > 0 && <><br /><span style={{ color: "var(--accent)" }}>{conflicts.length} 矛盾</span></>}
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
