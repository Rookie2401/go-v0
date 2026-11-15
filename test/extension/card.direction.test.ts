// @vitest-environment jsdom
/**
 * The card reads left to right on every page (the owner, 2026-11-11, on a Hebrew page of read.e-vrit.co.il): the page's dir=rtl must not reach the
 * card's layout. The shadow host's `all: initial` does not reset `direction` (CSS Cascade: `all` excludes direction and unicode-bidi), so the card
 * says ltr itself, on the host, in its style sheet and on the card element; the headword of a right-to-left language keeps dir=rtl for its letters.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createCardUI, type CardUI } from '../../packages/golearn-extension/src/popup/card';
import type { CardModel } from '../../packages/golearn-extension/src/parser';
import { GOLEARN_HOST_ATTR, type PopupAnchor } from '../../packages/golearn-extension/src/contract/readerAdapter';
import { setBody, stubLayout } from './dom';

const anchor: PopupAnchor = { rect: { top: 100, left: 500, right: 560, bottom: 120, width: 60, height: 20 }, viewport: { width: 1024, height: 768 }, rtl: true, source: 'range' };

const hebrew: CardModel = {
  languageId: 'he', packId: 'pack:he', analyzerId: 'adapter-he@1', surface: 'את', lemma: 'אֵת', pos: 'PART', morphology: '', gloss: '(marks the definite direct object)',
  confidence: 0.9, provenance: 'lexicon', unconfirmed: false, phrases: [], words: [], alternatives: [], basis: [], notes: [], pronunciation: [], itemIds: ['lemma:he:אֵת:PART'],
  context: { kind: 'sentence', confidence: 0.9, sentence: 'אני מאדה בטעות את המורה', direction: 'rtl' } as unknown as CardModel['context'],
  features: [], constructions: [], syntaxNotes: [], sentenceWords: [], unitIds: [], tokenCount: 1,
  labels: {} as CardModel['labels'], limits: [],
};

let restore: () => void;
let ui: CardUI;
beforeEach(() => {
  restore = stubLayout();
  document.documentElement.setAttribute('dir', 'rtl');
  setBody('<p dir="rtl">אני מאדה בטעות את המורה</p>');
  ui = createCardUI({ doc: document, speech: null, onDismiss: () => {}, makeUtterance: (text, voice) => ({ text, voice }) });
});
afterEach(() => { ui.destroy(); restore(); document.documentElement.removeAttribute('dir'); });

describe('the card on a right-to-left page', () => {
  it('says left to right on the host, the card and in its style sheet, so the page direction is not inherited', () => {
    ui.show(hebrew, anchor);
    const host = document.querySelector(`[${GOLEARN_HOST_ATTR}]`) as HTMLElement;
    expect(host.getAttribute('dir')).toBe('ltr');
    expect(host.style.direction).toBe('ltr');
    const root = ui.root()!;
    const card = root.querySelector('.card') as HTMLElement;
    expect(card.getAttribute('dir')).toBe('ltr');
    const css = [...((root as unknown as { adoptedStyleSheets?: CSSStyleSheet[] }).adoptedStyleSheets ?? [])].map((s) => [...s.cssRules].map((r) => r.cssText).join('\n')).join('\n')
      + [...root.querySelectorAll('style')].map((s) => s.textContent).join('\n');
    expect(css).toMatch(/:host\s*\{[^}]*direction:\s*ltr/);
    expect(css).toMatch(/\.card\s*\{[^}]*direction:\s*ltr/);
  });

  it('keeps the Hebrew headword right to left inside a left-aligned line', () => {
    ui.show(hebrew, anchor);
    const word = ui.root()!.querySelector('.word') as HTMLElement;
    expect(word.getAttribute('dir')).toBe('rtl');
    expect(word.getAttribute('lang')).toBe('he');
  });
});
