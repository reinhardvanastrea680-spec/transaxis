/**
 * Proves the production session cookie carries Secure + SameSite=Lax, and that
 * the flag change did not break sign-in, navigation, or sign-out.
 *
 * The cookie is deliberately NOT HttpOnly: src/lib/supabase/client.ts reads it
 * for sign-in and POD photo uploads. So the only assertions that matter here
 * are `secure`, `sameSite`, and "the app still works".
 *
 * Run: node scripts/verify-cookie-flags.mjs
 *
 * Credentials come from the environment or .env.local — never hardcoded, since
 * this repository is public. See scripts/demo/credentials.mjs.
 */
import { chromium } from "playwright";
import { credentials } from "./demo/credentials.mjs";

const BASE = process.env.VERIFY_BASE_URL || "https://transaxis.com.ng";
const { email: EMAIL, password: PASSWORD } = credentials();

const fails = [];
function check(label, ok, detail) {
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}${detail ? `  ${detail}` : ""}`);
  if (!ok) fails.push(label);
}

const browser = await chromium.launch({
  executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe",
  headless: true,
});
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();

const pageErrors = [];
page.on("pageerror", (e) => pageErrors.push(e.message));

// ---- 1. Sign in with the password ----------------------------------------
await page.goto(BASE + "/login", { waitUntil: "domcontentloaded" });
await page.locator('input[type="email"]').first().fill(EMAIL);
await page.locator('input[type="password"]').first().fill(PASSWORD);
await page.getByRole("button", { name: /^Sign in$/ }).first().click();

try {
  await page.waitForURL(/\/dashboard|\/onboarding/, { timeout: 45000 });
} catch {
  const body = await page.locator("body").innerText();
  console.error("sign-in did not navigate. Page says:", body.slice(0, 300));
}
check("sign-in still works", /\/dashboard|\/onboarding/.test(page.url()), page.url());
await page.waitForTimeout(1500);

const cookies = await ctx.cookies();
const auth = cookies.filter((c) => c.name.includes("auth-token") && c.value);

console.log("\n--- cookies set by the app ---");
for (const c of cookies) {
  console.log(
    `  ${c.name}  secure=${c.secure} httpOnly=${c.httpOnly} sameSite=${c.sameSite} path=${c.path} domain=${c.domain}`
  );
}
console.log("");

check("an auth cookie exists", auth.length > 0, `${auth.length} chunk(s)`);
check("every auth cookie is Secure", auth.length > 0 && auth.every((c) => c.secure === true));
check(
  "every auth cookie is SameSite=Lax",
  auth.length > 0 && auth.every((c) => /^lax$/i.test(c.sameSite)),
  auth.map((c) => c.sameSite).join(",")
);
check("auth cookie is scoped to /", auth.length > 0 && auth.every((c) => c.path === "/"));

// HttpOnly is expected to be false — record the trade-off explicitly.
const jsVisible = await page.evaluate(() =>
  document.cookie.split("; ").filter((c) => c.startsWith("sb-")).map((c) => c.split("=")[0])
);
check(
  "auth cookie readable by JS (known trade-off, documented)",
  jsVisible.length > 0,
  jsVisible.join(",")
);

// ---- 2. The app still functions ------------------------------------------
for (const path of ["/dashboard", "/inventory", "/dispatch", "/billing"]) {
  const res = await page.goto(BASE + path, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(1500);
  const text = await page.locator("body").innerText();
  check(
    `${path} renders signed-in`,
    res.status() === 200 && !/invalid login|sign in to your/i.test(text.slice(0, 400)),
    `http ${res.status()}`
  );
}

// ---- 3. Sign out clears the session --------------------------------------
await page.goto(BASE + "/dashboard", { waitUntil: "domcontentloaded" });
await page.waitForTimeout(1500);
const signOut = page.getByRole("button", { name: "Sign out" }).first();
if (await signOut.count()) {
  await signOut.click();
  await page.waitForTimeout(3500);
  const after = await ctx.cookies();
  const left = after.filter((c) => c.name.includes("auth-token") && c.value);
  check("sign-out clears the auth cookie", left.length === 0, `${left.length} left`);
} else {
  check("sign-out button found", false);
}

check("no uncaught page errors", pageErrors.length === 0, pageErrors.join(" | "));

await browser.close();
console.log(
  `\n${fails.length ? `FAILED (${fails.length}): ${fails.join(", ")}` : "ALL CHECKS PASSED"}`
);
process.exit(fails.length ? 1 : 0);
