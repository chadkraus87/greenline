import { useRef, useState } from "react";
import { Download, Upload } from "lucide-react";
import { Modal, Field } from "../components/ui";
import { exportAll, importAll } from "../db/repo";
import { encryptBackup, decryptBackup, isEncryptedBackup } from "../lib/backup";
import { ymd } from "../lib/dates";
import { useToast } from "../hooks/useToasts";

function download(name: string, content: string) {
  const blob = new Blob([content], { type: "application/json" });
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
        Backups are files on your device — nothing is uploaded anywhere. Encrypted backups use AES-256-GCM with a key derived from your passphrase.
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
    </Modal>
  );
}
