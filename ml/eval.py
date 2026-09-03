"""Evaluate trained cognitive signal classifier.

Computes per-class precision/recall/F1, overall micro/macro F1,
and generates a confusion matrix.

Usage:
    python ml/eval.py [--model-dir PATH] [--split test|validation]
"""

from __future__ import annotations

import argparse
from pathlib import Path

import numpy as np
import torch
from transformers import AutoModelForSequenceClassification, AutoTokenizer
from sklearn.metrics import (
    classification_report,
    f1_score,
    multilabel_confusion_matrix,
)

from config import (
    MODEL_NAME,
    NUM_LABELS,
    LABEL_NAMES,
    MAX_LENGTH,
    THRESHOLD,
    OUTPUT_DIR,
    BATCH_SIZE,
)
from data_loader import load_and_split, tokenize_dataset


def predict_batch(model, tokenizer, texts: list[str], device: torch.device) -> np.ndarray:
    """Run inference on a batch of texts, return sigmoid probabilities."""
    encodings = tokenizer(
        texts,
        padding="max_length",
        truncation=True,
        max_length=MAX_LENGTH,
        return_tensors="pt",
    ).to(device)

    with torch.no_grad():
        outputs = model(**encodings)
        logits = outputs.logits.cpu().numpy()

    return 1 / (1 + np.exp(-logits))


def main():
    parser = argparse.ArgumentParser(description="Evaluate cognitive signal classifier")
    parser.add_argument(
        "--model-dir", type=Path, default=OUTPUT_DIR / "best_model",
        help="Path to saved model directory",
    )
    parser.add_argument(
        "--split", choices=["test", "validation"], default="test",
        help="Which data split to evaluate on",
    )
    parser.add_argument("--batch-size", type=int, default=BATCH_SIZE * 2)
    args = parser.parse_args()

    if not args.model_dir.exists():
        print(f"Model not found at {args.model_dir}. Train first with: python ml/train.py")
        return

    print(f"Loading model from {args.model_dir}...")
    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    model = AutoModelForSequenceClassification.from_pretrained(args.model_dir).to(device)
    tokenizer = AutoTokenizer.from_pretrained(args.model_dir)
    model.eval()

    print(f"Loading {args.split} data...")
    dataset = load_and_split()
    split_data = dataset[args.split]

    texts = split_data["text"]
    labels = np.array(split_data["labels"])
    labels_binary = (labels >= THRESHOLD).astype(int)

    # Predict in batches
    all_probs = []
    for i in range(0, len(texts), args.batch_size):
        batch_texts = texts[i:i + args.batch_size]
        probs = predict_batch(model, tokenizer, batch_texts, device)
        all_probs.append(probs)

    all_probs = np.vstack(all_probs)
    preds_binary = (all_probs >= THRESHOLD).astype(int)

    # ── Overall metrics ───────────────────────────────────────

    micro_f1 = f1_score(labels_binary, preds_binary, average="micro", zero_division=0)
    macro_f1 = f1_score(labels_binary, preds_binary, average="macro", zero_division=0)

    print(f"\n{'='*60}")
    print(f"EVALUATION RESULTS ({args.split} set, n={len(texts)})")
    print(f"{'='*60}")
    print(f"\n  Micro F1: {micro_f1:.4f}")
    print(f"  Macro F1: {macro_f1:.4f}")

    # ── Per-class report ──────────────────────────────────────

    print(f"\n--- Per-Class Metrics ---\n")
    report = classification_report(
        labels_binary,
        preds_binary,
        target_names=LABEL_NAMES,
        zero_division=0,
    )
    print(report)

    # ── Confusion matrix (per-class) ──────────────────────────

    mcm = multilabel_confusion_matrix(labels_binary, preds_binary)

    print(f"--- Per-Class Confusion Matrix ---\n")
    print(f"{'Label':<25} {'TN':>6} {'FP':>6} {'FN':>6} {'TP':>6}")
    print("-" * 55)
    for i, name in enumerate(LABEL_NAMES):
        tn, fp, fn, tp = mcm[i].ravel()
        print(f"{name:<25} {tn:>6} {fp:>6} {fn:>6} {tp:>6}")

    # ── Threshold analysis ────────────────────────────────────

    print(f"\n--- Threshold Sensitivity ---\n")
    print(f"{'Threshold':>10} {'Micro F1':>10} {'Macro F1':>10}")
    print("-" * 35)
    for t in [0.3, 0.4, 0.5, 0.6, 0.7]:
        p = (all_probs >= t).astype(int)
        mif1 = f1_score(labels_binary, p, average="micro", zero_division=0)
        maf1 = f1_score(labels_binary, p, average="macro", zero_division=0)
        marker = " <--" if t == THRESHOLD else ""
        print(f"{t:>10.1f} {mif1:>10.4f} {maf1:>10.4f}{marker}")

    print(f"\n{'='*60}")


if __name__ == "__main__":
    main()
