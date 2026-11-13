"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Sparkles } from "lucide-react";
import { initializeCheckout, downgradeToFree } from "./actions";
import {
  PLAN_META,
  formatNaira,
  priceForCycle,
  type BillingCycle,
  type PaidPlanId,
  type PlanId,
} from "@/lib/plans";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

const FEATURES: Record<PaidPlanId, string[]> = {
  growth: [
    "Up to 15 team members",
    "Unlimited products",
    "Up to 3 warehouses",
    "CSV exports",
    "Full history and audit trail",
    "Delivery photos kept permanently",
  ],
  operations: [
    "Unlimited team members",
    "Unlimited products",
    "Unlimited warehouses",
    "CSV exports",
    "Full history and audit trail",
    "Delivery photos kept permanently",
  ],
};

const FREE_FEATURES = [
  "3 team members",
  "Up to 100 products",
  "1 warehouse",
  "Unlimited dispatches",
  "Stocktaking and delivery photos",
  "30 days of history and photos",
];

type Props = {
  currentPlan: PlanId;
  canManage: boolean;
};

export function BillingClient({ currentPlan, canManage }: Props) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [cycle, setCycle] = useState<BillingCycle>("monthly");
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function upgrade(plan: PaidPlanId) {
    setError(null);
    setPending(plan);
    startTransition(async () => {
      const result = await initializeCheckout(
        plan,
        cycle,
        typeof window !== "undefined" ? window.location.origin : undefined,
      );
      if (result?.error || !result?.authorizationUrl) {
        setError(result?.error ?? "Could not start the checkout.");
        setPending(null);
        return;
      }
      window.location.href = result.authorizationUrl;
    });
  }

  function downgrade() {
    setError(null);
    setPending("free");
    startTransition(async () => {
      const result = await downgradeToFree();
      setPending(null);
      if (result?.error) {
        setError(result.error);
        return;
      }
      router.refresh();
    });
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="inline-flex rounded-control border border-line bg-surface p-1">
          {(["monthly", "annual"] as BillingCycle[]).map((c) => (
            <button
              key={c}
              onClick={() => setCycle(c)}
              className={`rounded-[6px] px-3 py-1.5 text-sm font-medium transition-colors ${
                cycle === c
                  ? "bg-sunken text-ink"
                  : "text-ink-muted hover:text-ink"
              }`}
            >
              {c === "monthly" ? "Monthly" : "Annual — 2 months free"}
            </button>
          ))}
        </div>
        {!canManage && (
          <p className="text-xs text-ink-muted">
            Only owners and admins can change the plan.
          </p>
        )}
      </div>

      {error && (
        <p className="rounded-control bg-danger-soft px-3 py-2 text-sm text-danger">
          {error}
        </p>
      )}

      <div className="grid gap-4 lg:grid-cols-3">
        {/* Free */}
        <section
          className={`flex flex-col rounded-card border p-5 ring-1 ring-black/[0.02] ${
            currentPlan === "free" || currentPlan === "trial"
              ? "border-brand/40 bg-brand-soft/40"
              : "border-line bg-surface"
          }`}
        >
          <div className="flex items-center justify-between">
            <h2 className="text-base font-medium text-ink">Free</h2>
            {(currentPlan === "free" || currentPlan === "trial") && (
              <Badge tone="brand">
                {currentPlan === "trial" ? "Trial running" : "Current"}
              </Badge>
            )}
          </div>
          <p className="mt-1 text-sm text-ink-muted">{PLAN_META.free.blurb}</p>
          <p className="mt-4 text-2xl font-semibold tracking-[-0.02em] text-ink">
            ₦0
            <span className="ml-1 text-sm font-normal text-ink-faint">forever</span>
          </p>
          <ul className="mt-4 space-y-2 text-sm text-ink-muted">
            {FREE_FEATURES.map((f) => (
              <li key={f} className="flex items-start gap-2">
                <Check size={14} className="mt-0.5 shrink-0 text-brand" aria-hidden="true" />
                {f}
              </li>
            ))}
          </ul>
          <div className="mt-auto pt-5">
            {canManage && currentPlan !== "free" && (
              <Button
                variant="outline"
                onClick={downgrade}
                loading={pending === "free"}
                className="w-full"
              >
                {currentPlan === "trial" ? "Stay on free" : "Downgrade to free"}
              </Button>
            )}
          </div>
        </section>

        {/* Paid */}
        {(["growth", "operations"] as PaidPlanId[]).map((plan) => {
          const meta = PLAN_META[plan];
          const price = priceForCycle(plan, cycle);
          const isCurrent = currentPlan === plan;

          return (
            <section
              key={plan}
              className={`flex flex-col rounded-card border p-5 ring-1 ring-black/[0.02] ${
                isCurrent
                  ? "border-brand/40 bg-brand-soft/40"
                  : "border-line bg-surface"
              }`}
            >
              <div className="flex items-center justify-between">
                <h2 className="text-base font-medium text-ink">{meta.label}</h2>
                {isCurrent ? (
                  <Badge tone="brand">Current</Badge>
                ) : plan === "operations" ? (
                  <Badge tone="info">
                    <Sparkles size={10} aria-hidden="true" className="mr-1" />
                    Most complete
                  </Badge>
                ) : null}
              </div>
              <p className="mt-1 text-sm text-ink-muted">{meta.blurb}</p>
              <p className="mt-4 text-2xl font-semibold tracking-[-0.02em] text-ink">
                {formatNaira(price)}
                <span className="ml-1 text-sm font-normal text-ink-faint">
                  /{cycle === "annual" ? "year" : "month"}
                </span>
              </p>
              {cycle === "annual" && (
                <p className="mt-1 text-xs text-ink-faint">
                  {formatNaira(Math.round(price / 12))} per month, billed yearly
                </p>
              )}
              <ul className="mt-4 space-y-2 text-sm text-ink-muted">
                {FEATURES[plan].map((f) => (
                  <li key={f} className="flex items-start gap-2">
                    <Check size={14} className="mt-0.5 shrink-0 text-brand" aria-hidden="true" />
                    {f}
                  </li>
                ))}
              </ul>
              <div className="mt-auto pt-5">
                <Button
                  onClick={() => upgrade(plan)}
                  loading={pending === plan}
                  disabled={!canManage || isCurrent}
                  className="w-full"
                >
                  {isCurrent ? "Current plan" : `Choose ${meta.label}`}
                </Button>
              </div>
            </section>
          );
        })}
      </div>

      <p className="text-xs text-ink-faint">
        Payments are processed by Paystack. Prices are in Nigerian naira. Changing
        plan never deletes your data — a downgrade only reduces what you can add.
      </p>
    </div>
  );
}
