export const runtime = "edge";

import { createClient } from "@/lib/supabase/server";
import { getSiteUrl } from "@/lib/supabase/site-url";
import { NextResponse } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";

/**
 * `next` arrives from the URL, so it must not be able to send the user off-site.
 * Only same-origin absolute paths are allowed — note that "//evil.com" is a
 * protocol-relative URL, which is why the second check exists.
 */
function safeNext(raw: string | null): string {
  if (!raw) return "/dashboard";
  if (!raw.startsWith("/") || raw.startsWith("//")) return "/dashboard";
  return raw;
}

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const tokenHash = searchParams.get("token_hash");
  const otpType = searchParams.get("type");
  const next = safeNext(searchParams.get("next"));

  // Prefer the canonical site URL. If Google/Supabase redirected the browser
  // here via the Supabase domain, `origin` would be the Supabase URL and we
  // would bounce the user back to Supabase instead of the app.
  const base = getSiteUrl() ?? origin;

  const supabase = await createClient();

  /**
   * A verified recovery lands on the reset page carrying `recovered=1`.
   *
   * That marker is the only thing that lets /reset-password show its form. A
   * session alone is not proof of anything: a phone already signed in as one
   * account would otherwise be offered the reset form for that account, even
   * though the email was addressed to someone else — and the user would then
   * change the wrong password believing they had fixed the other one.
   */
  const target =
    next === "/reset-password" ? "/reset-password?recovered=1" : next;

  // Password-recovery emails are delivered as a token hash rather than a PKCE
  // code, and this form works even when the link is opened in a different
  // browser from the one that requested it.
  if (tokenHash && otpType) {
    const { error } = await supabase.auth.verifyOtp({
      type: otpType as EmailOtpType,
      token_hash: tokenHash,
    });
    if (!error) return NextResponse.redirect(`${base}${target}`);
  }

  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(`${base}${target}`);
  }

  // A failed recovery exchange should land on the reset page, which explains
  // what happened and offers a new link — not on a generic login error.
  const failure =
    next === "/reset-password" ? "/reset-password" : "/login?error=auth_callback_failed";

  return NextResponse.redirect(`${base}${failure}`);
}
