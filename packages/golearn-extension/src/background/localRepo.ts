/**
 * The device-local Repository inside the background worker: GoLearn without an account.
 *
 * ONE instance per extension, here (`openLocalRepository` over `chrome.storage.local`, rows under `golearn:repo:`). Extension pages reach it
 * with `MSG.localRepo` (see `LocalRepoRequest` in ../protocol.ts); a content script never does. Nothing here leaves the device: the only road out is
 * `uploadTo(api)` with the signed-in session's client, run once after a successful sign-in (and on request), followed by a pull.
 *
 *  - Every event the recorder accepts is appended here as well (same id, same content; the learner, enrolment and device ids are the local ones).
 *    An event recorded while signed in is marked as the account's own (the sync queue sends it), so a later upload does not repeat it.
 *  - A lookup in a language the learner has not enrolled in gets an "automatic" enrolment (no goals), because the service refuses an event with no
 *    enrolment. Only the learner's own choice (`enrol`, from the setup page) counts as the active language.
 *  - Nothing here may break recording: any failure is swallowed and the event stays in the worker's own log and queue.
 */
import type { Enrolment, GoEvent, LearningGoal } from '../../../repository-contract/src';
import { inspectLocal, markEventsOwned, openLocalRepository, type LocalRepository } from '../../../repository-local/src';
import { adaptStorageArea, createLock } from '../../../repository-sync/src';
import type { LanguageAdapter } from '../../../../src/core';
import type { StorageArea } from '../platform';
import { getAnalyser } from '../parser/registry';
import { LOCAL_API_METHODS, isLanguageId, isUnitId, type LocalEnrolmentView, type LocalRepoRequest, type LocalRepoStatus } from '../protocol';
import type { PackProvider } from './gloss';
import type { SessionManager } from './session';

export const LOCAL_PREFIX = 'golearn:repo:';
/** The enrolment the learner chose to read with when there is more than one. */
export const ACTIVE_KEY = 'golearn:local-active';
/** The outcome of the last upload, shown on the sync screen. */
export const UPLOAD_STATUS_KEY = 'golearn:local-upload';
const FORMAT = 'golearn-local-export@1';

export interface LocalRepoServiceOptions {
  area: StorageArea;
  deviceId: () => Promise<string>;
  session: SessionManager;
  packs: PackProvider;
  now: () => number;
}

interface UploadStatus { at: number; sent: number; duplicates: number; failed: number; waiting?: number; pulled: number; error?: string }

/** What the profile cache asks of the device's model. */
export interface LocalKnowledge {
  knowledge(unitIds: string[]): Promise<import('../../../repository-contract/src').UnitKnowledge[] | undefined>;
  preferences(languageId: string): Promise<import('../../../repository-contract/src').AssistancePreferences | undefined>;
}

const isExplicit = (e: Enrolment): boolean => e.goals.length > 0;
const bySetup = (a: Enrolment, b: Enrolment): number => a.startedAt.localeCompare(b.startedAt);

export function createLocalRepoService(opts: LocalRepoServiceOptions) {
  const lock = createLock();
  let opening: Promise<LocalRepository | undefined> | undefined;
  let signInWork: Promise<unknown> = Promise.resolve();
  const enrolmentOf = new Map<string, string>();

  // read at call time, so an analyser the worker loads later is used; the worker itself carries Albanian only
  const adapters = new Proxy({}, { get: (_t, k) => (typeof k === 'string' ? getAnalyser(k) : undefined) }) as Record<string, LanguageAdapter | undefined>;

  async function start(): Promise<LocalRepository | undefined> {
    try {
      return await openLocalRepository({ area: adaptStorageArea(opts.area), keyPrefix: LOCAL_PREFIX, adapters, deviceId: await opts.deviceId() });
    } catch { return undefined; }
  }
  /** The repository, opened once; a failed open is tried again on the next call. */
  function open(): Promise<LocalRepository | undefined> {
    if (!opening) {
      const p = start();
      opening = p;
      void p.then((r) => { if (!r && opening === p) opening = undefined; });
    }
    return opening;
  }

  // ───────────── enrolments ─────────────

  async function openEnrolments(repo: LocalRepository): Promise<Enrolment[]> {
    const r = await repo.api.listEnrolments();
    return r.ok ? r.data.enrolments.filter((e) => !e.endedAt) : [];
  }

  async function activeId(enrolments: Enrolment[]): Promise<string | undefined> {
    const explicit = enrolments.filter(isExplicit).sort(bySetup);
    if (!explicit.length) return undefined;
    const chosen = (await opts.area.get(ACTIVE_KEY))[ACTIVE_KEY];
    if (typeof chosen === 'string' && explicit.some((e) => e.enrolmentId === chosen)) return chosen;
    return explicit.at(-1)!.enrolmentId;
  }

  const view = (e: Enrolment, active: string | undefined): LocalEnrolmentView => ({
    enrolmentId: e.enrolmentId, languageId: e.languageId, packId: e.packId, packVersion: e.packVersion, startedAt: e.startedAt, ...(e.endedAt ? { endedAt: e.endedAt } : {}),
    explicit: isExplicit(e), active: e.enrolmentId === active,
  });

  /** The enrolment events of `languageId` are recorded under: the open one, else a new automatic one. */
  async function enrolmentFor(repo: LocalRepository, languageId: string): Promise<string | undefined> {
    const cached = enrolmentOf.get(languageId);
    if (cached) return cached;
    const open = (await openEnrolments(repo)).filter((e) => e.languageId === languageId);
    const pick = open.filter(isExplicit).sort(bySetup).at(-1) ?? open.sort(bySetup).at(-1);
    if (pick) { enrolmentOf.set(languageId, pick.enrolmentId); return pick.enrolmentId; }
    const m = opts.packs.manifest(languageId);
    const made = await repo.api.enrol({ languageId, packId: m?.packId ?? `pack:${languageId}`, packVersion: m?.version ?? '0', goals: [] });
    if (!made.ok) return undefined;
    enrolmentOf.set(languageId, made.data.enrolment.enrolmentId);
    return made.data.enrolment.enrolmentId;
  }

  async function activeLanguage(): Promise<string | undefined> {
    const repo = await open();
    if (!repo) return undefined;
    try {
      const enrolments = await openEnrolments(repo);
      const id = await activeId(enrolments);
      return enrolments.find((e) => e.enrolmentId === id)?.languageId;
    } catch { return undefined; }
  }

  /** Every language the learner has chosen on this device (open enrolments), in setup order; empty when none. */
  async function chosenLanguages(): Promise<string[]> {
    const repo = await open();
    if (!repo) return [];
    try { return [...new Set((await openEnrolments(repo)).map((e) => e.languageId))]; } catch { return []; }
  }

  // ───────────── recording ─────────────

  /** Appends the event the recorder just accepted. `attributed: 'account'` = signed in: the sync queue sends it, so it is marked as the account's. */
  function record(event: GoEvent, attributed: 'account' | 'local'): Promise<boolean> {
    return lock.run(async () => {
      try {
        const repo = await open();
        if (!repo) return false;
        const id = await repo.identity();
        const enrolmentId = await enrolmentFor(repo, event.languageId);
        if (!enrolmentId) return false;
        const r = await repo.api.appendEvents([{ ...event, learnerId: id.learnerId, enrolmentId, producer: { ...event.producer, deviceId: id.deviceId } }]);
        if (!r.ok) return false;
        if (attributed === 'account') await markEventsOwned(repo, [event.id], event.learnerId);
        return true;
      } catch { return false; }
    });
  }

  // ───────────── reads for the card ─────────────

  const forProfile: LocalKnowledge = {
    async knowledge(unitIds) {
      try {
        const repo = await open();
        if (!repo || !unitIds.length) return repo ? [] : undefined;
        const r = await repo.api.knowledge(unitIds);
        return r.ok ? r.data.knowledge : undefined;
      } catch { return undefined; }
    },
    async preferences(languageId) {
      try {
        const repo = await open();
        if (!repo) return undefined;
        const r = await repo.api.preferences(languageId);
        return r.ok ? r.data.preferences : undefined;
      } catch { return undefined; }
    },
  };

  // ───────────── the account ─────────────

  async function lastUpload(): Promise<UploadStatus | undefined> {
    const v = (await opts.area.get(UPLOAD_STATUS_KEY))[UPLOAD_STATUS_KEY] as UploadStatus | undefined;
    return v && typeof v === 'object' && typeof v.at === 'number' ? v : undefined;
  }

  /** Uploads the local history to the signed-in account, then pulls the account's. Never throws. */
  async function uploadAndPull(): Promise<{ ok: boolean; upload?: { sent: number; duplicates: number; failed: number; waiting: number }; pulled?: number; skipped?: 'unavailable' | 'not-connected' | 'busy'; error?: string }> {
    try {
      const repo = await open();
      if (!repo) return { ok: false, skipped: 'unavailable' };
      const a = await opts.session.authenticated();
      if (!a) return { ok: false, skipped: 'not-connected' };
      const raw = await repo.uploadTo(a.api);
      const upload = { sent: raw.sent, duplicates: raw.duplicates, failed: raw.failed, waiting: (await inspectLocal(repo)).waiting };
      const { added } = await repo.pullFrom(a.api);
      const status: UploadStatus = { at: opts.now(), ...upload, pulled: added, ...(upload.failed ? { error: `${upload.failed} event${upload.failed === 1 ? '' : 's'} could not be sent; they will be tried again` } : {}) };
      try { await opts.area.set({ [UPLOAD_STATUS_KEY]: status }); } catch { /* a convenience */ }
      return { ok: upload.failed === 0, upload, pulled: added };
    } catch (e) {
      const error = e instanceof Error ? e.message : String(e);
      try { await opts.area.set({ [UPLOAD_STATUS_KEY]: { at: opts.now(), sent: 0, duplicates: 0, failed: 0, pulled: 0, error } satisfies UploadStatus }); } catch { /* a convenience */ }
      return { ok: false, error };
    }
  }

  /** After a successful sign-in: the history goes up once, then the account's comes down. Resolves when both are done; never rejects. */
  function afterSignIn(): Promise<unknown> {
    signInWork = signInWork.then(() => uploadAndPull(), () => uploadAndPull());
    return signInWork;
  }

  /** The account got (or changed) an enrolment: events that waited for one in their language can go now. Does nothing, and asks nothing, when none is waiting. */
  async function afterEnrolment(): Promise<void> {
    try {
      const repo = await open();
      if (!repo || (await inspectLocal(repo)).pendingUpload === 0) return;
      await uploadAndPull();
    } catch { /* the next sign-in or upload tries again */ }
  }

  // ───────────── clearing ─────────────

  async function clear(): Promise<void> {
    const repo = await open();
    enrolmentOf.clear();
    try { await opts.area.remove([ACTIVE_KEY, UPLOAD_STATUS_KEY]); } catch { /* absent */ }
    if (repo) await repo.clear();
  }

  // ───────────── the page-facing operations ─────────────

  async function status(): Promise<LocalRepoStatus> {
    const repo = await open();
    if (!repo) {
      return { ok: true, available: false, events: 0, pendingUpload: 0, uploaded: 0, fromAccount: 0, enrolments: [], storedChars: 0, writeFailures: 0 };
    }
    const [info, enrolments, last] = await Promise.all([inspectLocal(repo), openEnrolments(repo), lastUpload()]);
    const active = await activeId(enrolments);
    const languageId = enrolments.find((e) => e.enrolmentId === active)?.languageId;
    return {
      ok: true, available: true, events: info.events, pendingUpload: info.pendingUpload, uploaded: info.uploaded, fromAccount: info.fromRemote,
      enrolments: enrolments.sort(bySetup).map((e) => view(e, active)), ...(languageId ? { languageId } : {}),
      storedChars: info.storedChars, writeFailures: info.persistence.failures, ...(info.persistence.lastError ? { lastWriteError: info.persistence.lastError } : {}),
      ...(last ? { lastUpload: last } : {}),
    };
  }

  const bad = (error: string): { ok: false; error: string } => ({ ok: false, error });

  async function enrol(repo: LocalRepository, r: Extract<LocalRepoRequest, { op: 'enrol' }>): Promise<unknown> {
    if (!isLanguageId(r.languageId)) return bad('not a language');
    const current = (await openEnrolments(repo)).filter((e) => e.languageId === r.languageId);
    const chosen = current.filter(isExplicit).sort(bySetup).at(-1);
    let enrolment = chosen;
    if (!enrolment) {
      // an automatic enrolment of this language (made to record a lookup) is replaced by the learner's choice: its events stay under it
      for (const auto of current) await repo.api.endEnrolment(auto.enrolmentId);
      enrolmentOf.delete(r.languageId);
      const m = opts.packs.manifest(r.languageId);
      const goals = (Array.isArray(r.goals) && r.goals.length ? r.goals : [{ kind: 'reading' }]) as LearningGoal[];
      const made = await repo.api.enrol({
        languageId: r.languageId, packId: typeof r.packId === 'string' && r.packId ? r.packId : (m?.packId ?? `pack:${r.languageId}`),
        packVersion: typeof r.packVersion === 'string' && r.packVersion ? r.packVersion : (m?.version ?? '0'), goals,
        ...(typeof r.varietyId === 'string' ? { varietyId: r.varietyId } : {}), ...(typeof r.scriptId === 'string' ? { scriptId: r.scriptId } : {}),
      });
      if (!made.ok) return bad(made.message || made.error);
      enrolment = made.data.enrolment;
    }
    await opts.area.set({ [ACTIVE_KEY]: enrolment.enrolmentId });
    enrolmentOf.set(r.languageId, enrolment.enrolmentId);
    return { ok: true, enrolment: view(enrolment, enrolment.enrolmentId) };
  }

  async function handle(raw: unknown): Promise<unknown> {
    const r = (raw ?? {}) as Record<string, unknown> & { op?: unknown };
    const repo = await open();
    if (!repo) return bad('The on-device Repository is not available (the browser would not let GoLearn read its storage).');
    try {
      switch (r.op) {
        case 'status': return status();
        case 'identity': { const id = await repo.identity(); return { ok: true, ...id }; }
        case 'knowledge': {
          const ids = Array.isArray(r.unitIds) ? (r.unitIds as unknown[]).filter(isUnitId).slice(0, 200) : undefined;
          const k = await repo.api.knowledge(ids);
          return k.ok ? { ok: true, knowledge: k.data.knowledge.filter((x) => !isLanguageId(r.languageId) || x.languageId === r.languageId) } : bad(k.message || k.error);
        }
        case 'candidates': {
          const enrolments = await openEnrolments(repo);
          const lang = isLanguageId(r.languageId) ? r.languageId : undefined;
          const active = await activeId(enrolments);
          const e = lang ? enrolments.filter((x) => x.languageId === lang).sort(bySetup).at(-1) : enrolments.find((x) => x.enrolmentId === active);
          if (!e) return { ok: true, candidates: [] };
          const c = await repo.api.candidates(e.enrolmentId, typeof r.limit === 'number' ? Math.max(1, Math.min(200, Math.floor(r.limit))) : undefined);
          return c.ok ? { ok: true, candidates: c.data.candidates } : bad(c.message || c.error);
        }
        case 'export': {
          const enrolments = await openEnrolments(repo);
          return { ok: true, format: FORMAT, exportedAt: new Date(opts.now()).toISOString(), events: await repo.exportEvents(), enrolments };
        }
        case 'enrolments': { const e = await openEnrolments(repo); const a = await activeId(e); return { ok: true, enrolments: e.sort(bySetup).map((x) => view(x, a)) }; }
        case 'enrol': return await enrol(repo, r as Extract<LocalRepoRequest, { op: 'enrol' }>);
        case 'select': {
          const e = (await openEnrolments(repo)).find((x) => x.enrolmentId === r.enrolmentId);
          if (!e || !isExplicit(e)) return bad('That enrolment is not open.');
          await opts.area.set({ [ACTIVE_KEY]: e.enrolmentId });
          return { ok: true, enrolment: view(e, e.enrolmentId) };
        }
        case 'end': {
          const ended = await repo.api.endEnrolment(String(r.enrolmentId ?? ''));
          enrolmentOf.clear();
          return ended.ok ? { ok: true } : bad(ended.message || ended.error);
        }
        case 'upload': return { ...(await lock.run(() => uploadAndPull())) };
        case 'rebuild': await repo.rebuild(); return { ok: true };
        case 'clear': await clear(); return { ok: true };
        case 'api': {
          const method = String(r.method ?? '');
          if (!LOCAL_API_METHODS.includes(method)) return bad('That call is not available on this device.');
          const args = Array.isArray(r.args) ? r.args : [];
          const result = await (repo.api as unknown as Record<string, (...a: unknown[]) => Promise<unknown>>)[method](...args);
          return { ok: true, result };
        }
        default: return bad('unknown operation');
      }
    } catch (e) {
      return bad(e instanceof Error ? e.message : 'The on-device Repository failed.');
    }
  }

  return { open, record, forProfile, activeLanguage, chosenLanguages, afterSignIn, afterEnrolment, uploadAndPull, clear, handle, status };
}

export type LocalRepoService = ReturnType<typeof createLocalRepoService>;
