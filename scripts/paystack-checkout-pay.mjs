#!/usr/bin/env node
/**
 * Pays a Paystack hosted-checkout URL with the documented test card.
 *
 *   node scripts/paystack-checkout-pay.mjs <authorization_url> [--inspect]
 *
 * Test credentials (Paystack docs):
 *   card 4084 0840 8408 4081 · CVV 408 · any future expiry · PIN 0000 · OTP 123456
 *
 * `--inspect` only dumps the form fields and screenshots, so the selectors can
 * be checked before anything is submitted.
 */

import { chromium } from "playwright";

const url = process.argv[2];
const inspect = process.argv.includes("--inspect");
if (!url) {
  console.error("usage: paystack-checkout-pay.mjs <authorization_url> [--inspect]");
  process.exit(1);
}

const CARD = "4084084084084081";
const CVV = "408";
const EXP = "12/30";
const PIN = "0000";
const OTP = "123456";

const shot = (page, name) => page.screenshot({ path: `/tmp/ps-${name}.png`, fullPage: false });

// checkout.paystack.com sits behind Cloudflare Turnstile, which headless
// Chromium usually fails. HEADED=1 opens a real window (and uses the installed
// Chrome when available) so the challenge can pass.
const headed = process.env.HEADED === "1";
const browser = await chromium.launch({
  headless: !headed,
  channel: headed ? "chrome" : undefined,
  args: ["--disable-blink-features=AutomationControlled"],
});
const ctx = await browser.newContext({
  viewport: { width: 1280, height: 900 },
  locale: "en-NG",
  userAgent:
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
});
const page = await ctx.newPage();
page.on("console", (m) => {
  if (m.type() === "error") console.log("  [console]", m.text().slice(0, 160));
});

console.log("opening", url, headed ? "(headed)" : "(headless)");
// `networkidle` never settles on this page — the Turnstile widget polls forever.
await page.goto(url, { waitUntil: "domcontentloaded", timeout: 90_000 });
await page.waitForTimeout(4000);
await shot(page, "1-landing");

const inputs = await page.$$eval("input", (els) =>
  els.map((e) => ({
    name: e.name || null,
    id: e.id || null,
    placeholder: e.placeholder || null,
    type: e.type,
    visible: !!(e.offsetWidth || e.offsetHeight),
  })),
);
console.log("inputs:", JSON.stringify(inputs, null, 1));

const buttons = await page.$$eval("button", (els) =>
  els.map((e) => ({ text: (e.innerText || "").trim().slice(0, 40), visible: !!(e.offsetWidth || e.offsetHeight) })),
);
console.log("buttons:", JSON.stringify(buttons.filter((b) => b.visible), null, 1));
console.log("url now:", page.url());

if (inspect) {
  await browser.close();
  process.exit(0);
}

async function fill(selectors, value, label) {
  for (const sel of selectors) {
    const el = page.locator(sel).first();
    if ((await el.count()) && (await el.isVisible().catch(() => false))) {
      await el.click();
      await el.fill("");
      await el.type(value, { delay: 40 });
      console.log(`  filled ${label} via ${sel}`);
      return true;
    }
  }
  console.log(`  !! could not find ${label}`);
  return false;
}

// In test mode Paystack replaces the card form with a simulator: pick a
// scenario (Success / Bank Authentication / Declined) and press Pay. Real card
// fields only appear for live keys, so try the simulator first.
const successOption = page.getByText("Success", { exact: true }).first();
const simulated = (await successOption.count()) > 0;

if (simulated) {
  console.log("test-mode simulator detected");
  await successOption.click();
  await shot(page, "2-success-selected");
  await page.getByRole("button", { name: /^Pay NGN/i }).first().click();
  console.log("clicked Pay");
  await page.waitForTimeout(6000);
  await shot(page, "3-after-pay");
} else {
  // The card form is the default tab on checkout.paystack.com.
  await fill(
    [
      'input[name="cardnumber"]',
      'input[autocomplete="cc-number"]',
      'input[placeholder*="Card number" i]',
      'input[placeholder*="0000" i]',
    ],
    CARD,
    "card number",
  );
  await fill(
    ['input[name="exp-date"]', 'input[autocomplete="cc-exp"]', 'input[placeholder*="MM" i]'],
    EXP,
    "expiry",
  );
  await fill(['input[name="cvc"]', 'input[autocomplete="cc-csc"]', 'input[placeholder*="CVV" i]', 'input[placeholder*="CVC" i]'], CVV, "cvv");
  await shot(page, "2-filled");

  const pay = page.getByRole("button", { name: /^pay/i }).first();
  if (await pay.count()) {
    await pay.click();
    console.log("clicked Pay");
  } else {
    console.log("!! no Pay button found");
  }

  await page.waitForTimeout(4000);
  await shot(page, "3-after-pay");

  // PIN, then OTP, then the success screen — each is a separate step.
  for (const [value, name] of [
    [PIN, "pin"],
    [OTP, "otp"],
  ]) {
    const field = page.locator('input[type="tel"], input[type="text"], input[inputmode="numeric"]').first();
    const visible = (await field.count()) && (await field.isVisible().catch(() => false));
    if (!visible) {
      console.log(`  no ${name} field (skipped)`);
      continue;
    }
    await field.click();
    await field.type(value, { delay: 80 });
    await page.waitForTimeout(1200);
    const submit = page.getByRole("button", { name: /pay|verify|submit|continue|confirm/i }).first();
    if (await submit.count()) await submit.click().catch(() => {});
    console.log(`  submitted ${name}`);
    await page.waitForTimeout(5000);
    await shot(page, `4-${name}`);
  }
}

await page.waitForTimeout(3000);
await shot(page, "5-final");
console.log("final url:", page.url());
const body = (await page.locator("body").innerText().catch(() => "")).replace(/\s+/g, " ").slice(0, 400);
console.log("page says:", body);

await browser.close();
