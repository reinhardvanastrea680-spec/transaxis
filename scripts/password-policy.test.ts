/**
 * Regression tests for the password policy.
 *
 * Run with:  npm run test:password
 *
 * The point of these is that the rule set is a single shared definition: the
 * checklist the user sees, the client-side submit guard, and the server action
 * all call the same functions. If someone loosens a rule here, the UI follows
 * automatically — which is exactly why it needs a test.
 */

import assert from "node:assert/strict";
import {
  passwordChecks,
  passwordProblem,
  isPasswordValid,
  passwordStrength,
  PASSWORD_MIN_LENGTH,
  PASSWORD_MAX_LENGTH,
} from "../src/lib/password.ts";

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

const metIds = (pw: string) =>
  passwordChecks(pw)
    .filter((c) => c.met)
    .map((c) => c.id);

// ---------------------------------------------------------------------------
// The rules: 8+, lowercase, uppercase, number, special
// ---------------------------------------------------------------------------

test("a password meeting every rule is accepted", () => {
  assert.equal(passwordProblem("Transaxis1!"), null);
  assert.equal(isPasswordValid("Transaxis1!"), true);
});

test("each rule is individually required", () => {
  // All lowercase: fails the uppercase rule only.
  assert.deepEqual(metIds("transaxis1!"), [
    "length",
    "lowercase",
    "number",
    "special",
  ]);
  // No digit.
  assert.deepEqual(metIds("Transaxis!!"), [
    "length",
    "lowercase",
    "uppercase",
    "special",
  ]);
  // No special character.
  assert.deepEqual(metIds("Transaxis12"), [
    "length",
    "lowercase",
    "uppercase",
    "number",
  ]);
  // Too short — every character class is present, only length fails.
  assert.deepEqual(metIds("Tr1!"), ["lowercase", "uppercase", "number", "special"]);
});

test("a password missing a lowercase letter is rejected", () => {
  // Supabase's strongest preset requires lowercase, so the app must too —
  // otherwise this password passes every green check and is then refused by
  // the auth server.
  assert.equal(isPasswordValid("TRANS1!X"), false);
  assert.ok(passwordProblem("TRANS1!X"));
});

test("a password missing an uppercase letter is rejected", () => {
  assert.ok(passwordProblem("transaxis1!"));
  assert.equal(isPasswordValid("transaxis1!"), false);
});

test("a password missing a number is rejected", () => {
  assert.ok(passwordProblem("Transaxis!!"));
  assert.equal(isPasswordValid("Transaxis!!"), false);
});

test("a password missing a special character is rejected", () => {
  assert.ok(passwordProblem("Transaxis12"));
  assert.equal(isPasswordValid("Transaxis12"), false);
});

test("a password shorter than the minimum is rejected", () => {
  const tooShort = "Ab1!" + "x".repeat(Math.max(0, PASSWORD_MIN_LENGTH - 5));
  assert.ok(tooShort.length < PASSWORD_MIN_LENGTH);
  assert.equal(isPasswordValid(tooShort), false);
});

test("a password at exactly the minimum length can pass", () => {
  const exact = "Abcdef1!"; // 8 characters
  assert.equal(exact.length, PASSWORD_MIN_LENGTH);
  assert.equal(isPasswordValid(exact), true);
});

// ---------------------------------------------------------------------------
// Deliberate omissions and limits
// ---------------------------------------------------------------------------

test("lowercase is required — it mirrors the Supabase preset", () => {
  // Supabase's presets are: none, letters+digits, or
  // lowercase+uppercase+digits+symbols. There is no uppercase-only preset, so
  // the app requires lowercase to stay in step with the server.
  assert.equal(isPasswordValid("ABCDEFG1!"), false);
  assert.equal(isPasswordValid("Abcdefg1!"), true);
});

test("passwords longer than the bcrypt ceiling are rejected, not truncated", () => {
  const long = "Aa1!" + "x".repeat(PASSWORD_MAX_LENGTH);
  assert.ok(long.length > PASSWORD_MAX_LENGTH);
  assert.equal(isPasswordValid(long), false);
  assert.match(passwordProblem(long)!, /longer than/i);
});

test("an empty password is rejected with a specific message", () => {
  assert.equal(passwordProblem(""), "Enter a password.");
  assert.equal(isPasswordValid(""), false);
});

test("the rejection message names the rules that are still missing", () => {
  const message = passwordProblem("abc");
  assert.ok(message);
  assert.match(message!, /uppercase/i);
  assert.match(message!, /number/i);
  assert.match(message!, /special/i);
});

// ---------------------------------------------------------------------------
// Strength signal
// ---------------------------------------------------------------------------

test("strength stays within 0–4 and rises with better passwords", () => {
  assert.equal(passwordStrength(""), 0);
  const weak = passwordStrength("aaaa");
  const strong = passwordStrength("Transaxis1!Longer");
  assert.ok(weak >= 0 && weak <= 4, `weak out of range: ${weak}`);
  assert.ok(strong >= 0 && strong <= 4, `strong out of range: ${strong}`);
  assert.ok(strong > weak, "a compliant long password should score higher");
});

test("only a fully compliant password can score 4", () => {
  assert.equal(passwordStrength("Transaxis1!"), 4);
  assert.ok(passwordStrength("transaxis1!") < 4);
});

// ---------------------------------------------------------------------------

if (failures.length > 0) {
  console.error(`FAIL  ${failures.length} test(s) failed`);
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}

console.log(`PASS  ${passed} tests passed`);
