"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { postJSON } from "@/lib/fetch";
import { syncSnapshot } from "@/lib/sync";
import type { RefineRequest } from "../page";
import type { CognitiveModel, Conflict, DimensionCoverage, Message, Phase, Signal } from "./interview/types";
import { lsClear } from "./interview/storage";
import { useInterviewStorageSync } from "./interview/useStorageSync";
import { applyBlindSpotsOverride, formatTranscript, formatRecentTranscript, buildCoverageHint, shouldAutoEnd } from "./interview/logic";
import EmptyState from "./interview/EmptyState";
import BuildingView from "./interview/BuildingView";
import ResultView from "./interview/ResultView";
import ChatView from "./interview/ChatView";

interface Props {
  refineRequest?: RefineRequest | null;
  onRefineConsumed?: () => void;
  onModelReady?: (model: CognitiveModel) => void;
  /** 内测模式：结果页隐藏验证/出题入口，改为提交测试结果 */
  pilot?: boolean;
}

// ── Component ─────────────────────────────────────────────────

export default function Interview({ refineRequest, onRefineConsumed, onModelReady, pilot }: Props) {
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

  // Hydrate from localStorage on mount, persist changes after hydration
  useInterviewStorageSync({
    hydrated, setHydrated,
    messages, setMessages,
    turn, setTurn,
    phase, setPhase,
    isRefineMode, setIsRefineMode,
    focusDims, setFocusDims,
    existingModel, setExistingModel,
    coverage, setCoverage,
    signals, setSignals,
    conflicts, setConflicts,
    model, setModel,
    showInlineValidator, setShowInlineValidator,
  });

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

        const data = await postJSON<{ reply: string }>("/api/interview/chat", body);
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
        const data = await postJSON<{
          signals?: { signals?: Signal[]; conflicts?: Conflict[] };
          coverage?: { dimensions?: DimensionCoverage[] };
        }>("/api/interview/analyze", {
          transcript: formatTranscript(msgs),
          recentTranscript: formatRecentTranscript(msgs),
        });

        // Accumulate signals and conflicts
        const newConflicts: Conflict[] = data.signals?.conflicts || [];
        const newSignals: Signal[] = data.signals?.signals || [];
        if (newSignals.length > 0) {
          setSignals((prev) => [...prev, ...newSignals]);
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
    [coverage, conflicts]
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

        const data = await postJSON<CognitiveModel>("/api/interview/build", body);
        setModel(data);
        setPhase("result");
        // 服务端快照（有邀请码时自动同步，失败不影响本地）
        syncSnapshot("interview", {
          turn, messages: msgs, model: data, signals, conflicts,
        });
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "Failed to build model"
        );
        setPhase("chat");
      } finally {
        setBuilding(false);
      }
    },
    [isRefineMode, existingModel, focusDims, conflicts, signals, turn]
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

      // 并行：chat 回复 + 本轮分析同时发出（原先串行，每轮多等 5-10s）。
      // coverageHint 用上一轮的覆盖度——引导提示晚一轮无碍，换来延迟减半。
      const shouldAnalyze = newTurn >= 3 || hardLimitReached;
      const coverageHint = shouldAnalyze
        ? buildCoverageHint(coverage, focusDims, isRefineMode)
        : "";

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

      const [data, latestCoverage] = await Promise.all([
        postJSON<{ reply: string }>("/api/interview/chat", chatBody),
        shouldAnalyze ? runAnalysis(updatedMessages) : Promise.resolve(coverage),
      ]);

      const aiMsg: Message = { role: "assistant", content: data.reply };
      const finalMessages = [...updatedMessages, aiMsg];
      setMessages(finalMessages);

      // Auto-end：覆盖足够就直接建模（刚收到的回复自然收尾，不再额外要结束语）
      if (
        hardLimitReached ||
        (shouldAnalyze && shouldAutoEnd(latestCoverage, newTurn, focusDims, isRefineMode))
      ) {
        setLoading(false);
        await buildModel(finalMessages);
        return;
      }
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
      <EmptyState
        isRefineMode={isRefineMode} focusDims={focusDims} loading={loading} error={error}
        onStart={() => startInterview(isRefineMode, existingModel, focusDims)}
      />
    );
  }

  // ── Render: Building state ───────────────────────────────────

  if (phase === "building") {
    return <BuildingView isRefineMode={isRefineMode} focusDims={focusDims} messageCount={messages.length} />;
  }

  // ── Render: Result state ─────────────────────────────────────

  if (phase === "result" && model) {
    return (
      <ResultView
        model={model} turn={turn} signals={signals} conflicts={conflicts}
        isRefineMode={isRefineMode} focusDims={focusDims}
        showInlineValidator={showInlineValidator} setShowInlineValidator={setShowInlineValidator}
        onModelReady={onModelReady} onModelCorrected={handleModelCorrected} onReset={reset}
        pilot={pilot} messages={messages}
      />
    );
  }

  // ── Render: Chat phase ───────────────────────────────────────

  return (
    <ChatView
      messages={messages} turn={turn} coverage={coverage} signals={signals} conflicts={conflicts}
      isRefineMode={isRefineMode} focusDims={focusDims}
      input={input} setInput={setInput} loading={loading} analyzing={analyzing} building={building}
      error={error} showPanel={showPanel} setShowPanel={setShowPanel}
      inputRef={inputRef} chatEndRef={chatEndRef}
      onSend={sendMessage} onEnd={endInterview} onKeyDown={handleKeyDown}
    />
  );
}
