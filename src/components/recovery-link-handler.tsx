"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { KeyRound } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

/**
 * Recovers a session from an implicit-flow fragment.
 *
 * Supabase can deliver a recovery link two ways:
 *
 *   ?code=...        PKCE. Server-readable, handled by /auth/callback.
 *   #access_token=…  Implicit. A URL **fragment**, which browsers never send to
 *                    a server — so the callback route cannot see it and the
 *                    page would wrongly report "link no longer valid".
 *
 * This runs in the browser, exchanges the fragment for a cookie-backed session,
 * then refreshes so the server component re-renders as signed in. Without it,
 * any recovery link delivered in implicit mode dead-ends.
 */
export function RecoveryLinkHandler() {
  const router = useRouter();
  const [verifying, setVerifying] = useState(false);

  useEffect(() => {
    const raw = window.location.hash.replace(/^#/, "");
    if (!raw) return;

    const params = new URLSearchParams(raw);
    const accessToken = params.get("access_token");
    const refreshToken = params.get("refresh_token");
    if (!accessToken || !refreshToken) return;

    // A recovery link must not be used to sign in as an arbitrary session type.
    const type = params.get("type");
    if (type && type !== "recovery") return;

    setVerifying(true);

    let cancelled = false;
    const supabase = createClient();

    supabase.auth
      .setSession({ access_token: accessToken, refresh_token: refreshToken })
      .then(({ error }) => {
        if (cancelled) return;

        if (error) {
          // Leave the fragment alone: the page's own "expired link" message is
          // the right thing to show, and it explains what to do next.
          setVerifying(false);
          return;
        }

        // Strip the tokens from the address bar so they do not linger in
        // history or get copied into a support message.
        window.history.replaceState(null, "", window.location.pathname);
        router.refresh();
      });

    return () => {
      cancelled = true;
    };
  }, [router]);

  if (!verifying) return null;

  // Covers the server-rendered "link no longer valid" panel until the session
  // is established, so the user does not see a wrong error flash past.
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-canvas/95 px-5 backdrop-blur-sm"
      role="status"
      aria-live="polite"
    >
      <div className="flex flex-col items-center gap-3 text-center">
        <span className="flex size-11 items-center justify-center rounded-control bg-brand-soft text-brand">
          <KeyRound size={20} strokeWidth={1.75} aria-hidden="true" />
        </span>
        <p className="text-sm font-medium text-ink">Verifying your reset link…</p>
        <p className="text-xs text-ink-muted">This only takes a moment.</p>
      </div>
    </div>
  );
}
