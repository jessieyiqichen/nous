"use client";

import { useState, useCallback } from "react";

// ── Types ────────────────────────────────────────────────────

interface ReasoningStep {
  dimension: string;
  contribution: string;
  weight: "primary" | "secondary" | "minor";
}

interface ContextualFactors {
  caring_level: string;
  time_pressure: string;
  social_pressure: string;
}

interface Prediction {
  predicted_behavior: string;
  stated_vs_actual: string | null;
  confidence: "high" | "medium" | "low";
  reasoning_chain: ReasoningStep[];
  contextual_factors: ContextualFactors;
}

// ── Preset Scenarios ─────────────────────────────────────────

const PRESETS = [
  {
    label: "截止日期冲突",
    scenario: "你在截止日期前一天发现队友没完成他负责的部分，项目明天要交。你会怎么做？",
  },
  {
    label: "社交压力",
    scenario: "朋友反复邀请你参加一个你完全不感兴趣的聚会，已经拒绝两次了，第三次又来问。",
  },
  {
    label: "职业选择",
    scenario: "一个大厂给了你 offer，薪资很好但做的事情你觉得无聊。同时一个小团队做你非常感兴趣的方向，但薪资只有大厂的一半。",
  },
  {
    label: "技术争论",
    scenario: "在 code review 中，你的 senior 坚持一个你认为明显错误的技术方案。团队里其他人都没说话。",
  },
  {
    label: "疲惫状态",
    scenario: "连续加班一周后的周五晚上，你终于有空。但一个你很在意的朋友突然说想找你聊一些困扰。",
  },
  {
    label: "道德灰区",
    scenario: "你发现公司的一个内部工具有安全漏洞，报告了但上级说'先不管，下个季度再修'。你知道这个漏洞可能影响用户数据。",
  },
  {
    label: "沉没成本",
    scenario: "一个你投入了三个月的个人项目，做到一半发现核心假设可能是错的。继续做可能浪费时间，但已经投入了很多。",
  },
];

// ── Dimension name mapping ───────────────────────────────────

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

const WEIGHT_COLORS: Record<string, string> = {
  primary: "var(--accent)",
  secondary: "var(--muted)",
  minor: "var(--muted-soft)",
};

const WEIGHT_LABELS: Record<string, string> = {
  primary: "主要",
  secondary: "次要",
  minor: "微弱",
};

const CONFIDENCE_COLORS: Record<string, string> = {
  high: "var(--success)",
  medium: "var(--warning)",
  low: "var(--error)",
};

const CONTEXT_LABELS: Record<string, Record<string, string>> = {
  caring_level: { low: "低关注", medium: "中度关注", high: "高度关注" },
  time_pressure: { none: "无压力", low: "轻度", high: "紧迫" },
  social_pressure: { none: "无压力", low: "轻度", high: "显著" },
};

// ── Component ────────────────────────────────────────────────

export default function Playground() {
  const [scenario, setScenario] = useState("");
  const [loading, setLoading] = useState(false);
  const [prediction, setPrediction] = useState<Prediction | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [activeScenario, setActiveScenario] = useState<string | null>(null);

  const predict = useCallback(async (text: string) => {
    setLoading(true);
    setError(null);
    setPrediction(null);
    setActiveScenario(text);

    try {
      const res = await fetch("/api/playground", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scenario: text }),
      });
      const data = await res.json();
      if (!res.ok || data.error) {
        setError(data.error || "请求失败");
        return;
      }
      setPrediction(data.prediction);
    } catch {
      setError("网络错误，请重试");
    } finally {
      setLoading(false);
    }
  }, []);

  const handleSubmit = useCallback(() => {
    if (scenario.trim().length >= 5) {
      predict(scenario.trim());
    }
  }, [scenario, predict]);

  const handlePreset = useCallback((text: string) => {
    setScenario(text);
    predict(text);
  }, [predict]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 32 }}>
      {/* Header */}
      <div>
        <p className="eyebrow" style={{ marginBottom: 8 }}>Prediction Playground</p>
        <h2 style={{ fontFamily: "var(--font-display)", fontSize: 28, fontWeight: 400, margin: "0 0 8px" }}>
          输入场景，预测行为
        </h2>
        <p style={{ fontSize: 14, color: "var(--muted)", lineHeight: 1.65, margin: 0 }}>
          基于 9 维认知模型，预测这个人在任意场景下会怎么做——不是他说他会怎么做，而是他实际会怎么做。
        </p>
      </div>

      {/* Input */}
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <textarea
          value={scenario}
          onChange={(e) => setScenario(e.target.value)}
          placeholder="描述一个场景... 例如：团队里有人提出了一个你觉得有问题的方案，但大家都在点头"
          style={{
            fontFamily: "var(--font-sans)",
            fontSize: 14,
            lineHeight: 1.65,
            padding: "14px 18px",
            border: "1px solid var(--card-border)",
            background: "var(--card)",
            color: "var(--foreground)",
            borderRadius: 0,
            resize: "vertical",
            minHeight: 80,
            outline: "none",
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
              e.preventDefault();
              handleSubmit();
            }
          }}
        />
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span style={{ fontSize: 11, color: "var(--muted-soft)" }}>
            ⌘+Enter 发送
          </span>
          <button
            onClick={handleSubmit}
            disabled={loading || scenario.trim().length < 5}
            style={{
              fontFamily: "inherit",
              fontSize: 13,
              padding: "8px 20px",
              border: "1px solid var(--accent)",
              background: loading ? "transparent" : "var(--accent)",
              color: loading ? "var(--accent)" : "#fff",
              cursor: loading ? "wait" : "pointer",
              borderRadius: 0,
              opacity: scenario.trim().length < 5 ? 0.4 : 1,
            }}
          >
            {loading ? "预测中..." : "Predict"}
          </button>
        </div>
      </div>

      {/* Presets */}
      <div>
        <p className="eyebrow" style={{ marginBottom: 12 }}>示例场景</p>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          {PRESETS.map((p) => (
            <button
              key={p.label}
              onClick={() => handlePreset(p.scenario)}
              disabled={loading}
              style={{
                fontFamily: "inherit",
                fontSize: 12,
                padding: "6px 14px",
                border: "1px solid var(--card-border)",
                background: activeScenario === p.scenario ? "var(--accent-soft)" : "transparent",
                color: activeScenario === p.scenario ? "var(--accent)" : "var(--muted)",
                cursor: loading ? "wait" : "pointer",
                borderRadius: 9999,
              }}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {/* Loading */}
      {loading && (
        <div style={{ display: "flex", alignItems: "center", gap: 16, padding: "24px 0" }}>
          <div
            style={{
              width: 24, height: 24,
              border: "1.5px solid var(--accent)",
              borderTopColor: "transparent",
              borderRadius: 9999,
            }}
            className="animate-spin"
          />
          <p style={{ fontFamily: "var(--font-display)", fontSize: 15, fontWeight: 400, fontStyle: "italic", color: "var(--muted)", margin: 0 }}>
            正在分析认知模型并生成预测...
          </p>
        </div>
      )}

      {/* Error */}
      {error && (
        <div style={{ padding: "12px 16px", border: "1px solid var(--error)", background: "rgba(168, 69, 58, 0.06)" }}>
          <p style={{ fontSize: 13, color: "var(--error)", margin: 0 }}>{error}</p>
        </div>
      )}

      {/* Result */}
      {prediction && !loading && (
        <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
          {/* Scenario echo */}
          {activeScenario && (
            <div style={{ borderLeft: "2px solid var(--card-border)", paddingLeft: 20 }}>
              <p style={{ fontSize: 13, color: "var(--muted)", lineHeight: 1.65, margin: 0 }}>
                {activeScenario}
              </p>
            </div>
          )}

          {/* Predicted behavior */}
          <div style={{ border: "1px solid var(--card-border)", padding: "20px 24px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 12 }}>
              <p className="eyebrow">预测行为</p>
              <span style={{
                fontFamily: "var(--font-mono)",
                fontSize: 10,
                letterSpacing: "0.05em",
                textTransform: "uppercase" as const,
                color: CONFIDENCE_COLORS[prediction.confidence],
              }}>
                {prediction.confidence} confidence
              </span>
            </div>
            <p style={{ fontFamily: "var(--font-display)", fontSize: 17, fontWeight: 400, lineHeight: 1.65, margin: 0, color: "var(--foreground)" }}>
              {prediction.predicted_behavior}
            </p>
          </div>

          {/* Stated vs actual gap */}
          {prediction.stated_vs_actual && (
            <div style={{ borderLeft: "2px solid var(--accent)", paddingLeft: 20 }}>
              <p className="eyebrow" style={{ marginBottom: 4 }}>说的 vs 做的</p>
              <p style={{ fontFamily: "var(--font-display)", fontSize: 15, fontWeight: 400, fontStyle: "italic", lineHeight: 1.65, margin: 0, color: "var(--muted)" }}>
                {prediction.stated_vs_actual}
              </p>
            </div>
          )}

          {/* Contextual factors */}
          <div style={{ display: "flex", gap: 16 }}>
            {(["caring_level", "time_pressure", "social_pressure"] as const).map((key) => {
              const val = prediction.contextual_factors[key];
              return (
                <div key={key} style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <span style={{ fontSize: 11, color: "var(--muted-soft)" }}>
                    {key === "caring_level" ? "关注度" : key === "time_pressure" ? "时间压力" : "社交压力"}
                  </span>
                  <span style={{
                    fontFamily: "var(--font-mono)",
                    fontSize: 10,
                    padding: "2px 8px",
                    border: "1px solid var(--card-border)",
                    color: "var(--foreground)",
                  }}>
                    {CONTEXT_LABELS[key]?.[val] || val}
                  </span>
                </div>
              );
            })}
          </div>

          {/* Reasoning chain */}
          <div>
            <p className="eyebrow" style={{ marginBottom: 12 }}>推理链</p>
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {prediction.reasoning_chain.map((step, i) => (
                <div
                  key={i}
                  style={{
                    display: "flex",
                    gap: 16,
                    padding: "12px 16px",
                    borderLeft: `2px solid ${WEIGHT_COLORS[step.weight]}`,
                  }}
                >
                  <div style={{ flexShrink: 0, minWidth: 100 }}>
                    <p style={{ fontSize: 13, fontWeight: 500, margin: "0 0 2px", color: WEIGHT_COLORS[step.weight] }}>
                      {DIM_NAMES_ZH[step.dimension] || step.dimension}
                    </p>
                    <span style={{
                      fontFamily: "var(--font-mono)",
                      fontSize: 9,
                      letterSpacing: "0.05em",
                      textTransform: "uppercase" as const,
                      color: "var(--muted-soft)",
                    }}>
                      {WEIGHT_LABELS[step.weight]}
                    </span>
                  </div>
                  <p style={{ fontSize: 13, color: "var(--muted)", lineHeight: 1.65, margin: 0, flex: 1 }}>
                    {step.contribution}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
