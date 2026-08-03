#!/usr/bin/env node
/**
 * Decrypt a Greenline backup produced by scripts/backup.mjs.
 *
 *   BACKUP_PASSPHRASE=… node scripts/restore.mjs backups/greenline-2026-08-03.json.enc
 *
 * By default it only DECRYPTS and prints a summary (writing the plaintext JSON
 * next to the input) — it does not touch your database. Restoring rows is a
 * deliberate, destructive act: inspect the JSON, then load what you need.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { webcrypto as crypto } from "node:crypto";

const PASS = process.env.BACKUP_PASSPHRASE;
const file = process.argv[2];
if (!PASS || !file) {
  console.error("Usage: BACKUP_PASSPHRASE=… node scripts/restore.mjs <backup.json.enc>");
  process.exit(1);
}

const ITERATIONS = 210_000;
const unb64 = (s) => new Uint8Array(Buffer.from(s, "base64"));

const payload = JSON.parse(readFileSync(file, "utf-8"));
if (payload.greenline !== "backup-v1") {
  console.error("Not a Greenline backup file.");
  process.exit(1);
}

const raw = await crypto.subtle.importKey("raw", new TextEncoder().encode(PASS), "PBKDF2", false, ["deriveKey"]);
const key = await crypto.subtle.deriveKey(
  { name: "PBKDF2", salt: unb64(payload.salt), iterations: ITERATIONS, hash: "SHA-256" },
  raw, { name: "AES-GCM", length: 256 }, false, ["decrypt"]
);

let plaintext;
try {
  const buf = await crypto.subtle.decrypt({ name: "AES-GCM", iv: unb64(payload.iv) }, key, unb64(payload.data));
  plaintext = new TextDecoder().decode(buf);
} catch {
  console.error("❌ Decryption failed — wrong passphrase or corrupted file.");
  process.exit(1);
}

const dump = JSON.parse(plaintext);
const out = file.replace(/\.enc$/, "") + ".decrypted.json";
writeFileSync(out, JSON.stringify(dump, null, 2));

console.log(`✅ Decrypted (exported ${dump.exportedAt})`);
for (const [t, rows] of Object.entries(dump.tables)) console.log(`  ${t}: ${rows.length} rows`);
console.log(`\nPlaintext written to ${out} — delete it when you're done.`);
