#!/usr/bin/env node
/**
 * 风格卡提取：从用户的真实文字样本里提炼「他打字什么样」，写入 web/data/style-card.json，
 * 由 lib/twin.ts 注入分身 prompt——让草稿从"通顺的中文"变成"他打出来的中文"。
 *
 * 用法：
 *   node scripts/build-style-card.mjs <文件1> [文件2 ...]
 *
 * 输入格式（自动识别）：
 *   - 访谈/对话导出 md：提取所有 "## User" 段落
 *   - 纯文本：每行一条消息
 *
 * 依赖 web/.env.local 里的 DEEPSEEK_API_KEY。样本超长时按 开头/中间/结尾 采样。
 */

import { readFileSync, writeFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const WEB_DIR = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT_PATH = join(WEB_DIR, "data", "style-card.json");
const MAX_SAMPLE_CHARS = 45000;

function loadEnvKey(name) {
  if (process.env[name]) return process.env[name];
  const envText = readFileSync(join(WEB_DIR, ".env.local"), "utf-8");
  const m = envText.match(new RegExp(`^${name}=(.+)$`, "m"));
  if (!m) throw new Error(`${name} 未配置（web/.env.local）`);
  return m[1].trim();
}

function extractMessages(raw) {
  if (/^## (User|Assistant)/m.test(raw)) {
    // 对话导出：切块取 User 段
    const blocks = raw.split(/^## /m);
    return blocks
      .filter((b) => b.startsWith("User"))
      .map((b) => b.replace(/^User\s*/, "").trim())
      .filter(Boolean);
  }
  return raw.split("\n").map((l) => l.trim()).filter(Boolean);
}

function usable(msg) {
  if (msg.length < 4 || msg.length > 3000) return false;
  if (/^https?:\/\/\S+$/.test(msg)) return false; // 纯链接
  return true;
}

/** 超长样本：按条数比例取 开头/中间/结尾 三段 */
function sampleMessages(messages) {
  const total = messages.reduce((n, m) => n + m.length, 0);
  if (total <= MAX_SAMPLE_CHARS) return messages;
  const per = Math.floor(MAX_SAMPLE_CHARS / 3);
  const pick = (arr, budget) => {
    const out = [];
    let used = 0;
    for (const m of arr) {
      if (used + m.length > budget) break;
      out.push(m);
      used += m.length;
    }
    return out;
  };
  const third = Math.floor(messages.length / 3);
  return [
    ...pick(messages.slice(0, third), per),
    ...pick(messages.slice(third, 2 * third), per),
    ...pick(messages.slice(2 * third), per),
  ];
}

const EXTRACT_PROMPT = `You are a writing-style analyst. Below are real messages typed by ONE person (Chinese, mostly from serious discussion contexts — note this register bias yourself).

Distill HOW this person writes into a style card. Focus on reusable, concrete signals — not content, not personality analysis.

Respond with a single JSON object, exactly this shape:
{
  "register_note": "样本来自什么语境、对语气的影响，1 句（中文）",
  "tone": "整体语气特征，1-2 句（中文）",
  "sentence_style": "句子长短/结构习惯，1-2 句（中文）",
  "punctuation": "标点习惯（如：少用句号？爱用——？问号连用？），1-2 句（中文）",
  "emoji_usage": "emoji/颜文字使用习惯，1 句（中文）",
  "catchphrases": ["高频口头禅/特征表达，最多 8 个"],
  "frequent_words": ["高频用词，最多 10 个"],
  "avoid": ["这个人明显不会用的表达方式，最多 5 条（中文描述）"],
  "sample_messages": ["8-12 条最能代表其风格的原句（短的优先，直接摘录）"]
}
Output ONLY the JSON object.

MESSAGES (one per --- separator):
`;

async function main() {
  const files = process.argv.slice(2);
  if (files.length === 0) {
    console.error("用法: node scripts/build-style-card.mjs <文件1> [文件2 ...]");
    process.exit(1);
  }

  const apiKey = loadEnvKey("DEEPSEEK_API_KEY");
  const baseURL = process.env.DEEPSEEK_BASE_URL || "https://api.deepseek.com";
  const model = process.env.DEEPSEEK_MODEL || "deepseek-chat";

  let messages = [];
  for (const f of files) {
    messages = messages.concat(extractMessages(readFileSync(f, "utf-8")).filter(usable));
  }
  console.log(`共提取 ${messages.length} 条消息`);
  const sampled = sampleMessages(messages);
  console.log(`采样后 ${sampled.length} 条（${sampled.reduce((n, m) => n + m.length, 0)} chars）送去分析`);

  const res = await fetch(`${baseURL}/chat/completions`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model,
      max_tokens: 4096,
      response_format: { type: "json_object" },
      messages: [{ role: "user", content: EXTRACT_PROMPT + sampled.join("\n---\n") }],
    }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(`DeepSeek HTTP ${res.status}: ${JSON.stringify(data).slice(0, 300)}`);
  const card = JSON.parse(data.choices[0].message.content);
  card._meta = {
    built_at: new Date().toISOString(),
    source_files: files,
    message_count: messages.length,
  };

  writeFileSync(OUT_PATH, JSON.stringify(card, null, 2));
  console.log(`✓ 风格卡已写入 ${OUT_PATH}`);
  console.log(`  tone: ${card.tone}`);
  console.log(`  口头禅: ${(card.catchphrases || []).join("、")}`);
}

main().catch((err) => {
  console.error("失败:", err.message);
  process.exit(1);
});
