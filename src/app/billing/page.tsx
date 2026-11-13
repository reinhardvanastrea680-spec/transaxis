export const runtime = "edge";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { getOrgEntitlements } from "@/lib/billing-server";
import { planLabel } from "@/lib/plans";
import { Badge } from "@/components/ui/badge";
import { BillingClient } from "./billing-client";

function UsageRow({
  label,
  used,
  limit,
}: {
  label: string;
  used: number;
  limit: number;
}) {
  const unlimited = !Number.isFinite(limit);
  const pct = unlimited ? 0 : Math.min(100, Math.round((used / Math.max(1, limit)) * 100));
  const atLimit = !unlimited && used >= limit;

  return (
    <div>
      <div className="flex items-baseline justify-between text-sm">
        <span className="text-ink-muted">{label}</span>
        <span className={`tabular ${atLimit ? "font-medium text-warn" : "text-ink"}`}>
          {used} / {unlimited ? "∞" : limit}
        </span>
      </div>
      <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-sunken">
        <div
          className={`h-full rounded-full ${atLimit ? "bg-warn" : "bg-brand"}`}
          style={{ width: unlimited ? "8%" : `${Math.max(pct, 2)}%` }}
        />
      </div>
    </div>
  );
}

export default async function BillingPage() {
  if (!isSupabaseConfigured()) {
    return (
      <main className="mx-auto max-w-[1200px] px-5 py-12 sm:px-8">
        <div className="rounded-card border border-warn/30 bg-warn-soft p-8">
          <h1 className="text-xl font-semibold text-ink">Setup required</h1>
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

  if (profile.role !== "owner" && profile.role !== "admin") {
    redirect(profile.role === "driver" ? "/dispatch" : "/dashboard");
  }

  const { billing, usage } = await getOrgEntitlements(supabase, profile.org_id);
  const canManage = profile.role === "owner" || profile.role === "admin";

  const renewsOn = billing.planRenewsAt
    ? new Date(billing.planRenewsAt).toLocaleDateString("en-NG", {
        year: "numeric",
        month: "long",
        day: "numeric",
      })
    : null;

  return (
    <main className="mx-auto max-w-[1200px] overflow-x-hidden px-5 py-8 sm:px-8 lg:py-10">
      <div className="mb-7">
        <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-brand">
          Billing
        </p>
        <h1 className="mt-1.5 text-2xl font-semibold tracking-[-0.02em] text-ink">
          Plan &amp; usage
        </h1>
        <p className="mt-1 text-sm text-ink-muted">
          Your plan sets how many people and products you can add. Dispatch
          volume is never limited.
        </p>
      </div>

      <section className="mb-6 rounded-card border border-line bg-surface p-5 ring-1 ring-black/[0.02]">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-base font-medium text-ink">
              {planLabel(billing.plan)} plan
            </h2>
            {billing.isTrial && (
              <Badge tone="info">
                {billing.trialDaysLeft === 0
                  ? "Trial ends today"
                  : `${billing.trialDaysLeft} day${billing.trialDaysLeft === 1 ? "" : "s"} left`}
              </Badge>
            )}
            {billing.isPaid && renewsOn && (
              <Badge tone="brand">Renews {renewsOn}</Badge>
            )}
          </div>
          <p className="text-sm text-ink-muted">
            {billing.isTrial
              ? "Free 14-day demo of Standard — no card required. When it ends you keep working on the free plan until you pick one; nothing is deleted."
              : billing.isPaid
                ? `Thank you. You are billed ${billing.billingCycle === "annual" ? "yearly" : billing.billingCycle === "quarterly" ? "quarterly" : "monthly"}.`
                : "You are on the permanent free plan. Pick Standard, Pro or Max below."}
          </p>
        </div>

        <div className="mt-5 grid gap-4 sm:grid-cols-3">
          <UsageRow label="Team members" used={usage.seats} limit={billing.limits.seats} />
          <UsageRow label="Products" used={usage.skus} limit={billing.limits.skus} />
          <UsageRow
            label="Warehouses"
            used={usage.warehouses}
            limit={billing.limits.warehouses}
          />
        </div>
      </section>

      <BillingClient currentPlan={billing.plan} canManage={canManage} />
    </main>
  );
}
