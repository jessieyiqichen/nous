import { describe, expect, it } from "vitest";
import { validateAnalysis } from "@/lib/twin";
import { formatReply } from "@/lib/twin-agent";

const base = {
  triage: { action: "personal", reason: "老板亲自点名，别让分身代打" },
  gap_note: null,
  grounding: [{ dimension: "Social Cognition", note: "对上级默认认真" }],
};

describe("validateAnalysis · personal 也带草稿", () => {
  it("personal + draft 保留草稿（不再抹成 null）", () => {
    const out = validateAnalysis({ ...base, draft: "好的，我今天先把 A 做完，B 明早给你" });
    expect(out?.triage.action).toBe("personal");
    expect(out?.draft).toBe("好的，我今天先把 A 做完，B 明早给你");
  });

  it("personal 无草稿仍合法（宽容旧输出）", () => {
    const out = validateAnalysis({ ...base, draft: null });
    expect(out?.triage.action).toBe("personal");
    expect(out?.draft).toBeNull();
  });

  it("ignore 带草稿 → 草稿抹掉", () => {
    const out = validateAnalysis({ ...base, triage: { action: "ignore", reason: "群发" }, draft: "x" });
    expect(out?.draft).toBeNull();
  });

  it("draft 无草稿 → 校验失败", () => {
    expect(validateAnalysis({ ...base, triage: { action: "draft", reason: "r" }, draft: null })).toBeNull();
  });
});

describe("formatReply · personal 不再空手拒绝", () => {
  it("personal 有草稿：提示过目再发 + 附草稿", () => {
    const text = formatReply({ ...base, draft: "收到，我先排一下" } as never);
    expect(text).not.toContain("亲自回比较好");
    expect(text).toContain("过一眼再发");
    expect(text).toContain("可以这么回");
    expect(text).toContain("收到，我先排一下");
  });

  it("personal 无草稿：退回旧文案", () => {
    const text = formatReply({ ...base, draft: null } as never);
    expect(text).toContain("亲自回比较好");
  });
});

// ── 关系未知：模型自己猜 ─────────────────────────────────────

import { UNKNOWN_RELATION, isUnknownRelation } from "@/lib/twin";
import { parseIncoming } from "@/lib/twin-agent";

describe("关系未知", () => {
  it("isUnknownRelation 识别空/未知/拿不准", () => {
    for (const r of ["", "  ", "未知", "拿不准", "不确定", "不知道"]) expect(isUnknownRelation(r)).toBe(true);
    for (const r of ["上级", "普通朋友", "刚认识"]) expect(isUnknownRelation(r)).toBe(false);
  });

  it("bot 不带前缀 → 关系未知（不再默认普通朋友）", () => {
    expect(parseIncoming("明天下午前把数据拆一版给我").relation).toBe(UNKNOWN_RELATION);
    expect(parseIncoming("上级：明天下午前把数据拆一版给我")).toEqual({ relation: "上级", content: "明天下午前把数据拆一版给我" });
    expect(parseIncoming("刚认识：昨天聊得很开心，加个微信").relation).toBe("刚认识");
    expect(parseIncoming("不熟的同事：能帮我看下这个表吗").relation).toBe("不熟的同事");
  });

  it("validateAnalysis 保留 relation_guess，缺失/非字符串 → null", () => {
    const withGuess = validateAnalysis({ ...base, draft: "收到", relation_guess: "上级" });
    expect(withGuess?.relation_guess).toBe("上级");
    const noGuess = validateAnalysis({ ...base, draft: "收到" });
    expect(noGuess?.relation_guess).toBeNull();
    const bad = validateAnalysis({ ...base, draft: "收到", relation_guess: 42 });
    expect(bad?.relation_guess).toBeNull();
  });

  it("formatReply 有猜测时开头说明按哪个关系回", () => {
    const text = formatReply({
      ...base, triage: { action: "draft", reason: "上级派活，直接接" }, draft: "收到", relation_guess: "上级",
    } as never);
    expect(text.startsWith("看着像「上级」，按这个关系回。")).toBe(true);
    expect(text).toContain("上级派活，直接接");
  });
});
