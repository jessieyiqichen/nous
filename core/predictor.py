"""Behavioral Prediction Validator — cognitive model accuracy measurement.

The core idea: if an AI truly "understands" someone, it should be able to
PREDICT their behavior, not just describe their traits.

Pipeline:
1. Ingest conversation / cognitive profile → build cognitive model
2. Generate tiered prediction questions (preference → reasoning → blind spot)
3. Present questions to the subject
4. Compare predictions with actual responses
5. Compute accuracy per tier → accuracy gradient = the finding

Usage:
    python predictor.py build   <profile.md>          → cognitive_model.json
    python predictor.py predict <cognitive_model.json> → predictions.json
    python predictor.py quiz    <predictions.json>     → interactive quiz
    python predictor.py score   <predictions.json>     → accuracy report
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

# ── Prompts & Schemas ───────────────────────────────────────────
# 单一来源见 predictor_prompts.py（core/prompts/ 与 core/schemas/ 与 web 端共享）。
# BUILD_MODEL_PROMPT / MODEL_SCHEMA / CONTEXT_SCHEMA 在此 re-export，
# interview.py 等模块从 predictor import 它们。

from predictor_prompts import (  # noqa: F401  (re-exported)
    BUILD_MODEL_PROMPT,
    CONTEXT_SCHEMA,
    GENERATE_PREDICTIONS_PROMPT,
    MODEL_SCHEMA,
    PREDICTION_SCHEMA,
    SCORE_PROMPT,
    SCORE_SCHEMA,
)

# ── API helpers ─────────────────────────────────────────────────
# Shared API layer (re-exported: other modules may import call_api from here)
from api_utils import call_api  # noqa: F401


# ── Commands ────────────────────────────────────────────────────

def _format_contradictions(conflicts: list) -> str:
    """Format known contradictions as a prompt section."""
    if not conflicts:
        return ""
    lines = []
    for i, c in enumerate(conflicts, 1):
        lines.append(f'{i}. Stated: "{c.get("stated_claim", "")}" → Actual: "{c.get("actual_behavior", "")}" ({c.get("blind_spot_evidence", "")})')
    return "\n\nKNOWN CONTRADICTIONS (from observed behavioral data — use these to ground your analysis):\n" + "\n".join(lines) + "\n"


def _format_signals(signals: list) -> str:
    """Format known signals as a prompt section (top 20 high-confidence)."""
    high = [s for s in signals if isinstance(s.get("confidence"), (int, float)) and s["confidence"] >= 0.8][:20]
    if not high:
        return ""
    lines = []
    for i, s in enumerate(high, 1):
        ev = str(s.get("evidence", ""))[:150]
        lines.append(f'{i}. [{s.get("signal_type", "?")}/{s.get("track", "?")}] {s.get("cognitive_dimension", "?")}: "{ev}" (conf: {s.get("confidence")})')
    return "\n\nKNOWN BEHAVIORAL SIGNALS (from real conversation analysis):\n" + "\n".join(lines) + "\n"


def _load_evidence(conflicts_path: Path | None, signals_path: Path | None) -> tuple[list, list]:
    """Load conflicts and signals from files."""
    conflicts = []
    signals = []
    if conflicts_path and conflicts_path.exists():
        data = json.loads(conflicts_path.read_text())
        if isinstance(data, list):
            # signals_history.json format: list of extraction records
            for record in data:
                conflicts.extend(record.get("stated_vs_behavioral_conflicts", []))
                signals.extend(record.get("signals", []))
        elif isinstance(data, dict):
            conflicts = data.get("stated_vs_behavioral_conflicts", data.get("conflicts", []))
            signals = data.get("signals", [])
    if signals_path and signals_path.exists():
        data = json.loads(signals_path.read_text())
        if isinstance(data, list):
            for record in data:
                signals.extend(record.get("signals", []))
    return conflicts, signals


def cmd_build(profile_path: Path, output: Path, conflicts_path: Path | None = None, signals_path: Path | None = None):
    """Build cognitive model from profile/conversation."""
    text = profile_path.read_text()
    conflicts, signals = _load_evidence(conflicts_path, signals_path)
    evidence = _format_contradictions(conflicts) + _format_signals(signals)
    print("Building cognitive model...", file=sys.stderr)
    if conflicts or signals:
        print(f"  Injecting {len(conflicts)} contradictions + {len(signals)} signals", file=sys.stderr)
    model = call_api(BUILD_MODEL_PROMPT, text + evidence, MODEL_SCHEMA, "cognitive_model")
    output.write_text(json.dumps(model, indent=2, ensure_ascii=False))
    print(f"Cognitive model saved to {output}", file=sys.stderr)

    # Print summary
    print(f"\n{'='*50}")
    print("COGNITIVE MODEL")
    print(f"{'='*50}")
    for dim in model["dimensions"]:
        conf = dim["confidence"]
        print(f"\n[{conf.upper()}] {dim['name']}")
        print(f"  {dim['description']}")
        for pred in dim["behavioral_predictions"]:
            print(f"  → {pred}")
    print(f"\nSummary: {model['summary']}")


def cmd_predict(model_path: Path, output: Path, conflicts_path: Path | None = None, signals_path: Path | None = None):
    """Generate tiered predictions from cognitive model."""
    model = json.loads(model_path.read_text())
    conflicts, signals = _load_evidence(conflicts_path, signals_path)
    evidence = _format_contradictions(conflicts)
    model_text = json.dumps(model, indent=2, ensure_ascii=False) + evidence
    print("Generating predictions...", file=sys.stderr)
    if conflicts:
        print(f"  Injecting {len(conflicts)} contradictions into prediction generation", file=sys.stderr)
    predictions = call_api(GENERATE_PREDICTIONS_PROMPT, model_text, PREDICTION_SCHEMA, "predictions")
    output.write_text(json.dumps(predictions, indent=2, ensure_ascii=False))
    print(f"Predictions saved to {output}", file=sys.stderr)

    # Print summary
    t1 = predictions.get("tier_1", [])
    t2 = predictions.get("tier_2", [])
    t3 = predictions.get("tier_3", [])
    print(f"\nGenerated {len(t1)} preference + {len(t2)} reasoning + {len(t3)} blind spot predictions")


def cmd_quiz(predictions_path: Path, output: Path, conflicts_path: Path | None = None):
    """Interactive quiz — present predictions to subject, collect responses."""
    predictions = json.loads(predictions_path.read_text())
    responses: dict = {"tier_1": [], "tier_2": []}

    print(f"\n{'='*50}")
    print("BEHAVIORAL PREDICTION QUIZ")
    print("Answer honestly. There are no right or wrong answers.")
    print("T1+T2: 14 questions. T3 (blind spots) auto-scored from contradiction data.")
    print(f"{'='*50}\n")

    # Tier 1: multiple choice
    print("── 第一层：偏好选择 ──\n")
    for q in predictions.get("tier_1", []):
        print(f"  {q['id']}. {q['scenario']}")
        opts = q.get("options", [])
        for i, opt in enumerate(opts):
            print(f"     {chr(65+i)}) {opt}")
        valid = [chr(65 + i) for i in range(len(opts))]
        while True:
            ans = input(f"  你的选择 ({'/'.join(valid)}): ").strip().upper()
            if ans in valid:
                break
            print(f"  请输入 {' 或 '.join(valid)}")
        idx = ord(ans) - 65
        actual = opts[idx] if idx < len(opts) else ans
        responses["tier_1"].append({
            "id": q["id"],
            "choice": ans,
            "actual_answer": actual,
        })
        print()

    # Tier 2: scenario + 4-option MCQ
    print("\n── 第二层：推理选择（选一个最接近你思路的选项）──\n")
    for q in predictions.get("tier_2", []):
        print(f"  {q['id']}. {q['scenario']}")
        opts = q.get("options", [])
        for i, opt in enumerate(opts):
            print(f"     {chr(65+i)}) {opt}")
        valid = [chr(65 + i) for i in range(len(opts))]
        while True:
            ans = input(f"  你的选择 ({'/'.join(valid)}): ").strip().upper()
            if ans in valid:
                break
            print(f"  请输入 {' 或 '.join(valid)}")
        idx = ord(ans) - 65
        actual = opts[idx] if idx < len(opts) else ans
        responses["tier_2"].append({
            "id": q["id"],
            "choice": ans,
            "actual_answer": actual,
        })
        print()

    # Tier 3: auto-scored from contradiction data (no user input needed)
    print("\n── 第三层：认知盲区（自动评估）──\n")
    print("  盲区是你看不见的东西，自评没有意义。")
    print("  T3 将用认知访谈中的矛盾数据自动比对。\n")
    for q in predictions.get("tier_3", []):
        blind_spot = q.get("predicted_blind_spot", q.get("statement", ""))
        print(f"  {q['id']}. {blind_spot}")
    print()

    # Load conflicts from file if provided
    conflicts = []
    if conflicts_path and conflicts_path.exists():
        try:
            raw = json.loads(conflicts_path.read_text())
            # Support both signals_history format and direct conflicts list
            if isinstance(raw, list):
                if raw and "stated_claim" in raw[0]:
                    conflicts = raw
                else:
                    # Extract conflicts from signal extraction results
                    for entry in raw:
                        conflicts.extend(entry.get("stated_vs_behavioral_conflicts", []))
                        conflicts.extend(entry.get("conflicts", []))
            elif isinstance(raw, dict):
                conflicts = raw.get("conflicts", raw.get("stated_vs_behavioral_conflicts", []))
            print(f"  已加载 {len(conflicts)} 条矛盾数据（来自 {conflicts_path}）")
        except Exception as e:
            print(f"  警告：无法加载矛盾数据：{e}", file=sys.stderr)
    else:
        print("  未提供矛盾数据文件（--conflicts），T3 将以模型推理合理性评分。")

    # Merge predictions + responses + conflicts
    result = {"predictions": predictions, "responses": responses, "conflicts": conflicts}
    output.write_text(json.dumps(result, indent=2, ensure_ascii=False))
    print(f"\n回答已保存到 {output}")
    print("运行 'python predictor.py score' 来查看预测准确率。")


def cmd_score(result_path: Path, output: Path):
    """Score predictions against actual responses."""
    data = json.loads(result_path.read_text())
    predictions = data["predictions"]
    responses = data.get("responses", {})
    conflicts = data.get("conflicts", [])

    # Build comparison text
    comparison_parts = []

    for q, r in zip(predictions.get("tier_1", []), responses.get("tier_1", [])):
        comparison_parts.append(
            f"[{q['id']}] TIER 1 — Preference\n"
            f"Scenario: {q['scenario']}\n"
            f"Predicted answer: {q['predicted_answer']}\n"
            f"Actual answer: {r['actual_answer']}\n"
            f"Model reasoning: {q['reasoning_from_model']}\n"
        )

    for q, r in zip(predictions.get("tier_2", []), responses.get("tier_2", [])):
        comparison_parts.append(
            f"[{q['id']}] TIER 2 — Reasoning\n"
            f"Scenario: {q['scenario']}\n"
            f"Options: {q.get('options', [])}\n"
            f"Predicted answer: {q.get('predicted_answer', '')}\n"
            f"Predicted reasoning: {q['predicted_reasoning']}\n"
            f"Actual answer: {r.get('actual_answer', r.get('actual_reasoning', ''))}\n"
            f"Model reasoning: {q['reasoning_from_model']}\n"
        )

    # T3: auto-score against contradiction data
    comparison_parts.append("\n## TIER 3 — BLIND SPOT PREDICTIONS (auto-scored from contradiction data)\n")
    for q in predictions.get("tier_3", []):
        comparison_parts.append(
            f"[{q['id']}] TIER 3 — Blind Spot\n"
            f"Predicted blind spot: {q.get('predicted_blind_spot', '(not specified)')}\n"
            f"Diagnostic statement: {q.get('statement', '')}\n"
            f"Predicted response: {q.get('predicted_response', '')}\n"
            f"Model reasoning: {q['reasoning_from_model']}\n"
            f"Confidence: {q.get('confidence', 'N/A')}\n"
        )

    if conflicts:
        comparison_parts.append("\n## OBSERVED CONTRADICTIONS (stated vs behavioral):\n")
        for i, c in enumerate(conflicts):
            stated = c.get("stated_claim", c.get("stated", ""))
            actual = c.get("actual_behavior", c.get("behavioral", ""))
            evidence = c.get("blind_spot_evidence", c.get("interpretation", ""))
            comparison_parts.append(
                f"Contradiction {i+1}:\n"
                f"  Stated: {stated}\n"
                f"  Actual behavior: {actual}\n"
                f"  Evidence: {evidence}\n"
            )
    else:
        comparison_parts.append("\n## NO CONTRADICTION DATA AVAILABLE\n"
            "Score T3 based on plausibility of blind spot predictions given model reasoning. "
            "Use lower scores (0.2-0.4) since there's no behavioral evidence.\n"
        )

    comparison_text = "\n---\n".join(comparison_parts)

    print("Scoring predictions...", file=sys.stderr)
    scores = call_api(SCORE_PROMPT, comparison_text, SCORE_SCHEMA, "accuracy_report")
    output.write_text(json.dumps(scores, indent=2, ensure_ascii=False))

    # Print report
    print(f"\n{'='*50}")
    print("PREDICTION ACCURACY REPORT")
    print(f"{'='*50}")
    print(f"\n  Tier 1 (偏好预测):   {scores['tier_1_accuracy']:.0%}")
    print(f"  Tier 2 (推理预测):   {scores['tier_2_accuracy']:.0%}")
    print(f"  Tier 3 (盲区预测):   {scores['tier_3_accuracy']:.0%}")
    print(f"\n  Overall:            {scores['overall_accuracy']:.0%}")
    print(f"  Accuracy gradient:  {scores['accuracy_gradient']:.2f}")
    print(f"  (Tier 1 - Tier 3, larger = bigger gap between surface and deep)")

    print(f"\n── 逐题评分 ──")
    for ps in scores.get("pair_scores", []):
        tier_label = ["", "偏好", "推理", "盲区"][ps["tier"]]
        print(f"\n  [{ps['id']}] {tier_label} — {ps['score']:.0%}")
        print(f"    {ps['reasoning']}")
        if ps.get("surprise"):
            print(f"    意外发现: {ps['surprise']}")

    print(f"\n── 核心发现 ──")
    print(f"  {scores['key_findings']}")
    print(f"{'='*50}")

    print(f"\nFull report saved to {output}", file=sys.stderr)


# ── Main ────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(description="Behavioral Prediction Validator")
    parser.add_argument(
        "--subject", type=str, default=os.environ.get("NOUS_SUBJECT", "default"),
        help="Subject name for data isolation (default: $NOUS_SUBJECT or 'default')",
    )
    sub = parser.add_subparsers(dest="command")

    p_build = sub.add_parser("build", help="Build cognitive model from profile")
    p_build.add_argument("profile", type=Path)
    p_build.add_argument("--conflicts", type=Path, default=None, help="Conflict/signal data (signals_history.json)")
    p_build.add_argument("--signals", type=Path, default=None, help="Additional signals file")
    p_build.add_argument("-o", "--output", type=Path, default=None)

    p_pred = sub.add_parser("predict", help="Generate predictions from model")
    p_pred.add_argument("model", type=Path)
    p_pred.add_argument("--conflicts", type=Path, default=None, help="Conflict/signal data (signals_history.json)")
    p_pred.add_argument("--signals", type=Path, default=None, help="Additional signals file")
    p_pred.add_argument("-o", "--output", type=Path, default=None)

    p_quiz = sub.add_parser("quiz", help="Interactive quiz for subject")
    p_quiz.add_argument("predictions", type=Path)
    p_quiz.add_argument("--conflicts", type=Path, default=None,
                         help="Conflict data file for T3 auto-scoring (signals_history.json or interview conflicts)")
    p_quiz.add_argument("-o", "--output", type=Path, default=None)

    p_score = sub.add_parser("score", help="Score predictions against responses")
    p_score.add_argument("results", type=Path)
    p_score.add_argument("-o", "--output", type=Path, default=None)

    args = parser.parse_args()

    # Subject data directory
    subject_dir = Path(__file__).resolve().parent.parent / "data" / "subjects" / args.subject
    subject_dir.mkdir(parents=True, exist_ok=True)

    # Apply subject-aware defaults for output paths
    if args.command == "build":
        if args.output is None:
            args.output = subject_dir / "cognitive_model.json"
        cmd_build(args.profile, args.output, getattr(args, "conflicts", None), getattr(args, "signals", None))
    elif args.command == "predict":
        if args.output is None:
            args.output = subject_dir / "predictions.json"
        cmd_predict(args.model, args.output, getattr(args, "conflicts", None), getattr(args, "signals", None))
    elif args.command == "quiz":
        if args.output is None:
            args.output = subject_dir / "quiz_results.json"
        cmd_quiz(args.predictions, args.output, args.conflicts)
    elif args.command == "score":
        if args.output is None:
            args.output = subject_dir / "accuracy_report.json"
        cmd_score(args.results, args.output)
    else:
        parser.print_help()


if __name__ == "__main__":
    main()
