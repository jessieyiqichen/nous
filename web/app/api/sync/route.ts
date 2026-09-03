import { NextRequest } from "next/server";
import { getSupabase } from "@/lib/server/supabase";
import { isValidPilotCode } from "@/lib/server/pilotCodes";

const ALLOWED_KINDS = ["interview", "scores", "final_submit"] as const;
const MAX_PAYLOAD_BYTES = 2_000_000; // 2MB：完整访谈+画像远小于此

// POST：追加一条快照（服务端持久化的唯一入口）
export async function POST(request: NextRequest) {
  try {
    const raw = await request.text();
    if (raw.length > MAX_PAYLOAD_BYTES) {
      return Response.json({ ok: false, error: "数据过大" }, { status: 413 });
    }
    const { code, kind, payload } = JSON.parse(raw);

    if (!isValidPilotCode(code)) {
      return Response.json({ ok: false, error: "邀请码无效" }, { status: 403 });
    }
    if (!ALLOWED_KINDS.includes(kind)) {
      return Response.json({ ok: false, error: `kind 必须是 ${ALLOWED_KINDS.join("/")}` }, { status: 400 });
    }
    if (!payload || typeof payload !== "object") {
      return Response.json({ ok: false, error: "缺少 payload" }, { status: 400 });
    }

    const supabase = getSupabase();
    if (!supabase) {
      // 未配置 Supabase：明确告知未持久化，前端保留本地数据即可
      return Response.json({ ok: false, unconfigured: true });
    }

    const { error } = await supabase
      .from("snapshots")
      .insert({ code: code.trim(), kind, payload });
    if (error) throw new Error(error.message);

    return Response.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("[sync] POST failed:", message);
    return Response.json({ ok: false, error: message }, { status: 500 });
  }
}

// GET ?code=&kind=：取该被试某类快照的最新一条（跨设备恢复用）
export async function GET(request: NextRequest) {
  try {
    const code = request.nextUrl.searchParams.get("code");
    const kind = request.nextUrl.searchParams.get("kind") || "interview";

    if (!isValidPilotCode(code)) {
      return Response.json({ ok: false, error: "邀请码无效" }, { status: 403 });
    }

    const supabase = getSupabase();
    if (!supabase) return Response.json({ ok: false, unconfigured: true });

    const { data, error } = await supabase
      .from("snapshots")
      .select("payload, created_at")
      .eq("code", code!.trim())
      .eq("kind", kind)
      .order("created_at", { ascending: false })
      .limit(1);
    if (error) throw new Error(error.message);

    return Response.json({ ok: true, snapshot: data?.[0] ?? null });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("[sync] GET failed:", message);
    return Response.json({ ok: false, error: message }, { status: 500 });
  }
}
