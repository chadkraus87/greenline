import { useCallback, useEffect, useState } from "react";
import { Check, CalendarDays, Trash2, X, Send } from "lucide-react";
import { Modal, Field, Empty } from "../../components/ui";
import type { CalendarShare, SharePermission } from "../../types";
import * as act from "../../db/actions";
import { useToast } from "../../hooks/useToasts";

const PERM_LABEL: Record<SharePermission, string> = {
  read: "Can view",
  write: "Can view & edit",
};

/** Manage who can see your calendar, and whose calendars you can see.
 *  Only calendar events are ever shared — bills, income, and expenses stay private. */
export function SharingModal({ onClose }: { onClose: () => void }) {
  const toast = useToast();
  const [shares, setShares] = useState<CalendarShare[]>([]);
  const [email, setEmail] = useState("");
  const [perm, setPerm] = useState<SharePermission>("read");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try { setShares(await act.listCalendarShares()); }
    catch (e) { toast((e as Error).message, "clay"); }
    finally { setLoading(false); }
  }, [toast]);
  useEffect(() => { load(); }, [load]);

  const invite = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return;
    setBusy(true);
    try {
      await act.inviteCalendarShare(email.trim(), perm);
      toast("Invitation sent — they'll see it next time they sign in");
      setEmail("");
      await load();
    } catch (err) { toast((err as Error).message, "clay"); }
    finally { setBusy(false); }
  };

  const act_ = async (fn: () => Promise<void>, msg: string) => {
    setBusy(true);
    try { await fn(); toast(msg); await load(); }
    catch (e) { toast((e as Error).message, "clay"); }
    finally { setBusy(false); }
  };

  const incoming = shares.filter((s) => s.direction === "incoming" && s.status !== "declined");
  const outgoing = shares.filter((s) => s.direction === "outgoing");
  const pendingIn = incoming.filter((s) => s.status === "pending");
  const activeIn = incoming.filter((s) => s.status === "accepted");

  return (
    <Modal title="Calendar sharing" onClose={onClose} wide>
      <p style={{ fontSize: 12.5, color: "var(--dim)", marginTop: 4 }}>
        Share <strong>calendar events</strong> with another Greenline account. Your bills, income,
        expenses, and budgets are never shared and stay visible only to you.
      </p>

      {/* Invitations waiting on me */}
      {pendingIn.length > 0 && (
        <>
          <div className="gl-label" style={{ marginTop: 14 }}>Invitations for you</div>
          {pendingIn.map((s) => (
            <div className="gl-row" key={s.id}>
              <CalendarDays size={15} color="var(--brass)" style={{ flexShrink: 0 }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 500 }}>{s.otherEmail}</div>
                <div style={{ fontSize: 11.5, color: "var(--dim)" }}>
                  wants to share their calendar · {PERM_LABEL[s.permission].toLowerCase()}
                </div>
              </div>
              <button className="gl-btn primary" style={{ padding: "4px 9px", fontSize: 12 }} disabled={busy}
                onClick={() => act_(() => act.respondToShare(s.id, true), "Calendar shared with you")}>
                <Check size={12} /> Accept
              </button>
              <button className="gl-btn" style={{ padding: "4px 9px", fontSize: 12 }} disabled={busy}
                onClick={() => act_(() => act.respondToShare(s.id, false), "Invitation declined")}>
                Decline
              </button>
            </div>
          ))}
        </>
      )}

      {/* Invite someone */}
      <div className="gl-label" style={{ marginTop: 14 }}>Share your calendar</div>
      <form onSubmit={invite}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr auto auto", gap: 8, alignItems: "end" }}>
          <Field label="Their email">
            <input className="gl-input" type="email" value={email} placeholder="name@example.com"
              onChange={(e) => setEmail(e.target.value)} autoComplete="off" />
          </Field>
          <Field label="They can">
            <select className="gl-select" value={perm} onChange={(e) => setPerm(e.target.value as SharePermission)}>
              <option value="read">View only</option>
              <option value="write">View &amp; edit</option>
            </select>
          </Field>
          <button className="gl-btn primary" type="submit" disabled={busy || !email.trim()} style={{ height: 38 }}>
            <Send size={13} /> Invite
          </button>
        </div>
      </form>
      <div style={{ fontSize: 11.5, color: "var(--dim)", marginTop: 6 }}>
        They must accept before anything is shared. You can change or remove access at any time.
      </div>

      {/* Outgoing */}
      <div className="gl-label" style={{ marginTop: 16 }}>People you've shared with</div>
      {loading ? <Empty text="Loading…" /> : outgoing.length === 0 ? <Empty text="You haven't shared your calendar with anyone." /> : outgoing.map((s) => (
        <div className="gl-row" key={s.id}>
          <span style={{ width: 8, height: 8, borderRadius: 99, flexShrink: 0,
            background: s.status === "accepted" ? "var(--fern)" : s.status === "pending" ? "var(--brass)" : "var(--dim)" }} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 500 }}>{s.otherEmail}</div>
            <div style={{ fontSize: 11.5, color: "var(--dim)" }}>
              {s.status === "accepted" ? "active" : s.status}
            </div>
          </div>
          <select className="gl-select" value={s.permission} disabled={busy} style={{ width: 140, fontSize: 12.5, padding: "5px 8px" }}
            aria-label={`Permission for ${s.otherEmail}`}
            onChange={(e) => act_(() => act.setSharePermission(s.id, e.target.value as SharePermission), "Permission updated")}>
            <option value="read">View only</option>
            <option value="write">View &amp; edit</option>
          </select>
          <button className="gl-icon-btn" disabled={busy} aria-label={`Stop sharing with ${s.otherEmail}`}
            onClick={() => act_(() => act.removeShare(s.id), "Sharing stopped")}><Trash2 size={13} /></button>
        </div>
      ))}

      {/* Incoming, accepted */}
      <div className="gl-label" style={{ marginTop: 16 }}>Calendars shared with you</div>
      {activeIn.length === 0 ? <Empty text="No one has shared a calendar with you yet." /> : activeIn.map((s) => (
        <div className="gl-row" key={s.id}>
          <CalendarDays size={15} color="var(--sky)" style={{ flexShrink: 0 }} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 500 }}>{s.otherEmail}</div>
            <div style={{ fontSize: 11.5, color: "var(--dim)" }}>{PERM_LABEL[s.permission]}</div>
          </div>
          <button className="gl-icon-btn" disabled={busy} aria-label={`Leave ${s.otherEmail}'s calendar`}
            onClick={() => act_(() => act.removeShare(s.id), "Removed")}><X size={13} /></button>
        </div>
      ))}
    </Modal>
  );
}
