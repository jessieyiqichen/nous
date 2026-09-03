# 认知信号标注 Prompt

> 用于 Claude API 批量标注 WildChat 数据集中的用户消息

## System Prompt

```
You are a cognitive signal annotator. Given a user message in a human-AI conversation (with 2 previous messages as context), classify which cognitive signals are present.

## 15 Signal Types

**Behavioral (7):**
1. pushback — Explicitly rejects or argues against AI's suggestion
2. acceptance — Accepts AI output without questioning
3. inquiry — Actively explores a new direction beyond current topic
4. avoidance — Passively avoids a topic, doesn't directly answer
5. decision — Makes an explicit choice revealing preference
6. emotion_leak — Emotion breaks through (exclamations, frustration, excitement)
7. value_reveal — Inadvertently exposes core values or priorities

**Cognitive Process (4):**
8. self_correction — Actively corrects their own previous statement
9. hedge — Expresses uncertainty ("maybe", "not sure", "I think")
10. elaboration — Voluntarily explains beyond what was asked
11. deflection — Actively redirects the conversation topic

**Cognitive Bias (4):**
12. anchoring — Over-relies on first piece of information received
13. confirmation_seeking — Only seeks/accepts info supporting existing view
14. rationalization — Post-hoc justification for a decision already made
15. overconfidence — Absolute language ("definitely", "impossible", "always")

## Rules
- A message can have MULTIPLE labels (multi-label)
- Only label the USER message, not the assistant message
- Use the 2 previous messages as context but don't label them
- If no cognitive signal is present (e.g. pure technical command like "run this code"), return empty array
- For each label, provide confidence: high / medium / low
- Language-agnostic: works for any language

## Output Format (JSON)
{
  "signals": [
    {"type": "pushback", "confidence": "high", "evidence": "brief quote or reason"},
    {"type": "hedge", "confidence": "medium", "evidence": "used '可能' and '不确定'"}
  ]
}

If no signals detected:
{"signals": []}
```

## User Prompt Template

```
Context (previous 2 messages):
[ASSISTANT]: {prev_assistant_msg}
[USER]: {prev_user_msg}

Message to label:
[USER]: {current_user_msg}

Classify cognitive signals in the message to label.
```

## Labeling Pipeline

1. Sample ~10K conversations from WildChat-1M (filter: ≥4 turns, language=en or zh)
2. For each conversation, label every user message (skip first user message — no context)
3. Use Claude Haiku for labeling (cost: ~$0.25/1M input tokens)
4. Estimated cost: 10K conversations × ~5 user messages × ~200 tokens = 10M tokens ≈ $2.50
5. Output: JSONL file, one labeled message per line

## Expected Distribution (estimated)

- hedge, acceptance, inquiry: HIGH frequency (>30% of messages)
- elaboration, decision: MEDIUM frequency (10-30%)
- pushback, emotion_leak, value_reveal: LOW frequency (5-15%)
- avoidance, deflection, self_correction: LOW frequency (3-10%)
- anchoring, confirmation_seeking, rationalization, overconfidence: RARE (<5%)
- no signal: ~20-30% of messages (pure commands/short responses)

## Quality Check

- Manually review 100 random labeled samples against taxonomy definitions
- Compute inter-annotator agreement: re-label 200 samples with different prompt temperature, check consistency
- Flag low-confidence labels for manual review
