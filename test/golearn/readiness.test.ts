/**
 * stageReadiness — advice from several signals. Never completion alone; every signal explains itself with its numbers;
 * thresholds come from policy.ts (READINESS).
 */
import { describe, expect, it } from 'vitest';
import { ids } from '../../src/core';
import type { ReadinessSignal, ReadinessSignalKey } from '../../src/core';
import { READINESS } from '../../src/golearn';
import { createHarness } from './harness';
import type { Harness } from './harness';
import { COURSE, buildChapter, stageRow, t, workRow } from './courseFixtures';
import type { FixtureSentence } from '../../src/core';

const U = 'u1';
const G1 = ids.stage(COURSE, 'g1');
const S0 = ids.stage(COURSE, 's0');
const F = (w: string) => ids.form('es', w);
const WORDS = Array.from({ length: 33 }, (_, i) => `w${String(i).padStart(2, '0')}`);
const wordAt = (i: number, k: number) => WORDS[(i * 3 + k) % 33];
const sentence = (i: number): FixtureSentence => ({ tokens: [0, 1, 2].map((k) => t(wordAt(i, k), wordAt(i, k), 'NOUN')) });
const sentences = (n: number, from = 0) => Array.from({ length: n }, (_, i) => sentence(from + i));
const text = (slug: string) => ids.text('es', slug);

async function ladder(h: Harness) {
  await h.store.stages.bulkPut([stageRow(0, 's0', 'pre-reader'), stageRow(1, 'g1'), stageRow(2, 'g2')]);
  await h.store.works.bulkPut([workRow('w0', 's0'), workRow('w1', 'g1'), workRow('w2', 'g2')]);
}

const SIZES: Record<string, number> = { r1: 80, r2: 40, r3: 40 };

/** Three Grade 1 chapters (160 sentences) and one unopened chapter of the next stage, all in words the learner can know. */
async function course(h: Harness, opts: { next?: 'known' | 'unknown' | 'none' } = {}) {
  await ladder(h);
  let ch = 1;
  for (const [slug, n] of Object.entries(SIZES)) await buildChapter(h.store, { slug, work: 'w1', chapter: ch++, sentences: sentences(n) });
  if ((opts.next ?? 'known') === 'known') await buildChapter(h.store, { slug: 'n1', work: 'w2', chapter: 1, sentences: sentences(30) });
  if (opts.next === 'unknown') {
    await buildChapter(h.store, { slug: 'n1', work: 'w2', chapter: 1, sentences: Array.from({ length: 30 }, (_, i) => ({ tokens: [t(`nuevo${i}a`, `nuevo${i}a`, 'NOUN'), t(`nuevo${i}b`, `nuevo${i}b`, 'NOUN'), t('w00', 'w00', 'NOUN')] })) });
  }
}

interface Read { dwell?: (k: number) => number; degree?: 'all' | 'most' | 'some' | 'little'; slugs?: string[]; reports?: boolean }

/** Reads the chosen chapters in sittings of 20 timed sentences, reports "all" for each, then says how much of each chapter he understood. */
async function read(h: Harness, o: Read = {}) {
  let k = 0;
  for (const slug of o.slugs ?? Object.keys(SIZES)) {
    const id = text(slug);
    for (let from = 0; from < SIZES[slug]; from += 20) {
      const session = `${slug}-${from}`;
      const idx = Array.from({ length: Math.min(20, SIZES[slug] - from) }, (_, i) => from + i);
      for (const i of idx) await h.viewTimed(U, 'es', id, i, (o.dwell ?? (() => 3000))(k), session);
      await h.report(U, 'es', id, idx, { session });
      k += 1;
    }
    if (o.reports !== false) await h.report(U, 'es', id, [], { session: `${slug}-end`, scope: 'text', degree: o.degree ?? 'all' });
  }
}

const sig = (r: { signals: ReadinessSignal[] }, key: ReadinessSignalKey) => r.signals.find((s) => s.key === key)!;
const status = (r: { signals: ReadinessSignal[] }) => Object.fromEntries(r.signals.map((s) => [s.key, s.status]));

describe('stageReadiness: ready, stay and not enough reading yet', () => {
  it('is ready-to-advance only when every signal with data is met, with lexical coverage and a help-rate signal among them', async () => {
    const h = createHarness();
    await course(h);
    await read(h);
    const r = await h.golearn.stageReadiness(U, COURSE, G1);
    expect(status(r)).toEqual({
      'lexical-coverage': 'met', 'lookup-rate': 'met', 'sentence-rescue-rate': 'met', 'reported-comprehension': 'met',
      'reading-pace-trend': 'met', 'unfamiliar-material': 'met', retention: 'insufficient-data', listening: 'not-available',
    });
    expect(r).toMatchObject({ userId: U, courseId: COURSE, stageId: G1, verdict: 'ready-to-advance' });
    expect(r.explanation).toMatch(/advice/);
    expect(sig(r, 'lexical-coverage').value).toBe(1);
    expect(sig(r, 'lookup-rate').value).toBe(0);
    expect(sig(r, 'lookup-rate').explanation).toContain('0 lookups per 100 words');
    for (const s of r.signals) { expect(s.target.length).toBeGreaterThan(5); expect(s.explanation.length).toBeGreaterThan(10); }
  });

  it('under 150 sentences seen in the stage is insufficient-data, however well it went', async () => {
    const h = createHarness();
    await course(h);
    await read(h, { slugs: ['r1', 'r2'] }); // 120 sentences
    const r = await h.golearn.stageReadiness(U, COURSE, G1);
    expect(r.verdict).toBe('insufficient-data');
    expect(r.explanation).toMatch(/120 sentences/);
    expect(sig(r, 'lookup-rate').status).toBe('met'); // the signal itself has data; the verdict still waits
  });

  it('fewer than four signals with data is insufficient-data', async () => {
    const h = createHarness();
    await course(h, { next: 'none' });
    await read(h, { reports: false, dwell: () => 0 }); // no text reports, no usable dwell: pace and reports have no data; nothing unread
    const r = await h.golearn.stageReadiness(U, COURSE, G1);
    expect(sig(r, 'reported-comprehension').status).toBe('insufficient-data');
    expect(sig(r, 'reading-pace-trend').status).toBe('insufficient-data');
    expect(sig(r, 'unfamiliar-material').status).toBe('not-available');
    expect(r.signals.filter((s) => s.status === 'met' || s.status === 'not-met').length).toBe(3);
    expect(r.verdict).toBe('insufficient-data');
  });

  it('finishing every text never changes the verdict by itself', async () => {
    // not enough reading: marking everything finished does not make it ready, nor does it add data
    const a = createHarness();
    await course(a);
    await a.viewAll(U, 'es', text('r1'), 20);
    const before = await a.golearn.stageReadiness(U, COURSE, G1);
    for (const slug of Object.keys(SIZES)) await a.complete(U, 'es', text(slug));
    expect(await a.golearn.stageReadiness(U, COURSE, G1)).toEqual(before);
    expect(before.verdict).toBe('insufficient-data');

    // a learner who needs help all the time stays, finished or not
    const b = createHarness();
    await course(b);
    await read(b);
    for (let i = 0; i < 60; i++) { await b.view(U, 'es', text('r1'), i, 'extra'); await b.help(U, 'es', text('r1'), i, 0, F(wordAt(i, 0)), 1, 'extra'); }
    const stay = await b.golearn.stageReadiness(U, COURSE, G1);
    for (const slug of Object.keys(SIZES)) await b.complete(U, 'es', text(slug));
    const after = await b.golearn.stageReadiness(U, COURSE, G1);
    expect(stay.verdict).toBe('stay');
    expect(after).toEqual(stay);
  });

  it('finishing is not even needed: a ready learner is ready without a single TextCompleted', async () => {
    const h = createHarness();
    await course(h);
    await read(h);
    expect((await h.bus.history({ userId: U, types: ['TextCompleted'] })).length).toBe(0);
    expect((await h.golearn.stageReadiness(U, COURSE, G1)).verdict).toBe('ready-to-advance');
  });

  it('is deterministic and writes nothing', async () => {
    const h = createHarness();
    await course(h);
    await read(h);
    const events = (await h.store.events.all()).length;
    const a = await h.golearn.stageReadiness(U, COURSE, G1);
    const b = await h.golearn.stageReadiness(U, COURSE, G1);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    expect((await h.store.events.all()).length).toBe(events);
  });
});

describe('each signal', () => {
  it('lexical-coverage: not met when the stage still holds many unknown words, and then the verdict is stay', async () => {
    const h = createHarness();
    await course(h);
    for (const slug of Object.keys(SIZES)) await h.viewAll(U, 'es', text(slug), SIZES[slug], 'v'); // seen once, in one sitting: never shown understood, not yet likely familiar
    const r = await h.golearn.stageReadiness(U, COURSE, G1);
    expect(sig(r, 'lexical-coverage').status).toBe('not-met');
    expect(sig(r, 'lexical-coverage').value).toBeLessThan(READINESS.lexicalCoverage);
    expect(r.verdict).toBe('stay');
    expect(r.explanation).toMatch(/how much of the stage you already know/);
  });

  it('lookup-rate: over the last 300 sentences, at most 4 lookups per 100 words', async () => {
    const h = createHarness();
    await course(h);
    await read(h);
    // 12 lookups in the 160 sentences already read would be 2.5 per 100 words; 30 more is too many
    for (let i = 0; i < 30; i++) { await h.view(U, 'es', text('r1'), i, 'extra'); await h.help(U, 'es', text('r1'), i, 0, F(wordAt(i, 0)), 1, 'extra'); }
    const r = await h.golearn.stageReadiness(U, COURSE, G1);
    // window: 190 sentences, 570 words, 30 lookups → 5.3 per 100
    expect(sig(r, 'lookup-rate')).toMatchObject({ status: 'not-met', value: 5.3 });
    expect(r.verdict).toBe('stay');
    // a lookup-free stretch of 300 sentences pushes them out of the window
    for (let i = 0; i < 300; i++) await h.view(U, 'es', text('r1'), i % 80, `calm${Math.floor(i / 80)}`);
    expect(sig(await h.golearn.stageReadiness(U, COURSE, G1), 'lookup-rate')).toMatchObject({ status: 'met', value: 0 });
  });

  it('lookups include the opening of a decoding, and need 30 sentences in the window to say anything', async () => {
    const h = createHarness();
    await course(h);
    for (let i = 0; i < 29; i++) await h.view(U, 'es', text('r1'), i);
    expect(sig(await h.golearn.stageReadiness(U, COURSE, G1), 'lookup-rate').status).toBe('insufficient-data');
    await h.view(U, 'es', text('r1'), 29);
    for (let i = 0; i < 30; i++) await h.decoding(U, 'es', text('r1'), i, 0, F(wordAt(i, 0)), []);
    expect(sig(await h.golearn.stageReadiness(U, COURSE, G1), 'lookup-rate')).toMatchObject({ status: 'not-met', value: 33.3 });
  });

  it('sentence-rescue-rate: at most 5 per 100 sentences', async () => {
    const h = createHarness();
    await course(h);
    await read(h);
    expect(sig(await h.golearn.stageReadiness(U, COURSE, G1), 'sentence-rescue-rate')).toMatchObject({ status: 'met', value: 0 });
    // re-view 20 sentences and have each one explained in English
    for (let i = 0; i < 20; i++) { await h.view(U, 'es', text('r3'), i, 'resc'); await h.rescue(U, 'es', text('r3'), [i], 'resc'); }
    const r2 = await h.golearn.stageReadiness(U, COURSE, G1);
    // 180 sentences in the window, 20 rescued
    expect(sig(r2, 'sentence-rescue-rate')).toMatchObject({ status: 'not-met', value: 11.1 });
    expect(r2.verdict).toBe('stay');
  });

  it('reported-comprehension: the latest report per text, at least 3 texts, 80 % "all" or "most"', async () => {
    const mk = async (degrees: Array<'all' | 'most' | 'some' | 'little'>) => {
      const h = createHarness();
      await course(h);
      await read(h, { reports: false });
      for (const [i, d] of degrees.entries()) await h.report(U, 'es', text(Object.keys(SIZES)[i]), [], { session: `rep${i}`, scope: 'text', degree: d });
      return sig(await h.golearn.stageReadiness(U, COURSE, G1), 'reported-comprehension');
    };
    expect((await mk(['all', 'most'])).status).toBe('insufficient-data');
    expect(await mk(['all', 'most', 'all'])).toMatchObject({ status: 'met', value: 1 });
    expect(await mk(['all', 'some', 'all'])).toMatchObject({ status: 'not-met' });
    // a later report on the same text replaces the earlier one
    const h = createHarness();
    await course(h);
    await read(h, { reports: false });
    for (const [i, slug] of Object.keys(SIZES).entries()) await h.report(U, 'es', text(slug), [], { session: `rep${i}`, scope: 'text', degree: 'little' });
    expect(sig(await h.golearn.stageReadiness(U, COURSE, G1), 'reported-comprehension').status).toBe('not-met');
    for (const [i, slug] of Object.keys(SIZES).entries()) await h.report(U, 'es', text(slug), [], { session: `again${i}`, scope: 'text', degree: 'all' });
    expect(sig(await h.golearn.stageReadiness(U, COURSE, G1), 'reported-comprehension')).toMatchObject({ status: 'met', value: 1 });
  });

  it('reading-pace-trend: slower is not met; steady or faster is', async () => {
    const slower = createHarness();
    await course(slower);
    await read(slower, { dwell: (k) => (k < 5 ? 2000 : 4000) }); // 8 sittings: the last three much slower than the three before
    const r = await slower.golearn.stageReadiness(U, COURSE, G1);
    expect(sig(r, 'reading-pace-trend').status).toBe('not-met');
    expect(r.verdict).toBe('stay');
    const faster = createHarness();
    await course(faster);
    await read(faster, { dwell: (k) => (k < 5 ? 4000 : 2000) });
    expect(sig(await faster.golearn.stageReadiness(U, COURSE, G1), 'reading-pace-trend').status).toBe('met');
  });

  describe('unfamiliar-material', () => {
    it('predicted coverage of unopened next-stage texts: 90 %', async () => {
      const known = createHarness();
      await course(known, { next: 'known' });
      await read(known);
      expect(sig(await known.golearn.stageReadiness(U, COURSE, G1), 'unfamiliar-material')).toMatchObject({ status: 'met', value: 1 });
      const unknown = createHarness();
      await course(unknown, { next: 'unknown' });
      await read(unknown);
      const r = await unknown.golearn.stageReadiness(U, COURSE, G1);
      expect(sig(r, 'unfamiliar-material').status).toBe('not-met');
      expect(sig(r, 'unfamiliar-material').value).toBeLessThan(READINESS.unfamiliarNextStage);
      expect(r.verdict).toBe('stay');
    });

    it('a next-stage text he has opened does not count; without any next-stage text the unread texts of this stage do (95 %); with none it is not available', async () => {
      const h = createHarness();
      await course(h, { next: 'unknown' });
      await read(h);
      await h.bus.emit({ type: 'TextViewed', userId: U, lang: 'es', surface: 'corpus', session: 'o', dedupeKey: 'open-n1', textId: text('n1'), mode: 'open' } as never);
      // the only next-stage text is opened → fall back to the unread texts of this stage: there are none
      expect(sig(await h.golearn.stageReadiness(U, COURSE, G1), 'unfamiliar-material').status).toBe('not-available');
      // a preview is not opening
      const p = createHarness();
      await course(p, { next: 'unknown' });
      await read(p);
      await p.bus.emit({ type: 'TextViewed', userId: U, lang: 'es', surface: 'corpus', session: 'o', dedupeKey: 'prev-n1', textId: text('n1'), mode: 'preview' } as never);
      expect(sig(await p.golearn.stageReadiness(U, COURSE, G1), 'unfamiliar-material').status).toBe('not-met');

      // no next-stage text at all, but an unread chapter of this stage in familiar words → 95 % applies
      const q = createHarness();
      await course(q, { next: 'none' });
      await buildChapter(q.store, { slug: 'r4', work: 'w1', chapter: 4, sentences: sentences(10) });
      await read(q);
      expect(sig(await q.golearn.stageReadiness(U, COURSE, G1), 'unfamiliar-material')).toMatchObject({ status: 'met', value: 1 });
      expect(sig(await q.golearn.stageReadiness(U, COURSE, G1), 'unfamiliar-material').target).toMatch(/95 %.*this stage/);
    });
  });

  describe('retention', () => {
    /** All 33 words met on day 0, then again a week and a day later (help-free, or with help). */
    async function week(helpOn: number) {
      const h = createHarness();
      await course(h);
      await read(h, { slugs: ['r1'] });
      h.advance(8 * 86_400_000);
      for (let i = 0; i < 11; i++) await h.view(U, 'es', text('r1'), i, 'again'); // 11 sentences × 3 = all 33 words
      for (let i = 0; i < helpOn; i++) await h.help(U, 'es', text('r1'), i, 0, F(wordAt(i, 0)), 1, 'again');
      return sig(await h.golearn.stageReadiness(U, COURSE, G1), 'retention');
    }

    it('needs 30 words first met a week ago and met again this week', async () => {
      const h = createHarness();
      await course(h);
      await read(h, { slugs: ['r1'] });
      h.advance(8 * 86_400_000);
      for (let i = 0; i < 5; i++) await h.view(U, 'es', text('r1'), i, 'again'); // 15 words
      expect(sig(await h.golearn.stageReadiness(U, COURSE, G1), 'retention').status).toBe('insufficient-data');
    });

    it('is met when at least 85 % of those words needed no help the second time, not met below', async () => {
      expect(await week(0)).toMatchObject({ status: 'met', value: 1 });
      expect(await week(4)).toMatchObject({ status: 'met' }); // 29 of 33 = 87.9 %
      expect(await week(6)).toMatchObject({ status: 'not-met' }); // 27 of 33 = 81.8 %
    });
  });

  describe('decoding (the pre-reader stage only)', () => {
    async function pre(opts: { decodings: number; romanize?: number }) {
      const h = createHarness();
      await ladder(h);
      await buildChapter(h.store, { slug: 'p1', work: 'w0', chapter: 1, sentences: sentences(100) });
      await h.viewAll(U, 'es', text('p1'), 100);
      for (let i = 0; i < opts.decodings; i++) await h.decoding(U, 'es', text('p1'), i, 0, F(wordAt(i, 0)), []);
      for (let i = 0; i < (opts.romanize ?? 0); i++) await h.decoding(U, 'es', text('p1'), 99 - i, 1, F(wordAt(99 - i, 1)), [], { romanization: true });
      return h.golearn.stageReadiness(U, COURSE, S0);
    }

    it('at most 10 decodings per 100 words and no romanization in the last 100 sentences', async () => {
      expect(sig(await pre({ decodings: 30 }), 'decoding')).toMatchObject({ status: 'met', value: 10 }); // 30 in 300 words
      expect(sig(await pre({ decodings: 31 }), 'decoding').status).toBe('not-met');
      const roman = await pre({ decodings: 3, romanize: 1 });
      expect(sig(roman, 'decoding').status).toBe('not-met');
      expect(sig(roman, 'decoding').explanation).toMatch(/romanization 1 time/);
    });

    it('does not exist for a grade stage', async () => {
      const h = createHarness();
      await course(h);
      await read(h);
      expect((await h.golearn.stageReadiness(U, COURSE, G1)).signals.some((s) => s.key === 'decoding')).toBe(false);
    });
  });

  describe('listening', () => {
    it('is not available without reviewed real speech for the stage; fixture audio does not create it', async () => {
      const h = createHarness();
      await course(h);
      await read(h);
      await h.listen(U, 'es', text('r1'), [0, 1, 2], { speech: false, voiceReviewed: false, session: 'fix' });
      expect(sig(await h.golearn.stageReadiness(U, COURSE, G1), 'listening').status).toBe('not-available');
    });

    it('needs 30 heard sentences; then compares how much was understood by ear with 80 %', async () => {
      const h = createHarness();
      await course(h);
      await read(h);
      const some = Array.from({ length: 10 }, (_, i) => i);
      await h.listen(U, 'es', text('r1'), some, { session: 'l1' });
      expect(sig(await h.golearn.stageReadiness(U, COURSE, G1), 'listening').status).toBe('insufficient-data');
      const thirty = Array.from({ length: 30 }, (_, i) => i);
      await h.listen(U, 'es', text('r1'), thirty, { session: 'l2' });
      expect(sig(await h.golearn.stageReadiness(U, COURSE, G1), 'listening').status).toBe('not-met'); // heard, not yet shown understood
      await h.report(U, 'es', text('r1'), thirty, { session: 'l2', modality: 'listening' });
      await h.listen(U, 'es', text('r1'), thirty, { session: 'l3' });
      await h.report(U, 'es', text('r1'), thirty, { session: 'l3', modality: 'listening' });
      expect(sig(await h.golearn.stageReadiness(U, COURSE, G1), 'listening')).toMatchObject({ status: 'met', value: 1 });
    });
  });
});

describe('which stage, which course', () => {
  it('defaults to the learner\'s stored stage, else the first stage', async () => {
    const h = createHarness();
    await course(h);
    expect((await h.golearn.stageReadiness(U, COURSE)).stageId).toBe(S0);
    await h.store.meta.put({ id: `stage:${U}:${COURSE}`, value: G1, updatedAt: 'now' });
    expect((await h.golearn.stageReadiness(U, COURSE)).stageId).toBe(G1);
    expect((await h.golearn.stageReadiness(U, COURSE, S0)).stageId).toBe(S0); // an explicit stage wins
  });

  it('a course without stages, or an unknown stage, has nothing to say and does not throw', async () => {
    const h = createHarness();
    const none = await h.golearn.stageReadiness(U, 'albania-sq');
    expect(none).toMatchObject({ verdict: 'insufficient-data', signals: [], stageId: '' });
    await course(h);
    expect(await h.golearn.stageReadiness(U, COURSE, 'stage:nope')).toMatchObject({ verdict: 'insufficient-data', signals: [], stageId: 'stage:nope' });
  });

  it('an empty stage is insufficient-data with honest signals', async () => {
    const h = createHarness();
    await ladder(h);
    const r = await h.golearn.stageReadiness(U, COURSE, G1);
    expect(r.verdict).toBe('insufficient-data');
    expect(sig(r, 'lexical-coverage').status).toBe('insufficient-data');
    expect(sig(r, 'lexical-coverage').explanation).toMatch(/No texts of this stage are imported/);
    expect(sig(r, 'listening').status).toBe('not-available');
  });

  it('thresholds are read from READINESS (provisional policy), in one place', () => {
    expect(READINESS).toMatchObject({
      minSentencesSeen: 150, minSignalsWithData: 4, lexicalCoverage: 0.95, windowSentences: 300, lookupsPer100Words: 4,
      rescuesPer100Sentences: 5, unfamiliarNextStage: 0.9, unfamiliarSameStage: 0.95,
    });
    expect(READINESS.reportedComprehension).toEqual({ share: 0.8, minReports: 3 });
    expect(READINESS.retention).toEqual({ days: 7, share: 0.85, minItems: 30 });
    expect(READINESS.decoding).toEqual({ revealedPer100Words: 10, romanizationRescues: 0, romanizationWindow: 100 });
  });
});
