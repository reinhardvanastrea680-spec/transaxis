#!/usr/bin/env node
/**
 * Creates the 9 Paystack plans (3 plans × 3 cycles, NGN) from the price table
 * and prints the PAYSTACK_PLAN_CODES env var.
 *
 * Usage:
 *   node scripts/create-paystack-plans.ts sk_test_xxx
 *
 * Idempotent-ish: it does not dedupe against existing plans, so run it once
 * per key. Re-running creates duplicates on Paystack's side — delete strays
 * from the dashboard.
 */

import {
  PRICE_TABLE,
  SELLABLE_PLANS,
  formatNaira,
  type BillingCycle,
} from "../src/lib/plans.ts";

const CYCLES: BillingCycle[] = ["monthly", "quarterly", "annual"];
const CYCLE_PAYSTACK_INTERVAL: Record<BillingCycle, string> = {
  monthly: "monthly",
  quarterly: "quarterly",
  annual: "annually",
};
const CYCLE_WORD: Record<BillingCycle, string> = {
  monthly: "monthly",
  quarterly: "quarterly",
  annual: "yearly",
};

const key = process.argv[2]?.trim();
if (!key || !key.startsWith("sk_")) {
  console.error("Usage: node scripts/create-paystack-plans.ts <paystack-secret-key>");
  process.exit(1);
}

const LABELS: Record<string, string> = {
  standard: "Standard",
  pro: "Pro",
  max: "Max",
};

const codes: Record<string, string> = {};
let created = 0;

for (const plan of SELLABLE_PLANS) {
  for (const cycle of CYCLES) {
    const amount = PRICE_TABLE[plan][cycle];
    const name = `Transaxis ${LABELS[plan]} — ${formatNaira(amount)} ${CYCLE_WORD[cycle]}`;

    const res = await fetch("https://api.paystack.co/plan", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        name,
        amount,
        currency: "NGN",
        interval: CYCLE_PAYSTACK_INTERVAL[cycle],
        description: `Transaxis ${LABELS[plan]} plan, billed ${CYCLE_WORD[cycle]}`,
      }),
    });

    const json = (await res.json().catch(() => null)) as {
      status?: boolean;
      message?: string;
      data?: { plan_code?: string };
    } | null;

    if (!res.ok || !json?.status || !json.data?.plan_code) {
      console.error(`FAIL  ${plan}:${cycle} — ${json?.message ?? res.status}`);
      process.exit(1);
    }

    codes[`${plan}:${cycle}`] = json.data.plan_code;
    created++;
    console.log(`ok    ${plan}:${cycle} -> ${json.data.plan_code}`);
  }
}

console.log(`\n${created} plans created.\n`);
console.log("Add this to Vercel + .env.local:\n");
console.log(`PAYSTACK_PLAN_CODES=${JSON.stringify(codes)}`);
