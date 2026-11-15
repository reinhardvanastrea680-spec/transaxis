#!/usr/bin/env node
/**
 * Push the Transaxis auth email setup to Supabase in one request.
 *
 *   node scripts/configure-auth-email.mjs --check
 *       Show what the project currently sends: custom SMTP or not, sender
 *       address, and which templates still hold Supabase's default body.
 *       Reads only. Safe to run any time.
 *
 *   node scripts/configure-auth-email.mjs --dry-run
 *       Build the payload and print it (secrets redacted) without sending.
 *
 *   node scripts/configure-auth-email.mjs
 *       Configure custom SMTP (Resend) and upload all five templates.
 *
 *   node scripts/configure-auth-email.mjs --templates-only
 *   node scripts/configure-auth-email.mjs --smtp-only
 *
 * Needs a Supabase personal access token (sbp_…), which is NOT the service
 * role key — it is account-level and only used here, never by the app:
 *
 *   SUPABASE_ACCESS_TOKEN=sbp_xxx RESEND_API_KEY=re_xxx \
 *     node scripts/configure-auth-email.mjs
 *
 * Get the token at https://supabase.com/dashboard/account/tokens (revoke it
 * when done — this script does not need to run more than once).
 *
 * Why not the dashboard: the same five templates are pasted by hand otherwise,
 * and the one that gets skipped is the one a customer sees first.
 */

import fs from "node:fs";
import path from "node:path";

const API = "https://api.supabase.com/v1";
const TEMPLATE_DIR = "supabase/templates";

const SMTP = {
  host: "smtp.resend.com",
  port: "465",
  user: "resend",
  senderName: "Transaxis",
  adminEmail: "no-reply@transaxis.com.ng",
};

/** file → the Management API fields it feeds. */
const TEMPLATES = [
  { file: "recovery.html", content: "mailer_templates_recovery_content", subject: "mailer_subjects_recovery" },
  { file: "confirmation.html", content: "mailer_templates_confirmation_content", subject: "mailer_subjects_confirmation" },
  { file: "magic-link.html", content: "mailer_templates_magic_link_content", subject: "mailer_subjects_magic_link" },
  { file: "email-change.html", content: "mailer_templates_email_change_content", subject: "mailer_subjects_email_change" },
  { file: "invite.html", content: "mailer_templates_invite_content", subject: "mailer_subjects_invite" },
];

const argv = process.argv.slice(2);
const has = (flag) => argv.includes(flag);
const valueOf = (flag) => {
  const i = argv.indexOf(flag);
  return i === -1 ? undefined : argv[i + 1];
};

function loadEnv(file = ".env.local") {
  if (!fs.existsSync(file)) return {};
  const out = {};
  for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (!m) continue;
    let v = m[2].trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1);
    }
    out[m[1]] = v;
  }
  return out;
}

const env = { ...loadEnv(), ...process.env };
const token = valueOf("--token") || env.SUPABASE_ACCESS_TOKEN;
const smtpPass = valueOf("--smtp-pass") || env.RESEND_API_KEY;

const supabaseUrl = env.NEXT_PUBLIC_SUPABASE_URL || "";
const ref = valueOf("--ref") || (supabaseUrl.match(/https:\/\/([a-z0-9]+)\.supabase\.co/)?.[1] ?? "");

function die(message, hint) {
  console.error(`\n  ${message}`);
  if (hint) console.error(`  ${hint}`);
  console.error("");
  process.exit(1);
}

if (!token) {
  die(
    "SUPABASE_ACCESS_TOKEN is not set.",
    "Create one at https://supabase.com/dashboard/account/tokens — it starts with sbp_.",
  );
}
if (!ref) {
  die("Could not work out the project ref.", "Pass --ref <project-ref>, or set NEXT_PUBLIC_SUPABASE_URL.");
}

async function api(method, route, body) {
  const res = await fetch(`${API}${route}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json;
  try {
    json = text ? JSON.parse(text) : {};
  } catch {
    json = { raw: text };
  }
  if (!res.ok) {
    const detail = json.message || json.error || text.slice(0, 300);
    die(`${method} ${route} → ${res.status}`, String(detail));
  }
  return json;
}

/** Supabase stores the body only; the <head> and the comment are ours. */
function bodyOf(file) {
  const html = fs.readFileSync(path.join(TEMPLATE_DIR, file), "utf8");
  const m = html.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
  if (!m) die(`${file} has no <body>`, "Regenerate with node scripts/build-email-templates.mjs");
  return m[1].trim();
}

function subjectOf(file) {
  const html = fs.readFileSync(path.join(TEMPLATE_DIR, file), "utf8");
  return html.match(/<title>([\s\S]*?)<\/title>/i)?.[1].trim() ?? "";
}

// ---------------------------------------------------------------- --check

if (has("--check")) {
  const cfg = await api("GET", `/projects/${ref}/config/auth`);
  const customSmtp = Boolean(cfg.smtp_host);
  const rows = [
    ["Custom SMTP", customSmtp ? `yes — ${cfg.smtp_host}:${cfg.smtp_port}` : "NO — using Supabase's built-in server"],
    ["SMTP user", cfg.smtp_user || "—"],
    ["Sender name", cfg.smtp_sender_name || "—"],
    ["Sender address", cfg.smtp_admin_email || "—"],
    ["SMTP password", cfg.smtp_pass ? "set" : "MISSING"],
    ["Site URL", cfg.site_url || "—"],
  ];
  console.log(`\n  project ${ref}\n`);
  for (const [k, v] of rows) console.log(`  ${k.padEnd(16)} ${v}`);

  console.log("\n  templates\n");
  for (const t of TEMPLATES) {
    const current = cfg[t.content] || "";
    const isDefault = /supabase/i.test(current) || current.trim() === "";
    const local = bodyOf(t.file);
    const same = current.trim() === local;
    const state = same ? "our version" : isDefault ? "SUPABASE DEFAULT" : "differs from repo";
    console.log(`  ${t.file.padEnd(20)} ${String(current.length).padStart(5)} chars   ${state}`);
  }
  console.log("");
  process.exit(0);
}

// ---------------------------------------------------------------- payload

if (!has("--templates-only") && !smtpPass) {
  die(
    "RESEND_API_KEY is not set, so SMTP cannot be configured.",
    "Pass --smtp-pass re_… , or run with --templates-only to skip SMTP.",
  );
}

/** @type {Record<string, unknown>} */
const payload = {};

if (!has("--templates-only")) {
  Object.assign(payload, {
    smtp_host: SMTP.host,
    smtp_port: SMTP.port,
    smtp_user: SMTP.user,
    smtp_pass: smtpPass,
    smtp_sender_name: SMTP.senderName,
    smtp_admin_email: SMTP.adminEmail,
  });
}

if (!has("--smtp-only")) {
  for (const t of TEMPLATES) {
    payload[t.content] = bodyOf(t.file);
    payload[t.subject] = subjectOf(t.file);
  }
}

const redacted = { ...payload };
if (redacted.smtp_pass) redacted.smtp_pass = `${String(redacted.smtp_pass).slice(0, 6)}…(${String(redacted.smtp_pass).length} chars)`;

if (has("--dry-run")) {
  const summary = Object.entries(redacted).map(([k, v]) => [
    k,
    typeof v === "string" && v.length > 60 ? `${v.length} chars` : v,
  ]);
  console.log(`\n  PATCH ${API}/projects/${ref}/config/auth\n`);
  for (const [k, v] of summary) console.log(`  ${k.padEnd(42)} ${v}`);
  console.log("\n  dry run — nothing sent\n");
  process.exit(0);
}

// ---------------------------------------------------------------- push

console.log(`\n  project ${ref}`);
console.log(`  ${has("--templates-only") ? "templates only" : "SMTP + templates"}\n`);

await api("PATCH", `/projects/${ref}/config/auth`, payload);
console.log("  PATCH accepted");

// Read it back: a 200 is not proof the values were stored, and the failure
// mode we care about (SMTP silently not enabled) looks exactly like success.
const after = await api("GET", `/projects/${ref}/config/auth`);
const problems = [];

if (!has("--templates-only")) {
  if (after.smtp_host !== SMTP.host) problems.push(`smtp_host is ${after.smtp_host || "empty"}`);
  if (after.smtp_admin_email !== SMTP.adminEmail) problems.push(`sender is ${after.smtp_admin_email || "empty"}`);
  if (after.smtp_sender_name !== SMTP.senderName) problems.push(`sender name is ${after.smtp_sender_name || "empty"}`);
}

if (!has("--smtp-only")) {
  for (const t of TEMPLATES) {
    if ((after[t.content] || "").trim() !== bodyOf(t.file)) problems.push(`${t.file} did not stick`);
  }
}

if (problems.length) {
  console.error("\n  Stored, but not as expected:");
  for (const p of problems) console.error(`    - ${p}`);
  console.error("");
  process.exit(1);
}

console.log("  verified by reading it back\n");
console.log(`  Sender will read:  ${SMTP.senderName} <${SMTP.adminEmail}>`);
console.log("  Send one test:     https://transaxis.com.ng/forgot-password");
console.log("  Delivery log:      https://resend.com/emails\n");
