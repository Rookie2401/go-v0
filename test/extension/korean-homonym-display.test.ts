// @vitest-environment jsdom
/**
 * A Korean homonym's lemma string carries the dictionary's number (눈² = snow). The number is identity, never spelling. In the extension:
 * the card's headline is the headword (the number only a small label beside the meaning), a page address built from the lemma is the bare
 * spelling, and the dictionary is asked for the numbered headword first and the bare one after it.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createCardUI, type CardUI } from '../../packages/golearn-extension/src/popup/card';
import { parseSelection, type CardModel } from '../../packages/golearn-extension/src/parser';
import { createGlossService } from '../../packages/golearn-extension/src/background/gloss';
import type { SessionManager } from '../../packages/golearn-extension/src/background/session';
import { albanianManifest } from '../../packages/language-packs/src';
import { createChromeFake } from './chromeFake';
import { setBody, stubLayout } from './dom';

const anchor = { rect: { top: 100, left: 50, right: 110, bottom: 120, width: 60, height: 20 }, viewport: { width: 1024, height: 768 }, rtl: false, source: 'range' as const };

/** A Korean one-word card for 눈이 read as the homonym 눈²: the shape is the parser's own, the reading is Korean. */
function koreanCard(lemma: string, surface = '눈이'): CardModel {
  const sentence = 'Unë po lexoj një libër të bukur në shtëpinë time.';
  const base = parseSelection({ surface: 'shtëpinë', context: { kind: 'sentence', confidence: 0.9, sentence, selStart: sentence.indexOf('shtëpinë'), selEnd: sentence.indexOf('shtëpinë') + 8 } });
  return { ...base, languageId: 'ko', surface, lemma, pos: 'NOUN', tokenCount: 1, unconfirmed: false, transliteration: undefined, lemmaTransliteration: undefined,
    wordAnalysis: { ...(base.wordAnalysis ?? {}), lexicalMeaning: { text: 'snow', source: 'test' } } as never, alternatives: [] };
}

let restore: () => void;
let ui: CardUI;
beforeEach(() => {
  restore = stubLayout();
  setBody('<p>한국어</p>');
  ui = createCardUI({ doc: document, speech: null, onDismiss: () => undefined, makeUtterance: (text, voice) => ({ text, voice }) });
});
afterEach(() => { ui.destroy(); restore(); });

describe('the card headline of a numbered Korean lemma', () => {
  it('shows the headword 눈, with the number as a small label beside the meaning, never as part of the spelling', () => {
    ui.show(koreanCard('눈²'), anchor);
    const root = ui.root()!;
    const line = root.querySelector('.lemmaLine')!;
    expect(line).not.toBeNull();
    expect(line.querySelector('.lv')!.textContent).toContain('눈');
    expect(line.querySelector('.lv')!.textContent).not.toMatch(/[⁰¹²³⁴-⁹]/);
    expect(line.querySelector('[data-row="homonym"]')!.textContent).toBe('entry 2');
    expect(line.querySelector('[data-row="lemma-gloss"]')!.textContent).toContain('snow');
    // nothing a person reads on the card carries the superscript
    const card = root.querySelector('.card') as HTMLElement;
    const clone = card.cloneNode(true) as HTMLElement;
    clone.querySelectorAll('style').forEach((e) => e.remove());
    expect(clone.textContent).not.toMatch(/[⁰¹²³⁴-⁹]/);
  });

  it('a lemma with no number is shown as it is, with no label', () => {
    ui.show(koreanCard('눈', '눈이'), anchor);
    const root = ui.root()!;
    expect(root.querySelector('.lemmaLine .lv')!.textContent).toContain('눈');
    expect(root.querySelector('[data-row="homonym"]')).toBeNull();
  });

  it('the Analysis panel names the lemma by its headword too', () => {
    ui.show(koreanCard('묻다¹', '물어요'), anchor);
    const root = ui.root()!;
    (root.querySelector('.deeperBtn') as HTMLButtonElement | null)?.click();
    (root.querySelector('.analysisBtn') as HTMLButtonElement | null)?.click();
    const text = (root.querySelector('.card') as HTMLElement).textContent ?? '';
    expect(text).toContain('묻다');
    expect(text).not.toContain('묻다¹');
  });
});

describe('the dictionary and the page address of a numbered Korean lemma', () => {
  const CONFIG = JSON.stringify({ sourceLinks: { wiktionary: 'https://en.wiktionary.org/wiki/{lemma}#{language}', kaikki: 'https://kaikki.org/dictionary/{language}/' } });
  const OWN = 'chrome-extension://test-ext-id/app/';

  function make(asked: Array<{ lemma: string; forms?: readonly string[] }>) {
    const fake = createChromeFake();
    const doFetch = (async (input: RequestInfo | URL) => {
      const u = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
      return u === `${OWN}config.json` ? new Response(CONFIG, { status: 200 }) : new Response('{}', { status: 200 });
    }) as typeof fetch;
    const session = { getService: async () => undefined } as unknown as SessionManager;
    // the Albanian manifest's shape (an installable pack with a dictionary), made Korean
    const sq = albanianManifest();
    const manifest = { ...sq, languageId: 'ko', packId: 'pack:ko', analyzer: { ...sq.analyzer, id: 'adapter-ko@1' }, lexical: { ...sq.lexical, dictionary: { ...sq.lexical.dictionary!, baseUrl: 'dict/ko/' } } };
    const packs = {
      manifest: (id: string) => (id === 'ko' ? manifest : undefined),
      runtime: (id: string) => (id === 'ko' ? {
        manifest,
        async gloss(lemma: string, _pos: unknown, forms?: readonly string[]) { asked.push({ lemma, forms }); return { senses: [{ gloss: 'snow', pos: 'NOUN' }], attribution: 'Wiktionary, via kaikki.org' }; },
      } : undefined),
    };
    return createGlossService({ area: fake.local, session, fetch: doFetch, packs: packs as never, getURL: (p: string) => fake.runtime.getURL!(p) });
  }

  it('the worker is handed the numbered headword and the bare one; the page address and its label are the bare spelling', async () => {
    const asked: Array<{ lemma: string; forms?: readonly string[] }> = [];
    const r = await make(asked).glossFor({ lemma: '눈²', pos: 'NOUN', languageId: 'ko', forms: ['눈²', '눈'] });
    expect(asked[0]).toEqual({ lemma: '눈²', forms: ['눈²', '눈'] });
    expect(r.sources?.[0]).toEqual({ label: 'Wiktionary: 눈 (Korean)', url: `https://en.wiktionary.org/wiki/${encodeURIComponent('눈')}#Korean`, licence: 'CC BY-SA 4.0' });
    expect(JSON.stringify(r.sources)).not.toMatch(/[⁰¹²³⁴-⁹]|%C2%B2/);
  });
});
