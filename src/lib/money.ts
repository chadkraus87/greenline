export const money = (n: number, signed = false): string => {
  const v = Math.abs(n);
  const s = v.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: v >= 10000 ? 0 : 2 });
  return n < 0 ? `\u2212${s}` : signed && n > 0 ? `+${s}` : s;
};
export const round2 = (n: number): number => Math.round(n * 100) / 100;
export const num = (v: unknown, fb = 0): number => {
  const n = parseFloat(String(v));
  return Number.isFinite(n) && n >= 0 ? round2(n) : fb;
};
export const sanitize = (s: unknown): string => String(s ?? "").replace(/[<>]/g, "").slice(0, 120);
export const uid = (): string => (crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2) + Date.now().toString(36));
