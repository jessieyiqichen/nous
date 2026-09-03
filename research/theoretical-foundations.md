# Nous 理论基础

> 本文档梳理 Nous 项目每个核心设计决策的学术根源。
> 用途：课程项目 related work / 投实习时展示理论深度 / 自己学习参考

---

## 核心命题

**AI 建了一个关于你的模型，但没有机制检测这个模型哪里是错的。**

现有系统优化的是"看起来准"（用户满意度、使用率），Nous 优化的是"知道自己哪里不准"（矛盾检出、预测验证）。

---

## 一、9 个认知维度的理论来源

### 1. Decision Architecture — 双系统理论
- **Kahneman (2011)** *Thinking, Fast and Slow*
- 系统1（快、自动、直觉）vs 系统2（慢、刻意、分析）
- Nous 的发现：用户不是纯系统1或系统2，而是"直觉先行、分析跟上验证"——一种混合模式

### 2. Attention Allocation — 注意力过滤
- **Broadbent (1958)** 注意力过滤模型：人不能平等处理所有信息，有选择性过滤
- **Treisman (1964)** 衰减理论：未被注意的信息不是被完全阻断，而是被衰减
- Nous 的"在乎驱动"就是一种注意力分配策略——在乎的事全速处理，不在乎的衰减到最低

### 3. Reasoning Style — 算法层与反省层
- **Stanovich (2011)** *Rationality and the Reflective Mind*
- 区分算法层（能不能推理）和反省层（会不会主动启动推理）
- Nous 检测的不只是推理能力，更是推理倾向——什么时候主动思考，什么时候用默认模式

### 4. Emotional Processing — 躯体标记假说
- **Damasio (1994)** *Descartes' Error*
- 情绪不是理性的敌人，是决策的输入信号。没有情绪参与的决策反而更差
- Nous 的发现：用户的情感层被分析层遮蔽（emotion_leak 信号）——不是没有情绪，是情绪被认知过滤了

### 5. Social Cognition — 心智理论
- **Premack & Woodruff (1978)** Theory of Mind
- 理解他人意图、信念、情绪状态的能力
- Nous 检测用户如何建模他人：是分析型（推理对方动机）还是共情型（感受对方情绪）

### 6. Blind Spots — 内省错觉
- **Pronin (2007)** The Introspection Illusion
- 人相信自己的内省是准确的，但系统性地看不到自己的偏差
- 这是 T3 自评失败的理论解释：让人评价自己的盲区就像让盲人描述颜色
- Nous 用矛盾检出替代自评——客观证据 > 主观判断

### 7. Value Hierarchy — 显示性偏好
- **Samuelson (1938)** Revealed Preference Theory
- **Schwartz (1992)** 价值观理论（10 类基本价值）
- 不问"你看重什么"，观察"你实际选择了什么"
- Nous 的 stated vs behavioral 双轨分析就是显示性偏好的实现

### 8. Response to Uncertainty — 模糊容忍
- **Budner (1962)** 模糊容忍度量表
- **Ellsberg (1961)** Ellsberg 悖论——人对模糊的厌恶程度不同
- Nous 检测用户面对不确定性时的策略：建框架？收集更多数据？直接行动？回避？

### 9. Execution-Layer Flexibility — 自我损耗
- **Baumeister (2007)** 自我损耗理论——意志力是有限资源
- 压力/疲劳下人回退到默认模式
- Nous 的"双系统架构"发现：系统1（在乎驱动）+ 系统2（独立质量门槛）——是自我调节理论的变体

---

## 二、矛盾检出的理论基础

### Stated vs Revealed Preference
- **Samuelson (1938)**：不听人说什么，看人做什么
- 人说"我注重健康"但每天吃外卖 → revealed preference 是便利 > 健康
- Nous 的信号提取器自动比对两条轨道

### 认知失调理论
- **Festinger (1957)**：行为和信念不一致时，人会事后编造理由让它们一致
- Nous 检出的 rationalization 信号就是认知失调的直接证据

### 偏好反转
- **Lichtenstein & Slovic (1971)**：人在选择和定价同一组赌注时给出矛盾答案
- 不是不诚实，是不同提问方式激活不同认知过程
- 解释了 MCQ 准确率波动——人本身就不一致，不是模型不准

---

## 三、15 类认知信号的学术根源

### 行为信号（7 类）— 对话分析

| 信号 | 理论来源 | 关键文献 |
|------|---------|---------|
| pushback / acceptance | 偏好结构理论 | Pomerantz (1984) |
| avoidance / deflection | 对话修复机制 | Schegloff (1992) |
| inquiry / elaboration | 叙事分析 + 加工深度 | Labov (1972), Craik & Lockhart (1972) |
| emotion_leak | 微表情的文本对应物 | Ekman (1969) |
| value_reveal / decision | 显示性偏好 | Samuelson (1938) |

### 认知过程信号（4 类）— 元认知研究

| 信号 | 理论来源 | 关键文献 |
|------|---------|---------|
| self_correction | 元认知监控与控制 | Nelson & Narens (1990) |
| hedge | 模糊限制语 | Lakoff (1973) |
| elaboration | 加工深度理论 | Craik & Lockhart (1972) |
| deflection | 面子理论 | Goffman (1959) |

### 认知偏差信号（4 类）— 判断与决策

| 信号 | 理论来源 | 关键文献 |
|------|---------|---------|
| anchoring | 锚定效应 | Tversky & Kahneman (1974) |
| confirmation_seeking | 确认偏差 | Wason (1960) |
| rationalization | 认知失调 | Festinger (1957) |
| overconfidence | 过度自信 | Fischhoff, Slovic & Lichtenstein (1977) |

---

## 四、用户建模的三种 LLM 范式

来源：[LLM-UM-Reading 综述](https://github.com/TamSiuhin/LLM-UM-Reading)

| 范式 | 做法 | Nous 对应 |
|------|------|----------|
| Predictor | LLM 直接预测行为 | predictor.py |
| Enhancer | LLM 生成画像喂给下游模型 | 对话→认知模型 JSON→预测 |
| Controller | LLM 主动交互收集信息 | interview.py |

Nous 同时用了三种范式。学术上少见。

---

## 五、Nous 的原创贡献

以下是 Nous 中**没有直接对应文献**的部分：

1. **矛盾检出作为模型验证机制** — 学术界验证用户模型靠 A/B 测试和满意度调查。Nous 用 stated vs behavioral 矛盾作为客观验证指标。

2. **确定性评分暴露 LLM 评分虚分** — 发现 LLM 给自己的预测评分时系统性偏高（71% → 26%），因为 LLM 对自己的输出天然宽容。

3. **盲区维度不可自评** — T3 自评越修越差（49%→33%），理论上对应 Pronin 的内省错觉，但实证验证是原创的。

4. **混合信号提取** — 高频信号用本地小模型（免费快速），低频信号 fallback 到 API。兼顾成本和覆盖率。

5. **被动采集飞轮** — 从日常 AI 对话中自动提取认知信号，用户不需要额外操作。

---

## 六、推荐阅读（按优先级）

### 必读
- Kahneman (2011) *Thinking, Fast and Slow* — 双系统理论
- Ariely (2008) *Predictably Irrational* — 可预测的非理性
- Pronin (2007) "The Introspection Illusion" — 内省错觉

### 深入
- Damasio (1994) *Descartes' Error* — 情绪与决策
- Stanovich (2011) *Rationality and the Reflective Mind* — 反省层
- Festinger (1957) *A Theory of Cognitive Dissonance* — 认知失调

### 前沿
- TalkTuner (2024) — LLM 隐式用户建模
- Socrates (EMNLP 2025) — 个人数据微调行为预测
- PersonaLLM (Nature MI 2025) — LLM 人格测量
- Cognitive Digital Twin 综述 (2025) — 4 代框架
