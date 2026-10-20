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
  area: KeyValueArea;
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
}

const inspectors = new WeakMap<LocalRepository, () => Promise<LocalInspection>>();
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

export async function openLocalRepository(opts: OpenLocalOptions): Promise<LocalRepository> {
  const prefix = opts.keyPrefix ?? DEFAULT_PREFIX;
  const keys = keysFor(prefix);
  const now = opts.now ?? ((): string => new Date().toISOString());
  const lock = createLock();
  let state!: State;
  let closed = false;
  let lastWaiting = 0;

  async function build(keepDeviceId: string | undefined): Promise<State> {
    const stats: PersistStats = { writes: 0, failures: 0, pendingWrites: 0 };
    const io: PersistIO = { area: opts.area, prefix, keys, stats, pendingWrites: {} };
    const stored = (await opts.area.get(keys.meta))[keys.meta] as Partial<LocalMeta> | undefined;
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

  state = await build(undefined);

  const deps: ServiceDeps = {
    store: forward(() => state.store),
    engine: forward(() => state.engine),
    linguistics: forward(() => state.linguistics),
    crypto: deviceCrypto,
    now,
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
      const mine = await opts.area.list(prefix);
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
    },
  };

  owners.set(repo, (ids, remoteLearnerId) => markOwned(context(), ids, remoteLearnerId));
  inspectors.set(repo, async () => {
    const c = context();
    const events = await allEvents(state.store, state.meta.learnerId);
    const uploadable = events.filter((e) => e.producer.app !== 'repository');
    const markers = await markersOf(c, uploadable.map((e) => e.id));
    let uploaded = 0;
    let fromRemote = 0;
    for (const m of markers.values()) { if (m.from !== undefined) fromRemote += 1; else uploaded += 1; }
    const all = await opts.area.get(await opts.area.list(prefix));
    let storedChars = 0;
    for (const [k, v] of Object.entries(all)) { try { storedChars += k.length + JSON.stringify(v).length; } catch { /* an unserialisable row counts nothing */ } }
    return {
      learnerId: state.meta.learnerId, deviceId: state.meta.deviceId, events: events.length,
      pendingUpload: (await pendingFor(c)).length, uploaded, fromRemote, persistence: { ...state.io.stats }, waiting: lastWaiting, loaded: state.loaded, storedChars,
    };
  });
  return repo;
}
