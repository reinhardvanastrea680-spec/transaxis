"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { can } from "@/lib/permissions";
import { getOrgBilling } from "@/lib/billing-server";
import { limitMessage, withinLimit } from "@/lib/plans";

async function getOrgAndUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { supabase, user: null, orgId: null, role: null };

  const { data: profile } = await supabase
    .from("profiles")
    .select("org_id, role")
    .eq("id", user.id)
    .maybeSingle();

  return {
    supabase,
    user,
    orgId: profile?.org_id ?? null,
    role: profile?.role ?? null,
  };
}

/** Fire-and-forget audit log — don't block the response on it. */
function logAudit(
  supabase: Awaited<ReturnType<typeof createClient>>,
  orgId: string,
  actorId: string,
  action: string,
  entityType: string,
  entityId?: string,
  metadata?: Record<string, unknown>,
) {
  return supabase.from("audit_logs").insert({
    org_id: orgId,
    actor_id: actorId,
    action,
    entity_type: entityType,
    ...(entityId ? { entity_id: entityId } : {}),
    metadata: metadata ?? {},
  });
}

/**
 * A write can fail because migration 012 has not been applied yet, in which case
 * PostgREST rejects the unknown column with a schema-cache error. Say what is
 * actually wrong instead of leaking that string to the user.
 */
function productWriteError(message: string): string {
  if (/location/i.test(message) && /column|schema cache/i.test(message)) {
    return "Storage locations are not enabled on this database yet. An administrator needs to run migration 012.";
  }
  return message;
}

export async function createProduct(formData: {
  sku: string;
  name: string;
  description?: string;
  unit: string;
  reorder_level: number;
  warehouse_id: string | null;
  location?: string | null;
}) {
  const { supabase, user, orgId, role } = await getOrgAndUser();
  if (!user || !orgId) return { error: "Not authenticated or no organization" };
  if (!can(role, "inventory.manage")) {
    return { error: "Your role does not have permission to manage inventory." };
  }

  const billing = await getOrgBilling(supabase, orgId);
  const { count: productCount } = await supabase
    .from("products")
    .select("id", { count: "exact", head: true })
    .eq("org_id", orgId);

  if (!withinLimit(productCount ?? 0, billing.limits.skus)) {
    return { error: limitMessage(billing.plan, "skus") };
  }

  const { error } = await supabase.from("products").insert({
    org_id: orgId,
    sku: formData.sku.trim(),
    name: formData.name.trim(),
    description: formData.description?.trim() || null,
    unit: formData.unit.trim() || "unit",
    reorder_level: formData.reorder_level,
    warehouse_id: formData.warehouse_id || null,
    location: formData.location?.trim() || null,
  });

  if (error) return { error: productWriteError(error.message) };

  // Audit log — fire and forget (don't block the response)
  logAudit(supabase, orgId, user.id, "product.created", "product", undefined, {
    sku: formData.sku,
    name: formData.name,
  });

  revalidatePath("/inventory");
  return { success: true };
}

export async function updateProduct(
  productId: string,
  formData: {
    sku: string;
    name: string;
    description?: string;
    unit: string;
    reorder_level: number;
    warehouse_id: string | null;
    location?: string | null;
  }
) {
  const { supabase, user, orgId, role } = await getOrgAndUser();
  if (!user || !orgId) return { error: "Not authenticated or no organization" };
  if (!can(role, "inventory.manage")) {
    return { error: "Your role does not have permission to manage inventory." };
  }

  const { error } = await supabase
    .from("products")
    .update({
      sku: formData.sku.trim(),
      name: formData.name.trim(),
      description: formData.description?.trim() || null,
      unit: formData.unit.trim() || "unit",
      reorder_level: formData.reorder_level,
      warehouse_id: formData.warehouse_id || null,
      location: formData.location?.trim() || null,
    })
    .eq("id", productId)
    .eq("org_id", orgId);

  if (error) return { error: productWriteError(error.message) };

  logAudit(supabase, orgId, user.id, "product.updated", "product", productId, {
    sku: formData.sku,
    name: formData.name,
  });

  revalidatePath("/inventory");
  return { success: true };
}

/**
 * Sets just the storage location. Used by the inline editor on the product
 * detail panel, so correcting a shelf number does not mean re-submitting the
 * whole product form — and cannot accidentally overwrite the other fields.
 */
export async function updateProductLocation(
  productId: string,
  location: string | null,
) {
  const { supabase, user, orgId, role } = await getOrgAndUser();
  if (!user || !orgId) return { error: "Not authenticated or no organization" };
  if (!can(role, "inventory.manage")) {
    return { error: "Your role does not have permission to manage inventory." };
  }

  const cleaned = location?.trim() || null;

  const { error } = await supabase
    .from("products")
    .update({ location: cleaned })
    .eq("id", productId)
    .eq("org_id", orgId);

  if (error) return { error: productWriteError(error.message) };

  logAudit(supabase, orgId, user.id, "product.location_updated", "product", productId, {
    location: cleaned,
  });

  revalidatePath("/inventory");
  return { success: true };
}

export async function deleteProduct(productId: string) {
  const { supabase, user, orgId, role } = await getOrgAndUser();
  if (!user || !orgId) return { error: "Not authenticated or no organization" };
  if (!can(role, "inventory.manage")) {
    return { error: "Your role does not have permission to manage inventory." };
  }

  // Check if product has stock movements
  const { count } = await supabase
    .from("stock_movements")
    .select("id", { count: "exact", head: true })
    .eq("product_id", productId);

  if (count && count > 0) {
    return { error: "Cannot delete product with existing stock movements. Archive it instead." };
  }

  const { error } = await supabase
    .from("products")
    .delete()
    .eq("id", productId)
    .eq("org_id", orgId);

  if (error) return { error: error.message };

  logAudit(supabase, orgId, user.id, "product.deleted", "product", productId);

  revalidatePath("/inventory");
  return { success: true };
}

export async function recordStockMovement(formData: {
  product_id: string;
  movement_type: "in" | "out" | "adjustment" | "transfer";
  quantity: number;
  reason?: string;
  reference?: string;
  warehouse_id?: string | null;
}) {
  const { supabase, user, orgId, role } = await getOrgAndUser();
  if (!user || !orgId) return { error: "Not authenticated or no organization" };
  if (!can(role, "inventory.manage")) {
    return { error: "Your role does not have permission to record stock movements." };
  }

  // Validate quantity.
  // 'adjustment' is the one movement type that carries a direction: a negative
  // quantity reduces stock (shrinkage), a positive one increases it (found
  // stock). Every other type is a magnitude, so it must be positive.
  if (formData.movement_type === "adjustment") {
    if (!Number.isInteger(formData.quantity) || formData.quantity === 0) {
      return { error: "An adjustment needs a non-zero whole number. Use a negative value to reduce stock." };
    }
  } else if (formData.quantity <= 0) {
    return { error: "Quantity must be greater than 0" };
  }

  // For 'out' movements, check sufficient stock
  if (formData.movement_type === "out") {
    const { data: stock } = await supabase
      .from("product_stock")
      .select("quantity_on_hand")
      .eq("product_id", formData.product_id)
      .maybeSingle();

    if (!stock || stock.quantity_on_hand < formData.quantity) {
      return {
        error: `Insufficient stock. Available: ${stock?.quantity_on_hand ?? 0}, requested: ${formData.quantity}`,
      };
    }
  }

  const { error } = await supabase.from("stock_movements").insert({
    org_id: orgId,
    product_id: formData.product_id,
    warehouse_id: formData.warehouse_id || null,
    movement_type: formData.movement_type,
    quantity: formData.quantity,
    reason: formData.reason?.trim() || null,
    reference: formData.reference?.trim() || null,
    performed_by: user.id,
  });

  if (error) return { error: error.message };

  logAudit(supabase, orgId, user.id, `stock.${formData.movement_type}`, "stock_movement", undefined, {
    product_id: formData.product_id,
    quantity: formData.quantity,
    reason: formData.reason,
    reference: formData.reference,
  });

  revalidatePath("/inventory");
  return { success: true };
}

export async function createWarehouse(name: string, location?: string) {
  const { supabase, user, orgId, role } = await getOrgAndUser();
  if (!user || !orgId) return { error: "Not authenticated or no organization" };
  if (!can(role, "warehouse.manage")) {
    return { error: "Your role does not have permission to manage warehouses." };
  }

  const billing = await getOrgBilling(supabase, orgId);
  const { count: warehouseCount } = await supabase
    .from("warehouses")
    .select("id", { count: "exact", head: true })
    .eq("org_id", orgId);

  if (!withinLimit(warehouseCount ?? 0, billing.limits.warehouses)) {
    return { error: limitMessage(billing.plan, "warehouses") };
  }

  const { error } = await supabase.from("warehouses").insert({
    org_id: orgId,
    name: name.trim(),
    location: location?.trim() || null,
  });

  if (error) return { error: error.message };

  revalidatePath("/inventory");
  return { success: true };
}

/**
 * Bulk product import.
 *
 * Typing 100 SKUs by hand is the single biggest reason a trial never reaches
 * the point where the product is useful, so import has to exist before the
 * trial can be sold. Header row is required; column order does not matter.
 */
export async function importProducts(csvText: string) {
  const { supabase, user, orgId, role } = await getOrgAndUser();
  if (!user || !orgId) return { error: "Not authenticated or no organization" };
  if (!can(role, "inventory.manage")) {
    return { error: "Your role does not have permission to import products." };
  }

  const lines = csvText
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  if (lines.length < 2) {
    return { error: "The file needs a header row and at least one product." };
  }

  const header = parseCsvLine(lines[0]).map((h) => h.toLowerCase());
  const col = (names: string[]) => header.findIndex((h) => names.includes(h));

  const skuIdx = col(["sku", "code"]);
  const nameIdx = col(["name", "product", "product name"]);
  const unitIdx = col(["unit", "uom"]);
  const reorderIdx = col(["reorder_level", "reorder", "reorder level"]);
  const descIdx = col(["description", "notes"]);
  const warehouseIdx = col(["warehouse", "warehouse name", "location"]);

  if (skuIdx === -1 || nameIdx === -1) {
    return { error: "The header row must include at least 'sku' and 'name'." };
  }

  const { data: warehouses } = await supabase
    .from("warehouses")
    .select("id, name")
    .eq("org_id", orgId);

  const warehouseByName: Record<string, string> = {};
  for (const w of warehouses ?? []) {
    warehouseByName[w.name.trim().toLowerCase()] = w.id;
  }

  const { data: existing } = await supabase
    .from("products")
    .select("sku")
    .eq("org_id", orgId);

  const seen = new Set(
    (existing ?? []).map((p: any) => String(p.sku).trim().toLowerCase()),
  );

  const billing = await getOrgBilling(supabase, orgId);
  const limit = billing.limits.skus;
  let remaining = limit === Number.POSITIVE_INFINITY
    ? Number.POSITIVE_INFINITY
    : Math.max(0, limit - seen.size);

  const rows: {
    org_id: string;
    sku: string;
    name: string;
    description: string | null;
    unit: string;
    reorder_level: number;
    warehouse_id: string | null;
  }[] = [];

  let duplicates = 0;
  let skippedForLimit = 0;
  let malformed = 0;

  for (const line of lines.slice(1)) {
    const cells = parseCsvLine(line);
    const sku = (cells[skuIdx] ?? "").trim();
    const name = (cells[nameIdx] ?? "").trim();

    if (!sku || !name) {
      malformed++;
      continue;
    }

    const key = sku.toLowerCase();
    if (seen.has(key)) {
      duplicates++;
      continue;
    }

    if (rows.length >= remaining) {
      skippedForLimit++;
      continue;
    }

    const reorderRaw = reorderIdx === -1 ? "" : (cells[reorderIdx] ?? "");
    const reorder = Number.parseInt(reorderRaw, 10);

    const warehouseName =
      warehouseIdx === -1 ? "" : (cells[warehouseIdx] ?? "").trim().toLowerCase();

    rows.push({
      org_id: orgId,
      sku,
      name,
      description: descIdx === -1 ? null : (cells[descIdx] ?? "").trim() || null,
      unit: (unitIdx === -1 ? "" : (cells[unitIdx] ?? "")).trim() || "unit",
      reorder_level: Number.isFinite(reorder) ? Math.max(0, reorder) : 0,
      warehouse_id: warehouseName ? (warehouseByName[warehouseName] ?? null) : null,
    });

    seen.add(key);
  }

  if (rows.length === 0) {
    return {
      error:
        duplicates > 0
          ? "Every SKU in that file already exists."
          : "No valid rows found. Each row needs a sku and a name.",
    };
  }

  const { error } = await supabase.from("products").insert(rows);
  if (error) return { error: error.message };

  logAudit(supabase, orgId, user.id, "product.imported", "product", undefined, {
    imported: rows.length,
    duplicates,
    skipped_for_limit: skippedForLimit,
    malformed,
  });

  revalidatePath("/inventory");
  return {
    success: true,
    imported: rows.length,
    duplicates,
    skippedForLimit,
    malformed,
  };
}

/** Minimal RFC-4180-ish parser: handles quoted fields and doubled quotes. */
function parseCsvLine(line: string): string[] {
  const cells: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        current += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      cells.push(current);
      current = "";
    } else {
      current += ch;
    }
  }

  cells.push(current);
  return cells.map((c) => c.trim());
}

/**
 * Batch record multiple stock movements in a single DB roundtrip.
 * Used by the stocktaking screen to submit all variances at once instead
 * of firing N sequential server actions.
 */
export async function batchStockMovements(
  items: {
    product_id: string;
    movement_type: "in" | "out" | "adjustment" | "transfer";
    quantity: number;
    reason?: string;
    reference?: string;
    warehouse_id?: string | null;
  }[],
) {
  const { supabase, user, orgId, role } = await getOrgAndUser();
  if (!user || !orgId) return { error: "Not authenticated or no organization" };
  if (!can(role, "inventory.manage")) {
    return { error: "Your role does not have permission to record stock movements." };
  }

  if (!items || items.length === 0) return { error: "No movements to record" };

  // Validate all quantities upfront. Adjustments may be negative; everything
  // else is a magnitude and must be positive.
  for (const item of items) {
    if (!Number.isInteger(item.quantity) || item.quantity === 0) {
      return { error: "Each movement needs a non-zero whole number." };
    }
    if (item.movement_type !== "adjustment" && item.quantity < 0) {
      return { error: "Only adjustments can be negative." };
    }
  }

  // Batch insert all movements in a single query
  const { error } = await supabase.from("stock_movements").insert(
    items.map((item) => ({
      org_id: orgId,
      product_id: item.product_id,
      warehouse_id: item.warehouse_id || null,
      movement_type: item.movement_type,
      quantity: item.quantity,
      reason: item.reason?.trim() || null,
      reference: item.reference?.trim() || null,
      performed_by: user.id,
    })),
  );

  if (error) return { error: error.message };

  // Fire-and-forget audit logs (batch)
  logAudit(supabase, orgId, user.id, "stock.batch_adjustment", "stock_movement", undefined, {
    count: items.length,
    reference: items[0]?.reference,
  });

  revalidatePath("/inventory");
  return { success: true, count: items.length };
}
