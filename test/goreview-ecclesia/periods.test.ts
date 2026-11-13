/** The periods of Hebrew and Greek: the catalogue, what is period-free, what carries the period, and what links spellings across periods. */
import { describe, expect, it } from 'vitest';
import { validateEvent } from '../../packages/repository-contract/src';
import { HE_PERIOD_ORDER, HE_VARIETIES } from '../../src/adapters/hebrew/varieties';
import { EL_PERIOD_ORDER, EL_VARIETIES } from '../../src/adapters/greek/varieties';
import type { EcclesiaToken, PassageTokens, UnitStanding, WorkPassageRef } from '../../packages/goreview-ecclesia/src/contract';
import { GREEK, HEBREW } from '../../packages/goreview-ecclesia/src/languages';
import { DEFAULT_PERIOD, PERIODS, isPeriod, periodDistance, periodOf, periodOfProfile, periodsOf, profileForPeriod, resolvePeriod } from '../../packages/goreview-ecclesia/src/periods';
import { crossPeriodKey, formId, lexemeId, parseLexemeId, parseWorkLocator, passageKey, scriptureRef, sourceRefOf, verseKey } from '../../packages/goreview-ecclesia/src/identity';
import { mapEncounters } from '../../packages/goreview-ecclesia/src/encounters';
import { contextsOf, contextualCard } from '../../packages/goreview-ecclesia/src/cards';
import { factsProviderFor, glossesFor, inMemoryLexicon } from '../../packages/goreview-ecclesia/src/facts';
import { UNSTATED_PERIOD, knowledgeStandings, periodEvidence, standingOrNew } from '../../packages/goreview-ecclesia/src/profile';
import { crossPeriodIndex, passageFamiliarity } from '../../packages/goreview-ecclesia/src/familiarity';
import { composeSession } from '../../packages/goreview-ecclesia/src/session';
import { JOHN_1, JOHN_1_1_18, lexemeOf, passage } from './fixtures/greek-john';
import { HEBREW_FIXTURE, LATIN_FIXTURE } from './fixtures/four-languages';

const identity = { learnerId: 'L-periods', enrolmentId: 'E', deviceId: 'D' };
const T = (m: number): string => new Date(Date.parse('2026-11-13T09:00:00.000Z') + m * 60_000).toISOString();
const ATTIC = profileForPeriod('el-att');
const MODERN_GREEK = profileForPeriod('el-mod');
const LOGOS = lexemeOf('λόγος', 'NOUN');

/** Synthetic tokens (not a quotation) for a passage of an Attic work: the words are real, the line is not. */
const REPUBLIC: WorkPassageRef = { work: 'plato-republic', title: 'Republic', chapter: 514, verse: 1, verseEnd: 2 };
const ATTIC_TOKENS: EcclesiaToken[] = [
  { index: 0, surface: 'ἄνθρωπος', lemma: 'ἄνθρωπος', pos: 'NOUN', features: { Case: 'Nom', Number: 'Sing', Gender: 'Masc' } },
  { index: 1, surface: 'λόγος', lemma: 'λόγος', pos: 'NOUN', features: { Case: 'Nom', Number: 'Sing', Gender: 'Masc' } },
];
const ATTIC_PASSAGE: PassageTokens = { language: 'grc', ref: REPUBLIC, verses: [{ verse: 1, tokens: ATTIC_TOKENS }] };

describe('the period catalogue', () => {
  it('is the adapters’ own periods: same ids, labels and historical order', () => {
    expect(periodsOf('he').map((p) => p.id)).toEqual([...HE_PERIOD_ORDER]);
    expect(periodsOf('grc').map((p) => p.id)).toEqual([...EL_PERIOD_ORDER]);
    for (const p of periodsOf('he')) expect(HE_VARIETIES[p.id]).toMatchObject({ code: p.id, label: p.label, kind: 'period' });
    for (const p of periodsOf('grc')) expect(EL_VARIETIES[p.id]).toMatchObject({ code: p.id, label: p.label, kind: 'period' });
    // Biblical Aramaic is the adapters' heritage variety beside Hebrew, and its own language here
    expect(HE_VARIETIES['arc-bib']).toMatchObject({ label: periodOf('arc-bib').label, kind: 'heritage' });
    expect(periodsOf('arc').map((p) => p.id)).toEqual(['arc-bib']);
    expect(periodsOf('la')).toEqual([]);
    expect(new Set(PERIODS.map((p) => p.id)).size).toBe(PERIODS.length);
  });
  it('lays out Hebrew as Biblical (Classical) → Mishnaic → Medieval → Modern and Greek as Homeric → Attic → Koine → Medieval → Modern', () => {
    expect(periodsOf('he').map((p) => p.label)).toEqual(['Biblical Hebrew', 'Mishnaic (Rabbinic) Hebrew', 'Medieval Hebrew', 'Modern Hebrew']);
    expect(periodsOf('grc').map((p) => p.label)).toEqual(['Homeric Greek', 'Attic Greek', 'Koine Greek', 'Medieval (Byzantine) Greek', 'Modern Greek']);
    for (const lang of ['he', 'grc'] as const) {
      const ps = periodsOf(lang);
      for (let i = 1; i < ps.length; i++) expect(ps[i]!.era.from).toBeGreaterThan(ps[i - 1]!.era.from);
    }
  });
  it('resolves the names people use', () => {
    expect(resolvePeriod('he', 'Classical Hebrew')?.id).toBe('he-bib');
    expect(resolvePeriod('he', 'Rabbinic')?.id).toBe('he-mish');
    expect(resolvePeriod('he', 'medieval')?.id).toBe('he-med');
    expect(resolvePeriod('he', 'Modern')?.id).toBe('he-mod');
    expect(resolvePeriod('grc', 'Epic')?.id).toBe('el-hom');
    expect(resolvePeriod('grc', 'classical greek')?.id).toBe('el-att');
    expect(resolvePeriod('grc', 'New Testament Greek')?.id).toBe('el-koi');
    expect(resolvePeriod('grc', 'Byzantine')?.id).toBe('el-med');
    expect(resolvePeriod('grc', 'modern')?.id).toBe('el-mod');
    expect(resolvePeriod('grc', 'el-att')?.id).toBe('el-att');
    expect(resolvePeriod('grc', 'Biblical Hebrew')).toBeUndefined();
    expect(resolvePeriod('la', 'medieval')).toBeUndefined();
  });
  it('states what the shared adapter has for each period, and trusts accordingly', () => {
    const analysed = Object.fromEntries(PERIODS.map((p) => [p.id, [p.goLearnAnalysis, p.defaultStatus]]));
    expect(analysed).toEqual({
      'he-bib': ['corpus', 'high-confidence'], 'he-mish': ['labels-only', 'provisional'], 'he-med': ['labels-only', 'provisional'], 'he-mod': ['tables', 'provisional'],
      'arc-bib': ['corpus', 'high-confidence'],
      'el-hom': ['tables', 'provisional'], 'el-att': ['tables', 'provisional'], 'el-koi': ['corpus', 'high-confidence'], 'el-med': ['labels-only', 'provisional'], 'el-mod': ['tables', 'provisional'],
    });
    expect(periodOf('he-bib').orthography).toBe('pointed-cantillated');
    expect(periodOf('he-mod').orthography).toBe('unpointed');
    expect(periodOf('el-att').orthography).toBe('polytonic');
    expect(periodOf('el-mod').orthography).toBe('monotonic');
  });
  it('measures distance within a language only and refuses unknown ids', () => {
    expect(periodDistance('el-hom', 'el-koi')).toBe(2);
    expect(periodDistance('he-bib', 'he-bib')).toBe(0);
    expect(periodDistance('he-bib', 'el-koi')).toBeUndefined();
    expect(() => periodOf('he-xyz')).toThrow(/not a period/);
    expect(isPeriod('el-med')).toBe(true);
    expect(isPeriod(undefined)).toBe(false);
    expect(DEFAULT_PERIOD).toEqual({ he: 'he-bib', arc: 'arc-bib', grc: 'el-koi', la: undefined });
  });
});

describe('profiles by period', () => {
  it('the default period is the stock profile; another period keeps the language and changes the variety, with the reader’s own sources', () => {
    expect(profileForPeriod('el-koi')).toEqual(GREEK);
    expect(profileForPeriod('he-bib')).toEqual(HEBREW);
    expect(ATTIC.id).toBe('grc');
    expect(ATTIC.label).toBe('Attic Greek');
    expect(ATTIC.repository).toEqual({ ...GREEK.repository, varietyId: 'el-att' });
    expect(ATTIC.analysis).toMatchObject({ status: 'provisional', analyzerId: 'ecclesia-reader' });
    expect(ATTIC.corpus.restrictions).toEqual({});
    expect(ATTIC.textId).toBe('READER');
    const rashi = profileForPeriod('he-med', { textId: 'RASHI-BERLINER', analysis: { label: 'Ecclesia analysis', licence: 'own', status: 'high-confidence', analyzerId: 'ecclesia-he' } });
    expect(rashi.repository).toEqual({ ...HEBREW.repository, varietyId: 'he-med' });
    expect(rashi.analysis.status).toBe('high-confidence');
    expect(periodOfProfile(rashi)?.id).toBe('he-med');
    expect(periodOfProfile(LATIN_FIXTURE.profile)).toBeUndefined();
  });
});

describe('identity is period-free', () => {
  it('a lexeme and a form have one id in every period of the language', () => {
    for (const id of ['el-hom', 'el-att', 'el-koi', 'el-med', 'el-mod']) {
      expect(lexemeId(profileForPeriod(id), 'λόγος', 'NOUN')).toBe(LOGOS);
      expect(formId(profileForPeriod(id), 'λόγος,')).toBe('form:el:λόγος');
    }
    const word = HEBREW_FIXTURE.passage.verses[0]!.tokens[0]!;
    const ids = ['he-bib', 'he-mish', 'he-med', 'he-mod'].map((id) => lexemeId(profileForPeriod(id), word.lemma, word.pos));
    expect(new Set(ids).size).toBe(1);
    expect(ids[0]).toMatch(/^lemma:he:/u);
    expect(parseLexemeId(LOGOS, 'el')).toEqual({ lemma: 'λόγος', pos: 'NOUN' });
    expect(parseLexemeId('form:el:λόγος', 'el')).toBeUndefined();
  });
  it('a card is therefore one card whichever period the word was met in', () => {
    const koine = contextualCard(GREEK, JOHN_1_1_18.verses[0]!.tokens[4]!, { ref: JOHN_1, verse: 1 });
    const attic = contextualCard(ATTIC, ATTIC_TOKENS[1]!, { ref: REPUBLIC, verse: 1 });
    expect(attic.cardId).toBe(koine.cardId);
    expect(attic.context.sourceRef).toMatchObject({ kind: 'ebook', locator: 'w:plato-republic.514.1', title: 'Republic' });
    expect(attic.context.sentenceKey).toBe('v:w:plato-republic.514.1');
  });
});

describe('the period belongs to the text', () => {
  const events = [
    ...mapEncounters([
      { kind: 'passage-viewed', encounterId: 'att:1', at: T(0), passage: REPUBLIC, verses: ATTIC_PASSAGE.verses },
    ], { profile: ATTIC, identity }),
    ...mapEncounters([
      { kind: 'passage-viewed', encounterId: 'koi:1', at: T(5), passage: JOHN_1, verses: passage(1, 1).verses },
      { kind: 'word-selected', encounterId: 'koi:2', at: T(6), passage: JOHN_1, verse: 1, token: JOHN_1_1_18.verses[0]!.tokens[4]! },
    ], { profile: GREEK, identity }),
  ].flatMap((m) => m.events);
  const scope = { learnerId: identity.learnerId, languageId: 'el' };

  it('every event carries the period of the passage read, under the one language', () => {
    for (const e of events) expect(validateEvent(e), e.id).toEqual([]);
    const attic = events[0]!;
    expect(attic.languageId).toBe('el');
    expect(attic.varietyId).toBe('el-att');
    expect(attic.payload).toMatchObject({ language: { languageId: 'el', varietyId: 'el-att', basis: 'book-metadata' } });
    expect(attic.subject).toMatchObject({ sentenceKey: 'v:w:plato-republic.514.1', sourceRef: { kind: 'ebook', locator: 'w:plato-republic.514.1', title: 'Republic' } });
    expect(attic.subject.itemIds).toContain(LOGOS);
    expect(events[1]!.varietyId).toBe('el-koi');
  });
  it('evidence is read per period without having been split', () => {
    const by = periodEvidence(events, scope).get(LOGOS)!;
    expect(Object.keys(by).sort()).toEqual(['el-att', 'el-koi']);
    expect(by['el-att']).toMatchObject({ encounters: 1, lookups: 0, firstAt: T(0) });
    expect(by['el-koi']).toMatchObject({ encounters: 1, lookups: 1, lastAt: T(6) });
    // pooled by default (the lexeme is one unit); period-scoped on request
    expect(knowledgeStandings(events, scope).get(LOGOS)!.encounters).toBe(3);
    expect(knowledgeStandings(events, scope, { varietyId: 'el-att' }).get(LOGOS)!.encounters).toBe(1);
    expect(knowledgeStandings(events, scope, { varietyId: 'el-koi' }).get(LOGOS)!.lookups).toBe(1);
    expect(knowledgeStandings(events, scope, { varietyId: 'el-hom' }).size).toBe(0);
    // ἄνθρωπος was met only in the Attic passage
    expect(Object.keys(periodEvidence(events, scope).get(lexemeOf('ἄνθρωπος', 'NOUN'))!)).toEqual(['el-att']);
  });
  it('events that state no period are filed as unstated (Latin)', () => {
    const la = LATIN_FIXTURE;
    const ev = mapEncounters([{ kind: 'passage-viewed', encounterId: 'la:1', at: T(0), passage: la.passage.ref, verses: la.passage.verses.slice(0, 1) }], { profile: la.profile, identity }).flatMap((m) => m.events);
    const first = [...periodEvidence(ev, { learnerId: identity.learnerId, languageId: 'la' }).values()][0]!;
    expect(Object.keys(first)).toEqual([UNSTATED_PERIOD]);
  });
  it('the places a word was met span Scripture and other works', () => {
    const places = contextsOf(LOGOS, events);
    expect(places).toEqual([
      expect.objectContaining({ book: 'JHN', chapter: 1, verse: 1 }),
      expect.objectContaining({ work: 'plato-republic', chapter: 514, verse: 1 }),
    ]);
  });
  it('a medieval Hebrew work is Hebrew of the period he-med, same lexemes as the Bible', () => {
    const word = HEBREW_FIXTURE.passage.verses[0]!.tokens[0]!;
    const [e] = mapEncounters([{ kind: 'word-selected', encounterId: 'rashi:1', at: T(0), passage: { work: 'rashi-genesis', title: 'Rashi on Genesis', chapter: 1, verse: 1 }, verse: 1, token: word }], { profile: profileForPeriod('he-med'), identity }).flatMap((m) => m.events);
    expect(validateEvent(e)).toEqual([]);
    expect(e!.languageId).toBe('he');
    expect(e!.varietyId).toBe('he-med');
    expect(e!.subject.itemIds).toContain(lexemeId(HEBREW, word.lemma, word.pos));
    expect(e!.subject.sourceRef).toMatchObject({ kind: 'ebook', locator: 'w:rashi-genesis.1.1' });
  });
  it('review under a period profile targets that period', () => {
    const s = composeSession({ profile: ATTIC, identity, events, now: T(10), random: () => 0.3 });
    expect(s.preferences).toMatchObject({ languageId: 'el', varietyId: 'el-att', includeListening: false });
  });
});

describe('references to works that are not Scripture', () => {
  it('have their own keys and a plain source reference; Scripture keeps its typed one', () => {
    expect(passageKey(REPUBLIC)).toBe('w:plato-republic.514.1-2');
    expect(verseKey(REPUBLIC, 2)).toBe('v:w:plato-republic.514.2');
    expect(sourceRefOf(ATTIC, REPUBLIC)).toEqual({ kind: 'ebook', locator: 'w:plato-republic.514.1-2', title: 'Republic', restrictions: {} });
    expect(sourceRefOf(GREEK, JOHN_1, 3)).toMatchObject({ kind: 'scripture', book: 'JHN', verse: 3 });
    expect(parseWorkLocator('w:plato-republic.514.1')).toEqual({ work: 'plato-republic', chapter: 514, verse: 1 });
    expect(parseWorkLocator('h:0123456789abcdef')).toBeUndefined();
    // a line of Homer beyond any verse number of Scripture
    expect(passageKey({ work: 'homer-iliad', chapter: 1, verse: 611 })).toBe('w:homer-iliad.1.611');
  });
  it('are validated', () => {
    expect(() => passageKey({ work: 'Plato Republic', chapter: 1, verse: 1 })).toThrow(/work id/);
    expect(() => passageKey({ work: 'x', chapter: 0, verse: 1 })).toThrow(/chapter/);
    expect(() => passageKey({ work: 'x', chapter: 1, verse: 100_001 })).toThrow(/verse/);
    expect(() => scriptureRef(ATTIC, REPUBLIC)).toThrow(/not a book of Scripture/);
    expect(() => passageKey({ book: 'JHN', chapter: 1, verse: 611 })).toThrow(/verse/);
  });
});

describe('spelling is not identity: linking a word across periods', () => {
  const POLYTONIC = lexemeId(GREEK, 'ἄνθρωπος', 'NOUN');
  const MONOTONIC = lexemeId(MODERN_GREEK, 'άνθρωπος', 'NOUN');
  const known = (id: string, level: UnitStanding['level'] = 'known'): Map<string, UnitStanding> => new Map([[id, { ...standingOrNew(new Map(), id), level, encounters: 5 }]]);
  const modern: PassageTokens = { language: 'grc', ref: { work: 'modern-commentary', chapter: 1, verse: 1 }, verses: [{ verse: 1, tokens: [{ index: 0, surface: 'άνθρωπος', lemma: 'άνθρωπος', pos: 'NOUN' }, { index: 1, surface: 'και', lemma: 'και', pos: 'CCONJ' }] }] };

  it('polytonic and monotonic spellings are two unit ids with one cross-period key', () => {
    expect(POLYTONIC).not.toBe(MONOTONIC);
    expect(crossPeriodKey('grc', 'ἄνθρωπος')).toBe('ανθρωποσ');
    expect(crossPeriodKey('grc', 'άνθρωπος')).toBe('ανθρωποσ');
    expect(crossPeriodKey('grc', 'Ἄνθρωπος,')).toBe('ανθρωποσ');
    expect(crossPeriodKey('grc', 'ᾠδή')).toBe('ωδη');
    expect(crossPeriodKey('grc', 'δι’')).toBe('δι');
    const word = HEBREW_FIXTURE.passage.verses[0]!.tokens[0]!; // pointed, with cantillation
    expect(crossPeriodKey('he', word.surface)).toBe('בראשית');
    expect(crossPeriodKey('he', 'בראשית')).toBe('בראשית');
    expect(crossPeriodKey('la', 'Jesvs')).toBe('iesus');
  });
  it('the familiarity estimate credits the link only when asked, and says how many tokens it credited', () => {
    const standings = known(POLYTONIC);
    const strict = passageFamiliarity({ profile: MODERN_GREEK, passage: modern, standings });
    expect(strict).toMatchObject({ tokens: 2, knownTokens: 0, creditedAcrossPeriods: 0 });
    expect(strict.policy.crossPeriodCredit).toBe(false);
    const linked = passageFamiliarity({ profile: MODERN_GREEK, passage: modern, standings, policy: { crossPeriodCredit: true } });
    expect(linked).toMatchObject({ tokens: 2, knownTokens: 1, creditedAcrossPeriods: 1, familiarity: 0.5 });
    expect(linked.notes.some((n) => /another period's spelling/.test(n))).toBe(true);
    expect(linked.unknownLexemes.map((u) => u.lemma)).toEqual(['και']);
  });
  it('the link respects part of speech and the policy level', () => {
    expect(passageFamiliarity({ profile: MODERN_GREEK, passage: modern, standings: known(lexemeId(GREEK, 'ἄνθρωπος', 'ADJ')), policy: { crossPeriodCredit: true } }).knownTokens).toBe(0);
    expect(passageFamiliarity({ profile: MODERN_GREEK, passage: modern, standings: known(POLYTONIC, 'recognized'), policy: { crossPeriodCredit: true } }).knownTokens).toBe(0);
    const index = crossPeriodIndex(GREEK, new Map([...known(POLYTONIC, 'seen'), ...known(MONOTONIC, 'familiar')]));
    expect(index.get('NOUN|ανθρωποσ')!.unitId).toBe(MONOTONIC); // the better-known spelling answers for the key
  });
});

describe('meanings that differ by period', () => {
  const lexicon = inMemoryLexicon([
    { lexemeId: LOGOS, lemma: 'λόγος', pos: 'NOUN', glosses: ['word', 'speech'], glossesByPeriod: { 'el-att': ['account', 'reason', 'argument'] }, periods: ['el-hom', 'el-att', 'el-koi', 'el-med', 'el-mod'], attribution: 'test lexicon' },
  ]);
  it('the facts give the glosses of the period asked for, else the general ones', async () => {
    const lexeme = lexicon.lexeme(LOGOS)!;
    expect(glossesFor(lexeme, 'el-att')).toEqual(['account', 'reason', 'argument']);
    expect(glossesFor(lexeme, 'el-koi')).toEqual(['word', 'speech']);
    expect(glossesFor(lexeme, undefined)).toEqual(['word', 'speech']);
    const koine = factsProviderFor(GREEK, lexicon);
    expect((await koine.factsFor(LOGOS, 'el'))!.glosses[0]).toBe('word');
    expect((await koine.factsFor(LOGOS, 'el', 'el-att'))!.glosses[0]).toBe('account'); // the learner's target period, as the planner passes it
    const attic = await factsProviderFor(ATTIC, lexicon).factsFor(LOGOS, 'el');
    expect(attic!.glosses[0]).toBe('account');
    expect(attic!.unit).toMatchObject({ unitId: LOGOS, varietyId: 'el-att', status: 'provisional' });
  });
});
