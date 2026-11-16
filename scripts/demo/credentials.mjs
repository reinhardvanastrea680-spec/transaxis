/**
 * Resolves the demo account's credentials without committing them.
 *
 * This repository is public. A hardcoded password in a script is therefore a
 * published password, not a convenience — and the account it belongs to is the
 * owner of a live organisation. Credentials come from the environment, falling
 * back to `.env.local`, which `.gitignore` already excludes (`.env*`).
 *
 * Set them once:
 *
 *   DEMO_EMAIL=you@example.com
 *   DEMO_PASSWORD=...
 *
 * `VERIFY_*` is accepted as an alias so the verification scripts can be pointed
 * at a different account than the one the demo films.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

function readEnvLocal() {
  const file = path.join(ROOT, ".env.local");
  if (!fs.existsSync(file)) return {};
  const out = {};
  for (const raw of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    const value = line.slice(eq + 1).trim().replace(/^["']|["']$/g, "");
    out[key] = value;
  }
  return out;
}

let cache;
function env() {
  cache ??= { ...readEnvLocal(), ...process.env };
  return cache;
}

function pick(...keys) {
  const e = env();
  for (const key of keys) {
    if (e[key]) return e[key];
  }
  return undefined;
}

export function credentials() {
  const email = pick("DEMO_EMAIL", "VERIFY_EMAIL");
  const password = pick("DEMO_PASSWORD", "VERIFY_PASSWORD");

  if (!email || !password) {
    throw new Error(
      "Missing demo credentials. Add DEMO_EMAIL and DEMO_PASSWORD to .env.local " +
        "(gitignored), or export them in the shell. They are deliberately not " +
        "hardcoded: this repository is public."
    );
  }
  return { email, password };
}
