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

      // Every turn from turn 3 onward, run analysis (maximize info per turn)
      let coverageHint = "";
      let latestCoverage = coverage;
      const shouldAnalyze = newTurn >= 3 || hardLimitReached;
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
            onClick={() =>
              startInterview(isRefineMode, existingModel, focusDims)
            }
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

  // ── Render: Building state ───────────────────────────────────

  if (phase === "building") {
    return (
      <div className="flex flex-col items-center justify-center" style={{ minHeight: "60vh" }}>
        <div className="text-center">
          <div style={{ width: 32, height: 32, margin: "0 auto 20px", border: "1.5px solid var(--accent)", borderTopColor: "transparent", borderRadius: 9999 }} className="animate-spin" />
          <p style={{ fontFamily: "var(--font-display)", fontSize: 17, fontWeight: 400, fontStyle: "italic", margin: "0 0 4px" }}>
            {isRefineMode ? "正在修正认知模型" : "正在构建认知模型"}
          </p>
          <p style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--muted-soft)", letterSpacing: "0.02em", margin: 0 }}>
            {messages.length} 条对话
            {isRefineMode && focusDims.length > 0
              ? ` · ${focusDims.length} 个维度`
              : " · 9 维度"}
          </p>
        </div>
      </div>
    );
  }

  // ── Render: Result state ─────────────────────────────────────

  if (phase === "result" && model) {
    /** Shared dimension card renderer — hairline border, literary style */
    const renderDimCard = (dim: { name: string; description: string; behavioral_predictions: string[]; confidence: string }) => {
      const isFocus = isRefineMode && focusDims.includes(dim.name);
      return (
        <div
          key={dim.name}
          style={{
            border: `1px solid ${isFocus ? "var(--accent)" : "var(--card-border)"}`,
            background: isFocus ? "var(--accent-soft)" : "transparent",
            borderRadius: 0,
            padding: "16px 20px",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 8 }}>
            <h3 style={{ fontFamily: "var(--font-display)", fontSize: 15, fontWeight: 400, margin: 0 }}>
              {DIM_NAMES_ZH[dim.name] || dim.name}
            </h3>
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: "0.05em", textTransform: "uppercase" as const, color: "var(--muted-soft)" }}>
              {dim.confidence}
            </span>
          </div>
          <p style={{ fontSize: 13, color: "var(--muted)", lineHeight: 1.65, margin: "0 0 12px" }}>
            {dim.description.length > 60 ? dim.description.slice(0, 60) + "..." : dim.description}
          </p>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {dim.behavioral_predictions.map((pred, i) => (
              <p
                key={i}
                style={{ fontSize: 12, color: "var(--muted-soft)", paddingLeft: 12, borderLeft: "1px solid var(--card-border)", margin: 0, lineHeight: 1.55 }}
              >
                {pred}
              </p>
            ))}
          </div>
        </div>
      );
    };

    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 28 }}>
        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
          <div>
            <p className="eyebrow" style={{ marginBottom: 8 }}>
              {isRefineMode ? "修正后的模型" : "认知模型"} · {turn} 轮对话
            </p>
            <h2 style={{ fontFamily: "var(--font-display)", fontSize: 24, fontWeight: 400, margin: "0 0 4px" }}>
              {signals.length} 个信号，{conflicts.length} 个矛盾
            </h2>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button
              onClick={() => setShowInlineValidator((v) => !v)}
              style={{ fontSize: 13, fontWeight: 500, padding: "10px 20px", borderRadius: 9999, border: 0, cursor: "pointer", background: "var(--accent)", color: "#fff", transition: "opacity 200ms" }}
            >
              {showInlineValidator ? "收起验证" : "开始验证"}
            </button>
            {onModelReady && (
              <button
                onClick={() => onModelReady(model)}
                style={{ fontSize: 13, fontWeight: 500, padding: "9px 19px", borderRadius: 9999, border: "1px solid var(--card-border)", cursor: "pointer", background: "transparent", color: "var(--muted)", transition: "all 200ms" }}
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
              style={{ fontSize: 13, fontWeight: 500, padding: "9px 19px", borderRadius: 9999, border: "1px solid var(--card-border)", cursor: "pointer", background: "transparent", color: "var(--muted)", transition: "all 200ms" }}
            >
              下载
            </button>
            <button
              onClick={reset}
              style={{ fontSize: 13, fontWeight: 500, padding: "9px 19px", borderRadius: 9999, border: "1px solid var(--card-border)", cursor: "pointer", background: "transparent", color: "var(--muted)", transition: "all 200ms" }}
            >
              重来
            </button>
          </div>
        </div>

        {/* Model details — collapsible when validator is shown */}
        {showInlineValidator ? (
          <details>
            <summary style={{ cursor: "pointer", fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: "0.05em", textTransform: "uppercase" as const, color: "var(--muted-soft)", padding: "4px 0" }}>
              查看模型详情 · {model.dimensions.length} 维度
            </summary>
            <div style={{ display: "flex", flexDirection: "column", gap: 20, marginTop: 16 }}>
              <p className="pull-quote">{model.summary}</p>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 1, border: "1px solid var(--card-border)" }}>
                {(model.dimensions || []).map(renderDimCard)}
              </div>
            </div>
          </details>
        ) : (
          <>
            {/* Summary — pull-quote */}
            <p className="pull-quote">{model.summary}</p>

            {/* Dimensions grid */}
            <div>
              <p className="eyebrow" style={{ marginBottom: 12 }}>9 个认知维度</p>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 1, border: "1px solid var(--card-border)" }}>
                {(model.dimensions || []).map(renderDimCard)}
              </div>
            </div>

            {/* Conflicts */}
            {conflicts.length > 0 && (
              <div>
                <p className="eyebrow" style={{ marginBottom: 12 }}>
                  述行矛盾 · {conflicts.length}
                </p>
                <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
                  {conflicts.map((c, i) => (
                    <div
                      key={i}
                      style={{ padding: "16px 0", borderBottom: "1px solid var(--card-border)", fontSize: 13, display: "flex", flexDirection: "column", gap: 4 }}
                    >
                      <p style={{ margin: 0 }}>
                        <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: "0.05em", textTransform: "uppercase" as const, color: "var(--muted-soft)", marginRight: 8 }}>声称</span>
                        {c.stated_claim}
                      </p>
                      <p style={{ margin: 0 }}>
                        <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: "0.05em", textTransform: "uppercase" as const, color: "var(--accent)", marginRight: 8 }}>实际</span>
                        {c.actual_behavior}
                      </p>
                      <p style={{ fontSize: 12, fontStyle: "italic", color: "var(--muted-soft)", margin: 0, paddingTop: 4 }}>
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
                <p className="eyebrow" style={{ marginBottom: 12 }}>
                  认知信号 · {signals.length}
                </p>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
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
                      style={{ fontSize: 11, padding: "3px 10px", borderRadius: 9999, border: "1px solid var(--card-border)", color: "var(--muted)" }}
                    >
                      {type} <span style={{ fontFamily: "var(--font-mono)", fontSize: 10 }}>{count}</span>
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Next steps */}
            {!showInlineValidator && (
              <div style={{ borderLeft: "1px solid var(--card-border)", paddingLeft: 20, marginTop: 8 }}>
                <p style={{ fontSize: 13, color: "var(--muted)", margin: 0, lineHeight: 1.65 }}>
                  推荐先「开始验证」确认模型是否准确，再用「直接出题」进入认知预测。
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
              onClick={endInterview}
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
            onKeyDown={handleKeyDown}
            placeholder="说点什么..."
            disabled={loading || building}
            rows={1}
            style={{ width: "100%", background: "transparent", border: "none", padding: "8px 40px 8px 0", fontSize: 14, color: "var(--foreground)", fontFamily: "inherit", outline: "none", resize: "none", opacity: (loading || building) ? 0.5 : 1, boxSizing: "border-box" }}
          />
          <button
            onClick={sendMessage}
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
