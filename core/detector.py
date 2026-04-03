"""Core bias detection engine.

Usage:
    python detector.py examples/synthetic.json
    python detector.py examples/synthetic.json --bias overcorrect
    python detector.py examples/synthetic.json --bias sycophancy
    python detector.py conversation.json --bias full
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

import anthropic

from prompts import BIAS_PROMPTS
from schemas import ConversationAnalysis


def format_conversation(turns: list[dict]) -> str:
    """Format conversation turns into a readable string for the analyzer."""
    lines = []
    for i, turn in enumerate(turns):
        role = turn["role"].upper()
        content = turn["content"]
        lines.append(f"[Turn {i}] {role}:\n{content}\n")
    return "\n".join(lines)


def detect_biases(
    conversation: list[dict],
    bias_type: str = "full",
    model: str = "claude-sonnet-4-5-20250929",
) -> ConversationAnalysis:
    """Run bias detection on a conversation.

    Args:
        conversation: List of {"role": "user"|"assistant", "content": "..."} dicts
        bias_type: Which detection prompt to use ("overcorrect", "sycophancy", "full")
        model: Anthropic model ID to use for analysis

    Returns:
        ConversationAnalysis with detected biases
    """
    if bias_type not in BIAS_PROMPTS:
        raise ValueError(f"Unknown bias type: {bias_type}. Choose from: {list(BIAS_PROMPTS.keys())}")

    prompt = BIAS_PROMPTS[bias_type]
    formatted = format_conversation(conversation)

    client = anthropic.Anthropic()

    # Build JSON schema from pydantic model for tool use
    schema = ConversationAnalysis.model_json_schema()

    response = client.messages.create(
        model=model,
        max_tokens=8192,
        messages=[
            {
                "role": "user",
                "content": prompt + formatted,
            },
        ],
        tools=[
            {
                "name": "report_bias_analysis",
                "description": "Report the complete bias analysis results for the conversation.",
                "input_schema": schema,
            }
        ],
        tool_choice={"type": "tool", "name": "report_bias_analysis"},
    )

    # Extract tool use input from response
    for block in response.content:
        if block.type == "tool_use":
            return ConversationAnalysis(**block.input)

    raise RuntimeError("Model did not return tool use response")


def print_report(analysis: ConversationAnalysis) -> None:
    """Print a human-readable bias detection report."""
    print("=" * 60)
    print("AI COGNITIVE BIAS DETECTION REPORT")
    print("=" * 60)
    print(f"\nTotal turns analyzed: {analysis.total_turns}")
    print(f"Biases found: {len(analysis.biases_found)}")

    if analysis.bias_summary:
        print("\n--- Bias counts ---")
        for bias_id, count in sorted(analysis.bias_summary.items(), key=lambda x: -x[1]):
            print(f"  {bias_id}: {count}")

    if analysis.severity_distribution:
        print("\n--- Severity distribution ---")
        for level, count in analysis.severity_distribution.items():
            print(f"  {level}: {count}")

    if analysis.biases_found:
        print("\n--- Detailed findings ---")
        for i, bias in enumerate(analysis.biases_found, 1):
            print(f"\n[{i}] {bias.bias_id.upper()} (severity: {bias.severity}) — Turn {bias.turn_index}")
            print(f"    Context:     {bias.context}")
            print(f"    Evidence:    \"{bias.evidence}\"")
            print(f"    Explanation: {bias.explanation}")

    if analysis.interaction_patterns:
        print("\n--- Interaction patterns ---")
        for pattern in analysis.interaction_patterns:
            print(f"  • {pattern}")

    print(f"\n--- Overall assessment ---\n{analysis.overall_assessment}")
    print("=" * 60)


def main():
    parser = argparse.ArgumentParser(description="AI Cognitive Bias Detector")
    parser.add_argument("conversation", type=Path, help="Path to conversation JSON file")
    parser.add_argument(
        "--bias",
        choices=list(BIAS_PROMPTS.keys()),
        default="full",
        help="Which bias type to detect (default: full)",
    )
    parser.add_argument(
        "--model",
        default="claude-sonnet-4-5-20250929",
        help="Anthropic model to use for analysis",
    )
    parser.add_argument(
        "--json",
        action="store_true",
        help="Output raw JSON instead of formatted report",
    )
    args = parser.parse_args()

    if not args.conversation.exists():
        print(f"Error: {args.conversation} not found", file=sys.stderr)
        sys.exit(1)

    with open(args.conversation) as f:
        data = json.load(f)

    # Support both flat list and {"conversation": [...]} format
    conversation = data if isinstance(data, list) else data.get("conversation", data.get("turns", []))

    print(f"Analyzing {len(conversation)} turns for {args.bias} bias...\n", file=sys.stderr)

    analysis = detect_biases(conversation, bias_type=args.bias, model=args.model)

    if args.json:
        print(analysis.model_dump_json(indent=2))
    else:
        print_report(analysis)


if __name__ == "__main__":
    main()
