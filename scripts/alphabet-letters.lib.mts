// What GoReview's Alphabet saved deck shows for a Thai or Hindi letter, worked out from the alphabet trainer's decks (src/alphabet):
// the glyph, the text on the card's back, and the kind of sign. scripts/alphabet-letters-build.mts writes the result into
// packages/language-packs/src/alphabet-sprint/letters-thhi.ts, and test/goreview-app/alphabet-deck.test.ts compares the two.
import { deckFor } from '../src/alphabet/decks';
import type { AlphabetCard } from '../src/alphabet/decks';

const detail = (c: AlphabetCard, label: string) => c.details.find((d) => d.label === label);

/** The back of a card: the sound first, then what a learner needs with it (a Thai consonant's name and class; where a sign is shown). */
export function backOf(lang: 'th' | 'hi', c: AlphabetCard): string {
  if (lang === 'th') {
    if (c.kind === 'consonant') {
      const name = detail(c, 'Name'), cls = detail(c, 'Class');
      return [c.answer, name ? `${name.value}${name.script ? ` (${name.script})` : ''}` : '', cls?.value ?? ''].filter(Boolean).join(' · ');
    }
    if (c.kind === 'tone-mark') { const name = detail(c, 'Name'); return `${c.answer}${name?.script ? ` (${name.script})` : ''}: a tone mark`; }
    return c.answer;
  }
  if (c.kind === 'vowel-sign') { const sign = detail(c, 'The sign'); return `${c.answer}${sign?.script ? ` · the vowel sign ${sign.script}, shown on क` : ''}`; }
  if (c.kind === 'conjunct') { const letters = detail(c, 'Letters'); return `${c.answer}${letters ? ` · ${letters.value}` : ''}`; }
  if (c.kind === 'mark') return `${c.answer} · shown on क`;
  return c.answer;
}

export type ScriptRow = readonly [glyph: string, back: string, kind: string];

/** Every card of the trainer's deck for the language, in its teaching order. */
export function rowsFor(lang: 'th' | 'hi'): ScriptRow[] {
  return deckFor(lang)!.cards.map((c) => [c.glyph, backOf(lang, c), c.kind] as const);
}
