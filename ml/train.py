"""Train DistilBERT multi-label classifier for cognitive signal detection.

Usage:
    python ml/train.py [--epochs N] [--batch-size N] [--lr FLOAT]
"""

from __future__ import annotations

import argparse
from pathlib import Path

import torch
from torch import nn
from transformers import (
    AutoModelForSequenceClassification,
    AutoTokenizer,
    Trainer,
    TrainingArguments,
    EvalPrediction,
)
import numpy as np
from sklearn.metrics import f1_score, precision_score, recall_score

from config import (
    MODEL_NAME,
    NUM_LABELS,
    BATCH_SIZE,
    LEARNING_RATE,
    NUM_EPOCHS,
    WEIGHT_DECAY,
    WARMUP_RATIO,
    THRESHOLD,
    OUTPUT_DIR,
    SEED,
    LABEL_NAMES,
)
from data_loader import load_and_split, tokenize_dataset


def compute_pos_weight(dataset) -> torch.Tensor:
    """Compute pos_weight for BCEWithLogitsLoss from training labels."""
    labels = np.array(dataset["labels"])
    # Binarize: anything >= 0.3 counts as positive
    binary = (labels >= 0.3).astype(float)
    pos_count = binary.sum(axis=0)
    neg_count = len(binary) - pos_count
    # Avoid division by zero; cap weight at 50
    weight = np.where(pos_count > 0, neg_count / pos_count, 50.0)
    weight = np.clip(weight, 1.0, 50.0)
    return torch.tensor(weight, dtype=torch.float32)


class WeightedTrainer(Trainer):
    """Trainer with pos_weight for imbalanced multi-label classification."""

    def __init__(self, pos_weight: torch.Tensor, **kwargs):
        super().__init__(**kwargs)
        self.pos_weight = pos_weight

    def compute_loss(self, model, inputs, return_outputs=False, **kwargs):
        labels = inputs.pop("labels")
        outputs = model(**inputs)
        logits = outputs.logits
        # Binarize soft labels for loss computation
        labels_binary = (labels >= 0.3).float()
        loss_fn = nn.BCEWithLogitsLoss(pos_weight=self.pos_weight.to(logits.device))
        loss = loss_fn(logits, labels_binary)
        return (loss, outputs) if return_outputs else loss


def compute_metrics(eval_pred: EvalPrediction) -> dict:
    """Compute multi-label classification metrics."""
    logits = eval_pred.predictions
    labels = eval_pred.label_ids

    # Apply sigmoid + threshold
    probs = 1 / (1 + np.exp(-logits))
    preds = (probs >= THRESHOLD).astype(int)
    labels_binary = (labels >= 0.3).astype(int)

    # Overall metrics
    micro_f1 = f1_score(labels_binary, preds, average="micro", zero_division=0)
    macro_f1 = f1_score(labels_binary, preds, average="macro", zero_division=0)
    micro_precision = precision_score(labels_binary, preds, average="micro", zero_division=0)
    micro_recall = recall_score(labels_binary, preds, average="micro", zero_division=0)

    return {
        "micro_f1": micro_f1,
        "macro_f1": macro_f1,
        "micro_precision": micro_precision,
        "micro_recall": micro_recall,
    }


def main():
    parser = argparse.ArgumentParser(description="Train cognitive signal classifier")
    parser.add_argument("--epochs", type=int, default=NUM_EPOCHS)
    parser.add_argument("--batch-size", type=int, default=BATCH_SIZE)
    parser.add_argument("--lr", type=float, default=LEARNING_RATE)
    parser.add_argument("--output-dir", type=Path, default=OUTPUT_DIR)
    args = parser.parse_args()

    print(f"Loading data...")
    dataset = load_and_split()
    print(f"  Train: {len(dataset['train'])}, Val: {len(dataset['validation'])}, Test: {len(dataset['test'])}")

    print(f"Tokenizing with {MODEL_NAME}...")
    tokenized = tokenize_dataset(dataset)

    # Compute class weights from training set
    pos_weight = compute_pos_weight(dataset["train"])
    print(f"pos_weight: {pos_weight.numpy().round(1)}")

    print(f"Loading model: {MODEL_NAME} ({NUM_LABELS} labels)...")
    model = AutoModelForSequenceClassification.from_pretrained(
        MODEL_NAME,
        num_labels=NUM_LABELS,
        problem_type="multi_label_classification",
    )

    output_dir = args.output_dir
    output_dir.mkdir(parents=True, exist_ok=True)

    training_args = TrainingArguments(
        output_dir=str(output_dir / "checkpoints"),
        eval_strategy="epoch",
        save_strategy="epoch",
        learning_rate=args.lr,
        per_device_train_batch_size=args.batch_size,
        per_device_eval_batch_size=args.batch_size * 2,
        num_train_epochs=args.epochs,
        weight_decay=WEIGHT_DECAY,
        warmup_ratio=WARMUP_RATIO,
        load_best_model_at_end=True,
        metric_for_best_model="micro_f1",
        greater_is_better=True,
        seed=SEED,
        logging_steps=50,
        report_to="none",
        fp16=torch.cuda.is_available(),
    )

    trainer = WeightedTrainer(
        pos_weight=pos_weight,
        model=model,
        args=training_args,
        train_dataset=tokenized["train"],
        eval_dataset=tokenized["validation"],
        compute_metrics=compute_metrics,
    )

    print(f"Training for {args.epochs} epochs (batch_size={args.batch_size}, lr={args.lr})...")
    trainer.train()

    # Save best model
    best_model_dir = output_dir / "best_model"
    trainer.save_model(str(best_model_dir))
    tokenizer = AutoTokenizer.from_pretrained(MODEL_NAME)
    tokenizer.save_pretrained(str(best_model_dir))

    print(f"\nBest model saved to {best_model_dir}")

    # Evaluate on test set
    print(f"\nEvaluating on test set...")
    test_results = trainer.evaluate(tokenized["test"])
    print(f"Test results:")
    for k, v in test_results.items():
        if isinstance(v, float):
            print(f"  {k}: {v:.4f}")

    # Per-class metrics on test set
    test_preds = trainer.predict(tokenized["test"])
    logits = test_preds.predictions
    labels = test_preds.label_ids
    probs = 1 / (1 + np.exp(-logits))
    preds_binary = (probs >= THRESHOLD).astype(int)
    labels_binary = (labels >= 0.3).astype(int)

    print(f"\nPer-class F1 scores:")
    per_class_f1 = f1_score(labels_binary, preds_binary, average=None, zero_division=0)
    for i, name in enumerate(LABEL_NAMES):
        support = labels_binary[:, i].sum()
        print(f"  {name}: F1={per_class_f1[i]:.3f} (support={int(support)})")


if __name__ == "__main__":
    main()
