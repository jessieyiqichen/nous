# Nous handoff (cross-session)

Full plan: `docs/upgrade-spec.md`. One phase = one branch = one PR. Don't start next phase until Jess approves.

## Roles
- Lead session: plan, research, review (via this file only), write tasks.
- CLI session: execute coding tasks, run CI, write completion reports here.

## Current phase
- Phase 1 — DONE (2026-11-04). Awaiting Jess approval for Phase 2.

## To-do (all phases)
- [x] Phase 1: handoff file + committable `.claude/`, commit spec, fix `web/.env.example`, CI baseline (no product code)
- [ ] Phase 2: English conversion — web UI (`web/app/**`, demo threads, pilot, lang="en")
- [ ] Phase 3: English conversion — prompts, server error strings, bot logic, `core/` default `--lang en`
- [ ] Phase 4: English conversion — docs (README, CLAUDE.md, mac/feishu docs, comments)
- [ ] Phase 5: Clerk auth in Next.js (middleware/proxy, sign-in/up, route protection, auth() identity)
- [ ] Phase 6: Supabase schema + migrations + RLS keyed to Clerk sub
- [ ] Phase 7: Backend API (user-scoped Supabase repo, /api/v1, localStorage import, slow-loop endpoint)
- [ ] Phase 8 (conditional §5-Q1): Feishu bot + Mac helper on new identity + English copy
- [ ] Phase 9: Deployment (Vercel vs Aliyun, env docs, migrations in deploy, health check)

## CLI completion reports
- Phase 1 (2026-11-04): Changed `.gitignore` (`.claude/*` + `!.claude/handoff.md`, kept `web/.claude/` ignored),
  added `.claude/handoff.md` + `docs/upgrade-spec.md` (spec verbatim), rewrote `web/.env.example` to match
  all `process.env.*` read in web/+bots/ (removed stale ANTHROPIC_API_KEY). No runtime code changed. CI green.

## Completed summary
- 2026-11-04: Phase 1 — handoff + spec committed, env example fixed, CI baseline recorded green. PR opened.

## Needs live verification (CLI / Jess)
- CI was run THIS session (2026-11-04), all green:
  - Python `pytest -q`: 25 passed. Web `npm ci`, `tsc --noEmit`, `lint`, `vitest` (32 passed), `build`: all pass.
  - No pre-existing failures. Note: CI/local Python skips sentence-transformers (stat_detectors.py) by design.
- Phase 1 needs NO live LLM/API check (no API calls made; session has no ANTHROPIC/DeepSeek key).

## Open questions for Jess (spec §5)
1. Keep Feishu bot + Mac helper (→ Phase 8)? Bot bilingual?
2. LLM provider to standardize on (web=DeepSeek, core=Anthropic)? Who provides staging/prod keys?
3. Hosting: Vercel (60s, hnd1) or Aliyun? Supabase region?
4. Keep SQLite self-host mode (TWIN_DB_PATH), or Supabase only?
5. Pilot study (/pilot, invite codes, snapshots): retire / read-only / migrate? Code→Clerk mapping?
6. Any production data in Supabase snapshots or server SQLite to migrate, and whose?
7. Public pages: keep overview, /agent demo, Research tab public (no sign-in)?
8. Clerk sign-in methods (email/Google/…) and open vs invite-only sign-up?
9. Slow-loop backend: port rebuild to TypeScript, or Python service for core/?
10. Language scope: English-only or English+Chinese i18n? Translate research/ + ml/? Drop CJK font fallbacks?
11. OK to change CLAUDE.md rule "Chinese error messages" → English, and translate CLAUDE.md itself?
12. Keep README accuracy claims (99%, 71%…) as-is in the English README?
