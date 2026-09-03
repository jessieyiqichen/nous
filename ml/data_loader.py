"""Data loading and preprocessing for cognitive signal classifier.

Reads labeled JSONL files, converts to HuggingFace Dataset format,
and handles train/val/test splitting.

Input JSONL format (one per line):
    {"context": "prev messages", "message": "user message", "labels": [{"type": "pushback", "confidence": "high"}, ...]}
"""

from __future__ import annotations

import json
import random
from pathlib import Path

from datasets import Dataset, DatasetDict
from transformers import AutoTokenizer

from config import (
    LABEL_NAMES,
    LABEL_TO_IDX,
    NUM_LABELS,
    MODEL_NAME,
    MAX_LENGTH,
    TRAIN_RATIO,
    VAL_RATIO,
    SEED,
    LABELED_FILE,
    TRAIN_FILE,
    VAL_FILE,
    TEST_FILE,
)


def load_jsonl(path: Path) -> list[dict]:
    """Load JSONL file, one JSON object per line."""
    records = []
    with path.open("r", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            try:
                records.append(json.loads(line))
            except json.JSONDecodeError:
                continue
    return records


def record_to_example(record: dict) -> dict:
    """Convert a labeled record to model input format.

    Input text format: [CLS] context [SEP] message [SEP]
    Labels: multi-hot vector of length NUM_LABELS
    """
    context = record.get("context", "")
    message = record.get("message", "")

    # Build input text: context + separator + message
    # The tokenizer will add [CLS] and [SEP] tokens
    text = f"{context} [SEP] {message}" if context else message

    # Build multi-hot label vector
    labels = [0.0] * NUM_LABELS
    for label_entry in record.get("labels", []):
        if not isinstance(label_entry, dict):
            continue
        label_type = label_entry.get("type", "")
        if label_type in LABEL_TO_IDX:
            # Weight by confidence: high=1.0, medium=0.7, low=0.4
            confidence = label_entry.get("confidence", "medium")
            weight = {"high": 1.0, "medium": 0.7, "low": 0.4}.get(confidence, 0.7)
            labels[LABEL_TO_IDX[label_type]] = weight

    return {"text": text, "labels": labels}


def load_and_split(
    labeled_file: Path | None = None,
    train_file: Path | None = None,
    val_file: Path | None = None,
    test_file: Path | None = None,
) -> DatasetDict:
    """Load data and return a DatasetDict with train/val/test splits.

    If pre-split files exist, use them directly.
    Otherwise, split the single labeled file.
    """
    train_path = train_file or TRAIN_FILE
    val_path = val_file or VAL_FILE
    test_path = test_file or TEST_FILE
    single_path = labeled_file or LABELED_FILE

    if train_path.exists() and val_path.exists() and test_path.exists():
        # Use pre-split files
        train_records = load_jsonl(train_path)
        val_records = load_jsonl(val_path)
        test_records = load_jsonl(test_path)
    elif single_path.exists():
        # Split single file
        all_records = load_jsonl(single_path)
        random.seed(SEED)
        random.shuffle(all_records)

        n = len(all_records)
        train_end = int(n * TRAIN_RATIO)
        val_end = train_end + int(n * VAL_RATIO)

        train_records = all_records[:train_end]
        val_records = all_records[train_end:val_end]
        test_records = all_records[val_end:]
    else:
        raise FileNotFoundError(
            f"No data files found. Expected either:\n"
            f"  - {single_path}\n"
            f"  - {train_path}, {val_path}, {test_path}"
        )

    def records_to_dataset(records: list[dict]) -> Dataset:
        examples = [record_to_example(r) for r in records]
        return Dataset.from_dict({
            "text": [e["text"] for e in examples],
            "labels": [e["labels"] for e in examples],
        })

    return DatasetDict({
        "train": records_to_dataset(train_records),
        "validation": records_to_dataset(val_records),
        "test": records_to_dataset(test_records),
    })


def tokenize_dataset(dataset_dict: DatasetDict) -> DatasetDict:
    """Tokenize all splits using the model's tokenizer."""
    tokenizer = AutoTokenizer.from_pretrained(MODEL_NAME)

    def tokenize_fn(examples):
        return tokenizer(
            examples["text"],
            padding="max_length",
            truncation=True,
            max_length=MAX_LENGTH,
        )

    tokenized = dataset_dict.map(tokenize_fn, batched=True, remove_columns=["text"])
    tokenized.set_format("torch")
    return tokenized


def get_label_names() -> list[str]:
    """Return ordered list of label names."""
    return LABEL_NAMES


if __name__ == "__main__":
    # Quick test: load and print stats
    ds = load_and_split()
    print(f"Train: {len(ds['train'])}, Val: {len(ds['validation'])}, Test: {len(ds['test'])}")

    # Label distribution
    for split_name in ["train", "validation", "test"]:
        labels = ds[split_name]["labels"]
        counts = [0] * NUM_LABELS
        for label_vec in labels:
            for i, v in enumerate(label_vec):
                if v > 0:
                    counts[i] += 1
        print(f"\n{split_name} label distribution:")
        for i, name in enumerate(LABEL_NAMES):
            print(f"  {name}: {counts[i]} ({counts[i]/len(labels)*100:.1f}%)")
