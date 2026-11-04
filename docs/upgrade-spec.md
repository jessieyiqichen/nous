# Nous upgrade spec: English product, Clerk auth, Supabase backend

Owner: Jess · Executor: Claude Code (Slack session, no `ANTHROPIC_API_KEY`) · Repo: `jessieyiqichen/nous` (single commit `7f77ac0` "public snapshot")
Status: draft for Phase 1. Work one phase per PR. After each phase, update `.claude/handoff.md` and report in the Slack thread. **Do not start the next phase until Jess approves.**

Jess's ask, verbatim: "我需要对这个nous进行一个大升级" / "需要加入前后端，全部改成英文版，用clerk加上supabase". In English: a big upgrade, a real frontend and backend, everything converted to English, Clerk for auth, Supabase for the database and backend.

---

## 1. Current state (grounded in the repo)

### 1.1 Layout
| Path | What it is | Notes |
|---|---|---|
| `CLAUDE.md` | Project rules (Chinese) | Requires `.claude/handoff.md`. **That file is missing, and `.gitignore` ignores `.claude/`**, so it can't be committed as things stand. |
| `README.md` | Product README, mostly Chinese | Describes the Feishu bot, Mac helper, and `/agent` web demo, all served by one "server brain". |
| `web/` | Next.js **16.2.2**, React 19.2, Tailwind 4, vitest | `web/AGENTS.md`: "This is NOT the Next.js you know". Read `node_modules/next/dist/docs/` before writing code. Dev port 3999. |
| `web/app/page.tsx` | Single-page app with 7 client-side tabs: 概览 / 认知访谈 / 模型验证 / 认知预测 / 认知分身 / Playground / 研究数据 | No routing per tab, no auth. |
| `web/app/agent/*` | Phone-frame demo of the twin (`/agent`) | Chinese demo threads in `threads.ts`. |
| `web/app/pilot/page.tsx`, `api/pilot/*`, `api/sync`, `lib/sync.ts`, `lib/server/pilotCodes.ts` | Pilot study. **Identity = invite code** (`PILOT_CODES` env, stored in localStorage `nous_pilot_code`) | This is the "auth" today. |
| `web/app/api/**` (22 route handlers) | All backend logic. TS ports of the core pipeline: interview chat/analyze/build, predict, score, refine, validate, analyze, extract-signals, conflicts, playground, twin, twin/handle, twin/feedback, twin/model, feishu/webhook, model, contradictions | `maxDuration = 60` (Vercel limit, CLAUDE.md rule 5). |
| `web/lib/deepseek.ts` | **LLM client for the web: DeepSeek (OpenAI-compatible)**, `DEEPSEEK_API_KEY/BASE_URL/MODEL` | The web does not use Anthropic, even though `web/.env.example` still says `ANTHROPIC_API_KEY`, which is stale. |
| `web/lib/twin.ts` | Shared "brain": triage/draft/gap_note. Used by web, Feishu, and Mac | Relation labels are Chinese literals (`未知`, `上级`, `普通朋友`…) inside the prompt and the code. |
| `web/lib/twin-agent.ts` | Bot state machine (intro → interview → proxy) | Chinese keyword triggers: `START_WORDS`, `CORRECTION_RE` (`不对/改成/我会说…`), Chinese reply strings. |
| `web/lib/twin-store.ts` | Per-user storage. Append-only `snapshots(code, kind, payload)`. Backend is **SQLite if `TWIN_DB_PATH`**, otherwise Supabase via service-role key | The kinds are `cognitive_model`, `twin_interview`, `style_card`, `twin_last`, `twin_feedback`. Today `code` is an arbitrary userId (a Feishu open_id, the Mac `twinUserId`, or a pilot code). |
| `web/lib/server/supabase.ts` | Service-role Supabase client only | No anon/user-scoped client. |
| `web/lib/interview-prompts.ts`, `lib/generated/shared-prompts.ts` | Interviewer prompt (ZH) and generated build-model prompt/schemas | `scripts/build-shared-prompts.mjs` generates the latter from `core/prompts/build_model.md` and `core/schemas/*.json`, which are already English. |
| Client localStorage | `nous_interview_signals`, `nous_interview_conflicts`, `nous_results_log`, `nous_pilot_code`, plus interview/predictor storage modules | **CLAUDE.md rule 1: never casually clear localStorage.** |
| `supabase/schema.sql` | One table, `snapshots`. RLS is on with **no policies**, so only the service role can read or write. Keyed by `code` (text) | No migrations folder, no user model. |
| `core/` (Python, Anthropic SDK via `core/api_utils.py`) | CLIs: `interview.py` (380 lines, `--lang zh|en`, default zh), `predictor.py`, `signal_extractor.py` (**600 lines**), `stat_detectors.py` (**445 lines**, needs sentence-transformers), `hybrid_extractor.py`, `interview_pipeline.py`, `detector.py`, prompt modules, plus tests in `core/tests` | Not called by the web. The "slow loop" (rebuild the model after 20 or more edits) is run by hand from here. |
| `bots/feishu-twin/index.js` | Feishu long-connection client that POSTs to `/api/twin/handle` | Chinese logs and errors. Also `docs/feishu-bot-setup.md` (ZH). |
| `mac/NousHelper/` (Swift) | Menu-bar helper that calls `/api/twin` and `/api/twin/feedback` with `twinUserId` | Chinese UI strings in 11 files. |
| `ml/` | DistilBERT signal classifier (course project) | Out of scope except for translating comments if desired. |
| `research/` | Methodology docs (4 files, Chinese/bilingual) | |
| `design/` | Claude Design handoff bundle: `design/project/` (tokens `colors_and_type.css`, `ui_kits/web/*.jsx`, previews) and `design/refactor-prompt.md` | The refactor prompt specifies a "literary serif" look and is **"Chinese-first"**. Its copy is Chinese. `design/README.md` mentions a `chats/` folder that isn't in the repo. `layout.tsx` already uses Fraunces / Source Serif 4 / Geist Mono, so the visual refactor is at least partly applied. |
| `scripts/` | Collectors, batch analysis, OSS export/precheck, backup | |
| `web/scripts/deploy-aliyun.sh` | Builds locally, rsyncs to an Aliyun box, restarts with pm2 behind nginx | `web/vercel.json` pins region `hnd1`, so Vercel is also in play. |
| `.github/workflows/ci.yml` | Python: `pytest`. Web: `npm ci`, `tsc --noEmit`, `lint`, `test`, `build` | This must stay green on every PR. |

### 1.2 What is Chinese-only
Files containing CJK text: `web/app` 52, `web/lib` 10, `core` 12, `mac` 11, `design` 22, `scripts` 5, `research` 4, `data` 3, `ml` 2, `bots` 1, `docs` 1.
- **UI**: all tab labels and components (`web/app/components/**`, `agent/**`, `pilot/page.tsx`), plus `layout.tsx` metadata and `lang="zh-CN"`.
- **LLM prompts**: `web/lib/interview-prompts.ts` (`INTERVIEWER_SYSTEM_PROMPT_ZH`), Chinese label vocabularies in `web/lib/twin.ts`, reply copy and regexes in `twin-agent.ts`, and inline prompts in several `app/api/*` routes. The `core/interview_prompts.py` ZH variants and `DIM_NAMES_ZH` already have EN counterparts.
- **Server errors**: almost every route returns Chinese `error` strings, and CLAUDE.md says "给用户中文错误提示" (show users Chinese error messages).
- **Demo data**: `web/data/*.json`, `data/samples/*.json` (fictional persona), `web/app/agent/threads.ts`.
- **Docs**: `CLAUDE.md`, `README.md`, `web/README.md`, `docs/feishu-bot-setup.md`, `mac/NousHelper/README.md`, `research/*`, `design/refactor-prompt.md`, code comments.

---

## 2. Goals
1. **English product.** Every user-facing surface (UI, LLM prompts and outputs, errors, demo data, docs) is in English by default.
2. **Real auth with Clerk.** Users sign up and sign in. Clerk user ids replace pilot invite codes and free-form `userId`s as identity.
3. **Supabase as the database and backend.** A per-user schema with RLS keyed to the Clerk user id, managed through migrations. User data lives server-side instead of only in localStorage.
4. **A clear frontend and backend split.** The Next.js UI talks to an authenticated, typed backend API. The core model pipeline (interview → build → predict/score → twin → feedback → rebuild) is reachable through that API instead of only through Python CLIs.
5. **Deployable.** A documented deploy path with environment variables, migrations, and CI.

Non-goals: new product features, a visual redesign beyond translation, ML retraining, and new research.

---

## 3. Working rules for every phase
- One phase = one branch = one PR. Conventional commits `<type>: <description>` (feat/fix/refactor/docs).
- Every PR must pass the CI suite locally: `cd web && npx tsc --noEmit && npm run lint && npm test && npm run build`, and `python -m pytest -q` from the repo root.
- Read `.claude/handoff.md` before starting. **Update it right after finishing, before anything else or any reporting** (CLAUDE.md, mandatory rules 1–4). Keep it under 100 lines, compacting if needed (rule 6).
- **No `ANTHROPIC_API_KEY` (or DeepSeek key) in this session.** Do not run live LLM calls. Verify through types, unit tests with mocked LLM clients, and `npm run build`. Put every "needs a live API check" item in handoff.md under *Needs live verification (CLI / Jess)*.
- Don't put real Clerk or Supabase secrets in the repo. Use `.env.example` placeholders only.
- Files under 400 lines and functions under 50 lines (CLAUDE.md Code Style). Over-limit files today: `signal_extractor.py` 600, `stat_detectors.py` 445, `Analyzer.tsx` 586, `Validator.tsx` 581, `InlineValidator.tsx` 564, `Research.tsx` 543. **Don't make them bigger.** If a phase substantially edits one, split it in that PR. Otherwise leave it.
- Immutability: create new objects, don't mutate existing ones.
- Never clear users' localStorage. Migrations must read it, never wipe it.
- Next.js 16 has breaking changes. Check `web/node_modules/next/dist/docs/` and current Clerk and Supabase docs before using any API. Don't rely on memory. For example, in Next 16 the request middleware file convention may be `proxy.ts` rather than `middleware.ts`, so verify.
- Stop and ask in the Slack thread if a phase depends on an open question (§5) that Jess hasn't answered.

---

## 4. Phases

### Phase 1: Handoff file and baseline (no product changes)
Tasks:
- Create `.claude/handoff.md` (under 100 lines) with sections: *Roles*, *Current phase*, *To-do* (all phases from this spec as a checklist), *CLI completion reports*, *Completed summary* (one line per day), *Needs live verification*, *Open questions for Jess*.
- Make it committable. Change `.gitignore` from `.claude/` to `.claude/*` plus `!.claude/handoff.md` (and `!.claude/settings.json` if wanted). Keep `web/.claude/` ignored.
- Commit this spec as `docs/upgrade-spec.md` so later sessions can read it.
- Fix the stale `web/.env.example`. It lists `ANTHROPIC_API_KEY`, but the web uses `DEEPSEEK_API_KEY`/`DEEPSEEK_BASE_URL`/`DEEPSEEK_MODEL`. Also list `TWIN_DB_PATH`, `TWIN_FEEDBACK_KEY`, and `FEISHU_*`, which the code reads.
- Run the full CI suite and record the baseline (pass/fail and any pre-existing failures) in handoff.md.

Acceptance:
- `.claude/handoff.md` and `docs/upgrade-spec.md` show up in `git status` and are committed. handoff.md is under 100 lines.
- `web/.env.example` matches every `process.env.*` read in `web/` and `bots/`.
- CI is green, or the pre-existing failures are documented and untouched. No runtime code changes.

### Phase 2: English conversion, web UI
Tasks: translate every user-facing string in `web/app/**` (tabs, components, `agent/` demo threads, `pilot/page.tsx`, empty states, buttons, charts/legends, dimension display names). Set `layout.tsx` to `lang="en"` with English `metadata`. Drop the CJK fallbacks from the font stacks in `globals.css` only if Jess agrees (§5). Translate the bundled demo data (`web/data/*.json`, `data/samples/*.json`), and regenerate snapshots through the prebuild scripts where applicable. Keep the editorial tone from `design/refactor-prompt.md`, translated: lowercase-feeling, never "I can help you…", no emoji.
Acceptance:
- `grep -rlP '[\x{4e00}-\x{9fff}]' web/app web/data` returns nothing, apart from an explicit allowlist recorded in handoff.md (for example, sample Chinese user input kept deliberately).
- CI is green, and the existing tests are updated for the new strings.
- A screenshot or text walkthrough of each tab is listed for Jess to check.

### Phase 3: English conversion, prompts, server messages, bot logic
Tasks:
- Make English the default for `web/lib/interview-prompts.ts` (port `INTERVIEWER_SYSTEM_PROMPT_EN` from `core/interview_prompts.py`). Translate the inline prompts in `app/api/*` routes and the relation-label vocabulary in `web/lib/twin.ts` (`UNKNOWN_RELATION`, the relation list), and instruct the model to reply in English.
- `web/lib/twin-agent.ts`: English reply copy. Add English `START_WORDS` and correction triggers ("start interview", "no, I'd say:", "change to:", "I sent:"…). Keep the Chinese triggers too if Jess wants a bilingual bot (§5).
- All API `error` strings become English. Update CLAUDE.md's error-message rule to "user-facing errors in English" (needs Jess's OK because it changes a project rule).
- `core/`: make `--lang en` the default in `interview.py`, and translate CLI output strings and `api_utils.py` messages. Optionally put `DIM_NAMES_ZH` behind the flag.
Acceptance:
- No CJK left in `web/lib/**` or `web/app/api/**` (same allowlist rule). Unit tests cover the English correction regex and start words, plus relation-label normalization, all with a mocked LLM.
- `pytest` and web CI are green. handoff.md lists "live prompt quality check in English" under *Needs live verification*.

### Phase 4: English conversion, docs
Tasks: rewrite in English `README.md`, `web/README.md`, `CLAUDE.md` (preserve every rule's meaning exactly), `docs/feishu-bot-setup.md` (if the bot is kept), `mac/NousHelper/README.md`, and code comments in files touched so far. Update `design/refactor-prompt.md`'s "Chinese-first" constraint and copy examples to English. Translating `research/*` and `ml/` is optional (§5).
Acceptance: no CJK in those docs. CLAUDE.md rules map one-to-one to the originals (list the mapping in the PR description). Links still resolve.

### Phase 5: Clerk auth in the Next.js app
Tasks:
- Add `@clerk/nextjs`, wrap `app/layout.tsx` in `ClerkProvider`, and add the request-interception file Next 16 expects (verify `proxy.ts` vs `middleware.ts`) with `clerkMiddleware`. Add `/sign-in` and `/sign-up` routes and a header user button.
- Route protection: the main app tabs and all per-user API routes require a signed-in user. Public routes: the landing/overview, `/agent` demo (decide in §5), `/api/model` (used as the deploy health check), and server-to-server endpoints (`/api/feishu/webhook`, `/api/twin/handle` and `/api/twin/feedback` when called with `TWIN_FEEDBACK_KEY`).
- API routes take identity from `auth()` server-side. **Never trust a `userId` from the request body for browser callers.**
- Retire pilot-code identity for the web (`lib/sync.ts`, `api/sync`, `api/pilot/*`, `pilot/page.tsx`) behind a flag, or remove it, depending on §5.
- Add the `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` and `CLERK_SECRET_KEY` placeholders to `.env.example`. CI must still build without real keys (stub or skip as Clerk's docs recommend).
Acceptance:
- Signed-out users visiting protected pages are sent to sign-in. Protected APIs return 401 without a session.
- Build and tests pass in CI without real Clerk keys.
- A short test (or documented manual check) confirms the server-side `auth()` userId reaches `twin-store` calls.

### Phase 6: Supabase schema and RLS keyed to Clerk user ids
Tasks:
- Create `supabase/migrations/` (Supabase CLI layout) and move `schema.sql` into an initial migration.
- Integrate Clerk with Supabase using the currently recommended method. As of 2025 that is Supabase's native third-party auth integration for Clerk, where the Supabase client sends the Clerk session token, rather than the deprecated JWT template. Verify against current docs.
- Tables that mirror the existing `twin-store` kinds, keeping append-only history:
  `cognitive_models`, `interviews`, `style_cards`, `suggestions` (was `twin_last`), `feedback`, plus `pilot_snapshots` (kinds `interview|scores|final_submit`) only if the pilot is kept. Each has `user_id text not null` (the Clerk `sub`), `payload jsonb`, and `created_at`, with an index on `(user_id, created_at desc)`.
- RLS enabled on every table. Policies are `select`/`insert` only where `user_id = (auth.jwt() ->> 'sub')`. No update or delete for clients (append-only, matching the current design). The service role stays server-only.
- A one-off script that copies existing `snapshots` rows (keyed by `code`) into the new tables once there's a code-to-Clerk-id mapping (§5). It must be dry-run by default.
Acceptance:
- Migrations apply cleanly to a fresh local Supabase (`supabase db reset`) if the CLI is available in the session. Otherwise the SQL is reviewed and the step goes under *Needs live verification*.
- SQL tests or a documented test plan show that user A can't read user B's rows with a user-scoped token, and that anon can't read anything.

### Phase 7: Backend API and wiring the core pipeline to it
Tasks:
- Replace `twin-store`'s generic `latest/list/append(code, kind)` with a Supabase repository layer that uses a **user-scoped client** (Clerk token) for browser-initiated requests and the service role only for trusted server-to-server paths. Decide whether SQLite (`TWIN_DB_PATH`) stays as a self-host option (§5).
- Consolidate the per-user API under a stable prefix (for example `app/api/v1/...`: `interview`, `model`, `predict`, `score`, `twin`, `feedback`) with typed request/response schemas. Keep the old routes as thin aliases until the Mac helper and bot are updated.
- Make server data the source of truth for signed-in users. On first sign-in, offer a one-time **import** of the existing localStorage data (interview signals, conflicts, results log, interview/predictor state) into the account. Never clear localStorage automatically.
- Expose the slow loop ("rebuild the model after 20 or more feedback edits", today manual in `core/`) through the backend. Options are in §5: (a) port the rebuild step to TS, reusing `shared-prompts.ts`, or (b) a small Python service (for example FastAPI) wrapping `core/`, called by the backend. Either way, respect the 60s limit (CLAUDE.md rule 5) by splitting work or running it as a background job. If this phase touches `signal_extractor.py` or `stat_detectors.py`, split them under 400 lines first.
- LLM provider: put calls behind one interface (web currently uses DeepSeek, `core/` uses Anthropic) so the provider is a config choice (§5).
Acceptance:
- All per-user reads and writes go through Supabase with RLS. No browser request can choose another user's id.
- localStorage import is covered by a unit test and is idempotent.
- Rebuild can be triggered through the API, with LLM calls mocked in tests. A live run goes under *Needs live verification*.
- CI is green and route-level tests cover 401/403/200.

### Phase 8 (conditional on §5): Feishu bot and Mac helper on the new identity
Only if Jess keeps them. Today they identify users by a Feishu `open_id` or a `twinUserId` string. These ids won't match Clerk ids once storage is keyed to Clerk, so they need a link step: for example, a signed-in user generates a short link code in the web app and sends it to the bot, or uses it as a per-user API token for the Mac helper. Keep `TWIN_FEEDBACK_KEY` for server-to-server calls. Translate the bot and helper strings to English.
Acceptance: a linked bot or Mac user reads and writes the same Supabase rows as their web account. An unlinked id is refused with an English message.

### Phase 9: Deployment
Tasks: choose the target (§5): Vercel (`web/vercel.json`, region `hnd1`) or the existing self-hosted Aliyun path (`web/scripts/deploy-aliyun.sh`, pm2/nginx). Document every environment variable (Clerk, Supabase URL/anon/service keys, LLM keys, Feishu if kept) in `.env.example` and the README. Add steps for the Clerk production instance and allowed origins. Apply Supabase migrations as a deploy step. Update CI if needed (for example, run a migration lint). Keep `/api/model` (or a new `/api/health`) as an unauthenticated health check.
Acceptance: a fresh clone can be deployed by following the README alone. The health check passes. Sign-up → interview → model saved in Supabase works end to end. The live run is done by Jess or the CLI and recorded in handoff.md.

---

## 5. Open questions for Jess
1. **Feishu bot and Mac helper**: keep them (adds Phase 8 and English bot copy), or drop them from the English product? Should the bot stay bilingual (Chinese plus English triggers)?
2. **LLM provider and keys**: the web uses DeepSeek today and `core/` uses Anthropic. Which provider should the English product standardize on, and who provides keys for staging and production? (The Slack session has none, so live checks fall to you or a CLI session.)
3. **Hosting**: Vercel (60s function limit, `hnd1`) or your Aliyun server? Which Supabase region? Your main users are now English-speaking, but the Aliyun choice was made because of China-to-overseas network issues.
4. **SQLite self-host mode** (`TWIN_DB_PATH`): keep it as an option, or make Supabase the only store?
5. **Pilot study** (`/pilot`, invite codes, `snapshots` table): retire it, keep it read-only, or migrate its data? If migrating, how should invite codes map to Clerk users?
6. **Existing data**: is there production data in Supabase `snapshots` or a server SQLite DB that has to be migrated, and whose is it?
7. **Public pages**: should the overview, `/agent` demo, and Research tab stay public without sign-in?
8. **Clerk sign-in methods** (email, Google, …) and whether sign-up is open or invite-only/waitlist.
9. **Slow-loop backend**: port the rebuild to TypeScript, or run a Python service for `core/`?
10. **Language scope**: English-only, or English default with Chinese kept (i18n)? Translate `research/` and `ml/` docs too? Remove CJK font fallbacks?
11. **CLAUDE.md rule change**: OK to change "show users Chinese error messages" to English and to translate CLAUDE.md itself?
12. **Research/accuracy claims** in the README (99%, 71%…): keep them as-is in the English README?

---

## 6. Constraints carried from CLAUDE.md (must hold throughout)
1. Read `.claude/handoff.md` before work. Update it immediately after each task (✅ + date + one-line report of files changed and key results) **before** doing anything else or reporting. An un-updated handoff means the task isn't done.
2. handoff.md stays under 100 lines. Compact by archiving reports to one line per day.
3. Roles: the lead session plans and reviews, and the CLI session executes and reports. The lead reviews only through handoff.
4. This session has no `ANTHROPIC_API_KEY`. Tasks that need live API calls are written into handoff for the CLI (or Jess).
5. Never casually clear localStorage.
6. Large inputs are sampled (over 100K chars: take the head, middle, and tail). Never run the full input through the API.
7. T1/T2 scoring stays deterministic (1.0/0.0), never LLM-judged.
8. Respect the Vercel 60s timeout by splitting and parallelizing API calls.
9. Files under 400 lines, functions under 50 lines, immutability, try/catch around every API call with user-facing error messages (English after Phase 3).
10. Commit format `<type>: <description>`.
11. `web/`: Next.js 16 differs from training data. Read `node_modules/next/dist/docs/` first.

## 7. Optional ideas (not requested, don't build unless Jess says so)
- Real per-tab routes (`/interview`, `/predict`…) instead of one client-state page.
- Model version history backed by Supabase (the `design/refactor-prompt.md` Validator "git log" timeline currently uses mock data).
- i18n framework (for example next-intl) to keep Chinese as a second locale.
- Account settings: export and delete my data (useful for privacy, given that this is psychological data).
- Rate limiting and usage metering per Clerk user for LLM routes.
- Supabase Edge Functions or a queue for the slow loop.
- Splitting the remaining oversized files (`Analyzer.tsx`, `Validator.tsx`, `InlineValidator.tsx`, `Research.tsx`, `signal_extractor.py`, `stat_detectors.py`) even when untouched.
- Error monitoring (Sentry) and analytics.
