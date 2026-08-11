import { Briefcase } from "lucide-react";
import { Modal, Field } from "../components/ui";
import type { Settings } from "../types";
import { num } from "../lib/money";
import { patchSettings } from "../db/repo";

/** Preferences, including the self-employment switch that reveals business features. */
export function SettingsModal({ settings, onClose }: { settings: Settings; onClose: () => void }) {
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

      {settings.businessMode && (
        <p style={{ fontSize: 11.5, color: "var(--dim)", marginTop: 8, marginBottom: 0 }}>
          The IRS standard mileage rate changes every year — check the current rate and update it here.
          Tax figures in Greenline are estimates for planning, not tax advice or a filed return.
        </p>
      )}
    </Modal>
  );
}
