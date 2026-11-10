// scripts/backup.js
// Manual data backup for Transaxis (Supabase).
//
// Exports every table (and the product_stock view) to JSON files inside a
// timestamped folder under ./backups/. Optionally uploads the folder as a zip
// to a Supabase Storage bucket named "backups" (create it in the Dashboard
// and make it private) when SUPABASE_BACKUP_BUCKET is set.
//
// Usage:
//   node scripts/backup.js
//
// Restore: re-import the JSON files via the Supabase SQL editor or a small
// import script. Schema is NOT included — keep supabase/schema.sql + migrations
// in git (they are) for schema recovery.
//
// Requires Node 18+ and @supabase/supabase-js (already in node_modules).

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const ENV_PATH = path.join(ROOT, '.env.local');

function loadEnv() {
  const env = {};
  if (!fs.existsSync(ENV_PATH)) {
    console.error('Missing .env.local at', ENV_PATH);
    process.exit(1);
  }
  fs.readFileSync(ENV_PATH, 'utf8').split('\n').forEach((line) => {
    const t = line.trim();
    if (!t || t.startsWith('#') || !t.includes('=')) return;
    const [k, v] = t.split('=', 2);
    env[k.trim()] = v.trim();
  });
  return env;
}

const env = loadEnv();
const url = env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceKey) {
  console.error('NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required in .env.local');
  process.exit(1);
}

const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(url, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const TABLES = [
  'organizations',
  'profiles',
  'warehouses',
  'products',
  'stock_movements',
  'dispatches',
  'dispatch_items',
  'vehicles',
  'audit_logs',
];

const VIEWS = ['product_stock'];

const PAGE_SIZE = 1000;

async function dumpTable(name) {
  const rows = [];
  let from = 0;
  while (true) {
    const { data, error } = await supabase
      .from(name)
      .select('*')
      .range(from, from + PAGE_SIZE - 1);
    if (error) throw new Error(`${name}: ${error.message}`);
    if (!data || data.length === 0) break;
    rows.push(...data);
    if (data.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }
  return rows;
}

async function main() {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const outDir = path.join(ROOT, 'backups', stamp);
  fs.mkdirSync(outDir, { recursive: true });

  const summary = {};
  for (const t of TABLES) {
    process.stdout.write(`Backing up ${t}... `);
    const rows = await dumpTable(t);
    fs.writeFileSync(path.join(outDir, `${t}.json`), JSON.stringify(rows, null, 2));
    summary[t] = rows.length;
    console.log(`${rows.length} rows`);
  }
  for (const v of VIEWS) {
    process.stdout.write(`Backing up view ${v}... `);
    try {
      const rows = await dumpTable(v);
      fs.writeFileSync(path.join(outDir, `${v}.json`), JSON.stringify(rows, null, 2));
      summary[v] = rows.length;
      console.log(`${rows.length} rows`);
    } catch (e) {
      console.log(`skipped (${e.message})`);
      summary[v] = `error: ${e.message}`;
    }
  }

  fs.writeFileSync(path.join(outDir, 'summary.json'), JSON.stringify({ created_at: new Date().toISOString(), tables: summary }, null, 2));

  // Optional: upload to a Supabase Storage bucket (set SUPABASE_BACKUP_BUCKET in .env.local)
  const bucket = env.SUPABASE_BACKUP_BUCKET;
  if (bucket) {
    process.stdout.write(`Uploading to storage bucket "${bucket}"... `);
    // Upload each file
    for (const f of fs.readdirSync(outDir)) {
      const buf = fs.readFileSync(path.join(outDir, f));
      const { error } = await supabase.storage.from(bucket).upload(`${stamp}/${f}`, buf, {
        contentType: 'application/json',
        upsert: true,
      });
      if (error) console.log(`\n  upload ${f} failed: ${error.message}`);
    }
    console.log('done');
  }

  console.log(`\nBackup complete: ${outDir}`);
  console.log('Summary:', JSON.stringify(summary));
}

main().catch((e) => {
  console.error('Backup failed:', e.message);
  process.exit(1);
});