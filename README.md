# Nous

**Cognitive-layer AI modeling — not mimicking how you talk, but understanding how you think.**

## The Problem

Current AI avatar and digital twin systems model users at the **behavior layer** — expression style, language habits, preferences. They can make a digital twin that *talks like you*, but when it encounters a novel situation, it can't *decide like you* because it doesn't understand your cognitive architecture.

Nous works at the **cognitive layer** — modeling *why* you make decisions, not just *what* decisions you make. This enables prediction in scenarios the system has never seen before.

## How It Works

### 1. Conversational Cognitive Modeling
An AI interviewer conducts a natural conversation (15-25 turns), exploring 9 cognitive dimensions. No questionnaires, no personality tests — just a conversation.

### 2. 9-Dimension Cognitive Model
The system builds a structured model covering:
- Decision Architecture
- Attention Allocation
- Reasoning Style
- Emotional Processing
- Social Cognition
- Blind Spots
- Value Hierarchy
- Response to Uncertainty
- Execution-Layer Flexibility

### 3. Behavioral Prediction & Validation
The model generates predictions about what you'd do in novel scenarios. You answer, the system scores, and the model self-corrects.

**Accuracy trajectory:** 49% (first test) → 71% (after iteration), with T2 (reasoning prediction) reaching 90%.

### 4. Contradiction Detection
Dual-track signal analysis compares what you *say about yourself* (stated) vs what you *actually do* (behavioral). Contradictions = objective blind spot evidence, replacing unreliable self-report.

### 5. Passive Signal Collection
A background collector extracts cognitive signals from daily AI conversations (Claude Code sessions). Local keyword pre-filtering skips low-signal technical sessions without API calls. The flywheel: you work normally, the model improves automatically.

## Key Insight

> "An accurate model may not exist, but a dynamic model that knows where it's wrong can continuously evolve."

Behavior-layer systems optimize for *looking accurate* (user satisfaction, usage metrics). Nous optimizes for *being accurate* (prediction hit rate, contradiction detection). The difference matters when the digital twin needs to make decisions on your behalf.

## Behavior Layer vs Cognitive Layer

| Dimension | Behavior Layer | Cognitive Layer (Nous) |
|-----------|---------------|----------------------|
| Approach | Bottom-up: behavior data → emergence | Top-down: cognitive dimensions → validation |
| Models | What you do | Why you do it |
| Strength | Fast, scalable, covers 80% of cases | Generalizes to novel scenarios |
| Weakness | Fails on unseen situations | Slower, needs iteration |
| Validation | Internal metrics (usage, satisfaction) | External metrics (prediction accuracy) |

These aren't competing approaches — they're complementary layers. Behavior layer makes the twin *talk like you*, cognitive layer makes it *think like you*.

## Architecture

```
Conversation → Signal Extraction (dual-track) → Cognitive Model (9 dims)
                                                        ↓
                                              Behavioral Predictions
                                                        ↓
                                              User Validation (direct judgment)
                                                        ↓
                                              Contradiction Analysis
                                                        ↓
                                              Model Refinement ──→ Loop

Passive Collection (background):
  Daily AI sessions → Local pre-filter → Signal extraction → Contradiction accumulation
```

## Tech Stack

- **Backend:** Python (Anthropic Claude API via tool_choice)
- **Frontend:** Next.js 16 + React 18 + TypeScript + Tailwind CSS
- **Visualization:** ECharts
- **Storage:** localStorage (web), JSON files (CLI)

## Project Structure

```
nous/
├── core/                      # Core Python modules
│   ├── interview.py           # Conversational cognitive modeling
│   ├── predictor.py           # 3-tier behavioral prediction
│   ├── signal_extractor.py    # Dual-track signal analysis
│   ├── detector.py            # Bias detection engine
│   ├── prompts.py             # Shared prompt templates
│   ├── schemas.py             # Pydantic models
│   └── stat_detectors.py      # Statistical analysis
├── data/                      # Model instances & extracted data
│   ├── cognitive_model*.json  # Cognitive model versions
│   └── predictions*.json      # Prediction sets
├── research/                  # Research documents
│   ├── bias-taxonomy.md       # 12 cognitive biases classified
│   └── conversation-insights.md
├── scripts/                   # Utility scripts
│   ├── passive_collector.py   # Background signal collection
│   ├── batch_analyze.py
│   └── jsonl_to_conversation.py
├── web/                       # Next.js dashboard
│   ├── app/components/
│   │   ├── Interview.tsx      # Chat-based cognitive interview
│   │   ├── Validator.tsx      # Direct model judgment
│   │   ├── Predictor.tsx      # Prediction quiz + scoring
│   │   ├── Analyzer.tsx       # Bias detection
│   │   └── Research.tsx       # Analytics
│   └── app/api/
│       ├── interview/         # Chat, analyze, build
│       ├── validate/          # Direct judgment + model update
│       ├── predict/           # Model building + questions
│       ├── score/             # Accuracy evaluation
│       └── refine/            # Model correction
└── examples/                  # Sample data
```

## Usage

### CLI

```bash
# Cognitive interview
python core/interview.py

# Build model from text
python core/predictor.py build profile.md

# Generate predictions
python core/predictor.py predict data/cognitive_model.json

# Extract signals from conversation
python core/signal_extractor.py extract conversation.md --model data/cognitive_model.json

# Passive collection from daily sessions
python scripts/passive_collector.py collect
python scripts/passive_collector.py collect --file path/to/session.jsonl
python scripts/passive_collector.py status
```

### Web

```bash
cd web
npm install
npm run dev
# Open http://localhost:3999
```

## Current Status

MVP validation phase. Core hypothesis confirmed: cognitive models can improve prediction accuracy through iterative refinement loops.

- Model understanding accuracy: 85% → 99% (after one round of direct judgment)
- Behavioral prediction: T1 71%, T2 71% (deterministic scoring, +46pp above random baseline)
- Passive signal collection operational (101 signals, 20 contradictions accumulated)

## License

MIT
