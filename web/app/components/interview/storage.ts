import { clearInlineValidatorStorage } from "../InlineValidator";

// ── LocalStorage helpers ──────────────────────────────────────

export const LS_KEYS = {
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

export function lsGet<T>(key: string, fallback: T): T {
  try {
    const v = localStorage.getItem(key);
    return v ? (JSON.parse(v) as T) : fallback;
  } catch {
    return fallback;
  }
}
export function lsSet(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* quota */
  }
}
export function lsClear() {
  Object.values(LS_KEYS).forEach((k) => localStorage.removeItem(k));
  clearInlineValidatorStorage();
}
