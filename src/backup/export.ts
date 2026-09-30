import type { AppStore, DomainEvent, MetaRow, Text } from '../core';
import { bytesToBase64, checksumOf, isPolicyMeta, metaBelongsTo } from './format';
import type { BackupAsset, BackupData, BackupFile, ReferenceRows, TestimonyContent } from './types';
import { BACKUP_FORMAT, BACKUP_VERSION } from './types';

const byId = <T extends { id: string }>(a: T, b: T) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
const sorted = <T extends { id: string }>(rows: T[]) => [...rows].sort(byId);

function uniqueById<T extends { id: string }>(rows: T[]): T[] {
  const m = new Map<string, T>();
  for (const r of rows) m.set(r.id, r);
  return sorted([...m.values()]);
}

/** Collect the private testimony Texts of this learner's revisions and everything keyed under them. */
async function collectTestimonyContent(store: AppStore, textIds: string[]): Promise<{ content: TestimonyContent; reference: ReferenceRows }> {
  const content: TestimonyContent = {
    texts: [], sections: [], paragraphs: [], sentences: [], tokens: [], analyses: [], rescues: [], phraseOccurrences: [], patternOccurrences: [],
  };
  const texts: Text[] = [];
  for (const id of textIds) {
    const t = await store.texts.get(id);
    // Only private testimony texts travel. A revision that points at anything else is never exported as a corpus text.
    if (t && t.kind === 'testimony') texts.push(t);
  }
  for (const t of texts) {
    content.texts.push(t);
    content.sections.push(...(await store.sections.where('textId', t.id)));
    content.paragraphs.push(...(await store.paragraphs.where('textId', t.id)));
    content.sentences.push(...(await store.sentences.where('textId', t.id)));
    content.rescues.push(...(await store.rescues.where('textId', t.id)));
    content.phraseOccurrences.push(...(await store.phraseOccurrences.where('textId', t.id)));
    content.patternOccurrences.push(...(await store.patternOccurrences.where('textId', t.id)));
    const tokens = await store.tokens.where('textId', t.id);
    content.tokens.push(...tokens);
    for (const tok of tokens) content.analyses.push(...(await store.analyses.where('tokenId', tok.id)));
  }
  for (const k of Object.keys(content) as (keyof TestimonyContent)[]) {
    (content as unknown as Record<string, { id: string }[]>)[k] = uniqueById(content[k] as { id: string }[]);
  }

  const pick = async <T extends { id: string }>(table: { getMany(ids: string[]): Promise<(T | undefined)[]> }, ids: Iterable<string | undefined>) => {
    const want = [...new Set([...ids].filter((x): x is string => !!x))];
    return uniqueById((await table.getMany(want)).filter((r): r is T => !!r));
  };
  const lemmaIds = content.analyses.flatMap((a) => [a.lemmaId, ...(a.alternatives ?? []).map((x) => x.lemmaId)]);
  const reference: ReferenceRows = {
    corpora: await pick(store.corpora, texts.map((t) => t.corpusId)),
    sources: await pick(store.sources, texts.map((t) => t.sourceId)),
    lemmas: await pick(store.lemmas, lemmaIds),
    phrases: await pick(store.phrases, content.phraseOccurrences.map((o) => o.phraseId)),
    patterns: await pick(store.patterns, content.patternOccurrences.map((o) => o.patternId)),
  };
  return { content, reference };
}

function countsOf(d: BackupData): Record<string, number> {
  return {
    events: d.events.length, testimonies: d.testimonies.length, revisions: d.revisions.length, suggestions: d.suggestions.length,
    drafts: d.drafts.length, recordings: d.recordings.length, meta: d.meta.length, assets: Object.keys(d.assets).length,
    ...Object.fromEntries(Object.entries(d.testimonyContent).map(([k, v]) => [`testimonyContent.${k}`, v.length])),
    ...Object.fromEntries(Object.entries(d.reference).map(([k, v]) => [`reference.${k}`, v.length])),
  };
}

const cmpEvents = (a: DomainEvent, b: DomainEvent) => (a.at < b.at ? -1 : a.at > b.at ? 1 : a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

/**
 * Export one learner's source-of-truth data. Reads only rows that belong to `userId` (by userId index, or by
 * being reachable from that learner's own revisions). Throws if the learner does not exist.
 */
export async function exportLearner(store: AppStore, userId: string, opts: { includeRecordings?: boolean } = {}): Promise<BackupFile> {
  const user = await store.users.get(userId);
  if (!user) throw new Error(`Cannot export: no learner "${userId}" on this device.`);

  const events = (await store.events.where('userId', userId)).sort(cmpEvents);
  const testimonies = sorted(await store.testimonies.where('userId', userId));
  const revisions = sorted(await store.revisions.where('userId', userId));
  const suggestions = sorted(await store.suggestions.where('userId', userId));
  const drafts = sorted(await store.drafts.where('userId', userId));
  const recordings = sorted(await store.recordings.where('userId', userId));

  const textIds = [...new Set(revisions.map((r) => r.textId).filter((x): x is string => !!x))];
  const { content, reference } = await collectTestimonyContent(store, textIds);

  const allMeta = await store.meta.all();
  const meta: MetaRow[] = sorted(allMeta.filter((m) => metaBelongsTo(m.id, userId) && !isPolicyMeta(m.id)));
  const policyRow = allMeta.find((m) => isPolicyMeta(m.id) && metaBelongsTo(m.id, userId))
    ?? allMeta.find((m) => /^[a-z._-]*polic[a-z._-]*$/i.test(m.id));

  const assets: Record<string, BackupAsset> = {};
  if (opts.includeRecordings) {
    for (const r of recordings) {
      if (assets[r.assetId]) continue;
      const a = await store.assets.get(r.assetId);
      if (a) assets[r.assetId] = { mime: a.mime, base64: bytesToBase64(a.bytes), bytes: a.bytes.length };
    }
  }

  const data: BackupData = { user, events, testimonies, revisions, suggestions, drafts, recordings, testimonyContent: content, reference, meta, assets };
  // Round-trip through JSON so the in-memory object equals what a saved-and-reloaded file contains.
  const plain = JSON.parse(JSON.stringify(data)) as BackupData;
  return {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    createdAt: new Date().toISOString(),
    userId,
    ...(policyRow ? { policyVersion: policyRow.value } : {}),
    includesRecordings: !!opts.includeRecordings,
    counts: countsOf(plain),
    checksum: checksumOf(plain),
    data: plain,
  };
}
