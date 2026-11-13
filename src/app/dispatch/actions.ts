"use server";

import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { can } from "@/lib/permissions";
import { checkTransition, transitionRequiresExistingPod } from "@/lib/dispatch-flow";

function getServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  return createSupabaseClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
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

  // Audit log — fire and forget
  logAudit(supabase, orgId, user.id, "dispatch.created", "dispatch", dispatch.id, {
    customer_name: formData.customer_name,
    items: formData.items.length,
  });

  revalidatePath("/dispatch");
  revalidatePath("/inventory");
  return { success: true, dispatchId: dispatch.id };
}

export async function updateDispatchStatus(
  dispatchId: string,
  newStatus:
    | "assigned"
    | "in_transit"
    | "delivered_pending"
    | "delivered"
    | "failed"
    | "cancelled",
) {
  const { supabase, user, orgId, role } = await getOrgAndUser();
  if (!user || !orgId) return { error: "Not authenticated or no organization" };

  const canUpdateAny = can(role, "dispatch.status.all");
  const canUpdateOwn = can(role, "dispatch.status.own");
  if (!canUpdateAny && !canUpdateOwn) {
    return { error: "Your role does not have permission to update dispatch status." };
  }

  const { data: existing } = await supabase
    .from("dispatches")
    .select("status, assigned_to")
    .eq("id", dispatchId)
    .eq("org_id", orgId)
    .maybeSingle();

  if (!existing) return { error: "Dispatch not found" };

  // "assigned" is not a status anyone picks. It is what happens when the owner
  // attaches a driver, and that is the only path to it.
  if (newStatus === "assigned") {
    return {
      error:
        "A dispatch becomes assigned when the owner attaches a driver. Use Assign driver instead.",
    };
  }

  // Same reasoning for "delivered_pending": it means "evidence exists and is
  // waiting for review". It can only be reached by actually uploading a photo,
  // so allowing it here would let a driver skip the camera entirely.
  if (newStatus === "delivered_pending") {
    return {
      error: "A delivery is submitted by taking a photo. Use Send delivery proof.",
    };
  }

  // Same state machine the UI renders from, so the server can never accept a
  // move the driver was never offered (or one they are not entitled to).
  const context = {
    status: existing.status,
    isMine: existing.assigned_to === user.id,
    canUpdateAny,
    canUpdateOwn,
    canConfirm: can(role, "dispatch.confirm"),
  };

  const blocked = checkTransition(context, newStatus);
  if (blocked) return { error: blocked };

  // Confirming a delivery is a sign-off on the driver's evidence. No evidence,
  // nothing to sign off — so the move is refused rather than silently accepted.
  if (transitionRequiresExistingPod(context, newStatus)) {
    const { count: podCount } = await supabase
      .from("dispatch_pods")
      .select("id", { count: "exact", head: true })
      .eq("dispatch_id", dispatchId);

    if (!podCount) {
      return {
        error:
          "There is no proof of delivery for this run yet. Ask the driver to send a photo.",
      };
    }
  }

  const now = new Date().toISOString();
  const update: {
    status: string;
    updated_at: string;
    confirmed_at?: string;
    confirmed_by?: string;
  } = { status: newStatus, updated_at: now };

  if (newStatus === "delivered") {
    update.confirmed_at = now;
    update.confirmed_by = user.id;
  }

  const { error } = await supabase
    .from("dispatches")
    .update(update)
    .eq("id", dispatchId)
    .eq("org_id", orgId);

  if (error) return { error: error.message };

  // A cancelled or failed run never left the warehouse, so the stock that was
  // deducted when the dispatch was created has to come back.
  if (
    (newStatus === "cancelled" || newStatus === "failed") &&
    existing.status !== "cancelled" &&
    existing.status !== "failed"
  ) {
    await restoreDispatchStock(orgId, dispatchId, user.id);
  }

  logAudit(
    supabase,
    orgId,
    user.id,
    newStatus === "delivered"
      ? "dispatch.delivery_confirmed"
      : `dispatch.status_${newStatus}`,
    "dispatch",
    dispatchId,
    {
      new_status: newStatus,
      previous_status: existing.status,
      ...(newStatus === "delivered" ? { confirmed_by: user.id } : {}),
    },
  );

  revalidatePath("/dispatch");
  revalidatePath("/inventory");
  revalidatePath("/dashboard");
  return { success: true };
}

/**
 * Return the stock a dispatch had deducted. Idempotent: the compensating
 * movements carry a marker in `reason`, and we skip the work if they are
 * already there.
 */
async function restoreDispatchStock(
  orgId: string,
  dispatchId: string,
  userId: string,
): Promise<void> {
  const service = getServiceClient();
  const marker = `Returned to stock — dispatch #${dispatchId.slice(0, 8)}`;

  const { count } = await service
    .from("stock_movements")
    .select("id", { count: "exact", head: true })
    .eq("reference", dispatchId)
    .eq("movement_type", "in")
    .eq("reason", marker);

  if (count && count > 0) return;

  const { data: items } = await service
    .from("dispatch_items")
    .select("product_id, quantity")
    .eq("dispatch_id", dispatchId);

  if (!items || items.length === 0) return;

  await service.from("stock_movements").insert(
    items.map((item) => ({
      org_id: orgId,
      product_id: item.product_id,
      movement_type: "in",
      quantity: item.quantity,
      reason: marker,
      reference: dispatchId,
      performed_by: userId,
    })),
  );
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

  const updateData: {
    updated_at: string;
    assigned_to?: string;
    status?: string;
    vehicle?: string;
  } = { updated_at: new Date().toISOString() };
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

  logAudit(supabase, orgId, user.id, "dispatch.assigned", "dispatch", dispatchId, {
    driver_id: driverId,
    vehicle,
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

  const service = getServiceClient();

  // The stock this dispatch deducted has to go with it, otherwise the units are
  // lost from the ledger forever.
  await service
    .from("stock_movements")
    .delete()
    .eq("reference", dispatchId)
    .eq("movement_type", "out");

  // Remove any delivery photos from storage before the rows cascade away.
  const { data: pods } = await service
    .from("dispatch_pods")
    .select("storage_path")
    .eq("dispatch_id", dispatchId);

  if (pods && pods.length > 0) {
    await service.storage.from("pod").remove(pods.map((p) => p.storage_path));
  }

  const { error } = await supabase
    .from("dispatches")
    .delete()
    .eq("id", dispatchId)
    .eq("org_id", orgId);

  if (error) return { error: error.message };

  logAudit(supabase, orgId, user.id, "dispatch.deleted", "dispatch", dispatchId, {
    stock_returned: true,
  });

  revalidatePath("/dispatch");
  revalidatePath("/inventory");
  return { success: true };
}
