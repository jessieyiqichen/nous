/* global React, Card, Pill, Btn */
const { useState } = React;

const QUESTIONS = [
  {
    no: 1,
    track: "T1 · 行动预测",
    scene: "周五下午 4 点，你刚收到一个完全陌生领域的合作邀请，对方希望下周一前给答复。你手头的项目还没收尾。你最可能的第一反应是？",
    options: [
      { id: "A", label: "立即列出已有项目时间表，看能否挪出空间" },
      { id: "B", label: "先回复对方\u201C让我看看\u201D，给自己留时间想清楚" },
      { id: "C", label: "查这个领域 30 分钟，凭直觉决定是否要谈" },
      { id: "D", label: "拒绝——手头的事还没做完，不开新坑" },
    ],
    predicted: "C",
    rationale: "你的模型显示：陌生领域 + 时间压力下，会先用一段短调研建立直觉，再决定是否进入。",
  },
  {
    no: 2,
    track: "T2 · 价值排序",
    scene: "三个项目同时找你：一个完成度高但常规、一个完成度低但有趣、一个完成度中但能扩大影响。只能选一个。",
    options: [
      { id: "A", label: "完成度高的常规项目——稳，先跑出结果" },
      { id: "B", label: "完成度低但有趣的——值得探索" },
      { id: "C", label: "完成度中但能扩大影响的——平衡" },
      { id: "D", label: "都不选，再观察一周" },
    ],
    predicted: "B",
    rationale: "revealed 偏好里：新颖性 > 影响范围 > 完成度。\u201C有趣\u201D 通常会赢。",
  },
  {
    no: 3,
    track: "T3 · 情境反应",
    scene: "你和一个朋友在讨论某个观点，明显感到对方情绪上来了，但你认为自己是对的。你接下来最可能：",
    options: [
      { id: "A", label: "继续讲，把逻辑说清楚" },
      { id: "B", label: "停下来，问对方在意的是什么" },
      { id: "C", label: "撤回观察，等情绪过了再说" },
      { id: "D", label: "顺着对方的情绪先附和" },
    ],
    predicted: "C",
    rationale: "情绪强场景下你倾向撤回观察，而不是直接处理情绪。",
  },
];

window.PredictorView = function PredictorView() {
  const [idx, setIdx] = useState(0);
  const [answers, setAnswers] = useState({}); // { 0: "C", ... }
  const [revealed, setRevealed] = useState(false);

  const q = QUESTIONS[idx];
  const picked = answers[idx];
  const isLast = idx === QUESTIONS.length - 1;
  const done = idx >= QUESTIONS.length;

  const submit = () => setRevealed(true);
  const next = () => {
    setRevealed(false);
    setIdx(idx + 1);
  };
  const restart = () => {
    setIdx(0); setAnswers({}); setRevealed(false);
  };

  if (done) {
    const hits = QUESTIONS.filter((q, i) => answers[i] === q.predicted).length;
    return (
      <div style={{ maxWidth: 680, margin: "0 auto", textAlign: "center", paddingTop: 40 }}>
        <p style={{ fontSize: 11, letterSpacing: "0.2em", textTransform: "uppercase",
          color: "var(--muted)", margin: "0 0 12px" }}>预测完成</p>
        <h2 style={{
          fontFamily: "var(--font-serif, 'Fraunces', serif)",
          fontSize: 44, fontWeight: 400, margin: "0 0 8px",
          letterSpacing: "-0.02em",
        }}>
          {hits} <em style={{ fontStyle: "italic", color: "var(--accent)" }}>/ {QUESTIONS.length}</em>
        </h2>
        <p style={{ fontSize: 15, color: "var(--muted)", lineHeight: 1.7,
          fontFamily: "var(--font-serif, 'Fraunces', serif)",
          fontStyle: "italic", margin: "0 0 32px",
        }}>模型在这三题里命中了 {hits} 题</p>
        <Btn onClick={restart}>重新预测</Btn>
      </div>
    );
  }

  const hit = revealed && picked === q.predicted;

  return (
    <div style={{ maxWidth: 680, margin: "0 auto" }}>
      {/* Progress strip */}
      <div style={{ display: "flex", gap: 6, marginBottom: 32 }}>
        {QUESTIONS.map((_, i) => (
          <div key={i} style={{
            flex: 1, height: 2,
            background: i < idx ? "var(--accent)"
              : i === idx ? "var(--accent)" : "var(--card-border)",
            opacity: i === idx ? 1 : (i < idx ? 0.5 : 1),
            transition: "all 300ms",
          }} />
        ))}
      </div>

      {/* Eyebrow */}
      <div style={{ display: "flex", justifyContent: "space-between",
        alignItems: "baseline", marginBottom: 20 }}>
        <p style={{ fontSize: 11, letterSpacing: "0.2em", textTransform: "uppercase",
          color: "var(--muted)", margin: 0 }}>
          {q.track}
        </p>
        <p style={{ fontSize: 12, color: "var(--muted-soft)",
          fontFamily: "var(--font-serif, 'Fraunces', serif)",
          fontStyle: "italic", margin: 0 }}>
          第 {q.no} 题 / {QUESTIONS.length}
        </p>
      </div>

      {/* Question — large serif, plenty of breathing room */}
      <p style={{
        fontFamily: "var(--font-serif, 'Fraunces', serif)",
        fontSize: 22, lineHeight: 1.55, margin: "0 0 36px",
        letterSpacing: "-0.005em",
        color: "var(--foreground)",
      }}>{q.scene}</p>

      {/* Options */}
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {q.options.map(o => {
          const sel = picked === o.id;
          const isCorrect = revealed && o.id === q.predicted;
          const isWrong = revealed && sel && !isCorrect;
          let border = "1px solid var(--card-border)";
          let bg = "transparent";
          if (sel && !revealed) { border = "1px solid var(--accent)"; bg = "var(--accent-soft)"; }
          if (isCorrect) { border = "1px solid var(--accent)"; bg = "var(--accent-soft)"; }
          if (isWrong) { border = "1px solid var(--card-border)"; bg = "transparent"; }
          return (
            <button key={o.id}
              onClick={() => !revealed && setAnswers({ ...answers, [idx]: o.id })}
              disabled={revealed}
              style={{
                textAlign: "left", padding: "14px 18px",
                background: bg, border, borderRadius: 4,
                cursor: revealed ? "default" : "pointer",
                fontFamily: "inherit",
                color: "var(--foreground)",
                fontSize: 15, lineHeight: 1.65,
                display: "flex", gap: 14, alignItems: "flex-start",
                opacity: revealed && !sel && !isCorrect ? 0.4 : 1,
                transition: "all 200ms",
              }}>
              <span style={{
                fontFamily: "var(--font-serif, 'Fraunces', serif)",
                fontStyle: "italic",
                fontSize: 14,
                color: (sel || isCorrect) ? "var(--accent)" : "var(--muted)",
                width: 14, flexShrink: 0, paddingTop: 2,
              }}>{o.id}.</span>
              <span style={{
                fontFamily: "var(--font-serif, 'Fraunces', serif)",
              }}>{o.label}</span>
              {isCorrect && (
                <span style={{ marginLeft: "auto", fontSize: 11,
                  color: "var(--accent)", letterSpacing: "0.1em",
                  textTransform: "uppercase", paddingTop: 4,
                }}>模型预测</span>
              )}
            </button>
          );
        })}
      </div>

      {/* Reveal block */}
      {revealed && (
        <div style={{
          marginTop: 28, paddingLeft: 20,
          borderLeft: `2px solid ${hit ? "var(--accent)" : "var(--muted-soft)"}`,
        }}>
          <p style={{ fontSize: 11, letterSpacing: "0.2em", textTransform: "uppercase",
            color: hit ? "var(--accent)" : "var(--muted)", margin: "0 0 8px" }}>
            {hit ? "命中" : "偏差"}
          </p>
          <p style={{
            fontFamily: "var(--font-serif, 'Fraunces', serif)",
            fontSize: 15, lineHeight: 1.7, margin: 0,
            color: "var(--foreground)", fontStyle: "italic",
          }}>{q.rationale}</p>
        </div>
      )}

      {/* Action */}
      <div style={{ display: "flex", justifyContent: "space-between",
        alignItems: "center", marginTop: 36 }}>
        <span style={{ fontSize: 12, color: "var(--muted-soft)",
          fontStyle: "italic",
          fontFamily: "var(--font-serif, 'Fraunces', serif)",
        }}>
          {!picked && "选一个再继续"}
          {picked && !revealed && "选好了？提交看看模型预测"}
          {revealed && (isLast ? "看看总结 →" : "下一题 →")}
        </span>
        {!revealed
          ? <Btn onClick={submit} disabled={!picked}>提交</Btn>
          : <Btn onClick={next}>{isLast ? "查看结果" : "下一题"}</Btn>}
      </div>
    </div>
  );
};
