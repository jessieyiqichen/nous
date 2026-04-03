"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import type { RefineRequest } from "../page";

// ── Types ─────────────────────────────────────────────────────

interface Message {
  role: "user" | "assistant";
  content: string;
}

interface DimensionCoverage {
  name: string;
  confidence: "high" | "medium" | "low" | "none";
  evidence_summary?: string;
}

interface Signal {
  signal_type: string;
  track: "stated" | "behavioral";
  cognitive_dimension: string;
  evidence: string;
  interpretation?: string;
}

interface Conflict {
  stated_claim: string;
  actual_behavior: string;
  blind_spot_evidence: string;
}

interface CognitiveModel {
  dimensions: Array<{
    name: string;
    description: string;
    behavioral_predictions: string[];
    confidence: string;
  }>;
  summary: string;
}

type Phase = "chat" | "building" | "result";

interface Props {
  refineRequest?: RefineRequest | null;
  onRefineConsumed?: () => void;
  onModelReady?: (model: CognitiveModel) => void;
  onValidateModel?: (model: CognitiveModel) => void;
}

// ── LocalStorage helpers ──────────────────────────────────────

const LS_KEYS = {
  messages: "nous_interview_messages",
  signals: "nous_interview_signals",
  conflicts: "nous_interview_conflicts",
  coverage: "nous_interview_coverage",
  model: "nous_interview_model",
  phase: "nous_interview_phase",
  turn: "nous_interview_turn",
  refineMode: "nous_interview_refine",
  focusDims: "nous_interview_focus",
  existingModel: "nous_interview_existing_model",
} as const;

function lsGet<T>(key: string, fallback: T): T {
  try {
    const v = localStorage.getItem(key);
    return v ? (JSON.parse(v) as T) : fallback;
  } catch {
    return fallback;
  }
}
function lsSet(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* quota */
  }
}
function lsClear() {
  Object.values(LS_KEYS).forEach((k) => localStorage.removeItem(k));
}

// ── Dimension display names ───────────────────────────────────

const DIM_NAMES_ZH: Record<string, string> = {
  "Decision Architecture": "决策架构",
  "Attention Allocation": "注意力分配",
  "Reasoning Style": "推理风格",
  "Emotional Processing": "情感处理",
  "Social Cognition": "社会认知",
  "Blind Spots": "盲区",
  "Value Hierarchy": "价值层级",
  "Response to Uncertainty": "面对不确定性",
  "Execution-Layer Flexibility": "执行层弹性",
};

const CONFIDENCE_COLORS: Record<string, string> = {
  high: "bg-green-500",
  medium: "bg-yellow-500",
  low: "bg-orange-500",
  none: "bg-neutral-700",
};

const CONFIDENCE_WIDTH: Record<string, string> = {
  high: "w-full",
  medium: "w-2/3",
  low: "w-1/3",
  none: "w-0",
};

/** Override Blind Spots confidence based on contradiction evidence.
 *  Blind spots can't reach high confidence through conversation alone.
 *  Use conflict count as proxy: >=2 -> medium, >=4 -> high. */
function applyBlindSpotsOverride(
  dims: DimensionCoverage[],
  conflictCount: number
): DimensionCoverage[] {
  if (conflictCount < 2) return dims;
  return dims.map((d) => {
    if (d.name !== "Blind Spots") return d;
    if (conflictCount >= 4) return { ...d, confidence: "high" as const };
    if (d.confidence === "low" || d.confidence === "none")
      return { ...d, confidence: "medium" as const };
    return d;
  });
}

// ── Component ─────────────────────────────────────────────────

export default function Interview({ refineRequest, onRefineConsumed, onModelReady, onValidateModel }: Props) {
  // Core state — SSR-safe defaults, hydrated from localStorage in useEffect
  const [messages, setMessages] = useState<Message[]>([]);
  const [turn, setTurn] = useState(0);
  const [phase, setPhase] = useState<Phase>("chat");

  // Refine mode state
  const [isRefineMode, setIsRefineMode] = useState(false);
  const [focusDims, setFocusDims] = useState<string[]>([]);
  const [existingModel, setExistingModel] = useState<CognitiveModel | null>(null);

  // Analysis state
  const [coverage, setCoverage] = useState<DimensionCoverage[]>([]);
  const [signals, setSignals] = useState<Signal[]>([]);
  const [conflicts, setConflicts] = useState<Conflict[]>([]);
  const [model, setModel] = useState<CognitiveModel | null>(null);

  // Hydration guard
  const [hydrated, setHydrated] = useState(false);

  // UI state
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [building, setBuilding] = useState(false);
  const [error, setError] = useState("");
  const [showPanel, setShowPanel] = useState(true);

  const chatEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Hydrate from localStorage on mount (SSR-safe)
  useEffect(() => {
    setMessages(lsGet(LS_KEYS.messages, []));
    setTurn(lsGet(LS_KEYS.turn, 0));
    setPhase(lsGet(LS_KEYS.phase, "chat"));
    setIsRefineMode(lsGet(LS_KEYS.refineMode, false));
    setFocusDims(lsGet(LS_KEYS.focusDims, []));
    setExistingModel(lsGet(LS_KEYS.existingModel, null));
    setCoverage(lsGet(LS_KEYS.coverage, []));
    setSignals(lsGet(LS_KEYS.signals, []));
    setConflicts(lsGet(LS_KEYS.conflicts, []));
    setModel(lsGet(LS_KEYS.model, null));
    setHydrated(true);
  }, []);

  // Persist state changes (only after hydration to avoid overwriting with defaults)
  useEffect(() => { if (hydrated) lsSet(LS_KEYS.messages, messages); }, [messages, hydrated]);
  useEffect(() => { if (hydrated) lsSet(LS_KEYS.turn, turn); }, [turn, hydrated]);
  useEffect(() => { if (hydrated) lsSet(LS_KEYS.phase, phase); }, [phase, hydrated]);
  useEffect(() => { if (hydrated) lsSet(LS_KEYS.coverage, coverage); }, [coverage, hydrated]);
  useEffect(() => { if (hydrated) lsSet(LS_KEYS.signals, signals); }, [signals, hydrated]);
  useEffect(() => { if (hydrated) lsSet(LS_KEYS.conflicts, conflicts); }, [conflicts, hydrated]);
  useEffect(() => { if (hydrated) lsSet(LS_KEYS.model, model); }, [model, hydrated]);
  useEffect(() => { if (hydrated) lsSet(LS_KEYS.refineMode, isRefineMode); }, [isRefineMode, hydrated]);
  useEffect(() => { if (hydrated) lsSet(LS_KEYS.focusDims, focusDims); }, [focusDims, hydrated]);
  useEffect(() => { if (hydrated) lsSet(LS_KEYS.existingModel, existingModel); }, [existingModel, hydrated]);

  // Auto-scroll
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  // Handle incoming refineRequest from Predictor
  useEffect(() => {
    if (refineRequest) {
      // Reset current state and start refine mode
      lsClear();
      setMessages([]);
      setTurn(0);
      setPhase("chat");
      setCoverage([]);
      setSignals([]);
      setConflicts([]);
      setModel(null);
      setError("");
      setInput("");

      setIsRefineMode(true);
      setFocusDims(refineRequest.focusDimensions);
      setExistingModel(refineRequest.model);

      onRefineConsumed?.();

      // Auto-start the refine interview
      startInterview(true, refineRequest.model, refineRequest.focusDimensions);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refineRequest]);

  // Format transcript for API
  const formatTranscript = useCallback(
    (msgs: Message[]) =>
      msgs
        .map(
          (m) =>
            `${m.role === "user" ? "User" : "Interviewer"}: ${m.content}`
        )
        .join("\n\n"),
    []
  );

  const formatRecentTranscript = useCallback(
    (msgs: Message[], n = 6) => formatTranscript(msgs.slice(-n)),
    [formatTranscript]
  );

  // Build coverage hint for AI
  const buildCoverageHint = useCallback(
    (dims: DimensionCoverage[], focus: string[], refine: boolean): string => {
      if (refine && focus.length > 0) {
        const focusCoverage = dims.filter((d) => focus.includes(d.name));
        const notHigh = focusCoverage.filter((d) => d.confidence !== "high");
        if (notHigh.length === 0) return "";
        return (
          `[INTERNAL — not visible to user] ` +
          `Focus dimensions not yet at HIGH: ${notHigh.map((d) => d.name).join(", ")}. ` +
          `Dig deeper into these with concrete scenarios.`
        );
      }
      const weak = dims.filter(
        (d) => d.confidence === "low" || d.confidence === "none"
      );
      if (weak.length === 0) return "";
      return (
        `[INTERNAL — not visible to user] ` +
        `Dimensions still weak: ${weak.map((d) => d.name).join(", ")}. ` +
        `Naturally steer toward these.`
      );
    },
    []
  );

  // Check auto-end condition
  const shouldAutoEnd = useCallback(
    (dims: DimensionCoverage[], turnNum: number, focus: string[], refine: boolean): boolean => {
      // Hard turn limit for refine mode (prevent runaway sessions)
      if (refine && turnNum >= 30) return true;

      if (refine && focus.length > 0) {
        // Refine: focus dims must be "high", min 8 turns
        if (turnNum < 8) return false;
        const focusCoverage = dims.filter((d) => focus.includes(d.name));
        return (
          focusCoverage.length === focus.length &&
          focusCoverage.every((d) => d.confidence === "high")
        );
      }
      // New: all dims medium+, min 10 turns
      if (dims.length < 9 || turnNum < 10) return false;
      return dims.every(
        (d) => d.confidence === "high" || d.confidence === "medium"
      );
    },
    []
  );

  // ── Start interview ──────────────────────────────────────────

  const startInterview = useCallback(
    async (
      refine = false,
      refModel: CognitiveModel | null = null,
      refFocus: string[] = []
    ) => {
      setLoading(true);
      setError("");
      try {
        const body: Record<string, unknown> = {
          messages: [{ role: "user", content: "（开始对话）" }],
          lang: "zh",
        };
        if (refine && refModel) {
          body.refineMode = {
            modelSummary: refModel.summary,
            focusDimensions: refFocus,
          };
        }

        const res = await fetch("/api/interview/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
        const firstMsg: Message = { role: "assistant", content: data.reply };
        setMessages([firstMsg]);
        setTurn(0);
        setPhase("chat");
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to start");
      } finally {
        setLoading(false);
        inputRef.current?.focus();
      }
    },
    []
  );

  // ── Run analysis (coverage + signals) ────────────────────────

  const runAnalysis = useCallback(
    async (msgs: Message[]) => {
      setAnalyzing(true);
      try {
        const res = await fetch("/api/interview/analyze", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            transcript: formatTranscript(msgs),
            recentTranscript: formatRecentTranscript(msgs),
          }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Analysis failed");

        // Accumulate signals and conflicts
        const newConflicts: Conflict[] = data.signals?.conflicts || [];
        if (data.signals?.signals) {
          setSignals((prev) => [...prev, ...data.signals.signals]);
        }
        if (newConflicts.length > 0) {
          setConflicts((prev) => [...prev, ...newConflicts]);
        }

        // Override Blind Spots confidence based on total conflict count
        const rawDims: DimensionCoverage[] = data.coverage?.dimensions || [];
        const totalConflicts = conflicts.length + newConflicts.length;
        const overriddenDims = applyBlindSpotsOverride(rawDims, totalConflicts);
        setCoverage(overriddenDims);

        return overriddenDims;
      } catch (err) {
        console.error("Analysis error:", err);
        return coverage;
      } finally {
        setAnalyzing(false);
      }
    },
    [formatTranscript, formatRecentTranscript, coverage, conflicts]
  );

  // ── Build model ──────────────────────────────────────────────

  const buildModel = useCallback(
    async (msgs: Message[]) => {
      setBuilding(true);
      setPhase("building");
      try {
        const body: Record<string, unknown> = {
          transcript: formatTranscript(msgs),
          conflicts,
          signals,
        };
        if (isRefineMode && existingModel) {
          body.existingModel = existingModel;
          body.focusDimensions = focusDims;
        }

        const res = await fetch("/api/interview/build", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Build failed");
        setModel(data as CognitiveModel);
        setPhase("result");
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "Failed to build model"
        );
        setPhase("chat");
      } finally {
        setBuilding(false);
      }
    },
    [formatTranscript, isRefineMode, existingModel, focusDims, conflicts, signals]
  );

  // ── Send message ─────────────────────────────────────────────

  const sendMessage = useCallback(async () => {
    const text = input.trim();
    if (!text || loading) return;

    setInput("");
    setError("");
    const newTurn = turn + 1;
    setTurn(newTurn);

    const userMsg: Message = { role: "user", content: text };
    const updatedMessages = [...messages, userMsg];
    setMessages(updatedMessages);
    setLoading(true);

    try {
      // Hard turn limit — check every turn, not just every 5
      const hardLimitReached =
        (isRefineMode && newTurn >= 30) || (!isRefineMode && newTurn >= 50);

      // Every 5 turns (or at hard limit), run analysis
      let coverageHint = "";
      let latestCoverage = coverage;
      const shouldAnalyze = (newTurn >= 5 && newTurn % 5 === 0) || hardLimitReached;
      if (shouldAnalyze) {
        latestCoverage = await runAnalysis(updatedMessages);

        // Check auto-end (includes hard limit inside shouldAutoEnd)
        if (hardLimitReached || shouldAutoEnd(latestCoverage, newTurn, focusDims, isRefineMode)) {
          // Get closing message
          const chatBody: Record<string, unknown> = {
            messages: updatedMessages,
            lang: "zh",
            coverageHint:
              "[INTERNAL] The interview is ending. Give a natural closing remark. Keep it brief and warm.",
          };
          if (isRefineMode && existingModel) {
            chatBody.refineMode = {
              modelSummary: existingModel.summary,
              focusDimensions: focusDims,
            };
          }
          const res = await fetch("/api/interview/chat", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(chatBody),
          });
          const data = await res.json();
          if (res.ok && data.reply) {
            const closingMsg: Message = {
              role: "assistant",
              content: data.reply,
            };
            setMessages([...updatedMessages, closingMsg]);
          }
          setLoading(false);
          await buildModel(updatedMessages);
          return;
        }

        coverageHint = buildCoverageHint(latestCoverage, focusDims, isRefineMode);
      }

      // Get AI response
      const chatBody: Record<string, unknown> = {
        messages: updatedMessages,
        lang: "zh",
        coverageHint: coverageHint || undefined,
      };
      if (isRefineMode && existingModel) {
        chatBody.refineMode = {
          modelSummary: existingModel.summary,
          focusDimensions: focusDims,
        };
      }

      const res = await fetch("/api/interview/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(chatBody),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);

      const aiMsg: Message = { role: "assistant", content: data.reply };
      setMessages([...updatedMessages, aiMsg]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to send");
    } finally {
      setLoading(false);
    }
  }, [
    input,
    loading,
    turn,
    messages,
    coverage,
    focusDims,
    isRefineMode,
    existingModel,
    runAnalysis,
    shouldAutoEnd,
    buildCoverageHint,
    buildModel,
  ]);

  // ── End interview manually ───────────────────────────────────

  const endInterview = useCallback(async () => {
    if (messages.length < 6) {
      setError("对话太短，至少需要 3 轮对话才能建模");
      return;
    }
    await buildModel(messages);
  }, [messages, buildModel]);

  // ── Reset ────────────────────────────────────────────────────

  const reset = useCallback(() => {
    lsClear();
    setMessages([]);
    setTurn(0);
    setPhase("chat");
    setCoverage([]);
    setSignals([]);
    setConflicts([]);
    setModel(null);
    setIsRefineMode(false);
    setFocusDims([]);
    setExistingModel(null);
    setError("");
    setInput("");
  }, []);

  // ── Key handler ──────────────────────────────────────────────

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        sendMessage();
      }
    },
    [sendMessage]
  );

  // ── Render: Empty state ──────────────────────────────────────

  if (messages.length === 0 && phase === "chat" && !loading) {
    return (
      <div className="flex flex-col items-center justify-center py-20">
        <div className="text-center max-w-lg">
          <h2 className="text-xl font-semibold mb-3">
            {isRefineMode ? "认知模型修正" : "认知访谈"}
          </h2>
          {isRefineMode && focusDims.length > 0 ? (
            <>
              <p className="text-[var(--muted)] mb-2">
                针对以下维度进行深度对话修正：
              </p>
              <div className="flex flex-wrap gap-2 justify-center mb-4">
                {focusDims.map((d) => (
                  <span
                    key={d}
                    className="px-2 py-1 text-xs rounded bg-orange-500/10 border border-orange-500/20 text-orange-400"
                  >
                    {DIM_NAMES_ZH[d] || d}
                  </span>
                ))}
              </div>
              <p className="text-sm text-[var(--muted)] mb-6">
                AI 会聚焦在这些维度上提问，达到 high 置信度后自动结束。
              </p>
            </>
          ) : (
            <>
              <p className="text-[var(--muted)] mb-2">
                通过自然对话了解你的思维模式，自动构建 9 维度认知模型。
              </p>
              <p className="text-sm text-[var(--muted)] mb-6">
                AI 会像朋友一样和你聊天，在 15-25 轮对话后生成你的认知画像。
              </p>
            </>
          )}
          <button
            onClick={() =>
              startInterview(isRefineMode, existingModel, focusDims)
            }
            disabled={loading}
            className="px-6 py-2.5 bg-[var(--accent)] text-white rounded-lg hover:opacity-90 disabled:opacity-50 transition-opacity"
          >
            {loading
              ? "正在准备..."
              : isRefineMode
                ? "开始修正对话"
                : "开始对话"}
          </button>
        </div>
        {error && <p className="text-red-400 text-sm mt-4">{error}</p>}
      </div>
    );
  }

  // ── Render: Building state ───────────────────────────────────

  if (phase === "building") {
    return (
      <div className="flex flex-col items-center justify-center py-20">
        <div className="animate-pulse text-center">
          <div className="text-lg font-medium mb-2">
            {isRefineMode ? "正在修正认知模型..." : "正在构建认知模型..."}
          </div>
          <p className="text-sm text-[var(--muted)]">
            分析 {messages.length} 条对话记录
            {isRefineMode && focusDims.length > 0
              ? `，修正 ${focusDims.length} 个维度`
              : "，提取 9 个维度的认知特征"}
          </p>
        </div>
      </div>
    );
  }

  // ── Render: Result state ─────────────────────────────────────

  if (phase === "result" && model) {
    return (
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xl font-semibold">
              {isRefineMode ? "修正后的认知模型" : "认知模型"}
            </h2>
            <p className="text-sm text-[var(--muted)] mt-1">
              基于 {turn} 轮对话
              {isRefineMode ? "修正" : "构建"} · {signals.length} 个信号 ·{" "}
              {conflicts.length} 个矛盾
            </p>
          </div>
          <div className="flex gap-2">
            {onValidateModel && (
              <button
                onClick={() => onValidateModel(model)}
                className="px-3 py-1.5 text-sm bg-[var(--accent)] text-white rounded-md hover:opacity-90 transition-opacity"
              >
                验证模型理解
              </button>
            )}
            {onModelReady && (
              <button
                onClick={() => onModelReady(model)}
                className="px-3 py-1.5 text-sm border border-[var(--card-border)] rounded-md hover:bg-white/5"
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
              className="px-3 py-1.5 text-sm border border-[var(--card-border)] rounded-md hover:bg-white/5"
            >
              下载 JSON
            </button>
            <button
              onClick={reset}
              className="px-3 py-1.5 text-sm border border-[var(--card-border)] rounded-md hover:bg-white/5"
            >
              重新开始
            </button>
          </div>
        </div>

        {/* Summary */}
        <div className="p-4 rounded-lg bg-[var(--card)] border border-[var(--card-border)]">
          <p className="text-sm leading-relaxed">{model.summary}</p>
        </div>

        {/* Dimensions grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {(model.dimensions || []).map((dim) => {
            const isFocus = isRefineMode && focusDims.includes(dim.name);
            return (
              <div
                key={dim.name}
                className={`p-4 rounded-lg bg-[var(--card)] border ${
                  isFocus
                    ? "border-orange-500/40"
                    : "border-[var(--card-border)]"
                }`}
              >
                <div className="flex items-center justify-between mb-2">
                  <h3 className="font-medium text-sm">
                    {DIM_NAMES_ZH[dim.name] || dim.name}
                    {isFocus && (
                      <span className="ml-2 text-xs text-orange-400">
                        已修正
                      </span>
                    )}
                  </h3>
                  <span
                    className={`text-xs px-2 py-0.5 rounded-full ${
                      dim.confidence === "high"
                        ? "bg-green-500/20 text-green-400"
                        : dim.confidence === "medium"
                          ? "bg-yellow-500/20 text-yellow-400"
                          : "bg-orange-500/20 text-orange-400"
                    }`}
                  >
                    {dim.confidence}
                  </span>
                </div>
                <p className="text-sm text-[var(--muted)] leading-relaxed mb-2">
                  {dim.description}
                </p>
                {dim.behavioral_predictions.map((pred, i) => (
                  <p
                    key={i}
                    className="text-xs text-[var(--muted)] pl-3 border-l border-[var(--card-border)] mt-1"
                  >
                    {pred}
                  </p>
                ))}
              </div>
            );
          })}
        </div>

        {/* Conflicts */}
        {conflicts.length > 0 && (
          <div>
            <h3 className="font-medium mb-3">
              述行矛盾（{conflicts.length}）
            </h3>
            <div className="space-y-2">
              {conflicts.map((c, i) => (
                <div
                  key={i}
                  className="p-3 rounded-lg bg-red-500/5 border border-red-500/20 text-sm"
                >
                  <p>
                    <span className="text-red-400">声称：</span>
                    {c.stated_claim}
                  </p>
                  <p>
                    <span className="text-yellow-400">实际：</span>
                    {c.actual_behavior}
                  </p>
                  <p className="text-[var(--muted)] text-xs mt-1">
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
            <h3 className="font-medium mb-3">
              认知信号（{signals.length}）
            </h3>
            <div className="flex flex-wrap gap-2">
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
                  className="px-2 py-1 text-xs rounded bg-[var(--card)] border border-[var(--card-border)]"
                >
                  {type}: {count}
                </span>
              ))}
              <span className="px-2 py-1 text-xs rounded bg-blue-500/10 border border-blue-500/20">
                behavioral:{" "}
                {signals.filter((s) => s.track === "behavioral").length}
              </span>
              <span className="px-2 py-1 text-xs rounded bg-purple-500/10 border border-purple-500/20">
                stated:{" "}
                {signals.filter((s) => s.track === "stated").length}
              </span>
            </div>
          </div>
        )}

        {/* Next steps */}
        <div className="p-4 rounded-lg bg-[var(--card)] border border-[var(--card-border)] text-sm text-[var(--muted)]">
          <p className="font-medium text-[var(--foreground)] mb-2">下一步</p>
          {onValidateModel ? (
            <p>
              推荐先点「验证模型理解」确认模型描述是否准确，再用「直接出题」进入认知预测。
            </p>
          ) : (
            <p>
              下载 JSON → 切换到「模型验证」tab → 验证准确率 → 修正模型 → 出题
            </p>
          )}
        </div>
      </div>
    );
  }

  // ── Render: Chat phase ───────────────────────────────────────

  return (
    <div className="flex gap-4" style={{ height: "calc(100vh - 180px)" }}>
      {/* Chat area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Mode indicator */}
        {isRefineMode && (
          <div className="flex items-center gap-2 mb-3 px-3 py-2 rounded-lg bg-orange-500/5 border border-orange-500/20 text-sm">
            <span className="text-orange-400 font-medium">修正模式</span>
            <span className="text-[var(--muted)]">·</span>
            <span className="text-[var(--muted)]">
              聚焦：
              {focusDims.map((d) => DIM_NAMES_ZH[d] || d).join("、")}
            </span>
          </div>
        )}

        {/* Messages */}
        <div className="flex-1 overflow-y-auto space-y-3 pb-4">
          {messages.map((msg, i) => (
            <div
              key={i}
              className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
            >
              <div
                className={`max-w-[80%] px-4 py-2.5 rounded-2xl text-sm leading-relaxed ${
                  msg.role === "user"
                    ? "bg-[var(--accent)] text-white rounded-br-md"
                    : "bg-[var(--card)] border border-[var(--card-border)] rounded-bl-md"
                }`}
              >
                {msg.content}
              </div>
            </div>
          ))}
          {loading && (
            <div className="flex justify-start">
              <div className="px-4 py-2.5 rounded-2xl rounded-bl-md bg-[var(--card)] border border-[var(--card-border)] text-sm text-[var(--muted)]">
                <span className="animate-pulse">思考中...</span>
              </div>
            </div>
          )}
          <div ref={chatEndRef} />
        </div>

        {/* Status bar */}
        <div className="flex items-center justify-between text-xs text-[var(--muted)] py-1">
          <span>
            第 {turn} 轮
            {analyzing && " · 分析中..."}
            {signals.length > 0 && ` · ${signals.length} 信号`}
            {conflicts.length > 0 && ` · ${conflicts.length} 矛盾`}
          </span>
          <div className="flex gap-2">
            <button
              onClick={() => setShowPanel(!showPanel)}
              className="hover:text-white transition-colors"
            >
              {showPanel ? "隐藏面板" : "显示面板"}
            </button>
            <button
              onClick={endInterview}
              disabled={loading || building || messages.length < 6}
              className="hover:text-white transition-colors disabled:opacity-30"
            >
              结束对话 → {isRefineMode ? "修正模型" : "建模"}
            </button>
          </div>
        </div>

        {/* Input area */}
        <div className="flex gap-2 pt-2 border-t border-[var(--card-border)]">
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="说点什么...（Enter 发送，Shift+Enter 换行）"
            disabled={loading || building}
            rows={1}
            className="flex-1 bg-[var(--card)] border border-[var(--card-border)] rounded-xl px-4 py-2.5 text-sm resize-none focus:outline-none focus:border-[var(--accent)] disabled:opacity-50"
          />
          <button
            onClick={sendMessage}
            disabled={loading || !input.trim()}
            className="px-4 py-2.5 bg-[var(--accent)] text-white rounded-xl text-sm hover:opacity-90 disabled:opacity-30 transition-opacity"
          >
            发送
          </button>
        </div>

        {error && <p className="text-red-400 text-xs mt-1">{error}</p>}
      </div>

      {/* Right panel: dimension coverage */}
      {showPanel && (
        <div className="w-56 flex-shrink-0 overflow-y-auto">
          <div className="p-3 rounded-lg bg-[var(--card)] border border-[var(--card-border)]">
            <h3 className="text-xs font-medium mb-3">
              {isRefineMode ? "修正进度" : "维度覆盖"}
            </h3>
            {coverage.length === 0 ? (
              <p className="text-xs text-[var(--muted)]">
                第 5 轮后开始追踪
              </p>
            ) : (
              <div className="space-y-2">
                {coverage.map((dim) => {
                  const isFocus = focusDims.includes(dim.name);
                  const targetMet = isRefineMode
                    ? isFocus
                      ? dim.confidence === "high"
                      : true
                    : dim.confidence === "high" ||
                      dim.confidence === "medium";
                  return (
                    <div
                      key={dim.name}
                      className={
                        isRefineMode && !isFocus ? "opacity-40" : ""
                      }
                    >
                      <div className="flex items-center justify-between text-xs mb-0.5">
                        <span className="truncate pr-1">
                          {DIM_NAMES_ZH[dim.name] || dim.name}
                          {isRefineMode && isFocus && " *"}
                        </span>
                        <span
                          className={`flex-shrink-0 ${
                            targetMet
                              ? "text-green-400"
                              : dim.confidence === "medium"
                                ? "text-yellow-400"
                                : dim.confidence === "low"
                                  ? "text-orange-400"
                                  : "text-neutral-500"
                          }`}
                        >
                          {dim.confidence}
                        </span>
                      </div>
                      <div className="h-1 rounded-full bg-neutral-800">
                        <div
                          className={`h-full rounded-full transition-all duration-500 ${CONFIDENCE_COLORS[dim.confidence]} ${CONFIDENCE_WIDTH[dim.confidence]}`}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Signal summary */}
            {signals.length > 0 && (
              <div className="mt-4 pt-3 border-t border-[var(--card-border)]">
                <h3 className="text-xs font-medium mb-2">信号累积</h3>
                <div className="text-xs text-[var(--muted)] space-y-1">
                  <p>总计: {signals.length} 个信号</p>
                  <p>
                    行为:{" "}
                    {
                      signals.filter((s) => s.track === "behavioral")
                        .length
                    }{" "}
                    · 自述:{" "}
                    {signals.filter((s) => s.track === "stated").length}
                  </p>
                  {conflicts.length > 0 && (
                    <p className="text-red-400">
                      矛盾: {conflicts.length}
                    </p>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
