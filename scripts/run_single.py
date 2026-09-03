"""Quick test: run detector on a single synthetic conversation."""

import json
import sys
from pathlib import Path

from detector import detect_biases, print_report

DATA = Path(__file__).parent / "examples" / "synthetic.json"


def main():
    idx = int(sys.argv[1]) if len(sys.argv) > 1 else 1

    with open(DATA) as f:
        data = json.load(f)

    conv = data["conversations"][idx]
    print(f"# {conv['id']}: {conv['description']}\n")

    analysis = detect_biases(conv["turns"], bias_type="full")
    print_report(analysis)

    # Also dump JSON for inspection
    print("\n--- RAW JSON ---")
    print(analysis.model_dump_json(indent=2))


if __name__ == "__main__":
    main()
