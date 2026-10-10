// @vitest-environment node
import { describe, expect, it } from 'vitest';
import type { GoEvent, UnitAlias, UnitKnowledge } from '../../../packages/repository-contract/src';
import { affectedByInvalidation, createProjectionEngine, eligibilityFor, foldEvents, isTombstoned, observationsOf } from '../../../packages/repository-engine/src';
import { FakeStore } from './fakeStore';
import { E, L, NOW, analysis, card, encounter, enrolment, ev, grammar, listening, lookup, production, realizes, resetIds, unit } from './helpers';

const make = async (events: GoEvent[], setup?: (s: FakeStore) => void) => {
  const store = new FakeStore();
  setup?.(store);
  await store.append(L, events);
  const engine = createProjectionEngine({ store, now: () => NOW });
  return { store, engine };
};
const row = (rows: UnitKnowledge[], id: string): UnitKnowledge | undefined => rows.find((r) => r.unitId === id);

describe('fold arithmetic', () => {
  it('score, confidence, disagreement, contexts, difficulty and reliability follow the documented formulas', async () => {
    resetIds();
    const events = [
      card(['form:sq:a'], 'recognition', true, { difficulty: 0.2 }, { sentenceKey: 's1', at: '2026-10-07T10:00:00.000Z' }),
      card(['form:sq:a'], 'recognition', true, { difficulty: 0.6 }, { sentenceKey: 's2', at: '2026-10-07T11:00:00.000Z' }),
      card(['form:sq:a'], 'recognition', false, {}, { sentenceKey: 's2', at: '2026-10-07T12:00:00.000Z' }),
    ];
    const { engine } = await make(events);
    await engine.project(L);
    const d = (await engine.knowledge(L))[0].dimensions.readingRecognition;
    // weights: good 0.7*0.8 = 0.56 twice positive, again 0.7*1.0 = 0.7 negative
    expect(d.positive).toBeCloseTo(1.12);
    expect(d.negative).toBeCloseTo(0.7);
    expect(d.weight).toBeCloseTo(1.82);
    expect(d.score).toBeCloseTo((0.5 + 1.12) / (1 + 1.82));
    expect(d.confidence).toBeCloseTo((1.82 / 3.82) * (1 - (2 * 0.7) / 1.82));
    expect(d.contexts).toBe(2);
    expect(d.difficulty).toBeCloseTo((0.2 * 0.56 + 0.6 * 0.56) / 1.12);
    expect(d.lastAt).toBe('2026-10-07T12:00:00.000Z');
    expect(d.lastAssisted).toBe(false);
    expect(d.sourceReliability).toBe(1);
  });

  it('equal positive and negative evidence leaves no confidence (full disagreement)', () => {
    const rows = foldEvents([card(['form:sq:a'], 'recognition', true, { grade: 'easy' }), card(['form:sq:a'], 'recognition', false, { grade: 'easy' })], { modelVersion: 'x' });
    expect(rows[0].dimensions.readingRecognition.confidence).toBe(0);
  });

  it('retention: stored strength is undecayed; reads decay it with half-life 2 + 3 x weight', async () => {
    resetIds();
    const { engine, store } = await make([card(['form:sq:a'], 'recognition', true, {}, { at: '2026-10-01T12:00:00.000Z' })]);
    await engine.project(L);
    const stored = (await store.getKnowledge(L))[0];
    const read = (await engine.knowledge(L))[0];
    const d = stored.dimensions.readingRecognition;
    expect(stored.retention.basedOn).toBe('readingRecognition');
    expect(stored.retention.halfLifeDays).toBeCloseTo(2 + 3 * d.weight);
    expect(stored.retention.estimate).toBeCloseTo(d.score * d.confidence);
    expect(read.retention.estimate).toBeCloseTo(stored.retention.estimate * Math.pow(2, -7 / stored.retention.halfLifeDays));
    expect(read.uncertainty).toBeCloseTo(1 - d.confidence);
  });

  it('incremental contexts and difficulty stay exact because a touched unit is refolded from all its events', async () => {
    resetIds();
    const { engine, store } = await make([card(['form:sq:a'], 'recognition', true, { difficulty: 0.2 }, { sentenceKey: 's1' })]);
    await engine.project(L);
    await store.append(L, [card(['form:sq:a'], 'recognition', true, { difficulty: 0.6 }, { sentenceKey: 's1' }), card(['form:sq:a'], 'recognition', true, {}, { sentenceKey: 's2' })]);
    await engine.project(L);
    const d = (await store.getKnowledge(L))[0].dimensions.readingRecognition;
    expect(d.contexts).toBe(2);
    expect(d.difficulty).toBeCloseTo(0.4);
    expect((await store.getKnowledge(L))[0].basis.events).toBe(3);
  });

  it('the last event is the one with the greatest (at, id), whatever the arrival order', () => {
    const a = encounter(['form:sq:a'], { id: 'b', at: '2026-10-07T10:00:00.000Z' });
    const b = encounter(['form:sq:a'], { id: 'a', at: '2026-10-07T10:00:00.000Z' });
    const c = encounter(['form:sq:a'], { id: 'z', at: '2026-10-06T10:00:00.000Z' });
    for (const order of [[a, b, c], [c, b, a], [b, c, a]]) {
      const r = foldEvents(order, { modelVersion: 'x' })[0];
      expect(r.basis).toEqual({ events: 3, lastEventId: 'b' });
      expect(r.firstSeenAt).toBe('2026-10-06T10:00:00.000Z');
    }
  });
});

describe('tombstones', () => {
  const ref = (title: string) => ({ kind: 'ebook' as const, title });
  const events = () => [
    card(['form:sq:a'], 'recognition', true, {}, { id: 'e1', at: '2026-10-01T10:00:00.000Z', sourceRef: ref('Book A') }),
    card(['form:sq:b'], 'recognition', true, {}, { id: 'e2', at: '2026-10-02T10:00:00.000Z', sourceRef: ref('Book B') }),
    card(['form:sq:c'], 'recognition', true, {}, { id: 'e3', at: '2026-10-03T10:00:00.000Z' }),
  ];
  const tomb = (scope: any, learnerId = L) => ({ tombstoneId: 't', learnerId, scope, createdAt: NOW });

  it('skips events under a source, range, event or learner tombstone, and ignores other learners\' tombstones', async () => {
    const ids = async (scope: any, learnerId = L) => {
      const { engine, store } = await make(events(), (s) => s.tombstones.push(tomb(scope, learnerId)));
      await engine.project(L);
      return (await store.getKnowledge(L)).map((r) => r.unitId).sort();
    };
    expect(await ids({ kind: 'source', sourceRef: { kind: 'ebook', title: 'Book A' } })).toEqual(['form:sq:b', 'form:sq:c']);
    expect(await ids({ kind: 'range', from: '2026-10-02T00:00:00.000Z', to: '2026-10-02T23:59:59.000Z' })).toEqual(['form:sq:a', 'form:sq:c']);
    expect(await ids({ kind: 'event', id: 'e3' })).toEqual(['form:sq:a', 'form:sq:b']);
    expect(await ids({ kind: 'learner' })).toEqual([]);
    expect(await ids({ kind: 'learner' }, 'someone-else')).toEqual(['form:sq:a', 'form:sq:b', 'form:sq:c']);
  });

  it('a tombstone added after projection takes effect on rebuild', async () => {
    const { engine, store } = await make(events());
    await engine.project(L);
    expect(await store.getKnowledge(L)).toHaveLength(3);
    await store.putTombstone(tomb({ kind: 'source', sourceRef: { kind: 'ebook', title: 'Book B' } }));
    const rows = await engine.rebuild(L);
    expect(rows.map((r) => r.unitId)).toEqual(['form:sq:a', 'form:sq:c']);
  });

  it('isTombstoned matches a source tombstone on locator only when it names one', () => {
    const e = ev('EncounterRecorded', ['x'], {}, { sourceRef: { kind: 'web', title: 'T', locator: 'https://a/b' } });
    expect(isTombstoned(e, [tomb({ kind: 'source', sourceRef: { kind: 'web', locator: 'https://a/b' } })])).toBe(true);
    expect(isTombstoned(e, [tomb({ kind: 'source', sourceRef: { kind: 'web', locator: 'https://other' } })])).toBe(false);
  });
});

describe('aliases', () => {
  const alias = (mapping: 'certain' | 'uncertain', o: Partial<UnitAlias> = {}): UnitAlias => ({ oldId: 'form:sq:old', newId: 'form:sq:new', packVersion: '2', reason: 'test', confidence: 0.9, createdAt: NOW, mapping, ...o });
  const events = () => [card(['form:sq:old'], 'recognition', true, {}, { id: 'o1' }), card(['form:sq:new'], 'recognition', true, {}, { id: 'n1' })];

  it('a certain alias re-targets evidence to the new id; an uncertain one leaves it where it is', async () => {
    const certain = await make(events(), (s) => s.aliases.push(alias('certain')));
    await certain.engine.project(L);
    const cr = await certain.engine.knowledge(L);
    expect(cr.map((r) => r.unitId)).toEqual(['form:sq:new']);
    expect(cr[0].basis.events).toBe(2);
    expect((await certain.engine.knowledge(L, ['form:sq:old'])).map((r) => r.unitId)).toEqual(['form:sq:new']);

    const uncertain = await make(events(), (s) => s.aliases.push(alias('uncertain')));
    await uncertain.engine.project(L);
    const ur = await uncertain.engine.knowledge(L);
    expect(ur.map((r) => r.unitId)).toEqual(['form:sq:new', 'form:sq:old']);
    expect(row(ur, 'form:sq:old')!.basis.events).toBe(1);
    expect(row(ur, 'form:sq:new')!.basis.events).toBe(1);
  });

  it('incremental projection finds old-id events when a later batch arrives under the new id', async () => {
    const [o, n] = events();
    const { engine, store } = await make([o], (s) => s.aliases.push(alias('certain')));
    await engine.project(L);
    await store.append(L, [n]);
    await engine.project(L);
    const live = JSON.stringify(await engine.knowledge(L));
    expect(live).toBe(JSON.stringify(await engine.rebuild(L)));
    expect((await store.getKnowledge(L))[0].basis.events).toBe(2);
  });

  it('chains of certain aliases are followed and cycles do not loop', async () => {
    const aliases = [alias('certain', { oldId: 'form:sq:a', newId: 'form:sq:b' }), alias('certain', { oldId: 'form:sq:b', newId: 'form:sq:c' }), alias('certain', { oldId: 'form:sq:c', newId: 'form:sq:a' })];
    const { engine } = await make([card(['form:sq:a'], 'recognition', true)], (s) => s.aliases.push(...aliases));
    await engine.project(L);
    expect((await engine.knowledge(L)).length).toBe(1);
  });
});

describe('preferences', () => {
  const requests = (n: number, extra: Record<string, unknown>) => Array.from({ length: n }, () => ev('AssistanceRequested', ['form:sq:a'], { assistance: 'grammar', ...extra }));

  it('starts from the documented defaults', async () => {
    const { engine } = await make([]);
    const p = await engine.preferences(L, 'sq');
    expect(p.explanationDepth).toEqual({ value: 'brief', origin: 'default' });
    expect(p.terminology.value).toBe('plain');
    expect(p.transliteration.value).toBe('on-request');
    expect(p.pronunciationFirst.value).toBe(false);
    expect(p.translationAvailable.value).toBe(true);
    expect(p.visualAssistance.value).toBe('standard');
    expect(p.accessibility.value).toEqual([]);
    expect(Object.values(p).filter((v) => v && typeof v === 'object' && 'origin' in v).every((v: any) => v.origin === 'default')).toBe(true);
  });

  it('infers from behaviour with its basis once the threshold of three is reached, not before', async () => {
    resetIds();
    expect((await (await make(requests(2, { depth: 'explanatory' }))).engine.preferences(L)).explanationDepth.origin).toBe('default');
    const p = await (await make([
      ...requests(3, { depth: 'explanatory' }), ...requests(3, { assistance: 'transliteration' }),
      ...['s1', 's2', 's3'].flatMap((s, i) => [
        ev('PronunciationPlayed', ['form:sq:a'], { voice: 'synthetic' }, { sentenceKey: s, at: `2026-10-07T10:0${i}:00.000Z` }),
        lookup(['form:sq:a'], { sentenceKey: s, at: `2026-10-07T10:0${i}:30.000Z` }),
      ]),
    ])).engine.preferences(L);
    expect(p.explanationDepth).toMatchObject({ value: 'explanatory', origin: 'inferred' });
    expect(p.explanationDepth.basis).toMatch(/3/);
    expect(p.transliteration).toMatchObject({ value: 'always', origin: 'inferred' });
    expect(p.pronunciationFirst).toMatchObject({ value: true, origin: 'inferred' });
  });

  it('audio played after the gloss does not count as pronunciation-first', async () => {
    const events = ['s1', 's2', 's3'].flatMap((s, i) => [
      lookup(['form:sq:a'], { sentenceKey: s, at: `2026-10-07T10:0${i}:00.000Z` }),
      ev('PronunciationPlayed', ['form:sq:a'], { voice: 'synthetic' }, { sentenceKey: s, at: `2026-10-07T10:0${i}:30.000Z` }),
    ]);
    expect((await (await make(events)).engine.preferences(L)).pronunciationFirst.origin).toBe('default');
  });

  it('an explicit preference beats any inference, whichever came first, and is never overwritten', async () => {
    resetIds();
    const explicit = ev('PreferenceChanged', [], { key: 'explanationDepth', value: 'label', origin: 'explicit' }, { at: '2026-10-01T00:00:00.000Z' });
    const p = await (await make([explicit, ...requests(5, { depth: 'explanatory' }), ev('PreferenceChanged', [], { key: 'transliteration', value: 'never', origin: 'explicit' }), ...requests(4, { assistance: 'transliteration' })])).engine.preferences(L);
    expect(p.explanationDepth).toEqual({ value: 'label', origin: 'explicit' });
    expect(p.transliteration).toEqual({ value: 'never', origin: 'explicit' });
  });

  it('the latest explicit value wins, invalid values are ignored, and a language scopes its own events', async () => {
    const { engine } = await make([
      ev('PreferenceChanged', [], { key: 'terminology', value: 'grammatical', origin: 'explicit' }, { at: '2026-10-01T00:00:00.000Z' }),
      ev('PreferenceChanged', [], { key: 'terminology', value: 'plain', origin: 'explicit' }, { at: '2026-10-02T00:00:00.000Z' }),
      ev('PreferenceChanged', [], { key: 'visualAssistance', value: 'enormous', origin: 'explicit' }),
      ev('PreferenceChanged', [], { key: 'accessibility', value: ['large-text'], origin: 'explicit' }, { languageId: 'de' }),
    ]);
    const sq = await engine.preferences(L, 'sq');
    expect(sq.terminology).toEqual({ value: 'plain', origin: 'explicit' });
    expect(sq.visualAssistance.origin).toBe('default');
    expect(sq.accessibility.origin).toBe('default');
    expect(sq.languageId).toBe('sq');
    expect((await engine.preferences(L, 'de')).accessibility).toEqual({ value: ['large-text'], origin: 'explicit' });
  });
});

describe('eligibility', () => {
  const form = unit('form:sq:x', 'form', 'verified');
  it('verified and high-confidence are eligible for every dimension', () => {
    for (const status of ['verified', 'high-confidence'] as const) {
      expect(eligibilityFor(unit('form:sq:x', 'form', status), [], 'grammaticalUnderstanding')).toEqual({ eligible: true, status, caveats: [] });
      expect(eligibilityFor(unit('form:sq:x', 'form', status), [], 'productiveRetrieval').eligible).toBe(true);
    }
  });
  it('provisional is eligible for recognition only, with a caveat', () => {
    const p = unit('form:sq:x', 'form', 'provisional');
    for (const d of ['readingRecognition', 'listeningRecognition', 'assistedRecognition'] as const) {
      expect(eligibilityFor(p, [], d)).toEqual({ eligible: true, status: 'provisional', caveats: ['provisional analysis; shown with caveats'] });
    }
    for (const d of ['grammaticalUnderstanding', 'productiveRetrieval', 'contextualProduction'] as const) expect(eligibilityFor(p, [], d).eligible).toBe(false);
  });
  it('conflicted, invalidated and unknown units are not eligible, with a reason', () => {
    expect(eligibilityFor(unit('f', 'form', 'conflicted'), [], 'readingRecognition')).toMatchObject({ eligible: false, status: 'conflicted' });
    expect(eligibilityFor(unit('f', 'form', 'invalidated'), [], 'readingRecognition')).toMatchObject({ eligible: false, status: 'invalidated' });
    const unknown = eligibilityFor(undefined, [], 'readingRecognition');
    expect(unknown).toMatchObject({ eligible: false, status: 'unknown' });
    expect((unknown as { reason: string }).reason.length).toBeGreaterThan(5);
  });
  it('live analyses lower the effective status; a form whose analyses are all invalidated has no usable reading', () => {
    expect(eligibilityFor(form, [analysis('form:sq:x', 'provisional')], 'grammaticalUnderstanding').eligible).toBe(false);
    expect(eligibilityFor(form, [analysis('form:sq:x', 'invalidated')], 'readingRecognition')).toMatchObject({ eligible: false, status: 'invalidated' });
    expect(eligibilityFor(form, [analysis('form:sq:x', 'invalidated'), { ...analysis('form:sq:x', 'verified'), analysisId: 'other' }], 'grammaticalUnderstanding').eligible).toBe(true);
  });
  it('affectedByInvalidation lists the unit ids the candidates referenced', () => {
    const a = analysis('form:sq:x', 'invalidated', {
      candidates: [
        { lexemeId: 'lemma:sq:b:NOUN', senseId: 'sense:sq:b:NOUN:1', constructionIds: ['morph:sq:NOUN:Z'], confidence: 0.5, provenance: { source: 'rule', ref: 't', confidence: 0.5 } },
        { lexemeId: 'lemma:sq:a:NOUN', constructionIds: ['morph:sq:NOUN:Z'], confidence: 0.4, provenance: { source: 'rule', ref: 't', confidence: 0.4 } },
      ],
    });
    expect(affectedByInvalidation(a)).toEqual(['lemma:sq:a:NOUN', 'lemma:sq:b:NOUN', 'morph:sq:NOUN:Z', 'sense:sq:b:NOUN:1']);
  });
});

describe('review candidates', () => {
  const CX = 'morph:sq:NOUN:Case=Acc|Definite=Def';
  const forms = ['form:sq:f1', 'form:sq:f2', 'form:sq:f3', 'form:sq:f4'];
  const wrong = (id: string) => card([id], 'recognition', false, {}, { at: '2026-10-04T10:00:00.000Z' }); // 4 days before NOW: recent, not a prior review

  const setupWorld = (withRelations: boolean) => (s: FakeStore) => {
    for (const f of forms) s.units.set(f, unit(f, 'form', 'verified'));
    s.units.set(CX, unit(CX, 'morph-construction', 'verified', { label: 'definite accusative' }));
    if (withRelations) s.relations.push(...forms.map((f) => realizes(f, CX)));
    s.enrolments.push(enrolment());
  };

  it('a construction behind many failed forms is a candidate that explains them, and those forms are halved', async () => {
    const events = forms.map(wrong);
    const withC = await make(events, setupWorld(true));
    const without = await make(events, setupWorld(false));
    const a = await withC.engine.candidates(L, E, { now: NOW });
    const b = await without.engine.candidates(L, E, { now: NOW });

    const c = a.find((x) => x.unitId === CX)!;
    expect(c).toBeDefined();
    expect(c.explains).toEqual([...forms]);
    expect(c.targetDimension).toBe('grammaticalUnderstanding');
    expect(c.reasons.map((r) => r.rule)).toContain('grammaticalLeverage');
    expect(c.eligibility.eligible).toBe(true);
    expect(c.score).toBeCloseTo(0.3 + 0.05); // grammaticalLeverage + goalMatch; no row of its own
    expect(b.find((x) => x.unitId === CX)).toBeUndefined();

    for (const f of forms) {
      const fa = a.find((x) => x.unitId === f)!;
      const fb = b.find((x) => x.unitId === f)!;
      expect(fa.reasons.map((r) => r.rule)).toContain('explained-by-construction');
      expect(fa.score).toBeCloseTo(fb.score * 0.5);
    }
  });

  it('fewer than three failed forms is not enough to promote the construction', async () => {
    const { engine } = await make(forms.slice(0, 2).map(wrong), setupWorld(true));
    expect((await engine.candidates(L, E, { now: NOW })).find((x) => x.unitId === CX)).toBeUndefined();
  });

  it('every reason is listed and the score is their sum (clamped to 0..1); results are sorted by score', async () => {
    const { engine } = await make([...forms.map(wrong), lookup(['form:sq:f1']), lookup(['form:sq:f1'])], setupWorld(false));
    const list = await engine.candidates(L, E, { now: NOW });
    for (const c of list) {
      const sum = c.reasons.reduce((s, r) => s + r.weight, 0);
      expect(c.score).toBeCloseTo(Math.min(1, Math.max(0, sum)));
      expect(c.cost).toBeGreaterThanOrEqual(0.2);
      expect(c.cost).toBeLessThanOrEqual(1);
    }
    expect(list.map((c) => c.score)).toEqual([...list.map((c) => c.score)].sort((x, y) => y - x));
    const f1 = list.find((c) => c.unitId === 'form:sq:f1')!;
    expect(f1.reasons.map((r) => r.rule)).toEqual(expect.arrayContaining(['recentEncounter', 'repeatedLookups', 'demonstratedError', 'weakButSeen', 'goalMatch']));
    expect(f1.score).toBeGreaterThan(list.find((c) => c.unitId === 'form:sq:f2')!.score);
  });

  it('a unit already covered by a card is not proposed again (with includeCovered it scores 0.3 lower); a removed card lifts it; a review in the last two days costs 0.15', async () => {
    const base = [wrong('form:sq:f1')];
    const score = async (extra: GoEvent[]) => {
      const { engine } = await make([...base, ...extra], setupWorld(false));
      return (await engine.candidates(L, E, { now: NOW, includeCovered: true })).find((c) => c.unitId === 'form:sq:f1')!;
    };
    const plain = await score([]);
    const covered = await score([ev('CardAdded', ['form:sq:f1'], {}, { at: '2026-10-07T11:00:00.000Z' })]);
    const removed = await score([ev('CardAdded', ['form:sq:f1'], {}, { at: '2026-10-07T11:00:00.000Z' }), ev('CardRemoved', ['form:sq:f1'], {}, { at: '2026-10-07T12:00:00.000Z' })]);
    expect(covered.score).toBeCloseTo(plain.score - 0.3);
    const { engine: defaultEngine } = await make([...base, ev('CardAdded', ['form:sq:f1'], {}, { at: '2026-10-07T11:00:00.000Z' })], setupWorld(false));
    expect((await defaultEngine.candidates(L, E, { now: NOW })).find((c) => c.unitId === 'form:sq:f1')).toBeUndefined(); // already carded: not proposed again
    expect(covered.reasons.find((r) => r.rule === 'existingCoverage')).toMatchObject({ weight: -0.3, detail: expect.stringMatching(/already covered/) });
    expect(removed.score).toBeCloseTo(plain.score);
    expect(plain.reasons.map((r) => r.rule)).not.toContain('priorReview');
    const reviewed = await score([card(['form:sq:f1'], 'recognition', false, {}, { at: '2026-10-08T10:00:00.000Z' })]);
    expect(reviewed.reasons.find((r) => r.rule === 'priorReview')).toMatchObject({ weight: -0.15 });
  });

  it('a provisional construction with grammar errors is not eligible and is listed last with score 0; provisional recognition is eligible with a caveat', async () => {
    const events = [grammar([], CX, false), grammar([], CX, false), card(['form:sq:f1'], 'recognition', false)];
    const { engine } = await make(events, (s) => {
      setupWorld(false)(s);
      s.units.set(CX, unit(CX, 'morph-construction', 'provisional'));
      s.units.set('form:sq:f1', unit('form:sq:f1', 'form', 'provisional'));
    });
    const list = await engine.candidates(L, E, { now: NOW });
    const cx = list.find((c) => c.unitId === CX)!;
    expect(cx.eligibility).toMatchObject({ eligible: false, status: 'provisional' });
    expect(cx.score).toBe(0);
    expect(list[list.length - 1].unitId).toBe(CX);
    expect(cx.reasons.map((r) => r.rule)).toContain('analysisConfidence');
    const f1 = list.find((c) => c.unitId === 'form:sq:f1')!;
    expect(f1.eligibility).toEqual({ eligible: true, status: 'provisional', caveats: ['provisional analysis; shown with caveats'] });
    expect(f1.score).toBeGreaterThan(0);
  });

  it('a unit that is not in the linguistic store, or whose form analyses are all invalidated, is not eligible', async () => {
    const { engine } = await make([wrong('form:sq:f1'), wrong('form:sq:ghost')], (s) => {
      setupWorld(false)(s);
      s.analyses.set('a1', analysis('form:sq:f1', 'invalidated'));
    });
    const list = await engine.candidates(L, E, { now: NOW });
    expect(list.every((c) => !c.eligibility.eligible && c.score === 0)).toBe(true);
    expect(list.find((c) => c.unitId === 'form:sq:ghost')!.eligibility).toMatchObject({ status: 'unknown' });
  });

  it('exposure alone is not a reason to review, unless frequency says the unit is common', async () => {
    const { engine } = await make([encounter(['form:sq:f1']), encounter(['form:sq:f2']), encounter(['form:sq:f3'])], (s) => {
      setupWorld(false)(s);
      s.units.set('form:sq:f2', unit('form:sq:f2', 'form', 'verified', { frequency: { rank: 150, source: 'test' } }));
      s.units.set('form:sq:f3', unit('form:sq:f3', 'form', 'verified', { frequency: { rank: 9000, source: 'test' } }));
    });
    const list = await engine.candidates(L, E, { now: NOW });
    expect(list.map((c) => c.unitId)).toEqual(['form:sq:f2']);
    expect(list[0].reasons.map((r) => r.rule)).toContain('wordFrequency');
  });

  it('honours the limit, other enrolments\' languages, and an unknown enrolment', async () => {
    const { engine } = await make(forms.map(wrong), setupWorld(false));
    expect((await engine.candidates(L, E, { limit: 2, now: NOW })).length).toBe(2);
    expect(await engine.candidates(L, 'no-such-enrolment')).toEqual([]);
  });

  it('goal heuristics: a custom goal credits no goalMatch', async () => {
    const { engine } = await make([wrong('form:sq:f1')], (s) => { setupWorld(false)(s); s.enrolments[0] = enrolment([{ kind: 'custom' }]); });
    expect((await engine.candidates(L, E, { now: NOW }))[0].reasons.map((r) => r.rule)).not.toContain('goalMatch');
  });
});

describe('suitability', () => {
  const run = async () => {
    resetIds();
    const reading = (id: string, n: number, correct: boolean) => Array.from({ length: n }, () => card([id], 'recognition', correct));
    const events = [
      ...reading('form:sq:u1', 3, true), // recognised: 3 x 0.56 positive
      ...reading('form:sq:u2', 1, true), // too little confidence: uncertain
      ...reading('form:sq:u4', 3, false), // confidently not known
      encounter(['form:sq:u5']), // exposure only
      grammar([], 'morph:sq:NOUN:X', false), grammar([], 'morph:sq:NOUN:X', false),
    ];
    const { engine, store } = await make(events, (s) => {
      for (const id of ['form:sq:u1', 'form:sq:u2', 'form:sq:u4']) s.units.set(id, unit(id, 'form'));
      s.units.set('form:sq:u5', unit('form:sq:u5', 'form', 'provisional'));
      s.units.set('morph:sq:NOUN:X', unit('morph:sq:NOUN:X', 'morph-construction'));
    });
    const est = await engine.suitability(L, 'sq', { unitIds: ['form:sq:u1', 'form:sq:u1', 'form:sq:u2', 'form:sq:u3', 'form:sq:u4', 'form:sq:u5'], tokenCount: 9, constructionIds: ['morph:sq:NOUN:X'] });
    return { est, store };
  };

  it('counts recognised, uncertain and unknown tokens and lists the difficulties', async () => {
    const { est } = await run();
    expect(est).toMatchObject({ languageId: 'sq', tokens: 9, wordTokens: 6, recognized: 2, uncertain: 2, unknown: 2, modelVersion: 'projection@4' });
    expect(est.recognized + est.uncertain + est.unknown).toBe(est.wordTokens);
    expect(est.familiarUnits).toEqual(['form:sq:u1']);
    expect(est.difficultUnits.map((d) => d.unitId)).toEqual(['form:sq:u4']);
    expect(est.difficultUnits[0].reason).toMatch(/reading recognition/);
    expect(est.difficultConstructions.map((d) => d.unitId)).toEqual(['morph:sq:NOUN:X']);
  });

  it('reliability = min(1, evidence density) x pack coverage, and the gaps are listed', async () => {
    const { est } = await run();
    // tokens whose unit has >= 1 weighted judged observation: u1, u1, u4 = 3 of 6; gaps: u3 (missing) and u5 (provisional) of 6 distinct units
    expect(est.reliability).toBeCloseTo(0.5 * (1 - 2 / 6));
    expect(est.coverageGaps).toEqual(['form:sq:u3: not in the linguistic store', 'form:sq:u5: provisional analysis']);
  });

  it('never carries a level label of any scale', async () => {
    const { est } = await run();
    const text = JSON.stringify(est);
    expect(text).not.toMatch(/cefr|\b[ABC][12]\b|beginner|intermediate|advanced|\blevel\b/i);
  });

  it('an empty sample is reported as such, with zero reliability', async () => {
    const { engine } = await make([]);
    expect(await engine.suitability(L, 'sq', { unitIds: [], tokenCount: 0 })).toMatchObject({ wordTokens: 0, recognized: 0, uncertain: 0, unknown: 0, reliability: 0 });
  });
});

describe('observation table spot checks', () => {
  it('matches the documented weights', () => {
    const w = (e: GoEvent) => observationsOf(e)[0];
    expect(w(encounter(['x'])).weight).toBe(0.2);
    expect(w(lookup(['x'])).weight).toBe(0.3);
    expect(w(ev('UnderstoodMarked', ['x'], { scope: 'sentence', helpUsed: false })).weight).toBeCloseTo(0.16);
    expect(w(ev('ItemMarked', ['x'], { mark: 'known' })).weight).toBeCloseTo(0.06);
    expect(observationsOf(listening(['x'], true, { voice: 'synthetic' }))).toEqual([]); // synthetic speech is never listening evidence (audit D8)
    expect(w(listening(['x'], true, { hinted: true })).dimension).toBe('assistedRecognition');
    expect(w(listening(['x'], true, { hinted: true })).weight).toBeCloseTo(0.56);
    expect(w(card(['x'], 'recall', true, { grade: 'easy' })).weight).toBeCloseTo(0.8);
    expect(w(grammar(['x'], 'morph:sq:NOUN:X', true)).weight).toBeCloseTo(0.8);
    expect(w(production(['x'], { mode: 'retrieval' })).dimension).toBe('productiveRetrieval');
    expect(w(production(['x'], { usedCorrectly: false })).weight).toBeCloseTo(0.7);
    expect(w(production(['x'], { usedCorrectly: 'unjudged' })).dimension).toBe('exposure');
    expect(observationsOf(ev('ItemMarked', ['x'], { mark: 'saved' }))).toEqual([]);
  });
  it('grammar evidence lands on the construction named in the payload and on construction ids in the subject, not on forms', () => {
    const obs = observationsOf(grammar(['form:sq:librin', 'syntax:sq:clitic', 'morph:sq:NOUN:X'], 'morph:sq:NOUN:X', true));
    expect(obs.map((o) => o.unitId).sort()).toEqual(['morph:sq:NOUN:X', 'syntax:sq:clitic']);
  });
  it('a unit named twice in one event is observed once; an unparseable timestamp yields nothing', () => {
    expect(observationsOf(lookup(['x', 'x', 'y']))).toHaveLength(2);
    expect(observationsOf({ ...lookup(['x']), at: 'not a date' })).toEqual([]);
  });
});
