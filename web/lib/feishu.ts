/**
 * 飞书开放平台 API 封装（自建应用 bot）。服务端专用。
 *
 * 环境变量（都在飞书开发者后台「凭证与基础信息」页拿）：
 * - FEISHU_APP_ID / FEISHU_APP_SECRET   必填，发消息用
 * - FEISHU_VERIFICATION_TOKEN           必填，校验事件确实来自飞书
 * - FEISHU_ENCRYPT_KEY                  可选，事件订阅开了加密才需要
 */

import { createDecipheriv, createHash } from "crypto";

const BASE_URL = process.env.FEISHU_BASE_URL || "https://open.feishu.cn";

export function feishuConfigured(): boolean {
  return Boolean(process.env.FEISHU_APP_ID && process.env.FEISHU_APP_SECRET);
}

export function verifyToken(token: unknown): boolean {
  const expected = process.env.FEISHU_VERIFICATION_TOKEN;
  if (!expected) {
    // 未配置校验 token 时放行但记录——首次搭建时便于调通，配好后必须设置
    console.warn("FEISHU_VERIFICATION_TOKEN 未配置，跳过事件来源校验");
    return true;
  }
  return token === expected;
}

/** 事件订阅开启加密时，payload 为 {encrypt: base64}。AES-256-CBC，key=sha256(encryptKey)，IV=密文前16字节 */
export function decryptEvent(encrypted: string): Record<string, unknown> {
  const encryptKey = process.env.FEISHU_ENCRYPT_KEY;
  if (!encryptKey) {
    throw new Error("收到加密事件但未配置 FEISHU_ENCRYPT_KEY");
  }
  const buf = Buffer.from(encrypted, "base64");
  const iv = buf.subarray(0, 16);
  const data = buf.subarray(16);
  const key = createHash("sha256").update(encryptKey).digest();
  const decipher = createDecipheriv("aes-256-cbc", key, iv);
  const decrypted = Buffer.concat([decipher.update(data), decipher.final()]).toString("utf-8");
  return JSON.parse(decrypted);
}

// tenant_access_token 简单缓存（serverless 实例内有效，过期前 5 分钟刷新）
let cachedToken: { value: string; expiresAt: number } | null = null;

async function getTenantToken(): Promise<string> {
  if (cachedToken && Date.now() < cachedToken.expiresAt) {
    return cachedToken.value;
  }
  const res = await fetch(`${BASE_URL}/open-apis/auth/v3/tenant_access_token/internal`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      app_id: process.env.FEISHU_APP_ID,
      app_secret: process.env.FEISHU_APP_SECRET,
    }),
  });
  const data = await res.json();
  if (!res.ok || data.code !== 0 || typeof data.tenant_access_token !== "string") {
    console.error(`飞书 tenant_access_token 获取失败: ${JSON.stringify(data).slice(0, 300)}`);
    throw new Error("飞书凭证获取失败，检查 FEISHU_APP_ID/FEISHU_APP_SECRET");
  }
  cachedToken = {
    value: data.tenant_access_token,
    expiresAt: Date.now() + (data.expire - 300) * 1000,
  };
  return data.tenant_access_token;
}

/** 给指定会话发一条文本消息 */
export async function sendText(chatId: string, text: string): Promise<void> {
  const token = await getTenantToken();
  const res = await fetch(`${BASE_URL}/open-apis/im/v1/messages?receive_id_type=chat_id`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      receive_id: chatId,
      msg_type: "text",
      content: JSON.stringify({ text }),
    }),
  });
  const data = await res.json();
  if (!res.ok || data.code !== 0) {
    console.error(`飞书发消息失败: ${JSON.stringify(data).slice(0, 300)}`);
    throw new Error("飞书消息发送失败");
  }
}
