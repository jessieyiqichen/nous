"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { CHANNEL_THEMES, DEFAULT_CHANNEL_THEME, TRIAGE_META, type ThreadDef } from "./threads";
import { MessageBubbles, StatusBar, SuggestionPanel, TypingIndicator, type Bubble } from "./parts";

const TYPING_DELAY_MS = 1000;

interface Props {
  def: ThreadDef;
  onBack: () => void;
  onCorrection: () => void;
  onStatus: (status: string) => void;
}

type Phase = "suggest" | "typing" | "closed";

export default function ChatThread({ def, onBack, onCorrection, onStatus }: Props) {
  const theme = CHANNEL_THEMES[def.channel] ?? DEFAULT_CHANNEL_THEME;
  const [bubbles, setBubbles] = useState<Bubble[]>([
    { from: "them", text: def.turns[0].incoming },
  ]);
  const [turnIndex, setTurnIndex] = useState(0);
  const [phase, setPhase] = useState<Phase>("suggest");
  const [editing, setEditing] = useState(false);
  const [editText, setEditText] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);

  const analysis = def.turns[turnIndex].analysis;

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [bubbles, phase]);

  const finishThread = useCallback(() => {
    if (def.closing) {
      setPhase("typing");
      setTimeout(() => {
        setBubbles((prev) => [
          ...prev,
          { from: "them", text: def.closing as string },
          { from: "note", text: "分身判断：无需再回" },
        ]);
        setPhase("closed");
      }, TYPING_DELAY_MS);
    } else {
      setBubbles((prev) => [...prev, { from: "note", text: "分身判断：无需再回" }]);
      setPhase("closed");
    }
    onStatus("已处理");
  }, [def.closing, onStatus]);

  const advance = useCallback(() => {
    const next = turnIndex + 1;
    if (next < def.turns.length) {
      setPhase("typing");
      setTimeout(() => {
        setBubbles((prev) => [...prev, { from: "them", text: def.turns[next].incoming }]);
        setTurnIndex(next);
        setPhase("suggest");
      }, TYPING_DELAY_MS);
    } else {
      finishThread();
    }
  }, [turnIndex, def.turns, finishThread]);

  const send = useCallback(
    (edited: boolean) => {
      const text = edited ? editText.trim() : analysis.draft;
      if (!text) return;
      setBubbles((prev) => [...prev, { from: "me", text }]);
      setEditing(false);
      setEditText("");
      if (edited) onCorrection();
      advance();
    },
    [editText, analysis.draft, onCorrection, advance],
  );

  const acknowledge = useCallback(() => {
    const note =
      analysis.triage.action === "personal"
        ? "分身不代打在乎的关系——这条留给你亲自回"
        : "已折叠 · 不回";
    setBubbles((prev) => [...prev, { from: "note", text: note }]);
    setPhase("closed");
    onStatus(analysis.triage.action === "personal" ? "你来接" : "已折叠");
  }, [analysis.triage.action, onStatus]);

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", background: theme.chatBg }}>
      <StatusBar bg={theme.headerBg} color={theme.headerColor} />

      {/* 宿主 App 线程头 */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 14px 12px", background: theme.headerBg, flexShrink: 0 }}>
        <button
          onClick={onBack}
          style={{ fontFamily: "inherit", fontSize: 18, border: 0, background: "transparent", color: theme.headerColor, cursor: "pointer", padding: 0, lineHeight: 1 }}
        >
          ‹
        </button>
        <div style={{ flex: 1, textAlign: "center" }}>
          <p style={{ fontSize: 14, fontWeight: 500, margin: 0, color: theme.headerColor }}>{def.sender}</p>
          <p style={{ fontSize: 9, margin: 0, color: theme.headerSubColor }}>{def.channel} · {def.relation}</p>
        </div>
        {phase === "closed" ? (
          <span style={{
            fontFamily: "var(--font-mono)", fontSize: 9, padding: "2px 8px",
            background: "rgba(0,0,0,0.06)", color: theme.headerSubColor, borderRadius: 4,
          }}>
            {TRIAGE_META[analysis.triage.action].label}
          </span>
        ) : (
          <span style={{ fontSize: 16, color: theme.headerSubColor }}>⋯</span>
        )}
      </div>

      {/* 消息区（宿主皮肤） */}
      <div style={{ flex: 1, overflowY: "auto", padding: "16px 14px", display: "flex", flexDirection: "column", gap: 10 }}>
        <MessageBubbles bubbles={bubbles} theme={theme} />
        {phase === "typing" && <TypingIndicator name={def.sender} theme={theme} />}
        <div ref={bottomRef} />
      </div>

      {/* Nous 分身建议浮层 */}
      {phase === "suggest" && (
        <SuggestionPanel
          analysis={analysis}
          editing={editing}
          editText={editText}
          onEditChange={setEditText}
          onSend={() => send(false)}
          onStartEdit={() => {
            setEditing(true);
            setEditText(analysis.draft ?? "");
          }}
          onSendEdit={() => send(true)}
          onAcknowledge={acknowledge}
        />
      )}
    </div>
  );
}
