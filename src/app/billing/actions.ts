"use server";

/**
 * Paystack checkout.
 *
 * The browser never sees the secret key: we initialise the transaction on the
 * server, hand back the hosted checkout URL, and let Paystack's webhook be the
 * single source of truth for whether a plan actually got paid for. Nothing in
 * this file grants access on its own.
 *
 * Currency is the customer's choice (USD or NGN); the price comes from the
 * table in `src/lib/plans.ts`, never from the request.
 */

import { createClient } from "@/lib/supabase/server";
import { getSiteUrl } from "@/lib/supabase/site-url";
import {
  PLAN_META,
  SELLABLE_PLANS,
  priceFor,
  type BillingCycle,
  type PaidPlanId,
} from "@/lib/plans";

const PAYSTACK_API = "https://api.paystack.co";

function paystackSecret(): string | null {
  const key = process.env.PAYSTACK_SECRET_KEY;
  return key && key.trim() ? key.trim() : null;
}

/**
 * Recurring plans are keyed `plan:cycle` in ONE env var, e.g.
 *
 *   PAYSTACK_PLAN_CODES={"standard:monthly":"PLN_a", "max:annual":"PLN_b"}
 *
 * 3 plans × 3 cycles = 9 codes; a single JSON var beats nine separate names.
 * When the code for a combination is missing the checkout is a one-off charge
 * for the exact listed price instead of a subscription.
 */
function planCodeFor(plan: PaidPlanId, cycle: BillingCycle): string | null {
  const raw = process.env.PAYSTACK_PLAN_CODES;
  if (!raw?.trim()) return null;

  let map: Record<string, string>;
  try {
    map = JSON.parse(raw) as Record<string, string>;
  } catch {
    return null;
  }

  const code = map[`${plan}:${cycle}`];
  return code && code.trim() ? code.trim() : null;
}

export async function initializeCheckout(
  plan: PaidPlanId,
  cycle: BillingCycle,
  origin?: string,
) {
  const secret = paystackSecret();
  if (!secret) {
    return {
      error:
        "Card payments are not configured yet. Add PAYSTACK_SECRET_KEY to the environment.",
    };
  }

  if (!SELLABLE_PLANS.includes(plan)) {
    return { error: "Unknown plan" };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user?.email) return { error: "Not authenticated" };

  const { data: profile } = await supabase
    .from("profiles")
    .select("org_id, role")
    .eq("id", user.id)
    .maybeSingle();

  if (!profile?.org_id) return { error: "No organization" };
  if (profile.role !== "owner" && profile.role !== "admin") {
    return { error: "Only owners and admins can change the plan." };
  }

  const base = getSiteUrl() ?? origin ?? "";
  if (!base) return { error: "Could not determine the site URL." };

  const amount = priceFor(plan, cycle);
  const planCode = planCodeFor(plan, cycle);

  const body: Record<string, unknown> = {
    email: user.email,
    amount,
    currency: "NGN",
    callback_url: `${base}/billing?verify=1`,
    metadata: {
      org_id: profile.org_id,
      plan,
      cycle,
      plan_label: PLAN_META[plan].label,
    },
  };

  // When a plan code is attached, Paystack charges the plan's own amount on its
  // own interval and ignores `amount` here — so a code is only attached when it
  // matches the plan and cycle. Without one the checkout is still correct: a
  // one-off charge for exactly the amount shown on the pricing card.
  if (planCode) body.plan = planCode;

  const res = await fetch(`${PAYSTACK_API}/transaction/initialize`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${secret}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
    cache: "no-store",
  });

  const json = (await res.json().catch(() => null)) as
    | { status?: boolean; message?: string; data?: { authorization_url?: string; reference?: string } }
    | null;

  if (!res.ok || !json?.status || !json.data?.authorization_url) {
    return {
      error: json?.message || "Paystack could not start the checkout. Try again.",
    };
  }

  return {
    success: true,
    authorizationUrl: json.data.authorization_url,
    reference: json.data.reference ?? null,
  };
}

/**
 * Drop back to the free plan immediately. Kept deliberately simple: we do not
 * try to unwind a Paystack subscription from here, because that needs the
 * subscription's email token. Data is never deleted.
 */
export async function downgradeToFree() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };

  const { data: profile } = await supabase
    .from("profiles")
    .select("org_id, role")
    .eq("id", user.id)
    .maybeSingle();

  if (!profile?.org_id) return { error: "No organization" };
  if (profile.role !== "owner" && profile.role !== "admin") {
    return { error: "Only owners and admins can change the plan." };
  }

  const { error } = await supabase
    .from("organizations")
    .update({
      plan: "free",
      plan_renews_at: null,
      paystack_subscription_code: null,
    })
    .eq("id", profile.org_id);

  if (error) return { error: error.message };

  void supabase.from("audit_logs").insert({
    org_id: profile.org_id,
    actor_id: user.id,
    action: "billing.downgraded_to_free",
    entity_type: "organization",
    entity_id: profile.org_id,
  });

  return { success: true };
}
