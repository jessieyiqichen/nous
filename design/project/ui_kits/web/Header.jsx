/* global React */

window.Header = function Header({ tab, setTab }) {
  const TABS = [
    { key: "interview", label: "认知访谈" },
    { key: "validate",  label: "模型验证" },
    { key: "analyze",   label: "偏差检测" },
    { key: "predict",   label: "认知预测" },
    { key: "research",  label: "研究数据" },
  ];
  return (
    <header style={{ borderBottom: "1px solid var(--card-border)" }}>
      <div style={{
        maxWidth: 896, margin: "0 auto", padding: "14px 24px",
        display: "flex", alignItems: "center", justifyContent: "space-between",
      }}>
        <h1 style={{ fontSize: 18, fontWeight: 600, letterSpacing: "-0.011em",
          color: "var(--foreground)", margin: 0 }}>Nous</h1>
        <nav style={{ display: "flex", gap: 2, padding: 4,
          background: "var(--card)", borderRadius: 8 }}>
          {TABS.map((t) => {
            const active = tab === t.key;
            return (
              <button key={t.key} onClick={() => setTab(t.key)}
                style={{
                  padding: "6px 14px", fontSize: 13, fontFamily: "inherit",
                  borderRadius: 6, border: 0, cursor: "pointer", transition: "all 200ms",
                  background: active ? "rgba(196,149,106,0.12)" : "transparent",
                  color: active ? "var(--accent)" : "var(--muted)",
                  fontWeight: active ? 500 : 400,
                }}>
                {t.label}
              </button>
            );
          })}
        </nav>
      </div>
    </header>
  );
};
