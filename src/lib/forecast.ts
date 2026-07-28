import type { AppData, MonthModel, BillOcc, IncomeOcc, ForecastDay } from "../types";
import { ymKey, ymd, pad, daysInMonth, clampDay } from "./dates";
import { round2 } from "./money";
import { incomeOccurrences } from "./occurrences";

/** Full derived model for one calendar month: occurrences, totals, daily forecast, health score. */
export function computeMonth(data: AppData, y: number, m: number, today: Date): MonthModel {
  const ym = ymKey(y, m);
  const nDays = daysInMonth(y, m);
  const todayYmd = ymd(today);
  const inMonth = today.getFullYear() === y && today.getMonth() === m;

  const incomeOccs: IncomeOcc[] = data.incomes.flatMap((inc) =>
    incomeOccurrences(inc, y, m).map((o) => ({ ...o, received: !!inc.received?.[o.date] }))
  );
  const billOccs: BillOcc[] = data.bills
    .filter((b) => !b.paused)
    .map((b) => {
      const day = clampDay(y, m, b.dueDay);
      const date = `${ym}-${pad(day)}`;
      const isPaid = !!b.paid?.[ym];
      return { ...b, date, day, isPaid, overdue: !isPaid && date < todayYmd };
    });
  const expenses = data.expenses.filter((e) => e.date.startsWith(ym));
  const events = data.events.filter((e) => e.date.startsWith(ym));
  const goalMonthly = round2(data.goals.reduce((s, g) => s + (g.monthly || 0), 0));

  const expectedIncome = round2(incomeOccs.reduce((s, o) => s + o.amount, 0));
  const actualIncome = round2(incomeOccs.filter((o) => o.received).reduce((s, o) => s + o.amount, 0));
  const billsTotal = round2(billOccs.reduce((s, b) => s + b.amount, 0));
  const paidBills = billOccs.filter((b) => b.isPaid);
  const billsPaidTotal = round2(paidBills.reduce((s, b) => s + b.amount, 0));
  const expensesTotal = round2(expenses.reduce((s, e) => s + e.amount, 0));
  const spent = round2(billsPaidTotal + expensesTotal);
  const remaining = round2(expectedIncome - billsTotal - expensesTotal - goalMonthly);

  const catSpend: Record<string, number> = {};
  for (const e of expenses) catSpend[e.categoryId] = round2((catSpend[e.categoryId] || 0) + e.amount);
  for (const b of paidBills) catSpend[b.categoryId] = round2((catSpend[b.categoryId] || 0) + b.amount);

  let bal = data.settings.startBalance || 0;
  const forecast: ForecastDay[] = [];
  for (let d = 1; d <= nDays; d++) {
    const ds = `${ym}-${pad(d)}`;
    const inFlow = incomeOccs.filter((o) => o.day === d).reduce((s, o) => s + o.amount, 0);
    const outFlow =
      billOccs.filter((b) => b.day === d).reduce((s, b) => s + b.amount, 0) +
      expenses.filter((e) => e.date === ds).reduce((s, e) => s + e.amount, 0);
    bal = round2(bal + inFlow - outFlow);
    forecast.push({ day: d, date: ds, net: round2(inFlow - outFlow), balance: bal });
  }
  const projectedEnd = forecast[nDays - 1]?.balance ?? (data.settings.startBalance || 0);
  const firstDip = forecast.find((f) => f.balance < 0) ?? null;

  let health = 100;
  for (const c of data.categories) {
    const s = catSpend[c.id] || 0;
    if (c.limit > 0 && s > c.limit) health -= Math.min(15, Math.round(((s - c.limit) / c.limit) * 30));
  }
  health -= billOccs.filter((b) => b.overdue).length * 8;
  if (projectedEnd < 0) health -= 15;
  health = Math.max(0, Math.min(100, health));

  return {
    ym, nDays, inMonth, todayYmd, incomeOccs, billOccs, expenses, events,
    expectedIncome, actualIncome, billsTotal, billsPaidTotal,
    billsPaidCount: paidBills.length, billsRemainingCount: billOccs.length - paidBills.length,
    expensesTotal, spent, remaining, goalMonthly, catSpend, forecast, projectedEnd, firstDip, health,
  };
}
