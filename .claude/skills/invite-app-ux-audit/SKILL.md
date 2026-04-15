---
name: invite-app-ux-audit
description: Flow-by-flow UX audit checklist tuned to this app's two surfaces (admin + public invite). Use before any UX change, or whenever asked to "improve UX." Project-local.
origin: project
---

# Invite App — UX Audit Checklist

Project-specific audit recipe. Sister skill to global `ui-overhaul-workflow`. Use this one when working *inside this repo*; it knows the file layout, feature flags, and golden rules.

## When to Activate

- Before any UX change to `public/admin.html`, `public/invite.html`, or `config.js` theme.
- Before a release where you've added a feature flag.
- After a bug report about confusing flow, missing state, or "feels off."
- When the user says "improve UX" without specifics.

## Surfaces in Scope

```
public/invite.html   public-facing  →  rendered from /api/public-invite
public/admin.html    PIN-gated      →  rendered from /api/bootstrap + /api/config
```

There are exactly two HTML files. Both render entirely from API payloads. Both must collapse cleanly when feature flags are off.

## The Audit Walk

Run all four passes per surface. Score every finding **P0 / P1 / P2** and write to `tasks/ux-audit.md`.

### Pass 1 — Flow walkthrough

Click through every primary user task end-to-end. Note friction.

#### Public invite (anonymous user lands on `/i/:token` or `/`)
1. Page loads → can the user identify the event in <2 sec?
2. Hero asset present → does it dominate? Hero absent → fallback hero readable?
3. Scroll → do the sections (hosts, details, events, RSVP, contact) flow?
4. RSVP → can a user submit in ≤30 seconds? With one hand on mobile?
5. RSVP submitted → clear confirmation? Can they edit?
6. Token absent / invalid → graceful "not found" with next step?

#### Admin (PIN holder)
1. PIN gate → error visible if wrong? Lockout messaging?
2. Settings → preset switch live? Save state visible?
3. Assets → upload affordance obvious? Drag works? Failure states?
4. Guests → add guest in ≤15 sec? Bulk invite link copy?
5. Send → step-through-each-guest works without clicking out and back?
6. Exports → CSV/JSON/restore all wired? Restore wipe confirmation?
7. Logout → token cleared? Re-PIN required?

### Pass 2 — Feature flag matrix

The "golden rule" (per CLAUDE.md): if a flag is off, the UI must look like the feature doesn't exist. Verify every flag.

| Flag                         | What must collapse                                    |
|------------------------------|-------------------------------------------------------|
| `features.publicRsvp`        | RSVP card hidden on invite                             |
| `features.calendarExport`    | "Add to Calendar" buttons gone                         |
| `features.pdfItinerary`      | "Download Itinerary" gone                              |
| `features.bulkMessaging`     | Send tab gone in admin                                 |
| `features.guestManager`      | Guests tab gone in admin                               |
| `features.csvExport`         | CSV export button gone                                 |
| `features.jsonBackup`        | JSON download / restore gone                           |
| `features.viewAnalytics`     | Stats tiles for views/submissions gone                 |
| `features.darkMode`          | Auto dark mode listener disabled                       |
| `features.videoUpload`       | MP4 not in upload accept list                          |
| `features.assetUpload`       | Assets tab gone                                        |
| `features.saveTheDate`       | STD variant routes hidden, STD upload role hidden      |

Empty arrays also collapse:
- `events[]` empty → no Events section, no per-event RSVP picker
- `hosts[]` empty → no "Hosted By" strip
- `guestSegments[]` empty → no segment dropdown

If any flag-off cell shows orphaned chrome (empty header, dead button, padding without content), it's **P0**.

### Pass 3 — State coverage

Every screen has four states. Most apps ship only one.

```
  Empty       → first-time admin, no assets, no guests
  Loading     → initial fetch, slow network
  Error       → API down, bad token, validation failure
  Populated   → typical, plus extreme (long names, 100+ guests, 10 sub-events)
```

Per primary surface, score each state. A missing state is **P1** minimum.

### Pass 4 — Craft pass

Apply the `ui-ux-craft` axes. Per surface:

- **Hierarchy** — primary action obvious in ≤1 sec?
- **Density** — rhythm of cards / spacing consistent?
- **Tone** — copy reads natural, not "AI placeholder"?
- **Motion** — meaningful or absent? `prefers-reduced-motion` respected?
- **A11y** — visible focus, ≥4.5:1 contrast on muted text, semantic markup, keyboard reachable?
- **Distinctive** — does it look like a generic admin template?

## Project-Specific Pitfalls

These have been observed in this repo. Audit explicitly for each.

1. **Theme tokens duplicated** between `admin.html` and `invite.html` inline `<style>`. Drift between them is normal and a P1.
2. **`applyTheme()` only runs on invite**, not admin — admin stays brown #8b6f47 regardless of preset.
3. **Settings tab theme picker exposes only 4 colors** (bg, fg, accent, muted). Fonts, radius, max-width are env-only.
4. **Hero card wraps the asset in a translucent `.card` with `backdrop-filter`** — looks correct on photos, weird on opaque PDFs.
5. **PIN error message uses `.muted` color** — low contrast for an error. Should be semantic danger color.
6. **Default tab `STATE.tab = 'assets'`** but `tabs()` forces `settings` first if list contains it — race on first paint.
7. **No live preview in Settings** — admin must save then open `/invite.html` in a new tab to see changes.
8. **Status messages everywhere are `.muted`** — no toasts, no semantic success/error styling.
9. **`requireAuth` returns 401 → admin shows PIN gate** but in-flight forms lose draft state.
10. **Asset upload always shows role + host slug** even when user has no hosts and only one role makes sense.
11. **No reveal motion / no `prefers-reduced-motion` rule** on invite.
12. **Google Fonts not loaded** — `Playfair Display` and `Inter` referenced in CSS but no `<link>` tag, so they fall back to Georgia / system-ui.

## Output

Write findings to `tasks/ux-audit.md` with this shape:

```markdown
# UX Audit — YYYY-MM-DD

## P0 — Broken paths
- [ ] [Surface] [Finding] — [Fix sketch]

## P1 — Friction
- [ ] [Surface] [Finding] — [Fix sketch]

## P2 — Polish
- [ ] [Surface] [Finding] — [Fix sketch]

## Deferred
- Items intentionally out of scope this pass
```

Then implement P0 → P1 → P2 in that order, commit per cluster, verify per CLAUDE.md ("Verification Before Done" section).

## Definition of Done

- All P0 fixed.
- ≥80% of P1 fixed.
- Feature flag matrix re-checked.
- `npm test` passes (Stop hook will catch regressions).
- Clicked through golden path on at least one preset at 1280×720 and 375×667.
- Viewport matrix verified per `ui-overhaul-workflow` step 7.

## Related

- `ui-ux-craft` — design principles to apply during fixes
- `ui-overhaul-workflow` — broader recipe this skill specializes
- `frontend-patterns` — component patterns when adding new admin UI
