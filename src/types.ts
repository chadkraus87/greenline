export type Frequency = "monthly" | "biweekly" | "weekly" | "quarterly" | "annual" | "once";
export type Priority = "high" | "normal" | "low";
export type Theme = "dark" | "light";

export interface Category { id: string; name: string; color: string; limit: number; }
export interface IncomeSource {
  id: string; name: string; amount: number; frequency: Frequency;
  anchorDate: string; received: Record<string, boolean>;
  /** % of this income to set aside for taxes (0–100). Reserved from "left to spend". */
  taxRate?: number;
  /** Self-employment / 1099 income, as opposed to W-2 wages. */
  business?: boolean;
}
export interface Bill {
  id: string; name: string; amount: number; categoryId: string; dueDay: number;
  priority: Priority; notes?: string; paused?: boolean; paid: Record<string, boolean>;
}
export interface Expense {
  id: string; title: string; amount: number; categoryId: string; date: string;
  merchant?: string; notes?: string;
  /** Storage path of the scanned receipt image, if this expense came from one. */
  receiptPath?: string;
  /** Self-employment: counts toward Schedule C rather than personal spending. */
  business?: boolean;
  /** Business-use share for mixed costs (a phone that's 60% business). */
  businessPct?: number;
  /** Schedule C line id — see lib/tax.ts SCHEDULE_C. */
  taxCategory?: string;
}

/** A business trip logged for the IRS standard mileage deduction. */
export interface Mileage {
  id: string; date: string; miles: number; purpose: string;
  from?: string; to?: string;
}

/** Fields extracted from a receipt photo — always reviewed by a human before saving. */
export interface ScannedReceipt {
  merchant: string; date: string; total: number; tax: number;
  categoryHint: string; confidence: "high" | "medium" | "low";
  lineItems: { description: string; amount: number }[];
}
export interface Goal { id: string; name: string; target: number; saved: number; monthly: number; color: string; }
export interface CalEvent {
  id: string; title: string; date: string; notes?: string; color: string;
  /** Owner of the event. Differs from the signed-in user for shared calendars. */
  ownerId?: string;
}

export type SharePermission = "read" | "write";
export type ShareStatus = "pending" | "accepted" | "declined" | "revoked";
/** A calendar-sharing link. `outgoing` = I own the calendar; `incoming` = shared with me. */
export interface CalendarShare {
  id: string; direction: "outgoing" | "incoming";
  otherId: string; otherEmail: string;
  permission: SharePermission; status: ShareStatus; createdAt: string;
}
/** A recurring irregular expense (insurance, taxes, registration) saved for monthly. */
export interface SinkingFund {
  id: string; name: string; total: number; cadenceMonths: number;
  dueDate: string; saved: number; color: string; categoryId?: string;
}
export interface Debt { id: string; name: string; balance: number; apr: number; minPayment: number; color: string; }
export interface Settings {
  theme: Theme; clock24: boolean; startBalance: number;
  /** Cash cushion you never want to dip below; forecast warns when it's crossed. */
  bufferFloor: number;
  /** Extra $/month beyond minimums applied to debt payoff plans. */
  extraDebtBudget: number;
  /** Emergency-fund target in months of average obligations (default 3). */
  emergencyMonths: number;
  /** Envelope budgeting: unspent category budget carries into next month. */
  rolloverBudgets: boolean;
  /** Reveals self-employment features. Off for W-2-only users. */
  businessMode: boolean;
  /** IRS standard mileage rate — changes annually, so it's user-editable. */
  mileageRate: number;
  businessName?: string;
}

export interface AppData {
  settings: Settings;
  categories: Category[];
  incomes: IncomeSource[];
  bills: Bill[];
  expenses: Expense[];
  goals: Goal[];
  events: CalEvent[];
  sinkingFunds: SinkingFund[];
  debts: Debt[];
  mileage: Mileage[];
}

export interface IncomeOcc { key: string; sourceId: string; name: string; amount: number; date: string; day: number; received: boolean; }
export interface BillOcc extends Bill { date: string; day: number; isPaid: boolean; overdue: boolean; }
export interface ForecastDay { day: number; date: string; net: number; balance: number; }

export interface MonthModel {
  ym: string; nDays: number; inMonth: boolean; todayYmd: string;
  incomeOccs: IncomeOcc[]; billOccs: BillOcc[]; expenses: Expense[]; events: CalEvent[];
  expectedIncome: number; actualIncome: number; billsTotal: number; billsPaidTotal: number;
  billsPaidCount: number; billsRemainingCount: number; expensesTotal: number; spent: number;
  remaining: number; goalMonthly: number; sinkingReserve: number; taxReserve: number; reserved: number;
  catSpend: Record<string, number>; savingsRate: number;
  forecast: ForecastDay[]; projectedEnd: number; firstDip: ForecastDay | null;
  firstBelowBuffer: ForecastDay | null; health: number;
}
