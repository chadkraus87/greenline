import { useMemo, useRef, useState } from "react";
import { Upload, AlertTriangle, Check, FileText, Camera, Loader2 } from "lucide-react";
import { Modal, Field, Empty } from "../../components/ui";
import type { Category, Expense } from "../../types";
import { SCHEDULE_C } from "../../lib/tax";
import { buildMerchantIndex, suggestCategory } from "../../lib/autoCategorize";
import { money } from "../../lib/money";
import {
  parseCsv, detectColumns, looksLikeHeader, buildRows, markDuplicates,
  cleanDescription, rowsFromTransactions, type ColumnMap, type ImportRow,
} from "../../lib/csvImport";
import * as act from "../../db/actions";
import { useToast } from "../../hooks/useToasts";

/** Import a bank or card CSV. Nothing is written until the preview is confirmed. */
export function ImportModal({ categories, existing, businessMode, onClose }:
  { categories: Category[]; existing: Expense[]; businessMode?: boolean; onClose: () => void }) {
  const toast = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const [headers, setHeaders] = useState<string[]>([]);
  const [dataRows, setDataRows] = useState<string[][]>([]);
  const [map, setMap] = useState<ColumnMap | null>(null);
  const [flipSign, setFlipSign] = useState(false);
  const [categoryId, setCategoryId] = useState(categories[0]?.id ?? "");
  const [overrides, setOverrides] = useState<Record<number, boolean>>({});
  const [asBusiness, setAsBusiness] = useState(false);
  const [taxCategory, setTaxCategory] = useState("");
  const [busy, setBusy] = useState(false);
  const [scanning, setScanning] = useState("");
  /** Rows produced by a scan (statement or batch); bypasses column mapping. */
  const [scannedRows, setScannedRows] = useState<ImportRow[] | null>(null);
  const [scanNote, setScanNote] = useState("");
  const [sourceReceipt, setSourceReceipt] = useState<string | undefined>();
  const scanRef = useRef<HTMLInputElement>(null);
  const [scanMode, setScanMode] = useState<"statement" | "batch">("statement");

  const readFile = async (file: File) => {
    try {
      const rows = parseCsv(await file.text());
      if (rows.length === 0) return toast("That file looks empty", "brass");
      const hasHeader = looksLikeHeader(rows[0]);
      const head = hasHeader ? rows[0] : rows[0].map((_, i) => `Column ${i + 1}`);
      setHeaders(head);
      setDataRows(hasHeader ? rows.slice(1) : rows);
      setMap(detectColumns(head));
      setOverrides({});
    } catch {
      toast("Couldn't read that file — is it a CSV?", "clay");
    }
  };

  const runScan = async (file: File) => {
    if (file.size > 10 * 1024 * 1024) return toast("That file is over 10 MB — try a smaller one.", "brass");
    setScanning(scanMode === "statement" ? "Reading statement…" : "Reading receipts…");
    try {
      const path = await act.uploadReceipt(file);
      if (scanMode === "statement") {
        const st = await act.scanStatement(path);
        if (st.transactions.length === 0) throw new Error("No transactions found in that statement.");
        setScannedRows(rowsFromTransactions(st.transactions));
        setScanNote(`${st.transactions.length} transactions${st.accountLabel ? ` from ${st.accountLabel}` : ""}`
          + (st.confidence !== "high" ? ` · ${st.confidence} confidence — check the totals` : ""));
        setSourceReceipt(undefined); // a statement isn't a receipt for any one expense
      } else {
        const list = await act.scanReceiptBatch(path);
        if (list.length === 0) throw new Error("No receipts found in that photo.");
        setScannedRows(rowsFromTransactions(list.map((r) => ({
          date: r.date, description: r.merchant || "Receipt", amount: r.total, direction: "debit" as const,
        }))));
        setScanNote(`${list.length} receipt${list.length === 1 ? "" : "s"} found — check each amount`);
        setSourceReceipt(path); // all of them came from this one image
      }
      setHeaders([]); setDataRows([]); setMap(null); setOverrides({});
    } catch (e) {
      toast((e as Error).message || "Scan failed", "clay");
    } finally { setScanning(""); }
  };

  const rows: ImportRow[] = useMemo(() => {
    if (scannedRows) return markDuplicates(scannedRows, existing);
    if (!map) return [];
    const built = buildRows(dataRows, map, { purchasesArePositive: flipSign });
    return markDuplicates(built, existing);
  }, [scannedRows, dataRows, map, flipSign, existing]);

  // Each row gets its own category from history/rules; the dropdown below is
  // only the fallback for rows nothing recognises.
  const merchantIndex = useMemo(() => buildMerchantIndex(existing), [existing]);
  const resolved = useMemo(() => rows.map((r) => {
    if (r.error) return { row: r, categoryId: categoryId, taxCategory: undefined as string | undefined, business: false, auto: false };
    const s = suggestCategory(cleanDescription(r.description), merchantIndex, categories);
    return {
      row: r,
      categoryId: s.categoryId ?? categoryId,
      taxCategory: asBusiness ? (s.taxCategory ?? (taxCategory || undefined)) : undefined,
      business: asBusiness,
      auto: Boolean(s.categoryId),
    };
  }), [rows, merchantIndex, categories, categoryId, asBusiness, taxCategory]);

  const byIndex = useMemo(() => new Map(resolved.map((x) => [x.row.index, x])), [resolved]);
  const autoCount = resolved.filter((x) => x.auto && !x.row.error).length;

  const effective = rows.map((r) => ({ ...r, include: overrides[r.index] ?? r.include }));
  const selected = effective.filter((r) => r.include && !r.error);
  const dupes = rows.filter((r) => r.duplicate).length;
  const credits = rows.filter((r) => r.isCredit && !r.error).length;
  const errors = rows.filter((r) => r.error).length;
  const total = selected.reduce((s, r) => s + r.amount, 0);
  const mapOk = scannedRows ? true : Boolean(map && map.date >= 0 && (map.amount >= 0 || map.debit >= 0 || map.credit >= 0));

  const setCol = (k: keyof ColumnMap, v: number) => map && setMap({ ...map, [k]: v });

  const doImport = async () => {
    if (selected.length === 0) return;
    setBusy(true);
    try {
      const n = await act.bulkAddExpenses(selected.map((r) => {
        const res = byIndex.get(r.index);
        return {
          title: cleanDescription(r.description) || "Imported transaction",
          amount: r.amount,
          categoryId: res?.categoryId ?? categoryId,
          date: r.date,
          merchant: cleanDescription(r.description) || undefined,
          receiptPath: sourceReceipt,
          business: asBusiness,
          businessPct: 100,
          taxCategory: res?.taxCategory,
        };
      }));
      toast(`Imported ${n} transaction${n === 1 ? "" : "s"}`);
      onClose();
    } catch (e) {
      toast((e as Error).message || "Import failed", "clay");
    } finally { setBusy(false); }
  };

  const ColSelect = ({ label, value, onChange, allowNone }:
    { label: string; value: number; onChange: (v: number) => void; allowNone?: boolean }) => (
    <Field label={label}>
      <select className="gl-select" value={value} onChange={(e) => onChange(parseInt(e.target.value))}>
        {allowNone && <option value={-1}>— none —</option>}
        {headers.map((h, i) => <option key={i} value={i}>{h}</option>)}
      </select>
    </Field>
  );

  return (
    <Modal title="Import from your bank" onClose={onClose} wide>
      {headers.length === 0 && !scannedRows ? (
        <>
          <p style={{ fontSize: 13, color: "var(--dim)", marginTop: 6 }}>
            Export a CSV of transactions from your bank or card, then choose it here. You'll see
            everything before anything is saved — Greenline matches the columns automatically and
            skips transactions you've already recorded.
          </p>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 8 }}>
            <button className="gl-btn primary" disabled={!!scanning} onClick={() => fileRef.current?.click()}>
              <Upload size={14} /> Choose CSV file
            </button>
            <button className="gl-btn" disabled={!!scanning}
              onClick={() => { setScanMode("statement"); setTimeout(() => scanRef.current?.click(), 0); }}>
              {scanning === "Reading statement…" ? <Loader2 size={14} className="gl-spin" /> : <FileText size={14} />}
              Scan a statement (PDF)
            </button>
            <button className="gl-btn" disabled={!!scanning}
              onClick={() => { setScanMode("batch"); setTimeout(() => scanRef.current?.click(), 0); }}>
              {scanning === "Reading receipts…" ? <Loader2 size={14} className="gl-spin" /> : <Camera size={14} />}
              Photo of several receipts
            </button>
          </div>
          {scanning && <div style={{ fontSize: 12.5, color: "var(--dim)", marginTop: 8 }}>{scanning} this can take a moment for a long statement.</div>}
          <input ref={fileRef} type="file" accept=".csv,text/csv" hidden
            onChange={(e) => { const f = e.target.files?.[0]; if (f) readFile(f); e.target.value = ""; }} />
          <input ref={scanRef} type="file" accept={scanMode === "statement" ? "application/pdf,image/*" : "image/*"}
            capture={scanMode === "batch" ? "environment" : undefined} hidden
            onChange={(e) => { const f = e.target.files?.[0]; if (f) runScan(f); e.target.value = ""; }} />
        </>
      ) : (
        <>
          {scanNote && (
            <div style={{ display: "flex", gap: 8, alignItems: "flex-start", padding: "9px 12px", borderRadius: 9,
              background: "var(--fern-soft)", marginTop: 8, fontSize: 12.5 }}>
              <FileText size={15} color="var(--fern)" style={{ flexShrink: 0, marginTop: 1 }} />
              <div>Read from your document — {scanNote}. Nothing is saved until you import.</div>
            </div>
          )}
          {!scannedRows && <div className="gl-label" style={{ marginTop: 8 }}>Which column is which?</div>}
          {!scannedRows && <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))", gap: 10 }}>
            <ColSelect label="Date" value={map!.date} onChange={(v) => setCol("date", v)} />
            <ColSelect label="Description" value={map!.description} onChange={(v) => setCol("description", v)} allowNone />
            {map!.debit >= 0 || map!.credit >= 0 ? (
              <>
                <ColSelect label="Money out" value={map!.debit} onChange={(v) => setCol("debit", v)} allowNone />
                <ColSelect label="Money in" value={map!.credit} onChange={(v) => setCol("credit", v)} allowNone />
              </>
            ) : (
              <ColSelect label="Amount" value={map!.amount} onChange={(v) => setCol("amount", v)} allowNone />
            )}
            <Field label="Category for unmatched rows">
              <select className="gl-select" value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
                {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </Field>
          </div>}
          {scannedRows && (
            <div style={{ maxWidth: 320, marginTop: 8 }}>
              <Field label="Category for unmatched rows">
                <select className="gl-select" value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
                  {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </Field>
            </div>
          )}

          {businessMode && (
            <div style={{ borderTop: "1px solid var(--line)", marginTop: 10, paddingTop: 10 }}>
              <label style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 12.5, cursor: "pointer" }}>
                <input type="checkbox" checked={asBusiness} onChange={(e) => setAsBusiness(e.target.checked)} />
                These are business expenses (e.g. a business card statement)
              </label>
              {asBusiness && (
                <div style={{ marginTop: 8, maxWidth: 320 }}>
                  <Field label="Schedule C category for all">
                    <select className="gl-select" value={taxCategory} onChange={(e) => setTaxCategory(e.target.value)}>
                      <option value="">— pick one —</option>
                      {SCHEDULE_C.map((l) => <option key={l.id} value={l.id}>{l.label} (line {l.line})</option>)}
                    </select>
                  </Field>
                  <div style={{ fontSize: 11.5, color: "var(--dim)", marginTop: 4 }}>
                    You can refine individual rows afterwards on the Expenses tab.
                  </div>
                </div>
              )}
            </div>
          )}

          {!scannedRows && map!.amount >= 0 && (
            <label style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 12.5, color: "var(--dim)", marginTop: 8, cursor: "pointer" }}>
              <input type="checkbox" checked={flipSign} onChange={(e) => setFlipSign(e.target.checked)} />
              My purchases show as positive numbers
            </label>
          )}

          {!mapOk && (
            <div style={{ display: "flex", gap: 8, padding: "9px 12px", borderRadius: 9, background: "var(--clay-soft)", marginTop: 10, fontSize: 12.5 }}>
              <AlertTriangle size={15} color="var(--clay)" style={{ flexShrink: 0 }} />
              Pick at least a date column and an amount (or money-out) column.
            </div>
          )}

          <div style={{ display: "flex", gap: 12, flexWrap: "wrap", fontSize: 12.5, color: "var(--dim)", margin: "12px 0 6px" }}>
            <span><strong style={{ color: "var(--fern)" }}>{selected.length}</strong> to import · {money(total)}</span>
            {autoCount > 0 && <span style={{ color: "var(--fern)" }}>{autoCount} auto-categorized</span>}
            {dupes > 0 && <span>{dupes} already recorded</span>}
            {credits > 0 && <span>{credits} money-in (skipped)</span>}
            {errors > 0 && <span style={{ color: "var(--clay)" }}>{errors} unreadable</span>}
          </div>

          <div style={{ maxHeight: 300, overflowY: "auto", border: "1px solid var(--line)", borderRadius: 9 }}>
            {effective.length === 0 ? <Empty text="No rows found." /> : (
              <table className="gl-table" style={{ margin: 0 }}>
                <thead><tr><th style={{ width: 32 }} /><th>Date</th><th>Description</th><th>Category</th><th style={{ textAlign: "right" }}>Amount</th></tr></thead>
                <tbody>
                  {effective.map((r) => (
                    <tr key={r.index} style={{ opacity: r.error ? 0.5 : 1 }}>
                      <td>
                        <input type="checkbox" checked={r.include} disabled={!!r.error}
                          aria-label={`Import row ${r.index + 1}`}
                          onChange={(e) => setOverrides({ ...overrides, [r.index]: e.target.checked })} />
                      </td>
                      <td className="gl-mono" style={{ color: "var(--dim)" }}>{r.date || "—"}</td>
                      <td>
                        {cleanDescription(r.description) || <span style={{ color: "var(--dim)" }}>(no description)</span>}
                        {r.duplicate && <span style={{ fontSize: 10.5, color: "var(--brass)", marginLeft: 6 }}>already recorded</span>}
                        {r.isCredit && !r.error && <span style={{ fontSize: 10.5, color: "var(--fern)", marginLeft: 6 }}>money in</span>}
                        {r.error && <span style={{ fontSize: 10.5, color: "var(--clay)", marginLeft: 6 }}>{r.error}</span>}
                      </td>
                      <td style={{ fontSize: 12, color: "var(--dim)", whiteSpace: "nowrap" }}>
                        {r.error ? "—" : (categories.find((c) => c.id === byIndex.get(r.index)?.categoryId)?.name ?? "—")}
                        {byIndex.get(r.index)?.auto && <span style={{ color: "var(--fern)", marginLeft: 4 }}>auto</span>}
                      </td>
                      <td className="gl-mono" style={{ textAlign: "right", fontWeight: 600 }}>
                        {r.error ? "—" : money(r.amount)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 14 }}>
            <button className="gl-btn" onClick={onClose}>Cancel</button>
            <button className="gl-btn primary" disabled={busy || !mapOk || selected.length === 0} onClick={doImport}>
              <Check size={14} /> Import {selected.length || ""}
            </button>
          </div>
        </>
      )}
    </Modal>
  );
}
