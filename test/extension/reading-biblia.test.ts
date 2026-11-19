// @vitest-environment jsdom
/**
 * Reading Analysis on a Biblia chapter (the owner's report, 2026-11-19: Psalm 4 read as "0.0 % Known, 0 of 10 words", one word not
 * identified, and "the Hebrew dictionary … is offline or not downloaded").
 *
 * Biblia renders every word of the text as a control, <button class="word" lang="he">, and the scanner leaves buttons out, so none of the
 * psalm was read. What was counted instead was the nine verse numbers (א׳ … ט׳) and the paragraph mark פ. And Hebrew has no forms index,
 * which the dictionary step reports as `no-index`; the session passed that on as `unavailable`, which the popup words as "offline".
 *
 * The markup here is Biblia's own (packages/biblia/src/app.ts: renderHebrewVerse, levelLegend, the reader column). Hebrew is written with
 * \u escapes, never typed by hand.
 */
import { beforeAll, describe, expect, it } from 'vitest';
import { heAdapter } from '../../src/adapters/he';
import { createAdapters } from '../../packages/golearn-extension/src/adapters';
import { createScanner } from '../../packages/golearn-extension/src/active/scan';
import { MSG } from '../../packages/golearn-extension/src/platform';
import { extractReadingText, READING_TEXT_CONTROLS } from '../../packages/golearn-extension/src/reading/extract';
import { presentResult } from '../../packages/golearn-extension/src/reading/present';
import type { ReadingKnowledgeReply } from '../../packages/golearn-extension/src/reading/protocol';
import { createReadingSession, type ReadingSessionDeps } from '../../packages/golearn-extension/src/reading/session';

// unpointed consonantal words: YHWH, elohim, erets, shamayim, adam
const YHWH = 'יהוה';
const ELOHIM = 'אלהים';
const ERETS = 'ארץ';
const SHAMAYIM = 'שמים';
const ADAM = 'אדם';
const GERESH = '׳';
const PE = 'פ';
const ALEF = 'א';
const BET = 'ב';
const ALPHA = 'α';

const word = (w: string, lang = 'he'): string => `<button type="button" class="word" lang="${lang}">${w}</button>`;
const verse = (n: number, numeral: string, words: string[], mark = ''): string =>
  `<span class="verse" data-v="${n}"><span class="vn">${numeral}</span>${words.map((w) => word(w)).join(' ')}${mark ? `<span class="mark"> ${mark} </span>` : ''}</span> `;

/** A Biblia chapter: header and nav chrome, the legend, the verses (numerals, words, a paragraph mark), an ordinary button. */
function bibliaChapter(): { words: string[] } {
  const v1 = [YHWH, ELOHIM, ERETS];
  const v2 = [SHAMAYIM, ADAM, YHWH];
  document.documentElement.setAttribute('lang', 'en');
  document.title = 'Psalms 4 · Biblia';
  document.body.innerHTML = `<div class="reader reader--he">
  <header class="reader__header"><a href="#/">Biblia</a> <button type="button">Reading settings</button></header>
  <div class="reader__col">
    <div class="reader__title">Psalms 4</div>
    <div class="period">The Writings</div>
    <div class="legend" id="level-legend">How well you know each word: <span class="legend-item"><span class="swatch" data-level="new">${ALEF}${ALPHA}</span> New</span></div>
    <div class="prose" dir="rtl" lang="he">${verse(1, ALEF + GERESH, v1)}${verse(2, BET + GERESH, v2, PE)}</div>
    <div class="reader__end">Sources: Miqra according to the Masorah.</div>
  </div>
  <nav class="reader__nav"><button type="button">Next chapter</button></nav>
</div>`;
  return { words: [...v1, ...v2] };
}

beforeAll(() => {
  (globalThis as unknown as { jsdom?: { reconfigure(o: { url: string }): void } }).jsdom?.reconfigure({ url: 'https://rookie2401.github.io/biblia/#/read/psa/4' });
});

describe('Reading Analysis on a Biblia chapter', () => {
  it('reads the word buttons, and only them: no verse numbers, paragraph marks, legend, chrome or ordinary buttons', () => {
    const { words } = bibliaChapter();
    const x = extractReadingText({ doc: document, languageId: 'he', varietyId: 'he-bib', adapters: createAdapters(document), adapterOf: (l) => (l === 'he' ? heAdapter : undefined) });
    if (!x.ok) throw new Error(x.message);
    const hebrew = x.nodes.map((n) => n.data.trim()).filter((t) => /[֐-׿]/u.test(t));
    expect(hebrew).toEqual(words);
    const all = x.nodes.map((n) => n.data).join(' ');
    expect(all).not.toContain(GERESH);
    expect(all).not.toContain(` ${PE} `);
    expect(all).not.toContain(ALPHA);
    expect(all).not.toMatch(/Reading settings|Next chapter/);
  });

  it('a word button that declares another language is left out as foreign, not counted', () => {
    bibliaChapter();
    document.querySelector('.prose')!.insertAdjacentHTML('beforeend', `<span class="verse" data-v="3">${word('λόγος', 'el')}</span>`);
    const x = extractReadingText({ doc: document, languageId: 'he', varietyId: 'he-bib', adapters: createAdapters(document), adapterOf: () => heAdapter });
    if (!x.ok) throw new Error(x.message);
    expect(x.nodes.some((n) => n.data.includes('λ'))).toBe(false);
    expect(x.scope.foreignBlocks).toBe(1);
  });

  it('GoLearn Active is unchanged: its scanner, given no text controls, still leaves every button out', () => {
    bibliaChapter();
    const active = createScanner({ doc: document, adapterOf: () => heAdapter, viewport: 'all' });
    expect(active.textNodes(document).some((n) => n.parentElement?.tagName === 'BUTTON')).toBe(false);
    const reading = createScanner({ doc: document, adapterOf: () => heAdapter, viewport: 'all', textControls: [...READING_TEXT_CONTROLS] });
    const buttons = reading.textNodes(document).filter((n) => n.parentElement?.tagName === 'BUTTON').map((n) => n.data);
    expect(buttons).toEqual([YHWH, ELOHIM, ERETS, SHAMAYIM, ADAM, YHWH]); // the word buttons only; "Reading settings" and "Next chapter" stay out
  });

  it('the whole run: every word counted, and a language with no forms index is not reported as an offline dictionary', async () => {
    const { words } = bibliaChapter();
    const knowledge: ReadingSessionDeps['knowledge'] = async (req): Promise<ReadingKnowledgeReply> => req.op === 'snapshot'
      ? { ok: true, op: 'snapshot', snapshot: { id: 's1', authority: 'device', state: 'verified', verifiedAt: 1, unsent: 0 } }
      : { ok: true, op: 'classify', snapshot: req.snapshot, verdicts: req.words.map(() => ['below', 'new']), asked: req.words.length, answered: req.words.length };
    const confirmForms: ReadingSessionDeps['confirmForms'] = async () => ({ ok: true, forms: {}, reason: 'no-index' });
    const session = createReadingSession({ doc: document, adapters: createAdapters(document), languages: ['he'], adapterOf: (l) => (l === 'he' ? heAdapter : undefined), confirmForms, knowledge });
    session.handle({ type: MSG.readingAnalysis, op: 'start', languageId: 'he', varietyId: 'he-bib' });
    const t0 = Date.now();
    while (!['done', 'failed', 'canceled'].includes(session.status().stage) && Date.now() - t0 < 20_000) await new Promise((r) => setTimeout(r, 5));
    const s = session.status();
    expect(s.error).toBeUndefined();
    expect(s.stage).toBe('done');
    expect(s.result!.coverage.counts.total).toBe(words.length);
    expect(s.result!.dictionary).not.toBe('unavailable');
    expect(presentResult(s.result!).notes.map((n) => n.text).join(' ')).not.toMatch(/offline or not downloaded/);
  }, 30_000);
});
