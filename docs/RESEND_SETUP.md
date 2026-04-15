# Resend + Railway: email channel setup

The Invite App sends email through [Resend](https://resend.com). When both
`RESEND_API_KEY` and `RESEND_FROM_EMAIL` are set, the server flips
`features.emailChannel` to `true` in `/api/bootstrap`, which unlocks:

- Per-guest **Email** button in the guest list (desktop + mobile)
- **Email** button in the add-guest post-submit panel
- **Send email** bulk action with a live progress bar
- Scheduled **auto-reminders** to pending guests (Phase 5c)
- Admin **notify-on-RSVP** email to `event.contactEmail` (Phase 5d)

If either env var is missing, all of the above is hidden — the app falls
back cleanly to WhatsApp / Copy-link.

---

## 1. Resend side

### 1.1 Create an API key

1. Sign up or log in at <https://resend.com>.
2. Dashboard → **API Keys** → **Create API Key**.
3. Name: `invite-app-prod` (or similar). Permission: **Full access** or
   **Sending access** — either works.
4. **Copy the key now** — it starts with `re_…` and is only shown once.

### 1.2 Verify a sender domain

You need a domain Resend trusts so `RESEND_FROM_EMAIL` can be
`anything@yourdomain.com`.

1. Dashboard → **Domains** → **Add Domain**.
2. Enter your domain (e.g. `yourwedding.com`). Region: pick the nearest.
3. Resend shows **3 DNS records** (SPF, DKIM, return-path). At your DNS
   provider (Cloudflare, Namecheap, Route 53, GoDaddy, etc.) add each
   record exactly as shown — name, type, value.
4. Back in Resend, click **Verify**. Propagation is usually under 5 minutes
   but can take up to an hour.
5. Once the domain shows **Verified**, any `@yourdomain.com` address works
   as `RESEND_FROM_EMAIL`.

> **Quick-test shortcut:** Skip the domain setup and use
> `onboarding@resend.dev` as `RESEND_FROM_EMAIL`. This works immediately
> but will **only deliver to the email address you signed up to Resend
> with** — good for one smoke test, useless for real guests.

### 1.3 Pick the from address

Any of these formats work — Resend parses the RFC-5322 display-name syntax:

- `invites@yourwedding.com`
- `rsvp@yourwedding.com`
- `Varsha & Partner <rsvp@yourwedding.com>`

---

## 2. Railway side

### 2.1 Add the variables

1. Open <https://railway.app/dashboard> → your project.
2. Click the **service** (the one running `node server.js`), not the
   project tile.
3. Tab: **Variables**.
4. Click **+ New Variable** twice, one per row:

   | Key                 | Value                                   |
   |---------------------|-----------------------------------------|
   | `RESEND_API_KEY`    | `re_…` (the key from step 1.1)          |
   | `RESEND_FROM_EMAIL` | `invites@yourwedding.com` (or Name<>)   |

5. Save. Railway auto-redeploys on variable change — wait for the
   service status to return to **Active** / green.

### 2.2 Optional but recommended

Set `PUBLIC_URL` to your Railway-assigned domain (or a custom domain you
have pointing at the service) so invite links in outbound emails render
as `https://yourwedding.com/i/<token>` instead of the raw container
hostname.

| Key          | Example                             |
|--------------|-------------------------------------|
| `PUBLIC_URL` | `https://yourwedding.com`           |

---

## 3. Verify

### 3.1 Server-level check

Hit the unauthenticated bootstrap endpoint:

```
https://<yourapp>.up.railway.app/api/bootstrap
```

You should see:

```json
{
  "ok": true,
  "features": {
    ...
    "emailChannel": true
  }
}
```

If `emailChannel` is still `false`, either:
- One of the env vars is blank / misspelled (check Variables tab exactly)
- Railway hasn't finished redeploying yet (check Deployments tab)

### 3.2 UI check

Open **/admin**, sign in with your `PIN`:

1. **Add Guest** with an email address — after submit, the green panel
   should show a **Email** button next to Copy link / WhatsApp.
2. **Guests** tab — the action column on each row with an email address
   should now include an **Email** button.
3. Select 2+ guests → the bulk bar grows a **Send email** button.
4. **Settings → Messaging → Automation** — the "Email channel not
   configured" warning should be gone. The **Auto-reminders** and
   **Email me on every new RSVP** toggles now work when saved.

### 3.3 Send test

Use the per-guest **Email** button on a row that has *your own* email
address. Watch the Railway logs (Deployments → Logs) — on success you
will see:

```
[reminders] sending ... (if auto-reminders scheduled)
```

On failure you'll see the Resend error code. Common ones:

| Error                          | Fix                                                |
|--------------------------------|----------------------------------------------------|
| `Resend error 403: ...domain`  | `RESEND_FROM_EMAIL` domain isn't verified yet.     |
| `Resend error 401: ...api key` | `RESEND_API_KEY` wrong / revoked / not set.        |
| `Resend error 422: ...`        | Malformed from address — check the `Name <...>` quoting. |

---

## 4. Operating notes

- **Rate limit:** Resend free tier = 100/day, 3 000/month. The bulk
  sender paces itself one-at-a-time, so a batch of 80 invites stays
  under burst limits but will count 80 against your daily cap.
- **Reply-To:** Admin-notify emails set Reply-To to the guest's email
  so you can respond in one click.
- **Auto-reminders:** Off by default. Enable in Settings → Messaging →
  Automation. Runs every 6 hours once the deadline is within the
  largest window (default 14 days).
- **Changing from-address:** Update `RESEND_FROM_EMAIL`; the service
  auto-redeploys; `emailChannelEnabled()` is re-evaluated on every
  request, no restart needed.
- **Disabling email:** Remove either env var. The UI re-hides all email
  buttons within a few seconds of the next bootstrap call.

---

## 5. Under the hood

- No SDK — `sendEmailViaResend()` in [`server.js`](../server.js) is a
  plain `fetch` POST to `https://api.resend.com/emails`.
- Template rendering is shared between WhatsApp and email via
  `renderTemplate()`. Body tokens: `{{name}}`, `{{eventTitle}}`,
  `{{eventDate}}`, `{{inviteUrl}}`, `{{rsvpDeadline}}`.
- Email subject has its own pair of keys: `messaging.emailInviteSubject`
  and `messaging.emailReminderSubject`. Same token set.
- All Phase 5 flags (`emailChannel`, `autoReminders`,
  `adminNotifications`) are gated server-side. Flipping them in the
  admin UI without the env in place is a no-op.
