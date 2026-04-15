# Invite App — Improvement Plan (2026-04-15)

> Goal: deliver **meaningful** improvements to features, workflow, and
> usability — not surface polish. Each item below has a concrete edit
> location and an effort estimate. Ship in the order listed.
>
> Decision: **drop save-the-date as a separate concept**. STDs are just
> events with a "Save the Date" name and an earlier date. The whole
> `features.saveTheDate`, `/std/:slug`, `std_status`, `std_variant`,
> `hosts[].stdAssetSlug`, `messaging.stdTemplate`, `assetRoles: 'std-default'`
> machinery comes out. One model, one mental model.

---

## Phase 0 — Cleanup & honesty pass (1 day) ✅

Make existing flags / config slots actually mean what they say. Removes
~250 lines of dead code; nothing the user sees breaks.

- [x] **Remove save-the-date plumbing.**
  Files: `config.js` (drop `features.saveTheDate`, `messaging.stdTemplate`,
  drop `'std-default'` from `assetRoles`); `server.js` (drop `/std/:slug`,
  drop STD branches in CSV/JSON export & import, `loadAssetsByRole` STD
  handling); `admin.html` (drop the saveTheDate checkbox); `public/invite.html` (none).
  Migration: leave existing `std_*` columns in DB (additive only — don't drop), just stop reading/writing them.
- [x] **Remove `features.pdfItinerary`** (zero implementation; lying flag) +
  `copy.downloadItinerary`. Edit `config.js`, `admin.html`.
  Renamed multi-page-PDF link to `copy.openFullInvite`.
- [x] **Enforce `features.videoUpload`** — filter `uploads.allowedMime` in
  `server.js` based on the merged-config flag (per-request).
- [x] **Keep `messaging.reminderTemplate`** but document it as a Phase 5
  dependency in config comments.
- [x] **Remove `defaults.segment` / `defaults.group`** (unused).

## Phase 1 — Server enforcement of declared rules (½ day) ✅

Flags that are advertised in the API payload but not enforced are
worse than missing — they invite trust bugs.

- [x] **Enforce `rsvp.lockAfterDeadline`** in `POST /api/rsvp`.
  Returns 403 with `copy.rsvpClosed` when `event.rsvpDeadlineISO`
  (or `event.dateISO` fallback) is past and the flag is on.
- [x] **Enforce `rsvp.allowSelfEdit`** in `POST /api/rsvp`. If guest already
  has a non-Pending status and flag is off, returns 403.
- [x] **Add `event.rsvpDeadlineISO`** as the machine-readable deadline
  (existing `rsvpDeadline` stays as the display string). Validated ISO
  in `PUT /api/config`.
- [x] **Validate `event.dateISO`** server-side (ISO 8601 regex + `Date.parse`).
- [x] **PIN lockout**: after 5 consecutive failures from one IP, locks that
  IP for 60 minutes — outlasts the per-minute rate-limit bucket. Cleared on
  successful login.

## Phase 2 — Settings editor completeness (1 day)

Right now the admin UI lets you edit ~70% of `config.js`. Expose the
rest — these are features that already work but require shell access.

- [ ] **`messaging.*` editor** — two textareas (invite / reminder
  templates) with token chip helpers (`{{name}} {{eventTitle}} {{inviteUrl}} {{rsvpDeadline}}`).
- [ ] **`rsvp.fields.*` editor** — per field: enabled / required / label /
  max (for partySize). Replaces the implicit "publicRsvp toggles all
  fields" model.
- [ ] **`rsvp.statusOptions[]` editor** — string list, default
  `['Attending','Maybe','Declined']`.
- [ ] **`rsvp.allowSelfEdit / lockAfterDeadline` checkboxes**.
- [ ] **`guestSegments[]` editor** — repeater: label + multi-select
  sub-events from `events[]`. Persists to `config_overrides`.
- [ ] **Asset role re-tag**: `PATCH /api/assets/:id { role }` + dropdown
  on each asset tile.

## Phase 3 — Guest experience: from invite-card to mini-site (2 days)

Take the page from one long invite to a navigable site, mirroring Joy/Zola.

- [ ] **Section nav** — sticky pill nav along the top: Welcome / Story /
  Schedule / Travel / FAQ / Registry / RSVP. Click scrolls smoothly.
  Render only sections with content (golden rule).
- [ ] **Countdown timer** — animated `event.dateISO`-driven count, in the
  hero card. Skip if undated. ~50 lines, no deps.
- [ ] **Map embed** — new `event.mapsEmbedUrl` field. If set, render an
  iframe; otherwise fall back to current "Open in Maps" link. No new
  dep — Google Maps embed is iframe-based.
- [ ] **Timeline view for sub-events** — vertical time-axis, time
  centered on the spine, event cards offset. Replaces the flat grid.
- [ ] **FAQ section** — new `event.faq: [{q, a}]` array, accordion render.
  Editable in admin via repeater.
- [ ] **Travel / logistics card** — new `event.travel: { hotelBlock, hotelUrl,
  parking, transport, accessibility }`. Render as a card if any field set.
- [ ] **Multiple registries** — convert `event.giftRegistry: string` to
  `event.registries: [{label, url, note}]`. Migration: if old string
  present, wrap into one-item array.
- [ ] **Plus-one names** — add `partyMembers: string[]` to RSVP submit.
  When `partySize > 1`, render `partySize - 1` name fields.
  Schema: add `party_members TEXT` column.
- [ ] **Per-attendee dietary** — when `fields.dietary.enabled`, render one
  textarea per attendee (with their name as label).
  Schema: change `dietary` to JSON or stringify.
- [ ] **Per-event RSVP filtering by segment** — if guest has a `segment`
  matching a `guestSegments[]` entry, hide events not in
  `includesEventIds`. Currently shipped to client but ignored.
- [ ] **Hero polish** — remove the translucent card around opaque PDFs;
  conditional `heroSurface: 'edge'` for PDF/PNG, `'card'` for photos.
- [ ] Verify `prefers-reduced-motion` honored across new motion.

## Phase 4 — Admin workflow (1.5 days)

The admin currently hides the highest-leverage actions behind the
"save → open new tab → reload" loop and a single linear table.

- [ ] **First-run onboarding wizard** (Settings tab modal).
  5 steps: pick preset → event title → date/venue → upload hero →
  add 1 host. Skip if config already has a non-default title.
  Persists progress in `localStorage` so you can resume.
- [ ] **Inline preview-as-guest pane.** Right-side iframe (toggle:
  desktop / tablet / mobile widths). When admin clicks a preset chip
  or saves a field, iframe reloads. Kills the new-tab dance.
- [ ] **Toast notifications** — replace every `.muted` status line with
  a corner toast (success/error/info, auto-dismiss). One component,
  reused everywhere.
- [ ] **Dirty-state save bar** — track `JSON.stringify(draft) !==
  JSON.stringify(cfg)`; show "Unsaved changes" with diff count and a
  `beforeunload` warning.
- [ ] **Guest list search + bulk select.** Debounced filter (name /
  group / RSVP / status). Checkbox per row → bulk actions: set RSVP,
  set group, set inviteStatus, delete, export selected, send to
  selected.
- [ ] **Household grouping.** New optional `household_id` column. Two
  guests with same household_id render as a single row in the table
  (expand to show members). Reduces visual noise for couples.
- [ ] **CSV import** — mirror the JSON restore path, accept CSV with
  flexible column mapping. Stage a preview before commit.
- [ ] **Mobile guest table** — collapse to card view < 640px.

## Phase 5 — Communications (2 days)

WhatsApp open-link is fine for India but breaks for international or
guests without WhatsApp. Add channels + reminders.

- [ ] **Email channel** — abstract `messaging` to `messaging.channels:
  { whatsapp, email }`. Implement email via Resend (cleaner DX than
  SendGrid). Per-guest send button picks best channel based on
  available `mobileNumber` / `emailAddress`. New env: `RESEND_API_KEY`.
- [ ] **Bulk send actually bulk** — given a selection from the
  guests-tab bulk action, queue a per-guest send; show progress
  bar; auto-set `inviteStatus='Sent'` on success.
- [ ] **Scheduled reminder job** — simple in-process timer:
  every 6 hours, check guests with `rsvp='Pending'` AND `inviteStatus='Sent'`
  AND deadline-reminder window. Send via channel. Log in `rsvp_events`.
  Toggle: `features.autoReminders`. Settings field for window
  (e.g., 14 days, 7 days, 1 day).
- [ ] **Notify admin on RSVP** — optional email to `event.contactEmail`
  on each new submission. Toggle: `features.adminNotifications`.

## Phase 6 — Analytics & shareability (½ day)

- [ ] **Track anonymous views** — `/api/track-view` beacon called from
  `invite.html` boot; record with `guestId=null`. Dashboard splits
  "Personal views" vs "Anonymous views".
- [ ] **Real OG image on `/invite.html`** — currently OG meta is only
  on `/std/:slug` (which we're removing). Server-side render
  `/invite.html` with OG meta tags injected from `event` + hero asset.
- [ ] **Share button on invite** — copy link, native share API on
  mobile (`navigator.share`).

## Phase 7 — Photo gallery (1 day)

- [ ] **`gallery` asset role** — uploaded assets tagged `gallery` are
  rendered as a horizontal scroll/lightbox section between Hero and
  Details on the invite. Order via drag-handle in admin.

## Phase 8 — Internationalization & timezone (1.5 days; defer if scope-cap)

- [ ] **Timezone-aware dates** — `event.timezone` (IANA), display all
  dateISO/timeLabel relative to viewer's tz with explicit hint
  ("8 PM IST = 10:30 AM ET").
- [ ] **Multi-locale copy** — `copy: { en: {...}, hi: {...} }`,
  language toggle in invite header, `Accept-Language` fallback.

---

## Implementation order — recommended

1. **Phase 0 + 1** together (1.5 days). Honesty first; gives you trust and removes the lying flags before you build new ones.
2. **Phase 2** (1 day). Open up the Settings editor — many later phases depend on it being editable from the UI.
3. **Phase 3** (2 days). Biggest jump in guest-perceived quality. Pieces are independent — ship Section nav + countdown + plus-one names first; FAQ / Travel / Timeline can land separately.
4. **Phase 4** (1.5 days). Admin self-service. Onboarding wizard + preview pane + toasts are the morale wins.
5. **Phase 5** (2 days). Once content is rich (Phase 3) and admin is self-service (Phase 4), add channels + automation.
6. **Phase 6** (½ day). Cheap wins, but only matter once you have content worth sharing.
7. **Phases 7 + 8** opportunistic; ship if scope allows.

**Total: ~10 working days of focused work** for Phases 0–6.

## Out of scope this round

- Multi-admin roles / audit log (no demand signal yet)
- Service worker / offline (mobile networks today are good enough)
- S3/R2 storage (Railway volume works fine)
- Drag-reorder for hosts/sub-events (nice but rare action)
- Theme preset additions (5 is plenty; reach for it after content features)

## Definition of done (per phase)

- [ ] All flags either implemented or removed (no liars).
- [ ] Every config slot exposed in admin or documented as env-only on purpose.
- [ ] `npm test` passes; dev smoke test on mobile + desktop viewports.
- [ ] Feature-flag matrix re-verified per `invite-app-ux-audit` skill.
- [ ] Per-phase commit; each phase deployable on its own.
