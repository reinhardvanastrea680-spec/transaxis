// verify-rls.mjs — run with: node verify-rls.mjs
// Requires env: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
// Tests multi-tenant RLS isolation between two organizations.

import { createClient } from "@supabase/supabase-js";

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!URL || !SERVICE) {
  console.error("Missing env vars");
  process.exit(1);
}

const admin = createClient(URL, SERVICE, { auth: { autoRefreshToken: false, persistSession: false } });

const TS = Date.now();
const emailA = `rlstest-a-${TS}@example.com`;
const emailB = `rlstest-b-${TS}@example.com`;
const pw = "RlsTest!2345";

let userA, userB, orgA, orgB, productA, productB;

async function cleanup() {
  try {
    if (productA) await admin.from("products").delete().eq("id", productA);
    if (productB) await admin.from("products").delete().eq("id", productB);
    if (orgA) await admin.from("organizations").delete().eq("id", orgA);
    if (orgB) await admin.from("organizations").delete().eq("id", orgB);
    if (userA) await admin.auth.admin.deleteUser(userA.id);
    if (userB) await admin.auth.admin.deleteUser(userB.id);
  } catch (e) {
    console.warn("cleanup error:", e?.message);
  }
}

try {
  // 1. Create two auth users
  const { data: ua, error: ea } = await admin.auth.admin.createUser({ email: emailA, password: pw, email_confirm: true });
  if (ea) throw ea;
  userA = ua.user;
  const { data: ub, error: eb } = await admin.auth.admin.createUser({ email: emailB, password: pw, email_confirm: true });
  if (eb) throw eb;
  userB = ub.user;
  console.log("✓ created users");

  // 2. Create two orgs
  const { data: oa, error: oae } = await admin.from("organizations").insert({ name: "Org A" }).select().single();
  if (oae) throw oae;
  orgA = oa.id;
  const { data: ob, error: obe } = await admin.from("organizations").insert({ name: "Org B" }).select().single();
  if (obe) throw obe;
  orgB = ob.id;
  console.log("✓ created orgs");

  // 3. Link profiles to orgs (insert if trigger didn't create one)
  const { data: existingA } = await admin.from("profiles").select("id").eq("id", userA.id).maybeSingle();
  if (!existingA) {
    await admin.from("profiles").insert({ id: userA.id, org_id: orgA, role: "owner", full_name: emailA });
  } else {
    await admin.from("profiles").update({ org_id: orgA, role: "owner" }).eq("id", userA.id);
  }
  const { data: existingB } = await admin.from("profiles").select("id").eq("id", userB.id).maybeSingle();
  if (!existingB) {
    await admin.from("profiles").insert({ id: userB.id, org_id: orgB, role: "owner", full_name: emailB });
  } else {
    await admin.from("profiles").update({ org_id: orgB, role: "owner" }).eq("id", userB.id);
  }
  console.log("✓ linked profiles");

  // 4. Insert a product in each org
  const { data: pa, error: pae } = await admin.from("products").insert({ org_id: orgA, sku: "SKU-A", name: "Product A" }).select().single();
  if (pae) throw pae;
  productA = pa.id;
  const { data: pb, error: pbe } = await admin.from("products").insert({ org_id: orgB, sku: "SKU-B", name: "Product B" }).select().single();
  if (pbe) throw pbe;
  productB = pb.id;
  console.log("✓ inserted products");

  // 5. Sign in as each user (RLS applies)
  const clientA = createClient(URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || SERVICE);
  // use password auth
  const { data: sa, error: sae } = await clientA.auth.signInWithPassword({ email: emailA, password: pw });
  if (sae) throw sae;
  const clientB = createClient(URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || SERVICE);
  const { data: sb, error: sbe } = await clientB.auth.signInWithPassword({ email: emailB, password: pw });
  if (sbe) throw sbe;

  // 6. Test: A sees only A's products
  const { data: aProducts } = await clientA.from("products").select("id, name");
  console.log("A sees products:", aProducts?.map((p) => p.name));
  if (!aProducts || aProducts.length !== 1 || aProducts[0].id !== productA) {
    console.error("FAIL: A should see only Product A");
    process.exitCode = 1;
  } else console.log("✓ A sees only own product");

  const { data: bProducts } = await clientB.from("products").select("id, name");
  console.log("B sees products:", bProducts?.map((p) => p.name));
  if (!bProducts || bProducts.length !== 1 || bProducts[0].id !== productB) {
    console.error("FAIL: B should see only Product B");
    process.exitCode = 1;
  } else console.log("✓ B sees only own product");

  // 7. Test: A cannot read B's product by direct id
  const { data: crossA, error: crossErrA } = await clientA.from("products").select("id, name").eq("id", productB);
  console.log("A querying B's product id →", crossA, crossErrA?.message);
  if (crossA && crossA.length > 0) {
    console.error("FAIL: A must not see B's product");
    process.exitCode = 1;
  } else console.log("✓ A cannot read B's product (denied/empty)");

  // 7. Test: A cannot update B's product (verify data unchanged)
  await clientA.from("products").update({ name: "HACKED" }).eq("id", productB);
  const { data: bProductAfter } = await clientB.from("products").select("name").eq("id", productB).single();
  console.log("B's product name after A's update attempt:", bProductAfter?.name);
  if (bProductAfter?.name === "HACKED") {
    console.error("FAIL: A actually modified B's product");
    process.exitCode = 1;
  } else console.log("✓ A cannot modify B's product (data unchanged)");

  // 9. Test: A cannot insert product into B's org
  const { error: insErr } = await clientA.from("products").insert({ org_id: orgB, sku: "HACK", name: "Hacked" });
  console.log("A inserting into B's org →", insErr?.message || "no error (CHECK!)");
  if (!insErr) {
    console.error("FAIL: A must not insert into B's org");
    process.exitCode = 1;
  } else console.log("✓ A cannot insert into B's org");

  // 10. Test: self-escalation prevention (A tries to set own role to admin via client)
  const { error: escErr } = await clientA.from("profiles").update({ role: "admin" }).eq("id", userA.id);
  console.log("A self-escalating role →", escErr?.message || "no error (CHECK!)");
  if (!escErr) {
    console.error("FAIL: A must not self-escalate role");
    process.exitCode = 1;
  } else console.log("✓ self-escalation blocked");

  console.log("\nALL RLS CHECKS DONE. exitCode =", process.exitCode ?? 0);
} catch (e) {
  console.error("ERROR:", e?.message || e);
  process.exitCode = 1;
} finally {
  await cleanup();
  console.log("cleaned up test data");
}
