/* ── localStorage helpers ── */

export const LS_KEYS = {
  step: "nous_step",
  profile: "nous_profile",
  model: "nous_model",
  predictions: "nous_predictions",
  t1: "nous_t1",
  t2: "nous_t2",
  t3: "nous_t3",
  scores: "nous_scores",
  history: "nous_history",
} as const;

export function lsGet<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

export function lsSet(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch { /* quota exceeded — ignore */ }
}

export function lsClear() {
  Object.values(LS_KEYS).forEach((k) => localStorage.removeItem(k));
}

/* ── 追加式成绩日志 ──
 * 故意不放进 LS_KEYS：lsClear / stale-schema 清理 / 重来 都不会碰它。
 * S01 被试的成绩曾被 stale 清理连带删除——任何评分结果落地后必须进这个日志。 */
const RESULTS_LOG_KEY = "nous_results_log";

export function appendResultsLog(entry: Record<string, unknown>) {
  try {
    const raw = localStorage.getItem(RESULTS_LOG_KEY);
    const log: unknown[] = raw ? JSON.parse(raw) : [];
    localStorage.setItem(RESULTS_LOG_KEY, JSON.stringify([...log, entry]));
  } catch { /* quota exceeded — ignore */ }
}

export function getResultsLog(): Record<string, unknown>[] {
  return lsGet<Record<string, unknown>[]>(RESULTS_LOG_KEY, []);
}
