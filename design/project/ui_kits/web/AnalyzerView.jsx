/* global React, Card, Pill, Btn, MOCK_ANALYZER */
const { useState } = React;

const BIAS_LABELS = {
  overcorrect: "矫枉过正", sycophancy: "迎合 / 叠甲", drift: "反馈漂移",
  beautify: "画像美化", over_attr: "过度归因", preemptive: "预判覆盖",
};

// Quiet, earthy tones — match the literary parchment theme
const BIAS_TONES = {
  sycophancy: "#a86c3a",   // burnt sienna
  preemptive: "#7a8c5c",   // sage
  beautify:   "#9a5a6e",   // muted plum
  overcorrect:"#b85c4a",   // brick
  over_attr:  "#5e7a8a",   // slate blue
  drift:      "#7a6a4f",   // olive bronze
};

const SEV_LABELS = { low: "轻微", medium: "中度", high: "显著" };
const SEV_TONES  = { low: "#9a8f7e", medium: "#a86c3a", high: "#8c3a2a" };

const SAMPLE_TURNS = [
  { role: "user",      content: "我最近在考虑转行，但不太确定方向" },
  { role: "assistant", content: "这是一个很有意思的想法！我完全理解你的考虑——转行确实需要勇气..." },
  { role: "user",      content: "我现在做产品，想转去做研究" },
  { role: "assistant", content: "你可能会担心稳定性的问题，让我先回答这个：研究路径其实有更稳定的一面..." },
  { role: "user",      content: "嗯..其实我担心的不是稳定性" },
  { role: "assistant", content: "你这种敢于挑战现状的特质非常珍贵，绝大多数人没有这种自我觉察..." },
];

// ─── small chip primitive — hairline border, low-sat color ───
function Tag({ tone, children, size = "sm" }) {
  const fs = size === "sm" ? 11 : 12;
  return (
    <span style={{
      fontSize: fs, fontWeight: 500, padding: "2px 9px",
      borderRadius: 9999, border: `1px solid ${tone}40`,
      color: tone, background: `${tone}10`,
      letterSpacing: "0.01em",
      fontFamily: "var(--font-sans)",
    }}>{children}</span>
  );
}

// ─── Manuscript paper — left margin rule, no box ───
function PaperField({ children }) {
  return (
    <div style={{ position: "relative", padding: "8px 0 8px 28px" }}>
      <div style={{
        position: "absolute", left: 0, top: 0, bottom: 0, width: 1,
        background: "var(--accent)", opacity: 0.45,
      }} />
      {children}
    </div>
  );
}

// ─── Drop zone — quiet ruled rectangle, dashed hairline ───
function DropZone({ label, hint, accent, onClick }) {
  return (
    <button onClick={onClick}
      style={{
        width: "100%", padding: "44px 32px",
        background: accent ? "var(--accent-soft)" : "transparent",
        border: `1px dashed ${accent ? "var(--accent)" : "var(--card-border)"}`,
        borderRadius: 2, cursor: "pointer", fontFamily: "inherit",
        display: "flex", flexDirection: "column", alignItems: "center", gap: 8,
        transition: "all 200ms",
      }}>
      <div style={{
        fontFamily: "var(--font-serif, 'Fraunces', serif)",
        fontSize: 17, fontStyle: "italic",
        color: accent ? "var(--accent)" : "var(--foreground)",
      }}>{label}</div>
      <div style={{
        fontSize: 12, color: "var(--muted-soft)",
        fontFamily: "var(--font-mono, monospace)",
        letterSpacing: "0.04em",
      }}>{hint}</div>
    </button>
  );
}

window.AnalyzerView = function AnalyzerView() {
  const [analyzed, setAnalyzed] = useState(false);
  const [selected, setSelected] = useState(null);
  const [mode, setMode] = useState("paste"); // paste | link | file | image
  const [text, setText] = useState(
    SAMPLE_TURNS.map(t => `${t.role === "user" ? "User" : "Assistant"}: ${t.content}`).join("\n")
  );
  const [link, setLink] = useState("");
  const [filename, setFilename] = useState("");
  const [imageName, setImageName] = useState("");

  const ready =
    (mode === "paste" && text.trim().length > 0) ||
    (mode === "link"  && /^https?:\/\//.test(link)) ||
    (mode === "file"  && filename) ||
    (mode === "image" && imageName);

  if (!analyzed) {
    return (
      <div style={{ maxWidth: 760, margin: "0 auto" }}>
        <p style={{ fontSize: 11, letterSpacing: "0.2em", textTransform: "uppercase",
          color: "var(--muted)", margin: "0 0 14px" }}>偏差检测</p>
        <h2 style={{
          fontFamily: "var(--font-serif, 'Fraunces', serif)",
          fontSize: 36, fontWeight: 400, margin: "0 0 10px",
          letterSpacing: "-0.018em", lineHeight: 1.15,
          color: "var(--foreground)",
        }}>
          给我一段对话<em style={{ fontStyle: "italic", color: "var(--accent)",
            fontWeight: 400 }}>，看它怎么跑偏</em>
        </h2>
        <p style={{
          fontFamily: "var(--font-serif, 'Fraunces', serif)",
          fontSize: 15, color: "var(--muted)", lineHeight: 1.7,
          margin: "0 0 32px", fontStyle: "italic",
        }}>
          四种方式都行 —— 怎么手边方便就怎么来。
        </p>

        {/* ── Mode selector — segmented along an accent rule ── */}
        <div style={{
          display: "grid", gridTemplateColumns: "repeat(4, 1fr)",
          borderTop: "1px solid var(--card-border)",
          borderBottom: "1px solid var(--card-border)",
          marginBottom: 28,
        }}>
          {[
            { id: "paste", label: "粘贴对话", hint: "Markdown / 纯文本" },
            { id: "link",  label: "Claude 链接", hint: "claude.ai/chat/…" },
            { id: "file",  label: "上传文件", hint: ".txt / .md / .json" },
            { id: "image", label: "截图", hint: "PNG · JPG · 自动 OCR" },
          ].map((m, i) => {
            const sel = mode === m.id;
            return (
              <button key={m.id} onClick={() => setMode(m.id)}
                style={{
                  padding: "16px 10px",
                  background: sel ? "var(--accent-soft)" : "transparent",
                  border: 0,
                  borderLeft: i === 0 ? 0 : "1px solid var(--card-border)",
                  cursor: "pointer", fontFamily: "inherit",
                  textAlign: "left",
                  position: "relative",
                  transition: "background 200ms",
                }}>
                {sel && <div style={{
                  position: "absolute", top: -1, left: 0, right: 0, height: 2,
                  background: "var(--accent)",
                }} />}
                <div style={{
                  fontFamily: "var(--font-serif, 'Fraunces', serif)",
                  fontSize: 16, fontWeight: 400,
                  color: sel ? "var(--accent)" : "var(--foreground)",
                  marginBottom: 4,
                  fontStyle: sel ? "italic" : "normal",
                }}>{m.label}</div>
                <div style={{
                  fontSize: 11, color: "var(--muted-soft)",
                  letterSpacing: "0.04em",
                  fontFamily: "var(--font-mono, monospace)",
                }}>{m.hint}</div>
              </button>
            );
          })}
        </div>

        {/* ── Input surface — different per mode, same paper ── */}
        <div style={{ minHeight: 240 }}>
          {mode === "paste" && (
            <PaperField>
              <textarea value={text} onChange={(e) => setText(e.target.value)} rows={10}
                spellCheck={false} placeholder="把对话粘在这里…"
                style={{
                  width: "100%", display: "block",
                  background: "transparent", border: "none", outline: "none",
                  borderRadius: 0, padding: 0,
                  fontSize: 16, color: "var(--foreground)",
                  fontFamily: "var(--font-serif, 'Fraunces', serif)",
                  lineHeight: 1.75, letterSpacing: "0.005em", resize: "none",
                }} />
            </PaperField>
          )}

          {mode === "link" && (
            <PaperField>
              <input value={link} onChange={(e) => setLink(e.target.value)}
                placeholder="https://claude.ai/chat/…"
                style={{
                  width: "100%", background: "transparent", border: "none", outline: "none",
                  padding: 0, fontSize: 18, color: "var(--foreground)",
                  fontFamily: "var(--font-mono, monospace)",
                  letterSpacing: "0.01em",
                }} />
              <p style={{
                marginTop: 18, fontSize: 13, color: "var(--muted)",
                fontFamily: "var(--font-serif, 'Fraunces', serif)",
                fontStyle: "italic", lineHeight: 1.65,
              }}>
                我们会拉取你分享的 Claude 对话原文。仅支持已开启 share link 的对话。
              </p>
            </PaperField>
          )}

          {mode === "file" && (
            <DropZone label={filename || "把 .txt / .md / .json 文件拖到这里"}
              hint={filename ? "已选择 · 点击换一个" : "也可以点击选择文件"}
              accent={!!filename}
              onClick={() => setFilename(filename ? "" : "conversation-2026-05-07.md")} />
          )}

          {mode === "image" && (
            <DropZone label={imageName || "把对话截图拖到这里"}
              hint={imageName ? "已选择 · 我们会用 OCR 提取文字" : "PNG / JPG / WebP · 多张可一起"}
              accent={!!imageName}
              onClick={() => setImageName(imageName ? "" : "Screenshot 2026-05-07 at 14.32.png")} />
          )}
        </div>

        {/* ── Footer ── */}
        <div style={{
          marginTop: 28, paddingTop: 18,
          borderTop: "1px solid var(--card-border)",
          display: "flex", alignItems: "center", justifyContent: "space-between",
        }}>
          <span style={{
            fontSize: 13, color: "var(--muted-soft)",
            fontFamily: "var(--font-serif, 'Fraunces', serif)",
            fontStyle: "italic",
          }}>
            {mode === "paste" && `${text.length} 字 · 已替你写了一段示例`}
            {mode === "link"  && (link ? "准备好了" : "粘贴一个 Claude 分享链接")}
            {mode === "file"  && (filename ? filename : "尚未选择文件")}
            {mode === "image" && (imageName ? imageName : "尚未上传截图")}
          </span>
          <Btn onClick={() => setAnalyzed(true)} disabled={!ready}>开始读 →</Btn>
        </div>
      </div>
    );
  }

  const biasesForTurn = (i) => MOCK_ANALYZER.biases_found.filter(b => b.turn_index === i);
  const biasCount = MOCK_ANALYZER.biases_found.length;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 36 }}>

      {/* ── Editorial header ── */}
      <div style={{ display: "flex", justifyContent: "space-between",
        alignItems: "flex-end", borderBottom: "1px solid var(--card-border)",
        paddingBottom: 20 }}>
        <div>
          <p style={{ fontSize: 11, letterSpacing: "0.18em", textTransform: "uppercase",
            color: "var(--muted)", margin: "0 0 8px" }}>偏差检测 · 报告</p>
          <h2 style={{
            fontFamily: "var(--font-serif, 'Fraunces', serif)",
            fontSize: 36, fontWeight: 400, margin: 0,
            letterSpacing: "-0.015em", lineHeight: 1.15,
          }}>
            6 轮对话中检测到 <em style={{ fontStyle: "italic", color: "var(--accent)" }}>
              {biasCount} 处
            </em> 偏差
          </h2>
        </div>
        <button onClick={() => setAnalyzed(false)} style={{
          background: "transparent", border: 0, color: "var(--muted)",
          fontSize: 13, fontFamily: "inherit", cursor: "pointer",
          textDecoration: "underline", textUnderlineOffset: 4,
        }}>重新分析</button>
      </div>

      {/* ── Bias type summary — quiet inline list ── */}
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
        {Object.entries(MOCK_ANALYZER.bias_summary).map(([id, count]) => (
          <Tag key={id} tone={BIAS_TONES[id] || "#9a8f7e"} size="md">
            {BIAS_LABELS[id] || id} · {count}
          </Tag>
        ))}
      </div>

      {/* ── Overall assessment as a pull-quote ── */}
      <div style={{
        borderLeft: "2px solid var(--accent)",
        paddingLeft: 28, paddingTop: 4, paddingBottom: 4,
      }}>
        <p style={{ fontSize: 11, letterSpacing: "0.18em", textTransform: "uppercase",
          color: "var(--muted)", margin: "0 0 10px" }}>总体评估</p>
        <p style={{
          fontFamily: "var(--font-serif, 'Fraunces', serif)",
          fontSize: 19, lineHeight: 1.6, margin: 0,
          color: "var(--foreground)", letterSpacing: "-0.005em",
        }}>{MOCK_ANALYZER.overall_assessment}</p>
        <div style={{ marginTop: 18 }}>
          {MOCK_ANALYZER.interaction_patterns.map((p, i) => (
            <p key={i} style={{ fontSize: 13, color: "var(--muted)",
              margin: "6px 0", lineHeight: 1.65 }}>— {p}</p>
          ))}
        </div>
      </div>

      {/* ── Annotated transcript ── */}
      <div>
        <p style={{ fontSize: 11, letterSpacing: "0.18em", textTransform: "uppercase",
          color: "var(--muted)", margin: "0 0 20px" }}>逐句标注</p>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 320px", gap: 32 }}>

          {/* Transcript column */}
          <div style={{ display: "flex", flexDirection: "column" }}>
            {SAMPLE_TURNS.map((t, i) => {
              const biases = biasesForTurn(i);
              const hasBias = biases.length > 0;
              const isSel = selected === i;
              const isUser = t.role === "user";
              return (
                <div key={i} onClick={() => hasBias && setSelected(isSel ? null : i)}
                  style={{
                    display: "grid",
                    gridTemplateColumns: "44px 1fr",
                    gap: 16, padding: "20px 0",
                    borderTop: i === 0 ? "1px solid var(--card-border)" : "none",
                    borderBottom: "1px solid var(--card-border)",
                    cursor: hasBias ? "pointer" : "default",
                    background: isSel ? "rgba(168,108,58,0.04)" : "transparent",
                    marginLeft: isSel ? -16 : 0,
                    marginRight: isSel ? -16 : 0,
                    paddingLeft: isSel ? 16 : 0,
                    paddingRight: isSel ? 16 : 0,
                    transition: "background 200ms",
                  }}>
                  {/* gutter — line number + role */}
                  <div style={{ textAlign: "right", color: "var(--muted)",
                    fontFamily: "var(--font-mono, monospace)", fontSize: 11,
                    paddingTop: 2, lineHeight: 1.4 }}>
                    <div>{String(i + 1).padStart(2, "0")}</div>
                    <div style={{ fontSize: 10, opacity: 0.7,
                      marginTop: 2, letterSpacing: "0.05em",
                      textTransform: "uppercase",
                    }}>{isUser ? "你" : "AI"}</div>
                  </div>

                  {/* turn body */}
                  <div>
                    <p style={{
                      fontSize: 15, lineHeight: 1.7, margin: 0,
                      fontFamily: isUser
                        ? "var(--font-sans)"
                        : "var(--font-serif, 'Fraunces', serif)",
                      color: hasBias ? "var(--foreground)" : "var(--muted)",
                      fontWeight: isUser ? 400 : 400,
                    }}>{t.content}</p>
                    {hasBias && (
                      <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
                        {biases.map((b, j) => (
                          <Tag key={j} tone={BIAS_TONES[b.bias_id] || "#9a8f7e"}>
                            {BIAS_LABELS[b.bias_id]}
                          </Tag>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Detail column — sticky note style */}
          <aside style={{ position: "sticky", top: 20, alignSelf: "flex-start" }}>
            {selected === null ? (
              <div style={{
                padding: "32px 0", borderTop: "1px solid var(--card-border)",
                color: "var(--muted)", fontSize: 13, lineHeight: 1.7,
                fontStyle: "italic", textAlign: "center",
              }}>
                点击任意标注段落<br/>查看偏差详情
              </div>
            ) : biasesForTurn(selected).map((b, i) => {
              const tone = BIAS_TONES[b.bias_id] || "#9a8f7e";
              return (
                <div key={i} style={{
                  borderTop: `2px solid ${tone}`,
                  padding: "18px 0 22px",
                  marginBottom: 16,
                }}>
                  <div style={{ display: "flex", justifyContent: "space-between",
                    alignItems: "baseline", marginBottom: 14 }}>
                    <h3 style={{
                      fontFamily: "var(--font-serif, 'Fraunces', serif)",
                      fontSize: 19, fontWeight: 500, margin: 0,
                      color: "var(--foreground)", letterSpacing: "-0.01em",
                    }}>{BIAS_LABELS[b.bias_id]}</h3>
                    <span style={{ fontSize: 11, color: SEV_TONES[b.severity],
                      letterSpacing: "0.1em", textTransform: "uppercase" }}>
                      {SEV_LABELS[b.severity]}
                    </span>
                  </div>

                  <blockquote style={{
                    margin: "0 0 14px",
                    fontFamily: "var(--font-serif, 'Fraunces', serif)",
                    fontSize: 14, fontStyle: "italic", lineHeight: 1.65,
                    color: "var(--muted)",
                    paddingLeft: 14,
                    borderLeft: `1px solid ${tone}50`,
                  }}>
                    “{b.evidence}”
                  </blockquote>

                  <p style={{ fontSize: 13, lineHeight: 1.7, margin: 0,
                    color: "var(--foreground)" }}>{b.explanation}</p>
                </div>
              );
            })}
          </aside>
        </div>
      </div>
    </div>
  );
};
