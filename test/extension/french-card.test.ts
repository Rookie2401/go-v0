// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { frAdapter, loadFrenchLexicon } from '../../src/adapters/fr';
import { frenchLexiconLoaded } from '../../src/adapters/french/lexicon-full';
import { createCardUI, type CardUI } from '../../packages/golearn-extension/src/popup/card';
import { parseSelection, registerAnalyser } from '../../packages/golearn-extension/src/parser';
import { createGlossService } from '../../packages/golearn-extension/src/background/gloss';
import { stubLayout, setBody } from './dom';

const sentence = (text: string, selected: string) => {
  const start = text.indexOf(selected);
  return { kind: 'sentence' as const, confidence: 0.9, sentence: text, selStart: start, selEnd: start + selected.length };
};

let restore: () => void;
let card: CardUI;

beforeEach(() => {
  restore = stubLayout();
  setBody('<p>French card test</p>');
  registerAnalyser('fr', frAdapter);
  card = createCardUI({ doc: document, speech: null, onDismiss: () => undefined, makeUtterance: (text, voice) => ({ text, voice }) });
});

afterEach(() => {
  card.destroy();
  restore();
});

describe('French extension card', () => {
  it('distinguishes a dictionary-only lemma from an unconfirmed hand-core guess', async () => {
    const startsLoaded = frenchLexiconLoaded();
    const context = sentence('Nous abdiquons ici.', 'abdiquons');
    const before = parseSelection({ languageId: 'fr', surface: 'abdiquons', context });
    if (!startsLoaded) {
      expect(before).toMatchObject({ lemma: 'abdiquer', unconfirmed: true, provenance: 'rule', gloss: undefined });
      expect(before.notes.join(' ')).toMatch(/Not in the word list/);
    }

    await loadFrenchLexicon();
    const after = parseSelection({ languageId: 'fr', surface: 'abdiquons', context });
    expect(after).toMatchObject({ lemma: 'abdiquer', unconfirmed: false, provenance: 'rule', gloss: undefined });
    if (!startsLoaded) {
      expect(after.confidence).toBeGreaterThan(before.confidence);
      expect(after.notes.join(' ')).not.toMatch(/Not in the word list/);
    }
  });

  it('shows French participle morphology and the pack feature explanations in the popup analysis', async () => {
    await loadFrenchLexicon();
    const text = 'Elle est arrivée hier.';
    const model = parseSelection({ languageId: 'fr', surface: 'arrivée', context: sentence(text, 'arrivée') });
    expect(model).toMatchObject({ lemma: 'arriver', pos: 'VERB' });
    expect(model.constructions.map((item) => item.id)).toEqual(expect.arrayContaining(['passe-compose', 'participle-agreement-etre']));
    expect(model.features).toEqual(expect.arrayContaining([
      { key: 'VerbForm', value: 'Part' }, { key: 'Tense', value: 'Past' },
      { key: 'Gender', value: 'Fem' }, { key: 'Number', value: 'Sing' },
    ]));

    card.show(model, { rect: { top: 100, left: 50, right: 110, bottom: 120, width: 60, height: 20 }, viewport: { width: 1024, height: 768 }, rtl: false, source: 'range' });
    const service = createGlossService({ area: {} as never, session: {} as never, fetch });
    const reply = service.explainFor({ languageId: 'fr', pos: model.pos, features: Object.fromEntries(model.features.map((f) => [f.key, f.value])), constructionIds: model.constructions.map((c) => c.id) });
    card.update({ explain: { state: 'ready', constructions: reply.constructions, features: reply.features } });
    const root = card.root()!;
    (root.querySelector('.deeperBtn') as HTMLButtonElement).click();
    (root.querySelector('.analysisBtn') as HTMLButtonElement).click();
    const featureLabels = [...root.querySelectorAll('.feat summary')].map((x) => x.textContent ?? '');
    expect(featureLabels).toContain('Verb form · participle');
    expect(featureLabels).toContain('Tense · past participle');
    expect(featureLabels).toContain('Gender · feminine');
    expect(featureLabels).toContain('Number · singular');
  });
});
