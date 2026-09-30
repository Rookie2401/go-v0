/**
 * Per-viewer conveniences (highlighting, default playback speed, transcript mode). Stored in
 * localStorage when available; the app renders correctly without it (every access is guarded).
 */
import { useCallback, useSyncExternalStore } from 'react';

export type HighlightPref = 'off' | 'subtle' | 'strong';
export type TranscriptPref = 'visible' | 'hidden' | 'reveal-current' | 'reveal-after';

export interface Prefs {
  highlight: HighlightPref;
  speed: number;
  transcript: TranscriptPref;
}

export const DEFAULT_PREFS: Prefs = { highlight: 'subtle', speed: 1, transcript: 'visible' };

const KEY = 'go-v0:prefs';
let memory: Prefs | null = null;
const listeners = new Set<() => void>();

function read(): Prefs {
  if (memory) return memory;
  let loaded: Partial<Prefs> = {};
  try {
    const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(KEY) : null;
    if (raw) loaded = JSON.parse(raw) as Partial<Prefs>;
  } catch { /* storage blocked or corrupt: fall back to defaults */ }
  memory = { ...DEFAULT_PREFS, ...loaded };
  return memory;
}

export function setPref<K extends keyof Prefs>(key: K, value: Prefs[K]): void {
  memory = { ...read(), [key]: value };
  try { if (typeof localStorage !== 'undefined') localStorage.setItem(KEY, JSON.stringify(memory)); } catch { /* ignore */ }
  for (const l of listeners) l();
}

/** Test helper: forget cached prefs so the next read hits storage/defaults again. */
export function resetPrefsForTests(): void {
  memory = null;
  try { if (typeof localStorage !== 'undefined') localStorage.removeItem(KEY); } catch { /* ignore */ }
  for (const l of listeners) l();
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => { listeners.delete(cb); };
}

export function usePref<K extends keyof Prefs>(key: K): [Prefs[K], (v: Prefs[K]) => void] {
  const value = useSyncExternalStore(subscribe, () => read()[key], () => DEFAULT_PREFS[key]);
  const set = useCallback((v: Prefs[K]) => setPref(key, v), [key]);
  return [value, set];
}

const ACTIVE_USER_KEY = 'go-v0:active-user';

export function rememberActiveUser(userId: string): void {
  try { if (typeof localStorage !== 'undefined') localStorage.setItem(ACTIVE_USER_KEY, userId); } catch { /* per-viewer convenience only */ }
}

export function recallActiveUser(): string | undefined {
  try { return (typeof localStorage !== 'undefined' ? localStorage.getItem(ACTIVE_USER_KEY) : null) ?? undefined; } catch { return undefined; }
}
