# Nous Web — Refactor 4 tabs to literary-serif design language

## Context

Working in the `web/` Next.js app of the Nous repo. The product currently uses a warm-dark Claude-inspired palette with Geist Sans. We're shifting the entire visual language to a **literary, warm, paper-like aesthetic** — think well-set bilingual essay journal, not SaaS dashboard.

**Read first:** `web/app/globals.css`, `web/app/layout.tsx`, `web/app/page.tsx`, and all four target component files before making changes.

## Step 1 — Update tokens (`web/app/globals.css`)

Replace `:root` palette and add a serif type stack:

```css
:root {
  /* ── Literary, warm cream paper ── */
  --background:   #f6f1e7;
  --foreground:   #2b2620;
  --card:         #fbf7ee;
  --card-border:  #e4dccb;
  --accent:       #8a4a2a;          /* burnt sienna ink */
  --accent-soft:  rgba(138, 74, 42, 0.08);
  --muted:        #6b5f50;
  --muted-soft:   #948774;
  --success:      #4f7a4d;
  --warning:      #b07a2e;
  --error:        #a8453a;

  /* ── Type ── */
  --font-display: "Fraunces", "Songti SC", "STSong", serif;
  --font-sans:    "Source Serif 4", "Source Serif Pro", "Songti SC",
                  "PingFang SC", "Microsoft YaHei", serif;
  --font-mono:    "Geist Mono", ui-monospace, SFMono-Regular, Menlo, monospace;
}
```

In `layout.tsx` swap `Geist`/`Geist_Mono` Google-Font imports for `Fraunces` (opsz 9-144, weights 400/500/600) and `Source_Serif_4` (opsz 8-60, weights 400/500), keep `Geist_Mono` for code/numbers only.

Global rule: `h1, h2, h3 { font-family: var(--font-display); font-weight: 400; }` — never bold serif headings, get weight from optical size.

## Step 2 — Editorial language conventions (apply across all tabs)

- **Eyebrow**: `font-size: 11px; letter-spacing: 0.2em; text-transform: uppercase; color: var(--muted)` — sits above every section heading, e.g. "维度 1 / 9", "总体评估", "本版改动"
- **Pull-quote**: 19px Fraunces, `border-left: 2px solid var(--accent); padding-left: 28px` — for assessments and big statements
- **Italic accent**: when a heading has an emphasized phrase, wrap it in `<em>` with `font-style: italic; color: var(--accent)` — never use bold for emphasis
- **Tags / chips**: hairline border `1px solid {color}40`, fill `{color}10`, `border-radius: 9999px`, 11–12px — never solid/saturated fills
- **Hairline dividers** (1px `var(--card-border)`) replace cards wherever possible. Avoid drop shadows entirely.
- **Buttons**: keep capsule shape (`border-radius: 9999px`), text-only "secondary" variant uses underline with `text-underline-offset: 4px`.

## Step 3 — `Interview.tsx`

**Empty state**: Center a single line in Fraunces italic 24px: `"随便聊聊。聊到第几句，我就开始懂你怎么想了。"` Below it one button: "开始对话". No N-mark glyph, no helper text.

**Chat phase**: AI bubbles are not bubbles — render as plain serif text in column with a tiny `0.05em` letter-spaced "AI" gutter label on the left (mono, 10px, uppercase). User turns: same column, right-aligned, sans-serif (Source Serif), no background fill — just the text with a `0.05em`-spaced "你" gutter on the right.

Right side panel (维度覆盖) becomes a thin track: 9 horizontal hairlines, fill from left as confidence grows; label below each in 11px italic Fraunces.

## Step 4 — `Validator.tsx` — REWRITE as version history

This is the biggest change. The current "校对每个维度" flow is **gone**. Replace with a **traceable model timeline**:

**Behavior:**
- After every interview turn, the system auto-snapshots the model: `v1, v2, v3 …` (mock 7 versions for now)
- Validator tab shows a 2-column layout: **left rail = timeline, right pane = detail**

**Left rail (260px, vertical line + dots):**
```
●  v7   HEAD          14:32 · 第14轮
   + 新增「自我合理化」迹象
●  v6                 14:28 · 第12轮
   Reasoning 置信度 medium → high
○  v5                 14:24 · 第10轮
   「直觉先到」从假设升为确认
... (down to v1 = 初始空白模型)
```
- Click any dot = select that version (HEAD-relative)
- **Right-click any dot = mark as compare version** (different ring color); footer of right pane changes to "对比 v7 与 v5" + "取消对比" button

**Right pane:**
1. Big version number `v7` in Fraunces 28px + `置信度 91%` mono 12px next to it
2. "触发：第 14 轮 — '{user line that caused the snapshot}'" in Fraunces italic 15px muted
3. **本版改动** eyebrow + each changed dimension as a Fraunces 17px name with accent left-border, English ID below in mono 12px
4. **这一版的完整模型** eyebrow + 2-col grid of all 9 dimensions; dimensions changed in this version get `border: 1px solid var(--accent); background: var(--accent-soft)`; others get hairline border only. Each cell: Chinese name, confidence label (mono 10px uppercase), 60-char description preview.
5. Footer: "恢复到这一版" primary button + "取消对比" secondary

Mock data shape for VERSIONS array: `{ v, ts, turn, after (string), changed (array of dim names), delta (string), confidence (0-1) }`.

**Important:** the per-dimension yes/no/partial 校对 flow is REMOVED. If users want to flag something wrong, that's a separate feature for later.

## Step 5 — `Analyzer.tsx`

**Input state**: editorial. Big Fraunces 28px header "偏差检测", italic muted subhead. Textarea has no border/box — just an accent-colored 1px left rule (the "manuscript margin"). Below: "检测偏差" button + small italic "示例对话已预填".

**Result state**:
- Header: eyebrow "偏差检测 · 报告" + Fraunces 36px `"6 轮对话中检测到 <em accent>{N} 处</em> 偏差"`
- Bias type summary: row of pill-tags (hairline border, `{tone}40` border, `{tone}10` fill, `{tone}` text). Color tones, NOT neon: sycophancy `#a86c3a`, preemptive `#7a8c5c`, beautify `#9a5a6e`, overcorrect `#b85c4a`, over_attr `#5e7a8a`, drift `#7a6a4f`.
- 总体评估: pull-quote style (19px Fraunces, accent left-border, 28px padding-left)
- **Annotated transcript**: 2-col layout. Left = transcript with line-number gutter (mono 11px `01, 02 …` + role `你/AI` below in mono 10px uppercase). Each turn 20px vertical padding, hairline divider between turns. AI turns render in Fraunces serif (the AI "speaks in print"); user turns in Source Serif sans-feel. Tagged turns: bias chips below the text. Click selects → highlights row in `var(--accent-soft)` and pops detail in right column.
- Right col = sticky aside. When nothing selected: italic muted "点击任意标注段落 / 查看偏差详情". When selected: top-border 2px in bias tone, Fraunces 19px bias name, severity in tone-colored uppercase mono 11px on the right (轻微/中度/显著). Evidence as italic Fraunces blockquote with tone-colored 1px left border. Explanation in 13px serif below.

## Step 6 — `Research.tsx`

Keep the data, change the chrome:
- Headings → Fraunces 32px `font-weight: 400`
- Stat cards: hairline border only, no fill, 24px Fraunces number
- Bar chart bars: change neon palette to muted earth tones (use the same six bias-tone hex codes from Analyzer)
- Donut: same earth tones; legend uses italic Fraunces 12px for category, mono for numbers
- 核心发现 list: pull-quote treatment, each finding gets a Fraunces 17px italic accent phrase + serif explanation

## Step 7 — `Predictor.tsx` (lighter touch)

Multiple-choice options become hairline-bordered options with capsule corners (`border-radius: 12px` is fine here for the only exception). When selected: `var(--accent-soft)` fill + `var(--accent)` border, label in italic Fraunces 16px. Letter prefix (A/B/C/D) in mono 12px in a circular hairline-bordered chip.

## Constraints

- No emoji anywhere
- No drop shadows, no gradients (background or otherwise)
- No bold serif — weight via optical size
- Chinese-first; never apologize for being a tool, never say "我可以帮你...". Conversational, lowercase-feeling.
- Spacing: stay on a 4px grid; use generous vertical breathing room (32–48px between sections, not 16px)
- Mobile: collapse 2-col layouts to single column, keep all type sizes; do not shrink Fraunces below 16px

## Done =

Run `pnpm dev` and visually verify all 5 tabs. Validator should feel like a git log, not a quiz. Analyzer should feel like an annotated literary review, not a linter output. The whole app should read like something Penguin Classics would publish, not a Vercel dashboard.
