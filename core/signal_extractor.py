"""Real-time conversational cognitive signal extractor.

Extracts behavioral signals from user-AI conversations to improve T3 (blind spot)
predictions. Solves the core problem: users can self-correct T1/T2 via feedback,
but blind spots are invisible to self-report.

Pipeline:
1. Filter — does this conversation have cognitive signal value?
2. Extract — pull structured signals (pushback, avoidance, decisions, etc.)
3. Compare — signals vs current cognitive model's blind spot predictions
4. Delta — generate model correction suggestions

Usage:
    python signal_extractor.py filter <conversation.md>
    python signal_extractor.py extract <conversation.md> --model cognitive_model_v2.json
    python signal_extractor.py history
"""

from __future__ import annotations

import argparse
import json
import sys
from datetime import datetime, timezone
from pathlib import Path

import anthropic

# ── Prompts ────────────────────────────────────────────────────

FILTER_PROMPT = """You are a cognitive signal analyst. Your task is to determine whether
a conversation between a human and an AI contains cognitive signals worth extracting.

Cognitive signals are behavioral patterns that reveal HOW someone thinks, not just WHAT
they said. They are especially valuable when they expose blind spots — things the person
doesn't realize about their own cognition.

## Conversations WITH cognitive signal value:
- Deep discussions involving decisions, trade-offs, or value conflicts
- User pushes back on AI suggestions (reveals real values/boundaries)
- User avoids or deflects certain topics (reveals blind spots)
- User makes decisions or choices within the conversation
- Emotional reactions or tone shifts (reveals sub-analytical processing)
- User reveals stated beliefs that contradict their actual behavior in the conversation
- Self-reflection, especially when it conflicts with observed behavior

## Conversations WITHOUT cognitive signal value:
- Purely instructional ("run this code", "format this text")
- Simple Q&A with no personal stake
- Administrative/logistics conversations
- Conversations too short to exhibit patterns (< 5 substantive turns)

## What to output:
- has_signal: true/false
- confidence: 0.0-1.0
- signal_types: which types of signals are present
- reasoning: why this conversation does or doesn't have cognitive signal value

CONVERSATION TO EVALUATE:
"""

EXTRACT_PROMPT = """You are a cognitive signal extractor analyzing a conversation between
a human and an AI. Your goal is to extract behavioral signals that reveal cognitive patterns,
especially blind spots that the person cannot see about themselves.

## Signal Types (7 categories):

1. **pushback** — User rejects or argues against AI's suggestion/analysis
   - T3 value: HIGH — reveals real value boundaries and non-negotiables
   - Look for: disagreement, correction, "that's not right", reframing

2. **acceptance** — User accepts AI's point without resistance
   - T3 value: MEDIUM — reveals default modes and unexamined assumptions
   - Look for: quick agreement, "exactly", no further questioning

3. **inquiry** — User asks follow-up questions, digs deeper
   - T3 value: MEDIUM — reveals what they're drawn to explore
   - Look for: "why?", "what about...", probing questions

4. **avoidance** — User deflects, changes topic, or ignores certain directions
   - T3 value: HIGH — directly exposes blind spots
   - Look for: topic switches, non-answers, "let's move on", selective response

5. **decision** — User makes a choice or commitment in the conversation
   - T3 value: HIGH — revealed preference (what they actually choose vs claim to value)
   - Look for: "I'll do X", "I prefer", concrete action decisions

6. **emotion_leak** — Emotional response breaks through analytical layer
   - T3 value: HIGH — reveals what's below the analytical surface
   - Look for: tone shifts, exclamation, sarcasm, sudden brevity/length change

7. **value_reveal** — User inadvertently exposes a value or priority
   - T3 value: HIGH — stated vs revealed preference gap
   - Look for: casual remarks that betray priorities, what they emphasize without being asked

## Dual-Track Analysis (CRITICAL for T3):

For each signal, classify it as:
- **stated** — What the user explicitly claims about themselves ("I always consider emotions")
- **behavioral** — What the user actually does in the conversation (ignores emotional arguments)

When stated != behavioral → This is OBJECTIVE blind spot evidence.

## T3 Comparison:

You will also receive the current cognitive model (if provided). For signals relevant
to Blind Spots (dimension 6) or Execution-Layer Flexibility (dimension 9), compare:
- What the model predicts this person would do
- What they actually did in this conversation
- Generate a delta (correction suggestion) if there's a mismatch

IMPORTANT:
- Only extract signals you have DIRECT evidence for (quote the conversation)
- Confidence reflects how clearly the signal demonstrates the cognitive pattern
- Not every conversation will have T3-relevant signals — that's fine
- Focus on QUALITY over QUANTITY — 3 high-confidence signals > 10 weak ones

{model_context}

CONVERSATION TO ANALYZE:
"""

# ── Schemas ────────────────────────────────────────────────────

FILTER_SCHEMA = {
    "type": "object",
    "properties": {
        "has_signal": {"type": "boolean"},
        "confidence": {"type": "number"},
        "signal_types": {
            "type": "array",
            "items": {
                "type": "string",
                "enum": [
                    "pushback", "acceptance", "inquiry", "avoidance",
                    "decision", "emotion_leak", "value_reveal",
                ],
            },
        },
        "reasoning": {"type": "string"},
    },
    "required": ["has_signal", "confidence", "signal_types", "reasoning"],
}

SIGNAL_SCHEMA = {
    "type": "object",
    "properties": {
        "signals": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "signal_type": {
                        "type": "string",
                        "enum": [
                            "pushback", "acceptance", "inquiry", "avoidance",
                            "decision", "emotion_leak", "value_reveal",
                        ],
                    },
                    "track": {
                        "type": "string",
                        "enum": ["stated", "behavioral"],
                        "description": "Whether this is a stated belief or observed behavior",
                    },
                    "turn_range": {"type": "string"},
                    "evidence": {"type": "string", "description": "Direct quote from conversation"},
                    "cognitive_dimension": {
                        "type": "string",
                        "description": "Which of the 9 cognitive dimensions this relates to",
                    },
                    "interpretation": {"type": "string"},
                    "confidence": {"type": "number"},
                },
                "required": [
                    "signal_type", "track", "turn_range", "evidence",
                    "cognitive_dimension", "interpretation", "confidence",
                ],
            },
        },
        "stated_vs_behavioral_conflicts": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "stated_signal_index": {"type": "integer"},
                    "behavioral_signal_index": {"type": "integer"},
                    "stated_claim": {"type": "string"},
                    "actual_behavior": {"type": "string"},
                    "blind_spot_evidence": {"type": "string"},
                    "confidence": {"type": "number"},
                },
                "required": [
                    "stated_claim", "actual_behavior",
                    "blind_spot_evidence", "confidence",
                ],
            },
            "description": "Cases where stated beliefs contradict observed behavior — direct blind spot evidence",
        },
        "conversation_summary": {"type": "string"},
        "t3_relevant_signals": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "signal_index": {"type": "integer"},
                    "blind_spot_dimension": {"type": "string"},
                    "current_model_says": {"type": "string"},
                    "actual_behavior": {"type": "string"},
                    "delta": {"type": "string"},
                    "confidence": {"type": "number"},
                },
                "required": [
                    "blind_spot_dimension", "current_model_says",
                    "actual_behavior", "delta", "confidence",
                ],
            },
        },
    },
    "required": [
        "signals", "stated_vs_behavioral_conflicts",
        "conversation_summary", "t3_relevant_signals",
    ],
}

# ── Helpers ────────────────────────────────────────────────────


def read_conversation(path: Path) -> str:
    """Read conversation from .md, .json, or .jsonl file."""
    text = path.read_text(encoding="utf-8")

    if path.suffix == ".json":
        data = json.loads(text)
        # Support {"conversation": [...]} or flat list of turns
        turns = data if isinstance(data, list) else data.get("conversation", data.get("turns", []))
        lines = []
        for i, turn in enumerate(turns):
            role = turn.get("role", "unknown").upper()
            content = turn.get("content", "")
            lines.append(f"[Turn {i}] {role}:\n{content}\n")
        return "\n".join(lines)

    if path.suffix == ".jsonl":
        lines = []
        for i, line in enumerate(text.strip().split("\n")):
            turn = json.loads(line)
            role = turn.get("role", "unknown").upper()
            content = turn.get("content", "")
            lines.append(f"[Turn {i}] {role}:\n{content}\n")
        return "\n".join(lines)

    # .md or plain text — return as-is
    return text


def estimate_tokens(text: str) -> int:
    """Rough token estimate: ~1 token per character for CJK-heavy text."""
    return len(text)


# Conservative limit: leave room for prompt (~4K) + output (16K) + tool schema (~2K)
MAX_CONTENT_TOKENS = 170_000


def split_into_chunks(text: str, max_chars: int = MAX_CONTENT_TOKENS) -> list[str]:
    """Split text into chunks at paragraph boundaries."""
    if len(text) <= max_chars:
        return [text]

    chunks = []
    paragraphs = text.split("\n\n")
    current_chunk: list[str] = []
    current_len = 0

    for para in paragraphs:
        para_len = len(para) + 2  # +2 for the \n\n separator
        if current_len + para_len > max_chars and current_chunk:
            chunks.append("\n\n".join(current_chunk))
            current_chunk = [para]
            current_len = para_len
        else:
            current_chunk.append(para)
            current_len += para_len

    if current_chunk:
        chunks.append("\n\n".join(current_chunk))

    return chunks


MODEL_SONNET = "claude-sonnet-4-5-20250929"
MODEL_HAIKU = "claude-haiku-4-5-20251001"


def call_api(prompt: str, input_text: str, schema: dict, tool_name: str,
             model: str = MODEL_SONNET) -> dict:
    """Call Anthropic API with tool_choice for structured output."""
    client = anthropic.Anthropic()
    response = client.messages.create(
        model=model,
        max_tokens=16384,
        messages=[{"role": "user", "content": prompt + input_text}],
        tools=[{
            "name": tool_name,
            "description": f"Report {tool_name} results.",
            "input_schema": schema,
        }],
        tool_choice={"type": "tool", "name": tool_name},
    )
    for block in response.content:
        if block.type == "tool_use":
            return block.input
    raise RuntimeError("No tool use response from API")


def load_history(path: Path) -> list[dict]:
    """Load signal history from JSON file."""
    if path.exists():
        return json.loads(path.read_text(encoding="utf-8"))
    return []


def save_history(path: Path, history: list[dict]) -> None:
    """Save signal history to JSON file."""
    path.write_text(json.dumps(history, indent=2, ensure_ascii=False), encoding="utf-8")


# ── Commands ───────────────────────────────────────────────────


def cmd_filter(conversation_path: Path):
    """Quick check: does this conversation have cognitive signal value?"""
    text = read_conversation(conversation_path)

    # For large files, sample beginning + middle + end for filtering
    tokens_est = estimate_tokens(text)
    if tokens_est > MAX_CONTENT_TOKENS:
        sample_size = MAX_CONTENT_TOKENS // 3
        beginning = text[:sample_size]
        mid_start = len(text) // 2 - sample_size // 2
        middle = text[mid_start:mid_start + sample_size]
        ending = text[-sample_size:]
        text = (
            beginning
            + "\n\n[... MIDDLE SECTION ...]\n\n"
            + middle
            + "\n\n[... LATER SECTION ...]\n\n"
            + ending
        )
        print(f"Filtering {conversation_path.name} (sampled ~{tokens_est:,} chars → ~{len(text):,})...",
              file=sys.stderr)
    else:
        print(f"Filtering {conversation_path.name}...", file=sys.stderr)

    result = call_api(FILTER_PROMPT, text, FILTER_SCHEMA, "signal_filter")

    # Print result
    has = result["has_signal"]
    conf = result["confidence"]
    icon = "+" if has else "-"
    print(f"\n[{icon}] Signal value: {'YES' if has else 'NO'} (confidence: {conf:.0%})")

    if result["signal_types"]:
        print(f"    Signal types: {', '.join(result['signal_types'])}")

    print(f"    Reasoning: {result['reasoning']}")

    return result


def _build_model_context(model_path: Path | None) -> str:
    """Build the model context string for extraction prompts."""
    if model_path and model_path.exists():
        model_data = json.loads(model_path.read_text(encoding="utf-8"))
        t3_dims = [
            dim for dim in model_data.get("dimensions", [])
            if dim["name"] in ("Blind Spots", "Execution-Layer Flexibility")
        ]
        return (
            "## Current Cognitive Model (T3-relevant dimensions):\n\n"
            + json.dumps(t3_dims, indent=2, ensure_ascii=False)
            + "\n\nCompare extracted signals against these dimensions. "
            "Generate deltas where actual behavior diverges from model predictions.\n"
        )
    return (
        "## No cognitive model provided.\n"
        "Skip T3 comparison — just extract signals and note which ones "
        "would be relevant to blind spot analysis.\n"
    )


def _merge_chunk_results(chunk_results: list[dict]) -> dict:
    """Merge extraction results from multiple chunks into one."""
    all_signals = []
    all_conflicts = []
    all_t3_deltas = []
    summaries = []

    for r in chunk_results:
        all_signals.extend(r.get("signals", []))
        all_conflicts.extend(r.get("stated_vs_behavioral_conflicts", []))
        all_t3_deltas.extend(r.get("t3_relevant_signals", []))
        s = r.get("conversation_summary", "")
        if s:
            summaries.append(s)

    return {
        "signals": all_signals,
        "stated_vs_behavioral_conflicts": all_conflicts,
        "t3_relevant_signals": all_t3_deltas,
        "conversation_summary": " | ".join(summaries),
    }


def cmd_extract(conversation_path: Path, model_path: Path | None, history_path: Path):
    """Full pipeline: filter -> extract signals -> T3 comparison -> save."""
    text = read_conversation(conversation_path)
    model_context = _build_model_context(model_path)
    prompt = EXTRACT_PROMPT.format(model_context=model_context)

    tokens_est = estimate_tokens(text)
    chunks = split_into_chunks(text)
    n_chunks = len(chunks)

    if n_chunks > 1:
        print(f"Extracting signals from {conversation_path.name} "
              f"(~{tokens_est:,} chars → {n_chunks} chunks)...", file=sys.stderr)
        chunk_results = []
        for i, chunk in enumerate(chunks):
            chunk_prompt = prompt + (
                f"\n[CHUNK {i+1}/{n_chunks} — "
                f"extract signals from this section only]\n\n"
            )
            print(f"  Processing chunk {i+1}/{n_chunks} (~{len(chunk):,} chars)...",
                  file=sys.stderr)
            r = call_api(chunk_prompt, chunk, SIGNAL_SCHEMA, "signal_extraction")
            chunk_results.append(r)
        result = _merge_chunk_results(chunk_results)
    else:
        print(f"Extracting signals from {conversation_path.name}...", file=sys.stderr)
        result = call_api(prompt, text, SIGNAL_SCHEMA, "signal_extraction")

    # Print report
    signals = result.get("signals", [])
    conflicts = result.get("stated_vs_behavioral_conflicts", [])
    t3_deltas = result.get("t3_relevant_signals", [])

    print(f"\n{'='*60}")
    print("COGNITIVE SIGNAL EXTRACTION REPORT")
    print(f"{'='*60}")
    print(f"\nSource: {conversation_path.name}")
    print(f"Signals found: {len(signals)}")
    print(f"Stated/behavioral conflicts: {len(conflicts)}")
    print(f"T3 deltas: {len(t3_deltas)}")

    if signals:
        print(f"\n--- Extracted Signals ---")
        for i, sig in enumerate(signals):
            track_icon = "S" if sig["track"] == "stated" else "B"
            print(f"\n  [{i}] {sig['signal_type'].upper()} [{track_icon}] "
                  f"(conf: {sig['confidence']:.0%}) — {sig['turn_range']}")
            print(f"      Dimension: {sig['cognitive_dimension']}")
            print(f"      Evidence: \"{sig['evidence'][:120]}{'...' if len(sig['evidence']) > 120 else ''}\"")
            print(f"      Interpretation: {sig['interpretation']}")

    if conflicts:
        print(f"\n--- Stated vs Behavioral Conflicts (Blind Spot Evidence) ---")
        for i, c in enumerate(conflicts):
            print(f"\n  [{i}] Confidence: {c['confidence']:.0%}")
            print(f"      Stated: {c['stated_claim']}")
            print(f"      Actual: {c['actual_behavior']}")
            print(f"      Blind spot: {c['blind_spot_evidence']}")

    if t3_deltas:
        print(f"\n--- T3 Model Deltas ---")
        for i, d in enumerate(t3_deltas):
            print(f"\n  [{i}] {d['blind_spot_dimension']} (conf: {d['confidence']:.0%})")
            print(f"      Model says: {d['current_model_says']}")
            print(f"      Actual: {d['actual_behavior']}")
            print(f"      Delta: {d['delta']}")

    print(f"\n--- Summary ---")
    print(f"  {result.get('conversation_summary', 'N/A')}")
    print(f"{'='*60}")

    # Append to history
    history = load_history(history_path)
    history.append({
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "source": str(conversation_path),
        "model_used": str(model_path) if model_path else None,
        "signals_count": len(signals),
        "conflicts_count": len(conflicts),
        "t3_deltas_count": len(t3_deltas),
        "signals": signals,
        "stated_vs_behavioral_conflicts": conflicts,
        "t3_relevant_signals": t3_deltas,
        "conversation_summary": result.get("conversation_summary", ""),
    })
    save_history(history_path, history)
    print(f"\nHistory updated: {history_path} ({len(history)} total extractions)", file=sys.stderr)

    return result


def cmd_history(history_path: Path):
    """Show accumulated signal extraction history."""
    history = load_history(history_path)

    if not history:
        print("No signal extraction history found.")
        return

    print(f"\n{'='*60}")
    print("SIGNAL EXTRACTION HISTORY")
    print(f"{'='*60}")
    print(f"\nTotal extractions: {len(history)}")

    total_signals = sum(e.get("signals_count", 0) for e in history)
    total_conflicts = sum(e.get("conflicts_count", 0) for e in history)
    total_deltas = sum(e.get("t3_deltas_count", 0) for e in history)

    print(f"Total signals: {total_signals}")
    print(f"Total stated/behavioral conflicts: {total_conflicts}")
    print(f"Total T3 deltas: {total_deltas}")

    # Signal type distribution
    type_counts: dict[str, int] = {}
    for entry in history:
        for sig in entry.get("signals", []):
            st = sig.get("signal_type", "unknown")
            type_counts[st] = type_counts.get(st, 0) + 1

    if type_counts:
        print(f"\n--- Signal Type Distribution ---")
        for st, count in sorted(type_counts.items(), key=lambda x: -x[1]):
            print(f"  {st}: {count}")

    # Track distribution
    stated_count = sum(
        1 for e in history for s in e.get("signals", []) if s.get("track") == "stated"
    )
    behavioral_count = sum(
        1 for e in history for s in e.get("signals", []) if s.get("track") == "behavioral"
    )
    if stated_count or behavioral_count:
        print(f"\n--- Track Distribution ---")
        print(f"  Stated signals: {stated_count}")
        print(f"  Behavioral signals: {behavioral_count}")

    print(f"\n--- Extraction Log ---")
    for entry in history:
        ts = entry.get("timestamp", "?")[:19]
        src = Path(entry.get("source", "?")).name
        ns = entry.get("signals_count", 0)
        nc = entry.get("conflicts_count", 0)
        nd = entry.get("t3_deltas_count", 0)
        print(f"  [{ts}] {src} — {ns} signals, {nc} conflicts, {nd} deltas")

    print(f"{'='*60}")


# ── Main ───────────────────────────────────────────────────────


def main():
    parser = argparse.ArgumentParser(
        description="Cognitive Signal Extractor — extract behavioral signals from conversations"
    )
    sub = parser.add_subparsers(dest="command")

    # filter
    p_filter = sub.add_parser("filter", help="Check if conversation has cognitive signal value")
    p_filter.add_argument("conversation", type=Path, help="Path to conversation file (.md/.json/.jsonl)")

    # extract
    p_extract = sub.add_parser("extract", help="Extract cognitive signals from conversation")
    p_extract.add_argument("conversation", type=Path, help="Path to conversation file (.md/.json/.jsonl)")
    p_extract.add_argument("--model", type=Path, default=None, help="Path to cognitive model JSON")
    p_extract.add_argument(
        "--history", type=Path, default=Path("signals_history.json"),
        help="Path to history file (default: signals_history.json)",
    )

    # history
    p_history = sub.add_parser("history", help="Show signal extraction history")
    p_history.add_argument(
        "--history", type=Path, default=Path("signals_history.json"),
        help="Path to history file (default: signals_history.json)",
    )

    args = parser.parse_args()

    if args.command == "filter":
        if not args.conversation.exists():
            print(f"Error: {args.conversation} not found", file=sys.stderr)
            sys.exit(1)
        cmd_filter(args.conversation)

    elif args.command == "extract":
        if not args.conversation.exists():
            print(f"Error: {args.conversation} not found", file=sys.stderr)
            sys.exit(1)
        cmd_extract(args.conversation, args.model, args.history)

    elif args.command == "history":
        cmd_history(args.history)

    else:
        parser.print_help()


if __name__ == "__main__":
    main()
