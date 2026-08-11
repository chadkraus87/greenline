import { useMemo } from "react";
import { Download, AlertTriangle, Info } from "lucide-react";
import type { AppData } from "../../types";
import { ViewHeader, Empty, Stat } from "../../components/ui";
import { money } from "../../lib/money";
import { taxSummary, quarterlyDueDates, mileageCsvRows } from "../../lib/tax";
import { toCsv } from "../../lib/csv";
import { useToast } from "../../hooks/useToasts";

/** Schedule C picture for the year: what you earned, what's deductible, what to set aside. */
export function TaxView({ data, year }: { data: AppData; year: number }) {
  const toast = useToast();
  const s = useMemo(() => taxSummary(data, year), [data, year]);
  const quarters = quarterlyDueDates(year);
  const today = new Date().toISOString().slice(0, 10);

  const exportPackage = () => {
    const rows: (string | number)[][] = [
      [`Greenline tax summary — ${year}`, ""],
      [data.settings.businessName || "Self-employment", ""],
      ["", ""],
      ["Business income", s.businessIncome.toFixed(2)],
      ["", ""],
      ["Schedule C line", "Description", "Gross", "Deductible", "Count"],
      ...s.lines.map((l) => [l.line, l.label, l.gross.toFixed(2), l.deductible.toFixed(2), l.count]),
      ["9", "Mileage (standard rate)", "", s.mileageDeduction.toFixed(2), s.miles],
      ["", ""],
      ["Total deductions", s.totalDeductions.toFixed(2)],
      ["Net profit", s.netProfit.toFixed(2)],
      ["Estimated self-employment tax", s.selfEmploymentTax.toFixed(2)],
      ["", ""],
      ["NOTE", "Estimates for planning only — not tax advice or a filed return."],
      ["", ""],
      ["Mileage log", ""],
      ...mileageCsvRows(data.mileage.filter((m) => m.date.startsWith(String(year))), data.settings.mileageRate),
    ];
    const blob = new Blob([toCsv(rows)], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `greenline-tax-${year}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
    toast("Tax summary downloaded");
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

            <div style={{ padding: "12px 14px" }}>
              <button className="gl-btn primary" style={{ fontSize: 12 }} onClick={exportPackage}>
                <Download size={13} /> Export for my accountant
              </button>
            </div>
          </>
        )}
      </div>

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
