import type { Metadata } from "next";
import Link from "next/link";
import { Check, ChevronRight } from "lucide-react";
import { Reveal, RevealGroup, RevealItem } from "@/components/ui/reveal";
import { JsonLd } from "@/components/json-ld";
import { FaqSection } from "@/components/marketing/faq-section";
import { CtaBand } from "@/components/marketing/cta-band";
import {
  SITE_DESCRIPTION,
  breadcrumbSchema,
  faqPageSchema,
  pageMetadata,
} from "@/lib/seo";

const TITLE = "Inventory Management Software for Nigerian Warehouses";
const DESCRIPTION =
  "Track stock across warehouses, control dispatch to the last delivery, and see who handled what. Built for Nigerian logistics teams. 14-day free trial.";

export const metadata: Metadata = pageMetadata({
  title: TITLE,
  description: DESCRIPTION,
  path: "/inventory-software-nigeria",
});

/**
 * The FAQ lives here and is passed to both the renderer and the schema, so the
 * answer a visitor reads is byte-for-byte the answer Google indexes.
 */
const FAQ = [
  {
    q: "How much does inventory software cost in Nigeria?",
    a: "Transaxis starts at ₦35,000 a month on the Standard plan, which covers 150 dispatches, five staff accounts and two warehouses. Pro is ₦60,000 and Max is ₦85,000. Every plan starts with a 14-day trial and no card is required to begin.",
  },
  {
    q: "Can I run more than one warehouse?",
    a: "Yes. Standard covers two warehouses, Pro and Max cover more. Stock is tracked per warehouse rather than as one pooled number, so you can see that Ikeja is short of an item while the main store still has it.",
  },
  {
    q: "What happens when a driver says a delivery landed but the customer says it did not?",
    a: "That is the case the product is built around. A driver cannot mark a delivery as complete. They can only send a photo as proof, which moves the dispatch to delivered-pending. Someone in the office has to look at that photo and confirm it. Until then it is not delivered, and the dispatch does not close.",
  },
  {
    q: "Do my staff need training to use it?",
    a: "Most teams are running their first dispatch within an hour. Each role sees a deliberately small screen: a driver sees only their own assigned runs, a warehouse staff member sees stock movements, and an owner sees everything. There is a two-minute demo on the homepage showing a full transaction start to finish.",
  },
  {
    q: "Can I import the catalogue I already have?",
    a: "Yes. Products can be imported from a CSV file with SKU, name, quantity, reorder level and warehouse location, so you are not typing a catalogue in by hand. Exports are available on Pro and Max.",
  },
  {
    q: "Does it work on a phone?",
    a: "Yes. Transaxis is a web app that installs to an Android or iOS home screen and runs full-screen, which is how most warehouse and driver work actually happens. It needs a connection to save changes; it is not an offline-first app.",
  },
  {
    q: "Where is my data stored, and who can see it?",
    a: "Data is stored with row-level security, so every business is isolated at the database level rather than by a filter in the application. Passwords are never stored in plain text, all traffic is encrypted, and every sensitive action is written to an audit log.",
  },
];

const FAILURES = [
  {
    title: "The stock count is a number nobody trusts",
    body: "Two people count the same shelf and write down different figures. The discrepancy is found weeks later, by which point nobody can say which delivery caused it.",
  },
  {
    title: "Dispatch runs on WhatsApp",
    body: "A van leaves with a load, and the only record of what was on it is a message thread. Reconciling that thread at month end takes a day and still does not balance.",
  },
  {
    title: "The shortage is discovered, not prevented",
    body: "You find out an item ran out when a customer asks for it. The reorder level existed in someone's head, not anywhere a system could watch.",
  },
];

const CAPABILITIES = [
  {
    title: "Stock that reconciles",
    points: [
      "Every product carries a SKU, a quantity, a warehouse and an optional reorder level",
      "Stock movements are recorded as entries in a ledger, not by overwriting a number",
      "Low-stock and out-of-stock states are computed, so the alert cannot go stale",
      "Stocktaking compares what the system believes against what you counted",
    ],
  },
  {
    title: "Dispatch with a real chain of custody",
    points: [
      "A dispatch moves through created, assigned, in transit, delivered-pending and delivered",
      "Drivers see only their own runs and cannot close one themselves",
      "Delivery proof is a photo captured at the door",
      "The office confirms or rejects against that photo, and the decision is logged",
    ],
  },
  {
    title: "Staff accountability by default",
    points: [
      "Owner, manager, warehouse and driver roles each see a deliberately limited screen",
      "Every stock movement and status change records who did it and when",
      "Join codes let a team member into the right organisation without an invite email",
      "Removing someone's access does not erase what they already did",
    ],
  },
];

export default function InventorySoftwareNigeriaPage() {
  return (
    <>
      <JsonLd
        data={[
          breadcrumbSchema([
            { name: "Home", path: "/" },
            { name: "Inventory software for Nigeria" },
          ]),
          faqPageSchema(FAQ),
        ]}
      />

      <main className="bg-canvas text-ink">
        {/* Breadcrumb — visible, because a trail only crawlers can see is a lie */}
        <nav
          aria-label="Breadcrumb"
          className="mx-auto max-w-[1200px] px-5 pt-8 sm:px-8"
        >
          <ol className="flex items-center gap-1.5 text-xs text-ink-faint">
            <li>
              <Link href="/" className="transition-colors hover:text-ink">
                Home
              </Link>
            </li>
            <li aria-hidden="true">
              <ChevronRight size={12} />
            </li>
            <li className="text-ink-muted">Inventory software for Nigeria</li>
          </ol>
        </nav>

        <section className="mx-auto max-w-[1200px] px-5 pb-16 pt-10 sm:px-8 lg:pb-20">
          <Reveal>
            <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-brand">
              Built for Nigerian operations
            </p>
            <h1 className="mt-5 max-w-3xl text-[clamp(2.25rem,5vw,3.5rem)] font-semibold leading-[1.05] tracking-[-0.02em]">
              Inventory management software for Nigerian warehouses
            </h1>
            <p className="mt-6 max-w-2xl text-lg leading-8 text-ink-muted">
              {SITE_DESCRIPTION}
            </p>
            <p className="mt-4 max-w-2xl text-base leading-7 text-ink-muted">
              Most stock problems in Nigeria are not counting problems. They are
              record problems — the count was right, but the record of what left
              the building was not. Transaxis is built around that gap: every
              movement is attributed to a person, and no delivery closes until
              someone in the office has looked at the proof.
            </p>
          </Reveal>
        </section>

        {/* The problem */}
        <section className="border-y border-line bg-surface" aria-labelledby="problem">
          <div className="mx-auto max-w-[1200px] px-5 py-16 sm:px-8 lg:py-20">
            <Reveal>
              <h2
                id="problem"
                className="max-w-2xl text-3xl font-semibold leading-tight tracking-[-0.01em]"
              >
                What actually goes wrong in a warehouse
              </h2>
            </Reveal>
            <RevealGroup className="mt-10 grid gap-8 md:grid-cols-3">
              {FAILURES.map((item) => (
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

        {/* Capabilities */}
        <section className="mx-auto max-w-[1200px] px-5 py-16 sm:px-8 lg:py-20" aria-labelledby="capabilities">
          <Reveal>
            <h2
              id="capabilities"
              className="max-w-2xl text-3xl font-semibold leading-tight tracking-[-0.01em]"
            >
              What you get
            </h2>
          </Reveal>
          <div className="mt-10 grid gap-10 lg:grid-cols-3">
            {CAPABILITIES.map((block) => (
              <Reveal key={block.title} delay={0.05}>
                <div>
                  <h3 className="text-lg font-medium">{block.title}</h3>
                  <ul className="mt-4 space-y-3">
                    {block.points.map((point) => (
                      <li key={point} className="flex gap-2.5 text-sm leading-6 text-ink-muted">
                        <Check size={16} className="mt-0.5 shrink-0 text-brand" aria-hidden="true" />
                        <span>{point}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </Reveal>
            ))}
          </div>
        </section>

        {/* The differentiator */}
        <section className="border-y border-line bg-surface" aria-labelledby="delivery-rule">
          <div className="mx-auto max-w-[1200px] px-5 py-16 sm:px-8 lg:py-20">
            <div className="grid gap-10 lg:grid-cols-[0.85fr_1.15fr]">
              <Reveal>
                <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-brand">
                  The rule that changes reconciliation
                </p>
                <h2
                  id="delivery-rule"
                  className="mt-4 max-w-sm text-3xl font-semibold leading-tight tracking-[-0.01em]"
                >
                  A driver cannot mark a delivery as delivered.
                </h2>
              </Reveal>
              <Reveal delay={0.05}>
                <div className="space-y-4 text-sm leading-7 text-ink-muted">
                  <p>
                    In most systems the person who benefits from a delivery being
                    recorded is the same person who records it. That is a
                    structural problem, not a discipline problem, and no amount of
                    supervision fixes it.
                  </p>
                  <p>
                    Here, a driver can only send proof — a photo taken at the
                    delivery point. The dispatch becomes <em>delivered-pending</em>.
                    It becomes <em>delivered</em> only when someone in the office
                    has seen that photo and confirmed it. The server refuses the
                    transition otherwise, so it is not a policy anyone can forget
                    to follow.
                  </p>
                  <p>
                    At the end of the month, the number of confirmed deliveries and
                    the number of vans that left the yard are the same number — or
                    the difference is visible, and attributable to a named run.
                  </p>
                </div>
              </Reveal>
            </div>
          </div>
        </section>

        <FaqSection items={FAQ} heading="Inventory software questions, answered plainly" />

        <CtaBand
          heading="Start with one warehouse. Grow into the rest."
          subheading="Set up your catalogue, invite your team with a join code, and run your first dispatch the same day."
          related={{
            href: "/fmcg-distribution-software",
            label: "Inventory and dispatch software for FMCG distributors",
          }}
        />
      </main>
    </>
  );
}
