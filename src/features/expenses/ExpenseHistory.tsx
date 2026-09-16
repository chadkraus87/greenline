import { useEffect, useState } from "react";
import { History } from "lucide-react";
import type { Category } from "../../types";
import { supabase } from "../../lib/supabase";
import { describeAudit, type AuditEntry, type AuditRow } from "../../lib/auditTrail";
import { DEMO } from "../../dev/demo";

const fmt = new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" });

/**
 * Every change to one expense, from the database's own audit log.
 *
 * Collapsed by default and only fetched when opened — it's there for the
 * "why is this different from what I sent my accountant?" moment, not for
 * every edit.
 */
export function ExpenseHistory({ expenseId, categories }: { expenseId: string; categories: Category[] }) {
  const [open, setOpen] = useState(false);
  const [entries, setEntries] = useState<AuditEntry[] | null>(null);

  useEffect(() => {
    if (!open || entries || (import.meta.env.DEV && DEMO)) return;
    let alive = true;
    supabase.from("expense_audit").select("action,changed_at,before,after")
      .eq("expense_id", expenseId).order("changed_at", { ascending: false }).limit(50)
      .then(({ data }) => {
        if (!alive) return;
        const name = (id: string) => categories.find((c) => c.id === id)?.name ?? "";
        setEntries(describeAudit((data ?? []) as AuditRow[], name));
      });
    return () => { alive = false; };
  }, [open, entries, expenseId, categories]);

  return (
    <details className="gl-history" onToggle={(e) => setOpen((e.target as HTMLDetailsElement).open)}>
      <summary><History size={15} aria-hidden /> Change history</summary>
      {open && entries === null && !(import.meta.env.DEV && DEMO) && <div className="gl-step-sub" style={{ padding: "8px 0" }}>Loading…</div>}
      {entries?.length === 0 && (
        <div className="gl-step-sub" style={{ padding: "8px 0" }}>No changes recorded since history began.</div>
      )}
      {entries && entries.length > 0 && (
        <ol style={{ listStyle: "none", margin: "8px 0 0", padding: 0, display: "grid", gap: 8 }}>
          {entries.map((e, i) => (
            <li key={i} style={{ fontSize: 13.5 }}>
              <div style={{ color: "var(--dim)" }}>
                {fmt.format(new Date(e.at))} · {e.action === "insert" ? "Added" : e.action === "delete" ? "Deleted" : "Edited"}
              </div>
              {e.changes.map((c) => (
                <div key={c.field}>{c.field}: <span style={{ color: "var(--dim)" }}>{c.from}</span> → {c.to}</div>
              ))}
            </li>
          ))}
        </ol>
      )}
    </details>
  );
}
