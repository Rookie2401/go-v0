/**
 * Mutable records. Events are immutable and merge by union; a private document (a draft, a testimony, a note) is edited
 * in place and merges by REVISION. The rules are small and explicit, and they share one principle: neither side's text is
 * ever discarded.
 *
 * A device holds, per document, `{ doc, baseRevision, dirty }`: `baseRevision` is the last revision the server is known
 * to have; a dirty document is `baseRevision + 1` (several local edits coalesce into that one pending revision) and is
 * pushed with `expectedRevision = baseRevision`.
 *
 * mergeDocument(local, remote, localDirty, baseRevision?):
 *   nothing on either side ........................... keep-local
 *   no local copy .................................... take-remote
 *   no remote copy, local dirty ...................... push-local (expectedRevision 0)
 *   local clean, remote newer ........................ take-remote
 *   local clean, remote same or older ................ keep-local
 *   local dirty on top of the remote's revision ...... push-local (expectedRevision = remote.revision)
 *   local dirty, remote advanced, same content ....... take-remote (two devices wrote the same text; nothing to preserve twice)
 *   local dirty, remote advanced, different content .. conflict:
 *        the remote keeps the docId (it is what the other devices and the server already show) and the local text is
 *        preserved as a NEW document `<docId>:conflict:<deviceId>:<revision>` whose title ends "(conflict copy from <device>)".
 *        The copy is an ordinary new dirty document: it is pushed, synced to every device, and the learner merges by hand.
 *        A local DELETION has no text to preserve, so against an advanced remote the remote text wins and no copy is made;
 *        a remote deletion against local edits makes the remote (deleted) row win and the local text becomes the copy.
 *
 * Preferences (`mergePreferences`) are field by field: explicit beats inferred beats default; among values of the same
 * origin the later `updatedAt` wins; a tie goes to the lexicographically smaller deviceId. Inferred values are always
 * overridable, which is why a learner's explicit choice on any device outlives every inference on every other.
 */
import type { AssistancePreferences, PrivateDocument } from '../../repository-contract/src';
import { createLock, getByPrefix, getOne, type KeyValueArea } from './area';

export type MergeAction = 'keep-local' | 'take-remote' | 'push-local' | 'conflict';

export interface MergeResult {
  action: MergeAction;
  /** The document that should be stored under the docId afterwards (the remote for take-remote and conflict). */
  keep?: PrivateDocument;
  /** For `conflict`: the local text preserved as a new document. */
  conflictCopy?: PrivateDocument;
  /** Human-readable reason, for status and logs. */
  reason: string;
}

export type DocumentMerge = (local: PrivateDocument | undefined, remote: PrivateDocument | undefined, localDirty: boolean, baseRevision?: number) => MergeResult;

const sameContent = (a: PrivateDocument, b: PrivateDocument): boolean =>
  a.body === b.body && (a.title ?? '') === (b.title ?? '') && a.kind === b.kind && !!a.deletedAt === !!b.deletedAt;

export const conflictDocId = (local: Pick<PrivateDocument, 'docId' | 'deviceId' | 'revision'>): string =>
  `${local.docId}:conflict:${local.deviceId}:${local.revision}`;

export const isConflictCopy = (docId: string): boolean => docId.includes(':conflict:');

export function makeConflictCopy(local: PrivateDocument): PrivateDocument {
  return {
    ...local,
    docId: conflictDocId(local),
    title: `${local.title ? local.title + ' ' : ''}(conflict copy from ${local.deviceId})`,
    revision: 1,
    deletedAt: undefined,
  };
}

export const mergeDocument: DocumentMerge = (local, remote, localDirty, baseRevision) => {
  if (!local && !remote) return { action: 'keep-local', reason: 'nothing on either side' };
  if (!local) return { action: 'take-remote', keep: remote, reason: 'no local copy' };
  if (!remote) {
    return localDirty
      ? { action: 'push-local', keep: local, reason: 'new local document; expectedRevision 0' }
      : { action: 'keep-local', keep: local, reason: 'the server has no copy and the local one is clean' };
  }
  if (!localDirty) {
    return remote.revision > local.revision
      ? { action: 'take-remote', keep: remote, reason: `remote revision ${remote.revision} is newer than ${local.revision}` }
      : { action: 'keep-local', keep: local, reason: 'same revision (or local is ahead): nothing to do' };
  }
  const base = baseRevision ?? local.revision - 1;
  if (remote.revision <= base) return { action: 'push-local', keep: local, reason: `local edits sit on revision ${base}; remote is at ${remote.revision}` };
  if (sameContent(local, remote)) return { action: 'take-remote', keep: remote, reason: 'both devices wrote the same content' };
  if (local.deletedAt) return { action: 'take-remote', keep: remote, reason: 'local deletion against newer remote text: the text wins, there is none to preserve locally' };
  return {
    action: 'conflict',
    keep: remote,
    conflictCopy: makeConflictCopy(local),
    reason: `local edits on revision ${base} but the remote advanced to ${remote.revision}: remote keeps the docId, local text kept as a conflict copy`,
  };
};

// ───────────────────────────── the device's document store ─────────────────────────────

export const DOC_PREFIX = 'doc:';

export interface LocalDocRecord { doc: PrivateDocument; baseRevision: number; dirty: boolean }

export interface DocumentEdit {
  docId: string;
  learnerId: string;
  languageId: string;
  kind: PrivateDocument['kind'];
  title?: string;
  body: string;
}

export interface LocalDocuments {
  get(docId: string): Promise<LocalDocRecord | undefined>;
  list(): Promise<LocalDocRecord[]>;
  dirty(): Promise<LocalDocRecord[]>;
  /** A local edit: the document becomes (or stays) dirty at baseRevision + 1. */
  save(edit: DocumentEdit): Promise<PrivateDocument>;
  /** A local deletion: the body is emptied and `deletedAt` set; pushed like any edit. */
  remove(docId: string): Promise<PrivateDocument | undefined>;
  /** Stores the server's document as the clean local state. */
  acceptRemote(doc: PrivateDocument): Promise<void>;
  /** Stores a conflict copy as a new dirty document (base revision 0). */
  putConflictCopy(copy: PrivateDocument): Promise<void>;
  /** The server accepted `doc`. If the document was edited again while the push was in flight it stays dirty on top of it. */
  markPushed(doc: PrivateDocument): Promise<void>;
  /** The server has no document at the revision this device built on: make the dirty local document a new one (base revision 0, revision 1). False when there is nothing dirty to rebase. Optional so older hosts keep working. */
  rebase?(docId: string): Promise<boolean>;
}

export function createLocalDocuments(area: KeyValueArea, opts: { deviceId: string; now?: () => number }): LocalDocuments {
  const now = opts.now ?? Date.now;
  const lock = createLock();
  const iso = () => new Date(now()).toISOString();
  const put = (r: LocalDocRecord) => area.set({ [DOC_PREFIX + r.doc.docId]: r });
  const read = (docId: string) => getOne<LocalDocRecord>(area, DOC_PREFIX + docId);

  return {
    get: (docId) => lock.run(() => read(docId)),
    list: () => lock.run(async () => (await getByPrefix<LocalDocRecord>(area, DOC_PREFIX)).map(([, r]) => r)),
    dirty: () => lock.run(async () => (await getByPrefix<LocalDocRecord>(area, DOC_PREFIX)).map(([, r]) => r).filter((r) => r.dirty)),
    save: (edit) => lock.run(async () => {
      const cur = await read(edit.docId);
      const base = cur ? (cur.dirty ? cur.baseRevision : cur.doc.revision) : 0;
      const doc: PrivateDocument = {
        docId: edit.docId, learnerId: edit.learnerId, languageId: edit.languageId, kind: edit.kind,
        ...(edit.title !== undefined ? { title: edit.title } : {}),
        body: edit.body, revision: base + 1, deviceId: opts.deviceId, updatedAt: iso(),
      };
      await put({ doc, baseRevision: base, dirty: true });
      return doc;
    }),
    remove: (docId) => lock.run(async () => {
      const cur = await read(docId);
      if (!cur) return undefined;
      const base = cur.dirty ? cur.baseRevision : cur.doc.revision;
      // the title goes with the body: it is the learner's own words (audit P-03)
      const { title: _title, ...kept } = cur.doc;
      const doc: PrivateDocument = { ...kept, body: '', revision: base + 1, deviceId: opts.deviceId, updatedAt: iso(), deletedAt: iso() };
      await put({ doc, baseRevision: base, dirty: true });
      return doc;
    }),
    acceptRemote: (doc) => lock.run(() => put({ doc, baseRevision: doc.revision, dirty: false })),
    putConflictCopy: (copy) => lock.run(() => put({ doc: copy, baseRevision: 0, dirty: true })),
    rebase: (docId) => lock.run(async () => {
      const cur = await read(docId);
      if (!cur || !cur.dirty || cur.baseRevision === 0) return false;
      await put({ doc: { ...cur.doc, revision: 1 }, baseRevision: 0, dirty: true });
      return true;
    }),
    markPushed: (doc) => lock.run(async () => {
      const cur = await read(doc.docId);
      if (cur && cur.dirty && !sameContent(cur.doc, doc)) {
        await put({ doc: { ...cur.doc, revision: doc.revision + 1 }, baseRevision: doc.revision, dirty: true });
      } else await put({ doc, baseRevision: doc.revision, dirty: false });
    }),
  };
}

// ───────────────────────────── preferences ─────────────────────────────

export interface DevicePreferences { prefs: AssistancePreferences; deviceId: string }

const PREFERENCE_FIELDS = ['explanationDepth', 'terminology', 'transliteration', 'pronunciationFirst', 'translationAvailable', 'visualAssistance', 'accessibility'] as const;
const RANK = { default: 0, inferred: 1, explicit: 2 } as const;

const time = (iso: string): number => { const t = Date.parse(iso); return Number.isNaN(t) ? 0 : t; };

/** Which side wins a field: higher origin; then later updatedAt; then smaller deviceId. Returns true when `a` wins. */
export function preferenceWinner(a: { origin: 'default' | 'inferred' | 'explicit'; updatedAt: string; deviceId: string }, b: typeof a): boolean {
  if (RANK[a.origin] !== RANK[b.origin]) return RANK[a.origin] > RANK[b.origin];
  const ta = time(a.updatedAt); const tb = time(b.updatedAt);
  if (ta !== tb) return ta > tb;
  return a.deviceId <= b.deviceId;
}

export function mergePreferences(a: DevicePreferences, b: DevicePreferences): AssistancePreferences {
  const out = { ...a.prefs } as unknown as Record<string, unknown>;
  for (const f of PREFERENCE_FIELDS) {
    const pa = a.prefs[f]; const pb = b.prefs[f];
    const aWins = preferenceWinner({ origin: pa.origin, updatedAt: a.prefs.updatedAt, deviceId: a.deviceId }, { origin: pb.origin, updatedAt: b.prefs.updatedAt, deviceId: b.deviceId });
    out[f] = aWins ? pa : pb;
  }
  out.updatedAt = time(a.prefs.updatedAt) >= time(b.prefs.updatedAt) ? a.prefs.updatedAt : b.prefs.updatedAt;
  return out as unknown as AssistancePreferences;
}
