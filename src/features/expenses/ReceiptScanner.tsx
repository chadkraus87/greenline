import { useRef, useState } from "react";
import { Camera, Loader2 } from "lucide-react";
import type { Category, Expense, ScannedReceipt } from "../../types";
import { buildMerchantIndex, suggestCategory, suggestionLabel, fallbackCategoryId } from "../../lib/autoCategorize";
import * as act from "../../db/actions";
import { useToast } from "../../hooks/useToasts";
import { offlineQueueAvailable, queueReceipt } from "../../pwa/offlineQueue";
import { useAuth } from "../../auth/AuthProvider";

export interface ReceiptPrefill {
  title: string; amount: string; date: string; merchant: string;
  categoryId: string; receiptPath: string; confidence: ScannedReceipt["confidence"];
  business?: boolean; businessPct?: number; taxCategory?: string;
  /** Where the category came from, shown to the user. */
  categorySource?: string;
}

const MAX_BYTES = 10 * 1024 * 1024;

/** Snap a receipt → upload → extract → hand a pre-filled expense back for review.
 *  Nothing is ever saved automatically; OCR gets totals wrong often enough that
 *  silent entry would quietly corrupt the ledger. */
export function ReceiptScanner({ categories, expenses = [], onScanned, style, compact }:
  { categories: Category[]; expenses?: Expense[]; onScanned: (p: ReceiptPrefill) => void; style?: React.CSSProperties;
    /** Icon button for the top bar. */
    compact?: boolean }) {
  const toast = useToast();
  const { session } = useAuth();
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  const matchCategory = (hint: string): string => {
    const h = hint.trim().toLowerCase();
    if (!h) return fallbackCategoryId(categories);
    const hit = categories.find((c) => c.name.toLowerCase() === h)
      ?? categories.find((c) => c.name.toLowerCase().includes(h) || h.includes(c.name.toLowerCase()));
    return hit?.id ?? fallbackCategoryId(categories);
  };

  /**
   * Keeps the photo when there's nothing to upload it to.
   *
   * Receipts get photographed on job sites with no signal, and the paper is
   * usually gone by the time anyone notices the scan failed. Scanning needs
   * the network, so a queued photo uploads later and lands in the Receipts
   * vault as unfiled, ready to attach to an expense.
   */
  const park = async (file: File, why: string) => {
    const userId = session?.user.id;
    if (!offlineQueueAvailable() || !userId) return false;
    try {
      await queueReceipt(file, userId);
      toast(`${why} — photo saved, it'll upload when you're back online`, "brass");
      return true;
    } catch {
      return false;
    }
  };

  const handle = async (file: File) => {
    if (file.size > MAX_BYTES) return toast("That image is over 10 MB — try a smaller photo.", "brass");
    if (!navigator.onLine && (await park(file, "You're offline"))) return;
    setBusy(true);
    let path = "";
    try {
      path = await act.uploadReceipt(file);
      const r = await act.scanReceipt(path);
      // Your own history wins; then the built-in merchant table; then the
      // model's category hint as a last resort.
      const learned = suggestCategory(r.merchant, buildMerchantIndex(expenses), categories);
      onScanned({
        title: r.merchant || "Receipt",
        amount: r.total ? String(r.total) : "",
        date: /^\d{4}-\d{2}-\d{2}$/.test(r.date) ? r.date : "",
        merchant: r.merchant,
        categoryId: learned.categoryId ?? matchCategory(r.categoryHint),
        receiptPath: path,
        confidence: r.confidence,
        business: learned.business,
        businessPct: learned.businessPct,
        taxCategory: learned.taxCategory,
        categorySource: suggestionLabel(learned),
      });
      if (r.confidence === "low") toast("Hard to read — double-check the amount and date", "brass");
      else if (!r.total) toast("Couldn't find a total — enter it manually", "brass");
    } catch (e) {
      // The upload itself failing is almost always connectivity; once it's
      // stored, a failed *scan* is recoverable from the vault, so only park
      // the photo when we never got it uploaded.
      if (!path && (await park(file, "Couldn't reach the server"))) return setBusy(false);
      toast((e as Error).message || "Scan failed", "clay");
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      {compact ? (
        <button className="gl-icon-btn" disabled={busy} onClick={() => inputRef.current?.click()}
          aria-label={busy ? "Reading receipt" : "Scan a receipt"} title="Scan a receipt">
          {busy ? <Loader2 aria-hidden size={18} className="gl-spin" /> : <Camera aria-hidden size={18} />}
        </button>
      ) : (
        <button className="gl-btn" style={style} disabled={busy} onClick={() => inputRef.current?.click()}>
          {busy ? <Loader2 size={16} className="gl-spin" aria-hidden /> : <Camera size={16} aria-hidden />}
          {busy ? "Reading receipt…" : "Scan receipt"}
        </button>
      )}
      <input ref={inputRef} type="file" accept="image/*,application/pdf" capture="environment" hidden
        onChange={(e) => { const f = e.target.files?.[0]; if (f) handle(f); e.target.value = ""; }} />
    </>
  );
}
