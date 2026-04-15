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

## Phase 2 — Settings editor completeness (1 day) ✅

Right now the admin UI lets you edit ~70% of `config.js`. Expose the
rest — these are features that already work but require shell access.

- [x] **`messaging.*` editor** — two textareas (invite / reminder
  templates) with token chip helpers (`{{name}} {{eventTitle}} {{eventDate}} {{inviteUrl}} {{rsvpDeadline}}`).
  Click a chip to insert the token at the cursor.
- [x] **`rsvp.fields.*` editor** — per field: enabled / required / label /
  max (for partySize). Replaces the implicit "publicRsvp toggles all
  fields" model.
- [x] **`rsvp.statusOptions[]` editor** — string list, empties filtered on save,
  falls back to `['Attending','Maybe','Declined']` if cleared.
- [x] **`rsvp.allowSelfEdit / lockAfterDeadline` checkboxes** — already enforced
  server-side by Phase 1; now editable from the UI.
- [x] **`guestSegments[]` editor** — repeater: id + label + multi-select
  sub-events from `events[]`. Persists to `config_overrides`.
- [x] **Asset role re-tag**: `PATCH /api/assets/:id { role }` + dropdown
  on each asset tile. Singleton roles (`hero`, `background`) evict the old
  holder on switch, same as upload time.

## Phase 3 — Guest experience: from invite-card to mini-site (2 days)

Take the page from one long invite to a navigable site, mirroring Joy/Zola.

- [x] **Section nav** — sticky pill nav along the top: Welcome / Hosts /
  Details / Events / RSVP / Contact. Click scrolls smoothly.
  IntersectionObserver highlights the active section. Renders only
  sections that exist (golden rule).
- [x] **Countdown timer** — animated `event.dateISO`-driven count
  (Days / Hours / Min / Sec tiles), rendered inside the hero. Skips when
  undated or past. No deps.
- [x] **Map embed** — new `event.mapsEmbedUrl` field. If set, renders an
  iframe inside the Details card; otherwise keeps the "Open map" button.
  Editable in Settings.
- [x] **Timeline view for sub-events** — vertical time-axis with event cards
  offset either side; collapses to a single column <540px. Replaces the flat
  grid when `events[].length >= 2`; single-event keeps the old layout.
- [x] **FAQ section** — `event.faq: [{q, a}]` array, `<details>`/`<summary>`
  accordion render. Editable in admin via repeater.
- [x] **Travel / logistics card** — `event.travel: { hotelBlock, hotelUrl,
  parking, transport, accessibility }`. Card hides when all fields empty.
  `hotelUrl` renders as a "Book room" CTA inside the Hotel block row.
- [x] **Multiple registries** — `event.registries: [{label, url, note}]`.
  Server-side shim in `mergedConfig` wraps a non-empty legacy
  `event.giftRegistry` into a one-item array when `registries` is empty,
  so existing configs keep working without touching stored overrides.
  Admin editor promotes the string into the repeater on first open.
- [x] **Plus-one names** — `partyMembers: string[]` on RSVP submit.
  When `partySize > 1`, renders `partySize - 1` name fields; names are
  trimmed, empty entries dropped, and the list is capped at `partySize-1`
  server-side. Schema: `party_members TEXT` column added via idempotent
  `ensureColumn()` migration helper (PG native, SQLite via PRAGMA).
- [x] **Per-attendee dietary** — when `fields.dietary.enabled` and
  `partySize > 1`, renders one textarea per attendee labeled with their
  name (primary + partyMembers). Submits as JSON array
  `[{name, text}]`; single-attendee mode keeps the legacy string.
  Server-side `dietaryPayload` normalizes either shape, filters empty
  entries, stores as text. `parseDietary()` in `guestToFrontend` returns
  an array when stored-as-JSON, a string otherwise.
- [x] **Per-event RSVP filtering by segment** — invite.html now applies
  `applySegmentFilter(events, segments, guest)` before rendering both the
  events grid and the per-event RSVP picker. Segments without
  `includesEventIds` fall through to "all events" as before.
- [x] **Hero polish** — `renderHero()` now auto-promotes `heroSurface` to
  `'edge'` when the uploaded hero mime is `application/pdf` or
  `image/png`, so opaque / transparent uploads don't get a blurry card
  frame. Explicit `'card'` or `'edge'` themes still win.
- [x] Verify `prefers-reduced-motion` honored across new motion —
  global override at `@media (prefers-reduced-motion: reduce)` already
  clamps all animation/transition durations to 0.001ms and neutralises
  `.reveal`; countdown/nav highlight/FAQ `<details>` use no CSS
  keyframes so nothing new to gate.

## Phase 4 — Admin workflow (1.5 days)

The admin currently hides the highest-leverage actions behind the
"save → open new tab → reload" loop and a single linear table.

- [x] **First-run onboarding wizard** (full-screen modal).
  5 steps: pick preset → event title → date/venue → upload hero →
  add host. Fires on PIN-success / boot when `event.title` is still
  a default placeholder. "Skip setup" + per-step Back/Next, progress
  bar, partial progress persisted in `localStorage` under
  `invite-admin:wizardDraft`; completion flag at `:wizardDone`.
- [x] **Inline preview-as-guest pane.** Right-side `<aside>` with an
  iframe pointing at `/invite.html`. Viewport toggle buttons switch
  between desktop (100%), tablet (768×1024), mobile (375×667).
  Toggle + viewport choice persist in `localStorage`. Save triggers
  full Settings re-render so the iframe picks up fresh config
  automatically; explicit Reload button for manual refresh.
  Collapses to single column below 1100px viewport width.
- [x] **Toast notifications** — global `toast(message, variant, duration)`
  with success/error/info variants, auto-dismiss, click-to-close.
  Replaced inline `.muted` status in: asset upload, add-guest, settings
  save, JSON restore.
- [x] **Dirty-state save bar** — Settings tab snapshots `draft` via
  `JSON.stringify`, compares against baseline, shows "Unsaved changes"
  in accent color, gates Save button on dirty, warns on `beforeunload`.
  Listener removed after successful save.
- [x] **Guest list search + bulk select.** Debounced filter (name /
  email / phone / group / segment / notes free-text + dropdowns for
  RSVP / invite status / group). Per-row checkbox + select-all.
  Sticky bulk bar shows count + actions: Set RSVP, Set invite status,
  Set group, Delete. New `POST /api/guests/bulk` endpoint backs it.
- [ ] **Household grouping.** New optional `household_id` column. Two
  guests with same household_id render as a single row in the table
  (expand to show members). Reduces visual noise for couples.
- [ ] **CSV import** — mirror the JSON restore path, accept CSV with
  flexible column mapping. Stage a preview before commit.
- [x] **Mobile guest table** — collapses to card view at `<640px`
  viewport. Each card shows name/group/phone/email, RSVP + invite
  selects, and Copy/WhatsApp/Delete actions. Selection checkbox in
  the card header participates in the same bulk bar.

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
