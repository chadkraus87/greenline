import { lazy, Suspense, useEffect, useMemo, useRef, useState } from "react";
import {
  BarChart3, Check, ChevronLeft, ChevronRight, CircleDollarSign, DatabaseBackup, Landmark,
  Briefcase, Car, FileText, LayoutDashboard, LogOut, Moon, PiggyBank, Plus, Receipt, Search, Settings as SettingsIcon,
  RefreshCw, Share2, ShieldCheck, Sun, Umbrella, Undo2, Wallet, X, CircleUser,
} from "lucide-react";
import { patchSettings } from "./db/repo";
import type { Bill, Category, Debt, Expense, Goal, IncomeSource, Mileage, MonthModel, SinkingFund } from "./types";
import { computeMonth } from "./lib/forecast";
import { categoryRollover } from "./lib/insights";
import { MONTHS, ymd } from "./lib/dates";
import { quarterlyDueDates } from "./lib/tax";
import { money } from "./lib/money";
import { useNow } from "./hooks/useNow";
import { useToast } from "./hooks/useToasts";
import { useAppData } from "./hooks/useAppData";
import { useAppUpdate } from "./pwa/useAppUpdate";
import { notifyOnce } from "./pwa/notifications";
import { flushQueue, queuedCount } from "./pwa/offlineQueue";
import { uploadReceipt } from "./db/actions";
import { useShares } from "./hooks/useShares";
import { useAuth } from "./auth/AuthProvider";
import { AdminPanel } from "./features/admin/AdminPanel";
import { SharingModal } from "./features/sharing/SharingModal";
import { LiveClock, Stat, ViewHeader, Empty } from "./components/ui";
import { Menu, MenuItem } from "./components/Menu";
import { Runway } from "./components/Runway";
import { Calendar, DayDetail, EventForm } from "./features/calendar/CalendarFeature";
import { BillForm, BillsView } from "./features/bills/BillsFeature";
import { IncomeForm, IncomeView } from "./features/income/IncomeFeature";
import { ExpenseForm, ExpensesView } from "./features/expenses/ExpensesFeature";
import { ReceiptScanner, type ReceiptPrefill } from "./features/expenses/ReceiptScanner";
import { ImportModal } from "./features/expenses/ImportModal";
import { BulkCategorizeModal, countCategorizable } from "./features/expenses/BulkCategorizeModal";
import { ReceiptMatchModal } from "./features/expenses/ReceiptMatchModal";
import { findReceiptMatches } from "./lib/receiptMatch";
import { BudgetsView, CategoryForm } from "./features/budgets/BudgetsView";
import { GoalForm, GoalsView } from "./features/goals/GoalsFeature";
import { DebtForm, DebtsView } from "./features/debts/DebtsFeature";
import { SinkingFundForm, ReservesView } from "./features/reserves/ReservesFeature";
const ReportsView = lazy(() => import("./features/reports/ReportsView").then((m) => ({ default: m.ReportsView })));
import { BackupModal } from "./features/BackupModal";
import { SettingsModal } from "./features/SettingsModal";
import { ReceiptVault } from "./features/receipts/ReceiptVault";
import { MileageForm, MileageView } from "./features/mileage/MileageFeature";
const TaxView = lazy(() => import("./features/tax/TaxView").then((m) => ({ default: m.TaxView })));
import { toggleBillPaid, type UndoFn } from "./db/actions";

type ModalState =
  | { type: "bill"; data?: Bill } | { type: "income"; data?: IncomeSource }
  | { type: "expense"; data?: Expense; date?: string; prefill?: ReceiptPrefill } | { type: "goal"; data?: Goal }
  | { type: "event"; date?: string } | { type: "day"; date: string }
  | { type: "debt"; data?: Debt } | { type: "sinking"; data?: SinkingFund }
  | { type: "category"; data?: Category }
  | { type: "backup" } | { type: "admin" } | { type: "sharing" } | { type: "import" }
  | { type: "settings" } | { type: "mileage"; data?: Mileage } | { type: "bulkcat" }
  | { type: "receiptmatch" } | null;

const PERSONAL_TABS = [
  ["overview", "Overview", LayoutDashboard], ["bills", "Bills", Receipt],
  ["income", "Income", CircleDollarSign], ["expenses", "Expenses", Wallet],
  ["receipts", "Receipts", FileText],
  ["budgets", "Budgets", BarChart3], ["goals", "Goals", PiggyBank],
  ["reserves", "Reserves", Umbrella], ["debt", "Debt", Landmark], ["reports", "Reports", BarChart3],
] as const;
/**
 * Its own section, not extra tabs on the end of the personal ones.
 *
 * Household budgeting and running a business are two different jobs, and
 * mixing them into one strip of eleven tabs makes both harder to navigate.
 * Hidden entirely unless self-employment mode is on, so a W-2 user never sees
 * a section that has nothing to do with them.
 */
const BUSINESS_TABS = [
  ["tax", "Tax", Briefcase], ["mileage", "Mileage", Car],
] as const;
type Tab = (typeof PERSONAL_TABS)[number][0] | (typeof BUSINESS_TABS)[number][0];
type Section = "personal" | "business";

export default function App() {
  const toast = useToast();
  const now = useNow();
  const { profile, session, signOut } = useAuth();
  const { data, loading, reload: reloadData } = useAppData();
  const { checkNow } = useAppUpdate();
  const [refreshing, setRefreshing] = useState(false);

  /**
   * Pull fresh data now, and ask whether a newer build exists while we're at it.
   *
   * The spinner tracks the refetch only — a new version, if there is one,
   * announces itself through the update banner rather than reloading here.
   */
  const refresh = async () => {
    setRefreshing(true);
    checkNow();
    try {
      await reloadData();
      toast("Refreshed");
    } catch {
      toast("Couldn't refresh — check your connection", "clay");
    } finally {
      setRefreshing(false);
    }
  };
  const { shares } = useShares();
  const myId = session?.user.id;
  // Calendars other people have shared with me, and which of those I may edit.
  const sharedIn = shares.filter((s) => s.direction === "incoming" && s.status === "accepted");
  const writableCalendars = sharedIn.filter((s) => s.permission === "write").map((s) => ({ id: s.otherId, email: s.otherEmail }));
  const ownerEmailById = new Map(sharedIn.map((s) => [s.otherId, s.otherEmail]));
  const pendingInvites = shares.filter((s) => s.direction === "incoming" && s.status === "pending").length;
  const [view, setView] = useState(() => ({ y: new Date().getFullYear(), m: new Date().getMonth() }));
  const [tab, setTab] = useState<Tab>("overview");
  const [section, setSection] = useState<Section>("personal");
  const [modal, setModal] = useState<ModalState>(null);
  const [search, setSearch] = useState("");
  const [undo, setUndo] = useState<{ label: string; fn: UndoFn } | null>(null);
  const notified = useRef(new Set<string>());

  const settings = data?.settings ?? { theme: "dark" as const, clock24: false, startBalance: 0, bufferFloor: 0, extraDebtBudget: 0, emergencyMonths: 3, rolloverBudgets: false, businessMode: false, mileageRate: 0.7 };
  const categories = data?.categories ?? [];
  const incomes = data?.incomes ?? [];
  const bills = data?.bills ?? [];
  const expenses = data?.expenses ?? [];
  const goals = data?.goals ?? [];
  const events = data?.events ?? [];
  const sinkingFunds = data?.sinkingFunds ?? [];
  const debts = data?.debts ?? [];
  const mileage = data?.mileage ?? [];

  useEffect(() => { document.documentElement.dataset.theme = settings.theme; }, [settings.theme]);

  // Count of expenses the categorizer could improve, and receipts not yet filed.
  const categorizable = useMemo(
    () => countCategorizable(expenses, categories, settings.businessMode),
    [expenses, categories, settings.businessMode]
  );
  const [unfiledCount, setUnfiledCount] = useState(0);
  // Receipts that look like the same purchase as an imported charge.
  const duplicateReceipts = useMemo(() => findReceiptMatches(expenses).length, [expenses]);

  // Turning self-employment off while inside the business section would leave
  // the user on a tab that no longer exists.
  const activeSection: Section = settings.businessMode ? section : "personal";
  const visibleTabs = activeSection === "business" ? BUSINESS_TABS : PERSONAL_TABS;
  const activeTab: Tab = visibleTabs.some(([id]) => id === tab) ? tab : visibleTabs[0][0];

  const goToSection = (next: Section) => {
    setSection(next);
    // Land on the section's first tab rather than a blank panel.
    setTab(next === "business" ? BUSINESS_TABS[0][0] : PERSONAL_TABS[0][0]);
  };

  const dayStamp = `${now.getFullYear()}-${now.getMonth()}-${now.getDate()}-${now.getHours()}`;
  const month: MonthModel = useMemo(
    () => computeMonth({ settings, categories, incomes, bills, expenses, goals, events, sinkingFunds, debts, mileage }, view.y, view.m, now),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [settings, categories, incomes, bills, expenses, goals, events, sinkingFunds, debts, mileage, view.y, view.m, dayStamp]
  );

  // Envelope carryover — only walked when the setting is on (12-month lookback).
  const rollover = useMemo(
    () => (settings.rolloverBudgets && data
      ? categoryRollover({ settings, categories, incomes, bills, expenses, goals, events, sinkingFunds, debts, mileage }, view.y, view.m, now)
      : {}),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [settings.rolloverBudgets, data, categories, expenses, bills, view.y, view.m, dayStamp]
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
        // A toast only reaches someone already looking at the app, which is not
        // where a bill gets forgotten. Silently no-ops without permission.
        notifyOnce(`due-${b.id}-${b.date}`, "Bill due today", `${b.name} — ${money(b.amount)}`);
      }
      if (b.overdue && !notified.current.has(`od${key}`)) {
        notified.current.add(`od${key}`);
        toast(`${b.name} is overdue`, "clay");
        notifyOnce(`od-${b.id}-${month.ym}`, "Bill overdue", `${b.name} — ${money(b.amount)}`);
      }
    }
  }, [month, toast]);

  // Estimated-tax reminder. The Tax tab already shows a countdown, but only to
  // someone who opens it — and a missed quarterly payment accrues a penalty.
  useEffect(() => {
    if (!settings.businessMode) return;
    const today = ymd(now);
    for (const q of quarterlyDueDates(now.getFullYear())) {
      if (q.due < today) continue;
      const days = Math.round((Date.parse(`${q.due}T00:00:00`) - Date.parse(`${today}T00:00:00`)) / 86400000);
      if (days > 14) break;
      notifyOnce(`estq-${q.due}`, `${q.label} estimated tax due ${q.due}`,
        days === 0 ? "Due today." : `Due in ${days} day${days === 1 ? "" : "s"}.`);
      break;
    }
  }, [settings.businessMode, now]);

  // Receipts photographed with no signal upload themselves once it's back.
  useEffect(() => {
    let cancelled = false;
    const flush = async () => {
      if (!myId || !navigator.onLine || (await queuedCount(myId)) === 0) return;
      const { uploaded } = await flushQueue(uploadReceipt, myId);
      if (uploaded > 0 && !cancelled) {
        toast(`Uploaded ${uploaded} saved receipt${uploaded === 1 ? "" : "s"} — see Receipts`);
      }
    };
    void flush();
    window.addEventListener("online", flush);
    return () => { cancelled = true; window.removeEventListener("online", flush); };
  }, [toast, myId]);

  if (loading && !data) {
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
          <div style={{ fontSize: 11.5, color: "var(--dim)" }}>Private monthly budget · secured to your account</div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <LiveClock now={now} clock24={settings.clock24} onToggle={() => patchSettings({ clock24: !settings.clock24 })} />

          {/* Everyday controls stay visible and labelled; the rest live in the menu. */}
          <button className="gl-icon-btn" aria-label="Refresh" title="Refresh — refetch your data and check for a new version"
            disabled={refreshing} onClick={refresh}>
            <RefreshCw size={15} className={refreshing ? "gl-spin" : undefined} />
          </button>
          <button className="gl-icon-btn" aria-label={settings.theme === "dark" ? "Switch to light theme" : "Switch to dark theme"}
            title="Theme"
            onClick={() => patchSettings({ theme: settings.theme === "dark" ? "light" : "dark" })}>
            {settings.theme === "dark" ? <Sun size={15} /> : <Moon size={15} />}
          </button>
          <button className="gl-btn" style={{ fontSize: 12.5, padding: "5px 10px" }}
            title="Settings — self-employment, reminders, receipt storage"
            onClick={() => setModal({ type: "settings" })}>
            <SettingsIcon size={14} /> Settings
          </button>

          <Menu label="Account" icon={<CircleUser size={14} />} badge={pendingInvites}>
            {(close) => (
              <>
                <MenuItem icon={<Share2 size={14} />} badge={pendingInvites}
                  onClick={() => { close(); setModal({ type: "sharing" }); }}>
                  Calendar sharing
                </MenuItem>
                <MenuItem icon={<DatabaseBackup size={14} />}
                  onClick={() => { close(); setModal({ type: "backup" }); }}>
                  Backups
                </MenuItem>
                {profile?.role === "admin" && (
                  <MenuItem icon={<ShieldCheck size={14} />}
                    onClick={() => { close(); setModal({ type: "admin" }); }}>
                    Manage users
                  </MenuItem>
                )}
                <div className="gl-menu-sep" />
                <div className="gl-menu-note">Signed in as {profile?.email ?? ""}</div>
                <MenuItem icon={<LogOut size={14} />} onClick={() => { close(); signOut(); }}>
                  Sign out
                </MenuItem>
              </>
            )}
          </Menu>
        </div>
      </header>

      <div className="gl-toolbar">
        <button className="gl-icon-btn" onClick={() => nav(-1)} aria-label="Previous month"><ChevronLeft size={15} /></button>
        <span className="gl-display" style={{ fontSize: 18, minWidth: 148, textAlign: "center" }}>{MONTHS[view.m]} {view.y}</span>
        <button className="gl-icon-btn" onClick={() => nav(1)} aria-label="Next month"><ChevronRight size={15} /></button>
        {!month.inMonth && <button className="gl-btn" style={{ fontSize: 12 }} onClick={() => setView({ y: now.getFullYear(), m: now.getMonth() })}>Today</button>}
        <div style={{ flex: 1 }} />
        <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "var(--dim)" }}>
          Starting balance
          <input className="gl-input gl-mono" type="number" step="0.01" defaultValue={settings.startBalance || ""}
            key={`sb-${settings.startBalance}`} placeholder="0.00" style={{ width: 100, padding: "5px 8px" }}
            onBlur={(e) => patchSettings({ startBalance: parseFloat(e.target.value) || 0 })} />
        </label>
        <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "var(--dim)" }}
          title="Cash cushion you never want to dip below — the forecast warns when it's crossed">
          Buffer floor
          <input className="gl-input gl-mono" type="number" step="0.01" min="0" defaultValue={settings.bufferFloor || ""}
            key={`bf-${settings.bufferFloor}`} placeholder="0.00" style={{ width: 90, padding: "5px 8px" }}
            onBlur={(e) => patchSettings({ bufferFloor: Math.max(0, parseFloat(e.target.value) || 0) })} />
        </label>
        <div style={{ position: "relative" }}>
          <Search size={13} style={{ position: "absolute", left: 9, top: 9, color: "var(--dim)" }} />
          <input className="gl-input" placeholder="Search…" value={search} onChange={(e) => setSearch(e.target.value)}
            style={{ width: 150, padding: "6px 8px 6px 28px", fontSize: 13 }} aria-label="Search bills, income, expenses, receipts, and mileage" />
        </div>
      </div>

      <div style={{ marginBottom: 14 }}>
        <Runway forecast={month.forecast} todayYmd={month.todayYmd} inMonth={month.inMonth} />
      </div>

      <div className="gl-stats" style={{ marginBottom: 14 }}>
        <Stat label="Expected income" value={money(month.expectedIncome)} sub={`${money(month.actualIncome)} received`} tone="var(--fern)" />
        <Stat label="Spent so far" value={money(month.spent)} sub={`${month.billsPaidCount} bills paid · ${money(month.expensesTotal)} expenses`} />
        <Stat label="Left to spend" value={money(month.remaining)} tone={remainTone}
          sub={`after ${month.billsRemainingCount} bills + ${money(month.reserved)} reserved`} />
        <Stat label="Projected month-end" value={money(month.projectedEnd)} tone={month.projectedEnd < 0 ? "var(--clay)" : undefined}
          sub={month.firstDip ? `⚠ dips negative on day ${month.firstDip.day}` : month.firstBelowBuffer ? `⚠ below buffer on day ${month.firstBelowBuffer.day}` : `health score ${month.health}/100`} />
      </div>

      {month.inMonth && (
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16, fontSize: 11.5, color: "var(--dim)" }}>
          <span>Day {now.getDate()} of {month.nDays}</span>
          <div className="gl-track" style={{ flex: 1 }}><div className="gl-fill" style={{ width: `${dayProgress}%`, background: healthTone }} /></div>
          <span className="gl-mono" style={{ color: healthTone }}>{Math.round(dayProgress)}%</span>
        </div>
      )}

      {settings.businessMode && (
        <div className="gl-sections" role="tablist" aria-label="Section">
          <button className="gl-section" role="tab" aria-selected={activeSection === "personal"}
            onClick={() => goToSection("personal")}>
            <Wallet size={14} /> Personal
          </button>
          <button className="gl-section" role="tab" aria-selected={activeSection === "business"}
            onClick={() => goToSection("business")}>
            <Briefcase size={14} /> Business
          </button>
        </div>
      )}

      {activeSection === "business" && (
        <p className="gl-section-note">
          Self-employment only — Schedule C categories, mileage, and the export for your
          preparer. Your household budget is under <strong>Personal</strong>.
        </p>
      )}

      <nav role="tablist" aria-label={activeSection === "business" ? "Business views" : "Budget views"}
        className="gl-tabs">
        {visibleTabs.map(([id, label, Icon]) => (
          <button key={id} className="gl-tab" role="tab" aria-selected={activeTab === id} onClick={() => setTab(id)}>
            <Icon size={14} /> {label}
          </button>
        ))}
      </nav>

      {activeTab === "overview" && (
        <div className="gl-grid-main">
          <Calendar y={view.y} m={view.m} month={month} myId={myId} onDayClick={(ds) => setModal({ type: "day", date: ds })} />
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
                <ReceiptScanner categories={categories} expenses={expenses} style={{ fontSize: 12 }}
                  onScanned={(p) => setModal({ type: "expense", prefill: p, date: p.date || defaultExpenseDate })} />
                <button className="gl-btn" style={{ fontSize: 12 }} onClick={() => setModal({ type: "bill" })}><Plus size={13} /> Bill</button>
                <button className="gl-btn" style={{ fontSize: 12 }} onClick={() => setModal({ type: "income" })}><Plus size={13} /> Income</button>
              </div>
            </div>
          </div>
        </div>
      )}
      {activeTab === "bills" && (
        <>
          <div style={{ marginBottom: 10, textAlign: "right" }}>
            <button className="gl-btn primary" onClick={() => setModal({ type: "bill" })}><Plus size={14} /> Add bill</button>
          </div>
          <BillsView month={month} allBills={bills} categories={categories} search={q}
            onEdit={(b) => setModal({ type: "bill", data: bills.find((x) => x.id === b.id) })} onUndoable={onUndoable} />
        </>
      )}
      {activeTab === "income" && (
        <>
          <div style={{ marginBottom: 10, textAlign: "right" }}>
            <button className="gl-btn primary" onClick={() => setModal({ type: "income" })}><Plus size={14} /> Add source</button>
          </div>
          <IncomeView month={month} incomes={incomes} search={q}
            onEdit={(i) => setModal({ type: "income", data: i })} onUndoable={onUndoable} />
        </>
      )}
      {activeTab === "expenses" && (
        <ExpensesView month={month} categories={categories} allExpenses={expenses} search={q}
          categorizable={categorizable} onBulkCategorize={() => setModal({ type: "bulkcat" })}
          onAdd={() => setModal({ type: "expense", date: defaultExpenseDate })}
          onEdit={(e) => setModal({ type: "expense", data: e })}
          onScanned={(p) => setModal({ type: "expense", prefill: p, date: p.date || defaultExpenseDate })}
          onImport={() => setModal({ type: "import" })}
          onUndoable={onUndoable} />
      )}
      {activeTab === "receipts" && (
        <ReceiptVault expenses={expenses} categories={categories} businessMode={settings.businessMode} search={q}
          duplicateCount={duplicateReceipts} onReviewDuplicates={() => setModal({ type: "receiptmatch" })}
          onEdit={(e) => setModal({ type: "expense", data: e })}
          onUnfiledCount={setUnfiledCount}
          onFile={(path) => setModal({ type: "expense", date: defaultExpenseDate, prefill: {
            title: "", amount: "", date: "", merchant: "", categoryId: categories[0]?.id ?? "",
            receiptPath: path, confidence: "low",
          } })} />
      )}
      {activeTab === "mileage" && settings.businessMode && (
        <MileageView entries={mileage} settings={settings} year={view.y} search={q}
          onAdd={() => setModal({ type: "mileage" })}
          onEdit={(m) => setModal({ type: "mileage", data: m })} onUndoable={onUndoable} />
      )}
      {activeTab === "tax" && settings.businessMode && (
        <Suspense fallback={<div style={{ color: "var(--dim)", padding: 20 }}>Loading…</div>}>
          <TaxView data={{ settings, categories, incomes, bills, expenses, goals, events, sinkingFunds, debts, mileage }} year={view.y} unfiledReceipts={unfiledCount} />
        </Suspense>
      )}
      {activeTab === "budgets" && (
        <BudgetsView month={month} categories={categories} elapsedPct={dayProgress}
          rollover={rollover} rolloverOn={settings.rolloverBudgets}
          onAddCategory={() => setModal({ type: "category" })}
          onEditCategory={(c) => setModal({ type: "category", data: c })} />
      )}
      {activeTab === "goals" && (
        <>
          <div style={{ marginBottom: 10, textAlign: "right" }}>
            <button className="gl-btn primary" onClick={() => setModal({ type: "goal" })}><Plus size={14} /> Add goal</button>
          </div>
          <GoalsView goals={goals} onEdit={(g) => setModal({ type: "goal", data: g })} onUndoable={onUndoable} />
        </>
      )}
      {activeTab === "reserves" && (
        <ReservesView funds={sinkingFunds} onAdd={() => setModal({ type: "sinking" })}
          onEdit={(f) => setModal({ type: "sinking", data: f })} onUndoable={onUndoable} />
      )}
      {activeTab === "debt" && (
        <>
          <div style={{ marginBottom: 10, textAlign: "right" }}>
            <button className="gl-btn primary" onClick={() => setModal({ type: "debt" })}><Plus size={14} /> Add debt</button>
          </div>
          <DebtsView debts={debts} settings={settings} onEdit={(d) => setModal({ type: "debt", data: d })} onUndoable={onUndoable} />
        </>
      )}
      {activeTab === "reports" && (
        <Suspense fallback={<div style={{ color: "var(--dim)", padding: 20 }}>Loading charts…</div>}>
          <ReportsView month={month} categories={categories} data={{ settings, categories, incomes, bills, expenses, goals, events, sinkingFunds, debts, mileage }} y={view.y} m={view.m} now={now} />
        </Suspense>
      )}

      {modal?.type === "bill" && <BillForm initial={modal.data} categories={categories} onClose={() => setModal(null)} />}
      {modal?.type === "income" && <IncomeForm initial={modal.data} defaultDate={month.todayYmd} onClose={() => setModal(null)} />}
      {modal?.type === "expense" && <ExpenseForm initial={modal.data} defaultDate={modal.date ?? defaultExpenseDate} categories={categories} prefill={modal.prefill} businessMode={settings.businessMode} onClose={() => setModal(null)} />}
      {modal?.type === "goal" && <GoalForm initial={modal.data} onClose={() => setModal(null)} />}
      {modal?.type === "debt" && <DebtForm initial={modal.data} onClose={() => setModal(null)} />}
      {modal?.type === "sinking" && <SinkingFundForm initial={modal.data} categories={categories} defaultDate={defaultExpenseDate} onClose={() => setModal(null)} />}
      {modal?.type === "category" && <CategoryForm initial={modal.data} categories={categories} onClose={() => setModal(null)} />}
      {modal?.type === "event" && <EventForm defaultDate={modal.date ?? month.todayYmd} writableCalendars={writableCalendars} onClose={() => setModal(null)} />}
      {modal?.type === "day" && (
        <DayDetail date={modal.date} month={month} myId={myId} ownerEmailById={ownerEmailById} onClose={() => setModal(null)}
          onAddExpense={(d) => setModal({ type: "expense", date: d })}
          onAddEvent={(d) => setModal({ type: "event", date: d })}
          onEditExpense={(e) => setModal({ type: "expense", data: e })} />
      )}
      {modal?.type === "backup" && <BackupModal onClose={() => setModal(null)} />}
      {modal?.type === "admin" && <AdminPanel onClose={() => setModal(null)} />}
      {modal?.type === "sharing" && <SharingModal onClose={() => setModal(null)} />}
      {modal?.type === "settings" && <SettingsModal settings={settings} expenses={expenses} mileage={mileage} onClose={() => setModal(null)} />}
      {modal?.type === "receiptmatch" && <ReceiptMatchModal expenses={expenses} onClose={() => setModal(null)} />}
      {modal?.type === "bulkcat" && <BulkCategorizeModal expenses={expenses} categories={categories} businessMode={settings.businessMode} onClose={() => setModal(null)} />}
      {modal?.type === "mileage" && <MileageForm initial={modal.data} defaultDate={defaultExpenseDate} onClose={() => setModal(null)} />}
      {modal?.type === "import" && <ImportModal categories={categories} existing={expenses} businessMode={settings.businessMode} onClose={() => setModal(null)} />}

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
