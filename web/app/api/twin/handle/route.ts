import { NextRequest } from "next/server";
import { handleUserMessage } from "@/lib/twin-agent";

export const maxDuration = 60;

// 分身对话总入口：{userId, text} → {reply}。访谈/建模/代理三态由服务端判断，客户端只做透传。
// TWIN_FEEDBACK_KEY 配置后要求 body.key 匹配（防止任意人冒用 userId）。

const MAX_USER_ID = 64;
const MAX_TEXT = 4000;

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    const requiredKey = process.env.TWIN_FEEDBACK_KEY;
    if (requiredKey && body?.key !== requiredKey) {
      return Response.json({ error: "无权限" }, { status: 403 });
    }

    const { userId, text } = body ?? {};
    if (typeof userId !== "string" || userId.length === 0 || userId.length > MAX_USER_ID) {
      return Response.json({ error: "userId 无效" }, { status: 400 });
    }
    if (typeof text !== "string" || text.length > MAX_TEXT) {
      return Response.json({ error: "text 无效" }, { status: 400 });
    }

    const reply = await handleUserMessage(userId, text);
    return Response.json({ reply });
  } catch (err) {
    const message = err instanceof Error ? err.message : "分身服务异常，请稍后重试。";
    console.error("[twin/handle]", message);
    return Response.json({ error: message }, { status: 500 });
  }
}
