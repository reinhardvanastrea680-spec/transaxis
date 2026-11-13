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

import { createClient as createSupabaseClient } from "@supabase/supabase-js";
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

/**
 * Service-role client for writes to `organizations`.
 *
 * The table's RLS only grants SELECT to members — there is no UPDATE policy —
 * so a user-scoped update silently matches zero rows and reports success while
 * changing nothing (the downgrade bug). Bypassing RLS here is safe because the
 * owner/admin check below runs against the user's real session first, and
 * deliberately NOT adding an UPDATE policy keeps a signed-in owner from
 * PATCHing `plan = 'max'` directly and skipping payment.
 */
function getServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createSupabaseClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

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
 * Cancel the recurring billing at Paystack, best-effort.
 *
 * Disabling needs the subscription's `email_token`, which is only available
 * from the subscription fetch endpoint — not from our stored codes. If
 * Paystack reports the subscription is already cancelled, that counts as done.
 */
async function cancelPaystackSubscription(
  secret: string,
  subscriptionCode: string,
): Promise<{ ok: boolean; detail: string }> {
  const fetchRes = await fetch(
    `${PAYSTACK_API}/subscription/${encodeURIComponent(subscriptionCode)}`,
    {
      headers: { Authorization: `Bearer ${secret}` },
      cache: "no-store",
    },
  );
  const fetched = (await fetchRes.json().catch(() => null)) as
    | { status?: boolean; data?: { email_token?: string; status?: string } }
    | null;

  const token = fetched?.data?.email_token;
  if (fetched?.data?.status && fetched.data.status !== "active") {
    return { ok: true, detail: `Subscription was already ${fetched.data.status}.` };
  }
  if (!token) {
    return { ok: false, detail: "could not read the subscription's cancel token" };
  }

  const disableRes = await fetch(
    `${PAYSTACK_API}/subscription/${encodeURIComponent(subscriptionCode)}/disable`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${secret}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ token }),
      cache: "no-store",
    },
  );
  const disabled = (await disableRes.json().catch(() => null)) as
    | { status?: boolean; message?: string }
    | null;

  if (disableRes.ok && disabled?.status) {
    return { ok: true, detail: "Subscription cancelled." };
  }

  const message = disabled?.message ?? `HTTP ${disableRes.status}`;
  if (/already|inactive|cancelled/i.test(message)) {
    return { ok: true, detail: message };
  }
  return { ok: false, detail: message };
}

/**
 * Drop back to the free plan. The Paystack subscription is cancelled too, so
 * the customer is not billed again for something they walked away from —
 * without this, the next renewal's charge.success would re-activate the plan
 * here. If the cancellation fails for any reason the local downgrade still
 * happens (a customer is never stuck on a plan they asked to leave), and the
 * response carries a warning so the UI can tell them to finish the job in the
 * Paystack dashboard. Data is never deleted.
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

  const service = getServiceClient();
  if (!service) {
    return { error: "Server is not configured. Contact support." };
  }

  // Cancel at Paystack FIRST, so a renewal charge can never race the local
  // downgrade and re-activate the plan.
  const { data: orgRow } = await service
    .from("organizations")
    .select("paystack_subscription_code")
    .eq("id", profile.org_id)
    .maybeSingle();

  const subscriptionCode = orgRow?.paystack_subscription_code ?? null;
  const secret = paystackSecret();
  let warning: string | null = null;

  if (subscriptionCode && secret) {
    const cancelled = await cancelPaystackSubscription(secret, subscriptionCode);
    if (!cancelled.ok) {
      warning = `Downgraded here, but the Paystack subscription could not be cancelled (${cancelled.detail}). Cancel it from the Paystack dashboard to stop future charges.`;
    }
  } else if (subscriptionCode && !secret) {
    warning =
      "Downgraded here, but Paystack is not configured on this server — cancel the subscription from the Paystack dashboard to stop future charges.";
  }

  const { error } = await service
    .from("organizations")
    .update({
      plan: "free",
      plan_renews_at: null,
      paystack_subscription_code: null,
    })
    .eq("id", profile.org_id);

  if (error) return { error: error.message };

  void service.from("audit_logs").insert({
    org_id: profile.org_id,
    actor_id: user.id,
    action: "billing.downgraded_to_free",
    entity_type: "organization",
    entity_id: profile.org_id,
    metadata: warning ? { paystack_cancel_failed: warning } : undefined,
  });

  return warning ? { success: true, warning } : { success: true };
}
