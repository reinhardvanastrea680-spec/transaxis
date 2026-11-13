"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, KeyRound, MailCheck } from "lucide-react";
import { requestPasswordReset } from "./actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Reveal } from "@/components/ui/reveal";

export default function ForgotPasswordPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const result = await requestPasswordReset(email);
    setLoading(false);

    if (result?.error) {
      setError(result.error);
      return;
    }
    setSent(true);
  }

  return (
    <main className="flex min-h-[calc(100vh-4rem)] items-center justify-center px-5 py-12 sm:px-6">
      <div className="w-full max-w-md">
        <Reveal className="mb-8 text-center">
          <span className="mx-auto flex size-11 items-center justify-center rounded-control bg-brand text-white">
            {sent ? (
              <MailCheck size={20} strokeWidth={1.75} aria-hidden="true" />
            ) : (
              <KeyRound size={20} strokeWidth={1.75} aria-hidden="true" />
            )}
          </span>
          <h1 className="mt-5 text-2xl font-semibold tracking-[-0.02em] text-ink">
            {sent ? "Check your inbox" : "Reset your password"}
          </h1>
          <p className="mt-2 text-sm text-ink-muted">
            {sent
              ? "If an account exists for that address, a reset link is on its way."
              : "Enter the email you signed up with and we'll send you a reset link."}
          </p>
        </Reveal>

        <Reveal delay={0.06}>
          <div className="rounded-card border border-line bg-surface p-6 shadow-sm ring-1 ring-black/[0.02] sm:p-8">
            {sent ? (
              <div className="space-y-4">
                <p className="text-sm text-ink-muted">
                  The link expires after a short while and can only be used
                  once. If it does not arrive within a few minutes, check your
                  spam folder, then try again.
                </p>
                <p className="rounded-control border border-line bg-sunken px-3.5 py-2.5 text-sm text-ink">
                  Sent to <span className="font-medium">{email.trim()}</span>
                </p>
                <div className="flex flex-col gap-2 pt-1">
                  <Button
                    variant="outline"
                    className="w-full"
                    onClick={() => {
                      setSent(false);
                      setEmail("");
                    }}
                  >
                    Use a different email
                  </Button>
                  <Button className="w-full" onClick={() => router.push("/login")}>
                    Back to sign in
                  </Button>
                </div>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-5">
                <Input
                  label="Email address"
                  type="email"
                  required
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@company.com"
                />

                {error && (
                  <div
                    role="alert"
                    className="rounded-control border border-danger/30 bg-danger-soft px-3.5 py-2.5 text-sm text-danger"
                  >
                    {error}
                  </div>
                )}

                <Button type="submit" size="lg" loading={loading} className="w-full">
                  Send reset link
                </Button>
              </form>
            )}

            <div className="mt-6 border-t border-line pt-4">
              <Link
                href="/login"
                className="inline-flex items-center gap-1.5 text-sm font-medium text-brand transition-colors hover:text-brand-hover"
              >
                <ArrowLeft size={14} aria-hidden="true" />
                Back to sign in
              </Link>
            </div>
          </div>
        </Reveal>
      </div>
    </main>
  );
}
