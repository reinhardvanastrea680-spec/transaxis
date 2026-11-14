/**
 * Google sign-in hosted on our own domain.
 *
 * Why this exists: when Supabase runs the Google flow, the browser is sent to
 * Google with `redirect_uri=https://<project-ref>.supabase.co/auth/v1/callback`.
 * Google shows the host of that URI on the account chooser — which is why the
 * sheet said "to continue to jydwazheyzxnplchkyok.supabase.co" instead of our
 * own name. The only two ways to change that line are to buy Supabase's custom
 * auth domain, or to host the callback ourselves. This module is the second.
 *
 * With it, the browser goes straight to Google with
 * `redirect_uri=https://transaxis.com.ng/api/auth/google/callback`, and the
 * consent sheet names the domain the customer actually recognises.
 *
 * Supabase still issues the session: we hand it the Google ID token via
 * `signInWithIdToken`, so RLS, cookies and the middleware are untouched.
 *
 * Pure and dependency-free, so the pieces that are easy to get wrong — the
 * authorize URL, the token exchange body, state comparison — can be tested
 * without a browser or a network.
 */

export const GOOGLE_REDIRECT_PATH = "/api/auth/google/callback";

const AUTHORIZE_ENDPOINT = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";

/** `openid` is what makes Google return an ID token instead of just a code. */
export const GOOGLE_SCOPES = "openid email profile";

export type GoogleOAuthConfig = { clientId: string; clientSecret: string };

/** Cookie names for the CSRF state and the replay nonce. */
export const STATE_COOKIE = "g_oauth_state";
export const NONCE_COOKIE = "g_oauth_nonce";

/** Long enough for a slow sign-in, short enough to be useless if leaked. */
export const OAUTH_COOKIE_MAX_AGE = 600;

/**
 * Read the credentials, or null when the flow is not configured.
 *
 * Returning null is deliberate: the caller falls back to Supabase's hosted
 * flow, so deploying this before the Google console is updated cannot break
 * sign-in.
 */
export function googleOAuthConfig(
  env: Record<string, string | undefined>,
): GoogleOAuthConfig | null {
  const clientId = (env.GOOGLE_CLIENT_ID ?? "").trim();
  const clientSecret = (env.GOOGLE_CLIENT_SECRET ?? "").trim();

  if (!clientId || !clientSecret) return null;

  // A pasted project id or an OAuth *client name* is the common mistake; the
  // real value always ends this way. Better to fall back than to send the user
  // to a Google error page.
  if (!clientId.endsWith(".apps.googleusercontent.com")) return null;

  return { clientId, clientSecret };
}

/** Absolute redirect URI. Must match the Google console byte for byte. */
export function googleRedirectUri(siteUrl: string): string {
  return `${siteUrl.replace(/\/+$/, "")}${GOOGLE_REDIRECT_PATH}`;
}

/**
 * The URL that starts the flow.
 *
 * `prompt=select_account` keeps the account chooser — without it Google
 * silently reuses whichever account is signed in, which is worse for shared
 * office machines.
 */
export function buildGoogleAuthUrl(params: {
  clientId: string;
  redirectUri: string;
  state: string;
  nonce: string;
}): string {
  const url = new URL(AUTHORIZE_ENDPOINT);
  url.searchParams.set("client_id", params.clientId);
  url.searchParams.set("redirect_uri", params.redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", GOOGLE_SCOPES);
  url.searchParams.set("state", params.state);
  url.searchParams.set("nonce", params.nonce);
  url.searchParams.set("prompt", "select_account");
  return url.toString();
}

/** Body for the server-to-server code exchange. */
export function buildTokenExchangeBody(params: {
  code: string;
  clientId: string;
  clientSecret: string;
  redirectUri: string;
}): URLSearchParams {
  return new URLSearchParams({
    code: params.code,
    client_id: params.clientId,
    client_secret: params.clientSecret,
    redirect_uri: params.redirectUri,
    grant_type: "authorization_code",
  });
}

export const GOOGLE_TOKEN_ENDPOINT = TOKEN_ENDPOINT;

/**
 * Compare the state we issued with the one that came back.
 *
 * Compared in constant time and length-checked first: a timing side channel
 * here would let an attacker guess a valid state one character at a time.
 */
export function stateMatches(
  expected: string | null | undefined,
  received: string | null | undefined,
): boolean {
  if (!expected || !received) return false;
  if (expected.length !== received.length) return false;

  let diff = 0;
  for (let i = 0; i < expected.length; i += 1) {
    diff |= expected.charCodeAt(i) ^ received.charCodeAt(i);
  }
  return diff === 0;
}

/**
 * Human message for the `?error=` codes this flow can produce, so the login
 * page never shows a bare "something went wrong".
 */
export const GOOGLE_ERROR_MESSAGES: Record<string, string> = {
  google_unavailable: "Google sign-in is not configured. Use your email and password instead.",
  google_cancelled: "Google sign-in was cancelled.",
  google_state: "That sign-in link expired. Please try again.",
  google_token: "Google did not return a valid sign-in. Please try again.",
  google_signin: "Google sign-in could not be completed. Please try again.",
  auth_callback_failed: "That sign-in link is no longer valid. Please try again.",
};

export function googleErrorMessage(code: string | null | undefined): string | null {
  if (!code) return null;
  return GOOGLE_ERROR_MESSAGES[code] ?? "Sign-in failed. Please try again.";
}
