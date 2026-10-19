/**
 * Where Biblia's events go. Inside the GoLearn extension (this page served from chrome-extension://…/biblia/) the extension's background
 * worker owns the device's Repository and this page reaches it over `golearn:local-repo` (the same route GoPractice uses); the learner's
 * enrolment in Hebrew or Greek is found or made there, with the period the text is in as its variety. Anywhere else there is no repository:
 * the reader works, records nothing, and says so. No account, token or password is handled here.
 */
import { connectLocalRepository } from '../../repository-local/src/proxy';
import type { GoEvent, Enrolment } from '../../repository-contract/src';
import type { RepositoryApi } from '../../repository-service/src/api';
import type { BibliaLang } from './canon';

const MSG_LOCAL_REPO = 'golearn:local-repo';
export const READER_ID = 'biblia';
export const APP_VERSION = '0.1.0';
const PACK_VERSION: Record<BibliaLang, string> = { he: '1', el: '1' };

export interface Identity { learnerId: string; enrolmentId: string; deviceId: string }
export interface Recorder {
  /** 'extension' when the on-device Repository is reachable, else 'none' with the reason the page shows. */
  mode: 'extension' | 'none';
  reason?: string;
  /** The identity for events of this language and period (an enrolment is made on first use); undefined when nothing is recorded. */
  identity(lang: BibliaLang, varietyId: string): Promise<Identity | undefined>;
  record(events: GoEvent[]): Promise<{ ok: boolean; message?: string }>;
}

interface GlobalLike { chrome?: { runtime?: { id?: string; sendMessage?: (m: unknown) => Promise<unknown> } }; location?: { protocol?: string } }

/** The extension API, only when this page really is an extension page (an ordinary tab also has a `chrome` object, without `runtime.id`). */
export function extensionSend(g: GlobalLike = globalThis as unknown as GlobalLike): ((m: unknown) => Promise<unknown>) | undefined {
  const r = g.chrome?.runtime;
  if (!r || typeof r.id !== 'string' || !r.id || typeof r.sendMessage !== 'function') return undefined;
  const protocol = g.location?.protocol;
  if (protocol !== undefined && protocol !== 'chrome-extension:' && protocol !== 'moz-extension:') return undefined;
  return (m) => r.sendMessage!(m);
}

export const noRecorder = (reason: string): Recorder => ({ mode: 'none', reason, identity: async () => undefined, record: async () => ({ ok: false, message: reason }) });

/** A recorder over a Repository API with a learner id (the on-device one through the extension, or any other the host provides). */
export function apiRecorder(api: RepositoryApi, learner: () => Promise<{ learnerId: string; deviceId?: string }>): Recorder {
  const enrolments = new Map<string, Promise<Enrolment | undefined>>();
  const enrolmentFor = (lang: BibliaLang, varietyId: string): Promise<Enrolment | undefined> => {
    const key = `${lang}|${varietyId}`;
    let p = enrolments.get(key);
    if (!p) {
      p = (async () => {
        const list = await api.listEnrolments();
        if (!list.ok) return undefined;
        const live = list.data.enrolments.filter((e) => e.languageId === lang && !e.endedAt);
        const exact = live.find((e) => e.varietyId === varietyId) ?? live[0];
        if (exact) return exact;
        const made = await api.enrol({ languageId: lang, varietyId, scriptId: lang === 'he' ? 'Hebr' : 'Grek', packId: `pack:${lang}`, packVersion: PACK_VERSION[lang], goals: [] });
        return made.ok ? made.data.enrolment : undefined;
      })();
      enrolments.set(key, p);
      p.then((e) => { if (!e) enrolments.delete(key); }, () => enrolments.delete(key));
    }
    return p;
  };
  return {
    mode: 'extension',
    async identity(lang, varietyId) {
      const who = await learner();
      const e = await enrolmentFor(lang, varietyId);
      if (!e) return undefined;
      return { learnerId: who.learnerId, enrolmentId: e.enrolmentId, deviceId: who.deviceId ?? 'this-device' };
    },
    async record(events) {
      try {
        const r = await api.appendEvents(events);
        return r.ok ? { ok: true } : { ok: false, message: r.message || `The Repository answered ${r.status}.` };
      } catch (e) { return { ok: false, message: e instanceof Error ? e.message : String(e) }; }
    },
  };
}

/** The recorder for this page: the extension's on-device Repository when the page is an extension page, else none. */
export function makeRecorder(send = extensionSend()): Recorder {
  if (!send) return noRecorder('Open Biblia from the GoLearn extension to record what you read: here it is a reader only, and nothing is kept.');
  const local = connectLocalRepository(send, MSG_LOCAL_REPO);
  return apiRecorder(local.api, () => local.identity());
}
