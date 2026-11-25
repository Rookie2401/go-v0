/**
 * Alphabet: a permanent saved deck in every language, one card a letter (the owner, 2026-11-14: "In the saved decks for every language,
 * create and add an alphabet vocab deck"). It stands beside Class Essentials and works the same way (classEssentials.ts): the cards belong to
 * the Saved decks system and are asked through the ordinary flashcard flow (the letter on the front, "Recall the meaning", its name and sound
 * on the back, Hear word through GoListen). They need no Repository unit: the letter is the card, its unit id is
 * `class:<language>-alphabet:<letter>` (the third part is what the screens show as the card's label), and `alphabetFacts` answers the exercise
 * engine with the back of the card. The `class:` prefix keeps the letters out of the ordinary queue, My vocab and the candidates, exactly as
 * it does the Class Essentials phrases.
 *
 * The letters: alphabetLetters.ts for the Latin, Greek and Hebrew scripts (written by hand for this deck), alphabetLetters.thhi.ts for Thai
 * and Hindi (written by a script from the reader's own spelling tables). None has been reviewed by a native speaker or a teacher, and each
 * deck's `notes` say so.
 */
import type { UnitFacts } from '../src/types';
import type { LinguisticUnit } from '../../repository-contract/src';
import type { DeckEntry, SavedDeck } from './deckModel';
import { HAND_LETTERS } from './alphabetLetters';
import { HI_LETTERS, TH_LETTERS } from './alphabetLetters.thhi';
import { isSprintUnitId } from '../../language-packs/src/alphabet-sprint/ids';

export const ALPHABET_NAME = 'Alphabet';
export const ALPHABET_DESCRIPTION = 'Alphabet Sprint: a few letters at a time, chosen for the real words they let you read.';

const NOTES_DEFAULT = 'The letter names and the sound hints were written for this deck and are not yet reviewed by a native speaker. A sound hint is an approximation for an English speaker.';
const NOTES: Readonly<Record<string, string>> = {
  th: 'Machine-drafted from the reader’s spelling rules and standard references; not yet checked by a Thai teacher or native speaker. The consonants, then the vowels as patterns (◌ stands for the consonant), then the tone marks.',
  hi: 'Machine-drafted from the reader’s transliteration tables and standard references; not yet checked by a Hindi teacher or native speaker. The vowels, the consonants, the vowel signs and marks (shown on क), the conjuncts and the nukta letters.',
  la: 'Written for this deck and not yet reviewed by a Latinist. The letters are those the Clementine Vulgate prints (i and j, u and v apart); the Church Latin sound comes first, the classical one where it differs.',
  el: 'Written for this deck and not yet reviewed by a native speaker or a Hellenist. The names are the Modern Greek ones; the Modern sound comes first, the classroom value for ancient Greek where it differs.',
  he: 'Written for this deck and not yet reviewed by a native speaker or a Hebraist. The names and sounds are those of Modern Hebrew; the five final shapes are cards of their own.',
  arc: 'Written for this deck and not yet reviewed by an Aramaist. The names identify the letters and the back gives the conventional transliteration; neither is a recording of how Aramaic was spoken.',
  ru: 'Written for this deck and not yet reviewed by a native speaker. Each back gives the letter’s Russian name, an approximate sound for an English speaker, and what it is easily mistaken for; several letters that look Latin sound different (В, Н, Р, С, У, Х).',
  fr: 'Written for this deck and not yet reviewed by a native speaker. The letters with their French names, the accented letters, then the spelling patterns of the optional Decoding Sprint (ou, oi, eau, the nasal vowels, the silent endings): each sound is the usual one in the French of France, and regional French differs.',
  ar: 'Written for this deck and not yet reviewed by a native speaker or an Arabist. The 28 letters of the Arabic alphabet in order, each with its name, an approximate sound for an English speaker, how it is transliterated, its dots and its four shapes (alone, at the start, in the middle, at the end of a word), and what it is easily mistaken for. The sounds are one usual value of Modern Standard Arabic; regional speech differs.',
};

const ALIASES: Readonly<Record<string, string>> = { no: 'nb', nob: 'nb', nno: 'nn', grc: 'el' };

/** [what the card shows, what its back says] for a language's letters, in alphabet order. */
const LETTERS: Readonly<Record<string, ReadonlyArray<readonly [string, string, ...string[]]>>> = { ...HAND_LETTERS, th: TH_LETTERS, hi: HI_LETTERS };

/** The languages that have an Alphabet deck. */
export const ALPHABET_LANGUAGES: readonly string[] = Object.keys(LETTERS);

/** The alphabet language a language id (`hi`, `sq-AL`, `no`, `el-koi` …) belongs to, or undefined when there is no deck for it. */
export function alphabetLanguageOf(languageId: string): string | undefined {
  const base = languageId.split('-')[0].toLowerCase();
  const wanted = ALIASES[base] ?? base;
  return Object.prototype.hasOwnProperty.call(LETTERS, wanted) ? wanted : undefined;
}

export interface AlphabetCard { glyph: string; back: string; unitId: string }

/** The cards of one language, in alphabet order. No two cards share a unit id (a repeated letter would be dropped). */
export function alphabetCards(languageId: string): AlphabetCard[] {
  const lang = alphabetLanguageOf(languageId);
  if (!lang) return [];
  const seen = new Set<string>();
  const cards: AlphabetCard[] = [];
  for (const [glyph, back] of LETTERS[lang]) {
    const unitId = `class:${lang}-alphabet:${glyph}`;
    if (seen.has(unitId)) continue;
    seen.add(unitId);
    cards.push({ glyph, back, unitId });
  }
  return cards;
}

/** A unit of an Alphabet deck (it is a class unit too: kept out of the ordinary queue, My vocab and the candidates). */
export const isAlphabetUnit = (unitId: string): boolean => isSprintUnitId(unitId);

export const alphabetDeckId = (languageId: string): string => `alphabet:${alphabetLanguageOf(languageId) ?? languageId}`;

/** The saved deck for a language, with the flashcard cards as its items; undefined when the language has none. */
export function alphabetDeckFor(languageId: string, varietyId: string | undefined, savedAt: string): SavedDeck | undefined {
  const lang = alphabetLanguageOf(languageId);
  const cards = alphabetCards(languageId);
  if (!lang || !cards.length) return undefined;
  const items: DeckEntry[] = cards.map((c) => ({
    itemId: `card:written-recognition:${c.unitId}`, unitId: c.unitId, unitKind: 'lexeme', label: c.glyph, dimension: 'written-recognition', family: 'written-recognition',
  }));
  return {
    id: alphabetDeckId(languageId), savedAt, languageId: lang, ...(varietyId ? { varietyId } : {}), items,
    name: ALPHABET_NAME, description: ALPHABET_DESCRIPTION, notes: NOTES[lang] ?? NOTES_DEFAULT, builtin: 'alphabet',
  };
}

/** What the exercise engine is told about a letter: the letter, and the back of its card as the meaning. Nothing is invented beyond the table. */
export function alphabetFacts(unitId: string, languageId: string): UnitFacts | undefined {
  if (!isAlphabetUnit(unitId)) return undefined;
  const lang = alphabetLanguageOf(languageId);
  const card = lang ? alphabetCards(lang).find((c) => c.unitId === unitId) : undefined;
  if (!card || !lang) return undefined;
  const unit: LinguisticUnit = {
    unitId, kind: 'lexeme', languageId: lang, label: card.glyph, packId: 'alphabet-deck', packVersion: '1',
    provenance: { source: 'hand-lexicon', ref: 'alphabet-deck@1', confidence: 0.9, origin: 'pack-lexicon', validation: 'unreviewed' },
    status: 'provisional', createdAt: '2026-11-14T00:00:00.000Z',
  } as LinguisticUnit;
  return {
    unit, relations: [], analyses: [], status: 'provisional', lemma: card.glyph, glosses: [card.back], constructionIds: [], featureExplanations: {},
    siblingForms: [], exampleSentences: [], pronunciationNotes: [],
    // the back is the deck's own, so it counts as a word-list gloss (a long one is kept whole)
    lexiconGlossCount: 1,
  } as UnitFacts;
}
