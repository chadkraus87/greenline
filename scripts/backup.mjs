#!/usr/bin/env node
/**
 * Greenline off-site backup — dumps every table to an AES-256-GCM encrypted file.
 *
 * Supabase Pro already takes daily backups; this gives you an independent copy
 * that you hold, so a lost/locked Supabase account never means lost data.
 *
 * Usage:
 *   SUPABASE_URL=…  SUPABASE_SERVICE_ROLE_KEY=…  BACKUP_PASSPHRASE=…  node scripts/backup.mjs
 *
 * The service-role key bypasses RLS (that's the point — it backs up ALL users).
 * Keep it in a secret store, never in the repo. Output: backups/greenline-<date>.json.enc
 * Restore with: node scripts/restore.mjs <file>
 */
import { writeFileSync, mkdirSync } from "node:fs";
import { webcrypto as crypto } from "node:crypto";

const URL_ = process.env.SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const PASS = process.env.BACKUP_PASSPHRASE;
const OUT_DIR = process.env.BACKUP_DIR || "backups";

if (!URL_ || !KEY || !PASS) {
  console.error("Missing SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, or BACKUP_PASSPHRASE.");
  process.exit(1);
}
if (PASS.length < 12) {
  console.error("BACKUP_PASSPHRASE must be at least 12 characters.");
  process.exit(1);
}

const TABLES = [
  "profiles", "settings", "categories", "incomes", "bills",
  "expenses", "goals", "events", "sinking_funds", "debts",
];
const ITERATIONS = 210_000;

async function fetchTable(name) {
  const rows = [];
  const PAGE = 1000;
  for (let from = 0; ; from += PAGE) {
    const res = await fetch(`${URL_}/rest/v1/${name}?select=*`, {
      headers: {
        apikey: KEY,
        Authorization: `Bearer ${KEY}`,
        Range: `${from}-${from + PAGE - 1}`,
      },
    });
    if (!res.ok) throw new Error(`${name}: ${res.status} ${await res.text()}`);
    const batch = await res.json();
    rows.push(...batch);
    if (batch.length < PAGE) break;
  }
  return rows;
}

async function encrypt(plaintext, passphrase) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const raw = await crypto.subtle.importKey("raw", new TextEncoder().encode(passphrase), "PBKDF2", false, ["deriveKey"]);
  const key = await crypto.subtle.deriveKey(
    { name: "PBKDF2", salt, iterations: ITERATIONS, hash: "SHA-256" },
    raw, { name: "AES-GCM", length: 256 }, false, ["encrypt"]
  );
  const ct = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, new TextEncoder().encode(plaintext));
  const b64 = (b) => Buffer.from(b).toString("base64");
  return { greenline: "backup-v1", createdAt: new Date().toISOString(), salt: b64(salt), iv: b64(iv), data: b64(ct) };
}

const dump = { exportedAt: new Date().toISOString(), tables: {} };
for (const t of TABLES) {
  dump.tables[t] = await fetchTable(t);
  console.log(`  ${t}: ${dump.tables[t].length} rows`);
}

const payload = await encrypt(JSON.stringify(dump), PASS);
mkdirSync(OUT_DIR, { recursive: true });
const file = `${OUT_DIR}/greenline-${new Date().toISOString().slice(0, 10)}.json.enc`;
writeFileSync(file, JSON.stringify(payload));
const total = Object.values(dump.tables).reduce((s, r) => s + r.length, 0);
console.log(`\n✅ Encrypted backup written: ${file} (${total} rows total)`);
