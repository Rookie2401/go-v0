// @vitest-environment jsdom
/**
 * The card's sound row and its "Pronunciation" section appear ONLY for a reading whose PronunciationSupport carries a `respelling` (today:
 * Korean). Every other language's card is as it was: no new section, no new row.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createCardUI, type CardUI } from '../../packages/golearn-extension/src/popup/card';
import { parseSelection } from '../../packages/golearn-extension/src/parser';
import { registerAllAnalysers } from '../support/analysers';
import { setBody, stubLayout } from './dom';

const anchor = { rect: { top: 100, left: 50, right: 110, bottom: 120, width: 60, height: 20 }, viewport: { width: 1024, height: 768 }, rtl: false, source: 'range' as const };
let restore: () => void; let ui: CardUI;
beforeEach(() => { restore = stubLayout(); setBody('<p>x</p>'); registerAllAnalysers(); ui = createCardUI({ doc: document, speech: null, onDismiss: () => undefined, makeUtterance: (text, voice) => ({ text, voice }) }); });
afterEach(() => { ui.destroy(); restore(); });

const open = (languageId: string, sentence: string, surface: string) => {
  const at = sentence.indexOf(surface);
  const card = parseSelection({ surface, languageId, context: { kind: 'sentence', confidence: 0.9, sentence, selStart: at, selEnd: at + surface.length } });
  ui.show(card, anchor);
  (ui.root()!.querySelector('.deeperBtn') as HTMLElement | null)?.click();
  (ui.root()!.querySelector('.analysisBtn') as HTMLElement | null)?.click();
  return { card, root: ui.root()! };
};
const headings = (root: ShadowRoot): string[] => [...root.querySelectorAll('.analysis h4')].map((h) => h.textContent ?? '');

describe('Pronunciation section and sound row', () => {
  it.each([['he', 'בראשית ברא אלהים', 'ברא'], ['nb', 'Jeg bor i Norge nå.', 'bor'], ['hi', 'मैं घर जाता हूँ।', 'घर'], ['th', 'ฉันกินข้าว', 'กิน']])('%s: no Pronunciation section and no sound row', (lang, sentence, word) => {
    const { root } = open(lang, sentence, word);
    expect(headings(root)).not.toContain('Pronunciation');
    expect(root.querySelector('[data-row="sound"]')).toBeNull();
  });

  it('ko: the sound row and the Pronunciation section are there', () => {
    const { card, root } = open('ko', '저는 밥을 먹었습니다.', '먹었습니다');
    expect(card.respelling).toMatch(/^\[.+\]$/u);
    expect(root.querySelector('[data-row="sound"]')?.textContent).toBe(card.respelling);
    expect(headings(root)).toContain('Pronunciation');
  });
});
