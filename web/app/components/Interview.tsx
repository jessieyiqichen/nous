"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import type { RefineRequest } from "../page";
import InlineValidator, { clearInlineValidatorStorage } from "./InlineValidator";

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
  showInlineValidator: "nous_interview_show_iv",
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
  clearInlineValidatorStorage();
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
  high: "bg-[var(--success)]",
  medium: "bg-[var(--accent)]",
  low: "bg-[var(--muted)]",
  none: "bg-[var(--card-border)]",
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

export default function Interview({ refineRequest, onRefineConsumed, onModelReady }: Props) {
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
  const [showInlineValidator, setShowInlineValidator] = useState(false);

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
    setShowInlineValidator(lsGet(LS_KEYS.showInlineValidator, false));
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
  useEffect(() => { if (hydrated) lsSet(LS_KEYS.showInlineValidator, showInlineValidator); }, [showInlineValidator, hydrated]);

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

  // ── Model corrected handler ─────────────────────────────────

  const handleModelCorrected = useCallback((correctedModel: CognitiveModel) => {
    setModel(correctedModel);
  }, []);

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
    setShowInlineValidator(false);
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
      <div className="flex flex-col items-center justify-center" style={{ minHeight: "60vh" }}>
        <div className="text-center max-w-md space-y-5">
          <div className="w-12 h-12 mx-auto rounded-2xl bg-[var(--accent-soft)] flex items-center justify-center">
            <span className="text-xl text-[var(--accent)]">N</span>
          </div>
          <div className="space-y-2">
            <h2 className="text-xl font-semibold">
              {isRefineMode ? "认知模型修正" : "认知访谈"}
            </h2>
            {isRefineMode && focusDims.length > 0 ? (
              <>
                <p className="text-sm text-[var(--muted)] leading-relaxed">
                  针对以下维度进行深度对话修正
                </p>
                <div className="flex flex-wrap gap-2 justify-center pt-1">
                  {focusDims.map((d) => (
                    <span
                      key={d}
                      className="px-2.5 py-1 text-xs rounded-full bg-[var(--accent-soft)] text-[var(--accent)]"
                    >
                      {DIM_NAMES_ZH[d] || d}
                    </span>
                  ))}
                </div>
              </>
            ) : (
              <p className="text-sm text-[var(--muted)] leading-relaxed">
                通过自然对话了解你的思维模式，<br />
                自动构建 9 维度认知模型
              </p>
            )}
          </div>
          <button
            onClick={() =>
              startInterview(isRefineMode, existingModel, focusDims)
            }
            disabled={loading}
            className="px-8 py-2.5 bg-[var(--accent)] text-white rounded-full text-sm font-medium hover:opacity-90 disabled:opacity-50 transition-opacity"
          >
            {loading
              ? "正在准备..."
              : isRefineMode
                ? "开始修正对话"
                : "开始对话"}
          </button>
          {error && <p className="text-[var(--error)] text-sm mt-2">{error}</p>}
        </div>
      </div>
    );
  }

  // ── Render: Building state ───────────────────────────────────

  if (phase === "building") {
    return (
      <div className="flex flex-col items-center justify-center" style={{ minHeight: "60vh" }}>
        <div className="text-center space-y-4">
          <div className="w-10 h-10 mx-auto border-2 border-[var(--accent)] border-t-transparent rounded-full animate-spin" />
          <div className="space-y-1">
            <p className="text-sm font-medium">
              {isRefineMode ? "正在修正认知模型" : "正在构建认知模型"}
            </p>
            <p className="text-xs text-[var(--muted)]">
              分析 {messages.length} 条对话记录
              {isRefineMode && focusDims.length > 0
                ? `，修正 ${focusDims.length} 个维度`
                : "，提取 9 个维度的认知特征"}
            </p>
          </div>
        </div>
      </div>
    );
  }

  // ── Render: Result state ─────────────────────────────────────

  if (phase === "result" && model) {
    /** Shared dimension card renderer */
    const renderDimCard = (dim: { name: string; description: string; behavioral_predictions: string[]; confidence: string }) => {
      const isFocus = isRefineMode && focusDims.includes(dim.name);
      return (
        <div
          key={dim.name}
          className={`p-5 rounded-xl bg-[var(--card)] border transition-colors ${
            isFocus ? "border-[var(--accent)]/40" : "border-[var(--card-border)]"
          }`}
        >
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-medium text-sm">
              {DIM_NAMES_ZH[dim.name] || dim.name}
              {isFocus && (
                <span className="ml-2 text-xs text-[var(--accent)]">已修正</span>
              )}
            </h3>
            <span
              className={`text-[11px] px-2 py-0.5 rounded-full font-medium ${
                dim.confidence === "high"
                  ? "bg-[var(--success)]/15 text-[var(--success)]"
                  : dim.confidence === "medium"
                    ? "bg-[var(--accent)]/15 text-[var(--accent)]"
                    : "bg-[var(--muted)]/15 text-[var(--muted)]"
              }`}
            >
              {dim.confidence}
            </span>
          </div>
          <p className="text-sm text-[var(--muted)] leading-relaxed mb-3">
            {dim.description}
          </p>
          <div className="space-y-1.5">
            {dim.behavioral_predictions.map((pred, i) => (
              <p
                key={i}
                className="text-xs text-[var(--muted-soft)] pl-3 border-l-2 border-[var(--card-border)]"
              >
                {pred}
              </p>
            ))}
          </div>
        </div>
      );
    };

    return (
      <div className="space-y-8">
        {/* Header */}
        <div className="flex items-start justify-between">
          <div className="space-y-1">
            <h2 className="text-lg font-semibold">
              {isRefineMode ? "修正后的认知模型" : "认知模型"}
            </h2>
            <p className="text-sm text-[var(--muted)]">
              {turn} 轮对话 · {signals.length} 个信号 · {conflicts.length} 个矛盾
            </p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => setShowInlineValidator((v) => !v)}
              className="px-4 py-2 text-sm rounded-full bg-[var(--accent)] text-white font-medium hover:opacity-90 transition-opacity"
            >
              {showInlineValidator ? "收起验证" : "开始验证"}
            </button>
            {onModelReady && (
              <button
                onClick={() => onModelReady(model)}
                className="px-4 py-2 text-sm rounded-full border border-[var(--card-border)] text-[var(--muted)] hover:text-[var(--foreground)] hover:border-[var(--muted)] transition-colors"
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
              className="px-4 py-2 text-sm rounded-full border border-[var(--card-border)] text-[var(--muted)] hover:text-[var(--foreground)] hover:border-[var(--muted)] transition-colors"
            >
              下载
            </button>
            <button
              onClick={reset}
              className="px-4 py-2 text-sm rounded-full border border-[var(--card-border)] text-[var(--muted)] hover:text-[var(--foreground)] hover:border-[var(--muted)] transition-colors"
            >
              重来
            </button>
          </div>
        </div>

        {/* Model details — collapsible when validator is shown */}
        {showInlineValidator ? (
          <details className="group">
            <summary className="cursor-pointer text-sm text-[var(--muted)] hover:text-[var(--foreground)] transition-colors py-1">
              查看模型详情（{model.dimensions.length} 个维度）
            </summary>
            <div className="space-y-5 mt-4">
              <div className="p-5 rounded-xl bg-[var(--card)] border border-[var(--card-border)]">
                <p className="text-sm leading-relaxed">{model.summary}</p>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {(model.dimensions || []).map(renderDimCard)}
              </div>
            </div>
          </details>
        ) : (
          <>
            {/* Summary */}
            <div className="p-5 rounded-xl bg-[var(--card)] border border-[var(--card-border)]">
              <p className="text-sm leading-relaxed">{model.summary}</p>
            </div>

            {/* Dimensions grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {(model.dimensions || []).map(renderDimCard)}
            </div>

            {/* Conflicts */}
            {conflicts.length > 0 && (
              <div className="space-y-3">
                <h3 className="text-sm font-medium text-[var(--muted)]">
                  述行矛盾（{conflicts.length}）
                </h3>
                <div className="space-y-2">
                  {conflicts.map((c, i) => (
                    <div
                      key={i}
                      className="p-4 rounded-xl bg-[var(--card)] border border-[var(--card-border)] text-sm space-y-1"
                    >
                      <p>
                        <span className="text-[var(--muted)]">声称：</span>
                        {c.stated_claim}
                      </p>
                      <p>
                        <span className="text-[var(--accent)]">实际：</span>
                        {c.actual_behavior}
                      </p>
                      <p className="text-[var(--muted-soft)] text-xs pt-1">
                        {c.blind_spot_evidence}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Signal stats */}
            {signals.length > 0 && (
              <div className="space-y-3">
                <h3 className="text-sm font-medium text-[var(--muted)]">
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
                      className="px-2.5 py-1 text-xs rounded-full bg-[var(--card)] border border-[var(--card-border)] text-[var(--muted)]"
                    >
                      {type}: {count}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Next steps */}
            {!showInlineValidator && (
              <div className="p-5 rounded-xl bg-[var(--accent-soft)] border border-[var(--accent)]/10 text-sm">
                <p className="text-[var(--accent)] font-medium mb-1">下一步</p>
                <p className="text-[var(--muted)]">
                  推荐先点「开始验证」确认模型描述是否准确，再用「直接出题」进入认知预测。
                </p>
              </div>
            )}
          </>
        )}

        {/* Inline Validator */}
        {showInlineValidator && (
          <InlineValidator
            model={model}
            onModelCorrected={handleModelCorrected}
            onGoPredict={(m) => onModelReady?.(m)}
          />
        )}
      </div>
    );
  }

  // ── Render: Chat phase ───────────────────────────────────────

  return (
    <div className="flex gap-5" style={{ height: "calc(100vh - 160px)" }}>
      {/* Chat area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Mode indicator */}
        {isRefineMode && (
          <div className="flex items-center gap-2 mb-3 px-4 py-2.5 rounded-xl bg-[var(--accent-soft)] text-sm">
            <span className="text-[var(--accent)] font-medium">修正模式</span>
            <span className="text-[var(--muted-soft)]">·</span>
            <span className="text-[var(--muted)]">
              {focusDims.map((d) => DIM_NAMES_ZH[d] || d).join("、")}
            </span>
          </div>
        )}

        {/* Messages */}
        <div className="flex-1 overflow-y-auto pb-4 space-y-5">
          {messages.map((msg, i) => (
            <div
              key={i}
              className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
            >
              {msg.role === "assistant" ? (
                <div className="flex gap-3 max-w-[85%]">
                  <div className="w-7 h-7 rounded-full bg-[var(--accent-soft)] flex items-center justify-center flex-shrink-0 mt-0.5">
                    <span className="text-xs text-[var(--accent)] font-medium">N</span>
                  </div>
                  <div className="text-sm leading-relaxed text-[var(--foreground)] pt-1">
                    {msg.content}
                  </div>
                </div>
              ) : (
                <div className="max-w-[75%] px-4 py-2.5 rounded-2xl rounded-br-sm bg-[var(--accent)] text-white text-sm leading-relaxed">
                  {msg.content}
                </div>
              )}
            </div>
          ))}
          {loading && (
            <div className="flex gap-3">
              <div className="w-7 h-7 rounded-full bg-[var(--accent-soft)] flex items-center justify-center flex-shrink-0">
                <span className="text-xs text-[var(--accent)] font-medium">N</span>
              </div>
              <div className="text-sm text-[var(--muted)] pt-1">
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
        <div className="flex items-center justify-between text-xs text-[var(--muted)] py-2">
          <span>
            第 {turn} 轮
            {analyzing && " · 分析中"}
            {signals.length > 0 && ` · ${signals.length} 信号`}
            {conflicts.length > 0 && ` · ${conflicts.length} 矛盾`}
          </span>
          <div className="flex gap-3">
            <button
              onClick={() => setShowPanel(!showPanel)}
              className="hover:text-[var(--foreground)] transition-colors"
            >
              {showPanel ? "隐藏面板" : "面板"}
            </button>
            <button
              onClick={endInterview}
              disabled={loading || building || messages.length < 6}
              className="hover:text-[var(--foreground)] transition-colors disabled:opacity-30"
            >
              结束 → {isRefineMode ? "修正" : "建模"}
            </button>
          </div>
        </div>

        {/* Input area */}
        <div className="relative">
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="说点什么..."
            disabled={loading || building}
            rows={1}
            className="w-full bg-[var(--card)] border border-[var(--card-border)] rounded-2xl pl-4 pr-14 py-3 text-sm resize-none focus:outline-none focus:border-[var(--accent)]/50 disabled:opacity-50 transition-colors"
          />
          <button
            onClick={sendMessage}
            disabled={loading || !input.trim()}
            className="absolute right-2 top-1/2 -translate-y-1/2 w-8 h-8 flex items-center justify-center rounded-xl bg-[var(--accent)] text-white hover:opacity-90 disabled:opacity-30 transition-opacity"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 12h14M12 5l7 7-7 7" />
            </svg>
          </button>
        </div>

        {error && <p className="text-[var(--error)] text-xs mt-2">{error}</p>}
      </div>

      {/* Right panel: dimension coverage */}
      {showPanel && (
        <div className="w-52 flex-shrink-0 overflow-y-auto">
          <div className="p-4 rounded-xl bg-[var(--card)] border border-[var(--card-border)]">
            <h3 className="text-xs font-medium text-[var(--muted)] mb-3">
              {isRefineMode ? "修正进度" : "维度覆盖"}
            </h3>
            {coverage.length === 0 ? (
              <p className="text-xs text-[var(--muted-soft)]">
                第 5 轮后开始追踪
              </p>
            ) : (
              <div className="space-y-2.5">
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
                        isRefineMode && !isFocus ? "opacity-30" : ""
                      }
                    >
                      <div className="flex items-center justify-between text-[11px] mb-1">
                        <span className="truncate pr-1 text-[var(--muted)]">
                          {DIM_NAMES_ZH[dim.name] || dim.name}
                        </span>
                        <span
                          className={`flex-shrink-0 ${
                            targetMet
                              ? "text-[var(--success)]"
                              : dim.confidence === "medium"
                                ? "text-[var(--accent)]"
                                : "text-[var(--muted-soft)]"
                          }`}
                        >
                          {dim.confidence}
                        </span>
                      </div>
                      <div className="h-1 rounded-full bg-[var(--background)]">
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
                <div className="text-[11px] text-[var(--muted)] space-y-1">
                  <p>{signals.length} 信号</p>
                  <p>
                    行为 {signals.filter((s) => s.track === "behavioral").length} · 自述 {signals.filter((s) => s.track === "stated").length}
                  </p>
                  {conflicts.length > 0 && (
                    <p className="text-[var(--accent)]">
                      {conflicts.length} 矛盾
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
