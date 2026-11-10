"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { motion } from "motion/react";
import { Boxes } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createOrganization, joinOrganization } from "./actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Reveal } from "@/components/ui/reveal";

type Mode = "create" | "join";

export default function OnboardingPage() {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("create");
  const [name, setName] = useState("");
  const [joinCode, setJoinCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [checking, setChecking] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    if (!isSupabaseConfigured()) {
      setChecking(false);
      return;
    }
    const supabase = createClient();
    (async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        router.push("/login");
        return;
      }
      const { data: profile } = await supabase
        .from("profiles")
        .select("org_id")
        .eq("id", user.id)
        .maybeSingle();
      if (profile?.org_id) {
        router.push("/dashboard");
        return;
      }
      setChecking(false);
    })();
  }, [router]);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setLoading(true);
    setError(null);

    startTransition(async () => {
      const result = await createOrganization(name);
      if (result?.error) {
        setError(result.error);
        setLoading(false);
      } else {
        router.push("/dashboard");
        router.refresh();
      }
    });
  }

  async function handleJoin(e: React.FormEvent) {
    e.preventDefault();
    if (!joinCode.trim()) return;
    setLoading(true);
    setError(null);

    startTransition(async () => {
      const result = await joinOrganization(joinCode);
      if (result?.error) {
        setError(result.error);
        setLoading(false);
      } else {
        router.push("/dashboard");
        router.refresh();
      }
    });
  }

  if (checking) {
    return (
      <main className="flex min-h-[calc(100vh-4rem)] items-center justify-center">
        <div className="size-8 animate-spin rounded-full border-2 border-brand border-t-transparent" />
      </main>
    );
  }

  if (!isSupabaseConfigured()) {
    return (
      <main className="flex min-h-[calc(100vh-4rem)] items-center justify-center px-6 py-12">
        <div className="w-full max-w-md rounded-card border border-warn/30 bg-warn-soft p-8 text-center">
          <h1 className="text-xl font-semibold text-ink">Setup required</h1>
          <p className="mt-2 text-sm text-ink-muted">
            Supabase is not configured. Copy <code>.env.local.example</code> to{" "}
            <code>.env.local</code> and restart.
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
            {mode === "create" ? "Create your organization" : "Join your organization"}
          </h1>
          <p className="mt-2 text-sm text-ink-muted">
            {mode === "create"
              ? "Set up your workspace to manage inventory, dispatch, and staff."
              : "Enter the join code your manager gave you to get access."}
          </p>
        </Reveal>

        <Reveal delay={0.06}>
          <div className="rounded-card border border-line bg-surface p-6 shadow-sm ring-1 ring-black/[0.02] sm:p-8">
            {/* Segmented control with sliding indicator */}
            <div
              role="tablist"
              className="mb-7 grid grid-cols-2 gap-1 rounded-control bg-sunken p-1"
            >
              {(
                [
                  { id: "create", label: "New business" },
                  { id: "join", label: "Join with code" },
                ] as const
              ).map((tab) => {
                const isActive = mode === tab.id;
                return (
                  <button
                    key={tab.id}
                    role="tab"
                    aria-selected={isActive}
                    onClick={() => {
                      setMode(tab.id);
                      setError(null);
                    }}
                    className={`relative rounded-[6px] px-3 py-2 text-sm font-medium transition-colors ${
                      isActive ? "text-ink" : "text-ink-muted hover:text-ink"
                    }`}
                  >
                    {isActive && (
                      <motion.span
                        layoutId="onboarding-tab"
                        className="absolute inset-0 rounded-[6px] bg-surface shadow-sm ring-1 ring-black/[0.03]"
                        transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
                      />
                    )}
                    <span className="relative">{tab.label}</span>
                  </button>
                );
              })}
            </div>

            {mode === "create" ? (
              <form onSubmit={handleCreate} className="space-y-5">
                <Input
                  label="Organization name"
                  id="orgName"
                  required
                  autoFocus
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Acme Logistics Ltd."
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
                  loading={loading || isPending}
                  disabled={!name.trim()}
                  className="w-full"
                >
                  Create organization
                </Button>
              </form>
            ) : (
              <form onSubmit={handleJoin} className="space-y-5">
                <div>
                  <label
                    htmlFor="joinCode"
                    className="block text-sm font-medium text-ink"
                  >
                    Join code
                  </label>
                  <input
                    id="joinCode"
                    type="text"
                    required
                    autoFocus
                    value={joinCode}
                    onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                    placeholder="A1B2C3D4"
                    maxLength={16}
                    className="mt-1.5 h-14 w-full rounded-control border border-line-strong bg-surface px-4 text-center font-mono text-xl font-medium uppercase tracking-[0.2em] text-ink placeholder:font-sans placeholder:tracking-normal placeholder:text-ink-faint transition-colors hover:border-ink-faint focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20"
                  />
                  <p className="mt-2 text-xs text-warn">
                    Ask your manager or the business owner for this code. It is on
                    their Staff page.
                  </p>
                </div>
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
                  loading={loading || isPending}
                  disabled={!joinCode.trim()}
                  className="w-full"
                >
                  Join organization
                </Button>
              </form>
            )}
          </div>
        </Reveal>
      </div>
    </main>
  );
}
