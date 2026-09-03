/**
 * 分身的 per-user 存储：认知模型 / 访谈进度 / 风格卡 / 上一条建议 / 修正反馈。
 * 追加式快照表（code = userId，kind 区分类型，最新一条生效）。
 *
 * 两个后端，按环境变量切换：
 * - TWIN_DB_PATH 已设 → 本地 SQLite（node:sqlite，零运维，服务器首选：不依赖跨境链路）
 * - 否则 → Supabase（web pilot 流程沿用的表）
 * 读：后端不可用返回空；写：不可用时抛错（调用方需要知道没存上）。
 */

import { createRequire } from "node:module";
import { getSupabase } from "@/lib/server/supabase";

const KIND_MODEL = "cognitive_model";
const KIND_INTERVIEW = "twin_interview";
const KIND_STYLE = "style_card";
const KIND_LAST = "twin_last";
const KIND_FEEDBACK = "twin_feedback";

type Payload = Record<string, unknown>;

interface Backend {
  latest(code: string, kind: string): Promise<Payload | null>;
  list(code: string, kind: string, limit: number): Promise<Payload[]>;
  append(code: string, kind: string, payload: Payload): Promise<void>;
}

// ── SQLite 后端 ──────────────────────────────────────────────

interface SqliteStatement {
  get(...params: unknown[]): Record<string, unknown> | undefined;
  all(...params: unknown[]): Record<string, unknown>[];
  run(...params: unknown[]): unknown;
}
interface SqliteDb {
  exec(sql: string): void;
  prepare(sql: string): SqliteStatement;
}

let sqliteDb: SqliteDb | null = null;

function openSqlite(path: string): SqliteDb {
  if (sqliteDb) return sqliteDb;
  // 通过 createRequire 加载 node 内建模块，避免打包器尝试解析 node:sqlite
  const req = createRequire(process.cwd() + "/");
  const { DatabaseSync } = req("node:sqlite") as { DatabaseSync: new (p: string) => SqliteDb };
  const db = new DatabaseSync(path);
  db.exec(`
    CREATE TABLE IF NOT EXISTS snapshots (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      code TEXT NOT NULL,
      kind TEXT NOT NULL,
      payload TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
    );
    CREATE INDEX IF NOT EXISTS snapshots_code_kind_idx ON snapshots (code, kind, id DESC);
  `);
  sqliteDb = db;
  return db;
}

function sqliteBackend(path: string): Backend {
  const db = openSqlite(path);
  const parse = (row: Record<string, unknown>): Payload => JSON.parse(String(row.payload)) as Payload;
  return {
    async latest(code, kind) {
      const row = db.prepare("SELECT payload FROM snapshots WHERE code = ? AND kind = ? ORDER BY id DESC LIMIT 1").get(code, kind);
      return row ? parse(row) : null;
    },
    async list(code, kind, limit) {
      return db.prepare("SELECT payload FROM snapshots WHERE code = ? AND kind = ? ORDER BY id DESC LIMIT ?").all(code, kind, limit).map(parse);
    },
    async append(code, kind, payload) {
      db.prepare("INSERT INTO snapshots (code, kind, payload) VALUES (?, ?, ?)").run(code, kind, JSON.stringify(payload));
    },
  };
}

// ── Supabase 后端（跨境链路偶发瞬断，读写做短退避重试）──────────

const RETRY_DELAYS_MS = [400, 1200];

async function withRetry<T>(label: string, fn: () => Promise<T>): Promise<T> {
  let lastErr: unknown;
  for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (attempt < RETRY_DELAYS_MS.length) {
        await new Promise((r) => setTimeout(r, RETRY_DELAYS_MS[attempt]));
      }
    }
  }
  const message = lastErr instanceof Error ? lastErr.message : String(lastErr);
  throw new Error(`${label}失败（已重试 ${RETRY_DELAYS_MS.length} 次）: ${message}`);
}

function supabaseBackend(): Backend | null {
  const supabase = getSupabase();
  if (!supabase) return null;
  return {
    latest: (code, kind) =>
      withRetry("读取存储", async () => {
        const { data, error } = await supabase
          .from("snapshots").select("payload").eq("code", code).eq("kind", kind)
          .order("created_at", { ascending: false }).limit(1);
        if (error) throw new Error(error.message);
        return (data?.[0]?.payload as Payload) ?? null;
      }),
    list: (code, kind, limit) =>
      withRetry("读取存储", async () => {
        const { data, error } = await supabase
          .from("snapshots").select("payload").eq("code", code).eq("kind", kind)
          .order("created_at", { ascending: false }).limit(limit);
        if (error) throw new Error(error.message);
        return (data ?? []).map((r) => r.payload as Payload);
      }),
    append: (code, kind, payload) =>
      withRetry("写入存储", async () => {
        const { error } = await supabase.from("snapshots").insert({ code, kind, payload });
        if (error) throw new Error(error.message);
      }),
  };
}

function backend(): Backend | null {
  const dbPath = process.env.TWIN_DB_PATH;
  if (dbPath) return sqliteBackend(dbPath);
  return supabaseBackend();
}

/** 当前后端名（日志/诊断用） */
export function storeBackendName(): "sqlite" | "supabase" | "none" {
  if (process.env.TWIN_DB_PATH) return "sqlite";
  return getSupabase() ? "supabase" : "none";
}

async function latest(code: string, kind: string): Promise<Payload | null> {
  const b = backend();
  return b ? b.latest(code, kind) : null;
}

async function append(code: string, kind: string, payload: Payload): Promise<void> {
  const b = backend();
  if (!b) throw new Error("服务端未配置存储（TWIN_DB_PATH 或 SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY）");
  await b.append(code, kind, payload);
}

// ── 认知模型 ─────────────────────────────────────────────────

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

export async function getUserModel(userId: string): Promise<Payload | null> {
  const p = await latest(userId, KIND_MODEL);
  const model = p?.model;
  return model && typeof model === "object" ? (model as Payload) : null;
}

export async function saveUserModel(userId: string, model: Payload): Promise<void> {
  await append(userId, KIND_MODEL, { model, ts: new Date().toISOString() });
}

/** 清空 = 追加一条 model:null（保留历史） */
export async function clearUserModel(userId: string): Promise<void> {
  await append(userId, KIND_MODEL, { model: null, ts: new Date().toISOString() });
}

// ── 访谈进度 ─────────────────────────────────────────────────

export async function getInterview(userId: string): Promise<ChatMessage[]> {
  const p = await latest(userId, KIND_INTERVIEW);
  const msgs = p?.messages;
  if (!Array.isArray(msgs)) return [];
  return msgs.filter(
    (m): m is ChatMessage =>
      typeof m === "object" && m !== null &&
      ((m as ChatMessage).role === "user" || (m as ChatMessage).role === "assistant") &&
      typeof (m as ChatMessage).content === "string",
  );
}

export async function saveInterview(userId: string, messages: ChatMessage[]): Promise<void> {
  await append(userId, KIND_INTERVIEW, { messages, ts: new Date().toISOString() });
}

// ── 上一条建议 + 修正反馈 ───────────────────────────────────

export interface LastSuggestion {
  incoming: string;
  relation: string;
  draft: string | null;
  action: string;
  /** 该用户累计显式反馈次数，用于决定还要不要提示"不像你就回我" */
  feedbackCount: number;
  ts: string;
}

export async function getLastSuggestion(userId: string): Promise<LastSuggestion | null> {
  const p = await latest(userId, KIND_LAST);
  if (!p || typeof p.incoming !== "string") return null;
  return {
    incoming: p.incoming,
    relation: typeof p.relation === "string" ? p.relation : "普通朋友",
    draft: typeof p.draft === "string" ? p.draft : null,
    action: typeof p.action === "string" ? p.action : "draft",
    feedbackCount: typeof p.feedbackCount === "number" ? p.feedbackCount : 0,
    ts: typeof p.ts === "string" ? p.ts : "",
  };
}

export async function saveLastSuggestion(userId: string, s: Omit<LastSuggestion, "ts">): Promise<void> {
  await append(userId, KIND_LAST, { ...s, ts: new Date().toISOString() });
}

export interface FeedbackRecord {
  source: string;
  relation: string;
  incoming: string;
  draft: string | null;
  final: string | null;
  action: "adopted" | "edited" | "dismissed";
}

export async function saveFeedback(userId: string, f: FeedbackRecord): Promise<void> {
  await append(userId, KIND_FEEDBACK, { ...f, ts: new Date().toISOString() });
}

/** 最近的反馈记录（新→旧），供 few-shot 注入 */
export async function listFeedback(userId: string, limit: number): Promise<Payload[]> {
  const b = backend();
  return b ? b.list(userId, KIND_FEEDBACK, limit) : [];
}

// ── 风格卡 ───────────────────────────────────────────────────

export async function getUserStyleCard(userId: string): Promise<Payload | null> {
  const p = await latest(userId, KIND_STYLE);
  const card = p?.card;
  return card && typeof card === "object" ? (card as Payload) : null;
}

export async function saveUserStyleCard(userId: string, card: Payload): Promise<void> {
  await append(userId, KIND_STYLE, { card, ts: new Date().toISOString() });
}
