#!/usr/bin/env node
/**
 * 把一份认知模型 + 风格卡灌给某个用户（典型用途：自己的飞书 open_id），跳过访谈直接进入代理模式。
 * 默认读 web/data/ 的 snapshot（开源仓库里是虚构示例人物！灌自己前务必用 --dir 指到自己的目录）。
 *
 * 用法：node scripts/seed-twin-user.mjs <userId> [--base http://localhost:3999] [--dir ../data/subjects/me]
 *   --dir 目录需含 cognitive_model.json（或 cognitive_model_v2.json），可选 style-card.json
 */

import { readFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const WEB_DIR = join(dirname(fileURLToPath(import.meta.url)), "..");

function readEnv(name) {
  if (process.env[name]) return process.env[name];
  try {
    const m = readFileSync(join(WEB_DIR, ".env.local"), "utf-8").match(new RegExp(`^${name}=(.+)$`, "m"));
    return m ? m[1].trim() : undefined;
  } catch {
    return undefined;
  }
}

const args = process.argv.slice(2);
const userId = args.find((a) => !a.startsWith("--"));
const baseIdx = args.indexOf("--base");
const base = baseIdx >= 0 ? args[baseIdx + 1] : "http://localhost:3999";
if (!userId) {
  console.error("用法: node scripts/seed-twin-user.mjs <userId> [--base URL]");
  process.exit(1);
}

const dirIdx = args.indexOf("--dir");
const subjectDir = dirIdx >= 0 ? args[dirIdx + 1] : undefined;
function readFirst(paths) {
  for (const p of paths) {
    try { return JSON.parse(readFileSync(p, "utf-8")); } catch { /* try next */ }
  }
  return undefined;
}
const model = subjectDir
  ? readFirst([join(subjectDir, "cognitive_model.json"), join(subjectDir, "cognitive_model_v2.json")])
  : readFirst([join(WEB_DIR, "data", "cognitive-model-snapshot.json")]);
if (!model) {
  console.error("找不到认知模型文件" + (subjectDir ? `（${subjectDir}）` : ""));
  process.exit(1);
}
const styleCard = readFirst([join(subjectDir ?? join(WEB_DIR, "data"), subjectDir ? "style-card.json" : "style-card.json")]);
if (!subjectDir) console.warn("⚠ 未指定 --dir，正在灌入 web/data 的 snapshot（开源仓库里这是虚构示例人物）");
const key = readEnv("TWIN_FEEDBACK_KEY");

const res = await fetch(`${base}/api/twin/model`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ userId, model, styleCard, ...(key ? { key } : {}) }),
});
const data = await res.json();
if (!res.ok) {
  console.error("失败:", data.error || res.status);
  process.exit(1);
}
console.log(`✓ 已为 ${userId} 灌入模型（${model.dimensions?.length ?? "?"} 维）${styleCard ? " + 风格卡" : ""}`);
