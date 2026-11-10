export const runtime = "edge";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import ReportsClient from "./reports-client";

export default async function ReportsPage() {
  if (!isSupabaseConfigured()) {
    return (
      <main className="mx-auto max-w-[1200px] px-5 py-12 sm:px-8 overflow-x-hidden">
        <div className="rounded-card border border-warn/30 bg-warn-soft p-8">
          <h1 className="text-xl font-semibold text-ink">Setup required</h1>
        </div>
      </main>
    );
  }
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { data: profile } = await supabase
    .from("profiles").select("org_id, role").eq("id", user.id).maybeSingle();
  if (!profile?.org_id) redirect("/onboarding");

  const [productsRes, stockRes, movementsRes, dispatchesRes] = await Promise.all([
    supabase.from("products").select("id, sku, name, unit, reorder_level, warehouse_id").order("name"),
    supabase.from("product_stock").select("product_id, quantity_on_hand"),
    supabase.from("stock_movements").select("id, product_id, movement_type, quantity, reason, reference, created_at, products(name)").order("created_at", { ascending: false }).limit(500),
    supabase.from("dispatches").select("id, status, customer_name, customer_address, created_at").order("created_at", { ascending: false }).limit(500),
  ]);

  const stockMap: Record<string, number> = {};
  for (const row of stockRes.data ?? []) stockMap[row.product_id] = row.quantity_on_hand;

  const products = (productsRes.data ?? []).map((p: any) => ({ ...p, on_hand: stockMap[p.id] ?? 0 }));
  const movements = (movementsRes.data ?? []).map((m: any) => ({
    id: m.id,
    product_name: Array.isArray(m.products) ? (m.products[0]?.name ?? "") : (m.products?.name ?? ""),
    movement_type: m.movement_type,
    quantity: m.quantity,
    reason: m.reason,
    reference: m.reference,
    created_at: m.created_at,
  }));

  return (
    <main className="mx-auto max-w-[1200px] px-5 py-8 sm:px-8 lg:py-10 overflow-x-hidden">
      <div className="mb-7">
        <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-brand">Reports</p>
        <h1 className="mt-1.5 text-2xl font-semibold tracking-[-0.02em] text-ink">Reports & Export</h1>
        <p className="mt-1 text-sm text-ink-muted">
          Download your inventory, stock movements, and dispatches as CSV.
        </p>
      </div>
      <ReportsClient
        products={products}
        movements={movements}
        dispatches={dispatchesRes.data ?? []}
      />
    </main>
  );
}
