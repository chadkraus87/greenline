import Dexie, { type EntityTable } from "dexie";
import type { Bill, CalEvent, Category, Debt, Expense, Goal, IncomeSource, SinkingFund } from "../types";

interface KV { key: string; value: unknown; }

export class GreenlineDB extends Dexie {
  categories!: EntityTable<Category, "id">;
  incomes!: EntityTable<IncomeSource, "id">;
  bills!: EntityTable<Bill, "id">;
  expenses!: EntityTable<Expense, "id">;
  goals!: EntityTable<Goal, "id">;
  events!: EntityTable<CalEvent, "id">;
  sinkingFunds!: EntityTable<SinkingFund, "id">;
  debts!: EntityTable<Debt, "id">;
  kv!: EntityTable<KV, "key">;

  constructor(name = "greenline") {
    super(name);
    this.version(1).stores({
      categories: "id",
      incomes: "id",
      bills: "id",
      expenses: "id, date, categoryId",
      goals: "id",
      events: "id, date",
      kv: "key",
    });
    // v2 adds sinking funds and debts. Existing tables carry over unchanged.
    this.version(2).stores({
      sinkingFunds: "id",
      debts: "id",
    });
  }
}

export const db = new GreenlineDB();
