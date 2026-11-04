/**
 * John 1:1–18 as Ecclesia tokens, from the generated data (SBLGNT + MorphGNT via the Biblia build) with the Dodson glosses and
 * New Testament counts as the lexicon and corpus frequency. The MorphGNT code → UD features decoding below mirrors
 * src/adapters/greek/morphgnt.ts (kept local so the fixture does not depend on the app's adapters).
 */
import type { EcclesiaForm, EcclesiaLexeme, EcclesiaToken, PassageRef, PassageTokens, UdPos } from '../../../packages/goreview-ecclesia/src/contract';
import { GREEK } from '../../../packages/goreview-ecclesia/src/languages';
import { formId, lexemeId, normalizeWord } from '../../../packages/goreview-ecclesia/src/identity';
import { frequencyTable } from '../../../packages/goreview-ecclesia/src/frequency';
import { LEXICON_ROWS, RAW_VERSES } from './john-1-1-18.data';
import type { RawToken } from './john-1-1-18.data';

const POS: Record<string, UdPos> = { 'A-': 'ADJ', 'C-': 'CCONJ', 'D-': 'ADV', 'I-': 'INTJ', 'N-': 'NOUN', 'P-': 'ADP', RA: 'DET', RD: 'PRON', RI: 'PRON', RP: 'PRON', RR: 'PRON', 'V-': 'VERB', 'X-': 'PART' };
const TENSE: Record<string, string> = { P: 'Pres', I: 'Impf', F: 'Fut', A: 'Aor', X: 'Perf', Y: 'Plup' };
const VOICE: Record<string, string> = { A: 'Act', M: 'Mid', P: 'Pass' };
const MOOD: Record<string, string> = { I: 'Ind', D: 'Imp', S: 'Sub', O: 'Opt' };
const CASE: Record<string, string> = { N: 'Nom', G: 'Gen', D: 'Dat', A: 'Acc', V: 'Voc' };
const NUMBER: Record<string, string> = { S: 'Sing', P: 'Plur' };
const GENDER: Record<string, string> = { M: 'Masc', F: 'Fem', N: 'Neut' };
const PRON: Record<string, string> = { RD: 'Dem', RI: 'Int,Ind', RP: 'Prs', RR: 'Rel' };

export function decodeToken(index: number, raw: RawToken): EcclesiaToken {
  const [surface, lemma, posCode, parse = ''] = raw;
  let pos: UdPos = POS[posCode] ?? 'X';
  const features: Record<string, string> = {};
  if (parse.length === 8) {
    const [p, t, v, m, c, n, g] = parse;
    if (/[123]/.test(p!)) features.Person = p!;
    if (TENSE[t!]) features.Tense = TENSE[t!]!;
    if (VOICE[v!]) features.Voice = VOICE[v!]!;
    if (m === 'N') features.VerbForm = 'Inf';
    else if (m === 'P') features.VerbForm = 'Part';
    else if (MOOD[m!]) { features.Mood = MOOD[m!]!; features.VerbForm = 'Fin'; }
    if (CASE[c!]) features.Case = CASE[c!]!;
    if (NUMBER[n!]) features.Number = NUMBER[n!]!;
    if (GENDER[g!]) features.Gender = GENDER[g!]!;
  }
  if (PRON[posCode]) features.PronType = PRON[posCode]!;
  if (posCode === 'RA') features.Definite = 'Def';
  if (pos === 'NOUN' && /^\p{Lu}/u.test(lemma)) pos = 'PROPN';
  return { index, surface, lemma, pos, ...(Object.keys(features).length ? { features } : {}) };
}

export const JOHN_1: PassageRef = { book: 'JHN', chapter: 1, verse: 1, verseEnd: 18 };

/** The whole prologue. */
export const JOHN_1_1_18: PassageTokens = {
  language: 'grc', ref: JOHN_1,
  verses: RAW_VERSES.map((v) => ({ verse: v.verse, tokens: v.tokens.map((t, i) => decodeToken(i, t)) })),
};

/** A sub-passage by verse range (verses outside the range are dropped; the ref narrows). */
export function passage(from: number, to: number): PassageTokens {
  return { language: 'grc', ref: { book: 'JHN', chapter: 1, verse: from, verseEnd: to }, verses: JOHN_1_1_18.verses.filter((v) => v.verse >= from && v.verse <= to) };
}

export const DODSON = 'Dodson Greek Lexicon (public domain)';

/** Every lexeme of the passage with its Dodson gloss (split on commas into short glosses). */
export const GREEK_LEXEMES: EcclesiaLexeme[] = (() => {
  const seen = new Map<string, EcclesiaLexeme>();
  for (const v of JOHN_1_1_18.verses) for (const t of v.tokens) {
    const id = lexemeId(GREEK, t.lemma, t.pos);
    if (seen.has(id)) continue;
    const row = LEXICON_ROWS[t.lemma];
    const glosses = row ? row.gloss.split(/[,;]\s*/u).map((g) => g.trim()).filter(Boolean) : [];
    seen.set(id, { lexemeId: id, lemma: t.lemma, pos: t.pos, glosses, attribution: DODSON, ...(row ? { frequency: { rank: undefined, perMillion: undefined, source: 'NT occurrence count (Biblia index)' } } : {}) });
  }
  return [...seen.values()];
})();

export const GREEK_FORMS: EcclesiaForm[] = (() => {
  const seen = new Map<string, EcclesiaForm>();
  for (const v of JOHN_1_1_18.verses) for (const t of v.tokens) {
    const id = formId(GREEK, t.surface);
    if (!seen.has(id)) seen.set(id, { formId: id, surface: normalizeWord('grc', t.surface), lexemeId: lexemeId(GREEK, t.lemma, t.pos), ...(t.features ? { features: t.features } : {}) });
  }
  return [...seen.values()];
})();

/** New Testament lemma counts (Biblia's Greek index) as a corpus-frequency provider over the lexemes of the passage. */
export const NT_FREQUENCY = frequencyTable('grc', 'sblgnt-nt-lemma-counts', Object.fromEntries(
  GREEK_LEXEMES.map((l) => [l.lexemeId, LEXICON_ROWS[l.lemma]?.nt ?? 0]),
));

export const lexemeOf = (lemma: string, pos: UdPos): string => lexemeId(GREEK, lemma, pos);
