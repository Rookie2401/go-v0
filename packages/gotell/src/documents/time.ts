/**
 * Clock plumbing shared by the GoTell document, evidence and privacy modules. A "time source" is a Date, an ISO string,
 * epoch milliseconds, or a function returning one of those, so callers can pass `() => new Date()`, a fixed ISO string in
 * a test, or the app's own clock without adapters.
 */
export type TimeSource = Date | string | number | (() => Date | string | number);

export function toDate(t?: TimeSource): Date {
  const v = typeof t === 'function' ? t() : t;
  if (v === undefined) return new Date();
  const d = v instanceof Date ? v : new Date(v);
  return Number.isNaN(d.getTime()) ? new Date() : d;
}

export const toIso = (t?: TimeSource): string => toDate(t).toISOString();
export const toMs = (t?: TimeSource): number => toDate(t).getTime();
