"""Sample multi-turn conversations from WildChat for bias analysis.

Downloads a subset of WildChat-1M from HuggingFace,
filters for multi-turn conversations, and saves a sample.
"""

from __future__ import annotations

import json
import random
from pathlib import Path

from datasets import load_dataset

OUTPUT = Path(__file__).parent / "examples" / "wildchat_sample.json"
SEED = 42
SAMPLE_SIZE = 30
MIN_TURNS = 6  # at least 3 user + 3 assistant turns


def extract_conversations(dataset, n: int, min_turns: int) -> list[dict]:
    """Filter and sample multi-turn conversations."""
    candidates = []

    for row in dataset:
        turns = row.get("conversation", [])
        if not turns:
            continue

        # Count turns and filter
        if len(turns) < min_turns:
            continue

        # Skip very long conversations (>30 turns) to manage API costs
        if len(turns) > 30:
            continue

        # Skip non-English conversations (bias detection prompts are in English)
        lang = row.get("language", "")
        if lang and lang != "English":
            continue

        # Extract metadata
        model = row.get("model", "unknown")
        conv_id = row.get("conversation_hash", row.get("conversation_id", ""))

        candidates.append({
            "id": str(conv_id)[:16] if conv_id else f"wc_{len(candidates)}",
            "source": "wildchat",
            "model": model,
            "turn_count": len(turns),
            "turns": [
                {"role": t["role"], "content": t["content"]}
                for t in turns
                if t["role"] in ("user", "assistant")
            ],
        })

    print(f"Found {len(candidates)} candidates with >= {min_turns} turns")

    # Stratified sample by model if possible
    by_model: dict[str, list] = {}
    for c in candidates:
        by_model.setdefault(c["model"], []).append(c)

    print(f"Models found: {', '.join(f'{k} ({len(v)})' for k, v in sorted(by_model.items(), key=lambda x: -len(x[1])))}")

    random.seed(SEED)
    sampled = []

    if len(by_model) > 1:
        # Try to get even distribution across models
        per_model = max(1, n // len(by_model))
        for model, convs in sorted(by_model.items(), key=lambda x: -len(x[1])):
            take = min(per_model, len(convs))
            sampled.extend(random.sample(convs, take))
            if len(sampled) >= n:
                break

        # Fill remaining slots from largest model groups
        if len(sampled) < n:
            remaining = [c for c in candidates if c not in sampled]
            sampled.extend(random.sample(remaining, min(n - len(sampled), len(remaining))))
    else:
        sampled = random.sample(candidates, min(n, len(candidates)))

    return sampled[:n]


def main():
    print("Loading WildChat dataset (streaming)...")

    # Use streaming to avoid downloading the full 1M dataset
    ds = load_dataset(
        "allenai/WildChat-1M",
        split="train",
        streaming=True,
    )

    # Take first 50k rows to find enough multi-turn conversations
    print("Scanning first 50k rows for multi-turn conversations...")
    rows = []
    for i, row in enumerate(ds):
        rows.append(row)
        if i >= 49_999:
            break
        if (i + 1) % 10_000 == 0:
            print(f"  Scanned {i + 1} rows...")

    # Create a simple wrapper that allows iteration
    sampled = extract_conversations(rows, SAMPLE_SIZE, MIN_TURNS)

    print(f"\nSampled {len(sampled)} conversations")
    print(f"Turn count range: {min(c['turn_count'] for c in sampled)} - {max(c['turn_count'] for c in sampled)}")

    OUTPUT.parent.mkdir(exist_ok=True)
    with open(OUTPUT, "w") as f:
        json.dump({"conversations": sampled}, f, indent=2, ensure_ascii=False)

    print(f"Saved to {OUTPUT}")


if __name__ == "__main__":
    main()
