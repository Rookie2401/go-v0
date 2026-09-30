import type { AppStore, DomainEvent, Table, UserRecording } from '../core';
import { base64ToBytes, deepEqual, isPolicyMeta, metaBelongsTo } from './format';
import type { BackupFile, BackupIssue, RestoreReport, TableStat } from './types';
import { parseBackup } from './validate';

/** Thrown by restoreLearner when the file is rejected. Nothing has been written when this is thrown. */
export class BackupError extends Error {
  readonly issues: BackupIssue[];
  constructor(issues: BackupIssue[]) {
    const errors = issues.filter((i) => i.severity === 'error');
    super(errors.map((i) => i.message).join(' ') || 'The backup could not be restored.');
    this.name = 'BackupError';
    this.issues = issues;
  }
}

type AnyTable = Table<{ id: string }>;
const T = (t: unknown) => t as AnyTable;
const newStat = (): TableStat => ({ added: 0, updated: 0, unchanged: 0, keptExisting: 0 });

/** Tables touched by a restore; the Dexie transaction must list them all. */
const TOUCHED = [
  'users', 'events', 'testimonies', 'revisions', 'suggestions', 'drafts', 'recordings', 'meta', 'encounters', 'learnerItems',
  'texts', 'sections', 'paragraphs', 'sentences', 'tokens', 'analyses', 'rescues', 'phraseOccurrences', 'patternOccurrences',
  'corpora', 'sources', 'lemmas', 'phrases', 'patterns',
] as const satisfies readonly (keyof AppStore)[];

const SUGGESTION_RANK: Record<string, number> = { shown: 0, rejected: 1, edited: 2, accepted: 3 };

/**
 * Write `rows` into `table` by id. A row absent on the device is added; an identical one is left alone; a differing
 * one is replaced only when `incomingWins` says the backup's row is newer / further along (default: never).
 */
async function mergeRows<R extends { id: string }>(
  table: unknown, rows: R[], stat: TableStat, incomingWins?: (incoming: R, existing: R) => boolean | Promise<boolean>,
): Promise<void> {
  if (!rows.length) return;
  const t = T(table);
  const existing = await t.getMany(rows.map((r) => r.id));
  const write: R[] = [];
  for (let i = 0; i < rows.length; i++) {
    const inc = rows[i];
    const ex = existing[i] as R | undefined;
    if (!ex) { write.push(inc); stat.added++; continue; }
    if (deepEqual(ex, inc)) { stat.unchanged++; continue; }
    if (incomingWins && (await incomingWins(inc, ex))) { write.push(inc); stat.updated++; } else stat.keptExisting++;
  }
  await t.bulkPut(write);
}

async function deleteWhere(table: unknown, rows: { id: string }[], removed: Record<string, number>, name: string) {
  const t = T(table);
  for (const r of rows) await t.delete(r.id);
  removed[name] = (removed[name] ?? 0) + rows.length;
}

/** Replace mode: remove THIS learner's existing source rows (and their now-stale derived rows). Nobody else's. */
async function wipeLearner(store: AppStore, userId: string, removed: Record<string, number>) {
  await deleteWhere(store.events, await store.events.where('userId', userId), removed, 'events');
  await deleteWhere(store.suggestions, await store.suggestions.where('userId', userId), removed, 'suggestions');
  await deleteWhere(store.drafts, await store.drafts.where('userId', userId), removed, 'drafts');
  await deleteWhere(store.recordings, await store.recordings.where('userId', userId), removed, 'recordings');
  const revisions = await store.revisions.where('userId', userId);
  await deleteWhere(store.revisions, revisions, removed, 'revisions');
  await deleteWhere(store.testimonies, await store.testimonies.where('userId', userId), removed, 'testimonies');

  // The private testimony texts of this learner's own revisions (kind 'testimony' only).
  for (const textId of new Set(revisions.map((r) => r.textId).filter((x): x is string => !!x))) {
    const text = await store.texts.get(textId);
    if (!text || text.kind !== 'testimony') continue;
    const tokens = await store.tokens.where('textId', textId);
    for (const tok of tokens) await deleteWhere(store.analyses, await store.analyses.where('tokenId', tok.id), removed, 'analyses');
    await deleteWhere(store.tokens, tokens, removed, 'tokens');
    await deleteWhere(store.sentences, await store.sentences.where('textId', textId), removed, 'sentences');
    await deleteWhere(store.paragraphs, await store.paragraphs.where('textId', textId), removed, 'paragraphs');
    await deleteWhere(store.sections, await store.sections.where('textId', textId), removed, 'sections');
    await deleteWhere(store.rescues, await store.rescues.where('textId', textId), removed, 'rescues');
    await deleteWhere(store.phraseOccurrences, await store.phraseOccurrences.where('textId', textId), removed, 'phraseOccurrences');
    await deleteWhere(store.patternOccurrences, await store.patternOccurrences.where('textId', textId), removed, 'patternOccurrences');
    await deleteWhere(store.texts, [text], removed, 'texts');
  }
  // Derived state is stale the moment the events change.
  await deleteWhere(store.encounters, await store.encounters.where('userId', userId), removed, 'encounters');
  await deleteWhere(store.learnerItems, await store.learnerItems.where('userId', userId), removed, 'learnerItems');
  const meta = (await store.meta.all()).filter((m) => metaBelongsTo(m.id, userId));
  await deleteWhere(store.meta, meta, removed, 'meta');
}

/**
 * Restore one learner from a backup (object or raw JSON text).
 *
 * - `merge` (default): add what is missing, never delete. Events dedupe by id and by dedupeKey; rows go in by id;
 *   a draft only overwrites a local one if its `seq` is higher (equal seq: newer `updatedAt`); revisions and
 *   testimony texts are immutable so the device's copy wins; meta takes the newer `updatedAt`.
 * - `replace`: first removes THIS learner's existing source rows, then restores the file into the empty space.
 *
 * Validation runs before anything is written; a corrupt, tampered, other-version or foreign-learner file throws a
 * `BackupError` (with `.issues`) and leaves the store untouched. Only rows of `file.userId` are ever written, plus
 * content-keyed reference rows (lemmas, corpus/source of the testimony text) when absent.
 */
export async function restoreLearner(store: AppStore, file: BackupFile | string | unknown, opts: { mode?: 'merge' | 'replace' } = {}): Promise<RestoreReport> {
  const mode = opts.mode ?? 'merge';
  if (mode !== 'merge' && mode !== 'replace') throw new Error(`Unknown restore mode "${String(mode)}"; use "merge" or "replace".`);
  const parsed = parseBackup(file);
  if (!parsed.file) throw new BackupError(parsed.issues);
  const backup = parsed.file;
  const userId = backup.userId;
  const d = backup.data;
  const warnings = parsed.issues.filter((i) => i.severity === 'warning').map((i) => i.message);

  // Audio first (outside any transaction: hashing is async and lives in a different object store).
  const idMap = new Map<string, string>();
  for (const [oldId, a] of Object.entries(d.assets)) idMap.set(oldId, await store.assets.put(base64ToBytes(a.base64), a.mime));
  const recordings: UserRecording[] = [];
  let metadataWithoutAudio = 0;
  for (const r of d.recordings) {
    const assetId = idMap.get(r.assetId) ?? r.assetId;
    if (!(await store.assets.has(assetId))) metadataWithoutAudio++;
    recordings.push(assetId === r.assetId ? r : { ...r, assetId });
  }

  const tables: Record<string, TableStat> = {};
  const stat = (name: string) => (tables[name] ??= newStat());
  const removed: Record<string, number> = {};
  const events = { added: 0, duplicateById: 0, duplicateByDedupeKey: 0, conflictingOwner: 0 };

  await store.transaction([...TOUCHED], async () => {
    if (mode === 'replace') await wipeLearner(store, userId, removed);

    // User row: merge keeps the device's learner (course etc.); replace takes the backup's.
    await mergeRows(store.users, [d.user], stat('users'), mode === 'replace' ? () => true : undefined);

    // Reference rows the testimony content points at: add when absent, never modify.
    const ref = d.reference;
    await mergeRows(store.corpora, ref.corpora, stat('corpora'));
    await mergeRows(store.sources, ref.sources, stat('sources'));
    await mergeRows(store.lemmas, ref.lemmas, stat('lemmas'));
    await mergeRows(store.phrases, ref.phrases, stat('phrases'));
    await mergeRows(store.patterns, ref.patterns, stat('patterns'));

    // Private testimony texts: immutable per revision, so the device's copy wins on any difference.
    const c = d.testimonyContent;
    await mergeRows(store.texts, c.texts, stat('texts'));
    await mergeRows(store.sections, c.sections, stat('sections'));
    await mergeRows(store.paragraphs, c.paragraphs, stat('paragraphs'));
    await mergeRows(store.sentences, c.sentences, stat('sentences'));
    await mergeRows(store.tokens, c.tokens, stat('tokens'));
    await mergeRows(store.analyses, c.analyses, stat('analyses'));
    await mergeRows(store.rescues, c.rescues, stat('rescues'));
    await mergeRows(store.phraseOccurrences, c.phraseOccurrences, stat('phraseOccurrences'));
    await mergeRows(store.patternOccurrences, c.patternOccurrences, stat('patternOccurrences'));

    // Revisions are never overwritten; testimony pointer goes to whichever current revision is further along.
    await mergeRows(store.revisions, d.revisions, stat('revisions'));
    await mergeRows(store.testimonies, d.testimonies, stat('testimonies'), async (inc, ex) => {
      const rank = async (id?: string) => (id ? (await store.revisions.get(id))?.number ?? -1 : -1);
      return (await rank(inc.currentRevisionId)) > (await rank(ex.currentRevisionId));
    });
    await mergeRows(store.suggestions, d.suggestions, stat('suggestions'), (inc, ex) => (SUGGESTION_RANK[inc.status] ?? 0) > (SUGGESTION_RANK[ex.status] ?? 0));
    // A stale copy never beats a newer draft: higher seq wins, equal seq falls back to the newer updatedAt.
    await mergeRows(store.drafts, d.drafts, stat('drafts'), (inc, ex) => inc.seq > ex.seq || (inc.seq === ex.seq && inc.updatedAt > ex.updatedAt));
    await mergeRows(store.recordings, recordings, stat('recordings'));
    await mergeRows(store.meta, d.meta, stat('meta'), (inc, ex) => inc.updatedAt > ex.updatedAt);

    // Events: append-only. Skip by id, then by dedupeKey; never touch another learner's event even on an id clash.
    const own = await store.events.where('userId', userId);
    const seenIds = new Set(own.map((e) => e.id));
    const seenKeys = new Set(own.map((e) => e.dedupeKey));
    const toAdd: DomainEvent[] = [];
    const unknownIds = d.events.filter((e) => !seenIds.has(e.id)).map((e) => e.id);
    const elsewhere = new Set((await store.events.getMany(unknownIds)).filter((e): e is DomainEvent => !!e).map((e) => e.id));
    for (const e of d.events) {
      if (seenIds.has(e.id)) { events.duplicateById++; continue; }
      if (elsewhere.has(e.id)) { events.conflictingOwner++; continue; }
      if (seenKeys.has(e.dedupeKey)) { events.duplicateByDedupeKey++; continue; }
      seenIds.add(e.id);
      seenKeys.add(e.dedupeKey);
      toAdd.push(e);
    }
    await store.events.bulkPut(toAdd);
    events.added = toAdd.length;
    if (events.conflictingOwner) warnings.push(`${events.conflictingOwner} event(s) were skipped because their ids already belong to another learner on this device.`);

    // New events make derived state stale: drop this learner's policy marker so GoLearn's ensureCurrent rebuilds.
    if (toAdd.length && mode === 'merge') {
      for (const m of (await store.meta.all()).filter((m) => metaBelongsTo(m.id, userId) && isPolicyMeta(m.id))) await store.meta.delete(m.id);
    }
  });

  tables.events = { added: events.added, updated: 0, unchanged: events.duplicateById + events.duplicateByDedupeKey, keptExisting: events.conflictingOwner };
  const removedTotal = Object.values(removed).reduce((a, b) => a + b, 0);
  const changed = removedTotal > 0 || Object.values(tables).some((s) => s.added > 0 || s.updated > 0);
  if (metadataWithoutAudio) warnings.push(`${metadataWithoutAudio} recording(s) have no audio on this device (export with recordings to carry the audio).`);
  return {
    userId, mode,
    needsRebuild: events.added > 0 || (mode === 'replace' && (removed.events ?? 0) > 0),
    changed, events, tables, removed,
    recordings: { audioRestored: idMap.size, metadataWithoutAudio },
    warnings,
  };
}
