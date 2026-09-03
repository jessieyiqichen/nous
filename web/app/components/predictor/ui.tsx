"use client";

import type { ScoreReport, SituationContext } from "./types";
import { TIER_LABELS } from "./types";

/* ── Sub-components ── */

export function Section({ tier, title, desc }: { tier: number; title: string; desc: string; color: string }) {
  return (
    <div style={{ paddingTop: 16, borderTop: "1px solid var(--card-border)" }}>
      <p className="eyebrow" style={{ marginBottom: 4 }}>
        第{tier}层 · {title}
      </p>
      <p style={{ fontFamily: "var(--font-display)", fontSize: 13, fontStyle: "italic", color: "var(--muted-soft)", margin: 0 }}>
        {desc}
      </p>
    </div>
  );
}

const CTX_LABELS: Record<string, Record<string, string>> = {
  time_pressure: { none: "无时间压力", low: "轻度时间压力", high: "高时间压力" },
  social_pressure: { none: "无社交压力", low: "轻度社交压力", high: "高社交压力" },
  caring_level: { low: "低关心度", medium: "中关心度", high: "高关心度" },
  energy_state: { rested: "精力充沛", normal: "正常状态", depleted: "疲惫" },
};
export function ContextTags({ context }: { context?: SituationContext }) {
  if (!context) return null;
  const tags = Object.entries(context).filter(([, v]) => v && v !== "none" && v !== "normal");
  if (tags.length === 0) return null;
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 8 }}>
      {tags.map(([key, val]) => (
        <span key={key} style={{ fontSize: 10, padding: "2px 8px", borderRadius: 9999, border: "1px solid var(--card-border)", color: "var(--muted-soft)" }}>
          {CTX_LABELS[key]?.[val] || val}
        </span>
      ))}
    </div>
  );
}

export function QCard({ num, children }: { num: number; children: React.ReactNode }) {
  return (
    <div style={{ borderBottom: "1px solid var(--card-border)", padding: "20px 0" }}>
      <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: "0.05em", color: "var(--muted-soft)", display: "block", marginBottom: 8 }}>
        Q{num}
      </span>
      {children}
    </div>
  );
}

export function TierBadge({ tier }: { tier: number }) {
  const tone = tier === 1 ? "#5e7a8a" : tier === 2 ? "#a86c3a" : "#9a5a6e";
  return (
    <span style={{ fontSize: 11, padding: "2px 8px", borderRadius: 9999, border: `1px solid ${tone}66`, background: `${tone}1a`, color: tone }}>
      {TIER_LABELS[tier]}
    </span>
  );
}

export function ScoreCard({ label, value }: { label: string; value: number; color: string }) {
  return (
    <div style={{ border: "1px solid var(--card-border)", padding: "16px 20px", textAlign: "center" }}>
      <p style={{ fontFamily: "var(--font-display)", fontSize: 24, fontWeight: 400, margin: "0 0 4px" }}>
        {(value * 100).toFixed(0)}%
      </p>
      <p style={{ fontSize: 12, color: "var(--muted)", margin: 0 }}>{label}</p>
    </div>
  );
}

export function ScoreBadge({ score }: { score: number }) {
  const pct = Math.round(score * 100);
  const tone = pct >= 80 ? "#4f7a4d" : pct >= 50 ? "#b07a2e" : "#a8453a";
  return (
    <span style={{ fontSize: 11, padding: "2px 8px", borderRadius: 9999, border: `1px solid ${tone}66`, background: `${tone}1a`, color: tone }}>
      {pct}%
    </span>
  );
}

export function GradientBar({ report }: { report: ScoreReport }) {
  const t1 = Math.round(report.tier_1_accuracy * 100);
  const t2 = Math.round(report.tier_2_accuracy * 100);
  const t3 = Math.round(report.tier_3_accuracy * 100);
  const bars = [
    { label: "偏好", pct: t1, tone: "#5e7a8a" },
    { label: "推理", pct: t2, tone: "#a86c3a" },
    { label: "盲区", pct: t3, tone: "#9a5a6e" },
  ];
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {bars.map((b) => (
        <div key={b.label} style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <span style={{ fontSize: 12, width: 40, color: b.tone }}>{b.label}</span>
          <div style={{ flex: 1, height: 4, background: "var(--card-border)", borderRadius: 9999, overflow: "hidden" }}>
            <div style={{ height: "100%", width: `${b.pct}%`, background: b.tone, borderRadius: 9999, transition: "width 500ms" }} />
          </div>
          <span style={{ fontFamily: "var(--font-mono)", fontSize: 12, width: 48, textAlign: "right" }}>{b.pct}%</span>
        </div>
      ))}
      <p style={{ fontSize: 12, color: "var(--muted)", margin: 0 }}>
        梯度 {t1}% → {t3}% = {t1 - t3}pp —{" "}
        {t1 - t3 > 30 ? "AI 对深层认知理解显著弱于表面偏好" : t1 - t3 > 15 ? "存在明显的深浅理解差异" : "三层准确率相近，模型一致性较高"}
      </p>
    </div>
  );
}
