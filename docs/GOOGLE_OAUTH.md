# Google sign-in: making it say `transaxis.com.ng`

## What that line actually is

The account chooser is rendered by Google, not by Supabase and not by us. The
line **"to continue to jydwazheyzxnplchkyok.supabase.co"** is the host of the
OAuth **redirect URI** the browser sent with the request.

With Supabase's hosted flow the browser goes to
`https://<ref>.supabase.co/auth/v1/authorize`, which forwards to Google with:

```
redirect_uri = https://jydwazheyzxnplchkyok.supabase.co/auth/v1/callback
```

Google prints that host. Nothing in the Supabase dashboard, `NEXT_PUBLIC_SITE_URL`,
the redirect allowlist, or the email templates changes it — the only thing that
changes it is changing the redirect URI.

There are exactly two ways to do that.

| | Cost | What Google shows | Code |
| --- | --- | --- | --- |
| **A. Supabase custom domain** | Pro plan + custom domain add-on (~$35/mo total) | `auth.transaxis.com.ng` | none |
| **B. Host the callback yourself** | free | `transaxis.com.ng` | this repo |

B is implemented here. It also keeps the domain exactly right rather than a
subdomain.

---

## How B works

```
browser → /api/auth/google/start
        → accounts.google.com  (redirect_uri = transaxis.com.ng/api/auth/google/callback)
        → user picks an account; Google shows "to continue to transaxis.com.ng"
        → /api/auth/google/callback   (on our domain)
            ├─ checks the state cookie (CSRF)
            ├─ exchanges the code for tokens server-to-server (client secret never
            │  reaches the browser)
            └─ supabase.auth.signInWithIdToken({ provider: "google", token, nonce })
        → /dashboard
```

Supabase still issues the session, so RLS, cookies and the middleware are
unchanged. We are only moving *where Google comes back to*.

Files:

- `src/lib/google-oauth.ts` — URL building, state comparison, error messages
  (pure, covered by `npm run test:google`)
- `src/app/api/auth/google/start/route.ts`
- `src/app/api/auth/google/callback/route.ts`
- `src/app/login/page.tsx` — the button now calls the route above

**Nothing breaks before you configure it.** With `GOOGLE_CLIENT_ID` unset, the
start route falls back to `signInWithOAuth` and behaves exactly as it does
today — Supabase URL and all. Deploying first and configuring second is safe.

---

## Setup, in order

### 1. Google Cloud Console

[console.cloud.google.com](https://console.cloud.google.com) → APIs & Services →
Credentials → your **OAuth 2.0 Client ID** (the one already in Supabase).

- **Authorized redirect URIs** → add:

  ```
  https://transaxis.com.ng/api/auth/google/callback
  ```

  Keep the existing `https://<ref>.supabase.co/auth/v1/callback` entry — the
  fallback flow still uses it, and so does anything else pointed at Supabase.

- **Authorized JavaScript origins** → `https://transaxis.com.ng`

- **OAuth consent screen** → *App name* = `Transaxis`, *Authorized domains* =
  `transaxis.com.ng`. The app name is the bold line at the top of the sheet;
  the domain is the line underneath. Both should be yours.

### 2. Vercel environment variables

The same client ID and secret that are already in Supabase. Server-side only —
`GOOGLE_CLIENT_SECRET` must never be prefixed `NEXT_PUBLIC_`.

```bash
vercel env add GOOGLE_CLIENT_ID production --value "…apps.googleusercontent.com" -y --force
vercel env add GOOGLE_CLIENT_SECRET production --value "…" -y --force
vercel --prod --yes
```

On Windows, keep `MSYS_NO_PATHCONV=1` in front if the value starts with `/`.

### 3. Leave the Supabase provider enabled

Authentication → Providers → Google must stay on with the **same client ID**.
`signInWithIdToken` validates that the token was issued for that audience, so a
mismatch fails with `google_signin`.

No change is needed to the Redirect URLs allowlist for this flow — the browser
never returns to Supabase.

---

## Verifying it worked

1. Sign out, then **Continue with Google**.
2. The account chooser must read **"to continue to transaxis.com.ng"**.
3. After picking an account you land on `/dashboard` and are signed in.
4. The browser URL bar never shows `supabase.co`.

Quick check without signing in — the redirect target is visible before Google
is involved:

```bash
curl -sI https://transaxis.com.ng/api/auth/google/start | grep -i location
```

Configured, the `Location` header points at `accounts.google.com` and the
`redirect_uri` inside it contains `transaxis.com.ng`. Unconfigured, it points at
`<ref>.supabase.co/auth/v1/authorize` — that is the fallback, working as designed.

## If it goes wrong

| Symptom | Cause |
| --- | --- |
| Still shows the Supabase URL | `GOOGLE_CLIENT_ID` not set on that environment, or the deploy predates it. Check the `curl` above. |
| Google: *redirect_uri_mismatch* | The URI in Google Cloud differs from `https://transaxis.com.ng/api/auth/google/callback`. Trailing slash counts. |
| Back on `/login` with "link expired" | State cookie missing — usually a different browser, or more than 10 minutes between starting and finishing. |
| Back on `/login` with "could not be completed" | Client ID in Vercel does not match the one in Supabase. |
| Works in production, fails on a preview URL | `NEXT_PUBLIC_SITE_URL` is the production domain, so the callback goes there. Add the preview redirect URI to Google Cloud if you want previews to work. |

## Rolling back

Unset `GOOGLE_CLIENT_ID` and redeploy. The start route falls back to the
Supabase-hosted flow automatically; no code change needed.
