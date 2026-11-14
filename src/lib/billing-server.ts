/**
 * Server-side billing lookups.
 *
 * Kept apart from `plans.ts` because this module talks to the database and is
 * only ever imported from server components and server actions.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  isPaidPlan,
  limitsFor,
  monthStartIso,
  resolvePlanId,
  trialDaysLeft as daysLeft,
  trialExpired,
  type BillingCycle,
  type PlanId,
  type PlanLimits,
} from "./plans";

export type OrgBilling = {
  plan: PlanId;
  limits: PlanLimits;
  isTrial: boolean;
  isPaid: boolean;
  /** True when the demo has run out and the org has not paid yet. */
  trialExpired: boolean;
  trialEndsAt: string | null;
  trialDaysLeft: number;
  planRenewsAt: string | null;
  billingCycle: BillingCycle | null;
  paystackCustomerCode: string | null;
};

export type OrgUsage = {
  seats: number;
  skus: number;
  warehouses: number;
  /** Dispatches created since the first of the current month (UTC). */
  dispatchesThisMonth: number;
};

const EMPTY_BILLING: OrgBilling = {
  plan: "free",
  limits: limitsFor("free"),
  isTrial: false,
  isPaid: false,
  trialExpired: false,
  trialEndsAt: null,
  trialDaysLeft: 0,
  planRenewsAt: null,
  billingCycle: null,
  paystackCustomerCode: null,
};

export async function getOrgBilling(
  supabase: SupabaseClient,
  orgId: string,
): Promise<OrgBilling> {
  const { data } = await supabase
    .from("organizations")
    .select(
      "plan, trial_ends_at, plan_renews_at, billing_cycle, paystack_customer_code",
    )
    .eq("id", orgId)
    .maybeSingle();

  if (!data) return EMPTY_BILLING;

  const plan = resolvePlanId(data);
  const cycle = data.billing_cycle;

  return {
    plan,
    limits: limitsFor(plan),
    isTrial: plan === "trial",
    isPaid: isPaidPlan(plan),
    trialExpired: trialExpired(data),
    trialEndsAt: data.trial_ends_at ?? null,
    trialDaysLeft: daysLeft(data),
    planRenewsAt: data.plan_renews_at ?? null,
    billingCycle:
      cycle === "monthly" || cycle === "quarterly" || cycle === "annual"
        ? cycle
        : null,
    paystackCustomerCode: data.paystack_customer_code ?? null,
  };
}

/**
 * Dispatches created since the start of the current month, for the quota.
 *
 * Deleting a dispatch must not hand the quota back — otherwise a free account
 * creates 20, deletes 20, and repeats forever. The audit trail records the
 * creation even after the row is gone, so it acts as a floor. If the
 * fire-and-forget audit insert was lost, the surviving rows still count, so
 * the larger of the two wins. Roles that cannot read `audit_logs` (staff) get
 * the row count, which errs towards letting work through rather than blocking
 * someone mid-shift.
 */
export async function countDispatchesThisMonth(
  supabase: SupabaseClient,
  orgId: string,
): Promise<number> {
  const since = monthStartIso();

  const [rows, audited] = await Promise.all([
    supabase
      .from("dispatches")
      .select("id", { count: "exact", head: true })
      .eq("org_id", orgId)
      .gte("created_at", since),
    supabase
      .from("audit_logs")
      .select("id", { count: "exact", head: true })
      .eq("org_id", orgId)
      .eq("action", "dispatch.created")
      .gte("created_at", since),
  ]);

  return Math.max(rows.count ?? 0, audited.count ?? 0);
}

/**
 * Current consumption against the plan. Counts use `head: true` so the database
 * never ships rows we only need to count.
 */
export async function getOrgUsage(
  supabase: SupabaseClient,
  orgId: string,
): Promise<OrgUsage> {
  const [seats, skus, warehouses, dispatchesThisMonth] = await Promise.all([
    supabase
      .from("profiles")
      .select("id", { count: "exact", head: true })
      .eq("org_id", orgId),
    supabase
      .from("products")
      .select("id", { count: "exact", head: true })
      .eq("org_id", orgId),
    supabase
      .from("warehouses")
      .select("id", { count: "exact", head: true })
      .eq("org_id", orgId),
    countDispatchesThisMonth(supabase, orgId),
  ]);

  return {
    seats: seats.count ?? 0,
    skus: skus.count ?? 0,
    warehouses: warehouses.count ?? 0,
    dispatchesThisMonth,
  };
}

/** Billing state plus usage, for pages that render a plan panel. */
export async function getOrgEntitlements(
  supabase: SupabaseClient,
  orgId: string,
): Promise<{ billing: OrgBilling; usage: OrgUsage }> {
  const [billing, usage] = await Promise.all([
    getOrgBilling(supabase, orgId),
    getOrgUsage(supabase, orgId),
  ]);
  return { billing, usage };
}

/** Earliest timestamp readable under the plan's history window, or null. */
export function historyCutoff(billing: OrgBilling): string | null {
  if (billing.limits.historyDays === null) return null;
  const cutoff = new Date(
    Date.now() - billing.limits.historyDays * 86_400_000,
  );
  return cutoff.toISOString();
}
