/**
 * Subscription plans and entitlements.
 *
 * This module is deliberately free of server-only imports so both the billing
 * page (client) and the server actions can read the same numbers. Anything that
 * needs the database lives in `billing-server.ts`.
 *
 * The pricing boundary, in one sentence: we charge for team size and catalog
 * size, not for activity. Dispatch volume is unlimited on every plan, because
 * the daily habit is what makes the product worth paying for.
 */

export type PlanId = "free" | "trial" | "growth" | "operations";

export type PaidPlanId = "growth" | "operations";

export type BillingCycle = "monthly" | "annual";

export type PlanLimits = {
  /** Maximum team members in the organization. */
  seats: number;
  /** Maximum tracked products (SKUs). */
  skus: number;
  /** Maximum warehouses. */
  warehouses: number;
  /** CSV / report exports. */
  exports: boolean;
  /** How far back history and the audit trail can be read. null = unlimited. */
  historyDays: number | null;
  /** How long proof-of-delivery photos are kept. null = forever. */
  podRetentionDays: number | null;
};

export type PlanMeta = {
  id: PlanId;
  label: string;
  blurb: string;
  /** Monthly price in kobo. null for plans that are not sold. */
  monthlyKobo: number | null;
};

const UNLIMITED = Number.POSITIVE_INFINITY;

export const PLAN_LIMITS: Record<PlanId, PlanLimits> = {
  free: {
    seats: 3,
    skus: 100,
    warehouses: 1,
    exports: false,
    historyDays: 30,
    podRetentionDays: 30,
  },
  trial: {
    seats: UNLIMITED,
    skus: UNLIMITED,
    warehouses: UNLIMITED,
    exports: true,
    historyDays: null,
    podRetentionDays: null,
  },
  growth: {
    seats: 15,
    skus: UNLIMITED,
    warehouses: 3,
    exports: true,
    historyDays: null,
    podRetentionDays: null,
  },
  operations: {
    seats: UNLIMITED,
    skus: UNLIMITED,
    warehouses: UNLIMITED,
    exports: true,
    historyDays: null,
    podRetentionDays: null,
  },
};

export const PLAN_META: Record<PlanId, PlanMeta> = {
  free: {
    id: "free",
    label: "Free",
    blurb: "Run one site with a small team. No time limit.",
    monthlyKobo: 0,
  },
  trial: {
    id: "trial",
    label: "Trial",
    blurb: "Everything unlocked for 14 days.",
    monthlyKobo: null,
  },
  growth: {
    id: "growth",
    label: "Growth",
    blurb: "For a team that has outgrown one site or three logins.",
    monthlyKobo: 2_500_000,
  },
  operations: {
    id: "operations",
    label: "Operations",
    blurb: "Multi-site operations with no seat or catalog ceiling.",
    monthlyKobo: 6_000_000,
  },
};

export const ANNUAL_MONTHS_CHARGED = 10;

export const TRIAL_DAYS = 14;

export const SELLABLE_PLANS: PaidPlanId[] = ["growth", "operations"];

export function isPaidPlan(plan: PlanId): plan is PaidPlanId {
  return plan === "growth" || plan === "operations";
}

export function limitsFor(plan: PlanId): PlanLimits {
  return PLAN_LIMITS[plan] ?? PLAN_LIMITS.free;
}

/** Kobo to a naira string, e.g. 2_500_000 -> "₦25,000". */
export function formatNaira(kobo: number): string {
  return `₦${Math.round(kobo / 100).toLocaleString("en-NG")}`;
}

/** What a plan costs for a given cycle, in kobo. */
export function priceForCycle(plan: PaidPlanId, cycle: BillingCycle): number {
  const monthly = PLAN_META[plan].monthlyKobo ?? 0;
  return cycle === "annual" ? monthly * ANNUAL_MONTHS_CHARGED : monthly;
}

export type OrgBillingRow = {
  plan: string | null;
  trial_ends_at: string | null;
  plan_renews_at: string | null;
  billing_cycle?: string | null;
};

/**
 * Collapse the stored row into the plan that actually applies right now.
 *
 * A paid plan with no renewal date is treated as active — that is how
 * grandfathered accounts and manually-comped accounts are represented.
 */
export function resolvePlanId(org: OrgBillingRow | null | undefined): PlanId {
  if (!org) return "free";

  const plan = (org.plan ?? "free") as PlanId;
  const now = Date.now();

  if (isPaidPlan(plan)) {
    if (!org.plan_renews_at) return plan;
    return new Date(org.plan_renews_at).getTime() > now ? plan : "free";
  }

  if (plan === "trial") {
    if (!org.trial_ends_at) return "free";
    return new Date(org.trial_ends_at).getTime() > now ? "trial" : "free";
  }

  return "free";
}

/** Whole days left in the trial, or 0 when there is no trial running. */
export function trialDaysLeft(org: OrgBillingRow | null | undefined): number {
  if (!org?.trial_ends_at) return 0;
  const ms = new Date(org.trial_ends_at).getTime() - Date.now();
  if (ms <= 0) return 0;
  return Math.ceil(ms / 86_400_000);
}

/** Human label for the plan currently in force. */
export function planLabel(plan: PlanId): string {
  return PLAN_META[plan].label;
}

/**
 * Whether the plan can hold one more of something. `Infinity` compares fine,
 * so callers never need to special-case unlimited plans.
 */
export function withinLimit(current: number, limit: number): boolean {
  return current < limit;
}

export function limitMessage(
  plan: PlanId,
  subject: "seats" | "skus" | "warehouses",
): string {
  const limit = limitsFor(plan)[subject];
  const noun =
    subject === "seats" ? "team members" : subject === "skus" ? "products" : "warehouses";

  return `Your ${planLabel(plan)} plan allows ${limit} ${noun}. Upgrade to add more.`;
}
