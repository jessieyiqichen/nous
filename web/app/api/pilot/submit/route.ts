import { NextRequest } from "next/server";
import { getSupabase } from "@/lib/server/supabase";

// 被试测试结果回收。优先 Supabase（snapshots 表），其次 Vercel Blob，
// 都未配置时返回 fallback，前端降级为本地 JSON 下载。
export async function POST(request: NextRequest) {
  try {
    const payload = await request.json();

    if (!payload?.code || !payload?.model || !Array.isArray(payload?.messages)) {
      return Response.json(
        { ok: false, error: "结果数据不完整（缺 code/model/messages）" },
        { status: 400 },
      );
    }

    const supabase = getSupabase();
    if (supabase) {
      const { error } = await supabase
        .from("snapshots")
        .insert({ code: String(payload.code).trim(), kind: "final_submit", payload });
      if (!error) return Response.json({ ok: true });
      console.error("[pilot] Supabase insert failed, trying Blob:", error.message);
    }

    if (!process.env.BLOB_READ_WRITE_TOKEN) {
      return Response.json({ ok: false, fallback: true });
    }

    const { put } = await import("@vercel/blob");
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    const key = `pilot/${payload.code}_${stamp}.json`;
    await put(key, JSON.stringify(payload, null, 2), {
      access: "public",
      contentType: "application/json",
      addRandomSuffix: false,
    });

    console.log(`[pilot] Stored result: ${key}`);
    return Response.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("[pilot] Submit failed:", message);
    // 存储失败也走前端下载兜底，不让被试的数据丢在原地
    return Response.json({ ok: false, fallback: true, error: message });
  }
}
