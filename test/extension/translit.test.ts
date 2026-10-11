// @vitest-environment jsdom
/**
 * Transliteration on the card (2026-10-11): the adapter's rule-based romanization (Hindi, Thai) under the word, the lemma's on the lemma
 * line, the dictionary's romanization of the lemma (Level 2) when the adapter has none, the dictionary's per-form romanization in All forms,
 * and a romanization after each word of the sentence list. Nothing is shown, and no empty line is drawn, for a Latin-script language or
 * when neither source has one: a romanization is never invented.
 */
import { afterAll, beforeEach, afterEach, describe, expect, it } from 'vitest';
import { hiAdapter } from '../../src/adapters/hi';
import { thAdapter } from '../../src/adapters/th';
import { clearAnalysers, parseSelection, registerAnalyser } from '../../packages/golearn-extension/src/parser';
import { createCardUI, type CardUI } from '../../packages/golearn-extension/src/popup/card';
import type { PopupAnchor } from '../../packages/golearn-extension/src/contract/readerAdapter';
import { featureKey, type Paradigm } from '../../src/core/paradigm';
import { setBody, stubLayout } from './dom';

const anchor: PopupAnchor = { rect: { top: 100, left: 50, right: 110, bottom: 120, width: 60, height: 20 }, viewport: { width: 1024, height: 768 }, rtl: false, source: 'range' };
const pick = (languageId: string, sentence: string, surface: string) => {
  const at = sentence.indexOf(surface);
  return parseSelection({ surface, context: { kind: 'sentence', confidence: 0.9, sentence, selStart: at, selEnd: at + surface.length }, languageId });
};

let restore: () => void;
let ui: CardUI;
beforeEach(() => { restore = stubLayout(); setBody('<p id="p">x</p>'); clearAnalysers(['sq']); registerAnalyser('hi', hiAdapter); registerAnalyser('th', thAdapter); ui = createCardUI({ doc: document, speech: null }); });
afterEach(() => { ui.destroy(); restore(); });
afterAll(() => clearAnalysers(['sq']));
const root = (): ShadowRoot => ui.root()!;
const line = (): HTMLElement | null => root().querySelector('.wordTranslit');

describe('the parser puts the adapter\'s romanization on the card', () => {
  it('Hindi "जाता" in "मैं घर जाता हूँ": a non-empty Latin romanization of the word', () => {
    const c = pick('hi', 'मैं घर जाता हूँ', 'जाता');
    expect(c.languageId).toBe('hi');
    expect(c.transliteration).toBeTruthy();
    expect(c.transliteration).toMatch(/^[\p{Script=Latin}\p{M}'’ -]+$/u);
    expect(c.transliteration!.toLowerCase()).toContain('j');
  });

  it('Thai "กิน" in "ฉันกินข้าว": a romanization when the syllable decoder is sure and does not contradict the course romanization', () => {
    const c = pick('th', 'ฉันกินข้าว', 'กิน');
    expect(c.languageId).toBe('th');
    expect(c.transliteration, 'Thai gives one here').toBeTruthy();
    expect(c.transliteration).toMatch(/^[\p{Script=Latin}\p{M}'’ -]+$/u);
  });

  it('the lemma\'s romanization is given only when the lemma is a different word the adapter can romanize on its own', () => {
    const c = pick('hi', 'मैं घर जाता हूँ', 'जाता');
    if (c.lemma && c.lemma !== c.surface) expect(c.lemmaTransliteration, `lemma ${c.lemma}`).toBeTruthy();
    else expect(c.lemmaTransliteration).toBeUndefined();
    if (c.lemmaTransliteration) expect(c.lemmaTransliteration).not.toBe(c.transliteration);
  });

  it('an Albanian word has no transliteration, nor a lemma transliteration, nor one in its sentence list', () => {
    // (Albanian stays registered)
    const c = pick('sq', 'Unë po lexoj një libër të bukur në shtëpinë time.', 'shtëpinë');
    expect(c.transliteration).toBeUndefined();
    expect(c.lemmaTransliteration).toBeUndefined();
    expect(c.sentenceWords.length).toBeGreaterThan(0);
    expect(c.sentenceWords.some((w) => w.transliteration)).toBe(false);
  });

  it('a sentence list carries a romanization for each Hindi and Thai word the adapter is sure of', () => {
    const hi = pick('hi', 'मैं घर जाता हूँ', 'जाता');
    expect(hi.sentenceWords.length).toBeGreaterThan(2);
    expect(hi.sentenceWords.filter((w) => w.transliteration).length).toBeGreaterThan(1);
    const th = pick('th', 'ฉันกินข้าว', 'กิน');
    expect(th.sentenceWords.some((w) => w.transliteration)).toBe(true);
  });
});

describe('the card shows it', () => {
  it('a muted italic line under the word, named "transliteration", with no lang attribute; a Latin-script word has no such line, not even an empty one', () => {
    const c = pick('hi', 'मैं घर जाता हूँ', 'जाता');
    ui.show(c, anchor);
    const l = line()!;
    expect(l).toBeTruthy();
    expect(l.textContent).toBe(c.transliteration);
    expect(l.getAttribute('aria-label')).toBe('transliteration');
    expect(l.hasAttribute('lang')).toBe(false);
    expect(l.title).toMatch(/analyser/);
    // directly under the word, above the meaning
    expect(root().querySelector('.wordline')!.nextElementSibling).toBe(root().querySelector('.rows'));
    expect(root().querySelector('.rows')!.firstElementChild).toBe(l);
    setBody('<p>x</p>');
    const sq = pick('sq', 'Unë po lexoj një libër të bukur në shtëpinë time.', 'shtëpinë');
    ui.show(sq, anchor);
    expect(line()).toBeNull();
    expect(root().querySelector('.translit')).toBeNull();
  });

  it('the lemma line carries the lemma\'s romanization in the same muted style, after the lemma', () => {
    const c = { ...pick('hi', 'मैं घर जाता हूँ', 'जाता'), lemma: 'जाना', lemmaTransliteration: 'jānā' };
    ui.show(c, anchor);
    const lemma = root().querySelector('.lemmaLine')!;
    const rom = lemma.querySelector('.translit')!;
    expect(rom.textContent).toBe('jānā');
    expect(rom.getAttribute('aria-label')).toBe('lemma transliteration');
    expect(lemma.querySelector('.lv')!.compareDocumentPosition(rom) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('with no adapter romanization, the dictionary\'s romanization of the lemma fills the lemma line when the reply arrives, its source in the title', () => {
    const base = pick('hi', 'मैं घर जाता हूँ', 'जाता');
    const c = { ...base, transliteration: undefined, lemmaTransliteration: undefined, lemma: 'जाना' };
    ui.show(c, anchor);
    expect(root().querySelector('.lemmaLine .translit')).toBeNull();
    expect(line()).toBeNull();
    ui.update({ enrichment: { state: 'ready', pronunciation: { status: 'supported-by-source', ipa: [], recordings: [], notes: [], romanization: 'jānā' } } });
    const rom = root().querySelector('.lemmaLine .translit')!;
    expect(rom.textContent).toBe('jānā');
    expect(rom.getAttribute('title')).toBe('Wiktionary romanization');
    expect(line()).toBeNull(); // the word is not its lemma: the dictionary's romanization is the lemma's, not the form's
  });

  it('when the lemma is the word itself, the dictionary\'s romanization goes under the word', () => {
    const base = pick('hi', 'मैं घर जाता हूँ', 'घर');
    const c = { ...base, transliteration: undefined, lemmaTransliteration: undefined, lemma: 'घर' };
    ui.show(c, anchor);
    expect(line()).toBeNull();
    ui.update({ enrichment: { state: 'ready', pronunciation: { status: 'supported-by-source', ipa: [], recordings: [], notes: [], romanization: 'ghar' } } });
    expect(line()!.textContent).toBe('ghar');
    expect(line()!.title).toBe('Wiktionary romanization');
  });

  it('All forms: a cell whose dictionary row carries a romanization shows it under the form, muted; the other cells keep their layout', () => {
    const c = pick('hi', 'मैं घर जाता हूँ', 'घर');
    const cell = (form: string, features: Record<string, string>) => ({ form, features, sources: ['wiktionary' as const], status: 'supported' as const });
    const paradigm: Paradigm = {
      languageId: 'hi', lemma: 'घर', pos: 'NOUN', kind: 'noun-declension', status: 'supported', notes: [], sources: [{ id: 'w', label: 'Wiktionary' }],
      layout: { columns: { key: 'Number', values: [['Sing', 'singular'], ['Plur', 'plural']] }, rows: { key: 'Case', values: [['Nom', 'direct'], ['Obl', 'oblique']] } },
      cells: [cell('घर', { Case: 'Nom', Number: 'Sing' }), cell('घर', { Case: 'Nom', Number: 'Plur' }), cell('घरों', { Case: 'Obl', Number: 'Plur' })],
    };
    ui.show(c, anchor);
    ui.update({ enrichment: { state: 'ready', paradigm, selected: [featureKey({ Case: 'Nom', Number: 'Sing' })], formRoman: { 'घर': 'ghar', 'घरों': 'gharõ' } } });
    const cells = [...root().querySelectorAll('td.pcell:not(.none)')];
    expect(cells.map((td) => td.querySelector('.rom')?.textContent)).toEqual(['ghar', 'ghar', 'gharõ']);
    expect(root().querySelectorAll('td.pcell.none').length).toBe(1); // the empty slot keeps its dash
    // no romanization on the row: no extra element
    ui.update({ enrichment: { state: 'ready', paradigm, formRoman: {} } });
    expect(root().querySelectorAll('td.pcell .rom').length).toBe(0);
  });

  it('the sentence list gives the romanization in parentheses after each word the adapter is sure of, and nothing after the others', () => {
    const c = pick('hi', 'मैं घर जाता हूँ', 'जाता');
    ui.show(c, anchor);
    const items = [...root().querySelectorAll('.layer.l5 li')];
    expect(items.length).toBe(c.sentenceWords.length);
    for (const [i, li] of items.entries()) {
      const w = c.sentenceWords[i];
      const rom = li.querySelector('.sentenceRom');
      if (w.transliteration) { expect(rom!.textContent).toBe(` (${w.transliteration})`); expect(li.firstElementChild!.nextElementSibling).toBe(rom); }
      else expect(rom).toBeNull();
    }
    expect(items.some((li) => li.querySelector('.sentenceRom'))).toBe(true);
  });
});

describe('the dictionary rows', () => {
  it('formRomanOf reads the romanization of each form row of a table (`r`), once per form, and ignores rows without one', async () => {
    const { formRomanOf } = await import('../../packages/golearn-extension/src/content/enrich');
    expect(formRomanOf({ w: 'घर', p: 'NOUN', f: [{ f: 'घर', t: ['direct', 'singular'], r: 'ghar' }, { f: 'घर', t: ['direct', 'plural'], r: 'other' }, { f: 'घरों', t: ['oblique', 'plural'], r: 'gharõ' }, { f: 'घरों में', t: [] }] })).toEqual({ 'घर': 'ghar', 'घरों': 'gharõ' });
    expect(formRomanOf(undefined)).toEqual({});
  });
});
