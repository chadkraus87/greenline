import { useCallback, useEffect, useState } from "react";
import { Landmark, RefreshCw, Unplug, ExternalLink, Loader2, ShieldCheck } from "lucide-react";
import { Field } from "../../components/ui";
import { money } from "../../lib/money";
import { connectBank, disconnectBank, listBankConnections, syncBanks, type BankConnection } from "../../db/bank";
import { onDataChange } from "../../data/sync";
import { useToast } from "../../hooks/useToasts";
import { DEMO } from "../../dev/demo";

const rel = new Intl.RelativeTimeFormat(undefined, { numeric: "auto" });
function ago(iso: string | null): string {
  if (!iso) return "never";
  const mins = Math.round((Date.parse(iso) - Date.now()) / 60000);
  if (Math.abs(mins) < 60) return rel.format(mins, "minute");
  const hours = Math.round(mins / 60);
  if (Math.abs(hours) < 36) return rel.format(hours, "hour");
  return rel.format(Math.round(hours / 24), "day");
}

/**
 * Connect a bank through SimpleFIN Bridge.
 *
 * The explanation is deliberately up front and specific: this sends financial
 * data through a third party, costs money, and should only be switched on by
 * someone who understands both.
 */
export function BankSyncPanel() {
  const toast = useToast();
  const [conns, setConns] = useState<BankConnection[] | null>(null);
  const [token, setToken] = useState("");
  const [busy, setBusy] = useState<"" | "connect" | "sync" | string>("");
  const [adding, setAdding] = useState(false);

  const load = useCallback(async () => {
    if ((import.meta.env.DEV && DEMO)) { setConns([]); return; }
    try { setConns(await listBankConnections()); } catch { setConns([]); }
  }, []);
  useEffect(() => { void load(); return onDataChange(() => { void load(); }); }, [load]);

  const connect = async () => {
    setBusy("connect");
    try {
      const r = await connectBank(token);
      setToken(""); setAdding(false);
      toast(`Connected ${r.accounts} account${r.accounts === 1 ? "" : "s"} — ${r.newTransactions} transaction${r.newTransactions === 1 ? "" : "s"} to review`);
      if (r.warnings.length) toast(r.warnings[0], "brass");
    } catch (e) {
      toast((e as Error).message, "clay");
    } finally { setBusy(""); }
  };

  const sync = async () => {
    setBusy("sync");
    try {
      const r = await syncBanks();
      if (r.synced === 0 && r.skipped > 0) toast("Already up to date — banks are checked at most every few hours");
      else toast(r.newTransactions ? `${r.newTransactions} new transaction${r.newTransactions === 1 ? "" : "s"} to review` : "Synced — nothing new");
      if (r.warnings.length) toast(r.warnings[0], "brass");
    } catch (e) {
      toast((e as Error).message, "clay");
    } finally { setBusy(""); }
  };

  const disconnect = async (c: BankConnection) => {
    const names = c.accounts.map((a) => a.name).join(", ") || "this connection";
    if (!window.confirm(`Disconnect ${names}? Greenline deletes the stored access and any transactions you haven't reviewed. Expenses you've already imported stay. To fully revoke access, also remove the app in SimpleFIN Bridge.`)) return;
    setBusy(c.id);
    try { await disconnectBank(c.id); toast("Disconnected"); }
    catch (e) { toast((e as Error).message, "clay"); }
    finally { setBusy(""); }
  };

  const showForm = adding || (conns !== null && conns.length === 0);

  return (
    <div>
      <p style={{ fontSize: 14, color: "var(--dim)", marginTop: 0 }}>
        Pull transactions in automatically instead of typing them. Read-only: the service Greenline uses can
        see balances and transactions but has no way to move money.
      </p>

      {conns?.map((c) => (
        <div key={c.id} className="gl-card" style={{ padding: "12px 14px", marginBottom: 10, background: "var(--raised)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <Landmark size={18} color="var(--accent)" aria-hidden />
            <div style={{ flex: 1, minWidth: 160 }}>
              <div style={{ fontWeight: 600 }}>{c.accounts[0]?.orgName ?? "Bank connection"}</div>
              <div style={{ fontSize: 13, color: c.status === "error" ? "var(--danger)" : "var(--dim)" }}>
                {c.status === "error" && c.lastError ? c.lastError : `Last synced ${ago(c.lastSyncedAt)}`}
              </div>
            </div>
            <button className="gl-btn quiet" disabled={busy === c.id} onClick={() => disconnect(c)}>
              <Unplug size={15} aria-hidden /> Disconnect
            </button>
          </div>
          {c.accounts.length > 0 && (
            <div style={{ marginTop: 8 }}>
              {c.accounts.map((a) => (
                <div key={a.id} style={{ display: "flex", justifyContent: "space-between", fontSize: 14, padding: "4px 0 4px 28px" }}>
                  <span>{a.name}</span>
                  <span className="gl-mono">{a.balance === null ? "—" : money(a.balance)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      ))}

      {conns && conns.length > 0 && (
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button className="gl-btn" disabled={busy === "sync"} onClick={sync}>
            {busy === "sync" ? <Loader2 size={15} className="gl-spin" aria-hidden /> : <RefreshCw size={15} aria-hidden />} Sync now
          </button>
          {!adding && <button className="gl-btn quiet" onClick={() => setAdding(true)}>Connect another bank</button>}
        </div>
      )}

      {showForm && (
        <div style={{ marginTop: conns?.length ? 14 : 4 }}>
          <ol style={{ fontSize: 14, paddingLeft: 20, margin: "0 0 4px", lineHeight: 1.6 }}>
            <li>
              Create an account at{" "}
              <a href="https://bridge.simplefin.org/" target="_blank" rel="noopener noreferrer" style={{ color: "var(--accent)" }}>
                SimpleFIN Bridge <ExternalLink size={12} aria-hidden />
              </a>{" "}
              (about $15 a year) and connect your bank there. Your bank login stays with them — Greenline never sees it.
            </li>
            <li>In SimpleFIN Bridge, create a <strong>setup token</strong> for a new app.</li>
            <li>Paste it below. Tokens work once.</li>
          </ol>
          <Field label="Setup token">
            <textarea className="gl-input gl-mono" rows={3} value={token} onChange={(e) => setToken(e.target.value)}
              spellCheck={false} autoComplete="off" placeholder="aHR0cHM6Ly9icmlkZ2Uuc2ltcGxlZmlu…" style={{ fontSize: 13 }} />
          </Field>
          <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 10, flexWrap: "wrap" }}>
            <button className="gl-btn primary" disabled={!token.trim() || busy === "connect"} onClick={connect}>
              {busy === "connect" ? <Loader2 size={15} className="gl-spin" aria-hidden /> : <Landmark size={15} aria-hidden />}
              {busy === "connect" ? "Connecting…" : "Connect"}
            </button>
            {adding && <button className="gl-btn quiet" onClick={() => { setAdding(false); setToken(""); }}>Cancel</button>}
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "flex-start", fontSize: 13, color: "var(--dim)", marginTop: 12 }}>
            <ShieldCheck size={15} style={{ flexShrink: 0, marginTop: 2 }} aria-hidden />
            <span>
              The access SimpleFIN grants is stored encrypted on the server and never sent to your browser.
              New transactions arrive a few times a day and wait for your review — nothing is added to your budget on its own.
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
