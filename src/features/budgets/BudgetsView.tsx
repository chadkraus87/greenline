import type { Category, MonthModel } from "../../types";
import { ViewHeader } from "../../components/ui";
import { money, num } from "../../lib/money";
import * as act from "../../db/actions";

export function BudgetsView({ month, categories }: { month: MonthModel; categories: Category[] }) {
  return (
    <div className="gl-card">
      <ViewHeader title="Category budgets" sub="Set a monthly limit per category; spending tracks bills paid + expenses" />
      {categories.map((c) => {
        const spent = month.catSpend[c.id] || 0;
        const pct = c.limit > 0 ? Math.min(100, (spent / c.limit) * 100) : 0;
        const over = c.limit > 0 && spent > c.limit;
        return (
          <div className="gl-row" key={c.id}>
            <span style={{ width: 10, height: 10, borderRadius: 99, background: c.color, flexShrink: 0 }} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13.5 }}>
                <span style={{ fontWeight: 500 }}>{c.name}</span>
                <span className="gl-mono" style={{ color: over ? "var(--clay)" : "var(--dim)" }}>
                  {money(spent)}{c.limit > 0 ? ` / ${money(c.limit)}` : ""}
                </span>
              </div>
              {c.limit > 0 && (
                <div className="gl-track" style={{ marginTop: 5 }}>
                  <div className="gl-fill" style={{ width: `${pct}%`, background: over ? "var(--clay)" : c.color }} />
                </div>
              )}
            </div>
            <input key={`${c.id}-${c.limit}`} className="gl-input gl-mono" type="number" min="0" placeholder="limit" defaultValue={c.limit || ""}
              aria-label={`Monthly limit for ${c.name}`}
              onBlur={(e) => act.setCategoryLimit(c.id, num(e.target.value))}
              style={{ width: 92, padding: "5px 8px", fontSize: 12.5 }} />
          </div>
        );
      })}
    </div>
  );
}
