import { NextRequest } from "next/server";
import { analyzeTwinMessage, NoModelError, type HistoryTurn } from "@/lib/twin";

export const maxDuration = 60;

const MAX_CONTENT_CHARS = 2000;
const MAX_RELATION_CHARS = 30;
const MAX_HISTORY_TURNS = 20;
const MAX_USER_ID = 64;

function validateInput(
  body: unknown,
): { relation: string; content: string; history: HistoryTurn[]; userId?: string } | null {
  if (typeof body !== "object" || body === null) return null;
  const { relation, content, history, userId } = body as Record<string, unknown>;
  if (userId !== undefined && (typeof userId !== "string" || userId.length === 0 || userId.length > MAX_USER_ID)) {
    return null;
  }
  if (typeof relation !== "string" || relation.trim().length === 0 || relation.length > MAX_RELATION_CHARS) {
    return null;
  }
  if (typeof content !== "string" || content.trim().length === 0 || content.length > MAX_CONTENT_CHARS) {
    return null;
  }
  const turns: HistoryTurn[] = [];
  if (history !== undefined) {
    if (!Array.isArray(history) || history.length > MAX_HISTORY_TURNS) return null;
    for (const item of history) {
      if (typeof item !== "object" || item === null) return null;
      const { from, text } = item as Record<string, unknown>;
      if (from !== "them" && from !== "me") return null;
      if (typeof text !== "string" || text.length === 0 || text.length > MAX_CONTENT_CHARS) return null;
      turns.push({ from, text });
    }
  }
  return {
    relation: relation.trim(),
    content: content.trim(),
    history: turns,
    ...(typeof userId === "string" ? { userId } : {}),
  };
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const input = validateInput(body);

    if (!input) {
      return Response.json(
        { error: "消息内容或发信人关系格式不正确。" },
        { status: 400 },
      );
    }

    const analysis = await analyzeTwinMessage(input);
    return Response.json({ analysis });
  } catch (err) {
    if (err instanceof NoModelError) {
      return Response.json({ error: "该用户尚未建模，请先完成访谈。", code: "NO_MODEL" }, { status: 404 });
    }
    const message = err instanceof Error ? err.message : "分身服务异常，请稍后重试。";
    return Response.json({ error: message }, { status: 500 });
  }
}
