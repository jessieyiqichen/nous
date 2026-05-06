"""Clean labeled data by removing/remapping non-standard labels.

Rules:
1. Single-character labels (e.g., 'e', 'a', 'c') → delete (Haiku parse errors)
2. 'clarification_seeking' → 'inquiry'
3. 'correction' → 'self_correction'
4. Any other non-standard label type → delete

Input: ml/data/labeled_10k.jsonl
Output: ml/data/labeled.jsonl (cleaned, ready for training)
"""

from __future__ import annotations

import json
from pathlib import Path
from collections import Counter

from config import LABEL_NAMES

INPUT_FILE = Path(__file__).parent / "data" / "labeled_10k.jsonl"
OUTPUT_FILE = Path(__file__).parent / "data" / "labeled.jsonl"

VALID_LABELS = set(LABEL_NAMES)

# Mapping for known non-standard labels
REMAP = {
    "clarification_seeking": "inquiry",
    "correction": "self_correction",
}


def clean_labels(labels: list) -> list[dict]:
    """Clean a list of label entries, returning only valid ones."""
    cleaned = []
    for label in labels:
        if not isinstance(label, dict):
            continue
        label_type = label.get("type", "")

        # Rule 1: single-character labels → skip
        if len(label_type) <= 1:
            continue

        # Rule 2/3: remap known non-standard labels
        if label_type in REMAP:
            label_type = REMAP[label_type]

        # Rule 4: skip anything not in the 15 valid types
        if label_type not in VALID_LABELS:
            continue

        cleaned.append({
            "type": label_type,
            "confidence": label.get("confidence", "medium"),
        })

    return cleaned


def main():
    if not INPUT_FILE.exists():
        print(f"Input file not found: {INPUT_FILE}")
        return

    stats = {
        "total_records": 0,
        "records_with_labels": 0,
        "total_labels_before": 0,
        "total_labels_after": 0,
        "single_char_removed": 0,
        "remapped": Counter(),
        "non_standard_removed": Counter(),
    }

    cleaned_records = []

    with INPUT_FILE.open("r", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            try:
                row = json.loads(line)
            except json.JSONDecodeError:
                continue

            stats["total_records"] += 1
            original_labels = row.get("labels", [])
            stats["total_labels_before"] += len([l for l in original_labels if isinstance(l, dict)])

            # Track removals for stats
            for label in original_labels:
                if not isinstance(label, dict):
                    continue
                label_type = label.get("type", "")
                if len(label_type) <= 1:
                    stats["single_char_removed"] += 1
                elif label_type in REMAP:
                    stats["remapped"][label_type] += 1
                elif label_type not in VALID_LABELS:
                    stats["non_standard_removed"][label_type] += 1

            # Clean
            cleaned = clean_labels(original_labels)
            stats["total_labels_after"] += len(cleaned)

            if cleaned:
                stats["records_with_labels"] += 1

            cleaned_records.append({
                "context": row.get("context", ""),
                "message": row.get("message", ""),
                "labels": cleaned,
            })

    # Write output (remove symlink if exists)
    if OUTPUT_FILE.is_symlink():
        OUTPUT_FILE.unlink()
    with OUTPUT_FILE.open("w", encoding="utf-8") as f:
        for record in cleaned_records:
            f.write(json.dumps(record, ensure_ascii=False) + "\n")

    # Print report
    print(f"{'='*60}")
    print(f"DATA CLEANING REPORT")
    print(f"{'='*60}")
    print(f"\n  Input:  {INPUT_FILE} ({stats['total_records']:,} records)")
    print(f"  Output: {OUTPUT_FILE} ({stats['total_records']:,} records)")
    print(f"\n  Labels before cleaning: {stats['total_labels_before']:,}")
    print(f"  Labels after cleaning:  {stats['total_labels_after']:,}")
    print(f"  Labels removed:         {stats['total_labels_before'] - stats['total_labels_after']:,}")
    print(f"\n  Records with >=1 label: {stats['records_with_labels']:,} ({stats['records_with_labels']/stats['total_records']*100:.1f}%)")
    print(f"  Records with 0 labels:  {stats['total_records'] - stats['records_with_labels']:,}")

    if stats["single_char_removed"]:
        print(f"\n  Single-char labels removed: {stats['single_char_removed']}")
    if stats["remapped"]:
        print(f"\n  Remapped labels:")
        for old_name, count in stats["remapped"].most_common():
            print(f"    {old_name} -> {REMAP[old_name]}: {count}")
    if stats["non_standard_removed"]:
        print(f"\n  Non-standard labels removed:")
        for name, count in stats["non_standard_removed"].most_common():
            print(f"    {name}: {count}")

    print(f"\n{'='*60}")


if __name__ == "__main__":
    main()
