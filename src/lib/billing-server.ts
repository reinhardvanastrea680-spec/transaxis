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
 * Current consumption against the plan. Counts use `head: true` so the database
 * never ships rows we only need to count.
 */
export async function getOrgUsage(
  supabase: SupabaseClient,
  orgId: string,
): Promise<OrgUsage> {
  const [seats, skus, warehouses, dispatches] = await Promise.all([
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
    supabase
      .from("dispatches")
      .select("id", { count: "exact", head: true })
      .eq("org_id", orgId)
      .gte("created_at", monthStartIso()),
  ]);

  return {
    seats: seats.count ?? 0,
    skus: skus.count ?? 0,
    warehouses: warehouses.count ?? 0,
    dispatchesThisMonth: dispatches.count ?? 0,
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
