"use server";

import { createClient } from "@/lib/supabase/server";
import { passwordProblem } from "@/lib/password";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Sign-up runs on the server so the password policy is actually enforced.
 *
 * The form checks the same rules before submitting, but a client-side check is
 * only a courtesy — it can be skipped by anyone calling the action directly.
 * Re-validating here is what makes the rule real for this path.
 */
export async function signUpWithPassword(email: string, password: string) {
  const cleanEmail = email.trim().toLowerCase();

  if (!cleanEmail) return { error: "Enter your email address." };
  if (!EMAIL_RE.test(cleanEmail)) {
    return { error: "That does not look like a valid email address." };
  }

  const problem = passwordProblem(password);
  if (problem) return { error: problem };

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({
    email: cleanEmail,
    password,
  });

  if (error) return { error: error.message };

  // With email confirmation enabled Supabase returns a user but no session, so
  // the browser is not signed in yet. With it disabled we already have one.
  return {
    success: true,
    needsEmailConfirmation: !data.session,
  };
}
