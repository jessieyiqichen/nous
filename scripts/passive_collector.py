"""Passive cognitive signal collector — flywheel core.

Scans Claude Code session JSONL files, converts to conversation format,
filters for cognitive signal value, extracts signals, and appends to history.

Data flow: Claude Code sessions → JSONL → convert → filter → extract → signals_history.json

Usage:
    python scripts/passive_collector.py collect [--since DAYS] [--model PATH] [--dry-run]
    python scripts/passive_collector.py status
"""

from __future__ import annotations

import argparse
import json
import os
import sys
import time
from datetime import datetime, timezone, timedelta
from pathlib import Path

# Add project root to path so we can import from core/
PROJECT_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(PROJECT_ROOT / "core"))

from signal_extractor import (
    FILTER_PROMPT,
    FILTER_SCHEMA,
    EXTRACT_PROMPT,
    SIGNAL_SCHEMA,
    call_api,
    split_into_chunks,
    _build_model_context,
    _merge_chunk_results,
    load_history,
    save_history,
    MAX_CONTENT_TOKENS,
    MODEL_HAIKU,
    MODEL_SONNET,
)

# ── Paths ─────────────────────────────────────────────────────

CLAUDE_PROJECTS_DIR = Path.home() / ".claude" / "projects"
DATA_DIR = PROJECT_ROOT / "data"
PROCESSED_PATH = DATA_DIR / "processed_sessions.json"
HISTORY_PATH = DATA_DIR / "signals_history.json"

# ── JSONL → Conversation ─────────────────────────────────────


def _extract_text_from_content(content) -> str:
    """Extract text from message content (string or list of blocks)."""
    if isinstance(content, str):
        return content.strip()

    if isinstance(content, list):
        parts = []
        for block in content:
            if isinstance(block, dict) and block.get("type") == "text":
                t = block.get("text", "").strip()
                if t:
                    parts.append(t)
        return "\n".join(parts)

    return ""


def jsonl_to_conversation(jsonl_path: Path) -> str | None:
    """Convert Claude Code JSONL to conversation markdown with turn prefixes.

    Improvements over scripts/jsonl_to_conversation.py:
    - UUID-based dedup (handles streaming duplicate entries)
    - Only extracts user text + assistant text (skips thinking, tool_use, tool_result)
    - Adds [Turn N] USER/ASSISTANT: prefix (signal_extractor needs this)
    - Returns None if < 5 user turns (not enough for signal extraction)
    """
    seen_uuids: set[str] = set()
    turns: list[tuple[str, str]] = []  # (role, text)

    try:
        with jsonl_path.open("r", encoding="utf-8") as f:
            for raw_line in f:
                raw_line = raw_line.strip()
                if not raw_line:
                    continue
                try:
                    entry = json.loads(raw_line)
                except json.JSONDecodeError:
                    continue

                # UUID dedup — skip duplicate streaming entries
                uuid = entry.get("uuid")
                if uuid:
                    if uuid in seen_uuids:
                        continue
                    seen_uuids.add(uuid)

                msg = entry.get("message")
                if not msg:
                    continue

                role = msg.get("role")
                if role not in ("user", "assistant"):
                    continue

                content = msg.get("content")
                if not content:
                    continue

                text = _extract_text_from_content(content)
                if not text:
                    continue

                turns.append((role, text))
    except (OSError, UnicodeDecodeError) as e:
        print(f"  Warning: could not read {jsonl_path.name}: {e}", file=sys.stderr)
        return None

    # Count user turns
    user_turns = sum(1 for r, _ in turns if r == "user")
    if user_turns < 5:
        return None

    # Build conversation text with turn prefixes
    lines = []
    for i, (role, text) in enumerate(turns):
        prefix = "USER" if role == "user" else "ASSISTANT"
        lines.append(f"[Turn {i}] {prefix}:\n{text}\n")

    return "\n".join(lines)


# ── Session scanning ─────────────────────────────────────────


def _scan_jsonl_files(since_days: int) -> list[Path]:
    """Scan ~/.claude/projects/ for JSONL files, excluding subagents."""
    if not CLAUDE_PROJECTS_DIR.exists():
        print(f"Claude projects directory not found: {CLAUDE_PROJECTS_DIR}", file=sys.stderr)
        return []

    cutoff = time.time() - (since_days * 86400)
    results = []

    for jsonl_path in CLAUDE_PROJECTS_DIR.rglob("*.jsonl"):
        # Exclude subagents directories
        if "subagents" in jsonl_path.parts:
            continue

        # Check modification time
        try:
            mtime = jsonl_path.stat().st_mtime
        except OSError:
            continue

        if mtime < cutoff:
            continue

        results.append(jsonl_path)

    # Sort by modification time (newest first)
    results.sort(key=lambda p: p.stat().st_mtime, reverse=True)
    return results


def _load_processed() -> dict:
    """Load processed sessions record."""
    if PROCESSED_PATH.exists():
        return json.loads(PROCESSED_PATH.read_text(encoding="utf-8"))
    return {}


def _save_processed(processed: dict) -> None:
    """Save processed sessions record."""
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    PROCESSED_PATH.write_text(
        json.dumps(processed, indent=2, ensure_ascii=False),
        encoding="utf-8",
    )


# ── Commands ──────────────────────────────────────────────────


def cmd_collect(since_days: int, model_path: Path | None, dry_run: bool, file_path: Path | None = None):
    """Scan JSONL files, filter, extract signals, append to history."""
    if file_path:
        # Process a single specified file
        if not file_path.exists():
            print(f"File not found: {file_path}", file=sys.stderr)
            return
        all_files = [file_path]
        processed = _load_processed()
        new_files = [f for f in all_files if str(f) not in processed]
        print(f"Processing specified file: {file_path.name}", file=sys.stderr)
    else:
        print(f"Scanning for JSONL files (last {since_days} days)...", file=sys.stderr)
        all_files = _scan_jsonl_files(since_days)
        processed = _load_processed()
        new_files = [f for f in all_files if str(f) not in processed]

    print(f"Found {len(all_files)} JSONL files, {len(new_files)} unprocessed.", file=sys.stderr)

    if not new_files:
        print("Nothing to process.", file=sys.stderr)
        return

    if dry_run:
        print(f"\n[DRY RUN] Would process {len(new_files)} files:", file=sys.stderr)
        for f in new_files:
            size_kb = f.stat().st_size / 1024
            mtime = datetime.fromtimestamp(f.stat().st_mtime).strftime("%Y-%m-%d %H:%M")
            print(f"  {f.name} ({size_kb:.0f} KB, {mtime})", file=sys.stderr)
        return

    # Process each file
    history = load_history(HISTORY_PATH)
    stats = {"converted": 0, "filtered_out": 0, "extracted": 0, "errors": 0}

    for i, jsonl_path in enumerate(new_files):
        session_id = jsonl_path.stem
        print(f"\n[{i+1}/{len(new_files)}] {jsonl_path.name}", file=sys.stderr)

        # Step 1: Convert JSONL → conversation text
        text = jsonl_to_conversation(jsonl_path)
        if text is None:
            print(f"  Skipped (< 5 user turns or read error)", file=sys.stderr)
            processed[str(jsonl_path)] = {
                "timestamp": datetime.now(timezone.utc).isoformat(),
                "status": "skipped_short",
                "session_id": session_id,
            }
            continue

        stats["converted"] += 1
        user_turn_count = text.count("] USER:")
        print(f"  Converted: {len(text):,} chars, {user_turn_count} user turns", file=sys.stderr)

        # Step 1.5: Local pre-filter — skip sessions with low cognitive signal density
        COGNITIVE_KEYWORDS = [
            # 判断/决策
            "我觉得", "我选择", "决定", "我倾向", "我偏向", "我喜欢", "我讨厌", "我不想",
            # 不确定/犹豫
            "纠结", "不确定", "犹豫", "可能", "也许", "不知道", "不太确定", "要不要",
            # 情绪/感受
            "感觉", "担心", "焦虑", "烦", "累", "开心", "兴奋", "无聊", "难受", "舒服",
            # 反思/思考
            "思考", "在想", "想了想", "回头看", "说实话", "其实", "坦白说", "老实说",
            # 价值/态度
            "重要", "无所谓", "在乎", "不在乎", "有意思", "没意思", "值得", "不值得",
            # 矛盾/冲突
            "矛盾", "但是", "不过", "虽然", "可是", "放弃", "坚持",
            # 自我描述
            "我这个人", "我的习惯", "我一般", "我通常", "我总是", "我从来",
            # 提问/探索
            "为什么", "怎么想", "你觉得", "怎么看", "怎么办",
        ]
        user_lines = [line for line in text.split("\n") if line.startswith("[Turn") and "USER:" in line]
        if user_lines:
            hits = sum(1 for line in user_lines if any(kw in line for kw in COGNITIVE_KEYWORDS))
            density = hits / len(user_lines)
            print(f"  Local pre-filter: {hits}/{len(user_lines)} cognitive keywords ({density:.1%})", file=sys.stderr)
            if density < 0.05:
                print(f"  Skipped (signal density {density:.1%} < 5%, mostly technical)", file=sys.stderr)
                processed[str(jsonl_path)] = {
                    "timestamp": datetime.now(timezone.utc).isoformat(),
                    "status": "skipped_low_signal",
                    "session_id": session_id,
                    "signal_density": round(density, 3),
                }
                _save_processed(processed)
                stats["filtered_out"] += 1
                continue

        # Step 2: Filter — does this conversation have signal value?
        try:
            # Sample for large conversations (same logic as signal_extractor)
            filter_text = text
            if len(text) > MAX_CONTENT_TOKENS:
                sample_size = MAX_CONTENT_TOKENS // 3
                beginning = text[:sample_size]
                mid_start = len(text) // 2 - sample_size // 2
                middle = text[mid_start:mid_start + sample_size]
                ending = text[-sample_size:]
                filter_text = (
                    beginning
                    + "\n\n[... MIDDLE SECTION ...]\n\n"
                    + middle
                    + "\n\n[... LATER SECTION ...]\n\n"
                    + ending
                )

            print(f"  Filtering ({len(filter_text):,} chars, haiku)...", file=sys.stderr)
            filter_result = call_api(FILTER_PROMPT, filter_text, FILTER_SCHEMA, "signal_filter",
                                     model=MODEL_HAIKU)

            has_signal = filter_result.get("has_signal", False)
            confidence = filter_result.get("confidence", 0)
            signal_types = filter_result.get("signal_types", [])

            if not has_signal:
                print(f"  No signal (confidence: {confidence:.0%}). Skipped.", file=sys.stderr)
                stats["filtered_out"] += 1
                processed[str(jsonl_path)] = {
                    "timestamp": datetime.now(timezone.utc).isoformat(),
                    "status": "filtered_no_signal",
                    "session_id": session_id,
                    "filter_confidence": confidence,
                }
                _save_processed(processed)
                continue

            print(f"  Signal detected! (confidence: {confidence:.0%}, "
                  f"types: {', '.join(signal_types)})", file=sys.stderr)

        except Exception as e:
            print(f"  Filter error: {e}", file=sys.stderr)
            stats["errors"] += 1
            processed[str(jsonl_path)] = {
                "timestamp": datetime.now(timezone.utc).isoformat(),
                "status": "error_filter",
                "session_id": session_id,
                "error": str(e),
            }
            _save_processed(processed)
            continue

        # Step 3: Extract signals
        # For large files (>100K chars), sample beginning+middle+end instead of full chunking
        SAMPLE_THRESHOLD = 100_000
        try:
            model_context = _build_model_context(model_path)
            prompt = EXTRACT_PROMPT.format(model_context=model_context)

            extract_text = text
            if len(text) > SAMPLE_THRESHOLD:
                sample_size = MAX_CONTENT_TOKENS // 3
                beginning = text[:sample_size]
                mid_start = len(text) // 2 - sample_size // 2
                middle = text[mid_start:mid_start + sample_size]
                ending = text[-sample_size:]
                extract_text = (
                    beginning
                    + "\n\n[... MIDDLE SECTION ...]\n\n"
                    + middle
                    + "\n\n[... LATER SECTION ...]\n\n"
                    + ending
                )
                print(f"  Extracting (sampled {len(text):,} → {len(extract_text):,} chars)...",
                      file=sys.stderr)
            else:
                print(f"  Extracting ({len(extract_text):,} chars)...", file=sys.stderr)

            result = call_api(prompt, extract_text, SIGNAL_SCHEMA, "signal_extraction")

            signals = result.get("signals", [])
            conflicts = result.get("stated_vs_behavioral_conflicts", [])
            t3_deltas = result.get("t3_relevant_signals", [])

            print(f"  Result: {len(signals)} signals, {len(conflicts)} conflicts, "
                  f"{len(t3_deltas)} T3 deltas", file=sys.stderr)

            # Append to history
            history.append({
                "timestamp": datetime.now(timezone.utc).isoformat(),
                "source": f"passive:{session_id}",
                "source_path": str(jsonl_path),
                "model_used": str(model_path) if model_path else None,
                "signals_count": len(signals),
                "conflicts_count": len(conflicts),
                "t3_deltas_count": len(t3_deltas),
                "signals": signals,
                "stated_vs_behavioral_conflicts": conflicts,
                "t3_relevant_signals": t3_deltas,
                "conversation_summary": result.get("conversation_summary", ""),
                "filter_confidence": confidence,
                "filter_signal_types": signal_types,
            })
            save_history(HISTORY_PATH, history)

            stats["extracted"] += 1
            processed[str(jsonl_path)] = {
                "timestamp": datetime.now(timezone.utc).isoformat(),
                "status": "extracted",
                "session_id": session_id,
                "signals_count": len(signals),
                "conflicts_count": len(conflicts),
                "t3_deltas_count": len(t3_deltas),
            }
            _save_processed(processed)

        except Exception as e:
            print(f"  Extract error: {e}", file=sys.stderr)
            stats["errors"] += 1
            processed[str(jsonl_path)] = {
                "timestamp": datetime.now(timezone.utc).isoformat(),
                "status": "error_extract",
                "session_id": session_id,
                "error": str(e),
            }
            _save_processed(processed)
            continue

    # Final summary
    print(f"\n{'='*60}", file=sys.stderr)
    print("PASSIVE COLLECTION SUMMARY", file=sys.stderr)
    print(f"{'='*60}", file=sys.stderr)
    print(f"  Total scanned:    {len(new_files)}", file=sys.stderr)
    print(f"  Converted:        {stats['converted']}", file=sys.stderr)
    print(f"  Filtered out:     {stats['filtered_out']}", file=sys.stderr)
    print(f"  Signals extracted: {stats['extracted']}", file=sys.stderr)
    print(f"  Errors:           {stats['errors']}", file=sys.stderr)
    print(f"  History total:    {len(history)} extractions", file=sys.stderr)
    print(f"{'='*60}", file=sys.stderr)


def cmd_status():
    """Show scan status: processed/unprocessed sessions + signal stats."""
    processed = _load_processed()

    # Count all JSONL files (no time filter for status)
    all_files = []
    if CLAUDE_PROJECTS_DIR.exists():
        for jsonl_path in CLAUDE_PROJECTS_DIR.rglob("*.jsonl"):
            if "subagents" not in jsonl_path.parts:
                all_files.append(jsonl_path)

    unprocessed = [f for f in all_files if str(f) not in processed]

    # Status breakdown
    status_counts: dict[str, int] = {}
    for entry in processed.values():
        s = entry.get("status", "unknown")
        status_counts[s] = status_counts.get(s, 0) + 1

    print(f"\n{'='*60}")
    print("PASSIVE COLLECTOR STATUS")
    print(f"{'='*60}")
    print(f"\nSession files found:  {len(all_files)}")
    print(f"Already processed:    {len(processed)}")
    print(f"Unprocessed:          {len(unprocessed)}")

    if status_counts:
        print(f"\n--- Processing Status Breakdown ---")
        for status, count in sorted(status_counts.items(), key=lambda x: -x[1]):
            print(f"  {status}: {count}")

    # Signal history stats
    history = load_history(HISTORY_PATH)
    passive_entries = [e for e in history if e.get("source", "").startswith("passive:")]

    total_signals = sum(e.get("signals_count", 0) for e in history)
    total_conflicts = sum(e.get("conflicts_count", 0) for e in history)
    passive_signals = sum(e.get("signals_count", 0) for e in passive_entries)
    passive_conflicts = sum(e.get("conflicts_count", 0) for e in passive_entries)

    print(f"\n--- Signal History ---")
    print(f"  Total extractions:    {len(history)} ({len(passive_entries)} passive)")
    print(f"  Total signals:        {total_signals} ({passive_signals} passive)")
    print(f"  Total conflicts:      {total_conflicts} ({passive_conflicts} passive)")

    if passive_entries:
        print(f"\n--- Recent Passive Extractions ---")
        for entry in passive_entries[-5:]:
            ts = entry.get("timestamp", "?")[:19]
            src = entry.get("source", "?")
            ns = entry.get("signals_count", 0)
            nc = entry.get("conflicts_count", 0)
            print(f"  [{ts}] {src} — {ns} signals, {nc} conflicts")

    if unprocessed:
        # Show recent unprocessed files
        unprocessed.sort(key=lambda p: p.stat().st_mtime, reverse=True)
        print(f"\n--- Recent Unprocessed (top 10) ---")
        for f in unprocessed[:10]:
            size_kb = f.stat().st_size / 1024
            mtime = datetime.fromtimestamp(f.stat().st_mtime).strftime("%Y-%m-%d %H:%M")
            print(f"  {f.name} ({size_kb:.0f} KB, {mtime})")

    print(f"{'='*60}")


# ── Main ──────────────────────────────────────────────────────


def main():
    parser = argparse.ArgumentParser(
        description="Passive cognitive signal collector — extract signals from Claude Code sessions"
    )
    sub = parser.add_subparsers(dest="command")

    # collect
    p_collect = sub.add_parser("collect", help="Scan and extract signals from recent sessions")
    p_collect.add_argument(
        "--since", type=int, default=7,
        help="Only process sessions from last N days (default: 7)",
    )
    p_collect.add_argument(
        "--model", type=Path, default=None,
        help="Path to cognitive model JSON for T3 comparison",
    )
    p_collect.add_argument(
        "--dry-run", action="store_true",
        help="List files that would be processed without actually processing",
    )
    p_collect.add_argument(
        "--file", type=Path, default=None,
        help="Process a specific JSONL file instead of scanning all sessions",
    )

    # status
    sub.add_parser("status", help="Show scan status and signal statistics")

    args = parser.parse_args()

    if args.command == "collect":
        cmd_collect(args.since, args.model, args.dry_run, getattr(args, 'file', None))
    elif args.command == "status":
        cmd_status()
    else:
        parser.print_help()


if __name__ == "__main__":
    main()
