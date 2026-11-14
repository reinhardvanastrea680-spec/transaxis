import Link from "next/link";
import { CookieSettingsLink } from "@/components/cookie-consent";
import { supabaseAuthCookieName } from "@/lib/consent";

export const metadata = {
  title: "Cookie Policy — Transaxis",
  description:
    "The cookies Transaxis sets, why they are needed, and how to change your choice.",
};

export default function CookiesPage() {
  const authCookie =
    supabaseAuthCookieName(process.env.NEXT_PUBLIC_SUPABASE_URL) ??
    "sb-<project-ref>-auth-token";

  return (
    <main className="mx-auto max-w-[800px] px-5 py-12 sm:px-8 lg:py-16">
      <div className="mb-8">
        <Link
          href="/"
          className="text-sm font-medium text-brand transition-colors hover:text-brand-hover"
        >
          ← Back to home
        </Link>
        <h1 className="mt-4 text-3xl font-semibold tracking-[-0.02em] text-ink">
          Cookie Policy
        </h1>
        <p className="mt-2 text-sm text-ink-muted">Last updated: 14 November 2026</p>
      </div>

      <div className="space-y-6 text-sm leading-7 text-ink-muted">
        <section>
          <h2 className="text-base font-semibold text-ink">1. The short version</h2>
          <p className="mt-2">
            Transaxis sets cookies that are strictly necessary to sign you in and
            keep your session secure. That is all. We do not use advertising
            cookies, we do not run third-party trackers, and we do not sell your
            data.
          </p>
        </section>

        <section>
          <h2 className="text-base font-semibold text-ink">2. Cookies we set</h2>
          <div className="mt-3 overflow-x-auto rounded-control border border-line">
            <table className="w-full min-w-[560px] border-collapse text-left text-xs">
              <thead className="bg-sunken">
                <tr className="text-ink">
                  <th className="px-3 py-2.5 font-medium">Name</th>
                  <th className="px-3 py-2.5 font-medium">Purpose</th>
                  <th className="px-3 py-2.5 font-medium">Type</th>
                  <th className="px-3 py-2.5 font-medium">Lifetime</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                <tr className="align-top">
                  <td className="px-3 py-3 font-mono text-[11px] text-ink">
                    {authCookie}
                  </td>
                  <td className="px-3 py-3">
                    Your signed-in session. Without it you would be logged out on
                    every page load.
                  </td>
                  <td className="px-3 py-3">Essential</td>
                  <td className="px-3 py-3">Until you sign out or the session expires</td>
                </tr>
                <tr className="align-top">
                  <td className="px-3 py-3 font-mono text-[11px] text-ink">
                    {authCookie}-code-verifier
                  </td>
                  <td className="px-3 py-3">
                    A short-lived security check used while completing sign-in and
                    password recovery.
                  </td>
                  <td className="px-3 py-3">Essential</td>
                  <td className="px-3 py-3">Minutes</td>
                </tr>
                <tr className="align-top">
                  <td className="px-3 py-3 font-mono text-[11px] text-ink">tx_consent</td>
                  <td className="px-3 py-3">
                    Remembers the choice you made in the cookie banner so we do not
                    ask again.
                  </td>
                  <td className="px-3 py-3">Preference</td>
                  <td className="px-3 py-3">180 days</td>
                </tr>
              </tbody>
            </table>
          </div>
          <p className="mt-3 text-xs leading-6 text-ink-faint">
            Longer sessions may be split across several cookies with the same
            name and a numeric suffix (for example <code>{authCookie}.0</code>).
            They hold the same data and serve the same purpose.
          </p>
        </section>

        <section>
          <h2 className="text-base font-semibold text-ink">3. What we do not use</h2>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            <li>No advertising or retargeting cookies.</li>
            <li>No third-party analytics or session recording.</li>
            <li>No social media pixels.</li>
            <li>No cross-site tracking of any kind.</li>
          </ul>
          <p className="mt-2">
            The only analytics control in the banner exists so that, if we ever add
            usage measurement, it stays off unless you explicitly turn it on.
          </p>
        </section>

        <section>
          <h2 className="text-base font-semibold text-ink">4. Your local storage</h2>
          <p className="mt-2">
            Your light or dark theme preference is saved in your browser&apos;s local
            storage, not in a cookie. It never leaves your device and is not used to
            identify you.
          </p>
        </section>

        <section>
          <h2 className="text-base font-semibold text-ink">5. Changing your choice</h2>
          <p className="mt-2">
            You can review or withdraw your consent at any time. Withdrawing it will
            not sign you out, because the sign-in cookies are essential rather than
            optional.
          </p>
          <div className="mt-3">
            <CookieSettingsLink className="inline-flex h-9 items-center rounded-control border border-line-strong bg-surface px-3.5 text-sm font-medium text-ink transition-colors hover:bg-sunken">
              Open cookie settings
            </CookieSettingsLink>
          </div>
        </section>

        <section>
          <h2 className="text-base font-semibold text-ink">6. More information</h2>
          <p className="mt-2">
            How we handle personal data more broadly is described in our{" "}
            <Link href="/privacy" className="font-medium text-brand hover:underline">
              Privacy Policy
            </Link>
            . Questions can go to{" "}
            <a
              href="mailto:privacy@transaxis.com.ng"
              className="font-medium text-brand hover:underline"
            >
              privacy@transaxis.com.ng
            </a>
            .
          </p>
        </section>
      </div>
    </main>
  );
}
