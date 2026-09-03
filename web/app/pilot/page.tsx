"use client";

import { useEffect, useState } from "react";
import Interview from "../components/Interview";
import { LS_KEYS, lsClear, lsGet, lsSet } from "../components/interview/storage";
import { postJSON } from "@/lib/fetch";
import { PILOT_CODE_KEY, fetchLatestSnapshot, getPilotCode, setPilotCode } from "@/lib/sync";

/** 服务端快照 → 写回本地存储（跨设备恢复） */
function restoreToLocal(snap: Record<string, unknown>) {
  lsSet(LS_KEYS.messages, snap.messages || []);
  lsSet(LS_KEYS.turn, snap.turn || 0);
  lsSet(LS_KEYS.signals, snap.signals || []);
  lsSet(LS_KEYS.conflicts, snap.conflicts || []);
  if (snap.model) {
    lsSet(LS_KEYS.model, snap.model);
    lsSet(LS_KEYS.phase, "result");
  }
}

// ── 内测入口：邀请码 → 单线流程（访谈 → 画像 → 提交） ─────────
export default function PilotPage() {
  const [authed, setAuthed] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  const [code, setCode] = useState("");
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    setAuthed(!!getPilotCode());
    setHydrated(true);
  }, []);

  const enter = async () => {
    const trimmed = code.trim();
    if (!trimmed || checking) return;
    setChecking(true);
    setError("");
    try {
      await postJSON("/api/pilot/auth", { code: trimmed });

      const sameCode = getPilotCode() === trimmed;
      const existing = lsGet<unknown[]>(LS_KEYS.messages, []);

      if (existing.length > 0 && !sameCode) {
        // 换了人：残留数据属于上一位被试（或主站），确认后清空
        const ok = window.confirm(
          "检测到本浏览器已有别人的对话数据。开始新测试将清空这些数据，确定继续吗？",
        );
        if (!ok) {
          setChecking(false);
          return;
        }
        lsClear();
      }

      setPilotCode(trimmed);

      // 本地为空 → 尝试从服务端恢复该邀请码的进度（换设备续跑）
      if (lsGet<unknown[]>(LS_KEYS.messages, []).length === 0) {
        const snap = await fetchLatestSnapshot("interview");
        if (snap) restoreToLocal(snap);
      }

      setAuthed(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "验证失败");
    } finally {
      setChecking(false);
    }
  };

  if (!hydrated) return null;

  if (!authed) {
    return (
      <main className="min-h-screen flex items-center justify-center">
        <div className="text-center" style={{ maxWidth: 400, padding: 24 }}>
          <h1 style={{ fontFamily: "var(--font-display)", fontSize: 24, fontWeight: 400, margin: "0 0 8px" }}>
            Nous
          </h1>
          <p style={{ fontSize: 13, color: "var(--muted)", margin: "0 0 28px", lineHeight: 1.65 }}>
            输入邀请码开始。整个过程约 20 分钟，跟它聊就行。
          </p>
          <div style={{ display: "flex", gap: 8, justifyContent: "center" }}>
            <input
              value={code}
              onChange={(e) => setCode(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && enter()}
              placeholder="邀请码"
              autoFocus
              style={{ fontSize: 14, padding: "10px 16px", border: "1px solid var(--card-border)", borderRadius: 8, background: "transparent", color: "var(--foreground)", width: 160, outline: "none" }}
            />
            <button
              onClick={enter}
              disabled={checking || !code.trim()}
              style={{ fontSize: 13, fontWeight: 500, padding: "10px 24px", borderRadius: 9999, border: 0, cursor: "pointer", background: "var(--accent)", color: "#fff", opacity: checking || !code.trim() ? 0.4 : 1, transition: "opacity 200ms" }}
            >
              {checking ? "验证中..." : "进入"}
            </button>
          </div>
          {error && <p style={{ fontSize: 13, color: "var(--error)", marginTop: 12 }}>{error}</p>}
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen flex flex-col">
      <header className="border-b border-[var(--card-border)]">
        <div className="max-w-4xl mx-auto flex items-center justify-between" style={{ padding: "14px 24px" }}>
          <h1 style={{ margin: 0, fontFamily: "var(--font-display)", fontWeight: 400, fontSize: 18 }}>
            Nous
          </h1>
          <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: "0.05em", textTransform: "uppercase", color: "var(--muted-soft)" }}>
            内测 · {getPilotCode() || localStorage.getItem(PILOT_CODE_KEY)}
          </span>
        </div>
      </header>
      <div className="flex-1 max-w-4xl w-full mx-auto px-6 py-8">
        <Interview pilot />
      </div>
    </main>
  );
}
