/**
 * DeepSeek API 封装（OpenAI 兼容接口，国内直连）。
 *
 * 服务端专用（读 process.env）。所有配置走环境变量，不硬编码：
 * - DEEPSEEK_API_KEY   必填
 * - DEEPSEEK_BASE_URL  默认官方 https://api.deepseek.com
 * - DEEPSEEK_MODEL     默认 deepseek-chat（V3 系列，便宜且支持 JSON 输出）
 *
 * 三个出口：
 * - deepseekChatText       纯文本回复
 * - deepseekChatJSON       JSON mode，调用方自己在 prompt 里描述结构
 * - deepseekStructured     替代 Anthropic 强制 tool_choice 的结构化输出：
 *                          传 JSON Schema，schema 会被注入 system prompt
 */

const BASE_URL = process.env.DEEPSEEK_BASE_URL || "https://api.deepseek.com";
const MODEL = process.env.DEEPSEEK_MODEL || "deepseek-chat";
const DEFAULT_MAX_TOKENS = 4096;
// deepseek-chat 输出上限 8192 tokens，超过会 400（迁移前部分路由用 16384，在此收口）
const MAX_OUTPUT_TOKENS = 8192;

export interface DeepseekMessage {
  role: "user" | "assistant";
  content: string;
}

interface CallOpts {
  system?: string;
  messages: DeepseekMessage[];
  maxTokens?: number;
  jsonMode: boolean;
}

/** 底层调用：返回 message.content 字符串。失败抛出带中文提示的 Error。 */
async function callDeepseek(opts: CallOpts): Promise<string> {
  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey) {
    throw new Error("服务端未配置 DEEPSEEK_API_KEY，在线功能暂不可用。");
  }

  const messages = opts.system
    ? [{ role: "system", content: opts.system }, ...opts.messages]
    : opts.messages;

  let res: Response;
  try {
    res = await fetch(`${BASE_URL}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: Math.min(opts.maxTokens ?? DEFAULT_MAX_TOKENS, MAX_OUTPUT_TOKENS),
        ...(opts.jsonMode ? { response_format: { type: "json_object" } } : {}),
        messages,
      }),
    });
  } catch {
    throw new Error("无法连接 DeepSeek API，请检查服务器网络。");
  }

  const text = await res.text();
  if (!res.ok) {
    // 不把上游原始报错透传给用户，细节留在服务端日志
    console.error(`DeepSeek API ${res.status}: ${text.slice(0, 500)}`);
    throw new Error(`DeepSeek API 调用失败（HTTP ${res.status}），请稍后重试。`);
  }

  try {
    const data = JSON.parse(text);
    const content = data?.choices?.[0]?.message?.content;
    if (typeof content !== "string" || content.length === 0) {
      throw new Error("empty content");
    }
    return content;
  } catch {
    console.error(`DeepSeek 响应结构异常: ${text.slice(0, 500)}`);
    throw new Error("DeepSeek 返回了异常结构，请稍后重试。");
  }
}

/** 纯文本对话（访谈等场景）。 */
export async function deepseekChatText(opts: {
  system?: string;
  messages: DeepseekMessage[];
  maxTokens?: number;
}): Promise<string> {
  return callDeepseek({ ...opts, jsonMode: false });
}

/**
 * JSON mode 对话。注意：JSON mode 要求 prompt 里出现 "json" 字样并描述期望结构，
 * 由调用方保证。返回解析后的对象。
 */
export async function deepseekChatJSON(opts: {
  system: string;
  messages: DeepseekMessage[];
  maxTokens?: number;
}): Promise<Record<string, unknown>> {
  const content = await callDeepseek({ ...opts, jsonMode: true });
  try {
    return JSON.parse(content) as Record<string, unknown>;
  } catch {
    console.error(`DeepSeek JSON mode 输出不可解析: ${content.slice(0, 500)}`);
    throw new Error("模型输出不是合法 JSON，请重试。");
  }
}

/**
 * 结构化输出：等价于原 Anthropic 强制 tool_choice + input_schema 的用法。
 * schema（JSON Schema，含各字段 description）会被注入 system prompt，
 * 输出走 JSON mode。注意 DeepSeek 不在服务端强校验 schema，
 * 关键字段调用方仍应在下游做归一化/校验。
 */
export async function deepseekStructured(opts: {
  prompt: string;
  schema: object;
  maxTokens?: number;
}): Promise<Record<string, unknown>> {
  const system =
    "You must respond with a single JSON object that strictly conforms to the JSON Schema below. " +
    'Follow every "description" field in the schema. ' +
    "Output ONLY the JSON object — no markdown fences, no other text.\n\nJSON SCHEMA:\n" +
    JSON.stringify(opts.schema, null, 2);
  return deepseekChatJSON({
    system,
    messages: [{ role: "user", content: opts.prompt }],
    maxTokens: opts.maxTokens,
  });
}
