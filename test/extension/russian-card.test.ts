// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { clearAnalysers, parseSelection } from '../../packages/golearn-extension/src/parser';
import { createCardUI, type CardUI } from '../../packages/golearn-extension/src/popup/card';
import { createGlossService } from '../../packages/golearn-extension/src/background/gloss';
import type { PopupAnchor } from '../../packages/golearn-extension/src/contract/readerAdapter';
import { registerAllAnalysers } from '../support/analysers';
import { setBody, stubLayout } from './dom';

function parse(sentence: string, surface: string) {
  const start = sentence.indexOf(surface);
  return parseSelection({
    surface,
    languageId: 'ru',
    context: { kind: 'sentence', confidence: 0.9, sentence, selStart: start, selEnd: start + surface.length },
  });
}

describe('Russian GoLearn card morphology', () => {
  let ui: CardUI;
  let restore: () => void;
  afterEach(() => { ui?.destroy(); restore?.(); clearAnalysers(['sq']); });

  it('carries Russian inflection through the adapter and into the extension card model', () => {
    registerAllAnalysers();

    const noun = parse('Я читаю новую книгу.', 'книгу');
    expect(noun).toMatchObject({ languageId: 'ru', lemma: 'книга', pos: 'NOUN' });
    expect(noun.morphology).toBe('accusative singular, feminine, inanimate');
    expect(noun.features).toEqual(expect.arrayContaining([
      { key: 'Case', value: 'Acc' },
      { key: 'Number', value: 'Sing' },
      { key: 'Gender', value: 'Fem' },
      { key: 'Animacy', value: 'Inan' },
    ]));

    const adjective = parse('Я читаю новую книгу.', 'новую');
    expect(adjective).toMatchObject({ lemma: 'новый', pos: 'ADJ' });
    expect(adjective.morphology).toMatch(/accusative singular feminine/);
    expect(adjective.features).toEqual(expect.arrayContaining([
      { key: 'Case', value: 'Acc' },
      { key: 'Number', value: 'Sing' },
      { key: 'Gender', value: 'Fem' },
    ]));

    restore = stubLayout();
    setBody('<p>Я читаю новую книгу.</p>');
    ui = createCardUI({ doc: document, onDismiss: () => {} });
    const anchor: PopupAnchor = {
      rect: { top: 100, left: 50, right: 110, bottom: 120, width: 60, height: 20 },
      viewport: { width: 1024, height: 768 }, rtl: false, source: 'range',
    };
    ui.show(noun, anchor);
    const explain = createGlossService({ area: {} as never, session: {} as never, fetch }).explainFor({
      languageId: 'ru', pos: noun.pos,
      features: Object.fromEntries(noun.features.map((f) => [f.key, f.value])),
      constructionIds: noun.constructions.map((c) => c.id),
    });
    ui.update({ explain: { state: 'ready', features: explain.features, constructions: explain.constructions } });
    ui.root()!.querySelector('.deeperBtn')!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    const form = ui.root()!.querySelector('.layer.l2')!;
    expect(form.textContent).toContain('accusative singular, feminine, inanimate');
    const featureLabels = [...form.querySelectorAll('.featureList details.feat summary')].map((x) => x.textContent);
    expect(featureLabels).toEqual(expect.arrayContaining(['Case · accusative', 'Number · singular', 'Gender · feminine', 'Animacy · inanimate']));
    form.querySelector('.analysisBtn')!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(form.querySelector('.analysis')!.querySelectorAll('details.feat')).toHaveLength(0);
  });
});
