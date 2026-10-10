// @vitest-environment jsdom
/** The All forms section (Linguistic Engine V2): the selected cell is the one the adapter projected, and a script without spaces shows its cuts. */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createCardUI, type CardUI } from '../../packages/golearn-extension/src/popup/card';
import { parseSelection, type CardModel } from '../../packages/golearn-extension/src/parser';
import type { PopupAnchor } from '../../packages/golearn-extension/src/contract/readerAdapter';
import { featureKey, type Paradigm, type ParadigmCell } from '../../src/core/paradigm';
import { setBody, stubLayout } from './dom';

const anchor: PopupAnchor = { rect: { top: 100, left: 50, right: 110, bottom: 120, width: 60, height: 20 }, viewport: { width: 1024, height: 768 }, rtl: false, source: 'range' };
const cardFor = (sel = 'shtëpinë', sentence = 'Unë po lexoj një libër të bukur në shtëpinë time.'): CardModel => {
  const at = sentence.indexOf(sel);
  return parseSelection({ surface: sel, context: { kind: 'sentence', confidence: 0.9, sentence, selStart: at, selEnd: at + sel.length } });
};
const cell = (form: string, features: Record<string, string>, status: ParadigmCell['status'] = 'verified'): ParadigmCell => ({ form, features, sources: ['generated', 'wiktionary'], status });
const PARADIGM: Paradigm = {
  languageId: 'sq', lemma: 'shtëpi', pos: 'NOUN', kind: 'noun-declension', status: 'verified', notes: [], sources: [{ id: 'adapter-sq@1', label: 'Albanian analyser' }],
  layout: { columns: { key: 'Definite', values: [['Ind', 'indefinite'], ['Def', 'definite']] }, rows: { key: 'Number', values: [['Sing', 'singular'], ['Plur', 'plural']] }, sections: ['Case'], labels: { Case: { Nom: 'nominative', Acc: 'accusative' } } },
  cells: [
    cell('shtëpi', { Case: 'Nom', Definite: 'Ind', Number: 'Sing' }), cell('shtëpia', { Case: 'Nom', Definite: 'Def', Number: 'Sing' }),
    cell('shtëpi', { Case: 'Acc', Definite: 'Ind', Number: 'Sing' }), cell('shtëpinë', { Case: 'Acc', Definite: 'Def', Number: 'Sing' }),
    cell('shtëpi', { Case: 'Nom', Definite: 'Ind', Number: 'Plur' }), cell('shtëpitë', { Case: 'Nom', Definite: 'Def', Number: 'Plur' }),
  ],
};

let restore: () => void;
let ui: CardUI;
beforeEach(() => { restore = stubLayout(); setBody('<p id="p">Unë po lexoj një libër të bukur në shtëpinë time.</p>'); ui = createCardUI({ doc: document, speech: null, onDismiss: () => {}, makeUtterance: (text, voice) => ({ text, voice }) }); });
afterEach(() => { ui.destroy(); restore(); });

describe('All forms', () => {
  it('marks the cells the adapter projected (enrichment.selected), not a guess from the surface', () => {
    ui.show(cardFor(), anchor);
    ui.update({ enrichment: { state: 'ready', paradigm: PARADIGM, selected: [featureKey({ Case: 'Acc', Definite: 'Def', Number: 'Sing' })] } });
    const sel = [...ui.root()!.querySelectorAll('td.pcell.sel')];
    expect(sel.map((x) => (x as HTMLElement).querySelector('span')!.textContent)).toEqual(['shtëpinë']);
    expect(ui.root()!.querySelectorAll('table.paradigm').length).toBe(2); // one table per case section
  });
  it('places a cell that carries a feature the layout has no axis for (a noun\'s Gender) in its slot, not under Other forms', () => {
    const withGender: Paradigm = { ...PARADIGM, cells: PARADIGM.cells.map((c) => ({ ...c, features: { ...c.features, Gender: 'Fem' } })) };
    ui.show(cardFor(), anchor);
    ui.update({ enrichment: { state: 'ready', paradigm: withGender, selected: [featureKey({ Case: 'Acc', Definite: 'Def', Number: 'Sing', Gender: 'Fem' })] } });
    const root = ui.root()!;
    expect([...root.querySelectorAll('td.pcell')].filter((x) => !x.classList.contains('none')).length).toBe(6);
    expect([...root.querySelectorAll('td.pcell.sel')].map((x) => (x as HTMLElement).querySelector('span')!.textContent)).toEqual(['shtëpinë']);
    expect(root.textContent).not.toContain('Other forms');
  });
  it('without a projection falls back to the reading features, then the surface', () => {
    ui.show(cardFor(), anchor);
    ui.update({ enrichment: { state: 'ready', paradigm: PARADIGM } });
    const sel = [...ui.root()!.querySelectorAll('td.pcell.sel')].map((x) => (x as HTMLElement).querySelector('span')!.textContent);
    expect(sel).toContain('shtëpinë');
  });
  it('shows the cuts of a selection in a script without spaces, with the unknown pieces marked', () => {
    ui.show(cardFor(), anchor);
    ui.update({ enrichment: { state: 'ready', segmentations: { text: 'ตากลม', chosen: { words: [{ text: 'ตา', known: true, gloss: 'eye' }, { text: 'กลม', known: true, gloss: 'round' }], confidence: 0.6, basis: 'tokenizer' }, alternatives: [{ words: [{ text: 'ตาก', known: true }, { text: 'ลม', known: false }], confidence: 0.4, basis: 'word-list' }] } } });
    const t = ui.root()!.textContent ?? '';
    expect(t).toContain('How this selection cuts into words');
    expect(t).toContain('ตา (eye) | กลม (round) — 60% (tokenizer)');
    expect(t).toContain('ตาก | ลม? — 40% (word-list)');
    expect(t).toContain('a ? marks a piece the word list does not hold');
  });
});
