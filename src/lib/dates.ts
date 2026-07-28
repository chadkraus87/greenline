export const pad = (n: number): string => String(n).padStart(2, "0");
export const ymd = (d: Date): string => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const ymKey = (y: number, m: number): string => `${y}-${pad(m + 1)}`;
export const parseYmd = (s: string): Date => {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d);
};
export const daysInMonth = (y: number, m: number): number => new Date(y, m + 1, 0).getDate();
export const clampDay = (y: number, m: number, day: number): number => Math.min(day, daysInMonth(y, m));
export const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];
export const DOW = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];
