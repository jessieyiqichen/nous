import { NextRequest } from "next/server";
import { getUserModel, saveUserModel, saveUserStyleCard } from "@/lib/twin-store";

export const maxDuration = 15;

// 用户认知模型的读写：GET ?userId= 查看是否已建模；POST 灌入模型（+可选风格卡）。
// POST 受 TWIN_FEEDBACK_KEY 保护（配置后必填）。

const MAX_USER_ID = 64;

export async function GET(request: NextRequest) {
  const userId = request.nextUrl.searchParams.get("userId");
  if (!userId || userId.length > MAX_USER_ID) {
    return Response.json({ error: "userId 无效" }, { status: 400 });
  }
  try {
    const model = await getUserModel(userId);
    if (!model) return Response.json({ error: "该用户尚未建模", code: "NO_MODEL" }, { status: 404 });
    return Response.json({ model });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return Response.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const requiredKey = process.env.TWIN_FEEDBACK_KEY;
    if (requiredKey && body?.key !== requiredKey) {
      return Response.json({ error: "无权限" }, { status: 403 });
    }
    const { userId, model, styleCard } = body ?? {};
    if (typeof userId !== "string" || userId.length === 0 || userId.length > MAX_USER_ID) {
      return Response.json({ error: "userId 无效" }, { status: 400 });
    }
    if (typeof model !== "object" || model === null || !Array.isArray(model.dimensions)) {
      return Response.json({ error: "model 必须包含 dimensions 数组" }, { status: 400 });
    }
    await saveUserModel(userId, model);
    if (styleCard && typeof styleCard === "object") {
      await saveUserStyleCard(userId, styleCard);
    }
    return Response.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return Response.json({ error: message }, { status: 500 });
  }
}
