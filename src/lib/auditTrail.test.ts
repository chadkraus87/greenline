import { describe, it, expect } from "vitest";
import { describeAudit, type AuditRow } from "./auditTrail";

const row = (action: AuditRow["action"], at: string, before: Record<string, unknown> | null, after: Record<string, unknown> | null): AuditRow =>
  ({ action, changed_at: at, before, after });

describe("describeAudit", () => {
  const cats = (id: string) => ({ food: "Food & Dining", misc: "Miscellaneous" })[id] ?? "";

  it("lists what changed, newest first, in words", () => {
    const out = describeAudit([
      row("insert", "2026-09-01T10:00:00Z", null, { amount: 10, category_id: "food" }),
      row("update", "2026-09-02T10:00:00Z", { amount: "10.00", category_id: "food" }, { amount: 12.5, category_id: "misc" }),
    ], cats);
    expect(out[0].action).toBe("update");
    expect(out[0].changes).toEqual([
      { field: "Amount", from: "$10.00", to: "$12.50" },
      { field: "Category", from: "Food & Dining", to: "Miscellaneous" },
    ]);
    expect(out[1].action).toBe("insert");
  });

  it("treats a numeric string and a number as the same value", () => {
    // Postgres numeric can come back as a string; that isn't a change.
    expect(describeAudit([row("update", "2026-09-02T10:00:00Z", { amount: "10.00" }, { amount: 10 })])).toEqual([]);
  });

  it("describes receipt and business changes plainly", () => {
    const [e] = describeAudit([row("update", "2026-09-02T10:00:00Z",
      { receipt_path: null, business: false }, { receipt_path: "u/1.jpg", business: true })]);
    expect(e.changes).toEqual([
      { field: "Business", from: "No", to: "Yes" },
      { field: "Receipt", from: "—", to: "attached" },
    ]);
  });

  it("drops updates that changed nothing a person would see", () => {
    expect(describeAudit([row("update", "2026-09-02T10:00:00Z", { amount: 5, created_at: "a" }, { amount: 5, created_at: "b" })])).toEqual([]);
  });
});
