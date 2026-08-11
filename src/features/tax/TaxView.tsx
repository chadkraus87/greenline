import { useMemo, useState } from "react";
import { Download, AlertTriangle, Info, Loader2, FileSpreadsheet, CalendarClock } from "lucide-react";
import type { AppData } from "../../types";
import { ViewHeader, Empty, Stat } from "../../components/ui";
import { money } from "../../lib/money";
import { taxSummary, quarterlyDueDates } from "../../lib/tax";
import { buildTaxPackage, receiptManifest } from "../../lib/taxPackage";
import { createZip, textBytes, type ZipEntry } from "../../lib/zip";
import { downloadReceipt } from "../../db/actions";
import { useToast } from "../../hooks/useToasts";

/** Schedule C picture for the year: what you earned, what's deductible, what to set aside. */
export function TaxView({ data, year }: { data: AppData; year: number }) {
  const toast = useToast();
  const s = useMemo(() => taxSummary(data, year), [data, year]);
  const quarters = quarterlyDueDates(year);
  const today = new Date().toISOString().slice(0, 10);

  const [exporting, setExporting] = useState(false);
  const [progress, setProgress] = useState("");

  /** Builds the CPA package: summary, itemized ledger, income, mileage, and every receipt image. */
  const exportPackage = async () => {
    setExporting(true);
    try {
      const files = buildTaxPackage(data, year);
      const entries: ZipEntry[] = files.map((f) => ({ name: f.name, data: textBytes(f.content) }));

      const receipts = receiptManifest(data, year);
      let missing = 0;
      for (let i = 0; i < receipts.length; i++) {
        setProgress(`Adding receipt ${i + 1} of ${receipts.length}…`);
        const bytes = await downloadReceipt(receipts[i].path);
        if (bytes) entries.push({ name: receipts[i].name, data: bytes });
        else missing++;
      }
      if (missing > 0) {
        entries.push({
          name: "receipts/MISSING.txt",
          data: textBytes(`${missing} receipt image(s) could not be retrieved and are absent from this archive.\n`),
        });
      }

      setProgress("Building archive…");
      const a = document.createElement("a");
      a.href = URL.createObjectURL(createZip(entries));
      a.download = `greenline-tax-${year}${data.settings.businessName ? `-${data.settings.businessName.replace(/\W+/g, "-")}` : ""}.zip`;
      a.click();
      URL.revokeObjectURL(a.href);
      toast(`Tax package downloaded — ${receipts.length - missing} receipt${receipts.length - missing === 1 ? "" : "s"} included`);
    } catch (e) {
      toast((e as Error).message || "Export failed", "clay");
    } finally {
      setExporting(false);
      setProgress("");
    }
  };

  /** Just the numbers, for a quick look without the images. */
  const exportSummaryOnly = () => {
    const blob = new Blob([buildTaxPackage(data, year)[1].content], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `greenline-tax-summary-${year}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
    toast("Summary downloaded");
  };

  const nothingYet = s.businessIncome === 0 && s.totalDeductions === 0 && s.needsReview === 0;

  return (
    <div style={{ display: "grid", gap: 14 }}>
      <div className="gl-card">
        <ViewHeader title={`Tax summary — ${year}`}
          sub={data.settings.businessName || "Schedule C (sole proprietor)"} />

        {nothingYet ? (
          <Empty text="Nothing tagged as business yet this year. Tick “Business expense” when adding an expense, and mark self-employment income as business." />
        ) : (
          <>
            <div className="gl-stats" style={{ padding: "0 14px 12px" }}>
              <Stat label="Business income" value={money(s.businessIncome)} tone="var(--fern)" sub="received this year" />
              <Stat label="Deductions" value={money(s.totalDeductions)} sub={`incl. ${money(s.mileageDeduction)} mileage`} />
              <Stat label="Net profit" value={money(s.netProfit)} tone={s.netProfit < 0 ? "var(--clay)" : undefined} sub="income − deductions" />
              <Stat label="Est. SE tax" value={money(s.selfEmploymentTax)} tone="var(--brass)" sub="set this aside" />
            </div>

            {s.needsReview > 0 && (
              <div style={{ margin: "0 14px 12px", padding: "9px 12px", borderRadius: 9, background: "var(--brass-soft)",
                display: "flex", gap: 8, alignItems: "flex-start" }}>
                <AlertTriangle size={15} color="var(--brass)" style={{ flexShrink: 0, marginTop: 1 }} />
                <div style={{ fontSize: 12.5 }}>
                  <strong>{s.needsReview} business expense{s.needsReview === 1 ? "" : "s"}</strong> ({money(s.uncategorized.gross)})
                  {" "}have no Schedule C category, so they aren't counted as deductions. Open them on the Expenses tab and pick one.
                </div>
              </div>
            )}

            <div style={{ overflowX: "auto" }}>
              <table className="gl-table">
                <thead>
                  <tr>
                    <th style={{ width: 50 }}>Line</th><th>Category</th>
                    <th style={{ textAlign: "right" }}>Spent</th>
                    <th style={{ textAlign: "right" }}>Deductible</th>
                  </tr>
                </thead>
                <tbody>
                  {s.lines.map((l) => (
                    <tr key={l.id}>
                      <td className="gl-mono" style={{ color: "var(--dim)" }}>{l.line}</td>
                      <td>{l.label} <span style={{ color: "var(--dim)", fontSize: 11.5 }}>· {l.count}</span></td>
                      <td className="gl-mono" style={{ textAlign: "right", color: "var(--dim)" }}>{money(l.gross)}</td>
                      <td className="gl-mono" style={{ textAlign: "right", fontWeight: 600 }}>{money(l.deductible)}</td>
                    </tr>
                  ))}
                  {s.miles > 0 && (
                    <tr>
                      <td className="gl-mono" style={{ color: "var(--dim)" }}>9</td>
                      <td>Mileage <span style={{ color: "var(--dim)", fontSize: 11.5 }}>· {s.miles.toLocaleString()} mi</span></td>
                      <td className="gl-mono" style={{ textAlign: "right", color: "var(--dim)" }}>—</td>
                      <td className="gl-mono" style={{ textAlign: "right", fontWeight: 600 }}>{money(s.mileageDeduction)}</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            <div style={{ padding: "12px 14px", display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
              <button className="gl-btn primary" style={{ fontSize: 12 }} disabled={exporting} onClick={exportPackage}>
                {exporting ? <Loader2 size={13} className="gl-spin" /> : <Download size={13} />}
                {exporting ? "Preparing…" : "Export full package for my accountant"}
              </button>
              <button className="gl-btn" style={{ fontSize: 12 }} disabled={exporting} onClick={exportSummaryOnly}>
                <FileSpreadsheet size={13} /> Summary only
              </button>
              {progress && <span style={{ fontSize: 12, color: "var(--dim)" }}>{progress}</span>}
            </div>
            <p style={{ fontSize: 11.5, color: "var(--dim)", padding: "0 14px 14px", margin: 0 }}>
              The full package is a .zip containing a summary, an itemized ledger with every business
              transaction dated and categorized, income detail, your mileage log, and every scanned
              receipt image named to match its row.
            </p>
          </>
        )}
      </div>

      {(() => {
        const next = quarters.find((q) => q.due >= today);
        if (!next) return null;
        const days = Math.round((new Date(next.due).getTime() - new Date(today).getTime()) / 86400000);
        if (days > 30) return null;
        return (
          <div style={{ display: "flex", gap: 8, alignItems: "flex-start", padding: "10px 12px", borderRadius: 9,
            background: "var(--brass-soft)" }}>
            <CalendarClock size={15} color="var(--brass)" style={{ flexShrink: 0, marginTop: 1 }} />
            <div style={{ fontSize: 12.5 }}>
              <strong>{next.label} estimated tax is due {next.due}</strong> ({days === 0 ? "today" : `in ${days} day${days === 1 ? "" : "s"}`}).
              {s.selfEmploymentTax > 0 && ` Your year-to-date SE estimate is ${money(s.selfEmploymentTax)}.`}
            </div>
          </div>
        );
      })()}

      <div className="gl-card" style={{ padding: 16 }}>
        <div className="gl-display" style={{ fontSize: 15, marginBottom: 4 }}>Estimated tax due dates</div>
        <p style={{ fontSize: 12, color: "var(--dim)", marginTop: 0 }}>
          Self-employed income usually has no withholding, so the IRS expects quarterly payments.
        </p>
        {quarters.map((q) => {
          const past = q.due < today;
          return (
            <div className="gl-row" key={q.label}>
              <span style={{ width: 8, height: 8, borderRadius: 99, flexShrink: 0,
                background: past ? "var(--dim)" : "var(--brass)" }} />
              <div style={{ flex: 1 }}>
                <span style={{ fontWeight: 500 }}>{q.label}</span>
                <span style={{ color: "var(--dim)", fontSize: 11.5 }}> · covers {q.covers}</span>
              </div>
              <span className="gl-mono" style={{ fontSize: 12.5, color: past ? "var(--dim)" : "var(--text)" }}>{q.due}</span>
            </div>
          );
        })}
      </div>

      <div style={{ display: "flex", gap: 8, alignItems: "flex-start", padding: "10px 12px", borderRadius: 9,
        background: "var(--raised)", border: "1px solid var(--line)" }}>
        <Info size={15} color="var(--dim)" style={{ flexShrink: 0, marginTop: 1 }} />
        <div style={{ fontSize: 12, color: "var(--dim)" }}>
          These are planning estimates, not tax advice or a filed return. The SE tax figure uses a flat
          15.3% of 92.35% of net profit and ignores the Social Security wage cap, other household income,
          and the deduction for half of SE tax. Have a tax professional review before filing.
        </div>
      </div>
    </div>
  );
}
