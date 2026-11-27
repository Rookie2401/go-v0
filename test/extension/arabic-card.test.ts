// @vitest-environment jsdom
/**
 * The card for an Arabic word: set in a naskh face with room for the vowel marks, forced left to right like every card, with the Arabic runs
 * isolated (unicode-bidi) so an English gloss beside Arabic and the parts of a word do not reorder. jsdom has no layout and no font, so this tests
 * what the card PRODUCES: the markup (dir, lang, class) and the style sheet's rules; the look is for a real browser.
 */
import fs from 'node:fs';
import path from 'node:path';
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createArabicShardLoader } from '../../src/adapters/arabic/shards';
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
    expect(run![1]).toMatch(/font-family:\s*"Noto Naskh Arabic", "Amiri", "Scheherazade New", "Traditional Arabic", "Arabic Typesetting", "Geeza Pro", "Al Bayan", "Times New Roman", serif/);
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
    // the parts list is right to left like the word: its first part (the conjunction و) is its rightmost, while the card stays left to right
    const segs = root.querySelector('[data-row="form-components"]');
    if (segs) { expect(segs.getAttribute('dir')).toBe('rtl'); expect(segs.firstElementChild!.querySelector('[lang]')!.textContent).toMatch(/^و/); }
    expect(root.querySelector('.card')!.getAttribute('dir') ?? 'ltr').toBe('ltr');
    expect(root.querySelector('.word')!.getAttribute('lang')).toBe('ar');
  });
});

const LEXICON = path.resolve(__dirname, '../../public/lexicon/ar/standard');
describe.skipIf(!fs.existsSync(path.join(LEXICON, 'manifest.json')))('the root line of the Arabic card', () => {
  // the roots are the source's: they live in the form index, which the extension loads in shards beside the analyser
  beforeAll(async () => {
    const loader = await createArabicShardLoader({ fetchJson: async (p) => JSON.parse(fs.readFileSync(p, 'utf8')), fetchBytes: async (p) => new Uint8Array(fs.readFileSync(p)) }, { base: LEXICON, maxLoaded: 400 });
    await loader.ensure(['كتب', 'كتاب', 'مكتبه', 'المكتبه', 'لا']);
  });

  const rootOf = (sentence: string, surface: string): string | undefined => {
    const start = sentence.indexOf(surface);
    const m = parseSelection({ surface, languageId: 'ar', context: { kind: 'sentence', confidence: 0.9, sentence, selStart: start, selEnd: start + surface.length, direction: 'rtl' } as never });
    return m.wordAnalysis?.formAnalysis?.root;
  };

  it('comes with the reading, not from an index the card’s module holds: كَتَبَ, كِتَاب and مَكْتَبَة show Root ك ت ب', () => {
    expect(rootOf('كَتَبَ الْوَلَدُ الدَّرْسَ.', 'كَتَبَ')).toBe('ك ت ب');
    expect(rootOf('هذا كِتَاب جَدِيد.', 'كِتَاب')).toBe('ك ت ب');
    expect(rootOf('ذَهَبَ إِلَى الْمَكْتَبَةِ.', 'الْمَكْتَبَةِ')).toBe('ك ت ب');
  });

  it('shows no root for a lemma that has none, and the card says Root only when there is one', () => {
    expect(rootOf('لَا يَكْتُبُ الْوَلَدُ.', 'لَا')).toBeUndefined();
    const m = parseSelection({ surface: 'كَتَبَ', languageId: 'ar', context: { kind: 'sentence', confidence: 0.9, sentence: 'كَتَبَ الْوَلَدُ الدَّرْسَ.', selStart: 0, selEnd: 6, direction: 'rtl' } as never });
    ui.show(m, anchor);
    expect(ui.root()!.textContent).toMatch(/ك ت ب/);
  });
});

describe('a click on a dialect sentence', () => {
  it('says in plain words that it looks like spoken Arabic and is not analysed, naming the dialect', () => {
    const sentence = 'ازيك يا صاحبي عامل ايه النهاردة دلوقتي';
    const surface = 'دلوقتي';
    const start = sentence.indexOf(surface);
    const m = parseSelection({ surface, languageId: 'ar', context: { kind: 'sentence', confidence: 0.9, sentence, selStart: start, selEnd: start + surface.length, direction: 'rtl' } as never });
    expect(m.notes.join(' ')).toMatch(/This sentence looks like spoken Arabic \(Egyptian\), which GoLearn does not analyse: no reading is given\./);
    ui.show(m, anchor);
    expect(ui.root()!.textContent).toMatch(/looks like spoken Arabic \(Egyptian\)/);
  });

  it('says nothing of the kind about a Standard Arabic sentence', () => {
    const m = parse('كَتَبَ');
    expect(m.notes.join(' ')).not.toMatch(/spoken Arabic/);
  });
});

describe('an undecided Arabic word, through the card states of the review gate', () => {
  const BARE = 'كتب';
  const undecided = (): CardModel => parseSelection({ surface: BARE, languageId: 'ar', context: { kind: 'sentence', confidence: 0.9, sentence: BARE, selStart: 0, selEnd: BARE.length, direction: 'rtl' } as never });
  it('credits an unvocalized word that its sentence does not decide to its form id, and says it is undecided', () => {
    const m = undecided();
    expect(m.formId).toBe('form:ar:كتب');
    expect(m.reviewHold?.rivals.length ?? 0).toBeGreaterThan(1);
    ui.show(m, anchor);
    const note = ui.root()!.querySelector('[data-row="review-hold"]') as HTMLElement | null;
    expect(note?.textContent ?? '').toMatch(/Not added to review/);
    for (const r of m.reviewHold!.rivals) expect(ui.root()!.textContent).toContain(r.lemma);
  });
});
