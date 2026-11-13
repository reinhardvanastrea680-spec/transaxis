"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Boxes, Globe } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { getOAuthCallbackUrl } from "@/lib/supabase/site-url";
import { passwordProblem, isPasswordValid } from "@/lib/password";
import { signUpWithPassword } from "./actions";
import { PasswordRules } from "@/components/password-rules";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Reveal } from "@/components/ui/reveal";

function LoginPageInner() {
  const configured = Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  );

  const router = useRouter();
  const searchParams = useSearchParams();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const m = searchParams.get("mode");
    if (m === "signup") setMode("signup");
    else if (m === "signin") setMode("signin");
  }, [searchParams]);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setNotice(null);

    if (mode === "signup") {
      // Check locally first so the user gets an instant, specific reason rather
      // than a round-trip. The server action re-validates — this is a courtesy.
      const problem = passwordProblem(password);
      if (problem) {
        setError(problem);
        setLoading(false);
        return;
      }

      const result = await signUpWithPassword(email, password);
      if (result?.error) {
        setError(result.error);
        setLoading(false);
        return;
      }

      if (result?.needsEmailConfirmation) {
        setNotice(
          "Account created. Check your inbox to confirm your email, then sign in.",
        );
        setMode("signin");
      } else {
        // Confirmation is disabled on this project, so the action already
        // established a session.
        router.push("/dashboard");
      }
      setLoading(false);
      return;
    }

    const supabase = createClient();
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    if (error) setError(error.message);
    else router.push("/dashboard");
    setLoading(false);
  }

  if (!configured) {
    return (
      <main className="flex min-h-[calc(100vh-4rem)] items-center justify-center px-6 py-12">
        <div className="w-full max-w-md rounded-card border border-warn/30 bg-warn-soft p-8 text-center">
          <h1 className="text-xl font-semibold tracking-[-0.01em] text-ink">
            Setup required
          </h1>
          <p className="mt-2 text-sm text-ink-muted">
            Supabase is not configured. Copy <code>.env.local.example</code> to{" "}
            <code>.env.local</code>, fill in your Supabase URL and anon key, and
            restart the dev server.
          </p>
        </div>
      </main>
    );
  }

  return (
    <main className="flex min-h-[calc(100vh-4rem)] items-center justify-center px-5 py-12 sm:px-6">
      <div className="w-full max-w-md">
        <Reveal className="mb-8 text-center">
          <span className="mx-auto flex size-11 items-center justify-center rounded-control bg-brand text-white">
            <Boxes size={20} strokeWidth={1.75} aria-hidden="true" />
          </span>
          <h1 className="mt-5 text-2xl font-semibold tracking-[-0.02em] text-ink">
            {mode === "signin" ? "Welcome back" : "Create your account"}
          </h1>
          <p className="mt-2 text-sm text-ink-muted">
            {mode === "signin"
              ? "Sign in to your Transaxis workspace"
              : "Start managing your logistics operations"}
          </p>
        </Reveal>

        <Reveal delay={0.06}>
          <div className="rounded-card border border-line bg-surface p-6 shadow-sm ring-1 ring-black/[0.02] sm:p-8">
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
              <div>
                <Input
                  label="Password"
                  type="password"
                  required
                  autoComplete={
                    mode === "signin" ? "current-password" : "new-password"
                  }
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                />
                {mode === "signup" && (
                  <PasswordRules
                    password={password}
                    className="mt-3 rounded-control border border-line bg-sunken/50 px-3 py-2.5"
                  />
                )}
                {mode === "signin" && (
                  <div className="mt-1.5 flex justify-end">
                    <Link
                      href="/forgot-password"
                      className="text-xs font-medium text-brand transition-colors hover:text-brand-hover"
                    >
                      Forgot password?
                    </Link>
                  </div>
                )}
              </div>

              {error && (
                <div
                  role="alert"
                  className="rounded-control border border-danger/30 bg-danger-soft px-3.5 py-2.5 text-sm text-danger"
                >
                  {error}
                </div>
              )}
              {notice && (
                <div className="rounded-control border border-brand/20 bg-brand-soft px-3.5 py-2.5 text-sm text-brand-ink">
                  {notice}
                </div>
              )}

              <Button
                type="submit"
                size="lg"
                loading={loading}
                className="w-full"
                disabled={mode === "signup" && !isPasswordValid(password)}
              >
                {mode === "signin" ? "Sign in" : "Create account"}
              </Button>
            </form>

            <div className="my-6 flex items-center gap-3">
              <span className="h-px flex-1 bg-line" />
              <span className="text-xs text-ink-faint">or</span>
              <span className="h-px flex-1 bg-line" />
            </div>

              <Button
                type="button"
                variant="outline"
                size="lg"
                className="w-full"
                onClick={async () => {
                  setError(null);
                  setLoading(true);
                  const supabase = createClient();
                  const redirectTo = getOAuthCallbackUrl(window.location.origin);
                  const { data, error } = await supabase.auth.signInWithOAuth({
                    provider: "google",
                    options: {
                      redirectTo,
                      scopes: "email profile",
                      // We navigate manually so a failure can surface as an
                      // inline error instead of a dead spinner.
                      skipBrowserRedirect: true,
                    },
                  });
                  if (error) {
                    setError(error.message);
                    setLoading(false);
                    return;
                  }
                  if (data?.url) {
                    window.location.assign(data.url);
                  } else {
                    setError("Could not start Google sign-in. Please try again.");
                    setLoading(false);
                  }
                }}
                disabled={loading}
              >
                <Globe size={16} aria-hidden="true" />
                Continue with Google
              </Button>

            <p className="mt-6 text-center text-sm text-ink-muted">
              {mode === "signin" ? "New here?" : "Already have an account?"}{" "}
              <button
                type="button"
                onClick={() => {
                  setMode(mode === "signin" ? "signup" : "signin");
                  setError(null);
                  setNotice(null);
                }}
                className="font-medium text-brand transition-colors hover:text-brand-hover"
              >
                {mode === "signin" ? "Create an account" : "Sign in"}
              </button>
            </p>
          </div>
        </Reveal>

        <p className="mt-8 text-center text-xs text-ink-faint">
          By continuing, you agree to our Terms of Service and Privacy Policy.
        </p>
      </div>
    </main>
  );
}


export default function LoginPage() {
  return (
    <Suspense fallback={<div className="flex min-h-[calc(100vh-4rem)] items-center justify-center"><div className="size-8 animate-spin rounded-full border-2 border-brand border-t-transparent" /></div>}>
      <LoginPageInner />
    </Suspense>
  );
}
