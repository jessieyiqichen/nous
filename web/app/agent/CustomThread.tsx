"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { postJSON } from "@/lib/fetch";
import { DEFAULT_CHANNEL_THEME, RELATION_OPTIONS, type TwinAnalysis } from "./threads";
import { MessageBubbles, SuggestionPanel, TypingIndicator, type Bubble } from "./parts";

interface Props {
  onBack: () => void;
  onCorrection: () => void;
  onStatus: (status: string) => void;
}

type Phase = "await" | "loading" | "suggest";

export default function CustomThread({ onBack, onCorrection, onStatus }: Props) {
  const [relation, setRelation] = useState(RELATION_OPTIONS[0]);
  const [bubbles, setBubbles] = useState<Bubble[]>([]);
  const [phase, setPhase] = useState<Phase>("await");
  const [suggestion, setSuggestion] = useState<TwinAnalysis | null>(null);
  const [input, setInput] = useState("");
  const [editing, setEditing] = useState(false);
  const [editText, setEditText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [bubbles, phase]);

  // 用户扮演对方发来一条消息 → 分身在线分析（DeepSeek）
  const receiveIncoming = useCallback(async () => {
    const content = input.trim();
    if (content.length === 0 || phase === "loading") return;
    setError(null);
    setInput("");
    const history = bubbles
      .filter((b) => b.from !== "note")
      .map((b) => ({ from: b.from as "them" | "me", text: b.text }));
    setBubbles((prev) => [...prev, { from: "them", text: content }]);
    setPhase("loading");

    try {
      const data = await postJSON<{ analysis: TwinAnalysis }>("/api/twin", {
        relation,
        content,
        history,
      });
      setSuggestion(data.analysis);
      setPhase("suggest");
      onStatus("待处理");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "在线分析暂时不可用。";
      setError(msg);
      setPhase("await");
    }
  }, [input, phase, bubbles, relation, onStatus]);

  const send = useCallback(
    (edited: boolean) => {
      const text = edited ? editText.trim() : suggestion?.draft;
      if (!text || !suggestion) return;
      // 修正信号落库（fire-and-forget）：改写对是分身最珍贵的学习数据
      const lastIncoming = [...bubbles].reverse().find((b) => b.from === "them")?.text ?? "";
      void postJSON("/api/twin/feedback", {
        source: "web-agent",
        relation,
        incoming: lastIncoming,
        draft: suggestion.draft,
        final: text,
        action: edited ? "edited" : "adopted",
      }).catch(() => { /* 静默：不影响发送体验 */ });
      setBubbles((prev) => [...prev, { from: "me", text }]);
      setEditing(false);
      setEditText("");
      setSuggestion(null);
      setPhase("await");
      if (edited) onCorrection();
      onStatus("已处理");
    },
    [editText, suggestion, bubbles, relation, onCorrection, onStatus],
  );

  const acknowledge = useCallback(() => {
    if (!suggestion) return;
    const note =
      suggestion.triage.action === "personal"
        ? "分身不代打在乎的关系——这条留给你亲自回"
        : "已折叠 · 不回";
    setBubbles((prev) => [...prev, { from: "note", text: note }]);
    setSuggestion(null);
    setPhase("await");
    onStatus("已处理");
  }, [suggestion, onStatus]);

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      {/* 线程头 */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 14px", borderBottom: "1px solid var(--card-border)", flexShrink: 0 }}>
        <button
          onClick={onBack}
          style={{ fontFamily: "inherit", fontSize: 16, border: 0, background: "transparent", color: "var(--accent)", cursor: "pointer", padding: 0, lineHeight: 1 }}
        >
          ‹
        </button>
        <div style={{ flex: 1 }}>
          <p style={{ fontSize: 14, fontWeight: 500, margin: 0, color: "var(--foreground)" }}>自定义会话</p>
          <p style={{ fontFamily: "var(--font-mono)", fontSize: 9, margin: 0, color: "var(--muted-soft)", letterSpacing: "0.04em" }}>
            你扮演发信人 · 分身替你接
          </p>
        </div>
      </div>

      {/* 发信人关系 */}
      <div style={{ display: "flex", gap: 6, padding: "10px 14px", flexWrap: "wrap", borderBottom: "1px solid var(--card-border)", flexShrink: 0 }}>
        {RELATION_OPTIONS.map((r) => (
          <button
            key={r}
            onClick={() => setRelation(r)}
            style={{
              fontFamily: "inherit", fontSize: 11, padding: "3px 10px",
              border: "1px solid var(--card-border)",
              background: relation === r ? "var(--accent-soft)" : "transparent",
              color: relation === r ? "var(--accent)" : "var(--muted)",
              cursor: "pointer", borderRadius: 9999,
            }}
          >
            {r}
          </button>
        ))}
      </div>

      {/* 消息区（微信皮肤沙盒） */}
      <div style={{ flex: 1, overflowY: "auto", padding: "16px 14px", display: "flex", flexDirection: "column", gap: 10, background: DEFAULT_CHANNEL_THEME.chatBg }}>
        {bubbles.length === 0 && (
          <p style={{ fontSize: 12, color: "var(--muted-soft)", textAlign: "center", lineHeight: 1.7, margin: "24px 12px" }}>
            在下方输入一条「对方发来的消息」，分身会按你的认知模型判断怎么接。在线分析由 DeepSeek 驱动。
          </p>
        )}
        <MessageBubbles bubbles={bubbles} theme={DEFAULT_CHANNEL_THEME} />
        {phase === "loading" && <TypingIndicator name="分身判断中" theme={DEFAULT_CHANNEL_THEME} />}
        {error && (
          <p style={{ fontSize: 11.5, color: "var(--error)", lineHeight: 1.6, margin: 0, textAlign: "center" }}>{error}</p>
        )}
        <div ref={bottomRef} />
      </div>

      {/* 建议浮层 或 来信输入框 */}
      {phase === "suggest" && suggestion ? (
        <SuggestionPanel
          analysis={suggestion}
          editing={editing}
          editText={editText}
          onEditChange={setEditText}
          onSend={() => send(false)}
          onStartEdit={() => {
            setEditing(true);
            setEditText(suggestion.draft ?? "");
          }}
          onSendEdit={() => send(true)}
          onAcknowledge={acknowledge}
        />
      ) : (
        <div style={{ borderTop: "1px solid var(--card-border)", padding: "10px 14px", display: "flex", gap: 8, flexShrink: 0 }}>
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="输入对方发来的消息..."
            disabled={phase === "loading"}
            onKeyDown={(e) => {
              if (e.key === "Enter") receiveIncoming();
            }}
            style={{
              flex: 1, fontFamily: "var(--font-sans)", fontSize: 13, padding: "8px 12px",
              border: "1px solid var(--card-border)", background: "var(--background)",
              color: "var(--foreground)", borderRadius: 9999, outline: "none",
            }}
          />
          <button
            onClick={receiveIncoming}
            disabled={phase === "loading" || input.trim().length === 0}
            style={{
              fontFamily: "inherit", fontSize: 12, padding: "8px 16px",
              border: "1px solid var(--accent)", background: "var(--accent)", color: "#fff",
              cursor: "pointer", borderRadius: 9999,
              opacity: phase === "loading" || input.trim().length === 0 ? 0.4 : 1,
            }}
          >
            发来
          </button>
        </div>
      )}
    </div>
  );
}
