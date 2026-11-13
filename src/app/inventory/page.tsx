export const runtime = "edge";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { can } from "@/lib/permissions";
import InventoryClient from "./inventory-client";

export default async function InventoryPage() {
  if (!isSupabaseConfigured()) {
    return (
      <main className="mx-auto max-w-[1200px] overflow-x-hidden px-5 py-12 sm:px-8">
        <div className="rounded-card border border-warn/30 bg-warn-soft p-8">
          <h1 className="text-xl font-semibold text-ink">Setup required</h1>
          <p className="mt-2 text-sm text-ink-muted">Supabase is not configured yet.</p>
        </div>
      </main>
    );
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("org_id, role")
    .eq("id", user.id)
    .maybeSingle();

  if (!profile?.org_id) redirect("/onboarding");

  // Drivers have no business in the catalog or the stock ledger.
  if (!can(profile.role, "inventory.view")) redirect("/dispatch");

  const [productsRes, stockRes, warehousesRes, movementsRes] = await Promise.all([
    // `*` rather than an explicit column list: `location` only exists once
    // migration 012 has run, and naming it explicitly would make the whole
    // inventory page fail to load on a database that has not been migrated yet.
    supabase.from("products").select("*").order("created_at", { ascending: false }),
    supabase.from("product_stock").select("product_id, quantity_on_hand"),
    supabase.from("warehouses").select("id, name, location").order("name"),
    supabase
      .from("stock_movements")
      .select(
        "id, product_id, movement_type, quantity, reason, reference, created_at, products(name)",
      )
      .order("created_at", { ascending: false })
      .limit(20),
  ]);

  const products = (productsRes.data ?? []).map((p: any) => ({
    ...p,
    location: p.location ?? null,
  }));

  const stockMap: Record<string, number> = {};
  for (const row of stockRes.data ?? []) {
    stockMap[row.product_id] = row.quantity_on_hand;
  }

  const movements = (movementsRes.data ?? []).map((m: any) => ({
    id: m.id,
    product_id: m.product_id,
    product_name: Array.isArray(m.products)
      ? (m.products[0]?.name ?? "Unknown")
      : (m.products?.name ?? "Unknown"),
    movement_type: m.movement_type,
    quantity: m.quantity,
    reason: m.reason,
    reference: m.reference,
    created_at: m.created_at,
  }));

  return (
    <main className="mx-auto max-w-[1200px] overflow-x-hidden px-5 py-8 sm:px-8 lg:py-10">
      <div className="mb-7">
        <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-brand">
          Inventory
        </p>
        <h1 className="mt-1.5 text-2xl font-semibold tracking-[-0.02em] text-ink">
          Inventory
        </h1>
        <p className="mt-1 text-sm text-ink-muted">
          Track stock levels, movements, and adjustments.
        </p>
      </div>
      <InventoryClient
        products={products}
        stockMap={stockMap}
        warehouses={warehousesRes.data ?? []}
        movements={movements}
        role={profile.role}
      />
    </main>
  );
}
