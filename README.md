# Invite App

An asset-first event invitation + RSVP + guest manager. Upload your pre-designed invite (PDF / JPG / PNG / MP4), and the app wraps it with a themed RSVP form, a guest manager, WhatsApp bulk send, and calendar export. Everything is driven by a single config file; every feature can be toggled on or off.

No wedding-specific content. Works for any event — birthdays, corporate, galas, conferences, reunions.

## Quick start

```bash
npm install
cp .env.example .env            # edit at least PIN
npm run dev
```

Open `http://localhost:3000/admin` and enter your PIN (default `1234`). Upload your invite, add guests, share each guest's invite link.

## Customize

Everything lives in [`config.js`](config.js):

- `event` — title, date, venue, contact info, dress code, gift registry
- `events[]` — add sub-events (or leave empty for single-event mode)
- `hosts[]` — add host sides (or leave empty — no host UI)
- `rsvp.fields.*` — toggle name / partySize / perEvent / dietary / notes
- `features.*` — turn off anything you don't need; UI collapses gracefully
- `copy.*` — rename every user-facing string
- `theme.*` — override CSS custom properties (colors, fonts, radius)

Every value is env-overridable. See [`.env.example`](.env.example).

## Deploy (Railway)

1. Add a persistent volume mounted at `/app/uploads`.
2. Set env vars: `PIN`, `DATABASE_URL`, `PUBLIC_URL`, plus any `EVENT_*` / `THEME_*` overrides.
3. Push. Healthcheck at `/api/bootstrap`.
4. If PDF uploads fail in prod, set `PDF_BACKEND=pdfjs` to use the pure-JS fallback instead of `poppler-utils`.

### Optional: email channel

Set `RESEND_API_KEY` + `RESEND_FROM_EMAIL` to unlock per-guest email send,
bulk email, auto-reminders, and admin-notify on RSVP. Step-by-step in
[docs/RESEND_SETUP.md](docs/RESEND_SETUP.md).

See [CLAUDE.md](CLAUDE.md) for architectural details.

## License

MIT
