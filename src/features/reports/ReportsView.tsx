import {
  Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Legend, Line, LineChart, Pie, PieChart,
  ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import type { AppData, Category, MonthModel } from "../../types";
import { Empty } from "../../components/ui";
import { money } from "../../lib/money";
import { monthlyHistory, emergencyFund, netWorth } from "../../lib/insights";

const tooltipStyle = { background: "var(--surface)", border: "1px solid var(--line)", borderRadius: 8, fontSize: 12 };
const fmtK = (v: number) => "$" + (Math.abs(v) >= 1000 ? (v / 1000).toFixed(1) + "k" : String(v));

function Tile({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: string }) {
  return (
    <div className="gl-card" style={{ padding: "12px 14px" }}>
      <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: ".06em", textTransform: "uppercase", color: "var(--dim)" }}>{label}</div>
      <div className="gl-mono" style={{ fontSize: 20, fontWeight: 600, marginTop: 3, color: tone ?? "var(--text)" }}>{value}</div>
      {sub && <div style={{ fontSize: 11.5, color: "var(--dim)", marginTop: 2 }}>{sub}</div>}
    </div>
  );
}

export function ReportsView({ month, categories, data, y, m, now }:
  { month: MonthModel; categories: Category[]; data: AppData; y: number; m: number; now: Date }) {
  const pieData = categories
    .map((c) => ({ name: c.name, value: month.catSpend[c.id] || 0, color: c.color }))
    .filter((d) => d.value > 0);
  const barData = [
    { name: "Expected income", v: month.expectedIncome, color: "#46B380" },
    { name: "Bills", v: month.billsTotal, color: "#D9A441" },
    { name: "Expenses", v: month.expensesTotal, color: "#5FA8D3" },
    { name: "Reserved", v: month.reserved, color: "#C77DBA" },
  ];
  const history = monthlyHistory(data, y, m, now, 6);
  const ef = emergencyFund(data, month, y, m, now);
  const nw = netWorth(data);
  const efPct = ef.target > 0 ? Math.min(100, (ef.saved / ef.target) * 100) : 0;
  const subs = [...data.bills].filter((b) => !b.paused).sort((a, b) => b.amount - a.amount);
  const annualRecurring = subs.reduce((s, b) => s + b.amount * 12, 0);

  return (
    <div style={{ display: "grid", gap: 14 }}>
      <div className="gl-stats">
        <Tile label="Net worth" value={money(nw.net)} sub={`${money(nw.assets)} saved − ${money(nw.debts)} debt`} tone={nw.net < 0 ? "var(--clay)" : "var(--fern)"} />
        <Tile label="Savings rate" value={`${month.savingsRate}%`} sub="income kept this month" tone={month.savingsRate >= 20 ? "var(--fern)" : month.savingsRate >= 10 ? "var(--brass)" : "var(--clay)"} />
        <Tile label="Emergency fund" value={`${ef.monthsCovered.toFixed(1)} mo`} sub={`${money(ef.saved)} of ${money(ef.target)} (${data.settings.emergencyMonths}-mo target)`} />
        <Tile label="Annual recurring" value={money(annualRecurring)} sub={`${subs.length} recurring bills`} tone="var(--brass)" />
      </div>

      <div className="gl-card" style={{ padding: 16 }}>
        <div className="gl-display" style={{ fontSize: 15, marginBottom: 8 }}>Projected balance through the month</div>
        <ResponsiveContainer width="100%" height={200}>
          <AreaChart data={month.forecast}>
            <defs>
              <linearGradient id="glf" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#46B380" stopOpacity={0.35} /><stop offset="100%" stopColor="#46B380" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--line)" />
            <XAxis dataKey="day" tick={{ fontSize: 11, fill: "var(--dim)" }} />
            <YAxis tick={{ fontSize: 11, fill: "var(--dim)" }} width={54} tickFormatter={fmtK} />
            <Tooltip contentStyle={tooltipStyle} formatter={(v) => money(Number(v))} labelFormatter={(d) => `Day ${d}`} />
            <Area type="monotone" dataKey="balance" stroke="#46B380" strokeWidth={2} fill="url(#glf)" name="Balance" />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(280px,1fr))", gap: 14 }}>
        <div className="gl-card" style={{ padding: 16 }}>
          <div className="gl-display" style={{ fontSize: 15, marginBottom: 8 }}>Income vs. spending — last 6 months</div>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={history}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--line)" />
              <XAxis dataKey="label" tick={{ fontSize: 11, fill: "var(--dim)" }} />
              <YAxis tick={{ fontSize: 11, fill: "var(--dim)" }} width={44} tickFormatter={fmtK} />
              <Tooltip contentStyle={tooltipStyle} formatter={(v) => money(Number(v))} />
              <Legend wrapperStyle={{ fontSize: 11.5 }} />
              <Bar dataKey="income" fill="#46B380" name="Income" radius={[3, 3, 0, 0]} />
              <Bar dataKey="spent" fill="#D9A441" name="Spent" radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
        <div className="gl-card" style={{ padding: 16 }}>
          <div className="gl-display" style={{ fontSize: 15, marginBottom: 8 }}>Savings rate trend</div>
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={history}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--line)" />
              <XAxis dataKey="label" tick={{ fontSize: 11, fill: "var(--dim)" }} />
              <YAxis tick={{ fontSize: 11, fill: "var(--dim)" }} width={38} tickFormatter={(v) => `${v}%`} domain={[0, 100]} />
              <Tooltip contentStyle={tooltipStyle} formatter={(v) => `${v}%`} />
              <Line type="monotone" dataKey="savingsRate" stroke="#5FA8D3" strokeWidth={2} name="Savings rate" dot={{ r: 2 }} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(280px,1fr))", gap: 14 }}>
        <div className="gl-card" style={{ padding: 16 }}>
          <div className="gl-display" style={{ fontSize: 15, marginBottom: 8 }}>Spending by category</div>
          {pieData.length === 0 ? <Empty text="Log expenses or pay bills to see the breakdown." /> : (
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie data={pieData} dataKey="value" nameKey="name" innerRadius={52} outerRadius={82} paddingAngle={2}>
                  {pieData.map((d, i) => <Cell key={i} fill={d.color} stroke="var(--surface)" />)}
                </Pie>
                <Tooltip contentStyle={tooltipStyle} formatter={(v) => money(Number(v))} />
                <Legend wrapperStyle={{ fontSize: 11.5 }} />
              </PieChart>
            </ResponsiveContainer>
          )}
        </div>
        <div className="gl-card" style={{ padding: 16 }}>
          <div className="gl-display" style={{ fontSize: 15, marginBottom: 8 }}>Budget vs commitments</div>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={barData} layout="vertical" margin={{ left: 8 }}>
              <XAxis type="number" tick={{ fontSize: 11, fill: "var(--dim)" }} tickFormatter={fmtK} />
              <YAxis type="category" dataKey="name" width={110} tick={{ fontSize: 11.5, fill: "var(--text)" }} />
              <Tooltip contentStyle={tooltipStyle} formatter={(v) => money(Number(v))} />
              <Bar dataKey="v" radius={[0, 6, 6, 0]}>{barData.map((d, i) => <Cell key={i} fill={d.color} />)}</Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {ef.target > 0 && (
        <div className="gl-card" style={{ padding: 16 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 8 }}>
            <span className="gl-display" style={{ fontSize: 15 }}>Emergency fund</span>
            <span className="gl-mono" style={{ fontSize: 12, color: "var(--dim)" }}>{money(ef.saved)} / {money(ef.target)}</span>
          </div>
          <div className="gl-track"><div className="gl-fill" style={{ width: `${efPct}%`, background: "var(--fern)" }} /></div>
          <p style={{ fontSize: 12, color: "var(--dim)", marginTop: 8, marginBottom: 0 }}>
            Covers <strong style={{ color: "var(--text)" }}>{ef.monthsCovered.toFixed(1)} months</strong> of your ~{money(ef.monthlyNeed)}/mo obligations.
            Target is {data.settings.emergencyMonths} months. {ef.monthsCovered >= data.settings.emergencyMonths ? "Fully funded — nicely done." : "Keep going."}
          </p>
        </div>
      )}

      {subs.length > 0 && (
        <div className="gl-card" style={{ padding: 16 }}>
          <div className="gl-display" style={{ fontSize: 15, marginBottom: 8 }}>Recurring &amp; subscription audit</div>
          <div style={{ overflowX: "auto" }}>
            <table className="gl-table">
              <thead><tr><th>Bill</th><th style={{ textAlign: "right" }}>Monthly</th><th style={{ textAlign: "right" }}>Per year</th></tr></thead>
              <tbody>
                {subs.map((b) => (
                  <tr key={b.id}>
                    <td>{b.name}</td>
                    <td className="gl-mono" style={{ textAlign: "right" }}>{money(b.amount)}</td>
                    <td className="gl-mono" style={{ textAlign: "right", fontWeight: 600 }}>{money(b.amount * 12)}</td>
                  </tr>
                ))}
                <tr>
                  <td style={{ fontWeight: 600 }}>Total recurring</td>
                  <td className="gl-mono" style={{ textAlign: "right", fontWeight: 600 }}>{money(annualRecurring / 12)}</td>
                  <td className="gl-mono" style={{ textAlign: "right", fontWeight: 600, color: "var(--brass)" }}>{money(annualRecurring)}</td>
                </tr>
              </tbody>
            </table>
          </div>
          <p style={{ fontSize: 11.5, color: "var(--dim)", marginTop: 8, marginBottom: 0 }}>
            Every recurring bill, annualized — the quickest way to spot subscription creep.
          </p>
        </div>
      )}
    </div>
  );
}
