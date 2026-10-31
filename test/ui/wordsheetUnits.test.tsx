// @vitest-environment jsdom
/**
 * The word sheet and the reading text for contract v9: a lexical unit written as several words (steht … auf = aufstehen), the
 * parts of a compound with their linking element and head, a contraction, and an older spelling. Each line appears only when
 * the analysis carries its data; a word with none of it gets a sheet exactly as before.
 *
 * FAKES: the language adapter (only its `varieties` table, which makes the sheet "rich"), and the analysis rows, written by hand
 * as the German adapter and the importer will write them.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { LanguageAdapter, PersonalDifficulty, TokenAnalysis, UnitLink, Variety, WordPart } from '../../src/core';
import { buildFixtureText, ids } from '../../src/core';
import type { AppStore } from '../../src/core';
import { Reader } from '../../src/ui/reader/Reader';
import { PERSONAL_FACTOR_WORD, compoundHeadLine, partRole, partText, unitRoleText, unitStretches, unitText } from '../../src/ui/reader/assistance';
import { click, makeHarness, q, qa } from './harness';
import type { Harness, Mounted } from './harness';

let h: Harness;
let mounted: Mounted | undefined;
beforeEach(async () => { h = await makeHarness(); });
afterEach(async () => { await mounted?.unmount(); mounted = undefined; });

const DE = 'text:de:einheit';
const S0 = ids.sentence(DE, 0);
const S1 = ids.sentence(DE, 1);
const S2 = ids.sentence(DE, 2);

const VARIETIES: Record<string, Variety> = {
  'de-1901': { code: 'de-1901', label: 'spelling before 1996', kind: 'historical' },
  'de-pre1901': { code: 'de-pre1901', label: 'spelling before 1901', kind: 'historical' },
};
const adapter = { lang: 'de', name: 'fake-de', varieties: VARIETIES } as unknown as LanguageAdapter;
const wire = () => Object.assign(h.services, { adapters: { get: () => adapter, all: () => [adapter] } });

/**
 *  s0  Er steht früh auf .                    (steht … auf = aufstehen)
 *  s1  Die Lebensversicherung gilt vom Staat .  (a compound with a link; a contraction)
 *  s2  Er sagt daß es geht .                  (an older spelling)
 */
async function seed(store: AppStore) {
  await buildFixtureText(store, {
    lang: 'de', slug: 'einheit', title: 'Einheit',
    sentences: [
      { tokens: [
        { surface: 'Er', lemma: 'er', pos: 'PRON', gloss: 'he' },
        { surface: 'steht', lemma: 'aufstehen', pos: 'VERB', gloss: 'to get up' },
        { surface: 'früh', lemma: 'früh', pos: 'ADV', gloss: 'early' },
        { surface: 'auf', lemma: 'aufstehen', pos: 'VERB', gloss: 'to get up' },
        { surface: '.', isWord: false },
      ] },
      { tokens: [
        { surface: 'Die', lemma: 'die', pos: 'DET', gloss: 'the' },
        { surface: 'Lebensversicherung', lemma: 'Lebensversicherung', pos: 'NOUN', gloss: 'life insurance' },
        { surface: 'gilt', lemma: 'gelten', pos: 'VERB', gloss: 'to be valid' },
        { surface: 'vom', lemma: 'von', pos: 'ADP', gloss: 'from the' },
        { surface: 'Staat', lemma: 'Staat', pos: 'NOUN', gloss: 'state' },
        { surface: '.', isWord: false },
      ] },
      { tokens: [
        { surface: 'Er', lemma: 'er', pos: 'PRON', gloss: 'he' },
        { surface: 'sagt', lemma: 'sagen', pos: 'VERB', gloss: 'to say' },
        { surface: 'daß', lemma: 'dass', pos: 'SCONJ', gloss: 'that' },
        { surface: 'es', lemma: 'es', pos: 'PRON', gloss: 'it' },
        { surface: 'geht', lemma: 'gehen', pos: 'VERB', gloss: 'to go' },
        { surface: '.', isWord: false },
      ] },
    ],
  });
}
async function patch(store: AppStore, sentenceId: string, index: number, p: Partial<TokenAnalysis>) {
  const row = (await store.analyses.where('tokenId', ids.token(sentenceId, index)))[0];
  await store.analyses.put({ ...row, ...p });
}
async function linkUnit(store: AppStore) {
  const head = ids.token(S0, 1);
  const piece = ids.token(S0, 3);
  const link = (role: string): UnitLink => ({ headTokenId: head, pieceTokenIds: [head, piece], role, display: 'aufstehen' });
  await patch(store, S0, 1, { unit: link('head') });
  await patch(store, S0, 3, { unit: link('separable prefix') });
}

const open = async () => { mounted = await h.mount(<Reader textId={DE} mode="corpus" />); };
const tok = (surface: string) => qa<HTMLButtonElement>(mounted!.container, 'button.tok').find((b) => b.textContent === surface)!;
const t = (testid: string) => q(mounted!.container, `[data-testid="${testid}"]`)?.textContent;
const marked = () => qa<HTMLButtonElement>(mounted!.container, 'button.tok.unit-piece').map((b) => b.textContent);

describe('a lexical unit written as several words', () => {
  beforeEach(async () => { await seed(h.store); await linkUnit(h.store); wire(); });

  it('the sheet of the stranded prefix shows the unit, this word\'s part in it, and the unit\'s meaning and lemma', async () => {
    await open();
    expect(q(mounted!.container, '[data-testid="word-unit"]')).toBeNull();
    await click(tok('auf'));
    expect(t('word-unit')).toBe('steht … auf = aufstehen — this word is the separable prefix');
    expect(q(mounted!.container, '.card__gloss')?.textContent).toBe('to get up');
    expect(q(mounted!.container, '.panel')?.textContent).toContain('aufstehen'); // the lemma line
    expect(qa(mounted!.container, '.card__line').some((l) => l.textContent?.startsWith('Lemmaaufstehen'))).toBe(true);
    expect(qa(mounted!.container, '.card__line').some((l) => l.textContent?.includes('to get up'))).toBe(true);
  });

  it('the head says it is the main part', async () => {
    await open();
    await click(tok('steht'));
    expect(t('word-unit')).toBe('steht … auf = aufstehen — this word is the main part');
    expect(t('unit-role')).toBe('this word is the main part');
  });

  it('while the sheet of ANY piece is open every piece is marked, with a class and a label (not colour alone); nothing else is', async () => {
    await open();
    expect(marked()).toEqual([]);
    await click(tok('auf'));
    expect(marked()).toEqual(['steht', 'auf']);
    for (const b of qa<HTMLButtonElement>(mounted!.container, 'button.tok.unit-piece')) {
      expect(b.getAttribute('aria-describedby')).toBe('unit-label');
      expect(b.getAttribute('data-unit-piece')).toBe('true');
    }
    expect(q(mounted!.container, '#unit-label')?.textContent).toBe('Part of a word written in pieces: steht … auf = aufstehen');
    expect(q(mounted!.container, '#unit-label')?.className).toContain('sr-only');
    expect(tok('früh').getAttribute('aria-describedby')).toBeNull();
    // the head's own sheet marks the same pieces
    await click(tok('steht'));
    expect(marked()).toEqual(['steht', 'auf']);
  });

  it('the marks go with the sheet, and a word that is no piece of a unit marks nothing and shows no unit line', async () => {
    await open();
    await click(tok('auf'));
    await click(q(mounted!.container, '[aria-label="Close word help"]'));
    expect(marked()).toEqual([]);
    expect(q(mounted!.container, '#unit-label')).toBeNull();
    await click(tok('früh'));
    expect(marked()).toEqual([]);
    expect(q(mounted!.container, '[data-testid="word-unit"]')).toBeNull();
    expect(q(mounted!.container, '#unit-label')).toBeNull();
  });

  it('the pieces\' own words stay in the text as written: the unit adds marks, never a rewrite', async () => {
    await open();
    const before = q(mounted!.container, `[data-sentence-id="${S0}"] .sent-text`)!.textContent;
    await click(tok('auf'));
    expect(q(mounted!.container, `[data-sentence-id="${S0}"] .sent-text`)!.textContent).toBe(before);
    expect(before).toBe('Er steht früh auf.');
  });
});

describe('the parts of a written word', () => {
  beforeEach(async () => { await seed(h.store); wire(); });

  const compound: WordPart[] = [
    { text: 'Leben', start: 0, end: 5, lemma: 'Leben', pos: 'NOUN', kind: 'component', role: 'component' },
    { text: 's', start: 5, end: 6, kind: 'link', role: 'linking element' },
    { text: 'Versicherung', start: 6, end: 18, lemma: 'Versicherung', pos: 'NOUN', kind: 'head', role: 'head' },
  ];

  it('a linking element is shown as such, and the head of the compound is named', async () => {
    await patch(h.store, S1, 1, { parts: compound });
    await open();
    await click(tok('Lebensversicherung'));
    expect(t('word-parts')).toBe('Lebensversicherung = Leben + -s- + Versicherung');
    expect(t('compound-head')).toBe('Versicherung is the head: the last part decides the gender and the kind of thing.');
  });

  it('a link written with its hyphens is not hyphenated twice', () => {
    expect(partText({ text: '-s-', kind: 'link' })).toBe('-s-');
    expect(partText({ text: 's', kind: 'link' })).toBe('-s-');
    expect(partText({ text: 'Leben', kind: 'component' })).toBe('Leben');
    // a part that names its word is shown as that word, not as the letters it occupies (found in the browser audit)
    expect(partText({ text: 'aufgaben', kind: 'head', lemma: 'Aufgabe' })).toBe('Aufgabe');
    expect(partText({ text: 'Töpf', kind: 'stem', lemma: 'Topf' })).toBe('Topf');
    expect(partText({ text: 'Harems', kind: 'component' })).toBe('Harems'); // no word is claimed for it: as written
    expect(partText({ text: 'ge', kind: 'marker', lemma: 'ge' })).toBe('ge');
    expect(partText({ text: 'lo', kind: 'clitic', lemma: 'él' })).toBe('lo'); // an attached pronoun stays as written
    expect(compoundHeadLine([{ text: 'Haus', kind: 'component', lemma: 'Haus' }, { text: 'aufgaben', kind: 'head', lemma: 'Aufgabe' }])).toBe('Aufgabe is the head: the last part decides the gender and the kind of thing.');
    expect(compoundHeadLine([{ text: 'Haus', kind: 'head' }, { text: 'tür', kind: 'component' }])).toBe('Haus is the head: it decides the gender and the kind of thing.');
    expect(compoundHeadLine([{ text: 'im', kind: 'contracted' }, { text: 'in', kind: 'contracted' }])).toBeUndefined();
  });

  it('a contraction reads "vom = von + dem" and names no head', async () => {
    await patch(h.store, S1, 3, { parts: [
      { text: 'von', start: 0, end: 3, lemma: 'von', pos: 'ADP', kind: 'contracted', role: 'preposition' },
      { text: 'dem', start: 3, end: 5, lemma: 'der', pos: 'DET', kind: 'contracted', role: 'article' },
    ] });
    await open();
    await click(tok('vom'));
    expect(t('word-parts')).toBe('vom = von + dem');
    expect(t('compound-head')).toBeUndefined();
  });

  it('parts with no kind read exactly as before, role in parentheses', async () => {
    await patch(h.store, S1, 1, { parts: [
      { text: 'Leben', start: 0, end: 5, role: 'first part' }, { text: 'Versicherung', start: 5, end: 17, role: 'second part' },
    ] });
    await open();
    await click(tok('Lebensversicherung'));
    expect(t('word-parts')).toBe('Lebensversicherung = Leben (first part) + Versicherung (second part)');
    expect(t('compound-head')).toBeUndefined();
  });

  it('a prefix or a marker keeps its plain-words role; a clitic too', () => {
    expect(partRole({ kind: 'prefix', role: 'separable prefix' })).toBe('separable prefix');
    expect(partRole({ kind: 'marker', role: 'inserted zu' })).toBe('inserted zu');
    expect(partRole({ kind: 'component', role: 'component' })).toBeUndefined();
    expect(partRole({ kind: 'head' })).toBeUndefined();
    expect(partRole({ role: 'indirect object pronoun' })).toBe('indirect object pronoun');
  });

  it('a word with a single part, or none, shows no line at all', async () => {
    await patch(h.store, S1, 1, { parts: [compound[0]] });
    await open();
    await click(tok('Lebensversicherung'));
    expect(t('word-parts')).toBeUndefined();
    expect(t('compound-head')).toBeUndefined();
  });
});

describe('an older spelling', () => {
  beforeEach(async () => { await seed(h.store); wire(); });

  it('shows today\'s spelling and the period\'s label from the adapter\'s table', async () => {
    await patch(h.store, S2, 2, { orthography: { modern: 'dass', period: 'de-1901', confidence: 0.95 } });
    await open();
    await click(tok('daß'));
    expect(t('older-spelling')).toBe('today: dass — spelling before 1996');
  });

  it('never both lines: the adapter\'s statement wins over the plain `notes.modern` aid', async () => {
    await patch(h.store, S2, 2, { orthography: { modern: 'dass', period: 'de-1901', confidence: 0.95 }, notes: { modern: 'dass' } });
    await open();
    await click(tok('daß'));
    expect(t('older-spelling')).toBe('today: dass — spelling before 1996');
    expect(t('modern-form')).toBeUndefined();
  });

  it('an analysis that only has the note keeps its modern-form line, and no older-spelling line', async () => {
    await patch(h.store, S2, 2, { notes: { modern: 'dass' } });
    await open();
    await click(tok('daß'));
    expect(t('modern-form')).toBe('today: dass');
    expect(t('older-spelling')).toBeUndefined();
  });

  it('a period the table does not know says today\'s spelling and nothing about the period (it never guesses)', async () => {
    await patch(h.store, S2, 2, { orthography: { modern: 'dass', period: 'de-unknown', confidence: 0.6 } });
    await open();
    await click(tok('daß'));
    expect(t('older-spelling')).toBe('today: dass');
  });
});

describe('a quiet sheet', () => {
  it('a word with none of it has none of the new lines, and nothing in the text is marked', async () => {
    await seed(h.store);
    wire();
    await open();
    await click(tok('gilt'));
    for (const id of ['word-unit', 'unit-role', 'word-parts', 'compound-head', 'older-spelling', 'modern-form']) expect(t(id), id).toBeUndefined();
    expect(marked()).toEqual([]);
    expect(q(mounted!.container, '#unit-label')).toBeNull();
    expect(qa(mounted!.container, '[data-unit-piece]')).toEqual([]);
  });
});

describe('words for the new factors', () => {
  it('every factor key of the contract has its plain words', () => {
    const keys: Array<PersonalDifficulty['factors'][number]['key']> = [
      'lexical-coverage', 'new-words', 'phrases', 'constructions', 'sentence-length', 'clause-depth', 'subjunctive', 'clitics',
      'regional', 'historical', 'proper-names', 'domain', 'author', 'unanalysed',
      'compounds', 'verb-bracket', 'genitive', 'passive', 'relative-clauses', 'participial-modifiers', 'nominalizations', 'older-spelling',
    ];
    for (const k of keys) expect(PERSONAL_FACTOR_WORD[k], k).toBeTruthy();
  });

  it('unit lines are built from the pieces in text order', () => {
    expect(unitText(['steht', 'auf'], 'aufstehen')).toBe('steht … auf = aufstehen');
    expect(unitText([], 'aufstehen')).toBe('aufstehen');
    expect(unitText(['aufstehen'], 'aufstehen')).toBe('aufstehen');
    // neighbours read as written; only separated pieces get the dots
    expect(unitStretches([{ surface: 'steht', at: 1 }, { surface: 'auf', at: 6 }])).toEqual(['steht', 'auf']);
    expect(unitStretches([{ surface: 'të', at: 2 }, { surface: 'mira', at: 3 }])).toEqual(['të mira']);
    expect(unitText(['të mira'], 'i mirë')).toBe('të mira = i mirë');
    expect(unitText(['i mirë'], 'i mirë')).toBe('i mirë');
    expect(unitStretches([{ surface: 'hat', at: 0 }, { surface: 'an', at: 4 }, { surface: 'gefangen', at: 5 }])).toEqual(['hat', 'an gefangen']);
    expect(unitRoleText('head')).toBe('this word is the main part');
    expect(unitRoleText('separable-prefix')).toBe('this word is the separable prefix');
  });
});
