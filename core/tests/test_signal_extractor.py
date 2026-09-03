"""Unit tests for signal history I/O and text chunking (no API calls)."""

import json

import pytest

from signal_extractor import estimate_tokens, load_history, save_history, split_into_chunks


@pytest.mark.unit
def test_history_roundtrip(tmp_path):
    path = tmp_path / "signals_history.json"
    history = [{"signals": [{"signal_type": "pushback", "证据": "中文内容"}]}]

    save_history(path, history)
    loaded = load_history(path)

    assert loaded == history
    # ensure_ascii=False：中文按原样存储，不转义
    assert "中文内容" in path.read_text(encoding="utf-8")


@pytest.mark.unit
def test_load_history_missing_file_returns_empty(tmp_path):
    assert load_history(tmp_path / "nope.json") == []


@pytest.mark.unit
def test_split_into_chunks_respects_max_chars():
    paragraphs = [f"段落{i} " + "x" * 50 for i in range(20)]
    text = "\n\n".join(paragraphs)

    chunks = split_into_chunks(text, max_chars=200)

    assert len(chunks) > 1
    assert all(len(c) <= 200 for c in chunks)
    # 重新拼接后内容无丢失
    assert "\n\n".join(chunks) == text


@pytest.mark.unit
def test_split_into_chunks_short_text_single_chunk():
    assert split_into_chunks("短文本", max_chars=100) == ["短文本"]


@pytest.mark.unit
def test_estimate_tokens_positive():
    assert estimate_tokens("hello world") > 0
