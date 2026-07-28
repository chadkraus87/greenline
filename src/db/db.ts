import Dexie, { type EntityTable } from "dexie";
import type { Bill, CalEvent, Category, Expense, Goal, IncomeSource } from "../types";

interface KV { key: string; value: unknown; }

export class GreenlineDB extends Dexie {
  categories!: EntityTable<Category, "id">;
  incomes!: EntityTable<IncomeSource, "id">;
  bills!: EntityTable<Bill, "id">;
  expenses!: EntityTable<Expense, "id">;
  goals!: EntityTable<Goal, "id">;
  events!: EntityTable<CalEvent, "id">;
  kv!: EntityTable<KV, "key">;

  constructor(name = "greenline") {
    super(name);
    // v1 schema. Future migrations: this.version(2).stores({...}).upgrade(tx => ...)
    this.version(1).stores({
      categories: "id",
      incomes: "id",
      bills: "id",
      expenses: "id, date, categoryId",
      goals: "id",
      events: "id, date",
      kv: "key",
    });
  }
}

export const db = new GreenlineDB();
