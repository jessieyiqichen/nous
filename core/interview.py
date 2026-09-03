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
from datetime import datetime
from pathlib import Path

from api_utils import call_api, call_chat
from dim_coverage import check_coverage, override_blind_spots_confidence, print_coverage
from interview_pipeline import run_post_interview
from interview_prompts import (
    DIM_NAMES_ZH,
    INLINE_SIGNAL_PROMPT,
    INLINE_SIGNAL_SCHEMA,
    INTERVIEWER_SYSTEM_PROMPT_EN,
    INTERVIEWER_SYSTEM_PROMPT_ZH,
    REFINE_PROMPT_ADDON_EN,
    REFINE_PROMPT_ADDON_ZH,
)
from interview_utils import clean_messages, format_recent_turns, format_transcript

# ── Interview Loop Helpers ─────────────────────────────────────


def _build_system_prompt(
    lang: str,
    existing_model: dict | None,
    focus_dims: list[str] | None,
) -> tuple[str, list[str] | None]:
    """Compose the interviewer system prompt; resolve default focus dims."""
    system_prompt = (
        INTERVIEWER_SYSTEM_PROMPT_ZH if lang == "zh" else INTERVIEWER_SYSTEM_PROMPT_EN
    )
    if existing_model is not None:
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
    return system_prompt, focus_dims


def _print_header(lang: str, is_refine: bool, focus_dims: list[str] | None) -> None:
    """Print the interview banner and quit hint."""
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


def _show_status(messages: list[dict], focus_dims: list[str] | None) -> None:
    """Handle the /status command: print current dimension coverage."""
    transcript = format_transcript(messages)
    print("\nChecking dimension coverage...", file=sys.stderr)
    coverage = check_coverage(transcript)
    print_coverage(coverage, focus_dims)


def _assess_coverage(
    messages: list[dict],
    turn: int,
    is_refine: bool,
    focus_dims: list[str] | None,
    conflict_count: int,
) -> tuple[str, bool]:
    """Check dimension coverage; return (coverage_hint, should_auto_end)."""
    coverage_hint = ""
    should_auto_end = False
    transcript = format_transcript(messages)
    try:
        coverage = check_coverage(transcript)
        override_blind_spots_confidence(coverage, conflict_count)
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
    except Exception as e:
        print(f"  [覆盖度检查失败，跳过本轮: {e}]", file=sys.stderr)
    return coverage_hint, should_auto_end


def _extract_inline_signals(messages: list[dict]) -> tuple[list[dict], list[dict]]:
    """Extract cognitive signals from recent turns; return (signals, conflicts)."""
    try:
        recent_transcript = format_recent_turns(messages, n=6)
        inline_result = call_api(
            INLINE_SIGNAL_PROMPT, recent_transcript,
            INLINE_SIGNAL_SCHEMA, "inline_signals",
        )
        return inline_result.get("signals", []), inline_result.get("conflicts", [])
    except Exception as e:
        print(f"  [信号提取失败，跳过本轮: {e}]", file=sys.stderr)
        return [], []


def _run_turn_analysis(
    messages: list[dict],
    turn: int,
    is_refine: bool,
    focus_dims: list[str] | None,
    accumulated_signals: list[dict],
    accumulated_conflicts: list[dict],
) -> tuple[str, bool]:
    """Coverage check + inline signal extraction for one turn."""
    coverage_hint, should_auto_end = _assess_coverage(
        messages, turn, is_refine, focus_dims, len(accumulated_conflicts)
    )
    new_signals, new_conflicts = _extract_inline_signals(messages)
    if new_signals:
        accumulated_signals.extend(new_signals)
        count = len(new_signals)
        print(f"  [+{count} signal{'s' if count > 1 else ''} extracted]", file=sys.stderr)
    if new_conflicts:
        accumulated_conflicts.extend(new_conflicts)
        print(f"  [!{len(new_conflicts)} conflict{'s' if len(new_conflicts) > 1 else ''} detected]", file=sys.stderr)
    return coverage_hint, should_auto_end


def _close_interview(
    system_prompt: str,
    messages: list[dict],
    is_refine: bool,
    lang: str,
) -> None:
    """Auto-end: print the end message and get a natural closing remark."""
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
    api_messages = clean_messages(messages)
    ai_msg = call_chat(api_system, api_messages, max_tokens=512)
    messages.append({"role": "assistant", "content": ai_msg})
    print(f"\nNous: {ai_msg}\n")


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
    system_prompt, focus_dims = _build_system_prompt(lang, existing_model, focus_dims)

    messages: list[dict] = []
    accumulated_signals: list[dict] = []
    accumulated_conflicts: list[dict] = []

    _print_header(lang, is_refine, focus_dims)

    # Get initial AI message
    start_content = "（开始对话）" if lang == "zh" else "(Start the conversation)"
    ai_msg = call_chat(system_prompt, [{"role": "user", "content": start_content}])
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
            _show_status(messages, focus_dims)
            continue

        turn += 1
        messages.append({"role": "user", "content": user_input})

        # Every turn from turn 3 onward: coverage check + inline signal extraction
        coverage_hint = ""
        should_auto_end = False
        if turn >= 3:
            coverage_hint, should_auto_end = _run_turn_analysis(
                messages, turn, is_refine, focus_dims,
                accumulated_signals, accumulated_conflicts,
            )

        # Hard turn limit for refine mode (prevent runaway sessions)
        if is_refine and turn >= 30 and not should_auto_end:
            should_auto_end = True
            print(f"  [Hard limit: {turn} turns reached, auto-ending]", file=sys.stderr)

        if should_auto_end:
            _close_interview(system_prompt, messages, is_refine, lang)
            break

        # Build AI response
        api_system = system_prompt + coverage_hint if coverage_hint else system_prompt
        api_messages = clean_messages(messages)
        ai_msg = call_chat(api_system, api_messages)
        messages.append({"role": "assistant", "content": ai_msg})
        print(f"\nNous: {ai_msg}\n")

        remaining = max_turns - turn
        if remaining == 3:
            hint = "（还剩约 3 轮）" if lang == "zh" else "(~3 turns remaining)"
            print(f"  {hint}")

    return messages, accumulated_signals, accumulated_conflicts


# ── Main ───────────────────────────────────────────────────────


def main():
    parser = argparse.ArgumentParser(
        description="Nous — Interactive cognitive interview"
    )
    parser.add_argument(
        "--subject", type=str, default=os.environ.get("NOUS_SUBJECT", "default"),
        help="Subject name for data isolation (default: $NOUS_SUBJECT or 'default')",
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
