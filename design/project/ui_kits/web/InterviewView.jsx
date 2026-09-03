/* global React, Card, Pill, Btn, NAvatar, SendIcon, MOCK_CONVO, MOCK_MODEL, DIM_NAMES_ZH */
const { useState, useEffect, useRef } = React;

window.InterviewView = function InterviewView() {
  const [phase, setPhase] = useState("empty");
  const [messages, setMessages] = useState([]);
  const [turn, setTurn] = useState(0);
  const [input, setInput] = useState("");
  const endRef = useRef(null);

  useEffect(() => {
    if (endRef.current) endRef.current.scrollTop = endRef.current.scrollHeight;
  }, [messages]);

  const start = () => { setMessages([MOCK_CONVO[0]]); setPhase("chat"); setTurn(0); };
  const send = () => {
    const text = input.trim(); if (!text) return;
    const next = [...messages, { role: "user", content: text }];
    const newTurn = turn + 1;
    setInput(""); setMessages(next); setTurn(newTurn);
    const reply = MOCK_CONVO[newTurn];
    if (reply) setTimeout(() => setMessages([...next, reply]), 700);
    else { setTimeout(() => setPhase("building"), 700); setTimeout(() => setPhase("result"), 2200); }
  };
  const reset = () => { setPhase("empty"); setMessages([]); setTurn(0); setInput(""); };

  if (phase === "empty") {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "60vh" }}>
        <div style={{ textAlign: "center", maxWidth: 380 }}>
          <div style={{ width: 48, height: 48, margin: "0 auto 20px", borderRadius: 16,
            background: "rgba(196,149,106,0.12)", color: "var(--accent)",
            display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20 }}>N</div>
          <h2 style={{ fontSize: 20, fontWeight: 600, margin: "0 0 8px" }}>认知访谈</h2>
          <p style={{ fontSize: 14, color: "var(--muted)", lineHeight: 1.65, margin: "0 0 22px" }}>
            随便聊聊。聊到第几句，<br/>我就开始懂你怎么想了。
          </p>
          <Btn onClick={start}>开始对话</Btn>
        </div>
      </div>
    );
  }

  if (phase === "building") {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "60vh" }}>
        <div style={{ textAlign: "center" }}>
          <div style={{ width: 40, height: 40, margin: "0 auto 16px",
            border: "2px solid var(--accent)", borderTopColor: "transparent",
            borderRadius: 9999, animation: "spin 0.9s linear infinite" }} />
          <p style={{ fontSize: 14, fontWeight: 500, margin: "0 0 4px" }}>正在构建认知模型</p>
          <p style={{ fontSize: 12, color: "var(--muted)" }}>
            分析 {messages.length} 条对话记录，提取 9 个维度的认知特征
          </p>
        </div>
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  if (phase === "result") {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 28 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
          <div>
            <h2 style={{ fontSize: 18, fontWeight: 600, margin: "0 0 4px" }}>认知模型</h2>
            <p style={{ fontSize: 13, color: "var(--muted)", margin: 0 }}>
              {turn} 轮对话 · 12 个信号 · 2 个矛盾
            </p>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <Btn>开始验证</Btn>
            <Btn variant="secondary" onClick={reset}>重来</Btn>
          </div>
        </div>
        <Card><p style={{ fontSize: 14, lineHeight: 1.75, margin: 0 }}>{MOCK_MODEL.summary}</p></Card>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
          {MOCK_MODEL.dimensions.map((d) => (
            <Card key={d.name}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                <h3 style={{ fontSize: 14, fontWeight: 500, margin: 0 }}>
                  {DIM_NAMES_ZH[d.name] || d.name}
                </h3>
                <Pill tone={d.confidence}>{d.confidence}</Pill>
              </div>
              <p style={{ fontSize: 13, color: "var(--muted)", lineHeight: 1.65, margin: "0 0 12px" }}>
                {d.description}
              </p>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {d.preds.map((p, i) => (
                  <p key={i} style={{ fontSize: 12, color: "var(--muted-soft)",
                    paddingLeft: 12, borderLeft: "2px solid var(--card-border)",
                    margin: 0, lineHeight: 1.55 }}>{p}</p>
                ))}
              </div>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  // Chat phase
  return (
    <div style={{ display: "flex", gap: 20, height: "calc(100vh - 160px)" }}>
      <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0 }}>
        <div ref={endRef} style={{ flex: 1, overflowY: "auto", paddingBottom: 16,
          display: "flex", flexDirection: "column", gap: 20 }}>
          {messages.map((m, i) => (
            m.role === "assistant" ? (
              <div key={i} style={{ display: "flex", gap: 12, maxWidth: "85%" }}>
                <NAvatar />
                <div style={{ fontSize: 14, lineHeight: 1.65, paddingTop: 4 }}>{m.content}</div>
              </div>
            ) : (
              <div key={i} style={{ display: "flex", justifyContent: "flex-end" }}>
                <div style={{ maxWidth: "75%", padding: "10px 14px",
                  background: "var(--accent)", color: "#fff",
                  borderRadius: 16, borderBottomRightRadius: 4,
                  fontSize: 14, lineHeight: 1.65 }}>{m.content}</div>
              </div>
            )
          ))}
        </div>
        <div style={{ display: "flex", justifyContent: "space-between",
          fontSize: 12, color: "var(--muted)", padding: "8px 0" }}>
          <span>第 {turn} 轮</span>
          <button onClick={() => { setPhase("building"); setTimeout(() => setPhase("result"), 1500); }}
            style={{ background: "transparent", border: 0, color: "var(--muted)",
              fontSize: 12, fontFamily: "inherit", cursor: "pointer" }}>结束 → 建模</button>
        </div>
        <div style={{ position: "relative" }}>
          <input value={input} onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && send()}
            placeholder="说点什么..."
            style={{ width: "100%", background: "var(--card)",
              border: "1px solid var(--card-border)", borderRadius: 16,
              padding: "12px 52px 12px 16px", fontSize: 14,
              color: "var(--foreground)", fontFamily: "inherit", outline: "none" }} />
          <button onClick={send} style={{
            position: "absolute", right: 8, top: "50%", transform: "translateY(-50%)",
            width: 32, height: 32, background: "var(--accent)", color: "#fff",
            border: 0, borderRadius: 12, display: "flex",
            alignItems: "center", justifyContent: "center", cursor: "pointer" }}>
            <SendIcon />
          </button>
        </div>
      </div>
      <div style={{ width: 208, flexShrink: 0 }}>
        <Card style={{ padding: 16 }}>
          <h3 style={{ fontSize: 12, fontWeight: 500, color: "var(--muted)", margin: "0 0 12px" }}>
            维度覆盖
          </h3>
          {turn < 3 ? (
            <p style={{ fontSize: 11, color: "var(--muted-soft)", margin: 0 }}>
              第 3 轮后开始追踪
            </p>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {MOCK_MODEL.dimensions.slice(0, 5).map((d, i) => {
                const conf = i < turn - 2 ? d.confidence : "low";
                return <CovRow key={d.name} name={DIM_NAMES_ZH[d.name]} confidence={conf} />;
              })}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
};

function CovRow({ name, confidence }) {
  const colors = { high: "#6ec87a", medium: "#c4956a", low: "#8a8580" };
  const widths = { high: "100%", medium: "66%", low: "33%" };
  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, marginBottom: 4 }}>
        <span style={{ color: "var(--muted)" }}>{name}</span>
        <span style={{ color: colors[confidence] }}>{confidence}</span>
      </div>
      <div style={{ height: 4, background: "var(--background)", borderRadius: 9999 }}>
        <div style={{ height: "100%", borderRadius: 9999,
          background: colors[confidence], width: widths[confidence], transition: "all 500ms" }} />
      </div>
    </div>
  );
}
