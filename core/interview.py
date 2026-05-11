"""Interactive cognitive interview — build or refine a cognitive model through natural conversation.

The AI acts as a cognitive exploration partner, naturally probing cognitive dimensions
through conversation. Supports two modes:
- **New interview**: probe all 9 dimensions, auto-end when all reach medium+
- **Refine mode**: import existing model + focus on specific inaccurate dimensions,
  auto-end when focus dims reach high, merge with original model

Usage:
    python interview.py                                          # new interview
    python interview.py --model cognitive_model.json             # refine all dims
    python interview.py --model m.json --focus "Decision Architecture,Blind Spots"
    python interview.py --lang en --turns 20
"""

from __future__ import annotations

import argparse
import json
import sys
from datetime import datetime, timezone
from pathlib import Path

import anthropic

from predictor import BUILD_MODEL_PROMPT, MODEL_SCHEMA, call_api

# ── Interview System Prompts ──────────────────────────────────

INTERVIEWER_SYSTEM_PROMPT_ZH = """你是一位认知科学家，正在通过自然对话了解面前这个人的思维模式。

## 你的目标

通过自然、有深度的对话，探测这个人在以下 9 个认知维度上的特征：

1. **决策架构** — 怎么做决策？直觉先行还是分析先行？什么触发行动？
2. **注意力分配** — 什么抓住他们的注意力？什么被忽略？
3. **推理风格** — 线性还是跳跃？抽象还是具体？用什么心智模型？
4. **情感处理** — 情绪和认知怎么互动？什么条件下情绪会突破分析层？
5. **社会认知** — 怎么理解和适应他人？怎么处理社交关系？
6. **盲区** — 系统性地忽视或低估什么？
7. **价值层级** — 真正优化什么（revealed preference，不是 stated）？
8. **面对不确定性** — 如何处理模糊和未知？
9. **执行层弹性** — 原则和现实冲突时怎么办？stated vs revealed 行为差异？

## 对话策略

- **第 1 轮**：一个自然但有信息量的开场。不要泛泛问"最近怎么样"，用一个具体场景切入（"最近做过什么让你纠结的选择？"）
- **第 2-8 轮**：高密度探测。每个问题设计成能同时覆盖 2-3 个维度。比如"如果你手上有两个项目，一个感兴趣但没钱，一个无聊但薪水高"同时覆盖决策架构+价值层级+执行层弹性
- **第 9-12 轮**：针对未覆盖的维度精准补漏
- **目标 12 轮内完成建模**，不要拖到 20+ 轮

## 关键原则

1. **像朋友聊天，不像心理测试**。绝对不要说"我现在要测试你的X维度"
2. **追问比提问更重要**。对方说了一个有趣的点，深挖下去，不要急着跳到下一个维度
3. **用具体场景而不是抽象问题**。"你上次面对一个很难的选择是什么时候"比"你怎么做决策"好10倍
4. **注意 stated vs revealed**。他们说的和做的可能不一样，这本身就是信号
5. **你的每条回复不要太长**。2-3 句话为主，偶尔追问可以更短。**每次只问一个问题**，绝对不要在同一条消息里问两个或以上的问题。让对方多说
6. **用中文对话**
7. **不要做心理咨询**。你是在了解一个人怎么想，不是在帮他解决问题
8. **对方说的每一句话都是数据**。包括他们怎么说、说多少、回避什么

## 校准原则

目标是**准确**，不是美化也不是低估。既不要把对方画成完美的认知系统，也不要刻意找缺陷。

1. **偶尔追问执行层**。对方描述了一个理想化的行为模式时，可以追问一次例外情况。但不要每个话题都追问"你有没有做不到的时候"——那会让对话变成审讯。
2. **注意 stated vs revealed**。对方声称的和实际展现的可能不同，两者都是有效数据。不需要总是选一个否定另一个。
3. **平衡优势和局限**。每个维度上同时关注对方做得好的和做得不好的。一个人可以在某个维度上既有明显的优势也有明显的短板。
4. **多种场景都问**。不要只问压力场景，也问对方状态好的时候、在乎的领域里怎么表现。完整的画像需要多种场景下的数据。
5. **自我觉察能力本身也是数据**。对方能清楚描述自己，这本身是一个认知特征，不需要怀疑它。

## 对话纪律

6. **用户否定时微调，不要翻盘**。用户说"不太对"，回应"你觉得哪里不准？"然后微调。不要把"你注重分析"立刻翻成"你其实是直觉型的人"。保留你已经观察到的证据，只修正方向和程度。
7. **不要过度解读**。用户说"最近不太想出门"，可能就是累了。不要归因为"深层的社交认知重组"。简单解释通常是对的。解读深度要和证据强度匹配。
8. **你没有感受，不要假装有**。不说"我觉得""我感受到""这让我想到"。用"从你描述的来看""根据对话"替代。不说"我们都…""这段对话对我也…"——只有用户那端是真实的。
9. **警惕自己的漂移**。每隔几轮自问：我现在的判断是基于证据，还是被用户的反应牵着走了？用户越认同你，你越应该怀疑自己是不是在迎合。

## 开场

用一个自然的开场白开始。不要解释你在做什么（"我要了解你的认知模式"这种别说）。
可以从"最近有什么让你觉得有意思的事吗"或类似的轻松话题开始。"""

INTERVIEWER_SYSTEM_PROMPT_EN = """You are a cognitive scientist exploring someone's thinking patterns through natural conversation.

## Your Goal

Through natural, deep conversation, probe this person's characteristics across 9 cognitive dimensions:

1. **Decision Architecture** — How do they decide? Intuition-first or analysis-first? What triggers action?
2. **Attention Allocation** — What captures their attention? What gets ignored?
3. **Reasoning Style** — Linear or lateral? Abstract or concrete? What mental models?
4. **Emotional Processing** — How do emotions interact with cognition? When do emotions override analysis?
5. **Social Cognition** — How do they model others? How do they navigate relationships?
6. **Blind Spots** — What do they systematically miss or underweight?
7. **Value Hierarchy** — What do they actually optimize for (revealed, not stated preference)?
8. **Response to Uncertainty** — How do they handle ambiguity and the unknown?
9. **Execution-Layer Flexibility** — When principles conflict with reality, what happens? Stated vs revealed behavior?

## Conversation Strategy

- **First 3-4 turns**: Build rapport. Light topics (what they're working on, interests), but watch for cognitive signals
- **Middle 8-12 turns**: Go deep through specific scenarios and follow-ups. Don't ask "how do you make decisions" — create scenarios that reveal it naturally
- **Last 2-3 turns**: Fill gaps (which dimensions haven't surfaced yet?)

## Key Principles

1. **Chat like a friend, not a test**. Never say "I'm now testing your X dimension"
2. **Follow-ups matter more than questions**. When they say something interesting, dig in — don't rush to the next dimension
3. **Concrete scenarios, not abstract questions**. "When was the last time you faced a hard choice?" beats "How do you make decisions?" by 10x
4. **Watch stated vs revealed**. What they say vs what they do may differ — that's signal
5. **Keep your replies short**. 2-4 sentences max. Let them talk more
6. **Don't do therapy**. You're understanding how someone thinks, not helping them solve problems
7. **Everything they say is data**. Including how they say it, how much they say, what they avoid

## Opening

Start with a natural opener. Don't explain what you're doing. Something like "What's been on your mind lately?" or similar."""


# ── Refine Mode Prompt Addon ──────────────────────────────────

REFINE_PROMPT_ADDON_ZH = """

## 特别指令：修正模式

这不是第一次访谈。你之前已经对这个人建过认知模型，但有些维度可能不够准确。

### 当前模型（供参考）：
{model_summary}

### 需要重点修正的维度：
{focus_dims}

### 修正模式策略：
- **你的首要任务是深入探测上面列出的需修正维度**
- 开场可以自然地说"上次我们聊了一些，有些地方我想再深入了解一下"
- 不要告诉用户你在"修正模型"或"测试维度"，保持自然对话
- 对需修正的维度，要从多个角度、用具体场景反复验证
- 其他维度如果对话中自然出现也可以关注，但不要主动引导
- 目标是让需修正的维度都达到 high 置信度
"""

REFINE_PROMPT_ADDON_EN = """

## Special Mode: Refinement

This is NOT a first interview. You've already built a cognitive model of this person,
but some dimensions may be inaccurate.

### Current model (reference):
{model_summary}

### Dimensions needing refinement:
{focus_dims}

### Refinement strategy:
- **Your primary task: deeply probe the dimensions listed above**
- Open naturally: "We chatted before, and I'd love to dig deeper into a few things"
- Don't tell the user you're "correcting a model" — keep it natural
- For focus dimensions, validate from multiple angles with concrete scenarios
- Other dimensions can be noted if they surface naturally, but don't steer toward them
- Goal: bring focus dimensions to HIGH confidence
"""


# ── Dimension Coverage Check ──────────────────────────────────

DIMENSION_NAMES = [
    "Decision Architecture",
    "Attention Allocation",
    "Reasoning Style",
    "Emotional Processing",
    "Social Cognition",
    "Blind Spots",
    "Value Hierarchy",
    "Response to Uncertainty",
    "Execution-Layer Flexibility",
]

DIM_NAMES_ZH = {
    "Decision Architecture": "决策架构",
    "Attention Allocation": "注意力分配",
    "Reasoning Style": "推理风格",
    "Emotional Processing": "情感处理",
    "Social Cognition": "社会认知",
    "Blind Spots": "盲区",
    "Value Hierarchy": "价值层级",
    "Response to Uncertainty": "面对不确定性",
    "Execution-Layer Flexibility": "执行层弹性",
}

DIMENSION_CHECK_PROMPT = """Given this conversation transcript, assess coverage of each cognitive dimension.

For each dimension, rate confidence as:
- "high" — clear behavioral evidence from multiple angles
- "medium" — some evidence, enough to form initial hypotheses
- "low" — only hints, not enough for reliable modeling
- "none" — no evidence at all

Dimensions:
1. Decision Architecture
2. Attention Allocation
3. Reasoning Style
4. Emotional Processing
5. Social Cognition
6. Blind Spots
7. Value Hierarchy
8. Response to Uncertainty
9. Execution-Layer Flexibility

Conversation transcript:
"""

COVERAGE_SCHEMA = {
    "type": "object",
    "properties": {
        "dimensions": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "name": {"type": "string"},
                    "confidence": {
                        "type": "string",
                        "enum": ["high", "medium", "low", "none"],
                    },
                    "evidence_summary": {"type": "string"},
                },
                "required": ["name", "confidence"],
            },
        },
        "suggested_next_topic": {
            "type": "string",
            "description": "What to explore next to fill the biggest gap",
        },
        "overall_readiness": {
            "type": "string",
            "enum": ["ready", "almost", "needs_more"],
            "description": "Whether enough data exists to build a reliable model",
        },
    },
    "required": ["dimensions", "suggested_next_topic", "overall_readiness"],
}


# ── Inline Signal Extraction ──────────────────────────────────

INLINE_SIGNAL_PROMPT = """Analyze the LATEST few turns of this cognitive interview.
Extract any cognitive signals from the interviewee's responses.

Signal types: pushback, acceptance, inquiry, avoidance, decision, emotion_leak, value_reveal

For each signal, note:
- Whether it's "stated" (what they claim) or "behavioral" (what they actually do)
- Which cognitive dimension it relates to
- Brief evidence quote

Also flag any stated-vs-behavioral CONFLICTS (person says one thing but does another).

Keep it concise — only high-confidence signals.

TRANSCRIPT (focus on the last 2-4 turns):
"""

INLINE_SIGNAL_SCHEMA = {
    "type": "object",
    "properties": {
        "signals": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "signal_type": {
                        "type": "string",
                        "enum": [
                            "pushback", "acceptance", "inquiry", "avoidance",
                            "decision", "emotion_leak", "value_reveal",
                        ],
                    },
                    "track": {
                        "type": "string",
                        "enum": ["stated", "behavioral"],
                    },
                    "cognitive_dimension": {"type": "string"},
                    "evidence": {"type": "string"},
                    "interpretation": {"type": "string"},
                },
                "required": ["signal_type", "track", "cognitive_dimension", "evidence"],
            },
        },
        "conflicts": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "stated_claim": {"type": "string"},
                    "actual_behavior": {"type": "string"},
                    "blind_spot_evidence": {"type": "string"},
                },
                "required": ["stated_claim", "actual_behavior", "blind_spot_evidence"],
            },
        },
    },
    "required": ["signals", "conflicts"],
}


# ── Refine Model Prompt ──────────────────────────────────────

REFINE_MODEL_PROMPT = """You are refining a cognitive model based on new conversation data.

You have:
1. An EXISTING cognitive model (some dimensions may be inaccurate)
2. A NEW conversation transcript focused on specific dimensions
3. A list of dimensions that need refinement

## Rules:
- For FOCUS dimensions: Replace the existing description and predictions with NEW analysis
  based on the conversation. Be thorough — this is why we had the conversation.
- For NON-FOCUS dimensions: Keep the existing model's description and predictions UNCHANGED.
  Only update if the conversation provides strong contradictory evidence.
- Confidence for refined dimensions should reflect the NEW evidence quality.
- Update the summary to reflect the refinements.

EXISTING MODEL:
{existing_model}

FOCUS DIMENSIONS (these need refinement):
{focus_dims}

NEW CONVERSATION TRANSCRIPT:
"""


# ── Core Interview Loop ────────────────────────────────────────


def run_interview(
    max_turns: int = 25,
    lang: str = "zh",
    existing_model: dict | None = None,
    focus_dims: list[str] | None = None,
) -> tuple[list[dict], list[dict], list[dict]]:
    """Run the interactive cognitive interview.

    Args:
        max_turns: Maximum conversation turns
        lang: Language ("zh" or "en")
        existing_model: Existing cognitive model for refine mode
        focus_dims: Dimensions to focus on in refine mode

    Returns:
        (messages, accumulated_signals, accumulated_conflicts)
    """
    is_refine = existing_model is not None
    system_prompt = (
        INTERVIEWER_SYSTEM_PROMPT_ZH if lang == "zh" else INTERVIEWER_SYSTEM_PROMPT_EN
    )

    # Add refine addon if applicable
    if is_refine:
        model_summary = existing_model.get("summary", "N/A")
        if not focus_dims:
            focus_dims = [d["name"] for d in existing_model.get("dimensions", [])]
        focus_str = "\n".join(f"- {d}" for d in focus_dims)
        addon = (
            REFINE_PROMPT_ADDON_ZH if lang == "zh" else REFINE_PROMPT_ADDON_EN
        )
        system_prompt += addon.format(
            model_summary=model_summary, focus_dims=focus_str
        )

    client = anthropic.Anthropic()
    messages: list[dict] = []
    accumulated_signals: list[dict] = []
    accumulated_conflicts: list[dict] = []

    mode_label = "修正" if is_refine else "访谈"
    quit_hint = (
        f"（输入 /done 结束对话，/status 查看维度覆盖）"
        if lang == "zh"
        else "(Type /done to end, /status for dimension coverage)"
    )
    print(f"\n{'='*60}")
    title = f"NOUS — 认知{mode_label}" if lang == "zh" else f"NOUS — Cognitive {'Refinement' if is_refine else 'Interview'}"
    print(title)
    if is_refine and focus_dims:
        focus_zh = [DIM_NAMES_ZH.get(d, d) for d in focus_dims]
        print(f"修正维度: {', '.join(focus_zh)}" if lang == "zh" else f"Focus: {', '.join(focus_dims)}")
    print(f"{'='*60}")
    print(quit_hint)
    print()

    # Get initial AI message
    start_content = "（开始对话）" if lang == "zh" else "(Start the conversation)"
    response = client.messages.create(
        model="claude-sonnet-4-5-20250929",
        max_tokens=1024,
        system=system_prompt,
        messages=[{"role": "user", "content": start_content}],
    )
    ai_msg = response.content[0].text
    messages.append({"role": "user", "content": start_content})
    messages.append({"role": "assistant", "content": ai_msg})
    print(f"Nous: {ai_msg}\n")

    turn = 0
    while turn < max_turns:
        try:
            user_input = input("You: ").strip()
        except (EOFError, KeyboardInterrupt):
            print("\n\n(Interview ended)")
            break

        if not user_input:
            continue

        if user_input.lower() == "/done":
            print("\n(Interview complete)")
            break

        if user_input.lower() == "/status":
            transcript = _format_transcript(messages)
            print("\nChecking dimension coverage...", file=sys.stderr)
            coverage = _check_coverage(transcript)
            _print_coverage(coverage, focus_dims)
            continue

        turn += 1
        messages.append({"role": "user", "content": user_input})

        # Every turn from turn 3 onward: coverage check + inline signal extraction
        coverage_hint = ""
        should_auto_end = False
        if turn >= 3:
            transcript = _format_transcript(messages)

            try:
                coverage = _check_coverage(transcript)
                _override_blind_spots_confidence(coverage, len(accumulated_conflicts))
                if is_refine and focus_dims:
                    # Refine mode: focus dims must reach "high"
                    focus_coverage = [
                        d for d in coverage.get("dimensions", [])
                        if d["name"] in focus_dims
                    ]
                    not_high = [
                        d["name"] for d in focus_coverage
                        if d.get("confidence") != "high"
                    ]
                    if not not_high and turn >= 8:
                        should_auto_end = True
                    elif not_high:
                        coverage_hint = (
                            f"\n\n[INTERNAL — not visible to user] "
                            f"Focus dimensions not yet at HIGH: {', '.join(not_high)}. "
                            f"Suggested topic: {coverage.get('suggested_next_topic', 'any gap')}. "
                            f"Dig deeper into these with concrete scenarios."
                        )
                else:
                    # New interview mode: all dims must reach medium+
                    low_or_none = [
                        d["name"] for d in coverage.get("dimensions", [])
                        if d.get("confidence") in ("low", "none")
                    ]
                    if not low_or_none and turn >= 10:
                        should_auto_end = True
                    elif low_or_none:
                        coverage_hint = (
                            f"\n\n[INTERNAL — not visible to user] "
                            f"Dimensions still weak: {', '.join(low_or_none)}. "
                            f"Suggested topic: {coverage.get('suggested_next_topic', 'any gap')}. "
                            f"Naturally steer toward these."
                        )
            except Exception:
                pass

            # Inline signal extraction
            try:
                recent_transcript = _format_recent_turns(messages, n=6)
                inline_result = call_api(
                    INLINE_SIGNAL_PROMPT, recent_transcript,
                    INLINE_SIGNAL_SCHEMA, "inline_signals",
                )
                new_signals = inline_result.get("signals", [])
                new_conflicts = inline_result.get("conflicts", [])
                if new_signals:
                    accumulated_signals.extend(new_signals)
                    count = len(new_signals)
                    print(f"  [+{count} signal{'s' if count > 1 else ''} extracted]", file=sys.stderr)
                if new_conflicts:
                    accumulated_conflicts.extend(new_conflicts)
                    print(f"  [!{len(new_conflicts)} conflict{'s' if len(new_conflicts) > 1 else ''} detected]", file=sys.stderr)
            except Exception:
                pass

        # Hard turn limit for refine mode (prevent runaway sessions)
        if is_refine and turn >= 30 and not should_auto_end:
            should_auto_end = True
            print(f"  [Hard limit: {turn} turns reached, auto-ending]", file=sys.stderr)

        # Auto-end
        if should_auto_end:
            end_msg = (
                f"\n修正维度已达到足够覆盖。自动结束。"
                if is_refine and lang == "zh"
                else "\n所有 9 个认知维度已达到足够覆盖。自动结束访谈。"
                if lang == "zh"
                else "\nSufficient coverage reached. Auto-ending."
            )
            print(end_msg)
            closing_hint = (
                "[INTERNAL] The interview is ending. Give a natural closing remark. Keep it brief and warm."
            )
            api_system = system_prompt + "\n\n" + closing_hint
            api_messages = _clean_messages(messages)
            response = client.messages.create(
                model="claude-sonnet-4-5-20250929",
                max_tokens=512,
                system=api_system,
                messages=api_messages,
            )
            ai_msg = response.content[0].text
            messages.append({"role": "assistant", "content": ai_msg})
            print(f"\nNous: {ai_msg}\n")
            break

        # Build AI response
        api_system = system_prompt + coverage_hint if coverage_hint else system_prompt
        api_messages = _clean_messages(messages)
        response = client.messages.create(
            model="claude-sonnet-4-5-20250929",
            max_tokens=1024,
            system=api_system,
            messages=api_messages,
        )
        ai_msg = response.content[0].text
        messages.append({"role": "assistant", "content": ai_msg})
        print(f"\nNous: {ai_msg}\n")

        remaining = max_turns - turn
        if remaining == 3:
            hint = "（还剩约 3 轮）" if lang == "zh" else "(~3 turns remaining)"
            print(f"  {hint}")

    return messages, accumulated_signals, accumulated_conflicts


def _check_coverage(transcript: str) -> dict:
    return call_api(DIMENSION_CHECK_PROMPT, transcript, COVERAGE_SCHEMA, "dimension_coverage")


def _format_transcript(messages: list[dict]) -> str:
    lines = []
    for m in messages:
        if m["content"] in ("（开始对话）", "(Start)", "(Start the conversation)"):
            continue
        role = "User" if m["role"] == "user" else "Interviewer"
        lines.append(f"{role}: {m['content']}")
    return "\n\n".join(lines)


def _format_recent_turns(messages: list[dict], n: int = 6) -> str:
    recent = [
        m for m in messages
        if m["content"] not in ("（开始对话）", "(Start)", "(Start the conversation)")
    ][-n:]
    lines = []
    for m in recent:
        role = "User" if m["role"] == "user" else "Interviewer"
        lines.append(f"{role}: {m['content']}")
    return "\n\n".join(lines)


def _clean_messages(messages: list[dict]) -> list[dict]:
    return [
        m for m in messages
        if m["content"] not in ("（开始对话）", "(Start)", "(Start the conversation)")
    ]


def _print_coverage(coverage: dict, focus_dims: list[str] | None = None) -> None:
    icons = {"high": "+++", "medium": " + ", "low": " - ", "none": "   "}
    print(f"\n--- Dimension Coverage ---")
    for d in coverage.get("dimensions", []):
        conf = d.get("confidence", "none")
        icon = icons.get(conf, " ? ")
        is_focus = focus_dims and d["name"] in focus_dims
        marker = " *" if is_focus else ""
        print(f"  [{icon}] {d['name']}: {conf}{marker}")
        if d.get("evidence_summary"):
            print(f"        {d['evidence_summary']}")
    if focus_dims:
        print(f"\n  * = focus dimension (needs HIGH)")
    readiness = coverage.get("overall_readiness", "?")
    print(f"\n  Model readiness: {readiness}")
    suggestion = coverage.get("suggested_next_topic", "")
    if suggestion:
        print(f"  Suggested next topic: {suggestion}")
    print()


def _override_blind_spots_confidence(coverage: dict, conflict_count: int) -> None:
    """Override Blind Spots confidence based on contradiction evidence.

    Blind spots can't reach high confidence through conversation alone (they're
    invisible to the person). Use conflict count as proxy: >=2 -> medium, >=4 -> high.
    """
    if conflict_count < 2:
        return
    rank = {"none": 0, "low": 1, "medium": 2, "high": 3}
    for d in coverage.get("dimensions", []):
        if d["name"] == "Blind Spots":
            if conflict_count >= 4:
                d["confidence"] = "high"
            elif rank.get(d.get("confidence", "none"), 0) < 2:
                d["confidence"] = "medium"
            break


# ── Post-Interview Pipeline ────────────────────────────────────


def run_post_interview(
    messages: list[dict],
    accumulated_signals: list[dict],
    accumulated_conflicts: list[dict],
    output_path: Path,
    transcript_path: Path | None,
    lang: str,
    existing_model: dict | None = None,
    focus_dims: list[str] | None = None,
) -> dict:
    """Post-interview: signal extraction + model building/refinement."""
    is_refine = existing_model is not None

    transcript = _format_transcript(messages)
    real_turns = sum(
        1 for m in messages
        if m["role"] == "user"
        and m["content"] not in ("（开始对话）", "(Start)", "(Start the conversation)")
    )

    if real_turns < 3:
        print("\nToo few turns for a meaningful model.", file=sys.stderr)
        sys.exit(1)

    # Save transcript
    if transcript_path:
        transcript_data = {
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "mode": "refine" if is_refine else "new",
            "focus_dims": focus_dims,
            "turns": real_turns,
            "messages": messages,
            "inline_signals": accumulated_signals,
            "inline_conflicts": accumulated_conflicts,
        }
        transcript_path.write_text(
            json.dumps(transcript_data, indent=2, ensure_ascii=False),
            encoding="utf-8",
        )
        print(f"\nTranscript saved to {transcript_path}", file=sys.stderr)

    # Full signal extraction
    print("\nRunning full signal extraction on transcript...", file=sys.stderr)
    try:
        from signal_extractor import EXTRACT_PROMPT, SIGNAL_SCHEMA
        full_signals = call_api(
            EXTRACT_PROMPT.replace("{model_context}", ""),
            transcript, SIGNAL_SCHEMA, "signal_extraction",
        )
        all_signals = full_signals.get("signals", [])
        all_conflicts = full_signals.get("stated_vs_behavioral_conflicts", [])
        print(f"  Full extraction: {len(all_signals)} signals, {len(all_conflicts)} conflicts", file=sys.stderr)

        signal_output = output_path.parent / f"interview_signals_{output_path.stem}.json"
        signal_data = {
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "source": "interview_refine" if is_refine else "interview",
            "turns": real_turns,
            "inline_signals_count": len(accumulated_signals),
            "full_extraction": full_signals,
        }
        signal_output.write_text(
            json.dumps(signal_data, indent=2, ensure_ascii=False), encoding="utf-8",
        )
        print(f"  Signals saved to {signal_output}", file=sys.stderr)
    except Exception as e:
        print(f"  Signal extraction failed: {e}", file=sys.stderr)

    # Build or refine model
    if is_refine:
        print("\nRefining cognitive model...", file=sys.stderr)
        focus_str = "\n".join(f"- {d}" for d in (focus_dims or []))
        prompt = REFINE_MODEL_PROMPT.format(
            existing_model=json.dumps(existing_model, indent=2, ensure_ascii=False),
            focus_dims=focus_str or "(all dimensions)",
        )
        model = call_api(prompt, transcript, MODEL_SCHEMA, "cognitive_model")
    else:
        print("\nBuilding cognitive model from interview...", file=sys.stderr)
        model = call_api(BUILD_MODEL_PROMPT, transcript, MODEL_SCHEMA, "cognitive_model")

    output_path.write_text(
        json.dumps(model, indent=2, ensure_ascii=False), encoding="utf-8"
    )
    print(f"Cognitive model saved to {output_path}", file=sys.stderr)

    # Print summary
    print(f"\n{'='*60}")
    header = "修正后的认知模型" if is_refine and lang == "zh" else "认知模型" if lang == "zh" else "COGNITIVE MODEL"
    print(header)
    print(f"{'='*60}")
    for dim in model.get("dimensions", []):
        conf = dim.get("confidence", "?")
        is_focus = focus_dims and dim["name"] in focus_dims
        marker = " [REFINED]" if is_focus else ""
        print(f"\n[{conf.upper()}] {dim['name']}{marker}")
        print(f"  {dim['description']}")
        for pred in dim.get("behavioral_predictions", []):
            print(f"  -> {pred}")
    print(f"\nSummary: {model.get('summary', 'N/A')}")

    # Print signal summary
    if accumulated_signals:
        print(f"\n{'='*60}")
        print(f"INLINE SIGNALS ({len(accumulated_signals)} extracted during conversation)")
        print(f"{'='*60}")
        type_counts: dict[str, int] = {}
        track_counts: dict[str, int] = {"stated": 0, "behavioral": 0}
        for s in accumulated_signals:
            st = s.get("signal_type", "?")
            type_counts[st] = type_counts.get(st, 0) + 1
            tr = s.get("track", "?")
            if tr in track_counts:
                track_counts[tr] += 1
        print(f"  Types: {type_counts}")
        print(f"  Tracks: {track_counts}")
    if accumulated_conflicts:
        print(f"\n  CONFLICTS ({len(accumulated_conflicts)}):")
        for i, c in enumerate(accumulated_conflicts, 1):
            print(f"  #{i}: stated='{c.get('stated_claim', '?')}' vs actual='{c.get('actual_behavior', '?')}'")

    print(f"\n{'='*60}")
    print(f"\nNext steps:")
    print(f"  1. Generate predictions: python predictor.py predict {output_path}")
    print(f"  2. Run quiz: python predictor.py quiz predictions.json")

    return model


# ── Main ───────────────────────────────────────────────────────


def main():
    parser = argparse.ArgumentParser(
        description="Nous — Interactive cognitive interview"
    )
    parser.add_argument(
        "--subject", type=str, default="jessie",
        help="Subject name for data isolation (default: jessie)",
    )
    parser.add_argument(
        "--turns", type=int, default=25,
        help="Maximum conversation turns (default: 25)",
    )
    parser.add_argument(
        "--output", type=Path, default=None,
        help="Output path for cognitive model JSON",
    )
    parser.add_argument(
        "--lang", choices=["zh", "en"], default="zh",
        help="Interview language (default: zh)",
    )
    parser.add_argument(
        "--transcript", type=Path, default=None,
        help="Save conversation transcript to this path",
    )
    parser.add_argument(
        "--model", type=Path, default=None,
        help="Existing cognitive model to refine (enables refine mode)",
    )
    parser.add_argument(
        "--focus", type=str, default=None,
        help='Comma-separated dimensions to focus on (e.g. "Decision Architecture,Blind Spots")',
    )
    args = parser.parse_args()

    # Subject data directory
    subject_dir = Path(__file__).resolve().parent.parent / "data" / "subjects" / args.subject
    subject_dir.mkdir(parents=True, exist_ok=True)
    print(f"Subject: {args.subject} → {subject_dir}", file=sys.stderr)

    # Load existing model if provided
    existing_model = None
    if args.model:
        existing_model = json.loads(args.model.read_text(encoding="utf-8"))
        print(f"Loaded existing model from {args.model}", file=sys.stderr)

    # Parse focus dimensions
    focus_dims = None
    if args.focus:
        focus_dims = [d.strip() for d in args.focus.split(",") if d.strip()]

    # Default output path (inside subject dir)
    ts = datetime.now().strftime("%Y%m%d_%H%M")
    mode = "refined" if existing_model else "cognitive"
    if args.output is None:
        args.output = subject_dir / f"{mode}_model_{ts}.json"
    if args.transcript is None:
        args.transcript = subject_dir / f"interview_transcript_{ts}.json"

    # Run interview
    messages, signals, conflicts = run_interview(
        max_turns=args.turns,
        lang=args.lang,
        existing_model=existing_model,
        focus_dims=focus_dims,
    )

    # Post-interview pipeline
    run_post_interview(
        messages=messages,
        accumulated_signals=signals,
        accumulated_conflicts=conflicts,
        output_path=args.output,
        transcript_path=args.transcript,
        lang=args.lang,
        existing_model=existing_model,
        focus_dims=focus_dims,
    )


if __name__ == "__main__":
    main()
