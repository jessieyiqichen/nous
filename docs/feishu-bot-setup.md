# 飞书分身 Bot 接入手册

服务端已就绪（`web/app/api/feishu/webhook`）。走完下面的步骤，你就有一个真实可用的认知分身 bot：把任何平台收到的消息转发给它，它按你的认知模型回你 triage + 草稿 + 执行质检。

## 前置（一次性）

1. **DeepSeek key**：platform.deepseek.com 注册充值 → `DEEPSEEK_API_KEY` 写入 `web/.env.local` 和 Vercel 环境变量
2. **Vercel 手动部署一次**（自动部署仍是坏的），记下线上域名 `https://<your-app>.vercel.app`

## 飞书侧配置（约 15 分钟）

1. **建租户**：用个人手机号注册飞书，创建一个自己的团队（免费）
2. **建应用**：open.feishu.cn/app → 创建企业自建应用，名字如「Nous 分身」
3. **开 bot**：应用后台 →「添加应用能力」→ 机器人
4. **加权限**：「权限管理」→ 开通 `im:message`（获取与发送单聊、群组消息）相关权限，按后台提示批量开通即可
5. **拿凭证**：「凭证与基础信息」页复制 App ID / App Secret；「事件与回调」页设置或复制 Verification Token（Encrypt Key 可留空，配了就同步写环境变量）
6. **配环境变量**（`web/.env.local` + Vercel 两边都要）：

```
FEISHU_APP_ID=cli_xxx
FEISHU_APP_SECRET=xxx
FEISHU_VERIFICATION_TOKEN=xxx
# 可选，事件订阅开了加密才需要：
# FEISHU_ENCRYPT_KEY=xxx
```

7. **订阅事件**：「事件与回调」→ 订阅方式选「将事件发送至开发者服务器」，请求地址填
   `https://<your-app>.vercel.app/api/feishu/webhook`
   （保存时飞书会发验证请求，环境变量已配好才能通过）→ 添加事件 `im.message.receive_v1`（接收消息）
8. **发版**：「版本管理与发布」→ 创建版本 → 发布（自建应用自己审核通过即可）
9. **开聊**：飞书里搜这个 bot 发起单聊

## 用法

- 直接把收到的消息粘贴/转发给 bot
- 可加关系前缀精确 triage：`上级：这周末有空吗？帮忙整理下数据`
  （支持：同事 / 朋友 / 在意的人 / 家人 / 上级 / 客户 / 陌生人；不标默认普通朋友）
- 发 `帮助` 查看用法

## 已知边界（v1）

- 单条消息分析，暂无跨消息上下文（`/api/twin` 已支持 history，bot 侧接 Supabase 存会话是下一步）
- 只处理文本消息
- 飞书要求 3 秒内响应：webhook 秒回 200，分析结果在几秒后作为新消息发来（Vercel `after()` 异步）

## 本地调试

```bash
cd web && npm run dev
# URL 验证握手：
curl -s -X POST localhost:3999/api/feishu/webhook -H 'content-type: application/json' \
  -d '{"type":"url_verification","challenge":"test123","token":"<你的verification token>"}'
# 应返回 {"challenge":"test123"}
```

线上联调可用 `vercel logs` 或飞书后台「事件与回调 → 事件发送记录」排查。
