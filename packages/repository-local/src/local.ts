/**
 * The device-local Repository. See ../../../docs/ecosystem/REPOSITORY-LOCAL.md.
 *
 * `openLocalRepository` assembles the service's own parts in one process, on one device, for one anonymous learner:
 *   - the memory store, mirrored row by row into a `KeyValueArea` (./persist);
 *   - the real projection engine (rebuilt from the events on open, never stored);
 *   - the linguistic layer (./linguistics) with analysers passed in by the host;
 *   - the service's `handle`, reached through `createInProcessApi`, so every route a server client uses exists here with the same
 *     rules (validation, the learner's own data only, source-restriction capping), under a session made here.
 * There is no password and no account in the sense of the server: the local account row says `localOnly`, its email is `local@device`, and
 * the session token exists in memory only (a restart makes a new one).
 */
import { MAX_SURFACE_CHARS, surfaceFromEncounterUnitId } from '../../repository-contract/src';
import type { Account, GoEvent, Learner } from '../../repository-contract/src';
import { createProjectionEngine } from '../../repository-engine/src';
import { createMemoryStore } from '../../repository-store/src/memory';
import { openIndexedDbStore } from '../../repository-store/src/indexeddb';
import { createIndexedDbArea } from '../../repository-sync/src/idb-area';
import { splitStore } from './split-store';
import type { ConcreteStore } from '../../repository-store/src/rules';
import { createRepositoryApi } from '../../repository-service/src/api';
import type { RepositoryApi } from '../../repository-service/src/api';
import type { ServiceDeps } from '../../repository-service/src/deps';
import { handle } from '../../repository-service/src/handler';
import { createLock } from '../../repository-sync/src/area';
import type { KeyValueArea } from '../../repository-sync/src/area';
import { deviceCrypto, randomId, randomToken, sha256Hex } from './crypto';
import { createLocalLinguistics } from './linguistics';
import type { AdapterLike } from './linguistics';
import { FORMAT, keysFor, loadInto, persistingStore, removeRows, writeRows } from './persist';
import type { LoadReport, LocalMeta, PersistIO, PersistStats } from './persist';
import { allEvents, markersOf, markOwned, pendingFor, pull, upload } from './transfer';
import { cowArea, deleteBothDatabases, migrationKey, readState, runMigration, writeState } from './migrate';
import type { MigrationInject, MigrationState, Probe } from './migrate';
import type { TransferContext } from './transfer';

export interface LocalIdentity { learnerId: string; deviceId: string }

export interface LocalRepository {
  /** The same typed client as the HTTP one, backed in-process with a local session. */
  api: RepositoryApi;
  identity(): Promise<LocalIdentity>;
  /** Everything recorded locally, in order (for upload and export). */
  exportEvents(): Promise<GoEvent[]>;
  /** Sends every local event not yet uploaded to a signed-in remote API, idempotently (ids/dedupeKeys); remembers what was sent. */
  uploadTo(remote: RepositoryApi, opts?: { onProgress?: (sent: number, total: number) => void }): Promise<{ sent: number; duplicates: number; failed: number }>;
  /** Pulls the remote history for the same learner (after sign-in) so the device sees what other devices recorded; idempotent. */
  pullFrom(remote: RepositoryApi): Promise<{ added: number }>;
  rebuild(): Promise<void>;
  /** The learner's "clear local data". */
  clear(): Promise<void>;
  close(): Promise<void>;
}

export interface OpenLocalOptions {
  /** The key-value area of the present path. In IndexedDB mode (`idb`) it is not read or written. */
  area: KeyValueArea;
  /**
   * Opens the repository over IndexedDB instead (see ./split-store): the learner's and the linguistic layer's rows live in the IndexedDB store `name`, the
   * small rows (meta, upload markers, the pull cursor) in a second database `<name>-kv` (one database cannot hold both: each opener creates only its own
   * object stores at version 1). Nothing is loaded or folded at open. Without it, nothing changes.
   */
  idb?: { indexedDB: IDBFactory; name: string; keyRange?: typeof IDBKeyRange };
  /**
   * With `idb`: move a device that holds its history as rows in `area` into IndexedDB once, verified (./migrate, docs/ecosystem/LOADING-ARCHITECTURE-2026-11-10.md Stage 2).
   * `attempt` numbers the release's try: a migration that failed is not retried with the same number. The old rows are never modified; the one write
   * to `area` is the state row `<keyPrefix>migration`. Without `migrate`, `idb` opens straight in IndexedDB mode; without `idb` nothing changes.
   * `inject` is a test seam.
   */
  migrate?: { attempt: number; inject?: MigrationInject };
  /** ISO clock (the service stamps `recordedAt` and checks event times with it). Default: the system clock. */
  now?: () => string;
  /** Analysers by language id, read at call time (a later-loaded analyser is used). Albanian and Spanish are resolved by the service's own resolver. */
  adapters?: Readonly<Record<string, AdapterLike | undefined>>;
  /** Row prefix inside the area. Default `local-repo:`. */
  keyPrefix?: string;
  /** The device id of this installation, when the host already has one (the extension's); else a fresh one is made and kept. */
  deviceId?: string;
}

export const DEFAULT_PREFIX = 'local-repo:';
export const LOCAL_EMAIL = 'local@device';
const SESSION_YEARS = 100;

/** What the host may ask beyond the interface (status screens). Not part of `LocalRepository`. */
export interface LocalInspection {
  learnerId: string;
  deviceId: string;
  events: number;
  /** Events recorded here and not yet sent to any account. */
  pendingUpload: number;
  uploaded: number;
  fromRemote: number;
  persistence: PersistStats;
  /** Events the last upload held back because the account had no open enrolment in their language (they stay pending, and are not failures). */
  waiting: number;
  loaded: LoadReport;
  /** Characters of the rows this repository keeps in the area (keys and JSON); a lower bound of the bytes. */
  storedChars: number;
  /** Where the history lives: the present path's rows, IndexedDB, or (a switched device whose IndexedDB would not open) the frozen old rows under a memory-only write layer. */
  storage: StorageInfo;
}

export interface StorageInfo {
  mode: 'rows' | 'indexeddb' | 'rows-frozen';
  migration?: { state: 'switched' | 'failed'; at: string; attempt: number; events?: number; recovered?: boolean; reason?: string; ms?: number; importMs?: number; verifyMs?: number; verified?: Record<string, number> };
}

const inspectors = new WeakMap<LocalRepository, () => Promise<LocalInspection>>();
const probes = new WeakMap<LocalRepository, () => Probe>();
const owners = new WeakMap<LocalRepository, (ids: string[], remoteLearnerId: string) => Promise<void>>();

/**
 * Tells the repository that these events already belong to the account `remoteLearnerId` (the host's own sync sent them): `uploadTo` will not send
 * them again, to that account or to another. Events recorded while a learner is signed in are marked this way by the extension.
 */
export async function markEventsOwned(repo: LocalRepository, ids: string[], remoteLearnerId: string): Promise<void> {
  const f = owners.get(repo);
  if (!f) throw new Error('not a local repository');
  await f(ids, remoteLearnerId);
}

/** Counts and storage figures of an open local repository. */
export async function inspectLocal(repo: LocalRepository): Promise<LocalInspection> {
  const f = inspectors.get(repo);
  if (!f) throw new Error('not a local repository');
  return f();
}

interface State {
  meta: LocalMeta;
  io: PersistIO;
  store: ConcreteStore;
  engine: ReturnType<typeof createProjectionEngine>;
  linguistics: ReturnType<typeof createLocalLinguistics>;
  loaded: LoadReport;
  token: string;
  /** IndexedDB mode: what `clear()` and `close()` must release. */
  idb?: { area: KeyValueArea & { close(): void }; durable: ConcreteStore };
}

/** A stable object that forwards every property to whatever `get()` currently returns (so `clear()` can swap the state under an `api` the host already holds). */
function forward<T extends object>(get: () => T): T {
  return new Proxy({} as T, {
    get(_t, prop) {
      const target = get() as Record<PropertyKey, unknown>;
      const v = target[prop];
      return typeof v === 'function' ? (v as (...a: unknown[]) => unknown).bind(target) : v;
    },
  });
}

/** How one open was decided (see `openMigrating`). */
interface Core {
  /** What the repository is built over now. */
  mode: 'rows' | 'indexeddb';
  /** The area of the present path (the real one, or a copy-on-write view of it). */
  area: KeyValueArea;
  /** A switched device (its old rows are frozen): `clear()` removes them too. */
  switched: boolean;
  frozen: boolean;
  attempt: number;
  migration?: StorageInfo['migration'];
}

export async function openLocalRepository(opts: OpenLocalOptions): Promise<LocalRepository> {
  if (opts.idb && opts.migrate) return openMigrating(opts, opts.migrate);
  return openCore(opts, { mode: opts.idb ? 'indexeddb' : 'rows', area: opts.area, switched: false, frozen: false, attempt: 0 });
}

/**
 * The migration's state machine (./migrate). The only thing read from the old area before a decision is the state row and the identity row, by key.
 *   switched          -> IndexedDB; if it will not open, the present path over a copy-on-write view of the frozen rows (writes stay in memory: `rows-frozen`)
 *   no state, no meta -> a fresh device: IndexedDB, and the state row says switched (if IndexedDB will not open: the present path, nothing recorded)
 *   failed, same attempt -> the present path on the real area, no retry; another attempt number migrates again
 *   no state, meta    -> migrate; success gives the IndexedDB repository, failure the present path on the real area
 */
async function openMigrating(opts: OpenLocalOptions, mig: NonNullable<OpenLocalOptions['migrate']>): Promise<LocalRepository> {
  const prefix = opts.keyPrefix ?? DEFAULT_PREFIX;
  const keys = keysFor(prefix);
  const now = opts.now ?? ((): string => new Date().toISOString());
  const old = opts.area;
  const idb = opts.idb!;
  const rows = (area: KeyValueArea, over: Partial<Core> = {}): Promise<LocalRepository> => openCore(opts, { mode: 'rows', area, switched: false, frozen: false, attempt: mig.attempt, ...over });
  const durable = (over: Partial<Core> = {}): Promise<LocalRepository> => openCore(opts, { mode: 'indexeddb', area: old, switched: true, frozen: false, attempt: mig.attempt, ...over });

  const probeOf = async (repo: LocalRepository): Promise<Probe> => { const f = probes.get(repo); if (!f) throw new Error('not a local repository'); return f(); };
  const { idb: _i, migrate: _m, ...plain } = opts;
  void _i; void _m;
  const migrate = (): ReturnType<typeof runMigration> => runMigration({
    oldArea: old, prefix, idb, now, attempt: mig.attempt, ...(mig.inject ? { inject: mig.inject } : {}),
    openPresent: async (area) => probeOf(await openCore({ ...plain, area }, { mode: 'rows', area, switched: false, frozen: false, attempt: mig.attempt })),
    openIdb: async () => probeOf(await openCore({ ...plain, area: old, idb }, { mode: 'indexeddb', area: old, switched: true, frozen: false, attempt: mig.attempt })),
  });

  const state = await readState(old, prefix); // the first read: the state row, by key

  if (state?.state === 'switched') {
    if (state.clearing) await wipeOldRows(opts, prefix, state.attempt, false); // a `clear()` that did not finish: finish it, then start fresh
    const events = state.clearing ? 0 : state.events;
    const wasRecovered = !state.clearing && (state as { recovered?: boolean }).recovered === true;
    const info = { state: 'switched' as const, at: state.at, attempt: state.attempt, ...(events !== undefined ? { events } : {}), ...(wasRecovered ? { recovered: true } : {}) };
    try {
      // The browser may have discarded the IndexedDB data while the state still says `switched` with a history: the key-value database then holds no
      // identity row. If the frozen rows still hold one, the history is brought back from them (the same migration, the same attempt) instead of
      // starting an empty identity; if they hold none either, the fresh store is used as it is.
      if ((events ?? 0) > 0 && (await idbLostItsData(idb, keys.meta)) && (await old.get(keys.meta))[keys.meta] !== undefined) {
        const result = await migrate();
        if (result.ok) {
          const repo = repoOfProbe.get(result.probe)!;
          const at = now();
          try { await writeState(old, prefix, { state: 'switched', at, attempt: state.attempt, events: result.events, verified: result.verified, recovered: true } as MigrationState); } catch { /* the state stays as runMigration wrote it */ }
          setMigration(repo, { state: 'switched', at, attempt: state.attempt, events: result.events, recovered: true, ms: result.ms, importMs: result.importMs, verifyMs: result.verifyMs, verified: result.verified });
          return repo;
        }
        return await rows(old, { migration: { state: 'failed', at: now(), attempt: mig.attempt, reason: `recovery: ${result.reason}`, ms: result.ms } });
      }
      return await durable({ migration: info, attempt: state.attempt });
    } catch { /* IndexedDB will not open: the frozen rows answer, writes stay in memory */ }
    return rows(cowArea(old), { switched: true, frozen: true, attempt: state.attempt, migration: info });
  }
  const hasMeta = state === undefined && (await old.get(keys.meta))[keys.meta] !== undefined;
  if (!state && !hasMeta) {
    let repo: LocalRepository;
    try { repo = await durable(); } catch { return rows(old); }
    const at = now();
    try { await writeState(old, prefix, { state: 'switched', at, attempt: mig.attempt, events: 0 }); } catch { /* the next open is a fresh device again: the same */ }
    setMigration(repo, { state: 'switched', at, attempt: mig.attempt, events: 0 });
    return repo;
  }
  if (state?.state === 'failed' && state.attempt === mig.attempt) {
    return rows(old, { migration: { state: 'failed', at: state.at, attempt: state.attempt, ...(state.reason ? { reason: state.reason } : {}) } });
  }

  const result = await migrate();
  if (result.ok) {
    const repo = repoOfProbe.get(result.probe)!;
    setMigration(repo, { state: 'switched', at: now(), attempt: mig.attempt, events: result.events, ms: result.ms, importMs: result.importMs, verifyMs: result.verifyMs, verified: result.verified });
    return repo;
  }
  return rows(old, { migration: { state: 'failed', at: now(), attempt: mig.attempt, reason: result.reason, ms: result.ms } });
}

/** True when the small-rows database holds no identity row (never written, or discarded by the browser). Opening it creates it empty, as opening the repository would. */
async function idbLostItsData(idb: NonNullable<OpenLocalOptions['idb']>, metaKey: string): Promise<boolean> {
  const kv = await createIndexedDbArea({ indexedDB: idb.indexedDB, name: `${idb.name}-kv`, ...(idb.keyRange ? { keyRange: idb.keyRange } : {}) });
  try { return (await kv.get(metaKey))[metaKey] === undefined; } finally { kv.close(); }
}

const migrationSetters = new WeakMap<LocalRepository, (m: StorageInfo['migration']) => void>();
const repoOfProbe = new WeakMap<Probe, LocalRepository>();
function setMigration(repo: LocalRepository, m: StorageInfo['migration']): void { migrationSetters.get(repo)?.(m); }

/**
 * What `clear()` means once a device has switched, and the finish of one that was interrupted. The learner asked for the device's data to be deleted, so the
 * old rows go too (as the present path's `clear()` removes its rows), then both databases. The order is crash-safe: the state row first says `clearing`; the
 * next open finishes the job. The state row is rewritten last (`switched`, no events), so a fresh identity starts in IndexedDB mode and nothing is resurrected.
 */
async function wipeOldRows(opts: OpenLocalOptions, prefix: string, attempt: number, tolerateNoIdb: boolean): Promise<void> {
  const old = opts.area;
  const now = opts.now ?? ((): string => new Date().toISOString());
  await writeState(old, prefix, { state: 'switched', at: now(), attempt, events: 0, clearing: true });
  try { await deleteBothDatabases(opts.idb!.indexedDB, opts.idb!.name); } catch (e) { if (!tolerateNoIdb) throw e; } // a frozen device's IndexedDB would not open: there may be nothing to delete
  const mine = (await old.list(prefix)).filter((k) => k !== migrationKey(prefix));
  if (mine.length) await old.remove(mine);
  await writeState(old, prefix, { state: 'switched', at: now(), attempt, events: 0 });
}

async function openCore(opts: OpenLocalOptions, core: Core): Promise<LocalRepository> {
  const prefix = opts.keyPrefix ?? DEFAULT_PREFIX;
  const keys = keysFor(prefix);
  const now = opts.now ?? ((): string => new Date().toISOString());
  const lock = createLock();
  let state!: State;
  let closed = false;
  let lastWaiting = 0;

  async function build(keepDeviceId: string | undefined): Promise<State> {
    const stats: PersistStats = { writes: 0, failures: 0, pendingWrites: 0 };
    if (core.mode === 'indexeddb') return buildIdb(keepDeviceId, stats);
    const io: PersistIO = { area: core.area, prefix, keys, stats, pendingWrites: {} };
    const stored = (await core.area.get(keys.meta))[keys.meta] as Partial<LocalMeta> | undefined;
    const valid = !!stored && stored.format === FORMAT && typeof stored.learnerId === 'string' && typeof stored.deviceId === 'string' && typeof stored.accountId === 'string' && typeof stored.createdAt === 'string';
    const wantDevice = opts.deviceId ?? keepDeviceId;
    const meta: LocalMeta = valid
      ? { ...(stored as LocalMeta), ...(wantDevice ? { deviceId: wantDevice } : {}) }
      : { format: FORMAT, learnerId: randomId(), accountId: randomId(), deviceId: wantDevice ?? `local-${randomId().slice(0, 12)}`, createdAt: now() };
    if (!valid) io.pendingMeta = meta; // written with the first row that follows
    else if (meta.deviceId !== stored?.deviceId) await writeRows(io, { [keys.meta]: meta });

    const stamp: { current: string | undefined } = { current: undefined };
    const inner = createMemoryStore({ now: () => stamp.current ?? now() });
    const store = persistingStore(inner, io);

    const learner: Learner = { learnerId: meta.learnerId, createdAt: meta.createdAt };
    // The account row the in-process service needs. `localOnly` marks it as this device's and not an account anywhere; it has no password.
    const account = { accountId: meta.accountId, learnerId: meta.learnerId, email: LOCAL_EMAIL, createdAt: meta.createdAt, passwordHash: '!', localOnly: true } as Account & { passwordHash: string };
    await inner.putLearner(learner);
    await inner.putAccount(account);
    await inner.putDevice({ deviceId: meta.deviceId, learnerId: meta.learnerId, platform: 'local', registeredAt: meta.createdAt });

    const loaded = await loadInto(inner, io, meta.learnerId, stamp);

    const linguistics = createLocalLinguistics(store, { now, ...(opts.adapters ? { adapters: opts.adapters } : {}) });
    const engine = createProjectionEngine({ store, now });
    try { await engine.rebuild(meta.learnerId); } catch { /* the first read folds again */ }

    // the session: made here, no password; the token is kept in memory only
    const token = randomToken();
    const at = now();
    const expiresAt = new Date(Date.parse(at) + SESSION_YEARS * 365 * 24 * 3600 * 1000).toISOString();
    await inner.putSession({ sessionId: randomId(), accountId: meta.accountId, learnerId: meta.learnerId, deviceId: meta.deviceId, createdAt: at, expiresAt, tokenHash: sha256Hex(token) });
    return { meta, io, store, engine, linguistics, loaded, token };
  }

  /** The IndexedDB path: no persisting wrapper, no load, no rebuild. The only read at open is the meta row, by key. */
  async function buildIdb(keepDeviceId: string | undefined, stats: PersistStats): Promise<State> {
    const o = opts.idb!;
    const kr = o.keyRange ? { keyRange: o.keyRange } : {};
    const kv = await createIndexedDbArea({ indexedDB: o.indexedDB, name: `${o.name}-kv`, ...kr });
    let durable: ConcreteStore;
    try { durable = await openIndexedDbStore({ indexedDB: o.indexedDB, name: o.name, ...kr, now }); } catch (e) { kv.close(); throw e; }
    const io: PersistIO = { area: kv, prefix, keys, stats, pendingWrites: {} };
    const stored = (await kv.get(keys.meta))[keys.meta] as Partial<LocalMeta> | undefined;
    const valid = !!stored && stored.format === FORMAT && typeof stored.learnerId === 'string' && typeof stored.deviceId === 'string' && typeof stored.accountId === 'string' && typeof stored.createdAt === 'string';
    const wantDevice = opts.deviceId ?? keepDeviceId;
    const meta: LocalMeta = valid
      ? { ...(stored as LocalMeta), ...(wantDevice ? { deviceId: wantDevice } : {}) }
      : { format: FORMAT, learnerId: randomId(), accountId: randomId(), deviceId: wantDevice ?? `local-${randomId().slice(0, 12)}`, createdAt: now() };
    // unlike the present path the identity row is written at once (the store's own writes bypass any wrapper that could carry it along)
    if (!valid || meta.deviceId !== stored?.deviceId) await kv.set({ [keys.meta]: meta });

    const volatile = createMemoryStore({ now });
    const store = splitStore(durable, volatile);
    await store.putLearner({ learnerId: meta.learnerId, createdAt: meta.createdAt });
    await store.putAccount({ accountId: meta.accountId, learnerId: meta.learnerId, email: LOCAL_EMAIL, createdAt: meta.createdAt, passwordHash: '!', localOnly: true } as Account & { passwordHash: string });
    await store.putDevice({ deviceId: meta.deviceId, learnerId: meta.learnerId, platform: 'local', registeredAt: meta.createdAt });

    const linguistics = createLocalLinguistics(store, { now, ...(opts.adapters ? { adapters: opts.adapters } : {}) });
    const engine = createProjectionEngine({ store, now });

    const token = randomToken();
    const at = now();
    const expiresAt = new Date(Date.parse(at) + SESSION_YEARS * 365 * 24 * 3600 * 1000).toISOString();
    await store.putSession({ sessionId: randomId(), accountId: meta.accountId, learnerId: meta.learnerId, deviceId: meta.deviceId, createdAt: at, expiresAt, tokenHash: sha256Hex(token) });
    return { meta, io, store, engine, linguistics, loaded: { events: 0, skippedEvents: 0, renumbered: false }, token, idb: { area: kv, durable } };
  }

  const deleteDb = (name: string): Promise<void> => new Promise((resolve, reject) => {
    const q = opts.idb!.indexedDB.deleteDatabase(name);
    q.onsuccess = () => resolve();
    q.onerror = () => reject(q.error ?? new Error('could not delete the IndexedDB database'));
  });

  state = await build(undefined);

  const deps: ServiceDeps = {
    store: forward(() => state.store),
    engine: forward(() => state.engine),
    linguistics: forward(() => state.linguistics),
    crypto: deviceCrypto,
    now,
    applyLearnerCorrections: true, // this word list has one reader, the learner who corrects it
  };
  // The service's own typed client, wired straight to its handler (what `createInProcessApi` does) under an address that is not a web address: the handler
  // reads only the path, and nothing here can reach a network.
  const inProcess = ((input: RequestInfo | URL, init?: RequestInit): Promise<Response> => handle(new Request(input, init), deps)) as typeof fetch;
  const api = createRepositoryApi({ baseUrl: 'repository://device', fetch: inProcess, token: state.token });

  const project = async (): Promise<void> => { try { await state.engine.project(state.meta.learnerId); } catch { /* the next read folds again */ } };
  const register = async (events: GoEvent[]): Promise<void> => {
    const seen = new Set<string>();
    for (const e of events) {
      const ids = e.kind === 'EncounterRecorded' && (e.subject?.itemIds?.length ?? 0) <= 4 ? e.subject?.itemIds ?? [] : [undefined];
      const surfaces = e.kind === 'SelectionLookedUp'
        ? [(e.payload as { surface?: unknown }).surface]
        : ids.map((id) => {
          return surfaceFromEncounterUnitId(id, e.languageId);
        });
      for (const surface of surfaces) {
        if (typeof surface !== 'string' || !surface.trim() || surface.length > MAX_SURFACE_CHARS) continue;
        const k = `${e.languageId}\u0000${surface}`;
        if (seen.has(k)) continue;
        seen.add(k);
        try { await state.linguistics.resolveAndStore({ languageId: e.languageId, surface }); } catch { /* a later lookup registers it */ }
      }
    }
  };
  const context = (): TransferContext => ({ io: state.io, store: state.store, learnerId: state.meta.learnerId, now, project, register });

  const repo: LocalRepository = {
    api,
    async identity() { return { learnerId: state.meta.learnerId, deviceId: state.meta.deviceId }; },
    async exportEvents() { return allEvents(state.store, state.meta.learnerId); },
    uploadTo: (remote, o) => lock.run(async () => {
      const { waiting, ...result } = await upload(context(), remote, o ?? {});
      lastWaiting = waiting;
      return result;
    }),
    pullFrom: (remote) => lock.run(() => pull(context(), remote, randomId)),
    rebuild: () => lock.run(async () => { await state.engine.rebuild(state.meta.learnerId); }),
    clear: () => lock.run(async () => {
      if (core.switched) {
        // a switched device: the old rows are removed too (see wipeOldRows), then a fresh identity starts in IndexedDB mode
        const keep = state.meta.deviceId;
        state.idb?.area.close();
        await state.store.close();
        await wipeOldRows(opts, prefix, core.attempt, core.frozen);
        core.area = opts.area;
        core.frozen = false;
        core.mode = 'indexeddb';
        core.migration = { state: 'switched', at: now(), attempt: core.attempt, events: 0 };
        try { state = await build(keep); } catch { core.mode = 'rows'; core.switched = false; core.migration = undefined; state = await build(keep); }
        api.token = state.token;
        return;
      }
      if (state.idb) {
        // every learner table, the shared linguistic tables and the small rows go with the two databases (what the present path does row by row)
        const keep = state.meta.deviceId;
        state.idb.area.close();
        await state.idb.durable.close();
        await deleteDb(opts.idb!.name);
        await deleteDb(`${opts.idb!.name}-kv`);
        state = await build(keep);
        api.token = state.token;
        return;
      }
      const mine = await core.area.list(prefix);
      mine.push(...Object.keys(state.io.pendingWrites));
      if (state.io.pendingMeta) mine.push(state.io.keys.meta);
      await removeRows(state.io, mine);
      state = await build(state.meta.deviceId);
      api.token = state.token;
    }),
    async close() {
      if (closed) return;
      closed = true;
      await state.store.close();
      state.idb?.area.close();
    },
  };

  probes.set(repo, () => {
    const p: Probe = {
      store: state.store, learnerId: state.meta.learnerId, area: state.io.area,
      async inspect() { const i = await inspectLocal(repo); return { events: i.events, pendingUpload: i.pendingUpload, uploaded: i.uploaded, fromRemote: i.fromRemote }; },
      rebuild: () => repo.rebuild(),
      close: () => repo.close(),
    };
    repoOfProbe.set(p, repo);
    return p;
  });
  migrationSetters.set(repo, (m) => { core.migration = m; });
  owners.set(repo, (ids, remoteLearnerId) => markOwned(context(), ids, remoteLearnerId));
  inspectors.set(repo, async () => {
    const c = context();
    const events = await allEvents(state.store, state.meta.learnerId);
    const uploadable = events.filter((e) => e.producer.app !== 'repository');
    const markers = await markersOf(c, uploadable.map((e) => e.id));
    let uploaded = 0;
    let fromRemote = 0;
    for (const m of markers.values()) { if (m.from !== undefined) fromRemote += 1; else uploaded += 1; }
    // IndexedDB mode: only the key-value rows (meta, upload markers, pull cursor) are measured; the store's own rows are not read back for a count.
    const kvArea = state.io.area;
    const all = await kvArea.get(await kvArea.list(prefix));
    let storedChars = 0;
    for (const [k, v] of Object.entries(all)) { try { storedChars += k.length + JSON.stringify(v).length; } catch { /* an unserialisable row counts nothing */ } }
    return {
      learnerId: state.meta.learnerId, deviceId: state.meta.deviceId, events: events.length,
      pendingUpload: (await pendingFor(c)).length, uploaded, fromRemote, persistence: state.idb ? { writes: 0, failures: 0, pendingWrites: 0 } : { ...state.io.stats }, waiting: lastWaiting, loaded: state.loaded, storedChars,
      storage: { mode: core.mode === 'indexeddb' ? 'indexeddb' : core.frozen ? 'rows-frozen' : 'rows', ...(core.migration ? { migration: { ...core.migration } } : {}) },
    };
  });
  return repo;
}
