"use client";

import { useState } from "react";
import { DIM_NAMES_ZH, TRIAGE_META, type ChannelTheme, type TwinAnalysis } from "./threads";

// ── 手机状态栏（演示用静态内容） ──────────────────────────────

export function StatusBar({ bg, color }: { bg: string; color: string }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 18px 4px", background: bg, flexShrink: 0 }}>
      <span style={{ fontSize: 11, fontWeight: 600, color }}>9:41</span>
      <span style={{ fontSize: 9, color, letterSpacing: "0.05em" }}>●●●○ 5G ▮</span>
    </div>
  );
}

// ── 消息气泡（按宿主 App 主题渲染） ───────────────────────────

export interface Bubble {
  from: "them" | "me" | "note";
  text: string;
}

export function MessageBubbles({ bubbles, theme }: { bubbles: Bubble[]; theme: ChannelTheme }) {
  return (
    <>
      {bubbles.map((b, i) => {
        if (b.from === "note") {
          return (
            <p key={i} style={{ fontSize: 10.5, color: theme.noteColor, textAlign: "center", margin: "4px 0", lineHeight: 1.6 }}>
              — {b.text} —
            </p>
          );
        }
        const mine = b.from === "me";
        return (
          <div key={i} style={{ display: "flex", justifyContent: mine ? "flex-end" : "flex-start" }}>
            <div
              style={{
                maxWidth: "78%",
                padding: "9px 13px",
                borderRadius: mine ? "10px 10px 3px 10px" : "10px 10px 10px 3px",
                background: mine ? theme.myBubbleBg : theme.theirBubbleBg,
                color: mine ? theme.myBubbleColor : theme.theirBubbleColor,
                boxShadow: "0 1px 1px rgba(0,0,0,0.04)",
              }}
            >
              <p style={{ fontSize: 13.5, lineHeight: 1.6, margin: 0 }}>{b.text}</p>
            </div>
          </div>
        );
      })}
    </>
  );
}

export function TypingIndicator({ name, theme }: { name: string; theme: ChannelTheme }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      <div
        style={{ width: 12, height: 12, border: `1.5px solid ${theme.noteColor}`, borderTopColor: "transparent", borderRadius: 9999 }}
        className="animate-spin"
      />
      <span style={{ fontSize: 11, color: theme.noteColor }}>{name} 正在输入...</span>
    </div>
  );
}

// ── Nous 分身建议浮层——刻意保持 Nous 自己的设计语言，
//    悬浮在宿主 App 皮肤之上（宿主 App + 认知层 的产品关系）──────

interface SuggestionProps {
  analysis: TwinAnalysis;
  editing: boolean;
  editText: string;
  onEditChange: (text: string) => void;
  onSend: () => void;
  onStartEdit: () => void;
  onSendEdit: () => void;
  onAcknowledge: () => void;
}

export function SuggestionPanel({
  analysis, editing, editText, onEditChange, onSend, onStartEdit, onSendEdit, onAcknowledge,
}: SuggestionProps) {
  const [showGrounding, setShowGrounding] = useState(false);
  const triage = TRIAGE_META[analysis.triage.action];
  const hasDraft = analysis.draft !== null;

  const btn = (primary: boolean): React.CSSProperties => ({
    fontFamily: "inherit", fontSize: 12, padding: "6px 14px",
    border: `1px solid ${primary ? "var(--accent)" : "var(--card-border)"}`,
    background: primary ? "var(--accent)" : "transparent",
    color: primary ? "#fff" : "var(--muted)",
    cursor: "pointer", borderRadius: 6,
  });

  return (
    <div style={{
      background: "var(--card)",
      borderTop: "2px solid var(--accent)",
      borderRadius: "14px 14px 0 0",
      boxShadow: "0 -6px 24px rgba(0,0,0,0.13)",
      padding: "10px 14px 12px",
      display: "flex", flexDirection: "column", gap: 10,
      flexShrink: 0,
    }}>
      {/* Nous 层标识 + triage */}
      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <span style={{
          width: 16, height: 16, borderRadius: 5, flexShrink: 0,
          background: "var(--accent)", color: "#fff",
          display: "inline-flex", alignItems: "center", justifyContent: "center",
          fontFamily: "var(--font-display)", fontSize: 10,
        }}>
          N
        </span>
        <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, letterSpacing: "0.08em", color: "var(--muted-soft)" }}>
          NOUS 分身
        </span>
        <span style={{
          marginLeft: "auto", fontFamily: "var(--font-mono)", fontSize: 9.5, padding: "2px 8px",
          border: `1px solid ${triage.color}`, color: triage.color, letterSpacing: "0.05em",
        }}>
          {triage.label}
        </span>
      </div>

      <p style={{ fontSize: 11.5, color: "var(--muted)", lineHeight: 1.55, margin: 0 }}>{analysis.triage.reason}</p>

      {/* 质检警告 */}
      {analysis.gap_note && (
        <div style={{ borderLeft: "2px solid var(--accent)", paddingLeft: 10 }}>
          <p style={{ fontFamily: "var(--font-display)", fontSize: 11.5, fontStyle: "italic", lineHeight: 1.6, margin: 0, color: "var(--muted)" }}>
            <span style={{ fontStyle: "normal", fontWeight: 600, color: "var(--accent)" }}>质检 · </span>
            {analysis.gap_note}
          </p>
        </div>
      )}

      {/* 草稿 / 改写 */}
      {hasDraft && !editing && (
        <div style={{ border: "1px dashed var(--card-border)", background: "var(--background)", padding: "9px 12px", borderRadius: 8 }}>
          <p style={{ fontSize: 13, lineHeight: 1.6, margin: 0, color: "var(--foreground)" }}>{analysis.draft}</p>
        </div>
      )}
      {editing && (
        <textarea
          value={editText}
          onChange={(e) => onEditChange(e.target.value)}
          style={{
            fontFamily: "var(--font-sans)", fontSize: 13, lineHeight: 1.6, padding: "9px 12px",
            border: "1px solid var(--accent)", background: "var(--background)", color: "var(--foreground)",
            borderRadius: 8, resize: "vertical", minHeight: 56, outline: "none",
          }}
        />
      )}

      {/* 依据（折叠） */}
      <div>
        <button
          onClick={() => setShowGrounding((v) => !v)}
          style={{
            fontFamily: "var(--font-mono)", fontSize: 9.5, letterSpacing: "0.05em",
            border: 0, background: "transparent", color: "var(--muted-soft)", cursor: "pointer", padding: 0,
          }}
        >
          认知依据 {showGrounding ? "▴" : "▾"}
        </button>
        {showGrounding && (
          <div style={{ display: "flex", flexDirection: "column", gap: 5, marginTop: 6 }}>
            {analysis.grounding.map((g, i) => (
              <div key={i} style={{ display: "flex", gap: 8, alignItems: "baseline" }}>
                <span style={{
                  fontFamily: "var(--font-mono)", fontSize: 9, flexShrink: 0, padding: "1px 6px",
                  border: "1px solid var(--card-border)", color: "var(--accent)",
                }}>
                  {DIM_NAMES_ZH[g.dimension] || g.dimension}
                </span>
                <span style={{ fontSize: 11, color: "var(--muted)", lineHeight: 1.55 }}>{g.note}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 动作 */}
      <div style={{ display: "flex", gap: 8 }}>
        {hasDraft ? (
          editing ? (
            <button onClick={onSendEdit} disabled={editText.trim().length === 0} style={{ ...btn(true), opacity: editText.trim().length === 0 ? 0.4 : 1 }}>
              按我的版本发送
            </button>
          ) : (
            <>
              <button onClick={onSend} style={btn(true)}>发送</button>
              <button onClick={onStartEdit} style={btn(false)}>改写</button>
            </>
          )
        ) : (
          <button onClick={onAcknowledge} style={btn(false)}>
            {analysis.triage.action === "personal" ? "我来回" : "不回，划走"}
          </button>
        )}
      </div>
    </div>
  );
}
