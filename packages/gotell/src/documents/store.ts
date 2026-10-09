/**
 * Draft stores. Three of them, one contract (`DraftStore`):
 *
 *  - `createDraftStore`        the remote one: each draft is ONE private document (kind `draft`, or `testimony` for
 *                              testimony mode) whose body is the JSON of the DraftRecord, saved with optimistic revisions.
 *  - `createLocalDraftStore`   the offline one, over a KeyValueArea, using the sync package's dirty-tracked local documents.
 *  - `createSyncingDraftStore` local first, then push. A conflict applies the sync package's `mergeDocument` rule: the
 *                              remote keeps the docId, the local text is kept as a conflict copy draft. Nothing is dropped.
 */
import type { PrivateDocument } from '../../../repository-contract/src';
import type { RepositoryApi } from '../../../repository-service/src/api';
import {
  DOC_PREFIX, createLocalDocuments, createLock, makeConflictCopy, mergeDocument,
  type KeyValueArea, type LocalDocRecord, type LocalDocuments,
} from '../../../repository-sync/src';
import type { DraftRecord, DraftStore, Identity } from '../types';
import { decodeBody, documentTitle, encodeRecord, kindOf, toDocument, type DocumentKind } from './codec';
import { toIso, toMs, type TimeSource } from './time';

export type DraftApi = Pick<RepositoryApi, 'getDocument' | 'putDocument' | 'deleteDocument' | 'listDocuments'>;
export type DraftMeta = Awaited<ReturnType<DraftStore['list']>>[number];
export type LoadedDraft = { record: DraftRecord; revision: number };
/** A conflict's current record; `deleted` is set when the other side deleted the draft (the record is then empty). */
export type CurrentDraft = LoadedDraft & { deleted?: true };
export type SaveOutcome = { ok: true; revision: number } | { ok: false; current: CurrentDraft };

const DRAFT_KINDS: readonly string[] = ['draft', 'testimony'] satisfies DocumentKind[];

/** A request that failed for a reason other than a revision conflict (offline, refused, server error). */
export class DraftStoreError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
    this.name = 'DraftStoreError';
  }
}

const fail = (r: { status: number; message: string; error?: string }): never => {
  throw new DraftStoreError(r.message || `The service answered ${r.status}.`, r.status);
};

// ───────────────────────────── remote ─────────────────────────────

export interface DraftStoreDeps {
  api: DraftApi;
  identity: Identity;
  now?: TimeSource;
}

export function createDraftStore(deps: DraftStoreDeps): DraftStore {
  const { api, identity } = deps;
  return {
    async list() {
      const r = await api.listDocuments();
      if (!r.ok) return fail(r);
      return r.data.documents
        .filter((d) => DRAFT_KINDS.includes(d.kind) && !d.deletedAt && d.languageId === identity.languageId)
        .map((d) => ({ docId: d.docId, title: d.title, updatedAt: d.updatedAt, revision: d.revision, kind: d.kind, languageId: d.languageId }))
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    },
    async load(draftId) {
      const r = await api.getDocument(draftId);
      if (!r.ok) { if (r.status === 404) return undefined; return fail(r); }
      return { record: decodeBody(r.data.document), revision: r.data.document.revision };
    },
    async save(record, expectedRevision) {
      const r = await api.putDocument(record.draftId, { languageId: record.languageId, kind: kindOf(record), body: encodeRecord(record), ...(record.title ? { title: documentTitle(record.title) } : {}) }, expectedRevision);
      if (r.ok) return { ok: true, revision: r.data.document.revision };
      const current = r.status === 409 ? (r.body as { current?: PrivateDocument }).current : undefined;
      if (!current) return fail(r);
      const out: CurrentDraft = { record: decodeBody(current), revision: current.revision, ...(current.deletedAt ? { deleted: true as const } : {}) };
      return { ok: false, current: out };
    },
    async remove(draftId) {
      const r = await api.deleteDocument(draftId);
      if (!r.ok && r.status !== 404) fail(r);
    },
  };
}

// ───────────────────────────── local ─────────────────────────────

export interface LocalDraftStore extends DraftStore {
  /** The sync package's dirty-tracked documents under this store; the syncing store drives them. */
  readonly documents: LocalDocuments;
  readonly area: KeyValueArea;
  readonly identity: Identity;
  /** Drops the row outright (after the server has the deletion, or for a draft the server never saw). */
  purge(draftId: string): Promise<void>;
}

export interface LocalDraftStoreOptions { identity: Identity; now?: TimeSource }

const metaOf = (d: PrivateDocument): DraftMeta => ({ docId: d.docId, title: d.title, updatedAt: d.updatedAt, revision: d.revision, kind: d.kind, languageId: d.languageId });

export function createLocalDraftStore(area: KeyValueArea, opts: LocalDraftStoreOptions): LocalDraftStore {
  const { identity } = opts;
  const documents = createLocalDocuments(area, { deviceId: identity.deviceId, now: () => toMs(opts.now) });
  const live = (r: LocalDocRecord | undefined): r is LocalDocRecord => !!r && !r.doc.deletedAt;

  const store: LocalDraftStore = {
    documents,
    area,
    identity,
    async purge(draftId) { await area.remove(DOC_PREFIX + draftId); },
    async list() {
      return (await documents.list()).filter((r) => live(r) && DRAFT_KINDS.includes(r.doc.kind) && r.doc.languageId === identity.languageId)
        .map((r) => metaOf(r.doc)).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    },
    async load(draftId) {
      const r = await documents.get(draftId);
      return live(r) ? { record: decodeBody(r.doc), revision: r.doc.revision } : undefined;
    },
    async save(record, expectedRevision) {
      const cur = await documents.get(record.draftId);
      if (cur && !cur.doc.deletedAt && cur.doc.revision !== expectedRevision) return { ok: false, current: { record: decodeBody(cur.doc), revision: cur.doc.revision } };
      const doc = await documents.save({
        docId: record.draftId, learnerId: identity.learnerId, languageId: record.languageId, kind: kindOf(record),
        ...(record.title ? { title: documentTitle(record.title) } : {}), body: encodeRecord(record),
      });
      return { ok: true, revision: doc.revision };
    },
    async remove(draftId) {
      const r = await documents.get(draftId);
      if (!r) return;
      if (r.dirty && r.baseRevision === 0) await store.purge(draftId); // the server never had it: nothing to tell it
      else await documents.remove(draftId);
    },
  };
  return store;
}

// ───────────────────────────── syncing ─────────────────────────────

export interface ConflictNote { draftId: string; copyId: string; reason: string }
export interface PushSummary {
  pushed: string[];
  /** Drafts deleted on the server. */
  deleted: string[];
  conflicts: ConflictNote[];
  /** Left for a later push (offline, refused): the local copy is intact. */
  failed: Array<{ draftId: string; message: string }>;
}
export interface PullSummary { fetched: string[]; removed: string[] }

export interface SyncingDraftStore extends DraftStore {
  /** Draft ids edited or deleted here and not yet accepted by the server. */
  pendingPush(): Promise<string[]>;
  push(): Promise<PushSummary>;
  pull(): Promise<PullSummary>;
  sync(): Promise<{ push: PushSummary; pull: PullSummary }>;
  /** Conflicts resolved by this store instance (each kept its local text as a copy draft). */
  conflicts(): ConflictNote[];
}

export interface SyncingDraftStoreDeps { local: LocalDraftStore; remote: DraftStore; now?: TimeSource }

type PushOne =
  | { kind: 'pushed'; revision: number }
  | { kind: 'deleted' }
  | { kind: 'taken-remote'; current: CurrentDraft }
  | { kind: 'conflict'; note: ConflictNote; current: CurrentDraft };

const msg = (e: unknown): string => (e instanceof Error ? e.message : String(e));

export function createSyncingDraftStore(deps: SyncingDraftStoreDeps): SyncingDraftStore {
  const { local, remote } = deps;
  const docs = local.documents;
  const lock = createLock();
  const notes: ConflictNote[] = [];

  /** The remote's current state, as a document the merge rule understands. */
  const remoteDoc = (id: string, cur: CurrentDraft, like: PrivateDocument): PrivateDocument => {
    const d = toDocument({ ...cur.record, draftId: id }, { learnerId: like.learnerId, deviceId: 'remote' }, cur.revision, cur.record.updatedAt || toIso(deps.now));
    return cur.deleted ? { ...d, body: '', deletedAt: d.updatedAt } : d;
  };

  async function pushOne(rec: LocalDocRecord): Promise<PushOne> {
    const id = rec.doc.docId;
    if (rec.doc.deletedAt) {
      if (rec.baseRevision === 0) { await local.purge(id); return { kind: 'deleted' }; }
      const cur = await remote.load(id);
      if (cur && cur.revision > rec.baseRevision) {
        // text was written elsewhere after we last saw it: the text wins over a deletion (mergeDocument: take-remote)
        const m = mergeDocument(rec.doc, remoteDoc(id, cur, rec.doc), true, rec.baseRevision);
        if (m.keep) await docs.acceptRemote(m.keep);
        return { kind: 'taken-remote', current: cur };
      }
      await remote.remove(id);
      await local.purge(id);
      return { kind: 'deleted' };
    }

    const record = decodeBody(rec.doc);
    let expected = rec.baseRevision;
    for (let attempt = 0; attempt < 2; attempt++) {
      const r = await remote.save(record, expected);
      if (r.ok) {
        await docs.markPushed({ ...rec.doc, revision: r.revision });
        return { kind: 'pushed', revision: r.revision };
      }
      const current = r.current as CurrentDraft;
      const theirs = remoteDoc(id, current, rec.doc);
      const m = mergeDocument(rec.doc, theirs, true, rec.baseRevision);
      if (m.action === 'push-local') { expected = theirs.revision; continue; }
      if (m.action === 'keep-local') return { kind: 'pushed', revision: rec.doc.revision };
      if (m.action === 'take-remote') {
        if (m.keep) await docs.acceptRemote(m.keep);
        return { kind: 'taken-remote', current };
      }
      // conflict: the remote keeps the docId; the local text becomes its own draft, pushed like any new one
      const copy = m.conflictCopy ?? makeConflictCopy(rec.doc);
      const copyRecord: DraftRecord = { ...decodeBody(rec.doc), draftId: copy.docId, title: copy.title ?? '' };
      const copyDoc: PrivateDocument = { ...copy, body: encodeRecord(copyRecord) };
      if (m.keep) await docs.acceptRemote(m.keep);
      await docs.putConflictCopy(copyDoc);
      const note: ConflictNote = { draftId: id, copyId: copy.docId, reason: m.reason };
      notes.push(note);
      return { kind: 'conflict', note, current };
    }
    throw new DraftStoreError('The draft could not be pushed after a revision retry.', 409);
  }

  async function pushRecord(id: string): Promise<PushOne | undefined> {
    const rec = await docs.get(id);
    if (!rec || !rec.dirty) return undefined;
    return pushOne(rec);
  }

  async function pushAll(): Promise<PushSummary> {
    const out: PushSummary = { pushed: [], deleted: [], conflicts: [], failed: [] };
    const queue = (await docs.dirty()).map((r) => r.doc.docId);
    for (let i = 0; i < queue.length; i++) {
      const id = queue[i];
      try {
        const r = await pushRecord(id);
        if (!r) continue;
        if (r.kind === 'pushed') out.pushed.push(id);
        else if (r.kind === 'deleted') out.deleted.push(id);
        else if (r.kind === 'conflict') { out.conflicts.push(r.note); queue.push(r.note.copyId); }
      } catch (e) {
        out.failed.push({ draftId: id, message: msg(e) });
      }
    }
    return out;
  }

  const store: SyncingDraftStore = {
    pendingPush: async () => (await docs.dirty()).map((r) => r.doc.docId),
    conflicts: () => [...notes],
    push: () => lock.run(pushAll),
    async pull() {
      return lock.run(async () => {
        const out: PullSummary = { fetched: [], removed: [] };
        const theirs = await remote.list();
        const have = new Set<string>();
        for (const m of theirs) {
          have.add(m.docId);
          const mine = await docs.get(m.docId);
          if (mine?.dirty) continue; // merged at push time, with the conflict rule
          if (mine && !mine.doc.deletedAt && mine.doc.revision >= m.revision) continue;
          const cur = await remote.load(m.docId);
          if (!cur) continue;
          await docs.acceptRemote(toDocument(cur.record, { learnerId: local.identity.learnerId, deviceId: 'remote' }, cur.revision, m.updatedAt));
          out.fetched.push(m.docId);
        }
        for (const r of await docs.list()) {
          // synced once, clean, and gone from the server's list: it was deleted on another device
          if (!r.dirty && r.baseRevision > 0 && !have.has(r.doc.docId) && DRAFT_KINDS.includes(r.doc.kind) && r.doc.languageId === local.identity.languageId) {
            await local.purge(r.doc.docId);
            out.removed.push(r.doc.docId);
          }
        }
        return out;
      });
    },
    async sync() {
      const push = await store.push();
      const pull = await store.pull();
      return { push, pull };
    },
    async list() {
      const mine = await local.list();
      let theirs: DraftMeta[] = [];
      try { theirs = await remote.list(); } catch { /* offline: the local list is the list */ }
      const seen = new Set(mine.map((m) => m.docId));
      return [...mine, ...theirs.filter((t) => !seen.has(t.docId))].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    },
    async load(draftId) {
      const l = await local.load(draftId);
      if (l) return l;
      const rec = await docs.get(draftId);
      if (rec?.doc.deletedAt) return undefined; // deleted here, deletion not pushed yet
      let cur: LoadedDraft | undefined;
      try { cur = await remote.load(draftId); } catch { return undefined; }
      if (!cur) return undefined;
      await docs.acceptRemote(toDocument(cur.record, { learnerId: local.identity.learnerId, deviceId: 'remote' }, cur.revision, cur.record.updatedAt));
      return cur;
    },
    async save(record, expectedRevision) {
      const saved = await local.save(record, expectedRevision);
      if (!saved.ok) return saved;
      const id = record.draftId;
      try {
        const r = await lock.run(() => pushRecord(id));
        if (r?.kind === 'conflict' || r?.kind === 'taken-remote') return { ok: false, current: r.current };
      } catch { /* offline or refused: the draft is saved locally and stays pending */ }
      const after = await docs.get(id);
      return { ok: true, revision: after?.doc.revision ?? saved.revision };
    },
    async remove(draftId) {
      await local.remove(draftId);
      try { await lock.run(() => pushRecord(draftId)); } catch { /* the deletion stays pending */ }
    },
  };
  return store;
}
