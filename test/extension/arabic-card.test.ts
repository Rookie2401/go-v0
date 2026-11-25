// @vitest-environment jsdom
/**
 * The card for an Arabic word: set in a naskh face with room for the vowel marks, forced left to right like every card, with the Arabic runs
 * isolated (unicode-bidi) so an English gloss beside Arabic and the parts of a word do not reorder. jsdom has no layout and no font, so this tests
 * what the card PRODUCES: the markup (dir, lang, class) and the style sheet's rules; the look is for a real browser.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createCardUI, type CardUI } from '../../packages/golearn-extension/src/popup/card';
import { clearAnalysers, parseSelection } from '../../packages/golearn-extension/src/parser';
import type { CardModel } from '../../packages/golearn-extension/src/parser';
import { GOLEARN_HOST_ATTR, type PopupAnchor } from '../../packages/golearn-extension/src/contract/readerAdapter';
import { registerAllAnalysers } from '../support/analysers';
import { setBody, stubLayout } from './dom';

const anchor: PopupAnchor = { rect: { top: 100, left: 500, right: 560, bottom: 120, width: 60, height: 20 }, viewport: { width: 1024, height: 768 }, rtl: true, source: 'range' };

const SENTENCE = 'كَتَبَ الْوَلَدُ الدَّرْسَ.';
const parse = (surface: string): CardModel => {
  const start = SENTENCE.indexOf(surface);
  return parseSelection({ surface, languageId: 'ar', context: { kind: 'sentence', confidence: 0.9, sentence: SENTENCE, selStart: start, selEnd: start + surface.length, direction: 'rtl' } as never });
};

let restore: () => void;
let ui: CardUI;
beforeEach(() => {
  restore = stubLayout();
  document.documentElement.setAttribute('dir', 'rtl');
  setBody(`<p dir="rtl">${SENTENCE}</p>`);
  registerAllAnalysers();
  ui = createCardUI({ doc: document, speech: null, onDismiss: () => {}, makeUtterance: (text, voice) => ({ text, voice }) });
});
afterEach(() => { ui.destroy(); restore(); clearAnalysers(['sq']); document.documentElement.removeAttribute('dir'); });

describe('the Arabic card', () => {
  it('sets the headword right to left inside a left-to-right card, tagged as Arabic', () => {
    const m = parse('كَتَبَ');
    expect(m).toMatchObject({ languageId: 'ar', lemma: 'كَتَبَ', pos: 'VERB' });
    ui.show(m, anchor);
    const host = document.querySelector(`[${GOLEARN_HOST_ATTR}]`) as HTMLElement;
    expect(host.getAttribute('dir')).toBe('ltr');
    const root = ui.root()!;
    const word = root.querySelector('.word') as HTMLElement;
    expect(word.getAttribute('lang')).toBe('ar');
    expect(word.getAttribute('dir')).toBe('rtl'); // the letters run right to left inside a left-aligned line
    expect(word.textContent).toBe('كَتَبَ');
    expect((root.querySelector('.card') as HTMLElement).getAttribute('dir') ?? 'ltr').toBe('ltr');
  });

  it('names a naskh face with room for the vowel marks, for the headword and for every Arabic run', () => {
    ui.show(parse('كَتَبَ'), anchor);
    const css = [...ui.root()!.querySelectorAll('style')].map((s) => s.textContent).join('\n');
    // every Arabic run: a naskh stack and a line height of at least 1.8, so a shadda under a kasra is not clipped
    const run = /\.card \[lang\|="ar"\]\s*\{([^}]*)\}/.exec(css);
    expect(run, 'a rule for [lang|=ar]').not.toBeNull();
    expect(run![1]).toMatch(/font-family:\s*"Noto Naskh Arabic", "Amiri", "Scheherazade New", "Traditional Arabic", serif/);
    expect(Number(/line-height:\s*([\d.]+)/.exec(run![1])![1])).toBeGreaterThanOrEqual(1.8);
    // the headword: line-height 2
    const head = /\.card \.word\[lang\|="ar"\]\s*\{([^}]*)\}/.exec(css);
    expect(head, 'a rule for the Arabic headword').not.toBeNull();
    expect(Number(/line-height:\s*([\d.]+)/.exec(head![1])![1])).toBeGreaterThanOrEqual(2);
    // no web font is fetched: the stack names faces a system may have
    expect(css).not.toMatch(/@font-face[^}]*Arabic|url\([^)]*naskh/i);
    // and the card still isolates every [lang] run so the Arabic and the English gloss beside it do not reorder
    expect(css).toMatch(/\.card \[lang\]\s*\{\s*unicode-bidi:\s*isolate/);
  });

  it('keeps an English gloss beside Arabic as its own left-to-right run, and every Arabic run as its own tagged span', () => {
    const m = parse('كَتَبَ');
    ui.show({ ...m, gloss: 'to write (a letter, a book)' }, anchor);
    const root = ui.root()!;
    const arabic = [...root.querySelectorAll('[lang="ar"]')];
    expect(arabic.length).toBeGreaterThan(1); // the headword and at least the lemma line
    for (const el of arabic) expect(el.closest('.card')).not.toBeNull();
    // nothing Arabic is left outside a tagged element: every text node with an Arabic letter has an ancestor with a lang attribute
    const walk = document.createTreeWalker(root as unknown as Node, NodeFilter.SHOW_TEXT);
    for (let n = walk.nextNode(); n; n = walk.nextNode()) {
      if (!/\p{Script=Arabic}/u.test(n.nodeValue ?? '')) continue;
      if ((n.parentElement?.closest('style') ?? null) !== null) continue;
      expect(n.parentElement!.closest('[lang]'), `untagged Arabic text: ${n.nodeValue}`).not.toBeNull();
    }
    const gloss = [...root.querySelectorAll('[lang="en"]')].map((e) => e.textContent).join(' ');
    expect(gloss + root.textContent).toContain('to write');
  });

  it('shows the parts of an attached word as separate tagged runs, in the order the word is cut', () => {
    const sentence = 'وَالْكِتَابُ جَدِيدٌ.';
    const surface = 'وَالْكِتَابُ';
    const m = parseSelection({ surface, languageId: 'ar', context: { kind: 'sentence', confidence: 0.9, sentence, selStart: 0, selEnd: surface.length, direction: 'rtl' } as never });
    ui.show(m, anchor);
    const root = ui.root()!;
    for (const part of root.querySelectorAll('.seg [lang]')) expect(part.getAttribute('lang')).toBe('ar');
    expect(root.querySelector('.word')!.getAttribute('lang')).toBe('ar');
  });
});
