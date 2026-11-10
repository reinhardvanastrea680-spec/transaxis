export const runtime = "edge";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import DispatchClient, { type Dispatch } from "./dispatch-client";

type DispatchRow = Dispatch;

export default async function DispatchPage() {
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

  const [dispatchRes, itemRes, productsRes, warehousesRes, staffRes, vehiclesRes, stockRes] =
    await Promise.all([
      supabase
        .from("dispatches")
        .select(
          "id, status, customer_name, customer_address, warehouse_id, assigned_to, vehicle, notes, proof_of_delivery_url, created_at",
        )
        .order("created_at", { ascending: false }),
      supabase
        .from("dispatch_items")
        .select("dispatch_id, product_id, quantity, products(name)"),
      supabase.from("products").select("id, name, sku, unit").order("name"),
      supabase.from("warehouses").select("id, name").order("name"),
      supabase.from("profiles").select("id, full_name, role").order("full_name"),
      supabase.from("vehicles").select("id, plate_number, description").order("plate_number"),
      supabase.from("product_stock").select("product_id, quantity_on_hand"),
    ]);

  const dispatchRows = dispatchRes.data ?? [];
  const dispatchIds = dispatchRows.map((d: any) => d.id);

  const itemsByDispatch: Record<string, any[]> = {};
  if (dispatchIds.length > 0) {
    for (const item of itemRes.data ?? []) {
      if (!itemsByDispatch[item.dispatch_id]) itemsByDispatch[item.dispatch_id] = [];
      itemsByDispatch[item.dispatch_id].push({
        product_id: item.product_id,
        product_name: Array.isArray((item as any).products)
          ? ((item as any).products[0]?.name ?? "Unknown")
          : ((item as any).products?.name ?? "Unknown"),
        quantity: item.quantity,
      });
    }
  }

  const dispatches: DispatchRow[] = dispatchRows.map((d: any) => ({
    id: d.id,
    status: d.status,
    customer_name: d.customer_name,
    customer_address: d.customer_address,
    warehouse_id: d.warehouse_id,
    assigned_to: d.assigned_to,
    driver_name: null as string | null,
    warehouse_name: null as string | null,
    vehicle: d.vehicle,
    notes: d.notes,
    proof_of_delivery_url: d.proof_of_delivery_url,
    created_at: d.created_at,
    items: itemsByDispatch[d.id] || [],
  }));

  const stockMap: Record<string, number> = {};
  for (const row of stockRes.data ?? []) {
    stockMap[row.product_id] = row.quantity_on_hand;
  }

  // Resolve warehouse + driver names from the lookup lists (avoids relying on
  // Supabase's generated foreign-key constraint names in embedded selects).
  const warehouseLookup: Record<string, string> = {};
  for (const w of warehousesRes.data ?? []) {
    warehouseLookup[w.id] = w.name;
  }
  const driverLookup: Record<string, string> = {};
  for (const s2 of staffRes.data ?? []) {
    driverLookup[s2.id] = s2.full_name ?? "Unnamed driver";
  }
  for (const d of dispatches) {
    d.warehouse_name = d.warehouse_id
      ? (warehouseLookup[d.warehouse_id] ?? null)
      : null;
    d.driver_name = d.assigned_to
      ? (driverLookup[d.assigned_to] ?? "Unassigned driver")
      : null;
  }

  return (
    <main className="mx-auto max-w-[1200px] overflow-x-hidden px-5 py-8 sm:px-8 lg:py-10">
      <div className="mb-7">
        <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-brand">
          Dispatch
        </p>
        <h1 className="mt-1.5 text-2xl font-semibold tracking-[-0.02em] text-ink">
          Dispatch
        </h1>
        <p className="mt-1 text-sm text-ink-muted">
          Create orders, assign drivers, track deliveries.
        </p>
      </div>
      <DispatchClient
        dispatches={dispatches}
        products={productsRes.data ?? []}
        warehouses={warehousesRes.data ?? []}
        staff={staffRes.data ?? []}
        vehicles={vehiclesRes.data ?? []}
        stockMap={stockMap}
        role={profile.role}
        currentUserId={user.id}
      />
    </main>
  );
}
