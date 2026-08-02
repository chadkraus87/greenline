import { useEffect, useState } from "react";
import { Check, X, ShieldCheck } from "lucide-react";
import { Modal, Empty } from "../../components/ui";
import { supabase } from "../../lib/supabase";
import { useToast } from "../../hooks/useToasts";
import type { Profile } from "../../auth/AuthProvider";

/** Admin-only: approve or reject accounts. RLS lets the admin read all profiles
 *  and update status; approving triggers server-side seeding of that user's defaults. */
export function AdminPanel({ onClose }: { onClose: () => void }) {
  const toast = useToast();
  const [rows, setRows] = useState<Profile[]>([]);
  const [busy, setBusy] = useState(false);

  const load = async () => {
    const { data } = await supabase.from("profiles").select("*").order("created_at", { ascending: false });
    setRows((data as Profile[]) ?? []);
  };
  useEffect(() => { load(); }, []);

  const setStatus = async (id: string, status: Profile["status"]) => {
    setBusy(true);
    const { error } = await supabase.from("profiles").update({ status }).eq("id", id);
    if (error) toast(error.message, "clay");
    else toast(status === "approved" ? "User approved" : "User rejected");
    await load();
    setBusy(false);
  };

  const pending = rows.filter((r) => r.status === "pending");
  const others = rows.filter((r) => r.status !== "pending");

  const Row = ({ p }: { p: Profile }) => (
    <div className="gl-row">
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 500 }}>{p.email}{p.role === "admin" && <span style={{ color: "var(--fern)", fontSize: 11, marginLeft: 6 }}>admin</span>}</div>
        <div style={{ fontSize: 11.5, color: p.status === "approved" ? "var(--fern)" : p.status === "rejected" ? "var(--clay)" : "var(--brass)" }}>{p.status}</div>
      </div>
      {p.role !== "admin" && (
        <>
          {p.status !== "approved" && <button className="gl-btn" style={{ padding: "4px 9px", fontSize: 12 }} disabled={busy} onClick={() => setStatus(p.id, "approved")}><Check size={12} /> Approve</button>}
          {p.status !== "rejected" && <button className="gl-btn" style={{ padding: "4px 9px", fontSize: 12, color: "var(--clay)" }} disabled={busy} onClick={() => setStatus(p.id, "rejected")}><X size={12} /> Reject</button>}
        </>
      )}
    </div>
  );

  return (
    <Modal title="Admin — user access" onClose={onClose} wide>
      <div style={{ display: "flex", alignItems: "center", gap: 8, color: "var(--dim)", fontSize: 12.5, margin: "4px 0 12px" }}>
        <ShieldCheck size={15} color="var(--fern)" /> Approve who can use Greenline. Each person's data stays private to their account.
      </div>
      <div className="gl-label" style={{ marginTop: 4 }}>Pending</div>
      {pending.length === 0 ? <Empty text="No pending requests." /> : pending.map((p) => <Row key={p.id} p={p} />)}
      <div className="gl-label" style={{ marginTop: 14 }}>Everyone else</div>
      {others.map((p) => <Row key={p.id} p={p} />)}
    </Modal>
  );
}
