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
/reset-password         no session  → RecoveryLinkHandler reads #access_token
   ↓                    has session → new password form
updatePassword()        re-validates, updateUser({ password }),
   ↓                    signOut({ scope: "others" })
/dashboard
```

### Details that matter

- **No account enumeration.** `/forgot-password` returns the same success screen
  whether or not the address is registered. Supabase does not disclose it
  either, and surfacing the difference would turn the form into an oracle.
- **Three token deliveries are handled**, because Supabase uses more than one:
  - `token_hash` + `type` — query string, read by `/auth/callback` via `verifyOtp`.
  - `code` — PKCE, read by `/auth/callback` via `exchangeCodeForSession`.
  - `#access_token` + `refresh_token` — **implicit flow, in the URL fragment.**
    Browsers never send fragments to a server, so no route handler can see it.
    `RecoveryLinkHandler` (a client component on `/reset-password`) reads it,
    calls `setSession()`, strips the tokens from the address bar, and refreshes
    so the server component re-renders as signed in.
  Without the third case, an implicit-flow link lands on `/reset-password` with
  no session and is reported as expired — a dead end that looks like a bug to
  the user. The fragment survives the `/auth/callback` → `/reset-password`
  redirect because the `Location` header carries no fragment of its own, so
  per RFC 9110 the browser inherits the original one.
- **`next` is sanitised.** `safeNext()` rejects anything that is not a
  same-origin absolute path, including protocol-relative `//evil.com`.
- **Other sessions are killed** after a reset, because a reset is usually a
  response to losing control of the account.
- **A failed exchange lands on `/reset-password`**, not on a generic login
  error, so the user is told what happened and offered a new link.

## Prerequisites (Supabase dashboard)

These are not in the repo and will silently break recovery if unset:

1. **Site URL** → Authentication → URL Configuration → Site URL
   `https://transaxis.com.ng`
2. **Redirect URLs** allowlist must include **all** of these:
   ```
   https://transaxis.com.ng/**
   https://www.transaxis.com.ng/**
   https://transaxis.vercel.app/**
   http://localhost:3000/**
   ```
   If a URL is missing, `redirectTo` is silently ignored and the email link
   falls back to the Site URL — so a recovery requested from one host can land
   on another, or on localhost, which looks like a broken link.
   The `vercel.app` and `localhost` entries keep preview deployments and local
   development working; the two custom-domain entries are what real users hit.
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
