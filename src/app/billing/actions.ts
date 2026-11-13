"use server";

/**
 * Paystack checkout.
 *
 * The browser never sees the secret key: we initialise the transaction on the
 * server, hand back the hosted checkout URL, and let Paystack's webhook be the
 * single source of truth for whether a plan actually got paid for. Nothing in
 * this file grants access on its own.
 */

import { createClient } from "@/lib/supabase/server";
import { getSiteUrl } from "@/lib/supabase/site-url";
import {
  PLAN_META,
  SELLABLE_PLANS,
  priceForCycle,
  type BillingCycle,
  type PaidPlanId,
} from "@/lib/plans";

const PAYSTACK_API = "https://api.paystack.co";

function paystackSecret(): string | null {
  const key = process.env.PAYSTACK_SECRET_KEY;
  return key && key.trim() ? key.trim() : null;
}

function planCodeFor(plan: PaidPlanId): string | null {
  const code =
    plan === "growth"
      ? process.env.PAYSTACK_PLAN_CODE_GROWTH
      : process.env.PAYSTACK_PLAN_CODE_OPERATIONS;
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

  const amount = priceForCycle(plan, cycle);
  const planCode = planCodeFor(plan);

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

  // When a Paystack plan code is configured the transaction also creates the
  // recurring subscription. Without one, it is a single charge.
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
