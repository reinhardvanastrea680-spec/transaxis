"use client";

import { Check, Circle } from "lucide-react";
import { passwordChecks, passwordStrength } from "@/lib/password";

/**
 * Live password requirements.
 *
 * The rules come from src/lib/password.ts — the same function the server action
 * validates with — so this list can never claim a rule the backend does not
 * enforce, or miss one it does.
 */
const STRENGTH_LABELS = ["Too weak", "Weak", "Fair", "Strong", "Excellent"] as const;

export function PasswordRules({
  password,
  className = "",
}: {
  password: string;
  className?: string;
}) {
  const checks = passwordChecks(password);
  const strength = passwordStrength(password);
  const allMet = checks.every((c) => c.met);

  return (
    <div className={`space-y-2 ${className}`}>
      {password.length > 0 && (
        <div>
          <div className="flex items-center justify-between">
            <span className="text-[11px] uppercase tracking-[0.08em] text-ink-faint">
              Strength
            </span>
            <span
              className={`text-[11px] font-medium ${
                allMet ? "text-success" : "text-ink-muted"
              }`}
            >
              {STRENGTH_LABELS[strength]}
            </span>
          </div>
          <div className="mt-1 flex gap-1" aria-hidden="true">
            {[0, 1, 2, 3].map((i) => (
              <span
                key={i}
                className={`h-1 flex-1 rounded-full transition-colors ${
                  i < strength
                    ? allMet
                      ? "bg-success"
                      : "bg-warn"
                    : "bg-line"
                }`}
              />
            ))}
          </div>
        </div>
      )}

      <ul className="space-y-1" aria-live="polite">
        {checks.map((check) => (
          <li
            key={check.id}
            className={`flex items-center gap-1.5 text-xs transition-colors ${
              check.met ? "text-success" : "text-ink-muted"
            }`}
          >
            {check.met ? (
              <Check size={12} strokeWidth={2.5} aria-hidden="true" />
            ) : (
              <Circle size={12} strokeWidth={2} aria-hidden="true" />
            )}
            <span>{check.label}</span>
            <span className="sr-only">{check.met ? "— met" : "— not met yet"}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
