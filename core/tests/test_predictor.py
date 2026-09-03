"""Unit tests for predictor evidence formatting/loading (no API calls)."""

import json

import pytest

from predictor import _format_contradictions, _format_signals, _load_evidence


@pytest.mark.unit
def test_format_contradictions_empty():
    assert _format_contradictions([]) == ""


@pytest.mark.unit
def test_format_contradictions_renders_pairs():
    text = _format_contradictions([
        {"stated_claim": "我很理性", "actual_behavior": "冲动消费", "blind_spot_evidence": "账单"},
    ])
    assert "KNOWN CONTRADICTIONS" in text
    assert '1. Stated: "我很理性" → Actual: "冲动消费" (账单)' in text


@pytest.mark.unit
def test_format_signals_filters_low_confidence():
    signals = [
        {"signal_type": "pushback", "track": "behavioral", "cognitive_dimension": "DA",
         "evidence": "强信号", "confidence": 0.9},
        {"signal_type": "hedge", "track": "behavioral", "cognitive_dimension": "RU",
         "evidence": "弱信号", "confidence": 0.5},
    ]
    text = _format_signals(signals)
    assert "强信号" in text
    assert "弱信号" not in text


@pytest.mark.unit
def test_format_signals_all_low_confidence_returns_empty():
    assert _format_signals([{"confidence": 0.3}]) == ""


@pytest.mark.unit
def test_load_evidence_from_history_list(tmp_path):
    history = [
        {
            "signals": [{"signal_type": "decision", "confidence": 0.9}],
            "stated_vs_behavioral_conflicts": [{"stated_claim": "a", "actual_behavior": "b"}],
        },
        {
            "signals": [{"signal_type": "hedge", "confidence": 0.8}],
            "stated_vs_behavioral_conflicts": [],
        },
    ]
    path = tmp_path / "history.json"
    path.write_text(json.dumps(history, ensure_ascii=False), encoding="utf-8")

    conflicts, signals = _load_evidence(path, None)

    assert len(conflicts) == 1
    assert len(signals) == 2


@pytest.mark.unit
def test_load_evidence_missing_files():
    conflicts, signals = _load_evidence(None, None)
    assert conflicts == []
    assert signals == []
