// @vitest-environment jsdom
/**
 * PERFORMANCE audit, lane 3 of 3 (docs/ecosystem/audit/PERFORMANCE.md): the lookup card, in jsdom.
 *   PF-M07..M09   time to first useful linguistic response = parseSelection + the 5-layer card build (`createCardUI().show`)
 *                 for one word, a 4-word phrase and a 40-word sentence; PF-M16..M17 layer toggles and the late gloss `update`.
 * jsdom has no layout, no paint and no CSS engine: what is timed is the JavaScript that builds and fills the DOM. Browser
 * start-up of the content script, shadow-root style application, layout and paint are "measured separately in the browser walk".
 */
import { describe, expect, it } from 'vitest';
import { parseSelection } from '../../packages/golearn-extension/src/parser';
import { createCardUI } from '../../packages/golearn-extension/src/popup/card';
import type { PopupAnchor } from '../../packages/golearn-extension/src/contract/readerAdapter';
import { PHRASE_4, SENTENCE, SENTENCE_40, WORD, flushRowsAfterAll, now, record } from './perf.support';

flushRowsAfterAll('perf.card', 'PERFORMANCE lane 3 (card build, jsdom)');

const anchor: PopupAnchor = { rect: { top: 100, left: 50, right: 110, bottom: 120, width: 60, height: 20, x: 50, y: 100 } as never, viewport: { width: 1280, height: 800 }, rtl: false, source: 'range' };
const ctxOf = (sentence: string, surface: string) => { const at = sentence.indexOf(surface); return { kind: 'sentence' as const, confidence: 0.9, sentence, selStart: at, selEnd: at + surface.length }; };

const CASES: Array<[string, string, string, string, string]> = [
  ['PF-M07', 'one word "librin"', WORD, SENTENCE, 'M07'],
  ['PF-M08', '4-word phrase', PHRASE_4, SENTENCE, 'M08'],
  ['PF-M09', '40-word sentence', SENTENCE_40, SENTENCE_40, 'M09'],
];

describe('the lookup card in jsdom', () => {
  it.each(CASES)('%s: parse + card build for %s', (id, label, surface, sentence) => {
    document.body.innerHTML = '<main><p id="passage">x</p></main>';
    const ui = createCardUI({ doc: document, speech: null });
    const view = { languageName: 'Albanian', depth: 'brief' as const };
    const parseT: number[] = [];
    const showT: number[] = [];
    const bothT: number[] = [];
    for (let i = -5; i < 50; i++) {
      const t0 = now();
      const card = parseSelection({ surface, context: ctxOf(sentence, surface) });
      const t1 = now();
      ui.show(card, anchor, { view });
      const t2 = now();
      ui.dismiss('close');
      if (i >= 0) { parseT.push(t1 - t0); showT.push(t2 - t1); bothT.push(t2 - t0); }
    }
    record(id, `time to first useful response: parse + 5-layer card build, ${label}`, 'parseSelection + createCardUI().show (rows, 4 layer panels, pronounce note, correction form), jsdom, warm, N=50', bothT,
      `parse median ${median(parseT).toFixed(2)} ms, card build median ${median(showT).toFixed(2)} ms; jsdom: no layout/paint`);
    expect(median(bothT)).toBeLessThan(1000);
  });

  it('PF-M16: the dictionary gloss arriving late (ui.update) and opening each layer', () => {
    document.body.innerHTML = '<main></main>';
    const ui = createCardUI({ doc: document, speech: null });
    const card = parseSelection({ surface: WORD, context: ctxOf(SENTENCE, WORD) });
    const updateT: number[] = [];
    const toggleT: number[] = [];
    for (let i = -3; i < 30; i++) {
      ui.show(card, anchor, { view: { languageName: 'Albanian', depth: 'brief' } });
      const t0 = now();
      ui.update({ gloss: { state: 'ready', senses: ['book', 'volume'], attribution: 'Wiktionary, via kaikki.org, CC BY-SA 4.0' } });
      const t1 = now();
      for (const layer of ['l2', 'l3', 'l4', 'l5']) (ui.root()!.querySelector(`button.${layer}`) as HTMLElement).click();
      const t2 = now();
      ui.dismiss('close');
      if (i >= 0) { updateT.push(t1 - t0); toggleT.push((t2 - t1) / 4); }
    }
    record('PF-M16', 'late gloss: ui.update({ gloss }) re-render', 'rows + panels re-filled, jsdom, N=30', updateT);
    record('PF-M17', 'open one layer (button click → panel shown, reposition)', 'mean of 4 layer clicks per card, jsdom, N=30 cards', toggleT);
    expect(median(updateT)).toBeLessThan(1000);
  });
});

function median(xs: number[]): number { const s = [...xs].sort((a, b) => a - b); return s.length % 2 ? s[s.length >> 1] : (s[(s.length >> 1) - 1] + s[s.length >> 1]) / 2; }
