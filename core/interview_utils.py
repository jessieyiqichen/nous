"""Transcript formatting helpers shared by the interview modules.

Pure functions — no API calls, no I/O.
"""

from __future__ import annotations

# Synthetic first-turn messages that should never appear in transcripts.
START_SENTINELS = ("（开始对话）", "(Start)", "(Start the conversation)")


def format_transcript(messages: list[dict]) -> str:
    """Format the full conversation as a plain-text transcript."""
    lines = []
    for m in messages:
        if m["content"] in START_SENTINELS:
            continue
        role = "User" if m["role"] == "user" else "Interviewer"
        lines.append(f"{role}: {m['content']}")
    return "\n\n".join(lines)


def format_recent_turns(messages: list[dict], n: int = 6) -> str:
    """Format only the last `n` real messages as a transcript."""
    recent = [m for m in messages if m["content"] not in START_SENTINELS][-n:]
    lines = []
    for m in recent:
        role = "User" if m["role"] == "user" else "Interviewer"
        lines.append(f"{role}: {m['content']}")
    return "\n\n".join(lines)


def clean_messages(messages: list[dict]) -> list[dict]:
    """Return messages with synthetic start sentinels removed (new list)."""
    return [m for m in messages if m["content"] not in START_SENTINELS]


def count_real_user_turns(messages: list[dict]) -> int:
    """Count user turns, excluding synthetic start sentinels."""
    return sum(
        1 for m in messages
        if m["role"] == "user" and m["content"] not in START_SENTINELS
    )
