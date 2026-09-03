/* global React, Card, Pill, Btn, MOCK_MODEL, DIM_NAMES_ZH */
const { useState } = React;

// ─── Mock version history — auto-snapshotted after each turn ───
const VERSIONS = [
  { v: 7, ts: "2026-05-07 14:32", turn: 14, after: "你说\u201C事后理解\u201D对你算稳定模式吗",
    changed: ["Execution-Layer Flexibility"], delta: "+ 新增「自我合理化」迹象", confidence: 0.91 },
  { v: 6, ts: "2026-05-07 14:28", turn: 12, after: "Kahneman 哪一部分让你觉得以前理解都是表面的",
    changed: ["Reasoning Style", "Blind Spots"], delta: "Reasoning 置信度 medium → high", confidence: 0.88 },
  { v: 5, ts: "2026-05-07 14:24", turn: 10, after: "你做完之后才意识到为什么这么选",
    changed: ["Decision Architecture"], delta: "「直觉先到」从假设升为确认", confidence: 0.84 },
  { v: 4, ts: "2026-05-07 14:19", turn: 8, after: "在压力下你会怎么做",
    changed: ["Response to Uncertainty", "Emotional Processing"], delta: "+ 新增 Emotional 维度", confidence: 0.79 },
  { v: 3, ts: "2026-05-07 14:14", turn: 6, after: "举一个最近的决策例子",
    changed: ["Value Hierarchy"], delta: "「新颖性」首次出现在前三", confidence: 0.71 },
  { v: 2, ts: "2026-05-07 14:09", turn: 4, after: "最近有什么让你觉得有意思的事",
    changed: ["Attention Allocation"], delta: "「新颖刺激优先」初步识别", confidence: 0.62 },
  { v: 1, ts: "2026-05-07 14:05", turn: 2, after: "对话开始",
    changed: [], delta: "初始空白模型", confidence: 0.32 },
];

window.ValidatorView = function ValidatorView() {
  const [selected, setSelected] = useState(7);
  const [compareWith, setCompareWith] = useState(null);
  const cur = VERSIONS.find(x => x.v === selected);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 28 }}>
      {/* ── Editorial header ── */}
      <div style={{ borderBottom: "1px solid var(--card-border)", paddingBottom: 20 }}>
        <p style={{ fontSize: 11, letterSpacing: "0.2em", textTransform: "uppercase",
          color: "var(--muted)", margin: "0 0 8px" }}>模型验证 · 版本史</p>
        <h2 style={{
          fontFamily: "var(--font-serif, 'Fraunces', serif)",
          fontSize: 34, fontWeight: 400, margin: 0,
          letterSpacing: "-0.015em", lineHeight: 1.15,
        }}>
          每一轮对话之后，模型都会<em style={{ fontStyle: "italic", color: "var(--accent)" }}>留下一个版本</em>
        </h2>
        <p style={{
          fontFamily: "var(--font-serif, 'Fraunces', serif)",
          fontSize: 14, color: "var(--muted)", lineHeight: 1.7,
          margin: "10px 0 0", fontStyle: "italic", maxWidth: 640,
        }}>
          可以回到任意版本，看那时模型怎么理解你；也可以拿任意两版做对比，看哪一句对话改了哪个维度。
        </p>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "260px 1fr", gap: 36 }}>
        {/* ── Timeline rail ── */}
        <div style={{ position: "relative" }}>
          <div style={{
            position: "absolute", left: 11, top: 8, bottom: 8, width: 1,
            background: "var(--card-border)",
          }} />
          {VERSIONS.map((x) => {
            const sel = x.v === selected;
            const cmp = x.v === compareWith;
            return (
              <div key={x.v}
                onClick={() => {
                  if (sel) return;
                  if (compareWith === x.v) setCompareWith(null);
                  else setSelected(x.v);
                }}
                onContextMenu={(e) => { e.preventDefault();
                  setCompareWith(cmp ? null : x.v); }}
                style={{
                  position: "relative", padding: "10px 0 14px 32px",
                  cursor: "pointer",
                }}>
                <div style={{
                  position: "absolute", left: 6, top: 14,
                  width: 11, height: 11, borderRadius: 9999,
                  background: sel ? "var(--accent)" : (cmp ? "var(--card)" : "var(--background)"),
                  border: `1.5px solid ${sel || cmp ? "var(--accent)" : "var(--muted-soft)"}`,
                }} />
                <div style={{
                  fontFamily: "var(--font-serif, 'Fraunces', serif)",
                  fontSize: 15, fontStyle: sel ? "italic" : "normal",
                  color: sel ? "var(--accent)" : "var(--foreground)",
                  fontWeight: 500,
                }}>
                  v{x.v}{x.v === 7 && <span style={{
                    marginLeft: 8, fontSize: 10, fontStyle: "normal",
                    fontFamily: "var(--font-mono, monospace)",
                    letterSpacing: "0.1em", color: "var(--accent)",
                  }}>HEAD</span>}
                  {cmp && <span style={{
                    marginLeft: 8, fontSize: 10, fontStyle: "normal",
                    fontFamily: "var(--font-mono, monospace)",
                    letterSpacing: "0.1em", color: "var(--muted)",
                  }}>对比</span>}
                </div>
                <div style={{
                  fontSize: 11, color: "var(--muted-soft)",
                  fontFamily: "var(--font-mono, monospace)",
                  marginTop: 3, letterSpacing: "0.02em",
                }}>{x.ts} · 第{x.turn}轮</div>
                <div style={{
                  fontSize: 12, color: "var(--muted)", marginTop: 6,
                  fontStyle: "italic",
                  fontFamily: "var(--font-serif, 'Fraunces', serif)",
                }}>{x.delta}</div>
              </div>
            );
          })}
          <p style={{ fontSize: 11, color: "var(--muted-soft)",
            fontFamily: "var(--font-serif, 'Fraunces', serif)",
            fontStyle: "italic", marginTop: 16, paddingLeft: 32 }}>
            点击切换 · 右键设为对比版本
          </p>
        </div>

        {/* ── Detail pane ── */}
        <div>
          <div style={{ display: "flex", alignItems: "baseline", gap: 14,
            marginBottom: 10 }}>
            <h3 style={{
              fontFamily: "var(--font-serif, 'Fraunces', serif)",
              fontSize: 28, fontWeight: 400, margin: 0,
              letterSpacing: "-0.012em",
            }}>
              v{cur.v}
              {compareWith && compareWith !== cur.v && (
                <span style={{ color: "var(--muted)" }}> ⇄ v{compareWith}</span>
              )}
            </h3>
            <span style={{ fontSize: 12, color: "var(--muted)",
              fontFamily: "var(--font-mono, monospace)" }}>
              置信度 {(cur.confidence * 100).toFixed(0)}%
            </span>
          </div>

          <p style={{
            fontFamily: "var(--font-serif, 'Fraunces', serif)",
            fontSize: 15, fontStyle: "italic", color: "var(--muted)",
            margin: "0 0 24px", lineHeight: 1.65,
          }}>
            触发：第 {cur.turn} 轮 — “{cur.after}”
          </p>

          {/* What changed in this version */}
          <div style={{ marginBottom: 28 }}>
            <p style={{ fontSize: 11, letterSpacing: "0.18em", textTransform: "uppercase",
              color: "var(--muted)", margin: "0 0 12px" }}>本版改动</p>
            {cur.changed.length === 0 ? (
              <p style={{ fontStyle: "italic", color: "var(--muted-soft)",
                fontFamily: "var(--font-serif, 'Fraunces', serif)" }}>
                初始空白模型 — 还没有信号。
              </p>
            ) : cur.changed.map(name => (
              <div key={name} style={{
                borderLeft: "2px solid var(--accent)",
                paddingLeft: 16, paddingTop: 4, paddingBottom: 4,
                marginBottom: 12,
              }}>
                <div style={{
                  fontFamily: "var(--font-serif, 'Fraunces', serif)",
                  fontSize: 17, fontWeight: 500,
                }}>{DIM_NAMES_ZH[name] || name}</div>
                <div style={{ fontSize: 12, color: "var(--muted-soft)",
                  fontFamily: "var(--font-mono, monospace)", marginTop: 2 }}>
                  {name}
                </div>
              </div>
            ))}
          </div>

          {/* Snapshot of all 9 dimensions at this version */}
          <p style={{ fontSize: 11, letterSpacing: "0.18em", textTransform: "uppercase",
            color: "var(--muted)", margin: "0 0 14px" }}>这一版的完整模型</p>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            {MOCK_MODEL.dimensions.map(d => {
              const isChanged = cur.changed.includes(d.name);
              return (
                <div key={d.name} style={{
                  padding: 14,
                  background: isChanged ? "var(--accent-soft)" : "transparent",
                  border: `1px solid ${isChanged ? "var(--accent)" : "var(--card-border)"}`,
                  borderRadius: 4,
                }}>
                  <div style={{ display: "flex", justifyContent: "space-between",
                    alignItems: "baseline", marginBottom: 6 }}>
                    <span style={{
                      fontFamily: "var(--font-serif, 'Fraunces', serif)",
                      fontSize: 14, fontWeight: 500,
                    }}>{DIM_NAMES_ZH[d.name] || d.name}</span>
                    <span style={{ fontSize: 10, color: "var(--muted-soft)",
                      fontFamily: "var(--font-mono, monospace)",
                      letterSpacing: "0.08em", textTransform: "uppercase" }}>
                      {d.confidence}
                    </span>
                  </div>
                  <p style={{ fontSize: 12, color: "var(--muted)", lineHeight: 1.6,
                    margin: 0,
                    fontFamily: "var(--font-serif, 'Fraunces', serif)" }}>
                    {d.description.slice(0, 60)}…
                  </p>
                </div>
              );
            })}
          </div>

          {/* Actions */}
          <div style={{
            marginTop: 28, paddingTop: 18,
            borderTop: "1px solid var(--card-border)",
            display: "flex", gap: 12, alignItems: "center", justifyContent: "space-between",
          }}>
            <span style={{ fontSize: 12, color: "var(--muted-soft)",
              fontFamily: "var(--font-serif, 'Fraunces', serif)",
              fontStyle: "italic" }}>
              {compareWith ? `对比 v${cur.v} 与 v${compareWith}` : "查看任一历史版本"}
            </span>
            <div style={{ display: "flex", gap: 12 }}>
              <Btn variant="secondary" onClick={() => setCompareWith(null)}>
                取消对比
              </Btn>
              <Btn>恢复到这一版</Btn>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
