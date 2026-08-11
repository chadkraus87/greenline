import { useCallback, useEffect, useMemo, useState } from "react";
import { Search, FileText, ExternalLink, Briefcase, X, FilePlus2, Trash2 } from "lucide-react";
import type { Category, Expense } from "../../types";
import { ViewHeader, Empty } from "../../components/ui";
import { money } from "../../lib/money";
import { TAX_LINE_BY_ID } from "../../lib/tax";
import { receiptUrl, listReceiptFiles, deleteReceiptFile } from "../../db/actions";
import { useToast } from "../../hooks/useToasts";

/**
 * Every scanned receipt in one searchable place — the "catalog it and find it
 * later" half of receipt scanning. Images stay private; each view mints a
 * short-lived signed URL rather than exposing a public link.
 */
export function ReceiptVault({ expenses, categories, businessMode, onEdit, onFile, onUnfiledCount }:
  { expenses: Expense[]; categories: Category[]; businessMode: boolean;
    onEdit: (e: Expense) => void; onFile: (path: string) => void; onUnfiledCount?: (n: number) => void }) {
  const toast = useToast();
  const [q, setQ] = useState("");
  const [year, setYear] = useState("all");
  const [scope, setScope] = useState<"all" | "business" | "personal">("all");
  const [viewing, setViewing] = useState<{ expense: Expense; url: string } | null>(null);
  const [unfiled, setUnfiled] = useState<{ path: string; createdAt: string }[]>([]);

  // Receipts uploaded but never attached to an expense — e.g. scanned in a batch
  // to file later, or a form closed before saving. Surfaced so nothing is lost.
  const refreshUnfiled = useCallback(async () => {
    const files = await listReceiptFiles();
    const used = new Set(expenses.map((e) => e.receiptPath).filter(Boolean) as string[]);
    const orphans = files.filter((f) => !used.has(f.path));
    setUnfiled(orphans);
    onUnfiledCount?.(orphans.length);
  }, [expenses, onUnfiledCount]);
  useEffect(() => { refreshUnfiled(); }, [refreshUnfiled]);

  const viewUnfiled = async (path: string) => {
    const url = await receiptUrl(path);
    if (url) window.open(url, "_blank", "noopener,noreferrer");
    else toast("Couldn't open that receipt", "clay");
  };

  const discard = async (path: string) => {
    try { await deleteReceiptFile(path); await refreshUnfiled(); toast("Receipt deleted"); }
    catch { toast("Couldn't delete that receipt", "clay"); }
  };

  const withReceipts = useMemo(
    () => expenses.filter((e) => e.receiptPath).sort((a, b) => b.date.localeCompare(a.date)),
    [expenses]
  );

  const years = useMemo(
    () => [...new Set(withReceipts.map((e) => e.date.slice(0, 4)))].sort().reverse(),
    [withReceipts]
  );

  const catName = (id: string) => categories.find((c) => c.id === id)?.name ?? "";

  const filtered = withReceipts.filter((e) => {
    if (year !== "all" && !e.date.startsWith(year)) return false;
    if (scope === "business" && !e.business) return false;
    if (scope === "personal" && e.business) return false;
    const needle = q.trim().toLowerCase();
    if (!needle) return true;
    const hay = `${e.title} ${e.merchant ?? ""} ${e.notes ?? ""} ${catName(e.categoryId)} ${e.amount}`.toLowerCase();
    return hay.includes(needle);
  });

  const total = filtered.reduce((s, e) => s + e.amount, 0);

  const open = async (e: Expense) => {
    try {
      const url = await receiptUrl(e.receiptPath!);
      if (!url) return toast("Couldn't open that receipt", "clay");
      setViewing({ expense: e, url });
    } catch { toast("Couldn't open that receipt", "clay"); }
  };

  return (
    <div className="gl-card">
      <ViewHeader title="Receipts"
        sub={`${withReceipts.length} scanned receipt${withReceipts.length === 1 ? "" : "s"} on file`} />

      {unfiled.length > 0 && (
        <div style={{ margin: "0 14px 12px", padding: "10px 12px", borderRadius: 9, background: "var(--brass-soft)" }}>
          <div style={{ fontSize: 12.5, fontWeight: 600, marginBottom: 6 }}>
            {unfiled.length} unfiled receipt{unfiled.length === 1 ? "" : "s"}
          </div>
          <div style={{ fontSize: 11.5, color: "var(--dim)", marginBottom: 8 }}>
            Scanned but not yet attached to an expense. File them so they appear in your records and tax package.
          </div>
          {unfiled.map((f) => (
            <div key={f.path} style={{ display: "flex", gap: 6, alignItems: "center", padding: "4px 0" }}>
              <FileText size={13} color="var(--brass)" style={{ flexShrink: 0 }} />
              <span style={{ flex: 1, minWidth: 0, fontSize: 12, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {f.createdAt ? f.createdAt.slice(0, 10) : f.path.split("/").pop()}
              </span>
              <button className="gl-btn" style={{ padding: "3px 8px", fontSize: 11.5 }} onClick={() => viewUnfiled(f.path)}>View</button>
              <button className="gl-btn primary" style={{ padding: "3px 8px", fontSize: 11.5 }} onClick={() => onFile(f.path)}>
                <FilePlus2 size={11} /> File it
              </button>
              <button className="gl-icon-btn" style={{ width: 26, height: 26 }} aria-label="Delete unfiled receipt"
                onClick={() => discard(f.path)}><Trash2 size={12} /></button>
            </div>
          ))}
        </div>
      )}

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", padding: "0 14px 12px", alignItems: "center" }}>
        <div style={{ position: "relative", flex: "1 1 200px" }}>
          <Search size={13} style={{ position: "absolute", left: 9, top: 10, color: "var(--dim)" }} />
          <input className="gl-input" value={q} onChange={(e) => setQ(e.target.value)}
            placeholder="Search merchant, amount, notes…" aria-label="Search receipts"
            style={{ paddingLeft: 28, fontSize: 13 }} />
        </div>
        <select className="gl-select" value={year} onChange={(e) => setYear(e.target.value)}
          aria-label="Filter by year" style={{ width: 110, fontSize: 12.5 }}>
          <option value="all">All years</option>
          {years.map((y) => <option key={y} value={y}>{y}</option>)}
        </select>
        {businessMode && (
          <select className="gl-select" value={scope} onChange={(e) => setScope(e.target.value as typeof scope)}
            aria-label="Filter business or personal" style={{ width: 130, fontSize: 12.5 }}>
            <option value="all">All receipts</option>
            <option value="business">Business only</option>
            <option value="personal">Personal only</option>
          </select>
        )}
      </div>

      {withReceipts.length === 0 ? (
        <Empty text="No receipts yet. Use “Scan receipt” on the Expenses tab and they'll be filed here automatically." />
      ) : filtered.length === 0 ? (
        <Empty text="No receipts match that search." />
      ) : (
        <>
          <div style={{ padding: "0 14px 8px", fontSize: 12, color: "var(--dim)" }}>
            Showing {filtered.length} · {money(total)}
          </div>
          <div style={{ overflowX: "auto" }}>
            <table className="gl-table">
              <thead>
                <tr>
                  <th>Date</th><th>Merchant</th><th>Category</th>
                  <th style={{ textAlign: "right" }}>Amount</th><th />
                </tr>
              </thead>
              <tbody>
                {filtered.map((e) => (
                  <tr key={e.id}>
                    <td className="gl-mono" style={{ color: "var(--dim)", whiteSpace: "nowrap" }}>{e.date}</td>
                    <td>
                      {e.merchant || e.title}
                      {e.business && (
                        <span style={{ fontSize: 10.5, color: "var(--fern)", marginLeft: 6, whiteSpace: "nowrap" }}>
                          <Briefcase size={9} style={{ verticalAlign: "middle" }} /> business
                          {e.taxCategory && ` · ${TAX_LINE_BY_ID.get(e.taxCategory)?.label ?? ""}`}
                        </span>
                      )}
                    </td>
                    <td style={{ color: "var(--dim)" }}>{catName(e.categoryId) || "—"}</td>
                    <td className="gl-mono" style={{ textAlign: "right", fontWeight: 600 }}>{money(e.amount)}</td>
                    <td style={{ whiteSpace: "nowrap", textAlign: "right" }}>
                      <button className="gl-btn" style={{ padding: "3px 8px", fontSize: 11.5 }} onClick={() => open(e)}>
                        <FileText size={12} /> View
                      </button>{" "}
                      <button className="gl-btn" style={{ padding: "3px 8px", fontSize: 11.5 }} onClick={() => onEdit(e)}>
                        Edit
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {viewing && (
        <div className="gl-modal-wrap" onMouseDown={(ev) => ev.target === ev.currentTarget && setViewing(null)}>
          <div className="gl-modal" role="dialog" aria-modal="true" aria-label="Receipt image" style={{ width: "min(720px,100%)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "14px 18px", borderBottom: "1px solid var(--line)" }}>
              <div>
                <div className="gl-display" style={{ fontSize: 16 }}>{viewing.expense.merchant || viewing.expense.title}</div>
                <div style={{ fontSize: 11.5, color: "var(--dim)" }}>
                  {viewing.expense.date} · {money(viewing.expense.amount)}
                </div>
              </div>
              <div style={{ display: "flex", gap: 6 }}>
                <a className="gl-btn" href={viewing.url} target="_blank" rel="noopener noreferrer" style={{ fontSize: 12 }}>
                  <ExternalLink size={12} /> Open
                </a>
                <button className="gl-icon-btn" onClick={() => setViewing(null)} aria-label="Close"><X size={15} /></button>
              </div>
            </div>
            <div style={{ padding: 14, textAlign: "center", background: "var(--raised)" }}>
              <ReceiptImage url={viewing.url} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/** PDFs can't render in an <img>, so fall back to a link for those. */
function ReceiptImage({ url }: { url: string }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => { setFailed(false); }, [url]);
  if (failed) {
    return (
      <div style={{ padding: 30, color: "var(--dim)", fontSize: 13 }}>
        This receipt can't be previewed here — use <strong>Open</strong> to view it.
      </div>
    );
  }
  return (
    <img src={url} alt="Scanned receipt" onError={() => setFailed(true)}
      style={{ maxWidth: "100%", maxHeight: "70vh", borderRadius: 8 }} />
  );
}
