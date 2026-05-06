"""Hyperparameters and configuration for cognitive signal classifier."""

from pathlib import Path

# ── Paths ─────────────────────────────────────────────────────

PROJECT_ROOT = Path(__file__).resolve().parent
DATA_DIR = PROJECT_ROOT / "data"
OUTPUT_DIR = PROJECT_ROOT / "output"

TRAIN_FILE = DATA_DIR / "labeled_train.jsonl"
VAL_FILE = DATA_DIR / "labeled_val.jsonl"
TEST_FILE = DATA_DIR / "labeled_test.jsonl"

# If only a single file is provided, split it automatically
LABELED_FILE = DATA_DIR / "labeled.jsonl"

# ── Labels ────────────────────────────────────────────────────

LABEL_NAMES = [
    "pushback",
    "acceptance",
    "inquiry",
    "avoidance",
    "decision",
    "emotion_leak",
    "value_reveal",
    "self_correction",
    "hedge",
    "elaboration",
    "deflection",
    "anchoring",
    "confirmation_seeking",
    "rationalization",
    "overconfidence",
]

NUM_LABELS = len(LABEL_NAMES)

LABEL_TO_IDX = {name: i for i, name in enumerate(LABEL_NAMES)}
IDX_TO_LABEL = {i: name for i, name in enumerate(LABEL_NAMES)}

# ── Model ─────────────────────────────────────────────────────

MODEL_NAME = "distilbert-base-multilingual-cased"
MAX_LENGTH = 512

# ── Training ──────────────────────────────────────────────────

BATCH_SIZE = 16
LEARNING_RATE = 2e-5
NUM_EPOCHS = 5
WEIGHT_DECAY = 0.01
WARMUP_RATIO = 0.1

# ── Data split (only used when splitting a single file) ──────

TRAIN_RATIO = 0.8
VAL_RATIO = 0.1
TEST_RATIO = 0.1

# ── Evaluation ────────────────────────────────────────────────

THRESHOLD = 0.6  # Sigmoid threshold for multi-label prediction (optimized via threshold sensitivity analysis)

# ── Misc ──────────────────────────────────────────────────────

SEED = 42
