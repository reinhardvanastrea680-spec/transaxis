const fs = require('fs');

const env = fs.readFileSync('C:/Users/User/Downloads/Anderx_Steve/.env.local', 'utf8');
const url = (env.match(/NEXT_PUBLIC_SUPABASE_URL=(.*)/) || [])[1].trim();
const anon = (env.match(/NEXT_PUBLIC_SUPABASE_ANON_KEY=(.*)/) || [])[1].trim();
const svc = (env.match(/SUPABASE_SERVICE_ROLE_KEY=(.*)/) || [])[1].trim();

const ADMIN = { apikey: svc, Authorization: 'Bearer ' + svc, 'Content-Type': 'application/json' };

// A driver account and an unassigned dispatch (assigned to the owner).
const DRIVER_EMAIL = 'demonkinganosvoldigoad5@gmail.com';
const DRIVER_ID = 'c6d9927f-7bc5-4a69-8b7c-bcf17da65d42';
const OWNER_ID = '7aaf48d4-4167-42d1-bbf5-a2342f0775dc';

function results() {
  const rows = [];
  return {
    push(name, pass, detail) {
      rows.push({ name, pass, detail });
      console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}\n        ${detail}`);
    },
    get failed() {
      return rows.filter((r) => !r.pass).length;
    },
    get total() {
      return rows.length;
    },
  };
}

async function mintSession(email) {
  // Admin-generated magiclink, exchanged for a real session via email_otp.
  const gen = await fetch(`${url}/auth/v1/admin/generate_link`, {
    method: 'POST',
    headers: ADMIN,
    body: JSON.stringify({ type: 'magiclink', email }),
  });
  const g = await gen.json();
  const otp = g?.email_otp;
  if (!otp) throw new Error('generate_link failed: ' + JSON.stringify(g).slice(0, 200));

  const ver = await fetch(`${url}/auth/v1/verify`, {
    method: 'POST',
    headers: { apikey: anon, 'Content-Type': 'application/json' },
    body: JSON.stringify({ type: 'email', email, token: otp }),
  });
  const v = await ver.json();
  if (!v?.access_token) throw new Error('verify failed: ' + JSON.stringify(v).slice(0, 200));
  return v.access_token;
}

(async () => {
  const R = results();
  const access = await mintSession(DRIVER_EMAIL);
  console.log('Driver session minted.\n');

  const H = {
    apikey: anon,
    Authorization: 'Bearer ' + access,
    'Content-Type': 'application/json',
    Prefer: 'return=representation',
  };

  // Get the org id as the driver (proves the driver's own RLS context works).
  const orgRes = await fetch(`${url}/rest/v1/organizations?select=id,name`, { headers: H });
  const orgs = await orgRes.json();
  const orgId = orgs?.[0]?.id;
  R.push(
    'Driver can read own organization',
    orgRes.status === 200 && !!orgId,
    `status=${orgRes.status} org=${orgs?.[0]?.name}`
  );

  // ---- 1. Read products: ALLOWED ----
  const pRes = await fetch(`${url}/rest/v1/products?select=id,sku,name`, { headers: H });
  const products = await pRes.json();
  R.push(
    'Driver CAN read products (read-only)',
    pRes.status === 200 && Array.isArray(products),
    `status=${pRes.status} count=${Array.isArray(products) ? products.length : 'n/a'}`
  );

  // ---- 2. INSERT product: MUST FAIL ----
  const insRes = await fetch(`${url}/rest/v1/products`, {
    method: 'POST',
    headers: H,
    body: JSON.stringify({
      org_id: orgId,
      sku: 'RBAC-TEST-' + Date.now(),
      name: 'Should never exist',
      unit: 'unit',
      reorder_level: 0,
    }),
  });
  const insBody = await insRes.text();
  R.push(
    'Driver CANNOT create a product (RLS blocks INSERT)',
    insRes.status >= 400,
    `status=${insRes.status} body=${insBody.slice(0, 120)}`
  );

  // ---- 3. DELETE product: MUST FAIL ----
  if (Array.isArray(products) && products.length > 0) {
    const delRes = await fetch(
      `${url}/rest/v1/products?id=eq.${products[0].id}`,
      { method: 'DELETE', headers: H }
    );
    const delBody = await delRes.text();
    // RLS filters instead of erroring: a blocked DELETE matches 0 rows -> [].
    // Verify the row survived via the service role.
    const still = await (
      await fetch(`${url}/rest/v1/products?id=eq.${products[0].id}&select=id`, { headers: ADMIN })
    ).json();
    R.push(
      'Driver CANNOT delete a product (RLS blocks DELETE)',
      delRes.status >= 400 || (Array.isArray(still) && still.length > 0),
      `status=${delRes.status} body=${delBody.slice(0, 60)} | product survives: ${Array.isArray(still) && still.length > 0}`
    );
  }

  // ---- 4. INSERT stock movement: MUST FAIL ----
  if (Array.isArray(products) && products.length > 0) {
    const smRes = await fetch(`${url}/rest/v1/stock_movements`, {
      method: 'POST',
      headers: H,
      body: JSON.stringify({
        org_id: orgId,
        product_id: products[0].id,
        movement_type: 'in',
        quantity: 99999,
        performed_by: DRIVER_ID,
      }),
    });
    const smBody = await smRes.text();
    R.push(
      'Driver CANNOT record a stock movement (cannot inflate stock)',
      smRes.status >= 400,
      `status=${smRes.status} body=${smBody.slice(0, 120)}`
    );
  }

  // ---- 5. Read dispatches: only OWNED ones ----
  const dRes = await fetch(`${url}/rest/v1/dispatches?select=id,status,customer_name,assigned_to`, {
    headers: H,
  });
  const disp = await dRes.json();
  const allAssignedToDriver =
    Array.isArray(disp) && disp.every((d) => d.assigned_to === DRIVER_ID);
  R.push(
    'Driver sees ONLY dispatches assigned to them',
    dRes.status === 200 && allAssignedToDriver && disp.length > 0,
    `status=${dRes.status} visible=${Array.isArray(disp) ? disp.length : 'n/a'} allMine=${allAssignedToDriver}`
  );

  // ---- 6. UPDATE an UNASSIGNED dispatch: MUST FAIL ----
  const unassigned = (await (
    await fetch(`${url}/rest/v1/dispatches?select=id,customer_name,assigned_to`, { headers: ADMIN })
  ).json()).find((d) => d.assigned_to !== DRIVER_ID);
  if (unassigned) {
    const uRes = await fetch(`${url}/rest/v1/dispatches?id=eq.${unassigned.id}`, {
      method: 'PATCH',
      headers: H,
      body: JSON.stringify({ customer_name: 'HIJACKED BY DRIVER' }),
    });
    const uBody = await uRes.text();
    const after = await (
      await fetch(`${url}/rest/v1/dispatches?id=eq.${unassigned.id}&select=customer_name`, {
        headers: ADMIN,
      })
    ).json();
    R.push(
      'Driver CANNOT update an unassigned dispatch',
      uRes.status >= 400 || (Array.isArray(after) && after[0]?.customer_name !== 'HIJACKED BY DRIVER'),
      `status=${uRes.status} body=${uBody.slice(0, 60)} | customer_name still: ${after?.[0]?.customer_name}`
    );
  }

  // ---- 7. UPDATE assigned dispatch: forbidden COLUMN must fail ----
  const mine = (await (
    await fetch(`${url}/rest/v1/dispatches?select=id,status,customer_name,assigned_to`, {
      headers: ADMIN,
    })
  ).json()).find((d) => d.assigned_to === DRIVER_ID);
  if (mine) {
    const cRes = await fetch(`${url}/rest/v1/dispatches?id=eq.${mine.id}`, {
      method: 'PATCH',
      headers: H,
      body: JSON.stringify({ customer_name: 'CHANGED BY DRIVER' }),
    });
    const cBody = await cRes.text();
    R.push(
      'Driver CANNOT change forbidden columns on own dispatch (column guard)',
      cRes.status >= 400 || !String(cBody).includes('CHANGED BY DRIVER'),
      `status=${cRes.status} body=${cBody.slice(0, 140)}`
    );
  }

  // ---- 8. UPDATE assigned dispatch status: ALLOWED ----
  if (mine) {
    const sRes = await fetch(`${url}/rest/v1/dispatches?id=eq.${mine.id}`, {
      method: 'PATCH',
      headers: H,
      body: JSON.stringify({ status: 'failed' }),
    });
    const sBody = await sRes.text();
    R.push(
      'Driver CAN update status of own dispatch',
      sRes.status === 200,
      `status=${sRes.status} body=${sBody.slice(0, 120)}`
    );
    // restore
    await fetch(`${url}/rest/v1/dispatches?id=eq.${mine.id}`, {
      method: 'PATCH',
      headers: ADMIN,
      body: JSON.stringify({ status: mine.status }),
    });
    console.log(`        (restored status to ${mine.status})`);
  }

  // ---- 9. UPDATE profiles (role change): MUST FAIL ----
  const prRes = await fetch(`${url}/rest/v1/profiles?id=eq.${OWNER_ID}`, {
    method: 'PATCH',
    headers: H,
    body: JSON.stringify({ role: 'staff' }),
  });
  const prBody = await prRes.text();
  const ownerAfter = await (
    await fetch(`${url}/rest/v1/profiles?id=eq.${OWNER_ID}&select=role`, { headers: ADMIN })
  ).json();
  R.push(
    'Driver CANNOT change another user role',
    prRes.status >= 400 || (Array.isArray(ownerAfter) && ownerAfter[0]?.role === 'owner'),
    `status=${prRes.status} body=${prBody.slice(0, 60)} | owner role still: ${ownerAfter?.[0]?.role}`
  );

  // ---- 10. Read audit_logs: MUST FAIL (driver not a supervisor) ----
  const alRes = await fetch(`${url}/rest/v1/audit_logs?select=id&limit=3`, { headers: H });
  const alBody = await alRes.text();
  const alSeen = Array.isArray(JSON.parse(alBody || '[]')) ? JSON.parse(alBody || '[]').length : -1;
  const alTotal = await (
    await fetch(`${url}/rest/v1/audit_logs?select=id&limit=100`, { headers: ADMIN })
  ).json();
  R.push(
    'Driver CANNOT read the audit log (rows exist but are filtered out)',
    alRes.status >= 400 || alSeen === 0,
    `status=${alRes.status} driver_sees=${alSeen} actual_total=${Array.isArray(alTotal) ? alTotal.length : 'n/a'}`
  );

  console.log(`\n===== ${R.total - R.failed}/${R.total} checks passed =====`);
  process.exit(R.failed > 0 ? 1 : 0);
})().catch((e) => {
  console.log('HARNESS ERROR:', e.message);
  process.exit(2);
});
