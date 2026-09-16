/**
 * SimpleFIN Bridge client logic, kept free of Deno and browser APIs so the
 * Edge Function and the test suite run the exact same code.
 *
 * SimpleFIN is read-only by design: the protocol has no endpoint that can move
 * money or change anything at the bank. The user links their bank on
 * SimpleFIN's own site — Greenline never sees a bank username or password. It
 * receives one "access URL", which is a credential and is stored encrypted.
 *
 * Protocol: https://www.simplefin.org/protocol.html
 */

/** Only these hosts are ever contacted. Anything else is refused before a request is made. */
export const ALLOWED_HOSTS = new Set(["bridge.simplefin.org", "beta-bridge.simplefin.org"]);

/** Bridge guidance: at most 24 requests a day, and a 90-day window per request. */
export const MIN_SYNC_INTERVAL_MS = 4 * 60 * 60 * 1000;
export const MAX_WINDOW_DAYS = 90;
const OVERLAP_DAYS = 5;
const FIRST_SYNC_DAYS = 60;
const DAY_MS = 86_400_000;

export class SimpleFinError extends Error {
  constructor(message: string) { super(message); this.name = "SimpleFinError"; }
}

const b64decode = (s: string): string => {
  // atob is on both Deno and modern browsers/Node.
  try { return atob(s.trim().replace(/-/g, "+").replace(/_/g, "/")); }
  catch { throw new SimpleFinError("That doesn't look like a SimpleFIN setup token. Copy the whole token and try again."); }
};

function allowlisted(raw: string, what: string): URL {
  let url: URL;
  try { url = new URL(raw); } catch { throw new SimpleFinError(`The ${what} isn't a valid address.`); }
  // https only, and only SimpleFIN's own hosts — the token is attacker-suppliable
  // input, so without this it could point the server at an internal address.
  if (url.protocol !== "https:" || !ALLOWED_HOSTS.has(url.hostname) || url.port !== "") {
    throw new SimpleFinError(`The ${what} doesn't point at SimpleFIN Bridge, so it was refused.`);
  }
  return url;
}

/** A setup token is a base64-encoded claim URL. */
export function decodeSetupToken(token: string): URL {
  if (!token || token.trim().length < 16) throw new SimpleFinError("Paste your SimpleFIN setup token.");
  const url = allowlisted(b64decode(token), "setup token");
  if (!url.pathname.includes("/claim/")) throw new SimpleFinError("That token isn't a SimpleFIN setup token.");
  return url;
}

/** The access URL embeds Basic credentials: https://user:pass@host/path */
export function parseAccessUrl(raw: string): { base: string; authorization: string } {
  const url = allowlisted(raw.trim(), "access address SimpleFIN returned");
  if (!url.username || !url.password) throw new SimpleFinError("SimpleFIN returned an access address without credentials.");
  const user = decodeURIComponent(url.username);
  const pass = decodeURIComponent(url.password);
  url.username = ""; url.password = "";
  return { base: url.toString().replace(/\/$/, ""), authorization: `Basic ${btoa(`${user}:${pass}`)}` };
}

/** What to ask for: overlap the last sync by a few days so late-posting charges aren't missed. */
export function syncWindow(lastSyncedAt: string | null, now = Date.now()): { start: number; end: number } {
  const earliest = now - (MAX_WINDOW_DAYS - 1) * DAY_MS;
  const from = lastSyncedAt ? Date.parse(lastSyncedAt) - OVERLAP_DAYS * DAY_MS : now - FIRST_SYNC_DAYS * DAY_MS;
  const start = Math.max(earliest, Number.isFinite(from) ? from : now - FIRST_SYNC_DAYS * DAY_MS);
  return { start: Math.floor(start / 1000), end: Math.floor((now + DAY_MS) / 1000) };
}

export function isSyncDue(lastSyncedAt: string | null, now = Date.now()): boolean {
  return !lastSyncedAt || now - Date.parse(lastSyncedAt) >= MIN_SYNC_INTERVAL_MS;
}

export interface NormalizedTransaction {
  externalId: string; posted: string; amount: number;
  description: string; payee: string | null; memo: string | null;
}
export interface NormalizedAccount {
  externalId: string; name: string; orgName: string | null; currency: string;
  balance: number | null; availableBalance: number | null; balanceDate: string | null;
  transactions: NormalizedTransaction[];
}

const num = (v: unknown): number | null => {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};
const str = (v: unknown, max = 500): string => (typeof v === "string" ? v : v == null ? "" : String(v)).slice(0, max);
const dateFromEpoch = (s: unknown): string | null => {
  const n = num(s);
  return n === null ? null : new Date(n * 1000).toISOString().slice(0, 10);
};

/**
 * Accepts both protocol shapes seen in the wild: the current one (`errlist`,
 * `connections` with `conn_id`) and the earlier one (`errors`, `org` on each
 * account). Anything malformed is dropped rather than trusted.
 */
export function normalizeAccountSet(body: unknown): { accounts: NormalizedAccount[]; errors: string[] } {
  const b = (body && typeof body === "object" ? body : {}) as Record<string, unknown>;
  const errors = [...(Array.isArray(b.errors) ? b.errors : []), ...(Array.isArray(b.errlist) ? b.errlist : [])]
    .map((e) => (typeof e === "string" ? e : str((e as Record<string, unknown>)?.msg ?? e, 300)))
    .filter(Boolean);

  const connNames = new Map<string, string>();
  for (const c of Array.isArray(b.connections) ? b.connections : []) {
    const r = c as Record<string, unknown>;
    if (r?.conn_id) connNames.set(str(r.conn_id), str(r.name, 120));
  }

  const accounts: NormalizedAccount[] = [];
  for (const raw of Array.isArray(b.accounts) ? b.accounts : []) {
    const a = raw as Record<string, unknown>;
    if (!a?.id) continue;
    const org = a.org as Record<string, unknown> | undefined;
    const transactions: NormalizedTransaction[] = [];
    for (const t of Array.isArray(a.transactions) ? a.transactions : []) {
      const r = t as Record<string, unknown>;
      const amount = num(r?.amount);
      const posted = dateFromEpoch(r?.posted);
      // Pending charges get a new id once they post, so importing them would
      // double-count; they're skipped until they settle.
      if (!r?.id || amount === null || !posted || r.pending === true) continue;
      transactions.push({
        externalId: str(r.id, 200), posted, amount,
        description: str(r.description, 300), payee: r.payee ? str(r.payee, 200) : null, memo: r.memo ? str(r.memo, 300) : null,
      });
    }
    const balanceEpoch = num(a["balance-date"]);
    accounts.push({
      externalId: str(a.id, 200),
      name: str(a.name, 120) || "Account",
      orgName: (org?.name ? str(org.name, 120) : connNames.get(str(a.conn_id))) || null,
      currency: str(a.currency, 10) || "USD",
      balance: num(a.balance), availableBalance: num(a["available-balance"]),
      balanceDate: balanceEpoch === null ? null : new Date(balanceEpoch * 1000).toISOString(),
      transactions,
    });
  }
  return { accounts, errors };
}

/* ---------- Credential encryption (AES-256-GCM, WebCrypto) ---------- */

const toB64 = (buf: ArrayBuffer | Uint8Array) => btoa(String.fromCharCode(...new Uint8Array(buf)));
const fromB64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

async function importKey(keyB64: string): Promise<CryptoKey> {
  const raw = fromB64(keyB64);
  if (raw.length !== 32) throw new Error("Bank credential key must be 32 bytes, base64-encoded.");
  return crypto.subtle.importKey("raw", raw, "AES-GCM", false, ["encrypt", "decrypt"]);
}

/** `v1.<iv>.<ciphertext>` — the version prefix leaves room to rotate the scheme. */
export async function encryptSecret(plain: string, keyB64: string): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, await importKey(keyB64), new TextEncoder().encode(plain));
  return `v1.${toB64(iv)}.${toB64(ct)}`;
}

export async function decryptSecret(blob: string, keyB64: string): Promise<string> {
  const [v, iv, ct] = blob.split(".");
  if (v !== "v1" || !iv || !ct) throw new Error("Unrecognised credential format.");
  const pt = await crypto.subtle.decrypt({ name: "AES-GCM", iv: fromB64(iv) }, await importKey(keyB64), fromB64(ct));
  return new TextDecoder().decode(pt);
}
