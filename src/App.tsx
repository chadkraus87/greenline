import { lazy, Suspense, useEffect, useMemo, useRef, useState } from "react";
import { fallbackCategoryId } from "./lib/autoCategorize";
import {
  BarChart3, Check, ChevronLeft, ChevronRight, CircleDollarSign, DatabaseBackup, Landmark,
  Briefcase, Car, FileText, LayoutDashboard, LogOut, Moon, PiggyBank, Plus, Receipt, Search, Settings as SettingsIcon,
  RefreshCw, Share2, ShieldCheck, Sun, Umbrella, Undo2, Wallet, X, CircleUser,
  AlertTriangle, Upload, MoreHorizontal,
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
import { useBankInbox } from "./hooks/useBankInbox";
import { listNewBankTransactions, type BankTransaction } from "./db/bank";
import { DEMO, demoBankTransactions } from "./dev/demo";
import { useAuth } from "./auth/AuthProvider";
import { AdminPanel } from "./features/admin/AdminPanel";
import { SharingModal } from "./features/sharing/SharingModal";
import { LiveClock, Stat, ViewHeader, Empty, Modal, PageTitleContext } from "./components/ui";
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
import { AttachReceiptModal } from "./features/receipts/AttachReceiptModal";
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
  | { type: "receiptmatch" } | { type: "more" } | { type: "bankreview"; rows: BankTransaction[] }
  | { type: "attach"; path: string; uploadedAt: string | null } | null;

const PERSONAL_TABS = [
  ["overview", "Overview", LayoutDashboard], ["bills", "Bills", Receipt],
  ["income", "Income", CircleDollarSign], ["expenses", "Expenses", Wallet],
  ["receipts", "Receipts", FileText],
  ["budgets", "Budgets", BarChart3], ["goals", "Goals", PiggyBank],
  ["reserves", "Reserves", Umbrella], ["debt", "Debt", Landmark], ["reports", "Reports", BarChart3],
] as const;
/**
 * Business views live in their own sidebar group, not as extra tabs on the end
 * of the budget ones — household budgeting and running a business are two
 * different jobs. Hidden entirely unless self-employment mode is on, so a W-2
 * user never sees a section that has nothing to do with them.
 */
const BUSINESS_TABS = [
  ["tax", "Tax", Briefcase], ["mileage", "Mileage", Car],
] as const;
type Tab = (typeof PERSONAL_TABS)[number][0] | (typeof BUSINESS_TABS)[number][0];

/** Phones get a bottom bar: at most five labelled destinations (the rest live under More). */
const BOTTOM_TABS: Tab[] = ["overview", "bills", "expenses", "receipts"];

/** 1 → "1st", 22 → "22nd". */
const ordinal = (n: number) => {
  const s = ["th", "st", "nd", "rd"], v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
};

const PAGE_SUB: Partial<Record<Tab, string>> = {
  bills: "What's due, what's paid, and what's coming up",
  income: "Every paycheck and deposit on its schedule",
  expenses: "Everything you've spent, categorized",
  receipts: "Scanned receipts, searchable and ready for tax time",
  budgets: "Limits by category and how fast you're using them",
  goals: "What you're saving toward",
  reserves: "Money set aside for irregular bills",
  debt: "Balances and the fastest way to clear them",
  reports: "Trends across months",
  tax: "Schedule C picture for the year, ready for your preparer",
  mileage: "Business trips for the standard mileage deduction",
};

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
  const bank = useBankInbox(Boolean(session));
  const myId = session?.user.id;
  // Calendars other people have shared with me, and which of those I may edit.
  const sharedIn = shares.filter((s) => s.direction === "incoming" && s.status === "accepted");
  const writableCalendars = sharedIn.filter((s) => s.permission === "write").map((s) => ({ id: s.otherId, email: s.otherEmail }));
  const ownerEmailById = new Map(sharedIn.map((s) => [s.otherId, s.otherEmail]));
  const pendingInvites = shares.filter((s) => s.direction === "incoming" && s.status === "pending").length;
  const [view, setView] = useState(() => ({ y: new Date().getFullYear(), m: new Date().getMonth() }));
  const [tab, setTab] = useState<Tab>(() => (window.location.hash.slice(1) || "overview") as Tab);
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

  useEffect(() => {
    document.documentElement.dataset.theme = settings.theme;
    // Keep the browser/OS chrome (mobile address bar, PWA title bar) in the same paper or ink.
    document.querySelector('meta[name="theme-color"]')?.setAttribute("content", settings.theme === "light" ? "#F3F0E8" : "#0A100E");
  }, [settings.theme]);

  // Count of expenses the categorizer could improve, and receipts not yet filed.
  const categorizable = useMemo(
    () => countCategorizable(expenses, categories, settings.businessMode),
    [expenses, categories, settings.businessMode]
  );
  const [unfiledCount, setUnfiledCount] = useState(0);
  // Receipts that look like the same purchase as an imported charge.
  const duplicateReceipts = useMemo(() => findReceiptMatches(expenses).length, [expenses]);

  // Turning self-employment off while on a business view would leave the user
  // on a page that no longer exists.
  const isBusinessTab = BUSINESS_TABS.some(([id]) => id === tab);
  const knownTab = [...PERSONAL_TABS, ...BUSINESS_TABS].some(([id]) => id === tab);
  const activeTab: Tab = !knownTab || (isBusinessTab && !settings.businessMode) ? "overview" : tab;
  const allTabs = [...PERSONAL_TABS, ...(settings.businessMode ? BUSINESS_TABS : [])];
  // Navigation is hash-based: links set #view, and this follows the URL — so the
  // Back button, bookmarks and "open in new tab" all work without a router.
  useEffect(() => {
    const onHash = () => {
      const id = (window.location.hash.slice(1) || "overview") as Tab;
      setTab(id);
      setModal(null);
      window.scrollTo({ top: 0 });
      requestAnimationFrame(() => document.getElementById("main")?.focus({ preventScroll: true }));
    };
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

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
    return (
      <div className="gl-content" aria-busy="true" aria-label="Loading your budget">
        <div className="gl-skeleton" style={{ height: 34, width: 220, marginBottom: 20 }} />
        <div className="gl-skeleton" style={{ height: 330, marginBottom: 16 }} />
        <div className="gl-stats">{[0, 1, 2].map((i) => <div key={i} className="gl-skeleton" style={{ height: 92 }} />)}</div>
      </div>
    );
  }

  const q = search.trim().toLowerCase();
  const nav = (dir: number) => setView((v) => { const d = new Date(v.y, v.m + dir, 1); return { y: d.getFullYear(), m: d.getMonth() }; });
  const onUndoable = (label: string, fn: UndoFn | null) => { if (fn) setUndo({ label, fn }); };
  const doUndo = async () => { if (undo) { await undo.fn(); toast("Restored"); setUndo(null); } };
  const upcoming = month.billOccs.filter((b) => !b.isPaid).sort((a, b) => a.day - b.day).slice(0, 6);
  const healthTone = month.health >= 80 ? "var(--fern)" : month.health >= 55 ? "var(--brass)" : "var(--clay)";
  const dayProgress = month.inMonth ? (now.getDate() / month.nDays) * 100 : 0;
  const defaultExpenseDate = month.inMonth ? month.todayYmd : `${month.ym}-01`;

  // Nothing to project from yet. "$0.00 left, on track" would be false comfort,
  // so a new account gets told what the app needs instead.
  const isNewAccount = incomes.length === 0 && bills.length === 0 && expenses.length === 0;
  const pageTitle = allTabs.find(([id]) => id === activeTab)?.[1] ?? "Overview";
  const dayOfMonth = now.getDate();
  const status =
    month.firstDip ? { kind: "bad", icon: <AlertTriangle size={15} aria-hidden />, text: `Goes negative on the ${ordinal(month.firstDip.day)}` } :
    month.firstBelowBuffer ? { kind: "warn", icon: <AlertTriangle size={15} aria-hidden />, text: `Dips below your floor on the ${ordinal(month.firstBelowBuffer.day)}` } :
    month.health >= 80 ? { kind: "ok", icon: <Check size={15} aria-hidden />, text: "On track" } :
    { kind: "warn", icon: <AlertTriangle size={15} aria-hidden />, text: "Watch your spending" };

  const navButton = (id: Tab, label: string, Icon: typeof Wallet, badge = 0) => (
    <a key={id} href={`#${id}`} className="gl-nav-item" aria-current={activeTab === id ? "page" : undefined}
      onClick={() => { if (activeTab === id) setModal(null); }}>
      <Icon size={18} aria-hidden /> <span>{label}</span>
      {badge > 0 && <span className="gl-badge" aria-label={`${badge} to review`}>{badge}</span>}
    </a>
  );
  const badgeFor = (id: Tab) => (id === "receipts" ? duplicateReceipts : id === "expenses" ? categorizable + bank.newCount : 0);

  const reviewBank = async () => {
    try {
      const rows = (import.meta.env.DEV && DEMO)
        ? demoBankTransactions(month.todayYmd)
        : await listNewBankTransactions();
      setModal({ type: "bankreview", rows });
    } catch (e) {
      toast((e as Error).message || "Couldn't load bank transactions", "clay");
    }
  };

  const accountItems = (close: () => void) => (
    <>
      <MenuItem icon={<Share2 aria-hidden size={16} />} badge={pendingInvites} onClick={() => { close(); setModal({ type: "sharing" }); }}>Calendar sharing</MenuItem>
      <MenuItem icon={<DatabaseBackup aria-hidden size={16} />} onClick={() => { close(); setModal({ type: "backup" }); }}>Backups</MenuItem>
      {profile?.role === "admin" && (
        <MenuItem icon={<ShieldCheck aria-hidden size={16} />} onClick={() => { close(); setModal({ type: "admin" }); }}>Manage users</MenuItem>
      )}
      <MenuItem icon={settings.theme === "dark" ? <Sun aria-hidden size={16} /> : <Moon aria-hidden size={16} />}
        onClick={() => { close(); void patchSettings({ theme: settings.theme === "dark" ? "light" : "dark" }); }}>
        {settings.theme === "dark" ? "Light theme" : "Dark theme"}
      </MenuItem>
      <div className="gl-menu-sep" />
      <div className="gl-menu-note">Signed in as {profile?.email ?? ""}</div>
      <MenuItem icon={<LogOut aria-hidden size={16} />} onClick={() => { close(); signOut(); }}>Sign out</MenuItem>
    </>
  );

  return (
    <div className="gl-app">
      <a className="gl-skip" href="#main">Skip to content</a>

      <aside className="gl-sidebar" aria-label="Sidebar">
        <div className="gl-brand">
          <span className="gl-display gl-brand-name">Greenline</span>
          <span className="gl-brand-sub">{settings.businessName || "Private monthly budget"}</span>
        </div>
        <nav aria-label="Primary">
          <div className="gl-nav-group">
            <div className="gl-nav-group-label">Budget</div>
            {PERSONAL_TABS.map(([id, label, Icon]) => navButton(id, label, Icon, badgeFor(id)))}
          </div>
          {settings.businessMode && (
            <div className="gl-nav-group">
              <div className="gl-nav-group-label"><Briefcase size={14} aria-hidden /> Business</div>
              {BUSINESS_TABS.map(([id, label, Icon]) => navButton(id, label, Icon))}
            </div>
          )}
        </nav>
        <div className="gl-sidebar-foot">
          <button className="gl-nav-item" onClick={() => setModal({ type: "settings" })}>
            <SettingsIcon size={18} aria-hidden /> <span>Settings</span>
          </button>
          <Menu label={profile?.email ?? "Account"} icon={<CircleUser size={18} aria-hidden />} badge={pendingInvites} up block>
            {accountItems}
          </Menu>
          <LiveClock now={now} clock24={settings.clock24} onToggle={() => patchSettings({ clock24: !settings.clock24 })} />
        </div>
      </aside>

      <div className="gl-main">
        <header className="gl-topbar">
          <span className="gl-display gl-topbar-brand">Greenline</span>
          <div className="gl-month" role="group" aria-label="Month">
            <button className="gl-icon-btn" onClick={() => nav(-1)} aria-label="Previous month"><ChevronLeft aria-hidden size={18} /></button>
            <span className="gl-display gl-month-label" aria-live="polite">{MONTHS[view.m].slice(0, 3)} {view.y}</span>
            <button className="gl-icon-btn" onClick={() => nav(1)} aria-label="Next month"><ChevronRight aria-hidden size={18} /></button>
          </div>
          {!month.inMonth && (
            <button className="gl-btn quiet" onClick={() => setView({ y: now.getFullYear(), m: now.getMonth() })}>Today</button>
          )}
          <div className="gl-search gl-hide-sm">
            <Search size={15} aria-hidden />
            <input className="gl-input" type="search" placeholder="Search…" value={search} onChange={(e) => setSearch(e.target.value)}
              aria-label="Search bills, income, expenses, receipts, and mileage" />
          </div>
          <div style={{ flex: 1 }} className="gl-hide-lg" />
          <button className="gl-icon-btn" aria-label="Refresh" title="Refresh your data and check for a new version"
            disabled={refreshing} onClick={refresh}>
            <RefreshCw aria-hidden size={18} className={refreshing ? "gl-spin" : undefined} />
          </button>
          <ReceiptScanner categories={categories} expenses={expenses} compact
            onScanned={(p) => setModal({ type: "expense", prefill: p, date: p.date || defaultExpenseDate })} />
          <Menu label="Add" icon={<Plus size={18} aria-hidden />}>
            {(close) => (
              <>
                <MenuItem icon={<Wallet aria-hidden size={16} />} onClick={() => { close(); setModal({ type: "expense", date: defaultExpenseDate }); }}>Expense</MenuItem>
                <MenuItem icon={<Receipt aria-hidden size={16} />} onClick={() => { close(); setModal({ type: "bill" }); }}>Bill</MenuItem>
                <MenuItem icon={<CircleDollarSign aria-hidden size={16} />} onClick={() => { close(); setModal({ type: "income" }); }}>Income</MenuItem>
                <MenuItem icon={<Upload aria-hidden size={16} />} onClick={() => { close(); setModal({ type: "import" }); }}>Import transactions</MenuItem>
                {settings.businessMode && (
                  <MenuItem icon={<Car aria-hidden size={16} />} onClick={() => { close(); setModal({ type: "mileage" }); }}>Business trip</MenuItem>
                )}
              </>
            )}
          </Menu>
          <span className="gl-hide-lg">
            <Menu label="Account" icon={<CircleUser size={18} aria-hidden />} badge={pendingInvites} iconOnly>{accountItems}</Menu>
          </span>
        </header>

        <PageTitleContext.Provider value={activeTab === "overview" ? "" : pageTitle}>
        <main id="main" tabIndex={-1} className="gl-content" style={{ outline: "none" }}>
          <div className="gl-page-head">
            <div>
              <h1 className="gl-display gl-page-title">{activeTab === "overview" ? `${MONTHS[view.m]} ${view.y}` : pageTitle}</h1>
              <p className="gl-page-sub" style={{ margin: "4px 0 0" }}>
                {activeTab === "overview"
                  ? month.inMonth ? `Day ${dayOfMonth} of ${month.nDays}` : "Projected from your scheduled bills and income"
                  : PAGE_SUB[activeTab]}
              </p>
            </div>
            <div className="gl-search gl-show-sm" style={{ maxWidth: "none", flex: "1 1 100%" }}>
              <Search size={15} aria-hidden />
              <input className="gl-input" type="search" placeholder="Search…" value={search} onChange={(e) => setSearch(e.target.value)}
                aria-label="Search bills, income, expenses, receipts, and mileage" />
            </div>
          </div>

          {activeTab === "overview" && isNewAccount && (
            <section className="gl-card gl-hero" aria-labelledby="gl-start-title">
              <h2 id="gl-start-title" className="gl-display" style={{ fontSize: 28 }}>Let's draw your green line</h2>
              <p className="gl-hero-sub" style={{ maxWidth: 560, fontSize: 15 }}>
                Greenline projects your balance day by day from what's scheduled to come in and go out.
                Give it those two things and it can tell you what's genuinely left to spend.
              </p>
              <ol className="gl-steps" style={{ marginTop: 18 }}>
                <li>
                  <span className="gl-step-mark" aria-hidden>1</span>
                  <div style={{ flex: 1 }}>
                    <strong>Add your income</strong>
                    <div className="gl-step-sub">Paychecks, client payments — whatever arrives on a schedule.</div>
                  </div>
                  <button className="gl-btn primary" onClick={() => setModal({ type: "income" })}><Plus size={16} aria-hidden /> Add income</button>
                </li>
                <li>
                  <span className="gl-step-mark" aria-hidden>2</span>
                  <div style={{ flex: 1 }}>
                    <strong>Add your regular bills</strong>
                    <div className="gl-step-sub">Rent, utilities, phone, subscriptions.</div>
                  </div>
                  <button className="gl-btn" onClick={() => setModal({ type: "bill" })}><Plus size={16} aria-hidden /> Add a bill</button>
                </li>
                <li>
                  <span className="gl-step-mark" aria-hidden>3</span>
                  <div style={{ flex: 1 }}>
                    <strong>Connect your bank <span style={{ color: "var(--dim)", fontWeight: 400 }}>— optional</span></strong>
                    <div className="gl-step-sub">Transactions arrive on their own, read-only, for you to review.</div>
                  </div>
                  <button className="gl-btn" onClick={() => setModal({ type: "settings" })}><Landmark size={16} aria-hidden /> Set up</button>
                </li>
              </ol>
            </section>
          )}

          {activeTab === "overview" && !isNewAccount && (
            <div className="gl-stack">
              <section className="gl-card gl-hero" aria-labelledby="gl-hero-kicker">
                <div className="gl-hero-top">
                  <div>
                    <div id="gl-hero-kicker" className="gl-hero-kicker">Left to spend in {MONTHS[view.m]}</div>
                    <div className="gl-display gl-hero-figure gl-num" style={{ color: month.remaining < 0 ? "var(--danger)" : "var(--text)" }}>
                      {money(month.remaining)}
                    </div>
                    <div className="gl-hero-sub">
                      after {month.billsRemainingCount} upcoming bill{month.billsRemainingCount === 1 ? "" : "s"}
                      {month.reserved > 0 && <> and {money(month.reserved)} set aside</>}
                    </div>
                  </div>
                  <span className={`gl-pill ${status.kind}`}>{status.icon} {status.text}</span>
                </div>

                <Runway forecast={month.forecast} todayYmd={month.todayYmd} inMonth={month.inMonth}
                  bufferFloor={settings.bufferFloor} monthLabel={`${MONTHS[view.m]} ${view.y}`} />

                <div className="gl-hero-params">
                  <label className="gl-param">
                    Balance on the 1st
                    <input className="gl-input gl-mono" type="number" step="0.01" inputMode="decimal"
                      defaultValue={settings.startBalance || ""} key={`sb-${settings.startBalance}`} placeholder="0.00" autoComplete="off"
                      onBlur={(e) => patchSettings({ startBalance: parseFloat(e.target.value) || 0 })} />
                  </label>
                  <label className="gl-param" title="The forecast warns when your balance would dip under this">
                    Keep at least
                    <input className="gl-input gl-mono" type="number" step="0.01" min="0" inputMode="decimal"
                      defaultValue={settings.bufferFloor || ""} key={`bf-${settings.bufferFloor}`} placeholder="0.00" autoComplete="off"
                      onBlur={(e) => patchSettings({ bufferFloor: Math.max(0, parseFloat(e.target.value) || 0) })} />
                  </label>
                  <span className="gl-param" style={{ marginLeft: "auto" }}>
                    Health <strong className="gl-mono" style={{ color: healthTone }}>{month.health}</strong>/100
                  </span>
                </div>
              </section>

              {bank.newCount > 0 && (
                <div className="gl-card gl-inbox" role="status">
                  <Landmark size={18} color="var(--accent)" aria-hidden />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <strong>{bank.newCount} new transaction{bank.newCount === 1 ? "" : "s"} from your bank</strong>
                    <div style={{ fontSize: 13.5, color: "var(--dim)" }}>Already categorized — review and add them in one go.</div>
                  </div>
                  <button className="gl-btn primary" onClick={reviewBank}>Review</button>
                </div>
              )}

              <div className="gl-stats">
                <Stat label="Expected income" value={money(month.expectedIncome)} sub={`${money(month.actualIncome)} received so far`} />
                <Stat label="Spent so far" value={money(month.spent)} sub={`${month.billsPaidCount} bills paid · ${money(month.expensesTotal)} in expenses`} />
                <Stat label="Month-end balance" value={money(month.projectedEnd)} tone={month.projectedEnd < 0 ? "var(--danger)" : undefined}
                  sub="if everything goes as scheduled" />
              </div>

              <div className="gl-grid-main">
                <Calendar y={view.y} m={view.m} month={month} myId={myId} onDayClick={(ds) => setModal({ type: "day", date: ds })} />
                <div className="gl-card">
                  <ViewHeader title="Up next" sub={upcoming.length ? "Unpaid bills this month" : undefined} />
                  {upcoming.length === 0 && <Empty text="Every bill this month is paid." />}
                  {upcoming.map((b) => (
                    <div className="gl-row" key={b.id}>
                      <span style={{ width: 8, height: 8, borderRadius: 99, background: b.overdue ? "var(--danger)" : "var(--attention)", flexShrink: 0 }} aria-hidden />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontWeight: 500 }}>{b.name}</div>
                        <div style={{ fontSize: 13, color: b.overdue ? "var(--danger)" : "var(--dim)" }}>
                          {b.overdue ? "Overdue · " : "Due "}{MONTHS[view.m].slice(0, 3)} {b.day}
                        </div>
                      </div>
                      <span className="gl-mono" style={{ fontWeight: 600 }}>{money(b.amount)}</span>
                      <button className="gl-icon-btn" onClick={() => toggleBillPaid(b.id, month.ym)} aria-label={`Mark ${b.name} paid`} title="Mark paid">
                        <Check aria-hidden size={17} />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
      {activeTab === "bills" && (
        <>
          <div style={{ marginBottom: 10, textAlign: "right" }}>
            <button className="gl-btn primary" onClick={() => setModal({ type: "bill" })}><Plus aria-hidden size={14} /> Add bill</button>
          </div>
          <BillsView month={month} allBills={bills} categories={categories} search={q}
            onEdit={(b) => setModal({ type: "bill", data: bills.find((x) => x.id === b.id) })} onUndoable={onUndoable} />
        </>
      )}
      {activeTab === "income" && (
        <>
          <div style={{ marginBottom: 10, textAlign: "right" }}>
            <button className="gl-btn primary" onClick={() => setModal({ type: "income" })}><Plus aria-hidden size={14} /> Add source</button>
          </div>
          <IncomeView month={month} incomes={incomes} search={q}
            onEdit={(i) => setModal({ type: "income", data: i })} onUndoable={onUndoable} />
        </>
      )}
      {activeTab === "expenses" && (
        <ExpensesView month={month} categories={categories} allExpenses={expenses} search={q}
          categorizable={categorizable} onBulkCategorize={() => setModal({ type: "bulkcat" })}
          bankNew={bank.newCount} onReviewBank={reviewBank}
          onAdd={() => setModal({ type: "expense", date: defaultExpenseDate })}
          onEdit={(e) => setModal({ type: "expense", data: e })}
          onScanned={(p) => setModal({ type: "expense", prefill: p, date: p.date || defaultExpenseDate })}
          onImport={() => setModal({ type: "import" })}
          onUndoable={onUndoable} />
      )}
      {activeTab === "receipts" && (
        <ReceiptVault expenses={expenses} categories={categories} businessMode={settings.businessMode} search={q}
          duplicateCount={duplicateReceipts} onReviewDuplicates={() => setModal({ type: "receiptmatch" })}
          onAttach={(path, uploadedAt) => setModal({ type: "attach", path, uploadedAt })}
          onEdit={(e) => setModal({ type: "expense", data: e })}
          onUnfiledCount={setUnfiledCount}
          onFile={(path) => setModal({ type: "expense", date: defaultExpenseDate, prefill: {
            title: "", amount: "", date: "", merchant: "", categoryId: fallbackCategoryId(categories),
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
            <button className="gl-btn primary" onClick={() => setModal({ type: "goal" })}><Plus aria-hidden size={14} /> Add goal</button>
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
            <button className="gl-btn primary" onClick={() => setModal({ type: "debt" })}><Plus aria-hidden size={14} /> Add debt</button>
          </div>
          <DebtsView debts={debts} settings={settings} onEdit={(d) => setModal({ type: "debt", data: d })} onUndoable={onUndoable} />
        </>
      )}
      {activeTab === "reports" && (
        <Suspense fallback={<div style={{ color: "var(--dim)", padding: 20 }}>Loading charts…</div>}>
          <ReportsView month={month} categories={categories} data={{ settings, categories, incomes, bills, expenses, goals, events, sinkingFunds, debts, mileage }} y={view.y} m={view.m} now={now} />
        </Suspense>
      )}

        </main>
        </PageTitleContext.Provider>
      </div>

      <nav className="gl-bottomnav" aria-label="Primary">
        {BOTTOM_TABS.map((id) => {
          const [, label, Icon] = allTabs.find(([t]) => t === id)!;
          return navButton(id, label, Icon, badgeFor(id));
        })}
        <button className="gl-nav-item" aria-current={!BOTTOM_TABS.includes(activeTab) ? "page" : undefined}
          onClick={() => setModal({ type: "more" })}>
          <MoreHorizontal size={18} aria-hidden /> <span>More</span>
        </button>
      </nav>

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
      {modal?.type === "attach" && (
        <AttachReceiptModal receiptPath={modal.path} uploadedAt={modal.uploadedAt} expenses={expenses}
          categories={categories} onClose={() => setModal(null)} />
      )}
      {modal?.type === "bankreview" && (
        <ImportModal categories={categories} existing={expenses} businessMode={settings.businessMode}
          bankTransactions={modal.rows} onClose={() => setModal(null)} />
      )}
      {modal?.type === "import" && <ImportModal categories={categories} existing={expenses} businessMode={settings.businessMode} onClose={() => setModal(null)} />}

      {modal?.type === "more" && (
        <Modal title="More" onClose={() => setModal(null)}>
          <nav aria-label="All views">
            <div className="gl-nav-group">
              <div className="gl-nav-group-label">Budget</div>
              {PERSONAL_TABS.filter(([id]) => !BOTTOM_TABS.includes(id)).map(([id, label, Icon]) => navButton(id, label, Icon, badgeFor(id)))}
            </div>
            {settings.businessMode && (
              <div className="gl-nav-group">
                <div className="gl-nav-group-label"><Briefcase size={14} aria-hidden /> Business</div>
                {BUSINESS_TABS.map(([id, label, Icon]) => navButton(id, label, Icon))}
              </div>
            )}
            <div className="gl-nav-group">
              <div className="gl-nav-group-label">You</div>
              <button className="gl-nav-item" onClick={() => setModal({ type: "settings" })}><SettingsIcon size={18} aria-hidden /> Settings</button>
            </div>
          </nav>
        </Modal>
      )}

      {undo && (
        <div className="gl-toast gl-undo" role="status">
          <div style={{ ["--tone" as string]: "var(--attention)" }}>
            <span style={{ flex: 1 }}>{undo.label}</span>
            <button className="gl-btn" onClick={doUndo}><Undo2 size={15} aria-hidden /> Undo</button>
            <button className="gl-icon-btn" onClick={() => setUndo(null)} aria-label="Dismiss"><X aria-hidden size={16} /></button>
          </div>
        </div>
      )}
    </div>
  );
}
