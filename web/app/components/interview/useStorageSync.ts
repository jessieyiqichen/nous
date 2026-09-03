"use client";

import { useEffect } from "react";
import type { Dispatch, SetStateAction } from "react";
import type { CognitiveModel, Conflict, DimensionCoverage, Message, Phase, Signal } from "./types";
import { LS_KEYS, lsGet, lsSet } from "./storage";

interface StorageSyncState {
  hydrated: boolean;
  setHydrated: Dispatch<SetStateAction<boolean>>;
  messages: Message[];
  setMessages: Dispatch<SetStateAction<Message[]>>;
  turn: number;
  setTurn: Dispatch<SetStateAction<number>>;
  phase: Phase;
  setPhase: Dispatch<SetStateAction<Phase>>;
  isRefineMode: boolean;
  setIsRefineMode: Dispatch<SetStateAction<boolean>>;
  focusDims: string[];
  setFocusDims: Dispatch<SetStateAction<string[]>>;
  existingModel: CognitiveModel | null;
  setExistingModel: Dispatch<SetStateAction<CognitiveModel | null>>;
  coverage: DimensionCoverage[];
  setCoverage: Dispatch<SetStateAction<DimensionCoverage[]>>;
  signals: Signal[];
  setSignals: Dispatch<SetStateAction<Signal[]>>;
  conflicts: Conflict[];
  setConflicts: Dispatch<SetStateAction<Conflict[]>>;
  model: CognitiveModel | null;
  setModel: Dispatch<SetStateAction<CognitiveModel | null>>;
  showInlineValidator: boolean;
  setShowInlineValidator: Dispatch<SetStateAction<boolean>>;
}

/** Hydrate state from localStorage on mount, then persist changes back. */
export function useInterviewStorageSync(s: StorageSyncState) {
  const {
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
  } = s;

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
  }, [setMessages, setTurn, setPhase, setIsRefineMode, setFocusDims, setExistingModel, setCoverage, setSignals, setConflicts, setModel, setShowInlineValidator, setHydrated]);

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
}
