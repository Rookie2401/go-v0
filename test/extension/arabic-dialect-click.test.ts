// @vitest-environment jsdom
/**
 * A click on a word of an Egyptian line must show the dialect message and no reading at 0.5 or above. This drives the parser the way the content script
 * does (parseSelection with the sentence around the click), with the real adapter, the compiled core and the shards the loader would fetch.
 */
import fs from 'node:fs';
import path from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { arAdapter } from '../../src/adapters/ar';
import { createArabicShardLoader } from '../../src/adapters/arabic/shards';
import { createCardUI } from '../../packages/golearn-extension/src/popup/card';
import { parseSelection } from '../../packages/golearn-extension/src/parser';
import { registerAllAnalysers } from '../support/analysers';
import { stubLayout, setBody } from './dom';

const LEXICON = path.resolve(__dirname, '../../public/lexicon/ar/standard');
const LINE = 'إحنا مش عارفين ليه الشارع زحمة النهارده، وعايز كل واحد يروح بيته بدري.';
const STANDARD = 'ذهب الولد إلى المدرسة مع أخيه ثم عاد إلى البيت في المساء.';

describe.skipIf(!fs.existsSync(path.join(LEXICON, 'manifest.json')))('the click path on an Egyptian line', () => {
  beforeAll(async () => {
    stubLayout(); setBody('<p>x</p>');
    registerAllAnalysers();
    const loader = await createArabicShardLoader({ fetchJson: async (p) => JSON.parse(fs.readFileSync(p, 'utf8')), fetchBytes: async (p) => new Uint8Array(fs.readFileSync(p)) }, { base: LEXICON, maxLoaded: 900 });
    await loader.ensure(arAdapter.tokenize(LINE + ' ' + STANDARD).filter((t) => t.isWord).map((t) => t.normalized));
  });
  const click = (sentence: string, w: string) => {
    const st = sentence.indexOf(w);
    return parseSelection({ surface: w, languageId: 'ar', context: { kind: 'sentence', confidence: 0.9, sentence, selStart: st, selEnd: st + w.length } as never });
  };

  it('the adapter flags every reading of every word of the line (what the click path is handed)', () => {
    const toks = arAdapter.tokenize(LINE);
    const a = arAdapter.analyze(toks);
    for (const x of a.filter((r) => r.token.isWord)) for (const c of x.candidates) { expect(c.notes?.variety, x.token.surface).toBe('dialect?'); expect(c.confidence).toBeLessThan(0.5); }
  });

  it.each(['مش', 'وعايز', 'الشارع'])('a click on %s: the word and the dialect note, no reading of any kind, nothing recorded', (w) => {
    const m = click(LINE, w);
    const NOTE = 'This sentence looks like spoken Arabic (Egyptian), which GoLearn does not analyse: no reading is given.';
    // the model: the statement, and nothing that reads as a meaning
    expect(m.dialect).toBe(NOTE);
    expect(m.notes).toEqual([NOTE]);
    expect(m.lemma).toBeUndefined();
    expect(m.gloss).toBeUndefined();
    expect(m.morphology).toBeUndefined();
    expect(m.transliteration).toBeUndefined();
    expect(m.lemmaTransliteration).toBeUndefined();
    expect(m.wordAnalysis).toBeUndefined();
    expect(m.alternatives).toEqual([]);
    expect(m.features).toEqual([]);
    expect(m.confidence).toBeLessThan(0.5);
    // the only unit a mark could go to is the word's FORM id
    expect(m.itemIds).toEqual([`form:ar:${arAdapter.normalize(w)}`]);
    expect(m.itemIds.some((id) => id.startsWith('lemma:'))).toBe(false);
    // the card's first view: the word and the note, no transliteration, MEANING section, lemma line or gloss
    const ui = createCardUI({ doc: document, speech: null, onDismiss: () => undefined, makeUtterance: (text, voice) => ({ text, voice }) });
    ui.show(m, { rect: { top: 100, left: 500, right: 560, bottom: 120, width: 60, height: 20 }, viewport: { width: 1024, height: 768 }, rtl: true, source: 'range' });
    const root = ui.root()!;
    expect(root.querySelector('.word')?.textContent).toBe(w);
    expect(root.querySelector('[data-row="dialect-note"]')?.textContent).toBe(NOTE);
    for (const row of ['transliteration', 'meaning', 'lemma-gloss']) expect(root.querySelector(`[data-row="${row}"]`), row).toBeNull();
    expect(root.querySelector('.lemmaLine')).toBeNull();
    const first = root.querySelector('[data-row="dialect-note"]')!.parentElement!.textContent ?? '';
    expect(first).toBe(NOTE);
    expect(first).not.toMatch(/MEANING|Meaning ·|sucked|marrow|mashsha/i);
    ui.destroy();
  });

  it('a click on a word of a Standard sentence is unaffected', () => {
    const m = click(STANDARD, 'المدرسة');
    expect(m.notes.join(' ')).not.toMatch(/spoken Arabic/);
    expect(m.lemma).toBeTruthy();
  });
});
