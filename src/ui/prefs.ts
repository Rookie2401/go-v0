/**
 * Per-viewer conveniences (highlighting, default playback speed, transcript mode). Stored in
 * localStorage when available; the app renders correctly without it (every access is guarded).
 */
import { useCallback, useSyncExternalStore } from 'react';
import { scopedKey } from './sandbox';

export type HighlightPref = 'off' | 'subtle' | 'strong';
export type TranscriptPref = 'visible' | 'hidden' | 'reveal-current' | 'reveal-after';

export type ThemePref = 'auto' | 'light' | 'dark';

export interface Prefs {
  highlight: HighlightPref;
  speed: number;
  transcript: TranscriptPref;
  /** Reading text size in px (sets --reading-font-size on the reader). */
  fontSize: number;
  theme: ThemePref;
  /**
   * "Preview unreviewed content": off by default. On, unpublished texts are listed (with their reasons), fixture
   * audio is allowed and badged, and a persistent banner says so on every screen. Persisted on this device.
   */
  preview: boolean;
  /** Development preference: register the fixture (non-speech) audio provider even outside preview. */
  devFixtureAudio: boolean;
  /** GoRead team sharing: the team server's address ('' = none). Stays on this device. */
  teamServer: string;
  /** GoRead team sharing: the contributor key that lets this device add texts ('' = read only). Stays on this device. */
  teamKey: string;
}

export const FONT_SIZE_RANGE = { min: 16, max: 34 } as const;
export const DEFAULT_PREFS: Prefs = { highlight: 'subtle', speed: 1, transcript: 'visible', fontSize: 22, theme: 'auto', preview: false, devFixtureAudio: false, teamServer: '', teamKey: '' };

/**
 * Every key below goes through `scopedKey`: in sandbox mode (`?sandbox=<name>`, see sandbox.ts) it is namespaced under
 * `sandbox:<name>:`, so a sandbox never reads or writes the learner's own preferences, active learner, chosen team or speech key.
 */
const KEY = 'go-v0:prefs';
let memory: Prefs | null = null;
/** The storage key `memory` was loaded from (a page can only be in one namespace, but tests switch). */
let memoryKey = '';
const listeners = new Set<() => void>();

function read(): Prefs {
  const key = scopedKey(KEY);
  if (memory && memoryKey === key) return memory;
  let loaded: Partial<Prefs> = {};
  try {
    const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(key) : null;
    if (raw) loaded = JSON.parse(raw) as Partial<Prefs>;
  } catch { /* storage blocked or corrupt: fall back to defaults */ }
  memory = { ...DEFAULT_PREFS, ...loaded };
  memoryKey = key;
  return memory;
}

/** Mirror the theme preference onto <html data-theme>; "auto" leaves the system preference in charge. */
export function applyTheme(theme: ThemePref = read().theme): void {
  if (typeof document === 'undefined') return;
  if (theme === 'auto') delete document.documentElement.dataset.theme;
  else document.documentElement.dataset.theme = theme;
}

export function setPref<K extends keyof Prefs>(key: K, value: Prefs[K]): void {
  memory = { ...read(), [key]: value };
  try { if (typeof localStorage !== 'undefined') localStorage.setItem(scopedKey(KEY), JSON.stringify(memory)); } catch { /* ignore */ }
  for (const l of listeners) l();
}

/** Test helper: forget cached prefs so the next read hits storage/defaults again. */
export function resetPrefsForTests(): void {
  memory = null;
  try { if (typeof localStorage !== 'undefined') localStorage.removeItem(scopedKey(KEY)); } catch { /* ignore */ }
  for (const l of listeners) l();
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => { listeners.delete(cb); };
}

/** Non-hook subscription to preference changes (bootstrap keeps GoListen's fixture switch in step with preview mode). */
export const subscribePrefs = subscribe;

export function usePref<K extends keyof Prefs>(key: K): [Prefs[K], (v: Prefs[K]) => void] {
  const value = useSyncExternalStore(subscribe, () => read()[key], () => DEFAULT_PREFS[key]);
  const set = useCallback((v: Prefs[K]) => setPref(key, v), [key]);
  return [value, set];
}

/** Whether preview mode (unreviewed content) is on. Off by default. */
export function usePreview(): boolean {
  return usePref('preview')[0];
}

/** Whether the learner has ever set this preference (a stored value, not the default). */
export function hasPref(key: keyof Prefs): boolean {
  try {
    const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(scopedKey(KEY)) : null;
    const v: unknown = raw ? JSON.parse(raw) : null;
    return typeof v === 'object' && v !== null && key in v;
  } catch { return false; }
}

/** Non-hook read (bootstrap, services). */
export function getPref<K extends keyof Prefs>(key: K): Prefs[K] {
  return read()[key];
}

const AZURE_KEY = 'go-v0:speech-azure';

export interface RememberedAzure { key: string; region: string }

/**
 * The Azure Speech key + region are kept ONLY when the learner ticks "remember on this device". They live in this
 * browser's localStorage and nowhere else; this app never sends them anywhere except the Azure endpoint the learner
 * configured. Forgetting removes them.
 */
export function rememberAzure(v: RememberedAzure): void {
  try { if (typeof localStorage !== 'undefined') localStorage.setItem(scopedKey(AZURE_KEY), JSON.stringify(v)); } catch { /* not remembered */ }
}
export function recallAzure(): RememberedAzure | undefined {
  try {
    const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(scopedKey(AZURE_KEY)) : null;
    if (!raw) return undefined;
    const v = JSON.parse(raw) as Partial<RememberedAzure>;
    return typeof v.key === 'string' && typeof v.region === 'string' && v.key && v.region ? { key: v.key, region: v.region } : undefined;
  } catch { return undefined; }
}
export function forgetAzure(): void {
  try { if (typeof localStorage !== 'undefined') localStorage.removeItem(scopedKey(AZURE_KEY)); } catch { /* ignore */ }
}

const ACTIVE_USER_KEY = 'go-v0:active-user';

export function rememberActiveUser(userId: string): void {
  try { if (typeof localStorage !== 'undefined') localStorage.setItem(scopedKey(ACTIVE_USER_KEY), userId); } catch { /* per-viewer convenience only */ }
}

export function recallActiveUser(): string | undefined {
  try { return (typeof localStorage !== 'undefined' ? localStorage.getItem(scopedKey(ACTIVE_USER_KEY)) : null) ?? undefined; } catch { return undefined; }
}

const CHOSEN_COURSE_KEY = 'go-v0:chosen-course';

/** The team (course) the learner picked at onboarding or in Settings; bootstrap only creates a learner once this exists. */
export function rememberChosenCourse(courseId: string): void {
  try { if (typeof localStorage !== 'undefined') localStorage.setItem(scopedKey(CHOSEN_COURSE_KEY), courseId); } catch { /* per-viewer convenience only */ }
}

export function recallChosenCourse(): string | undefined {
  try { return (typeof localStorage !== 'undefined' ? localStorage.getItem(scopedKey(CHOSEN_COURSE_KEY)) : null) ?? undefined; } catch { return undefined; }
}

/** Id of the learner bootstrap creates once a team has been chosen. */
export const DEFAULT_USER_ID = 'u-local';
