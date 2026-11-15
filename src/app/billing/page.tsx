export const runtime = "edge";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { getOrgEntitlements } from "@/lib/billing-server";
import { planLabel } from "@/lib/plans";
import { reconcileReturnedCheckout } from "@/lib/paystack-charge";
import { formatDateLong } from "@/lib/dates";
import { Badge } from "@/components/ui/badge";
import { BillingClient } from "./billing-client";

type SearchParams = Record<string, string | string[] | undefined>;

function first(value: string | string[] | undefined): string {
  return (Array.isArray(value) ? value[0] : value) ?? "";
}

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

export default async function BillingPage({
  searchParams,
}: {
  searchParams?: Promise<SearchParams>;
}) {
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

  /**
   * Returning from checkout: `/billing?verify=1&reference=…`.
   *
   * Paystack redirects the browser the instant the charge succeeds, and the
   * webhook lands a second or two later. Without this the page renders from
   * the database in that gap and tells someone who just paid that they are
   * still on Free — and if a webhook is ever missed, that is permanent.
   *
   * The reference is treated as a hint only: the plan, the amount and the
   * organization come back from Paystack's verify endpoint, and the
   * organization must match the one signed in here. Redirecting to a clean URL
   * afterwards keeps a refresh from re-running the check.
   */
  const params = (await searchParams) ?? {};
  if (first(params.verify) === "1") {
    let applied = false;
    try {
      const outcome = await reconcileReturnedCheckout(
        profile.org_id,
        first(params.reference) || first(params.trxref),
      );
      applied = outcome.applied;
    } catch {
      // Best effort: the webhook is still on its way. Show "confirming".
      applied = false;
    }
    redirect(applied ? "/billing?upgraded=1" : "/billing?confirming=1");
  }

  const upgraded = first(params.upgraded) === "1";
  const confirming = first(params.confirming) === "1";

  const { billing, usage } = await getOrgEntitlements(supabase, profile.org_id);
  const canManage = profile.role === "owner" || profile.role === "admin";

  const renewsOn = billing.planRenewsAt
    ? formatDateLong(billing.planRenewsAt)
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
          Your plan sets how many people, products and warehouses you can add,
          and how many dispatches you can send each month.
        </p>
      </div>

      {upgraded && (
        <div
          role="status"
          className="mb-6 rounded-card border border-brand/30 bg-brand-soft p-4"
        >
          <p className="text-sm font-medium text-brand-ink">
            Payment received — you are on {planLabel(billing.plan)}.
          </p>
          <p className="mt-1 text-sm text-ink-muted">
            Your new limits are active now. A receipt is on its way from
            Paystack.
          </p>
        </div>
      )}

      {confirming && (
        <div
          role="status"
          className="mb-6 rounded-card border border-line-strong bg-sunken p-4"
        >
          <p className="text-sm font-medium text-ink">
            Confirming your payment with Paystack.
          </p>
          <p className="mt-1 text-sm text-ink-muted">
            This usually takes a few seconds. If the plan below still shows
            Free, refresh this page — nothing was charged twice.
          </p>
        </div>
      )}

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

        <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <UsageRow label="Team members" used={usage.seats} limit={billing.limits.seats} />
          <UsageRow label="Products" used={usage.skus} limit={billing.limits.skus} />
          <UsageRow
            label="Warehouses"
            used={usage.warehouses}
            limit={billing.limits.warehouses}
          />
          <UsageRow
            label="Dispatches this month"
            used={usage.dispatchesThisMonth}
            limit={billing.limits.dispatchesPerMonth}
          />
        </div>
      </section>

      <BillingClient currentPlan={billing.plan} canManage={canManage} />
    </main>
  );
}
