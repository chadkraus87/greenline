import { useState } from "react";
import { Briefcase, Trash2, ShieldAlert } from "lucide-react";
import { Modal, Field } from "../components/ui";
import type { Expense, Settings } from "../types";
import { num } from "../lib/money";
import { patchSettings } from "../db/repo";
import { retentionGroups } from "../lib/taxReadiness";
import { purgeReceipts } from "../db/actions";
import { useToast } from "../hooks/useToasts";

/** Preferences, including the self-employment switch that reveals business features. */
export function SettingsModal({ settings, expenses = [], onClose }:
  { settings: Settings; expenses?: Expense[]; onClose: () => void }) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const groups = retentionGroups(expenses);
  const thisYear = new Date().getFullYear();

  // Only personal receipts can be cleared in bulk. Business receipts
  // substantiate a filed return, so they're deliberately not offered here.
  const purgePersonal = async (year: string, paths: string[]) => {
    const items = expenses
      .filter((e) => e.receiptPath && paths.includes(e.receiptPath))
      .map((e) => ({ id: e.id, receiptPath: e.receiptPath! }));
    if (items.length === 0) return;
    if (!window.confirm(`Delete ${items.length} personal receipt image(s) from ${year}? The expenses stay; only the images are removed. This can't be undone.`)) return;
    setBusy(true);
    try {
      const n = await purgeReceipts(items);
      toast(`Deleted ${n} receipt image${n === 1 ? "" : "s"}`);
    } catch (e) { toast((e as Error).message || "Couldn't delete", "clay"); }
    finally { setBusy(false); }
  };

  return (
    <Modal title="Settings" onClose={onClose}>
      <div className="gl-label" style={{ marginTop: 6 }}>Budget</div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        <Field label="Emergency fund target (months)">
          <input className="gl-input gl-mono" type="number" min="1" max="24" step="1"
            key={`em-${settings.emergencyMonths}`} defaultValue={settings.emergencyMonths}
            onBlur={(e) => patchSettings({ emergencyMonths: Math.max(1, Math.min(24, parseInt(e.target.value) || 3)) })} />
        </Field>
        <Field label="Cash buffer floor">
          <input className="gl-input gl-mono" type="number" min="0" step="0.01"
            key={`bf-${settings.bufferFloor}`} defaultValue={settings.bufferFloor || ""}
            onBlur={(e) => patchSettings({ bufferFloor: num(e.target.value) })} />
        </Field>
      </div>

      <div className="gl-label" style={{ marginTop: 16 }}>Self-employment</div>
      <label style={{ display: "flex", alignItems: "flex-start", gap: 8, cursor: "pointer", padding: "8px 0" }}>
        <input type="checkbox" checked={settings.businessMode} style={{ marginTop: 3 }}
          onChange={(e) => patchSettings({ businessMode: e.target.checked })} />
        <span>
          <span style={{ display: "flex", alignItems: "center", gap: 6, fontWeight: 500 }}>
            <Briefcase size={14} /> I have self-employment income
          </span>
          <span style={{ display: "block", fontSize: 12, color: "var(--dim)", marginTop: 2 }}>
            Adds business tagging on expenses, a mileage log, and a Schedule C tax summary.
            Leave off if all your income is W-2 wages.
          </span>
        </span>
      </label>

      {settings.businessMode && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginTop: 4 }}>
          <Field label="Business name (optional)">
            <input className="gl-input" key={`bn-${settings.businessName ?? ""}`} defaultValue={settings.businessName ?? ""}
              placeholder="e.g. Kraus Training" onBlur={(e) => patchSettings({ businessName: e.target.value.trim() || undefined })} />
          </Field>
          <Field label="Mileage rate ($ per mile)">
            <input className="gl-input gl-mono" type="number" min="0" max="10" step="0.001"
              key={`mr-${settings.mileageRate}`} defaultValue={settings.mileageRate}
              onBlur={(e) => patchSettings({ mileageRate: Math.max(0, Math.min(10, parseFloat(e.target.value) || 0)) })} />
          </Field>
        </div>
      )}

      {groups.length > 0 && (
        <>
          <div className="gl-label" style={{ marginTop: 16 }}>Receipt storage</div>
          <p style={{ fontSize: 12, color: "var(--dim)", marginTop: 0 }}>
            Business receipts back up a filed return and are conventionally kept for several years,
            so they can't be cleared in bulk here — delete those individually if you really mean to.
          </p>
          {groups.map((g) => (
            <div className="gl-row" key={g.year}>
              <span className="gl-mono" style={{ width: 46, color: "var(--dim)" }}>{g.year}</span>
              <div style={{ flex: 1, fontSize: 12.5 }}>
                {g.business.count > 0 && (
                  <span style={{ color: "var(--fern)" }}>
                    <ShieldAlert size={11} style={{ verticalAlign: "middle" }} /> {g.business.count} business
                  </span>
                )}
                {g.business.count > 0 && g.personal.count > 0 && <span style={{ color: "var(--dim)" }}> · </span>}
                {g.personal.count > 0 && <span style={{ color: "var(--dim)" }}>{g.personal.count} personal</span>}
              </div>
              {g.personal.count > 0 && Number(g.year) < thisYear && (
                <button className="gl-btn" style={{ padding: "3px 8px", fontSize: 11.5 }} disabled={busy}
                  onClick={() => purgePersonal(g.year, g.personal.paths)}>
                  <Trash2 size={11} /> Clear personal
                </button>
              )}
            </div>
          ))}
        </>
      )}

      {settings.businessMode && (
        <p style={{ fontSize: 11.5, color: "var(--dim)", marginTop: 8, marginBottom: 0 }}>
          The IRS standard mileage rate changes every year — check the current rate and update it here.
          Tax figures in Greenline are estimates for planning, not tax advice or a filed return.
        </p>
      )}
    </Modal>
  );
}
