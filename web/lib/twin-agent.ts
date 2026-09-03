/**
 * 分身对话总入口：一个用户、一段文本 → 一段回复。
 * 内部按用户状态切换三态：
 *   无模型 & 未开始 → 自我介绍，等「开始访谈」
 *   无模型 & 访谈中 → 访谈者提问；轮数够了自动建模（或用户说「建模」）
 *   有模型          → 消息代理（triage + 草稿 + 质检）
 * 飞书长连接客户端 / webhook / 未来任何入口都只调这一层。
 */

import { deepseekChatText, deepseekStructured } from "@/lib/deepseek";
import { INTERVIEWER_SYSTEM_PROMPT_ZH } from "@/lib/interview-prompts";
import { BUILD_MODEL_PROMPT, MODEL_SCHEMA } from "@/lib/generated/shared-prompts";
import { UNKNOWN_RELATION, analyzeTwinMessage, invalidateCorrectionsCache, type TwinAnalysis } from "@/lib/twin";
import {
  clearUserModel, getInterview, getLastSuggestion, getUserModel, saveFeedback, saveInterview,
  saveLastSuggestion, saveUserModel, type ChatMessage,
} from "@/lib/twin-store";

const AUTO_BUILD_TURNS = 12; // 访谈者提示词目标 12 轮内完成
const MIN_BUILD_TURNS = 8;
const MAX_CONTENT_CHARS = 2000;

// 长的放前面，避免「同事」抢先匹配「不熟的同事：」
const RELATION_PREFIXES = [
  "不熟的同事", "刚认识", "同事", "普通朋友", "在意的人", "家人", "上级", "陌生人", "朋友", "亲戚", "客户", "老板", "领导",
];
// 精确匹配（去标点后），避免「你好」这类问候被当成开始指令
const START_WORDS = ["开始访谈", "开始", "好的", "好", "ok", "行", "来", "可以", "嗯", "走"];

// 显式修正：「不对，我会说：xxx」/「改成：xxx」/「我发的是 xxx」→ 与上一条建议配对成改写对
// 注意：不用裸「改」「不像」做前缀——转发来的消息可能以「改天…」「不像话…」开头
const CORRECTION_RE = /^(不对|不是这样|不像我|改成|改为|改[：:]|实际发的是|我发的是|我实际发的是|我回的是|我会说|我会回|我会这么回)[：:，,。\s]*/;
// 显式采纳：「用了」「发了」→ 正样本
const ADOPT_RE = /^(用了|发了|采纳|照发了|就这样发了|已发)$/;
// 前几次给一句提示，教会用户怎么喂飞轮；之后不再打扰
const HINT_UNTIL_FEEDBACK = 3;
const FEEDBACK_HINT = "\n\n—— 不像你？把你实际发的版本回给我（或说「不对」），我会记住。";

function isStartCommand(text: string): boolean {
  const t = text.replace(/[\s，。！!、~～]/g, "").toLowerCase();
  return t.includes("开始") || START_WORDS.includes(t);
}
const HELP_WORDS = ["help", "帮助", "用法", "?", "？"];

const INTRO_TEXT = [
  "你好，我是你的认知分身。",
  "",
  "在替你回消息之前，我得先花大约 15 分钟了解你——怎么做决定、什么在乎什么不在乎、答应了的事会不会真做。之后你把收到的任何消息转给我，我按你的方式判断回不回、替你起草，并在你「嘴上要答应但其实做不到」的时候提醒你。",
  "",
  "回复「开始访谈」，我们聊起来。",
].join("\n");

const AGENT_USAGE = [
  "把你收到的消息转发/粘贴给我，我给你：回不回的判断、可直接发的草稿、执行质检。",
  "",
  "不用说明对方是谁，我会从内容猜（猜错了告诉我）。想省事也可以直接标，例如：",
  "上级：这周末有空吗？帮忙整理下数据",
  "（支持：上级 / 不熟的同事 / 刚认识 / 同事 / 客户 / 朋友 / 在意的人 / 家人 / 陌生人）",
  "",
  "教我更像你：草稿不像你，就把你实际发的版本回给我（或说「不对」）；用了就回「用了」。",
  "其他指令：「重新访谈」重建模型。",
].join("\n");

// ── 工具 ─────────────────────────────────────────────────────

/** 「关系：内容」前缀解析；不带前缀 → 关系未知，交给模型从内容推（用户多数时候不会标）。导出仅为测试 */
export function parseIncoming(text: string): { relation: string; content: string } {
  for (const r of RELATION_PREFIXES) {
    for (const sep of ["：", ":"]) {
      const prefix = r + sep;
      if (text.startsWith(prefix) && text.length > prefix.length) {
        return { relation: r, content: text.slice(prefix.length).trim() };
      }
    }
  }
  return { relation: UNKNOWN_RELATION, content: text };
}

/** 回复只给判断 + 草稿 + 质检，不摊分析（产品原则：用户要的是可执行的草稿） */
export function formatReply(a: TwinAnalysis): string {
  const lines: string[] = [];
  switch (a.triage.action) {
    case "ignore":
      lines.push(`这条不用回。${a.triage.reason}`);
      break;
    case "personal":
      lines.push(
        a.draft
          ? `这条比较要紧，草稿你过一眼再发。${a.triage.reason}`
          : `这条你亲自回比较好。${a.triage.reason}`,
      );
      break;
    case "defer":
      lines.push(`不用急着回，晚点顺手回就行。${a.triage.reason}`);
      break;
    default:
      lines.push(a.triage.reason);
  }
  if (a.relation_guess) lines.unshift(`看着像「${a.relation_guess}」，按这个关系回。`);
  if (a.gap_note) lines.push("", `⚠️ ${a.gap_note}`);
  if (a.draft) lines.push("", "可以这么回：", "", a.draft);
  return lines.join("\n");
}

function transcriptText(messages: ChatMessage[]): string {
  return messages.map((m) => `${m.role === "user" ? "用户" : "访谈者"}：${m.content}`).join("\n");
}

// ── 三态 ─────────────────────────────────────────────────────

async function agentReply(userId: string, text: string): Promise<string> {
  const { relation, content } = parseIncoming(text);
  const analysis = await analyzeTwinMessage({ userId, relation, content });

  // 记住这条建议，用户随后一句「不对/我发的是…」才能配对成改写对
  const prev = await getLastSuggestion(userId);
  const feedbackCount = prev?.feedbackCount ?? 0;
  await saveLastSuggestion(userId, {
    incoming: content,
    relation,
    draft: analysis.draft,
    action: analysis.triage.action,
    feedbackCount,
  });

  const hint = analysis.draft && feedbackCount < HINT_UNTIL_FEEDBACK ? FEEDBACK_HINT : "";
  return formatReply(analysis) + hint;
}

/** 用户显式修正：把上一条建议与他实际发的版本配成改写对，立刻进 few-shot */
async function recordCorrection(userId: string, finalText: string): Promise<string> {
  const last = await getLastSuggestion(userId);
  if (!last) return "刚才没有待修正的草稿。先把你收到的消息发我，我给建议之后你再改。";

  if (finalText.length === 0) {
    await saveFeedback(userId, {
      source: "bot", relation: last.relation, incoming: last.incoming,
      draft: last.draft, final: null, action: "dismissed",
    });
    return "好，这条我记为判断错了。你实际怎么回的？直接把那句话发给我，我就学。";
  }

  await saveFeedback(userId, {
    source: "bot", relation: last.relation, incoming: last.incoming,
    draft: last.draft, final: finalText, action: "edited",
  });
  await saveLastSuggestion(userId, { ...last, feedbackCount: last.feedbackCount + 1 });
  invalidateCorrectionsCache(userId);
  return `记住了。下次${last.relation}发这类消息，我照你这版来。`;
}

async function recordAdoption(userId: string): Promise<string> {
  const last = await getLastSuggestion(userId);
  if (!last || !last.draft) return "收到。";
  await saveFeedback(userId, {
    source: "bot", relation: last.relation, incoming: last.incoming,
    draft: last.draft, final: last.draft, action: "adopted",
  });
  await saveLastSuggestion(userId, { ...last, feedbackCount: last.feedbackCount + 1 });
  return "好，记下了这条像你。";
}

async function buildAndSwitch(userId: string, messages: ChatMessage[]): Promise<string> {
  const raw = await deepseekStructured({
    prompt: BUILD_MODEL_PROMPT + transcriptText(messages),
    schema: MODEL_SCHEMA,
    maxTokens: 8192,
  });
  if (!Array.isArray(raw.dimensions) || raw.dimensions.length === 0) {
    console.error(`建模输出缺 dimensions: ${JSON.stringify(raw).slice(0, 300)}`);
    throw new Error("建模失败，再聊两轮后回复「建模」重试。");
  }
  await saveUserModel(userId, raw);
  await saveInterview(userId, messages);
  return [
    `模型建好了——${raw.dimensions.length} 个维度，基于我们刚才 ${messages.filter((m) => m.role === "user").length} 轮对话。`,
    "",
    "现在把你收到的任何消息转给我试试，比如：",
    "上级：这周末有空吗？帮忙整理下数据",
    "",
    "我会告诉你回不回、怎么回，以及你答应了会不会真做。草稿不像你？把你实际发的版本回给我，我会记住。",
  ].join("\n");
}

async function interviewReply(userId: string, text: string): Promise<string> {
  let messages = await getInterview(userId);

  if (messages.length === 0) {
    if (!isStartCommand(text)) return INTRO_TEXT;
    messages = [{ role: "user", content: "我们开始吧。" }];
  } else {
    const userTurns = messages.filter((m) => m.role === "user").length;
    if (text === "建模") {
      if (userTurns >= MIN_BUILD_TURNS) return buildAndSwitch(userId, messages);
      return `再聊 ${MIN_BUILD_TURNS - userTurns} 轮我就有把握了，继续吧。`;
    }
    messages = [...messages, { role: "user", content: text }];
  }

  const userTurns = messages.filter((m) => m.role === "user").length;
  if (userTurns > AUTO_BUILD_TURNS) return buildAndSwitch(userId, messages);

  const reply = await deepseekChatText({
    system: INTERVIEWER_SYSTEM_PROMPT_ZH,
    messages,
    maxTokens: 600,
  });
  await saveInterview(userId, [...messages, { role: "assistant", content: reply }]);

  const shown = Math.min(userTurns, AUTO_BUILD_TURNS);
  const hint = userTurns >= MIN_BUILD_TURNS ? "，随时回复「建模」提前结束" : "";
  return `${reply}\n\n（访谈 ${shown}/${AUTO_BUILD_TURNS}${hint}）`;
}

// ── 总入口 ───────────────────────────────────────────────────

export async function handleUserMessage(userId: string, rawText: string): Promise<string> {
  const text = rawText.trim();
  if (text.length === 0) return INTRO_TEXT;
  if (text.length > MAX_CONTENT_CHARS) {
    return `消息太长了（上限 ${MAX_CONTENT_CHARS} 字），截一段核心内容发我。`;
  }

  if (text === "重新访谈") {
    await clearUserModel(userId);
    await saveInterview(userId, []);
    return "好，我们重新认识一下。回复「开始访谈」开始。";
  }

  const model = await getUserModel(userId);
  if (HELP_WORDS.includes(text.toLowerCase())) return model ? AGENT_USAGE : INTRO_TEXT;

  if (model) {
    const corr = text.match(CORRECTION_RE);
    if (corr) return recordCorrection(userId, text.slice(corr[0].length).trim());
    if (ADOPT_RE.test(text)) return recordAdoption(userId);
    return agentReply(userId, text);
  }
  return interviewReply(userId, text);
}
