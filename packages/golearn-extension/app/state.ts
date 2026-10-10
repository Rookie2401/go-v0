/**
 * Settings and session storage for the setup application. One abstraction over two backends:
 *   - extension context: chrome.storage.local (shared with the extension's background worker and content script);
 *   - hosted web app: the app's own origin's localStorage (nothing is shared with any extension).
 *
 * Keys (the extension’s own keys, so the background worker and this page see the same state):
 *   golearn:session   { token, learnerId, enrolmentId, languageId, expiresAt, email }  — the ONLY place the bearer token is written
 *   golearn:service   { baseUrl, assetBase? }  — the Repository service address (https, or http on localhost) and the dictionary address
 *   golearn:settings  { keepSnippets, remoteSpeechConsent, externalProcessingConsent, explanationDepth? }  — the learner’s privacy switches
 *   golearn:app       { visited[], tutorial, tutorialStep, packs{}, readerAck } — progress of this application only
 *   golearn:profile   { fetchedAt, email, learnerId, enrolments[] } — enrolments cached by this application; cleared at every account switch
 *   golearn:choice    { enrolmentId, languageId, varietyId?, packId?, standard? } — the language this device reads, with or without an account
 *   golearn:deviceId  the random device id (created once; the extension’s own key)
 *   golearn:event:*   encounter rows (the extension’s store; the tutorial writes here in the web context)
 *   golearn:pack:installed:<packId>  the pack installer’s record (language-packs installPack, under this prefix)
 */
import type { Enrolment } from '../../repository-contract/src';
import { DEVICE_KEY } from '../src/store';
import type { StorageArea } from '../src/platform';

export const KEYS = {
  session: 'golearn:session',
  service: 'golearn:service',
  settings: 'golearn:settings',
  app: 'golearn:app',
  profile: 'golearn:profile',
  choice: 'golearn:choice',
  device: DEVICE_KEY,
} as const;

export interface Session {
  token: string;
  learnerId: string;
  /** '' until the learner holds an enrolment. */
  enrolmentId: string;
  languageId: string;
  expiresAt: string;
  email: string;
}

/** The explicit override of how much grammar explanation to show; absent = follow the Repository’s preference (automatic). */
export type ExplanationDepth = 'label' | 'brief' | 'explanatory';
export const DEPTHS: readonly ExplanationDepth[] = ['label', 'brief', 'explanatory'];

/** The learner’s privacy switches, exactly the shape the background worker keeps in golearn:settings. */
export interface Settings {
  /** Not implemented by the extension in this build: always false. */
  keepSnippets: boolean;
  remoteSpeechConsent: boolean;
  externalProcessingConsent: boolean;
  explanationDepth?: ExplanationDepth;
}

export const DEFAULT_SETTINGS: Settings = { keepSnippets: false, remoteSpeechConsent: false, externalProcessingConsent: false };

export interface ServiceSetting { baseUrl: string; assetBase?: string }

export interface PackRecord { version: string; ok: boolean; verifiedAt: string }
export type TutorialState = 'pending' | 'skipped' | 'done';

export interface Progress {
  visited: string[];
  tutorial: TutorialState;
  tutorialStep: number;
  /** Per pack id: the version last installed or verified here and whether verification passed. */
  packs: Record<string, PackRecord>;
  readerAck: boolean;
}

export const DEFAULT_PROGRESS: Progress = { visited: [], tutorial: 'pending', tutorialStep: 0, packs: {}, readerAck: false };

/** The language the learner chose on this device: an account is not needed for it. `enrolmentId` names the enrolment records are made against. */
export interface ActiveChoice {
  enrolmentId: string;
  languageId: string;
  varietyId?: string;
  packId?: string;
  /** Norwegian: the written standard the learner chose. */
  standard?: 'nb' | 'nn';
}

export interface Profile { fetchedAt: string; email: string; learnerId: string; enrolments: Enrolment[] }

// ───────────────────────────── backends ─────────────────────────────

/** A StorageArea over localStorage (values as JSON). Used when there is no extension API. */
export function createWebStorageArea(storage: Storage): StorageArea {
  const all = (): string[] => { const out: string[] = []; for (let i = 0; i < storage.length; i++) { const k = storage.key(i); if (k !== null) out.push(k); } return out; };
  const parse = (raw: string | null): unknown => { if (raw === null) return undefined; try { return JSON.parse(raw); } catch { return undefined; } };
  return {
    async get(keys) {
      const list = keys == null ? all() : Array.isArray(keys) ? keys : [keys];
      const out: Record<string, unknown> = {};
      for (const k of list) { const v = parse(storage.getItem(k)); if (v !== undefined) out[k] = v; }
      return out;
    },
    async set(items) { for (const [k, v] of Object.entries(items)) storage.setItem(k, JSON.stringify(v)); },
    async remove(keys) { for (const k of Array.isArray(keys) ? keys : [keys]) storage.removeItem(k); },
  };
}

// ───────────────────────────── typed access ─────────────────────────────

const str = (v: unknown): v is string => typeof v === 'string';

export function isSession(v: unknown): v is Omit<Session, 'enrolmentId' | 'languageId'> & { enrolmentId?: string; languageId?: string } {
  if (!v || typeof v !== 'object') return false;
  const s = v as Record<string, unknown>;
  // the background writes enrolmentId / languageId only once the learner has enrolled
  return str(s.token) && s.token.length > 0 && str(s.learnerId) && (s.enrolmentId === undefined || str(s.enrolmentId)) && (s.languageId === undefined || str(s.languageId)) && str(s.expiresAt) && str(s.email);
}

export interface StateStore {
  readonly area: StorageArea;
  getSession(): Promise<Session | undefined>;
  setSession(s: Session): Promise<void>;
  clearSession(): Promise<void>;
  getSettings(): Promise<Settings>;
  /** Writes the settings directly (the web app, and the fallback when no background worker answers). */
  patchSettings(p: Partial<Settings>): Promise<Settings>;
  getService(): Promise<ServiceSetting | undefined>;
  setService(s: ServiceSetting): Promise<void>;
  getProgress(): Promise<Progress>;
  patchProgress(p: Partial<Progress>): Promise<Progress>;
  markVisited(route: string): Promise<void>;
  recordPack(packId: string, rec: PackRecord): Promise<void>;
  getChoice(): Promise<ActiveChoice | undefined>;
  setChoice(c: ActiveChoice): Promise<void>;
  clearChoice(): Promise<void>;
  getProfile(): Promise<Profile | undefined>;
  setProfile(p: Profile): Promise<void>;
  clearProfile(): Promise<void>;
}

export function createStateStore(area: StorageArea): StateStore {
  const read = async <T>(key: string): Promise<T | undefined> => {
    try { return (await area.get(key))[key] as T | undefined; } catch { return undefined; }
  };
  // read-modify-write of one key is serialised: two quick changes (a step and a flag) must not overwrite each other
  let queue: Promise<unknown> = Promise.resolve();
  const serial = <T>(fn: () => Promise<T>): Promise<T> => {
    const run = queue.then(fn, fn);
    queue = run.catch(() => undefined);
    return run;
  };

  const readSettings = async (): Promise<Settings> => {
    const v = (await read<Record<string, unknown>>(KEYS.settings)) ?? {};
    return {
      keepSnippets: false, // the extension holds this at false: nothing can keep a sentence yet
      remoteSpeechConsent: v.remoteSpeechConsent === true,
      externalProcessingConsent: v.externalProcessingConsent === true,
      ...(DEPTHS.includes(v.explanationDepth as ExplanationDepth) ? { explanationDepth: v.explanationDepth as ExplanationDepth } : {}),
    };
  };
  const readProgress = async (): Promise<Progress> => {
    const v = (await read<Partial<Progress>>(KEYS.app)) ?? {};
    return {
      visited: Array.isArray(v.visited) ? v.visited.filter(str) : [],
      tutorial: v.tutorial === 'done' || v.tutorial === 'skipped' ? v.tutorial : 'pending',
      tutorialStep: typeof v.tutorialStep === 'number' && v.tutorialStep >= 0 ? Math.floor(v.tutorialStep) : 0,
      packs: v.packs && typeof v.packs === 'object' ? v.packs : {},
      readerAck: v.readerAck === true,
    };
  };
  const changeProgress = (fn: (p: Progress) => Progress): Promise<Progress> =>
    serial(async () => { const next = fn(await readProgress()); await area.set({ [KEYS.app]: next }); return next; });

  return {
    area,
    async getSession() { const v = await read<unknown>(KEYS.session); return isSession(v) ? { ...v, enrolmentId: v.enrolmentId || '', languageId: v.languageId || '' } : undefined; },
    async setSession(s) { await area.set({ [KEYS.session]: s }); },
    async clearSession() { await area.remove(KEYS.session); },
    getSettings: readSettings,
    patchSettings: (p) => serial(async () => {
      const next: Settings = { ...(await readSettings()), ...p, keepSnippets: false };
      if (next.explanationDepth === undefined) delete next.explanationDepth;
      await area.set({ [KEYS.settings]: next });
      return next;
    }),
    async getService() {
      const v = await read<Partial<ServiceSetting>>(KEYS.service);
      return v && typeof v.baseUrl === 'string' ? { baseUrl: v.baseUrl, ...(typeof v.assetBase === 'string' ? { assetBase: v.assetBase } : {}) } : undefined;
    },
    async setService(cfg) { await area.set({ [KEYS.service]: cfg }); },
    getProgress: readProgress,
    patchProgress: (p) => changeProgress((cur) => ({ ...cur, ...p })),
    async markVisited(route) { await changeProgress((cur) => (cur.visited.includes(route) ? cur : { ...cur, visited: [...cur.visited, route] })); },
    async recordPack(packId, rec) { await changeProgress((cur) => ({ ...cur, packs: { ...cur.packs, [packId]: rec } })); },
    async getChoice() {
      const v = await read<Partial<ActiveChoice>>(KEYS.choice);
      if (!v || !str(v.enrolmentId) || !v.enrolmentId || !str(v.languageId) || !v.languageId) return undefined;
      return {
        enrolmentId: v.enrolmentId, languageId: v.languageId,
        ...(str(v.varietyId) && v.varietyId ? { varietyId: v.varietyId } : {}), ...(str(v.packId) && v.packId ? { packId: v.packId } : {}),
        ...(v.standard === 'nb' || v.standard === 'nn' ? { standard: v.standard } : {}),
      };
    },
    async setChoice(c) { await area.set({ [KEYS.choice]: c }); },
    async clearChoice() { await area.remove(KEYS.choice); },
    async getProfile() {
      const v = await read<Profile>(KEYS.profile);
      return v && typeof v === 'object' && Array.isArray(v.enrolments) ? v : undefined;
    },
    async setProfile(p) { await area.set({ [KEYS.profile]: p }); },
    async clearProfile() { await area.remove(KEYS.profile); },
  };
}
