import type { Metadata } from "next";
import Link from "next/link";
import { Check, ChevronRight } from "lucide-react";
import { Reveal, RevealGroup, RevealItem } from "@/components/ui/reveal";
import { JsonLd } from "@/components/json-ld";
import { FaqSection } from "@/components/marketing/faq-section";
import { CtaBand } from "@/components/marketing/cta-band";
import { breadcrumbSchema, faqPageSchema, pageMetadata } from "@/lib/seo";

const TITLE = "Inventory & Dispatch Software for FMCG Distributors";
const DESCRIPTION =
  "Load a van, track every case to the retailer's door, and reconcile the day without a WhatsApp thread. Built for Nigerian FMCG distributors.";

export const metadata: Metadata = pageMetadata({
  title: TITLE,
  description: DESCRIPTION,
  path: "/fmcg-distribution-software",
});

const FAQ = [
  {
    q: "How many dispatches can we run a day?",
    a: "The Standard plan allows 150 dispatches a month, which suits a distributor running roughly five to seven van loads a working day. Pro and Max have no dispatch ceiling, which is what most multi-van operations move to once the first month is busy.",
  },
  {
    q: "Does it track batch numbers and expiry dates?",
    a: "Not currently. Stock is tracked by SKU, quantity, reorder level and warehouse — so you always know how much of a product you hold and where, but not which production batch a specific case came from. If batch or expiry tracking is a hard requirement for you, say so: it is the most requested addition and it changes what we build next.",
  },
  {
    q: "How are returns from retailers handled?",
    a: "A return is booked back in as a stock movement, attributed to the staff member who received it, so the quantity returns to the warehouse figure and the movement appears in the ledger. There is no separate returns approval workflow yet — returns are recorded, not routed.",
  },
  {
    q: "Can sales reps take orders in the app?",
    a: "No. Dispatches are created in the office, not captured from the field. Transaxis covers the movement of stock and the proof that it arrived; it is not an order-capture or van-sales system. Being clear about that matters more than sounding complete.",
  },
  {
    q: "Will it work on the phones our drivers actually carry?",
    a: "Yes. It is a web app that installs to an Android or iOS home screen and runs full-screen without an app store. Sending delivery proof needs a camera and a connection at the moment of delivery; the photo is what moves the dispatch forward.",
  },
  {
    q: "We run two depots. Can stock move between them?",
    a: "Yes. Stock is tracked per warehouse rather than as one pooled total, so a transfer is a movement out of one and into the other, recorded against the person who booked it. Standard covers two warehouses; Pro and Max cover more.",
  },
  {
    q: "What does it cost?",
    a: "Standard is ₦35,000 a month with 150 dispatches, five staff accounts and two warehouses. Pro is ₦60,000 and Max is ₦85,000. Quarterly and yearly billing save 10% and 20%. The trial runs 14 days and needs no card.",
  },
];

const PROBLEMS = [
  {
    title: "The load-out sheet and the day's takings never match",
    body: "A van leaves with 240 cases. At close of business the sales figure says 231 were sold. Nobody can name the nine, so the difference is written off as shortage — every week.",
  },
  {
    title: "Delivery is a claim, not a fact",
    body: "The driver says it landed. The retailer says it did not. Without evidence from the doorstep, the argument is settled by whoever is more senior, not by what happened.",
  },
  {
    title: "Fast movers run out between counts",
    body: "The products that sell fastest are the ones you notice last, because the count that would have caught them happens monthly and the shelf empties in four days.",
  },
];

const WORKFLOW = [
  {
    step: "01",
    title: "Stock is per depot, not pooled",
    body: "Every product holds a quantity, a reorder level and a warehouse. A fast mover below its reorder level shows as low stock before it reaches zero — not after a customer asks for it.",
  },
  {
    step: "02",
    title: "The office creates the run and assigns a driver",
    body: "A dispatch is created against a vehicle and a driver, and moves to assigned. The driver sees that run and nothing else — not other depots, not other drivers' loads.",
  },
  {
    step: "03",
    title: "Proof comes from the doorstep",
    body: "The driver marks the load picked up, then sends a photo at the delivery point. That moves the dispatch to delivered-pending. The driver cannot close it — that transition is office-only and the server enforces it.",
  },
  {
    step: "04",
    title: "The office confirms, and the day closes",
    body: "Someone reviews the photo and confirms. Only then is it delivered. At month end, vans out and deliveries confirmed are the same number, or the gap is attached to a named run.",
  },
];

export default function FmcgDistributionSoftwarePage() {
  return (
    <>
      <JsonLd
        data={[
          breadcrumbSchema([
            { name: "Home", path: "/" },
            { name: "FMCG distribution software" },
          ]),
          faqPageSchema(FAQ),
        ]}
      />

      <main className="bg-canvas text-ink">
        <nav aria-label="Breadcrumb" className="mx-auto max-w-[1200px] px-5 pt-8 sm:px-8">
          <ol className="flex items-center gap-1.5 text-xs text-ink-faint">
            <li>
              <Link href="/" className="transition-colors hover:text-ink">
                Home
              </Link>
            </li>
            <li aria-hidden="true">
              <ChevronRight size={12} />
            </li>
            <li className="text-ink-muted">FMCG distribution software</li>
          </ol>
        </nav>

        <section className="mx-auto max-w-[1200px] px-5 pb-16 pt-10 sm:px-8 lg:pb-20">
          <Reveal>
            <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-brand">
              For distributors of fast-moving goods
            </p>
            <h1 className="mt-5 max-w-3xl text-[clamp(2.25rem,5vw,3.5rem)] font-semibold leading-[1.05] tracking-[-0.02em]">
              Inventory and dispatch software for FMCG distributors
            </h1>
            <p className="mt-6 max-w-2xl text-lg leading-8 text-ink-muted">
              {DESCRIPTION}
            </p>
            <p className="mt-4 max-w-2xl text-base leading-7 text-ink-muted">
              Distribution margins are thin enough that the shortage is the
              business. A van that leaves with 240 cases and returns with 231 sold
              is not a rounding error — it is the difference between a good month
              and a flat one. Transaxis exists to make that gap visible on the day
              it happens rather than at month end.
            </p>
          </Reveal>
        </section>

        <section className="border-y border-line bg-surface" aria-labelledby="fmcg-problem">
          <div className="mx-auto max-w-[1200px] px-5 py-16 sm:px-8 lg:py-20">
            <Reveal>
              <h2
                id="fmcg-problem"
                className="max-w-2xl text-3xl font-semibold leading-tight tracking-[-0.01em]"
              >
                Where a distributor's margin actually leaks
              </h2>
            </Reveal>
            <RevealGroup className="mt-10 grid gap-8 md:grid-cols-3">
              {PROBLEMS.map((item) => (
                <RevealItem key={item.title}>
                  <div className="border-line md:border-l md:pl-6 md:first:border-l-0 md:first:pl-0">
                    <h3 className="text-base font-medium">{item.title}</h3>
                    <p className="mt-2 text-sm leading-7 text-ink-muted">{item.body}</p>
                  </div>
                </RevealItem>
              ))}
            </RevealGroup>
          </div>
        </section>

        <section className="mx-auto max-w-[1200px] px-5 py-16 sm:px-8 lg:py-20" aria-labelledby="fmcg-day">
          <Reveal>
            <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-brand">
              One run, start to finish
            </p>
            <h2
              id="fmcg-day"
              className="mt-4 max-w-2xl text-3xl font-semibold leading-tight tracking-[-0.01em]"
            >
              What the day looks like in the system
            </h2>
          </Reveal>

          <div className="mt-10 divide-y divide-line border-y border-line">
            {WORKFLOW.map((item) => (
              <Reveal key={item.step}>
                <div className="grid gap-4 py-7 sm:grid-cols-[auto_1fr] sm:gap-8">
                  <span className="font-mono text-sm text-brand">{item.step}</span>
                  <div>
                    <h3 className="text-base font-medium">{item.title}</h3>
                    <p className="mt-2 max-w-[70ch] text-sm leading-7 text-ink-muted">
                      {item.body}
                    </p>
                  </div>
                </div>
              </Reveal>
            ))}
          </div>
        </section>

        <section className="border-y border-line bg-surface" aria-labelledby="fmcg-fits">
          <div className="mx-auto max-w-[1200px] px-5 py-16 sm:px-8 lg:py-20">
            <Reveal>
              <h2
                id="fmcg-fits"
                className="max-w-2xl text-3xl font-semibold leading-tight tracking-[-0.01em]"
              >
                Who this is for, and who it is not
              </h2>
            </Reveal>
            <div className="mt-10 grid gap-8 md:grid-cols-2">
              <Reveal>
                <div className="rounded-card border border-line bg-canvas p-6">
                  <h3 className="text-sm font-medium text-ink">A good fit</h3>
                  <ul className="mt-4 space-y-3">
                    {[
                      "Distributors running one to several vans a day",
                      "Businesses holding stock across a depot and a main store",
                      "Operations where a delivery dispute is currently settled by argument",
                      "Teams of five to fifty across office, warehouse and driving",
                    ].map((point) => (
                      <li key={point} className="flex gap-2.5 text-sm leading-6 text-ink-muted">
                        <Check size={16} className="mt-0.5 shrink-0 text-brand" aria-hidden="true" />
                        <span>{point}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </Reveal>
              <Reveal delay={0.05}>
                <div className="rounded-card border border-line bg-canvas p-6">
                  <h3 className="text-sm font-medium text-ink">Not the right tool</h3>
                  <ul className="mt-4 space-y-3">
                    {[
                      "Batch, lot or expiry tracking — not supported yet",
                      "Van sales and field order capture — dispatches start in the office",
                      "Full accounting, invoicing or payroll",
                      "Operations that need to work with no internet at all",
                    ].map((point) => (
                      <li key={point} className="flex gap-2.5 text-sm leading-6 text-ink-muted">
                        <span aria-hidden="true" className="mt-2 size-1.5 shrink-0 rounded-full bg-ink-faint" />
                        <span>{point}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </Reveal>
            </div>
          </div>
        </section>

        <FaqSection items={FAQ} heading="Questions FMCG distributors ask" />

        <CtaBand
          heading="Find the nine cases."
          subheading="Run one van on it for a week and compare the reconciliation to how you do it now."
        />
      </main>
    </>
  );
}
