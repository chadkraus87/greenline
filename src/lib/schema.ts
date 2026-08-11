import { z } from "zod";

const id = z.string().min(1).max(64);
const label = z.string().min(1).max(120);
const amount = z.number().finite().nonnegative().max(1e9);
const dateStr = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const boolMap = z.record(z.string(), z.boolean()).default({});
const color = z.string().regex(/^#[0-9a-fA-F]{6}$/).catch("#8FA396");

export const categorySchema = z.object({ id, name: label, color, limit: amount.default(0) });
export const incomeSchema = z.object({
  id, name: label, amount,
  frequency: z.enum(["monthly", "biweekly", "weekly", "quarterly", "annual", "once"]),
  anchorDate: dateStr, received: boolMap,
  taxRate: z.number().min(0).max(100).optional(),
  business: z.boolean().optional(),
});
export const billSchema = z.object({
  id, name: label, amount, categoryId: id, dueDay: z.number().int().min(1).max(31),
  priority: z.enum(["high", "normal", "low"]).default("normal"),
  notes: z.string().max(500).optional(), paused: z.boolean().optional(), paid: boolMap,
});
export const expenseSchema = z.object({
  id, title: label, amount, categoryId: id, date: dateStr,
  merchant: z.string().max(120).optional(), notes: z.string().max(500).optional(),
  receiptPath: z.string().max(400).optional(),
  business: z.boolean().optional(),
  businessPct: z.number().min(0).max(100).optional(),
  taxCategory: z.string().max(64).optional(),
});
export const goalSchema = z.object({ id, name: label, target: amount, saved: amount.default(0), monthly: amount.default(0), color });
export const eventSchema = z.object({ id, title: label, date: dateStr, notes: z.string().max(500).optional(), color });
export const sinkingFundSchema = z.object({
  id, name: label, total: amount, cadenceMonths: z.number().int().min(1).max(120).default(12),
  dueDate: dateStr, saved: amount.default(0), color, categoryId: id.optional(),
});
export const debtSchema = z.object({
  id, name: label, balance: amount, apr: z.number().min(0).max(100).default(0),
  minPayment: amount.default(0), color,
});
export const mileageSchema = z.object({
  id, date: dateStr, miles: z.number().finite().nonnegative().max(1e6),
  purpose: label, from: z.string().max(120).optional(), to: z.string().max(120).optional(),
});
export const settingsSchema = z.object({
  theme: z.enum(["dark", "light"]).default("dark"),
  clock24: z.boolean().default(false),
  startBalance: z.number().finite().min(-1e9).max(1e9).default(0),
  bufferFloor: amount.default(0),
  extraDebtBudget: amount.default(0),
  emergencyMonths: z.number().min(1).max(24).default(3),
  rolloverBudgets: z.boolean().default(false),
  businessMode: z.boolean().default(false),
  mileageRate: z.number().min(0).max(10).default(0.70),
  businessName: z.string().max(120).optional(),
});

export const appDataSchema = z.object({
  settings: settingsSchema,
  categories: z.array(categorySchema),
  incomes: z.array(incomeSchema),
  bills: z.array(billSchema),
  expenses: z.array(expenseSchema),
  goals: z.array(goalSchema),
  events: z.array(eventSchema),
  sinkingFunds: z.array(sinkingFundSchema).default([]),
  debts: z.array(debtSchema).default([]),
  mileage: z.array(mileageSchema).default([]),
});
export type ValidAppData = z.infer<typeof appDataSchema>;
