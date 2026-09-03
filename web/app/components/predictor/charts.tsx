"use client";

import dynamic from "next/dynamic";
import type { RoundRecord, ScoreReport } from "./types";

const ReactEChartsSSR = dynamic(() => import("echarts-for-react"), { ssr: false });

export function RoundHistoryChart({ history }: { history: RoundRecord[] }) {
  const sorted = [...history].sort((a, b) => a.round - b.round);
  const rounds = sorted.map((r) => `第${r.round}轮`);

  const option = {
    backgroundColor: "transparent",
    tooltip: { trigger: "axis" as const },
    legend: {
      data: ["综合", "偏好", "推理", "盲区"],
      textStyle: { color: "#6b5f50", fontSize: 11 },
      bottom: 0,
    },
    grid: { top: 10, right: 20, bottom: 35, left: 40 },
    xAxis: {
      type: "category" as const,
      data: rounds,
      axisLabel: { color: "#948774", fontSize: 11 },
      axisLine: { lineStyle: { color: "#e4dccb" } },
    },
    yAxis: {
      type: "value" as const,
      min: 0,
      max: 1,
      axisLabel: { color: "#948774", fontSize: 11, formatter: (v: number) => `${Math.round(v * 100)}%` },
      splitLine: { lineStyle: { color: "#e4dccb" } },
    },
    series: [
      { name: "综合", type: "line" as const, data: sorted.map((r) => r.overall_accuracy), lineStyle: { width: 2, color: "#8a4a2a" }, itemStyle: { color: "#8a4a2a" } },
      { name: "偏好", type: "line" as const, data: sorted.map((r) => r.tier_1_accuracy), lineStyle: { width: 1, color: "#5e7a8a" }, itemStyle: { color: "#5e7a8a" } },
      { name: "推理", type: "line" as const, data: sorted.map((r) => r.tier_2_accuracy), lineStyle: { width: 1, color: "#a86c3a" }, itemStyle: { color: "#a86c3a" } },
      { name: "盲区", type: "line" as const, data: sorted.map((r) => r.tier_3_accuracy), lineStyle: { width: 1, color: "#9a5a6e" }, itemStyle: { color: "#9a5a6e" } },
    ],
  };
  return <ReactEChartsSSR option={option} style={{ height: 220 }} />;
}

export function AccuracyChart({ report }: { report: ScoreReport }) {
  const option = {
    backgroundColor: "transparent",
    radar: {
      indicator: [
        { name: "偏好", max: 1 },
        { name: "推理", max: 1 },
        { name: "盲区", max: 1 },
      ],
      axisName: { color: "#6b5f50", fontSize: 13, fontFamily: "var(--font-display)", fontStyle: "italic" },
      splitArea: { areaStyle: { color: ["transparent"] } },
      splitLine: { lineStyle: { color: "#e4dccb" } },
      axisLine: { lineStyle: { color: "#e4dccb" } },
    },
    series: [{
      type: "radar",
      data: [{
        value: [report.tier_1_accuracy, report.tier_2_accuracy, report.tier_3_accuracy],
        areaStyle: { color: "rgba(138,74,42,0.1)" },
        lineStyle: { color: "#8a4a2a", width: 2 },
        itemStyle: { color: "#8a4a2a" },
      }],
    }],
  };
  return <ReactEChartsSSR option={option} style={{ height: 240 }} />;
}
