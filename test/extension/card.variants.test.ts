// @vitest-environment jsdom
/**
 * The "Variants" pill (docs/PLAN14.md §3): a fourth pill to the right of "See full sentence" for a language with period varieties, exclusive
 * with the other two, reported once as layer 'variants'; its panel lists the word across the periods exactly as the model states them, and the
 * card's top rows say which period the text was read in. A model without `variants` (every other language) gets no pill at all.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createCardUI, type CardUI } from '../../packages/golearn-extension/src/popup/card';
import type { CardModel } from '../../packages/golearn-extension/src/parser';
import type { PopupAnchor } from '../../packages/golearn-extension/src/contract/readerAdapter';
import type { LayerName } from '../../packages/golearn-extension/src/popup/view';
import { setBody, stubLayout } from './dom';

const anchor: PopupAnchor = { rect: { top: 100, left: 50, right: 110, bottom: 120, width: 60, height: 20 }, viewport: { width: 1024, height: 768 }, rtl: true, source: 'range' };

function model(withVariants: boolean): CardModel {
  const base: CardModel = {
    languageId: 'he', packId: 'pack:he', analyzerId: 'adapter-he@1', surface: 'כָּתַ֣ב', lemma: 'כָּתַב', pos: 'VERB', morphology: 'Qal, perfect (qatal), 3rd person masculine singular', gloss: 'write',
    confidence: 0.92, provenance: 'lexicon', unconfirmed: false, phrases: [], words: [], alternatives: [], basis: [], notes: [], pronunciation: [], itemIds: ['lemma:he:כָּתַב:VERB'],
    context: { kind: 'sentence', confidence: 0.9, sentence: 'וַיִּכְתֹּב מֹשֶׁה', direction: 'rtl' } as unknown as CardModel['context'],
    features: [{ key: 'Binyan', value: 'Qal' }], constructions: [], syntaxNotes: [], sentenceWords: [], unitIds: [], tokenCount: 1,
    labels: {} as CardModel['labels'], limits: [],
  };
  if (!withVariants) return base;
  return {
    ...base,
    period: { varietyId: 'he-bib', label: 'Biblical Hebrew', basis: 'the text carries cantillation marks: a Masoretic text' },
    variants: {
      lemma: 'כָּתַב', pos: 'VERB', rows: [
        { varietyId: 'he-bib', label: 'Biblical Hebrew', forms: ['כָּתַב'], status: 'attested', sources: ['oshb-tanakh'], note: '222 occurrences in the Tanakh', current: true },
        { varietyId: 'he-mish', label: 'Mishnaic (Rabbinic) Hebrew', forms: [], status: 'not-in-sources', sources: [], note: 'recognised from dictionary labels only; none here' },
        { varietyId: 'he-med', label: 'Medieval Hebrew', forms: [], status: 'not-in-sources', sources: [] },
        { varietyId: 'he-mod', label: 'Modern Hebrew', forms: ['כָּתַב', 'כתב'], status: 'attested', sources: ['kaikki-he'], gloss: 'to write' },
      ],
    },
  };
}

let restore: () => void;
let ui: CardUI;
beforeEach(() => { restore = stubLayout(); setBody('<p id="p">וַיִּכְתֹּב מֹשֶׁה</p>'); ui = createCardUI({ doc: document, speech: null, onDismiss: () => {}, makeUtterance: () => undefined }); });
afterEach(() => { ui.destroy(); restore(); });

describe('the Variants pill', () => {
  it('is the pill right of "See full sentence" and left of "Report"; its panel is hidden until clicked', () => {
    ui.show(model(true), anchor);
    const root = ui.root()!;
    const pills = [...root.querySelectorAll('.pills > button')].map((b) => b.textContent);
    expect(pills).toEqual(['Go deeper', 'See full sentence', 'Variants', 'Report']);
    expect(root.querySelector('#panel-variants')!.hasAttribute('hidden')).toBe(true);
  });
  it('opens exclusively, lists every period in order with forms, status words and sources, marks the period of this text, and is reported once as layer "variants"', () => {
    const layers: LayerName[] = [];
    ui.show(model(true), anchor, { actions: { onLayer: (l) => layers.push(l) } });
    const root = ui.root()!;
    (root.querySelector('.sentenceBtn') as HTMLButtonElement).click();
    expect(root.querySelector('#panel-sentence')!.hasAttribute('hidden')).toBe(false);
    (root.querySelector('.variantsBtn') as HTMLButtonElement).click();
    expect(root.querySelector('#panel-variants')!.hasAttribute('hidden')).toBe(false);
    expect(root.querySelector('#panel-sentence')!.hasAttribute('hidden')).toBe(true); // exclusive
    expect(root.querySelector('.variantsBtn')!.textContent).toBe('Hide variants');
    const rows = [...root.querySelectorAll('table.variants tr')];
    expect(rows.map((r) => r.querySelector('th')!.textContent)).toEqual(['Biblical Hebrew (this text)', 'Mishnaic (Rabbinic) Hebrew', 'Medieval Hebrew', 'Modern Hebrew']);
    expect(rows[0].classList.contains('current')).toBe(true);
    expect(rows[0].querySelector('.vform')!.textContent).toBe('כָּתַב');
    expect(rows[0].querySelector('.vform')!.getAttribute('dir')).toBe('auto');
    expect(rows[0].querySelector('.vstatus')!.textContent).toBe('222 occurrences in the Tanakh · source: oshb-tanakh');
    expect(rows[1].querySelector('.vstatus')!.textContent).toBe('not in our sources · recognised from dictionary labels only; none here');
    expect(rows[3].querySelector('.vform')!.textContent).toBe('כָּתַב · כתב');
    expect(rows[3].querySelector('.vstatus')!.textContent).toBe('to write · source: kaikki-he');
    expect(root.querySelector('#panel-variants')!.textContent).toContain('This text is read as Biblical Hebrew: the text carries cantillation marks');
    (root.querySelector('.variantsBtn') as HTMLButtonElement).click();
    (root.querySelector('.variantsBtn') as HTMLButtonElement).click();
    expect(layers.filter((l) => l === 'variants')).toEqual(['variants']); // once
    expect(layers).toContain('sentence');
  });
  it('the top rows say which period the text was read in', () => {
    ui.show(model(true), anchor);
    expect(ui.root()!.querySelector('[data-row="period"]')!.textContent).toBe('Read as Biblical Hebrew — the text carries cantillation marks: a Masoretic text');
  });
  it('a model without variants (every other language) has no Variants pill and no period line', () => {
    ui.show(model(false), anchor);
    const root = ui.root()!;
    expect([...root.querySelectorAll('.pills > button')].map((b) => b.textContent)).toEqual(['Go deeper', 'See full sentence', 'Report']);
    expect(root.querySelector('#panel-variants')).toBeNull();
    expect(root.querySelector('[data-row="period"]')).toBeNull();
  });
});
