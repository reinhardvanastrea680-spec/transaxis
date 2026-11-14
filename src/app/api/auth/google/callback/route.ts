export const runtime = "edge";

import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getSiteUrl } from "@/lib/supabase/site-url";
import {
  GOOGLE_TOKEN_ENDPOINT,
  NONCE_COOKIE,
  STATE_COOKIE,
  buildTokenExchangeBody,
  googleOAuthConfig,
  googleRedirectUri,
  stateMatches,
} from "@/lib/google-oauth";

/**
 * Google sends the browser here — on our domain, which is the whole point.
 *
 * The code is exchanged server-to-server (the client secret never reaches the
 * browser), then handed to Supabase as an ID token so it issues the same
 * session it would have issued from its own callback.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const base = getSiteUrl() ?? origin;

  const fail = (reason: string) => {
    const response = NextResponse.redirect(`${base}/login?error=${reason}`);
    response.cookies.delete(STATE_COOKIE);
    response.cookies.delete(NONCE_COOKIE);
    return response;
  };

  const config = googleOAuthConfig(process.env);
  if (!config) return fail("google_unavailable");

  // Google reports a refusal as `error=access_denied` with no code at all.
  if (searchParams.get("error")) return fail("google_cancelled");

  const code = searchParams.get("code");
  const state = searchParams.get("state");
  const expectedState = request.cookies.get(STATE_COOKIE)?.value ?? null;
  const nonce = request.cookies.get(NONCE_COOKIE)?.value ?? null;

  if (!code) return fail("google_cancelled");
  if (!stateMatches(expectedState, state)) return fail("google_state");
  if (!nonce) return fail("google_state");

  const tokenResponse = await fetch(GOOGLE_TOKEN_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: buildTokenExchangeBody({
      code,
      clientId: config.clientId,
      clientSecret: config.clientSecret,
      redirectUri: googleRedirectUri(base),
    }),
  });

  const token = (await tokenResponse.json().catch(() => null)) as
    | { id_token?: string }
    | null;

  if (!token?.id_token) return fail("google_token");

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithIdToken({
    provider: "google",
    token: token.id_token,
    nonce,
  });

  if (error) return fail("google_signin");

  const response = NextResponse.redirect(`${base}/dashboard`);
  response.cookies.delete(STATE_COOKIE);
  response.cookies.delete(NONCE_COOKIE);
  return response;
}
