"use server";

import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { can } from "@/lib/permissions";

function getServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  return createSupabaseClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

async function getOrgAndUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { supabase, user: null, orgId: null, profile: null, role: null };

  const { data: profile } = await supabase
    .from("profiles")
    .select("org_id, role, full_name")
    .eq("id", user.id)
    .maybeSingle();

  return {
    supabase,
    user,
    orgId: profile?.org_id ?? null,
    profile,
    role: profile?.role ?? null,
  };
}

export async function createDispatch(formData: {
  customer_name: string;
  customer_address: string;
  warehouse_id: string | null;
  notes: string;
  items: { product_id: string; quantity: number }[];
}) {
  const { supabase, user, orgId, role } = await getOrgAndUser();
  if (!user || !orgId) return { error: "Not authenticated or no organization" };
  if (!can(role, "dispatch.create")) {
    return { error: "Your role does not have permission to create dispatches." };
  }

  if (!formData.items || formData.items.length === 0) {
    return { error: "At least one line item is required" };
  }

  // Validate stock availability for all items
  for (const item of formData.items) {
    if (item.quantity <= 0) {
      return { error: "Quantity must be greater than 0" };
    }
    const { data: stock } = await supabase
      .from("product_stock")
      .select("quantity_on_hand, name")
      .eq("product_id", item.product_id)
      .maybeSingle();

    if (!stock || stock.quantity_on_hand < item.quantity) {
      return {
        error: `Insufficient stock for ${stock?.name || "product"}. Available: ${stock?.quantity_on_hand ?? 0}, requested: ${item.quantity}`,
      };
    }
  }

  // Create dispatch
  const { data: dispatch, error: dispatchError } = await supabase
    .from("dispatches")
    .insert({
      org_id: orgId,
      warehouse_id: formData.warehouse_id || null,
      status: "created",
      customer_name: formData.customer_name.trim() || null,
      customer_address: formData.customer_address.trim() || null,
      notes: formData.notes.trim() || null,
      created_by: user.id,
    })
    .select("id")
    .single();

  if (dispatchError || !dispatch) {
    return { error: dispatchError?.message ?? "Failed to create dispatch" };
  }

  // Insert line items
  const { error: itemsError } = await supabase.from("dispatch_items").insert(
    formData.items.map((item) => ({
      dispatch_id: dispatch.id,
      product_id: item.product_id,
      quantity: item.quantity,
    }))
  );

  if (itemsError) {
    return { error: itemsError.message };
  }

  // Auto-generate stock "out" movements.
  // Uses the service role because this is a trusted server-side side-effect of
  // a dispatch we just validated — a dispatcher has no direct inventory write
  // rights, but dispatching must still deduct stock.
  const service = getServiceClient();
  const { error: movementError } = await service.from("stock_movements").insert(
    formData.items.map((item) => ({
      org_id: orgId,
      product_id: item.product_id,
      warehouse_id: formData.warehouse_id || null,
      movement_type: "out",
      quantity: item.quantity,
      reason: `Dispatch #${dispatch.id.slice(0, 8)}`,
      reference: dispatch.id,
      performed_by: user.id,
    }))
  );

  if (movementError) {
    return { error: movementError.message };
  }

  // Audit log
  await supabase.from("audit_logs").insert({
    org_id: orgId,
    actor_id: user.id,
    action: "dispatch.created",
    entity_type: "dispatch",
    entity_id: dispatch.id,
    metadata: {
      customer_name: formData.customer_name,
      items: formData.items.length,
    },
  });

  revalidatePath("/dispatch");
  revalidatePath("/inventory");
  return { success: true, dispatchId: dispatch.id };
}

export async function updateDispatchStatus(
  dispatchId: string,
  newStatus: "assigned" | "in_transit" | "delivered" | "failed" | "cancelled"
) {
  const { supabase, user, orgId, role } = await getOrgAndUser();
  if (!user || !orgId) return { error: "Not authenticated or no organization" };

  const canUpdateAny = can(role, "dispatch.status.all");
  const canUpdateOwn = can(role, "dispatch.status.own");
  if (!canUpdateAny && !canUpdateOwn) {
    return { error: "Your role does not have permission to update dispatch status." };
  }

  const { error } = await supabase
    .from("dispatches")
    .update({ status: newStatus, updated_at: new Date().toISOString() })
    .eq("id", dispatchId)
    .eq("org_id", orgId);

  if (error) return { error: error.message };

  await supabase.from("audit_logs").insert({
    org_id: orgId,
    actor_id: user.id,
    action: `dispatch.status_${newStatus}`,
    entity_type: "dispatch",
    entity_id: dispatchId,
    metadata: { new_status: newStatus },
  });

  revalidatePath("/dispatch");
  return { success: true };
}

export async function assignDispatch(
  dispatchId: string,
  driverId: string | null,
  vehicle: string | null
) {
  const { supabase, user, orgId, role } = await getOrgAndUser();
  if (!user || !orgId) return { error: "Not authenticated or no organization" };
  if (!can(role, "dispatch.assign")) {
    return { error: "Your role does not have permission to assign dispatches." };
  }

  const updateData: any = { updated_at: new Date().toISOString() };
  if (driverId) {
    updateData.assigned_to = driverId;
    updateData.status = "assigned";
  }
  if (vehicle) {
    updateData.vehicle = vehicle;
  }

  const { error } = await supabase
    .from("dispatches")
    .update(updateData)
    .eq("id", dispatchId)
    .eq("org_id", orgId);

  if (error) return { error: error.message };

  await supabase.from("audit_logs").insert({
    org_id: orgId,
    actor_id: user.id,
    action: "dispatch.assigned",
    entity_type: "dispatch",
    entity_id: dispatchId,
    metadata: { driver_id: driverId, vehicle },
  });

  revalidatePath("/dispatch");
  return { success: true };
}

export async function addProofOfDelivery(dispatchId: string, url: string) {
  const { supabase, user, orgId, role } = await getOrgAndUser();
  if (!user || !orgId) return { error: "Not authenticated or no organization" };
  if (!can(role, "dispatch.pod")) {
    return { error: "Your role does not have permission to record proof of delivery." };
  }

  const { error } = await supabase
    .from("dispatches")
    .update({
      proof_of_delivery_url: url.trim(),
      status: "delivered",
      updated_at: new Date().toISOString(),
    })
    .eq("id", dispatchId)
    .eq("org_id", orgId);

  if (error) return { error: error.message };

  await supabase.from("audit_logs").insert({
    org_id: orgId,
    actor_id: user.id,
    action: "dispatch.delivered",
    entity_type: "dispatch",
    entity_id: dispatchId,
    metadata: { proof_of_delivery_url: url },
  });

  revalidatePath("/dispatch");
  return { success: true };
}

export async function createVehicle(plateNumber: string, description?: string) {
  const { supabase, user, orgId, role } = await getOrgAndUser();
  if (!user || !orgId) return { error: "Not authenticated or no organization" };
  if (!can(role, "vehicle.manage")) {
    return { error: "Your role does not have permission to manage vehicles." };
  }

  const { error } = await supabase.from("vehicles").insert({
    org_id: orgId,
    plate_number: plateNumber.trim(),
    description: description?.trim() || null,
  });

  if (error) return { error: error.message };

  revalidatePath("/dispatch");
  return { success: true };
}

export async function deleteDispatch(dispatchId: string) {
  const { supabase, user, orgId, role } = await getOrgAndUser();
  if (!user || !orgId) return { error: "Not authenticated or no organization" };
  if (!can(role, "dispatch.delete")) {
    return { error: "Your role does not have permission to delete dispatches." };
  }

  // Only allow deletion of "created" status dispatches
  const { data: dispatch } = await supabase
    .from("dispatches")
    .select("status")
    .eq("id", dispatchId)
    .eq("org_id", orgId)
    .maybeSingle();

  if (!dispatch) return { error: "Dispatch not found" };
  if (dispatch.status !== "created") {
    return { error: "Only dispatches in 'created' status can be deleted" };
  }

  const { error } = await supabase
    .from("dispatches")
    .delete()
    .eq("id", dispatchId)
    .eq("org_id", orgId);

  if (error) return { error: error.message };

  await supabase.from("audit_logs").insert({
    org_id: orgId,
    actor_id: user.id,
    action: "dispatch.deleted",
    entity_type: "dispatch",
    entity_id: dispatchId,
  });

  revalidatePath("/dispatch");
  revalidatePath("/inventory");
  return { success: true };
}
