export const runtime = "edge";

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getOAuthCallbackUrl, getSiteUrl } from "@/lib/supabase/site-url";
import {
  NONCE_COOKIE,
  OAUTH_COOKIE_MAX_AGE,
  STATE_COOKIE,
  buildGoogleAuthUrl,
  googleOAuthConfig,
  googleRedirectUri,
} from "@/lib/google-oauth";

/**
 * Starts Google sign-in on our own domain.
 *
 * Configured  -> Google's consent sheet names transaxis.com.ng, because the
 *                redirect URI is ours.
 * Not configured -> falls back to Supabase's hosted flow, so deploying this
 *                ahead of the Google console change cannot break sign-in.
 */
export async function GET(request: Request) {
  const { origin } = new URL(request.url);
  const base = getSiteUrl() ?? origin;
  const config = googleOAuthConfig(process.env);

  if (!config) {
    const supabase = await createClient();
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: getOAuthCallbackUrl(origin),
        scopes: "email profile",
        skipBrowserRedirect: true,
      },
    });

    if (error || !data?.url) {
      return NextResponse.redirect(`${base}/login?error=google_unavailable`);
    }
    return NextResponse.redirect(data.url);
  }

  const state = crypto.randomUUID();
  const nonce = crypto.randomUUID();

  const response = NextResponse.redirect(
    buildGoogleAuthUrl({
      clientId: config.clientId,
      redirectUri: googleRedirectUri(base),
      state,
      nonce,
    }),
  );

  const options = {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: base.startsWith("https://"),
    path: "/",
    maxAge: OAUTH_COOKIE_MAX_AGE,
  };
  response.cookies.set(STATE_COOKIE, state, options);
  response.cookies.set(NONCE_COOKIE, nonce, options);

  return response;
}
