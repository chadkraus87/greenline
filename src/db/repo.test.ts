import { describe, it, expect, beforeEach } from "vitest";
import { db } from "./db";
import { exportAll, importAll, getSettings, patchSettings, resetAll } from "./repo";

beforeEach(async () => { await resetAll(); });

describe("repo (IndexedDB via Dexie)", () => {
  it("seeds default categories and settings", async () => {
    expect(await db.categories.count()).toBe(8);
    expect((await getSettings()).theme).toBe("dark");
  });
  it("patches settings", async () => {
    await patchSettings({ startBalance: 999 });
    expect((await getSettings()).startBalance).toBe(999);
  });
  it("export -> import round-trips", async () => {
    await db.bills.add({ id: "b1", name: "Rent", amount: 1000, categoryId: "housing", dueDay: 1, priority: "normal", paid: {} });
    const snap = await exportAll();
    await resetAll();
    expect(await db.bills.count()).toBe(0);
    await importAll(snap);
    expect((await db.bills.get("b1"))?.name).toBe("Rent");
  });
  it("invalid import throws and leaves data intact", async () => {
    await db.bills.add({ id: "b1", name: "Rent", amount: 1000, categoryId: "housing", dueDay: 1, priority: "normal", paid: {} });
    await expect(importAll({ garbage: true })).rejects.toThrow();
    expect(await db.bills.count()).toBe(1);
  });
});
