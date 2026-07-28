import type { ForecastDay } from "../types";
import { money } from "../lib/money";

/** Signature element: day-by-day projected balance ribbon. */
export function Runway({ forecast, todayYmd, inMonth }: { forecast: ForecastDay[]; todayYmd: string; inMonth: boolean }) {
  const max = Math.max(1, ...forecast.map((f) => Math.abs(f.balance)));
  return (
    <div className="gl-card" style={{ overflow: "hidden" }}>
      <div style={{ display: "flex", justifyContent: "space-between", padding: "12px 14px 0", alignItems: "baseline" }}>
        <span className="gl-display" style={{ fontSize: 15 }}>Cash runway</span>
        <span style={{ fontSize: 11.5, color: "var(--dim)" }}>projected daily balance from scheduled flows</span>
      </div>
      <div className="gl-runway" role="img" aria-label="Daily projected balance chart">
        {forecast.map((f) => {
          const isToday = inMonth && f.date === todayYmd;
          const neg = f.balance < 0;
          return (
            <div key={f.day} className={"gl-run-col" + (isToday ? " today" : "")}
              title={`${f.date}: ${money(f.balance)} (net ${money(f.net, true)})`}>
              <div className="gl-run-bar" style={{
                height: Math.max(3, (Math.abs(f.balance) / max) * 44),
                background: neg ? "var(--clay)" : f.net > 0 ? "var(--fern)" : f.net < 0 ? "var(--brass)" : "var(--line)",
                opacity: isToday ? 1 : 0.85,
              }} />
              {(f.day === 1 || f.day % 5 === 0 || isToday) && <span className="gl-run-day">{f.day}</span>}
            </div>
          );
        })}
      </div>
    </div>
  );
}
