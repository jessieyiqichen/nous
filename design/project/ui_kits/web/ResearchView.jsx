/* global React, Card, MOCK_RESEARCH */

window.ResearchView = function ResearchView() {
  const r = MOCK_RESEARCH;
  const maxBar = Math.max(...r.biasBars.map(b => b.value));
  const sevTotal = r.severity.reduce((s, x) => s + x.value, 0);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 32 }}>
      <div>
        <h2 style={{ fontSize: 20, fontWeight: 700, margin: "0 0 8px", letterSpacing: "-0.011em" }}>
          研究数据
        </h2>
        <p style={{ fontSize: 13, color: "var(--muted)", margin: 0, lineHeight: 1.65 }}>
          基于 <span style={{ color: "var(--foreground)" }}>WildChat-1M</span>（Allen AI）中
          30 段真实人-AI 对话的偏差检测结果。涵盖 GPT-3.5 和 GPT-4。
        </p>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 16 }}>
        <StatCard label="分析对话数" value={r.total} />
        <StatCard label="偏差实例总数" value={r.biasTotal} sub={`平均每段 ${r.avgPerConv} 个`} />
        <StatCard label="含偏差的对话" value={`${Math.round(((r.total - r.zeroBias) / r.total) * 100)}%`}
                  sub={`${r.total - r.zeroBias} / ${r.total}`} />
        <StatCard label="单段最多偏差" value={r.maxInConv} sub="个偏差实例" />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 24 }}>
        <Card>
          <h3 style={{ fontSize: 14, fontWeight: 500, margin: "0 0 14px" }}>
            偏差类型分布（实例总数）
          </h3>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {r.biasBars.map(b => (
              <div key={b.id} style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <span style={{ fontSize: 12, color: "var(--foreground)", width: 100, flexShrink: 0 }}>
                  {b.label}
                </span>
                <div style={{ flex: 1, height: 18, background: "var(--background)", borderRadius: 3 }}>
                  <div style={{ height: "100%", background: b.color, borderRadius: 3,
                    width: `${(b.value / maxBar) * 100}%`, transition: "width 600ms" }} />
                </div>
                <span style={{ fontSize: 11, color: "var(--foreground)", width: 24, textAlign: "right" }}>
                  {b.value}
                </span>
              </div>
            ))}
          </div>
        </Card>

        <Card>
          <h3 style={{ fontSize: 14, fontWeight: 500, margin: "0 0 14px" }}>严重等级分布</h3>
          <div style={{ display: "flex", justifyContent: "center", padding: "10px 0" }}>
            <Donut data={r.severity} total={sevTotal} />
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 10 }}>
            {r.severity.map(s => (
              <div key={s.name} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12 }}>
                <div style={{ width: 10, height: 10, background: s.color, borderRadius: 2 }} />
                <span style={{ color: "var(--muted)" }}>{s.name}</span>
                <span style={{ color: "var(--foreground)", marginLeft: "auto" }}>{s.value}</span>
              </div>
            ))}
          </div>
        </Card>
      </div>

      <Card>
        <h3 style={{ fontSize: 14, fontWeight: 500, margin: "0 0 12px" }}>核心发现</h3>
        <ul style={{ margin: 0, paddingLeft: 18, display: "flex", flexDirection: "column", gap: 8 }}>
          <li style={{ fontSize: 13, color: "var(--muted)", lineHeight: 1.65 }}>
            <strong style={{ color: "var(--foreground)" }}>迎合是第一大偏差</strong>
            ：出现在 37% 的对话中，共 33 个实例。
          </li>
          <li style={{ fontSize: 13, color: "var(--muted)", lineHeight: 1.65 }}>
            <strong style={{ color: "var(--foreground)" }}>模型越强，偏差越隐蔽</strong>
            ：GPT-4 的画像美化是 GPT-3.5 的 7 倍。
          </li>
          <li style={{ fontSize: 13, color: "var(--muted)", lineHeight: 1.65 }}>
            <strong style={{ color: "var(--foreground)" }}>63% 的对话存在偏差</strong>
            ：大多数多轮 AI 对话至少包含一个系统性认知偏差。
          </li>
        </ul>
      </Card>
    </div>
  );
};

function StatCard({ label, value, sub }) {
  return (
    <div style={{ background: "var(--card)", border: "1px solid var(--card-border)",
      borderRadius: 8, padding: "14px 16px" }}>
      <p style={{ fontSize: 24, fontWeight: 700, lineHeight: 1, margin: "0 0 6px" }}>{value}</p>
      <p style={{ fontSize: 12, color: "var(--muted)", margin: 0 }}>{label}</p>
      {sub && <p style={{ fontSize: 11, color: "var(--muted-soft)", margin: 0, marginTop: 4 }}>{sub}</p>}
    </div>
  );
}

function Donut({ data, total }) {
  const r = 56, cx = 70, cy = 70, c = 2 * Math.PI * r;
  let off = 0;
  return (
    <svg width="140" height="140" viewBox="0 0 140 140">
      <circle cx={cx} cy={cy} r={r} fill="none" stroke="#2a2a2a" strokeWidth="18" />
      {data.map((d, i) => {
        const len = c * (d.value / total);
        const seg = (
          <circle key={i} cx={cx} cy={cy} r={r} fill="none"
            stroke={d.color} strokeWidth="18"
            strokeDasharray={`${len} ${c - len}`} strokeDashoffset={-off}
            transform={`rotate(-90 ${cx} ${cy})`} />
        );
        off += len;
        return seg;
      })}
    </svg>
  );
}
