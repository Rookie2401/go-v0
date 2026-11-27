/**
 * The deck gate (packages/goreview/src/facts/deck-gate.ts) on small made facts: what it lets through, what it repairs, what it holds, and that a held
 * unit can build no meaning card. The gate on the real dictionaries is test/deck-audit/deck-audit.test.ts.
 */
import { describe, expect, it } from 'vitest';
import { applyDeckGate, cardMeaning, senseHead, type DeckGateDeps, type GatedFacts } from '../../packages/goreview/src/facts/deck-gate';
import { BUILDERS } from '../../packages/goreview/src/exercises';
import type { UnitFacts } from '../../packages/goreview/src/types';
import { crossReferenceTarget, isCrossReferenceOnly } from '../../src/core/review-meaning';

type Sense = { gloss: string; pos?: string; tags?: string[] };
const NOW = '2026-11-26T00:00:00.000Z';
function facts(unitId: string, o: { lemma?: string; pos?: string; lexicon?: string[]; dictionary?: string[]; inWordList?: boolean; status?: UnitFacts['status']; base?: { lemma: string; pos?: string; glosses: string[] } }): UnitFacts {
  const form = unitId.startsWith('form:');
  const lang = unitId.split(':')[1];
  const label = form ? unitId.slice(`form:${lang}:`.length) : o.lemma ?? unitId.split(':')[2];
  const status = o.status ?? 'provisional';
  return {
    unit: { unitId, kind: form ? 'form' : 'lexeme', languageId: lang, label, packId: `pack:${lang}`, packVersion: '1', status, createdAt: NOW, provenance: { source: 'hand-lexicon', ref: 'goreview-facts:pack-derived@test', confidence: 0.9 }, ...(o.pos ? { pos: o.pos } : {}) },
    relations: [], analyses: [], status, ...(o.lemma ? { lemma: o.lemma } : {}), ...(o.pos ? { pos: o.pos } : {}),
    glosses: [...(o.lexicon ?? []), ...(o.dictionary ?? [])], lexiconGlossCount: (o.lexicon ?? []).length, lemmaInWordList: o.inWordList ?? false,
    ...(o.base ? { lexicalRecognition: { status: 'verified', lemma: o.base.lemma, pos: o.base.pos, glosses: o.base.glosses, evidence: 'attested-form-reading', attribution: 'Test dictionary' } } : {}),
    constructionIds: [], featureExplanations: {}, siblingForms: [], exampleSentences: [], pronunciationNotes: [],
  } as unknown as UnitFacts;
}
function deps(lang: string, dictionary: Record<string, Sense[]>, others: Record<string, UnitFacts> = {}, known: Record<string, string> = {}): DeckGateDeps {
  const d: DeckGateDeps = {
    languageId: lang,
    gloss: async (lemma) => (dictionary[lemma] ? { senses: dictionary[lemma] } : undefined),
    factsOf: async (id) => applyDeckGate(others[id], d),
    known: (id) => known[id],
  };
  return d;
}
const shown = (f: GatedFacts | undefined): string | undefined => (f ? cardMeaning(f)?.shown : undefined);
const built = async (f: GatedFacts): Promise<{ unavailable?: boolean; reason?: string }> =>
  BUILDERS['written-recognition'].build({ unitId: f.unit.unitId, unitKind: f.unit.kind, languageId: f.unit.languageId, dimension: 'written-recognition' } as never, f, { now: NOW, random: () => 0 }) as never;

describe('a meaning that is only a cross-reference', () => {
  it.each([
    'alternative spelling of aquél', 'alternative form of dieses', 'apocopic form of suyo', 'synonym of Cerēs', 'plural of Haus', 'obsolete form of irden (“earthen, made of clay”)',
    'inflection of gehen', 'first-person singular present of bringen', 'genitive singular of os', 'feminine singular of bueno', 'past participle of lesen', 'abbreviation of zum Beispiel', '(archaic) alternative form of ejus',
  ])('%s', (g) => { expect(isCrossReferenceOnly(g)).toBe(true); });
  it.each(['book', 'to see', 'apocopic form of mío, my'.replace(', my', '; my'), 'plural of X: houses', 'of, from or relating to Honduras', 'form', 'a form of address', 'the plural', 'contraction of zu + dem, literally “to the; for the”'.replace('contraction of zu + dem, literally', 'to the; literally')])('not: %s', (g) => { expect(isCrossReferenceOnly(g)).toBe(false); });
  it('names the entry it points at', () => {
    expect(crossReferenceTarget('alternative spelling of aquél')).toBe('aquél');
    expect(crossReferenceTarget('obsolete form of irden (“earthen, made of clay”)')).toBe('irden');
    expect(crossReferenceTarget('book')).toBeUndefined();
  });
});

describe('the head of a dictionary sense', () => {
  it('a long sense with an aside gives its head, a short sense itself, a pointer nothing', () => {
    expect(senseHead('Sunday (the first day of the week in many religious traditions, and the seventh day of the week in systems using the ISO 8601 standard)')).toBe('Sunday');
    expect(senseHead('book (collection of sheets of paper bound together to hinge at one edge; long work fit for publication)')).toBe('book');
    expect(senseHead('yesterday')).toBe('yesterday');
    expect(senseHead('alternative form of dieses')).toBeUndefined();
  });
});

describe('the deck gate: lemma units', () => {
  it('a word-list lemma with its own meaning passes unchanged', async () => {
    const f = facts('lemma:de:Buch:NOUN', { lemma: 'Buch', pos: 'NOUN', lexicon: ['book'], inWordList: true });
    expect(await applyDeckGate(f, deps('de', {}))).toBe(f);
  });
  it('a dictionary-only lemma shows the head of the FIRST sense, not a later short one', async () => {
    const senses = [{ gloss: 'Sunday (the first day of the week in many religious traditions, and the seventh day of the week in systems using the ISO 8601 standard)', pos: 'NOUN' }, { gloss: 'a municipality of Vorarlberg, Austria', pos: 'PROPN' }];
    const f = facts('lemma:de:Sonntag:NOUN', { lemma: 'Sonntag', pos: 'NOUN', dictionary: senses.map((s) => s.gloss) });
    expect(shown(f)).toBe('a municipality of Vorarlberg, Austria');
    const g = await applyDeckGate(f, deps('de', { Sonntag: senses }));
    expect(g?.reviewHold).toBeUndefined();
    expect(shown(g)).toBe('Sunday');
  });
  it('a first sense that is obsolete is passed over for the first current one', async () => {
    const senses = [{ gloss: 'a kind of old coin', pos: 'NOUN', tags: ['obsolete'] }, { gloss: 'penny', pos: 'NOUN' }];
    const g = await applyDeckGate(facts('lemma:xx:pen:NOUN', { lemma: 'pen', pos: 'NOUN', dictionary: senses.map((s) => s.gloss) }), deps('xx', { pen: senses }));
    expect(shown(g)).toBe('penny');
  });
  it('a cross-reference is followed once to its target; with no target meaning the unit is held as no-meaning', async () => {
    const f = facts('lemma:es:aquel:PRON', { lemma: 'aquel', pos: 'PRON', dictionary: ['alternative spelling of aquél'] });
    const followed = await applyDeckGate(f, deps('es', { aquel: [{ gloss: 'alternative spelling of aquél', pos: 'PRON' }], 'aquél': [{ gloss: 'that one (far from speaker and listener)', pos: 'PRON' }] }));
    expect(shown(followed)).toBe('that one');
    const dead = await applyDeckGate(f, deps('es', { aquel: [{ gloss: 'alternative spelling of aquél', pos: 'PRON' }] }));
    expect(dead?.reviewHold?.kind).toBe('no-meaning');
    expect(dead?.status).toBe('requires-review');
  });
  it('a lemma that is neither in the word list nor a dictionary entry is held as unlisted', async () => {
    const g = await applyDeckGate(facts('lemma:de:brüd:NOUN', { lemma: 'brüd', pos: 'NOUN', lexicon: ['brother'] }), deps('de', {}));
    expect(g?.reviewHold?.kind).toBe('unlisted');
  });
  it('a first sense too long to show whole is held, never replaced by a later sense', async () => {
    const senses = [{ gloss: 'the act or process by which one thing is slowly and carefully changed into another over a long time', pos: 'NOUN' }, { gloss: 'a village', pos: 'NOUN' }];
    const g = await applyDeckGate(facts('lemma:xx:w:NOUN', { lemma: 'w', pos: 'NOUN', dictionary: senses.map((s) => s.gloss) }), deps('xx', { w: senses }));
    expect(g?.reviewHold?.kind).toBe('meaning-unreviewed');
  });
  it('a unit on the known-limits list is held with the list\'s own sentence', async () => {
    const g = await applyDeckGate(facts('lemma:de:Buch:NOUN', { lemma: 'Buch', pos: 'NOUN', lexicon: ['book'], inWordList: true }), deps('de', {}, {}, { 'lemma:de:Buch:NOUN': 'Read wrongly in running text.' }));
    expect(g?.reviewHold).toEqual({ kind: 'known-limit', reason: 'Read wrongly in running text.' });
  });
  it('a conflicted, invalidated or reviewer-verified unit is left as it is', async () => {
    for (const status of ['conflicted', 'invalidated', 'verified'] as const) {
      const f = facts('lemma:de:x:NOUN', { lemma: 'x', pos: 'NOUN', dictionary: ['alternative form of y'], status });
      expect(await applyDeckGate(f, deps('de', {}))).toBe(f);
    }
  });
});

describe('the deck gate: form units', () => {
  const buch = facts('lemma:de:Buch:NOUN', { lemma: 'Buch', pos: 'NOUN', lexicon: ['book'], inWordList: true });
  it('a form card that shows a meaning its own word does not have is held; the word\'s own card is untouched', async () => {
    const f = facts('form:de:buch', { lemma: 'Buch', pos: 'NOUN', dictionary: ['books (accounting records)', 'omasum'] });
    const g = await applyDeckGate(f, deps('de', {}, { 'lemma:de:Buch:NOUN': buch }));
    expect(g?.reviewHold?.kind).toBe('meaning-unreviewed');
    const b = await built(g!);
    expect(b.unavailable).toBe(true);
  });
  it('a form card that repeats its word\'s card passes', async () => {
    const f = facts('form:de:buch', { lemma: 'Buch', pos: 'NOUN', dictionary: ['book'] });
    expect(await applyDeckGate(f, deps('de', {}, { 'lemma:de:Buch:NOUN': buch }))).toBe(f);
  });
  it('an inflected form whose own meaning is one its word\'s card shows passes (oss "us" beside vi "we; us")', async () => {
    const vi = facts('lemma:nb:vi:PRON', { lemma: 'vi', pos: 'PRON', lexicon: ['we; us'], inWordList: true });
    const f = facts('form:nb:oss', { lemma: 'vi', pos: 'PRON', dictionary: ['us'] });
    expect(await applyDeckGate(f, deps('nb', {}, { 'lemma:nb:vi:PRON': vi }))).toBe(f);
  });
  it('a form whose word is held, conflicted or unknown is held with it', async () => {
    const f = facts('form:de:bauer', { lemma: 'Bauer', pos: 'NOUN', dictionary: ['farmer'] });
    const conflicted = facts('lemma:de:Bauer:NOUN', { lemma: 'Bauer', pos: 'NOUN', lexicon: ['farmer'], inWordList: true, status: 'conflicted' });
    expect((await applyDeckGate(f, deps('de', {}, { 'lemma:de:Bauer:NOUN': conflicted })))?.reviewHold?.kind).toBe('undecided-entry');
    expect((await applyDeckGate(f, deps('de', {})))?.reviewHold?.kind).toBe('unlisted');
  });
  it('a base-meaning card shows what the word\'s own card shows first', async () => {
    const sein = facts('lemma:de:sein:AUX', { lemma: 'sein', pos: 'AUX', lexicon: ['to be'], inWordList: true });
    const f = facts('form:de:ist', { pos: 'AUX', base: { lemma: 'sein', pos: 'AUX', glosses: ['forms the present perfect and past perfect tenses of certain verbs', 'to be'] } });
    const g = await applyDeckGate(f, deps('de', {}, { 'lemma:de:sein:AUX': sein }));
    expect(shown(g)).toBe('to be');
  });
  it('a written form with no reading: one word class passes with its first sense; two classes are undecided; a place name beside a common word does not count', async () => {
    const one = await applyDeckGate(facts('form:de:sonntag', { dictionary: ['a municipality of Vorarlberg, Austria'] }), deps('de', { sonntag: [{ gloss: 'Sunday (the first day of the week in many religious traditions)', pos: 'NOUN' }, { gloss: 'a municipality of Vorarlberg, Austria', pos: 'PROPN' }] }));
    expect(shown(one)).toBe('Sunday');
    const two = await applyDeckGate(facts('form:de:morgen', { dictionary: ['tomorrow'] }), deps('de', { morgen: [{ gloss: 'tomorrow', pos: 'ADV' }, { gloss: 'morning', pos: 'NOUN' }] }));
    expect(two?.reviewHold?.kind).toBe('undecided-entry');
    const none = await applyDeckGate(facts('form:de:xyz', { dictionary: ['thing'] }), deps('de', {}));
    expect(none?.reviewHold?.kind).toBe('unlisted');
  });
  it('a held unit builds no meaning card and says why', async () => {
    const g = await applyDeckGate(facts('form:de:morgen', { dictionary: ['tomorrow'] }), deps('de', { morgen: [{ gloss: 'tomorrow', pos: 'ADV' }, { gloss: 'morning', pos: 'NOUN' }] }));
    const b = await built(g!);
    expect(b.unavailable).toBe(true);
    expect(b.reason).toContain('more than one word');
  });
});

describe('the deck gate: grammar notes, machine word lists and periods', () => {
  it('a grammar note is not a meaning: the head leaves it out, and a sense that is only a note is passed over', async () => {
    expect(senseHead('[with prepositional] — in, at, on')).toBe('in, at, on');
    expect(senseHead('[with prepositional]')).toBeUndefined();
    const senses = [{ gloss: '[with prepositional]', pos: 'ADP' }, { gloss: '[with prepositional] — in, at, on', pos: 'ADP' }];
    const f = { ...facts('lemma:ru:в:ADP', { lemma: 'в', pos: 'ADP', lexicon: ['[with prepositional]'], inWordList: true }), source: 'dictionary' } as UnitFacts;
    const g = await applyDeckGate(f, deps('ru', { 'в': senses }));
    expect(g?.reviewHold).toBeUndefined();
    expect(shown(g)).toBe('in, at, on');
  });
  it('a word-list meaning taken by machine from a LATER dictionary sense gives way to the first current sense; a hand-written one never does', async () => {
    const senses = [{ gloss: 'water', pos: 'NOUN' }, { gloss: 'tide', pos: 'NOUN' }, { gloss: 'it (the person who chases the other players in tag and similar games)', pos: 'NOUN' }];
    const machine = { ...facts('lemma:ru:вода:NOUN', { lemma: 'вода', pos: 'NOUN', lexicon: ['it (the person who chases the other players in tag and similar games)'], inWordList: true }), source: 'dictionary' } as UnitFacts;
    expect(shown(await applyDeckGate(machine, deps('ru', { 'вода': senses })))).toBe('water');
    const hand = { ...facts('lemma:ru:вода:NOUN', { lemma: 'вода', pos: 'NOUN', lexicon: ['tide'], inWordList: true }), source: 'hand-lexicon' } as UnitFacts;
    expect(await applyDeckGate(hand, deps('ru', { 'вода': senses }))).toBe(hand);
  });
  it('a word no reading places in the period of the learner is held as another variety; a meaning from another period gives way to the one of that period', async () => {
    const lemma = (id: string, word: string, gloss: string, periodReading: { attested: boolean; inPeriod: boolean; gloss?: string }): UnitFacts =>
      ({ ...facts(id, { lemma: word, pos: 'NOUN', lexicon: [gloss], inWordList: true }), source: 'dictionary', periodReading }) as unknown as UnitFacts;
    // Modern Greek μητέρα read as Ancient μήτηρ: no reading of μήτηρ is Modern Greek
    expect((await applyDeckGate(lemma('lemma:el:μήτηρ:NOUN', 'μήτηρ', 'a mother', { attested: false, inPeriod: false }), { ...deps('el', {}), varietyId: 'el-mod' }))?.reviewHold?.kind).toBe('other-variety');
    // Modern Hebrew מדינה: the facts were built from the Biblical reading ("province"); the modern reading's own meaning is shown instead
    const state = await applyDeckGate(lemma('lemma:he:מְדִינָה:NOUN', 'מְדִינָה', 'province', { attested: true, inPeriod: false, gloss: 'state, country' }), { ...deps('he', {}), varietyId: 'he-mod' });
    expect(state?.reviewHold).toBeUndefined();
    expect(shown(state)).toBe('state, country');
    // attested in the period but with no meaning there: held
    expect((await applyDeckGate(lemma('lemma:he:פָּתַר:VERB', 'פָּתַר', 'interpret', { attested: true, inPeriod: false }), { ...deps('he', {}), varietyId: 'he-mod' }))?.reviewHold?.kind).toBe('other-variety');
    // a reading of the learner's own period passes as it is
    const own = lemma('lemma:he:חֹשֶׁךְ:NOUN', 'חֹשֶׁךְ', 'darkness', { attested: true, inPeriod: true, gloss: 'darkness' });
    expect(await applyDeckGate(own, { ...deps('he', {}), varietyId: 'he-bib' })).toBe(own);
  });
  it('"defective spelling of" is a pointer too', () => {
    expect(isCrossReferenceOnly('defective spelling of איחר')).toBe(true);
    expect(isCrossReferenceOnly('monotonic form of τῷ (tôi), masculine/neuter dative singular of ὁ (o)')).toBe(true);
  });
});

describe('pointers written as grammar', () => {
  it.each(['to-infinitive of עָבַד (avád).', 'bare infinitive (infinitive construct) of בא', 'infinitive construct of בא'])('%s', (g) => { expect(isCrossReferenceOnly(g)).toBe(true); });
});
