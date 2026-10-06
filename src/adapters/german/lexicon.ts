/**
 * The German hand lexicon as the engine and the sentence layer see it, built once from the row lists:
 *   lexicon-nouns.ts, lexicon-verbs.ts, lexicon-modifiers.ts (adjectives, adverbs), function-words.ts (closed classes),
 *   prefixes.ts, the course's own extra rows in lexicon-course.ts, and the ladder plan's words in lexicon-ladder.ts.
 * All lookups take the adapter-normalized form (NFC + lower case, `toLocaleLowerCase('de')`). MACHINE-DRAFTED, NOT
 * CHECKED BY A NATIVE SPEAKER.
 *
 * Merging the course rows: a row whose lemma and part of speech the main lists already hold is skipped; it is counted
 * in `deLexiconStats.duplicates` only when its facts DIFFER from every main row (gender, genitive, plural; principal
 * parts, auxiliary; comparison). The main lists always win.
 */
import type { PartOfSpeech, RegisterTag } from '../../core';
import { parseRows, type DePlainRow, type DeRows } from './entries';
import { CLOSED_FORMS, CONTRACTIONS, FUNCTION_ROWS, PREPOSITIONS } from './function-words';
import { COURSE_ROWS } from './lexicon-course';
import { LADDER_ROWS } from './lexicon-ladder';
import { ADJECTIVE_ROWS, ADVERB_ROWS } from './lexicon-modifiers';
import { NOUN_ROWS } from './lexicon-nouns';
import { VERB_ROWS } from './lexicon-verbs';
import { prefixKind } from './prefixes';
import type { DeAdjective, DeClosedForm, DeContraction, DeLexiconView, DeNoun, DePreposition, DeVerb } from './types';

const norm = (s: string): string => s.normalize('NFC').toLocaleLowerCase('de');

type PlainEntry = { lemma: string; pos: PartOfSpeech; gloss: string; role?: string; register?: RegisterTag[]; varieties?: string[] };

const nounFacts = (n: DeNoun): string => [n.gender, n.genSg ?? '', n.plural ?? '', n.weak ? 'w' : '', n.adjectival ? 'a' : ''].join('|');
const verbFacts = (v: DeVerb): string => [v.cls, v.pres3 ?? '', v.pret ?? '', v.part ?? '', v.aux].join('|');
const adjFacts = (a: DeAdjective): string => [a.comparative ?? '', a.superlative ?? '', a.stem ?? '', a.indeclinable ? 'i' : ''].join('|');
const verbKey = (v: DeVerb): string => `${v.lemma}|${v.prefix ?? ''}|${v.reflexive ? 'r' : ''}`;

const nouns: DeNoun[] = [];
const verbs: DeVerb[] = [];
const adjectives: DeAdjective[] = [];
const plainEntries: PlainEntry[] = [];
const duplicates: string[] = [];

const nounsBy = new Map<string, DeNoun[]>();
const verbsBy = new Map<string, DeVerb[]>();
const adjBy = new Map<string, DeAdjective>();
const plainBy = new Map<string, PlainEntry[]>();
const plainSeen = new Set<string>();

function push<T>(map: Map<string, T[]>, key: string, value: T): void {
  const list = map.get(key);
  if (list) list.push(value); else map.set(key, [value]);
}

function addNoun(n: DeNoun, course: boolean): void {
  const key = norm(n.lemma);
  const same = nounsBy.get(key) ?? [];
  if (course) {
    if (same.length) {
      if (!same.some((x) => nounFacts(x) === nounFacts(n))) duplicates.push(`noun ${n.lemma}: course row differs from the main list`);
      return;
    }
  } else if (same.some((x) => nounFacts(x) === nounFacts(n))) return;
  nouns.push(n);
  push(nounsBy, key, n);
}

function addVerb(v: DeVerb, course: boolean): void {
  const key = norm(verbKey(v));
  const same = verbs.filter((x) => norm(verbKey(x)) === key);
  if (course) {
    if (same.length) {
      if (!same.some((x) => verbFacts(x) === verbFacts(v))) duplicates.push(`verb ${v.prefix ? `${v.prefix}|${v.base}` : v.lemma}: course row differs from the main list`);
      return;
    }
  } else if (same.some((x) => verbFacts(x) === verbFacts(v))) return;
  verbs.push(v);
  push(verbsBy, norm(v.lemma), v);
}

function addAdjective(a: DeAdjective, course: boolean): void {
  const key = norm(a.lemma);
  const same = adjBy.get(key);
  if (same) {
    if (course && adjFacts(same) !== adjFacts(a)) duplicates.push(`adjective ${a.lemma}: course row differs from the main list`);
    return;
  }
  adjectives.push(a);
  adjBy.set(key, a);
}

function addPlain(p: PlainEntry): void {
  const key = `${norm(p.lemma)}|${p.pos}|${p.lemma}`;
  if (plainSeen.has(key)) return;
  plainSeen.add(key);
  plainEntries.push(p);
  push(plainBy, norm(p.lemma), p);
}

function addRows(rows: DeRows, course: boolean): void {
  for (const n of rows.nouns) addNoun(n, course);
  for (const v of rows.verbs) addVerb(v, course);
  for (const a of rows.adjectives) addAdjective(a, course);
  for (const p of rows.plain as DePlainRow[]) addPlain(p);
}

// main lists first, then the closed classes' plain words, then the course rows (which never override)
addRows(parseRows(NOUN_ROWS, 'lexicon-nouns'), false);
addRows(parseRows(VERB_ROWS, 'lexicon-verbs'), false);
addRows(parseRows(ADJECTIVE_ROWS, 'lexicon-modifiers (adjectives)'), false);
addRows(parseRows(ADVERB_ROWS, 'lexicon-modifiers (adverbs)'), false);
addRows(parseRows(FUNCTION_ROWS, 'function-words'), false);
for (const p of PREPOSITIONS) addPlain({ lemma: p.form, pos: 'ADP', gloss: p.gloss });
{
  // a course row for a plain word the main lists hold is skipped without a count (a gloss is not a fact)
  const course = parseRows(COURSE_ROWS, 'lexicon-course');
  for (const n of course.nouns) addNoun(n, true);
  for (const v of course.verbs) addVerb(v, true);
  for (const a of course.adjectives) addAdjective(a, true);
  for (const p of course.plain) if (!plainBy.get(norm(p.lemma))?.some((x) => x.pos === p.pos)) addPlain(p);
}
// the ladder plan's words (lexicon-ladder.ts): added like main rows, so a second gender (die / der Leiter) stays beside the first
addRows(parseRows(LADDER_ROWS, 'lexicon-ladder'), false);

const closedBy = new Map<string, DeClosedForm[]>();
for (const f of CLOSED_FORMS) push(closedBy, norm(f.form), f);
const prepBy = new Map<string, DePreposition>(PREPOSITIONS.map((p) => [norm(p.form), p]));
const contractionBy = new Map<string, DeContraction>(CONTRACTIONS.map((c) => [norm(c.form), c]));
const separableBy = new Map<string, DeVerb[]>();
for (const v of verbs) if (v.prefix && v.base) push(separableBy, norm(v.base), v);

const none = <T>(): T[] => [];

export const deLexiconView: DeLexiconView = {
  nouns: (lemma) => nounsBy.get(lemma) ?? none<DeNoun>(),
  verb: (lemma) => verbsBy.get(lemma) ?? none<DeVerb>(),
  adjective: (lemma) => adjBy.get(lemma),
  closed: (form) => closedBy.get(form) ?? none<DeClosedForm>(),
  plain: (form) => plainBy.get(form) ?? none<PlainEntry>(),
  preposition: (form) => prepBy.get(form),
  contraction: (form) => contractionBy.get(form),
  prefixKind,
  separableVerbsOf: (base) => separableBy.get(base) ?? none<DeVerb>(),
  allNouns: () => nouns,
  allVerbs: () => verbs,
  allAdjectives: () => adjectives,
};

/** What the lexicon holds, for the readiness table and the tests. */
export const deLexiconStats = {
  nouns: nouns.length,
  verbs: verbs.length,
  strongVerbs: verbs.filter((v) => v.cls === 'strong' || v.cls === 'mixed').length,
  separableVerbs: verbs.filter((v) => v.prefix).length,
  adjectives: adjectives.length,
  closedForms: CLOSED_FORMS.length,
  plainWords: plainEntries.length,
  duplicates,
};
