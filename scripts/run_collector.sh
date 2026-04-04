#!/bin/bash
# Daily passive signal collector — called by launchd
# Sources .zshrc for ANTHROPIC_API_KEY, runs collector, logs output

source ~/.zshrc 2>/dev/null

NOUS_DIR="$(cd "$(dirname "$0")/.." && pwd)"
LOG="$NOUS_DIR/data/collector.log"

echo "===== $(date '+%Y-%m-%d %H:%M:%S') =====" >> "$LOG"
python3 "$NOUS_DIR/scripts/passive_collector.py" collect \
    --model "$NOUS_DIR/data/cognitive_model_v2.json" \
    >> "$LOG" 2>&1
echo "" >> "$LOG"
