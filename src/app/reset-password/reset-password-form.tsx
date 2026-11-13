"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ShieldCheck } from "lucide-react";
import { updatePassword } from "./actions";
import { passwordProblem, isPasswordValid } from "@/lib/password";
import { PasswordRules } from "@/components/password-rules";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Reveal } from "@/components/ui/reveal";

export default function ResetPasswordForm({ email }: { email: string }) {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const mismatch = confirm.length > 0 && confirm !== password;
  const canSubmit = isPasswordValid(password) && password === confirm;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const problem = passwordProblem(password);
    if (problem) {
      setError(problem);
      return;
    }
    if (password !== confirm) {
      setError("Both passwords must match.");
      return;
    }

    setLoading(true);
    const result = await updatePassword(password);
    setLoading(false);

    if (result?.error) {
      setError(result.error);
      return;
    }

    router.push("/dashboard");
    router.refresh();
  }

  return (
    <main className="flex min-h-[calc(100vh-4rem)] items-center justify-center px-5 py-12 sm:px-6">
      <div className="w-full max-w-md">
        <Reveal className="mb-8 text-center">
          <span className="mx-auto flex size-11 items-center justify-center rounded-control bg-brand text-white">
            <ShieldCheck size={20} strokeWidth={1.75} aria-hidden="true" />
          </span>
          <h1 className="mt-5 text-2xl font-semibold tracking-[-0.02em] text-ink">
            Choose a new password
          </h1>
          <p className="mt-2 text-sm text-ink-muted">
            Signing in as{" "}
            <span className="font-medium text-ink">{email}</span>
          </p>
        </Reveal>

        <Reveal delay={0.06}>
          <div className="rounded-card border border-line bg-surface p-6 shadow-sm ring-1 ring-black/[0.02] sm:p-8">
            <form onSubmit={handleSubmit} className="space-y-5">
              <div>
                <Input
                  label="New password"
                  type="password"
                  required
                  autoComplete="new-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                />
                <PasswordRules
                  password={password}
                  className="mt-3 rounded-control border border-line bg-sunken/50 px-3 py-2.5"
                />
              </div>

              <Input
                label="Confirm new password"
                type="password"
                required
                autoComplete="new-password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                placeholder="••••••••"
                error={mismatch ? "Both passwords must match." : undefined}
              />

              {error && (
                <div
                  role="alert"
                  className="rounded-control border border-danger/30 bg-danger-soft px-3.5 py-2.5 text-sm text-danger"
                >
                  {error}
                </div>
              )}

              <Button
                type="submit"
                size="lg"
                loading={loading}
                className="w-full"
                disabled={!canSubmit}
              >
                Set new password
              </Button>
            </form>

            <div className="mt-6 border-t border-line pt-4 text-center text-sm text-ink-muted">
              Remembered it?{" "}
              <Link
                href="/login"
                className="font-medium text-brand transition-colors hover:text-brand-hover"
              >
                Back to sign in
              </Link>
            </div>
          </div>
        </Reveal>
      </div>
    </main>
  );
}
