# Nous Design System

> 认知层 AI 建模 · Cognitive-layer AI modeling

This is the design system for **Nous** — a cognitive modeling tool that builds a 9-dimension model of how an individual thinks, validates it via behavioral prediction, and detects contradictions between what users *say* about themselves and what they *actually do*.

The product is built as a Next.js dashboard with five tabs: **认知访谈** (Interview), **模型验证** (Validator), **偏差检测** (Analyzer), **认知预测** (Predictor), **研究数据** (Research).

---

## Sources

- **Codebase:** [`github.com/jessiechenyiqihahaha/nous`](https://github.com/jessiechenyiqihahaha/nous) — branch `main`
  - `web/` — Next.js 16 + React 19 + Tailwind v4 dashboard
  - `web/app/globals.css` — root color tokens (warm dark palette inspired by Claude.ai dark mode)
  - `web/app/page.tsx` — top-level shell: header + tab nav
  - `web/app/components/` — Interview, Validator, Predictor, Analyzer, Research, InlineValidator
  - `web/app/api/interview/chat/route.ts` — interviewer system prompt (sets the brand voice)
- **Project README:** documents the cognitive-layer thesis, 9 dimensions, dual-track signal analysis
- **CLAUDE.md:** product positioning — *"行为层的质检员，不是替代品"* (a QA inspector for the behavior layer, not a replacement)

The product is bilingual but ships zh-CN first. UI surface is Chinese; technical/dimension names are kept in English internally.

---

## Index

| File | What |
| --- | --- |
| `README.md` | This file — context, content + visual foundations, iconography |
| `SKILL.md` | Cross-compatible skill manifest for Agent Skills / Claude Code |
| `colors_and_type.css` | All color + type tokens as CSS vars (use `@import` or copy-paste) |
| `fonts/` | Geist Sans + Geist Mono (woff2) |
| `assets/` | Logos, favicon, sample SVG marks |
| `preview/` | Design-system preview cards (registered for the Design System tab) |
| `ui_kits/web/` | Pixel-fidelity recreation of the Nous web dashboard |

---

## Content Fundamentals

**Language.** Chinese-first (`lang="zh-CN"`). All user-facing surfaces are simplified Chinese; English is reserved for (1) the brand name "Nous", (2) the nine cognitive dimension names which are kept in English internally to align with the schema (`Decision Architecture`, `Attention Allocation`, etc.), and (3) raw confidence labels (`high` / `medium` / `low`).

**Voice.** Cognitive scientist talking to a thoughtful adult. Measured, slightly clinical, never condescending. The interviewer prompt sums it up: *"像朋友聊天，不像心理测试"* (chat like a friend, not a test). The product itself follows the same rule — it does not gamify, it does not use achievement language, it does not perform empathy.

**Person.** Mostly second-person (你 / 你的). Avoid 我们 unless genuinely collective — the interviewer prompt explicitly bans *"我们都…"* because *"只有用户那端是真实的"* (only the user side is real).

**Casing.** Tags and metadata are lowercase English (`high`, `behavioral`, `stated`, `sycophancy`). Headings are tight and informational — **修正后的认知模型**, **述行矛盾**, **认知信号**, never marketing-y.

**Emoji.** None. The product uses zero emoji across UI, prompts, or research material. Status is conveyed by color + a short text label (`high` / `medium` / `low`), never by ✅ ⚠️ 🔥. This is a deliberate brand stance — emoji would undercut the clinical-but-warm tone.

**Punctuation.** Chinese full-width punctuation (`，。：；「」`) inside Chinese sentences. Em-dash (`—`) is used liberally for parenthetical asides, e.g. *"准确，不是美化也不是低估"*. Bullet points use `•` or `-` not stars. Numbered lists use `1.` `2.` `3.`.

**Tone signatures.**
- *"准确，不是美化也不是低估"* — accurate, neither flattering nor diminishing
- *"对方说的每一句话都是数据"* — every sentence is data
- *"行为层的质检员，不是替代品"* — a QA inspector for the behavior layer, not a replacement
- *"用户越认同你，你越应该怀疑自己是不是在迎合"* — the more the user agrees, the more you should suspect you're sycophanting

**Microcopy patterns.**
- Empty states: gentle, single-purpose. *"第 5 轮后开始追踪"* (tracking begins after turn 5).
- Action verbs: *开始 · 重来 · 下载 · 验证 · 修正 · 出题 · 收起*. Two-character verbs preferred.
- Status lines compose with `·` separator: *"3 轮对话 · 12 个信号 · 2 个矛盾"*.
- Loading copy is specific: *"分析 12 条对话记录"* not "Loading...".
- Errors are direct, never apologetic: *"对话太短，至少需要 3 轮对话才能建模"*.

---

## Visual Foundations

**Mood.** Warm dark, late-night-laboratory. Not cyberpunk; not Material. Closest reference is Claude.ai's dark mode — the same neutral-warm grays softened by a single tan accent.

**Color.** One accent (`#c4956a` — warm desaturated tan) carries the entire identity. Backgrounds are a tight 4-step warm-gray ramp (`#171717` → `#1e1e1e` → `#2a2a2a`). Foreground is off-white-cream (`#e8e4df`), never pure white. Semantic colors (success / warning / error) are muted variants in the same warmth family — they never break the palette. The Research tab uses a wider chart palette (red / orange / pink / purple / cyan / green / indigo / gray) — those are *data* colors, not brand colors, and they are the only place saturated hues appear.

**Typography.** Geist Sans for everything; Geist Mono for code, JSON, and the occasional metric. Weight range is narrow: 400 (body) and 500 (emphasis), with 600 reserved for the single h2/h3 per view. Sizes cluster small: 11px / 12px / 13px / 14px / 16px / 18px. Headings are *tight* (`tracking-tight`, `font-semibold`) but never huge — the largest heading in the product is `text-xl` (~20px). Body line-height is generous (`leading-relaxed`) to make Chinese characters breathe.

**Spacing.** 4px grid, but the product lives mostly in `space-y-{2,3,4,5,8}` and `gap-{2,3,4,5,6}`. Container max-width is `max-w-4xl` (896px) — the entire product is a single readable column. Side padding is `px-6` desktop. Card padding is `p-4` to `p-5`.

**Backgrounds.** Flat warm-dark. **No gradients anywhere in the product.** No imagery, no photography, no full-bleed hero, no patterns, no textures, no grain. The visual interest comes from the warmth of the grays, not from added decoration. (The Research tab uses ECharts panels on `var(--card)` background — same flat treatment.)

**Cards.** `bg-[var(--card)]` (`#1e1e1e`) with a 1px `border-[var(--card-border)]` (`#2a2a2a`) and `rounded-xl` (12px) corners. **No shadow.** Elevation is communicated by the border + slightly-lighter fill, not by shadow. Cards stack with `gap-4` between them.

**Pills & buttons.** Two shapes:
- **Capsule** (`rounded-full`) — primary actions, tab nav, status chips. Primary: `bg-[var(--accent)] text-white`. Secondary: `border border-[var(--card-border)] text-[var(--muted)]`.
- **Soft tag** (`rounded-md` or `rounded`) — inline metadata. `bg-[var(--accent-soft)] text-[var(--accent)]` for the active tab; `bg-[color]/15 text-[color]` for status (`success` / `accent` / `muted`).

**Borders.** Always 1px. `border-[var(--card-border)]` is the default. `border-[var(--accent)]/40` highlights focus or selection. `border-l-2 border-[var(--card-border)]` is used as a quote/blockquote treatment for behavioral predictions.

**Radii.**
- `rounded-md` (6px) — small chips, soft tags
- `rounded-lg` (8px) — input fields, code blocks, inner panels
- `rounded-xl` (12px) — cards, primary surfaces
- `rounded-2xl` (16px) — chat bubbles, message containers, the "N" mark wrapper
- `rounded-full` — capsule buttons, tab pills, dimension confidence badges, the small "N" avatar

**Shadows.** None. Period. The product has no `box-shadow` anywhere in `globals.css` and almost none in component code. Depth comes from the warm-gray ramp.

**Transparency & blur.** Used sparingly. `bg-[var(--accent-soft)]` is `rgba(196,149,106,0.12)` — that's the main translucent tone, used for the active-tab background, the "N" avatar, and "next step" callouts. Status chips use `/15` opacity (`bg-[var(--success)]/15`). No backdrop-blur anywhere.

**Animation.** Minimal. The project's transition vocabulary is:
- `transition-colors duration-200` — hover state on tabs and links
- `transition-opacity` — primary buttons on hover (`hover:opacity-90`)
- `transition-all duration-500` — the dimension coverage progress bar fill
- `animate-spin` — single loading spinner (small, accent-colored)
- `animate-bounce` — three-dot typing indicator with staggered `animationDelay` (0ms / 150ms / 300ms)

**No bounces, no springs, no scale-on-hover, no entrance animations.** The product feels still and considered.

**Hover states.** Two patterns:
- Text/links: color shifts from `var(--muted)` to `var(--foreground)` (`hover:text-[var(--foreground)]`)
- Buttons: opacity drops to 90% (`hover:opacity-90`)

**Press / active.** No explicit active-state styling — buttons rely on opacity feedback only. Tab nav uses `bg-[var(--accent-soft)] text-[var(--accent)]` for the active tab.

**Disabled.** `disabled:opacity-30` to `disabled:opacity-50`. Cursor stays default (no `cursor-not-allowed` in the codebase).

**Layout rules.**
- Single column, max-width 896px (`max-w-4xl`), centered
- Header is a thin `border-b` bar with brand on left, tab nav on right
- The Interview view splits horizontally into chat (`flex-1`) + side panel (`w-52`) when the panel is shown
- No fixed/sticky elements other than the auto-scroll target inside the chat

**Iconography color.** Brand mark "N" is `var(--accent)` on `var(--accent-soft)`. Lucide line icons (when used) inherit `currentColor` and follow text color.

**Imagery.** None. The product ships with no photography, no illustration, no avatars beyond the single "N" letter mark. If a future surface needs imagery, follow these constraints: warm tones, low saturation, slight grain acceptable, never pure white or pure black backgrounds, no people-as-product photography.

**Color vibe overall.** Warm, dim, focused. Like reading by an incandescent lamp.

---

## Iconography

**The codebase ships almost no iconography.** The Nous dashboard uses a single inline SVG (the arrow inside the chat send button) and one letter mark ("N"). That's it.

**Approach.** Iconography is treated as a *cost*, not a feature. Status is communicated by colored text labels (`high`, `behavioral`, `stated`) and by colored pill backgrounds — not by glyphs. When an action button needs reinforcement, a single thin SVG arrow is acceptable. Otherwise, the action's text is the icon.

**No icon font.** No Lucide, Heroicons, Feather, or Phosphor in `package.json`. No SVG sprite system.

**No emoji.** Zero usage in code, prompts, or copy. Adding emoji would break the tone.

**No unicode glyphs as icons.** No `→` `✓` `★` `♦` substitutes. The product uses `·` as a separator and `—` as an em-dash; those are punctuation, not icons.

**SVGs in the codebase:**
- The Next.js boilerplate left behind `web/public/{file,globe,next,vercel,window}.svg` — these are unused by the product and should not be treated as part of the design system
- One inline `<svg>` in `Interview.tsx` for the chat send button: a thin right-arrow (`stroke="currentColor"`, `strokeWidth={2}`, `M5 12h14M12 5l7 7-7 7`)

**Recommended icon system for new surfaces.** If a new surface genuinely needs icons (e.g. a settings panel, a file browser), use **Lucide** at `1.5px` stroke, sized 14–16px, color `currentColor` so it inherits text color. Never fill icons. Never use multicolor icons. *Flag any use to the team — this is a substitution, not a project default.*

**Logo / wordmark.** The brand is the bare word **"Nous"** in `Geist Sans` `font-semibold` `text-lg` `tracking-tight`. The compact mark is the single letter **"N"** in `var(--accent)` inside a `rounded-2xl` (16px) or `rounded-full` square of `var(--accent-soft)`. Both live in `assets/`.

---

## Open Questions / Caveats

- **Geist fonts:** The original product loads Geist via `next/font/google`. We've bundled local woff2 files for Geist Sans + Geist Mono in `fonts/`. Verify these match the variable-font version used by Vercel's CDN; flag if you need the official subset files.
- **Light mode:** The product ships dark-only. There is no light-mode palette in `globals.css`. We've extrapolated a light variant in `colors_and_type.css` for completeness — flag for review before using.
- **Icon system:** The product has effectively no icon system. We recommend Lucide as a substitution but have not pulled it into the design system files. If you need icons, ask.
