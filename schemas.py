"""Structured output schemas for bias detection results."""

from __future__ import annotations

from pydantic import BaseModel, Field


class BiasInstance(BaseModel):
    """A single detected bias instance in a conversation."""

    bias_id: str = Field(description="Bias identifier: overcorrect, sycophancy, drift, single_attr, over_attr, beautify, preemptive, sim_conscious, sys_bias")
    sub_type: str = Field(
        default="",
        description="Optional sub-type for finer classification. For sycophancy: 'surface_hedging', 'evaluative', 'meta_sycophancy'. For others: leave empty.",
    )
    turn_index: int = Field(description="0-based index of the AI turn where the bias occurs")
    severity: str = Field(description="low / medium / high / critical")
    evidence: str = Field(description="Direct quote from the AI response demonstrating the bias")
    context: str = Field(description="What in the user's message or conversation history triggered this bias")
    explanation: str = Field(description="Why this qualifies as the identified bias, referencing the detection criteria")


class TurnAnalysis(BaseModel):
    """Analysis of a single conversation turn pair (user + AI)."""

    turn_index: int
    user_message_summary: str = Field(description="Brief summary of what the user said")
    ai_message_summary: str = Field(description="Brief summary of what the AI said")
    biases_detected: list[BiasInstance] = Field(default_factory=list)


class ConversationAnalysis(BaseModel):
    """Complete bias analysis of a conversation."""

    total_turns: int
    biases_found: list[BiasInstance]
    bias_summary: dict[str, int] = Field(description="Count of each bias type found")
    severity_distribution: dict[str, int] = Field(description="Count by severity level")
    overall_assessment: str = Field(description="2-3 sentence summary of the conversation's bias profile")
    interaction_patterns: list[str] = Field(
        default_factory=list,
        description="Notable bias interaction patterns observed (e.g., sycophancy-drift-beautification chain)",
    )
