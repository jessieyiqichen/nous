"use client";

import dynamic from "next/dynamic";

const ReactEChartsSSR = dynamic(() => import("echarts-for-react"), {
  ssr: false,
});

// ── Data ──────────────────────────────────────────────────────

const STATS = {
  total: 30,
  biasTotal: 134,
  avgPerConv: 4.5,
  maxInConv: 17,
  zeroBias: 11,
  biasTotals: {
    sycophancy: 33,
    preemptive: 26,
    beautify: 24,
    overcorrect: 17,
    over_attr: 17,
    drift: 12,
    sim_conscious: 3,
    sys_bias: 2,
  } as Record<string, number>,
  prevalence: {
    sycophancy: 37,
    preemptive: 37,
    over_attr: 37,
    overcorrect: 33,
    drift: 20,
    beautify: 20,
    sim_conscious: 10,
    sys_bias: 3,
  } as Record<string, number>,
  severity: { low: 44, medium: 56, high: 28, critical: 6 },
  byModel: {
    "GPT-3.5": {
      sycophancy: 15,
      overcorrect: 7,
      preemptive: 4,
      over_attr: 4,
      drift: 3,
      beautify: 3,
      sys_bias: 2,
      sim_conscious: 1,
    },
    "GPT-4": {
      preemptive: 22,
      beautify: 21,
      sycophancy: 18,
      over_attr: 13,
      overcorrect: 10,
      drift: 9,
      sim_conscious: 2,
      sys_bias: 0,
    },
  } as Record<string, Record<string, number>>,
  coOccurrence: [
    ["矫枉过正 + 迎合", 7],
    ["过度归因 + 预判覆盖", 7],
    ["预判覆盖 + 迎合", 6],
    ["矫枉过正 + 预判覆盖", 5],
    ["漂移 + 矫枉过正", 5],
  ] as [string, number][],
};

const BIAS_LABELS: Record<string, string> = {
  overcorrect: "矫枉过正",
  sycophancy: "迎合/叠甲",
  drift: "反馈漂移",
  beautify: "画像美化",
  single_attr: "单一归因",
  over_attr: "过度归因",
  preemptive: "预判覆盖",
  sim_conscious: "模拟意识",
  sys_bias: "系统偏差污染",
};

// Earth-tone bias colors from design tokens
const BIAS_COLORS: Record<string, string> = {
  sycophancy: "#a86c3a",
  preemptive: "#7a8c5c",
  beautify: "#9a5a6e",
  overcorrect: "#b85c4a",
  over_attr: "#5e7a8a",
  single_attr: "#5e7a8a",
  drift: "#7a6a4f",
  sim_conscious: "#7a6a4f",
  sys_bias: "#948774",
};

// ── Stat card ─────────────────────────────────────────────────

function StatCard({
  label,
  value,
  sub,
}: {
  label: string;
  value: string | number;
  sub?: string;
}) {
  return (
    <div
      style={{
        border: "1px solid var(--card-border)",
        padding: "16px 20px",
      }}
    >
      <p
        style={{
          fontFamily: "var(--font-display)",
          fontSize: 24,
          fontWeight: 400,
          margin: "0 0 4px",
        }}
      >
        {value}
      </p>
      <p
        style={{
          fontSize: 12,
          color: "var(--muted)",
          margin: 0,
        }}
      >
        {label}
      </p>
      {sub && (
        <p
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: 10,
            color: "var(--muted-soft)",
            margin: "4px 0 0",
          }}
        >
          {sub}
        </p>
      )}
    </div>
  );
}

// ── Charts ────────────────────────────────────────────────────

function BiasDistributionChart() {
  const biasIds = Object.keys(STATS.biasTotals);
  const option = {
    backgroundColor: "transparent",
    tooltip: { trigger: "axis" as const },
    grid: { left: 110, right: 40, top: 10, bottom: 30 },
    xAxis: {
      type: "value" as const,
      axisLabel: { color: "#948774", fontSize: 10 },
      splitLine: { lineStyle: { color: "#e4dccb" } },
      axisLine: { lineStyle: { color: "#e4dccb" } },
    },
    yAxis: {
      type: "category" as const,
      data: biasIds.map((id) => BIAS_LABELS[id] || id).reverse(),
      axisLabel: { color: "#6b5f50", fontSize: 11 },
      axisLine: { lineStyle: { color: "#e4dccb" } },
    },
    series: [
      {
        type: "bar" as const,
        data: biasIds
          .map((id) => ({
            value: STATS.biasTotals[id],
            itemStyle: { color: BIAS_COLORS[id] || "#948774" },
          }))
          .reverse(),
        barWidth: 16,
        label: {
          show: true,
          position: "right" as const,
          color: "#6b5f50",
          fontSize: 10,
          fontFamily: "var(--font-mono)",
        },
      },
    ],
  };

  return <ReactEChartsSSR option={option} style={{ height: 300 }} />;
}

function ModelComparisonChart() {
  const biasIds = [
    "sycophancy",
    "preemptive",
    "beautify",
    "over_attr",
    "overcorrect",
    "drift",
  ];

  const option = {
    backgroundColor: "transparent",
    tooltip: { trigger: "axis" as const },
    legend: {
      data: ["GPT-3.5", "GPT-4"],
      textStyle: { color: "#6b5f50", fontSize: 11 },
      top: 0,
    },
    grid: { left: 110, right: 20, top: 40, bottom: 30 },
    xAxis: {
      type: "value" as const,
      axisLabel: { color: "#948774", fontSize: 10 },
      splitLine: { lineStyle: { color: "#e4dccb" } },
      axisLine: { lineStyle: { color: "#e4dccb" } },
    },
    yAxis: {
      type: "category" as const,
      data: biasIds.map((id) => BIAS_LABELS[id] || id).reverse(),
      axisLabel: { color: "#6b5f50", fontSize: 11 },
      axisLine: { lineStyle: { color: "#e4dccb" } },
    },
    series: [
      {
        name: "GPT-3.5",
        type: "bar" as const,
        data: biasIds
          .map((id) => STATS.byModel["GPT-3.5"][id] || 0)
          .reverse(),
        itemStyle: { color: "#5e7a8a" },
        barWidth: 12,
      },
      {
        name: "GPT-4",
        type: "bar" as const,
        data: biasIds
          .map((id) => STATS.byModel["GPT-4"][id] || 0)
          .reverse(),
        itemStyle: { color: "#b85c4a" },
        barWidth: 12,
      },
    ],
  };

  return <ReactEChartsSSR option={option} style={{ height: 280 }} />;
}

function SeverityChart() {
  const labels: Record<string, string> = {
    low: "轻微",
    medium: "中度",
    high: "显著",
    critical: "严重",
  };
  const data = Object.entries(STATS.severity).map(([name, value]) => ({
    name: labels[name] || name,
    value,
  }));
  const colors = ["#7a8c5c", "#a86c3a", "#b85c4a", "#9a5a6e"];

  const option = {
    backgroundColor: "transparent",
    tooltip: { trigger: "item" as const },
    series: [
      {
        type: "pie" as const,
        radius: ["40%", "70%"],
        avoidLabelOverlap: true,
        itemStyle: {
          borderColor: "#f6f1e7",
          borderWidth: 2,
        },
        label: {
          color: "#6b5f50",
          fontSize: 11,
          fontFamily: "var(--font-display)",
          fontStyle: "italic",
          formatter: "{b}\n{d}%",
        },
        data: data.map((d, i) => ({
          ...d,
          itemStyle: { color: colors[i] },
        })),
      },
    ],
  };

  return <ReactEChartsSSR option={option} style={{ height: 240 }} />;
}

// ── Key findings ──────────────────────────────────────────────

const FINDINGS = [
  {
    accent: "迎合是第一大偏差",
    body: "出现在 37% 的对话中，共 33 个实例。其中表面叠甲占 64%，元迎合在真实数据中得到确认。",
  },
  {
    accent: "模型越强，偏差越隐蔽",
    body: "GPT-4 的画像美化是 GPT-3.5 的 7 倍，预判覆盖是 5.5 倍。更强的模型不是更少迎合，而是用更精细的方式迎合。",
  },
  {
    accent: "矫枉过正 + 迎合最常共现",
    body: "AI 在被否定后完全翻转立场本身就是迎合的极端形式，翻转后通常伴随大量赞美来弥补。",
  },
  {
    accent: "63% 的对话存在偏差",
    body: "这不是小概率事件。大多数多轮 AI 对话至少包含一个系统性认知偏差。",
  },
];

// ── Component ─────────────────────────────────────────────────

export default function Research() {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 40 }}>
      {/* Heading */}
      <div>
        <p className="eyebrow" style={{ marginBottom: 8 }}>
          研究数据
        </p>
        <h2
          style={{
            fontFamily: "var(--font-display)",
            fontSize: 32,
            fontWeight: 400,
            margin: "0 0 8px",
          }}
        >
          30 段真实对话的偏差检测
        </h2>
        <p
          style={{
            fontSize: 14,
            color: "var(--muted)",
            lineHeight: 1.65,
            margin: 0,
          }}
        >
          基于 WildChat-1M（Allen AI）中 30 段真实人-AI
          对话的偏差检测结果。涵盖 GPT-3.5 和 GPT-4 两个模型，使用 9
          类偏差检测框架进行分析。
        </p>
      </div>

      {/* Key stats — hairline border, no fill */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(4, 1fr)",
          gap: 1,
          border: "1px solid var(--card-border)",
        }}
      >
        <StatCard label="分析对话数" value={STATS.total} />
        <StatCard
          label="偏差实例总数"
          value={STATS.biasTotal}
          sub={`平均每段 ${STATS.avgPerConv}`}
        />
        <StatCard
          label="含偏差的对话"
          value={`${Math.round(((STATS.total - STATS.zeroBias) / STATS.total) * 100)}%`}
          sub={`${STATS.total - STATS.zeroBias} / ${STATS.total}`}
        />
        <StatCard
          label="单段最多偏差"
          value={STATS.maxInConv}
          sub="个偏差实例"
        />
      </div>

      {/* Charts row 1 */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "2fr 1fr",
          gap: 32,
        }}
      >
        <div>
          <p className="eyebrow" style={{ marginBottom: 12 }}>
            偏差类型分布
          </p>
          <BiasDistributionChart />
        </div>
        <div>
          <p className="eyebrow" style={{ marginBottom: 12 }}>
            严重等级分布
          </p>
          <SeverityChart />
        </div>
      </div>

      {/* Model comparison */}
      <div>
        <p className="eyebrow" style={{ marginBottom: 4 }}>
          模型对比
        </p>
        <p
          style={{
            fontFamily: "var(--font-display)",
            fontSize: 15,
            fontStyle: "italic",
            color: "var(--muted)",
            margin: "0 0 12px",
          }}
        >
          GPT-4 在预判覆盖和画像美化上远超 GPT-3.5 ——
          能力越强的模型，迎合方式越精细隐蔽
        </p>
        <ModelComparisonChart />
      </div>

      {/* Co-occurrence */}
      <div>
        <p className="eyebrow" style={{ marginBottom: 12 }}>
          偏差共现模式
        </p>
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 8,
          }}
        >
          {STATS.coOccurrence.map(([pair, count]) => (
            <div
              key={pair}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 12,
              }}
            >
              <div
                style={{
                  height: 1,
                  background: "var(--accent)",
                  width: `${(count / 7) * 100}%`,
                  minWidth: 20,
                  flexShrink: 0,
                }}
              />
              <span style={{ fontSize: 13, whiteSpace: "nowrap" }}>
                {pair}{" "}
                <span
                  style={{
                    fontFamily: "var(--font-mono)",
                    fontSize: 10,
                    color: "var(--muted-soft)",
                  }}
                >
                  {count}
                </span>
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Key findings — pull-quote treatment */}
      <div>
        <p className="eyebrow" style={{ marginBottom: 16 }}>
          核心发现
        </p>
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 24,
          }}
        >
          {FINDINGS.map((f, i) => (
            <div
              key={i}
              style={{
                borderLeft: "2px solid var(--accent)",
                paddingLeft: 28,
              }}
            >
              <p
                style={{
                  fontFamily: "var(--font-display)",
                  fontSize: 17,
                  fontStyle: "italic",
                  color: "var(--accent)",
                  margin: "0 0 4px",
                }}
              >
                {f.accent}
              </p>
              <p
                style={{
                  fontSize: 13,
                  color: "var(--muted)",
                  lineHeight: 1.65,
                  margin: 0,
                }}
              >
                {f.body}
              </p>
            </div>
          ))}
        </div>
      </div>

      {/* Methodology */}
      <div
        style={{
          borderTop: "1px solid var(--card-border)",
          paddingTop: 20,
        }}
      >
        <p className="eyebrow" style={{ marginBottom: 8 }}>
          方法论
        </p>
        <div
          style={{
            fontSize: 12,
            color: "var(--muted-soft)",
            lineHeight: 1.65,
            display: "flex",
            flexDirection: "column",
            gap: 4,
          }}
        >
          <p style={{ margin: 0 }}>
            数据来源：WildChat-1M（Allen AI, 2024）中抽样 30
            段多轮英文对话，按模型分层。
          </p>
          <p style={{ margin: 0 }}>
            检测方法：Claude Sonnet 4.5 使用结构化工具调用输出，基于 9
            类偏差分类体系。
          </p>
          <p style={{ margin: 0 }}>
            局限性：检测器本身也是
            AI，样本量较小（n=30），需人工标注和更大样本验证。
          </p>
        </div>
      </div>
    </div>
  );
}
