/**
 * The learner's privacy settings, in `chrome.storage.local` under `golearn:settings`. Every switch defaults to off.
 * `keepSnippets` is part of the contract but NOT implemented in this phase: nothing in the extension can store a
 * sentence, so the setting is held at false and a request to turn it on is answered with a note.
 */
import type { StorageArea } from '../platform';
import { DEFAULT_SETTINGS, SETTINGS_UNAVAILABLE, isDepth, type PrivacySettings, type SettingsReply } from '../protocol';

export const SETTINGS_KEY = 'golearn:settings';

export function sanitizeSettings(raw: unknown): PrivacySettings {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  return {
    keepSnippets: false,
    remoteSpeechConsent: r.remoteSpeechConsent === true,
    localOnlySpeech: r.localOnlySpeech !== false,
    externalProcessingConsent: r.externalProcessingConsent === true,
    ...(isDepth(r.explanationDepth) ? { explanationDepth: r.explanationDepth } : {}),
  };
}

export function createSettings(area: StorageArea) {
  async function get(): Promise<PrivacySettings> {
    try { return sanitizeSettings((await area.get(SETTINGS_KEY))[SETTINGS_KEY]); } catch { return { ...DEFAULT_SETTINGS }; }
  }

  async function set(patch: unknown): Promise<SettingsReply> {
    const p = (patch && typeof patch === 'object' ? patch : {}) as Record<string, unknown>;
    const cur = await get();
    const notes: string[] = [];
    const next: PrivacySettings = { ...cur };
    if (typeof p.remoteSpeechConsent === 'boolean') next.remoteSpeechConsent = p.remoteSpeechConsent;
    if (typeof p.localOnlySpeech === 'boolean') next.localOnlySpeech = p.localOnlySpeech;
    if (typeof p.externalProcessingConsent === 'boolean') next.externalProcessingConsent = p.externalProcessingConsent;
    if (p.keepSnippets === true) notes.push('Keeping sentences is not available in this version; it stays off.');
    if ('explanationDepth' in p) {
      if (isDepth(p.explanationDepth)) next.explanationDepth = p.explanationDepth;
      else if (p.explanationDepth === null || p.explanationDepth === undefined) delete next.explanationDepth;
      else return { ok: false, settings: cur, error: 'explanationDepth must be label, brief or explanatory' };
    }
    next.keepSnippets = false;
    try { await area.set({ [SETTINGS_KEY]: next }); } catch { return { ok: false, settings: cur, error: 'settings could not be saved' }; }
    return { ok: true, settings: next, unavailable: SETTINGS_UNAVAILABLE, ...(notes.length ? { notes } : {}) };
  }

  return { get, set };
}

export type SettingsStore = ReturnType<typeof createSettings>;
