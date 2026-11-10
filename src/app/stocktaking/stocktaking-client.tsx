"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ClipboardCheck, Save } from "lucide-react";
import { recordStockMovement } from "@/app/inventory/actions";
import { can } from "@/lib/permissions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { EmptyState } from "@/components/ui/empty-state";

type Product = { id: string; sku: string; name: string; unit: string; warehouse_id: string | null };
type Warehouse = { id: string; name: string };

type Props = {
  products: Product[];
  stockMap: Record<string, number>;
  warehouses: Warehouse[];
  role: string;
};

export default function StocktakingClient({ products, stockMap, warehouses, role }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [counts, setCounts] = useState<Record<string, string>>({});

  const canAdjust = can(role, "inventory.manage");

  const rows = products.map((p) => {
    const recorded = stockMap[p.id] ?? 0;
    const countedRaw = counts[p.id];
    const counted = countedRaw === undefined || countedRaw === "" ? null : parseInt(countedRaw);
    const variance = counted === null ? null : counted - recorded;
    return { ...p, recorded, counted, variance };
  });

  const variances = rows.filter((r) => r.variance !== null && r.variance !== 0);
  const totalVariance = variances.reduce((s, r) => s + (r.variance ?? 0), 0);

  function handleSubmit() {
    if (variances.length === 0) {
      setError("No variances to submit. Adjust counts first.");
      return;
    }
    setError(null);
    setSuccess(null);
    startTransition(async () => {
      let failed = 0;
      for (const r of variances) {
        const v = r.variance!;
        const res = await recordStockMovement({
          product_id: r.id,
          movement_type: "adjustment",
          quantity: Math.abs(v),
          reason: `Stocktake variance (${v > 0 ? "+" : ""}${v})`,
          reference: "STOCKTAKE",
          warehouse_id: r.warehouse_id,
        });
        if (res?.error) failed++;
      }
      if (failed > 0) {
        setError(`${failed} adjustment(s) failed. Others may have succeeded.`);
      } else {
        setSuccess(`${variances.length} adjustment(s) recorded. Stocktake complete.`);
        setCounts({});
        router.refresh();
      }
    });
  }

  if (products.length === 0) {
    return (
      <EmptyState
        icon={<ClipboardCheck size={22} strokeWidth={1.75} />}
        title="No products to count"
        description="Add products in Inventory first, then return here to count stock."
      />
    );
  }

  return (
    <div className="min-w-0 space-y-6">
      {error && (
        <div role="alert" className="rounded-control border border-danger/30 bg-danger-soft px-4 py-3 text-sm text-danger">
          {error}
        </div>
      )}
      {success && (
        <div className="rounded-control border border-brand/20 bg-brand-soft px-4 py-3 text-sm text-brand-ink">
          {success}
        </div>
      )}

      {!canAdjust && (
        <div className="rounded-control border border-line bg-sunken px-4 py-3 text-sm text-ink-muted">
          You have read-only access. Only managers can submit stocktake adjustments.
        </div>
      )}

      <div className="rounded-card border border-line bg-surface ring-1 ring-black/[0.02]">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-4">
          <h2 className="text-base font-medium tracking-[-0.01em] text-ink">Count sheet</h2>
          <span className="text-xs text-ink-muted">
            {variances.length} variance{variances.length === 1 ? "" : "s"}
            {variances.length > 0 ? ` · net ${totalVariance > 0 ? "+" : ""}${totalVariance}` : ""}
          </span>
        </div>
        <div className="max-w-full overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-sunken text-[11px] uppercase tracking-[0.08em] text-ink-muted">
              <tr>
                <th className="px-5 py-2.5 font-medium">SKU</th>
                <th className="px-5 py-2.5 font-medium">Product</th>
                <th className="px-5 py-2.5 text-right font-medium">Recorded</th>
                <th className="px-5 py-2.5 text-right font-medium">Counted</th>
                <th className="px-5 py-2.5 text-right font-medium">Variance</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {rows.map((r) => (
                <tr key={r.id} className="transition-colors hover:bg-sunken/60">
                  <td className="whitespace-nowrap px-5 py-3 font-mono text-xs text-ink-muted">{r.sku}</td>
                  <td className="px-5 py-3 font-medium text-ink">{r.name}</td>
                  <td className="px-5 py-3 text-right font-mono tabular text-ink-muted">
                    {r.recorded} {r.unit}
                  </td>
                  <td className="px-5 py-3 text-right">
                    <Input
                      type="number"
                      min={0}
                      value={counts[r.id] ?? ""}
                      onChange={(e) => setCounts({ ...counts, [r.id]: e.target.value })}
                      disabled={!canAdjust}
                      className="h-8 w-20 text-right"
                    />
                  </td>
                  <td className={`px-5 py-3 text-right font-mono text-sm font-semibold tabular ${
                    r.variance === null ? "text-ink-faint" :
                    r.variance === 0 ? "text-brand" :
                    r.variance > 0 ? "text-info" : "text-danger"
                  }`}>
                    {r.variance === null ? "—" : (r.variance > 0 ? `+${r.variance}` : r.variance)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {canAdjust && (
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={() => setCounts({})} disabled={isPending}>
            Reset
          </Button>
          <Button onClick={handleSubmit} loading={isPending} disabled={variances.length === 0}>
            <Save size={15} aria-hidden="true" />
            Submit adjustments ({variances.length})
          </Button>
        </div>
      )}
    </div>
  );
}
