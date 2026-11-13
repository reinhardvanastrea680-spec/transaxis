export const runtime = "edge";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createClient as createServiceClient } from "@supabase/supabase-js";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { getOrgBilling, historyCutoff } from "@/lib/billing-server";
import StaffClient from "./staff-client";

function getServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  return createServiceClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

export default async function StaffPage() {
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

  // Drivers and read-only staff cannot view the staff roster or audit log.
  if (!["owner", "admin", "warehouse"].includes(profile.role)) {
    redirect("/dashboard");
  }

  const { data: staffRows } = await supabase
    .from("profiles")
    .select("id, full_name, role, created_at")
    .eq("org_id", profile.org_id)
    .order("created_at");

  // Fetch emails via service role (only for the members in this org).
  const service = getServiceClient();
  const emailEntries = await Promise.all(
    (staffRows || []).map(async (s: any) => {
      try {
        const { data } = await service.auth.admin.getUserById(s.id);
        return [s.id, data?.user?.email ?? null] as const;
      } catch {
        return [s.id, null] as const;
      }
    }),
  );
  const emailMap: Record<string, string | null> = {};
  for (const [id, email] of emailEntries) {
    if (email) emailMap[id] = email;
  }

  const staff = (staffRows || []).map((s: any) => ({
    id: s.id,
    full_name: s.full_name,
    email: emailMap[s.id] || null,
    role: s.role,
    created_at: s.created_at,
  }));

  const billing = await getOrgBilling(supabase, profile.org_id);
  const cutoff = historyCutoff(billing);

  let auditQuery = supabase
    .from("audit_logs")
    .select("id, actor_id, action, entity_type, entity_id, metadata, created_at")
    .order("created_at", { ascending: false })
    .limit(100);

  if (cutoff) {
    auditQuery = auditQuery.gte("created_at", cutoff);
  }

  const { data: auditRows } = await auditQuery;

  const staffNameMap: Record<string, string> = {};
  for (const s of staffRows || []) {
    staffNameMap[s.id] = s.full_name || "Unnamed";
  }

  const auditLogs = (auditRows || []).map((log: any) => ({
    id: log.id,
    actor_name: log.actor_id ? staffNameMap[log.actor_id] || "Unknown" : "System",
    action: log.action,
    entity_type: log.entity_type,
    entity_id: log.entity_id,
    metadata: log.metadata,
    created_at: log.created_at,
  }));

  return (
    <main className="mx-auto max-w-[1200px] overflow-x-hidden px-5 py-8 sm:px-8 lg:py-10">
      <div className="mb-7">
        <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-brand">
          Staff
        </p>
        <h1 className="mt-1.5 text-2xl font-semibold tracking-[-0.02em] text-ink">
          Staff & Accountability
        </h1>
        <p className="mt-1 text-sm text-ink-muted">
          Manage team members, roles, and the audit trail.
        </p>
      </div>
      <StaffClient
        staff={staff}
        auditLogs={auditLogs}
        currentUserId={user.id}
        currentUserRole={profile.role}
      />
    </main>
  );
}
