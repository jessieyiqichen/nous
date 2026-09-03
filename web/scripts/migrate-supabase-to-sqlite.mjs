#!/usr/bin/env node
/**
 * 把 Supabase snapshots 表里分身相关的行导出到本地 SQLite（同表结构，保留 created_at 顺序）。
 * 在能连 Supabase 的机器上跑，产出的 .db 再 rsync 到服务器并设置 TWIN_DB_PATH。
 *
 * 用法：node scripts/migrate-supabase-to-sqlite.mjs <输出.db>
 */
import { readFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import { DatabaseSync } from "node:sqlite";
import { createClient } from "@supabase/supabase-js";

const WEB_DIR = join(dirname(fileURLToPath(import.meta.url)), "..");
const KINDS = ["cognitive_model", "twin_interview", "style_card", "twin_last", "twin_feedback"];

function env(name) {
  if (process.env[name]) return process.env[name];
  const m = readFileSync(join(WEB_DIR, ".env.local"), "utf-8").match(new RegExp(`^${name}=(.+)$`, "m"));
  if (!m) throw new Error(`${name} 未配置`);
  return m[1].trim();
}

const out = process.argv[2];
if (!out) { console.error("用法: node scripts/migrate-supabase-to-sqlite.mjs <输出.db>"); process.exit(1); }

const supabase = createClient(env("SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY"), { auth: { persistSession: false } });
const { data, error } = await supabase
  .from("snapshots").select("code,kind,payload,created_at").in("kind", KINDS)
  .order("created_at", { ascending: true }).limit(5000);
if (error) throw new Error(error.message);

const db = new DatabaseSync(out);
db.exec(`
  CREATE TABLE IF NOT EXISTS snapshots (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    code TEXT NOT NULL, kind TEXT NOT NULL, payload TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
  );
  CREATE INDEX IF NOT EXISTS snapshots_code_kind_idx ON snapshots (code, kind, id DESC);
`);
const ins = db.prepare("INSERT INTO snapshots (code, kind, payload, created_at) VALUES (?, ?, ?, ?)");
const byKind = {};
for (const r of data) {
  ins.run(r.code, r.kind, JSON.stringify(r.payload), r.created_at);
  byKind[r.kind] = (byKind[r.kind] || 0) + 1;
}
console.log(`✓ 导出 ${data.length} 行到 ${out}`, byKind);
