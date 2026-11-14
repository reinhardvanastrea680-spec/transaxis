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

Nothing in this repository changes. This is all project configuration.

---

## 1. Point Supabase at a real mail server

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

## 2. Replace the template

**Dashboard → Authentication → Emails → Templates → Reset Password.**

Subject:

```
Reset your Transaxis password
```

Body: paste everything inside `<body>` from
[`supabase/templates/recovery.html`](../supabase/templates/recovery.html).
The `<head>` and the leading comment are for whoever maintains the file;
Supabase stores the body only.

That template keeps the one dynamic value that matters,
`{{ .ConfirmationURL }}`. It already contains the `redirect_to` the app sends,
so the link still lands on `https://transaxis.com.ng/reset-password`.

Do the same for the other user-facing templates while you are in there, or the
first signup email will undo the work:

| Template | Subject | Note |
| --- | --- | --- |
| Confirm signup | `Confirm your Transaxis email` | Swap the heading and the button label |
| Magic link | `Your Transaxis sign-in link` | Same layout |
| Change email address | `Confirm your new Transaxis email` | Same layout |
| Invite user | `You have been invited to Transaxis` | Same layout |

Copy `recovery.html`, change the `<h1>`, the paragraph and the button text.
Keep the footer and the plain-text fallback link.

---

## 3. Test it before telling anyone

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

## If it still says Supabase

- **Sender unchanged** — custom SMTP is not enabled, or the sender email is not
  on a domain that passed verification. Supabase silently falls back to its own
  server.
- **Mail never arrives** — DNS records are not verified yet, or the message is
  in spam because SPF/DKIM are missing. Check Resend's delivery log first; it
  tells you whether the message was accepted, delivered or bounced.
- **Link says expired** — the reset link is single-use and short-lived. Request
  a fresh one; do not reuse the URL from an older email.
