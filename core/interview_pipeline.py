"""Post-interview pipeline — signal extraction + model building/refinement.

Takes the finished interview messages and accumulated inline signals, saves
the transcript, runs full signal extraction, then builds (or refines) the
cognitive model and prints the summary report.
"""

from __future__ import annotations

import json
import sys
from datetime import datetime, timezone
from pathlib import Path

from api_utils import call_api
from interview_prompts import REFINE_MODEL_PROMPT
from interview_utils import count_real_user_turns, format_transcript
from predictor_prompts import BUILD_MODEL_PROMPT, MODEL_SCHEMA


def _save_transcript(
    transcript_path: Path,
    messages: list[dict],
    accumulated_signals: list[dict],
    accumulated_conflicts: list[dict],
    is_refine: bool,
    focus_dims: list[str] | None,
    real_turns: int,
) -> None:
    """Save the raw conversation transcript with inline extraction results."""
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


def _run_full_signal_extraction(
    transcript: str,
    output_path: Path,
    accumulated_signals: list[dict],
    is_refine: bool,
    real_turns: int,
) -> None:
    """Run full signal extraction on the transcript and save results."""
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


def _build_or_refine_model(
    transcript: str,
    existing_model: dict | None,
    focus_dims: list[str] | None,
) -> dict:
    """Build a new cognitive model, or refine an existing one."""
    if existing_model is not None:
        print("\nRefining cognitive model...", file=sys.stderr)
        focus_str = "\n".join(f"- {d}" for d in (focus_dims or []))
        prompt = REFINE_MODEL_PROMPT.format(
            existing_model=json.dumps(existing_model, indent=2, ensure_ascii=False),
            focus_dims=focus_str or "(all dimensions)",
        )
        return call_api(prompt, transcript, MODEL_SCHEMA, "cognitive_model")
    print("\nBuilding cognitive model from interview...", file=sys.stderr)
    return call_api(BUILD_MODEL_PROMPT, transcript, MODEL_SCHEMA, "cognitive_model")


def _print_model_summary(
    model: dict,
    is_refine: bool,
    lang: str,
    focus_dims: list[str] | None,
) -> None:
    """Print the cognitive model summary report."""
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


def _print_signal_summary(
    accumulated_signals: list[dict],
    accumulated_conflicts: list[dict],
) -> None:
    """Print counts of inline signals and detected conflicts."""
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

    transcript = format_transcript(messages)
    real_turns = count_real_user_turns(messages)

    if real_turns < 3:
        print("\nToo few turns for a meaningful model.", file=sys.stderr)
        sys.exit(1)

    if transcript_path:
        _save_transcript(
            transcript_path, messages, accumulated_signals,
            accumulated_conflicts, is_refine, focus_dims, real_turns,
        )

    _run_full_signal_extraction(
        transcript, output_path, accumulated_signals, is_refine, real_turns,
    )

    model = _build_or_refine_model(transcript, existing_model, focus_dims)
    output_path.write_text(
        json.dumps(model, indent=2, ensure_ascii=False), encoding="utf-8"
    )
    print(f"Cognitive model saved to {output_path}", file=sys.stderr)

    _print_model_summary(model, is_refine, lang, focus_dims)
    _print_signal_summary(accumulated_signals, accumulated_conflicts)

    print(f"\n{'='*60}")
    print(f"\nNext steps:")
    print(f"  1. Generate predictions: python predictor.py predict {output_path}")
    print(f"  2. Run quiz: python predictor.py quiz predictions.json")

    return model
