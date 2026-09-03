"use client";

import { useState, useEffect } from "react";

// ── Types ────────────────────────────────────────────────────

interface Contradiction {
  stated_claim: string;
  actual_behavior: string;
  blind_spot_evidence: string;
  confidence: number;
  period: string; // YYYY-MM only
}

// ── Helpers ──────────────────────────────────────────────────

function confidenceLabel(c: number): string {
  if (c >= 0.9) return "高";
  if (c >= 0.75) return "中";
  return "低";
}

function confidenceColor(c: number): string {
  if (c >= 0.9) return "var(--accent)";
  if (c >= 0.75) return "var(--muted)";
  return "var(--muted-soft)";
}

/** Extract first Chinese sentence or first 80 chars as a summary */
function summarize(text: string, maxLen = 80): string {
  // Try to extract the first Chinese sentence (before parenthetical English)
  const match = text.match(/^([^(（]+)/);
  const base = match ? match[1].trim() : text;
  if (base.length <= maxLen) return base;
  return base.slice(0, maxLen) + "…";
}

// ── Component ────────────────────────────────────────────────

export default function ContradictionPanel() {
  const [contradictions, setContradictions] = useState<Contradiction[]>([]);
  const [total, setTotal] = useState(0);
  const [expanded, setExpanded] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/contradictions")
      .then((res) => res.json())
      .then((data) => {
        if (data.contradictions) {
          setContradictions(data.contradictions);
          setTotal(data.total);
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div style={{ padding: "24px 0", textAlign: "center" }}>
        <p style={{ fontSize: 13, color: "var(--muted)" }}>
          加载矛盾数据...
        </p>
      </div>
    );
  }

  if (contradictions.length === 0) return null;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {/* Header */}
      <div>
        <p className="eyebrow" style={{ marginBottom: 4 }}>
          Stated vs Behavioral
        </p>
        <p
          style={{
            fontFamily: "var(--font-display)",
            fontSize: 14,
            fontStyle: "italic",
            color: "var(--muted)",
            margin: 0,
          }}
        >
          {total} 条矛盾 · 说的和做的不一样 · 按置信度排序
        </p>
      </div>

      {/* Contradiction cards */}
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {contradictions.map((c, i) => {
          const isExpanded = expanded === i;

          return (
            <div
              key={i}
              style={{
                border: "1px solid var(--card-border)",
                cursor: "pointer",
                transition: "border-color 0.2s",
              }}
              onClick={() => setExpanded(isExpanded ? null : i)}
            >
              {/* Top bar: index + confidence */}
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  padding: "10px 16px",
                  borderBottom: isExpanded
                    ? "1px solid var(--card-border)"
                    : "none",
                }}
              >
                <span
                  style={{
                    fontFamily: "var(--font-mono)",
                    fontSize: 11,
                    color: "var(--muted-soft)",
                  }}
                >
                  #{i + 1}
                </span>
                <span
                  style={{
                    fontFamily: "var(--font-mono)",
                    fontSize: 10,
                    letterSpacing: "0.05em",
                    color: confidenceColor(c.confidence),
                  }}
                >
                  {confidenceLabel(c.confidence)} · {(c.confidence * 100).toFixed(0)}%
                </span>
              </div>

              {/* Left-right comparison */}
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr",
                  gap: 0,
                }}
              >
                {/* Stated (left) */}
                <div
                  style={{
                    padding: "14px 16px",
                    borderRight: "1px solid var(--card-border)",
                  }}
                >
                  <p
                    style={{
                      fontFamily: "var(--font-mono)",
                      fontSize: 9,
                      letterSpacing: "0.08em",
                      textTransform: "uppercase",
                      color: "var(--muted-soft)",
                      margin: "0 0 6px",
                    }}
                  >
                    STATED · 我说的
                  </p>
                  <p
                    style={{
                      fontSize: 13,
                      lineHeight: 1.65,
                      color: "var(--foreground)",
                      margin: 0,
                    }}
                  >
                    {isExpanded ? c.stated_claim : summarize(c.stated_claim)}
                  </p>
                </div>

                {/* Behavioral (right) */}
                <div style={{ padding: "14px 16px" }}>
                  <p
                    style={{
                      fontFamily: "var(--font-mono)",
                      fontSize: 9,
                      letterSpacing: "0.08em",
                      textTransform: "uppercase",
                      color: "var(--accent)",
                      margin: "0 0 6px",
                    }}
                  >
                    BEHAVIORAL · 我做的
                  </p>
                  <p
                    style={{
                      fontSize: 13,
                      lineHeight: 1.65,
                      color: "var(--foreground)",
                      margin: 0,
                    }}
                  >
                    {isExpanded ? c.actual_behavior : summarize(c.actual_behavior)}
                  </p>
                </div>
              </div>

              {/* Expanded: blind spot analysis */}
              {isExpanded && (
                <div
                  style={{
                    borderTop: "1px solid var(--card-border)",
                    padding: "14px 16px",
                    background: "rgba(138, 74, 42, 0.03)",
                  }}
                >
                  <p
                    style={{
                      fontFamily: "var(--font-mono)",
                      fontSize: 9,
                      letterSpacing: "0.08em",
                      textTransform: "uppercase",
                      color: "var(--muted-soft)",
                      margin: "0 0 6px",
                    }}
                  >
                    BLIND SPOT ANALYSIS
                  </p>
                  <p
                    style={{
                      fontSize: 12,
                      lineHeight: 1.7,
                      color: "var(--muted)",
                      margin: 0,
                    }}
                  >
                    {c.blind_spot_evidence}
                  </p>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Footer hint */}
      <p
        style={{
          fontSize: 11,
          color: "var(--muted-soft)",
          textAlign: "center",
          margin: 0,
        }}
      >
        点击卡片展开盲区分析
      </p>
    </div>
  );
}
