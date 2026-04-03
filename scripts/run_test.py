"""Quick test script: run detector on each synthetic conversation individually."""

import json
from pathlib import Path

from detector import detect_biases, print_report

DATA = Path(__file__).parent / "examples" / "synthetic.json"


def main():
    with open(DATA) as f:
        data = json.load(f)

    for conv in data["conversations"]:
        print(f"\n{'#' * 60}")
        print(f"# Conversation: {conv['id']}")
        print(f"# Description:  {conv['description']}")
        print(f"# Expected:     {conv.get('expected_biases', 'N/A')}")
        print(f"{'#' * 60}\n")

        analysis = detect_biases(conv["turns"], bias_type="full")
        print_report(analysis)

        # Check: did we catch what we expected?
        expected = set(conv.get("expected_biases", []))
        found = set(analysis.bias_summary.keys())
        if expected:
            caught = expected & found
            missed = expected - found
            extra = found - expected
            print(f"\n  [EVAL] Expected: {expected}")
            print(f"  [EVAL] Caught:   {caught}")
            if missed:
                print(f"  [EVAL] MISSED:   {missed}")
            if extra:
                print(f"  [EVAL] Extra:    {extra}")
        else:
            if found:
                print(f"\n  [EVAL] Control conversation — false positives: {found}")
            else:
                print(f"\n  [EVAL] Control conversation — clean (correct)")

        print()


if __name__ == "__main__":
    main()
