/**
 * The device-local Repository inside the background worker: GoLearn without an account.
 *
 * ONE instance per extension, here: `openLocalRepository` over IndexedDB (databases `golearn-repository` and `golearn-repository-kv`) when the worker has it, after a
 * one-time verified move of the older rows; else over `chrome.storage.local` (rows under `golearn:repo:`, which also stay, frozen, after the move and hold the
 * migration's state row). Extension pages reach it
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
import { inspectLocal, markEventsOwned, openLocalRepository, uploadWaiting, type LocalRepository, type OpenLocalOptions, type StorageInfo } from '../../../repository-local/src';
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
/**
 * A small copy of the device's open enrolments (2026-11-09), kept whenever they are read: the worker answers which language the learner reads in
 * from it while the device Repository is still opening (opening reads the whole history: 10 s and more after the worker slept, with a large one,
 * and every lookup waited for it to know its language).
 */
export const ENROLMENTS_KEY = 'golearn:local-enrolments';
interface EnrolmentSummary { enrolmentId: string; languageId: string; startedAt: string; explicit: boolean }
const FORMAT = 'golearn-local-export@1';

/**
 * The release's migration number (Stage 2, docs/ecosystem/LOADING-ARCHITECTURE-2026-11-10.md). A device whose one-time move into IndexedDB failed does not try
 * again with the same number: raise it to make those devices try again.
 */
export const LOCAL_MIGRATION_ATTEMPT = 1;
/** The two IndexedDB databases are `golearn-repository` and `golearn-repository-kv`. */
export const LOCAL_IDB_NAME = 'golearn-repository';
/** The browser stops a Manifest V3 worker after about 30 s without an extension event (IndexedDB work does not count): ping the extension API this often while the open runs. */
export const KEEP_ALIVE_MS = 20_000;
/**
 * Set while the first pull of an account's history has not reached its head (a sign-in's upload-and-pull started and did not finish: the browser stopped the worker, the
 * network dropped). The next successful sync round of a worker that finds it runs the upload-and-pull again, which resumes from the pull cursor kept per page.
 */
export const PULL_OPEN_KEY = 'golearn:local-pull-open';

/**
 * One 20 s extension-API touch shared by everything that runs long in the worker (the Repository's open, the upload-and-pull, a sync round): `hold()` starts it
 * (if it is not running) and returns the release; it stops when the last holder has released.
 */
export function createWorkerHold(ping: (() => void) | undefined): () => () => void {
  let holders = 0;
  let timer: ReturnType<typeof setInterval> | undefined;
  return () => {
    if (!ping) return () => undefined;
    holders += 1;
    if (timer === undefined) timer = globalThis.setInterval(() => { try { ping(); } catch { /* a convenience */ } }, KEEP_ALIVE_MS);
    let released = false;
    return () => {
      if (released) return;
      released = true;
      holders -= 1;
      if (holders <= 0 && timer !== undefined) { globalThis.clearInterval(timer); timer = undefined; holders = 0; }
    };
  };
}

export interface LocalRepoServiceOptions {
  area: StorageArea;
  deviceId: () => Promise<string>;
  session: SessionManager;
  packs: PackProvider;
  now: () => number;
  /** The worker's IndexedDB (the repository opens over it, and moves the old rows into it once). Absent: the rows in `area`, as before. */
  idb?: { indexedDB: IDBFactory; keyRange?: typeof IDBKeyRange };
  /** Called every 20 s while the repository is opening (a migration can take many seconds), so the browser does not stop the worker. */
  keepAlive?: () => void;
  /** The worker's shared hold (see `createWorkerHold`); without it the service makes its own from `keepAlive`. */
  hold?: () => () => void;
  /** Test seam: passed to the migration as `migrate.inject`. */
  migrationInject?: NonNullable<OpenLocalOptions['migrate']>['inject'];
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
  const hold = opts.hold ?? createWorkerHold(opts.keepAlive);
  /** Events may be waiting for upload: unknown until counted once (a whole-log read), then kept (true after a local record, false after a clean upload). */
  let pendingHint: boolean | undefined;
  let transferring = 0;
  let opening: Promise<LocalRepository | undefined> | undefined;
  /** The repository once it has opened (until then the enrolment summary answers). */
  let opened: LocalRepository | undefined;
  let summaryWritten = '';
  let signInWork: Promise<unknown> = Promise.resolve();
  const enrolmentOf = new Map<string, string>();

  // read at call time, so an analyser the worker loads later is used; the worker itself carries Albanian only
  const adapters = new Proxy({}, { get: (_t, k) => (typeof k === 'string' ? getAnalyser(k) : undefined) }) as Record<string, LanguageAdapter | undefined>;

  async function start(): Promise<LocalRepository | undefined> {
    // the migration of a large history takes seconds, and the browser stops a worker that sees no extension event for about 30 s
    const release = hold();
    try {
      const idb = opts.idb;
      return await openLocalRepository({
        area: adaptStorageArea(opts.area), keyPrefix: LOCAL_PREFIX, adapters, deviceId: await opts.deviceId(),
        ...(idb ? {
          idb: { indexedDB: idb.indexedDB, name: LOCAL_IDB_NAME, ...(idb.keyRange ? { keyRange: idb.keyRange } : {}) },
          migrate: { attempt: LOCAL_MIGRATION_ATTEMPT, ...(opts.migrationInject ? { inject: opts.migrationInject } : {}) },
        } : {}),
      });
    } catch { return undefined; } finally { release(); }
  }
  /** The repository, opened once; a failed open is tried again on the next call. */
  function open(): Promise<LocalRepository | undefined> {
    if (!opening) {
      const p = start();
      opening = p;
      void p.then((r) => { if (r && opening === p) opened = r; if (!r && opening === p) opening = undefined; });
    }
    return opening;
  }

  // ───────────── enrolments ─────────────

  async function openEnrolments(repo: LocalRepository): Promise<Enrolment[]> {
    const r = await repo.api.listEnrolments();
    const open = r.ok ? r.data.enrolments.filter((e) => !e.endedAt) : [];
    if (r.ok) {
      const summary: EnrolmentSummary[] = open.map((e) => ({ enrolmentId: e.enrolmentId, languageId: e.languageId, startedAt: e.startedAt, explicit: isExplicit(e) }));
      const json = JSON.stringify(summary);
      if (json !== summaryWritten) { summaryWritten = json; try { await opts.area.set({ [ENROLMENTS_KEY]: summary }); } catch { /* a convenience */ } }
    }
    return open;
  }

  /** The kept enrolment summary, while the repository has not opened yet in this worker; undefined once it has, or when there is none. */
  async function summaryWhileOpening(): Promise<EnrolmentSummary[] | undefined> {
    if (opened) return undefined;
    let kept: unknown;
    try { kept = (await opts.area.get(ENROLMENTS_KEY))[ENROLMENTS_KEY]; } catch { kept = undefined; }
    if (!Array.isArray(kept)) return undefined;
    void open(); // it opens meanwhile, for the questions that need it
    return kept.filter((e): e is EnrolmentSummary => !!e && typeof e.enrolmentId === 'string' && typeof e.languageId === 'string' && typeof e.startedAt === 'string');
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
    const kept = await summaryWhileOpening();
    if (kept) {
      const explicit = kept.filter((e) => e.explicit).sort((a, b) => a.startedAt.localeCompare(b.startedAt));
      if (!explicit.length) return undefined;
      const chosen = (await opts.area.get(ACTIVE_KEY))[ACTIVE_KEY];
      return (explicit.find((e) => e.enrolmentId === chosen) ?? explicit.at(-1)!).languageId;
    }
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
    const kept = await summaryWhileOpening();
    if (kept) return [...new Set(kept.map((e) => e.languageId))];
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
        if (attributed === 'local') pendingHint = true;
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
    const release = hold(); // a long first pull must not outlast the browser's idle limit (a reading page's keep-warm may not be open)
    transferring += 1;
    try {
      const repo = await open();
      if (!repo) return { ok: false, skipped: 'unavailable' };
      const a = await opts.session.authenticated();
      if (!a) return { ok: false, skipped: 'not-connected' };
      // marked before anything is sent: a worker stopped from here on finds it on its next sync round and runs this again (the pull resumes from its cursor)
      try { await opts.area.set({ [PULL_OPEN_KEY]: true }); } catch { /* a convenience: the learner's next upload resumes as well */ }
      const raw = await repo.uploadTo(a.api);
      const upload = { sent: raw.sent, duplicates: raw.duplicates, failed: raw.failed, waiting: uploadWaiting(repo) };
      pendingHint = upload.failed > 0 || upload.waiting > 0;
      let complete = false;
      const { added } = await repo.pullFrom(a.api, { onEnd: (c) => { complete = c; } });
      if (complete) { try { await opts.area.remove(PULL_OPEN_KEY); } catch { /* the next round finds it and does one cheap pull */ } }
      const status: UploadStatus = { at: opts.now(), ...upload, pulled: added, ...(upload.failed ? { error: `${upload.failed} event${upload.failed === 1 ? '' : 's'} could not be sent; they will be tried again` } : {}) };
      try { await opts.area.set({ [UPLOAD_STATUS_KEY]: status }); } catch { /* a convenience */ }
      return { ok: upload.failed === 0, upload, pulled: added };
    } catch (e) {
      const error = e instanceof Error ? e.message : String(e);
      try { await opts.area.set({ [UPLOAD_STATUS_KEY]: { at: opts.now(), sent: 0, duplicates: 0, failed: 0, pulled: 0, error } satisfies UploadStatus }); } catch { /* a convenience */ }
      return { ok: false, error };
    } finally { transferring -= 1; release(); }
  }

  /**
   * Called after a successful sync round: when an upload-and-pull was begun and did not reach the account's head (see PULL_OPEN_KEY), runs it again; it continues from the
   * pull cursor, so only the events after it are asked for. One cheap read of a small row when nothing is open. Never throws.
   */
  async function resumePull(): Promise<void> {
    try {
      if (transferring > 0) return; // one is running (the sign-in's): it finishes the job
      if (!(await opts.area.get(PULL_OPEN_KEY))[PULL_OPEN_KEY]) return;
      signInWork = signInWork.then(() => uploadAndPull(), () => uploadAndPull());
      await signInWork;
    } catch { /* the next round tries again */ }
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
      if (!repo) return;
      // counted once (a whole-log read), then kept: a language switch on a large history no longer reads it all to learn that nothing is waiting
      if (pendingHint === undefined) pendingHint = (await inspectLocal(repo)).pendingUpload > 0;
      if (!pendingHint) return;
      await uploadAndPull();
    } catch { /* the next sign-in or upload tries again */ }
  }

  // ───────────── clearing ─────────────

  async function clear(): Promise<void> {
    const repo = await open();
    enrolmentOf.clear();
    summaryWritten = '';
    pendingHint = undefined;
    try { await opts.area.remove([ACTIVE_KEY, UPLOAD_STATUS_KEY, ENROLMENTS_KEY, PULL_OPEN_KEY]); } catch { /* absent */ }
    if (repo) { await repo.clear(); return; }
    // The repository would not open (so it cannot clear itself): take the learner's data away by hand, both databases first, then the frozen rows. With no
    // state row left, the next open is a fresh device in IndexedDB. Without IndexedDB nothing was ever stored anywhere but the rows.
    if (opts.idb) {
      for (const name of [LOCAL_IDB_NAME, `${LOCAL_IDB_NAME}-kv`]) {
        await new Promise<void>((resolve) => { const q = opts.idb!.indexedDB.deleteDatabase(name); q.onsuccess = () => resolve(); q.onerror = () => resolve(); q.onblocked = () => resolve(); });
      }
    }
    const mine = await opts.area.get(null).then((all) => Object.keys(all).filter((k) => k.startsWith(LOCAL_PREFIX))).catch(() => [] as string[]);
    if (mine.length) await opts.area.remove(mine);
  }

  // ───────────── the page-facing operations ─────────────

  async function status(): Promise<LocalRepoStatus & { storage?: StorageInfo }> {
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
      storage: info.storage, // developer diagnostics: where the history lives, and how the move into IndexedDB went
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
        case 'enrol': { const out = await enrol(repo, r as Extract<LocalRepoRequest, { op: 'enrol' }>); await openEnrolments(repo); return out; }
        case 'select': {
          const e = (await openEnrolments(repo)).find((x) => x.enrolmentId === r.enrolmentId);
          if (!e || !isExplicit(e)) return bad('That enrolment is not open.');
          await opts.area.set({ [ACTIVE_KEY]: e.enrolmentId });
          return { ok: true, enrolment: view(e, e.enrolmentId) };
        }
        case 'end': {
          const ended = await repo.api.endEnrolment(String(r.enrolmentId ?? ''));
          enrolmentOf.clear();
          await openEnrolments(repo);
          return ended.ok ? { ok: true } : bad(ended.message || ended.error);
        }
        case 'upload': return { ...(await lock.run(() => uploadAndPull())) };
        case 'rebuild': await repo.rebuild(); return { ok: true };
        case 'clear': await clear(); return { ok: true };
        case 'api': {
          const method = String(r.method ?? '');
          if (!LOCAL_API_METHODS.includes(method)) return bad('That call is not available on this device.');
          const args = Array.isArray(r.args) ? r.args : [];
          if (/^(append|submit)/.test(method)) pendingHint = true; // an extension page wrote events here: they may wait for an upload
          if (method === 'clear') pendingHint = undefined;
          const result = await (repo.api as unknown as Record<string, (...a: unknown[]) => Promise<unknown>>)[method](...args);
          if (/nrol/.test(method)) await openEnrolments(repo);
          return { ok: true, result };
        }
        default: return bad('unknown operation');
      }
    } catch (e) {
      return bad(e instanceof Error ? e.message : 'The on-device Repository failed.');
    }
  }

  /** True while the repository is opening or migrating (read-only; used by the worker's self-update to not reload mid-open). */
  const busy = (): boolean => !!opening && !opened;

  return { open, record, forProfile, activeLanguage, chosenLanguages, afterSignIn, afterEnrolment, resumePull, uploadAndPull, clear, handle, status, busy };
}

export type LocalRepoService = ReturnType<typeof createLocalRepoService>;
