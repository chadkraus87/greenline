import { lazy, Suspense, useEffect, useMemo, useRef, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import {
  BarChart3, Check, ChevronLeft, ChevronRight, CircleDollarSign, DatabaseBackup,
  LayoutDashboard, Moon, PiggyBank, Plus, Receipt, Search, Sun, Undo2, Wallet, X,
} from "lucide-react";
import { db } from "./db/db";
import { ensureSeeded, getSettings, patchSettings, DEFAULT_SETTINGS, DEFAULT_CATEGORIES } from "./db/repo";
import type { Bill, Expense, Goal, IncomeSource, MonthModel } from "./types";
import { computeMonth } from "./lib/forecast";
import { MONTHS } from "./lib/dates";
import { money } from "./lib/money";
import { useNow } from "./hooks/useNow";
import { useToast } from "./hooks/useToasts";
import { LiveClock, Stat, ViewHeader, Empty } from "./components/ui";
import { Runway } from "./components/Runway";
import { Calendar, DayDetail, EventForm } from "./features/calendar/CalendarFeature";
import { BillForm, BillsView } from "./features/bills/BillsFeature";
import { IncomeForm, IncomeView } from "./features/income/IncomeFeature";
import { ExpenseForm, ExpensesView } from "./features/expenses/ExpensesFeature";
import { BudgetsView } from "./features/budgets/BudgetsView";
import { GoalForm, GoalsView } from "./features/goals/GoalsFeature";
const ReportsView = lazy(() => import("./features/reports/ReportsView").then((m) => ({ default: m.ReportsView })));
import { BackupModal } from "./features/BackupModal";
import { toggleBillPaid, type UndoFn } from "./db/actions";

type ModalState =
  | { type: "bill"; data?: Bill } | { type: "income"; data?: IncomeSource }
  | { type: "expense"; data?: Expense; date?: string } | { type: "goal"; data?: Goal }
  | { type: "event"; date?: string } | { type: "day"; date: string }
  | { type: "backup" } | null;

const TABS = [
  ["overview", "Overview", LayoutDashboard], ["bills", "Bills", Receipt],
  ["income", "Income", CircleDollarSign], ["expenses", "Expenses", Wallet],
  ["budgets", "Budgets", BarChart3], ["goals", "Goals", PiggyBank], ["reports", "Reports", BarChart3],
] as const;
type Tab = (typeof TABS)[number][0];

export default function App() {
  const toast = useToast();
  const now = useNow();
  const [seeded, setSeeded] = useState(false);
  const [view, setView] = useState(() => ({ y: new Date().getFullYear(), m: new Date().getMonth() }));
  const [tab, setTab] = useState<Tab>("overview");
  const [modal, setModal] = useState<ModalState>(null);
  const [search, setSearch] = useState("");
  const [undo, setUndo] = useState<{ label: string; fn: UndoFn } | null>(null);
  const notified = useRef(new Set<string>());

  useEffect(() => { ensureSeeded().then(() => setSeeded(true)); }, []);

  const settings = useLiveQuery(getSettings, [], DEFAULT_SETTINGS);
  // Dexie returns rows in primary-key (alphabetical) order; present categories in the
  // canonical seed order so pickers default to Housing and Budgets read top-to-bottom.
  const categoriesRaw = useLiveQuery(() => db.categories.toArray(), [], []);
  const catOrder = DEFAULT_CATEGORIES.map((c) => c.id);
  const rank = (id: string) => { const i = catOrder.indexOf(id); return i === -1 ? catOrder.length : i; };
  const categories = useMemo(() => [...categoriesRaw].sort((a, b) => rank(a.id) - rank(b.id)), [categoriesRaw]);
  const incomes = useLiveQuery(() => db.incomes.toArray(), [], []);
  const bills = useLiveQuery(() => db.bills.toArray(), [], []);
  const expenses = useLiveQuery(() => db.expenses.toArray(), [], []);
  const goals = useLiveQuery(() => db.goals.toArray(), [], []);
  const events = useLiveQuery(() => db.events.toArray(), [], []);

  useEffect(() => { document.documentElement.dataset.theme = settings.theme; }, [settings.theme]);

  const dayStamp = `${now.getFullYear()}-${now.getMonth()}-${now.getDate()}-${now.getHours()}`;
  const month: MonthModel = useMemo(
    () => computeMonth({ settings, categories, incomes, bills, expenses, goals, events }, view.y, view.m, now),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [settings, categories, incomes, bills, expenses, goals, events, view.y, view.m, dayStamp]
  );

  // Clock-driven due-today / overdue alerts (once per bill per session)
  useEffect(() => {
    if (!month.inMonth) return;
    for (const b of month.billOccs) {
      if (b.isPaid) continue;
      const key = `${b.id}|${month.ym}`;
      if (b.date === month.todayYmd && !notified.current.has(`due${key}`)) {
        notified.current.add(`due${key}`);
        toast(`${b.name} (${money(b.amount)}) is due today`, "brass");
      }
      if (b.overdue && !notified.current.has(`od${key}`)) {
        notified.current.add(`od${key}`);
        toast(`${b.name} is overdue`, "clay");
      }
    }
  }, [month, toast]);

  if (!seeded) {
    return <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "100vh", color: "var(--dim)" }}>Loading your ledger…</div>;
  }

  const q = search.trim().toLowerCase();
  const nav = (dir: number) => setView((v) => { const d = new Date(v.y, v.m + dir, 1); return { y: d.getFullYear(), m: d.getMonth() }; });
  const onUndoable = (label: string, fn: UndoFn | null) => { if (fn) setUndo({ label, fn }); };
  const doUndo = async () => { if (undo) { await undo.fn(); toast("Restored"); setUndo(null); } };
  const upcoming = month.billOccs.filter((b) => !b.isPaid).sort((a, b) => a.day - b.day).slice(0, 6);
  const remainTone = month.remaining < 0 ? "var(--clay)" : "var(--fern)";
  const healthTone = month.health >= 80 ? "var(--fern)" : month.health >= 55 ? "var(--brass)" : "var(--clay)";
  const dayProgress = month.inMonth ? (now.getDate() / month.nDays) * 100 : 0;
  const defaultExpenseDate = month.inMonth ? month.todayYmd : `${month.ym}-01`;

  return (
    <div style={{ maxWidth: 1080, margin: "0 auto", padding: "18px 16px 60px" }}>
      <header style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap", marginBottom: 14 }}>
        <div>
          <h1 className="gl-display" style={{ fontSize: 24, color: "var(--fern)", margin: 0 }}>Greenline</h1>
          <div style={{ fontSize: 11.5, color: "var(--dim)" }}>Private monthly budget · everything stays on this device</div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <LiveClock now={now} clock24={settings.clock24} onToggle={() => patchSettings({ clock24: !settings.clock24 })} />
          <button className="gl-icon-btn" aria-label="Toggle theme"
            onClick={() => patchSettings({ theme: settings.theme === "dark" ? "light" : "dark" })}>
            {settings.theme === "dark" ? <Sun size={15} /> : <Moon size={15} />}
          </button>
          <button className="gl-icon-btn" aria-label="Backups" title="Backups" onClick={() => setModal({ type: "backup" })}><DatabaseBackup size={15} /></button>
        </div>
      </header>

      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", marginBottom: 14 }}>
        <button className="gl-icon-btn" onClick={() => nav(-1)} aria-label="Previous month"><ChevronLeft size={15} /></button>
        <span className="gl-display" style={{ fontSize: 18, minWidth: 148, textAlign: "center" }}>{MONTHS[view.m]} {view.y}</span>
        <button className="gl-icon-btn" onClick={() => nav(1)} aria-label="Next month"><ChevronRight size={15} /></button>
        {!month.inMonth && <button className="gl-btn" style={{ fontSize: 12 }} onClick={() => setView({ y: now.getFullYear(), m: now.getMonth() })}>Today</button>}
        <div style={{ flex: 1 }} />
        <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "var(--dim)" }}>
          Starting balance
          <input className="gl-input gl-mono" type="number" step="0.01" defaultValue={settings.startBalance || ""}
            key={`sb-${settings.startBalance}`} placeholder="0.00" style={{ width: 110, padding: "5px 8px" }}
            onBlur={(e) => patchSettings({ startBalance: parseFloat(e.target.value) || 0 })} />
        </label>
        <div style={{ position: "relative" }}>
          <Search size={13} style={{ position: "absolute", left: 9, top: 9, color: "var(--dim)" }} />
          <input className="gl-input" placeholder="Search…" value={search} onChange={(e) => setSearch(e.target.value)}
            style={{ width: 150, padding: "6px 8px 6px 28px", fontSize: 13 }} aria-label="Search bills, income, and expenses" />
        </div>
      </div>

      <div style={{ marginBottom: 14 }}>
        <Runway forecast={month.forecast} todayYmd={month.todayYmd} inMonth={month.inMonth} />
      </div>

      <div className="gl-stats" style={{ marginBottom: 14 }}>
        <Stat label="Expected income" value={money(month.expectedIncome)} sub={`${money(month.actualIncome)} received`} tone="var(--fern)" />
        <Stat label="Spent so far" value={money(month.spent)} sub={`${month.billsPaidCount} bills paid · ${money(month.expensesTotal)} expenses`} />
        <Stat label="Left to spend" value={money(month.remaining)} tone={remainTone}
          sub={`after ${month.billsRemainingCount} bills + ${money(month.goalMonthly)} savings`} />
        <Stat label="Projected month-end" value={money(month.projectedEnd)} tone={month.projectedEnd < 0 ? "var(--clay)" : undefined}
          sub={month.firstDip ? `⚠ dips negative on day ${month.firstDip.day}` : `health score ${month.health}/100`} />
      </div>

      {month.inMonth && (
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16, fontSize: 11.5, color: "var(--dim)" }}>
          <span>Day {now.getDate()} of {month.nDays}</span>
          <div className="gl-track" style={{ flex: 1 }}><div className="gl-fill" style={{ width: `${dayProgress}%`, background: healthTone }} /></div>
          <span className="gl-mono" style={{ color: healthTone }}>{Math.round(dayProgress)}%</span>
        </div>
      )}

      <nav role="tablist" style={{ display: "flex", gap: 4, marginBottom: 14, overflowX: "auto" }}>
        {TABS.map(([id, label, Icon]) => (
          <button key={id} className="gl-tab" role="tab" aria-selected={tab === id} onClick={() => setTab(id)}>
            <Icon size={14} /> {label}
          </button>
        ))}
      </nav>

      {tab === "overview" && (
        <div className="gl-grid-main">
          <Calendar y={view.y} m={view.m} month={month} onDayClick={(ds) => setModal({ type: "day", date: ds })} />
          <div style={{ display: "grid", gap: 14 }}>
            <div className="gl-card">
              <ViewHeader title="Up next" sub="Unpaid bills this month" />
              {upcoming.length === 0 && <Empty text="All bills handled. Nice." />}
              {upcoming.map((b) => (
                <div className="gl-row" key={b.id} style={{ padding: "8px 14px" }}>
                  <span style={{ width: 7, height: 7, borderRadius: 99, background: b.overdue ? "var(--clay)" : "var(--brass)", flexShrink: 0 }} />
                  <div style={{ flex: 1, fontSize: 13 }}>
                    {b.name}
                    <div style={{ fontSize: 11, color: b.overdue ? "var(--clay)" : "var(--dim)" }}>{b.overdue ? "overdue · " : ""}{MONTHS[view.m].slice(0, 3)} {b.day}</div>
                  </div>
                  <span className="gl-mono" style={{ fontSize: 13, fontWeight: 600 }}>{money(b.amount)}</span>
                  <button className="gl-icon-btn" style={{ width: 26, height: 26 }}
                    onClick={() => toggleBillPaid(b.id, month.ym)}
                    aria-label={`Mark ${b.name} paid`}><Check size={12} /></button>
                </div>
              ))}
            </div>
            <div className="gl-card" style={{ padding: 14 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                <span className="gl-display" style={{ fontSize: 15 }}>Budget health</span>
                <span className="gl-mono" style={{ fontSize: 22, fontWeight: 600, color: healthTone }}>{month.health}</span>
              </div>
              <div className="gl-track" style={{ marginTop: 8 }}><div className="gl-fill" style={{ width: `${month.health}%`, background: healthTone }} /></div>
              <p style={{ fontSize: 12, color: "var(--dim)", marginTop: 8, marginBottom: 0 }}>
                {month.health >= 80 ? "On track — limits respected and bills current." :
                 month.health >= 55 ? "Watch it — an overdue bill or a category running hot." :
                 "Off track — overdue bills or projected shortfall need attention."}
              </p>
              <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
                <button className="gl-btn primary" style={{ fontSize: 12 }} onClick={() => setModal({ type: "expense", date: defaultExpenseDate })}><Plus size={13} /> Expense</button>
                <button className="gl-btn" style={{ fontSize: 12 }} onClick={() => setModal({ type: "bill" })}><Plus size={13} /> Bill</button>
                <button className="gl-btn" style={{ fontSize: 12 }} onClick={() => setModal({ type: "income" })}><Plus size={13} /> Income</button>
              </div>
            </div>
          </div>
        </div>
      )}
      {tab === "bills" && (
        <>
          <div style={{ marginBottom: 10, textAlign: "right" }}>
            <button className="gl-btn primary" onClick={() => setModal({ type: "bill" })}><Plus size={14} /> Add bill</button>
          </div>
          <BillsView month={month} allBills={bills} categories={categories} search={q}
            onEdit={(b) => setModal({ type: "bill", data: bills.find((x) => x.id === b.id) })} onUndoable={onUndoable} />
        </>
      )}
      {tab === "income" && (
        <>
          <div style={{ marginBottom: 10, textAlign: "right" }}>
            <button className="gl-btn primary" onClick={() => setModal({ type: "income" })}><Plus size={14} /> Add source</button>
          </div>
          <IncomeView month={month} incomes={incomes} search={q}
            onEdit={(i) => setModal({ type: "income", data: i })} onUndoable={onUndoable} />
        </>
      )}
      {tab === "expenses" && (
        <ExpensesView month={month} categories={categories} search={q}
          onAdd={() => setModal({ type: "expense", date: defaultExpenseDate })}
          onEdit={(e) => setModal({ type: "expense", data: e })} onUndoable={onUndoable} />
      )}
      {tab === "budgets" && <BudgetsView month={month} categories={categories} />}
      {tab === "goals" && (
        <>
          <div style={{ marginBottom: 10, textAlign: "right" }}>
            <button className="gl-btn primary" onClick={() => setModal({ type: "goal" })}><Plus size={14} /> Add goal</button>
          </div>
          <GoalsView goals={goals} onEdit={(g) => setModal({ type: "goal", data: g })} onUndoable={onUndoable} />
        </>
      )}
      {tab === "reports" && (
        <Suspense fallback={<div style={{ color: "var(--dim)", padding: 20 }}>Loading charts…</div>}>
          <ReportsView month={month} categories={categories} />
        </Suspense>
      )}

      {modal?.type === "bill" && <BillForm initial={modal.data} categories={categories} onClose={() => setModal(null)} />}
      {modal?.type === "income" && <IncomeForm initial={modal.data} defaultDate={month.todayYmd} onClose={() => setModal(null)} />}
      {modal?.type === "expense" && <ExpenseForm initial={modal.data} defaultDate={modal.date ?? defaultExpenseDate} categories={categories} onClose={() => setModal(null)} />}
      {modal?.type === "goal" && <GoalForm initial={modal.data} onClose={() => setModal(null)} />}
      {modal?.type === "event" && <EventForm defaultDate={modal.date ?? month.todayYmd} onClose={() => setModal(null)} />}
      {modal?.type === "day" && (
        <DayDetail date={modal.date} month={month} onClose={() => setModal(null)}
          onAddExpense={(d) => setModal({ type: "expense", date: d })}
          onAddEvent={(d) => setModal({ type: "event", date: d })}
          onEditExpense={(e) => setModal({ type: "expense", data: e })} />
      )}
      {modal?.type === "backup" && <BackupModal onClose={() => setModal(null)} />}

      {undo && (
        <div className="gl-toast" style={{ bottom: 70 }}>
          <div style={{ borderLeftColor: "var(--brass)" }}>
            <span style={{ flex: 1 }}>{undo.label}</span>
            <button className="gl-btn" style={{ padding: "3px 9px", fontSize: 12 }} onClick={doUndo}><Undo2 size={12} /> Undo</button>
            <button className="gl-icon-btn" style={{ width: 24, height: 24 }} onClick={() => setUndo(null)} aria-label="Dismiss"><X size={12} /></button>
          </div>
        </div>
      )}
    </div>
  );
}
