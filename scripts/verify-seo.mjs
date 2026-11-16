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
const EXPECT_JSONLD = { "/": 3 };

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

await browser.close();
console.log(
  `\n${fails.length ? `FAILED (${fails.length}): ${fails.join(", ")}` : "ALL CHECKS PASSED"}`
);
process.exit(fails.length ? 1 : 0);
