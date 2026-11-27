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
    const f = facts('form:de:gewesen', { pos: 'AUX', base: { lemma: 'sein', pos: 'AUX', glosses: ['forms the present perfect and past perfect tenses of certain verbs', 'to be'] } });
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

describe('pointers with a slash between labels', () => {
  it('"imperfect middle/passive indicative of X" is a pointer', () => {
    expect(isCrossReferenceOnly('third-person singular imperfect middle/passive indicative of πυνθάνομαι (punthánomai)')).toBe(true);
    expect(crossReferenceTarget('third-person singular imperfect middle/passive indicative of πυνθάνομαι (punthánomai)')).toBe('πυνθάνομαι');
  });
});

describe('a written form the forms index lists under another word', () => {
  const verb = [{ gloss: 'to be due, to be owed', pos: 'VERB' }];
  const withIndex = (hits: Array<{ lemma: string; pos?: string }>): DeckGateDeps => ({ ...deps('de', { 'gebühren': verb, sonntag: [{ gloss: 'Sunday', pos: 'NOUN' }] }), formIdentities: async () => hits });
  it('is undecided by its spelling: German Gebühren (plural of Gebühr) is not the verb gebühren', async () => {
    const g = await applyDeckGate(facts('form:de:gebühren', { dictionary: ['to be due, to be owed'] }), withIndex([{ lemma: 'Gebühr', pos: 'NOUN' }, { lemma: 'gebühren', pos: 'VERB' }]));
    expect(g?.reviewHold?.kind).toBe('undecided-entry');
    expect(g?.reviewHold?.reason).toContain('form of another word');
  });
  it('a form listed under its own headword only, or beside a place name, passes', async () => {
    const own = await applyDeckGate(facts('form:de:sonntag', { dictionary: ['Sunday'] }), withIndex([{ lemma: 'Sonntag', pos: 'NOUN' }, { lemma: 'Sonntag', pos: 'PROPN' }]));
    expect(own?.reviewHold).toBeUndefined();
    const none = await applyDeckGate(facts('form:de:sonntag', { dictionary: ['Sunday'] }), withIndex([]));
    expect(none?.reviewHold).toBeUndefined();
  });
});

describe('a form card whose spelling is several words', () => {
  const lemma = facts('lemma:de:linken:VERB', { lemma: 'linken', pos: 'VERB', dictionary: ['to deceive'] });
  const d: DeckGateDeps = { ...deps('de', { linken: [{ gloss: 'to deceive', pos: 'VERB' }] }, { 'lemma:de:linken:VERB': lemma }),
    formIdentities: async () => [{ lemma: 'linken', pos: 'VERB' }, { lemma: 'link', pos: 'ADJ' }, { lemma: 'Linke', pos: 'NOUN' }] };
  const form = (source: string): UnitFacts => { const f = facts('form:de:linken', { lemma: 'linken', pos: 'VERB', dictionary: ['to deceive'] }); return { ...f, unit: { ...f.unit, provenance: { ...f.unit.provenance, source } } } as UnitFacts; };
  it('is held when the reading of it is only a rule\u2019s guess (German linken), and the word\u2019s own lemma card is not touched', async () => {
    expect((await applyDeckGate(form('rule'), d))?.reviewHold?.kind).toBe('undecided-entry');
    expect((await applyDeckGate(lemma, d))?.reviewHold).toBeUndefined();
  });
  it('stands when the pack\u2019s own word list confirms the reading, and when one headword is listed under two classes', async () => {
    expect((await applyDeckGate(form('hand-lexicon'), d))?.reviewHold).toBeUndefined();
    const und: DeckGateDeps = { ...deps('de', { und: [{ gloss: 'and', pos: 'CONJ' }] }), formIdentities: async () => [{ lemma: 'und', pos: 'CONJ' }, { lemma: 'und', pos: 'INTJ' }] };
    expect((await applyDeckGate(facts('form:de:und', { dictionary: ['and'] }), und))?.reviewHold).toBeUndefined();
  });
});

describe('a form card has no sentence', () => {
  it('a spelling the word list reads as another word too gets no form card; its lemma card is untouched', async () => {
    const lemma = facts('lemma:nb:lære:NOUN', { lemma: 'lære', pos: 'NOUN', lexicon: ['teaching; doctrine'], inWordList: true });
    const form = { ...facts('form:nb:lære', { lemma: 'lære', pos: 'NOUN', dictionary: ['teaching; doctrine'] }), alternativeReadings: [{ lemma: 'lære', pos: 'VERB', glosses: ['learn; teach'] }] } as UnitFacts;
    const g = await applyDeckGate(form, deps('nb', {}, { 'lemma:nb:lære:NOUN': lemma }));
    expect(g?.reviewHold?.kind).toBe('undecided-entry');
    expect(g?.reviewHold?.reason).toContain('more than one word');
    expect(await applyDeckGate(lemma, deps('nb', {}))).toBe(lemma);
  });
  it('German: a finite verb form may be half of a separable verb and gets no form card; the infinitive and a participle keep theirs', async () => {
    const holen = facts('lemma:de:holen:VERB', { lemma: 'holen', pos: 'VERB', lexicon: ['to fetch'], inWordList: true });
    const d = deps('de', {}, { 'lemma:de:holen:VERB': holen });
    const form = (label: string, features: Record<string, string>): UnitFacts => ({ ...facts(`form:de:${label}`, { lemma: 'holen', pos: 'VERB', dictionary: ['to fetch'] }), features }) as UnitFacts;
    expect((await applyDeckGate(form('holt', { VerbForm: 'Fin', Person: '3', Number: 'Sing' }), d))?.reviewHold?.reason).toContain('separable');
    expect((await applyDeckGate(form('holen', { VerbForm: 'Inf' }), d))?.reviewHold).toBeUndefined();
    expect((await applyDeckGate(form('geholt', { VerbForm: 'Part' }), d))?.reviewHold).toBeUndefined();
    // a verb that carries its prefix already: its joined finite form is its own (dass er sie abholt)
    const abholen = facts('lemma:de:abholen:VERB', { lemma: 'abholen', pos: 'VERB', lexicon: ['to pick up'], inWordList: true });
    const abholt = { ...facts('form:de:abholt', { lemma: 'abholen', pos: 'VERB', dictionary: ['to pick up'] }), features: { VerbForm: 'Fin', Person: '3' } } as UnitFacts;
    expect((await applyDeckGate(abholt, deps('de', {}, { 'lemma:de:abholen:VERB': abholen })))?.reviewHold).toBeUndefined();
    // another language's finite forms are not touched by this rule
    const hacer = facts('lemma:es:hacer:VERB', { lemma: 'hacer', pos: 'VERB', lexicon: ['to do'], inWordList: true });
    const hace = { ...facts('form:es:hace', { lemma: 'hacer', pos: 'VERB', dictionary: ['to do'] }), features: { VerbForm: 'Fin', Person: '3' } } as UnitFacts;
    expect((await applyDeckGate(hace, deps('es', {}, { 'lemma:es:hacer:VERB': hacer })))?.reviewHold).toBeUndefined();
  });
});

describe('follow-up 3: the first meaning', () => {
  it('a machine word list that leads with the first ITEM of a not-current sense gives way to the first current sense', async () => {
    // Russian платье: the list says "clothes" (the first item of "clothes, clothing", which the entry marks archaic); the current sense is "dress, gown, frock"
    const senses: Sense[] = [{ gloss: 'clothes, clothing', pos: 'NOUN', tags: ['archaic', 'historical'] }, { gloss: 'dress, gown, frock', pos: 'NOUN' }];
    const f = { ...facts('lemma:ru:платье:NOUN', { lemma: 'платье', pos: 'NOUN', lexicon: ['clothes'], dictionary: ['clothes, clothing', 'dress, gown, frock'], inWordList: true }), source: 'dictionary' } as UnitFacts;
    expect(shown(await applyDeckGate(f, deps('ru', { 'платье': senses })))).toBe('dress, gown, frock');
    // a list meaning that is the first item of a CURRENT first sense stays
    const ok = { ...facts('lemma:ru:стол:NOUN', { lemma: 'стол', pos: 'NOUN', lexicon: ['table'], dictionary: ['table, desk', 'board, fare'], inWordList: true }), source: 'dictionary' } as UnitFacts;
    expect(shown(await applyDeckGate(ok, deps('ru', { 'стол': [{ gloss: 'table, desk', pos: 'NOUN' }, { gloss: 'board, fare', pos: 'NOUN' }] })))).toBe('table');
  });

  it('the citation form shows what its word’s own card shows first, also when that meaning is long', async () => {
    // Russian линия: the word's card shows the first sense; the form card passed it over (seven words) for the later short sense "a cloth hall"
    const first = 'line (path through two or more points, or figuratively)';
    const lemma = { ...facts('lemma:ru:линия:NOUN', { lemma: 'линия', pos: 'NOUN', lexicon: [first], dictionary: [first, 'a cloth hall'], inWordList: true }), source: 'dictionary' } as UnitFacts;
    const form = facts('form:ru:линия', { lemma: 'линия', pos: 'NOUN', dictionary: [first, 'a cloth hall'], inWordList: true });
    expect(shown(form)).toBe('a cloth hall');
    const d = deps('ru', { 'линия': [{ gloss: first, pos: 'NOUN' }, { gloss: 'a cloth hall', pos: 'NOUN' }] }, { 'lemma:ru:линия:NOUN': lemma });
    expect(shown(await applyDeckGate(form, d))).toBe(first);
    // a second meaning the word's card lists too (Thai เงิน "silver (metal)" beside the word list's "money; silver"): the citation form shows the first
    const money = facts('lemma:th:เงิน:NOUN', { lemma: 'เงิน', pos: 'NOUN', lexicon: ['money; silver'], inWordList: true });
    const silver = facts('form:th:เงิน', { lemma: 'เงิน', pos: 'NOUN', dictionary: ['silver (metal)', 'money'], inWordList: true });
    expect(shown(await applyDeckGate(silver, deps('th', {}, { 'lemma:th:เงิน:NOUN': money })))).toBe('money; silver');
    // an INFLECTED form with a meaning of its own that its word's card lists keeps it (oss "us" beside vi "we; us")
    const vi = facts('lemma:nb:vi:PRON', { lemma: 'vi', pos: 'PRON', lexicon: ['we; us'], inWordList: true });
    const oss = facts('form:nb:oss', { lemma: 'vi', pos: 'PRON', dictionary: ['us'], inWordList: true });
    expect(shown(await applyDeckGate(oss, deps('nb', {}, { 'lemma:nb:vi:PRON': vi })))).toBe('us');
  });

  it('a lead sense named for a word is shown first when the entry has it, and the word is held when the entry no longer has it', async () => {
    const senses: Sense[] = [{ gloss: 'pipe', pos: 'NOUN' }, { gloss: 'binoculars (optical device)', pos: 'NOUN' }, { gloss: 'camera', pos: 'NOUN' }];
    const f = facts('lemma:th:กล้อง:NOUN', { lemma: 'กล้อง', pos: 'NOUN', dictionary: ['pipe', 'binoculars (optical device)', 'camera'], inWordList: true });
    const withLead = (lead: string[], dict: Sense[]): DeckGateDeps => ({ ...deps('th', { 'กล้อง': dict }), lead: (id) => (id === 'lemma:th:กล้อง:NOUN' ? lead : undefined) });
    expect(shown(await applyDeckGate(f, deps('th', { 'กล้อง': senses })))).toBe('pipe');
    const g = await applyDeckGate(f, withLead(['camera'], senses));
    expect(shown(g)).toBe('camera');
    expect(cardMeaning(g!)?.accepted).toContain('pipe'); // the entry's other senses are still accepted answers
    // two senses named: shown together
    expect(shown(await applyDeckGate(f, withLead(['camera', 'pipe'], senses)))).toBe('camera; pipe');
    // the entry changed and has the sense no longer: held, not shown with a meaning nobody chose
    const without = facts('lemma:th:กล้อง:NOUN', { lemma: 'กล้อง', pos: 'NOUN', dictionary: ['pipe', 'binoculars (optical device)'], inWordList: true });
    const gone = await applyDeckGate(without, withLead(['camera'], senses.slice(0, 2)));
    expect(gone?.reviewHold?.kind).toBe('meaning-unreviewed');
    expect(gone?.reviewHold?.reason).toContain('no longer in its dictionary entry');
    // the form card of the same word follows its word's card
    const form = facts('form:th:กล้อง', { lemma: 'กล้อง', pos: 'NOUN', dictionary: ['pipe', 'binoculars (optical device)', 'camera'], inWordList: true });
    const d = withLead(['camera'], senses);
    const all: DeckGateDeps = { ...d, factsOf: async (id) => (id === 'lemma:th:กล้อง:NOUN' ? applyDeckGate(f, d) : undefined) };
    expect(shown(await applyDeckGate(form, all))).toBe('camera');
  });

  it('a form with no reading that the forms index lists under one word shows that word’s own first meaning', async () => {
    // German uhr: the form unit has lost the capital of Uhr; the dictionary's entry leads with "hours, o'clock", the word's own card with "clock; watch; o'clock"
    const uhr = facts('lemma:de:Uhr:NOUN', { lemma: 'Uhr', pos: 'NOUN', lexicon: ['clock; watch; o’clock'], inWordList: true });
    const form = { ...facts('form:de:uhr', { dictionary: ['hours, o’clock', 'clock, watch'] }), unit: { ...facts('form:de:uhr', {}).unit, provenance: { source: 'parser', ref: 't', confidence: 0.5 } } } as UnitFacts;
    const d: DeckGateDeps = { ...deps('de', { uhr: [{ gloss: 'hours, o’clock', pos: 'NOUN' }, { gloss: 'clock, watch', pos: 'NOUN' }] }, { 'lemma:de:Uhr:NOUN': uhr }), formIdentities: async () => [{ lemma: 'Uhr', pos: 'NOUN' }] };
    expect(shown(await applyDeckGate(form, d))).toBe('clock; watch; o’clock');
    // with no forms index (or no such word's card) the form is as it was
    expect(shown(await applyDeckGate(form, deps('de', { uhr: [{ gloss: 'hours, o’clock', pos: 'NOUN' }, { gloss: 'clock, watch', pos: 'NOUN' }] })))).toBe('hours, o’clock');
  });
});

describe('lead senses where the meanings come from the lexicon (attested-form languages)', () => {
  it('the sense named is taken from the facts\u2019 own senses, and the word\u2019s form card shows it too', async () => {
    const senses = ['arm', 'hand', 'forelimb (anterior limb)'];
    const lemma = facts('lemma:he:yad:NOUN', { lemma: 'yad', pos: 'NOUN', lexicon: ['arm'], dictionary: senses, inWordList: true });
    const form = facts('form:he:beyado', { lemma: 'yad', pos: 'NOUN', dictionary: senses });
    const d: DeckGateDeps = { ...deps('he', {}), lead: (id) => (id === 'lemma:he:yad:NOUN' ? ['hand'] : undefined) };
    const all: DeckGateDeps = { ...d, factsOf: async (id) => (id === 'lemma:he:yad:NOUN' ? applyDeckGate(lemma, d) : undefined) };
    expect(shown(await applyDeckGate(lemma, d))).toBe('hand');
    expect(shown(await applyDeckGate(form, all))).toBe('hand');
    // without a named sense the attested form keeps its lemma's meaning as it was
    expect(shown(await applyDeckGate(form, { ...deps('he', {}), factsOf: async () => lemma }))).toBe(shown(form));
  });
});

describe('a meaning broken off inside a bracket', () => {
  it('shows without the unfinished aside; a meaning that is only the aside is not a card', async () => {
    const f = facts('lemma:la:timeo:VERB', { lemma: 'timeo', pos: 'VERB', lexicon: ['fear, be afraid of (ne + SUB = lest'], inWordList: true });
    expect(shown(await applyDeckGate(f, deps('la', {})))).toBe('fear, be afraid of');
    const only = facts('lemma:la:x:VERB', { lemma: 'x', pos: 'VERB', lexicon: ['(of things'], inWordList: true });
    expect((await applyDeckGate(only, deps('la', {})))?.reviewHold?.kind).toBe('meaning-unreviewed');
  });
});
