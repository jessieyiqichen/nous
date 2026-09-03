/**
 * 飞书分身 bot——长连接模式（WebSocket）薄客户端。
 *
 * 只做三件事：收事件 → POST /api/twin/handle（服务端决定访谈/建模/代理）→ 回消息。
 * 主动连到飞书接收事件，不需要公网 URL，绕开 webhook 3 秒超时问题。
 *
 * 配置（读 ../../web/.env.local，或本目录 .env 覆盖）：
 *   FEISHU_APP_ID / FEISHU_APP_SECRET   必填
 *   TWIN_BASE_URL                        默认 http://localhost:3999
 *   TWIN_FEEDBACK_KEY                    服务端配了就要带上
 *
 * 运行：node index.js
 * 前提：飞书后台「事件与回调」订阅方式选「使用长连接接收事件」，已添加事件 im.message.receive_v1。
 */

const path = require("path");
const Lark = require("@larksuiteoapi/node-sdk");
require("dotenv").config({ path: path.join(__dirname, "../../web/.env.local") });
require("dotenv").config({ path: path.join(__dirname, ".env"), override: true });

const APP_ID = process.env.FEISHU_APP_ID;
const APP_SECRET = process.env.FEISHU_APP_SECRET;
const TWIN_BASE_URL = process.env.TWIN_BASE_URL || "http://localhost:3999";
const FEEDBACK_KEY = process.env.TWIN_FEEDBACK_KEY;

if (!APP_ID || !APP_SECRET) {
  console.error("缺少 FEISHU_APP_ID / FEISHU_APP_SECRET（web/.env.local）");
  process.exit(1);
}

const client = new Lark.Client({ appId: APP_ID, appSecret: APP_SECRET });

async function sendText(chatId, text) {
  await client.im.message.create({
    params: { receive_id_type: "chat_id" },
    data: { receive_id: chatId, msg_type: "text", content: JSON.stringify({ text }) },
  });
}

async function handle(userId, text) {
  const res = await fetch(`${TWIN_BASE_URL}/api/twin/handle`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ userId, text, ...(FEEDBACK_KEY ? { key: FEEDBACK_KEY } : {}) }),
  });
  const data = await res.json();
  if (!res.ok || typeof data.reply !== "string") throw new Error(data.error || `分身服务 HTTP ${res.status}`);
  return data.reply;
}

// 事件去重（长连接偶发重投）
const seenEvents = new Map();
function isDuplicate(eventId) {
  if (!eventId) return false;
  const now = Date.now();
  for (const [k, t] of seenEvents) if (now - t > 10 * 60 * 1000) seenEvents.delete(k);
  if (seenEvents.has(eventId)) return true;
  seenEvents.set(eventId, now);
  return false;
}

const eventDispatcher = new Lark.EventDispatcher({}).register({
  "im.message.receive_v1": async (data) => {
    const eventId = data?.event_id || data?.header?.event_id;
    if (isDuplicate(eventId)) return;
    const message = data?.message;
    const openId = data?.sender?.sender_id?.open_id;
    if (!message?.chat_id || !openId) return;
    const chatId = message.chat_id;

    try {
      if (message.message_type !== "text") {
        await sendText(chatId, "暂时只能处理文本消息。");
        return;
      }
      let text = "";
      try {
        text = (JSON.parse(message.content).text || "").trim();
      } catch { /* 空串交给服务端返回引导 */ }

      console.log(`[收到] ${openId} · ${text.slice(0, 50)}${text.length > 50 ? "…" : ""}`);
      const reply = await handle(openId, text);
      await sendText(chatId, reply);
      console.log(`[回复] ${openId} · ${reply.slice(0, 30).replace(/\n/g, " ")}…`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "分身服务异常";
      console.error("[处理失败]", msg);
      try {
        await sendText(chatId, `处理失败：${msg}`);
      } catch { /* 回复也失败时只留日志 */ }
    }
  },
});

const wsClient = new Lark.WSClient({ appId: APP_ID, appSecret: APP_SECRET, loggerLevel: Lark.LoggerLevel.info });
wsClient.start({ eventDispatcher });
console.log(`飞书分身 bot（长连接）已启动，分身服务：${TWIN_BASE_URL}`);
