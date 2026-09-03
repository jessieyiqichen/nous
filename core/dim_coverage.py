"""Dimension coverage checking for the cognitive interview.

Assesses how well each of the 9 cognitive dimensions is covered by the
conversation so far, prints coverage reports, and applies the Blind Spots
confidence override based on contradiction evidence.
"""

from __future__ import annotations

from api_utils import call_api

# ── Coverage Prompt & Schema ──────────────────────────────────

DIMENSION_CHECK_PROMPT = """Given this conversation transcript, assess coverage of each cognitive dimension.

For each dimension, rate confidence as:
- "high" — clear behavioral evidence from multiple angles
- "medium" — some evidence, enough to form initial hypotheses
- "low" — only hints, not enough for reliable modeling
- "none" — no evidence at all

Dimensions:
1. Decision Architecture
2. Attention Allocation
3. Reasoning Style
4. Emotional Processing
5. Social Cognition
6. Blind Spots
7. Value Hierarchy
8. Response to Uncertainty
9. Execution-Layer Flexibility

Conversation transcript:
"""

COVERAGE_SCHEMA = {
    "type": "object",
    "properties": {
        "dimensions": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "name": {"type": "string"},
                    "confidence": {
                        "type": "string",
                        "enum": ["high", "medium", "low", "none"],
                    },
                    "evidence_summary": {"type": "string"},
                },
                "required": ["name", "confidence"],
            },
        },
        "suggested_next_topic": {
            "type": "string",
            "description": "What to explore next to fill the biggest gap",
        },
        "overall_readiness": {
            "type": "string",
            "enum": ["ready", "almost", "needs_more"],
            "description": "Whether enough data exists to build a reliable model",
        },
    },
    "required": ["dimensions", "suggested_next_topic", "overall_readiness"],
}


# ── Coverage Functions ────────────────────────────────────────


def check_coverage(transcript: str) -> dict:
    """Assess per-dimension coverage of the transcript via the API."""
    return call_api(DIMENSION_CHECK_PROMPT, transcript, COVERAGE_SCHEMA, "dimension_coverage")


def print_coverage(coverage: dict, focus_dims: list[str] | None = None) -> None:
    """Print a human-readable dimension coverage report."""
    icons = {"high": "+++", "medium": " + ", "low": " - ", "none": "   "}
    print(f"\n--- Dimension Coverage ---")
    for d in coverage.get("dimensions", []):
        conf = d.get("confidence", "none")
        icon = icons.get(conf, " ? ")
        is_focus = focus_dims and d["name"] in focus_dims
        marker = " *" if is_focus else ""
        print(f"  [{icon}] {d['name']}: {conf}{marker}")
        if d.get("evidence_summary"):
            print(f"        {d['evidence_summary']}")
    if focus_dims:
        print(f"\n  * = focus dimension (needs HIGH)")
    readiness = coverage.get("overall_readiness", "?")
    print(f"\n  Model readiness: {readiness}")
    suggestion = coverage.get("suggested_next_topic", "")
    if suggestion:
        print(f"  Suggested next topic: {suggestion}")
    print()


def override_blind_spots_confidence(coverage: dict, conflict_count: int) -> None:
    """Override Blind Spots confidence based on contradiction evidence.

    Blind spots can't reach high confidence through conversation alone (they're
    invisible to the person). Use conflict count as proxy: >=2 -> medium, >=4 -> high.
    """
    if conflict_count < 2:
        return
    rank = {"none": 0, "low": 1, "medium": 2, "high": 3}
    for d in coverage.get("dimensions", []):
        if d["name"] == "Blind Spots":
            if conflict_count >= 4:
                d["confidence"] = "high"
            elif rank.get(d.get("confidence", "none"), 0) < 2:
                d["confidence"] = "medium"
            break
