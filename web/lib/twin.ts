/**
 * 认知分身消息分析核心——web (/api/twin)、飞书 bot、Mac 助手共用同一个大脑。服务端专用。
 *
 * 模型来源：
 * - 传 userId：从 Supabase 取该用户的模型（没有则抛 NoModelError，调用方引导访谈）
 * - 不传：用构建时打包的静态 snapshot（web demo / 创始人本机）
 */

import { readFile } from "fs/promises";
import { join } from "path";
import { deepseekChatJSON } from "@/lib/deepseek";
import { getUserModel, getUserStyleCard, listFeedback } from "@/lib/twin-store";

export const TRIAGE_ACTIONS = ["ignore", "defer", "draft", "personal"] as const;

/** 调用方不知道对方是谁时传这个（Mac 快捷键 / bot 无前缀），模型自己从内容推关系 */
export const UNKNOWN_RELATION = "未知";
const UNKNOWN_RELATION_WORDS = new Set([UNKNOWN_RELATION, "拿不准", "不确定", "不知道"]);
export function isUnknownRelation(relation: string): boolean {
  const r = relation.trim();
  return r.length === 0 || UNKNOWN_RELATION_WORDS.has(r);
}
export type TriageAction = (typeof TRIAGE_ACTIONS)[number];

export interface TwinGrounding {
  dimension: string;
  note: string;
}

export interface TwinAnalysis {
  triage: { action: TriageAction; reason: string };
  draft: string | null;
  grounding: TwinGrounding[];
  gap_note: string | null;
  /** 输入关系未知时模型的推断（如「上级」）；关系已知时为 null */
  relation_guess: string | null;
}

export interface HistoryTurn {
  from: "them" | "me";
  text: string;
}

export class NoModelError extends Error {
  constructor(userId: string) {
    super(`用户 ${userId} 尚未建立认知模型`);
    this.name = "NoModelError";
  }
}

const DEFAULT_CODE = "owner";
const MAX_RELATION_GUESS_CHARS = 12;

// JSON mode 要求在 prompt 里出现 "json" 并描述结构（见 lib/deepseek.ts）
const AGENT_PROMPT = `You are the COGNITIVE TWIN of a specific person, acting as their MESSAGE AGENT — a bot that lives in their chat apps and handles incoming messages the way THEY would.

You do NOT imitate their tone superficially. You THINK with their cognitive architecture: their attention allocation decides which messages deserve effort, their social cognition calibrates wording, their execution-layer record decides what they can actually commit to.

Given ONE incoming message (with the sender's relation to this person), produce:

1. triage.action — exactly one of:
   - "ignore": this person would not reply at all
   - "defer": would reply later in a low-cost batch (still provide a draft)
   - "draft": the twin drafts a reply to send now
   - "personal": emotionally loaded or relationship-critical — the person should read the draft before sending, but you STILL write a draft (never null)

   TRIAGE CALIBRATION (asymmetric cost — a missed reply hurts far more than an unneeded draft):
   - Default is "draft". The model's "low engagement in non-caring domains" means SHORT, low-effort replies — it does NOT mean silence.
   - Use "ignore" ONLY when a reply is objectively unnecessary: mass-forwarded/vote-begging/ads, automated notifications, a bare emoji/sticker/"好的"/"收到" that closes a thread, or the conversation has clearly ended.
   - If the sender asks anything, requests anything, or expects acknowledgement — never "ignore"; use "draft" (or "defer" if timing can slide) with a minimal reply.
   - WORK REQUESTS ARE ALWAYS "draft": a boss/lead/colleague/client assigning a task, adding work last-minute, chasing progress, asking for a file, or scheduling — even when it lands in a caring domain. The person wants a ready-to-send reply, not a hand-off. Use the model to decide HOW to answer (what to commit to, how much to push back), not WHETHER to answer.
   - Use "personal" RARELY: someone close in distress or sharing something intimate, a confrontation/apology, a breakup/money/major-commitment decision — cases where a wrong word does real damage. Still provide a draft as a starting point.
   - When unsure between ignore and draft, choose draft. When unsure between personal and draft, choose draft.
2. triage.reason — why, in this person's decision terms (Chinese, 1-2 sentences)
3. draft — the reply in this person's voice: casual chat register (聊天语气，不是书面语), concrete, calibrated warmth. null ONLY when action is "ignore"; "personal" still gets a draft.
4. gap_note — EXECUTION QUALITY-CHECK, the product's core feature: if this person's likely stated response (what they'd SAY or promise) differs from what their behavioral record shows they'd actually DO, warn about it and note how the draft compensates. Otherwise null. Never hide the gap to be flattering.
5. grounding — 1-3 model dimensions that drove this judgment, most influential first.
6. relation_guess — ONLY when the sender relation is given as "未知": your best guess of who this is. Use EXACTLY ONE label from this list, verbatim, no "或"/no qualifiers: 上级 / 不熟的同事 / 同事 / 刚认识 / 客户 / 普通朋友 / 在意的人 / 家人 / 陌生人. If torn, pick the more formal/distant one. null when the relation was provided.

RELATION HANDLING:
- When the relation is "未知", infer it from the message itself BEFORE drafting: form of address (您/老师/名字), whether they assign or request, tone, shared context, presence of small talk. Put the guess in relation_guess and draft for THAT relation.
- The person mostly uses this for relations they are NOT familiar with (bosses, colleagues they barely know, people just met). So when the cues are thin, default to "not close": polite, measured, no over-familiarity, no slang, no over-promising. When torn between boss and peer, lean boss; when torn between friend and acquaintance, lean acquaintance. Getting too formal with a friend costs little; getting too casual with a boss costs a lot.
- When the relation IS provided, trust it over your own reading.

STYLE RULES — all user-facing text (triage.reason, draft, gap_note):
- 口语。像一个很懂这个人的朋友在旁边随口说话，不是心理评估报告。
- BANNED words in reason/draft/gap_note: 认知资源、投入度、关怀度、在乎域、执行层、注意力分配、社会认知、维度、模型 —— any clinical/psychology jargon. Say it in plain daily Chinese instead.
  - BAD: "低关怀度，不值得消耗认知资源" → GOOD: "寒暄而已，不用回"
  - BAD: "非关怀领域，最小必要回应" → GOOD: "顺手回一句就行，别聊开"
- triage.reason: ≤ 25 字，一句话说完。
- gap_note: 口语戳穿，例如 "你多半会顺口答应，但按你的老毛病，八成拖到周日半夜——草稿把承诺压到你真会做的量"。
- grounding.note may reference dimension concepts (it's for the detail view) but still plain language.

All output text in Chinese. Respond with a single JSON object, exactly this shape:
{
  "triage": { "action": "ignore|defer|draft|personal", "reason": "..." },
  "draft": "reply text or null",
  "gap_note": "warning text or null",
  "grounding": [ { "dimension": "English dimension name from the model", "note": "1 short Chinese sentence" } ],
  "relation_guess": "short Chinese label or null"
}
Output ONLY the JSON object, no other text.

COGNITIVE MODEL:
`;

/** 校验模型输出结构，剔除多余字段，容忍 grounding 里的脏数据（导出仅为测试） */
export function validateAnalysis(raw: Record<string, unknown>): TwinAnalysis | null {
  const triage = raw.triage as Record<string, unknown> | undefined;
  if (
    typeof triage !== "object" || triage === null ||
    typeof triage.reason !== "string" ||
    !TRIAGE_ACTIONS.includes(triage.action as TriageAction)
  ) {
    return null;
  }
  const action = triage.action as TriageAction;

  const grounding: TwinGrounding[] = [];
  if (Array.isArray(raw.grounding)) {
    for (const g of raw.grounding.slice(0, 3)) {
      if (
        typeof g === "object" && g !== null &&
        typeof (g as Record<string, unknown>).dimension === "string" &&
        typeof (g as Record<string, unknown>).note === "string"
      ) {
        grounding.push({
          dimension: (g as Record<string, string>).dimension,
          note: (g as Record<string, string>).note,
        });
      }
    }
  }

  const draft = typeof raw.draft === "string" && raw.draft.trim().length > 0 ? raw.draft.trim() : null;
  const gap = typeof raw.gap_note === "string" && raw.gap_note.trim().length > 0 ? raw.gap_note.trim() : null;
  const relationGuess =
    typeof raw.relation_guess === "string" && raw.relation_guess.trim().length > 0
      ? raw.relation_guess.trim().slice(0, MAX_RELATION_GUESS_CHARS)
      : null;
  const base = { triage: { action, reason: triage.reason }, grounding, gap_note: gap, relation_guess: relationGuess };

  // ignore 不该有草稿；draft/defer 必须有；personal 应有但宽容缺失（用户反馈：空手说「你亲自回」等于没帮上）
  if (action === "ignore" && draft !== null) return { ...base, draft: null };
  if ((action === "draft" || action === "defer") && draft === null) return null;

  return { ...base, draft };
}

async function readBundledJSON(name: string): Promise<Record<string, unknown> | null> {
  // Prebuild snapshot bundled in web/data/ (cwd + ".." fails on Vercel serverless,
  // see comment in app/api/model/route.ts).
  try {
    const raw = await readFile(join(process.cwd(), "data", name), "utf-8");
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

async function loadCognitiveModel(userId?: string): Promise<Record<string, unknown>> {
  if (userId) {
    const model = await getUserModel(userId);
    if (!model) throw new NoModelError(userId);
    return model;
  }
  const bundled = await readBundledJSON("cognitive-model-snapshot.json");
  if (!bundled) throw new Error("默认认知模型缺失（web/data/cognitive-model-snapshot.json）");
  return bundled;
}

/** 风格卡：用户级优先；无 userId 时用打包的静态卡；都没有则 null（优雅降级） */
async function loadStyleCard(userId?: string): Promise<Record<string, unknown> | null> {
  if (userId) return getUserStyleCard(userId);
  return readBundledJSON("style-card.json");
}

// 最近的改写修正对（few-shot）：按用户缓存 60s，Supabase 未配置/失败时降级为空
const CORRECTIONS_CACHE_MS = 60_000;
const CORRECTIONS_LIMIT = 8;
const correctionsCache = new Map<string, { at: number; section: string }>();

/** 用户刚提交了新的改写——让下一次生成立刻看到，不等缓存过期 */
export function invalidateCorrectionsCache(code: string): void {
  correctionsCache.delete(code);
}

async function loadCorrectionsSection(code: string): Promise<string> {
  const cached = correctionsCache.get(code);
  if (cached && Date.now() - cached.at < CORRECTIONS_CACHE_MS) return cached.section;

  let section = "";
  try {
    const edits = (await listFeedback(code, 40))
      .filter((p) => p?.action === "edited" && typeof p.draft === "string" && typeof p.final === "string")
      .slice(0, CORRECTIONS_LIMIT);
    if (edits.length > 0) {
      const lines = edits
        .map(
          (p, i) =>
            `${i + 1}. [${p.relation}] 来消息: ${p.incoming}\n   分身草稿: ${p.draft}\n   他实际发的: ${p.final}`,
        )
        .join("\n");
      section =
        "\n\nRECENT REWRITES — cases where this person rewrote the twin's draft before sending. " +
        "These are ground truth about how he ACTUALLY replies; learn the gap and draft closer to his versions:\n" +
        lines;
    }
  } catch (err) {
    console.error("加载修正信号失败（降级为空）:", err instanceof Error ? err.message : err);
  }
  correctionsCache.set(code, { at: Date.now(), section });
  return section;
}

/**
 * 分析一条来消息，返回 triage + 草稿 + 质检 + 依据。
 * 抛错：NoModelError（该用户未建模）/ DeepSeek 层中文提示 / "分身判断生成失败"。
 */
export async function analyzeTwinMessage(input: {
  relation: string;
  content: string;
  history?: HistoryTurn[];
  userId?: string;
}): Promise<TwinAnalysis> {
  const model = await loadCognitiveModel(input.userId);
  const modelText = JSON.stringify(model, null, 2);

  const styleCard = await loadStyleCard(input.userId);
  const styleSection = styleCard
    ? "\n\nSTYLE CARD — how this person ACTUALLY types. The draft must sound like these samples, " +
      "not like generic polished Chinese. Mind the register_note: samples may skew toward serious discussion, " +
      "so for casual chats keep the vocabulary/punctuation habits but relax the tone accordingly:\n" +
      JSON.stringify(styleCard, null, 2)
    : "";

  const correctionsSection = await loadCorrectionsSection(input.userId ?? DEFAULT_CODE);

  const history = input.history ?? [];
  const historySection =
    history.length > 0
      ? "CONVERSATION SO FAR (oldest first):\n" +
        history
          .map((h) => (h.from === "them" ? `[对方] ${h.text}` : `[我方回复] ${h.text}`))
          .join("\n") +
        "\n\n"
      : "";

  const relationUnknown = isUnknownRelation(input.relation);
  const relationLine = relationUnknown ? `${UNKNOWN_RELATION}（请先从内容推断）` : input.relation;

  const raw = await deepseekChatJSON({
    system: `${AGENT_PROMPT}${modelText}${styleSection}${correctionsSection}`,
    messages: [
      {
        role: "user",
        content: `${historySection}LATEST INCOMING MESSAGE\n- Sender relation: ${relationLine}\n- Content: ${input.content}`,
      },
    ],
  });

  const analysis = validateAnalysis(raw);
  if (!analysis) {
    console.error(`twin 输出结构校验失败: ${JSON.stringify(raw).slice(0, 500)}`);
    throw new Error("分身判断生成失败，请重试。");
  }
  return relationUnknown ? analysis : { ...analysis, relation_guess: null };
}
