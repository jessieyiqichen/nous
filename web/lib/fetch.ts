/**
 * 统一的 API 请求封装。
 *
 * 所有 /api/* 调用都应经过 postJSON，而不是裸 fetch：
 * - 网络失败给出中文提示
 * - 先读 text 再 parse——Vercel 超时/网关错误返回 HTML 时不会抛出难懂的解析异常
 * - 非 2xx 时优先用响应体里的 error 字段作为错误消息
 */

export async function postJSON<T = unknown>(url: string, body: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch {
    throw new Error("网络请求失败，请检查网络连接后重试");
  }

  const text = await res.text();
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    if (!res.ok) throw new Error(`HTTP ${res.status}: ${text.slice(0, 200)}`);
    throw new Error(`API 返回非 JSON: ${text.slice(0, 200)}`);
  }

  if (!res.ok) {
    const msg = (data as { error?: string } | null)?.error;
    throw new Error(msg || `HTTP ${res.status}`);
  }
  return data as T;
}
