import { NextRequest } from "next/server";
import { isValidPilotCode, pilotCodesConfigured } from "@/lib/server/pilotCodes";

// 邀请码校验：环境变量 PILOT_CODES 为逗号分隔的码列表（如 "P01,P02,P03"）。
// 软门槛——防链接外泄被随意烧 API，不是安全边界。
export async function POST(request: NextRequest) {
  try {
    const { code } = await request.json();
    if (typeof code !== "string" || !code.trim()) {
      return Response.json({ ok: false, error: "请输入邀请码" }, { status: 400 });
    }
    if (!pilotCodesConfigured()) {
      return Response.json(
        { ok: false, error: "内测通道未开启（未配置 PILOT_CODES）" },
        { status: 503 },
      );
    }
    if (!isValidPilotCode(code)) {
      return Response.json({ ok: false, error: "邀请码不正确" }, { status: 403 });
    }

    return Response.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return Response.json({ ok: false, error: message }, { status: 500 });
  }
}
