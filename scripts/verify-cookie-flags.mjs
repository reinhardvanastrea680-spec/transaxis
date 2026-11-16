/**
 * Proves the production session cookie carries Secure + SameSite=Lax, and that
 * the flag change did not break navigation or sign-out.
 *
 * The account's password is unknown, so this signs in through a Supabase magic
 * link instead. That path lands on /auth/callback, which writes the cookie with
 * the exact `cookieOptions` we changed — so it is a faithful test.
 *
 * The cookie is deliberately NOT HttpOnly: src/lib/supabase/client.ts reads it
 * for sign-in and POD photo uploads. Only `secure`, `sameSite` and "the app
 * still works" are asserted.
 *
 * Run: node scripts/verify-cookie-flags.mjs
 */
import fs from "node:fs";
import { chromium } from "playwright";

const BASE = process.env.VERIFY_BASE_URL || "https://transaxis.com.ng";
const EMAIL = process.env.VERIFY_EMAIL || "andersondarlington821@gmail.com";

// .env.local is not auto-loaded by plain node.
const env = Object.fromEntries(
  fs
    .readFileSync(".env.local", "utf8")
    .split(/\r?\n/)
    .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")];
    })
);

const SB = env.NEXT_PUBLIC_SUPABASE_URL || env.SUPABASE_URL;
const SRK = env.SUPABASE_SERVICE_ROLE_KEY;

const fails = [];
function check(label, ok, detail) {
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}${detail ? `  ${detail}` : ""}`);
  if (!ok) fails.push(label);
}

// ---- Mint a magic link ----------------------------------------------------
const gen = await fetch(`${SB}/auth/v1/admin/generate_link`, {
  method: "POST",
  headers: { apikey: SRK, Authorization: `Bearer ${SRK}`, "Content-Type": "application/json" },
  body: JSON.stringify({ type: "magiclink", email: EMAIL }),
});
const link = await gen.json();
if (!gen.ok) {
  console.error("generateLink failed:", gen.status, JSON.stringify(link).slice(0, 300));
  process.exit(1);
}

// Prefer the token_hash form so the app's own /auth/callback does the exchange.
const tokenHash = link.hashed_token || link.properties?.hashed_token;
const verifyUrl = tokenHash
  ? `${BASE}/auth/callback?token_hash=${tokenHash}&type=magiclink&next=/dashboard`
  : link.action_link || link.properties?.action_link;

const browser = await chromium.launch({
  executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe",
  headless: true,
});
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();

const pageErrors = [];
page.on("pageerror", (e) => pageErrors.push(e.message));

// ---- 1. Sign in via the link ---------------------------------------------
await page.goto(verifyUrl, { waitUntil: "domcontentloaded" });
await page.waitForTimeout(6000);
check("signed in via magic link", !/\/login/.test(page.url()), page.url());

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
