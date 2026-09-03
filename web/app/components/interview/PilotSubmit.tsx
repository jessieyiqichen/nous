"use client";

import { useState } from "react";
import { postJSON } from "@/lib/fetch";
import { getPilotCode } from "@/lib/sync";
import type { CognitiveModel, Conflict, Message, Signal } from "./types";

interface PilotSubmitProps {
  model: CognitiveModel;
  turn: number;
  signals: Signal[];
  conflicts: Conflict[];
  messages: Message[];
}

type SubmitState = "idle" | "submitting" | "done" | "fallback" | "error";

/** 组装本次测试的完整结果包 */
function buildPayload(props: PilotSubmitProps) {
  return {
    code: getPilotCode() || "unknown",
    submittedAt: new Date().toISOString(),
    turn: props.turn,
    messages: props.messages,
    model: props.model,
    signals: props.signals,
    conflicts: props.conflicts,
  };
}

/** 兜底方案：下载 JSON 文件，让被试发给研究者 */
function downloadPayload(payload: ReturnType<typeof buildPayload>) {
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `nous_pilot_${payload.code}_${payload.submittedAt.slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

// ── 内测结果提交面板 ──────────────────────────────────────────
export default function PilotSubmit(props: PilotSubmitProps) {
  const [state, setState] = useState<SubmitState>("idle");
  const [error, setError] = useState("");

  const submit = async () => {
    setState("submitting");
    setError("");
    const payload = buildPayload(props);
    try {
      const res = await postJSON<{ ok: boolean; fallback?: boolean }>(
        "/api/pilot/submit",
        payload,
      );
      if (res.ok) {
        setState("done");
      } else {
        // 服务端未配置存储：自动降级为本地下载
        downloadPayload(payload);
        setState("fallback");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "提交失败");
      downloadPayload(payload);
      setState("fallback");
    }
  };

  if (state === "done" || state === "fallback") {
    return (
      <div style={{ border: "1px solid var(--card-border)", padding: "24px 28px", textAlign: "center" }}>
        <p style={{ fontFamily: "var(--font-display)", fontSize: 17, fontStyle: "italic", margin: "0 0 8px" }}>
          测试完成，谢谢你！
        </p>
        <p style={{ fontSize: 13, color: "var(--muted)", margin: 0, lineHeight: 1.65 }}>
          {state === "done"
            ? "结果已提交。"
            : "结果已下载为 JSON 文件，请把它发给研究者。"}
        </p>
        {error && (
          <p style={{ fontSize: 12, color: "var(--muted-soft)", margin: "8px 0 0" }}>
            （在线提交未成功：{error}）
          </p>
        )}
      </div>
    );
  }

  return (
    <div style={{ border: "1px solid var(--card-border)", padding: "24px 28px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16 }}>
      <p style={{ fontSize: 13, color: "var(--muted)", margin: 0, lineHeight: 1.65 }}>
        看完画像后，点这里提交本次测试结果（包含对话记录和画像）。
      </p>
      <button
        onClick={submit}
        disabled={state === "submitting"}
        style={{ fontSize: 13, fontWeight: 500, padding: "10px 24px", borderRadius: 9999, border: 0, cursor: "pointer", background: "var(--accent)", color: "#fff", opacity: state === "submitting" ? 0.4 : 1, whiteSpace: "nowrap", transition: "opacity 200ms" }}
      >
        {state === "submitting" ? "提交中..." : "完成测试，提交结果"}
      </button>
    </div>
  );
}
