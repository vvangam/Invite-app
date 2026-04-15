# Todo

- [x] P0 — Repo bootstrap
- [x] P1 — Asset upload + serve pipeline
- [x] P2 — Config-driven invite page
- [x] P3 — Guest manager + RSVP
- [x] P4 — Bulk messaging + STD
- [x] P5 — Admin utilities (CSV/JSON export, analytics, rate limit)
- [x] P6 — Deploy config
- [x] Deploy to Railway (Postgres wired)

## P7 — Settings tab (edit event content from admin)

Goal: replace env-var-only customization with a PIN-gated Settings form.

### Server
- [ ] `loadOverrides()` — read `config_overrides` → object
- [ ] `mergedConfig()` — deep-merge overrides on top of `CONFIG`
- [ ] `GET /api/config` (auth) — return merged config for admin form
- [ ] `PUT /api/config` (auth) — whitelist keys `event|events|hosts|copy|features|rsvp|theme|messaging`; upsert each
- [ ] Swap `CONFIG` → `mergedConfig()` in `/api/bootstrap` and `/api/public-invite`

### Admin UI
- [ ] Add `settings` tab
- [ ] `renderSettingsTab`: event identity form, hero copy, hosts repeater, sub-events repeater
- [ ] Save → `PUT /api/config` → reload bootstrap

### Verify
- [ ] `npm test` green
- [ ] Edit title + venue in admin → `/invite.html` reflects change without restart
- [ ] Commit + push
