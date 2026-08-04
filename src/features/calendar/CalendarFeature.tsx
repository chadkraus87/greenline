import { useState } from "react";
import { CalendarDays, CircleDollarSign, Pencil, Plus, Receipt, Trash2, Wallet } from "lucide-react";
import type { CalEvent, Expense, MonthModel } from "../../types";
import { Modal, Field, FormActions } from "../../components/ui";
import { DOW, MONTHS, pad, parseYmd } from "../../lib/dates";
import { money, sanitize } from "../../lib/money";
import * as act from "../../db/actions";
import { useToast } from "../../hooks/useToasts";
import { PALETTE } from "../../components/ui";

interface ChipItem { label: string; color: string; soft: string; done?: boolean; shared?: boolean; }

/** `myId` distinguishes your own events from ones on a shared calendar. */
function itemsFor(month: MonthModel, ds: string, myId?: string): ChipItem[] {
  return [
    ...month.incomeOccs.filter((o) => o.date === ds).map((o) => ({ label: `+ ${o.name}`, color: "var(--fern)", soft: "var(--fern-soft)", done: o.received })),
    ...month.billOccs.filter((b) => b.date === ds).map((b) => ({ label: b.name, color: b.overdue ? "var(--clay)" : "var(--brass)", soft: b.overdue ? "var(--clay-soft)" : "var(--brass-soft)", done: b.isPaid })),
    ...month.expenses.filter((e) => e.date === ds).map((e) => ({ label: e.title, color: "var(--sky)", soft: "var(--sky-soft)" })),
    ...month.events.filter((e) => e.date === ds).map((e) => ({
      label: e.title, color: e.color, soft: "transparent",
      shared: Boolean(myId && e.ownerId && e.ownerId !== myId),
    })),
  ];
}

export function Calendar({ y, m, month, myId, onDayClick }: { y: number; m: number; month: MonthModel; myId?: string; onDayClick: (ds: string) => void }) {
  const firstDow = new Date(y, m, 1).getDay();
  const cells: (number | null)[] = [...Array<null>(firstDow).fill(null)];
  for (let d = 1; d <= month.nDays; d++) cells.push(d);
  return (
    <div className="gl-card" style={{ padding: 12 }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)", gap: 4, marginBottom: 4 }}>
        {DOW.map((d) => (
          <div key={d} style={{ fontSize: 10.5, fontWeight: 600, letterSpacing: ".08em", textTransform: "uppercase", color: "var(--dim)", textAlign: "center", padding: "2px 0" }}>{d}</div>
        ))}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)", gap: 4 }}>
        {cells.map((d, i) => {
          if (d === null) return <div key={`x${i}`} />;
          const ds = `${month.ym}-${pad(d)}`;
          const items = itemsFor(month, ds, myId);
          const isToday = month.inMonth && ds === month.todayYmd;
          return (
            <button key={d} className={"gl-day" + (isToday ? " today" : "")} onClick={() => onDayClick(ds)} aria-label={`${ds}, ${items.length} items`}>
              <div className="gl-mono" style={{ fontSize: 12, fontWeight: 600, color: isToday ? "var(--fern)" : "var(--dim)" }}>{d}</div>
              {items.slice(0, 3).map((it, j) => (
                <span key={j} className="gl-chip" title={it.shared ? "Shared calendar" : undefined}
                  style={{ background: it.soft, color: it.color, textDecoration: it.done ? "line-through" : "none",
                    opacity: it.done ? 0.6 : 1, ...(it.shared ? { borderLeft: "2px solid var(--sky)", paddingLeft: 4 } : {}) }}>
                  {it.shared ? "◹ " : ""}{it.label}
                </span>
              ))}
              {items.length > 3 && <span className="gl-chip" style={{ color: "var(--dim)" }}>+{items.length - 3} more</span>}
              <div className="gl-dotrow">
                {items.slice(0, 4).map((it, j) => <span key={j} style={{ width: 5, height: 5, borderRadius: 99, background: it.color }} />)}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function EventForm({ initial, defaultDate, writableCalendars = [], onClose }:
  { initial?: CalEvent; defaultDate: string; writableCalendars?: { id: string; email: string }[]; onClose: () => void }) {
  const toast = useToast();
  const [f, setF] = useState({
    title: initial?.title ?? "", date: initial?.date ?? defaultDate,
    notes: initial?.notes ?? "", color: initial?.color ?? PALETTE[3],
    ownerId: "", // "" = my own calendar
  });
  const save = async () => {
    await act.saveEvent({
      id: initial?.id, title: sanitize(f.title), date: f.date,
      notes: sanitize(f.notes), color: f.color,
      ownerId: f.ownerId || undefined,
    });
    toast("Event saved");
    onClose();
  };
  return (
    <Modal title={initial ? "Edit event" : "Add calendar event"} onClose={onClose}>
      <Field label="Title"><input className="gl-input" value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} autoFocus /></Field>
      <Field label="Date"><input className="gl-input" type="date" value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} /></Field>
      {!initial && writableCalendars.length > 0 && (
        <Field label="Add to calendar">
          <select className="gl-select" value={f.ownerId} onChange={(e) => setF({ ...f, ownerId: e.target.value })}>
            <option value="">My calendar</option>
            {writableCalendars.map((c) => <option key={c.id} value={c.id}>{c.email}</option>)}
          </select>
        </Field>
      )}
      <Field label="Notes"><input className="gl-input" value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} /></Field>
      <FormActions onCancel={onClose} onSave={save} saveLabel={initial ? "Save changes" : "Add event"} disabled={!f.title.trim() || !f.date} />
    </Modal>
  );
}

export function DayDetail({ date, month, myId, ownerEmailById, onClose, onAddExpense, onAddEvent, onEditExpense }:
  { date: string; month: MonthModel; myId?: string; ownerEmailById?: Map<string, string>;
    onClose: () => void; onAddExpense: (d: string) => void; onAddEvent: (d: string) => void; onEditExpense: (e: Expense) => void }) {
  const d = parseYmd(date);
  const incs = month.incomeOccs.filter((o) => o.date === date);
  const bills = month.billOccs.filter((b) => b.date === date);
  const exps = month.expenses.filter((e) => e.date === date);
  const evs = month.events.filter((e) => e.date === date);
  const empty = !incs.length && !bills.length && !exps.length && !evs.length;
  return (
    <Modal title={`${DOW[d.getDay()]}, ${MONTHS[d.getMonth()]} ${d.getDate()}`} onClose={onClose}>
      {empty && <p style={{ color: "var(--dim)", fontSize: 13.5 }}>Nothing scheduled. Add an expense or event below.</p>}
      {incs.map((o) => (
        <div key={o.key} className="gl-row" style={{ padding: "9px 0" }}>
          <CircleDollarSign size={15} color="var(--fern)" />
          <span style={{ flex: 1 }}>{o.name}</span>
          <span className="gl-mono" style={{ color: "var(--fern)" }}>{money(o.amount, true)}</span>
          <button className="gl-btn" style={{ padding: "4px 9px", fontSize: 12 }} onClick={() => act.toggleIncomeReceived(o.sourceId, o.date)}>
            {o.received ? "Received ✓" : "Mark received"}
          </button>
        </div>
      ))}
      {bills.map((b) => (
        <div key={b.id} className="gl-row" style={{ padding: "9px 0" }}>
          <Receipt size={15} color={b.overdue ? "var(--clay)" : "var(--brass)"} />
          <span style={{ flex: 1 }}>{b.name}{b.overdue && <em style={{ color: "var(--clay)", fontSize: 11, marginLeft: 6 }}>overdue</em>}</span>
          <span className="gl-mono">{money(b.amount)}</span>
          <button className="gl-btn" style={{ padding: "4px 9px", fontSize: 12 }} onClick={() => act.toggleBillPaid(b.id, month.ym)}>
            {b.isPaid ? "Paid ✓" : "Mark paid"}
          </button>
        </div>
      ))}
      {exps.map((e) => (
        <div key={e.id} className="gl-row" style={{ padding: "9px 0" }}>
          <Wallet size={15} color="var(--sky)" />
          <span style={{ flex: 1 }}>{e.title}</span>
          <span className="gl-mono">{money(e.amount)}</span>
          <button className="gl-icon-btn" onClick={() => onEditExpense(e)} aria-label="Edit expense"><Pencil size={13} /></button>
        </div>
      ))}
      {evs.map((e) => {
        const shared = Boolean(myId && e.ownerId && e.ownerId !== myId);
        return (
          <div key={e.id} className="gl-row" style={{ padding: "9px 0" }}>
            <CalendarDays size={15} color={e.color} />
            <div style={{ flex: 1, minWidth: 0 }}>
              {e.title}
              {shared && (
                <div style={{ fontSize: 11, color: "var(--sky)" }}>
                  shared · {ownerEmailById?.get(e.ownerId!) ?? "another calendar"}
                </div>
              )}
            </div>
            <button className="gl-icon-btn" onClick={() => act.deleteEvent(e.id)} aria-label="Delete event"><Trash2 size={13} /></button>
          </div>
        );
      })}
      <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
        <button className="gl-btn primary" onClick={() => onAddExpense(date)}><Plus size={14} /> Expense</button>
        <button className="gl-btn" onClick={() => onAddEvent(date)}><Plus size={14} /> Event</button>
      </div>
    </Modal>
  );
}
