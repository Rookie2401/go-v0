/** Small formatting and statistics helpers shared by the course-level reading model (forecast, pace, readiness, history). */

export const round1 = (n: number) => Math.round(n * 10) / 10;
export const round4 = (n: number) => Math.round(n * 1e4) / 1e4;
/** 0.947 → "94.7" */
export const pct1 = (x: number) => (Math.round(x * 1000) / 10).toFixed(1);
export const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
export const times = (n: number) => (n === 1 ? 'once' : n === 2 ? 'twice' : `${n} times`);

export function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length === 0 ? 0 : s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/** Code-unit string order: stable and locale independent. */
export const cmp = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
