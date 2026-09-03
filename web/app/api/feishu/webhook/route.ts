import { NextRequest } from "next/server";
import { after } from "next/server";
import { decryptEvent, feishuConfigured, sendText, verifyToken } from "@/lib/feishu";
import { handleUserMessage } from "@/lib/twin-agent";

// 飞书要求 3 秒内响应，否则重试；分析走 after() 在响应后异步执行。
// maxDuration 保证 after 回调有足够时间跑完 DeepSeek 调用。
// 三态逻辑（访谈/建模/代理）全部在 lib/twin-agent，这里只做事件解析与回发。
export const maxDuration = 60;

interface IncomingMessage {
  chatId: string;
  openId: string;
  text: string | null; // null = 非文本消息
}

/** 从事件里取出会话 / 发送者 / 文本；缺关键字段返回 null */
function extractMessage(event: Record<string, unknown>): IncomingMessage | null {
  const message = (event as { message?: Record<string, unknown> }).message;
  const sender = (event as { sender?: { sender_id?: { open_id?: unknown } } }).sender;
  if (!message || typeof message !== "object") return null;
  const chatId = message.chat_id;
  const openId = sender?.sender_id?.open_id;
  if (typeof chatId !== "string" || typeof openId !== "string") return null;
  if (message.message_type !== "text") return { chatId, openId, text: null };
  try {
    const content = JSON.parse(String(message.content));
    return { chatId, openId, text: typeof content.text === "string" ? content.text.trim() : "" };
  } catch {
    return { chatId, openId, text: "" };
  }
}

export async function POST(request: NextRequest) {
  let payload: Record<string, unknown>;
  try {
    payload = await request.json();
  } catch {
    return Response.json({ error: "invalid json" }, { status: 400 });
  }

  // 开启加密时整个 payload 是 {encrypt: "..."}
  if (typeof payload.encrypt === "string") {
    try {
      payload = decryptEvent(payload.encrypt);
    } catch (err) {
      console.error("飞书事件解密失败:", err instanceof Error ? err.message : err);
      return Response.json({ error: "decrypt failed" }, { status: 400 });
    }
  }

  // URL 配置验证（保存事件订阅地址时飞书发起）
  if (payload.type === "url_verification") {
    if (!verifyToken(payload.token)) {
      return Response.json({ error: "token mismatch" }, { status: 403 });
    }
    return Response.json({ challenge: payload.challenge });
  }

  // v2 事件
  const header = payload.header as Record<string, unknown> | undefined;
  if (!header || !verifyToken(header.token)) {
    return Response.json({ error: "token mismatch" }, { status: 403 });
  }
  if (header.event_type !== "im.message.receive_v1") {
    return Response.json({ ok: true }); // 其他事件直接确认
  }

  const event = (payload.event ?? {}) as Record<string, unknown>;
  const msg = extractMessage(event);
  if (!msg) return Response.json({ ok: true });

  if (!feishuConfigured()) {
    console.error("收到飞书消息但 FEISHU_APP_ID/FEISHU_APP_SECRET 未配置，无法回复");
    return Response.json({ ok: true });
  }

  // 秒回 200 避免飞书重试，处理在响应后异步执行
  after(async () => {
    try {
      const reply =
        msg.text === null
          ? "暂时只能处理文本消息。"
          : await handleUserMessage(msg.openId, msg.text);
      await sendText(msg.chatId, reply);
      console.log(`[feishu] ${msg.openId} 已回复（${reply.length} 字）`);
    } catch (err) {
      const message = err instanceof Error ? err.message : "分身服务异常";
      console.error("飞书消息处理失败:", message);
      try {
        await sendText(msg.chatId, `处理失败：${message}`);
      } catch {
        // 回复也失败时只留日志，避免循环
      }
    }
  });

  return Response.json({ ok: true });
}
