import { describe, it, expect } from "vitest";
import { buildTaxPackage, receiptManifest, receiptFileName } from "./taxPackage";
import { createZip, crc32, textBytes, safeName } from "./zip";
import type { AppData, Expense } from "../types";

const base = (over: Partial<AppData> = {}): AppData => ({
  settings: {
    theme: "dark", clock24: false, startBalance: 0, bufferFloor: 0, extraDebtBudget: 0,
    emergencyMonths: 3, rolloverBudgets: false, businessMode: true, mileageRate: 0.7,
    businessName: "Kraus Training",
  },
  categories: [{ id: "c-misc", name: "Miscellaneous", color: "#000", limit: 0 }],
  incomes: [], bills: [], expenses: [], goals: [], events: [],
  sinkingFunds: [], debts: [], mileage: [],
  ...over,
});

const exp = (o: Partial<Expense>): Expense => ({
  id: "aaaaaaaa-1111-2222-3333-444444444444", title: "t", amount: 100,
  categoryId: "c-misc", date: "2026-03-01", business: true, ...o,
});

const fileNamed = <T extends { name: string }>(files: T[], n: string): T => files.find((f) => f.name === n)!;

describe("buildTaxPackage", () => {
  const data = base({
    incomes: [{
      id: "i", name: "Personal training", amount: 500, frequency: "monthly",
      anchorDate: "2026-01-05", business: true,
      received: { "2026-01-05": true, "2026-02-05": true, "2025-11-05": true },
    }],
    expenses: [
      exp({ id: "e1", title: "Dumbbells", merchant: "Rogue", amount: 300, taxCategory: "supplies", date: "2026-01-20" }),
      exp({ id: "e2", title: "Client lunch", merchant: "Chipotle", amount: 40, taxCategory: "meals", date: "2026-02-02" }),
      exp({ id: "e3", title: "Phone", merchant: "Verizon", amount: 100, taxCategory: "utilities", businessPct: 60, date: "2026-02-15" }),
      exp({ id: "e4", title: "Mystery", merchant: "Unknown", amount: 75, date: "2026-03-03" }), // no tax line
      exp({ id: "e5", title: "Personal shoes", merchant: "Nike", amount: 90, business: false, date: "2026-03-04" }),
    ],
    mileage: [{ id: "m1", date: "2026-01-10", miles: 100, purpose: "Client session" }],
  });

  const files = buildTaxPackage(data, 2026);

  it("produces the expected five documents", () => {
    expect(files.map((f) => f.name)).toEqual([
      "00-README.txt", "01-summary.csv", "02-expenses-itemized.csv", "03-income.csv", "04-mileage.csv",
    ]);
  });

  it("states the accounting basis and the SE-tax caveat in the README", () => {
    const r = fileNamed(files, "00-README.txt").content;
    expect(r).toContain("CASH");
    expect(r).toContain("not tax advice");
    expect(r).toContain("wage base cap");
    expect(r).toContain("Kraus Training");
  });

  it("warns in the README when business expenses lack a Schedule C category", () => {
    expect(fileNamed(files, "00-README.txt").content).toContain("EXCLUDED from the deduction totals");
  });

  it("itemizes only business expenses, with per-row deductible amounts", () => {
    const rows = fileNamed(files, "02-expenses-itemized.csv").content.split("\r\n");
    expect(rows.some((r) => r.includes("Personal shoes"))).toBe(false); // personal excluded
    expect(rows.find((r) => r.includes("Chipotle"))).toContain("20.00");  // meals 50% of 40
    expect(rows.find((r) => r.includes("Verizon"))).toContain("60.00");   // 60% business use
    expect(rows.find((r) => r.includes("Unknown"))).toContain("UNCATEGORIZED");
  });

  it("links each itemized row to its receipt file when one exists", () => {
    const withReceipt = base({
      expenses: [exp({ id: "r1", merchant: "Rogue", taxCategory: "supplies", receiptPath: "uid/abc.jpg" })],
    });
    const row = fileNamed(buildTaxPackage(withReceipt, 2026), "02-expenses-itemized.csv").content;
    expect(row).toContain("receipts/2026-03-01_Rogue_r1.jpg");
  });

  it("counts only business income received inside the year", () => {
    const inc = fileNamed(files, "03-income.csv").content;
    expect(inc).toContain("2026-01-05");
    expect(inc).toContain("2026-02-05");
    expect(inc).not.toContain("2025-11-05");
    expect(inc).toContain("1000.00");
  });

  it("totals the mileage log at the configured rate", () => {
    const m = fileNamed(files, "04-mileage.csv").content;
    expect(m).toContain("Client session");
    expect(m).toContain("70.00");
  });

  it("excludes uncategorized spend from the deduction total but still discloses it", () => {
    const sum = fileNamed(files, "01-summary.csv").content;
    expect(sum).toContain("UNCATEGORIZED (excluded from deductions)");
    // 300 supplies + 20 meals + 60 phone + 70 mileage = 450; the $75 mystery is not counted
    expect(sum).toContain("450.00");
  });
});

describe("receiptManifest", () => {
  it("lists only business receipts for the year, with archive paths", () => {
    const data = base({
      expenses: [
        exp({ id: "a1", merchant: "Rogue", receiptPath: "uid/1.jpg", date: "2026-01-01" }),
        exp({ id: "a2", merchant: "Old", receiptPath: "uid/2.jpg", date: "2025-01-01" }),
        exp({ id: "a3", merchant: "Personal", receiptPath: "uid/3.jpg", business: false, date: "2026-01-01" }),
        exp({ id: "a4", merchant: "NoReceipt", date: "2026-01-01" }),
      ],
    });
    const m = receiptManifest(data, 2026);
    expect(m).toHaveLength(1);
    expect(m[0].path).toBe("uid/1.jpg");
    expect(m[0].name).toMatch(/^receipts\/2026-01-01_Rogue_/);
  });
});

describe("receiptFileName", () => {
  it("keeps the extension and sanitises the merchant", () => {
    expect(receiptFileName("2026-01-01", "Joe's / Diner", "abcdef1234", "uid/x.png"))
      .toBe("2026-01-01_Joe_s - Diner_abcdef12.png");
  });
});

describe("zip writer", () => {
  it("computes a known CRC32", () => {
    expect(crc32(textBytes("123456789"))).toBe(0xcbf43926);
  });

  it("writes a valid archive with the right signatures and entry count", async () => {
    const blob = createZip([
      { name: "a.txt", data: textBytes("hello") },
      { name: "receipts/b.txt", data: textBytes("world") },
    ]);
    const bytes = new Uint8Array(await blob.arrayBuffer());
    const view = new DataView(bytes.buffer);
    expect(view.getUint32(0, true)).toBe(0x04034b50); // local header
    // End-of-central-directory sits in the last 22 bytes and records 2 entries.
    const eocd = bytes.length - 22;
    expect(view.getUint32(eocd, true)).toBe(0x06054b50);
    expect(view.getUint16(eocd + 10, true)).toBe(2);
    expect(blob.type).toBe("application/zip");
  });

  it("stores file bytes verbatim", async () => {
    const payload = textBytes("hello");
    const bytes = new Uint8Array(await createZip([{ name: "a.txt", data: payload }]).arrayBuffer());
    expect(new TextDecoder().decode(bytes.slice(30 + 5, 30 + 5 + 5))).toBe("hello");
  });
});

describe("safeName", () => {
  it("strips path separators so an entry can't escape its folder", () => {
    expect(safeName("../../etc/passwd")).toBe("etc-passwd");
    expect(safeName("a/b\\c")).toBe("a-b-c");
  });
  it("falls back when nothing usable remains", () => {
    expect(safeName("///", "receipt")).toBe("receipt");
  });
});
