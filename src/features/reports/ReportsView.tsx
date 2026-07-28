import {
  Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Legend, Pie, PieChart,
  ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import type { Category, MonthModel } from "../../types";
import { Empty } from "../../components/ui";
import { money } from "../../lib/money";

const tooltipStyle = { background: "var(--surface)", border: "1px solid var(--line)", borderRadius: 8, fontSize: 12 };
const fmtK = (v: number) => "$" + (Math.abs(v) >= 1000 ? (v / 1000).toFixed(1) + "k" : String(v));

export function ReportsView({ month, categories }: { month: MonthModel; categories: Category[] }) {
  const pieData = categories
    .map((c) => ({ name: c.name, value: month.catSpend[c.id] || 0, color: c.color }))
    .filter((d) => d.value > 0);
  const barData = [
    { name: "Expected income", v: month.expectedIncome, color: "#46B380" },
    { name: "Bills", v: month.billsTotal, color: "#D9A441" },
    { name: "Expenses", v: month.expensesTotal, color: "#5FA8D3" },
    { name: "Savings", v: month.goalMonthly, color: "#C77DBA" },
  ];
  return (
    <div style={{ display: "grid", gap: 14 }}>
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
    </div>
  );
}
