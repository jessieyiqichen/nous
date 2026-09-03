import { afterEach, describe, expect, it, vi } from "vitest";
import { postJSON } from "@/lib/fetch";

function mockFetch(status: number, body: string) {
  const fn = vi.fn().mockResolvedValue(new Response(body, { status }));
  vi.stubGlobal("fetch", fn);
  return fn;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("postJSON", () => {
  it("returns parsed JSON on success", async () => {
    const fn = mockFetch(200, JSON.stringify({ reply: "好的" }));
    const data = await postJSON<{ reply: string }>("/api/x", { a: 1 });
    expect(data.reply).toBe("好的");
    expect(fn).toHaveBeenCalledWith("/api/x", expect.objectContaining({
      method: "POST",
      body: JSON.stringify({ a: 1 }),
    }));
  });

  it("prefers the error field from JSON error responses", async () => {
    mockFetch(400, JSON.stringify({ error: "缺少认知模型数据" }));
    await expect(postJSON("/api/x", {})).rejects.toThrow("缺少认知模型数据");
  });

  it("surfaces HTML gateway errors as readable HTTP errors (Vercel 超时页)", async () => {
    mockFetch(504, "<html>Gateway Timeout</html>");
    await expect(postJSON("/api/x", {})).rejects.toThrow("HTTP 504");
  });

  it("flags non-JSON 200 responses", async () => {
    mockFetch(200, "not json");
    await expect(postJSON("/api/x", {})).rejects.toThrow("API 返回非 JSON");
  });

  it("gives a Chinese network-failure message when fetch rejects", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("Failed to fetch")));
    await expect(postJSON("/api/x", {})).rejects.toThrow("网络请求失败");
  });
});
