/**
 * Guesses for a word the lexicon does not hold. They are labelled as guesses (`lemmaKnown: false`), never above 0.6,
 * at most four, and never a strong verb: a strong verb cannot be recognised from its spelling. A capitalised word is
 * guessed as a noun only; a lower-case one as a weak verb or an adjective.
 */
import type { DeCell, DeReading } from './types';
import { morphOfCells } from './types';
import { endingCells } from './morph-adjective';
import { describeGermanMorph } from './morph-describe';
import { PREFIX_GE, PREFIX_GE_PARTICIPLE } from './morph-separable';
import { isCapitalised, needsEInsertion } from './morph-util';

const MAX_GUESSES = 4;
const ALL_CASES = 'Nom,Acc,Dat,Gen';

interface Guess { reading: DeReading; score: number }

function guess(g: Omit<DeReading, 'confidence' | 'lemmaKnown'>, score: number): Guess {
  return { reading: { ...g, confidence: Math.min(0.6, Math.max(0.1, Number(score.toFixed(2)))), lemmaKnown: false }, score };
}

const plural = (...cases: Array<'N' | 'A' | 'D' | 'G'>): DeCell[] => cases.map((c) => ({ c, g: 'p' }));
const genitive: DeCell[] = [{ c: 'G', g: 'm' }, { c: 'G', g: 'n' }];

// ---------------------------------------------------------------------------------------------------------------
// nouns

/** Endings of a noun form worth stripping, most plausible first; `cells` are what a form in that ending can be. */
const NOUN_ENDINGS: Array<{ end: string; score: number; cells: DeCell[] }> = [
  { end: 'es', score: 0.4, cells: genitive },
  { end: 'en', score: 0.38, cells: plural('N', 'A', 'D', 'G') },
  { end: 'er', score: 0.36, cells: plural('N', 'A', 'G') },
  { end: 'e', score: 0.34, cells: plural('N', 'A', 'G') },
  { end: 'n', score: 0.32, cells: plural('N', 'A', 'D', 'G') },
  { end: 's', score: 0.3, cells: genitive },
];

function nounGuesses(surface: string): Guess[] {
  // the word itself, every case; no number and no gender claimed
  const everyCell = (['N', 'A', 'D', 'G'] as const).flatMap((c) => (['m', 'f', 'n', 'p'] as const).map((g) => ({ c, g })));
  const out: Guess[] = [guess({
    lemma: surface, pos: 'NOUN', morph: { Case: ALL_CASES }, cells: everyCell,
    rule: 'guessed noun (capitalised, not in the word list): the word itself as lemma; case, number and gender not known',
  }, 0.5)];
  for (const e of NOUN_ENDINGS) {
    if (!surface.endsWith(e.end) || surface.length - e.end.length < 3) continue;
    const lemma = surface.slice(0, -e.end.length);
    const morph = morphOfCells(e.cells);
    out.push(guess({
      lemma, pos: 'NOUN', morph, cells: e.cells.map((c) => ({ ...c })),
      rule: `guessed noun ${lemma} (not in the word list): ending -${e.end} taken off; ${describeGermanMorph(morph)}`,
    }, e.score));
  }
  return out;
}

// ---------------------------------------------------------------------------------------------------------------
// weak verbs and adjectives

const ADJECTIVAL_STEM = /(?:ig|lich|isch|bar|sam|haft|los|voll|end)$/;

const PRET = { VerbForm: 'Fin', Mood: 'Ind', Tense: 'Past' };
const PRES = { VerbForm: 'Fin', Mood: 'Ind', Tense: 'Pres' };
const VERB_ENDINGS: Array<{ end: string; score: number; morph: Record<string, string> }> = [
  { end: 'ten', score: 0.5, morph: { ...PRET, Person: '1,3', Number: 'Plur' } },
  { end: 'test', score: 0.5, morph: { ...PRET, Person: '2', Number: 'Sing' } },
  { end: 'tet', score: 0.45, morph: { ...PRET, Person: '2', Number: 'Plur' } },
  { end: 'te', score: 0.5, morph: { ...PRET, Person: '1,3', Number: 'Sing' } },
  { end: 'en', score: 0.5, morph: { VerbForm: 'Inf' } },
  { end: 'st', score: 0.4, morph: { ...PRES, Person: '2', Number: 'Sing' } },
  { end: 't', score: 0.35, morph: { ...PRES, Person: '3', Number: 'Sing' } },
  { end: 'e', score: 0.35, morph: { ...PRES, Person: '1', Number: 'Sing' } },
];

/** The infinitive of a weak stem: -en, or -n after -el / -er (sammel → sammeln, wander → wandern). */
const infinitiveOf = (stem: string): string => (/(?:el|er)$/.test(stem) ? `${stem}n` : `${stem}en`);

function verbGuesses(word: string): Guess[] {
  const out: Guess[] = [];
  if (PREFIX_GE.test(word)) {
    // prefix + ge-: the shape of a separable verb's participle (abgeschickt). Never an infinitive with ge- inside it
    // (abgeschicken), never a finite form of such a verb: only the participle, with the lemma rebuilt without ge-.
    const p = PREFIX_GE_PARTICIPLE.exec(word);
    return p ? [guess({
      lemma: `${p[1]}${infinitiveOf(p[2])}`, pos: 'VERB', morph: { VerbForm: 'Part', Tense: 'Past' },
      rule: `guessed past participle of a verb not in the word list: the separable prefix ${p[1]}- + ge- + stem + -t; `
        + `the lemma is rebuilt as ${p[1]}${infinitiveOf(p[2])} (ge- left out), unconfirmed; the meaning and the auxiliary are not known`,
    }, 0.45)] : [];
  }
  const m = /^ge(.{3,}?)(e?t)$/.exec(word);
  if (m) {
    out.push(guess({
      lemma: infinitiveOf(m[1]), pos: 'VERB', morph: { VerbForm: 'Part', Tense: 'Past' },
      rule: 'guessed weak verb (not in the word list): past participle, ge- + stem + -t',
    }, 0.5));
  }
  for (const e of VERB_ENDINGS) {
    if (!word.endsWith(e.end) || word.length - e.end.length < 3) continue;
    let stem = word.slice(0, -e.end.length);
    if (e.end !== 'en' && stem.endsWith('e') && needsEInsertion(stem.slice(0, -1))) stem = stem.slice(0, -1); // arbeit-e-te → arbeiten
    const lemma = e.end === 'en' ? word : infinitiveOf(stem);
    out.push(guess({
      lemma, pos: 'VERB', morph: { ...e.morph },
      rule: `guessed weak verb ${lemma} (not in the word list): ${describeGermanMorph(e.morph)}`,
    }, e.score - (ADJECTIVAL_STEM.test(stem) ? 0.1 : 0)));
  }
  return out;
}

const ADJ_ENDINGS: Array<[string, number]> = [['e', 0.4], ['er', 0.38], ['es', 0.36], ['em', 0.36], ['en', 0.34]];

function adjectiveGuesses(word: string): Guess[] {
  const out: Guess[] = [];
  for (const [end, score] of ADJ_ENDINGS) {
    if (!word.endsWith(end) || word.length - end.length < 3) continue;
    const stem = word.slice(0, -end.length);
    const cells = endingCells(end);
    const morph = morphOfCells(cells);
    out.push(guess({
      lemma: stem, pos: 'ADJ', morph, cells,
      rule: `guessed adjective ${stem} (not in the word list): ending -${end}; ${describeGermanMorph(morph)}`,
    }, score + (ADJECTIVAL_STEM.test(stem) ? 0.15 : 0)));
  }
  return out;
}

/** At most four guesses, most plausible first; empty when the written form is not a plain word. */
export function guessReadings(surface: string): DeReading[] {
  if (!/^\p{L}+$/u.test(surface) || surface.length < 4) return [];
  const lower = surface.toLowerCase();
  const all = isCapitalised(surface) ? nounGuesses(surface) : [...verbGuesses(lower), ...adjectiveGuesses(lower)];
  return all.sort((a, b) => b.score - a.score).slice(0, MAX_GUESSES).map((g) => g.reading);
}
