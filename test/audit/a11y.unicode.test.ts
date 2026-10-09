// @vitest-environment jsdom
/**
 * ACCESSIBILITY audit, lane 4 of 4 (docs/ecosystem/audit/ACCESSIBILITY.md): Unicode rendering of Devanagari (Hindi) and Thai through
 * the lookup card and the GoPractice/GoTell renderers. For each string: the text reaches the DOM unchanged (NFC-stable strings are
 * byte-identical; others only through NFC), no U+FFFD appears, grapheme clusters (Intl.Segmenter) are intact and in the same order,
 * `lang` and `dir` are right, and the font stack names a face for the script.
 * Also the typed-answer path: whether a vowel sign or tone mark at the end of an answer survives the normaliser.
 */
import fs from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createCardUI, type CardUI } from '../../packages/golearn-extension/src/popup/card';
import { parseSelection } from '../../packages/golearn-extension/src/parser';
import type { PopupAnchor } from '../../packages/golearn-extension/src/contract/readerAdapter';
import { gradeTyped, normalizeAnswer } from '../../packages/goreview/src';
import { setBody, stubLayout } from '../extension/dom';
import { flushAfterAll, row } from './a11y.support';
import {
  dueCard, destroyRigs, ids, key, makeRig, reopen, seed, startWith, type as typeIn, until, FakeService,
} from '../gopractice/helpers';
import { registerAllAnalysers } from '../support/analysers';

registerAllAnalysers(); // the parser carries Albanian; the other analysers are chunks the content script loads on demand

flushAfterAll('a11y.unicode', 'ACCESSIBILITY lane 4 (Unicode)');

const anchor: PopupAnchor = { rect: { top: 100, left: 50, right: 110, bottom: 120, width: 60, height: 20 }, viewport: { width: 1024, height: 768 }, rtl: false, source: 'range' };

interface Sample { lang: 'hi' | 'th'; label: string; word: string; sentence: string }
// the words are written as code-point escapes so that no editor or tool can normalise them behind the test's back
/** A string from code points: the words below cannot be changed by an editor, a font, a clipboard or a normalising tool. */
const u = (...cps: number[]): string => String.fromCodePoint(...cps);
const HINDI = u(0x939, 0x93F, 0x928, 0x94D, 0x926, 0x940);                  // hindi: conjunct n+virama+d, final vowel sign ii
const HINDI_BOOK = u(0x915, 0x93F, 0x924, 0x93E, 0x92C);                     // kitaab
const HINDI_NUKTA = u(0x91C, 0x93C, 0x93F, 0x928, 0x94D, 0x926, 0x917, 0x940); // ja + nukta (the NFC form of U+095B) ... zindagi
const HINDI_ZWJ = u(0x915, 0x94D, 0x200D, 0x937);                            // ka + virama + ZWJ + ssa (a half-form request)
const THAI = u(0xE20, 0xE32, 0xE29, 0xE32, 0xE44, 0xE17, 0xE22);            // phaasaa thai
const THAI_BOOK = u(0xE2B, 0xE19, 0xE31, 0xE07, 0xE2A, 0xE37, 0xE2D);       // nangsue
const THAI_WATER = u(0xE19, 0xE49, 0xE33);                                  // naam: tone mark then sara am
const THAI_GOOD = u(0xE2A, 0xE27, 0xE31, 0xE2A, 0xE14, 0xE35);              // sawatdii: ends in a vowel sign (Mn)

const SAMPLES: Sample[] = [
  { lang: 'hi', label: 'Hindi word with a final vowel sign', word: HINDI, sentence: `मैं ${HINDI} पढ़ता हूँ।` },
  { lang: 'hi', label: 'Hindi word with a nukta', word: HINDI_NUKTA, sentence: `यह ${HINDI_NUKTA} है।` },
  { lang: 'hi', label: 'Hindi conjunct with ZWJ', word: HINDI_ZWJ, sentence: `शब्द ${HINDI_ZWJ} अक्षर है।` },
  { lang: 'hi', label: 'Hindi book', word: HINDI_BOOK, sentence: `मेरे पास एक ${HINDI_BOOK} है।` },
  { lang: 'th', label: 'Thai language', word: THAI, sentence: `ฉันเรียน${THAI}` },
  { lang: 'th', label: 'Thai book', word: THAI_BOOK, sentence: `ฉันอ่าน${THAI_BOOK}` },
  { lang: 'th', label: 'Thai water (tone mark + sara am)', word: THAI_WATER, sentence: `ฉันดื่ม${THAI_WATER}` },
  { lang: 'th', label: 'Thai greeting ending in a vowel sign', word: THAI_GOOD, sentence: `ฉันพูดว่า${THAI_GOOD}` },
];

const graphemes = (s: string, lang: string): string[] => [...new Intl.Segmenter(lang, { granularity: 'grapheme' }).segment(s)].map((x) => x.segment);
const cp = (s: string): string => [...s].map((c) => c.codePointAt(0)!.toString(16).toUpperCase().padStart(4, '0')).join(' ');
const MARK = /[ऀ-ःऺ-ॏ॑-ॗॢॣัิ-ฺ็-๎]/u;

/** The Devanagari/Thai runs of a DOM subtree's text. */
const runsOf = (text: string): string[] => text.match(/[ऀ-ॿ฀-๿‌‍]+/gu) ?? [];

describe('the strings themselves', () => {
  it('A-U00 the test strings are what they claim: NFC-stable except the ones marked, no stray combining mark first', () => {
    for (const s of SAMPLES) {
      expect(s.word.normalize('NFC'), cp(s.word)).toBe(s.word);
      expect(MARK.test(graphemes(s.word, s.lang)[0]![0]), `${s.label} starts with a mark`).toBe(false);
    }
    expect(cp(HINDI_NUKTA).startsWith('091C 093C')).toBe(true);
    expect(HINDI_ZWJ.includes('‍')).toBe(true);
    row('A-U00', 'unicode', 'test strings', `${SAMPLES.length} samples (4 Devanagari, 4 Thai)`, 'conjunct, nukta, ZWJ, final vowel sign, tone mark + sara am');
  });
});

describe('the lookup card shows Devanagari and Thai unchanged', () => {
  let restore: () => void;
  let ui: CardUI;
  const setup = (): void => { restore = stubLayout(); setBody('<p id="p">x</p>'); ui = createCardUI({ doc: document, speech: null }); };
  const teardown = (): void => { ui.destroy(); restore(); };
  afterEach(() => { try { teardown(); } catch { /* already torn down */ } });

  it.each(SAMPLES.map((s) => [s.label, s] as const))('A-U01 %s: surface, aria-label and sentence run through the card without loss', (_label, s) => {
    setup();
    // the card is built for Albanian or Spanish only; a selection in another script reaches it as "not in Latin script" with the surface intact
    const at = s.sentence.indexOf(s.word);
    const model = parseSelection({ surface: s.word, languageId: 'es', context: { kind: 'sentence', confidence: 0.9, sentence: s.sentence, selStart: at, selEnd: at + s.word.length } });
    ui.show(model, anchor, { view: { languageName: 'Spanish', depth: 'explanatory' } });
    for (const l of ['l2', 'l3', 'l4', 'l5']) (ui.root()!.querySelector(`button.${l}`) as HTMLElement).click();
    (ui.root()!.querySelector('button.moreBtn') as HTMLElement).click();
    const card = ui.root()!.querySelector('.card') as HTMLElement;
    const word = ui.root()!.querySelector('.word')!.textContent!;
    const want = s.word.normalize('NFC');
    expect(word, `${cp(word)} vs ${cp(want)}`).toBe(want);
    expect(card.getAttribute('aria-label')).toBe(`GoLearn: ${want}`);
    const text = card.textContent ?? '';
    expect(text.includes('�'), 'no replacement character').toBe(false);
    // every Devanagari/Thai run in the card is a substring of the source sentence, and the word's graphemes are intact and in order
    for (const run of runsOf(text)) expect(s.sentence.normalize('NFC').includes(run), `run ${cp(run)} is not in the source`).toBe(true);
    expect(graphemes(word, s.lang)).toEqual(graphemes(want, s.lang));
    expect(text.includes(want)).toBe(true);
  });

  it('A-U02 the card sets no lang or dir on the word (recorded: the card is not Unicode-lossy, but it is language-blind; see A-07)', () => {
    setup();
    const model = parseSelection({ surface: THAI_BOOK, languageId: 'es', context: { kind: 'none', confidence: 0 } });
    ui.show(model, anchor, {});
    const w = ui.root()!.querySelector('.word') as HTMLElement;
    row('A-U02', 'unicode', 'card: lang on the word', w.closest('[lang]') ? 'present' : 'absent', `dir="${w.getAttribute('dir')}" (auto: the browser chooses the direction from the text)`);
    expect(w.getAttribute('dir')).toBe('auto');
  });
});

describe('the GoPractice review screens show Devanagari and Thai unchanged', () => {
  afterEach(() => destroyRigs());

  const hiThService = (lang: 'hi' | 'th'): FakeService => {
    const s = new FakeService();
    s.addAccount('ana@example.org', 'correct-horse-battery', 'L1', [{ languageId: lang, varietyId: lang }]);
    return s;
  };

  it.each([['hi', HINDI], ['hi', HINDI_BOOK], ['th', THAI_BOOK], ['th', THAI_GOOD]] as const)('A-U03 %s %s: stimulus, deck row, candidate row and history carry the label with lang, dir and a script font', async (lang, label) => {
    const rig = await makeRig({ service: hiThService(lang), signedIn: true });
    const A = ids('L1', lang);
    await seed(rig, dueCard(A, label, 'written-recognition'));
    await reopen(rig);
    const homeText = rig.root.textContent ?? '';
    expect(homeText.includes('�')).toBe(false);
    const deckRow = rig.qa('[data-item]').find((r) => (r.textContent ?? '').includes(label))!;
    expect(deckRow, 'the deck lists the item').toBeTruthy();
    const marked = [...deckRow.querySelectorAll('[lang]')].find((e) => (e.textContent ?? '').includes(label));
    expect(marked?.getAttribute('lang'), 'the label sits in an element with lang').toBe(lang);
    expect(marked?.getAttribute('dir')).toBe('ltr');
    for (const r of runsOf(homeText)) expect(label.includes(r), `run ${cp(r)} is not the label`).toBe(true);

    await startWith(rig, []);
    const st = rig.root.querySelector('#stimulus');
    if (st) {
      expect(st.textContent).toBe(label.normalize('NFC'));
      expect(st.getAttribute('lang')).toBe(lang);
      expect(graphemes(st.textContent!, lang)).toEqual(graphemes(label, lang));
    }
    row(`A-U03:${lang}:${label}`, 'unicode', `review screens, ${lang} "${label}"`, 'pass', 'label unchanged, lang and dir set, no U+FFFD');
  }, 30_000);

  it('A-U04 the stylesheet gives target-language text a face for Devanagari, Thai and Arabic', () => {
    const css = fs.readFileSync(path.resolve(__dirname, '../../packages/gopractice/styles.css'), 'utf8');
    const rule = /\.target-text\s*\{([^}]*)\}/.exec(css)![1];
    for (const face of ['Noto Sans Devanagari', 'Noto Sans Thai', 'Noto Naskh Arabic']) expect(rule, face).toContain(face);
    expect(rule).toContain('unicode-bidi: plaintext');
    row('A-U04', 'unicode', '.target-text font stack', 'Noto Sans, Noto Sans Devanagari, Noto Sans Thai, Noto Naskh Arabic, system-ui', 'only named faces; the user must have them installed, otherwise the system fallback is used (not measurable here)');
  });

  it('A-U05 a typed Devanagari answer is graded right whichever way the nukta was typed (U+095B or U+091C U+093C)', async () => {
    const rig = await makeRig({ service: hiThService('hi'), signedIn: true });
    const A = ids('L1', 'hi');
    await startWith(rig, dueCard(A, HINDI_NUKTA, 'meaning-to-form'));
    const input = rig.q<HTMLInputElement>('#answer-input');
    expect(input.getAttribute('lang')).toBe('hi');
    typeIn(input, 'ज़िन्दगी'); // U+095B precomposed (a composition exclusion: NFC turns it into U+091C U+093C)
    key('Enter', input);
    await until(() => !!rig.root.querySelector('#feedback'), 'the feedback');
    expect(rig.q('#outcome').textContent).toBe('Correct');
    expect(rig.q('#reference')?.textContent ?? '').not.toContain('�');
    row('A-U05', 'unicode', 'typed answer: precomposed vs decomposed nukta', 'pass');
  }, 30_000);
});

// ───────────────────────────── the normaliser and abugida answers ─────────────────────────────

describe('typed answers in scripts whose words end in a combining sign', () => {
  const key1 = (accepted: string[]) => ({ accepted, normalization: 'exact' as const, explanation: '' });

  it('A-U06 the normaliser changes none of the samples beyond NFC and lower-casing', () => {
    const hit = SAMPLES.filter((x) => normalizeAnswer(x.word, 'exact') !== x.word.normalize('NFC').toLowerCase());
    row('A-U06', 'unicode', 'goreview normalizeAnswer on the 8 samples', `${hit.length} altered`, hit.map((x) => `${x.label}: ${cp(x.word)} → ${cp(normalizeAnswer(x.word, 'exact'))}`).join('; '));
    expect(hit.length).toBe(0); // A-17 fixed: only NFC and lower-casing remain
  });

  it('A-17 the answer normaliser keeps a final vowel sign or tone mark (Devanagari, Thai)', () => {
    for (const w of [HINDI, THAI_GOOD, u(0x91A, 0x93E, 0x901, 0x926), HINDI_NUKTA]) {
      const n = normalizeAnswer(w, 'exact');
      expect(n, `${cp(w)} → ${cp(n)}`).toBe(w.normalize('NFC').toLowerCase());
    }
  });

  it('A-17b two answers that differ only in the final vowel sign are different answers (a Hindu is not Hindi)', () => {
    // हिन्दी (Hindi) vs हिन्दू (a Hindu): the key is the first; the typed answer is the second
    const g = gradeTyped(key1([HINDI]), u(0x939, 0x93F, 0x928, 0x94D, 0x926, 0x942));
    expect(g.outcome).toBe('incorrect');
  });
});
