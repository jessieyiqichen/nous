"""Convert Claude Code JSONL session logs to readable conversation markdown.

Usage:
    python jsonl_to_conversation.py <input.jsonl> [output.md]
"""

from __future__ import annotations

import json
import sys
from pathlib import Path


def extract_conversations(jsonl_path: str, output_path: str | None = None) -> str:
    """Extract user/assistant text messages from JSONL, skip tool calls and thinking."""
    lines: list[str] = []
    path = Path(jsonl_path)

    with path.open("r", encoding="utf-8") as f:
        for raw_line in f:
            raw_line = raw_line.strip()
            if not raw_line:
                continue
            try:
                entry = json.loads(raw_line)
            except json.JSONDecodeError:
                continue

            msg = entry.get("message")
            if not msg:
                continue

            role = msg.get("role")
            if role not in ("user", "assistant"):
                continue

            content = msg.get("content")
            if not content:
                continue

            # Handle string content (user messages)
            if isinstance(content, str):
                text = content.strip()
                if text:
                    lines.append(f"## User\n{text}\n")
                continue

            # Handle list content (assistant messages with blocks)
            if isinstance(content, list):
                text_parts: list[str] = []
                for block in content:
                    if isinstance(block, dict):
                        # Only extract text blocks, skip thinking/tool_use/tool_result
                        if block.get("type") == "text":
                            t = block.get("text", "").strip()
                            if t:
                                text_parts.append(t)
                        # User tool_result — skip
                        elif block.get("type") == "tool_result":
                            continue
                if text_parts:
                    combined = "\n".join(text_parts)
                    prefix = "## User" if role == "user" else "## Assistant"
                    lines.append(f"{prefix}\n{combined}\n")

    result = "\n".join(lines)

    # Deduplicate: JSONL has multiple entries per streaming response
    # Keep only unique (role, content) pairs in order
    seen: set[str] = set()
    deduped_lines: list[str] = []
    current_block: list[str] = []

    for line in result.split("\n"):
        if line.startswith("## User") or line.startswith("## Assistant"):
            if current_block:
                block_text = "\n".join(current_block)
                if block_text not in seen:
                    seen.add(block_text)
                    deduped_lines.append(block_text)
            current_block = [line]
        else:
            current_block.append(line)

    if current_block:
        block_text = "\n".join(current_block)
        if block_text not in seen:
            deduped_lines.append(block_text)

    result = "\n".join(deduped_lines)

    if output_path:
        out = Path(output_path)
        out.write_text(result, encoding="utf-8")
        print(f"Written {len(result)} chars to {out}")
    else:
        out = path.with_suffix(".md")
        out.write_text(result, encoding="utf-8")
        print(f"Written {len(result)} chars to {out}")

    return result


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python jsonl_to_conversation.py <input.jsonl> [output.md]")
        sys.exit(1)

    input_file = sys.argv[1]
    output_file = sys.argv[2] if len(sys.argv) > 2 else None
    extract_conversations(input_file, output_file)
