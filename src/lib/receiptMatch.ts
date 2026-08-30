import type { Expense } from "../types";
import { merchantKey } from "./autoCategorize";

/**
 * Pairs a scanned receipt with the card charge for the same purchase.
 *
 * Scanning a receipt and later importing the statement produces two records
 * for one purchase — the ledger double-counts and the total is wrong. This
 * finds those pairs so they can be merged back into one.
 */

export interface ReceiptMatch {
  /** The record that carries the receipt image. */
  scanned: Expense;
  /** The imported charge for the same purchase. */
  charge: Expense;
  /** Days between the two — a card posts a day or two after the purchase. */
  dayGap: number;
  /** Higher is a safer merge. */
  confidence: "high" | "medium";
  reason: string;
}

const dayNumber = (d: string): number => Math.floor(Date.parse(`${d}T00:00:00Z`) / 86_400_000);

/** A card usually posts within a few days of the purchase. */
const MAX_DAY_GAP = 5;
/** Tips and pre-auth holds move the posted amount slightly. */
const amountsMatch = (a: number, b: number) => Math.abs(a - b) <= Math.max(0.02, a * 0.02);

/**
 * Candidate merges, most confident first.
 *
 * Each record is used at most once: two identical charges in the same week are
 * two real purchases, and silently folding them together loses money.
 */
export function findReceiptMatches(expenses: Expense[]): ReceiptMatch[] {
  const scanned = expenses.filter((e) => e.receiptPath);
  const charges = expenses.filter((e) => !e.receiptPath);
  if (scanned.length === 0 || charges.length === 0) return [];

  const candidates: ReceiptMatch[] = [];

  for (const s of scanned) {
    for (const c of charges) {
      if (s.id === c.id) continue;
      if (!amountsMatch(s.amount, c.amount)) continue;
      const dayGap = Math.abs(dayNumber(s.date) - dayNumber(c.date));
      if (!Number.isFinite(dayGap) || dayGap > MAX_DAY_GAP) continue;

      const sKey = merchantKey(s.merchant || s.title);
      const cKey = merchantKey(c.merchant || c.title);
      const sameMerchant = sKey.length > 2 && cKey.length > 2 && (sKey === cKey || cKey.includes(sKey) || sKey.includes(cKey));
      const exactAmount = Math.abs(s.amount - c.amount) < 0.005;

      // Same merchant is the strong signal. Without it, only an exact amount
      // on a near-identical date is worth proposing at all.
      if (!sameMerchant && !(exactAmount && dayGap <= 1)) continue;

      candidates.push({
        scanned: s,
        charge: c,
        dayGap,
        confidence: sameMerchant && exactAmount ? "high" : "medium",
        reason: sameMerchant
          ? `Same merchant, ${exactAmount ? "same amount" : "amount within 2%"}, ${dayGap === 0 ? "same day" : `${dayGap} day${dayGap === 1 ? "" : "s"} apart`}`
          : `Same amount ${dayGap === 0 ? "on the same day" : "a day apart"}, merchant names differ`,
      });
    }
  }

  candidates.sort((a, b) =>
    (a.confidence === b.confidence ? a.dayGap - b.dayGap : a.confidence === "high" ? -1 : 1));

  const usedScanned = new Set<string>();
  const usedCharge = new Set<string>();
  const matches: ReceiptMatch[] = [];
  for (const m of candidates) {
    if (usedScanned.has(m.scanned.id) || usedCharge.has(m.charge.id)) continue;
    usedScanned.add(m.scanned.id);
    usedCharge.add(m.charge.id);
    matches.push(m);
  }
  return matches;
}

/**
 * The single expense a matched pair should become.
 *
 * The imported charge survives: it is what actually cleared the account, so
 * its amount and date are the ones that reconcile against a statement. It
 * gains the receipt image and anything the scan knew that it doesn't —
 * merchant detail, business tagging — without overwriting what it already has.
 */
export function mergeMatch(m: ReceiptMatch): Expense {
  const { scanned: s, charge: c } = m;
  const notes = [c.notes, s.notes].filter(Boolean).join(" · ") || undefined;
  return {
    ...c,
    receiptPath: s.receiptPath,
    merchant: c.merchant || s.merchant,
    title: c.title || s.title,
    notes,
    business: c.business || s.business,
    businessPct: c.businessPct ?? s.businessPct,
    taxCategory: c.taxCategory ?? s.taxCategory,
  };
}
