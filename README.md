# Nous

**别人的 bot 学你怎么说话，它学你怎么做决定。**
Cognitive-layer AI twin: not mimicking how you talk, but understanding how you think — and telling you when your reply won't match what you'll actually do.

Nous 是一个自托管的「认知分身」：先用一场 12 轮左右的对话给你建一个九维认知模型，然后住进你的聊天软件里帮你回消息——判断这条值不值得回、用你的口吻拟一稿、并在你嘴上会答应但按记录做不到的时候拦一下。你改一改发出去，它就学。

> 仓库里所有示例数据（`data/samples/`、`web/data/`）都是**虚构人物**，不对应任何真实个体。你的模型只会存在你自己的服务器上。

## 它长什么样

```
  飞书 bot ─────────▶ ┌────────────────────────────┐ ◀───────── Mac 菜单栏助手
  转发消息给它，         │  服务端大脑（你的机器）        │   微信/飞书里连按两次 ⌘C，
  回你 判断+草稿+质检     │  · 九维认知模型（每用户）      │   悬浮卡给草稿，一键填入输入框，
                        │  · 风格卡 + 最近改写对 few-shot │   你改完发送 = 自动学习
  网页 /agent ────────▶ │  · SQLite 单文件存所有反馈      │
  离线演示 + 自定义消息   └────────────────────────────┘
```

每条来消息固定输出四件：

| 字段 | 含义 |
|---|---|
| `triage` | 代回 / 亲自回 / 缓回 / 不回（默认代回，漏回代价高于多拟一稿） |
| `draft` | 用你的口吻拟的回复 |
| `gap_note` | **执行质检**：你「会说」的和记录里「会做」的有差距时提醒，草稿会把承诺压到你真会做的量 |
| `grounding` | 依据的模型维度（只进详情页） |

`gap_note` 是核心：研究阶段它叫「矛盾检出」（stated vs behavioral），产品阶段它变成在你发出一句做不到的承诺之前拦一下。

## 快速开始（自托管）

### 1. 网页：访谈 → 建模 → 试用

```bash
cd web && cp .env.example .env.local   # 填 DEEPSEEK_API_KEY
npm install && npm run dev             # http://localhost:3999
```

默认模型是 DeepSeek（OpenAI 兼容，`DEEPSEEK_BASE_URL` / `DEEPSEEK_MODEL` 可换任何兼容接口）。

### 2. 飞书 bot（推荐第一个真实入口）

按 [docs/feishu-bot-setup.md](docs/feishu-bot-setup.md) 建自建应用、配 webhook。新用户在飞书里对 bot 说「开始访谈」，8～12 轮后自动建模并切到代理模式；之后转发消息给它即可。说「不对，改成 xxx」它会记住。

服务端持久化：设 `TWIN_DB_PATH=/path/nous.db` 用内建 SQLite（Node ≥ 22.5）；不设则用 Supabase（`supabase/schema.sql`）。部署脚本 `web/scripts/deploy-aliyun.sh`（读 `NOUS_SERVER` / `NOUS_PUBLIC_BASE`，可写在仓库根 `.ops.env`）。

### 3. Mac 菜单栏助手（微信也能用）

```bash
cd mac/NousHelper && ./install.sh      # 打成 /Applications/NousHelper.app，需授权「辅助功能」
defaults write com.nous.helper serverBaseURL https://your-server/nous
defaults write com.nous.helper twinUserId  <你的用户 id>
```

选中一条消息连按两次 ⌘C → 悬浮卡 → 「填入输入框」→ 改完回车。助手会对比你实际发出的和草稿，自动上报采纳/改写。详见 [mac/NousHelper/README.md](mac/NousHelper/README.md)。

### 4. 把自己的模型灌进去（跳过访谈）

```bash
cd web && node scripts/build-style-card.mjs ~/我的聊天记录.md          # 可选：从真实文字提炼风格卡
node scripts/seed-twin-user.mjs <userId> --dir ../data/subjects/me   # 目录含 cognitive_model.json
```

自己的数据放 `data/subjects/<name>/`（整目录 gitignored）。构建时 `NOUS_SUBJECT_DIR=data/subjects/me npm run build` 可把它打进网页演示；不设则用虚构示例人物。

## 学习系统

| 层 | 喂什么 | 生效时间 |
|---|---|---|
| 风格卡 | 你的真实文字 → 语气/句式/口头禅/原句样例 | 建模当天 |
| 改写对 | 你改了草稿再发 → 「来消息 / 分身草稿 / 你实际发的」三元组 → 最近 8 条 few-shot | 下一条消息 |
| 慢环 | 攒 ≥ 20 条改写 → 重建九维模型 + 给你一份差异摘要 | 周级（管线在 `core/`，手动跑） |

反馈进料口有两个：bot 里的显式修正（「不对 / 改成 / 我会说」），以及 Mac 端的零摩擦捕获（填入后盯住输入框，发送瞬间对比）。

## 研究地基（2026-03 ～ 07）

产品建在一个先验证过的方法论上：

- **九维认知模型**：Decision Architecture、Attention Allocation、Reasoning Style、Emotional Processing、Social Cognition、Blind Spots、Value Hierarchy、Response to Uncertainty、Execution-Layer Flexibility（[research/theoretical-foundations.md](research/theoretical-foundations.md)）
- **矛盾检出**：双轨信号分析，「说的」vs「做的」不一致处即客观盲区证据（[research/cognitive-signal-taxonomy.md](research/cognitive-signal-taxonomy.md)、[research/bias-taxonomy.md](research/bias-taxonomy.md)）
- **确定性验证**：行为预测选对 1.0 选错 0.0，不让 LLM 自评（LLM 自评 71% → 确定性评分 26%，自评不可信）
- 单被试数据：模型理解准确度 99%，行为预测 T1/T2 各 71%（随机基线 25%）；首个陌生被试单场访谈约 61%
- 被动采集 + DistilBERT 信号分类器（`scripts/passive_collector.py`、`ml/`）

诚实边界：方法论在 n=1 上验证，泛化未经规模检验；triage 准确率尚无正式测量；Mac 助手仅 macOS。

## 目录

```
core/        Python：访谈 / 预测 / 信号提取 CLI（--subject 或 NOUS_SUBJECT 指定被试目录）
web/         Next.js：网页 + 全部 API（lib/twin.ts 是三端共用的大脑，lib/twin-agent.ts 是 bot 三态入口）
mac/         Swift：NousHelper 菜单栏助手
bots/        飞书长连接客户端（webhook 的备用路径）
data/samples 虚构示例人物：模型 / 风格卡 / 矛盾
research/    方法论与研究文档
ml/          DistilBERT 认知信号分类器
```

## 隐私

- 消息只发往你自己配置的服务端；Mac 端启发式过滤（无中文且无空格、疑似密钥的文本不发），菜单栏一键暂停。
- 个人数据目录 `data/subjects/` 与所有 `.env*`、`.ops.env` 均不入库。推送前可跑 `scripts/oss-precheck.sh` 自检；`scripts/oss-export.sh` 生成一份剔除个人材料的干净副本。

## License

MIT
