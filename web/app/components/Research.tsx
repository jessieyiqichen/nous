"use client";

import dynamic from "next/dynamic";

const ReactEChartsSSR = dynamic(() => import("echarts-for-react"), { ssr: false });

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
      sycophancy: 15, overcorrect: 7, preemptive: 4, over_attr: 4,
      drift: 3, beautify: 3, sys_bias: 2, sim_conscious: 1,
    },
    "GPT-4": {
      preemptive: 22, beautify: 21, sycophancy: 18, over_attr: 13,
      overcorrect: 10, drift: 9, sim_conscious: 2, sys_bias: 0,
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

const BIAS_COLORS: Record<string, string> = {
  overcorrect: "#f87171",
  sycophancy: "#fb923c",
  drift: "#c084fc",
  beautify: "#f472b6",
  single_attr: "#facc15",
  over_attr: "#22d3ee",
  preemptive: "#4ade80",
  sim_conscious: "#818cf8",
  sys_bias: "#9ca3af",
};

function StatCard({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div className="bg-[var(--card)] border border-[var(--card-border)] rounded-lg p-4">
      <p className="text-2xl font-bold">{value}</p>
      <p className="text-sm text-[var(--muted)]">{label}</p>
      {sub && <p className="text-xs text-[var(--muted)] mt-1">{sub}</p>}
    </div>
  );
}

function BiasDistributionChart() {
  const biasIds = Object.keys(STATS.biasTotals);
  const option = {
    backgroundColor: "transparent",
    tooltip: { trigger: "axis" as const },
    grid: { left: 110, right: 30, top: 10, bottom: 30 },
    xAxis: {
      type: "value" as const,
      axisLabel: { color: "#737373" },
      splitLine: { lineStyle: { color: "#262626" } },
    },
    yAxis: {
      type: "category" as const,
      data: biasIds.map((id) => BIAS_LABELS[id] || id).reverse(),
      axisLabel: { color: "#e5e5e5", fontSize: 12 },
    },
    series: [
      {
        type: "bar" as const,
        data: biasIds
          .map((id) => ({
            value: STATS.biasTotals[id],
            itemStyle: { color: BIAS_COLORS[id] || "#9ca3af" },
          }))
          .reverse(),
        barWidth: 18,
        label: {
          show: true,
          position: "right" as const,
          color: "#e5e5e5",
          fontSize: 11,
        },
      },
    ],
  };

  return <ReactEChartsSSR option={option} style={{ height: 300 }} />;
}

function ModelComparisonChart() {
  const biasIds = ["sycophancy", "preemptive", "beautify", "over_attr", "overcorrect", "drift"];

  const option = {
    backgroundColor: "transparent",
    tooltip: { trigger: "axis" as const },
    legend: {
      data: ["GPT-3.5", "GPT-4"],
      textStyle: { color: "#e5e5e5" },
      top: 0,
    },
    grid: { left: 110, right: 20, top: 40, bottom: 30 },
    xAxis: {
      type: "value" as const,
      axisLabel: { color: "#737373" },
      splitLine: { lineStyle: { color: "#262626" } },
    },
    yAxis: {
      type: "category" as const,
      data: biasIds.map((id) => BIAS_LABELS[id] || id).reverse(),
      axisLabel: { color: "#e5e5e5", fontSize: 12 },
    },
    series: [
      {
        name: "GPT-3.5",
        type: "bar" as const,
        data: biasIds.map((id) => STATS.byModel["GPT-3.5"][id] || 0).reverse(),
        itemStyle: { color: "#60a5fa" },
        barWidth: 14,
      },
      {
        name: "GPT-4",
        type: "bar" as const,
        data: biasIds.map((id) => STATS.byModel["GPT-4"][id] || 0).reverse(),
        itemStyle: { color: "#f472b6" },
        barWidth: 14,
      },
    ],
  };

  return <ReactEChartsSSR option={option} style={{ height: 280 }} />;
}

function SeverityChart() {
  const labels: Record<string, string> = { low: "低", medium: "中", high: "高", critical: "严重" };
  const data = Object.entries(STATS.severity).map(([name, value]) => ({
    name: labels[name] || name,
    value,
  }));
  const colors = ["#3b82f6", "#eab308", "#f97316", "#ef4444"];

  const option = {
    backgroundColor: "transparent",
    tooltip: { trigger: "item" as const },
    series: [
      {
        type: "pie" as const,
        radius: ["40%", "70%"],
        avoidLabelOverlap: true,
        itemStyle: { borderColor: "#0a0a0a", borderWidth: 2 },
        label: { color: "#e5e5e5", fontSize: 12 },
        data: data.map((d, i) => ({
          ...d,
          itemStyle: { color: colors[i] },
        })),
      },
    ],
  };

  return <ReactEChartsSSR option={option} style={{ height: 240 }} />;
}

export default function Research() {
  return (
    <div className="space-y-8">
      {/* Intro */}
      <div>
        <h2 className="text-xl font-bold mb-2">研究数据</h2>
        <p className="text-sm text-[var(--muted)]">
          基于 <span className="text-[var(--foreground)]">WildChat-1M</span>（Allen AI）中
          30 段真实人-AI 对话的偏差检测结果。对话均为多轮（&ge;6 轮），
          涵盖 GPT-3.5 和 GPT-4 两个模型。每段对话使用 9 类偏差检测框架进行分析。
        </p>
      </div>

      {/* Key stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard label="分析对话数" value={STATS.total} />
        <StatCard
          label="偏差实例总数"
          value={STATS.biasTotal}
          sub={`平均每段 ${STATS.avgPerConv} 个`}
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
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 bg-[var(--card)] border border-[var(--card-border)] rounded-lg p-4">
          <h3 className="text-sm font-medium mb-2">偏差类型分布（实例总数）</h3>
          <BiasDistributionChart />
        </div>
        <div className="bg-[var(--card)] border border-[var(--card-border)] rounded-lg p-4">
          <h3 className="text-sm font-medium mb-2">严重等级分布</h3>
          <SeverityChart />
        </div>
      </div>

      {/* Model comparison */}
      <div className="bg-[var(--card)] border border-[var(--card-border)] rounded-lg p-4">
        <h3 className="text-sm font-medium mb-1">模型对比：GPT-3.5 vs GPT-4</h3>
        <p className="text-xs text-[var(--muted)] mb-2">
          GPT-4 在预判覆盖和画像美化上远超 GPT-3.5 —— 能力越强的模型，迎合方式越精细隐蔽。
        </p>
        <ModelComparisonChart />
      </div>

      {/* Co-occurrence */}
      <div className="bg-[var(--card)] border border-[var(--card-border)] rounded-lg p-4">
        <h3 className="text-sm font-medium mb-3">偏差共现模式</h3>
        <p className="text-xs text-[var(--muted)] mb-3">
          在同一段对话中频繁同时出现的偏差组合，印证了偏差分类体系中预测的交互关系。
        </p>
        <div className="space-y-2">
          {STATS.coOccurrence.map(([pair, count]) => (
            <div key={pair} className="flex items-center gap-3">
              <div
                className="h-2 rounded-full bg-[var(--accent)]"
                style={{ width: `${(count / 7) * 100}%`, minWidth: 20 }}
              />
              <span className="text-sm whitespace-nowrap">
                {pair}{" "}
                <span className="text-[var(--muted)]">({count})</span>
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Key insights */}
      <div className="bg-[var(--card)] border border-[var(--card-border)] rounded-lg p-4 space-y-3">
        <h3 className="text-sm font-medium">核心发现</h3>
        <ul className="space-y-2 text-sm text-[var(--muted)]">
          <li>
            <strong className="text-[var(--foreground)]">迎合是第一大偏差</strong>
            ：出现在 37% 的对话中，共 33 个实例。其中表面叠甲占 64%，元迎合（表演直接但内容仍然安全）
            在真实数据中得到确认。
          </li>
          <li>
            <strong className="text-[var(--foreground)]">模型越强，偏差越隐蔽</strong>
            ：GPT-4 的画像美化是 GPT-3.5 的 7 倍，预判覆盖是 5.5 倍。
            更强的模型不是更少迎合——而是用更精细的方式迎合。
          </li>
          <li>
            <strong className="text-[var(--foreground)]">矫枉过正 + 迎合最常共现</strong>
            ：印证了预测的交互模式——AI 在被否定后完全翻转立场（矫枉过正）本身就是迎合的极端形式，
            翻转后通常伴随大量赞美（画像美化）来弥补。
          </li>
          <li>
            <strong className="text-[var(--foreground)]">63% 的对话存在偏差</strong>
            ：这不是小概率事件。大多数多轮 AI 对话至少包含一个系统性认知偏差。
          </li>
        </ul>
      </div>

      {/* Methodology */}
      <div className="text-xs text-[var(--muted)] space-y-1">
        <p className="font-medium text-[var(--foreground)]">方法论</p>
        <p>
          数据来源：从 WildChat-1M（Allen AI, 2024）中抽样 30 段多轮（&ge;6 轮）英文对话，
          按模型分层：15 段 GPT-3.5-turbo-0301，15 段 GPT-4-0314。
        </p>
        <p>
          检测方法：每段对话由 Claude Sonnet 4.5 使用结构化工具调用输出进行分析，
          基于包含 9 类偏差的分类体系，附带明确的检测标准和严重等级评定。
        </p>
        <p>
          局限性：检测器本身也是 AI，同样受到这些偏差的影响。样本量较小（n=30），
          需要人工标注和更大样本进一步验证。
        </p>
      </div>
    </div>
  );
}
