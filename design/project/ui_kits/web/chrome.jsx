/* global React */
const { useState, useRef, useEffect } = React;

// ────────────────────────────────────────────────────────────
// Shared primitives — match the Nous codebase's component idiom
// ────────────────────────────────────────────────────────────

window.Card = function Card({ children, className = "", style = {} }) {
  return (
    <div
      className={className}
      style={{
        background: "var(--card)",
        border: "1px solid var(--card-border)",
        borderRadius: 12,
        padding: 20,
        ...style,
      }}
    >
      {children}
    </div>
  );
};

window.Pill = function Pill({ tone = "muted", children }) {
  const tones = {
    high:    { bg: "rgba(110,200,122,0.15)", fg: "#6ec87a" },
    medium:  { bg: "rgba(196,149,106,0.15)", fg: "#c4956a" },
    low:     { bg: "rgba(138,133,128,0.15)", fg: "#8a8580" },
    muted:   { bg: "rgba(138,133,128,0.15)", fg: "#8a8580" },
    accent:  { bg: "rgba(196,149,106,0.12)", fg: "#c4956a" },
    user:    { bg: "rgba(96,165,250,0.20)",  fg: "#93c5fd" },
    ai:      { bg: "rgba(74,222,128,0.20)",  fg: "#86efac" },
  };
  const t = tones[tone] || tones.muted;
  return (
    <span style={{
      fontSize: 11, fontWeight: 500,
      padding: "3px 9px", borderRadius: 9999,
      background: t.bg, color: t.fg,
    }}>
      {children}
    </span>
  );
};

window.Btn = function Btn({ variant = "primary", children, onClick, disabled, style = {} }) {
  const base = {
    fontSize: 13, fontWeight: 500, fontFamily: "inherit",
    padding: "10px 20px", borderRadius: 9999,
    border: 0, cursor: "pointer", transition: "all 200ms",
    opacity: disabled ? 0.4 : 1,
  };
  const variants = {
    primary:   { background: "var(--accent)", color: "#fff" },
    secondary: { background: "transparent", color: "var(--muted)",
                 border: "1px solid var(--card-border)", padding: "9px 19px" },
  };
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{ ...base, ...variants[variant], ...style }}
      onMouseOver={(e) => !disabled && (e.currentTarget.style.opacity = "0.9")}
      onMouseOut={(e) => !disabled && (e.currentTarget.style.opacity = "1")}
    >
      {children}
    </button>
  );
};

window.SendIcon = function SendIcon({ size = 14 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
         stroke="currentColor" strokeWidth="2"
         strokeLinecap="round" strokeLinejoin="round">
      <path d="M5 12h14M12 5l7 7-7 7" />
    </svg>
  );
};

window.NAvatar = function NAvatar({ size = 28 }) {
  return (
    <div style={{
      width: size, height: size, borderRadius: 9999,
      background: "rgba(196,149,106,0.12)", color: "#c4956a",
      display: "flex", alignItems: "center", justifyContent: "center",
      fontSize: size * 0.43, fontWeight: 500, flexShrink: 0,
    }}>N</div>
  );
};
