#!/usr/bin/env node
/**
 * Browser-free test charge via Paystack's /charge API.
 *
 *   node scripts/paystack-direct-charge.mjs <org_id> [plan] [cycle]
 *
 * The hosted checkout is the real customer path, but it needs a browser. This
 * drives the same test card straight through the API — charge → PIN → OTP —
 * which is enough to make Paystack deliver a real `charge.success` webhook.
 *
 * Difference from the hosted flow: /charge has no plan support, so no
 * subscription is created. `subscription.create` therefore cannot be tested
 * this way; use the checkout for that.
 */

import fs from "node:fs";

const API = "https://api.paystack.co";
const CARD = { number: "4084084084084081", cvv: "408", expiry_month: "12", expiry_year: "30" };
const PIN = "0000";
const OTP = "123456";

function loadEnv(path = ".env.local") {
  const out = {};
  for (const line of fs.readFileSync(path, "utf8").split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m) out[m[1]] = m[2].trim().replace(/^["']|["']$/g, "");
  }
  return out;
}

const env = loadEnv();
const secret = (process.env.PAYSTACK_SECRET_KEY || env.PAYSTACK_SECRET_KEY || "").trim();
if (!secret.startsWith("sk_test_")) {
  console.error("Refusing to run without an sk_test_ key.");
  process.exit(1);
}

const [orgId, plan = "standard", cycle = "monthly"] = process.argv.slice(2);
if (!orgId) {
  console.error("usage: paystack-direct-charge.mjs <org_id> [plan] [cycle]");
  process.exit(1);
}

const prices = {
  "standard:monthly": 3_500_000,
  "pro:monthly": 6_000_000,
  "max:monthly": 8_500_000,
};
const amount = prices[`${plan}:${cycle}`] ?? 3_500_000;

async function call(path, body) {
  const res = await fetch(`${API}${path}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${secret}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = await res.json();
  return json;
}

const email = process.env.CHARGE_EMAIL || "test@transaxis.com.ng";

let json = await call("/charge", {
  email,
  amount,
  currency: "NGN",
  card: CARD,
  pin: PIN,
  metadata: { org_id: orgId, plan, cycle, plan_label: plan },
});

console.log("charge ->", json.status, json.data?.status ?? json.message);
const reference = json.data?.reference;

if (json.data?.status === "send_pin") {
  json = await call("/charge/submit_pin", { reference, pin: PIN });
  console.log("pin    ->", json.status, json.data?.status ?? json.message);
}

if (json.data?.status === "send_otp" || json.data?.status === "open_url") {
  json = await call("/charge/submit_otp", { reference, otp: OTP });
  console.log("otp    ->", json.status, json.data?.status ?? json.message);
}

console.log("final  ->", JSON.stringify(json.data ?? json, null, 1).slice(0, 900));
