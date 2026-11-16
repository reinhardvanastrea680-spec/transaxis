/**
 * Checks the live site the way a crawler and a link-preview scraper see it.
 *
 * Verifies, per public page: the canonical points at that page (not the
 * homepage), exactly one h1 exists, and the JSON-LD parses. Then confirms the
 * inline JSON-LD script does not trip the CSP.
 *
 * Run: node scripts/verify-seo.mjs
 */
import { chromium } from "playwright";

const BASE = process.env.SEO_BASE_URL || "https://transaxis.com.ng";
const PAGES = ["/", "/privacy", "/terms", "/cookies"];
const EXPECT_JSONLD = { "/": 4 };

const fails = [];
function check(label, ok, detail) {
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}${detail ? `  ${detail}` : ""}`);
  if (!ok) fails.push(label);
}

const browser = await chromium.launch({
  executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe",
  headless: true,
});
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

const pageErrors = [];
const cspViolations = [];
page.on("pageerror", (e) => pageErrors.push(e.message));
page.on("console", (m) => {
  if (/content security policy/i.test(m.text())) cspViolations.push(m.text().slice(0, 160));
});

for (const path of PAGES) {
  await page.goto(BASE + path, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(1200);

  const info = await page.evaluate(() => {
    const script = document.querySelector('script[type="application/ld+json"]');
    let types = null;
    if (script) {
      try {
        const parsed = JSON.parse(script.textContent);
        types = (Array.isArray(parsed) ? parsed : [parsed]).map((x) => x["@type"]);
      } catch {
        types = "PARSE ERROR";
      }
    }
    return {
      canonical: document.querySelector('link[rel="canonical"]')?.href ?? null,
      h1: document.querySelectorAll("h1").length,
      ogImage: document.querySelector('meta[property="og:image"]')?.content ?? null,
      robots: document.querySelector('meta[name="robots"]')?.content ?? null,
      types,
    };
  });

  // The root canonical is emitted with a trailing slash, which is correct and
  // equivalent for Google, so compare with the slash normalised away.
  const expected = (BASE + path).replace(/\/$/, "");
  const actual = (info.canonical ?? "").replace(/\/$/, "");
  check(`${path} canonical is itself`, actual === expected, info.canonical);
  check(`${path} has exactly one h1`, info.h1 === 1, `${info.h1}`);
  check(`${path} og:image is absolute`, /^https:\/\//.test(info.ogImage ?? ""), info.ogImage);
  check(`${path} is indexable`, /index/.test(info.robots ?? ""), info.robots);

  const want = EXPECT_JSONLD[path];
  if (want) {
    check(`${path} emits ${want} JSON-LD blocks`, Array.isArray(info.types) && info.types.length === want, JSON.stringify(info.types));
  } else {
    check(`${path} has no invalid JSON-LD`, info.types !== "PARSE ERROR");
  }
}

// Assets a crawler or scraper fetches directly.
for (const [path, type] of [
  ["/robots.txt", "text/plain"],
  ["/sitemap.xml", "xml"],
  ["/og.png", "image/png"],
]) {
  const res = await fetch(BASE + path);
  const body = type === "xml" ? await res.text() : "";
  check(
    `${path} serves ${type}`,
    res.ok && (res.headers.get("content-type") ?? "").includes(type),
    `${res.status} ${res.headers.get("content-type")}`
  );
  if (path === "/sitemap.xml") {
    check("sitemap lists the homepage", body.includes(`<loc>${BASE}/</loc>`));
    check("sitemap excludes private routes", !/\/dashboard|\/billing/.test(body));
  }
}

check("no uncaught page errors", pageErrors.length === 0, pageErrors.join(" | "));
check("no CSP violations", cspViolations.length === 0, cspViolations.join(" | "));

// ---- Every URL the sitemap advertises must actually be indexable ----------
// A 404 or a stray noindex in the sitemap is the fastest way to lose trust with
// a crawler, and it is invisible unless something checks.
const sitemapXml = await (await fetch(`${BASE}/sitemap.xml`)).text();
const locs = [...sitemapXml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
console.log(`\n--- sitemap advertises ${locs.length} URLs ---`);

for (const loc of locs) {
  const res = await fetch(loc);
  const html = await res.text();
  const meta = /<meta name="robots" content="([^"]+)"/.exec(html)?.[1] ?? "";
  const canonical = /<link rel="canonical" href="([^"]+)"/.exec(html)?.[1] ?? "";
  const path = new URL(loc).pathname;
  check(
    `${path} is 200 and indexable`,
    res.status === 200 && !/noindex/i.test(meta) && canonical.replace(/\/$/, "") === loc.replace(/\/$/, ""),
    `http ${res.status}, robots="${meta}", canonical=${canonical || "(none)"}`
  );
}

await browser.close();

// ---- robots.txt must not block anything the sitemap advertises -------------
// This is the check that was missing. `Disallow: /inventory` is a *prefix*
// match, so it silently blocked /inventory-software-nigeria while every other
// assertion still passed — the page returned 200, had a canonical and a
// noindex-free meta tag, and was simply uncrawlable.
const robotsTxt = await (await fetch(`${BASE}/robots.txt`)).text();

/** Google's matching: prefix by default, `$` anchors the end, `*` is a wildcard. */
function ruleToRegex(rule) {
  const anchored = rule.endsWith("$");
  const body = anchored ? rule.slice(0, -1) : rule;
  const escaped = body
    .replace(/[.+?^${}()|[\]\\]/g, "\\$&")
    .replace(/\*/g, ".*");
  return new RegExp(`^${escaped}${anchored ? "$" : ".*"}`);
}

/** Longest matching rule wins; Allow wins a tie. */
function robotsAllows(path) {
  let best = null;
  for (const line of robotsTxt.split(/\r?\n/)) {
    const match = /^(allow|disallow):\s*(\S*)/i.exec(line.trim());
    if (!match) continue;
    const [, kind, rule] = match;
    if (!rule) continue; // "Disallow:" with nothing after it means allow all
    if (!ruleToRegex(rule).test(path)) continue;
    const candidate = { length: rule.length, allowed: kind.toLowerCase() === "allow" };
    if (
      !best ||
      candidate.length > best.length ||
      (candidate.length === best.length && candidate.allowed)
    ) {
      best = candidate;
    }
  }
  return best ? best.allowed : true;
}

console.log(`\n--- robots.txt vs sitemap ---`);
for (const loc of locs) {
  const path = new URL(loc).pathname;
  check(`${path} is not blocked by robots.txt`, robotsAllows(path));
}

// The private routes must still be blocked — a fix that opens the app up is not
// a fix.
for (const path of ["/inventory", "/inventory/abc", "/dispatch", "/dashboard"]) {
  check(`${path} is still disallowed`, robotsAllows(path) === false);
}

console.log(
  `\n${fails.length ? `FAILED (${fails.length}): ${fails.join(", ")}` : "ALL CHECKS PASSED"}`
);
process.exit(fails.length ? 1 : 0);
