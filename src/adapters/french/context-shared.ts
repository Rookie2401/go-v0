/**
 * What french/disambiguate.ts and french/constructions.ts both need: predicates over a reading, the small closed word sets that
 * French grammar names (subject pronouns, object clitics, the words of negation, the triggers of the subjunctive …) and the
 * walking of a token list (the word before, the hyphen of donne-le, where a clause begins and ends). Every set is built once,
 * when the module loads; nothing here allocates per token beyond a few numbers.
 *
 * Machine-drafted, not checked by a native speaker.
 */
import type { AnalysisCandidate, RawToken } from '../../core';

export type C = AnalysisCandidate;

// ── a reading ──
export const has = (c: C, k: string, v: string): boolean => (c.morph[k] ?? '').split(',').includes(v);
/** The reading does not contradict the value (a reading that does not state the feature agrees with anything). */
export const fits = (c: C, k: string, v: string | undefined): boolean => v === undefined || c.morph[k] === undefined || has(c, k, v);
export const isVerbal = (c: C): boolean => c.pos === 'VERB' || c.pos === 'AUX';
export const isFinite = (c: C): boolean => isVerbal(c) && has(c, 'VerbForm', 'Fin');
export const isInfinitive = (c: C): boolean => isVerbal(c) && has(c, 'VerbForm', 'Inf');
export const isPastParticiple = (c: C): boolean => isVerbal(c) && has(c, 'VerbForm', 'Part') && has(c, 'Tense', 'Past');
export const isPresentParticiple = (c: C): boolean => isVerbal(c) && has(c, 'VerbForm', 'Part') && has(c, 'Tense', 'Pres');
export const isImperative = (c: C): boolean => isFinite(c) && has(c, 'Mood', 'Imp');
/** Conjugated and not a command. */
export const isStatement = (c: C): boolean => isFinite(c) && !has(c, 'Mood', 'Imp');
/** A reading the adapter's own data vouches for (the word list, or a rule on a word-list lemma), not a dictionary's or a guess. */
export const isOwn = (c: C): boolean => c.origin !== 'dictionary' && c.unconfirmed !== true;
/** The readings of a neighbour that count when asking what it is: the adapter's own where it has any, else all it has. */
export const solid = (list: readonly C[] | undefined): C[] => {
  if (!list || list.length === 0) return [];
  return list.some(isOwn) ? list.filter(isOwn) : [...list];
};
export const isAvoirOrEtre = (c: C): boolean => isVerbal(c) && (c.lemma === 'avoir' || c.lemma === 'être');

// ── word sets (normalized forms) ──
export const SUBJECT_PRONOUNS: ReadonlyMap<string, { person: string; number: string }> = new Map([
  ['je', { person: '1', number: 'Sing' }], ["j'", { person: '1', number: 'Sing' }], ['tu', { person: '2', number: 'Sing' }],
  ['il', { person: '3', number: 'Sing' }], ['elle', { person: '3', number: 'Sing' }], ['on', { person: '3', number: 'Sing' }],
  ['nous', { person: '1', number: 'Plur' }], ['vous', { person: '2', number: 'Plur' }],
  ['ils', { person: '3', number: 'Plur' }], ['elles', { person: '3', number: 'Plur' }],
]);
/** Subject pronouns that are nothing else: je, tu, il, on, ils (elle, nous, vous, elles are also stressed or object pronouns). */
export const SUBJECT_ONLY: ReadonlySet<string> = new Set(['je', "j'", 'tu', 'il', 'on', 'ils']);
/** Pronouns that follow a verb and a hyphen as its inverted subject (viens-tu, a-t-il, est-ce). */
export const INVERTED_SUBJECTS: ReadonlySet<string> = new Set(['je', 'tu', 'il', 'elle', 'on', 'nous', 'vous', 'ils', 'elles', 'ce']);
/** The reflexive clitics and the person they belong to (nous and vous are also plain objects or subjects). */
export const REFLEXIVE_PERSON: ReadonlyMap<string, { person: string; number?: string }> = new Map([
  ['me', { person: '1', number: 'Sing' }], ["m'", { person: '1', number: 'Sing' }], ['te', { person: '2', number: 'Sing' }], ["t'", { person: '2', number: 'Sing' }],
  ['se', { person: '3' }], ["s'", { person: '3' }], ['nous', { person: '1', number: 'Plur' }], ['vous', { person: '2', number: 'Plur' }],
]);
export const LE_FORMS: ReadonlySet<string> = new Set(['le', 'la', 'les', "l'"]);
export const NE_FORMS: ReadonlySet<string> = new Set(['ne', "n'"]);
export const QUE_FORMS: ReadonlySet<string> = new Set(['que', "qu'"]);
/** Clitics that only ever stand before a verb (or after it with a hyphen): me, te, se and their elided forms, y. */
export const PURE_CLITICS: ReadonlySet<string> = new Set(['me', 'te', 'se', "m'", "t'", 'y']);
/** Every object clitic that can stand in the chain before a verb. */
export const OBJECT_CLITICS: ReadonlySet<string> = new Set(['me', 'te', 'se', "m'", "t'", "s'", 'le', 'la', 'les', "l'", 'lui', 'leur', 'nous', 'vous', 'y', 'en']);
/** Pronouns written after a command with a hyphen (donne-le-moi, va-t'en, allons-y). */
export const IMPERATIVE_CLITICS: ReadonlySet<string> = new Set(['le', 'la', 'les', 'lui', 'leur', 'moi', 'toi', 'nous', 'vous', 'y', 'en', "m'", "t'"]);
/** The second word of a negation (ne … pas, ne … jamais …). */
export const NEGATIVE_WORDS: ReadonlySet<string> = new Set(['pas', 'jamais', 'plus', 'rien', 'personne', 'point', 'guère', 'aucun', 'aucune', 'nul', 'nulle', 'nullement', 'ni']);
/** Negative words that can stand before ne as its subject or in front of it (personne ne vient, jamais je ne mentirai). */
export const NEGATIVE_FRONT: ReadonlySet<string> = new Set(['personne', 'rien', 'jamais', 'aucun', 'aucune', 'nul', 'nulle', 'ni']);
/** Adverbs that may stand between an auxiliary and its participle (il a déjà fini, je n'ai jamais vu). */
export const BETWEEN_ADVERBS: ReadonlySet<string> = new Set([
  'pas', 'plus', 'jamais', 'rien', 'point', 'guère', 'déjà', 'bien', 'toujours', 'souvent', 'encore', 'vraiment', 'tout', 'trop',
  'beaucoup', 'peu', 'mal', 'presque', 'enfin', 'aussi', 'même', 'ensuite', 'longtemps', 'également', 'sûrement', 'certainement',
  'probablement', 'peut-être', 'alors', 'ainsi', 'tant', 'tellement', 'assez', 'complètement', 'entièrement', 'finalement',
  'simplement', 'seulement', 'parfois', 'rarement', 'vite', 'aussitôt', 'bientôt', 'tôt', 'tard', 'mieux', 'moins', 'fort', 'très',
  'naturellement', 'évidemment',
]);
export const PREPOSITIONS: ReadonlySet<string> = new Set([
  'à', 'de', "d'", 'pour', 'sans', 'par', 'avec', 'dans', 'sur', 'sous', 'chez', 'vers', 'contre', 'entre', 'parmi', 'selon',
  'malgré', 'après', 'avant', 'depuis', 'pendant', 'envers', 'dès', 'jusqu\'', 'hormis', 'outre', 'via', 'durant', 'en',
]);
/** Prepositions after which a verb is an infinitive (à manger, pour partir, sans dire). */
export const INFINITIVE_PREPOSITIONS: ReadonlySet<string> = new Set(['à', 'de', "d'", 'pour', 'sans', 'par', 'avant', 'après', 'afin']);
/** Determiners that only a noun phrase can follow (le, la, les, l' and leur are decided apart: they are also pronouns). */
export const ARTICLES: ReadonlySet<string> = new Set([
  'un', 'une', 'du', 'des', 'au', 'aux', 'mon', 'ma', 'mes', 'ton', 'ta', 'tes', 'son', 'sa', 'ses', 'notre', 'nos', 'votre', 'vos',
  'leurs', 'ce', 'cet', 'cette', 'ces',
]);
/** Other determiners: they also stand before a noun, but some of them are pronouns too (plusieurs viennent). */
export const QUANTIFIERS: ReadonlySet<string> = new Set([
  'chaque', 'quelques', 'quelque', 'plusieurs', 'quel', 'quelle', 'quels', 'quelles', 'certains', 'certaines', 'aucun', 'aucune',
  'divers', 'diverses', 'différents', 'différentes', 'maint', 'mainte', 'maints', 'maintes', 'nul', 'nulle',
]);
/** Verbs and adjectives whose que-clause takes the subjunctive (il faut que, je veux que, il est possible que). Lemmas. */
export const SUBJUNCTIVE_VERBS: ReadonlySet<string> = new Set([
  'falloir', 'vouloir', 'souhaiter', 'désirer', 'exiger', 'préférer', 'aimer', 'attendre', 'craindre', 'douter', 'regretter',
  'ordonner', 'permettre', 'demander', 'interdire', 'défendre', 'empêcher', 'accepter', 'refuser', 'supporter', 'tenir', 'redouter',
  'déplorer', 'suffire', 'valoir', 'importer',
]);
export const SUBJUNCTIVE_WORDS: ReadonlySet<string> = new Set([
  'possible', 'impossible', 'nécessaire', 'important', 'essentiel', 'indispensable', 'urgent', 'normal', 'naturel', 'dommage',
  'temps', 'content', 'contente', 'contents', 'contentes', 'heureux', 'heureuse', 'heureuses', 'triste', 'tristes', 'désolé', 'désolée',
  'désolés', 'désolées', 'surpris', 'surprise', 'surprises', 'étonné', 'étonnée', 'étonnés', 'étonnées', 'ravi', 'ravie', 'ravis',
  'ravies', 'fier', 'fière', 'fiers', 'fières', 'peur', 'crainte', 'préférable', 'rare', 'utile', 'inutile', 'honteux', 'regrettable',
  'souhaitable', 'juste', 'bon', 'mieux',
]);
/** The first word of a conjunction ending in que that takes the subjunctive (bien que, pour que, avant que, à moins que …). */
export const SUBJUNCTIVE_CONJ_HEADS: ReadonlySet<string> = new Set(['bien', 'pour', 'afin', 'avant', 'sans', 'moins', 'attendant', 'condition', 'pourvu', 'crainte', 'peur', 'non']);
/** Conjunctions written in one word that take the subjunctive. */
export const SUBJUNCTIVE_CONJ_WORDS: ReadonlySet<string> = new Set(['quoique', "quoiqu'"]);

// ── walking the tokens ──
const BOUNDARY = /[.!?…;:«»"“”„—–()[\]]/u;
const SENTENCE_END = /[.!?…]/u;

export const isHyphenToken = (t: RawToken | undefined): boolean => !!t && !t.isWord && t.normalized === '-';
/** The word directly before token k (no punctuation between), if any. */
export const prevWord = (tokens: readonly RawToken[], k: number): number | undefined => (k > 0 && tokens[k - 1].isWord ? k - 1 : undefined);
export const nextWord = (tokens: readonly RawToken[], k: number): number | undefined => (k + 1 < tokens.length && tokens[k + 1].isWord ? k + 1 : undefined);
/** The word joined to token k by a hyphen on its left (donne-le: for "le", the index of "donne"). */
export function hyphenBefore(tokens: readonly RawToken[], k: number): number | undefined {
  const h = tokens[k - 1];
  const w = tokens[k - 2];
  return isHyphenToken(h) && h.end === tokens[k].start && w?.isWord && w.end === h.start ? k - 2 : undefined;
}
export function hyphenAfter(tokens: readonly RawToken[], k: number): number | undefined {
  const h = tokens[k + 1];
  const w = tokens[k + 2];
  return isHyphenToken(h) && h.start === tokens[k].end && w?.isWord && w.start === h.end ? k + 2 : undefined;
}
/** Does token k open its clause: nothing before it, or a full stop, a colon, a quotation mark or a dash (not a comma)? */
export function opensClause(tokens: readonly RawToken[], k: number): boolean {
  const t = tokens[k - 1];
  if (!t) return true;
  if (t.isWord || isHyphenToken(t)) return false;
  return BOUNDARY.test(t.surface);
}
/** The punctuation that ends the clause of token k (".", "!", "?", "…", ";", ":"), or "" at the end of the text. */
export function clauseEnd(tokens: readonly RawToken[], k: number): string {
  for (let j = k + 1; j < tokens.length; j++) {
    const t = tokens[j];
    if (t.isWord || isHyphenToken(t)) continue;
    const m = /[.!?…;:]/u.exec(t.surface);
    if (m) return m[0];
  }
  return '';
}
/** The first and last token index of the sentence that holds token k. */
export function sentenceSpan(tokens: readonly RawToken[], k: number): [number, number] {
  let a = k;
  while (a > 0 && (tokens[a - 1].isWord || !SENTENCE_END.test(tokens[a - 1].surface))) a--;
  let b = k;
  while (b + 1 < tokens.length && (tokens[b + 1].isWord || !SENTENCE_END.test(tokens[b + 1].surface))) b++;
  return [a, b];
}
/** A comma, a semicolon, a full stop …: punctuation that separates clauses or phrases (not a hyphen or an apostrophe). */
export const isPause = (t: RawToken | undefined): boolean => !!t && !t.isWord && !isHyphenToken(t);
