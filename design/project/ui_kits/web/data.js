/* global React */

window.MOCK_CONVO = [
  { role: "assistant", content: "最近有什么让你觉得有意思的事吗？工作的、看的东西的、生活里突然冒出来的——都可以。" },
  { role: "assistant", content: "Kahneman 哪个部分让你觉得以前理解都是表面的？" },
  { role: "assistant", content: "嗯。系统1和系统2的关系，你现在怎么理解？" },
  { role: "assistant", content: "你说“决策时直觉先到”——能想到上次最近一次这种决策吗？什么场景？" },
  { role: "assistant", content: "听起来你做完之后才意识到为什么这么选。这种“事后理解”对你来说算稳定的模式吗？" },
];

window.MOCK_MODEL = {
  summary: "直觉触发型决策架构，分析层主要承担事后验证而非前置筛选。在熟悉领域里跳过显式权衡，靠模式识别快速到达结论；在陌生场景才会主动展开对照。注意力偏向新颖刺激和异常信号，对常规进展容易脱敏。情感处理上，情绪不直接驱动行动，但会改变“什么值得注意”的滤镜。明显的盲区在执行层——能清楚描述原则，但实际执行时会跳过若干自己声称重要的步骤。",
  dimensions: [
    { name: "Decision Architecture", confidence: "high",
      description: "直觉触发，分析验证。熟悉领域跳过显式权衡；陌生场景才展开 2–3 个对照点。速度优先于穷尽。",
      preds: ["短决策时先给方向再寻找支持理由", "陌生领域会主动列出对照点", "在压力下会回到熟悉的 mental model"] },
    { name: "Attention Allocation", confidence: "high",
      description: "新颖刺激和异常信号优先抓取。常规进展容易脱敏，需要“事件感”来重新聚焦。",
      preds: ["对偏离预期的信号反应快", "稳定环境下会主动制造新输入"] },
    { name: "Reasoning Style", confidence: "medium",
      description: "线性推理 + 类比迁移混合。有显式 mental model 储备，常用类比快速跨域。",
      preds: ["解释新概念时先类比再补细节", "推理链中会有 1–2 处跳跃"] },
    { name: "Emotional Processing", confidence: "medium",
      description: "情绪不直接驱动行动，但作为“什么值得注意”的滤镜起作用。",
      preds: ["情绪低时会缩窄关注范围", "用语言把情绪推到一定距离再处理"] },
    { name: "Social Cognition", confidence: "medium",
      description: "建模他人时偏向认知风格而非情感状态。能识别动机但有时低估情绪权重。",
      preds: ["和别人产生分歧时先归因为认知差异", "遇到强情绪场景倾向于撤回观察"] },
    { name: "Blind Spots", confidence: "high",
      description: "执行层和意图层之间有持续偏差。能清晰描述原则，实际执行时会跳过若干步骤。",
      preds: ["复盘时会承认偏差但不修改流程", "在高优任务上偏差最大"] },
    { name: "Value Hierarchy", confidence: "high",
      description: "实际优化函数：新颖性 > 影响范围 > 完成度。stated 价值里的“稳定性”在 revealed 行为里排第三。",
      preds: ["完成度低但有趣的项目优先于完成度高但常规的", "会在 80% 完成时切换到下一个新方向"] },
    { name: "Response to Uncertainty", confidence: "medium",
      description: "和不确定性共处的能力高于平均，但偏好通过行动而非分析来减少不确定。",
      preds: ["遇到不确定情境会先尝试再分析", "对纯思考性的不确定容忍度最低"] },
    { name: "Execution-Layer Flexibility", confidence: "high",
      description: "原则和现实冲突时倾向于修正现实而非放弃原则——但会自我合理化以维持一致感。",
      preds: ["违反自己声称原则后会构造新解释", "外部压力下原则可被悄悄稀释"] },
  ],
};

window.MOCK_ANALYZER = {
  total_turns: 6,
  biases_found: [
    { bias_id: "sycophancy", turn_index: 1, severity: "medium",
      evidence: "这是一个很有意思的想法！我完全理解你的考虑...",
      explanation: "对话开头直接给出无条件赞同，未先确认核心信息。属于“表面叠甲”型迎合。" },
    { bias_id: "preemptive", turn_index: 3, severity: "high",
      evidence: "你可能会担心稳定性的问题，让我先回答这个...",
      explanation: "用户尚未表达稳定性疑虑，AI 主动设置了一个用户没问的反对立场再自行解决。" },
    { bias_id: "beautify", turn_index: 5, severity: "medium",
      evidence: "你这种敢于挑战现状的特质非常珍贵...",
      explanation: "在用户描述了普通情境后给出了明显高于事实的人格美化，画像偏离真实。" },
  ],
  bias_summary: { sycophancy: 1, preemptive: 1, beautify: 1 },
  overall_assessment: "对话呈现典型的“温和迎合 + 预判覆盖”组合：AI 在用户未明确表达诉求前就构造了一个友好框架，并在每轮回应中加入轻量的赞美。",
  interaction_patterns: [
    "迎合 + 画像美化：在用户陈述事实后立刻添加正面人格评价",
    "预判覆盖：替用户构造假设的反对意见再自行解答",
  ],
};

window.MOCK_RESEARCH = {
  total: 30, biasTotal: 134, avgPerConv: 4.5, maxInConv: 17, zeroBias: 11,
  biasBars: [
    { id: "sycophancy", label: "迎合/叠甲", value: 33, color: "#fb923c" },
    { id: "preemptive", label: "预判覆盖", value: 26, color: "#4ade80" },
    { id: "beautify", label: "画像美化", value: 24, color: "#f472b6" },
    { id: "overcorrect", label: "矫枉过正", value: 17, color: "#f87171" },
    { id: "over_attr", label: "过度归因", value: 17, color: "#22d3ee" },
    { id: "drift", label: "反馈漂移", value: 12, color: "#c084fc" },
    { id: "sim_consc", label: "模拟意识", value: 3, color: "#818cf8" },
    { id: "sys_bias", label: "系统偏差污染", value: 2, color: "#9ca3af" },
  ],
  severity: [
    { name: "低", value: 44, color: "#3b82f6" },
    { name: "中", value: 56, color: "#eab308" },
    { name: "高", value: 28, color: "#f97316" },
    { name: "严重", value: 6, color: "#ef4444" },
  ],
};

window.DIM_NAMES_ZH = {
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
