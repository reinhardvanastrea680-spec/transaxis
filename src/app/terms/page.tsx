import Link from "next/link";

export const metadata = {
  title: "Terms of Service — Transaxis",
  description: "The terms governing your use of Transaxis.",
};

export default function TermsPage() {
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
          Terms of Service
        </h1>
        <p className="mt-2 text-sm text-ink-muted">
          Last updated: 30 October 2026
        </p>
      </div>

      <div className="space-y-6 text-sm leading-7 text-ink-muted">
        <section>
          <h2 className="text-base font-semibold text-ink">1. Acceptance</h2>
          <p className="mt-2">
            By creating an account or using Transaxis, you agree to these Terms of
            Service. If you do not agree, do not use the service.
          </p>
        </section>

        <section>
          <h2 className="text-base font-semibold text-ink">2. The service</h2>
          <p className="mt-2">
            Transaxis provides a cloud-based warehouse inventory and logistics
            operating system, including inventory tracking, dispatch management,
            staff accountability, and reporting. We may update, improve, or
            discontinue features at any time.
          </p>
        </section>

        <section>
          <h2 className="text-base font-semibold text-ink">3. Accounts and organizations</h2>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            <li>
              You are responsible for maintaining the confidentiality of your
              account credentials.
            </li>
            <li>
              You are responsible for all activity that occurs under your
              organization&apos;s account.
            </li>
            <li>
              You must provide accurate information when creating an account.
            </li>
            <li>
              One person may not share credentials between multiple individuals.
            </li>
          </ul>
        </section>

        <section>
          <h2 className="text-base font-semibold text-ink">4. Acceptable use</h2>
          <p className="mt-2">You agree not to:</p>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            <li>Use the service for any unlawful purpose.</li>
            <li>Attempt to access another organization&apos;s data.</li>
            <li>Reverse-engineer, decompile, or disassemble the service.</li>
            <li>Introduce malware, spam, or harmful content.</li>
            <li>Exceed reasonable usage limits or abuse the platform.</li>
          </ul>
        </section>

        <section>
          <h2 className="text-base font-semibold text-ink">5. Data ownership</h2>
          <p className="mt-2">
            You retain ownership of all business data you enter into Transaxis.
            We claim no intellectual property rights over your inventory, staff,
            or dispatch records. You may export your data at any time.
          </p>
        </section>

        <section>
          <h2 className="text-base font-semibold text-ink">6. Billing and payments</h2>
          <p className="mt-2">
            Subscription plans are billed monthly in Nigerian Naira (₦) unless
            otherwise agreed. Prices may change with 30 days&apos; notice. Failure
            to pay may result in suspension of access after a grace period.
            Refunds are handled on a case-by-case basis.
          </p>
        </section>

        <section>
          <h2 className="text-base font-semibold text-ink">7. Service availability</h2>
          <p className="mt-2">
            We strive for high availability but do not guarantee uninterrupted
            service. Scheduled maintenance will be communicated in advance where
            possible. We are not liable for losses arising from downtime, data
            loss, or service interruptions beyond our reasonable control.
          </p>
        </section>

        <section>
          <h2 className="text-base font-semibold text-ink">8. Limitation of liability</h2>
          <p className="mt-2">
            To the maximum extent permitted by law, Transaxis is not liable for
            indirect, incidental, or consequential damages arising from your use
            of the service. Our total liability is limited to the fees you paid in
            the 12 months preceding the claim.
          </p>
        </section>

        <section>
          <h2 className="text-base font-semibold text-ink">9. Termination</h2>
          <p className="mt-2">
            You may close your account at any time. We may suspend or terminate
            accounts that violate these terms. Upon termination, your data will
            be deleted or anonymized within 30 days.
          </p>
        </section>

        <section>
          <h2 className="text-base font-semibold text-ink">10. Governing law</h2>
          <p className="mt-2">
            These terms are governed by the laws of the Federal Republic of
            Nigeria. Disputes will be resolved in the courts of Nigeria.
          </p>
        </section>

        <section>
          <h2 className="text-base font-semibold text-ink">11. Contact</h2>
          <p className="mt-2">
            For questions about these terms, contact us at{" "}
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
