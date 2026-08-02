import { useRef, useState } from "react";
import { Download, Upload, FileSpreadsheet } from "lucide-react";
import { Modal, Field } from "../components/ui";
import { exportAll, importAll } from "../db/repo";
import { encryptBackup, decryptBackup, isEncryptedBackup } from "../lib/backup";
import { expensesCsv, billsCsv } from "../lib/csv";
import { ymd } from "../lib/dates";
import { useToast } from "../hooks/useToasts";

function download(name: string, content: string, type = "application/json") {
  const blob = new Blob([content], { type });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  URL.revokeObjectURL(a.href);
}

export function BackupModal({ onClose }: { onClose: () => void }) {
  const toast = useToast();
  const [pass, setPass] = useState("");
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const stamp = ymd(new Date());

  const exportPlain = async () => {
    download(`greenline-backup-${stamp}.json`, JSON.stringify(await exportAll(), null, 2));
    toast("Backup downloaded");
  };
  const exportExpensesCsv = async () => {
    download(`greenline-expenses-${stamp}.csv`, expensesCsv(await exportAll()), "text/csv");
    toast("Expenses CSV downloaded");
  };
  const exportBillsCsv = async () => {
    download(`greenline-recurring-${stamp}.csv`, billsCsv(await exportAll()), "text/csv");
    toast("Recurring bills CSV downloaded");
  };
  const exportEncrypted = async () => {
    if (pass.length < 8) return toast("Use a passphrase of at least 8 characters", "brass");
    setBusy(true);
    try {
      download(`greenline-backup-${stamp}.encrypted.json`, JSON.stringify(await encryptBackup(await exportAll(), pass)));
      toast("Encrypted backup downloaded");
    } finally { setBusy(false); }
  };
  const importFile = async (file: File) => {
    setBusy(true);
    try {
      const parsed: unknown = JSON.parse(await file.text());
      if (isEncryptedBackup(parsed)) {
        if (!pass) { toast("Enter the backup's passphrase first, then re-select the file", "brass"); return; }
        await importAll(await decryptBackup(parsed, pass));
      } else {
        await importAll(parsed);
      }
      toast("Backup restored");
      onClose();
    } catch {
      toast("Restore failed — wrong passphrase or not a valid Greenline backup", "clay");
    } finally { setBusy(false); }
  };

  return (
    <Modal title="Backups" onClose={onClose}>
      <p style={{ fontSize: 13, color: "var(--dim)", marginTop: 6 }}>
        Export a copy of your data to keep, or restore from one (restoring replaces your account's data). Encrypted backups use AES-256-GCM with a key derived from your passphrase.
      </p>
      <Field label="Passphrase (for encrypted export / restore)">
        <input className="gl-input" type="password" value={pass} onChange={(e) => setPass(e.target.value)}
          placeholder="At least 8 characters" autoComplete="off" />
      </Field>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 16 }}>
        <button className="gl-btn primary" onClick={exportEncrypted} disabled={busy}><Download size={14} /> Encrypted backup</button>
        <button className="gl-btn" onClick={exportPlain} disabled={busy}><Download size={14} /> Plain JSON</button>
        <button className="gl-btn" onClick={() => fileRef.current?.click()} disabled={busy}><Upload size={14} /> Restore…</button>
        <input ref={fileRef} type="file" accept="application/json" hidden
          onChange={(e) => { const f = e.target.files?.[0]; if (f) importFile(f); e.target.value = ""; }} />
      </div>
      <div style={{ borderTop: "1px solid var(--line)", marginTop: 16, paddingTop: 14 }}>
        <div className="gl-label" style={{ margin: "0 0 8px" }}>Export to spreadsheet (CSV)</div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button className="gl-btn" onClick={exportExpensesCsv} disabled={busy}><FileSpreadsheet size={14} /> Expenses (for taxes)</button>
          <button className="gl-btn" onClick={exportBillsCsv} disabled={busy}><FileSpreadsheet size={14} /> Recurring &amp; subscriptions</button>
        </div>
      </div>
    </Modal>
  );
}
