"use client";

import { useCallback, useState } from "react";
import { CHANNEL_THEMES, DEFAULT_CHANNEL_THEME, THREADS } from "./threads";
import { StatusBar } from "./parts";
import ChatThread from "./ChatThread";
import CustomThread from "./CustomThread";

type View = "list" | string; // string = thread id / "custom"

export default function AgentPage() {
  const [view, setView] = useState<View>("list");
  const [corrections, setCorrections] = useState(0);
  const [statuses, setStatuses] = useState<Record<string, string>>({});

  const handleCorrection = useCallback(() => setCorrections((c) => c + 1), []);
  const handleStatus = useCallback((id: string) => {
    return (status: string) => setStatuses((prev) => ({ ...prev, [id]: status }));
  }, []);
  const goBack = useCallback(() => setView("list"), []);

  return (
    <main style={{ minHeight: "100vh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "24px 16px", gap: 14 }}>
      {/* 手机框 */}
      <div
        style={{
          width: "min(400px, 100%)",
          height: "min(760px, calc(100vh - 96px))",
          border: "1px solid var(--card-border)",
          borderRadius: 28,
          background: "var(--background)",
          overflow: "hidden",
          display: "flex",
          flexDirection: "column",
          boxShadow: "0 8px 40px rgba(0,0,0,0.10)",
        }}
      >
        {/* ── 通知中心（首页）── */}
        <div style={{ flex: 1, minHeight: 0, display: view === "list" ? "flex" : "none", flexDirection: "column" }}>
          <StatusBar bg="var(--background)" color="var(--foreground)" />

          {/* Nous 代理层常驻通知 */}
          <div style={{ margin: "10px 14px 4px", padding: "10px 14px", borderRadius: 12, background: "var(--card)", border: "1px solid var(--card-border)", display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
            <span style={{
              width: 22, height: 22, borderRadius: 6, flexShrink: 0, background: "var(--accent)", color: "#fff",
              display: "inline-flex", alignItems: "center", justifyContent: "center", fontFamily: "var(--font-display)", fontSize: 13,
            }}>
              N
            </span>
            <div style={{ flex: 1 }}>
              <p style={{ fontSize: 12, fontWeight: 500, margin: 0, color: "var(--foreground)" }}>Nous 分身正在值守</p>
              <p style={{ fontSize: 10.5, margin: "1px 0 0", color: "var(--muted-soft)" }}>跨 微信 / 钉钉 / 飞书 · 6 条消息已按你的方式分类</p>
            </div>
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 9.5, color: corrections > 0 ? "var(--accent)" : "var(--muted-soft)", flexShrink: 0 }}>
              修正信号 {corrections}
            </span>
          </div>

          <p style={{ fontSize: 11, color: "var(--muted-soft)", margin: "10px 20px 6px", flexShrink: 0 }}>通知中心 · 今天</p>

          {/* 各平台推送通知 */}
          <div style={{ flex: 1, overflowY: "auto", padding: "0 14px 10px", display: "flex", flexDirection: "column", gap: 8 }}>
            {THREADS.map((t) => {
              const theme = CHANNEL_THEMES[t.channel] ?? DEFAULT_CHANNEL_THEME;
              const status = statuses[t.id];
              return (
                <button
                  key={t.id}
                  onClick={() => setView(t.id)}
                  style={{
                    textAlign: "left", padding: "10px 14px", border: 0, borderRadius: 12,
                    background: "rgba(255,255,255,0.72)", boxShadow: "0 1px 3px rgba(0,0,0,0.05)",
                    cursor: "pointer", fontFamily: "inherit",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
                    <span style={{
                      width: 15, height: 15, borderRadius: 4, flexShrink: 0, background: theme.appColor, color: "#fff",
                      display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 9,
                    }}>
                      {t.channel.slice(0, 1)}
                    </span>
                    <span style={{ fontSize: 10, color: "var(--muted-soft)" }}>{t.channel}</span>
                    <span style={{ marginLeft: "auto", fontSize: 10, color: "var(--muted-soft)" }}>
                      {status ? status : t.notifTime}
                    </span>
                  </div>
                  <p style={{ fontSize: 12.5, fontWeight: 500, margin: "0 0 2px", color: "var(--foreground)" }}>{t.sender}</p>
                  <p style={{ fontSize: 12, color: "var(--muted)", margin: 0, lineHeight: 1.5, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {t.turns[0].incoming}
                  </p>
                </button>
              );
            })}

            {/* 自定义会话入口 */}
            <button
              onClick={() => setView("custom")}
              style={{
                textAlign: "left", padding: "10px 14px", border: "1px dashed var(--card-border)", borderRadius: 12,
                background: "transparent", cursor: "pointer", fontFamily: "inherit",
              }}
            >
              <p style={{ fontSize: 12.5, margin: "0 0 2px", color: "var(--muted)" }}>＋ 自定义会话</p>
              <p style={{ fontSize: 11, color: "var(--muted-soft)", margin: 0 }}>
                丢一条真实消息进来，看分身怎么接{statuses.custom ? ` · ${statuses.custom}` : ""}
              </p>
            </button>
          </div>
        </div>

        {/* ── 线程（常驻挂载保状态，display 切换）── */}
        {THREADS.map((t) => (
          <div key={t.id} style={{ flex: 1, minHeight: 0, display: view === t.id ? "flex" : "none", flexDirection: "column" }}>
            <ChatThread def={t} onBack={goBack} onCorrection={handleCorrection} onStatus={handleStatus(t.id)} />
          </div>
        ))}
        <div style={{ flex: 1, minHeight: 0, display: view === "custom" ? "flex" : "none", flexDirection: "column" }}>
          <CustomThread onBack={goBack} onCorrection={handleCorrection} onStatus={handleStatus("custom")} />
        </div>
      </div>

      {/* 框外一句产品叙事 */}
      <p style={{ fontSize: 12, color: "var(--muted-soft)", textAlign: "center", lineHeight: 1.7, maxWidth: 420, margin: 0 }}>
        分身不是一个新 App——它通过企业微信 / 飞书 / QQ 官方 bot 接口住进你已有的聊天软件，
        一个认知模型横跨所有平台。
      </p>
    </main>
  );
}
