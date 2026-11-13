import Link from "next/link";
import { ArrowRight, Boxes, ChevronRight, Package, Truck, Users } from "lucide-react";
import { Reveal, RevealGroup, RevealItem } from "@/components/ui/reveal";
import { Button } from "@/components/ui/button";
import AnimatedBrand from "@/components/animated-brand";

const stats = [
  { label: "Products", value: "1,284", delta: "+8.4% this month" },
  { label: "Low stock", value: "12", delta: "Needs review", warn: true },
  { label: "Open dispatches", value: "48", delta: "14 in transit" },
  { label: "Staff members", value: "26", delta: "+3 this month" },
];

const movements = [
  {
    sku: "SKU-1048",
    name: "Maltina 330ml",
    warehouse: "Lagos Central",
    quantity: "240",
    status: "In stock",
  },
  {
    sku: "SKU-2187",
    name: "Premium Rice 5kg",
    warehouse: "Ikeja North",
    quantity: "18",
    status: "Low stock",
    warn: true,
  },
  {
    sku: "SKU-0931",
    name: "Cooking Oil 1L",
    warehouse: "Lagos Central",
    quantity: "96",
    status: "In stock",
  },
];

const steps = [
  {
    number: "01",
    title: "Set up your operation",
    body: "Add warehouses, products, vehicles, and the people who keep them moving.",
  },
  {
    number: "02",
    title: "Run the day",
    body: "Keep inventory and dispatches current from one focused operations view.",
  },
  {
    number: "03",
    title: "See what changed",
    body: "Spot exceptions early with a shared, up-to-date picture of the work.",
  },
];

export default function LandingPage() {
  return (
    <main className="min-h-screen bg-canvas text-ink">
      {/* Hero — Decide surface: left-aligned, asymmetric, no centered stack. */}
      <section
        id="top"
        className="mx-auto grid max-w-[1200px] items-center gap-14 px-5 pb-20 pt-20 sm:px-8 lg:grid-cols-[0.9fr_1.1fr] lg:gap-16 lg:pb-28 lg:pt-28"
      >
        <div className="max-w-2xl">
          <Reveal>
            <div className="mb-6">
              <AnimatedBrand />
            </div>
          </Reveal>
          <Reveal delay={0.05}>
            <p className="mb-5 text-[11px] font-medium uppercase tracking-[0.08em] text-brand">
              Operations, accounted for
            </p>
          </Reveal>
          <Reveal delay={0.05}>
            <h1 className="max-w-xl text-[clamp(2.75rem,6vw,4rem)] font-semibold leading-none tracking-[-0.02em]">
              Your warehouse. Your inventory. Your control.
            </h1>
          </Reveal>
          <Reveal delay={0.1}>
            <p className="mt-6 max-w-lg text-lg leading-8 text-ink-muted">
              One intelligent operating system for managing warehouse inventory,
              dispatch operations and employee accountability. Know exactly what
              enters your warehouse, what leaves, what remains, who handled every
              transaction, and where every dispatch is going.
            </p>
          </Reveal>
          <Reveal delay={0.15}>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link href="/login">
                <Button size="lg">
                  Start free trial
                  <ArrowRight size={16} aria-hidden="true" />
                </Button>
              </Link>
              <Link href="/login?mode=signup">
                <Button variant="outline" size="lg">
                  Request a free demo
                </Button>
              </Link>
              <a href="#demo">
                <Button variant="ghost" size="lg">
                  Watch a 2-minute demo
                </Button>
              </a>
            </div>
          </Reveal>
        </div>

        {/* Live product panel — the hero visual. */}
        <Reveal delay={0.2} y={16}>
          <div
            id="product"
            className="rounded-card border border-line bg-surface p-3 ring-1 ring-black/[0.02] sm:p-5"
            aria-label="Transaxis product preview"
          >
            <div className="flex items-center justify-between border-b border-line px-2 pb-4">
              <div>
                <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-ink-faint">
                  Overview
                </p>
                <p className="mt-1 text-lg font-medium tracking-[-0.01em]">
                  Warehouse health
                </p>
              </div>
              <span className="inline-flex items-center gap-1.5 rounded-full bg-brand-soft px-2.5 py-1 text-xs font-medium text-brand-ink">
                <span className="size-1.5 rounded-full bg-brand" />
                Sample workspace
              </span>
            </div>

            <div className="grid grid-cols-2 gap-2 py-4 sm:grid-cols-4 sm:gap-3">
              {stats.map((stat) => (
                <div
                  key={stat.label}
                  className={`rounded-control border p-3 ${
                    stat.warn
                      ? "border-warn/30 bg-warn-soft"
                      : "border-line bg-sunken/50"
                  }`}
                >
                  <p className="text-[10px] font-medium uppercase tracking-[0.08em] text-ink-muted">
                    {stat.label}
                  </p>
                  <p className="mt-2 text-2xl font-semibold tabular tracking-[-0.01em]">
                    {stat.value}
                  </p>
                  <p
                    className={`mt-1 text-[11px] ${
                      stat.warn ? "text-warn" : "text-ink-faint"
                    }`}
                  >
                    {stat.delta}
                  </p>
                </div>
              ))}
            </div>

            <div className="overflow-hidden rounded-control border border-line">
              <div className="grid grid-cols-[1.1fr_1fr_0.7fr_0.6fr] gap-3 bg-sunken px-3 py-2.5 text-[10px] font-medium uppercase tracking-[0.08em] text-ink-faint">
                <span>Product</span>
                <span>Warehouse</span>
                <span className="text-right">On hand</span>
                <span className="text-right">Status</span>
              </div>
              {movements.map((item) => (
                <div
                  key={item.sku}
                  className="grid grid-cols-[1.1fr_1fr_0.7fr_0.6fr] items-center gap-3 border-t border-line px-3 py-3 text-xs"
                >
                  <div>
                    <p className="font-medium">{item.name}</p>
                    <p className="mt-0.5 font-mono text-[10px] text-ink-faint">
                      {item.sku}
                    </p>
                  </div>
                  <span className="truncate text-ink-muted">{item.warehouse}</span>
                  <span className="text-right font-mono tabular">
                    {item.quantity}
                  </span>
                  <span
                    className={`text-right text-[10px] font-medium ${
                      item.warn ? "text-warn" : "text-brand"
                    }`}
                  >
                    {item.status}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </Reveal>
      </section>

      {/* Capability band — inline sections, not an equal-weight tile grid. */}
      <section
        className="border-y border-line bg-surface"
        aria-label="Product capabilities"
      >
        <RevealGroup className="mx-auto grid max-w-[1200px] gap-0 px-5 sm:px-8 md:grid-cols-3">
          <RevealItem>
            <Capability
              icon={<Package size={17} />}
              id="inventory"
              title="Inventory"
              text="Know what is on hand, what is moving, and what needs a reorder before it becomes a problem."
            />
          </RevealItem>
          <RevealItem>
            <Capability
              icon={<Truck size={17} />}
              id="dispatch"
              title="Dispatch"
              text="Coordinate every delivery from assignment to proof of delivery without chasing updates."
            />
          </RevealItem>
          <RevealItem>
            <Capability
              icon={<Users size={17} />}
              id="staff"
              title="Staff"
              text="Give each teammate the right view and keep accountability clear across every role."
            />
          </RevealItem>
        </RevealGroup>
      </section>

      {/* Workflow — 3 numbered steps joined by a rule. */}
      <section
        id="workflow"
        className="mx-auto max-w-[1200px] px-5 py-20 sm:px-8 lg:py-24"
      >
        <div className="grid gap-12 lg:grid-cols-[0.8fr_1.2fr]">
          <Reveal>
            <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-brand">
              One clear workflow
            </p>
            <h2 className="mt-4 max-w-sm text-3xl font-semibold leading-tight tracking-[-0.01em]">
              Move from stockroom to doorstep with less friction.
            </h2>
          </Reveal>
          <RevealGroup className="grid gap-0 sm:grid-cols-3" stagger={0.08}>
            {steps.map((step, index) => (
              <RevealItem key={step.number}>
                <div
                  className={`border-line py-5 sm:px-6 sm:py-0 ${
                    index > 0 ? "border-t sm:border-l sm:border-t-0" : ""
                  }`}
                >
                  <span className="font-mono text-sm text-brand">
                    {step.number}
                  </span>
                  <h3 className="mt-8 text-base font-medium">{step.title}</h3>
                  <p className="mt-2 text-sm leading-6 text-ink-muted">
                    {step.body}
                  </p>
                </div>
              </RevealItem>
            ))}
          </RevealGroup>
        </div>
      </section>

      {/* Demo section */}
      <section
        id="demo"
        className="border-y border-line bg-surface"
        aria-label="Product demonstration"
      >
        <div className="mx-auto max-w-[1200px] px-5 py-16 sm:px-8 lg:py-20">
          <Reveal className="max-w-2xl">
            <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-brand">
              See it in action
            </p>
            <h2 className="mt-4 text-3xl font-semibold leading-tight tracking-[-0.01em] text-ink">
              A complete transaction, from receiving stock to proof of delivery.
            </h2>
            <p className="mt-3 text-sm leading-6 text-ink-muted">
              Watch how a warehouse team receives goods, records a stock
              movement, creates a dispatch, assigns a driver, and confirms
              delivery — in under two minutes.
            </p>
          </Reveal>
          <Reveal delay={0.1} className="mt-8">
            <div className="flex aspect-video w-full items-center justify-center rounded-card border border-line bg-sunken">
              <div className="text-center">
                <span className="flex size-14 items-center justify-center rounded-full bg-brand text-white mx-auto">
                  <svg viewBox="0 0 24 24" className="size-6" fill="currentColor" aria-hidden="true">
                    <path d="M8 5v14l11-7z" />
                  </svg>
                </span>
                <p className="mt-4 text-sm font-medium text-ink-muted">
                  2-minute product demo — coming soon
                </p>
              </div>
            </div>
          </Reveal>
        </div>
      </section>

      {/* Trust section */}
      <section
        id="trust"
        className="mx-auto max-w-[1200px] px-5 py-16 sm:px-8 lg:py-20"
        aria-label="Trust and contact"
      >
        <Reveal className="max-w-2xl">
          <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-brand">
            Built for Nigerian businesses
          </p>
          <h2 className="mt-4 text-3xl font-semibold leading-tight tracking-[-0.01em] text-ink">
            Reliable, accountable, and supported.
          </h2>
        </Reveal>
        <RevealGroup className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          <RevealItem>
            <div className="rounded-card border border-line bg-surface p-6 ring-1 ring-black/[0.02]">
              <h3 className="text-sm font-medium text-ink">Contact us</h3>
              <p className="mt-2 text-sm text-ink-muted">
                Questions before you start? Reach our team.
              </p>
              <ul className="mt-4 space-y-1.5 text-sm text-ink-muted">
                <li>Email: <a className="text-brand hover:underline" href="mailto:transaxis6.ng@gmail.com">transaxis6.ng@gmail.com</a></li>
                <li>Phone: +234 800 000 0000</li>
                <li>Hours: Mon–Fri, 8am–6pm WAT</li>
              </ul>
            </div>
          </RevealItem>
          <RevealItem>
            <div className="rounded-card border border-line bg-surface p-6 ring-1 ring-black/[0.02]">
              <h3 className="text-sm font-medium text-ink">Your data is protected</h3>
              <p className="mt-2 text-sm text-ink-muted">
                Every business has isolated data. Passwords are never stored in
                plain text. All sensitive operations are logged. Database backups
                run automatically.
              </p>
            </div>
          </RevealItem>
          <RevealItem>
            <div className="rounded-card border border-line bg-surface p-6 ring-1 ring-black/[0.02]">
              <h3 className="text-sm font-medium text-ink">Clear onboarding</h3>
              <p className="mt-2 text-sm text-ink-muted">
                Sign up, create your organization, invite your team with a join
                code, and start tracking stock in minutes.
              </p>
              <div className="mt-4 flex flex-wrap gap-3 text-xs">
                <Link href="/privacy" className="font-medium text-brand hover:text-brand-hover">
                  Privacy policy
                </Link>
                <Link href="/terms" className="font-medium text-brand hover:text-brand-hover">
                  Terms of service
                </Link>
              </div>
            </div>
          </RevealItem>
        </RevealGroup>
      </section>

      {/* Dark CTA band — bg-band is always dark in both themes, so text stays legible */}
      <section id="get-started" className="bg-band text-white">
        <div className="mx-auto flex max-w-[1200px] flex-col items-start justify-between gap-8 px-5 py-16 sm:px-8 md:flex-row md:items-center">
          <div>
            <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-emerald-300">
              Built for the workday
            </p>
            <h2 className="mt-3 max-w-xl text-3xl font-semibold tracking-[-0.01em] text-white">
              Make every movement visible.
            </h2>
            <p className="mt-3 max-w-lg text-sm leading-6 text-stone-300">
              Start with a clear operational system your whole team can trust.
            </p>
          </div>
          <div className="flex shrink-0 flex-wrap gap-2">
            <Link href="/login?mode=signup">
              <Button size="lg" variant="bandPrimary">
                Start a free trial
                <ArrowRight size={16} aria-hidden="true" />
              </Button>
            </Link>
            <Link href="#demo">
              <Button size="lg" variant="bandOutline">
                Request a free demonstration
              </Button>
            </Link>
            <a href="mailto:transaxis6.ng@gmail.com?subject=Transaxis%20enquiry">
              <Button size="lg" variant="bandGhost">
                Contact sales
              </Button>
            </a>
          </div>
        </div>
      </section>

      {/* Trust & contact */}
      <section className="border-t border-line bg-surface">
        <div className="mx-auto grid max-w-[1200px] gap-10 px-5 py-14 sm:px-8 md:grid-cols-3">
          <div>
            <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-brand">Trust & support</p>
            <h2 className="mt-2 text-xl font-semibold tracking-[-0.02em] text-ink">Built for Nigerian warehouses.</h2>
            <p className="mt-2 text-sm leading-6 text-ink-muted">
              Your data is isolated per business, passwords are never stored in plain text,
              and every stock movement is recorded in an immutable ledger.
            </p>
          </div>
          <div>
            <p className="text-sm font-medium text-ink">Contact</p>
            <ul className="mt-3 space-y-1.5 text-sm text-ink-muted">
              <li>Support: <a className="text-brand hover:underline" href="mailto:transaxis6.ng@gmail.com">transaxis6.ng@gmail.com</a></li>
              <li>Sales: <a className="text-brand hover:underline" href="mailto:transaxis6.ng@gmail.com?subject=Transaxis%20sales%20enquiry">transaxis6.ng@gmail.com</a></li>
              <li>Phone: +234 (0) 000 000 0000</li>
              <li>Location: Abuja, Nigeria</li>
            </ul>
          </div>
          <div>
            <p className="text-sm font-medium text-ink">Legal</p>
            <ul className="mt-3 space-y-1.5 text-sm text-ink-muted">
              <li><Link className="text-brand hover:underline" href="/privacy">Privacy policy</Link></li>
              <li><Link className="text-brand hover:underline" href="/terms">Terms of service</Link></li>
              <li><a className="text-brand hover:underline" href="#demo">Watch a 2-minute demo</a></li>
            </ul>
          </div>
        </div>
      </section>

      <footer className="border-t border-line bg-surface">
        <div className="mx-auto flex max-w-[1200px] flex-col gap-5 px-5 py-7 text-xs text-ink-muted sm:px-8 md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-2 font-medium text-ink">
            <span className="flex size-6 items-center justify-center rounded bg-brand text-white">
              <Boxes size={13} aria-hidden="true" />
            </span>
            Transaxis
          </div>
          <p>© 2026 Transaxis. Built for logistics teams.</p>
          <div className="flex gap-5">
            <span>Privacy</span>
            <span>Terms</span>
            <span>Contact</span>
          </div>
        </div>
      </footer>
    </main>
  );
}

function Capability({
  icon,
  id,
  title,
  text,
}: {
  icon: React.ReactNode;
  id: string;
  title: string;
  text: string;
}) {
  return (
    <div
      id={id}
      className="border-line py-8 md:border-r md:px-7 md:first:pl-0 md:last:border-r-0 md:last:pr-0"
    >
      <div className="flex items-center gap-2 text-brand">
        <span aria-hidden="true">{icon}</span>
        <h2 className="text-sm font-medium text-ink">{title}</h2>
      </div>
      <p className="mt-3 max-w-sm text-sm leading-6 text-ink-muted">{text}</p>
      <a
        href="#get-started"
        className="mt-4 inline-flex items-center gap-1 text-xs font-medium text-brand transition-colors hover:text-brand-hover"
      >
        Explore {title.toLowerCase()}
        <ChevronRight size={14} aria-hidden="true" />
      </a>
    </div>
  );
}
