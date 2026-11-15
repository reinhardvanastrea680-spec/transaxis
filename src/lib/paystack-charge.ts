/**
 * Turning a paid transaction into a plan — one implementation.
 *
 * Two different moments can learn that a customer paid:
 *
 *   1. Paystack's webhook, seconds after the charge.
 *   2. The browser coming back to `/billing?verify=1`, a moment earlier.
 *
 * They must not disagree, so both call in here. The webhook is also not
 * guaranteed to arrive — one failed delivery, a URL typo'd in the dashboard,
 * and a customer has paid for a plan they never received — so the return trip
 * verifies the transaction with Paystack directly and applies it itself. The
 * two paths write exactly the same fields, and applying twice is a no-op.
 *
 * Nothing here trusts the browser. A `reference` in a URL is just a hint; the
 * plan, the amount and the organization all come back from Paystack's verify
 * endpoint, and the organization on the transaction must match the one that is
 * signed in.
 */

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { isPaidPlan, priceFor, type BillingCycle, type PaidPlanId } from "./plans.ts";

const PAYSTACK_API = "https://api.paystack.co";

export type Charge = {
  reference: string;
  orgId: string;
  plan: PaidPlanId;
  cycle: BillingCycle;
  customerCode: string | null;
  planCode: string | null;
  subscriptionCode: string | null;
  /** What Paystack says was paid, in kobo. null when the event omits it. */
  amountKobo?: number | null;
};

export type Assessment =
  | { ok: true; charge: Charge }
  | {
      ok: false;
      reason:
        | "no_reference"
        | "not_success"
        | "wrong_org"
        | "no_plan"
        | "already_applied"
        | "malformed";
    };

export type ReconcileOutcome =
  | { applied: true; charge: Charge }
  | { applied: false; reason: string };

/* ------------------------------------------------------------------ shared */

export function serviceClientFromEnv(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

export function normaliseCycle(value: unknown): BillingCycle {
  return value === "quarterly" || value === "annual" ? value : "monthly";
}

/**
 * The reverse of the checkout's `plan:cycle` → code lookup.
 *
 * A renewal's `charge.success` cannot be relied on to carry the metadata from
 * the checkout that created the subscription — Paystack documents the event
 * but publishes no payload for it, and the payloads it does publish for
 * subscription events carry neither `metadata` nor a `plan` object. Without
 * this, a renewal resolves to no plan, the event is dropped, and a customer
 * who has just been charged again is downgraded when `plan_renews_at` passes.
 *
 * The plan code on the charge is the one thing that survives, because Paystack
 * charged it.
 */
export function planFromCode(
  code: string | null | undefined,
): { plan: PaidPlanId; cycle: BillingCycle } | null {
  if (!code) return null;
  const raw = process.env.PAYSTACK_PLAN_CODES;
  if (!raw?.trim()) return null;

  let map: Record<string, string>;
  try {
    map = JSON.parse(raw) as Record<string, string>;
  } catch {
    return null;
  }

  for (const [key, value] of Object.entries(map)) {
    if (value !== code) continue;
    const [plan, cycle] = key.split(":");
    if (isPaidPlan(plan as PaidPlanId)) {
      return { plan: plan as PaidPlanId, cycle: normaliseCycle(cycle) };
    }
  }
  return null;
}

/** What the organization is already paying for, used when an event says nothing. */
export async function storedPlan(
  supabase: SupabaseClient,
  orgId: string,
): Promise<{ plan: PaidPlanId; cycle: BillingCycle } | null> {
  const { data } = await supabase
    .from("organizations")
    .select("plan, billing_cycle")
    .eq("id", orgId)
    .maybeSingle();

  if (!data || !isPaidPlan(data.plan as PaidPlanId)) return null;
  return {
    plan: data.plan as PaidPlanId,
    cycle: normaliseCycle(data.billing_cycle),
  };
}

/**
 * When the next payment is due, as far as the page is concerned.
 *
 * `resolvePlanId` treats a paid plan whose `plan_renews_at` is in the past as
 * expired, so this date is what actually ends access if Paystack never sends
 * the cancellation event.
 */
export function renewalDate(cycle: BillingCycle, from: Date = new Date()): string {
  const date = new Date(from.getTime());
  const months = cycle === "annual" ? 12 : cycle === "quarterly" ? 3 : 1;
  date.setMonth(date.getMonth() + months);
  return date.toISOString();
}

/** Paystack sends metadata as an object, but older integrations send a string. */
export function metadataOf(raw: unknown): Record<string, unknown> {
  if (!raw) return {};
  if (typeof raw === "string") {
    try {
      const parsed = JSON.parse(raw) as unknown;
      return parsed && typeof parsed === "object"
        ? (parsed as Record<string, unknown>)
        : {};
    } catch {
      return {};
    }
  }
  return typeof raw === "object" ? (raw as Record<string, unknown>) : {};
}

/* -------------------------------------------------------------- assessment */

type VerifyData = {
  status?: string;
  reference?: string;
  amount?: number;
  customer?: { customer_code?: string };
  plan?: { plan_code?: string } | string | null;
  subscription?: { subscription_code?: string } | string | null;
  subscription_code?: string;
  metadata?: unknown;
};

function codeOf(value: { plan_code?: string } | string | null | undefined): string | null {
  if (!value) return null;
  return typeof value === "string" ? value : (value.plan_code ?? null);
}

function subscriptionCodeOf(data: VerifyData): string | null {
  const sub = data.subscription;
  if (!sub) return data.subscription_code ?? null;
  return typeof sub === "string" ? sub : (sub.subscription_code ?? null);
}

/**
 * Decide whether a verified transaction may move the signed-in organization
 * onto a paid plan — and say why not when it may not.
 *
 * Pure on purpose: the rules are the security boundary, so they are tested
 * without a network or a database.
 */
export function assessVerifiedCharge(args: {
  transaction: unknown;
  /** The organization the signed-in user belongs to. */
  orgId: string;
  /** What this organization already recorded as its last paid reference. */
  currentReference?: string | null;
}): Assessment {
  const data = (args.transaction ?? null) as VerifyData | null;
  if (!data || typeof data !== "object") return { ok: false, reason: "malformed" };

  const reference = typeof data.reference === "string" ? data.reference : "";
  if (!reference) return { ok: false, reason: "no_reference" };

  // Only a settled payment counts. "abandoned", "failed", "reversed" and
  // "ongoing" all reach this endpoint.
  if (data.status !== "success") return { ok: false, reason: "not_success" };

  const meta = metadataOf(data.metadata);

  // The reference came from a URL the customer controls, so the organization
  // has to come back from Paystack — never from the request.
  if (meta.org_id !== args.orgId) return { ok: false, reason: "wrong_org" };

  const plan = meta.plan;
  if (typeof plan !== "string" || !isPaidPlan(plan as PaidPlanId)) {
    return { ok: false, reason: "no_plan" };
  }

  if (args.currentReference && args.currentReference === reference) {
    return { ok: false, reason: "already_applied" };
  }

  return {
    ok: true,
    charge: {
      reference,
      orgId: args.orgId,
      plan: plan as PaidPlanId,
      cycle: normaliseCycle(meta.cycle),
      customerCode: data.customer?.customer_code ?? null,
      planCode: codeOf(data.plan),
      subscriptionCode: subscriptionCodeOf(data),
      amountKobo: typeof data.amount === "number" ? data.amount : null,
    },
  };
}

/* ------------------------------------------------------------------ writes */

/**
 * Apply a charge to an organization, then record it.
 *
 * Written so a second call for the same reference cannot double-extend a
 * subscription: the update is guarded on the reference not already being the
 * stored one, so the webhook and the return trip can race harmlessly.
 */
export async function applyCharge(
  supabase: SupabaseClient,
  charge: Charge,
  source: "webhook" | "verify" = "webhook",
): Promise<{ applied: boolean }> {
  const { data: org } = await supabase
    .from("organizations")
    .select("paystack_reference")
    .eq("id", charge.orgId)
    .maybeSingle();

  if (org?.paystack_reference === charge.reference) return { applied: false };

  const patch: Record<string, unknown> = {
    plan: charge.plan,
    billing_cycle: charge.cycle,
    plan_renews_at: renewalDate(charge.cycle),
    paystack_customer_code: charge.customerCode,
    paystack_reference: charge.reference,
  };

  // A one-off charge carries no subscription. Writing `null` there would erase
  // the recurring one we already hold, so the field is only set when there is
  // a real code to set it to.
  if (charge.subscriptionCode) {
    patch.paystack_subscription_code = charge.subscriptionCode;
  }

  await supabase.from("organizations").update(patch).eq("id", charge.orgId);

  /**
   * The amount is recorded, not enforced.
   *
   * Nothing a customer can reach decides what plan a transaction carries — the
   * metadata is written by our own checkout from the plan they picked, and the
   * amount from the price table — so a cheap charge cannot claim an expensive
   * plan. What CAN drift is our own configuration: a plan code in the Paystack
   * dashboard priced below the pricing page would hand out the plan for less.
   * Refusing that charge would punish the customer for our mistake, so it is
   * applied and flagged instead, which is visible in the audit trail.
   */
  const expected = priceFor(charge.plan, charge.cycle);
  const mismatch =
    typeof charge.amountKobo === "number" &&
    charge.amountKobo > 0 &&
    charge.amountKobo !== expected;

  await supabase.from("audit_logs").insert({
    org_id: charge.orgId,
    action: "billing.payment_succeeded",
    entity_type: "organization",
    entity_id: charge.orgId,
    metadata: {
      plan: charge.plan,
      cycle: charge.cycle,
      reference: charge.reference,
      source,
      ...(typeof charge.amountKobo === "number"
        ? { amount: charge.amountKobo, expected_amount: expected }
        : {}),
      ...(mismatch ? { amount_mismatch: true } : {}),
    },
  });

  return { applied: true };
}

/* --------------------------------------------------------------- paystack */

/**
 * The subscription a customer is currently on, asked of Paystack directly.
 *
 * We cannot rely on `subscription.create` to give us the code: Paystack sends
 * it a second or two BEFORE `charge.success`, at which point the customer has
 * no row here yet (`paystack_customer_code` is still null), so resolution
 * returns nothing and the event is dropped for good. Recovering the code at
 * charge time is what keeps "downgrade to free" able to cancel the
 * subscription — without it the customer is billed again next month.
 */
export async function findActiveSubscription(
  secret: string,
  customerCode: string | undefined | null,
  planCode: string | undefined | null,
): Promise<string | null> {
  if (!customerCode) return null;
  const headers = { Authorization: `Bearer ${secret}` };
  try {
    // `/subscription?customer=` only accepts the numeric customer id. Passing
    // the `CUS_…` code returns an empty list with a 200, which looks like
    // "no subscriptions" — so resolve the id first.
    const custRes = await fetch(
      `${PAYSTACK_API}/customer/${encodeURIComponent(customerCode)}`,
      { headers, cache: "no-store" },
    );
    const cust = (await custRes.json().catch(() => null)) as
      | { data?: { id?: number } }
      | null;
    const customerId = cust?.data?.id;
    if (!customerId) return null;

    const res = await fetch(`${PAYSTACK_API}/subscription?customer=${customerId}`, {
      headers,
      cache: "no-store",
    });
    const json = (await res.json().catch(() => null)) as
      | {
          data?: Array<{
            subscription_code?: string;
            status?: string;
            plan?: { plan_code?: string };
          }>;
        }
      | null;

    const active = (json?.data ?? []).filter((s) => s.status === "active");
    const match = planCode
      ? active.find((s) => s.plan?.plan_code === planCode)
      : undefined;
    return (match ?? active[0])?.subscription_code ?? null;
  } catch {
    return null;
  }
}

/** Ask Paystack what really happened to a reference. Returns null on any doubt. */
export async function verifyTransaction(
  secret: string,
  reference: string,
): Promise<unknown | null> {
  if (!reference) return null;
  try {
    const res = await fetch(
      `${PAYSTACK_API}/transaction/verify/${encodeURIComponent(reference)}`,
      { headers: { Authorization: `Bearer ${secret}` }, cache: "no-store" },
    );
    if (!res.ok) return null;
    const json = (await res.json().catch(() => null)) as
      | { status?: boolean; data?: unknown }
      | null;
    if (!json?.status || !json.data) return null;
    return json.data;
  } catch {
    return null;
  }
}

/* --------------------------------------------------------------- reconcile */

/**
 * The return-trip path: `/billing?verify=1&reference=…` after checkout.
 *
 * Deliberately best-effort. If Paystack is slow or the network hiccups we
 * return without applying anything and let the webhook finish the job — the
 * customer sees "confirming" rather than an error.
 */
export async function reconcileReturnedCheckout(
  orgId: string,
  reference: string,
): Promise<ReconcileOutcome> {
  if (!orgId || !reference) return { applied: false, reason: "no_reference" };

  const secret = process.env.PAYSTACK_SECRET_KEY?.trim();
  if (!secret) return { applied: false, reason: "not_configured" };

  const supabase = serviceClientFromEnv();
  if (!supabase) return { applied: false, reason: "not_configured" };

  // Cheap path: this exact reference already paid for this organization and
  // the paid period has not lapsed. No need to ask Paystack again on every
  // render of a bookmarked URL.
  const { data: org } = await supabase
    .from("organizations")
    .select("plan, paystack_reference, plan_renews_at")
    .eq("id", orgId)
    .maybeSingle();

  if (!org) return { applied: false, reason: "no_org" };

  if (
    org.paystack_reference === reference &&
    isPaidPlan(org.plan as PaidPlanId) &&
    org.plan_renews_at &&
    new Date(org.plan_renews_at).getTime() > Date.now()
  ) {
    return { applied: false, reason: "already_applied" };
  }

  const transaction = await verifyTransaction(secret, reference);
  if (!transaction) return { applied: false, reason: "verify_failed" };

  const assessed = assessVerifiedCharge({
    transaction,
    orgId,
    currentReference: org.paystack_reference,
  });
  if (!assessed.ok) return { applied: false, reason: assessed.reason };

  const { applied } = await applyCharge(supabase, assessed.charge, "verify");
  return applied
    ? { applied: true, charge: assessed.charge }
    : { applied: false, reason: "already_applied" };
}
