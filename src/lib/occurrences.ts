import type { IncomeSource } from "../types";
import { ymd, daysInMonth, clampDay, parseYmd } from "./dates";

export interface RawOcc { key: string; sourceId: string; name: string; amount: number; date: string; day: number; }

/** All payment occurrences of an income source that fall inside month (y, m). */
export function incomeOccurrences(inc: IncomeSource, y: number, m: number): RawOcc[] {
  const out: RawOcc[] = [];
  const push = (d: Date) =>
    out.push({ key: `${inc.id}|${ymd(d)}`, sourceId: inc.id, name: inc.name, amount: inc.amount, date: ymd(d), day: d.getDate() });
  const anchor = inc.anchorDate ? parseYmd(inc.anchorDate) : new Date(y, m, 1);
  const mStart = new Date(y, m, 1);
  const mEnd = new Date(y, m, daysInMonth(y, m));

  switch (inc.frequency) {
    case "monthly":
      push(new Date(y, m, clampDay(y, m, anchor.getDate())));
      return out;
    case "once":
      if (anchor >= mStart && anchor <= mEnd) push(anchor);
      return out;
    case "quarterly":
    case "annual": {
      const step = inc.frequency === "quarterly" ? 3 : 12;
      const diff = (y - anchor.getFullYear()) * 12 + (m - anchor.getMonth());
      if (diff >= 0 && diff % step === 0) push(new Date(y, m, clampDay(y, m, anchor.getDate())));
      return out;
    }
    case "weekly":
    case "biweekly": {
      const stepDays = inc.frequency === "weekly" ? 7 : 14;
      let d = new Date(anchor);
      if (d > mEnd) return out;
      while (d < mStart) d = new Date(d.getFullYear(), d.getMonth(), d.getDate() + stepDays);
      while (d <= mEnd) {
        push(d);
        d = new Date(d.getFullYear(), d.getMonth(), d.getDate() + stepDays);
      }
      return out;
    }
  }
}
