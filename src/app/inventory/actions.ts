"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { can } from "@/lib/permissions";

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

export async function createProduct(formData: {
  sku: string;
  name: string;
  description?: string;
  unit: string;
  reorder_level: number;
  warehouse_id: string | null;
}) {
  const { supabase, user, orgId, role } = await getOrgAndUser();
  if (!user || !orgId) return { error: "Not authenticated or no organization" };
  if (!can(role, "inventory.manage")) {
    return { error: "Your role does not have permission to manage inventory." };
  }

  const { error } = await supabase.from("products").insert({
    org_id: orgId,
    sku: formData.sku.trim(),
    name: formData.name.trim(),
    description: formData.description?.trim() || null,
    unit: formData.unit.trim() || "unit",
    reorder_level: formData.reorder_level,
    warehouse_id: formData.warehouse_id || null,
  });

  if (error) return { error: error.message };

  // Audit log
  await supabase.from("audit_logs").insert({
    org_id: orgId,
    actor_id: user.id,
    action: "product.created",
    entity_type: "product",
    metadata: { sku: formData.sku, name: formData.name },
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
    })
    .eq("id", productId)
    .eq("org_id", orgId);

  if (error) return { error: error.message };

  await supabase.from("audit_logs").insert({
    org_id: orgId,
    actor_id: user.id,
    action: "product.updated",
    entity_type: "product",
    entity_id: productId,
    metadata: { sku: formData.sku, name: formData.name },
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

  await supabase.from("audit_logs").insert({
    org_id: orgId,
    actor_id: user.id,
    action: "product.deleted",
    entity_type: "product",
    entity_id: productId,
  });

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

  // Validate quantity
  if (formData.quantity <= 0) {
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

  await supabase.from("audit_logs").insert({
    org_id: orgId,
    actor_id: user.id,
    action: `stock.${formData.movement_type}`,
    entity_type: "stock_movement",
    metadata: {
      product_id: formData.product_id,
      quantity: formData.quantity,
      reason: formData.reason,
      reference: formData.reference,
    },
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

  const { error } = await supabase.from("warehouses").insert({
    org_id: orgId,
    name: name.trim(),
    location: location?.trim() || null,
  });

  if (error) return { error: error.message };

  revalidatePath("/inventory");
  return { success: true };
}
