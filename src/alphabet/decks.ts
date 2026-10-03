/**
 * The alphabet trainer's decks: one card per letter or sign, in the order they are taught (src/alphabet/thai.ts and hindi.ts hold
 * the data). This file holds the card shape, the lookup by language and the multiple-choice question for a card.
 *
 * A card is a single thing to recognise: `glyph` is what the learner sees, `answer` is the sound they must pick out of four
 * (the sound, or for a sign that has no sound of its own what it does), `details` are shown after the answer. The deck order is
 * the teaching order; the trainer cuts it into batches of 10 (src/alphabet/srs.ts).
 */
import type { LanguageCode } from '../core';
import { HINDI_CARDS, HINDI_NOTE } from './hindi';
import { THAI_CARDS, THAI_NOTE } from './thai';

export type AlphabetLang = 'th' | 'hi';

export type CardKind = 'consonant' | 'vowel' | 'vowel-sign' | 'tone-mark' | 'mark' | 'conjunct' | 'nukta';

export const KIND_LABEL: Record<CardKind, string> = {
  consonant: 'consonant', vowel: 'vowel', 'vowel-sign': 'vowel sign', 'tone-mark': 'tone mark', mark: 'sign', conjunct: 'conjunct', nukta: 'nukta letter',
};

/** One line of what is shown after answering: a label, its text, and optionally some script (shown in the language's font). */
export interface DetailLine {
  label: string;
  value: string;
  /** Text in the course language's script that belongs to this line (a letter's name, a sample syllable). */
  script?: string;
}

export interface AlphabetCard {
  /** Stable across releases: `<lang>:<kind>:<glyph>`; progress is stored under it. */
  id: string;
  glyph: string;
  kind: CardKind;
  /** What the learner must pick: the sound (or, for a sign without a sound, what it does). Never empty. */
  answer: string;
  /** The question, when it is not "What sound?". */
  prompt?: string;
  /** Said under the glyph when it is shown on a stand-in letter (◌, or a carrier such as ก or क). */
  carrier?: string;
  details: DetailLine[];
}

export interface AlphabetDeck {
  lang: AlphabetLang;
  /** "Thai letters". */
  title: string;
  /** Said once on the page about where the data came from and how far it can be trusted. */
  note: string;
  cards: AlphabetCard[];
}

export const DEFAULT_PROMPT = 'What sound?';

const DECKS: Record<AlphabetLang, AlphabetDeck> = {
  th: { lang: 'th', title: 'Thai letters', note: THAI_NOTE, cards: THAI_CARDS },
  hi: { lang: 'hi', title: 'Devanagari letters', note: HINDI_NOTE, cards: HINDI_CARDS },
};

export function isAlphabetLang(lang: string): lang is AlphabetLang {
  return lang === 'th' || lang === 'hi';
}

/** The deck for a course language, or undefined for a language the trainer does not teach. */
export function deckFor(lang: LanguageCode | string): AlphabetDeck | undefined {
  return isAlphabetLang(lang) ? DECKS[lang] : undefined;
}

export interface Choice {
  /** The answer text shown on the button. */
  text: string;
  correct: boolean;
}

/** The count of choices offered with every card. */
export const CHOICE_COUNT = 4;

function shuffled<T>(items: readonly T[], rand: () => number): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/**
 * Four choices for a card: its own answer and three distractors drawn from the same deck, from the same kind where the kind has
 * enough different answers, otherwise filled from the rest of the deck. No two choices have the same text: letters that share a
 * sound (the Thai ข ฃ ค ฅ ฆ are all "kh") are never offered as a distractor for each other, and the right answer appears once,
 * as the card's own. `rand` is injectable so a test can fix the order.
 */
export function choicesFor(deck: readonly AlphabetCard[], card: AlphabetCard, rand: () => number = Math.random): Choice[] {
  const taken = new Set<string>([card.answer]);
  const picked: string[] = [];
  const take = (pool: readonly AlphabetCard[]) => {
    for (const c of shuffled(pool, rand)) {
      if (picked.length >= CHOICE_COUNT - 1) return;
      if (taken.has(c.answer)) continue;
      taken.add(c.answer);
      picked.push(c.answer);
    }
  };
  take(deck.filter((c) => c.id !== card.id && c.kind === card.kind));
  take(deck.filter((c) => c.id !== card.id && c.kind !== card.kind));
  return shuffled<Choice>([{ text: card.answer, correct: true }, ...picked.map((text) => ({ text, correct: false }))], rand);
}
