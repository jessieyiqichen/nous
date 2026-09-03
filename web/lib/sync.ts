/**
 * 客户端同步层：关键节点把快照推到服务端（fire-and-forget）。
 *
 * 身份 = 邀请码，存 localStorage（nous_pilot_code）——被试自己的设备上持久有效。
 * 没有邀请码（比如研究者自己在主站用）就静默跳过，不影响任何流程。
 * 同步失败只 console.warn：本地 localStorage 仍是工作数据，服务端是备份。
 */

export const PILOT_CODE_KEY = "nous_pilot_code";

export function getPilotCode(): string | null {
  try {
    return localStorage.getItem(PILOT_CODE_KEY);
  } catch {
    return null;
  }
}

export function setPilotCode(code: string) {
  try {
    localStorage.setItem(PILOT_CODE_KEY, code);
  } catch { /* ignore */ }
}

export type SyncKind = "interview" | "scores" | "final_submit";

export async function syncSnapshot(kind: SyncKind, payload: Record<string, unknown>): Promise<boolean> {
  const code = getPilotCode();
  if (!code) return false;
  try {
    const res = await fetch("/api/sync", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code, kind, payload }),
    });
    const data = await res.json().catch(() => null);
    if (!data?.ok) {
      console.warn(`[sync] ${kind} 未持久化:`, data?.error || (data?.unconfigured ? "服务端未配置存储" : res.status));
      return false;
    }
    return true;
  } catch (e) {
    console.warn(`[sync] ${kind} 同步失败（本地数据不受影响）:`, e);
    return false;
  }
}

/** 跨设备恢复：取服务端最新快照，无则 null */
export async function fetchLatestSnapshot(kind: SyncKind): Promise<Record<string, unknown> | null> {
  const code = getPilotCode();
  if (!code) return null;
  try {
    const res = await fetch(`/api/sync?code=${encodeURIComponent(code)}&kind=${kind}`);
    const data = await res.json().catch(() => null);
    return data?.ok && data.snapshot ? (data.snapshot.payload as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}
