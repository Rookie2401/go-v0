/**
 * The simulated learner (src/sim): the learner's rule, the loop over a tiny synthetic course (real importer, real GoLearn, real
 * event bus, memory store), the stop conditions, the fluff detectors and the summary figures.
 */
import { describe, expect, it } from 'vitest';
import { COURSES, StoreEventBus, createMemoryStore, seedBasics } from '../../src/core';
import type { AppStore, ComprehensionReported, LanguageCode, Recommendation, SentenceViewed, TextCompleted, TokenHelpOpened } from '../../src/core';
import { createAdapterRegistry } from '../../src/adapters';
import { createGoLearn } from '../../src/golearn';
import { importDocuments } from '../../src/ingest';
import type { CorpusDocument } from '../../src/ingest';
import { createStage0 } from '../../src/stage0';
import { FluffTracker } from '../../src/sim/fluff';
import { AUTO, KNOWN_AFTER, LemmaIndex, SimLearner, analyseSentence } from '../../src/sim/learner';
import { makeSimClock } from '../../src/sim/engine';
import { runSimulation } from '../../src/sim/run';
import { createIndexedMemoryStore } from '../../src/sim/store';
import { firstWindowReaching, summarise } from '../../src/sim/summary';
import type { SimEngine, SimOptions, SimRow } from '../../src/sim/types';

const adapters = createAdapterRegistry();
const U = 'u1';

/** A minimal valid Spanish story. `published` makes it the team's own writing (published without a review); otherwise it is a draft. */
function doc(id: string, lines: string[], published: boolean, paragraphs?: string[][]): CorpusDocument {
  const para = paragraphs ?? [lines];
  let k = 0;
  return {
    schemaVersion: 2, id, lang: 'es', title: `Texto ${id}`, contentType: 'story',
    corpus: { id: 'sim-es', kind: 'comprehensible-input', title: 'Sim' },
    source: { id: `src:${id}`, title: id, attribution: 'Test', provenance: 'written for tests', rights: 'owner-authored', authorship: 'human' },
    review: { status: 'unreviewed' }, topics: [], editorialTags: [], prepTargets: [], generated: false, english: { source: 'test author' },
    ...(published ? { teamText: true } : {}),
    sections: [{ paragraphs: para.map((ps) => ({ sentences: ps.map((text) => ({ id: `s${++k}`, text, english: 'x' })) })) }],
  } as CorpusDocument;
}

const ONE = doc('uno', ['El perro come.', 'El perro come mucho.', 'El perro come pan.'], true);
const TWO = doc('dos', ['El perro come pan y agua.'], true);
const DRAFT = doc('borrador', ['La gata duerme.', 'La gata sueña.'], false);
const textId = (d: CorpusDocument) => `text:es:${d.id}`;

async function world(docs: CorpusDocument[], course = 'honduras-es') {
  const store: AppStore = createMemoryStore();
  const clock = makeSimClock();
  const bus = new StoreEventBus(store, clock.now);
  await seedBasics(store, U, course);
  const golearn = createGoLearn({ store, bus, adapters, clock: clock.now });
  golearn.attach();
  if (docs.length) {
    const report = await importDocuments(store, adapters, docs, { clock: clock.now });
    expect(report.ok, JSON.stringify(report.documents.map((d) => d.issues))).toBe(true);
  }
  return { store, clock, bus, golearn };
}
type World = Awaited<ReturnType<typeof world>>;

const rec = (id: string, reason: Recommendation['reason'] = 'next-input'): Recommendation => ({ reason, textId: id, reinforces: [], score: 0.5, explanation: 'scripted' });

/** An engine over the world. `script` replaces the recommendation list (call number -> list); without it the REAL GoLearn.recommend answers. */
function engineOf(w: World, script?: (call: number) => Recommendation[], extra: Partial<SimEngine> = {}): SimEngine & { asked: Recommendation[][] } {
  const asked: Recommendation[][] = [];
  return {
    asked, lang: 'es', userId: U, store: w.store, bus: w.bus, adapters, clock: w.clock,
    recommend: async (o) => {
      const recs = script ? script(asked.length) : await w.golearn.recommend(U, { limit: o.limit, includeUnpublished: o.includeUnpublished });
      asked.push(recs);
      return recs;
    },
    openText: async (id) => { const t = await w.store.texts.get(id); if (!t) throw new Error(`no ${id}`); return t; },
    substitutions: [],
    ...extra,
  };
}

const opts = (over: Partial<SimOptions> = {}): SimOptions => ({ includeUnpublished: false, maxWords: 100_000, maxTexts: 100, maxMinutes: 5, ...over });

describe('the learner rule', () => {
  it('a lemma is known after exactly three encounters; proper nouns and numerals are known from the start; coverage is taken before meeting', () => {
    const lemmas = new LemmaIndex();
    const words = analyseSentence(adapters.get('es'), 'El perro tiene huesos.', lemmas);
    expect(words.map((w) => w.tokenIndex)).toEqual([0, 1, 2, 3]);
    const perro = words[1]!.lemma;
    expect(perro).toBeGreaterThanOrEqual(0);
    words.push({ tokenIndex: 4, lemma: AUTO }); // a proper noun or numeral the adapter marks (PROPN / NUM): known from the start
    const l = new SimLearner();
    expect(KNOWN_AFTER).toBe(3);
    expect(l.isKnown(perro)).toBe(false);
    expect(l.meet(perro)).toEqual({ first: true, becameKnown: false });
    expect(l.meet(perro)).toEqual({ first: false, becameKnown: false });
    expect(l.isKnown(perro)).toBe(false);
    expect(l.meet(perro)).toEqual({ first: false, becameKnown: true });
    expect(l.isKnown(perro)).toBe(true);
    expect(l.known).toBe(1);
    expect(l.meet(perro)).toEqual({ first: false, becameKnown: false }); // already known: nothing new
    expect(l.meet(AUTO)).toEqual({ first: false, becameKnown: false });
    // coverage: perro + the automatic word, of five words
    expect(l.coverage(words)).toBeCloseTo(2 / 5, 5);
    expect(l.coverage([])).toBe(1);
  });
});

describe('the loop over a tiny synthetic course (real importer, real GoLearn)', () => {
  it('takes the engine\'s first recommendation, emits the reader\'s events, and applies the learner rule across texts', async () => {
    const w = await world([ONE, TWO, DRAFT]);
    const eng = engineOf(w);
    const run = await runSimulation(eng, opts({ skipRereads: true }));

    // normal mode: the draft is never offered or read; both published texts are read; then nothing is left to open
    const read = run.rows.map((r) => r.textId);
    expect(new Set(read)).toEqual(new Set([textId(ONE), textId(TWO)]));
    expect(read).not.toContain(textId(DRAFT));
    expect(run.stop.reason).toBe('no-openable-recommendation');

    // each row is the FIRST openable recommendation of the engine's own list at that moment
    expect(eng.asked[0]!.find((x) => x.textId)?.textId).toBe(run.rows[0]!.textId);
    run.rows.forEach((r, i) => expect(eng.asked[i]!.find((x) => x.textId === r.textId)?.reason, `row ${i}`).toBe(r.reason));
    expect(run.rows[0]!.reason).toBe('first-text');

    // the events: every sentence viewed, every sentence reported understood (degree all), the text completed
    const events = await w.bus.history({ userId: U });
    const first = run.rows[0]!;
    const sentencesOf = async (id: string) => (await w.store.sentences.where('textId', id)).filter((s) => s.retiredInVersion === undefined);
    const firstSentences = await sentencesOf(first.textId);
    const views = events.filter((e): e is SentenceViewed => e.type === 'SentenceViewed' && e.textId === first.textId);
    expect(views.map((e) => e.sentenceId).sort()).toEqual(firstSentences.map((s) => s.id).sort());
    const reports = events.filter((e): e is ComprehensionReported => e.type === 'ComprehensionReported' && e.textId === first.textId);
    expect(reports).toHaveLength(firstSentences.length);
    expect(reports.every((e) => e.modality === 'reading' && e.scope === 'sentence' && e.degree === 'all')).toBe(true);
    expect(events.filter((e): e is TextCompleted => e.type === 'TextCompleted' && e.textId === first.textId)).toHaveLength(1);

    // GoLearn folded them: the text is finished, every sentence seen and understood
    const progress = await w.golearn.readingProgress(U, first.textId);
    expect(progress.finishedAt).toBeDefined();
    expect(progress.sentencesSeen).toBe(firstSentences.length);
    expect(progress.sentencesUnderstood).toBe(firstSentences.length);

    // the learner rule: a new learner looks up EVERY word of the first text that it has not yet met 3 times
    const helps = events.filter((e): e is TokenHelpOpened => e.type === 'TokenHelpOpened' && firstSentences.some((s) => s.id === e.sentenceId));
    expect(helps).toHaveLength(first.lookups);
    expect(first.cov3).toBe(0);
    expect(first.newLemmasMet).toBeGreaterThan(0);

    // cumulative figures add up
    expect(run.rows[run.rows.length - 1]!.cumWords).toBe(run.rows.reduce((n, r) => n + r.words, 0));
    expect(run.rows[run.rows.length - 1]!.cumKnown).toBeGreaterThanOrEqual(run.rows[0]!.newKnown);
  });

  it('applies the learner rule across texts: what was met three times is known, and is not looked up again', async () => {
    const w = await world([ONE, TWO]);
    const eng = engineOf(w, (n) => (n === 0 ? [rec(textId(ONE), 'first-text')] : n === 1 ? [rec(textId(TWO))] : []));
    const run = await runSimulation(eng, opts());
    const [a, b] = run.rows;
    expect([a!.textId, b!.textId]).toEqual([textId(ONE), textId(TWO)]);
    // ONE: "el perro come" x3 (+ mucho, pan once)
    expect(a!.cov3).toBe(0);
    expect(a!.words).toBe(11);
    expect(a!.lookups).toBe(11); // each word was unknown when read: el, perro, come only reach their third sighting in the last sentence
    expect(a!.newKnown).toBe(3);
    // TWO: el perro come | pan y agua  -> 3 of 6 known before reading, 3 looked up
    expect(b!.cov3).toBeCloseTo(0.5, 5);
    expect(b!.lookups).toBe(3);
    expect(b!.lookupsPer100).toBe(50);
    const helps = (await w.bus.history({ userId: U, types: ['TokenHelpOpened'] })) as TokenHelpOpened[];
    const sentenceTwo = (await w.store.sentences.where('textId', textId(TWO)))[0]!;
    expect(helps.filter((h) => h.sentenceId === sentenceTwo.id)).toHaveLength(3);
  });

  it('is deterministic: the same course gives the same rows', async () => {
    const a = await runSimulation(engineOf(await world([ONE, TWO, DRAFT])), opts({ skipRereads: true }));
    const b = await runSimulation(engineOf(await world([ONE, TWO, DRAFT])), opts({ skipRereads: true }));
    const strip = (rows: SimRow[]) => rows.map(({ textId: t, words, cov3, newKnown, lookups, reason }) => ({ t, words, cov3, newKnown, lookups, reason }));
    expect(strip(a.rows)).toEqual(strip(b.rows));
  });

  it('preview mode opens the draft that normal mode never shows', async () => {
    const normal = await runSimulation(engineOf(await world([ONE, DRAFT])), opts({ skipRereads: true }));
    const preview = await runSimulation(engineOf(await world([ONE, DRAFT])), opts({ skipRereads: true, includeUnpublished: true }));
    expect(normal.mode).toBe('normal');
    expect(preview.mode).toBe('preview');
    expect(normal.rows.map((r) => r.textId)).toEqual([textId(ONE)]);
    expect(new Set(preview.rows.map((r) => r.textId))).toEqual(new Set([textId(ONE), textId(DRAFT)]));
    expect(preview.rows.find((r) => r.textId === textId(DRAFT))!.published).toBe(false);
  });
});

describe('what the learner may open, and when he stops', () => {
  it('skips testimony, listening-only and (outside preview) unpublished recommendations, and records them', async () => {
    const w = await world([ONE, DRAFT]);
    const testimony: Recommendation = { reason: 'rehearse-testimony', testimonyId: 't1', reinforces: [], score: 0.5, explanation: 'rehearse' };
    const eng = engineOf(w, (n) => (n === 0
      ? [testimony, rec(textId(ONE), 'listen-to-read-text'), rec(textId(DRAFT)), rec('text:es:nope'), rec(textId(ONE), 'first-text')]
      : []));
    const run = await runSimulation(eng, opts());
    expect(run.rows.map((r) => r.textId)).toEqual([textId(ONE)]);
    expect(run.rows[0]!.reason).toBe('first-text');
    expect(run.skipped.map((s) => s.reason)).toEqual(expect.arrayContaining(['testimony', 'listening-only', 'unpublished-outside-preview', 'cannot-open']));
    expect(run.stop.reason).toBe('no-openable-recommendation');
  });

  it('stops when the same text is recommended 3 times in a row (the third is not read)', async () => {
    const w = await world([ONE]);
    const run = await runSimulation(engineOf(w, () => [rec(textId(ONE))]), opts());
    expect(run.stop.reason).toBe('same-text-3-in-a-row');
    expect(run.rows).toHaveLength(2);
    expect(run.rows.map((r) => r.reread)).toEqual([false, true]);
    // the reread is a new sitting: GoLearn saw the sentences again, the learner now knows the words he met three times
    expect(run.rows[1]!.cov3).toBeGreaterThan(run.rows[0]!.cov3);
  });

  it('stops at the word, text and time budgets, and says which', async () => {
    const w = await world([ONE, TWO]);
    const alt = (n: number) => [rec(n % 2 === 0 ? textId(ONE) : textId(TWO))];
    const words = await runSimulation(engineOf(w, alt), opts({ maxWords: 5 }));
    expect(words.stop.reason).toBe('max-words');
    expect(words.rows).toHaveLength(1);
    const w2 = await world([ONE, TWO]);
    const texts = await runSimulation(engineOf(w2, alt), opts({ maxTexts: 3 }));
    expect(texts.stop.reason).toBe('max-texts');
    expect(texts.rows).toHaveLength(3);
    const w3 = await world([ONE, TWO]);
    const minutes = await runSimulation(engineOf(w3, alt), opts({ maxMinutes: -1 }));
    expect(minutes.stop.reason).toBe('max-minutes');
    expect(minutes.rows).toHaveLength(0);
  });

  it('classifies a library, ladder or scripture text by what the catalogue and the ladder say', async () => {
    const w = await world([ONE]);
    const ladder = new Map([[textId(ONE), { unitId: 'es-a1-1-01', stage: 'a1-1', domain: 'conversation', kind: 'controlled' }]]);
    const run = await runSimulation(engineOf(w, (n) => (n === 0 ? [rec(textId(ONE))] : []), { ladder }), opts());
    expect(run.rows[0]!.kind).toBe('ladder');
    expect(run.rows[0]!.domain).toBe('conversation');
  });
});

describe('Stage 0 first', () => {
  it('reads the scenes in path order, completes the steps and finishes the exit with a verdict', async () => {
    const sq = COURSES.find((c) => c.lang === 'sq')!;
    const w = await world([], sq.id);
    const stage0 = createStage0({ store: w.store, bus: w.bus, adapters, clock: w.clock.now, golearn: w.golearn });
    const eng = engineOf(w, () => [], { lang: 'sq' as LanguageCode, stage0 });
    const run = await runSimulation(eng, opts());
    const pack = stage0.pack('sq')!;
    const scenes = pack.path.steps.filter((s) => s.kind === 'scene');
    expect(run.stop.reason).toBe('no-openable-recommendation');
    expect(run.rows.length).toBeGreaterThanOrEqual(scenes.length);
    expect(run.rows.every((r) => r.phase === 'stage0' && r.kind === 'stage0')).toBe(true);
    expect(run.rows.filter((r) => r.step && scenes.some((s) => s.id === r.step) && !r.reread).map((r) => r.step)).toEqual(scenes.map((s) => s.id));
    const state = await stage0.state(U, 'sq');
    for (const s of scenes) expect(state.steps.get(s.id)?.completed, s.id).toBe(true);
    expect(state.exits).toHaveLength(1);
    const verdict = state.exits[0]!.finished?.result.verdict;
    expect(['ready', 'ready-provisional']).toContain(verdict);
    expect(run.stage0?.verdict).toBe(verdict);
    // the rule: ready exactly when >= 80 % of Stage 0's lemmas are known
    expect(verdict).toBe(run.stage0!.knownShare >= 0.8 ? 'ready' : 'ready-provisional');
    // the reading went through the ordinary events, so GoLearn has encounters
    expect(await w.store.encounters.where('userId', U)).not.toHaveLength(0);
  });
});

describe('fluff detectors', () => {
  const para = (text: string) => ({ text, words: text.split(/\s+/).length });
  const spanish = 'El perro come pan en la casa y la gata duerme con el niño que vive cerca del río grande donde juegan todos los días del año';
  const english = 'The dog eats bread in the house and the cat sleeps with the child who lives near the big river where they all play every day of the year and then they go home to rest';

  it('finds a paragraph read before under another text id, and an identical text', () => {
    const t = new FluffTracker('es');
    const a = t.analyse('text:es:a', [para(spanish), para('Otra cosa distinta y larga que solo está aquí en este texto de prueba')]);
    expect(a.dupWords).toBe(0);
    const b = t.analyse('text:es:b', [para(spanish)]);
    expect(b.dupWords).toBe(spanish.split(/\s+/).length);
    expect(b.dupOf).toEqual(['text:es:a']);
    const c = t.analyse('text:es:c', [para(spanish), para('Otra cosa distinta y larga que solo está aquí en este texto de prueba')]);
    expect(c.twinOf).toBe('text:es:a');
    expect(t.analyse('text:es:a', []).dupWords).toBe(0); // asking again answers the first time
  });

  it('finds passages that are clearly another language, and leaves Spanish alone', () => {
    const t = new FluffTracker('es');
    const f = t.analyse('text:es:mixed', [para(spanish), para(english)]);
    expect(f.foreignWords).toBeGreaterThan(30);
    expect(f.foreign.en).toBeGreaterThan(30);
    expect(t.analyse('text:es:clean', [para(spanish), para(spanish + ' y otra vez')]).foreignWords).toBe(0);
  });

  it('a Latin-script passage in a Hindi text is foreign', () => {
    const t = new FluffTracker('hi');
    const f = t.analyse('text:hi:x', [para('Licence: this text is distributed under the terms of the open licence version two')]);
    expect(f.foreignWords).toBeGreaterThan(0);
  });
});

describe('summary figures', () => {
  const row = (n: number, words: number, cov3: number, over: Partial<SimRow> = {}): SimRow => ({
    n, phase: 'main', textId: `t${n}`, title: `T${n}`, kind: 'library', scripture: false, published: true, words, sentences: 10, cov3, covRead: cov3,
    lookups: Math.round(words * (1 - cov3)), lookupsPer100: (1 - cov3) * 100, sentencesWithHelp: 0, sentencesWithoutHelp: 10, newLemmasMet: 1, newKnown: 1,
    yieldPer1000: (1000) / words, cumWords: n * words, cumKnown: n, cumMet: n, reread: false, reason: 'next-input', explanation: '', dupWords: 0, foreignWords: 0, lowYield: false, ...over,
  });

  it('the trailing 5,000-word window finds the first point at 95 % coverage', () => {
    const rows = [...Array.from({ length: 6 }, (_, i) => row(i + 1, 1000, 0.8)), ...Array.from({ length: 10 }, (_, i) => row(i + 7, 1000, 0.99))];
    const p = firstWindowReaching(rows, 0.95)!;
    expect(p).not.toBeNull();
    // the window of five 99 % texts is the first at >= 95 %; four of them plus a 80 % text average 95.2 % already
    expect(p.cumWords).toBeLessThan(rows.length * 1000);
    expect(p.n).toBeGreaterThan(6);
    expect(firstWindowReaching(rows.slice(0, 6), 0.95)).toBeNull();
  });

  it('ranks the lowest-yield texts, shares of assisted words, rereads and Scripture', () => {
    const rows = [
      row(1, 1000, 0.6, { newKnown: 40, yieldPer1000: 40 }),
      row(2, 1000, 0.85, { scripture: true, kind: 'scripture', newKnown: 3, yieldPer1000: 3 }),
      row(3, 2000, 0.999, { newKnown: 0, yieldPer1000: 0, lowYield: true }),
      row(4, 500, 0.999, { newKnown: 0, yieldPer1000: 0, reread: true }),
      row(5, 100, 0.999, { newKnown: 0, yieldPer1000: 0 }), // too short to rank
    ];
    const run = { lang: 'es', mode: 'normal', options: { includeUnpublished: false, maxWords: 1, maxTexts: 1, maxMinutes: 1 }, substitutions: [], stop: { reason: 'max-texts', detail: '' }, rows, skipped: [], milestones: { '1000': 100 }, elapsedMs: 5, timing: { recommendMs: 0, openMs: 0, stage0Ms: 0, readMs: 0 } } as unknown as Parameters<typeof summarise>[0];
    const s = summarise(run);
    expect(s.words).toBe(4600);
    expect(s.assisted.lt90).toBeCloseTo(2000 / 4600, 3);
    expect(s.assisted.lt80).toBeCloseTo(1000 / 4600, 3);
    expect(s.scriptureShare).toBeCloseTo(1000 / 4600, 3);
    expect(s.fluff.rereads).toEqual({ texts: 1, words: 500 });
    expect(s.fluff.top20.map((t) => t.n)).toEqual([3, 4, 2, 1]); // yield 0 (longer first), then 3, then 40; the 100-word text is not ranked
    expect(s.fluff.top20Words).toBe(2000 + 500 + 1000 + 1000);
    expect(s.fluff.lowYield).toEqual({ flaggedTexts: 1, flaggedWords: 2000 });
  });
});

describe('the indexed memory store', () => {
  it('answers where/put/delete exactly as the plain memory store does', async () => {
    const plain = createMemoryStore();
    const fast = createIndexedMemoryStore();
    const mk = (id: string, textId: string, i: number) => ({ id, textId, sentenceId: `s${i % 3}`, lang: 'es' as const, index: i, surface: id, start: 0, end: 1, normalized: id, formId: `f${i % 4}`, isWord: true });
    for (const s of [plain, fast]) {
      await s.tokens.bulkPut([mk('a', 't1', 0), mk('b', 't1', 1), mk('c', 't2', 2), mk('d', 't2', 3)]);
      await s.tokens.put(mk('b', 't2', 1)); // moves b from t1 to t2
      await s.tokens.delete('d');
    }
    for (const [field, value] of [['textId', 't1'], ['textId', 't2'], ['sentenceId', 's1'], ['formId', 'f2'], ['index', 3]] as const) {
      const a = (await plain.tokens.where(field, value as never)).map((r) => r.id).sort();
      const b = (await fast.tokens.where(field, value as never)).map((r) => r.id).sort();
      expect(b, `${field}=${value}`).toEqual(a);
    }
    expect((await fast.tokens.where('textId', 't2')).map((r) => r.id).sort()).toEqual(['b', 'c']);
    expect(await fast.tokens.count()).toBe(3);
    // reads are clones
    const [t] = await fast.tokens.where('textId', 't1');
    t!.surface = 'mutated';
    expect((await fast.tokens.get('a'))!.surface).toBe('a');
  });
});
