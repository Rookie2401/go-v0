import { describe, expect, it } from 'vitest';
import { buildFixtureText, createMemoryStore, ids } from '../../src/core';
import type { AppStore, DomainEvent, FixtureSentence, Encounter, GoTellSuggestion, LearnerItemState, Testimony, TestimonyDraft, TestimonyRevision, UserRecording } from '../../src/core';
import { BackupError, exportLearner, restoreLearner, validateBackup } from '../../src/backup';
import type { BackupFile } from '../../src/backup';
import { checksumOf } from '../../src/backup/format';

const T0 = '2026-03-01T10:00:00.000Z';

/** A minimal DomainEvent; the backup never interprets event payloads, only ids / userId / dedupeKey. */
function ev(userId: string, n: number, extra: Partial<DomainEvent> = {}): DomainEvent {
  return {
    type: 'TextViewed', id: `ev:${userId}:${n}`, userId, lang: 'es', at: `2026-03-01T10:00:0${n}.000Z`, surface: 'corpus',
    session: 's1', dedupeKey: `tv:${userId}:${n}`, textId: 'text:es:story-01', ...extra,
  } as DomainEvent;
}

const WAV_A = new Uint8Array([82, 73, 70, 70, 0, 255, 128, 7, 1, 2, 3, 250, 251, 252]);
const WAV_B = new Uint8Array(40000).map((_, i) => (i * 31 + 7) & 255); // > one 0x8000 chunk boundary? (no: still exercises sizeable data)

/** Seed one learner with testimony, two revisions (each a private Text), a suggestion, a draft, recordings, events, meta, derived rows. */
async function seedLearner(store: AppStore, userId: string, opts: { withAudio?: boolean } = {}) {
  if (!(await store.users.get(userId))) await store.users.put({ id: userId, displayName: `Learner ${userId}`, courseId: 'honduras-es', createdAt: T0 });
  const tid = ids.testimony(userId, 'es');
  const testimony: Testimony = { id: tid, userId, lang: 'es', title: 'Mi testimonio', createdAt: T0, currentRevisionId: ids.revision(tid, 2) };
  await store.testimonies.put(testimony);
  const revisions: TestimonyRevision[] = [];
  for (const n of [1, 2]) {
    const slug = `${userId}-rev${n}`;
    const text = await buildFixtureText(store, {
      lang: 'es', slug, kind: 'testimony', corpusId: 'testimony-es', sourceId: `src:testimony:${userId}`,
      sentences: ([
        { tokens: [{ surface: 'Yo', lemma: 'yo', pos: 'PRON' }, { surface: 'creo', lemma: 'creer', pos: 'VERB' }, { surface: '.', isWord: false }] },
        { tokens: [{ surface: 'Dios', lemma: 'Dios', pos: 'PROPN' }, { surface: 'me', lemma: 'yo', pos: 'PRON' }, { surface: 'perdonó', lemma: 'perdonar', pos: 'VERB' }, { surface: '.', isWord: false }], english: 'God forgave me.' },
      ] as FixtureSentence[]).slice(0, n === 1 ? 1 : 2),
    });
    const r: TestimonyRevision = {
      id: ids.revision(tid, n), testimonyId: tid, userId, lang: 'es', number: n, createdAt: `2026-03-0${n}T10:00:00.000Z`,
      fullText: n === 1 ? 'Yo creo.' : 'Yo creo. Dios me perdonó.', textId: text.id, acceptedSuggestionIds: n === 2 ? [ids.suggestion(`h1${userId}`, 0, 0)] : [],
      sentences: [{ index: 0, text: 'Yo creo.', textHash: 'h0' }], parentRevisionId: n === 2 ? ids.revision(tid, 1) : undefined,
    };
    revisions.push(r);
    await store.revisions.put(r);
  }
  const suggestion: GoTellSuggestion = {
    id: ids.suggestion(`h1${userId}`, 0, 0), userId, lang: 'es', testimonyId: tid, draftHash: `h1${userId}`, sentenceIndex: 0, kind: 'repair', original: 'Yo cree', suggested: 'Yo creo',
    explanation: 'verb ending', categories: ['conjugation'], priority: 2, familiar: [], newItems: [], scope: 'fixes-all-detected', remainingIssues: [],
    checkerCoverage: 'limited', sources: [], status: 'accepted', createdAt: T0,
  } as unknown as GoTellSuggestion;
  await store.suggestions.put(suggestion);
  const draft: TestimonyDraft = { id: ids.draft(userId, 'es'), userId, lang: 'es', text: 'Dios me perdonó y', updatedAt: '2026-03-02T09:00:00.000Z', seq: 5, basedOnRevisionId: ids.revision(tid, 2) };
  await store.drafts.put(draft);

  const recIds: string[] = [];
  for (const [i, bytes] of [WAV_A, WAV_B].entries()) {
    const assetId = await store.assets.put(bytes, 'audio/wav');
    const rec: UserRecording = { id: `rec:${userId}:${i}`, userId, lang: 'es', target: { testimonyRevisionId: ids.revision(tid, 2), text: 'Yo creo.' }, assetId, attempt: i + 1, createdAt: T0 };
    if (opts.withAudio !== false) await store.recordings.put(rec);
    recIds.push(rec.id);
  }

  await store.events.bulkPut([ev(userId, 1), ev(userId, 2), ev(userId, 3, { type: 'TestimonyRevisionAccepted', testimonyId: tid, revisionId: ids.revision(tid, 2), number: 2 } as Partial<DomainEvent>)]);
  await store.meta.put({ id: `setting:${userId}:note`, value: 'hello', updatedAt: T0 });
  await store.meta.put({ id: `golearn-policy:${userId}`, value: 'policy-v2', updatedAt: T0 });
  // Derived state (never exported).
  await store.encounters.put({ id: `enc:${userId}:1`, userId, lang: 'es', itemId: 'form:es:yo', itemKind: 'form', sentenceId: 'x', textId: 'y', surface: 'corpus', modality: 'reading', at: T0 } as unknown as Encounter);
  await store.learnerItems.put({ id: ids.learnerItem(userId, 'form:es:yo'), userId, lang: 'es', itemId: 'form:es:yo', itemKind: 'form' } as unknown as LearnerItemState);
  return { testimony, revisions, suggestion, draft, recIds };
}

const fresh = () => createMemoryStore();
const cloneFile = (f: BackupFile): BackupFile => JSON.parse(JSON.stringify(f)) as BackupFile;
/** Re-sign after a deliberate edit so only the intended rule (not the checksum) rejects the file. */
const resign = (f: BackupFile): BackupFile => { f.checksum = checksumOf(f.data); return f; };

async function tableSizes(store: AppStore) {
  const out: Record<string, number> = {};
  for (const k of ['users', 'events', 'testimonies', 'revisions', 'suggestions', 'drafts', 'recordings', 'meta', 'texts', 'sections', 'paragraphs', 'sentences', 'tokens', 'analyses', 'rescues', 'lemmas', 'corpora', 'sources', 'encounters', 'learnerItems'] as const) {
    out[k] = await store[k].count();
  }
  return out;
}

describe('backup: export', () => {
  it('round-trips a structurally valid source descriptor snapshot and rejects an id/origin mismatch', async () => {
    const store = fresh();
    const seeded = await seedLearner(store, 'u1');
    const textId = seeded.revisions[0].textId!;
    const tokenIds = new Set((await store.tokens.where('textId', textId)).map((token) => token.id));
    const analysis = (await store.analyses.all()).find((row) => tokenIds.has(row.tokenId))!;
    const sourceInfo = { id: 'adapter-es@6:hand', label: 'Course word list', origin: 'hand' as const, reviewStatus: 'machine-drafted' as const, version: '6' };
    await store.analyses.put({ ...analysis, sourceId: sourceInfo.id, origin: sourceInfo.origin, sourceInfo });
    const file = await exportLearner(store, 'u1');
    const target = fresh();
    await restoreLearner(target, file);
    expect((await target.analyses.get(analysis.id))?.sourceInfo).toEqual(sourceInfo);

    const changed = cloneFile(file);
    changed.data.testimonyContent.analyses[0].sourceInfo = { ...sourceInfo, id: 'adapter-es@999:hand' };
    resign(changed);
    expect(validateBackup(changed)).toContainEqual(expect.objectContaining({ code: 'malformed', path: expect.stringContaining('sourceInfo') }));
  });

  it('produces a versioned, checksummed file with only source rows', async () => {
    const store = fresh();
    await seedLearner(store, 'u1');
    const file = await exportLearner(store, 'u1');
    expect(file.format).toBe('go-backup');
    expect(file.version).toBe(1);
    expect(file.userId).toBe('u1');
    expect(file.policyVersion).toBe('policy-v2');
    expect(file.checksum).toMatch(/^fnv1a64:[0-9a-f]{16}$/);
    expect(file.data.events).toHaveLength(3);
    expect(file.data.revisions).toHaveLength(2);
    expect(file.data.testimonyContent.texts).toHaveLength(2);
    expect(file.data.testimonyContent.sentences).toHaveLength(3);
    expect(file.data.testimonyContent.analyses.length).toBeGreaterThan(0);
    expect(file.data.reference.lemmas.length).toBeGreaterThan(0);
    // The policy marker is derived-state bookkeeping: header only, not in meta.
    expect(file.data.meta.map((m) => m.id)).toEqual(['setting:u1:note']);
    expect(Object.keys(file.data)).not.toContain('encounters');
    expect(Object.keys(file.data)).not.toContain('learnerItems');
    expect(validateBackup(file)).toEqual([]);
    // Survives being written to disk and read back.
    expect(validateBackup(JSON.stringify(file))).toEqual([]);
  });

  it('refuses an unknown learner', async () => {
    await expect(exportLearner(fresh(), 'nobody')).rejects.toThrow(/no learner "nobody"/);
  });

  it('never exports a non-testimony text even if a revision points at one', async () => {
    const store = fresh();
    await seedLearner(store, 'u1');
    await buildFixtureText(store, { lang: 'es', slug: 'story-01', sentences: [{ tokens: [{ surface: 'Hola', lemma: 'hola' }] }] });
    const rev = (await store.revisions.get(ids.revision(ids.testimony('u1', 'es'), 1)))!;
    await store.revisions.put({ ...rev, textId: 'text:es:story-01' });
    const file = await exportLearner(store, 'u1');
    expect(file.data.testimonyContent.texts.map((t) => t.id)).not.toContain('text:es:story-01');
  });
});

describe('backup: round trip', () => {
  it('reproduces events, revisions, drafts and testimony text rows exactly in an empty store', async () => {
    const a = fresh();
    const src = await seedLearner(a, 'u1');
    const file = await exportLearner(a, 'u1');
    const b = fresh();
    const report = await restoreLearner(b, JSON.parse(JSON.stringify(file)));

    expect(report.userId).toBe('u1');
    expect(report.mode).toBe('merge');
    expect(report.needsRebuild).toBe(true);
    expect(report.changed).toBe(true);
    expect(report.events.added).toBe(3);

    expect(await b.events.where('userId', 'u1')).toEqual(await a.events.where('userId', 'u1'));
    expect(await b.revisions.all()).toEqual(await a.revisions.all());
    expect(await b.drafts.get(src.draft.id)).toEqual(src.draft);
    expect(await b.testimonies.get(src.testimony.id)).toEqual(src.testimony);
    expect(await b.suggestions.get(src.suggestion.id)).toEqual(src.suggestion);
    for (const name of ['texts', 'sections', 'paragraphs', 'sentences', 'tokens', 'analyses', 'rescues', 'lemmas', 'corpora', 'sources'] as const) {
      const sort = (rows: { id: string }[]) => [...rows].sort((x, y) => (x.id < y.id ? -1 : 1));
      expect(sort(await b[name].all() as { id: string }[])).toEqual(sort(await a[name].all() as { id: string }[]));
    }
    // Whole-file equality: re-exporting the restored store gives the same data.
    const again = await exportLearner(b, 'u1');
    expect(again.data).toEqual(file.data);
    expect(again.checksum).toBe(file.checksum);
    // Derived state is NOT carried over.
    expect(await b.encounters.count()).toBe(0);
    expect(await b.learnerItems.count()).toBe(0);
    // Policy marker not restored, so GoLearn's ensureCurrent sees a mismatch and rebuilds.
    expect(await b.meta.get('golearn-policy:u1')).toBeUndefined();
    expect((await b.meta.get('setting:u1:note'))?.value).toBe('hello');
  });

  it('double restore is a no-op', async () => {
    const a = fresh();
    await seedLearner(a, 'u1');
    const file = await exportLearner(a, 'u1', { includeRecordings: true });
    const b = fresh();
    await restoreLearner(b, file);
    const sizes = await tableSizes(b);
    const before = await exportLearner(b, 'u1', { includeRecordings: true });
    const second = await restoreLearner(b, file);
    expect(second.changed).toBe(false);
    expect(second.needsRebuild).toBe(false);
    expect(second.events.added).toBe(0);
    expect(second.events.duplicateById).toBe(3);
    expect(Object.values(second.tables).every((s) => s.added === 0 && s.updated === 0 && s.keptExisting === 0)).toBe(true);
    expect(await tableSizes(b)).toEqual(sizes);
    expect((await exportLearner(b, 'u1', { includeRecordings: true })).data).toEqual(before.data);
  });

  it('skips an event whose dedupeKey is already present even under a new id', async () => {
    const a = fresh();
    await seedLearner(a, 'u1');
    const file = await exportLearner(a, 'u1');
    const b = fresh();
    await restoreLearner(b, file);
    const renamed = cloneFile(file);
    renamed.data.events = renamed.data.events.map((e) => ({ ...e, id: e.id + ':other-device' }));
    const report = await restoreLearner(b, resign(renamed));
    expect(report.events.added).toBe(0);
    expect(report.events.duplicateByDedupeKey).toBe(3);
    expect(await b.events.count()).toBe(3);
  });

  it('accepts the raw JSON text of a file', async () => {
    const a = fresh();
    await seedLearner(a, 'u1');
    const text = JSON.stringify(await exportLearner(a, 'u1'));
    const b = fresh();
    const report = await restoreLearner(b, text);
    expect(report.events.added).toBe(3);
  });
});

describe('backup: rejection', () => {
  async function good() {
    const a = fresh();
    await seedLearner(a, 'u1');
    return exportLearner(a, 'u1');
  }

  it('rejects a corrupted file (checksum) with an actionable message and writes nothing', async () => {
    const file = cloneFile(await good());
    file.data.drafts[0].text = 'tampered';
    const issues = validateBackup(file);
    expect(issues.map((i) => i.code)).toEqual(['bad-checksum']);
    expect(issues[0].message).toMatch(/integrity check/);
    expect(issues[0].message).toMatch(/export a fresh backup/i);
    const target = fresh();
    await expect(restoreLearner(target, file)).rejects.toBeInstanceOf(BackupError);
    await expect(restoreLearner(target, file)).rejects.toThrow(/integrity check/);
    expect((await tableSizes(target)).users).toBe(0);
    expect((await tableSizes(target)).events).toBe(0);
  });

  it('rejects a newer and an older version, naming both', async () => {
    const base = await good();
    const newer = { ...cloneFile(base), version: 2 };
    const older = { ...cloneFile(base), version: 0 };
    const v2 = validateBackup(newer);
    expect(v2[0].code).toBe('unsupported-version');
    expect(v2[0].message).toMatch(/version 2/);
    expect(v2[0].message).toMatch(/Update Go/);
    expect(validateBackup(older)[0].code).toBe('unsupported-version');
    await expect(restoreLearner(fresh(), newer)).rejects.toThrow(/version 2/);
  });

  it('rejects non-backups, invalid JSON and truncated files', async () => {
    expect(validateBackup({ hello: 'world' })[0].code).toBe('not-a-backup');
    expect(validateBackup(null)[0].code).toBe('not-a-backup');
    expect(validateBackup('not json at all')[0].code).toBe('not-json');
    const text = JSON.stringify(await good());
    expect(validateBackup(text.slice(0, text.length - 40))[0].code).toBe('not-json');
    const missing = cloneFile(await good()) as unknown as { data: Record<string, unknown> };
    delete missing.data.events;
    expect(validateBackup(missing).some((i) => i.code === 'malformed' && /events/.test(i.message))).toBe(true);
  });

  it('rejects a file that carries another learner\'s rows even with a valid checksum', async () => {
    const forged = cloneFile(await good());
    forged.data.events.push(ev('u2', 9));
    resign(forged);
    const issues = validateBackup(forged);
    expect(issues.some((i) => i.code === 'wrong-learner' && /another learner/.test(i.message))).toBe(true);
    const target = fresh();
    await expect(restoreLearner(target, forged)).rejects.toBeInstanceOf(BackupError);
    expect(await target.events.count()).toBe(0);
  });

  it('rejects corpus text smuggled into the testimony content', async () => {
    const forged = cloneFile(await good());
    forged.data.testimonyContent.texts[0].kind = 'story';
    resign(forged);
    expect(validateBackup(forged).some((i) => /not a testimony text/.test(i.message))).toBe(true);
  });
});

describe('backup: two learners', () => {
  it('export contains only the requested learner', async () => {
    const store = fresh();
    await seedLearner(store, 'u1');
    await seedLearner(store, 'u2');
    const file = await exportLearner(store, 'u1', { includeRecordings: true });
    const json = JSON.stringify(file);
    expect(json).not.toContain('u2');
    expect(file.data.events.every((e) => e.userId === 'u1')).toBe(true);
    expect(file.data.testimonyContent.texts.map((t) => t.id)).toEqual(['text:es:u1-rev1', 'text:es:u1-rev2']);
    expect(file.data.recordings.every((r) => r.userId === 'u1')).toBe(true);
  });

  it('restore of one learner leaves the other learner and derived state byte-for-byte alone', async () => {
    const source = fresh();
    await seedLearner(source, 'u1');
    const file = await exportLearner(source, 'u1');

    const target = fresh();
    await seedLearner(target, 'u2');
    const u2Before = await exportLearner(target, 'u2', { includeRecordings: true });
    const encBefore = await target.encounters.where('userId', 'u2');
    await restoreLearner(target, file);
    await restoreLearner(target, file, { mode: 'replace' });
    expect((await exportLearner(target, 'u2', { includeRecordings: true })).data).toEqual(u2Before.data);
    expect(await target.encounters.where('userId', 'u2')).toEqual(encBefore);
    expect((await target.meta.get('golearn-policy:u2'))?.value).toBe('policy-v2');
    expect((await exportLearner(target, 'u1')).data).toEqual(file.data);
  });

  it('never overwrites another learner\'s event that happens to share an id', async () => {
    const source = fresh();
    await seedLearner(source, 'u1');
    const file = cloneFile(await exportLearner(source, 'u1'));
    const clashId = file.data.events[0].id;
    resign(file);
    const target = fresh();
    await target.users.put({ id: 'u2', displayName: 'Two', courseId: 'honduras-es', createdAt: T0 });
    await target.events.put(ev('u2', 1, { id: clashId, dedupeKey: 'theirs' }));
    const report = await restoreLearner(target, file);
    expect(report.events.conflictingOwner).toBe(1);
    expect(report.events.added).toBe(2);
    const theirs = (await target.events.get(clashId))!;
    expect(theirs.userId).toBe('u2');
    expect(theirs.dedupeKey).toBe('theirs');
    expect(report.warnings.join(' ')).toMatch(/another learner/);
  });
});

describe('backup: recordings', () => {
  it('omits audio by default but keeps recording details', async () => {
    const a = fresh();
    const src = await seedLearner(a, 'u1');
    const file = await exportLearner(a, 'u1');
    expect(file.includesRecordings).toBe(false);
    expect(file.data.recordings).toHaveLength(2);
    expect(Object.keys(file.data.assets)).toEqual([]);
    const b = fresh();
    const report = await restoreLearner(b, file);
    expect(report.recordings).toEqual({ audioRestored: 0, metadataWithoutAudio: 2 });
    expect(await b.recordings.count()).toBe(2);
    expect(await b.assets.has((await a.recordings.get(src.recIds[0]))!.assetId)).toBe(false);
    expect(report.warnings.join(' ')).toMatch(/no audio on this device/);
  });

  it('carries the audio byte-exact when included', async () => {
    const a = fresh();
    await seedLearner(a, 'u1');
    const file = await exportLearner(a, 'u1', { includeRecordings: true });
    expect(file.includesRecordings).toBe(true);
    expect(Object.keys(file.data.assets)).toHaveLength(2);
    const b = fresh();
    const report = await restoreLearner(b, JSON.parse(JSON.stringify(file)));
    expect(report.recordings).toEqual({ audioRestored: 2, metadataWithoutAudio: 0 });
    for (const rec of await b.recordings.all()) {
      const got = (await b.assets.get(rec.assetId))!;
      const want = rec.attempt === 1 ? WAV_A : WAV_B;
      expect(got.mime).toBe('audio/wav');
      expect(got.bytes.length).toBe(want.length);
      expect(Array.from(got.bytes)).toEqual(Array.from(want));
    }
  });

  it('reports recordings whose audio was missing at export time instead of failing', async () => {
    const a = fresh();
    await seedLearner(a, 'u1');
    const rec = (await a.recordings.get('rec:u1:0'))!;
    await a.recordings.put({ ...rec, assetId: 'fnv:gone' });
    const file = await exportLearner(a, 'u1', { includeRecordings: true });
    const issues = validateBackup(file);
    expect(issues.map((i) => [i.code, i.severity])).toEqual([['missing-audio', 'warning']]);
    const report = await restoreLearner(fresh(), file);
    expect(report.recordings.metadataWithoutAudio).toBe(1);
  });
});

describe('backup: merge rules', () => {
  async function pair() {
    const a = fresh();
    const src = await seedLearner(a, 'u1');
    const file = await exportLearner(a, 'u1');
    const b = fresh();
    await restoreLearner(b, file);
    return { file, b, src };
  }

  it('merge never overwrites a newer draft (higher seq)', async () => {
    const { file, b, src } = await pair();
    await b.drafts.put({ ...src.draft, text: 'written later on this device', seq: 9, updatedAt: '2026-03-05T00:00:00.000Z' });
    const report = await restoreLearner(b, file);
    expect(report.tables.drafts.keptExisting).toBe(1);
    expect((await b.drafts.get(src.draft.id))?.text).toBe('written later on this device');
  });

  it('a higher seq in the backup wins; equal seq falls back to updatedAt', async () => {
    const { file, b, src } = await pair();
    await b.drafts.put({ ...src.draft, text: 'older local', seq: 2, updatedAt: '2026-03-05T00:00:00.000Z' });
    let report = await restoreLearner(b, file);
    expect(report.tables.drafts.updated).toBe(1);
    expect((await b.drafts.get(src.draft.id))?.text).toBe(src.draft.text);

    await b.drafts.put({ ...src.draft, text: 'same seq, newer', seq: src.draft.seq, updatedAt: '2026-04-01T00:00:00.000Z' });
    report = await restoreLearner(b, file);
    expect(report.tables.drafts.keptExisting).toBe(1);
    expect((await b.drafts.get(src.draft.id))?.text).toBe('same seq, newer');

    await b.drafts.put({ ...src.draft, text: 'same seq, older', seq: src.draft.seq, updatedAt: '2026-01-01T00:00:00.000Z' });
    report = await restoreLearner(b, file);
    expect(report.tables.drafts.updated).toBe(1);
    expect((await b.drafts.get(src.draft.id))?.text).toBe(src.draft.text);
  });

  it('merge keeps local additions, never deletes, and keeps existing revisions unchanged', async () => {
    const { file, b, src } = await pair();
    await b.events.put(ev('u1', 7));
    await b.revisions.put({ ...src.revisions[0], fullText: 'edited locally' });
    const report = await restoreLearner(b, file);
    expect(await b.events.get('ev:u1:7')).toBeDefined();
    expect(report.tables.revisions.keptExisting).toBe(1);
    expect((await b.revisions.get(src.revisions[0].id))?.fullText).toBe('edited locally');
    expect(report.changed).toBe(false);
  });

  it('a backup with a further-along testimony pointer advances the device', async () => {
    const { file, b, src } = await pair();
    await b.testimonies.put({ ...src.testimony, currentRevisionId: src.revisions[0].id });
    const report = await restoreLearner(b, file);
    expect(report.tables.testimonies.updated).toBe(1);
    expect((await b.testimonies.get(src.testimony.id))?.currentRevisionId).toBe(src.revisions[1].id);
    // ...and a device that is further along is not pulled back.
    const older = cloneFile(file);
    older.data.testimonies[0].currentRevisionId = src.revisions[0].id;
    await restoreLearner(b, resign(older));
    expect((await b.testimonies.get(src.testimony.id))?.currentRevisionId).toBe(src.revisions[1].id);
  });

  it('new events from a backup clear the derived-state marker so GoLearn rebuilds', async () => {
    const { file, b } = await pair();
    await b.meta.put({ id: 'golearn-policy:u1', value: 'policy-v2', updatedAt: T0 });
    const more = cloneFile(file);
    more.data.events.push(ev('u1', 8));
    const report = await restoreLearner(b, resign(more));
    expect(report.needsRebuild).toBe(true);
    expect(report.events.added).toBe(1);
    expect(await b.meta.get('golearn-policy:u1')).toBeUndefined();
  });
});

describe('backup: replace mode', () => {
  it('removes only that learner\'s existing source rows, then restores the file', async () => {
    const source = fresh();
    await seedLearner(source, 'u1');
    const file = await exportLearner(source, 'u1');

    const target = fresh();
    await seedLearner(target, 'u1');
    await seedLearner(target, 'u2');
    // u1 state that is NOT in the backup: extra event, a newer draft, an extra revision with its private text.
    await target.events.put(ev('u1', 6));
    await target.drafts.put({ ...(await target.drafts.get(ids.draft('u1', 'es')))!, text: 'local only', seq: 50 });
    await buildFixtureText(target, { lang: 'es', slug: 'u1-rev3', kind: 'testimony', corpusId: 'testimony-es', sourceId: 'src:testimony:u1', sentences: [{ tokens: [{ surface: 'Extra', lemma: 'extra' }] }] });
    const tid = ids.testimony('u1', 'es');
    await target.revisions.put({ id: ids.revision(tid, 3), testimonyId: tid, userId: 'u1', lang: 'es', number: 3, createdAt: T0, fullText: 'Extra', sentences: [], textId: 'text:es:u1-rev3', acceptedSuggestionIds: [] });

    const u2Before = await exportLearner(target, 'u2', { includeRecordings: true });
    const u2Sizes = { enc: await target.encounters.where('userId', 'u2'), items: await target.learnerItems.where('userId', 'u2') };

    const report = await restoreLearner(target, file, { mode: 'replace' });
    expect(report.mode).toBe('replace');
    expect(report.needsRebuild).toBe(true);
    expect(report.removed.events).toBe(4);
    expect(report.removed.revisions).toBe(3);
    expect(report.removed.texts).toBe(3);
    expect(report.removed.encounters).toBe(1);

    // u1 now equals the backup exactly.
    expect(await target.events.get('ev:u1:6')).toBeUndefined();
    expect(await target.texts.get('text:es:u1-rev3')).toBeUndefined();
    expect(await target.revisions.get(ids.revision(tid, 3))).toBeUndefined();
    expect((await target.drafts.get(ids.draft('u1', 'es')))?.text).toBe('Dios me perdonó y');
    expect((await exportLearner(target, 'u1')).data).toEqual(file.data);
    // u1 derived rows were dropped (stale), u2's are untouched.
    expect(await target.encounters.where('userId', 'u1')).toEqual([]);
    expect(await target.learnerItems.where('userId', 'u1')).toEqual([]);
    expect(await target.meta.get('golearn-policy:u1')).toBeUndefined();
    expect((await exportLearner(target, 'u2', { includeRecordings: true })).data).toEqual(u2Before.data);
    expect(await target.encounters.where('userId', 'u2')).toEqual(u2Sizes.enc);
    expect(await target.learnerItems.where('userId', 'u2')).toEqual(u2Sizes.items);
    expect((await target.meta.get('golearn-policy:u2'))?.value).toBe('policy-v2');
    // u2's private texts survive.
    expect(await target.texts.get('text:es:u2-rev1')).toBeDefined();
  });

  it('replace is also idempotent, and an invalid file is rejected before anything is deleted', async () => {
    const source = fresh();
    await seedLearner(source, 'u1');
    const file = await exportLearner(source, 'u1');
    const target = fresh();
    await seedLearner(target, 'u1');
    const before = await tableSizes(target);
    const bad = cloneFile(file);
    bad.data.events.pop();
    await expect(restoreLearner(target, bad, { mode: 'replace' })).rejects.toThrow(/integrity check/);
    expect(await tableSizes(target)).toEqual(before);

    await restoreLearner(target, file, { mode: 'replace' });
    const once = (await exportLearner(target, 'u1')).data;
    await restoreLearner(target, file, { mode: 'replace' });
    expect((await exportLearner(target, 'u1')).data).toEqual(once);
  });
});
