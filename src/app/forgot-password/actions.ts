"use server";

import { headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { getSiteUrl } from "@/lib/supabase/site-url";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Absolute origin for the recovery link. `getSiteUrl()` is the canonical answer,
 * but it returns null when neither NEXT_PUBLIC_SITE_URL nor VERCEL_URL is set
 * (local dev without an .env). Falling back to the request headers keeps the
 * link usable there instead of producing a relative URL Supabase rejects.
 */
async function requestOrigin(): Promise<string> {
  const site = getSiteUrl();
  if (site) return site;

  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host");
  const proto = h.get("x-forwarded-proto") ?? "http";
  return host ? `${proto}://${host}` : "";
}

export async function requestPasswordReset(email: string) {
  const cleanEmail = email.trim().toLowerCase();

  if (!cleanEmail) return { error: "Enter your email address." };
  if (!EMAIL_RE.test(cleanEmail)) {
    return { error: "That does not look like a valid email address." };
  }

  const origin = await requestOrigin();
  if (!origin) {
    return {
      error:
        "This app is not configured with a public URL, so a reset link cannot be generated.",
    };
  }

  const supabase = await createClient();

  // The callback exchanges the token and drops the user on the reset form.
  const { error } = await supabase.auth.resetPasswordForEmail(cleanEmail, {
    redirectTo: `${origin}/auth/callback?next=/reset-password`,
  });

  if (error) {
    // Supabase does not disclose whether an address exists, so a generic
    // failure here is almost always rate limiting or a mail configuration
    // problem. Either way the user needs to know it did not send.
    const message = /rate limit|too many/i.test(error.message)
      ? "Too many reset emails requested. Wait a few minutes and try again."
      : "We could not send the reset email just now. Please try again shortly.";
    return { error: message };
  }

  // Deliberately identical whether or not the address is registered — telling
  // the difference would turn this form into an account-enumeration oracle.
  return { success: true };
}
