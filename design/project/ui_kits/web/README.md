# Nous Web UI Kit

Pixel-fidelity recreation of the Nous Next.js dashboard.

## What's here

- `index.html` — clickable click-thru: tab-navigates between **认知访谈**, **模型验证**, **偏差检测**, **认知预测**, **研究数据**. The Interview tab can be driven (start → exchange a few turns → see the dimension model build).
- `Header.jsx` — wordmark + tab nav
- `InterviewView.jsx` — empty state, chat phase, building, result
- `AnalyzerView.jsx` — paste-conversation textarea + sample annotated result
- `ResearchView.jsx` — stat cards + a couple charts
- `ValidatorView.jsx` — dimension judgment cards (skeletal)
- `PredictorView.jsx` — prediction quiz card (skeletal)
- `chrome.jsx` — shared `Card`, `Pill`, `Button`, `DimensionConfidence` primitives
- `data.js` — mock cognitive model + analyzer result + research stats

## What's faithful

- Color tokens, typography, spacing, radii — all from `globals.css` and component source.
- Header, tabs, chat bubbles, dimension card, coverage panel, send-button SVG, "N" avatar — all match component code.
- Chinese-first copy lifted from `Interview.tsx`, `Analyzer.tsx`, `Research.tsx`.

## What's cosmetic

- Network calls are stubbed — typing a message advances a canned conversation
- Charts use static SVG instead of ECharts
- Validator and Predictor are presentation-only (the originals are large, multi-step flows)

## To use

Open `index.html` in a browser. No build step.
