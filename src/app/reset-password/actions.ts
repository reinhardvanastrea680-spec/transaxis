"use server";

import { createClient } from "@/lib/supabase/server";
import { passwordProblem } from "@/lib/password";

/**
 * Sets a new password for the currently authenticated user.
 *
 * This runs on the server for two reasons: the policy has to be enforced
 * somewhere a client cannot skip, and the session that the recovery link
 * established must be verified before anything is written.
 */
export async function updatePassword(newPassword: string) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  // No session means the link was already used, has expired, or was opened in a
  // different browser than the one that requested it.
  if (!user) {
    return {
      error:
        "Your reset link has expired or is not valid in this browser. Request a new one.",
    };
  }

  const problem = passwordProblem(newPassword);
  if (problem) return { error: problem };

  const { error } = await supabase.auth.updateUser({ password: newPassword });

  if (error) {
    const message = /different from the old|same password/i.test(error.message)
      ? "Choose a password you have not used before."
      : error.message;
    return { error: message };
  }

  // A password change is usually a response to losing control of the account,
  // so any session that was opened with the old password should stop working.
  // The current session is kept so the user is not thrown back to the login
  // screen immediately after resetting.
  try {
    await supabase.auth.signOut({ scope: "others" });
  } catch {
    // Not fatal — the password is already changed.
  }

  return { success: true };
}
