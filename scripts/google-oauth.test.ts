/**
 * Regression tests for the self-hosted Google OAuth flow.
 *
 * Run with:  npm run test:google
 *
 * The contract: the authorize URL Google receives must point its redirect at
 * our own domain (that is the whole reason this flow exists), the state check
 * must actually reject mismatches, and a missing configuration must degrade to
 * the Supabase-hosted flow instead of breaking sign-in.
 */

import assert from "node:assert/strict";
import {
  GOOGLE_ERROR_MESSAGES,
  GOOGLE_REDIRECT_PATH,
  GOOGLE_SCOPES,
  buildGoogleAuthUrl,
  buildTokenExchangeBody,
  googleErrorMessage,
  googleOAuthConfig,
  googleRedirectUri,
  stateMatches,
} from "../src/lib/google-oauth.ts";

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

const CLIENT_ID = "1234567890-abcdefg.apps.googleusercontent.com";

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

test("no configuration means no configuration", () => {
  assert.equal(googleOAuthConfig({}), null);
  assert.equal(googleOAuthConfig({ GOOGLE_CLIENT_ID: CLIENT_ID }), null);
  assert.equal(googleOAuthConfig({ GOOGLE_CLIENT_SECRET: "s3cret" }), null);
  assert.equal(
    googleOAuthConfig({ GOOGLE_CLIENT_ID: "   ", GOOGLE_CLIENT_SECRET: "s3cret" }),
    null,
    "whitespace is not a client id",
  );
});

test("a plausible pair is accepted and trimmed", () => {
  const config = googleOAuthConfig({
    GOOGLE_CLIENT_ID: `  ${CLIENT_ID}  `,
    GOOGLE_CLIENT_SECRET: "  s3cret  ",
  });
  assert.deepEqual(config, { clientId: CLIENT_ID, clientSecret: "s3cret" });
});

test("a client id that is not a Google client id falls back", () => {
  // The usual mistake: pasting the OAuth *client name*, or the project number.
  for (const bad of ["transaxis", "1234567890", "abc.apps.googleusercontent.com.evil"]) {
    assert.equal(
      googleOAuthConfig({ GOOGLE_CLIENT_ID: bad, GOOGLE_CLIENT_SECRET: "s3cret" }),
      null,
      `expected null for ${bad}`,
    );
  }
});

// ---------------------------------------------------------------------------
// Redirect URI — the value that decides what Google prints
// ---------------------------------------------------------------------------

test("the redirect URI is on our domain, not Supabase's", () => {
  const uri = googleRedirectUri("https://transaxis.com.ng");
  assert.equal(uri, "https://transaxis.com.ng/api/auth/google/callback");
  assert.ok(!uri.includes("supabase.co"), "must not point at the Supabase project");
  assert.ok(uri.startsWith("https://"));
  assert.ok(uri.endsWith(GOOGLE_REDIRECT_PATH));
});

test("a trailing slash does not produce a double slash", () => {
  assert.equal(
    googleRedirectUri("https://transaxis.com.ng///"),
    "https://transaxis.com.ng/api/auth/google/callback",
  );
});

// ---------------------------------------------------------------------------
// Authorize URL
// ---------------------------------------------------------------------------

test("the authorize URL carries every parameter Google requires", () => {
  const url = new URL(
    buildGoogleAuthUrl({
      clientId: CLIENT_ID,
      redirectUri: "https://transaxis.com.ng/api/auth/google/callback",
      state: "state-123",
      nonce: "nonce-456",
    }),
  );

  assert.equal(url.origin + url.pathname, "https://accounts.google.com/o/oauth2/v2/auth");
  assert.equal(url.searchParams.get("client_id"), CLIENT_ID);
  assert.equal(
    url.searchParams.get("redirect_uri"),
    "https://transaxis.com.ng/api/auth/google/callback",
  );
  assert.equal(url.searchParams.get("response_type"), "code");
  assert.equal(url.searchParams.get("state"), "state-123");
  assert.equal(url.searchParams.get("nonce"), "nonce-456");
  assert.equal(url.searchParams.get("prompt"), "select_account");
});

test("openid is requested, or there is no ID token to hand Supabase", () => {
  const url = new URL(
    buildGoogleAuthUrl({
      clientId: CLIENT_ID,
      redirectUri: "https://transaxis.com.ng/x",
      state: "s",
      nonce: "n",
    }),
  );
  const scope = url.searchParams.get("scope") ?? "";
  assert.ok(scope.split(" ").includes("openid"), "openid must be in scope");
  assert.equal(scope, GOOGLE_SCOPES);
});

test("the state survives a round-trip through the URL", () => {
  const state = "a+b/c=d&e";
  const url = new URL(
    buildGoogleAuthUrl({
      clientId: CLIENT_ID,
      redirectUri: "https://transaxis.com.ng/x",
      state,
      nonce: "n",
    }),
  );
  assert.equal(url.searchParams.get("state"), state);
});

// ---------------------------------------------------------------------------
// Token exchange
// ---------------------------------------------------------------------------

test("the token exchange body is a complete authorization_code grant", () => {
  const body = buildTokenExchangeBody({
    code: "auth-code",
    clientId: CLIENT_ID,
    clientSecret: "s3cret",
    redirectUri: "https://transaxis.com.ng/api/auth/google/callback",
  });

  assert.equal(body.get("grant_type"), "authorization_code");
  assert.equal(body.get("code"), "auth-code");
  assert.equal(body.get("client_id"), CLIENT_ID);
  assert.equal(body.get("client_secret"), "s3cret");
  assert.equal(
    body.get("redirect_uri"),
    "https://transaxis.com.ng/api/auth/google/callback",
    "Google rejects the exchange if this differs from the authorize call",
  );
});

// ---------------------------------------------------------------------------
// State comparison
// ---------------------------------------------------------------------------

test("a matching state passes", () => {
  assert.equal(stateMatches("abc123", "abc123"), true);
});

test("a different, missing, or truncated state fails", () => {
  assert.equal(stateMatches("abc123", "abc124"), false);
  assert.equal(stateMatches("abc123", "abc12"), false);
  assert.equal(stateMatches("abc123", ""), false);
  assert.equal(stateMatches(null, "abc123"), false);
  assert.equal(stateMatches("abc123", null), false);
  assert.equal(stateMatches(undefined, undefined), false);
  assert.equal(stateMatches("", ""), false);
});

// ---------------------------------------------------------------------------
// Error messages
// ---------------------------------------------------------------------------

test("every error the routes can emit has a human message", () => {
  const emitted = [
    "google_unavailable",
    "google_cancelled",
    "google_state",
    "google_token",
    "google_signin",
    "auth_callback_failed",
  ];
  for (const code of emitted) {
    assert.ok(GOOGLE_ERROR_MESSAGES[code], `no message for ${code}`);
    assert.equal(googleErrorMessage(code), GOOGLE_ERROR_MESSAGES[code]);
  }
});

test("an unknown code still says something useful, and no code says nothing", () => {
  assert.equal(googleErrorMessage("something_new"), "Sign-in failed. Please try again.");
  assert.equal(googleErrorMessage(null), null);
  assert.equal(googleErrorMessage(undefined), null);
  assert.equal(googleErrorMessage(""), null);
});

// ---------------------------------------------------------------------------

if (failures.length > 0) {
  console.error(`FAIL  ${failures.length} test(s) failed`);
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}

console.log(`PASS  ${passed} tests passed`);
