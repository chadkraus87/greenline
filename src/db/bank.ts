import { supabase } from "../lib/supabase";
import { emitDataChange } from "../data/sync";

/**
 * Read-only bank sync. Everything that touches a credential happens in the
 * bank-sync Edge Function; the browser only ever sees account names, balances
 * and transactions, and can only change a transaction's review status.
 */

export interface BankAccount {
  id: string; connectionId: string; name: string; orgName: string | null;
  currency: string; balance: number | null; availableBalance: number | null; balanceDate: string | null;
}
export interface BankConnection {
  id: string; status: "active" | "error"; lastSyncedAt: string | null; lastError: string | null;
  createdAt: string; accounts: BankAccount[];
}
export interface BankTransaction {
  id: string; accountId: string; accountName: string; posted: string;
  /** Signed as the bank reports it: negative = money out. */
  amount: number; description: string; payee: string | null;
}

const n = (v: unknown): number | null => (v === null || v === undefined ? null : Number(v));

async function invoke<T>(body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke("bank-sync", { body });
  if (error) {
    // The function returns a readable message in the body; surface that rather
    // than the client library's generic "non-2xx status" text.
    const ctx = (error as { context?: Response }).context;
    const msg = ctx ? await ctx.json().then((b: { error?: string }) => b.error).catch(() => null) : null;
    throw new Error(msg || "Bank sync is unavailable right now.");
  }
  return data as T;
}

export const connectBank = async (setupToken: string) => {
  const r = await invoke<{ accounts: number; newTransactions: number; warnings: string[] }>({ action: "connect", setupToken: setupToken.trim() });
  emitDataChange();
  return r;
};
export const syncBanks = async () => {
  const r = await invoke<{ synced: number; skipped: number; newTransactions: number; warnings: string[] }>({ action: "sync" });
  emitDataChange();
  return r;
};
export const disconnectBank = async (connectionId: string) => {
  await invoke({ action: "disconnect", connectionId });
  emitDataChange();
};

export async function listBankConnections(): Promise<BankConnection[]> {
  const [conns, accts] = await Promise.all([
    supabase.from("bank_connections").select("id,status,last_synced_at,last_error,created_at").order("created_at"),
    supabase.from("bank_accounts").select("id,connection_id,name,org_name,currency,balance,available_balance,balance_date").order("name"),
  ]);
  if (conns.error) throw conns.error;
  const accounts = (accts.data ?? []).map((a) => ({
    id: a.id, connectionId: a.connection_id, name: a.name, orgName: a.org_name, currency: a.currency,
    balance: n(a.balance), availableBalance: n(a.available_balance), balanceDate: a.balance_date,
  }));
  return (conns.data ?? []).map((c) => ({
    id: c.id, status: c.status, lastSyncedAt: c.last_synced_at, lastError: c.last_error, createdAt: c.created_at,
    accounts: accounts.filter((a) => a.connectionId === c.id),
  }));
}

export async function listNewBankTransactions(): Promise<BankTransaction[]> {
  const { data, error } = await supabase.from("bank_transactions")
    .select("id,account_id,posted,amount,description,payee,bank_accounts(name)")
    .eq("status", "new").order("posted", { ascending: false }).limit(500);
  if (error) throw error;
  return (data ?? []).map((t) => ({
    id: t.id, accountId: t.account_id, posted: t.posted, amount: Number(t.amount),
    description: t.description, payee: t.payee,
    accountName: (t.bank_accounts as unknown as { name?: string } | null)?.name ?? "Account",
  }));
}

export async function countNewBankTransactions(): Promise<number> {
  const { count } = await supabase.from("bank_transactions").select("id", { count: "exact", head: true }).eq("status", "new");
  return count ?? 0;
}

export async function setBankTransactionStatus(ids: string[], status: "added" | "dismissed"): Promise<void> {
  // Chunked: a first sync can bring in a few hundred rows.
  for (let i = 0; i < ids.length; i += 100) {
    const { error } = await supabase.from("bank_transactions").update({ status }).in("id", ids.slice(i, i + 100));
    if (error) throw error;
  }
  emitDataChange();
}
