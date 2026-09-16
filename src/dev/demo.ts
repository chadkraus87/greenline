import type { AppData } from "../types";
import type { BankTransaction } from "../db/bank";

/**
 * Dev-only demo mode: `npm run dev`, then open `/?demo`.
 *
 * The signed-in app can't be looked at without a real account, which made
 * visual QA guesswork. This renders the whole app on fixture data instead.
 * `import.meta.env.DEV` is replaced with `false` in production builds, so this
 * flag is a constant there and every demo branch is removed from the bundle.
 */
export const DEMO: boolean =
  import.meta.env.DEV && typeof window !== "undefined" && new URLSearchParams(window.location.search).has("demo");

const ym = (offset = 0) => {
  const d = new Date(); d.setMonth(d.getMonth() + offset);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
};
const day = (n: number, offset = 0) => `${ym(offset)}-${String(n).padStart(2, "0")}`;

export function demoData(): AppData {
  const y = new Date().getFullYear();
  return {
    settings: {
      theme: "dark", clock24: false, startBalance: 2840, bufferFloor: 500, extraDebtBudget: 150,
      emergencyMonths: 3, rolloverBudgets: false, businessMode: true, mileageRate: 0.7,
      mileageRates: { [String(y)]: 0.7 }, lockedYears: [y - 1], businessName: "Demo Training",
    },
    categories: [
      { id: "housing", name: "Housing", color: "#46B380", limit: 1600 },
      { id: "utilities", name: "Utilities", color: "#5FA8D3", limit: 260 },
      { id: "food", name: "Food & Dining", color: "#D9A441", limit: 650 },
      { id: "transport", name: "Transportation", color: "#7A8FE0", limit: 300 },
      { id: "health", name: "Healthcare", color: "#C77DBA", limit: 150 },
      { id: "entertainment", name: "Entertainment", color: "#E0784C", limit: 120 },
      { id: "debt", name: "Debt", color: "#C4595E", limit: 0 },
      { id: "misc", name: "Miscellaneous", color: "#8FA396", limit: 200 },
    ],
    incomes: [
      { id: "i1", name: "Personal training clients", amount: 1450, frequency: "biweekly", anchorDate: day(5, -1), received: { [day(5)]: true }, taxRate: 25, business: true },
      { id: "i2", name: "Part-time gym payroll", amount: 980, frequency: "biweekly", anchorDate: day(12, -1), received: {} },
    ],
    bills: [
      { id: "b1", name: "Rent", amount: 1450, categoryId: "housing", dueDay: 1, priority: "high", paid: { [ym()]: true } },
      { id: "b2", name: "Electric", amount: 118, categoryId: "utilities", dueDay: 14, priority: "normal", paid: {} },
      { id: "b3", name: "Car payment", amount: 342, categoryId: "transport", dueDay: 20, priority: "high", paid: {} },
      { id: "b4", name: "Phone", amount: 85, categoryId: "utilities", dueDay: 24, priority: "normal", paid: {} },
      { id: "b5", name: "Streaming", amount: 17.99, categoryId: "entertainment", dueDay: 9, priority: "low", paid: { [ym()]: true } },
    ],
    expenses: [
      { id: "e1", title: "Groceries", merchant: "Trader Joe's", amount: 86.4, categoryId: "food", date: day(3) },
      { id: "e2", title: "Resistance bands", merchant: "Rogue Fitness", amount: 64.99, categoryId: "misc", date: day(4), business: true, businessPct: 100, taxCategory: "supplies", receiptPath: "demo/1.jpg" },
      { id: "e3", title: "Gas", merchant: "Shell", amount: 41.15, categoryId: "transport", date: day(6) },
      { id: "e4", title: "Client lunch", merchant: "Cava", amount: 32.5, categoryId: "food", date: day(8), business: true, businessPct: 100, taxCategory: "meals" },
      { id: "e5", title: "Coffee", merchant: "Starbucks", amount: 6.25, categoryId: "food", date: day(9) },
      { id: "e6", title: "CPR recertification", merchant: "Red Cross", amount: 95, categoryId: "misc", date: day(10), business: true, businessPct: 100, taxCategory: "taxes_licenses" },
      { id: "e7", title: "Streaming", merchant: "Netflix", amount: 17.99, categoryId: "entertainment", date: day(9, -1) },
      { id: "e8", title: "Streaming", merchant: "Netflix", amount: 17.99, categoryId: "entertainment", date: day(9, -2) },
      { id: "e9", title: "Streaming", merchant: "Netflix", amount: 17.99, categoryId: "entertainment", date: day(9, -3) },
    ],
    goals: [
      { id: "g1", name: "Emergency fund", target: 6000, saved: 2350, monthly: 250, color: "#46B380" },
      { id: "g2", name: "New squat rack", target: 1200, saved: 420, monthly: 100, color: "#D9A441" },
    ],
    events: [{ id: "ev1", title: "Quarterly taxes", date: day(15), color: "#D9A441" }],
    sinkingFunds: [{ id: "s1", name: "Car insurance", total: 960, cadenceMonths: 6, dueDate: day(1, 3), saved: 320, color: "#5FA8D3" }],
    debts: [{ id: "d1", name: "Credit card", balance: 2140, apr: 22.9, minPayment: 65, color: "#C4595E" }],
    mileage: [
      { id: "m1", date: day(4), miles: 18.4, purpose: "In-home client session", from: "Home", to: "Client" },
      { id: "m2", date: day(11), miles: 32, purpose: "Equipment pickup" },
    ],
  };
}

/** Bank inbox rows for demo mode. Kept here, not inline, so production builds drop them. */
export function demoBankTransactions(today: string): BankTransaction[] {
  return [
    { id: "d1", accountId: "a", accountName: "Checking", posted: today, amount: -54.12, description: "HOME DEPOT #412", payee: "Home Depot" },
    { id: "d2", accountId: "a", accountName: "Checking", posted: today, amount: -12.4, description: "SQ *BLUE BOTTLE", payee: "Blue Bottle" },
    { id: "d3", accountId: "a", accountName: "Checking", posted: today, amount: 1450, description: "CLIENT PAYMENT", payee: null },
    { id: "d4", accountId: "a", accountName: "Checking", posted: today, amount: -41.15, description: "SHELL OIL 5738", payee: "Shell" },
  ];
}
