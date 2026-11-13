"use server";

/**
 * Proof of delivery — photo evidence captured by the driver at the doorstep.
 *
 * The flow is deliberately two-phase so that state only changes once the
 * evidence actually exists:
 *
 *   1. beginPodCapture()  -> server decides the storage path and checks that
 *                            this user is allowed to submit proof for this run.
 *   2. (browser uploads straight to Supabase Storage — no file passes through
 *      the server action, so large photos never hit the function payload cap)
 *   3. confirmPodUpload() -> verifies the object exists, records the row, and
 *                            only then moves the run to "delivered_pending".
 *
 * Note what it does *not* do: it never sets "delivered". The driver submits
 * evidence; the office confirms it. See src/lib/dispatch-flow.ts.
 *
 * A failed upload therefore leaves the dispatch untouched, instead of marking
 * something delivered with a dangling link.
 */

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { can } from "@/lib/permissions";
import { getOrgBilling } from "@/lib/billing-server";

const BUCKET = "pod";

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

/**
 * A driver may only submit proof for dispatches assigned to them. Dispatchers
 * and admins (`dispatch.status.all`) can submit proof for any dispatch in the
 * org.
 */
function maySubmitProof(
  role: string | null,
  dispatch: { assigned_to: string | null },
  userId: string,
): boolean {
  if (!can(role, "dispatch.pod")) return false;
  if (can(role, "dispatch.status.all")) return true;
  return dispatch.assigned_to === userId;
}

/**
 * Which states may submit proof. A driver has to have picked the run up first,
 * so pickup and delivery cannot be collapsed into one tap. The office can
 * attach a photo at any point after assignment, and either side may add more
 * evidence while a delivery is awaiting sign-off.
 */
const OFFICE_POD_STATUSES = ["assigned", "in_transit", "delivered_pending", "delivered"];
const DRIVER_POD_STATUSES = ["in_transit", "delivered_pending"];

function podStatusesFor(role: string | null): string[] {
  return can(role, "dispatch.status.all") ? OFFICE_POD_STATUSES : DRIVER_POD_STATUSES;
}

function podStatusError(status: string): string {
  return status === "assigned"
    ? "Mark this run as picked up before sending delivery proof."
    : "This run cannot take delivery proof from its current state.";
}

/**
 * Evidence is what moves a run from "on the road" to "awaiting sign-off".
 * In any other state the photo is just an attachment and the status stands —
 * an office user photographing a run that has not been picked up must not
 * silently advance it.
 */
function statusAfterEvidence(current: string): string | null {
  return current === "in_transit" ? "delivered_pending" : null;
}

export async function beginPodCapture(dispatchId: string) {
  const { supabase, user, orgId, role } = await getOrgAndUser();
  if (!user || !orgId) return { error: "Not authenticated or no organization" };

  const { data: dispatch } = await supabase
    .from("dispatches")
    .select("id, org_id, status, assigned_to")
    .eq("id", dispatchId)
    .eq("org_id", orgId)
    .maybeSingle();

  if (!dispatch) return { error: "Dispatch not found" };

  if (!maySubmitProof(role, dispatch, user.id)) {
    return { error: "This dispatch is not assigned to you." };
  }

  if (!podStatusesFor(role).includes(dispatch.status)) {
    return { error: podStatusError(dispatch.status) };
  }

  // Storage path convention: {org_id}/{dispatch_id}/{uuid}.jpg
  // The bucket policies require the first segment to be the caller's org.
  const path = `${orgId}/${dispatchId}/${crypto.randomUUID()}.jpg`;

  return { success: true, path, bucket: BUCKET };
}

export async function confirmPodUpload(input: {
  dispatchId: string;
  path: string;
  capturedAt?: string | null;
  lat?: number | null;
  lng?: number | null;
}) {
  const { supabase, user, orgId, role } = await getOrgAndUser();
  if (!user || !orgId) return { error: "Not authenticated or no organization" };

  const { dispatchId, path } = input;

  // The path was minted by us, but never trust a client-supplied string.
  if (!path.startsWith(`${orgId}/${dispatchId}/`) || !path.endsWith(".jpg")) {
    return { error: "Invalid upload path" };
  }

  const { data: dispatch } = await supabase
    .from("dispatches")
    .select("id, status, assigned_to")
    .eq("id", dispatchId)
    .eq("org_id", orgId)
    .maybeSingle();

  if (!dispatch) return { error: "Dispatch not found" };
  if (!maySubmitProof(role, dispatch, user.id)) {
    return { error: "This dispatch is not assigned to you." };
  }

  if (!podStatusesFor(role).includes(dispatch.status)) {
    return { error: podStatusError(dispatch.status) };
  }

  // Prove the object is really there before we call it evidence.
  const { error: probeError } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(path, 60);

  if (probeError) {
    return { error: "The photo did not finish uploading. Please try again." };
  }

  const { data: existing } = await supabase
    .from("dispatch_pods")
    .select("id")
    .eq("storage_path", path)
    .maybeSingle();

  if (existing) return { success: true, alreadyRecorded: true };

  const { error: insertError } = await supabase.from("dispatch_pods").insert({
    org_id: orgId,
    dispatch_id: dispatchId,
    storage_path: path,
    captured_at: input.capturedAt || new Date().toISOString(),
    lat: typeof input.lat === "number" ? input.lat : null,
    lng: typeof input.lng === "number" ? input.lng : null,
    uploaded_by: user.id,
  });

  if (insertError) return { error: insertError.message };

  // Evidence first, state second. The run becomes *pending* confirmation, never
  // "delivered" — that last step belongs to the office reviewing this photo.
  const advancedTo = statusAfterEvidence(dispatch.status);

  if (advancedTo) {
    const { error: statusError } = await supabase
      .from("dispatches")
      .update({ status: advancedTo, updated_at: new Date().toISOString() })
      .eq("id", dispatchId)
      .eq("org_id", orgId);

    if (statusError) {
      // The most likely cause is that migration 011 has not been applied, so
      // the status check constraint still rejects "delivered_pending". Say so
      // instead of surfacing a raw Postgres constraint string to a driver.
      return {
        error: /check constraint|dispatches_status_check/i.test(statusError.message)
          ? "Delivery confirmation is not enabled on this database yet. An administrator needs to run migration 011."
          : statusError.message,
      };
    }
  }

  void supabase.from("audit_logs").insert({
    org_id: orgId,
    actor_id: user.id,
    action: "dispatch.pod_captured",
    entity_type: "dispatch",
    entity_id: dispatchId,
    metadata: {
      storage_path: path,
      captured_at: input.capturedAt ?? null,
      lat: input.lat ?? null,
      lng: input.lng ?? null,
      advanced_to: advancedTo,
    },
  });

  revalidatePath("/dispatch");
  revalidatePath("/dashboard");
  return { success: true, status: advancedTo ?? dispatch.status };
}

export async function deletePodCapture(podId: string) {
  const { supabase, user, orgId, role } = await getOrgAndUser();
  if (!user || !orgId) return { error: "Not authenticated or no organization" };

  if (role !== "owner" && role !== "admin") {
    return { error: "Only owners and admins can remove delivery photos." };
  }

  const { data: pod } = await supabase
    .from("dispatch_pods")
    .select("id, storage_path, dispatch_id")
    .eq("id", podId)
    .eq("org_id", orgId)
    .maybeSingle();

  if (!pod) return { error: "Photo not found" };

  await supabase.storage.from(BUCKET).remove([pod.storage_path]);
  const { error } = await supabase.from("dispatch_pods").delete().eq("id", podId);

  if (error) return { error: error.message };

  // "delivered_pending" means "there is evidence waiting to be reviewed". If
  // the last photo is removed, that is no longer true, so the run drops back to
  // in transit and the driver has to send proof again. Leaving it pending would
  // create a delivery the office can neither confirm nor reject.
  if (pod.dispatch_id) {
    const { count } = await supabase
      .from("dispatch_pods")
      .select("id", { count: "exact", head: true })
      .eq("dispatch_id", pod.dispatch_id);

    if (!count) {
      await supabase
        .from("dispatches")
        .update({ status: "in_transit", updated_at: new Date().toISOString() })
        .eq("id", pod.dispatch_id)
        .eq("org_id", orgId)
        .eq("status", "delivered_pending");
    }
  }

  revalidatePath("/dispatch");
  revalidatePath("/dashboard");
  return { success: true };
}

/**
 * Retention notice for the UI: on the free plan, photos expire after 30 days.
 * Returns the number of days left for the oldest photo, or null when photos
 * are kept permanently.
 */
export async function getPodRetentionInfo(orgId: string) {
  const supabase = await createClient();
  const billing = await getOrgBilling(supabase, orgId);
  return { retentionDays: billing.limits.podRetentionDays };
}
