# UX Audit — 2026-04-14

Applied `invite-app-ux-audit` checklist to current `public/admin.html`, `public/invite.html`, `config.js`. Findings prioritized P0 → P2.

## P0 — Broken paths

- [ ] **[admin]** `applyTheme()` is invite-only — admin chrome stays brown #8b6f47 regardless of preset. Picking a preset won't change admin's look. → Mirror `applyPreset()` on admin boot.
- [ ] **[invite]** Google Fonts `Playfair Display` + `Inter` referenced in CSS but no `<link rel="stylesheet">` tag. They silently fall back to Georgia / system-ui. → Inject font `<link>` from preset bundle.
- [ ] **[admin]** First-paint race: `STATE.tab = 'assets'` default but `tabs()` forces `'settings'` first. Brief flash of "assets" before settings draws. → Initialize `STATE.tab` from `tabs()[0][0]`.
- [ ] **[invite]** Hero card wraps PDF rasters in translucent `.card` with backdrop-blur — looks broken on opaque images. → Conditional surface treatment per asset type.

## P1 — Friction

- [ ] **[admin]** Settings tab has no preset picker — admin must hand-tune 4 colors. With 5 distinct presets, this is a huge UX win. → Add visual preset chips at top of Settings.
- [ ] **[admin]** No live preview when editing settings. Save → open `/invite.html` in new tab → reload. → Live `applyPreset()` on every input change, "Save" persists.
- [ ] **[admin]** Theme picker only exposes 4 colors. Fonts, radius, max-width, motion are env-only and invisible. → Expose full token bundle (advanced disclosure).
- [ ] **[admin]** PIN error uses `.muted` color (#6b6b6b on #faf7f2 = ~3.6:1). Not visible enough as error. → Semantic `--danger` color, role="alert".
- [ ] **[invite]** No state for "RSVP submitted" beyond text swap. No animation, no celebration. → Brief reveal + check icon. Respect `prefers-reduced-motion`.
- [ ] **[invite]** No `prefers-reduced-motion` rule. Once we add motion, must gate it.
- [ ] **[admin]** Asset upload always shows "host slug" input even when no hosts configured. → Hide unless `hosts.length > 0`.
- [ ] **[admin]** Bulk send "Sent → Next" doesn't show progress bar. Step counter is plain text. → Visual progress.
- [ ] **[admin]** Status messages all `.muted`. No semantic success/warn/error styling. No dismissal. → Toast or status colors per kind.
- [ ] **[admin]** Restore-from-JSON with "wipe first" checkbox shows no confirmation dialog. Destructive. → `confirm()` when wipe checked.
- [ ] **[invite]** No reveal-on-scroll motion. Page feels static. → IntersectionObserver fade-up, ≤200ms, staggered.
- [ ] **[invite]** Loading state is a single muted line "Loading…". Skeleton would feel faster. → Skeleton hero card.
- [ ] **[invite]** No focus ring styled. Tabbing through is invisible. → `:focus-visible` ring using `--accent`.
- [ ] **[admin]** No focus ring styled. Same a11y gap.
- [ ] **[admin]** Logout button is small ghost in top-right — easy to miss after a long session. → Slightly more prominent, or keep but add a confirm.

## P2 — Polish

- [ ] **[invite]** Hero card has `.card` styling (translucent + blur + border) wrapping the asset — feels like a frame. Consider edge-to-edge hero with no card chrome.
- [ ] **[invite]** Date / time / venue rendered as `Date: …` `Venue: …` flat key-value rows. Editorial layouts use larger date display + hairline + venue grouping.
- [ ] **[invite]** Per-event RSVP status uses three text buttons (Attending / Maybe / Declined). Could be three icon-tinted radio chips for faster scanning.
- [ ] **[admin]** Tab pills are uniform; consider a subtle indicator (underline / left-bar) instead of fully filled accent — matches preset tones better.
- [ ] **[admin]** Stats tiles are uniform white cards. A more editorial treatment: number in display font, label uppercase tracking.
- [ ] **[admin]** Asset tile thumbnail aspect ratio fixed `height: 160px object-fit: contain` — letterboxes on tall images. Preserve aspect.
- [ ] **[invite]** No share button (copy invite URL). Useful for guests forwarding to a partner.
- [ ] **[invite]** Empty hero fallback uses `eyebrow` + `h1` + muted subtitle in a card. Could add a generated visual (gradient + monogram from initials).
- [ ] **[both]** Adopt a consistent type scale via `clamp()`-driven CSS variables — current file mixes hardcoded `1.4rem`, `.92em`, `clamp(1.8rem, 5vw, 2.6rem)`.

## Architecture changes implied

To support modular presets cleanly:

1. **Token surface expansion** in `config.theme` — add `surface`, `surface2`, `border`, `success`, `warn`, `danger`, `motion-fast/base/slow`, `tracking-tight/base/loose`, `font-display`, `font-body`, `font-mono`, `fontHref` (Google Fonts URL), `shadow-1/2`, `space-1..6`.
2. **`themePresets[]`** in config — array of 5 named presets, each shipping a complete token bundle.
3. **`themePresetActive`** in config — string id of the active preset; overridable via `config_overrides`.
4. **`/api/bootstrap` + `/api/public-invite`** — return `{ themePreset: { id, label, tokens, fontHref }, themePresets: [{ id, label, swatch }] }` (swatch for the picker).
5. **Client `applyPreset(preset)`** — set CSS vars + inject font link, used by both invite and admin.

## Out of scope this pass

- Animation library or motion design system (kept to small, native CSS transitions + IntersectionObserver).
- New product features (no settings backups beyond current JSON, no share link beyond current per-row).
- Admin role/permissions (single PIN-holder model unchanged).
- I18n (single-locale strings via `copy.*` unchanged).
- Build pipeline (no bundler, intentionally per CLAUDE.md "What To Preserve").

## Implementation order

1. Expand `config.theme` token surface; add `themePresets[]` (5 presets) + `themePresetActive`.
2. Wire `/api/bootstrap` + `/api/public-invite` to expose preset bundle.
3. Rewrite `applyTheme()` → `applyPreset()` on invite + add to admin.
4. Settings tab: visual preset chips at top, live preview on click.
5. Apply remaining P0/P1 polish (focus rings, motion, hero treatment, error colors, etc.).
6. Run `npm test`, viewport matrix, feature-flag matrix.
