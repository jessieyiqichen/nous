"""Prompt constants and schemas for the behavioral prediction validator.

BUILD_MODEL_PROMPT / MODEL_SCHEMA / CONTEXT_SCHEMA are loaded from
core/prompts/ and core/schemas/ — the single source shared with the web
frontend (prebuild generates the TS snapshot from the same files).
"""

from __future__ import annotations

import json
from pathlib import Path

# ── Cognitive Model Builder ─────────────────────────────────────
# 单一来源：core/prompts/ 与 core/schemas/（web 端经 prebuild 生成 TS 共享同一份）

_CORE_DIR = Path(__file__).resolve().parent

BUILD_MODEL_PROMPT = (_CORE_DIR / "prompts" / "build_model.md").read_text(encoding="utf-8")

MODEL_SCHEMA = json.loads(
    (_CORE_DIR / "schemas" / "model_schema.json").read_text(encoding="utf-8")
)

CONTEXT_SCHEMA = json.loads(
    (_CORE_DIR / "schemas" / "context_schema.json").read_text(encoding="utf-8")
)

# ── Prediction Generator ────────────────────────────────────────

GENERATE_PREDICTIONS_PROMPT = """You are designing a behavioral prediction test to validate
a cognitive model's accuracy.

Given the cognitive model below, generate 21 predictions across three tiers.
ALL scenarios and questions must be in Chinese (中文).

## TIER 1: Preference Predictions (7 questions)
- Format: Multiple choice (4 options, one predicted answer)
- Tests: Basic preferences, reactions, choices under everyday tensions
- These SHOULD be easy if the model is even roughly correct
- Keep each option SHORT and specific (under 20 characters preferred)
- At least 2 questions must create tension between "principled" and "pragmatic" answers
- Include your predicted answer and confidence (0.0-1.0)

## TIER 2: Reasoning Predictions (7 questions)
- Format: Short scenario (1-2 sentences, max 50 characters) + 4 options representing different reasoning approaches or conclusions
- Tests: HOW the person would think through a novel problem
- Each option should represent a distinct reasoning framework or decision path
- Include your predicted answer (which option they'd pick), predicted reasoning, and confidence

## TIER 3: Blind Spot Predictions (7 questions)
- Tests: What the person would systematically MISS or underweight
- For each prediction, provide:
  - **predicted_blind_spot**: A concise description of the specific blind spot (1-2 sentences)
  - **statement**: A diagnostic statement that would reveal this blind spot
  - **predicted_response**: How they'd respond on 5-point scale (strongly_disagree / disagree / neutral / agree / strongly_agree)
  - **confidence** and **reasoning_from_model**
- NOTE: T3 will be auto-evaluated against observed behavioral contradictions, NOT self-reported

CRITICAL RULES:
- ALL scenarios and ALL text must be in Chinese (中文)
- **KEEP SCENARIOS SHORT** — each scenario MUST be 1-3 sentences (50 characters max).
  Use everyday situations, not elaborate hypotheticals. The simpler the scenario,
  the less noise from the user misunderstanding the question.
- Scenarios must be NOVEL — not things from the profile/conversation
- Scenarios should be concrete and specific, not abstract
- Tier 2 and 3 questions must be impossible to answer correctly just by
  knowing someone's preferences — they require modeling cognitive PROCESS
- Each prediction must include explicit reasoning from the cognitive model
  (which dimension supports this prediction and why)

REALITY CONSTRAINT RULES (anti-idealization):
- Every prediction must consider real-world constraints (time pressure, social cost, fatigue, etc.)
- Tier 1: At least 2 questions must create tension between "principled" and "pragmatic" answers
  (e.g., deadline vs quality, social harmony vs honesty)
- Tier 2: At least 2 scenarios must include genuine constraints (boss pressure, limited time,
  team dynamics) — not just abstract thought experiments
- Tier 3: Blind spot predictions should come from EXECUTION-LAYER compromises (what they'd
  actually do under pressure), not just cognitive architecture gaps

CONTEXT TAGGING (required for every question):
For each prediction, annotate the situational context using these variables:
- **time_pressure**: "none" | "low" | "high" — how much time constraint exists
- **social_pressure**: "none" | "low" | "high" — how much social expectation/cost is involved
- **caring_level**: "low" | "medium" | "high" — how engaged this person's caring system would be
- **energy_state**: "rested" | "normal" | "depleted" — assumed energy/fatigue level
These context tags make predictions CONDITIONAL: "Given [context], this person would..."
Vary contexts across questions — don't always use high-caring high-energy scenarios.

COGNITIVE MODEL:
"""

# ── Accuracy Scorer ─────────────────────────────────────────────

SCORE_PROMPT = """You are evaluating the accuracy of behavioral predictions against actual responses.

For each prediction-response pair:

1. **Tier 1 (preference)**: Binary — did the predicted choice match? Score 1.0 or 0.0
   (0.5 if the actual answer is close but not exact)

2. **Tier 2 (reasoning)**: Score 0.0-1.0 based on:
   - Did the person pick the predicted option? (0.6 if exact match, 0.3 if adjacent reasoning)
   - Does the chosen option reflect the predicted reasoning framework? (0-0.2)
   - Does the chosen option lead to the predicted conclusion direction? (0-0.2)

3. **Tier 3 (blind spot)**: Auto-scored against contradiction data. Score 0.0-1.0:
   - Strong match: A contradiction directly confirms this blind spot (0.8-1.0)
   - Partial match: Related evidence, supports but doesn't directly confirm (0.4-0.6)
   - No evidence: No contradictions relate to this blind spot (0.2-0.3)
   - Contradicted: Evidence shows the person IS aware and compensates (0.0-0.1)

For each pair, provide:
- score (0.0-1.0)
- reasoning (why this score)
- surprise (anything the person did that the model didn't predict at all)
- In the "surprise" field, ALSO label the error type if the prediction was wrong:
  - "认知架构错误" — the model got the cognitive structure wrong
  - "过度理想化" — the model predicted the idealized/principled response but the person was more pragmatic/flexible
  Distinguishing these two error types is critical for model calibration.

Then compute:
- tier_1_accuracy: average score for tier 1
- tier_2_accuracy: average score for tier 2
- tier_3_accuracy: average score for tier 3
- overall_accuracy: weighted average (tier1 * 0.2 + tier2 * 0.4 + tier3 * 0.4)
- accuracy_gradient: tier_1 - tier_3 (larger = more gap between surface and deep understanding)

PREDICTIONS AND ACTUAL RESPONSES:
"""

# ── Schema definitions ──────────────────────────────────────────

PREDICTION_SCHEMA = {
    "type": "object",
    "properties": {
        "tier_1": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "id": {"type": "string"},
                    "scenario": {"type": "string"},
                    "context": CONTEXT_SCHEMA,
                    "options": {"type": "array", "items": {"type": "string"}},
                    "predicted_answer": {"type": "string"},
                    "confidence": {"type": "number"},
                    "reasoning_from_model": {"type": "string"},
                },
                "required": ["id", "scenario", "context", "options", "predicted_answer", "confidence", "reasoning_from_model"],
            },
        },
        "tier_2": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "id": {"type": "string"},
                    "scenario": {"type": "string"},
                    "context": CONTEXT_SCHEMA,
                    "options": {"type": "array", "items": {"type": "string"}},
                    "predicted_answer": {"type": "string"},
                    "predicted_reasoning": {"type": "string"},
                    "predicted_conclusion": {"type": "string"},
                    "confidence": {"type": "number"},
                    "reasoning_from_model": {"type": "string"},
                },
                "required": ["id", "scenario", "context", "options", "predicted_answer", "predicted_reasoning", "predicted_conclusion", "confidence", "reasoning_from_model"],
            },
        },
        "tier_3": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "id": {"type": "string"},
                    "predicted_blind_spot": {"type": "string", "description": "Concise description of the specific blind spot"},
                    "statement": {"type": "string", "description": "Diagnostic statement that reveals this blind spot"},
                    "context": CONTEXT_SCHEMA,
                    "predicted_response": {"type": "string", "enum": ["strongly_disagree", "disagree", "neutral", "agree", "strongly_agree"]},
                    "confidence": {"type": "number"},
                    "reasoning_from_model": {"type": "string"},
                },
                "required": ["id", "predicted_blind_spot", "statement", "context", "predicted_response", "confidence", "reasoning_from_model"],
            },
        },
    },
    "required": ["tier_1", "tier_2", "tier_3"],
}

SCORE_SCHEMA = {
    "type": "object",
    "properties": {
        "pair_scores": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "id": {"type": "string"},
                    "tier": {"type": "integer"},
                    "score": {"type": "number"},
                    "reasoning": {"type": "string"},
                    "surprise": {"type": "string"},
                },
                "required": ["id", "tier", "score", "reasoning"],
            },
        },
        "tier_1_accuracy": {"type": "number"},
        "tier_2_accuracy": {"type": "number"},
        "tier_3_accuracy": {"type": "number"},
        "overall_accuracy": {"type": "number"},
        "accuracy_gradient": {"type": "number"},
        "key_findings": {"type": "string"},
    },
    "required": ["pair_scores", "tier_1_accuracy", "tier_2_accuracy", "tier_3_accuracy", "overall_accuracy", "accuracy_gradient", "key_findings"],
}
