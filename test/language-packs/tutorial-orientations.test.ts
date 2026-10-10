// @vitest-environment node
/**
 * The minimal orientations of the experimental packs (German, Hindi, Thai, Norwegian Bokmål and Nynorsk), and the registry that
 * returns one tutorial for each of the seven languages. Same standard as the Albanian one (tutorial.test.ts): flagged
 * machine-drafted and unreviewed everywhere they teach, plain text, and every practice target and example word read by the REAL
 * analyser. Nothing more is claimed: the check is of coverage, not of naturalness.
 */
import { describe, expect, it } from 'vitest';
import { deAdapter } from '../../src/adapters/de';
import { hiAdapter } from '../../src/adapters/hi';
import { nbAdapter } from '../../src/adapters/nb';
import { nnAdapter } from '../../src/adapters/nn';
import { thAdapter } from '../../src/adapters/th';
import type { LanguageAdapter } from '../../src/core';
import { audioOf } from '../../packages/golearn-extension/src/language/capabilities';
import { PACKS, TUTORIALS, readSelection, tutorialFor } from '../../packages/language-packs/src';
import type { Tutorial, TutorialStep } from '../../packages/language-packs/src';

const ADAPTERS: Record<string, LanguageAdapter> = { de: deAdapter, hi: hiAdapter, th: thAdapter, nb: nbAdapter, nn: nnAdapter };
const NEW = ['de', 'hi', 'th', 'nb', 'nn'];

/** The words a reader of the card would meet: every word of a sentence, read by the analyser, none of them a guess. */
const wordsOf = (a: LanguageAdapter, text: string) => a.analyze(a.tokenize(text)).filter((x) => x.token.isWord);

describe('the tutorial registry', () => {
  it('has one tutorial for each of the seven languages, in the pack registry’s order, and none for another language or an inherited key', () => {
    expect(Object.keys(TUTORIALS)).toEqual(Object.keys(PACKS));
    expect(Object.keys(TUTORIALS)).toEqual(['sq', 'es', 'de', 'hi', 'th', 'nb', 'nn']);
    for (const [id, t] of Object.entries(TUTORIALS)) {
      expect(tutorialFor(id), id).toBe(t);
      expect(t.languageId, id).toBe(id);
      expect(t.ref, id).toBe(`tutorial/${id}`);
    }
    expect(tutorialFor('xx')).toBeUndefined();
    expect(tutorialFor('constructor')).toBeUndefined();
    expect(tutorialFor('toString')).toBeUndefined();
  });

  it('every manifest points at its tutorial and agrees with its length', () => {
    for (const [id, t] of Object.entries(TUTORIALS)) {
      expect(PACKS[id].tutorial, id).toEqual({ ref: t.ref, estimatedMinutes: t.estimatedMinutes, skippable: true });
      expect(t.estimatedMinutes, id).toBe(t.steps.reduce((n, s) => n + s.estimatedMinutes, 0));
    }
  });
});

describe.each(NEW)('the %s orientation', (lang) => {
  const t: Tutorial = TUTORIALS[lang];
  const a = ADAPTERS[lang];
  const step = (id: string): TutorialStep => {
    const s = t.steps.find((x) => x.id === id);
    if (!s) throw new Error(`${lang}: no step ${id}`);
    return s;
  };

  it('is marked machine-drafted and unreviewed, skippable, and never claims a person checked it', () => {
    expect(t).toMatchObject({ authorship: 'machine-drafted', reviewed: false, reviewNeeded: 'native speaker', skippable: true });
    expect(t.notice).toMatch(/drafted by an AI model and has not been checked by a native speaker/);
    expect(t.notice).toMatch(/skip it/);
    expect(JSON.stringify(t)).not.toMatch(/native[- ]speaker[- ](verified|reviewed|approved|validated)/i);
    expect(PACKS[lang].rights.provenance.join(' ')).toContain(`The orientation (tutorial/${lang}) is minimal and AI-drafted for this pack and is not reviewed`);
  });

  it('has six to eight steps with unique ids, in plain text', () => {
    expect(t.steps.length).toBeGreaterThanOrEqual(6);
    expect(t.steps.length).toBeLessThanOrEqual(8);
    expect(new Set(t.steps.map((s) => s.id)).size).toBe(t.steps.length);
    for (const s of t.steps) {
      expect(s.body, s.id).not.toMatch(/[*_#`]|\]\(|<\w+>/);
      expect(s.body.length, s.id).toBeGreaterThan(40);
      expect(s.estimatedMinutes, s.id).toBeGreaterThan(0);
    }
  });

  it('covers how to select a word, what the card shows, a practice lookup, the script, first words and the honesty step', () => {
    const kinds = t.steps.map((s) => s.kind);
    for (const k of ['alphabet', 'words', 'concept', 'practice'] as const) expect(kinds, k).toContain(k);
    expect(t.steps.slice(0, 3).map((s) => s.id)).toEqual(['select-a-word', 'what-the-card-shows', 'practice-lookup']);
    expect(step('select-a-word').body).toMatch(/Click or tap a word/);
    expect(step('what-the-card-shows').body).toMatch(/lemma/);
    expect(step('what-the-card-shows').body).toMatch(/unconfirmed/);
    const honesty = step('honesty-experimental');
    expect(honesty.body).toMatch(/experimental and unreviewed/);
    expect(honesty.body).toMatch(/no native speaker has checked it/);
    expect(honesty.body).toMatch(/does not check what you write/);
    expect(honesty.body).toMatch(/trust a native speaker, a printed dictionary or a recording over it/);
  });

  it('has exactly one practice lookup, and its target is a word of one of the pack’s own validation sentences that the real analyser reads', () => {
    const tasks = t.steps.filter((s) => s.practice);
    expect(tasks.map((s) => s.id)).toEqual(['practice-lookup']);
    const p = tasks[0].practice!;
    expect(p.sentence).toContain(p.target);
    expect(PACKS[lang].validation.some((c) => c.sentence === p.sentence && c.surface === p.target), 'a validation case of the pack').toBe(true);
    const r = readSelection(a, p.target, p.sentence);
    expect(r.found).toBe(true);
    expect(r.top).toBeDefined();
    expect(r.top!.confidence).toBeGreaterThanOrEqual(0.5);
    expect(r.top!.unconfirmed).not.toBe(true);
    expect(p.instruction.length).toBeGreaterThan(10);
  });

  it('every example word and every example sentence is read by the real analyser (no guesses, confidence of at least 0.5)', () => {
    let checked = 0;
    for (const s of t.steps) for (const e of s.examples ?? []) {
      expect(e.gloss.length, `${s.id}: ${e.surface}`).toBeGreaterThan(0);
      const isSentence = /\s/u.test(e.surface.trim()) && s.kind === 'patterns';
      if (isSentence) {
        for (const w of wordsOf(a, e.surface)) {
          expect(w.candidates[0]?.confidence ?? 0, `${w.token.surface} in “${e.surface}”`).toBeGreaterThanOrEqual(0.5);
          expect(w.candidates[0]?.unconfirmed, `${w.token.surface} is a guess`).not.toBe(true);
        }
      } else {
        const r = readSelection(a, e.surface);
        expect(r.top, `${s.id}: ${e.surface}`).toBeDefined();
        expect(r.top!.confidence, `${s.id}: ${e.surface}`).toBeGreaterThanOrEqual(0.5);
        expect(r.top!.unconfirmed, `${s.id}: ${e.surface} is a guess`).not.toBe(true);
      }
      checked++;
    }
    expect(checked).toBeGreaterThanOrEqual(12);
  });

  it('has a words step of 8 to 9 common words', () => {
    const w = step('words-first').examples!;
    expect(w.length).toBeGreaterThanOrEqual(8);
    expect(w.length).toBeLessThanOrEqual(9);
  });

  it('says honestly what the pack cannot do, using the pack’s own thin parts', () => {
    const h = step('honesty-experimental').body;
    expect(h).toMatch(/seed-only/);
    expect(h).toMatch(/Lemmatisation is seed-only/);
    expect(h).toMatch(/real books or pages/);
    expect(h).toMatch(/subject or object labels/);
  });
});

describe('what each orientation teaches about its own script or standard', () => {
  it('German: the umlauts, ß and the capital letter on every noun, with a compound written as one word', () => {
    const s = TUTORIALS.de.steps.find((x) => x.id === 'alphabet-umlauts')!;
    for (const l of ['ä', 'ö', 'ü', 'ß', 'Eszett', 'capital letter', 'compound']) expect(s.body, l).toContain(l);
    expect(s.examples!.map((e) => e.surface)).toEqual(['Tür', 'früh', 'groß', 'Wohnzimmer']);
  });

  it('Hindi: the inherent vowel, the matra, the nukta, the chandrabindu, the halant and the danda', () => {
    const s = TUTORIALS.hi.steps.find((x) => x.id === 'alphabet-devanagari')!;
    for (const l of ['Devanagari', 'matra', 'nukta', 'chandrabindu', 'halant', 'danda', '।']) expect(s.body, l).toContain(l);
    expect(s.examples!.length).toBeGreaterThanOrEqual(4);
    expect(TUTORIALS.hi.steps.find((x) => x.id === 'honesty-experimental')!.body).toMatch(/Marathi, Nepali and Sanskrit/);
  });

  it('Thai: 44 consonants, vowels around the consonant, four tone marks, no word spaces and the weak segmentation', () => {
    const s = TUTORIALS.th.steps.find((x) => x.id === 'alphabet-thai')!;
    for (const l of ['44 consonant', 'before, after, above or below', 'Four tone marks', 'no spaces between words', 'no capital letters']) expect(s.body, l).toContain(l);
    expect(TUTORIALS.th.steps.find((x) => x.id === 'honesty-experimental')!.body).toMatch(/Word segmentation is the weakest part/);
  });

  it.each(['nb', 'nn'])('%s: æ ø å, the two written standards with neither assumed for the other, the definite ending, and no guess from "no"', (lang) => {
    const t = TUTORIALS[lang];
    const letters = t.steps.find((x) => x.id === 'alphabet-ae-oe-aa')!;
    for (const l of ['æ', 'ø', 'å']) expect(letters.body, l).toContain(l);
    const standards = t.steps.find((x) => x.id === 'written-standards')!;
    expect(standards.body).toMatch(/two official written standards, Bokmål and Nynorsk/);
    expect(standards.body).toMatch(/neither is the default for the other/);
    expect(standards.body).toMatch(/never counted as a (Nynorsk|Bokmål) word you know, or the other way round/);
    expect(standards.body).toMatch(/says only “no” \(Norwegian\) does not say which standard it is written in, so GoLearn does not guess/);
    expect(standards.body).toMatch(/speech is not Bokmål or Nynorsk: there is no official spoken standard/);
    expect(standards.body).toContain(lang === 'nb' ? 'This pack reads Bokmål' : 'This pack reads Nynorsk');
    expect(standards.examples!.length).toBe(4);
    const pattern = t.steps.find((x) => x.id === 'pattern-definite-ending')!;
    expect(pattern.examples).toHaveLength(3);
    expect(pattern.body).toMatch(/Definite/);
  });

  it('the Bokmål and Nynorsk orientations do not share a sentence, so neither is credited for the other', () => {
    const sentences = (id: string): string[] => TUTORIALS[id].steps.filter((s) => s.kind === 'patterns').flatMap((s) => (s.examples ?? []).map((e) => e.surface));
    expect(sentences('nb').filter((s) => sentences('nn').includes(s))).toEqual([]);
    expect(TUTORIALS.nb.steps.find((s) => s.practice)!.practice!.sentence).not.toBe(TUTORIALS.nn.steps.find((s) => s.practice)!.practice!.sentence);
  });
});

describe('the sound statements are true of GoListen today (a change there must change the orientation)', () => {
  it.each(['de', 'hi', 'th'])('%s: no voice can read it aloud, so the "cannot play a word yet" step is accurate', (lang) => {
    const a = audioOf(lang);
    expect(a.deviceVoiceTemplate, lang).toBe(false);
    expect(a.remoteVoices, lang).toEqual([]);
    const s = TUTORIALS[lang].steps.find((x) => x.id === 'sound-and-audio')!;
    expect(s.body).toMatch(/GoListen holds no voice that can read .* text aloud/);
    expect(s.body).toMatch(/a remote voice only after you give consent and supply your own key/);
    expect(s.body).toMatch(/never counted as evidence that you can understand speech/);
  });

  it('German holds one demonstration clip and says it is not a pronunciation resource', () => {
    expect(audioOf('de').recordings).toBe(1);
    expect(TUTORIALS.de.steps.find((x) => x.id === 'sound-and-audio')!.body).toMatch(/one short demonstration clip, which is not a pronunciation resource/);
  });

  it.each(['nb', 'nn'])('%s: no voice and no recording in GoListen, as the honesty step says', (lang) => {
    const a = audioOf(lang);
    expect(a).toMatchObject({ recordings: 0, deviceVoiceTemplate: false, remoteVoices: [] });
    expect(TUTORIALS[lang].steps.find((x) => x.id === 'honesty-experimental')!.body).toMatch(/GoListen holds no voice that can read Norwegian aloud, so a card cannot play a word yet/);
  });
});
