"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check } from "lucide-react";
import { initializeCheckout, downgradeToFree } from "./actions";
import {
  CYCLES,
  CYCLE_LABELS,
  PLAN_META,
  FREE_DISPATCHES_PER_MONTH,
  formatNaira,
  priceFor,
  savingsPct,
  type BillingCycle,
  type PaidPlanId,
  type PlanId,
} from "@/lib/plans";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

const FEATURES: Record<PaidPlanId, string[]> = {
  standard: [
    "Up to 5 team members",
    "Up to 500 products",
    "Up to 2 warehouses",
    "Unlimited dispatches",
    "Stocktaking and delivery photos",
    "90 days of history",
  ],
  pro: [
    "Up to 20 team members",
    "Up to 5,000 products",
    "Up to 5 warehouses",
    "Unlimited dispatches",
    "CSV exports",
    "1 year of history and photos",
  ],
  max: [
    "Unlimited team members",
    "Unlimited products and warehouses",
    "Unlimited dispatches",
    "CSV exports",
    "Full history, forever",
    "Delivery photos kept forever",
  ],
};

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
  const [notice, setNotice] = useState<string | null>(null);

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
    setNotice(null);
    setPending("free");
    startTransition(async () => {
      const result = await downgradeToFree();
      setPending(null);
      if (result?.error) {
        setError(result.error);
        return;
      }
      if (result?.warning) setNotice(result.warning);
      router.refresh();
    });
  }

  const cycleSuffix =
    cycle === "monthly" ? "/mo" : cycle === "quarterly" ? "/qtr" : "/yr";

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="inline-flex flex-wrap rounded-control border border-line bg-surface p-1">
          {CYCLES.map((c) => (
            <button
              key={c}
              onClick={() => setCycle(c)}
              aria-pressed={cycle === c}
              className={`rounded-[6px] px-3 py-1.5 text-sm font-medium transition-colors ${
                cycle === c
                  ? "bg-sunken text-ink"
                  : "text-ink-muted hover:text-ink"
              }`}
            >
              {CYCLE_LABELS[c]}
              {savingsPct("standard", c) > 0 && (
                <span className="ml-1.5 text-[11px] text-brand">
                  −{savingsPct("standard", c)}%
                </span>
              )}
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
      {notice && (
        <p className="rounded-control bg-warn-soft px-3 py-2 text-sm text-warn">
          {notice}
        </p>
      )}

      <div className="grid gap-4 lg:grid-cols-3">
        {(["standard", "pro", "max"] as PaidPlanId[]).map((plan) => {
          const meta = PLAN_META[plan];
          const price = priceFor(plan, cycle);
          const isCurrent = currentPlan === plan;
          const save = savingsPct(plan, cycle);
          const isMax = plan === "max";

          return (
            <section
              key={plan}
              className={`relative flex flex-col rounded-card border p-5 ring-1 ring-black/[0.02] ${
                isCurrent
                  ? "border-brand/40 bg-brand-soft/40"
                  : "border-line bg-surface"
              }`}
            >
              <div className="flex items-center justify-between">
                <h2 className="text-base font-medium text-ink">{meta.label}</h2>
                {isCurrent ? (
                  <Badge tone="brand">Current</Badge>
                ) : isMax ? (
                  <Badge tone="info">No limits</Badge>
                ) : null}
              </div>
              <p className="mt-1 text-sm text-ink-muted">{meta.blurb}</p>
              <p className="mt-4 text-2xl font-semibold tracking-[-0.02em] text-ink">
                {formatNaira(price)}
                <span className="ml-1 text-sm font-normal text-ink-faint">
                  {cycleSuffix}
                </span>
              </p>
              {save > 0 && (
                <p className="mt-1 text-xs font-medium text-brand">
                  Save {save}% versus monthly
                </p>
              )}
              {cycle !== "monthly" && (
                <p className="mt-0.5 text-xs text-ink-faint">
                  Billed every {cycle === "quarterly" ? "3 months" : "12 months"}
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

      {/* Free fallback */}
      <section className="rounded-card border border-line bg-surface p-5 ring-1 ring-black/[0.02]">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-base font-medium text-ink">Free</h2>
              {(currentPlan === "free" || currentPlan === "trial") && (
                <Badge tone="brand">
                  {currentPlan === "trial" ? "Demo running" : "Current"}
                </Badge>
              )}
            </div>
            <p className="mt-1 text-sm text-ink-muted">{PLAN_META.free.blurb}</p>
          </div>
          {canManage && currentPlan !== "free" && (
            <Button
              variant="outline"
              onClick={downgrade}
              loading={pending === "free"}
            >
              {currentPlan === "trial" ? "Stay on free" : "Downgrade to free"}
            </Button>
          )}
        </div>
        <ul className="mt-3 flex flex-wrap gap-x-6 gap-y-1.5 text-sm text-ink-muted">
          {[
            "3 team members",
            "100 products",
            "1 warehouse",
            `${FREE_DISPATCHES_PER_MONTH} dispatches a month`,
            "30 days of history and photos",
          ].map((f) => (
            <li key={f} className="flex items-center gap-2">
              <Check size={14} className="shrink-0 text-brand" aria-hidden="true" />
              {f}
            </li>
          ))}
        </ul>
      </section>

      <p className="text-xs text-ink-faint">
        Payments are processed by Paystack. Prices are in Nigerian naira.
        Changing plan never deletes your data; a downgrade only reduces what you
        can add.
      </p>
    </div>
  );
}
