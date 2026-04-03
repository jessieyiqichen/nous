"""Batch bias detection on sampled conversations with statistical analysis.

Usage:
    python batch_analyze.py                           # Run full batch
    python batch_analyze.py --limit 5                 # Test with 5 conversations
    python batch_analyze.py --results-only            # Skip detection, just analyze existing results
"""

from __future__ import annotations

import argparse
import json
import time
import traceback
from collections import Counter
from pathlib import Path

from detector import detect_biases

INPUT = Path(__file__).parent / "examples" / "wildchat_sample.json"
OUTPUT = Path(__file__).parent / "examples" / "wildchat_results.json"


def run_batch(limit: int | None = None) -> list[dict]:
    """Run bias detection on all sampled conversations."""
    with open(INPUT) as f:
        data = json.load(f)

    conversations = data["conversations"]
    if limit:
        conversations = conversations[:limit]

    results = []

    # Load existing results to support resume
    existing = {}
    if OUTPUT.exists():
        with open(OUTPUT) as f:
            for r in json.load(f).get("results", []):
                existing[r["id"]] = r

    for i, conv in enumerate(conversations):
        conv_id = conv["id"]

        # Skip already processed
        if conv_id in existing:
            print(f"[{i+1}/{len(conversations)}] {conv_id} — cached")
            results.append(existing[conv_id])
            continue

        print(f"[{i+1}/{len(conversations)}] {conv_id} ({conv['model']}, {conv['turn_count']} turns)...", end=" ", flush=True)

        try:
            t0 = time.time()
            analysis = detect_biases(conv["turns"], bias_type="full")
            elapsed = time.time() - t0

            result = {
                "id": conv_id,
                "model": conv["model"],
                "turn_count": conv["turn_count"],
                "elapsed_seconds": round(elapsed, 1),
                "analysis": analysis.model_dump(),
            }
            results.append(result)
            print(f"done ({len(analysis.biases_found)} biases, {elapsed:.1f}s)")

        except Exception as e:
            print(f"ERROR: {e}")
            traceback.print_exc()
            results.append({
                "id": conv_id,
                "model": conv["model"],
                "turn_count": conv["turn_count"],
                "error": str(e),
            })

        # Save incrementally
        with open(OUTPUT, "w") as f:
            json.dump({"results": results}, f, indent=2, ensure_ascii=False)

    return results


def analyze_results(results: list[dict]) -> dict:
    """Compute aggregate statistics from batch results."""
    stats: dict = {
        "total_conversations": len(results),
        "successful": 0,
        "errors": 0,
    }

    # Per-bias counters
    bias_counts = Counter()         # total instances of each bias
    bias_conversations = Counter()  # conversations containing each bias
    severity_counts = Counter()
    model_bias_counts: dict[str, Counter] = {}
    co_occurrence = Counter()       # pairs of biases in same conversation
    biases_per_conversation = []
    sub_type_counts = Counter()

    for r in results:
        if "error" in r:
            stats["errors"] += 1
            continue

        stats["successful"] += 1
        analysis = r["analysis"]
        model = r["model"]

        if model not in model_bias_counts:
            model_bias_counts[model] = Counter()

        biases = analysis.get("biases_found", [])
        biases_per_conversation.append(len(biases))

        bias_types_in_conv = set()
        for b in biases:
            bid = b["bias_id"]
            bias_counts[bid] += 1
            severity_counts[b["severity"]] += 1
            model_bias_counts[model][bid] += 1
            bias_types_in_conv.add(bid)

            sub = b.get("sub_type", "")
            if sub:
                sub_type_counts[f"{bid}:{sub}"] += 1

        for bt in bias_types_in_conv:
            bias_conversations[bt] += 1

        # Co-occurrence: pairs of biases in same conversation
        sorted_types = sorted(bias_types_in_conv)
        for i, a in enumerate(sorted_types):
            for b in sorted_types[i+1:]:
                co_occurrence[f"{a} + {b}"] += 1

    stats["bias_totals"] = dict(bias_counts.most_common())
    stats["bias_conversation_prevalence"] = {
        k: f"{v}/{stats['successful']} ({v/stats['successful']*100:.0f}%)"
        for k, v in bias_conversations.most_common()
    }
    stats["severity_distribution"] = dict(severity_counts.most_common())
    stats["avg_biases_per_conversation"] = (
        round(sum(biases_per_conversation) / len(biases_per_conversation), 1)
        if biases_per_conversation else 0
    )
    stats["max_biases_in_conversation"] = max(biases_per_conversation, default=0)
    stats["zero_bias_conversations"] = biases_per_conversation.count(0)

    stats["by_model"] = {
        model: dict(counts.most_common())
        for model, counts in sorted(model_bias_counts.items())
    }

    stats["co_occurrence_top10"] = dict(co_occurrence.most_common(10))

    if sub_type_counts:
        stats["sub_types"] = dict(sub_type_counts.most_common())

    return stats


def print_stats(stats: dict) -> None:
    """Print formatted statistics."""
    print("\n" + "=" * 60)
    print("WILDCHAT BIAS DETECTION — AGGREGATE STATISTICS")
    print("=" * 60)

    print(f"\nConversations analyzed: {stats['successful']} / {stats['total_conversations']}")
    if stats["errors"]:
        print(f"Errors: {stats['errors']}")

    print(f"\nAvg biases per conversation: {stats['avg_biases_per_conversation']}")
    print(f"Max biases in one conversation: {stats['max_biases_in_conversation']}")
    print(f"Conversations with zero biases: {stats['zero_bias_conversations']}")

    print("\n--- Bias prevalence (conversations containing each bias) ---")
    for bias, prevalence in stats["bias_conversation_prevalence"].items():
        print(f"  {bias:20s} {prevalence}")

    print("\n--- Total bias instances ---")
    for bias, count in stats["bias_totals"].items():
        print(f"  {bias:20s} {count}")

    print("\n--- Severity distribution ---")
    for sev, count in stats["severity_distribution"].items():
        print(f"  {sev:10s} {count}")

    if stats.get("by_model"):
        print("\n--- By model ---")
        for model, counts in stats["by_model"].items():
            print(f"\n  {model}:")
            for bias, count in counts.items():
                print(f"    {bias:20s} {count}")

    if stats.get("co_occurrence_top10"):
        print("\n--- Top bias co-occurrences ---")
        for pair, count in stats["co_occurrence_top10"].items():
            print(f"  {pair:40s} {count}")

    if stats.get("sub_types"):
        print("\n--- Sub-types ---")
        for st, count in stats["sub_types"].items():
            print(f"  {st:30s} {count}")

    print("=" * 60)


def main():
    parser = argparse.ArgumentParser(description="Batch bias analysis on WildChat")
    parser.add_argument("--limit", type=int, help="Limit number of conversations to analyze")
    parser.add_argument("--results-only", action="store_true", help="Skip detection, analyze existing results")
    args = parser.parse_args()

    if args.results_only:
        with open(OUTPUT) as f:
            results = json.load(f)["results"]
    else:
        results = run_batch(limit=args.limit)

    stats = analyze_results(results)
    print_stats(stats)

    # Save stats
    stats_path = Path(__file__).parent / "examples" / "wildchat_stats.json"
    with open(stats_path, "w") as f:
        json.dump(stats, f, indent=2, ensure_ascii=False)
    print(f"\nStats saved to {stats_path}")


if __name__ == "__main__":
    main()
