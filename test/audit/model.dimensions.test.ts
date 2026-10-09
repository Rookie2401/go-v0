// @vitest-environment node
/**
 * AUDIT §17 — the knowledge model keeps its dimensions apart.
 * Four learners are CONSTRUCTED over the real projection engine (memory store and SQLite store, both) and, for every event,
 * the audit compares the whole row set before and after: exactly the (unit, dimension) pairs the evidence names may move.
 */
import { describe, expect, it } from 'vitest';
import { append, changed, dimOf, ev, flushRowsAfterAll, grammar, listened, makeWorld, normal, note, played, produced, recall, recognition, resolve, rowsOf, shuffled, CONSTR, FORM, LEARNER, LEM, ENROL, SENSE, SENT_SHKOLLE } from './model.support';
import type { World } from './model.support';

flushRowsAfterAll('model.dimensions');

const KINDS = ['memory', 'sqlite'] as const;

async function fixture(kind: (typeof KINDS)[number]): Promise<World> {
  const w = await makeWorld(kind);
  // a pack whose manifest claims production-validated (none does today: the machine-drafted packs read as unreviewed), so that a high-confidence
  // reading really can support a grammar item; with the default level the same reading is provisional at best (see the eligibility gate)
  await resolve(w, 'shkollë', SENT_SHKOLLE, 'production-validated');
  return w;
}

/** live (incremental) rows equal a rebuild from the log, for the stored rows and for the rows read through the engine. */
async function rebuildEqualsLive(w: World): Promise<void> {
  const live = await w.engine.knowledge(LEARNER);
  const stored = await w.store.getKnowledge(LEARNER);
  const rebuilt = await w.engine.rebuild(LEARNER);
  expect(normal(rebuilt)).toBe(normal(live));
  expect(normal(await w.store.getKnowledge(LEARNER))).toBe(normal(stored));
}

describe.each(KINDS)('§17 four learners on the %s store', (kind) => {
  it('fixture: the real Albanian resolver stored shkollë with a high-confidence reading, lexeme, sense and construction', async () => {
    const w = await fixture(kind);
    const units = await w.store.getUnits([FORM, LEM, SENSE, CONSTR]);
    expect(units.map((u) => [u.unitId, u.status]).sort()).toEqual([[CONSTR, 'high-confidence'], [FORM, 'high-confidence'], [LEM, 'high-confidence'], [SENSE, 'high-confidence']].sort());
  });

  it('(1) recognises the lemma in reading but fails the grammar of its inflected form: only the construction\'s grammar moves', async () => {
    const w = await fixture(kind);
    await append(w, recognition([LEM], true));
    const before = await rowsOf(w);
    expect(changed(new Map(), before)).toEqual([`${LEM}|readingRecognition`]);

    await append(w, grammar([FORM, CONSTR], CONSTR, false));
    const after = await rowsOf(w);
    const moved = changed(before, after);
    expect(moved).toEqual([`${CONSTR}|grammaticalUnderstanding`]);
    expect(after.get(LEM)).toEqual(before.get(LEM)); // the lemma row is untouched
    expect(after.has(FORM)).toBe(false); // the form itself was not judged: the grammar failure is the construction's
    expect(dimOf(after, LEM, 'readingRecognition').score).toBeGreaterThan(0.5);
    expect(dimOf(after, CONSTR, 'grammaticalUnderstanding').score).toBeLessThan(0.5);
    expect(dimOf(after, CONSTR, 'grammaticalUnderstanding').negative).toBeGreaterThan(0);
    expect(dimOf(after, LEM, 'grammaticalUnderstanding').observations).toBe(0);

    // the candidates say the same: the construction is the thing to review, and it is eligible (high-confidence analysis)
    const cands = await w.engine.candidates(LEARNER, ENROL, { now: w.now });
    const c = cands.find((x) => x.unitId === CONSTR);
    expect(c?.targetDimension).toBe('grammaticalUnderstanding');
    expect(c?.eligibility.eligible).toBe(true);
    expect(cands.some((x) => x.unitId === LEM)).toBe(false); // a recognised lemma with no error is not a candidate
    await rebuildEqualsLive(w);
    if (kind === 'memory') note('M1', '§17', 'recognises lemma (reading) but fails grammar of inflected form', 'moves: construction/grammaticalUnderstanding only; lemma row byte-identical', `moved ${JSON.stringify(moved)}; lemma row identical; construction grammar score ${dimOf(after, CONSTR, 'grammaticalUnderstanding').score}`);
  });

  it('(2) knows a word sense in reading but cannot retrieve it productively: reading and retrieval are separate estimates', async () => {
    const w = await fixture(kind);
    await append(w, recognition([SENSE], true), recognition([SENSE], true));
    const before = await rowsOf(w);
    await append(w, recall([SENSE], false));
    const mid = await rowsOf(w);
    expect(changed(before, mid)).toEqual([`${SENSE}|productiveRetrieval`]);
    expect(dimOf(mid, SENSE, 'readingRecognition')).toEqual(dimOf(before, SENSE, 'readingRecognition'));
    expect(dimOf(mid, SENSE, 'readingRecognition').score).toBeGreaterThan(0.5);
    expect(dimOf(mid, SENSE, 'productiveRetrieval').score).toBeLessThan(0.5);

    const c = (await w.engine.candidates(LEARNER, ENROL, { now: w.now })).find((x) => x.unitId === SENSE);
    expect(c?.targetDimension).toBe('productiveRetrieval');

    // the reverse isolation: a later reading failure moves reading only, a later recall success moves retrieval only
    await append(w, recognition([SENSE], false));
    const afterReadingFail = await rowsOf(w);
    expect(changed(mid, afterReadingFail)).toEqual([`${SENSE}|readingRecognition`]);
    await append(w, recall([SENSE], true));
    const afterRecall = await rowsOf(w);
    expect(changed(afterReadingFail, afterRecall)).toEqual([`${SENSE}|productiveRetrieval`]);
    await rebuildEqualsLive(w);
    if (kind === 'memory') note('M2', '§17', 'knows sense in reading, cannot retrieve it productively', 'moves: sense/productiveRetrieval only; reading estimate unchanged; candidate targets productiveRetrieval', `moved ${JSON.stringify(changed(before, mid))}; reading score ${dimOf(mid, SENSE, 'readingRecognition').score} unchanged; retrieval score ${dimOf(mid, SENSE, 'productiveRetrieval').score}; candidate target ${c?.targetDimension}`);
  });

  it('(3) recognises by ear (reviewed recording) but not by eye: listening and reading move independently', async () => {
    const w = await fixture(kind);
    // exactly what GoListen / GoReview write for an eligible recording: quality moderate, voice recorded, answer hidden
    await append(w, listened([FORM], true, { evidence: { quality: 'moderate', assisted: false } }));
    const afterListening = await rowsOf(w);
    expect(changed(new Map(), afterListening)).toEqual([`${FORM}|listeningRecognition`]);
    await append(w, recognition([FORM], false));
    const afterReading = await rowsOf(w);
    expect(changed(afterListening, afterReading)).toEqual([`${FORM}|readingRecognition`]);
    expect(dimOf(afterReading, FORM, 'listeningRecognition')).toEqual(dimOf(afterListening, FORM, 'listeningRecognition'));
    expect(dimOf(afterReading, FORM, 'listeningRecognition').score).toBeGreaterThan(0.5);
    expect(dimOf(afterReading, FORM, 'readingRecognition').score).toBeLessThan(0.5);
    expect(dimOf(afterListening, FORM, 'readingRecognition').observations).toBe(0);
    await rebuildEqualsLive(w);
    if (kind === 'memory') note('M3', '§17', 'recognises in listening, not in reading', 'listening score > 0.5 and reading score < 0.5 on the same form; each event moves one dimension', `listening ${dimOf(afterReading, FORM, 'listeningRecognition').score} (unchanged by the reading failure); reading ${dimOf(afterReading, FORM, 'readingRecognition').score}`);
  });

  it('(4) wrote the construction independently but failed a grammar review on it: both facts stay, neither overwrites the other', async () => {
    const w = await fixture(kind);
    await append(w, produced([CONSTR, LEM], true));
    const afterWriting = await rowsOf(w);
    expect(changed(new Map(), afterWriting)).toEqual([`${CONSTR}|contextualProduction`, `${LEM}|contextualProduction`].sort());
    await append(w, grammar([FORM, CONSTR], CONSTR, false));
    const afterGrammar = await rowsOf(w);
    expect(changed(afterWriting, afterGrammar)).toEqual([`${CONSTR}|grammaticalUnderstanding`]);
    expect(dimOf(afterGrammar, CONSTR, 'contextualProduction')).toEqual(dimOf(afterWriting, CONSTR, 'contextualProduction'));
    expect(dimOf(afterGrammar, CONSTR, 'contextualProduction').score).toBeGreaterThan(0.5);
    expect(dimOf(afterGrammar, CONSTR, 'grammaticalUnderstanding').score).toBeLessThan(0.5);

    // assisted writing never reaches the independent dimension; a failed independent attempt moves production only
    await append(w, produced([CONSTR], true, {}, { assisted: true, assistance: ['correction'] }));
    const afterAssisted = await rowsOf(w);
    expect(changed(afterGrammar, afterAssisted)).toEqual([`${CONSTR}|assistedRecognition`]);
    await append(w, produced([CONSTR], false));
    const afterFailedWriting = await rowsOf(w);
    expect(changed(afterAssisted, afterFailedWriting)).toEqual([`${CONSTR}|contextualProduction`]);
    expect(dimOf(afterFailedWriting, CONSTR, 'grammaticalUnderstanding')).toEqual(dimOf(afterGrammar, CONSTR, 'grammaticalUnderstanding'));
    await rebuildEqualsLive(w);
    if (kind === 'memory') note('M4', '§17', 'wrote the construction independently, failed a grammar review on it', 'production score > 0.5 and grammar score < 0.5 on the same construction; assisted writing moves assistedRecognition only', `production ${dimOf(afterGrammar, CONSTR, 'contextualProduction').score}; grammar ${dimOf(afterGrammar, CONSTR, 'grammaticalUnderstanding').score}; assisted moved ${JSON.stringify(changed(afterGrammar, afterAssisted))}`);
  });

  it('non-evidence never moves a judged dimension: playback, lookup, accepted corrections, saved marks, deck bookkeeping', async () => {
    const w = await fixture(kind);
    await append(w, recognition([LEM], true));
    const before = await rowsOf(w);
    const noEvidence = [
      played([LEM, FORM], 'recorded'),
      ev('ListeningCompleted', [LEM], { voice: 'recorded' }),
      ev('SelectionLookedUp', [LEM], { tokenCount: 1, contextKind: 'sentence', contextConfidence: 1, readerId: 'r', helpShown: ['gloss'] }),
      ev('CorrectionAccepted', [LEM], {}),
      ev('ItemMarked', [LEM], { mark: 'saved' }),
      ev('CardAdded', [LEM], { unitId: LEM }),
    ];
    for (const e of noEvidence) await append(w, e);
    const after = await rowsOf(w);
    const judged = (rows: typeof after, id: string) => ['assistedRecognition', 'readingRecognition', 'listeningRecognition', 'productiveRetrieval', 'contextualProduction', 'grammaticalUnderstanding'].map((d) => JSON.stringify(dimOf(rows, id, d as never)));
    expect(judged(after, LEM)).toEqual(judged(before, LEM));
    expect(dimOf(after, LEM, 'listeningRecognition').observations).toBe(0);
    expect(dimOf(after, LEM, 'exposure').observations).toBeGreaterThan(0); // they are exposure, and only that
    await rebuildEqualsLive(w);
    if (kind === 'memory') note('M5', '§17', 'playback, lookup, accepted correction, saved mark, card bookkeeping', 'no judged dimension moves; exposure only', `6 judged dimensions identical before/after; listeningRecognition observations ${dimOf(after, LEM, 'listeningRecognition').observations}`);
  });
});

describe('§17 rebuild equals live, replays and arrival order', () => {
  const history = () => [
    recognition([LEM], true), recall([SENSE], false), grammar([FORM, CONSTR], CONSTR, false), listened([FORM], true, { evidence: { quality: 'moderate' } }),
    produced([CONSTR, LEM], true), recognition([FORM], false), recall([SENSE], true), produced([CONSTR], true, {}, { assisted: true, assistance: ['hint'] }),
  ];

  it.each(KINDS)('%s: incremental rows after every event equal a rebuild at the end', async (kind) => {
    const w = await fixture(kind);
    for (const e of history()) await append(w, e);
    await rebuildEqualsLive(w);
    const rows = await rowsOf(w);
    expect(rows.size).toBeGreaterThanOrEqual(4);
    if (kind === 'sqlite') note('M6', '§17', 'rebuild equals live (8 mixed events, memory and SQLite)', 'rebuilt rows deep-equal the incrementally projected rows', `${rows.size} rows identical after rebuild on both stores`);
  });

  it('the memory store and the SQLite store project byte-identical rows from the same history', async () => {
    const events = history();
    const a = await fixture('memory');
    const b = await fixture('sqlite');
    await a.store.append(LEARNER, events);
    await b.store.append(LEARNER, events);
    expect(normal(await a.engine.rebuild(LEARNER))).toBe(normal(await b.engine.rebuild(LEARNER)));
  });

  it('arrival order does not matter: ten shuffles of the log (same instants) project the same rows', async () => {
    const events = history();
    const ref = await fixture('memory');
    await ref.store.append(LEARNER, events);
    const expected = normal(await ref.engine.rebuild(LEARNER));
    for (let seed = 1; seed <= 10; seed++) {
      const w = await fixture('memory');
      for (const e of shuffled(events, seed)) { await w.store.append(LEARNER, [e]); await w.engine.project(LEARNER); }
      expect(normal(await w.engine.knowledge(LEARNER))).toBe(expected);
    }
    note('M7', '§17', 'ten shuffled arrival orders of 8 events', 'identical rows in every order (incremental projection after each arrival)', '10/10 orders identical to the in-order rebuild');
  });

  it('a duplicate delivery (same id) and a retry under a new id with the same dedupeKey change nothing', async () => {
    const w = await fixture('memory');
    const e1 = recognition([LEM], true, { dedupeKey: 'k-1' });
    await append(w, e1);
    const live = normal(await w.engine.knowledge(LEARNER));
    const head = await w.store.head(LEARNER);
    const again = await append(w, e1);
    const retry = await append(w, { ...e1, id: `${e1.id}-retry`, producer: { ...e1.producer, deviceId: 'dev-B' } });
    expect([again[0]!.stored, retry[0]!.stored]).toEqual([false, false]);
    expect(await w.store.head(LEARNER)).toBe(head);
    expect(normal(await w.engine.knowledge(LEARNER))).toBe(live);
    note('M8', '§17', 'duplicate id and duplicate dedupeKey under a new id', 'neither is stored; log head and rows unchanged', `stored ${again[0]!.stored}/${retry[0]!.stored}; head ${head} unchanged`);
  });

  it('the engine itself also collapses a same-id duplicate that reached the fold directly (second line of defence)', async () => {
    const { foldEvents } = await import('../../packages/repository-engine/src');
    const e = recognition([LEM], true);
    const once = foldEvents([e], { modelVersion: 'x' });
    const twice = foldEvents([e, { ...e }], { modelVersion: 'x' });
    expect(JSON.stringify(twice)).toBe(JSON.stringify(once));
  });
});
