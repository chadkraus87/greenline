/**
 * Turns raw expense_audit rows into readable change lines.
 *
 * The database stores whole before/after row snapshots (so nothing is lost);
 * this picks out the fields a person — or a preparer asking "why did this
 * change?" — actually cares about.
 */

export interface AuditRow {
  action: "insert" | "update" | "delete";
  changed_at: string;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
}

export interface AuditChange { field: string; from: string; to: string }
export interface AuditEntry { at: string; action: AuditRow["action"]; changes: AuditChange[] }

const FIELDS: [key: string, label: string][] = [
  ["amount", "Amount"], ["date", "Date"], ["title", "Title"], ["merchant", "Merchant"],
  ["category_id", "Category"], ["business", "Business"], ["business_pct", "Business use"],
  ["tax_category", "Schedule C line"], ["receipt_path", "Receipt"], ["notes", "Notes"],
];

function show(key: string, v: unknown, categoryName: (id: string) => string): string {
  if (v === null || v === undefined || v === "") return "—";
  switch (key) {
    case "amount": return `$${Number(v).toFixed(2)}`;
    case "business": return v ? "Yes" : "No";
    case "business_pct": return `${Number(v)}%`;
    case "category_id": return categoryName(String(v)) || "—";
    case "receipt_path": return "attached";
    default: return String(v);
  }
}

export function describeAudit(rows: AuditRow[], categoryName: (id: string) => string = () => ""): AuditEntry[] {
  return [...rows]
    .sort((a, b) => b.changed_at.localeCompare(a.changed_at))
    .map((r) => {
      if (r.action !== "update") return { at: r.changed_at, action: r.action, changes: [] };
      const changes: AuditChange[] = [];
      for (const [key, label] of FIELDS) {
        const from = r.before?.[key];
        const to = r.after?.[key];
        // numeric columns come back as strings sometimes; compare what a person would see
        if (show(key, from, categoryName) === show(key, to, categoryName)) continue;
        changes.push({ field: label, from: show(key, from, categoryName), to: show(key, to, categoryName) });
      }
      return { at: r.changed_at, action: r.action, changes };
    })
    // An update that only touched bookkeeping columns isn't worth a line.
    .filter((e) => e.action !== "update" || e.changes.length > 0);
}
