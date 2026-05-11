"use client";

import { useState, useEffect } from "react";
import dynamic from "next/dynamic";
import ContradictionPanel from "./ContradictionPanel";

const ReactEChartsSSR = dynamic(() => import("echarts-for-react"), {
  ssr: false,
});

// ── Types ────────────────────────────────────────────────────

interface CognitiveModel {
  dimensions: Array<{
    name: string;
    description: string;
    behavioral_predictions: string[];
    confidence: string;
  }>;
  summary: string;
}

interface LandingProps {
  onNavigate: (tab: string) => void;
}

// ── Dimension mapping ────────────────────────────────────────

const DIM_NAMES_ZH: Record<string, string> = {
  "Decision Architecture": "决策架构",
  "Attention Allocation": "注意力分配",
  "Reasoning Style": "推理风格",
  "Emotional Processing": "情绪处理",
  "Social Cognition": "社会认知",
  "Blind Spots": "盲区",
  "Value Hierarchy": "价值层级",
  "Response to Uncertainty": "不确定性应对",
  "Execution-Layer Flexibility": "执行层弹性",
};

const CONFIDENCE_VALUES: Record<string, number> = {
  high: 1.0,
  medium: 0.65,
  low: 0.3,
};

// ── Stats ────────────────────────────────────────────────────

const STATS = [
  { value: "99%", label: "模型理解准确度", sub: "直接判断模式" },
  { value: "71%", label: "行为预测准确率", sub: "+46pp vs 随机基线" },
  { value: "101", label: "认知信号采集", sub: "7 行为 + 4 过程 + 4 偏差" },
  { value: "20", label: "stated vs behavioral 矛盾", sub: "客观盲区证据" },
];

// ── Radar Chart ──────────────────────────────────────────────

/** Short description for tooltip per dimension */
const DIM_SHORT_DESC: Record<string, string> = {
  "Decision Architecture": "直觉先行，分析验证。等待内在框架收敛后才行动。",
  "Attention Allocation": "完全由「在乎」驱动，无稳定基线。在乎的全力，不在乎的近零。",
  "Reasoning Style": "系统级快速理解，结构化/架构式思考，非线性跳跃。",
  "Emotional Processing": "高原始强度，被智识层重度遮蔽。需特定安全条件才表达。",
  "Social Cognition": "自动校准输出深度。高说服力但对使用持矛盾态度。",
  "Blind Spots": "低估情绪信号、社会规范兜底、生理成本、深度连接需求。",
  "Value Hierarchy": "智识深度 > 自主性 > 系统化创造 > 被真正理解。条件性而非普世。",
  "Response to Uncertainty": "通过建构框架应对。方向清晰可容忍路径模糊。",
  "Execution-Layer Flexibility": "在乎域：牺牲一切不妥协质量。非在乎域：最低可行或放弃。",
};

function CognitiveRadar({ model }: { model: CognitiveModel }) {
  const indicators = model.dimensions.map((d) => ({
    name: `${DIM_NAMES_ZH[d.name] || d.name}\n${d.name}`,
    max: 1,
  }));
  const values = model.dimensions.map(
    (d) => CONFIDENCE_VALUES[d.confidence] || 0.5
  );

  const option = {
    backgroundColor: "transparent",
    tooltip: {
      trigger: "item" as const,
      backgroundColor: "rgba(246, 241, 231, 0.96)",
      borderColor: "#e4dccb",
      textStyle: { color: "#3a3226", fontSize: 12, lineHeight: 18 },
      formatter: (params: { value: number[] }) => {
        return model.dimensions
          .map((d, i) => {
            const zh = DIM_NAMES_ZH[d.name] || d.name;
            const desc = DIM_SHORT_DESC[d.name] || "";
            const pct = (params.value[i] * 100).toFixed(0);
            return `<b>${zh}</b> <span style="color:#948774">${d.name}</span><br/>`
              + `<span style="color:#8a4a2a">${pct}% confidence</span>`
              + (desc ? `<br/><span style="color:#6b5f50;font-size:11px">${desc}</span>` : "");
          })
          .join("<br/><br/>");
      },
    },
    radar: {
      indicator: indicators,
      shape: "polygon" as const,
      axisName: {
        color: "#6b5f50",
        fontSize: 11,
        fontFamily: "var(--font-display)",
        fontStyle: "italic",
        lineHeight: 16,
      },
      splitArea: {
        areaStyle: {
          color: [
            "rgba(138, 74, 42, 0.02)",
            "transparent",
            "rgba(138, 74, 42, 0.02)",
            "transparent",
            "rgba(138, 74, 42, 0.02)",
          ],
        },
      },
      splitLine: { lineStyle: { color: "#e4dccb", width: 0.5 } },
      axisLine: { lineStyle: { color: "#e4dccb", width: 0.5 } },
    },
    series: [
      {
        type: "radar" as const,
        data: [
          {
            value: values,
            areaStyle: {
              color: {
                type: "radial" as const,
                x: 0.5,
                y: 0.5,
                r: 0.5,
                colorStops: [
                  { offset: 0, color: "rgba(138, 74, 42, 0.18)" },
                  { offset: 1, color: "rgba(138, 74, 42, 0.04)" },
                ],
              },
            },
            lineStyle: { color: "#8a4a2a", width: 1.5 },
            itemStyle: { color: "#8a4a2a", borderColor: "#f6f1e7", borderWidth: 1 },
            symbol: "circle",
            symbolSize: 6,
          },
        ],
      },
    ],
  };

  return <ReactEChartsSSR option={option} style={{ height: 400 }} />;
}

// ── Component ────────────────────────────────────────────────

export default function Landing({ onNavigate }: LandingProps) {
  const [model, setModel] = useState<CognitiveModel | null>(null);

  useEffect(() => {
    fetch("/api/model")
      .then((res) => res.json())
      .then((data) => {
        if (data.dimensions) setModel(data);
      })
      .catch(() => {});
  }, []);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 48 }}>
      {/* Hero */}
      <div style={{ textAlign: "center", paddingTop: 24 }}>
        <h2
          style={{
            fontFamily: "var(--font-display)",
            fontSize: 32,
            fontWeight: 400,
            margin: "0 0 12px",
            lineHeight: 1.3,
          }}
        >
          Understanding how you think,
          <br />
          not just what you prefer
        </h2>
        <p
          style={{
            fontSize: 15,
            color: "var(--muted)",
            lineHeight: 1.65,
            margin: "0 auto",
            maxWidth: 520,
          }}
        >
          Nous 构建你的认知模型——不是性格标签，而是你做决策、分配注意力、处理不确定性的实际方式。然后用它预测你的行为。
        </p>
      </div>

      {/* Stats grid */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(4, 1fr)",
          gap: 1,
          border: "1px solid var(--card-border)",
        }}
      >
        {STATS.map((s) => (
          <div key={s.label} style={{ padding: "20px 24px", textAlign: "center" }}>
            <p
              style={{
                fontFamily: "var(--font-display)",
                fontSize: 28,
                fontWeight: 400,
                margin: "0 0 4px",
                color: "var(--accent)",
              }}
            >
              {s.value}
            </p>
            <p style={{ fontSize: 12, color: "var(--foreground)", margin: "0 0 2px" }}>
              {s.label}
            </p>
            <p
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: 10,
                color: "var(--muted-soft)",
                margin: 0,
              }}
            >
              {s.sub}
            </p>
          </div>
        ))}
      </div>

      {/* Radar chart */}
      {model && (
        <div>
          <p className="eyebrow" style={{ marginBottom: 4, textAlign: "center" }}>
            认知画像
          </p>
          <p
            style={{
              fontFamily: "var(--font-display)",
              fontSize: 14,
              fontStyle: "italic",
              color: "var(--muted)",
              margin: "0 0 8px",
              textAlign: "center",
            }}
          >
            9 维认知模型 · 所有维度 high confidence
          </p>
          <CognitiveRadar model={model} />
        </div>
      )}

      {/* CTA buttons */}
      <div style={{ display: "flex", justifyContent: "center", gap: 16 }}>
        <button
          onClick={() => onNavigate("interview")}
          style={{
            fontFamily: "inherit",
            fontSize: 14,
            padding: "10px 24px",
            border: "1px solid var(--accent)",
            background: "var(--accent)",
            color: "#fff",
            cursor: "pointer",
            borderRadius: 0,
          }}
        >
          Start Interview
        </button>
        <button
          onClick={() => onNavigate("playground")}
          style={{
            fontFamily: "inherit",
            fontSize: 14,
            padding: "10px 24px",
            border: "1px solid var(--accent)",
            background: "transparent",
            color: "var(--accent)",
            cursor: "pointer",
            borderRadius: 0,
          }}
        >
          Try Playground
        </button>
        <button
          onClick={() => onNavigate("research")}
          style={{
            fontFamily: "inherit",
            fontSize: 14,
            padding: "10px 24px",
            border: "1px solid var(--card-border)",
            background: "transparent",
            color: "var(--muted)",
            cursor: "pointer",
            borderRadius: 0,
          }}
        >
          View Research
        </button>
      </div>

      {/* Contradiction panel */}
      <ContradictionPanel />

      {/* Summary excerpt */}
      {model && (
        <div style={{ borderLeft: "2px solid var(--accent)", paddingLeft: 28 }}>
          <p
            style={{
              fontFamily: "var(--font-display)",
              fontSize: 15,
              fontWeight: 400,
              fontStyle: "italic",
              lineHeight: 1.65,
              color: "var(--muted)",
              margin: 0,
            }}
          >
            {model.summary.split("\n")[0]}
          </p>
        </div>
      )}
    </div>
  );
}
