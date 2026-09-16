import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient, type SupabaseClient } from "jsr:@supabase/supabase-js@2";
import {
  decodeSetupToken, parseAccessUrl, normalizeAccountSet, syncWindow, isSyncDue,
  encryptSecret, decryptSecret, SimpleFinError,
} from "../_shared/simplefin.ts";

// Read-only bank sync through SimpleFIN Bridge.
//
// Two ways in, authenticated separately:
//   - a signed-in, approved user: connect / sync / disconnect their OWN connections
//   - the scheduled job: `x-cron-secret`, syncs every connection that's due
// Deployed with gateway JWT verification off so the schedule can reach it, which
// is why every user call verifies the token itself before doing anything.
//
// Secrets (never in the repo):
//   BANK_TOKEN_KEY  32 random bytes, base64 — encrypts stored access URLs
//   CRON_SECRET     shared with the scheduled GitHub Action

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });

const MAX_CONNECTIONS_PER_USER = 5;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Constant-time comparison, so the cron secret can't be recovered by timing. */
function safeEqual(a: string, b: string): boolean {
  const x = new TextEncoder().encode(a), y = new TextEncoder().encode(b);
  let diff = x.length ^ y.length;
  for (let i = 0; i < Math.max(x.length, y.length); i++) diff |= (x[i] ?? 0) ^ (y[i] ?? 0);
  return diff === 0;
}

/** Only messages written for users ever leave the function — never a raw error, which could echo a URL. */
const safeMessage = (e: unknown) =>
  e instanceof SimpleFinError ? e.message : "Couldn't reach your bank through SimpleFIN. Try again later.";

async function sfFetch(url: string, init: RequestInit): Promise<Response> {
  // redirect: "error" — a redirect could otherwise walk the request off the allowlisted host.
  return await fetch(url, { ...init, redirect: "error", signal: AbortSignal.timeout(25_000) });
}

async function claimAccessUrl(setupToken: string): Promise<string> {
  const claimUrl = decodeSetupToken(setupToken);
  const res = await sfFetch(claimUrl.toString(), { method: "POST", headers: { "Content-Length": "0" } });
  if (res.status === 403) {
    throw new SimpleFinError("That setup token was already used or has expired. Create a new one in SimpleFIN Bridge.");
  }
  if (!res.ok) throw new SimpleFinError(`SimpleFIN didn't accept the token (status ${res.status}).`);
  const accessUrl = (await res.text()).trim();
  parseAccessUrl(accessUrl); // validated before it's ever stored
  return accessUrl;
}

interface Conn { id: string; user_id: string; last_synced_at: string | null }

async function syncConnection(admin: SupabaseClient, conn: Conn, key: string) {
  const { data: cred } = await admin.from("bank_credentials").select("ciphertext").eq("connection_id", conn.id).maybeSingle();
  if (!cred) throw new SimpleFinError("This connection's credentials are missing. Disconnect it and connect again.");

  const { base, authorization } = parseAccessUrl(await decryptSecret(cred.ciphertext, key));
  const { start, end } = syncWindow(conn.last_synced_at);
  const res = await sfFetch(`${base}/accounts?start-date=${start}&end-date=${end}`, { headers: { Authorization: authorization } });
  if (res.status === 403) throw new SimpleFinError("SimpleFIN refused access — the connection may have been turned off there. Reconnect it.");
  if (res.status === 402) throw new SimpleFinError("Your SimpleFIN Bridge subscription needs attention.");
  if (!res.ok) throw new SimpleFinError(`SimpleFIN returned an error (status ${res.status}).`);
  const { accounts, errors } = normalizeAccountSet(await res.json());

  let newTransactions = 0;
  for (const a of accounts) {
    const { data: acct, error } = await admin.from("bank_accounts").upsert({
      user_id: conn.user_id, connection_id: conn.id, external_id: a.externalId, name: a.name, org_name: a.orgName,
      currency: a.currency, balance: a.balance, available_balance: a.availableBalance, balance_date: a.balanceDate,
    }, { onConflict: "connection_id,external_id" }).select("id").single();
    if (error || !acct) throw new Error("account upsert failed");

    if (a.transactions.length === 0) continue;
    // ignoreDuplicates: anything already seen keeps its review status, and only
    // genuinely new rows come back — which is the count worth reporting.
    const { data: inserted, error: txErr } = await admin.from("bank_transactions").upsert(
      a.transactions.map((t) => ({
        user_id: conn.user_id, account_id: acct.id, external_id: t.externalId, posted: t.posted,
        amount: t.amount, description: t.description, payee: t.payee, memo: t.memo,
      })),
      { onConflict: "account_id,external_id", ignoreDuplicates: true },
    ).select("id");
    if (txErr) throw new Error("transaction upsert failed");
    newTransactions += inserted?.length ?? 0;
  }

  await admin.from("bank_connections").update({
    last_synced_at: new Date().toISOString(),
    status: errors.length ? "error" : "active",
    last_error: errors[0]?.slice(0, 300) ?? null,
  }).eq("id", conn.id);

  return { accounts: accounts.length, newTransactions, warnings: errors };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "Method not allowed." }, 405);

  const key = Deno.env.get("BANK_TOKEN_KEY");
  if (!key) return json({ error: "Bank sync isn't set up on the server yet." }, 503);
  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // ---- Scheduled run ----
  const cronHeader = req.headers.get("x-cron-secret");
  if (cronHeader !== null) {
    const expected = Deno.env.get("CRON_SECRET");
    if (!expected || !safeEqual(cronHeader, expected)) return json({ error: "Forbidden." }, 403);
    const { data: conns } = await admin.from("bank_connections").select("id,user_id,last_synced_at");
    let synced = 0, skipped = 0, failed = 0;
    for (const c of (conns ?? []) as Conn[]) {
      if (!isSyncDue(c.last_synced_at)) { skipped++; continue; }
      try { await syncConnection(admin, c, key); synced++; }
      catch (e) {
        failed++;
        await admin.from("bank_connections").update({ status: "error", last_error: safeMessage(e) }).eq("id", c.id);
      }
    }
    return json({ synced, skipped, failed });
  }

  // ---- Signed-in user ----
  const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!token) return json({ error: "Sign in first." }, 401);
  const { data: userData, error: userErr } = await admin.auth.getUser(token);
  if (userErr || !userData.user) return json({ error: "Your session has expired. Sign in again." }, 401);
  const uid = userData.user.id;
  // The same approval gate RLS applies everywhere else.
  const { data: profile } = await admin.from("profiles").select("status").eq("id", uid).maybeSingle();
  if (profile?.status !== "approved") return json({ error: "Your account hasn't been approved yet." }, 403);

  const body = await req.json().catch(() => ({})) as Record<string, unknown>;

  try {
    switch (body.action) {
      case "connect": {
        const { count } = await admin.from("bank_connections").select("id", { count: "exact", head: true }).eq("user_id", uid);
        if ((count ?? 0) >= MAX_CONNECTIONS_PER_USER) {
          return json({ error: `You can connect up to ${MAX_CONNECTIONS_PER_USER} SimpleFIN accounts.` }, 400);
        }
        const accessUrl = await claimAccessUrl(String(body.setupToken ?? ""));
        const ciphertext = await encryptSecret(accessUrl, key);
        const { data: conn, error } = await admin.from("bank_connections").insert({ user_id: uid }).select("id,user_id,last_synced_at").single();
        if (error || !conn) throw new SimpleFinError("Couldn't save the connection. The setup token is now used, so create a new one and try again.");
        const { error: credErr } = await admin.from("bank_credentials").insert({ connection_id: conn.id, ciphertext });
        if (credErr) {
          await admin.from("bank_connections").delete().eq("id", conn.id);
          throw new SimpleFinError("Couldn't save the connection. The setup token is now used, so create a new one and try again.");
        }
        const result = await syncConnection(admin, conn as Conn, key)
          .catch((e) => ({ accounts: 0, newTransactions: 0, warnings: [safeMessage(e)] }));
        return json({ connectionId: conn.id, ...result });
      }

      case "sync": {
        const { data: conns } = await admin.from("bank_connections").select("id,user_id,last_synced_at").eq("user_id", uid);
        let synced = 0, skipped = 0, newTransactions = 0;
        const warnings: string[] = [];
        for (const c of (conns ?? []) as Conn[]) {
          if (!isSyncDue(c.last_synced_at)) { skipped++; continue; }
          try {
            const r = await syncConnection(admin, c, key);
            synced++; newTransactions += r.newTransactions; warnings.push(...r.warnings);
          } catch (e) {
            const msg = safeMessage(e);
            warnings.push(msg);
            await admin.from("bank_connections").update({ status: "error", last_error: msg }).eq("id", c.id);
          }
        }
        return json({ synced, skipped, newTransactions, warnings });
      }

      case "disconnect": {
        const id = String(body.connectionId ?? "");
        if (!UUID.test(id)) return json({ error: "Unknown connection." }, 400);
        // Scoped to the caller: an id belonging to someone else simply isn't found.
        const { data: deleted } = await admin.from("bank_connections").delete().eq("id", id).eq("user_id", uid).select("id");
        if (!deleted?.length) return json({ error: "Unknown connection." }, 404);
        return json({ ok: true });
      }

      default:
        return json({ error: "Unknown action." }, 400);
    }
  } catch (e) {
    return json({ error: safeMessage(e) }, 400);
  }
});
