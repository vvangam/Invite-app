# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

The **Invite App** — a customizable event invitation + RSVP + guest manager. The user uploads their pre-designed invite asset (PDF, JPG, PNG, or MP4) and the app wraps it with an RSVP form, guest manager, WhatsApp bulk send, and calendar export. Everything is driven by a single config file; every feature can be toggled on or off.

Two pages served from [public/](public/):

- [public/admin.html](public/admin.html) — PIN-gated admin: asset upload, guest CRUD, bulk messaging, exports
- [public/invite.html](public/invite.html) — public-facing invite + RSVP, rendered entirely from API

Single server file: [server.js](server.js). All behavior, copy, and features controlled from [config.js](config.js). Deployed to Railway.

## Commands

```bash
npm install                        # install deps (express, pg, multer, sharp, pdfjs-dist)
npm run dev                        # node --watch server.js (node >=22.5 required)
npm start                          # production start
npm test                           # node --test ./test/*.test.js
node --test test/smoke.test.js     # run a single test file
```

Local dev runs on `http://localhost:3000`. Admin at `/admin` — PIN from `CONFIG.pin` (default `1234`, override via `PIN` env var).

## Architecture

### Server ([server.js](server.js))

- **Database dual-mode**: PostgreSQL via `pg` when `DATABASE_URL` is set; else `node:sqlite` (lazy-required — only loaded when Postgres isn't configured, so Node 22 without `--experimental-sqlite` doesn't crash prod) at `./invite.db`. All queries route through `dbRun` / `dbGet` / `dbAll` helpers that accept both SQL dialects. Use `sqlParam(i)` to emit `?` vs `$i`. **Never** bypass these helpers.
- **Schema** (5 tables): `guests`, `assets`, `sessions`, `rsvp_events`, `config_overrides`. Migrations are idempotent `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` in both branches of `initDb()`. When adding a column — including to `config_overrides` — update **both** the Postgres and SQLite branches.
- **Auth**: `sessions` table keyed by a 32-char hex token (16 random bytes, persists across restarts). PIN validated at `/api/validate-pin`. Protected routes use `requireAuth` middleware.
- **Invite tokens**: each guest gets a 24-char hex `invite_token`. `backfillInviteTokens()` runs on startup.
- **Routes**: `/` redirects to `/invite.html`; `/admin` serves `admin.html`; `/i/:token` redirects to `/invite.html?token=…`; `/std/:slug` serves the save-the-date variant.
- **Config overrides**: `config_overrides` (key → value_json) is the admin-editable layer on top of `config.js`. `loadOverrides()` + `mergedConfig()` deep-merge at request time; `/api/bootstrap` and `/api/public-invite` always serve the merged view. Writable keys are gated by `CONFIG_KEY_ALLOWLIST` (`event|events|hosts|copy|features|rsvp|theme|messaging`) in `PUT /api/config`.
- **Asset pipeline**: uploads land in `UPLOAD_DIR` (default `./uploads/`). Images → sharp variants (full webp, 400px thumb, 1200x630 OG JPG). PDFs → original stored + page 1 rasterized via `pdftoppm` or `pdfjs-dist` fallback. Videos stored as-is, served with byte-range support. Max size `MAX_UPLOAD_MB`.
- **Rate limiting**: in-memory token bucket keyed by IP. Applied to `/api/rsvp` (20/min) and `/api/validate-pin` (5/min).

### Config ([config.js](config.js)) — THE source of truth

`config.js` controls every user-facing string, every feature toggle, every theme token, and the event / host / segment / group model.

> **Golden rule**: if a feature is `enabled: false` or an array is empty, the corresponding UI must not render. No placeholders, no empty headers, no dead buttons.

Key sections:
- `event` — single-event identity (title, date, venue, registry, dress code)
- `events[]` — sub-events (empty ⇒ single-event mode)
- `hosts[]` — sides / families (empty ⇒ no side picker)
- `guestSegments[]`, `groups[]` — categorization (empty ⇒ dropdown hidden)
- `rsvp.fields` — per-field enabled / required / label
- `features.*` — every optional subsystem
- `copy.*` — every user-facing string
- `theme.*` — CSS custom properties

All values env-overridable with safe placeholder defaults.

### Admin UI ([public/admin.html](public/admin.html))

Tabs: **Settings** (always — PIN-gated event/copy/theme editor, writes to `config_overrides` via `PUT /api/config`), **Assets** (if `features.assetUpload`), **Guests** (if `features.guestManager`), **Send** (if `features.bulkMessaging`), **Exports** (if any of `csvExport` / `jsonBackup`).

Module-level state in plain `let` variables. No framework. State is in-memory; page reload hits API.

### Invite Page ([public/invite.html](public/invite.html))

Renders entirely from `GET /api/public-invite?token=...`. The HTML file contains only a skeleton + one `render(payload)` function. **Zero hardcoded copy.** Every string comes from `payload.copy`.

Collapse rules (enforced in `render()`):
- `events.length <= 1` → hide event grid, single-event RSVP
- `hosts.length === 0` → hide hosts strip
- `features.pdfItinerary === false` → hide itinerary button
- `features.calendarExport === false` → hide ICS button
- Uploaded hero asset absent → text-only hero using `event.title`

### Visual Assets

There are NO hardcoded images in `public/assets/`. The only bundled files are a neutral favicon and a CSS reset shipped inline. The app ships blank — the user's first action is to upload their invite.

## What To Preserve

- **Single-file server.** Do not split [server.js](server.js) into modules unless explicitly asked.
- **Minimal dependencies.** Runtime: `express`, `pg`, `multer`, `sharp`. Optional: `pdfjs-dist`. Ask before adding more.
- **No build pipeline, no TypeScript, no framework migration.** Intentionally plain Node + static HTML.
- **No hardcoded copy.** Every user-facing string lives in `config.copy.*` and reaches the UI via the API payload. If you find yourself typing a sentence in `.html`, stop — add a copy key and reference it.
- **No hardcoded assets.** Every image / video is served via `/api/asset/:id/:variant`. Never reference `/assets/foo.png` directly.
- **Feature flags are load-bearing.** If you add a feature, add a flag. If a flag is off, the UI must render exactly as if the feature doesn't exist.
- **Parameterized SQL only.** Never interpolate user input into query strings. Always use `sqlParam()`.

## Workflow

### Plan First

- Enter plan mode for any non-trivial task (3+ steps or architectural decisions).
- Write the plan to [tasks/todo.md](tasks/todo.md) as a checkable list before implementing.
- Verify the plan with the user before starting implementation.
- If something goes sideways, STOP and re-plan immediately.

### Self-Improvement Loop

- After ANY correction from the user: append to [tasks/lessons.md](tasks/lessons.md) with what went wrong, why, and how to detect it next time.
- Review [tasks/lessons.md](tasks/lessons.md) at the start of every session.

### Verification Before Done

- Server changes: restart with `npm run dev` and hit the affected endpoint before declaring success.
- UI changes: load the page in a browser, click the golden path AND one edge case (empty state, single event, feature flag off).
- Upload changes: test each asset type — PDF, multi-page PDF, JPG, PNG, MP4.
- Tests: `npm test` must pass. Add a test for every new endpoint.
- Type checks and linters are not a substitute for exercising the feature.

### Autonomous Bug Fixing

- When given a bug report: just fix it. Point at logs / errors, resolve, zero context switching from the user.

## ECC Agent Usage

| Trigger | Agent |
|---|---|
| Start of any feature with 3+ steps | `@planner` |
| After writing any server-side code | `@code-reviewer` |
| Before a commit touching auth, upload, or public endpoints | `@security-reviewer` |
| When `npm run dev` or CI fails | `@build-error-resolver` |
| Adding a feature or fixing a bug | `@tdd-guide` (write the test first) |
| Architectural decision (moving to modules, adding a dep) | `@architect` |
| Schema change | `@database-reviewer` |
| Critical user flow (public RSVP, admin login, bulk send) | `@e2e-runner` with Playwright |
| Removing dead code after a cut feature | `@refactor-cleaner` |
| Updating docs / README | `@doc-updater` |

## ECC Skill Usage

| Task | Skill |
|---|---|
| Designing a new API endpoint | `api-design` |
| Server-side patterns (middleware, error handling) | `backend-patterns` |
| Admin / invite page interaction | `frontend-patterns` |
| Any SQL change | `postgres-patterns` + `database-migrations` |
| Writing Playwright tests for public flows | `e2e-testing` |
| Code-quality review against a checklist | `plankton-code-quality` |
| General conventions | `coding-standards` |
| Post-correction retrospectives | `continuous-learning` |

## Hooks

Project hooks at [.claude/settings.json](.claude/settings.json):

- **PostToolUse** `Edit|Write` — syntax check on `.js` saves, grep for TODO / console.log, warn on hardcoded copy in `.html`, detect SQL injection via template literals in server.js.
- **Stop** — runs `npm test` and a final `node --check server.js` syntax gate.
- **PreToolUse** `Bash` — soft-blocks `rm -rf`, `DROP TABLE`, `TRUNCATE`.

## Deployment

- Railway runs `npm install --omit=dev` then `node server.js`.
- Healthcheck: `/api/bootstrap` — unauthenticated and cheap.
- Production DB: Postgres via `DATABASE_URL`. SSL defaults to `rejectUnauthorized: false` unless `PGSSLMODE=disable`.
- **Persistent volume**: mount `UPLOAD_DIR` (default `/app/uploads`) as a Railway volume. Without this, uploads vanish on every redeploy.
- **PDF rasterization**: requires `poppler-utils` in the Nixpacks build, or set `PDF_BACKEND=pdfjs` to use the pure-JS fallback.
- Env vars: `PIN`, `DATABASE_URL`, `PGSSLMODE`, `PORT`, `PUBLIC_URL`, `UPLOAD_DIR`, `MAX_UPLOAD_MB`, `PDF_BACKEND`, plus every `EVENT_*` / `CONTACT_*` / `THEME_*` override documented in [config.js](config.js).
