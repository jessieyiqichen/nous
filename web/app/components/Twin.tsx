"use client";

// 「认知分身」tab：/agent 独立产品形态的入口。
// 产品 demo 本体在 app/agent/（手机框聊天界面），这里只做导流。

export default function Twin() {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 28 }}>
      <div>
        <p className="eyebrow" style={{ marginBottom: 8 }}>Cognitive Twin · Message Agent</p>
        <h2 style={{ fontFamily: "var(--font-display)", fontSize: 28, fontWeight: 400, margin: "0 0 8px" }}>
          认知分身
        </h2>
        <p style={{ fontSize: 14, color: "var(--muted)", lineHeight: 1.65, margin: 0 }}>
          产品终态是住在你聊天软件里的消息代理：消息进来，它按你的认知模型判断——哪条根本不用回、哪条替你起草、
          哪条你会亲自接，并在你「嘴上要答应但实际做不到」时发出质检警告。你每次改写它的草稿，都会被记录为
          stated vs behavioral 修正信号，模型从真实行为持续更新。
        </p>
      </div>

      <div style={{ border: "1px solid var(--card-border)", padding: "24px 28px", display: "flex", flexDirection: "column", gap: 16, alignItems: "flex-start" }}>
        <p style={{ fontFamily: "var(--font-display)", fontSize: 17, fontStyle: "italic", lineHeight: 1.6, margin: 0, color: "var(--foreground)" }}>
          别人的 bot 学你怎么说话，它学你怎么做决定。
        </p>
        <p style={{ fontSize: 13, color: "var(--muted)", lineHeight: 1.65, margin: 0 }}>
          Demo 是一个模拟聊天 app：6 个预设会话（含多轮追问，离线可演示）+ 自定义会话（DeepSeek 在线分析）。
        </p>
        <a
          href="/agent"
          style={{
            fontFamily: "inherit", fontSize: 14, padding: "10px 24px",
            border: "1px solid var(--accent)", background: "var(--accent)", color: "#fff",
            textDecoration: "none",
          }}
        >
          打开分身 →
        </a>
      </div>
    </div>
  );
}
