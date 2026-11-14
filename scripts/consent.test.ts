/**
 * Regression tests for cookie consent.
 *
 * Run with:  npm run test:consent
 *
 * The contract: consent is never assumed. A missing, stale, tampered, or
 * truncated cookie means "ask again" — never "yes". Essential cookies are not
 * part of this at all, because they cannot be refused.
 */

import assert from "node:assert/strict";
import {
  CONSENT_VERSION,
  acceptAll,
  allows,
  consentCookieAttributes,
  customConsent,
  essentialOnly,
  hasDecided,
  parseConsent,
  serializeConsent,
  supabaseAuthCookieName,
} from "../src/lib/consent.ts";

let passed = 0;
const failures: string[] = [];

function test(name: string, fn: () => void) {
  try {
    fn();
    passed++;
  } catch (error) {
    failures.push(`${name}: ${(error as Error).message}`);
  }
}

const AT = new Date("2026-11-14T09:00:00.000Z");

// ---------------------------------------------------------------------------
// Round trip
// ---------------------------------------------------------------------------

test("a serialized record parses back identically", () => {
  for (const state of [acceptAll(AT), essentialOnly(AT)]) {
    const raw = serializeConsent(state);
    assert.deepEqual(parseConsent(raw), state);
  }
});

test("accept all enables analytics", () => {
  assert.equal(parseConsent(serializeConsent(acceptAll(AT)))?.analytics, true);
});

test("essential only disables analytics", () => {
  assert.equal(parseConsent(serializeConsent(essentialOnly(AT)))?.analytics, false);
});

test("the decision timestamp is preserved", () => {
  const state = acceptAll(AT);
  assert.equal(parseConsent(serializeConsent(state))?.decidedAt, AT.toISOString());
});

test("custom consent stores the analytics choice and nothing else", () => {
  const state = customConsent({ analytics: true }, AT);
  assert.deepEqual(state, {
    version: CONSENT_VERSION,
    decidedAt: AT.toISOString(),
    analytics: true,
  });
});

// ---------------------------------------------------------------------------
// Bad input must never grant consent
// ---------------------------------------------------------------------------

test("missing cookie means no decision", () => {
  assert.equal(parseConsent(null), null);
  assert.equal(parseConsent(undefined), null);
  assert.equal(parseConsent(""), null);
});

test("garbage does not throw and does not decide", () => {
  for (const bad of ["not-json", "%%%", "{", "null", "[]", '"string"', "42"]) {
    assert.equal(parseConsent(bad), null, `expected null for ${bad}`);
  }
});

test("a record from an older version is ignored, forcing a fresh decision", () => {
  const stale = encodeURIComponent(
    JSON.stringify({ version: CONSENT_VERSION - 1, decidedAt: AT.toISOString(), analytics: true }),
  );
  assert.equal(parseConsent(stale), null);
});

test("a record missing fields is rejected", () => {
  const cases = [
    { version: CONSENT_VERSION, analytics: true },
    { version: CONSENT_VERSION, decidedAt: AT.toISOString() },
    { version: CONSENT_VERSION, decidedAt: "", analytics: true },
    { version: CONSENT_VERSION, decidedAt: "not-a-date", analytics: true },
  ];
  for (const c of cases) {
    assert.equal(parseConsent(encodeURIComponent(JSON.stringify(c))), null);
  }
});

test("a non-boolean analytics value is rejected rather than coerced", () => {
  const sneaky = encodeURIComponent(
    JSON.stringify({ version: CONSENT_VERSION, decidedAt: AT.toISOString(), analytics: "true" }),
  );
  assert.equal(parseConsent(sneaky), null);
});

// ---------------------------------------------------------------------------
// Gate
// ---------------------------------------------------------------------------

test("no decision means analytics is not allowed", () => {
  assert.equal(allows(null, "analytics"), false);
});

test("essential-only blocks analytics but is still a decision", () => {
  const state = essentialOnly(AT);
  assert.equal(hasDecided(state), true);
  assert.equal(allows(state, "analytics"), false);
});

test("accept-all permits analytics", () => {
  assert.equal(allows(acceptAll(AT), "analytics"), true);
});

// ---------------------------------------------------------------------------
// Cookie attributes
// ---------------------------------------------------------------------------

test("Secure is only set over https, otherwise the browser drops the cookie", () => {
  assert.match(consentCookieAttributes(true), /Secure/);
  assert.doesNotMatch(consentCookieAttributes(false), /Secure/);
});

test("the cookie is site-wide and SameSite=Lax", () => {
  const attrs = consentCookieAttributes(true);
  assert.match(attrs, /Path=\//);
  assert.match(attrs, /SameSite=Lax/);
  assert.match(attrs, /Max-Age=\d+/);
});

// ---------------------------------------------------------------------------
// Supabase cookie naming
// ---------------------------------------------------------------------------

test("derives the auth cookie name from the project hostname", () => {
  assert.equal(
    supabaseAuthCookieName("https://jydwazheyzxnplchkyok.supabase.co"),
    "sb-jydwazheyzxnplchkyok-auth-token",
  );
});

test("returns null for a missing or malformed URL", () => {
  assert.equal(supabaseAuthCookieName(undefined), null);
  assert.equal(supabaseAuthCookieName(""), null);
  assert.equal(supabaseAuthCookieName("not a url"), null);
});

// ---------------------------------------------------------------------------

if (failures.length > 0) {
  console.error(`FAIL  ${failures.length} test(s) failed`);
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}

console.log(`PASS  ${passed} tests passed`);
