/**
 * Paystack webhook — the only thing allowed to turn a plan on or off.
 *
 * Paystack signs the raw request body with HMAC-SHA512 using the secret key and
 * sends the digest in `x-paystack-signature`. We verify that before touching the
 * database, so a forged request cannot hand out a paid plan.
 *
 * Configure the endpoint in Paystack → Settings → API Keys & Webhooks:
 *   https://<your-domain>/api/paystack/webhook
 */

import { createHmac, timingSafeEqual } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type PaystackMetadata = {
  org_id?: string;
  plan?: string;
  cycle?: string;
};

type PaystackEvent = {
  event: string;
  data: {
    reference?: string;
    customer?: { customer_code?: string; email?: string };
    subscription_code?: string;
    plan?: { plan_code?: string };
    metadata?: PaystackMetadata | string;
    status?: string;
  };
};

function serviceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

function parseMetadata(meta: PaystackEvent["data"]["metadata"]): PaystackMetadata {
  if (!meta) return {};
  if (typeof meta === "string") {
    try {
      return JSON.parse(meta) as PaystackMetadata;
    } catch {
      return {};
    }
  }
  return meta;
}

function renewalDate(cycle: string | undefined): string {
  const date = new Date();
  if (cycle === "annual") {
    date.setFullYear(date.getFullYear() + 1);
  } else {
    date.setMonth(date.getMonth() + 1);
  }
  return date.toISOString();
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

  const supabase = serviceClient();
  if (!supabase) {
    return new Response("Database is not configured", { status: 500 });
  }

  const meta = parseMetadata(event.data?.metadata);
  const orgId = meta.org_id;

  try {
    switch (event.event) {
      case "charge.success": {
        if (!orgId || (meta.plan !== "growth" && meta.plan !== "operations")) {
          break;
        }

        const cycle = meta.cycle === "annual" ? "annual" : "monthly";

        await supabase
          .from("organizations")
          .update({
            plan: meta.plan,
            billing_cycle: cycle,
            plan_renews_at: renewalDate(cycle),
            paystack_customer_code: event.data.customer?.customer_code ?? null,
            paystack_subscription_code: event.data.subscription_code ?? null,
            paystack_reference: event.data.reference ?? null,
          })
          .eq("id", orgId);

        await supabase.from("audit_logs").insert({
          org_id: orgId,
          action: "billing.payment_succeeded",
          entity_type: "organization",
          entity_id: orgId,
          metadata: {
            plan: meta.plan,
            cycle,
            reference: event.data.reference ?? null,
          },
        });
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
