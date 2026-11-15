#!/usr/bin/env node
/**
 * Test-mode Paystack driver.
 *
 *   node scripts/paystack-test-charge.mjs --orgs
 *       List organizations and their current plan.
 *
 *   node scripts/paystack-test-charge.mjs --check-webhook
 *       Send a correctly-signed `transfer.success` event to the deployed
 *       webhook. That event hits the handler's `default` branch, so nothing is
 *       written. A 200 proves the secret on Vercel matches the one in
 *       .env.local; a 401 means the deployed key is different (or live).
 *
 *   node scripts/paystack-test-charge.mjs --init <plan> <cycle>
 *       Initialize a real test-mode transaction for the first organization,
 *       attaching the plan code so a subscription is created too. Prints the
 *       hosted checkout URL and the reference to watch.
 *
 * Nothing here can move money: it refuses to run against a live key.
 */

import fs from "node:fs";
import crypto from "node:crypto";
import { createClient } from "@supabase/supabase-js";

const SITE = process.env.SITE_URL || "https://transaxis.com.ng";
const API = "https://api.paystack.co";

function loadEnv(path = ".env.local") {
  if (!fs.existsSync(path)) return {};
  const out = {};
  for (const line of fs.readFileSync(path, "utf8").split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (!m) continue;
    let v = m[2].trim();
    if (
      (v.startsWith('"') && v.endsWith('"')) ||
      (v.startsWith("'") && v.endsWith("'"))
    ) {
      v = v.slice(1, -1);
    }
    out[m[1]] = v;
  }
  return out;
}

const env = loadEnv();
const secret = (process.env.PAYSTACK_SECRET_KEY || env.PAYSTACK_SECRET_KEY || "").trim();

function requireTestKey() {
  if (!secret) {
    console.error("PAYSTACK_SECRET_KEY is missing from .env.local");
    process.exit(1);
  }
  if (!secret.startsWith("sk_test_")) {
    console.error(
      `Refusing to run: the key is ${secret.slice(0, 8)}…, not sk_test_. ` +
        "This script only ever drives test mode.",
    );
    process.exit(1);
  }
}

function service() {
  const url = env.NEXT_PUBLIC_SUPABASE_URL;
  const key = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error("Supabase service-role credentials missing from .env.local");
    process.exit(1);
  }
  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

function planCodes() {
  try {
    return JSON.parse(env.PAYSTACK_PLAN_CODES || "{}");
  } catch {
    return {};
  }
}

async function listOrgs() {
  const db = service();
  const { data, error } = await db
    .from("organizations")
    .select("id, name, plan, billing_cycle, plan_renews_at, paystack_reference, paystack_subscription_code, paystack_customer_code")
    .order("name", { ascending: true });

  if (error) {
    console.error(error.message);
    process.exit(1);
  }
  for (const o of data) {
    console.log(
      `${o.plan.padEnd(9)} ${o.id}  ${o.name}` +
        (o.plan_renews_at ? `  renews ${o.plan_renews_at.slice(0, 10)}` : "") +
        (o.paystack_subscription_code ? `  sub ${o.paystack_subscription_code}` : ""),
    );
  }
}

async function checkWebhook() {
  const body = JSON.stringify({
    event: "transfer.success",
    data: { reference: `sigcheck_${Date.now()}`, status: "success" },
  });
  const signature = crypto.createHmac("sha512", secret).update(body).digest("hex");

  const res = await fetch(`${SITE}/api/paystack/webhook`, {
    method: "POST",
    headers: {
      "x-paystack-signature": signature,
      "Content-Type": "application/json",
    },
    body,
  });
  const text = await res.text();

  console.log(`POST ${SITE}/api/paystack/webhook -> ${res.status} ${text}`);
  if (res.status === 200) {
    console.log("✓ deployed secret matches .env.local (same key signs and verifies)");
  } else if (res.status === 401) {
    console.log("✗ deployed secret is DIFFERENT — webhooks will be rejected");
    process.exit(2);
  } else {
    console.log("? unexpected status — check the deployment logs");
    process.exit(3);
  }
}

async function init(plan, cycle) {
  const db = service();
  const { data: orgs, error } = await db
    .from("organizations")
    .select("id, name, plan")
    .order("name", { ascending: true })
    .limit(1);

  if (error || !orgs?.length) {
    console.error(error?.message || "No organizations found");
    process.exit(1);
  }
  const org = orgs[0];

  // `profiles` has no email column — the address lives in auth.users, so the
  // owner's id has to be resolved first and looked up through the admin API.
  const { data: owners } = await db
    .from("profiles")
    .select("id")
    .eq("org_id", org.id)
    .in("role", ["owner", "admin"])
    .limit(5);

  const { data: listed } = await db.auth.admin.listUsers({ perPage: 200 });
  const byId = new Map((listed?.users ?? []).map((u) => [u.id, u.email]));

  const email = (owners ?? []).map((o) => byId.get(o.id)).find(Boolean);
  if (!email) {
    console.error("No owner profile with an email for this org");
    process.exit(1);
  }

  const codes = planCodes();
  const planCode = codes[`${plan}:${cycle}`];
  // Mirrors PRICE_TABLE in src/lib/plans.ts (kobo). Only used as the payload
  // `amount`; when a plan code is attached Paystack charges the plan's own
  // price instead, so this must agree with the plan or the two will diverge.
  const prices = {
    "standard:monthly": 3_500_000,
    "standard:quarterly": 9_450_000,
    "standard:annual": 33_600_000,
    "pro:monthly": 6_000_000,
    "pro:quarterly": 16_200_000,
    "pro:annual": 57_600_000,
    "max:monthly": 8_500_000,
    "max:quarterly": 22_950_000,
    "max:annual": 81_600_000,
  };
  const amount = prices[`${plan}:${cycle}`];
  if (!amount) {
    console.error(`Unknown plan/cycle: ${plan}/${cycle}`);
    process.exit(1);
  }

  const payload = {
    email,
    amount,
    currency: "NGN",
    callback_url: `${SITE}/billing?verify=1`,
    metadata: { org_id: org.id, plan, cycle, plan_label: plan },
  };
  if (planCode) payload.plan = planCode;

  const res = await fetch(`${API}/transaction/initialize`, {
    method: "POST",
    headers: { Authorization: `Bearer ${secret}`, "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const json = await res.json();

  if (!json.status) {
    console.error("Paystack refused:", json.message);
    process.exit(1);
  }

  console.log(`org      ${org.name} (${org.id})  currently ${org.plan}`);
  console.log(`email    ${email}`);
  console.log(`plan     ${plan}/${cycle}${planCode ? ` via ${planCode}` : " (one-off)"}`);
  console.log(`amount   ₦${(amount / 100).toLocaleString()}`);
  console.log(`ref      ${json.data.reference}`);
  console.log(`url      ${json.data.authorization_url}`);
}

const [mode, a, b] = process.argv.slice(2);
if (mode === "--orgs") {
  await listOrgs();
} else if (mode === "--check-webhook") {
  requireTestKey();
  await checkWebhook();
} else if (mode === "--init") {
  requireTestKey();
  await init(a || "standard", b || "monthly");
} else {
  console.log("usage: --orgs | --check-webhook | --init <plan> <cycle>");
  process.exit(1);
}
