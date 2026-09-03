"""Unit tests for transcript formatting helpers (pure functions)."""

import pytest

from interview_utils import (
    clean_messages,
    count_real_user_turns,
    format_recent_turns,
    format_transcript,
)

MESSAGES = [
    {"role": "user", "content": "（开始对话）"},
    {"role": "assistant", "content": "你好，想聊聊什么？"},
    {"role": "user", "content": "最近在纠结换工作"},
    {"role": "assistant", "content": "说说看"},
]


@pytest.mark.unit
def test_format_transcript_skips_start_sentinel():
    text = format_transcript(MESSAGES)
    assert "（开始对话）" not in text
    assert "User: 最近在纠结换工作" in text
    assert "Interviewer: 你好，想聊聊什么？" in text


@pytest.mark.unit
def test_format_recent_turns_limits_count():
    many = MESSAGES + [
        {"role": "user", "content": f"消息{i}"} for i in range(10)
    ]
    text = format_recent_turns(many, n=2)
    assert text == "User: 消息8\n\nUser: 消息9"


@pytest.mark.unit
def test_clean_messages_returns_new_list_without_sentinels():
    cleaned = clean_messages(MESSAGES)
    assert len(cleaned) == 3
    assert cleaned is not MESSAGES
    assert all(m["content"] != "（开始对话）" for m in cleaned)


@pytest.mark.unit
def test_count_real_user_turns():
    assert count_real_user_turns(MESSAGES) == 1
    assert count_real_user_turns([]) == 0
