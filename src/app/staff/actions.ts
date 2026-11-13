"use server";

import { createClient } from "@supabase/supabase-js";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { getOrgBilling } from "@/lib/billing-server";
import { limitMessage, withinLimit } from "@/lib/plans";

function getServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

/**
 * Roles that the `profiles_role_check` constraint in the database accepts.
 * Kept in sync with `supabase/schema.sql` and `src/lib/permissions.ts`.
 * Validating here turns a raw Postgres constraint error into a clear message.
 */
const VALID_ROLES = [
  "owner",
  "admin",
  "warehouse",
  "dispatcher",
  "driver",
  "staff",
] as const;

function isValidRole(role: string): boolean {
  return (VALID_ROLES as readonly string[]).includes(role);
}

/** Fire-and-forget audit log — don't block the response on it. */
function logAudit(
  supabase: Awaited<ReturnType<typeof createServerClient>>,
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
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { supabase, user: null, orgId: null, profile: null };

  const { data: profile } = await supabase
    .from("profiles")
    .select("org_id, role, full_name")
    .eq("id", user.id)
    .maybeSingle();

  return { supabase, user, orgId: profile?.org_id ?? null, profile };
}

export async function updateStaffRole(staffId: string, newRole: string) {
  const { supabase, user, orgId, profile } = await getOrgAndUser();
  if (!user || !orgId) return { error: "Not authenticated or no organization" };

  // Only owners/admins can change roles
  if (profile?.role !== "owner" && profile?.role !== "admin") {
    return { error: "Only owners and admins can change roles" };
  }

  if (!isValidRole(newRole)) {
    return { error: `Invalid role "${newRole}"` };
  }

  // Prevent changing own role
  if (staffId === user.id) {
    return { error: "You cannot change your own role" };
  }

  // Prevent demoting the last owner
  if (newRole !== "owner") {
    const { count } = await supabase
      .from("profiles")
      .select("id", { count: "exact", head: true })
      .eq("org_id", orgId)
      .eq("role", "owner");
    if (count && count <= 1) {
      const { data: target } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", staffId)
        .maybeSingle();
      if (target?.role === "owner") {
        return { error: "Cannot demote the last owner. Promote another user to owner first." };
      }
    }
  }

  const service = getServiceClient();
  const { error } = await service
    .from("profiles")
    .update({ role: newRole })
    .eq("id", staffId)
    .eq("org_id", orgId);

  if (error) return { error: error.message };

  logAudit(supabase, orgId, user.id, "staff.role_changed", "profile", staffId, {
    new_role: newRole,
  });

  revalidatePath("/staff");
  return { success: true };
}

export async function assignStaffToOrg(email: string, role: string) {
  const { supabase, user, orgId, profile } = await getOrgAndUser();
  if (!user || !orgId) return { error: "Not authenticated or no organization" };

  if (profile?.role !== "owner" && profile?.role !== "admin") {
    return { error: "Only owners and admins can assign staff" };
  }

  if (!isValidRole(role)) {
    return { error: `Invalid role "${role}"` };
  }

  const service = getServiceClient();

  // Look up user by email in auth.users. The default page size is 50, which
  // silently hid every user past the first page — ask for a large page instead.
  const { data: authData, error: authError } = await service.auth.admin.listUsers({
    page: 1,
    perPage: 1000,
  });
  if (authError) return { error: authError.message };

  const authUser = authData.users.find(
    (u) => u.email?.toLowerCase() === email.trim().toLowerCase()
  );

  if (!authUser) {
    return {
      error:
        "No user found with that email. They need to sign up first at the login page, then you can assign them here.",
    };
  }

  // Check if already in an org
  const { data: existingProfile } = await service
    .from("profiles")
    .select("org_id, full_name")
    .eq("id", authUser.id)
    .maybeSingle();

  if (existingProfile?.org_id && existingProfile.org_id !== orgId) {
    return { error: "This user already belongs to another organization." };
  }

  // Only a genuinely new member consumes a seat; re-assigning someone who is
  // already on the team must not be blocked.
  if (!existingProfile?.org_id) {
    const billing = await getOrgBilling(supabase, orgId);
    const { count: seatCount } = await supabase
      .from("profiles")
      .select("id", { count: "exact", head: true })
      .eq("org_id", orgId);

    if (!withinLimit(seatCount ?? 0, billing.limits.seats)) {
      return { error: limitMessage(billing.plan, "seats") };
    }
  }

  // Upsert profile with org_id and role
  const { error: upsertError } = await service
    .from("profiles")
    .upsert(
      {
        id: authUser.id,
        org_id: orgId,
        role: role,
        full_name: existingProfile?.full_name || authUser.email,
      },
      { onConflict: "id" }
    );

  if (upsertError) return { error: upsertError.message };

  logAudit(supabase, orgId, user.id, "staff.assigned", "profile", authUser.id, {
    email,
    role,
  });

  revalidatePath("/staff");
  return { success: true };
}

export async function removeStaffFromOrg(staffId: string) {
  const { supabase, user, orgId, profile } = await getOrgAndUser();
  if (!user || !orgId) return { error: "Not authenticated or no organization" };

  if (profile?.role !== "owner" && profile?.role !== "admin") {
    return { error: "Only owners and admins can remove staff" };
  }

  if (staffId === user.id) {
    return { error: "You cannot remove yourself" };
  }

  const service = getServiceClient();

  // Set org_id to null (don't delete the profile/user)
  const { error } = await service
    .from("profiles")
    .update({ org_id: null, role: "staff" })
    .eq("id", staffId)
    .eq("org_id", orgId);

  if (error) return { error: error.message };

  logAudit(supabase, orgId, user.id, "staff.removed", "profile", staffId);

  revalidatePath("/staff");
  return { success: true };
}

export async function getOrCreateJoinCode() {
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { error: "Not authenticated" };

  const { data: profile } = await supabase
    .from("profiles")
    .select("org_id, role")
    .eq("id", user.id)
    .maybeSingle();

  if (!profile?.org_id) return { error: "No organization" };
  if (profile.role !== "owner" && profile.role !== "admin") {
    return { error: "Only owners and admins can view the join code" };
  }

  const service = getServiceClient();

  const { data: org } = await service
    .from("organizations")
    .select("id, name, join_code")
    .eq("id", profile.org_id)
    .maybeSingle();

  if (!org) return { error: "Organization not found" };

  // Backfill a code if the column was added after the org was created.
  if (!org.join_code) {
    const { data: regenerated, error: rpcError } = await service.rpc(
      "regenerate_join_code",
      { target_org: profile.org_id }
    );
    if (rpcError) return { error: rpcError.message };
    return { success: true, code: regenerated, orgName: org.name };
  }

  return { success: true, code: org.join_code, orgName: org.name };
}

export async function regenerateJoinCode() {
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { error: "Not authenticated" };

  const { data: profile } = await supabase
    .from("profiles")
    .select("org_id, role")
    .eq("id", user.id)
    .maybeSingle();

  if (!profile?.org_id) return { error: "No organization" };
  if (profile.role !== "owner" && profile.role !== "admin") {
    return { error: "Only owners and admins can regenerate the join code" };
  }

  const service = getServiceClient();

  const { data: newCode, error } = await service.rpc("regenerate_join_code", {
    target_org: profile.org_id,
  });

  if (error) return { error: error.message };

  await service.from("audit_logs").insert({
    org_id: profile.org_id,
    actor_id: user.id,
    action: "org.join_code_regenerated",
    entity_type: "organization",
    entity_id: profile.org_id,
  });

  return { success: true, code: newCode };
}
