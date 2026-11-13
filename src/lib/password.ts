/**
 * Password policy.
 *
 * One definition, used by every place a password is set: sign-up, password
 * recovery, and anything added later. The client renders the checklist from
 * these rules and the server actions re-run the same function, so what the user
 * is shown and what is accepted cannot drift apart.
 *
 * The rules are:
 *   - at least 8 characters
 *   - one lowercase letter
 *   - one uppercase letter
 *   - one number
 *   - one special character
 *
 * Lowercase is required because Supabase's password policy only offers three
 * presets, and the strongest one — "Lowercase, uppercase letters, digits and
 * symbols" — always includes lowercase. There is no preset for uppercase +
 * digits + symbols alone. If this file were looser than the Supabase setting,
 * a password could pass every check here and still be rejected by the auth
 * server, which is a confusing dead end for the user.
 *
 * Keep the two in step: Supabase Dashboard → Authentication → Sign In /
 * Providers → Email → Password requirements.
 *
 * NOTE: this is a usability gate, not a security boundary. Someone calling the
 * Supabase auth API directly bypasses it entirely. The authoritative control is
 * the project's password policy in Supabase.
 */

export const PASSWORD_MIN_LENGTH = 8;

/**
 * bcrypt silently truncates beyond 72 bytes, so a 90-character password and its
 * first 72 characters would be the same password. Reject rather than truncate.
 */
export const PASSWORD_MAX_LENGTH = 72;

export type PasswordCheck = {
  id: "length" | "lowercase" | "uppercase" | "number" | "special";
  /** Full label for the checklist. */
  label: string;
  /** Compact fragment used when building an error sentence. */
  short: string;
  met: boolean;
};

/** Every rule, with whether the given password currently satisfies it. */
export function passwordChecks(password: string): PasswordCheck[] {
  return [
    {
      id: "length",
      label: `At least ${PASSWORD_MIN_LENGTH} characters`,
      short: `at least ${PASSWORD_MIN_LENGTH} characters`,
      met: password.length >= PASSWORD_MIN_LENGTH,
    },
    {
      id: "lowercase",
      label: "One lowercase letter (a–z)",
      short: "one lowercase letter",
      met: /[a-z]/.test(password),
    },
    {
      id: "uppercase",
      label: "One uppercase letter (A–Z)",
      short: "one uppercase letter",
      met: /[A-Z]/.test(password),
    },
    {
      id: "number",
      label: "One number (0–9)",
      short: "one number",
      met: /[0-9]/.test(password),
    },
    {
      id: "special",
      label: "One special character (!@#$%…)",
      short: "one special character",
      // Anything that is not a letter or a digit counts as special, so accented
      // letters and symbols both qualify.
      met: /[^A-Za-z0-9]/.test(password),
    },
  ];
}

export function isPasswordValid(password: string): boolean {
  if (password.length > PASSWORD_MAX_LENGTH) return false;
  return passwordChecks(password).every((c) => c.met);
}

/**
 * The single human-readable reason a password is rejected, or null when it is
 * acceptable. Server actions return this string straight to the form.
 */
export function passwordProblem(password: string): string | null {
  if (!password) return "Enter a password.";

  if (password.length > PASSWORD_MAX_LENGTH) {
    return `Password cannot be longer than ${PASSWORD_MAX_LENGTH} characters.`;
  }

  const failing = passwordChecks(password).filter((c) => !c.met);
  if (failing.length === 0) return null;

  return `Password needs ${failing.map((c) => c.short).join(", ")}.`;
}

/**
 * Rough strength signal for the meter: 0–4. Only a password that satisfies
 * every rule can reach 4 — length alone should never look "strong" while a
 * required character class is missing. Only used for display.
 */
export function passwordStrength(password: string): number {
  if (!password) return 0;

  const checks = passwordChecks(password);
  const met = checks.filter((c) => c.met).length;

  if (met < checks.length) {
    return Math.max(1, Math.round((met / checks.length) * 3));
  }
  return 4;
}
