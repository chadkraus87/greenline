import { useRef, useState } from "react";
import { Camera, Loader2 } from "lucide-react";
import type { Category, ScannedReceipt } from "../../types";
import * as act from "../../db/actions";
import { useToast } from "../../hooks/useToasts";

export interface ReceiptPrefill {
  title: string; amount: string; date: string; merchant: string;
  categoryId: string; receiptPath: string; confidence: ScannedReceipt["confidence"];
}

const MAX_BYTES = 10 * 1024 * 1024;

/** Snap a receipt → upload → extract → hand a pre-filled expense back for review.
 *  Nothing is ever saved automatically; OCR gets totals wrong often enough that
 *  silent entry would quietly corrupt the ledger. */
export function ReceiptScanner({ categories, onScanned, style }:
  { categories: Category[]; onScanned: (p: ReceiptPrefill) => void; style?: React.CSSProperties }) {
  const toast = useToast();
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  const matchCategory = (hint: string): string => {
    const h = hint.trim().toLowerCase();
    if (!h) return categories[0]?.id ?? "";
    const hit = categories.find((c) => c.name.toLowerCase() === h)
      ?? categories.find((c) => c.name.toLowerCase().includes(h) || h.includes(c.name.toLowerCase()));
    return hit?.id ?? categories[0]?.id ?? "";
  };

  const handle = async (file: File) => {
    if (file.size > MAX_BYTES) return toast("That image is over 10 MB — try a smaller photo.", "brass");
    setBusy(true);
    let path = "";
    try {
      path = await act.uploadReceipt(file);
      const r = await act.scanReceipt(path);
      onScanned({
        title: r.merchant || "Receipt",
        amount: r.total ? String(r.total) : "",
        date: /^\d{4}-\d{2}-\d{2}$/.test(r.date) ? r.date : "",
        merchant: r.merchant,
        categoryId: matchCategory(r.categoryHint),
        receiptPath: path,
        confidence: r.confidence,
      });
      if (r.confidence === "low") toast("Hard to read — double-check the amount and date", "brass");
      else if (!r.total) toast("Couldn't find a total — enter it manually", "brass");
    } catch (e) {
      toast((e as Error).message || "Scan failed", "clay");
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <button className="gl-btn" style={style} disabled={busy} onClick={() => inputRef.current?.click()}>
        {busy ? <Loader2 size={14} className="gl-spin" /> : <Camera size={14} />}
        {busy ? "Reading receipt…" : "Scan receipt"}
      </button>
      <input ref={inputRef} type="file" accept="image/*,application/pdf" capture="environment" hidden
        onChange={(e) => { const f = e.target.files?.[0]; if (f) handle(f); e.target.value = ""; }} />
    </>
  );
}
