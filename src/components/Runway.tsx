import { useEffect, useId, useRef, useState } from "react";
import type { ForecastDay } from "../types";
import { money } from "../lib/money";

const H = 210;
const PAD = { top: 22, right: 18, bottom: 28, left: 8 };

/**
 * The green line: projected balance across the month.
 *
 * Solid up to today (what has happened), dashed after (what's scheduled to).
 * Anything under the buffer floor is redrawn in the danger colour, and the low
 * point is labelled in words, so the warning never depends on colour alone.
 *
 * Drawn in plain SVG rather than with the charting library: that library is
 * lazy-loaded for Reports because it's heavy, and this chart is the first
 * thing on the first screen.
 */
export function Runway({ forecast, todayYmd, inMonth, bufferFloor, monthLabel }:
  { forecast: ForecastDay[]; todayYmd: string; inMonth: boolean; bufferFloor: number; monthLabel: string }) {
  const wrap = useRef<HTMLDivElement>(null);
  const [W, setW] = useState(720);
  const uid = useId().replace(/:/g, "");

  // Sized to the real container so text stays legible on a phone instead of
  // being scaled down along with a fixed viewBox.
  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setW(Math.max(280, Math.round(e.contentRect.width))));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  if (forecast.length === 0) return null;

  const balances = forecast.map((f) => f.balance);
  // Fit the data, not zero: forcing a zero baseline squashes a month that runs
  // $2,800–$6,800 into a flat strip. Zero joins the range only when the balance
  // actually goes negative, and the floor is always kept in view.
  const lo = Math.min(...balances, bufferFloor > 0 ? bufferFloor : Infinity, ...(balances.some((b) => b < 0) ? [0] : []));
  const hi = Math.max(...balances, bufferFloor);
  const span = hi - lo || 1;
  const yMin = lo - span * 0.08;
  const yMax = hi + span * 0.12;

  const innerW = W - PAD.left - PAD.right;
  const innerH = H - PAD.top - PAD.bottom;
  const x = (i: number) => PAD.left + (forecast.length === 1 ? innerW / 2 : (i / (forecast.length - 1)) * innerW);
  const y = (v: number) => PAD.top + (1 - (v - yMin) / (yMax - yMin)) * innerH;

  const pts = forecast.map((f, i) => [x(i), y(f.balance)] as const);
  const path = (from: number, to: number) =>
    pts.slice(from, to + 1).map(([px, py], i) => `${i ? "L" : "M"}${px.toFixed(1)},${py.toFixed(1)}`).join("");

  // Where "today" sits decides how much of the line is fact vs projection.
  const todayIdx = inMonth ? forecast.findIndex((f) => f.date === todayYmd) : -1;
  const allPast = !inMonth && forecast[forecast.length - 1].date < todayYmd;
  const splitAt = todayIdx >= 0 ? todayIdx : allPast ? forecast.length - 1 : 0;
  const actualD = splitAt > 0 ? path(0, splitAt) : "";
  const forecastD = splitAt < forecast.length - 1 ? path(splitAt, forecast.length - 1) : "";
  const areaD = `${path(0, forecast.length - 1)}L${x(forecast.length - 1).toFixed(1)},${(PAD.top + innerH).toFixed(1)}L${PAD.left},${(PAD.top + innerH).toFixed(1)}Z`;

  const lowIdx = balances.indexOf(Math.min(...balances));
  const low = forecast[lowIdx];
  const end = forecast[forecast.length - 1];
  const floorY = y(bufferFloor);
  const dipsBelowFloor = bufferFloor > 0 && low.balance < bufferFloor;
  const ticks = [...new Set([0, 7, 14, 21, forecast.length - 1])].filter((i) => i < forecast.length);

  const summary =
    `Projected balance for ${monthLabel}: starts at ${money(forecast[0].balance)}, ` +
    `lowest ${money(low.balance)} on day ${low.day}, ends at ${money(end.balance)}.` +
    (bufferFloor > 0 ? ` Buffer floor ${money(bufferFloor)}${dipsBelowFloor ? ", which the balance drops below." : "."}` : "");

  // Keep end-of-line labels inside the frame.
  const labelX = (px: number, anchorEnd = false) => (anchorEnd ? Math.max(px, 90) : Math.min(px, W - 90));

  return (
    <div ref={wrap}>
      <svg className="gl-chart" width={W} height={H} viewBox={`0 0 ${W} ${H}`} role="img" aria-labelledby={`${uid}-t ${uid}-d`}>
        <title id={`${uid}-t`}>Cash runway</title>
        <desc id={`${uid}-d`}>{summary}</desc>
        <defs>
          <linearGradient id="gl-area" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="var(--accent)" stopOpacity=".24" />
            <stop offset="100%" stopColor="var(--accent)" stopOpacity="0" />
          </linearGradient>
          <clipPath id={`${uid}-below`}>
            <rect x="0" y={floorY} width={W} height={Math.max(0, H - floorY)} />
          </clipPath>
        </defs>

        {[0.25, 0.5, 0.75].map((f) => (
          <line key={f} className="grid" x1={PAD.left} x2={W - PAD.right} y1={PAD.top + innerH * f} y2={PAD.top + innerH * f} />
        ))}
        {lo < 0 && <line className="zero" x1={PAD.left} x2={W - PAD.right} y1={y(0)} y2={y(0)} />}

        <path className="area" d={areaD} />

        {bufferFloor > 0 && (
          <g>
            <line className="floor" x1={PAD.left} x2={W - PAD.right} y1={floorY} y2={floorY} />
            <text className="label-floor" x={W - PAD.right} y={floorY - 6} textAnchor="end">
              Keep at least {money(bufferFloor)}
            </text>
          </g>
        )}

        {actualD && <path className="actual" d={actualD} />}
        {forecastD && <path className="forecast" d={forecastD} />}
        {bufferFloor > 0 && dipsBelowFloor && (
          <g clipPath={`url(#${uid}-below)`}>
            {actualD && <path className="actual below" d={actualD} />}
            {forecastD && <path className="forecast below" d={forecastD} />}
          </g>
        )}

        {todayIdx >= 0 && (
          <g>
            <line className="today" x1={pts[todayIdx][0]} x2={pts[todayIdx][0]} y1={PAD.top - 6} y2={PAD.top + innerH} />
            <circle className="dot" cx={pts[todayIdx][0]} cy={pts[todayIdx][1]} r="5" />
            <text className="label-strong" x={labelX(pts[todayIdx][0] + 8)} y={PAD.top - 8}>
              Today {money(forecast[todayIdx].balance)}
            </text>
          </g>
        )}

        {dipsBelowFloor && lowIdx !== todayIdx && (
          <g>
            <circle className="dot bad" cx={pts[lowIdx][0]} cy={pts[lowIdx][1]} r="4.5" />
            <text x={labelX(pts[lowIdx][0])} y={Math.min(pts[lowIdx][1] + 18, PAD.top + innerH - 4)} textAnchor="middle"
              style={{ fill: "var(--danger)", fontWeight: 600 }}>
              Low {money(low.balance)}
            </text>
          </g>
        )}

        <circle className="dot" cx={pts[pts.length - 1][0]} cy={pts[pts.length - 1][1]} r="4" />

        {ticks.map((i) => (
          <text key={i} x={x(i)} y={H - 8} textAnchor={i === 0 ? "start" : i === forecast.length - 1 ? "end" : "middle"}>
            {forecast[i].day === 1 ? `${monthLabel.split(" ")[0].slice(0, 3)} 1` : forecast[i].day}
          </text>
        ))}
      </svg>
    </div>
  );
}
