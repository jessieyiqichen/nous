"use client";

import { useState } from "react";

// ── Types ─────────────────────────────────────────────────────

interface BiasInstance {
  bias_id: string;
  sub_type?: string;
  turn_index: number;
  severity: string;
  evidence: string;
  context: string;
  explanation: string;
}

interface Analysis {
  total_turns: number;
  biases_found: BiasInstance[];
  bias_summary: Record<string, number>;
  severity_distribution: Record<string, number>;
  overall_assessment: string;
  interaction_patterns?: string[];
}

interface Turn {
  role: "user" | "assistant";
  content: string;
}

// ── Labels & tones ────────────────────────────────────────────

const BIAS_LABELS: Record<string, string> = {
  overcorrect: "矫枉过正",
  sycophancy: "迎合/叠甲",
  drift: "反馈漂移",
  beautify: "画像美化",
  single_attr: "单一归因",
  over_attr: "过度归因",
  preemptive: "预判覆盖",
  sim_conscious: "模拟意识",
  sys_bias: "系统偏差污染",
};

const BIAS_TONES: Record<string, string> = {
  sycophancy: "#a86c3a",
  preemptive: "#7a8c5c",
  beautify: "#9a5a6e",
  overcorrect: "#b85c4a",
  over_attr: "#5e7a8a",
  single_attr: "#5e7a8a",
  drift: "#7a6a4f",
  sim_conscious: "#7a6a4f",
  sys_bias: "#7a6a4f",
};

const SEVERITY_ZH: Record<string, string> = {
  low: "轻微",
  medium: "中度",
  high: "显著",
  critical: "显著",
};

const PLACEHOLDER = `User: 我最近在考虑转行做产品经理...
Assistant: 这个想法非常棒！产品经理是一个很有前景的职业方向...

User: 但是我完全没有相关经验...
Assistant: 别担心！很多成功的产品经理都是从零开始的...`;

// ── Parse helpers ─────────────────────────────────────────────

function parseConversation(text: string): Turn[] {
  const trimmed = text.trim();

  if (trimmed.startsWith("[")) {
    try {
      const parsed = JSON.parse(trimmed);
      if (Array.isArray(parsed)) {
        return parsed.map((t: { role: string; content: string }) => ({
          role: t.role === "user" ? "user" : "assistant",
          content: t.content,
        }));
      }
    } catch {
      // Fall through
    }
  }

  const turns: Turn[] = [];
  const lines = trimmed.split("\n");
  let currentRole: "user" | "assistant" | null = null;
  let currentContent: string[] = [];

  for (const line of lines) {
    const userMatch = line.match(/^(?:User|Human|用户)\s*[:：]\s*(.*)/i);
    const asstMatch = line.match(
      /^(?:Assistant|AI|Claude|ChatGPT|GPT|助手)\s*[:：]\s*(.*)/i
    );

    if (userMatch) {
      if (currentRole && currentContent.length > 0) {
        turns.push({
          role: currentRole,
          content: currentContent.join("\n").trim(),
        });
      }
      currentRole = "user";
      currentContent = userMatch[1] ? [userMatch[1]] : [];
    } else if (asstMatch) {
      if (currentRole && currentContent.length > 0) {
        turns.push({
          role: currentRole,
          content: currentContent.join("\n").trim(),
        });
      }
      currentRole = "assistant";
      currentContent = asstMatch[1] ? [asstMatch[1]] : [];
    } else if (currentRole) {
      currentContent.push(line);
    }
  }

  if (currentRole && currentContent.length > 0) {
    turns.push({
      role: currentRole,
      content: currentContent.join("\n").trim(),
    });
  }

  return turns;
}

function getTone(biasId: string): string {
  return BIAS_TONES[biasId] || "#7a6a4f";
}

// ── Component ─────────────────────────────────────────────────

export default function Analyzer() {
  const [input, setInput] = useState(PLACEHOLDER);
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [selectedTurn, setSelectedTurn] = useState<number | null>(null);

  const analyze = async () => {
    const parsed = parseConversation(input);
    if (parsed.length < 2) {
      setError("至少需要 2 轮对话才能分析");
      return;
    }

    setTurns(parsed);
    setLoading(true);
    setError("");
    setAnalysis(null);
    setSelectedTurn(null);

    try {
      const res = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ turns: parsed }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || `HTTP ${res.status}`);
      }

      const data: Analysis = await res.json();
      setAnalysis(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "分析失败");
    } finally {
      setLoading(false);
    }
  };

  const biasesForTurn = (turnIdx: number) =>
    analysis?.biases_found.filter((b) => b.turn_index === turnIdx) || [];

  // ── Input state ───────────────────────────────────────────

  if (!analysis) {
    return (
      <div style={{ maxWidth: 640, margin: "0 auto", paddingTop: 8 }}>
        <h2
          style={{
            fontFamily: "var(--font-display)",
            fontSize: 28,
            fontWeight: 400,
            margin: "0 0 8px",
          }}
        >
          偏差检测
        </h2>
        <p
          style={{
            fontFamily: "var(--font-display)",
            fontSize: 15,
            fontStyle: "italic",
            color: "var(--muted)",
            margin: "0 0 32px",
          }}
        >
          粘贴一段人-AI 对话，检测系统性认知偏差
        </p>

        {/* Manuscript-margin textarea */}
        <div
          style={{
            borderLeft: "2px solid var(--accent)",
            paddingLeft: 20,
            marginBottom: 24,
          }}
        >
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            rows={12}
            style={{
              width: "100%",
              background: "transparent",
              border: "none",
              padding: 0,
              fontSize: 14,
              color: "var(--foreground)",
              fontFamily: "inherit",
              lineHeight: 1.75,
              outline: "none",
              resize: "vertical",
              boxSizing: "border-box",
            }}
          />
        </div>

        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 16,
          }}
        >
          <button
            onClick={analyze}
            disabled={loading || !input.trim()}
            style={{
              fontSize: 13,
              fontWeight: 500,
              padding: "10px 24px",
              borderRadius: 9999,
              border: 0,
              cursor: "pointer",
              background: "var(--accent)",
              color: "#fff",
              opacity: loading || !input.trim() ? 0.4 : 1,
              transition: "opacity 200ms",
            }}
          >
            {loading ? "分析中..." : "检测偏差"}
          </button>
          <span
            style={{
              fontFamily: "var(--font-display)",
              fontSize: 12,
              fontStyle: "italic",
              color: "var(--muted-soft)",
            }}
          >
            示例对话已预填
          </span>
        </div>

        {error && (
          <p style={{ fontSize: 13, color: "var(--error)", marginTop: 12 }}>
            {error}
          </p>
        )}
      </div>
    );
  }

  // ── Result state ──────────────────────────────────────────

  const selectedBiases =
    selectedTurn !== null ? biasesForTurn(selectedTurn) : [];
  const firstBiasTone =
    selectedBiases.length > 0 ? getTone(selectedBiases[0].bias_id) : null;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 32 }}>
      {/* Header */}
      <div>
        <p className="eyebrow" style={{ marginBottom: 8 }}>
          偏差检测 · 报告
        </p>
        <h2
          style={{
            fontFamily: "var(--font-display)",
            fontSize: 32,
            fontWeight: 400,
            margin: "0 0 16px",
            lineHeight: 1.3,
          }}
        >
          {analysis.total_turns} 轮对话中检测到{" "}
          <em
            style={{
              fontStyle: "italic",
              color: "var(--accent)",
            }}
          >
            {analysis.biases_found.length} 处
          </em>{" "}
          偏差
        </h2>

        {/* Bias type pills */}
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          {Object.entries(analysis.bias_summary).map(([id, count]) => {
            const tone = getTone(id);
            return (
              <span
                key={id}
                style={{
                  fontSize: 11,
                  padding: "3px 10px",
                  borderRadius: 9999,
                  border: `1px solid ${tone}66`,
                  background: `${tone}1a`,
                  color: tone,
                }}
              >
                {BIAS_LABELS[id] || id} {count}
              </span>
            );
          })}
        </div>
      </div>

      {/* Overall assessment — pull-quote */}
      <p className="pull-quote">{analysis.overall_assessment}</p>

      {/* Reset button */}
      <div>
        <button
          onClick={() => {
            setAnalysis(null);
            setTurns([]);
            setSelectedTurn(null);
          }}
          style={{
            fontSize: 12,
            color: "var(--muted-soft)",
            background: "transparent",
            border: 0,
            cursor: "pointer",
            textDecoration: "underline",
            textUnderlineOffset: 4,
            fontFamily: "inherit",
          }}
        >
          重新分析
        </button>
      </div>

      {/* Annotated transcript — 2-col layout */}
      <div style={{ display: "flex", gap: 32, alignItems: "flex-start" }}>
        {/* Left: transcript */}
        <div style={{ flex: 1, minWidth: 0 }}>
          {turns.map((turn, i) => {
            const biases = biasesForTurn(i);
            const hasBias = biases.length > 0;
            const isSelected = selectedTurn === i;

            return (
              <div
                key={i}
                onClick={() =>
                  hasBias && setSelectedTurn(isSelected ? null : i)
                }
                style={{
                  display: "flex",
                  gap: 16,
                  padding: "20px 0",
                  borderBottom: "1px solid var(--card-border)",
                  background: isSelected
                    ? "var(--accent-soft)"
                    : "transparent",
                  cursor: hasBias ? "pointer" : "default",
                  transition: "background 150ms",
                  marginLeft: -8,
                  marginRight: -8,
                  paddingLeft: 8,
                  paddingRight: 8,
                }}
              >
                {/* Line-number gutter */}
                <div
                  style={{
                    width: 28,
                    flexShrink: 0,
                    textAlign: "right",
                    paddingTop: 2,
                  }}
                >
                  <span
                    style={{
                      fontFamily: "var(--font-mono)",
                      fontSize: 11,
                      color: "var(--muted-soft)",
                      display: "block",
                    }}
                  >
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <span
                    style={{
                      fontFamily: "var(--font-mono)",
                      fontSize: 10,
                      letterSpacing: "0.05em",
                      textTransform: "uppercase" as const,
                      color: "var(--muted-soft)",
                      display: "block",
                      marginTop: 2,
                    }}
                  >
                    {turn.role === "user" ? "你" : "AI"}
                  </span>
                </div>

                {/* Content */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p
                    style={{
                      fontFamily:
                        turn.role === "assistant"
                          ? "var(--font-display)"
                          : "var(--font-sans)",
                      fontSize: 14,
                      lineHeight: 1.75,
                      margin: 0,
                      whiteSpace: "pre-wrap",
                    }}
                  >
                    {turn.content}
                  </p>
                  {/* Bias chips below text */}
                  {biases.length > 0 && (
                    <div
                      style={{
                        display: "flex",
                        gap: 6,
                        marginTop: 8,
                        flexWrap: "wrap",
                      }}
                    >
                      {biases.map((b, j) => {
                        const tone = getTone(b.bias_id);
                        return (
                          <span
                            key={j}
                            style={{
                              fontSize: 10,
                              padding: "2px 8px",
                              borderRadius: 9999,
                              border: `1px solid ${tone}66`,
                              background: `${tone}1a`,
                              color: tone,
                            }}
                          >
                            {BIAS_LABELS[b.bias_id] || b.bias_id}
                          </span>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* Right: sticky detail aside */}
        <div
          style={{
            width: 280,
            flexShrink: 0,
            position: "sticky",
            top: 24,
            alignSelf: "flex-start",
          }}
        >
          {selectedTurn === null ? (
            <p
              style={{
                fontFamily: "var(--font-display)",
                fontSize: 14,
                fontStyle: "italic",
                color: "var(--muted-soft)",
                margin: 0,
                lineHeight: 1.65,
              }}
            >
              点击任意标注段落，查看偏差详情
            </p>
          ) : (
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: 20,
              }}
            >
              {selectedBiases.map((b, i) => {
                const tone = getTone(b.bias_id);
                return (
                  <div
                    key={i}
                    style={{
                      borderTop: `2px solid ${tone}`,
                      paddingTop: 16,
                    }}
                  >
                    {/* Bias name + severity */}
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "baseline",
                        marginBottom: 12,
                      }}
                    >
                      <span
                        style={{
                          fontFamily: "var(--font-display)",
                          fontSize: 19,
                          fontWeight: 400,
                        }}
                      >
                        {BIAS_LABELS[b.bias_id] || b.bias_id}
                      </span>
                      <span
                        style={{
                          fontFamily: "var(--font-mono)",
                          fontSize: 11,
                          letterSpacing: "0.05em",
                          textTransform: "uppercase" as const,
                          color: tone,
                        }}
                      >
                        {SEVERITY_ZH[b.severity] || b.severity}
                      </span>
                    </div>

                    {/* Evidence blockquote */}
                    <blockquote
                      style={{
                        fontFamily: "var(--font-display)",
                        fontSize: 13,
                        fontStyle: "italic",
                        color: "var(--muted)",
                        borderLeft: `1px solid ${tone}`,
                        paddingLeft: 16,
                        margin: "0 0 12px",
                        lineHeight: 1.65,
                      }}
                    >
                      &ldquo;{b.evidence}&rdquo;
                    </blockquote>

                    {/* Explanation */}
                    <p
                      style={{
                        fontSize: 13,
                        color: "var(--muted)",
                        margin: 0,
                        lineHeight: 1.65,
                      }}
                    >
                      {b.explanation}
                    </p>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {error && (
        <p style={{ fontSize: 13, color: "var(--error)" }}>{error}</p>
      )}
    </div>
  );
}
