/**
 * Guesses for a word the lexicon does not hold. They are labelled as guesses (`lemmaKnown: false`), never above 0.6,
 * at most four, and never a strong verb: a strong verb cannot be recognised from its spelling. A capitalised word is
 * guessed as a noun only; a lower-case one as a weak verb or an adjective.
 */
import type { DeCell, DeNoun, DeReading } from './types';
import { nounForms } from './morph-noun';
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

/** A known noun's plural forms (lower-case spelling → the nouns and the plural cells it fills), for a compound whose front the list does not hold. */
export type PluralHeads = Map<string, Array<{ noun: DeNoun; cells: DeCell[] }>>;

/** Shortest plural form taken as a head: a short one (Enten, Hunde) ends too many ordinary words. */
const MIN_HEAD = 6;
/** Shortest front part of an unknown compound. */
const MIN_FRONT = 3;

export function buildPluralHeads(nouns: readonly DeNoun[]): PluralHeads {
  const heads: PluralHeads = new Map();
  for (const n of nouns) {
    if (n.adjectival || n.gender === 'pl') continue;
    for (const f of nounForms(n)) {
      // only a spelling that is plural and nothing else: Lehrer, Studenten could be singular too, so no number is claimed
      if (f.older || f.form.length < MIN_HEAD || !f.cells.length || f.cells.some((c) => c.g !== 'p')) continue;
      const key = f.form.toLowerCase();
      const list = heads.get(key) ?? [];
      if (!list.some((x) => x.noun === n)) list.push({ noun: n, cells: f.cells });
      heads.set(key, list);
    }
  }
  return heads;
}

/** Hand the gender of a noun back to a plural: after Case, as morphOfCells orders the features. */
function pluralMorph(noun: DeNoun, cells: DeCell[]): Record<string, string> {
  const m = morphOfCells(cells);
  const gender = noun.gender === 'm' ? 'Masc' : noun.gender === 'f' ? 'Fem' : noun.gender === 'n' ? 'Neut' : undefined;
  const out: Record<string, string> = {};
  if (m.Case) out.Case = m.Case;
  if (gender) out.Gender = gender;
  for (const [k, v] of Object.entries(m)) if (k !== 'Case') out[k] = v;
  return out;
}

/** Haremsfrauen: an unknown front + the plural of a known noun: the head is that noun, the front is claimed to be nothing. */
function compoundPluralGuesses(surface: string, heads: PluralHeads, frontKnown: (front: string) => boolean): Guess[] {
  const out: Guess[] = [];
  for (let i = MIN_FRONT; i <= surface.length - MIN_HEAD; i++) {
    const hits = heads.get(surface.slice(i).toLowerCase());
    if (!hits) continue; // the longest head is tried first
    const front = surface.slice(0, i);
    for (const { noun, cells } of hits.slice(0, 2)) {
      const lemma = `${front}${noun.lemma.charAt(0).toLowerCase()}${noun.lemma.slice(1)}`;
      const morph = pluralMorph(noun, cells);
      const known = frontKnown(front);
      out.push(guess({
        lemma, pos: 'NOUN', morph, cells: cells.map((c) => ({ ...c })),
        rule: `guessed compound noun ${lemma} (not in the word list): the front part ${front} ${known ? 'is a word of the list, but this compound is not taken apart here' : 'is not a known word'} `
          + `and no meaning is claimed for it; the head ${surface.slice(i)} is the plural of the known noun ${noun.lemma}, so gender and cells come from it; ${describeGermanMorph(morph)}`,
        parts: [
          { text: front, start: 0, end: i, kind: 'component', role: known ? 'front part (a word of the list; no claim made here)' : 'front part: not a known word' },
          { text: surface.slice(i), start: i, end: surface.length, lemma: noun.lemma, pos: 'NOUN', kind: 'head', role: `head noun: ${noun.gloss}` },
        ],
      }, 0.55));
    }
    break;
  }
  return out;
}

function nounGuesses(surface: string, heads?: PluralHeads, frontKnown: (front: string) => boolean = () => false): Guess[] {
  // the word itself, every case; no number and no gender claimed
  const everyCell = (['N', 'A', 'D', 'G'] as const).flatMap((c) => (['m', 'f', 'n', 'p'] as const).map((g) => ({ c, g })));
  const out: Guess[] = [guess({
    lemma: surface, pos: 'NOUN', morph: { Case: ALL_CASES }, cells: everyCell,
    rule: 'guessed noun (capitalised, not in the word list): the word itself as lemma; case, number and gender not known',
  }, 0.5)];
  const compound = heads ? compoundPluralGuesses(surface, heads, frontKnown) : [];
  out.push(...compound);
  for (const e of NOUN_ENDINGS) {
    if (!surface.endsWith(e.end) || surface.length - e.end.length < 3) continue;
    const lemma = surface.slice(0, -e.end.length);
    if (compound.some((g) => g.reading.lemma === lemma)) continue; // the head reading already says it, with gender and cells
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

/**
 * A stem in -ier after a CONSONANT: a verb in -ieren (renovier-, studier-, fotografier-, frier-). Its participle has no
 * ge-. A vowel before -ier (feier-, leier-) is an -ern verb (feiern), not this class.
 */
const IEREN_STEM = /[^aeiouäöüy]ier$/;

/**
 * The infinitive of a weak stem: -en, except -n after an unstressed -el / -er (sammel → sammeln, wander → wandern,
 * feier → feiern, dauer → dauern) and never after -ier (renovier → renovieren, studier → studieren).
 */
const infinitiveOf = (stem: string): string => (!IEREN_STEM.test(stem) && /(?:el|er)$/.test(stem) ? `${stem}n` : `${stem}en`);

function verbGuesses(word: string): Guess[] {
  const out: Guess[] = [];
  if (/[^aeiouäöüy]ierend$/.test(word)) {
    out.push(guess({
      lemma: word.slice(0, -1), pos: 'VERB', morph: { VerbForm: 'Part', Tense: 'Pres' },
      rule: `guessed weak verb ${word.slice(0, -1)} (not in the word list): present participle of a verb in -ieren`,
    }, 0.5));
  }
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
    if (e.end === 't' && IEREN_STEM.test(stem)) {
      // renoviert, studiert: a verb in -ieren has no ge- in its participle, so the same string is the participle AND the finite form
      const note = `guessed weak verb ${lemma} (not in the word list; a verb in -ieren has no ge- in the participle)`;
      const forms: Array<[Record<string, string>, number]> = [
        [{ VerbForm: 'Part', Tense: 'Past' }, 0.55],
        [{ ...e.morph }, 0.5],
        [{ ...PRES, Person: '2', Number: 'Plur' }, 0.45],
      ];
      for (const [morph, score] of forms) out.push(guess({ lemma, pos: 'VERB', morph, rule: `${note}: ${describeGermanMorph(morph)}` }, score));
      continue;
    }
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
export function guessReadings(surface: string, heads?: PluralHeads, frontKnown?: (front: string) => boolean): DeReading[] {
  if (!/^\p{L}+$/u.test(surface) || surface.length < 4) return [];
  const lower = surface.toLowerCase();
  const all = isCapitalised(surface) ? nounGuesses(surface, heads, frontKnown) : [...verbGuesses(lower), ...adjectiveGuesses(lower)];
  return all.sort((a, b) => b.score - a.score).slice(0, MAX_GUESSES).map((g) => g.reading);
}
