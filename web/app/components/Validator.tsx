"use client";

import { useState, useCallback } from "react";

// ── Types ─────────────────────────────────────────────────────

interface CognitiveModel {
  dimensions: Array<{
    name: string;
    description: string;
    behavioral_predictions: string[];
    confidence: string;
  }>;
  summary: string;
}

interface ModelVersion {
  v: number;
  ts: string;
  turn: number;
  after: string;
  changed: string[];
  delta: string;
  confidence: number;
}

interface DimSnapshot {
  name: string;
  name_zh: string;
  confidence: "high" | "medium" | "low" | "none";
  description: string;
}

interface Props {
  onGoPredict?: (model: CognitiveModel) => void;
}

// ── Dimension display names ───────────────────────────────────

const DIM_NAMES_ZH: Record<string, string> = {
  "Decision Architecture": "决策架构",
  "Attention Allocation": "注意力分配",
  "Reasoning Style": "推理风格",
  "Emotional Processing": "情感处理",
  "Social Cognition": "社会认知",
  "Blind Spots": "盲区",
  "Value Hierarchy": "价值层级",
  "Response to Uncertainty": "面对不确定性",
  "Execution-Layer Flexibility": "执行层弹性",
};

const ALL_DIMS = Object.keys(DIM_NAMES_ZH);

// ── Mock version data ─────────────────────────────────────────

const MOCK_VERSIONS: ModelVersion[] = [
  {
    v: 1, ts: "14:02", turn: 2, after: "",
    changed: [],
    delta: "初始空白模型",
    confidence: 0,
  },
  {
    v: 2, ts: "14:08", turn: 4,
    after: "我一般先看数据，直觉反而不太信",
    changed: ["Reasoning Style"],
    delta: "Reasoning Style 初始评估：偏分析型",
    confidence: 0.32,
  },
  {
    v: 3, ts: "14:12", turn: 6,
    after: "对我来说效率比完美重要",
    changed: ["Decision Architecture", "Value Hierarchy"],
    delta: "Decision Architecture 偏 satisficing；Value Hierarchy 效率优先",
    confidence: 0.48,
  },
  {
    v: 4, ts: "14:16", turn: 8,
    after: "我发现我经常在别人说完之前就形成判断了",
    changed: ["Attention Allocation", "Blind Spots"],
    delta: "Attention 快速锚定；Blind Spots 新增「过早闭合」倾向",
    confidence: 0.61,
  },
  {
    v: 5, ts: "14:24", turn: 10,
    after: "不确定的时候我更倾向快速试错而不是多想",
    changed: ["Response to Uncertainty", "Execution-Layer Flexibility"],
    delta: "「直觉先到」从假设升为确认",
    confidence: 0.72,
  },
  {
    v: 6, ts: "14:28", turn: 12,
    after: "其实我觉得别人的评价没那么重要",
    changed: ["Social Cognition", "Emotional Processing"],
    delta: "Social Cognition 低外部依赖；Emotional Processing 理性主导",
    confidence: 0.83,
  },
  {
    v: 7, ts: "14:32", turn: 14,
    after: "有时候我会事后找理由说服自己之前的决定是对的",
    changed: ["Blind Spots", "Reasoning Style"],
    delta: "新增「自我合理化」迹象",
    confidence: 0.91,
  },
];

// ── Dimension descriptions per version snapshot ───────────────

const DIM_DESCRIPTIONS: Record<string, string> = {
  "Decision Architecture": "偏向 satisficing 决策，效率优先于最优解",
  "Attention Allocation": "快速锚定关键信息，存在过早闭合的风险",
  "Reasoning Style": "偏分析型，依赖数据多于直觉，但会事后合理化",
  "Emotional Processing": "情绪对决策影响较小，理性主导",
  "Social Cognition": "低外部评价依赖，独立判断倾向明显",
  "Blind Spots": "过早闭合 + 自我合理化，对自身偏差觉察力中等",
  "Value Hierarchy": "效率 > 完美，实用主义价值取向",
  "Response to Uncertainty": "快速试错偏好，低容忍模糊状态",
  "Execution-Layer Flexibility": "行动导向，灵活切换执行策略",
};

function getDimSnapshots(version: ModelVersion): DimSnapshot[] {
  const allVersionsUpTo = MOCK_VERSIONS.filter((ver) => ver.v <= version.v);
  const touchedDims = new Set<string>();
  for (const ver of allVersionsUpTo) {
    for (const d of ver.changed) touchedDims.add(d);
  }

  return ALL_DIMS.map((dim) => {
    const isTouched = touchedDims.has(dim);
    const conf = version.confidence;
    let confidence: "high" | "medium" | "low" | "none";
    if (!isTouched) {
      confidence = "none";
    } else if (conf >= 0.8) {
      confidence = "high";
    } else if (conf >= 0.5) {
      confidence = "medium";
    } else {
      confidence = "low";
    }

    return {
      name: dim,
      name_zh: DIM_NAMES_ZH[dim],
      confidence,
      description: isTouched
        ? DIM_DESCRIPTIONS[dim] || "待填充"
        : "尚未收集到足够信号",
    };
  });
}

// ── Component ─────────────────────────────────────────────────

export default function Validator({ onGoPredict }: Props) {
  const [selectedVersion, setSelectedVersion] = useState(7);
  const [compareVersion, setCompareVersion] = useState<number | null>(null);

  const current =
    MOCK_VERSIONS.find((ver) => ver.v === selectedVersion) ||
    MOCK_VERSIONS[MOCK_VERSIONS.length - 1];
  const dimSnapshots = getDimSnapshots(current);

  const handleContextMenu = useCallback(
    (e: React.MouseEvent, v: number) => {
      e.preventDefault();
      if (v === selectedVersion) return;
      setCompareVersion((prev) => (prev === v ? null : v));
    },
    [selectedVersion]
  );

  // Build a stub CognitiveModel from mock data for onGoPredict
  const buildStubModel = useCallback((): CognitiveModel => {
    const snapshots = getDimSnapshots(current);
    return {
      dimensions: snapshots
        .filter((d) => d.confidence !== "none")
        .map((d) => ({
          name: d.name,
          description: d.description,
          behavioral_predictions: [],
          confidence: d.confidence,
        })),
      summary: `v${current.v} 模型快照 — 置信度 ${(current.confidence * 100).toFixed(0)}%`,
    };
  }, [current]);

  return (
    <div style={{ display: "flex", gap: 0, height: "calc(100vh - 160px)" }}>
      {/* ── Left rail: timeline ── */}
      <div
        style={{
          width: 260,
          flexShrink: 0,
          overflowY: "auto",
          borderRight: "1px solid var(--card-border)",
          paddingRight: 24,
        }}
      >
        <p className="eyebrow" style={{ marginBottom: 20 }}>
          版本历史
        </p>
        <div style={{ position: "relative", paddingLeft: 20 }}>
          {/* Vertical line */}
          <div
            style={{
              position: "absolute",
              left: 5,
              top: 8,
              bottom: 8,
              width: 1,
              background: "var(--card-border)",
            }}
          />

          {[...MOCK_VERSIONS].reverse().map((ver) => {
            const isSelected = ver.v === selectedVersion;
            const isCompare = ver.v === compareVersion;
            const isHead = ver.v === MOCK_VERSIONS.length;

            return (
              <div
                key={ver.v}
                onClick={() => setSelectedVersion(ver.v)}
                onContextMenu={(e) => handleContextMenu(e, ver.v)}
                style={{
                  position: "relative",
                  paddingLeft: 20,
                  paddingBottom: 24,
                  cursor: "pointer",
                  opacity: isSelected ? 1 : 0.65,
                  transition: "opacity 150ms",
                }}
              >
                {/* Dot */}
                <div
                  style={{
                    position: "absolute",
                    left: -1,
                    top: 5,
                    width: 12,
                    height: 12,
                    borderRadius: 9999,
                    border: `2px solid ${
                      isCompare
                        ? "var(--warning)"
                        : isSelected
                          ? "var(--accent)"
                          : "var(--card-border)"
                    }`,
                    background:
                      isSelected || isHead
                        ? isCompare
                          ? "var(--warning)"
                          : "var(--accent)"
                        : "var(--background)",
                    transition: "all 150ms",
                  }}
                />

                {/* Version label row */}
                <div
                  style={{
                    display: "flex",
                    alignItems: "baseline",
                    gap: 6,
                    marginBottom: 4,
                  }}
                >
                  <span
                    style={{
                      fontFamily: "var(--font-mono)",
                      fontSize: 12,
                      color: isSelected
                        ? "var(--foreground)"
                        : "var(--muted)",
                    }}
                  >
                    v{ver.v}
                  </span>
                  {isHead && (
                    <span
                      style={{
                        fontFamily: "var(--font-mono)",
                        fontSize: 9,
                        letterSpacing: "0.1em",
                        textTransform: "uppercase" as const,
                        color: "var(--accent)",
                        background: "var(--accent-soft)",
                        padding: "1px 6px",
                        borderRadius: 9999,
                      }}
                    >
                      HEAD
                    </span>
                  )}
                  <span
                    style={{
                      fontFamily: "var(--font-mono)",
                      fontSize: 10,
                      color: "var(--muted-soft)",
                    }}
                  >
                    {ver.ts} · 第{ver.turn}轮
                  </span>
                </div>

                {/* Delta */}
                <p
                  style={{
                    fontSize: 12,
                    color: "var(--muted-soft)",
                    margin: 0,
                    lineHeight: 1.5,
                  }}
                >
                  {ver.delta}
                </p>
              </div>
            );
          })}
        </div>
      </div>

      {/* ── Right pane: version detail ── */}
      <div
        style={{
          flex: 1,
          overflowY: "auto",
          paddingLeft: 32,
          display: "flex",
          flexDirection: "column",
          gap: 32,
        }}
      >
        {/* 1. Version number + confidence */}
        <div
          style={{
            display: "flex",
            alignItems: "baseline",
            gap: 12,
          }}
        >
          <h2
            style={{
              fontFamily: "var(--font-display)",
              fontSize: 28,
              fontWeight: 400,
              margin: 0,
            }}
          >
            v{current.v}
          </h2>
          <span
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: 12,
              color: "var(--muted-soft)",
            }}
          >
            置信度 {(current.confidence * 100).toFixed(0)}%
          </span>
        </div>

        {/* 2. Trigger line */}
        {current.after && (
          <p
            style={{
              fontFamily: "var(--font-display)",
              fontSize: 15,
              fontStyle: "italic",
              color: "var(--muted)",
              margin: 0,
              lineHeight: 1.6,
            }}
          >
            触发：第 {current.turn} 轮 —
            &ldquo;{current.after}&rdquo;
          </p>
        )}

        {/* 3. Changes in this version */}
        {current.changed.length > 0 && (
          <div>
            <p className="eyebrow" style={{ marginBottom: 12 }}>
              本版改动
            </p>
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: 12,
              }}
            >
              {current.changed.map((dim) => (
                <div
                  key={dim}
                  style={{
                    borderLeft: "2px solid var(--accent)",
                    paddingLeft: 16,
                  }}
                >
                  <p
                    style={{
                      fontFamily: "var(--font-display)",
                      fontSize: 17,
                      fontWeight: 400,
                      margin: "0 0 2px",
                    }}
                  >
                    {DIM_NAMES_ZH[dim]}
                  </p>
                  <span
                    style={{
                      fontFamily: "var(--font-mono)",
                      fontSize: 12,
                      color: "var(--muted-soft)",
                    }}
                  >
                    {dim}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* 4. Full model at this version */}
        <div>
          <p className="eyebrow" style={{ marginBottom: 12 }}>
            这一版的完整模型
          </p>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: 1,
              border: "1px solid var(--card-border)",
            }}
          >
            {dimSnapshots.map((dim) => {
              const isChangedThisVersion = current.changed.includes(
                dim.name
              );
              return (
                <div
                  key={dim.name}
                  style={{
                    padding: "12px 16px",
                    border: isChangedThisVersion
                      ? "1px solid var(--accent)"
                      : "1px solid var(--card-border)",
                    background: isChangedThisVersion
                      ? "var(--accent-soft)"
                      : "transparent",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "baseline",
                      marginBottom: 4,
                    }}
                  >
                    <span
                      style={{
                        fontFamily: "var(--font-display)",
                        fontSize: 13,
                        fontWeight: 400,
                      }}
                    >
                      {dim.name_zh}
                    </span>
                    <span
                      style={{
                        fontFamily: "var(--font-mono)",
                        fontSize: 10,
                        letterSpacing: "0.05em",
                        textTransform: "uppercase" as const,
                        color: "var(--muted-soft)",
                      }}
                    >
                      {dim.confidence}
                    </span>
                  </div>
                  <p
                    style={{
                      fontSize: 12,
                      color: "var(--muted)",
                      margin: 0,
                      lineHeight: 1.5,
                    }}
                  >
                    {dim.description.length > 60
                      ? dim.description.slice(0, 60) + "..."
                      : dim.description}
                  </p>
                </div>
              );
            })}
          </div>
        </div>

        {/* 5. Footer */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 12,
            paddingBottom: 32,
          }}
        >
          <button
            style={{
              fontSize: 13,
              fontWeight: 500,
              padding: "10px 24px",
              borderRadius: 9999,
              border: 0,
              cursor: "pointer",
              background: "var(--accent)",
              color: "#fff",
              transition: "opacity 200ms",
            }}
          >
            恢复到这一版
          </button>
          {onGoPredict && (
            <button
              onClick={() => onGoPredict(buildStubModel())}
              style={{
                fontSize: 13,
                padding: "9px 19px",
                borderRadius: 9999,
                border: "1px solid var(--card-border)",
                cursor: "pointer",
                background: "transparent",
                color: "var(--muted)",
                transition: "all 200ms",
              }}
            >
              用这一版出题
            </button>
          )}
          {compareVersion !== null && (
            <>
              <span
                style={{
                  fontFamily: "var(--font-mono)",
                  fontSize: 11,
                  color: "var(--muted-soft)",
                }}
              >
                对比 v{selectedVersion} 与 v{compareVersion}
              </span>
              <button
                onClick={() => setCompareVersion(null)}
                style={{
                  fontSize: 13,
                  padding: "9px 19px",
                  borderRadius: 9999,
                  border: "1px solid var(--card-border)",
                  cursor: "pointer",
                  background: "transparent",
                  color: "var(--muted)",
                  textDecoration: "underline",
                  textUnderlineOffset: 4,
                }}
              >
                取消对比
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
