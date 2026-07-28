export type Frequency = "monthly" | "biweekly" | "weekly" | "quarterly" | "annual" | "once";
export type Priority = "high" | "normal" | "low";
export type Theme = "dark" | "light";

export interface Category { id: string; name: string; color: string; limit: number; }
export interface IncomeSource {
  id: string; name: string; amount: number; frequency: Frequency;
  anchorDate: string; received: Record<string, boolean>;
  /** % of this income to set aside for taxes (0–100). Reserved from "left to spend". */
  taxRate?: number;
}
export interface Bill {
  id: string; name: string; amount: number; categoryId: string; dueDay: number;
  priority: Priority; notes?: string; paused?: boolean; paid: Record<string, boolean>;
}
export interface Expense {
  id: string; title: string; amount: number; categoryId: string; date: string;
  merchant?: string; notes?: string;
}
export interface Goal { id: string; name: string; target: number; saved: number; monthly: number; color: string; }
export interface CalEvent { id: string; title: string; date: string; notes?: string; color: string; }
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
