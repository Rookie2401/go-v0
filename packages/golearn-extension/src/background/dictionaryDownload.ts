/**
 * "Download for offline use": the setup page asks the worker to keep a language's dictionary on the device, so that a word never looked
 * up before still has its meaning with no connection. Extension pages only (core.ts: PAGE_ONLY).
 *
 * What is fetched: the dictionary's own manifest and its meaning files (`shardFiles`), the frequency file when the manifest says there
 * is one, and the forms index (its manifest and the files that lists), the files `gloss.ts` and `forms.ts` read. NOT the full entries
 * (`full/`, card level 2) and NOT the reverse index. Where the files are kept: dictionaryStore.ts (IndexedDB), as fetched.
 *
 * Progress lives in one small chrome.storage row per language (`golearn:dictionary-download:<lang>`), so the setup page can poll it and a
 * worker that was stopped can carry on: a `running` row with no live run is resumed on the next sync round, or when the page asks for the
 * status. Nothing starts at worker start. What is stored is the truth for "which files are done": a resume skips every file already kept
 * for the same dictionary revision.
 */
import type { StorageArea } from '../platform';
import type { DictionaryStore } from './dictionaryStore';
import type { GlossService } from './gloss';

export const DOWNLOAD_KEY_PREFIX = 'golearn:dictionary-download:';
export const downloadKey = (languageId: string): string => `${DOWNLOAD_KEY_PREFIX}${languageId}`;

export type DownloadState = 'queued' | 'running' | 'complete' | 'failed' | 'cancelled';

/** The row kept in chrome.storage. */
interface DownloadRow {
  state: DownloadState;
  /** The dictionary revision (manifest `id`) the kept files belong to; while an update runs, the OLD one until it completes. */
  revision?: string;
  /** The revision being fetched now. */
  target?: string;
  /** The location the files came from (information only). */
  base?: string;
  done: number;
  total: number;
  bytes: number;
  startedAt?: string;
  finishedAt?: string;
  error?: string;
}

/** What the setup page is told. */
export interface DownloadStatus {
  languageId: string;
  state: 'none' | DownloadState;
  /** Complete, but the dictionary on the server has a newer revision than the kept files. */
  outOfDate: boolean;
  done: number;
  total: number;
  bytes: number;
  revision?: string;
  startedAt?: string;
  finishedAt?: string;
  error?: string;
}

export interface DownloadOptions {
  area: StorageArea;
  gloss: Pick<GlossService, 'dictionaryAt'>;
  /** The network (the worker's own fetch); files are fetched with it directly, never through the chrome.storage cache. */
  fetch: typeof fetch;
  store: DictionaryStore;
  /** The worker's keep-alive hold (`createWorkerHold`): held for as long as a download runs. */
  hold: () => () => void;
  now: () => number;
  /** The dictionary folder of a language relative to its location (`dict/sq`), or undefined when it has none. */
  dictionaryRel: (languageId: string) => string | undefined;
  /** Every language that could have a download (for a resume after a restart). */
  languages: () => string[];
  concurrency?: number;
  /** Waits between the attempts at one file (tests pass an immediate one). */
  sleep?: (ms: number) => Promise<void>;
}

export const DOWNLOAD_CONCURRENCY = 4;
const ATTEMPTS = 3;
const PROGRESS_EVERY = 8;
const FILE_NAME = /^[A-Za-z0-9][A-Za-z0-9._-]{0,80}$/;
const FRESH_MANIFEST_MS = 15_000;

interface Run { cancelled: boolean; ctl: AbortController; promise: Promise<void> }
interface Planned { id: string; name: string; text?: string }

const QUOTA = 'There is not enough room on this device for the whole dictionary. What was saved still works.';
const SAVE_FAILED = 'The dictionary files could not be saved on this device. What was saved still works.';
const CONNECTION = 'The connection was lost before the download finished. Try again to carry on where it stopped.';
const MISSING = 'A file of the dictionary is not available from the server. Try again later.';
const OFFLINE = 'The dictionary could not be reached. Check the connection and try again.';

class Failure extends Error {}

const fileId = (rel: string, name: string): string => `${rel}/${name}`.replace(/\.json(\.gz)?$/i, '');
const isQuota = (e: unknown): boolean => !!e && typeof e === 'object' && ((e as { name?: unknown }).name === 'QuotaExceededError' || /quota/i.test(String((e as { message?: unknown }).message ?? '')));
const namesOf = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string' && FILE_NAME.test(x)) : []);

export function createDictionaryDownload(opts: DownloadOptions) {
  const runs = new Map<string, Run>();
  const concurrency = Math.max(1, opts.concurrency ?? DOWNLOAD_CONCURRENCY);
  const sleep = opts.sleep ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));

  async function readRow(languageId: string): Promise<DownloadRow | undefined> {
    try {
      const v = (await opts.area.get(downloadKey(languageId)))[downloadKey(languageId)] as Partial<DownloadRow> | undefined;
      return v && typeof v === 'object' && typeof v.state === 'string' ? ({ done: 0, total: 0, bytes: 0, ...v } as DownloadRow) : undefined;
    } catch { return undefined; }
  }
  async function writeRow(languageId: string, row: DownloadRow): Promise<void> {
    try { await opts.area.set({ [downloadKey(languageId)]: row }); } catch { /* the page then shows the last row it could read; the files are the truth */ }
  }

  /** The `id` of the dictionary manifest the worker last stored for the language (a local read). */
  async function storedRevision(languageId: string): Promise<string | undefined> {
    const rel = opts.dictionaryRel(languageId);
    if (!rel) return undefined;
    const key = `pack:shard:${rel}/manifest`;
    try {
      const row = (await opts.area.get(key))[key] as { text?: unknown } | undefined;
      const id = typeof row?.text === 'string' ? (JSON.parse(row.text) as { id?: unknown }).id : undefined;
      return typeof id === 'string' ? id : undefined;
    } catch { return undefined; }
  }

  /** The dictionary's current manifest from the network, which also refreshes the stored manifest row (a short wait; failures are silent). */
  async function refreshManifest(languageId: string): Promise<void> {
    try {
      const where = await opts.gloss.dictionaryAt(languageId);
      if (!where.ok) return;
      await where.fetch.network(`${where.base.replace(/\/+$/, '')}/${where.rel}/manifest.json`, { timeoutMs: 4000 });
    } catch { /* offline: the stored one stands */ }
  }

  async function status(languageId: string, check = false): Promise<DownloadStatus> {
    const row = await readRow(languageId);
    if (!row) return { languageId, state: 'none', outOfDate: false, done: 0, total: 0, bytes: 0 };
    if (row.state === 'running' || row.state === 'queued') resumeOne(languageId, row);
    let outOfDate = false;
    if (row.state === 'complete' && row.revision) {
      if (check) await refreshManifest(languageId);
      const now = await storedRevision(languageId);
      outOfDate = !!now && now !== row.revision;
    }
    return {
      languageId, state: row.state, outOfDate, done: row.done, total: row.total, bytes: row.bytes,
      ...(row.revision ? { revision: row.revision } : {}), ...(row.startedAt ? { startedAt: row.startedAt } : {}), ...(row.finishedAt ? { finishedAt: row.finishedAt } : {}), ...(row.error ? { error: row.error } : {}),
    };
  }

  async function execute(languageId: string, run: Run, prior: DownloadRow | undefined): Promise<void> {
    const release = opts.hold();
    const startedAt = prior?.startedAt ?? new Date(opts.now()).toISOString();
    const row: DownloadRow = { state: 'running', done: 0, total: 0, bytes: 0, startedAt, ...(prior?.revision && prior.state !== 'failed' && prior.state !== 'cancelled' ? { revision: prior.revision } : {}) };
    try {
      const where = await opts.gloss.dictionaryAt(languageId);
      if (!where.ok) throw new Failure(where.reason === 'offline' ? OFFLINE : 'GoLearn has no dictionary to download for this language.');
      const root = `${where.base.replace(/\/+$/, '')}/${where.rel}`;
      row.base = where.base;

      // the manifests are read from the network now (so a newer revision is seen), which also refreshes the rows the reader uses
      const manifestRes = await where.fetch.network(`${root}/manifest.json`, { timeoutMs: FRESH_MANIFEST_MS }).catch(() => undefined);
      if (!manifestRes) throw new Failure(OFFLINE);
      if (!manifestRes.ok) throw new Failure(manifestRes.status >= 500 ? OFFLINE : MISSING);
      const manifestText = await manifestRes.text();
      let manifest: { id?: unknown; shardFiles?: unknown; hasFrequency?: unknown };
      try { manifest = JSON.parse(manifestText) as typeof manifest; } catch { throw new Failure(MISSING); }
      if (typeof manifest.id !== 'string' || !manifest.id) throw new Failure(MISSING);
      const target = manifest.id;
      row.target = target;
      if (!row.revision) row.revision = target; // a first download: the files being written are the ones to serve

      const plan: Planned[] = [{ id: `${where.rel}/manifest`, name: 'manifest.json', text: manifestText }];
      if (manifest.hasFrequency === true) plan.push({ id: fileId(where.rel, 'frequency.json'), name: 'frequency.json' });
      for (const name of namesOf(manifest.shardFiles)) plan.push({ id: fileId(where.rel, name), name });
      const formsRes = await where.fetch.network(`${root}/forms/manifest.json`, { timeoutMs: FRESH_MANIFEST_MS }).catch(() => undefined);
      if (!formsRes) throw new Failure(OFFLINE);
      if (formsRes.ok) {
        const formsText = await formsRes.text();
        plan.push({ id: `${where.rel}/forms/manifest`, name: 'forms/manifest.json', text: formsText });
        let forms: { shardFiles?: unknown } = {};
        try { forms = JSON.parse(formsText) as typeof forms; } catch { /* an unreadable forms manifest: its files are not fetched */ }
        for (const name of namesOf(forms.shardFiles)) plan.push({ id: fileId(where.rel, `forms/${name}`), name: `forms/${name}` });
      } else if (formsRes.status !== 404 && formsRes.status !== 410) throw new Failure(formsRes.status >= 500 ? OFFLINE : MISSING);

      // what is already kept for this revision is skipped
      const kept = new Map((await opts.store.list(languageId)).map((f) => [f.id, f]));
      const todo: Planned[] = [];
      row.total = plan.length;
      for (const f of plan) {
        const have = kept.get(f.id);
        if (have && have.revision === target) { row.done += 1; row.bytes += have.size; } else todo.push(f);
      }
      let sinceWrite = 0;
      const flush = async (force = false): Promise<void> => {
        sinceWrite += 1;
        if (!force && sinceWrite < PROGRESS_EVERY) return;
        sinceWrite = 0;
        await writeRow(languageId, row);
      };
      await writeRow(languageId, row);

      let failure: Failure | undefined;
      let next = 0;
      const store = async (f: Planned, bytes: Uint8Array): Promise<void> => {
        try { await opts.store.write({ id: f.id, lang: languageId, revision: target, size: bytes.length, bytes }); }
        catch (e) { throw new Failure(isQuota(e) ? QUOTA : SAVE_FAILED); }
        row.done += 1; row.bytes += bytes.length;
        await flush();
      };
      const fetchOne = async (f: Planned): Promise<Uint8Array> => {
        const url = `${root}/${f.name}`;
        for (let attempt = 1; ; attempt++) {
          if (run.cancelled) throw new Failure('cancelled');
          let again = false;
          try {
            const res = await opts.fetch(url, { signal: run.ctl.signal });
            if (res.ok) return new Uint8Array(await res.arrayBuffer());
            if (res.status < 500) throw new Failure(MISSING);
            again = true;
          } catch (e) {
            if (e instanceof Failure) throw e;
            if (run.cancelled) throw new Failure('cancelled');
            again = true;
          }
          if (again && attempt >= ATTEMPTS) throw new Failure(CONNECTION);
          await sleep(attempt * 600);
        }
      };
      const worker = async (): Promise<void> => {
        while (!failure && !run.cancelled) {
          const f = todo[next++];
          if (!f) return;
          try {
            const bytes = f.text !== undefined ? new TextEncoder().encode(f.text) : await fetchOne(f);
            await store(f, bytes);
          } catch (e) { failure ??= e instanceof Failure ? e : new Failure(CONNECTION); return; }
        }
      };
      await Promise.all(Array.from({ length: Math.min(concurrency, todo.length) }, worker));

      if (run.cancelled && !(failure && failure.message !== 'cancelled')) {
        await writeRow(languageId, { ...row, state: 'cancelled' });
        return;
      }
      if (failure) throw failure;
      // complete: the files of an older revision (and files the new revision no longer lists) go
      await opts.store.removeLanguage(languageId, target);
      // The copies fetched one by one as the learner read (chrome.storage rows) are read BEFORE this store and are never refreshed, so a
      // row of an older revision would hide the file just downloaded. The rows this download replaces go (their space with them); the two
      // manifests stay, the worker finds the dictionary by them. Full entries and the reverse index are not part of a download and are not touched.
      try { await opts.area.remove(plan.filter((f) => f.text === undefined).map((f) => `pack:shard:${f.id}`)); } catch { /* they stay: the kept copy is still complete */ }
      const { target: _t, ...rest } = row;
      await writeRow(languageId, { ...rest, state: 'complete', revision: target, done: row.total, finishedAt: new Date(opts.now()).toISOString() });
    } catch (e) {
      const reason = e instanceof Failure ? e.message : CONNECTION;
      if (run.cancelled || reason === 'cancelled') await writeRow(languageId, { ...row, state: 'cancelled' });
      else await writeRow(languageId, { ...row, state: 'failed', error: reason, finishedAt: new Date(opts.now()).toISOString() });
    } finally { release(); }
  }

  function begin(languageId: string, prior: DownloadRow | undefined): void {
    if (runs.has(languageId)) return;
    const run: Run = { cancelled: false, ctl: new AbortController(), promise: Promise.resolve() };
    runs.set(languageId, run);
    run.promise = execute(languageId, run, prior).catch(() => undefined).finally(() => { if (runs.get(languageId) === run) runs.delete(languageId); });
  }

  function resumeOne(languageId: string, row: DownloadRow): void {
    if (!runs.has(languageId) && (row.state === 'running' || row.state === 'queued')) begin(languageId, row);
  }

  return {
    status,

    async start(languageId: string): Promise<DownloadStatus> {
      if (!opts.dictionaryRel(languageId)) return { languageId, state: 'failed', outOfDate: false, done: 0, total: 0, bytes: 0, error: 'GoLearn has no dictionary to download for this language.' };
      if (runs.has(languageId)) return status(languageId);
      const prior = await readRow(languageId);
      if (prior?.state === 'complete' && !(await status(languageId)).outOfDate) return status(languageId);
      await writeRow(languageId, { ...(prior?.state === 'complete' ? prior : {}), state: 'queued', done: prior?.done ?? 0, total: prior?.total ?? 0, bytes: prior?.bytes ?? 0, startedAt: new Date(opts.now()).toISOString() });
      begin(languageId, prior?.state === 'complete' ? { ...prior, state: 'queued' } : undefined);
      return status(languageId);
    },

    async cancel(languageId: string): Promise<DownloadStatus> {
      const run = runs.get(languageId);
      if (run) { run.cancelled = true; run.ctl.abort(); await run.promise; }
      return status(languageId);
    },

    /** Free the space: stop a running download, delete the language's files and its progress row. */
    async remove(languageId: string): Promise<DownloadStatus> {
      const run = runs.get(languageId);
      if (run) { run.cancelled = true; run.ctl.abort(); await run.promise; }
      await opts.store.removeLanguage(languageId);
      try { await opts.area.remove(downloadKey(languageId)); } catch { /* an unreadable row reads as no download */ }
      return { languageId, state: 'none', outOfDate: false, done: 0, total: 0, bytes: 0 };
    },

    /** A download that was running when the worker stopped carries on (called on a sync round; one read of at most a handful of rows). */
    async resume(): Promise<void> {
      const langs = opts.languages().filter((l) => !runs.has(l));
      if (!langs.length) return;
      let rows: Record<string, unknown> = {};
      try { rows = await opts.area.get(langs.map(downloadKey)); } catch { return; }
      for (const l of langs) {
        const row = rows[downloadKey(l)] as Partial<DownloadRow> | undefined;
        if (row && (row.state === 'running' || row.state === 'queued')) resumeOne(l, { done: 0, total: 0, bytes: 0, ...row } as DownloadRow);
      }
    },

    /** Stop every run and wait for it; delete the database (the learner deleted the device's data). The progress rows go with the caller's key sweep. */
    async destroy(): Promise<void> {
      const live = [...runs.values()];
      for (const r of live) { r.cancelled = true; r.ctl.abort(); }
      await Promise.all(live.map((r) => r.promise));
      await opts.store.destroy();
    },

    /** Languages with a live run (tests, and the clear). */
    running: (): string[] => [...runs.keys()],
  };
}

export type DictionaryDownload = ReturnType<typeof createDictionaryDownload>;
