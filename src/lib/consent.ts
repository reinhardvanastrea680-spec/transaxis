/**
 * Cookie consent.
 *
 * The app currently sets **only essential cookies** — the Supabase auth session
 * and its PKCE verifier. There is no analytics, advertising, or tracking code
 * anywhere in the codebase, and the banner says so rather than implying
 * otherwise.
 *
 * The record is still versioned and category-based, for two reasons:
 *
 *   1. If analytics is ever added, the choice already exists and can be
 *      enforced with `allows()`. No migration, no re-prompt.
 *   2. When the categories or the policy change materially, bumping
 *      CONSENT_VERSION invalidates old records and the banner asks again —
 *      which is what "consent must be informed" actually requires.
 *
 * Everything here is pure so it can be tested without a browser.
 */

export const CONSENT_COOKIE = "tx_consent";

/** Bump when the categories or the policy change in a way users must re-approve. */
export const CONSENT_VERSION = 1;

/** 180 days. Long enough not to nag, short enough to be re-confirmed twice a year. */
export const CONSENT_MAX_AGE_SECONDS = 180 * 24 * 60 * 60;

export type OptionalCategory = "analytics";

export type ConsentState = {
  version: number;
  /** ISO timestamp of the decision — evidence that consent was given. */
  decidedAt: string;
  analytics: boolean;
};

/** The two answers the banner offers, before any fine-tuning. */
export function acceptAll(now: Date = new Date()): ConsentState {
  return { version: CONSENT_VERSION, decidedAt: now.toISOString(), analytics: true };
}

export function essentialOnly(now: Date = new Date()): ConsentState {
  return { version: CONSENT_VERSION, decidedAt: now.toISOString(), analytics: false };
}

export function customConsent(
  choice: { analytics: boolean },
  now: Date = new Date(),
): ConsentState {
  return {
    version: CONSENT_VERSION,
    decidedAt: now.toISOString(),
    analytics: choice.analytics === true,
  };
}

/**
 * Parse a raw cookie value.
 *
 * Returns null for anything that is not a well-formed record of the *current*
 * version, so a stale, tampered, or truncated value simply means "ask again"
 * rather than throwing or silently granting consent.
 */
export function parseConsent(raw: string | null | undefined): ConsentState | null {
  if (!raw) return null;

  let decoded: string;
  try {
    decoded = decodeURIComponent(raw);
  } catch {
    return null;
  }

  let value: unknown;
  try {
    value = JSON.parse(decoded);
  } catch {
    return null;
  }

  if (typeof value !== "object" || value === null) return null;
  const record = value as Record<string, unknown>;

  if (record.version !== CONSENT_VERSION) return null;
  if (typeof record.decidedAt !== "string" || !record.decidedAt) return null;
  if (Number.isNaN(Date.parse(record.decidedAt))) return null;
  if (typeof record.analytics !== "boolean") return null;

  return {
    version: CONSENT_VERSION,
    decidedAt: record.decidedAt,
    analytics: record.analytics,
  };
}

export function serializeConsent(state: ConsentState): string {
  // Fixed key order keeps the value stable and diffable.
  const payload = JSON.stringify({
    version: state.version,
    decidedAt: state.decidedAt,
    analytics: state.analytics,
  });
  return encodeURIComponent(payload);
}

/** True when there is a usable decision, i.e. the banner should stay hidden. */
export function hasDecided(state: ConsentState | null): state is ConsentState {
  return state !== null && state.version === CONSENT_VERSION;
}

/**
 * Whether an optional category may run. Essential cookies never go through
 * this — they are required for the app to work at all and cannot be disabled.
 */
export function allows(state: ConsentState | null, category: OptionalCategory): boolean {
  if (!hasDecided(state)) return false;
  return category === "analytics" ? state.analytics : false;
}

/**
 * Supabase stores the session under `sb-<project-ref>-auth-token`, where the
 * ref is the first label of the project hostname. Deriving it keeps the policy
 * page honest even if the project is ever moved.
 */
export function supabaseAuthCookieName(supabaseUrl: string | undefined): string | null {
  if (!supabaseUrl) return null;
  try {
    const host = new URL(supabaseUrl).hostname;
    const ref = host.split(".")[0];
    if (!ref) return null;
    return `sb-${ref}-auth-token`;
  } catch {
    return null;
  }
}

export function consentCookieAttributes(isHttps: boolean): string {
  const parts = [
    `Path=/`,
    `Max-Age=${CONSENT_MAX_AGE_SECONDS}`,
    "SameSite=Lax",
  ];
  // `Secure` is only valid over https; setting it on http makes the browser drop
  // the cookie entirely, which would make the banner reappear on every page.
  if (isHttps) parts.push("Secure");
  return parts.join("; ");
}
