"""Download WildChat-1M and sample 10K conversations for labeling.

Filters: ≥4 turns, language=en or zh, non-toxic.
Output: ml/data/wildchat_sample_10k.jsonl
"""

from __future__ import annotations

import json
import random
import sys
from pathlib import Path

# Output path
OUTPUT_DIR = Path(__file__).parent / "data"
OUTPUT_FILE = OUTPUT_DIR / "wildchat_sample_10k.jsonl"
SAMPLE_SIZE = 10_000

def main():
    from datasets import load_dataset

    print("Loading WildChat-1M (this may take a few minutes on first run)...", file=sys.stderr)
    ds = load_dataset("allenai/WildChat-1M", split="train", streaming=True)

    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

    candidates = []
    seen = 0

    print("Scanning for suitable conversations...", file=sys.stderr)
    for row in ds:
        seen += 1
        if seen % 50000 == 0:
            print(f"  Scanned {seen:,} rows, collected {len(candidates):,} candidates...", file=sys.stderr)

        # Filter: language
        lang = row.get("language", "")
        if lang not in ("English", "Chinese"):
            continue

        # Filter: conversation length
        conv = row.get("conversation", [])
        if len(conv) < 4:
            continue

        # Filter: non-toxic (check first user message)
        if any(msg.get("toxic", False) for msg in conv):
            continue

        # Extract user messages with context
        messages = []
        for i, msg in enumerate(conv):
            if msg["role"] == "user":
                # Get up to 2 previous messages as context
                context_msgs = conv[max(0, i-2):i]
                context = "\n".join(
                    f"[{m['role'].upper()}]: {m['content'][:500]}"
                    for m in context_msgs
                )
                messages.append({
                    "context": context,
                    "message": msg["content"][:1000],  # Truncate long messages
                    "turn_index": i,
                })

        # Skip if only 1 user message (no context for first one)
        if len(messages) < 2:
            continue

        # Take user messages that have context (skip first)
        for m in messages[1:]:
            candidates.append(m)

        # Stop early if we have enough
        if len(candidates) >= SAMPLE_SIZE * 3:
            break

    print(f"Scanned {seen:,} total rows, collected {len(candidates):,} candidate messages.", file=sys.stderr)

    # Random sample
    if len(candidates) > SAMPLE_SIZE:
        random.seed(42)
        candidates = random.sample(candidates, SAMPLE_SIZE)

    # Write output
    with OUTPUT_FILE.open("w", encoding="utf-8") as f:
        for item in candidates:
            f.write(json.dumps(item, ensure_ascii=False) + "\n")

    print(f"Saved {len(candidates):,} messages to {OUTPUT_FILE}", file=sys.stderr)


if __name__ == "__main__":
    main()
