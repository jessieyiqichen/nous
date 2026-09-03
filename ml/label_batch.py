"""Batch label WildChat samples with cognitive signal types using Claude Haiku.

Input: ml/data/wildchat_sample_10k.jsonl
Output: ml/data/labeled_10k.jsonl

Estimated cost: ~$2.50 for 10K messages using Haiku.
"""

from __future__ import annotations

import anthropic
import json
import sys
import time
from pathlib import Path

INPUT_FILE = Path(__file__).parent / "data" / "wildchat_sample_10k.jsonl"
OUTPUT_FILE = Path(__file__).parent / "data" / "labeled_10k.jsonl"
BATCH_SIZE = 1  # One message at a time (could batch with tool_choice)

SYSTEM_PROMPT = """You are a cognitive signal annotator. Given a user message in a human-AI conversation (with previous messages as context), classify which cognitive signals are present.

## 15 Signal Types

**Behavioral (7):**
1. pushback — Explicitly rejects or argues against AI's suggestion
2. acceptance — Accepts AI output without questioning
3. inquiry — Actively explores a new direction beyond current topic
4. avoidance — Passively avoids a topic, doesn't directly answer
5. decision — Makes an explicit choice revealing preference
6. emotion_leak — Emotion breaks through (exclamations, frustration, excitement)
7. value_reveal — Inadvertently exposes core values or priorities

**Cognitive Process (4):**
8. self_correction — Actively corrects their own previous statement
9. hedge — Expresses uncertainty ("maybe", "not sure", "I think")
10. elaboration — Voluntarily explains beyond what was asked
11. deflection — Actively redirects the conversation topic

**Cognitive Bias (4):**
12. anchoring — Over-relies on first piece of information received
13. confirmation_seeking — Only seeks/accepts info supporting existing view
14. rationalization — Post-hoc justification for a decision already made
15. overconfidence — Absolute language ("definitely", "impossible", "always")

## Rules
- A message can have MULTIPLE labels (multi-label)
- Only label the USER message, not the assistant message
- If no cognitive signal is present (pure technical command, short "ok", etc), return empty array
- For each label, provide confidence: high / medium / low
"""

LABEL_SCHEMA = {
    "type": "object",
    "properties": {
        "signals": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "type": {
                        "type": "string",
                        "enum": [
                            "pushback", "acceptance", "inquiry", "avoidance",
                            "decision", "emotion_leak", "value_reveal",
                            "self_correction", "hedge", "elaboration", "deflection",
                            "anchoring", "confirmation_seeking", "rationalization",
                            "overconfidence"
                        ],
                    },
                    "confidence": {"type": "string", "enum": ["high", "medium", "low"]},
                },
                "required": ["type", "confidence"],
            },
        },
    },
    "required": ["signals"],
}


def label_message(client: anthropic.Anthropic, context: str, message: str) -> list[dict]:
    """Label a single user message."""
    user_text = f"Context (previous messages):\n{context}\n\nMessage to label:\n[USER]: {message}\n\nClassify cognitive signals."

    try:
        response = client.messages.create(
            model="claude-haiku-4-5-20251001",
            max_tokens=512,
            system=SYSTEM_PROMPT,
            messages=[{"role": "user", "content": user_text}],
            tools=[{
                "name": "label_signals",
                "description": "Label cognitive signals in the message.",
                "input_schema": LABEL_SCHEMA,
            }],
            tool_choice={"type": "tool", "name": "label_signals"},
        )

        for block in response.content:
            if block.type == "tool_use":
                return block.input.get("signals", [])
    except Exception as e:
        print(f"  API error: {e}", file=sys.stderr)

    return []


def main():
    import argparse
    parser = argparse.ArgumentParser(description="Batch label with Haiku")
    parser.add_argument("--limit", type=int, default=0, help="Max messages to label (0=all)")
    args = parser.parse_args()

    if not INPUT_FILE.exists():
        print(f"Input file not found: {INPUT_FILE}", file=sys.stderr)
        print("Run download_and_sample.py first.", file=sys.stderr)
        sys.exit(1)

    # Count total
    with INPUT_FILE.open() as f:
        total = sum(1 for _ in f)
    if args.limit > 0:
        total = min(total, args.limit)
    print(f"Total messages to label: {total:,}", file=sys.stderr)

    # Resume from where we left off
    already_done = 0
    if OUTPUT_FILE.exists():
        with OUTPUT_FILE.open() as f:
            already_done = sum(1 for _ in f)
        print(f"Resuming from {already_done:,} already labeled.", file=sys.stderr)

    client = anthropic.Anthropic()

    labeled = 0
    signal_counts: dict[str, int] = {}
    no_signal = 0

    with INPUT_FILE.open() as fin, OUTPUT_FILE.open("a", encoding="utf-8") as fout:
        for i, line in enumerate(fin):
            if i < already_done:
                continue

            if args.limit > 0 and (already_done + labeled) >= args.limit:
                break

            row = json.loads(line)
            context = row.get("context", "")
            message = row.get("message", "")

            if not message.strip():
                continue

            signals = label_message(client, context, message)

            # Write labeled row
            labeled_row = {
                "context": context,
                "message": message,
                "labels": signals,
            }
            fout.write(json.dumps(labeled_row, ensure_ascii=False) + "\n")
            fout.flush()

            labeled += 1

            # Track stats
            if not signals:
                no_signal += 1
            for s in signals:
                if isinstance(s, dict):
                    t = s.get("type", "unknown")
                else:
                    t = str(s)
                signal_counts[t] = signal_counts.get(t, 0) + 1

            # Progress
            if labeled % 100 == 0:
                total_signals = sum(signal_counts.values())
                print(
                    f"  [{already_done + labeled:,}/{total:,}] "
                    f"{total_signals} signals, {no_signal} empty, "
                    f"top: {sorted(signal_counts.items(), key=lambda x: -x[1])[:3]}",
                    file=sys.stderr,
                )

            # Rate limit: ~50 requests/sec for Haiku is fine, but be gentle
            if labeled % 500 == 0:
                time.sleep(1)

    print(f"\nDone! Labeled {labeled:,} messages.", file=sys.stderr)
    print(f"Signal distribution:", file=sys.stderr)
    for t, c in sorted(signal_counts.items(), key=lambda x: -x[1]):
        print(f"  {t}: {c}", file=sys.stderr)
    print(f"  (no signal): {no_signal}", file=sys.stderr)
    print(f"Output: {OUTPUT_FILE}", file=sys.stderr)


if __name__ == "__main__":
    main()
