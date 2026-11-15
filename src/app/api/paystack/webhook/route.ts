/**
 * Paystack webhook — the primary way a plan gets turned on.
 *
 * Paystack signs the raw request body with HMAC-SHA512 using the secret key and
 * sends the digest in `x-paystack-signature`. We verify that before touching
 * the database, so a forged request cannot hand out a paid plan.
 *
 * Configure the endpoint in Paystack → Settings → API Keys & Webhooks:
 *   https://<your-domain>/api/paystack/webhook
 *
 * The writes themselves live in `@/lib/paystack-charge`, shared with the
 * return trip from checkout (`/billing?verify=1`). A webhook can be missed —
 * one failed delivery and a paying customer sits on free with no retry — so
 * there are two paths to the same upgrade, and they apply the same fields.
 */

import { createHmac, timingSafeEqual } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { isPaidPlan, type PaidPlanId } from "@/lib/plans";
import {
  applyCharge,
  findActiveSubscription,
  metadataOf,
  normaliseCycle,
  serviceClientFromEnv,
} from "@/lib/paystack-charge";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type PaystackEvent = {
  event: string;
  data: {
    reference?: string;
    customer?: { customer_code?: string; email?: string };
    subscription_code?: string;
    plan?: { plan_code?: string };
    metadata?: Record<string, unknown> | string;
    status?: string;
  };
};

/**
 * Paystack's subscription lifecycle events (`subscription.disable`,
 * `subscription.not_renew`) do not carry the metadata from the checkout that
 * created the subscription — so `org_id` is often missing on exactly the
 * events that decide whether access ends. Resolve the organization from the
 * codes stored on it at charge time instead.
 */
async function resolveOrgId(
  supabase: SupabaseClient,
  event: PaystackEvent,
): Promise<string | null> {
  const meta = metadataOf(event.data?.metadata);
  if (typeof meta.org_id === "string" && meta.org_id) return meta.org_id;

  if (event.data.subscription_code) {
    const { data } = await supabase
      .from("organizations")
      .select("id")
      .eq("paystack_subscription_code", event.data.subscription_code)
      .maybeSingle();
    if (data?.id) return data.id as string;
  }

  if (event.data.customer?.customer_code) {
    const { data } = await supabase
      .from("organizations")
      .select("id")
      .eq("paystack_customer_code", event.data.customer.customer_code)
      .maybeSingle();
    if (data?.id) return data.id as string;
  }

  return null;
}

export async function POST(request: Request) {
  const secret = process.env.PAYSTACK_SECRET_KEY;
  if (!secret) {
    return new Response("Paystack is not configured", { status: 500 });
  }

  const raw = await request.text();
  const signature = request.headers.get("x-paystack-signature") ?? "";

  const expected = createHmac("sha512", secret).update(raw).digest("hex");
  const expectedBuf = Buffer.from(expected, "utf8");
  const providedBuf = Buffer.from(signature, "utf8");

  if (
    expectedBuf.length !== providedBuf.length ||
    !timingSafeEqual(expectedBuf, providedBuf)
  ) {
    return new Response("Invalid signature", { status: 401 });
  }

  let event: PaystackEvent;
  try {
    event = JSON.parse(raw) as PaystackEvent;
  } catch {
    return new Response("Invalid payload", { status: 400 });
  }

  const supabase = serviceClientFromEnv();
  if (!supabase) {
    return new Response("Database is not configured", { status: 500 });
  }

  const meta = metadataOf(event.data?.metadata);
  // Resolves from checkout metadata when present; falls back to the stored
  // subscription/customer codes for lifecycle events that omit metadata.
  const orgId = await resolveOrgId(supabase, event);

  try {
    switch (event.event) {
      case "charge.success": {
        if (!orgId) break;
        const paidPlan = meta.plan;
        if (typeof paidPlan !== "string" || !isPaidPlan(paidPlan as PaidPlanId)) {
          break;
        }
        const reference = event.data.reference ?? "";
        if (!reference) break;

        // A one-off charge carries no subscription, so the code is looked up
        // rather than taken as null — `applyCharge` keeps an existing code when
        // it is given nothing to replace it with.
        const subscriptionCode =
          event.data.subscription_code ??
          (await findActiveSubscription(
            secret,
            event.data.customer?.customer_code,
            event.data.plan?.plan_code,
          ));

        await applyCharge(
          supabase,
          {
            reference,
            orgId,
            plan: paidPlan as PaidPlanId,
            cycle: normaliseCycle(meta.cycle),
            customerCode: event.data.customer?.customer_code ?? null,
            planCode: event.data.plan?.plan_code ?? null,
            subscriptionCode,
          },
          "webhook",
        );
        break;
      }

      case "subscription.create": {
        if (!orgId) break;
        await supabase
          .from("organizations")
          .update({ paystack_subscription_code: event.data.subscription_code ?? null })
          .eq("id", orgId);
        break;
      }

      case "subscription.disable":
      case "subscription.not_renew": {
        if (!orgId) break;
        // Access ends when the paid period does. `resolvePlanId` already falls
        // back to free once `plan_renews_at` is in the past, so all we do here
        // is stop the clock.
        await supabase
          .from("organizations")
          .update({ plan_renews_at: new Date().toISOString() })
          .eq("id", orgId);

        await supabase.from("audit_logs").insert({
          org_id: orgId,
          action: "billing.subscription_ended",
          entity_type: "organization",
          entity_id: orgId,
          metadata: { event: event.event },
        });
        break;
      }

      case "invoice.payment_failed": {
        if (!orgId) break;
        await supabase.from("audit_logs").insert({
          org_id: orgId,
          action: "billing.payment_failed",
          entity_type: "organization",
          entity_id: orgId,
          metadata: { reference: event.data.reference ?? null },
        });
        break;
      }

      default:
        break;
    }
  } catch {
    // Never 500 on an event we merely failed to record — Paystack would retry
    // and we would keep failing. The audit log is the place to investigate.
    return new Response("Handled with errors", { status: 200 });
  }

  return new Response("OK", { status: 200 });
}
