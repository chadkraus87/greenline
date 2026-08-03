import { describe, it, expect } from "vitest";
import { encryptBackup, decryptBackup, isEncryptedBackup, validateImport } from "./backup";
import type { AppData } from "../types";

const data: AppData = {
  settings: { theme: "dark", clock24: true, startBalance: 42.5, bufferFloor: 0, extraDebtBudget: 0, emergencyMonths: 3, rolloverBudgets: false },
  categories: [{ id: "misc", name: "Misc", color: "#8FA396", limit: 0 }],
  incomes: [], bills: [], expenses: [], goals: [], events: [], sinkingFunds: [], debts: [],
};

describe("encrypted backups (AES-256-GCM)", () => {
  it("round-trips with the right passphrase", async () => {
    const enc = await encryptBackup(data, "correct horse battery staple");
    expect(isEncryptedBackup(enc)).toBe(true);
    expect(enc.data).not.toContain("42.5");
    const dec = await decryptBackup(enc, "correct horse battery staple");
    expect(dec.settings.startBalance).toBe(42.5);
    expect(dec.categories[0].id).toBe("misc");
  });
  it("fails with the wrong passphrase", async () => {
    const enc = await encryptBackup(data, "right");
    await expect(decryptBackup(enc, "wrong")).rejects.toThrow();
  });
});

describe("import validation", () => {
  it("accepts valid data", () => {
    expect(() => validateImport(data)).not.toThrow();
  });
  it("rejects malformed payloads", () => {
    expect(() => validateImport({ bills: "nope" })).toThrow();
    expect(() => validateImport(null)).toThrow();
    expect(() => validateImport({ ...data, expenses: [{ id: "x", title: "a", amount: -5, categoryId: "c", date: "2026-07-01" }] })).toThrow();
  });
  it("rejects script-ish oversized names via length caps", () => {
    const bad = { ...data, categories: [{ id: "x", name: "a".repeat(500), color: "#123456", limit: 0 }] };
    expect(() => validateImport(bad)).toThrow();
  });
});
