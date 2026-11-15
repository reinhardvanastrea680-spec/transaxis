# Email: why it says "Supabase", and how to make it say Transaxis

The reset email in the screenshot is Supabase's **default template sent through
Supabase's own mail server**. That is where both giveaways come from:

| What you saw | Where it comes from | What fixes it |
| --- | --- | --- |
| Sender: **Supabase Auth** (`noreply@mail.app.supabase.io`) | The built-in mail server, used until you configure your own | Custom SMTP |
| Footer: *"an application powered by Supabase ⚡"* | The body of the default template | Custom template |
| *"Opt out of these emails"* | Supabase's unsubscribe footer on the built-in server | Custom SMTP |

**Both are needed.** Editing the template removes the footer but the sender
stays `noreply@mail.app.supabase.io`; configuring SMTP changes the sender but
the default body still carries the Supabase footer.

Two more reasons not to leave it on the built-in server: it is rate-limited to
a handful of messages per hour, and Supabase's own docs describe it as being
for testing, not production. A customer who requests a reset at 9am and gets
the mail at 11am assumes your product is broken.

This is project configuration, not application code — but it is five templates
plus an SMTP panel, so there is a script that pushes all of it in one request
instead of asking you to paste five bodies correctly.

---

## 1. One command

You need a Supabase **personal access token** (`sbp_…`) — account-level, not the
service role key, and never used by the app. Create one at
[supabase.com/dashboard/account/tokens](https://supabase.com/dashboard/account/tokens),
then:

```bash
# see what the project sends today (read-only)
SUPABASE_ACCESS_TOKEN=sbp_… node scripts/configure-auth-email.mjs --check

# see exactly what would be sent, without sending it
SUPABASE_ACCESS_TOKEN=sbp_… RESEND_API_KEY=re_… \
  node scripts/configure-auth-email.mjs --dry-run

# do it
SUPABASE_ACCESS_TOKEN=sbp_… RESEND_API_KEY=re_… \
  node scripts/configure-auth-email.mjs
```

`--templates-only` and `--smtp-only` narrow it. The script reads the config back
after writing and exits non-zero if anything did not stick — a `PATCH` returning
200 is not proof, and the failure that matters (SMTP silently not enabled) looks
exactly like success.

Revoke the token afterwards; the script only needs to run once.

**What `--check` cannot tell you:** `smtp_pass` comes back from the API as
ciphertext — 64 hex characters, and a different 64 on every write. That is not
a leak and not a corrupted password, so do not "fix" it by pasting the key
again; the real value is only ever known to the auth server. To prove the
credential works, send a real reset and watch the status: `POST /auth/v1/recover`
returns **500 `Error sending recovery email`** when the mailer rejects the
login, and 200 when it accepts it. Do not test the stored value by opening an
SMTP session with it — you would be authenticating with ciphertext and getting
a `535` that means nothing.

**Prerequisite:** the sending domain must already be verified at Resend, or
Supabase accepts the SMTP settings and Resend rejects every message. Check
[resend.com/domains](https://resend.com/domains) for `transaxis.com.ng`.

---

## 2. By hand, if you prefer the dashboard

**Dashboard → Authentication → Emails → SMTP Settings → Enable custom SMTP.**
(The panel moves between releases; it has also lived under
*Project Settings → Authentication*.)

### Resend — recommended

Free tier covers 3,000 emails/month and 100/day, which is far beyond auth mail
for a business this size.

1. Create an account at [resend.com](https://resend.com) and add the domain
   `transaxis.com.ng`.
2. Resend gives you DNS records (an `MX`/`TXT` for SPF and a `TXT` for DKIM).
   Add them at whoever hosts your DNS — the same place the `A` record for
   `transaxis.com.ng` lives. Wait for Resend to show **Verified**. Without this
   step Gmail will bin the mail.
3. Create an API key, then fill the Supabase panel in:

| Field | Value |
| --- | --- |
| Host | `smtp.resend.com` |
| Port | `465` |
| Username | `resend` |
| Password | your Resend API key (`re_…`) |
| Sender email | `no-reply@transaxis.com.ng` |
| Sender name | `Transaxis` |

Port `465` is implicit TLS. If your network blocks it, use `587` and set the
panel's encryption to STARTTLS.

`no-reply@` is deliberate: the template tells people to reply, so set the
address as a real alias, or keep replies working by using
`support@transaxis.com.ng` as the sender instead.

### Alternatives

Zoho Mail, Brevo, Mailgun and Postmark all work the same way. Avoid a personal
Gmail account as the SMTP sender — Google rate-limits it, rewrites the `From`
header to the account's own address, and deliverability is poor.

---

## 3. The templates

Five templates, one layout, generated from
[`scripts/build-email-templates.mjs`](../scripts/build-email-templates.mjs).
Edit the copy there and re-run it — the five files drift if they are hand-kept,
and the one that gets missed is the one a customer sees first.

| File | Supabase template | Subject |
| --- | --- | --- |
| `recovery.html` | Reset Password | `Reset your Transaxis password` |
| `confirmation.html` | Confirm signup | `Confirm your Transaxis email` |
| `magic-link.html` | Magic Link | `Your Transaxis sign-in link` |
| `email-change.html` | Change Email Address | `Confirm your new Transaxis email` |
| `invite.html` | Invite User | `You have been invited to Transaxis` |

Supabase stores the **body only** — paste everything inside `<body>`, not the
`<head>` or the leading comment. The script does that extraction for you.

Each template uses `{{ .ConfirmationURL }}`, which already carries the
`redirect_to` the app sends, so links land on `https://transaxis.com.ng/...`
rather than on a Supabase page. `email-change.html` also uses `{{ .NewEmail }}`.

Not branded yet, because Supabase sends them from the same server and they are
worth doing if you start using them: reauthentication, and the "password
changed" / "email changed" notification emails.

---

## 4. Test it before telling anyone

1. Request a reset from `https://transaxis.com.ng/forgot-password`.
2. The sender must read **Transaxis**, not Supabase Auth.
3. The footer must not mention Supabase.
4. Open the message source and confirm `SPF: pass` and `DKIM: pass`.
5. Send one to a Gmail address and one to an Outlook address — check the spam
   folder on both, not just the inbox.
6. Click the link: it must land on `/reset-password` with the form ready, not
   on "This link is no longer valid". If it fails, the `redirect_to` is not on
   the allowlist in *Authentication → URL Configuration*.
7. Set the new password, then sign in with it.
8. Sign up with a fresh address to see `confirmation.html` — the reset template
   can be perfect while signup still says Supabase.

Run `--check` again afterwards: every template should report `our version`.

## If it still says Supabase

- **Sender unchanged** — custom SMTP is not enabled, or the sender email is not
  on a domain that passed verification. Supabase silently falls back to its own
  server.
- **Mail never arrives** — DNS records are not verified yet, or the message is
  in spam because SPF/DKIM are missing. Check Resend's delivery log first; it
  tells you whether the message was accepted, delivered or bounced.
- **Link says expired** — the reset link is single-use and short-lived. Request
  a fresh one; do not reuse the URL from an older email.
