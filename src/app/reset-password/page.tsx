export const runtime = "edge";

import Link from "next/link";
import { KeyRound } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { RecoveryLinkHandler } from "@/components/recovery-link-handler";
import ResetPasswordForm from "./reset-password-form";

export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ recovered?: string }>;
}) {
  if (!isSupabaseConfigured()) {
    return (
      <main className="mx-auto max-w-[1200px] px-5 py-12 sm:px-8">
        <div className="rounded-card border border-warn/30 bg-warn-soft p-8">
          <h1 className="text-xl font-semibold text-ink">Setup required</h1>
          <p className="mt-2 text-sm text-ink-muted">
            Supabase is not configured yet.
          </p>
        </div>
      </main>
    );
  }

  const { recovered } = await searchParams;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  /**
   * `recovered=1` is set by /auth/callback only after it has actually exchanged
   * a recovery token, so it is the one thing that proves this visit came from
   * the email.
   *
   * Being signed in proves nothing. Before this check, opening a reset link on
   * a phone already logged in as another account showed that account's reset
   * form — and the password that got changed was the wrong person's.
   */
  const fromRecoveryLink = recovered === "1";

  // No session means the recovery token was not exchanged: the link is expired,
  // already used, or was opened in a different browser from the one that
  // requested it. Say so plainly and point at the way out.
  if (!user || !fromRecoveryLink) {
    return (
      <main className="flex min-h-[calc(100vh-4rem)] items-center justify-center px-5 py-12 sm:px-6">
        {/* Implicit-flow links arrive as a fragment, which the server cannot
            read. This upgrades them to a session before the panel is trusted. */}
        <RecoveryLinkHandler />
        <div className="w-full max-w-md">
          <div className="rounded-card border border-line bg-surface p-6 text-center shadow-sm ring-1 ring-black/[0.02] sm:p-8">
            <span className="mx-auto flex size-11 items-center justify-center rounded-control bg-warn-soft text-warn">
              <KeyRound size={20} strokeWidth={1.75} aria-hidden="true" />
            </span>
            <h1 className="mt-5 text-xl font-semibold tracking-[-0.01em] text-ink">
              This link is no longer valid
            </h1>
            <p className="mt-2 text-sm text-ink-muted">
              Reset links expire quickly and can only be used once. They also
              have to be opened in the same browser that requested them.
              {user ? (
                <>
                  {" "}
                  You are signed in as{" "}
                  <span className="font-medium text-ink">{user.email}</span>,
                  which is not the account this link was sent to — sign out
                  first, then open the link again.
                </>
              ) : null}
            </p>
            <Link
              href="/forgot-password"
              className="mt-6 inline-flex h-11 w-full items-center justify-center rounded-control bg-brand px-5 text-sm font-medium text-white transition-colors hover:bg-brand-hover"
            >
              Request a new link
            </Link>
            <Link
              href="/login"
              className="mt-3 inline-block text-sm font-medium text-brand transition-colors hover:text-brand-hover"
            >
              Back to sign in
            </Link>
          </div>
        </div>
      </main>
    );
  }

  return (
    <>
      <RecoveryLinkHandler />
      <ResetPasswordForm email={user.email ?? "your account"} />
    </>
  );
}
