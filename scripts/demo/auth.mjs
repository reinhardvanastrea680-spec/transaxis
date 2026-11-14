/**
 * Refreshes the saved browser session used by record.mjs.
 *
 * Supabase access tokens expire after an hour, so a long recording session can
 * die halfway through and every section silently redirects to /login. Run this
 * first whenever the recordings start failing on "element not found".
 *
 * Run: node scripts/demo/auth.mjs
 * Out: $DEMO_STATE_FILE (default: %TEMP%/state-owner2.json)
 */
import fs from "node:fs";
import { chromium } from "playwright";

const BASE = process.env.DEMO_BASE_URL || "https://transaxis.com.ng";
const STATE =
  process.env.DEMO_STATE_FILE || "C:/Users/HP/AppData/Local/Temp/state-owner2.json";
const EMAIL = process.env.DEMO_EMAIL || "andersondarlington821@gmail.com";
const PASSWORD = process.env.DEMO_PASSWORD || "Anderxon";

const browser = await chromium.launch({
  executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe",
  headless: true,
});
const ctx = await browser.newContext({ viewport: { width: 1440, height: 810 } });
const page = await ctx.newPage();

await page.goto(BASE + "/login", { waitUntil: "domcontentloaded" });
await page.locator('input[type="email"]').first().fill(EMAIL);
await page.locator('input[type="password"]').first().fill(PASSWORD);
await page.getByRole("button", { name: /^Sign in$/ }).first().click();

await page.waitForURL(/\/dashboard|\/onboarding/, { timeout: 45000 });
console.log("signed in:", page.url());

// Accept cookies once so the banner never appears in the recording.
await page.waitForTimeout(1200);
const accept = page.getByRole("button", { name: "Accept all" });
if (await accept.count()) {
  await accept.first().click();
  await page.waitForTimeout(600);
}

await page.getByRole("button", { name: "Sign out" }).first().waitFor({ timeout: 20000 });
await ctx.storageState({ path: STATE });
console.log("session saved to", STATE, `(${fs.statSync(STATE).size} bytes)`);

await browser.close();
