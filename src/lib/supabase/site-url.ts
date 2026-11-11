/**
 * Canonical application URL resolution.
 *
 * OAuth flows need a stable, absolute redirect URL. Deriving it from
 * `window.location.origin` alone is fragile: it breaks behind proxies, on
 * preview deployments, and when the browser is on a non-canonical host.
 *
 * Priority:
 *   1. NEXT_PUBLIC_SITE_URL  — explicit override (set this on Vercel)
 *   2. VERCEL_URL            — the deployment's own canonical URL
 *   3. window.location.origin — last-resort client-side fallback
 */

export const OAUTH_CALLBACK_PATH = "/auth/callback";

/** Strip any trailing slash so we can safely concatenate paths. */
function normalize(url: string): string {
  return url.replace(/\/+$/, "");
}

/**
 * The app's canonical origin (no trailing slash), or null when it cannot be
 * determined server-side.
 */
export function getSiteUrl(): string | null {
  const explicit = process.env.NEXT_PUBLIC_SITE_URL;
  if (explicit && explicit.trim()) return normalize(explicit.trim());

  const vercelUrl = process.env.VERCEL_URL;
  if (vercelUrl && vercelUrl.trim()) {
    return normalize(`https://${vercelUrl.trim()}`);
  }

  return null;
}

/**
 * Absolute URL to the OAuth callback route, suitable for Supabase's
 * `redirectTo` option.
 *
 * @param fallbackOrigin Optional origin to use when no env var is configured
 *                       (typically `window.location.origin`).
 */
export function getOAuthCallbackUrl(fallbackOrigin?: string): string {
  const base = getSiteUrl() ?? (fallbackOrigin ? normalize(fallbackOrigin) : "");
  return `${base}${OAUTH_CALLBACK_PATH}`;
}

/**
 * The URL a freshly signed-in user should land on after OAuth completes.
 */
export function getPostAuthRedirect(fallbackOrigin?: string): string {
  const base = getSiteUrl() ?? (fallbackOrigin ? normalize(fallbackOrigin) : "");
  return `${base}/dashboard`;
}
