export const runtime = "edge";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import StocktakingClient from "./stocktaking-client";

export default async function StocktakingPage() {
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

  const [productsRes, stockRes, warehousesRes] = await Promise.all([
    supabase.from("products").select("id, sku, name, unit, warehouse_id").order("name"),
    supabase.from("product_stock").select("product_id, quantity_on_hand"),
    supabase.from("warehouses").select("id, name").order("name"),
  ]);

  const stockMap: Record<string, number> = {};
  for (const row of stockRes.data ?? []) stockMap[row.product_id] = row.quantity_on_hand;

  return (
    <main className="mx-auto max-w-[1200px] px-5 py-8 sm:px-8 lg:py-10 overflow-x-hidden">
      <div className="mb-7">
        <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-brand">Stocktaking</p>
        <h1 className="mt-1.5 text-2xl font-semibold tracking-[-0.02em] text-ink">Stocktaking</h1>
        <p className="mt-1 text-sm text-ink-muted">
          Count physical stock, compare to recorded, and submit adjustments.
        </p>
      </div>
      <StocktakingClient
        products={productsRes.data ?? []}
        stockMap={stockMap}
        warehouses={warehousesRes.data ?? []}
        role={profile.role}
      />
    </main>
  );
}
