# nous-design

Use this skill to generate well-branded interfaces and assets for Nous, either for production or throwaway prototypes/mocks/etc. Contains essential design guidelines, colors, type, fonts, assets, and UI kit components for prototyping.

---

Read the README.md file within this skill, and explore the other available files.

If creating visual artifacts (slides, mocks, throwaway prototypes, etc), copy assets out and create static HTML files for the user to view. If working on production code, you can copy assets and read the rules here to become an expert in designing with this brand.

If the user invokes this skill without any other guidance, ask them what they want to build or design, ask some questions, and act as an expert designer who outputs HTML artifacts _or_ production code, depending on the need.

## Map of files

- `README.md` — brand context, content fundamentals, visual foundations, iconography
- `colors_and_type.css` — all CSS tokens (colors + typography + spacing + radii)
- `fonts/` — Geist Sans + Geist Mono (loaded via Google Fonts CDN; copy locally if needed)
- `assets/` — logos, marks
- `preview/` — design-system specimen cards (one concept per file)
- `ui_kits/web/` — pixel-fidelity React recreation of the Nous Next.js dashboard

## Quick rules

- Dark canvas (`#171717`) is default. Light mode exists but is rarely shown.
- Warm tan accent `#c4956a` is the only brand color — use sparingly.
- Confidence/severity are ALWAYS color-coded: green=high, tan=medium, gray=low.
- Type stack: Geist Sans for everything, Geist Mono for code/JSON/numbers.
- Chinese-first copy; conversational, lowercase-feeling, no emoji, no marketing fluff.
- Capsule buttons (`border-radius: 9999px`), 12px card radius, 1px hairline borders only.
- Avoid: gradients, shadows, gradient backgrounds, decorative iconography, emoji.
