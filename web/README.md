# web/

Nous 的网页与全部服务端 API（Next.js 16，Node runtime）。总说明见仓库根 [README.md](../README.md)。

```bash
cp .env.example .env.local   # 至少填 DEEPSEEK_API_KEY
npm install && npm run dev   # http://localhost:3999
npm run build                # prebuild 会把 NOUS_SUBJECT_DIR（默认 ../data/samples）打包进 data/
```

- `lib/twin.ts`：消息分析核心（triage / draft / gap_note），网页、飞书 bot、Mac 助手共用
- `lib/twin-agent.ts`：bot 三态入口（介绍 → 访谈 → 代理），含显式修正识别
- `lib/twin-store.ts`：每用户存储，`TWIN_DB_PATH` 设了走 SQLite，否则 Supabase
- `app/api/feishu/webhook`：飞书事件入口；`app/api/twin/*`：分析 / 建模 / 反馈
- `scripts/`：风格卡提炼、灌模型、部署、快照预构建
