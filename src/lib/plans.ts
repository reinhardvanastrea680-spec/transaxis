/**
 * Subscription plans, cycles, currencies and entitlements.
 *
 * This module is deliberately free of server-only imports so both the billing
 * page (client) and the server actions can read the same numbers. Anything that
 * needs the database lives in `billing-server.ts`.
 *
 * The commercial model:
 *
 *   - Three sellable plans: Standard, Pro, Max. Standard and Pro carry limits;
 *     Max is unlimited everywhere.
 *   - Three billing cycles: monthly, quarterly (~10% off), yearly (~20% off).
 *   - One currency for now: Nigerian naira. USD support was deliberately
 *     removed — re-adding it later needs a currency toggle in this file, the
 *     checkout, and a currency column on organizations.
 *   - A 14-day demo: every new organization starts on Standard for ₦0
 *     and is prompted to pay when it ends. Falling back to `free` afterwards
 *     keeps them working (on the smallest limits) rather than locking them out.
 *
 * The pricing boundary, in one sentence: paid plans are charged for team size
 * and catalog size, not for activity — but the free plan is capped on activity,
 * so a business that outgrows it has a reason to pay.
 */

export type PlanId = "free" | "trial" | "standard" | "pro" | "max";

export type PaidPlanId = "standard" | "pro" | "max";

export type BillingCycle = "monthly" | "quarterly" | "annual";

export type PlanLimits = {
  /** Maximum team members in the organization. */
  seats: number;
  /** Maximum tracked products (SKUs). */
  skus: number;
  /** Maximum warehouses. */
  warehouses: number;
  /**
   * Dispatches allowed per calendar month. `Infinity` means no cap.
   *
   * Only the free plan is capped. The demo and every paid tier stay unlimited,
   * because a dispatcher who is stopped mid-shift is a dispatcher who stops
   * trusting the product.
   */
  dispatchesPerMonth: number;
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
};

const UNLIMITED = Number.POSITIVE_INFINITY;

/**
 * The free plan's monthly dispatch ceiling.
 *
 * One number, deliberately: change it here and the server action, the dispatch
 * page, the billing page and the tests all follow. Roughly one working day's
 * worth of runs for a small operator — enough to run a real week, not enough to
 * run a business on.
 */
export const FREE_DISPATCHES_PER_MONTH = 20;

/** Standard's ceiling — the demo runs on these limits so the trial is honest. */
const STANDARD_LIMITS: PlanLimits = {
  seats: 5,
  skus: 500,
  warehouses: 2,
  dispatchesPerMonth: UNLIMITED,
  exports: false,
  historyDays: 90,
  podRetentionDays: 90,
};

export const PLAN_LIMITS: Record<PlanId, PlanLimits> = {
  free: {
    seats: 3,
    skus: 100,
    warehouses: 1,
    dispatchesPerMonth: FREE_DISPATCHES_PER_MONTH,
    exports: false,
    historyDays: 30,
    podRetentionDays: 30,
  },
  // The demo runs on Standard's limits: what you try is what you buy.
  trial: { ...STANDARD_LIMITS },
  standard: { ...STANDARD_LIMITS },
  pro: {
    seats: 20,
    skus: 5_000,
    warehouses: 5,
    dispatchesPerMonth: UNLIMITED,
    exports: true,
    historyDays: 365,
    podRetentionDays: 365,
  },
  max: {
    seats: UNLIMITED,
    skus: UNLIMITED,
    warehouses: UNLIMITED,
    dispatchesPerMonth: UNLIMITED,
    exports: true,
    historyDays: null,
    podRetentionDays: null,
  },
};

export const PLAN_META: Record<PlanId, PlanMeta> = {
  free: {
    id: "free",
    label: "Free",
    blurb: "The fallback after a demo ends. Nothing is deleted.",
  },
  trial: {
    id: "trial",
    label: "Demo",
    blurb: "Standard, free for 14 days. No card required.",
  },
  standard: {
    id: "standard",
    label: "Standard",
    blurb: "One site, a small team, a real catalog.",
  },
  pro: {
    id: "pro",
    label: "Pro",
    blurb: "Several sites, CSV exports, a year of history.",
  },
  max: {
    id: "max",
    label: "Max",
    blurb: "No ceilings at all — team, catalog, warehouses, history.",
  },
};

// ---------------------------------------------------------------------------
// Prices. Kobo. Quarterly saves 10% off three months, yearly saves 20% off
// twelve. One currency (NGN) for now — USD was removed deliberately and can
// be re-added by widening this table and the checkout.
// ---------------------------------------------------------------------------

export const PRICE_TABLE: Record<
  PaidPlanId,
  Record<BillingCycle, number>
> = {
  standard: {
    monthly: 3_500_000, // ₦35,000
    quarterly: 9_450_000, // ₦94,500  (10% off ₦105,000)
    annual: 33_600_000, // ₦336,000 (20% off ₦420,000)
  },
  pro: {
    monthly: 6_000_000, // ₦60,000
    quarterly: 16_200_000, // ₦162,000 (10% off ₦180,000)
    annual: 57_600_000, // ₦576,000 (20% off ₦720,000)
  },
  max: {
    monthly: 8_500_000, // ₦85,000
    quarterly: 22_950_000, // ₦229,500 (10% off ₦255,000)
    annual: 81_600_000, // ₦816,000 (20% off ₦1,020,000)
  },
};

export const CYCLES: BillingCycle[] = ["monthly", "quarterly", "annual"];

export const CYCLE_LABELS: Record<BillingCycle, string> = {
  monthly: "Monthly",
  quarterly: "Quarterly",
  annual: "Yearly",
};

/** How many months one paid cycle covers — used for renewal dates and savings. */
export const MONTHS_IN_CYCLE: Record<BillingCycle, number> = {
  monthly: 1,
  quarterly: 3,
  annual: 12,
};

/** Price of a plan for a cycle, in kobo. */
export function priceFor(plan: PaidPlanId, cycle: BillingCycle): number {
  return PRICE_TABLE[plan][cycle];
}

/**
 * Percentage saved versus paying month by month, rounded for display.
 * 0 for monthly. Computed from the table, so a badge never lies about a price.
 */
export function savingsPct(plan: PaidPlanId, cycle: BillingCycle): number {
  const months = MONTHS_IN_CYCLE[cycle];
  if (months === 1) return 0;
  const full = priceFor(plan, "monthly") * months;
  return Math.round((1 - priceFor(plan, cycle) / full) * 100);
}

/** "₦35,000" — kobo in, display string out. */
export function formatNaira(kobo: number): string {
  return `₦${Math.round(kobo / 100).toLocaleString("en-NG")}`;
}

export const TRIAL_DAYS = 14;

export const SELLABLE_PLANS: PaidPlanId[] = ["standard", "pro", "max"];

export function isPaidPlan(plan: PlanId): plan is PaidPlanId {
  return plan === "standard" || plan === "pro" || plan === "max";
}

export function limitsFor(plan: PlanId): PlanLimits {
  return PLAN_LIMITS[plan] ?? PLAN_LIMITS.free;
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
 * grandfathered accounts and manually-comped accounts are represented. An
 * expired demo falls back to `free` rather than locking the door.
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

/** Whole days left in the demo, or 0 when there is no demo running. */
export function trialDaysLeft(org: OrgBillingRow | null | undefined): number {
  if (org?.plan !== "trial" || !org.trial_ends_at) return 0;
  const ms = new Date(org.trial_ends_at).getTime() - Date.now();
  if (ms <= 0) return 0;
  return Math.ceil(ms / 86_400_000);
}

/** Whether the demo has already run out (the "now pay" moment). */
export function trialExpired(org: OrgBillingRow | null | undefined): boolean {
  if (org?.plan !== "trial" || !org.trial_ends_at) return false;
  return new Date(org.trial_ends_at).getTime() <= Date.now();
}

/** Human label for the plan currently in force. */
export function planLabel(plan: PlanId): string {
  return PLAN_META[plan]?.label ?? plan;
}

/**
 * Whether the plan can hold one more of something. `Infinity` compares fine,
 * so callers never need to special-case unlimited plans.
 */
export function withinLimit(current: number, limit: number): boolean {
  return current < limit;
}

/** "20" or "Unlimited" — for anything that shows a ceiling to a human. */
export function formatLimit(limit: number): string {
  return Number.isFinite(limit) ? String(limit) : "Unlimited";
}

export type LimitSubject = "seats" | "skus" | "warehouses" | "dispatches";

export function limitMessage(plan: PlanId, subject: LimitSubject): string {
  // "dispatches" is the UI-facing name; the field carries the period.
  const key = subject === "dispatches" ? "dispatchesPerMonth" : subject;
  const limit = limitsFor(plan)[key];
  const noun =
    subject === "seats"
      ? "team members"
      : subject === "skus"
        ? "products"
        : subject === "warehouses"
          ? "warehouses"
          : "dispatches a month";

  return `Your ${planLabel(plan)} plan allows ${formatLimit(limit)} ${noun}. Upgrade to add more.`;
}

/**
 * First instant of the current calendar month, in UTC, as an ISO string.
 *
 * The quota is a calendar-month window rather than a rolling 30 days, because
 * "you have used 20 of 20 this month" is a thing a customer can reason about
 * and a rolling window is not. UTC keeps the boundary identical on every
 * server; for a Lagos business that is at most an hour of skew at month end.
 */
export function monthStartIso(now: Date = new Date()): string {
  return new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1),
  ).toISOString();
}
