/**
 * POD retention job.
 *
 * Delivery photos are the only thing in the product with a real per-org storage
 * cost, so the free plan keeps them for a window and the paid plans keep them
 * forever. This route deletes the storage object first and the row second, so a
 * failure never leaves a row pointing at a missing file.
 *
 * Wired to a Vercel cron in vercel.json. Protect it with CRON_SECRET — Vercel
 * sends it as `Authorization: Bearer <CRON_SECRET>`.
 */

import { createClient } from "@supabase/supabase-js";
import { resolvePlanId, limitsFor } from "@/lib/plans";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BUCKET = "pod";
/** Keep each run well inside the function time limit. */
const BATCH = 400;

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = request.headers.get("authorization");
    if (auth !== `Bearer ${secret}`) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    return Response.json({ error: "Not configured" }, { status: 500 });
  }

  const supabase = createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // Only photos older than the shortest retention window can be candidates.
  const oldestWindow = new Date(Date.now() - 30 * 86_400_000).toISOString();

  const { data: pods, error } = await supabase
    .from("dispatch_pods")
    .select("id, org_id, storage_path, created_at")
    .lt("created_at", oldestWindow)
    .order("created_at", { ascending: true })
    .limit(BATCH);

  if (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }

  if (!pods || pods.length === 0) {
    return Response.json({ ok: true, deleted: 0, scanned: 0 });
  }

  const orgIds = [...new Set(pods.map((p) => p.org_id))];

  const { data: orgs } = await supabase
    .from("organizations")
    .select("id, plan, trial_ends_at, plan_renews_at")
    .in("id", orgIds);

  const planByOrg: Record<string, ReturnType<typeof resolvePlanId>> = {};
  for (const org of orgs ?? []) {
    planByOrg[org.id] = resolvePlanId(org);
  }

  const now = Date.now();
  const expired = pods.filter((pod) => {
    const plan = planByOrg[pod.org_id] ?? "free";
    const retention = limitsFor(plan).podRetentionDays;
    if (retention === null) return false; // kept forever
    return now - new Date(pod.created_at).getTime() > retention * 86_400_000;
  });

  if (expired.length === 0) {
    return Response.json({ ok: true, deleted: 0, scanned: pods.length });
  }

  const { error: storageError } = await supabase.storage
    .from(BUCKET)
    .remove(expired.map((p) => p.storage_path));

  if (storageError) {
    return Response.json(
      { error: `Storage delete failed: ${storageError.message}` },
      { status: 500 },
    );
  }

  const { error: deleteError } = await supabase
    .from("dispatch_pods")
    .delete()
    .in(
      "id",
      expired.map((p) => p.id),
    );

  if (deleteError) {
    return Response.json({ error: deleteError.message }, { status: 500 });
  }

  return Response.json({
    ok: true,
    scanned: pods.length,
    deleted: expired.length,
  });
}
