"""Hybrid signal extractor: local DistilBERT + API fallback.

Uses a trained DistilBERT classifier for high-frequency signal types
(inquiry, pushback, elaboration, deflection) and falls back to the
Claude API only when low-frequency signals are potentially detected.

Reduces API calls by 60%+ while preserving signal coverage.

Usage:
    from hybrid_extractor import hybrid_extract
    result = hybrid_extract(conversation_text)
"""

from __future__ import annotations

import re
import sys
from pathlib import Path
from typing import Any

import numpy as np

# ── Paths ─────────────────────────────────────────────────────

PROJECT_ROOT = Path(__file__).resolve().parent.parent
ML_DIR = PROJECT_ROOT / "ml"
DEFAULT_MODEL_PATH = ML_DIR / "output" / "best_model"

# Add ml/ to path for config imports
sys.path.insert(0, str(ML_DIR))
from config import LABEL_NAMES, NUM_LABELS, THRESHOLD, MAX_LENGTH, IDX_TO_LABEL

# ── Constants ─────────────────────────────────────────────────

# High-frequency classes where DistilBERT performs well (F1 > 0.4)
HIGH_FREQ_LABELS = {"inquiry", "pushback", "elaboration", "deflection"}
HIGH_FREQ_INDICES = frozenset(
    i for i, name in enumerate(LABEL_NAMES) if name in HIGH_FREQ_LABELS
)
LOW_FREQ_INDICES = frozenset(
    i for i, name in enumerate(LABEL_NAMES) if name not in HIGH_FREQ_LABELS
)

# Lower threshold for detecting potential low-freq signals (triggers API fallback)
LOW_FREQ_TRIGGER_THRESHOLD = 0.4

# ── Lazy model singleton ─────────────────────────────────────

_cached_model = None


def _load_model(model_path: Path = DEFAULT_MODEL_PATH):
    """Load DistilBERT model and tokenizer (lazy singleton)."""
    global _cached_model
    if _cached_model is not None:
        return _cached_model

    import torch
    from transformers import AutoModelForSequenceClassification, AutoTokenizer

    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    tokenizer = AutoTokenizer.from_pretrained(str(model_path))
    model = AutoModelForSequenceClassification.from_pretrained(str(model_path))
    model.to(device)
    model.eval()

    _cached_model = (model, tokenizer, device)
    return _cached_model


# ── Turn parsing ──────────────────────────────────────────────

_TURN_PATTERN = re.compile(
    r"\[Turn\s+(\d+)\]\s+(USER|ASSISTANT):\s*\n(.*?)(?=\n\[Turn\s+\d+\]|\Z)",
    re.DOTALL,
)


def _parse_turns(text: str) -> list[tuple[int, str, str]]:
    """Parse conversation into (turn_number, role, content) tuples."""
    turns = []
    for m in _TURN_PATTERN.finditer(text):
        turn_num = int(m.group(1))
        role = m.group(2)
        content = m.group(3).strip()
        if content:
            turns.append((turn_num, role, content))
    return turns


# ── Local inference ───────────────────────────────────────────


def _local_predict(
    turns: list[tuple[int, str, str]],
    model,
    tokenizer,
    device,
) -> list[dict]:
    """Run local DistilBERT inference on each user message.

    Returns a list of dicts, one per user message:
        {
            "turn_num": int,
            "message": str,
            "probs": np.ndarray of shape (NUM_LABELS,),
            "detected": list[str],  # label names above THRESHOLD
        }
    """
    import torch

    results = []
    # Build context from preceding turns
    context_parts: list[str] = []

    for turn_num, role, content in turns:
        if role == "USER":
            context_str = " ".join(context_parts[-4:])  # last 4 turns as context
            input_text = f"{context_str} [SEP] {content}" if context_str else content

            encoding = tokenizer(
                input_text,
                padding="max_length",
                truncation=True,
                max_length=MAX_LENGTH,
                return_tensors="pt",
            )
            encoding = {k: v.to(device) for k, v in encoding.items()}

            with torch.no_grad():
                outputs = model(**encoding)
                logits = outputs.logits.cpu().numpy()[0]

            probs = 1 / (1 + np.exp(-logits))  # sigmoid
            detected = [
                IDX_TO_LABEL[i]
                for i in range(NUM_LABELS)
                if probs[i] >= THRESHOLD
            ]

            results.append({
                "turn_num": turn_num,
                "message": content,
                "probs": probs,
                "detected": detected,
            })

        # Accumulate context for subsequent messages
        role_prefix = "User" if role == "USER" else "Assistant"
        context_parts.append(f"{role_prefix}: {content[:200]}")

    return results


# ── Fallback decision ────────────────────────────────────────


def _needs_api_fallback(local_results: list[dict]) -> bool:
    """Decide if this conversation needs API extraction.

    Returns True if any user message has a low-frequency signal with
    probability >= LOW_FREQ_TRIGGER_THRESHOLD (potential signal that
    DistilBERT isn't confident enough to classify reliably).
    """
    for result in local_results:
        probs = result["probs"]
        for idx in LOW_FREQ_INDICES:
            if probs[idx] >= LOW_FREQ_TRIGGER_THRESHOLD:
                return True
    return False


# ── Output builders ───────────────────────────────────────────


def _build_local_result(local_results: list[dict]) -> dict:
    """Build signal extraction output from local predictions.

    Produces a simplified version of the full SIGNAL_SCHEMA output.
    Fields that require NLG (interpretation, cognitive_dimension) are left empty.
    """
    signals = []
    for result in local_results:
        for label_name in result["detected"]:
            idx = next(
                i for i, n in enumerate(LABEL_NAMES) if n == label_name
            )
            signals.append({
                "signal_type": label_name,
                "track": "behavioral",
                "turn_range": f"Turn {result['turn_num']}",
                "evidence": result["message"][:200],
                "cognitive_dimension": "",
                "interpretation": "",
                "confidence": round(float(result["probs"][idx]), 3),
            })

    return {
        "signals": signals,
        "stated_vs_behavioral_conflicts": [],
        "t3_relevant_signals": [],
        "conversation_summary": "",
    }


def _build_api_result(
    text: str,
    model_path: Path | None,
) -> dict:
    """Fall back to API extraction (Haiku model for cost savings)."""
    # Import from signal_extractor (avoid circular imports at module level)
    sys.path.insert(0, str(PROJECT_ROOT / "core"))
    from signal_extractor import (
        EXTRACT_PROMPT,
        SIGNAL_SCHEMA,
        call_api,
        _build_model_context,
        split_into_chunks,
        _merge_chunk_results,
        MAX_CONTENT_TOKENS,
        MODEL_HAIKU,
    )

    model_context = _build_model_context(model_path)
    prompt = EXTRACT_PROMPT.format(model_context=model_context)

    # Sample large conversations instead of full chunking
    SAMPLE_THRESHOLD = 100_000
    extract_text = text
    if len(text) > SAMPLE_THRESHOLD:
        sample_size = MAX_CONTENT_TOKENS // 3
        beginning = text[:sample_size]
        mid_start = len(text) // 2 - sample_size // 2
        middle = text[mid_start:mid_start + sample_size]
        ending = text[-sample_size:]
        extract_text = (
            beginning
            + "\n\n[... MIDDLE SECTION ...]\n\n"
            + middle
            + "\n\n[... LATER SECTION ...]\n\n"
            + ending
        )

    return call_api(
        prompt, extract_text, SIGNAL_SCHEMA, "signal_extraction",
        model=MODEL_HAIKU,
    )


# ── Main entry point ─────────────────────────────────────────


def hybrid_extract(
    text: str,
    model_path: Path | None = None,
    history_path: Path | None = None,
) -> dict:
    """Extract cognitive signals using local model + API fallback.

    Args:
        text: Conversation text with [Turn N] USER/ASSISTANT: format.
        model_path: Path to cognitive model JSON for T3 comparison
            (passed to API if fallback is needed).
        history_path: Unused, kept for interface compatibility.

    Returns:
        dict with keys:
            - signals, stated_vs_behavioral_conflicts, t3_relevant_signals,
              conversation_summary (same schema as signal_extractor)
            - extraction_method: "local" | "api"
    """
    # 1. Parse turns
    turns = _parse_turns(text)
    user_turns = [t for t in turns if t[1] == "USER"]

    if not user_turns:
        return {
            "signals": [],
            "stated_vs_behavioral_conflicts": [],
            "t3_relevant_signals": [],
            "conversation_summary": "",
            "extraction_method": "local",
        }

    # 2. Load model and run local inference
    try:
        model, tokenizer, device = _load_model()
        local_results = _local_predict(turns, model, tokenizer, device)
    except Exception as e:
        # Model loading or inference failed — fall back to API
        print(f"  Local model error: {e}, falling back to API", file=sys.stderr)
        result = _build_api_result(text, model_path)
        result["extraction_method"] = "api"
        return result

    # 3. Decide: local-only or API fallback?
    if _needs_api_fallback(local_results):
        print(f"  Low-freq signal detected locally, using API extraction", file=sys.stderr)
        result = _build_api_result(text, model_path)
        result["extraction_method"] = "api"
        return result

    # 4. Local-only path
    result = _build_local_result(local_results)
    result["extraction_method"] = "local"
    return result
