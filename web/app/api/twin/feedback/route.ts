import { NextRequest } from "next/server";
import { saveFeedback, storeBackendName } from "@/lib/twin-store";
import { invalidateCorrectionsCache } from "@/lib/twin";

export const maxDuration = 10;

// 修正信号落库：分身草稿被 采纳/改写/无视 都是一条行为证据。
// 存进 snapshots 追加表（kind=twin_feedback），few-shot 注入见 lib/twin.ts。
// TWIN_FEEDBACK_KEY 配置后要求 body.key 匹配（个人部署可不配）。

const ACTIONS = ["adopted", "edited", "dismissed"] as const;
const MAX_CHARS = 2000;

interface Feedback {
  source: string;
  relation: string;
  incoming: string;
  draft: string | null;
  final: string | null;
  action: (typeof ACTIONS)[number];
}

function validate(body: unknown): Feedback | null {
  if (typeof body !== "object" || body === null) return null;
  const b = body as Record<string, unknown>;
  const reqStr = (v: unknown): string | undefined =>
    typeof v === "string" && v.length > 0 && v.length <= MAX_CHARS ? v : undefined;
  const optStr = (v: unknown): string | null | undefined =>
    v === undefined || v === null ? null : reqStr(v);
  const source = reqStr(b.source);
  const relation = reqStr(b.relation);
  const incoming = reqStr(b.incoming);
  const draft = optStr(b.draft);
  const final = optStr(b.final);
  if (source === undefined || relation === undefined || incoming === undefined) return null;
  if (draft === undefined || final === undefined) return null;
  if (!ACTIONS.includes(b.action as Feedback["action"])) return null;
  return { source, relation, incoming, draft, final, action: b.action as Feedback["action"] };
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    const requiredKey = process.env.TWIN_FEEDBACK_KEY;
    if (requiredKey && body?.key !== requiredKey) {
      return Response.json({ ok: false, error: "无权限" }, { status: 403 });
    }

    const feedback = validate(body);
    if (!feedback) {
      return Response.json({ ok: false, error: "反馈格式不正确" }, { status: 400 });
    }

    if (storeBackendName() === "none") {
      // 未配置存储：不报错，信号丢弃（客户端 fire-and-forget）
      return Response.json({ ok: false, unconfigured: true });
    }

    // 按用户归档；未带 userId 的（web demo / 创始人本机）归到 owner
    const userId = typeof body?.userId === "string" && body.userId.length > 0 && body.userId.length <= 64
      ? body.userId
      : "owner";
    await saveFeedback(userId, feedback);
    if (feedback.action === "edited") invalidateCorrectionsCache(userId);

    return Response.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("[twin/feedback] failed:", message);
    return Response.json({ ok: false, error: message }, { status: 500 });
  }
}
