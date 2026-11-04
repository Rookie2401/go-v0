// @vitest-environment jsdom
/**
 * The GoLearn card for a Hebrew and a Latin verb (the owner, 2026-11-03: a verb's meaning showed the lexicon's citation person,
 * not the form's). The immediate card says the form's own English; Go deeper keeps the citation as the lemma meaning.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { heAdapter } from '../../src/adapters/he';
import { laAdapter } from '../../src/adapters/la';
import { parseSelection, registerAnalyser } from '../../packages/golearn-extension/src/parser';
import { createCardUI } from '../../packages/golearn-extension/src/popup/card';
import { setBody, stubLayout } from './dom';

let restoreDom: (() => void) | undefined;
afterEach(() => { restoreDom?.(); restoreDom = undefined; });

function card(languageId: string, sentence: string, word: string): { main: string; deeper: string; destroy: () => void } {
  const start = sentence.indexOf(word);
  const model = parseSelection({ surface: word, languageId, context: { kind: 'sentence', confidence: 1, sentence, selStart: start, selEnd: start + word.length } });
  restoreDom = stubLayout();
  setBody('<main></main>');
  const ui = createCardUI({ doc: document, speech: null });
  ui.show(model, { rect: { top: 100, left: 20, right: 120, bottom: 120, width: 100, height: 20 }, viewport: { width: 800, height: 600 }, rtl: languageId === 'he', source: 'range' });
  const main = ui.root()?.querySelector('.rows')?.textContent ?? '';
  (ui.root()!.querySelector('.deeperBtn') as HTMLButtonElement).click();
  const deeper = ui.root()!.querySelector('[data-layer="meaning"]')!.textContent ?? '';
  return { main, deeper, destroy: () => ui.destroy() };
}

describe('Hebrew and Latin verbs on the GoLearn card', () => {
  it('a Hebrew wayyiqtol: "And he said" on the card, "to say" as the lemma meaning in Go deeper', () => {
    registerAnalyser('he', heAdapter);
    const c = card('he', 'וַיֹּאמֶר אֱלֹהִים יְהִי אוֹר', 'וַיֹּאמֶר');
    expect(c.main).toContain('And he said');
    expect(c.main).not.toMatch(/^[\s\S]*“to say”/);
    expect(c.deeper).toContain('lemma meaning');
    expect(c.deeper).toContain('to say');
    expect(c.deeper).toContain('literal meaning');
    expect(c.deeper).toContain('And he said');
    c.destroy();
  });

  it('a Hebrew second person: "And you will love", not the citation', () => {
    registerAnalyser('he', heAdapter);
    const c = card('he', 'וְאָהַבְתָּ אֵת יְהוָה אֱלֹהֶיךָ', 'וְאָהַבְתָּ');
    expect(c.main).toContain('And you will love');
    expect(c.deeper).toContain('love, lovely, loveable');
    c.destroy();
  });

  it('a Latin second person and a Latin passive with its own sense', () => {
    registerAnalyser('la', laAdapter);
    const amas = card('la', 'amas me', 'amas');
    expect(amas.main).toContain('You love');
    expect(amas.deeper).toContain('love, like; fall in love with; be fond of');
    amas.destroy();
    const videtur = card('la', 'videtur mihi', 'videtur');
    expect(videtur.main).toContain('He, she, or it seems');
    videtur.destroy();
  });
});
