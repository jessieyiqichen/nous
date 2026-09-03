import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * 服务端 Supabase 客户端（service_role key，只能在 API 路由里用，绝不能进客户端 bundle）。
 * 未配置环境变量时返回 null——调用方降级处理，不报错。
 */
export function getSupabase(): SupabaseClient | null {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false } });
}
