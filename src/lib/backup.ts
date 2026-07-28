import type { AppData } from "../types";
import { appDataSchema } from "./schema";

/** AES-256-GCM encrypted backup with a PBKDF2-derived key (WebCrypto only, nothing leaves the device). */
const ITERATIONS = 210_000;

const b64 = (buf: ArrayBuffer | Uint8Array): string => {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
};
const unb64 = (s: string): Uint8Array => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

async function deriveKey(passphrase: string, salt: Uint8Array): Promise<CryptoKey> {
  const raw = await crypto.subtle.importKey("raw", new TextEncoder().encode(passphrase), "PBKDF2", false, ["deriveKey"]);
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", salt: salt as BufferSource, iterations: ITERATIONS, hash: "SHA-256" },
    raw, { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]
  );
}

export interface EncryptedBackup { greenline: "encrypted-v1"; salt: string; iv: string; data: string; }

export async function encryptBackup(data: AppData, passphrase: string): Promise<EncryptedBackup> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(passphrase, salt);
  const ct = await crypto.subtle.encrypt({ name: "AES-GCM", iv: iv as BufferSource }, key, new TextEncoder().encode(JSON.stringify(data)));
  return { greenline: "encrypted-v1", salt: b64(salt), iv: b64(iv), data: b64(ct) };
}

export async function decryptBackup(payload: EncryptedBackup, passphrase: string): Promise<AppData> {
  const key = await deriveKey(passphrase, unb64(payload.salt));
  const pt = await crypto.subtle.decrypt({ name: "AES-GCM", iv: unb64(payload.iv) as BufferSource }, key, unb64(payload.data) as BufferSource);
  return validateImport(JSON.parse(new TextDecoder().decode(pt)));
}

export function isEncryptedBackup(obj: unknown): obj is EncryptedBackup {
  return !!obj && typeof obj === "object" && (obj as EncryptedBackup).greenline === "encrypted-v1";
}

/** Validate any imported JSON (plain or decrypted) against the strict schema. Throws on failure. */
export function validateImport(obj: unknown): AppData {
  return appDataSchema.parse(obj) as AppData;
}
