export const runtime = "edge";

import { redirect } from "next/navigation";
import Link from "next/link";
import {
  Boxes,
  ChevronRight,
  ClipboardCheck,
  ClipboardList,
  Download,
  Package,
  Truck,
  Users,
} from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { getOrgEntitlements } from "@/lib/billing-server";
import { can, ROLE_LABELS } from "@/lib/permissions";
import { getStockStatus } from "@/lib/stock-status";
import { CountUp } from "@/components/ui/count-up";
import { Badge } from "@/components/ui/badge";
import { Reveal, RevealGroup, RevealItem } from "@/components/ui/reveal";

export default async function DashboardPage() {
  if (!isSupabaseConfigured()) {
    return (
      <main className="mx-auto max-w-[1200px] overflow-x-hidden px-5 py-12 sm:px-8">
        <div className="rounded-card border border-warn/30 bg-warn-soft p-8">
          <h1 className="text-xl font-semibold text-ink">Setup required</h1>
          <p className="mt-2 text-sm text-ink-muted">
            Supabase is not configured yet.
          </p>
        </div>
      </main>
    );
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("org_id, role")
    .eq("id", user.id)
    .maybeSingle();

  if (!profile?.org_id) redirect("/onboarding");

  const role = profile.role;
  const orgId = profile.org_id;

  // Drivers work from the dispatch screen. The dashboard is office data —
  // stock levels, team size, every open order — and is not theirs to see.
  if (role === "driver") redirect("/dispatch");

  const { billing } = await getOrgEntitlements(supabase, orgId);

  // ---- Live stats ----
  const [productsRes, stockRes, dispatchesRes, staffRes] = await Promise.all([
    supabase.from("products").select("id, name, sku, reorder_level", { count: "exact" }),
    supabase.from("product_stock").select("product_id, quantity_on_hand"),
    supabase.from("dispatches").select("id, status, customer_name, assigned_to"),
    supabase.from("profiles").select("id", { count: "exact" }).eq("org_id", orgId),
  ]);

  const products = productsRes.data ?? [];
  const stockMap: Record<string, number> = {};
  for (const row of stockRes.data ?? []) {
    stockMap[row.product_id] = row.quantity_on_hand;
  }

  const stockAttentionItems = products
    .map((p: any) => {
      const onHand = stockMap[p.id] ?? 0;
      const info = getStockStatus(onHand, p.reorder_level ?? 0);
      return {
        id: p.id,
        name: p.name,
        sku: p.sku,
        onHand,
        reorderLevel: p.reorder_level ?? 0,
        status: info.status,
        label: info.label,
        tone: info.tone,
      };
    })
    .filter((p) => p.status === "out_of_stock" || p.status === "low_stock")
    .slice(0, 6);

  const outOfStockCount = stockAttentionItems.filter((p) => p.status === "out_of_stock").length;
  const lowStockCount = stockAttentionItems.filter((p) => p.status === "low_stock").length;

  const dispatches = dispatchesRes.data ?? [];
  // A run awaiting confirmation has been driven but not closed, so it is still
  // open work — counting it as done here would hide it from the owner.
  const openDispatches = dispatches.filter((d: any) =>
    ["created", "assigned", "in_transit", "delivered_pending"].includes(d.status),
  ).length;
  const inTransit = dispatches.filter((d: any) => d.status === "in_transit").length;
  const awaitingConfirmation = dispatches.filter(
    (d: any) => d.status === "delivered_pending",
  ).length;

  const unassignedDispatches = dispatches
    .filter((d: any) => !d.assigned_to && d.status === "created")
    .map((d: any) => ({
      id: d.id,
      customerName: d.customer_name ?? "Unnamed customer",
      createdAt: d.created_at,
    }))
    .slice(0, 6);

  const staffCount = staffRes.count ?? 0;

  // ---- Module nav (role-gated) ----
  const allModules = [
    {
      name: "Inventory",
      href: "/inventory",
      icon: <Package size={17} strokeWidth={1.75} aria-hidden="true" />,
      description: "Stock levels, movements, and adjustments across every warehouse.",
    },
    {
      name: "Stocktaking",
      href: "/stocktaking",
      icon: <ClipboardCheck size={17} strokeWidth={1.75} aria-hidden="true" />,
      description: "Physical counts, variances, and adjustment history.",
    },
    {
      name: "Reports",
      href: "/reports",
      icon: <Download size={17} strokeWidth={1.75} aria-hidden="true" />,
      description: "Export inventory, movements, and dispatches to CSV.",
    },
    {
      name: "Dispatch",
      href: "/dispatch",
      icon: <Truck size={17} strokeWidth={1.75} aria-hidden="true" />,
      description: "Orders, assignment, status, and proof of delivery.",
    },
    {
      name: "Staff",
      href: "/staff",
      icon: <Users size={17} strokeWidth={1.75} aria-hidden="true" />,
      description: "Accounts, roles, and the audit trail.",
    },
  ];
  const visibleModules = allModules.filter((m) =>
    m.name === "Staff" ? can(role, "staff.view") : true,
  );

  const greeting =
    new Date().getHours() < 12
      ? "Good morning"
      : new Date().getHours() < 18
        ? "Good afternoon"
        : "Good evening";

  return (
    <main className="mx-auto max-w-[1200px] overflow-x-hidden px-5 py-8 sm:px-8 lg:py-10">
      {/* Header — MONITOR surface: no hero, no feature tiles */}
      <Reveal className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-[-0.02em] text-ink">
            {greeting}
          </h1>
          <div className="mt-1.5 flex flex-wrap items-center gap-2">
            <span className="text-sm text-ink-muted">{user.email}</span>
            <Badge tone={role === "driver" ? "info" : "brand"}>
              {ROLE_LABELS[role] ?? role}
            </Badge>
          </div>
        </div>
        <p className="text-sm text-ink-muted">
          {new Date().toLocaleDateString("en-NG", {
            weekday: "long",
            year: "numeric",
            month: "long",
            day: "numeric",
          })}
        </p>
      </Reveal>

      {/* Demo countdown / expired prompt — only once it is close enough to matter */}
      {role === "owner" || role === "admin" ? (
        billing.trialExpired ? (
          <Reveal delay={0.05} className="mt-6">
            <Link
              href="/billing"
              className="flex flex-wrap items-center justify-between gap-3 rounded-card border border-warn/40 bg-warn-soft px-5 py-4 transition-colors hover:bg-warn-soft/70"
            >
              <div>
                <p className="text-sm font-medium text-warn">
                  Your free demo has ended
                </p>
                <p className="mt-0.5 text-sm text-warn/90">
                  Pick Standard, Pro or Max to keep your full limits — or carry on
                  on the free plan. Nothing has been deleted.
                </p>
              </div>
              <span className="text-sm font-medium text-warn">Choose a plan →</span>
            </Link>
          </Reveal>
        ) : billing.isTrial && billing.trialDaysLeft <= 7 ? (
          <Reveal delay={0.05} className="mt-6">
            <Link
              href="/billing"
              className="flex flex-wrap items-center justify-between gap-3 rounded-card border border-brand/30 bg-brand-soft px-5 py-4 transition-colors hover:bg-brand-soft/70"
            >
              <div>
                <p className="text-sm font-medium text-brand-ink">
                  {billing.trialDaysLeft === 0
                    ? "Your free demo ends today"
                    : `${billing.trialDaysLeft} day${billing.trialDaysLeft === 1 ? "" : "s"} left in your free demo of Standard`}
                </p>
                <p className="mt-0.5 text-sm text-brand-ink/80">
                  When it ends you keep working on the free plan automatically —
                  nothing is deleted.
                </p>
              </div>
              <span className="text-sm font-medium text-brand-ink">See plans →</span>
            </Link>
          </Reveal>
        ) : null
      ) : null}

      {/* Stat tiles — ONE row */}
      <RevealGroup className="mt-8 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <RevealItem>
          <StatTile
            label="Products"
            value={products.length}
            hint="tracked SKUs"
          />
        </RevealItem>
        <RevealItem>
          <StatTile
            label="Stock alerts"
            value={stockAttentionItems.length}
            hint={
              outOfStockCount > 0
                ? `${outOfStockCount} out of stock · ${lowStockCount} low`
                : lowStockCount > 0
                  ? "below reorder level"
                  : "all healthy"
            }
            warn={stockAttentionItems.length > 0}
          />
        </RevealItem>
        <RevealItem>
          <StatTile
            label="Open dispatches"
            value={openDispatches}
            hint={
              awaitingConfirmation > 0
                ? `${awaitingConfirmation} awaiting confirmation`
                : `${inTransit} in transit`
            }
            warn={awaitingConfirmation > 0}
          />
        </RevealItem>
        <RevealItem>
          <StatTile
            label="Staff members"
            value={staffCount}
            hint="active accounts"
          />
        </RevealItem>
      </RevealGroup>

      {/* Needs attention — a single panel, two columns inside */}
      <Reveal delay={0.1} className="mt-6">
        <section className="rounded-card border border-line bg-surface ring-1 ring-black/[0.02]">
          <div className="border-b border-line px-5 py-4">
            <h2 className="text-base font-medium tracking-[-0.01em] text-ink">
              Needs attention
            </h2>
          </div>
          {stockAttentionItems.length === 0 && unassignedDispatches.length === 0 ? (
            <div className="flex items-center gap-3 px-5 py-10">
              <span className="flex size-9 items-center justify-center rounded-full bg-brand-soft text-brand-ink">
                <ClipboardList size={16} strokeWidth={1.75} aria-hidden="true" />
              </span>
              <div>
                <p className="text-sm font-medium text-ink">
                  Nothing needs attention
                </p>
                <p className="text-sm text-ink-muted">
                  Stock levels are healthy and every dispatch has a driver.
                </p>
              </div>
            </div>
          ) : (
            <div className="grid divide-y divide-line md:grid-cols-2 md:divide-x md:divide-y-0">
              <AttentionColumn
                title="Stock alerts"
                count={stockAttentionItems.length}
                empty="Every product is in stock and above its reorder level."
                items={stockAttentionItems.map((p) => ({
                  id: p.id,
                  primary: p.name,
                  secondary: `${p.sku} — ${p.onHand} of ${p.reorderLevel} · ${p.label}`,
                  href: "/inventory",
                }))}
              />
              <AttentionColumn
                title="Unassigned dispatches"
                count={unassignedDispatches.length}
                empty="Every dispatch has a driver assigned."
                items={unassignedDispatches.map((d) => ({
                  id: d.id,
                  primary: d.customerName,
                  secondary: `#${d.id.slice(0, 8)}`,
                  href: "/dispatch",
                }))}
              />
            </div>
          )}
        </section>
      </Reveal>

      {/* Module nav — compact horizontal rows, not a tile grid */}
      <Reveal delay={0.15} className="mt-6">
        <section className="rounded-card border border-line bg-surface ring-1 ring-black/[0.02]">
          <div className="border-b border-line px-5 py-4">
            <h2 className="text-base font-medium tracking-[-0.01em] text-ink">
              Modules
            </h2>
          </div>
          <div className="divide-y divide-line">
            {visibleModules.map((m) => (
              <Link
                key={m.href}
                href={m.href}
                className="group flex items-center gap-4 px-5 py-4 transition-colors hover:bg-sunken"
              >
                <span className="flex size-9 shrink-0 items-center justify-center rounded-control bg-brand-soft text-brand-ink">
                  {m.icon}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-ink">{m.name}</p>
                  <p className="mt-0.5 truncate text-sm text-ink-muted">
                    {m.description}
                  </p>
                </div>
                <ChevronRight
                  size={16}
                  className="shrink-0 text-ink-faint transition-transform group-hover:translate-x-0.5 group-hover:text-ink"
                  aria-hidden="true"
                />
              </Link>
            ))}
          </div>
        </section>
      </Reveal>
    </main>
  );
}

function StatTile({
  label,
  value,
  hint,
  warn,
}: {
  label: string;
  value: number;
  hint: string;
  warn?: boolean;
}) {
  return (
    <div
      className={`rounded-card border p-4 ring-1 ring-black/[0.02] ${
        warn ? "border-warn/30 bg-warn-soft" : "border-line bg-surface"
      }`}
    >
      <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-ink-muted">
        {label}
      </p>
      <p
        className={`mt-2 text-3xl font-semibold tracking-[-0.02em] ${
          warn ? "text-warn" : "text-ink"
        }`}
      >
        <CountUp value={value} />
      </p>
      <p
        className={`mt-1 text-xs ${
          warn ? "text-warn" : "text-ink-faint"
        }`}
      >
        {hint}
      </p>
    </div>
  );
}

function AttentionColumn({
  title,
  count,
  empty,
  items,
}: {
  title: string;
  count: number;
  empty: string;
  items: { id: string; primary: string; secondary: string; href: string }[];
}) {
  return (
    <div className="p-5">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium text-ink">{title}</h3>
        {count > 0 && (
          <Badge tone={title === "Stock alerts" ? "danger" : "info"}>{count}</Badge>
        )}
      </div>
      {items.length === 0 ? (
        <p className="mt-4 text-sm text-ink-muted">{empty}</p>
      ) : (
        <ul className="mt-3 divide-y divide-line">
          {items.map((item) => (
            <li key={item.id}>
              <Link
                href={item.href}
                className="group flex items-center justify-between gap-4 py-2.5"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm text-ink">{item.primary}</p>
                  <p className="mt-0.5 truncate font-mono text-xs text-ink-faint">
                    {item.secondary}
                  </p>
                </div>
                <span className="shrink-0 text-xs font-medium text-brand opacity-0 transition-opacity group-hover:opacity-100">
                  Review
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
