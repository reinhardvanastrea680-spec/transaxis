import Link from "next/link";

export const metadata = {
  title: "Privacy Policy — Transaxis",
  description: "How Transaxis collects, uses, and protects your data.",
};

export default function PrivacyPage() {
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
          Privacy Policy
        </h1>
        <p className="mt-2 text-sm text-ink-muted">
          Last updated: 30 October 2026
        </p>
      </div>

      <div className="space-y-6 text-sm leading-7 text-ink-muted">
        <section>
          <h2 className="text-base font-semibold text-ink">1. Who we are</h2>
          <p className="mt-2">
            Transaxis (&quot;we&quot;, &quot;us&quot;, &quot;our&quot;) provides a cloud-based
            warehouse inventory and logistics operating system for Nigerian
            distributors and wholesalers. This policy explains how we collect,
            use, store, and protect your personal and business data.
          </p>
        </section>

        <section>
          <h2 className="text-base font-semibold text-ink">2. Data we collect</h2>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            <li>Account details: name, email address, password (hashed).</li>
            <li>
              Business data: organization name, warehouse locations, products,
              SKUs, stock movements, dispatches, vehicles, and staff records.
            </li>
            <li>Usage data: login timestamps, actions performed, audit logs.</li>
            <li>Device data: browser type, IP address, and basic device info.</li>
          </ul>
        </section>

        <section>
          <h2 className="text-base font-semibold text-ink">3. How we use your data</h2>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            <li>To provide and operate the Transaxis service.</li>
            <li>To authenticate users and enforce role-based permissions.</li>
            <li>To maintain an audit trail of stock and dispatch transactions.</li>
            <li>To send transactional emails (account, password reset, invites).</li>
            <li>To improve the product and fix bugs.</li>
          </ul>
          <p className="mt-2">
            We do not sell your data to third parties. We do not use your
            business data for advertising.
          </p>
        </section>

        <section>
          <h2 className="text-base font-semibold text-ink">4. Data isolation</h2>
          <p className="mt-2">
            Each organization&apos;s data is isolated at the database level using
            row-level security. Employees can only access the data and functions
            permitted by their assigned role. One business cannot view another
            business&apos;s inventory, staff, or dispatches.
          </p>
        </section>

        <section>
          <h2 className="text-base font-semibold text-ink">5. Data storage and security</h2>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            <li>Data is stored in a managed PostgreSQL database (Supabase).</li>
            <li>Passwords are hashed and never stored in plain text.</li>
            <li>All traffic is encrypted in transit (HTTPS/TLS).</li>
            <li>Database backups run automatically and are restorable.</li>
            <li>Access to production systems is restricted and logged.</li>
          </ul>
        </section>

        <section>
          <h2 className="text-base font-semibold text-ink">6. Data retention</h2>
          <p className="mt-2">
            We retain your data for as long as your account is active. If you
            close your account, we will delete or anonymize your data within 30
            days, except where retention is required by law or for audit
            purposes.
          </p>
        </section>

        <section>
          <h2 className="text-base font-semibold text-ink">7. Your rights</h2>
          <p className="mt-2">
            You may request access to, correction of, or deletion of your
            personal data at any time by contacting transaxis6.ng@gmail.com. You may
            also export your inventory and dispatch records from within the
            application.
          </p>
        </section>

        <section>
          <h2 className="text-base font-semibold text-ink">8. Cookies</h2>
          <p className="mt-2">
            Transaxis uses essential cookies for authentication and session
            management only. We do not use tracking or advertising cookies.
          </p>
        </section>

        <section>
          <h2 className="text-base font-semibold text-ink">9. Changes to this policy</h2>
          <p className="mt-2">
            We may update this policy from time to time. We will notify you of
            material changes by email or in-app notice. Continued use of the
            service constitutes acceptance of the updated policy.
          </p>
        </section>

        <section>
          <h2 className="text-base font-semibold text-ink">10. Contact</h2>
          <p className="mt-2">
            For privacy questions or requests, contact us at{" "}
            <a
              href="mailto:transaxis6.ng@gmail.com"
              className="font-medium text-brand hover:text-brand-hover"
            >
              transaxis6.ng@gmail.com
            </a>
            .
          </p>
        </section>
      </div>
    </main>
  );
}
