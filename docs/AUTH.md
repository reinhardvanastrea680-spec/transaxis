# Authentication: password policy and recovery

## Password policy

Rules live in **`src/lib/password.ts`** and nowhere else:

| Rule | Constant |
|---|---|
| At least 8 characters | `PASSWORD_MIN_LENGTH` |
| At least one lowercase letter | — |
| At least one uppercase letter | — |
| At least one number | — |
| At least one special character | — |
| At most 72 characters | `PASSWORD_MAX_LENGTH` |

Lowercase **is** required, and the reason is Supabase rather than preference.
Supabase's password policy offers only three presets: none, *letters and digits*,
and *lowercase, uppercase letters, digits and symbols*. There is no
"uppercase + digits + symbols without lowercase" option. If the app were looser
than the selected preset, a password could show all-green checks and then be
rejected by the auth server — a dead end for the user. The app therefore matches
the strongest preset exactly.

The 72-character ceiling exists because bcrypt silently ignores everything past
72 bytes — without it, two different long passwords could be the same password.

### Where it is enforced

| Surface | How |
|---|---|
| Sign-up form | `passwordProblem()` blocks submit; the checklist renders from `passwordChecks()` |
| Sign-up server action | `signUpWithPassword` re-validates before calling `auth.signUp` |
| Reset form | Same checklist, plus a match check |
| Reset server action | `updatePassword` re-validates |

The client check is a courtesy — it gives an instant, specific reason. The
server action is what actually holds, because it cannot be skipped.

### ⚠️ The real boundary is in Supabase

A password policy enforced in application code only covers the paths this app
owns. Anyone calling the Supabase auth API directly bypasses it entirely.

For hard enforcement, also set the project policy:

> Supabase Dashboard → **Authentication → Sign In / Providers → Email**
> - Minimum password length: **8**
> - Password requirements: **Lowercase, uppercase letters, digits and symbols**

These must agree with `src/lib/password.ts`. If Supabase is stricter than the
app, users see a server error on a form that showed every rule as satisfied. If
Supabase is looser, the app simply blocks first — which is safe, but leaves the
server allowing weaker passwords for anyone bypassing the UI.

## Recovery flow

```
/login  →  "Forgot password?"
   ↓
/forgot-password        requestPasswordReset(email)
   ↓                    supabase.auth.resetPasswordForEmail(...)
   ↓                    redirectTo = {origin}/auth/callback?next=/reset-password
email link
   ↓
/auth/callback          verifyOtp(token_hash)  or  exchangeCodeForSession(code)
   ↓                    → sets a recovery session, redirects to next
/reset-password         no session  → "This link is no longer valid"
   ↓                    has session → new password form
updatePassword()        re-validates, updateUser({ password }),
   ↓                    signOut({ scope: "others" })
/dashboard
```

### Details that matter

- **No account enumeration.** `/forgot-password` returns the same success screen
  whether or not the address is registered. Supabase does not disclose it
  either, and surfacing the difference would turn the form into an oracle.
- **Both token forms are handled.** `token_hash` + `type` (what recovery emails
  send) and `code` (PKCE, used by OAuth). The token-hash path also works when
  the link is opened in a different browser from the one that requested it.
- **`next` is sanitised.** `safeNext()` rejects anything that is not a
  same-origin absolute path, including protocol-relative `//evil.com`.
- **Other sessions are killed** after a reset, because a reset is usually a
  response to losing control of the account.
- **A failed exchange lands on `/reset-password`**, not on a generic login
  error, so the user is told what happened and offered a new link.

## Prerequisites (Supabase dashboard)

These are not in the repo and will silently break recovery if unset:

1. **Site URL** → Authentication → URL Configuration → Site URL
   `https://transaxis.vercel.app`
2. **Redirect URLs** allowlist must include
   `https://transaxis.vercel.app/auth/callback`
   If it is missing, `redirectTo` is ignored and the email link falls back to
   the Site URL.
3. **Email delivery** — Supabase's built-in SMTP is rate-limited and intended
   for testing. Configure custom SMTP before relying on this in production.
4. The recovery email template must use `{{ .ConfirmationURL }}` (the default).
   It already points at `/auth/v1/verify`, which is what the `token_hash` branch
   of the callback expects.

## Known trade-off

`/reset-password` doubles as "change password" for any signed-in user, and it
does not ask for the current password. Supabase's `updateUser({ password })`
does not require it, and requiring it would defeat the recovery flow. The
practical risk is limited to someone with an already-open session on a shared
machine.
