"use client";

import { useState } from "react";

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

const SEVERITY_LABELS: Record<string, string> = {
  low: "低",
  medium: "中",
  high: "高",
  critical: "严重",
};

const SEVERITY_COLORS: Record<string, string> = {
  low: "bg-blue-500/20 text-blue-300 border-blue-500/30",
  medium: "bg-yellow-500/20 text-yellow-300 border-yellow-500/30",
  high: "bg-orange-500/20 text-orange-300 border-orange-500/30",
  critical: "bg-red-500/20 text-red-300 border-red-500/30",
};

const BIAS_TAG_COLORS: Record<string, string> = {
  overcorrect: "bg-red-500/20 text-red-300",
  sycophancy: "bg-orange-500/20 text-orange-300",
  drift: "bg-purple-500/20 text-purple-300",
  beautify: "bg-pink-500/20 text-pink-300",
  single_attr: "bg-yellow-500/20 text-yellow-300",
  over_attr: "bg-cyan-500/20 text-cyan-300",
  preemptive: "bg-green-500/20 text-green-300",
  sim_conscious: "bg-indigo-500/20 text-indigo-300",
  sys_bias: "bg-gray-500/20 text-gray-300",
};

const SUB_TYPE_LABELS: Record<string, string> = {
  surface_hedging: "表面叠甲",
  evaluative: "评价性迎合",
  meta_sycophancy: "元迎合",
};

const PLACEHOLDER = `在此粘贴一段人-AI 对话，支持以下格式：

格式一 — 标签分行：
User: 我最近在考虑转行...
Assistant: 这是一个很有意思的想法！...

格式二 — JSON 数组：
[{"role":"user","content":"..."},{"role":"assistant","content":"..."}]`;

function parseConversation(text: string): Turn[] {
  const trimmed = text.trim();

  // Try JSON
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

  // Text format
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
        turns.push({ role: currentRole, content: currentContent.join("\n").trim() });
      }
      currentRole = "user";
      currentContent = userMatch[1] ? [userMatch[1]] : [];
    } else if (asstMatch) {
      if (currentRole && currentContent.length > 0) {
        turns.push({ role: currentRole, content: currentContent.join("\n").trim() });
      }
      currentRole = "assistant";
      currentContent = asstMatch[1] ? [asstMatch[1]] : [];
    } else if (currentRole) {
      currentContent.push(line);
    }
  }

  if (currentRole && currentContent.length > 0) {
    turns.push({ role: currentRole, content: currentContent.join("\n").trim() });
  }

  return turns;
}

function BiasTag({ bias }: { bias: BiasInstance }) {
  const label = BIAS_LABELS[bias.bias_id] || bias.bias_id;
  const tagColor = BIAS_TAG_COLORS[bias.bias_id] || "bg-gray-500/20 text-gray-300";
  const sevColor = SEVERITY_COLORS[bias.severity] || SEVERITY_COLORS.medium;
  const subLabel = bias.sub_type ? SUB_TYPE_LABELS[bias.sub_type] || bias.sub_type : "";

  return (
    <div className="border border-[var(--card-border)] rounded-lg p-3 space-y-2">
      <div className="flex items-center gap-2 flex-wrap">
        <span className={`text-xs font-medium px-2 py-0.5 rounded ${tagColor}`}>
          {label}
        </span>
        {subLabel && (
          <span className="text-xs text-[var(--muted)]">{subLabel}</span>
        )}
        <span className={`text-xs px-2 py-0.5 rounded border ${sevColor}`}>
          {SEVERITY_LABELS[bias.severity] || bias.severity}
        </span>
      </div>
      <blockquote className="text-sm text-[var(--muted)] border-l-2 border-[var(--card-border)] pl-3 italic">
        &ldquo;{bias.evidence}&rdquo;
      </blockquote>
      <p className="text-sm">{bias.explanation}</p>
    </div>
  );
}

export default function Analyzer() {
  const [input, setInput] = useState("");
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [selectedTurn, setSelectedTurn] = useState<number | null>(null);

  const analyze = async () => {
    const parsed = parseConversation(input);
    if (parsed.length < 2) {
      setError("至少需要 2 轮对话（1 轮用户 + 1 轮 AI）才能分析。");
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

  return (
    <div className="space-y-6">
      {/* Input */}
      {!analysis && (
        <div className="space-y-4">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={PLACEHOLDER}
            rows={14}
            className="w-full bg-[var(--card)] border border-[var(--card-border)] rounded-lg p-4 text-sm font-mono resize-y focus:outline-none focus:border-[var(--accent)] transition-colors"
          />
          <div className="flex items-center gap-4">
            <button
              onClick={analyze}
              disabled={loading || !input.trim()}
              className="px-5 py-2 bg-[var(--accent)] text-white text-sm font-medium rounded-lg hover:opacity-90 disabled:opacity-40 transition-opacity"
            >
              {loading ? "分析中..." : "检测偏差"}
            </button>
            {loading && (
              <span className="text-sm text-[var(--muted)]">
                大约需要 10-30 秒...
              </span>
            )}
          </div>
          {error && <p className="text-sm text-red-400">{error}</p>}
        </div>
      )}

      {/* Results */}
      {analysis && (
        <div className="space-y-6">
          {/* Summary bar */}
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-3 flex-wrap">
              <span className="text-sm text-[var(--muted)]">
                分析了 {analysis.total_turns} 轮对话
              </span>
              <span className="text-sm font-medium">
                检测到 {analysis.biases_found.length} 个偏差
              </span>
              {Object.entries(analysis.bias_summary).map(([id, count]) => (
                <span
                  key={id}
                  className={`text-xs px-2 py-0.5 rounded ${BIAS_TAG_COLORS[id] || "bg-gray-500/20 text-gray-300"}`}
                >
                  {BIAS_LABELS[id] || id}: {count}
                </span>
              ))}
            </div>
            <button
              onClick={() => {
                setAnalysis(null);
                setTurns([]);
                setSelectedTurn(null);
              }}
              className="text-sm text-[var(--muted)] hover:text-white transition-colors"
            >
              重新分析
            </button>
          </div>

          {/* Overall assessment */}
          <div className="bg-[var(--card)] border border-[var(--card-border)] rounded-lg p-4">
            <p className="text-sm font-medium mb-1">总体评估</p>
            <p className="text-sm text-[var(--muted)]">{analysis.overall_assessment}</p>
            {analysis.interaction_patterns && analysis.interaction_patterns.length > 0 && (
              <div className="mt-3 pt-3 border-t border-[var(--card-border)]">
                <p className="text-xs font-medium text-[var(--muted)] mb-1">
                  偏差交互模式
                </p>
                <ul className="space-y-1">
                  {analysis.interaction_patterns.map((p, i) => (
                    <li key={i} className="text-xs text-[var(--muted)]">
                      {p}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>

          {/* Conversation with annotations */}
          <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
            {/* Left: conversation */}
            <div className="lg:col-span-3 space-y-3">
              {turns.map((turn, i) => {
                const biases = biasesForTurn(i);
                const hasBias = biases.length > 0;
                const isSelected = selectedTurn === i;

                return (
                  <div
                    key={i}
                    onClick={() => hasBias && setSelectedTurn(isSelected ? null : i)}
                    className={`rounded-lg p-4 transition-all ${
                      turn.role === "user"
                        ? "bg-[var(--card)] border border-[var(--card-border)]"
                        : hasBias
                          ? `bg-[var(--card)] border-2 ${isSelected ? "border-[var(--accent)]" : "border-orange-500/30"} cursor-pointer`
                          : "bg-[var(--card)] border border-[var(--card-border)]"
                    }`}
                  >
                    <div className="flex items-center gap-2 mb-2">
                      <span
                        className={`text-xs font-medium px-2 py-0.5 rounded ${
                          turn.role === "user"
                            ? "bg-blue-500/20 text-blue-300"
                            : "bg-emerald-500/20 text-emerald-300"
                        }`}
                      >
                        {turn.role === "user" ? "用户" : "AI"}
                      </span>
                      <span className="text-xs text-[var(--muted)]">第 {i} 轮</span>
                      {biases.map((b, j) => (
                        <span
                          key={j}
                          className={`text-xs px-1.5 py-0.5 rounded ${BIAS_TAG_COLORS[b.bias_id] || "bg-gray-500/20 text-gray-300"}`}
                        >
                          {BIAS_LABELS[b.bias_id] || b.bias_id}
                        </span>
                      ))}
                    </div>
                    <p className="text-sm whitespace-pre-wrap leading-relaxed">
                      {turn.content}
                    </p>
                  </div>
                );
              })}
            </div>

            {/* Right: bias details */}
            <div className="lg:col-span-2 space-y-3">
              <p className="text-sm font-medium text-[var(--muted)]">
                {selectedTurn !== null
                  ? `第 ${selectedTurn} 轮的偏差详情`
                  : "点击高亮段落查看偏差详情"}
              </p>
              {selectedTurn !== null &&
                biasesForTurn(selectedTurn).map((b, i) => (
                  <BiasTag key={i} bias={b} />
                ))}
              {selectedTurn === null && analysis.biases_found.length > 0 && (
                <div className="text-sm text-[var(--muted)] space-y-2">
                  <p>
                    在 {new Set(analysis.biases_found.map((b) => b.turn_index)).size} 轮对话中发现了{" "}
                    {analysis.biases_found.length} 个偏差实例。
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {Object.entries(analysis.severity_distribution).map(([sev, count]) => (
                      <span
                        key={sev}
                        className={`text-xs px-2 py-1 rounded border ${SEVERITY_COLORS[sev]}`}
                      >
                        {SEVERITY_LABELS[sev] || sev}: {count}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
