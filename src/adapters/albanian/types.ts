/**
 * The Albanian adapter's internal contract: what the word list holds, what the word-form engine returns, and what the
 * sentence layer makes of it. Written by the coordinator; packages build against it and do not change it (ask).
 *
 * The language described is contemporary STANDARD ALBANIAN (sq), in the spelling of the 1972 norm. Gheg (aln), Arbëresh
 * and older spellings are related to it in the analysis layer (gheg.ts, historical.ts, `AnalysisCandidate.orthography`,
 * `varieties`), never by changing a text and never by mixing them into the Standard paradigms.
 *
 * Four facts of Albanian shape these types:
 *  1. "The" is an ending, and case is an ending too: libër, libri, librin, librit, libra, librat, librave are one
 *     word. A noun's definite form and its plural are facts of the word; the rest follows by rule. The same written
 *     form often has several readings (libri = the book, nominative; = of / to a book): every reading is returned,
 *     and a feature that the form leaves open is a comma union ("Case: 'Gen,Dat,Abl'") which the sentence layer may
 *     narrow. It is never guessed.
 *  2. The little words i, e, të, së are not "the": before an adjective, an ordinal, a possessive or a genitive they
 *     are a linking article that agrees with the noun before them; e, i, të, më, na, ju, u are also object pronouns
 *     before a verb; të also introduces the subjunctive. Which one it is, only the sentence says.
 *  3. Short pronouns fuse: më + e = ma, të + e = ta, i + e = ia, të + i = t'i, më + u = m'u; negation fuses too
 *     (s'jam). One written token, several grammatical words: the token keeps its surface and carries `parts`.
 *  4. Many adjectives are cited with their article ("i mirë"): the article and the adjective are one lexical unit
 *     written as two words (`AnalysisCandidate.unit`, lemma "i mirë", the adjective is the head).
 *
 * All word lists and rules here are machine-drafted and have not been checked by a native speaker.
 */
import type { PartOfSpeech, RegisterTag, WordPart } from '../../core';

// ───────────────────────────── feature conventions (every package uses exactly these) ─────────────────────────────
//
//   Case      Nom | Acc | Gen | Dat | Abl          (Gen and Dat share their forms: a form alone is 'Gen,Dat' or
//                                                   'Gen,Dat,Abl'; only a linking article before it makes it Gen)
//   Number    Sing | Plur
//   Gender    Masc | Fem | Neut
//   Definite  Def | Ind
//   Person    1 | 2 | 3
//   Tense     Pres | Imp (imperfect) | Past (aorist)
//   Mood      Ind | Sub (the forms used after të) | Imp (imperative) | Opt (optative: qofsha) | Adm (admirative: qenkam)
//   Voice     Act | Mid (non-active: lahem, u lava)
//   VerbForm  Fin | Part (participle: punuar, larë)
//   Degree    Cmp | Sup (only where a form states it; "më i mirë" is a construction, not a form)
//   PronType  Prs | Dem | Int | Rel | Ind | Neg | Art (the linking article)
//   Poss      Yes
//   Clitic    Yes (a short object pronoun)
//   A value the form does not decide is a comma union in the order given above. Never a guess.
//
// Lemma conventions: a noun under its indefinite nominative singular (libër); a verb under the first person singular of
// the present indicative active (punoj, hap, jam) — the citation form of Albanian dictionaries; an adjective under its
// masculine singular WITHOUT the article (mirë), with `articulated: true` when it takes one (the unit's lemma, shown
// to the learner and credited in the learner model, is then "i mirë").

export type SqGender = 'm' | 'f' | 'n';

/**
 * One word of the hand list: the facts from which its forms are made. Built with the helpers N / V / A / W below, one
 * call per word, in the lexicon-*.ts files.
 */
export interface SqLexeme {
  lemma: string;
  pos: PartOfSpeech;
  gloss: string;
  // ── nouns ──
  gender?: SqGender;
  /** Definite nominative singular, whole form: libri, shoku, vajza, shtëpia, lulja. Always stated for a noun. */
  def?: string;
  /** Indefinite nominative plural, whole form: libra, shokë, vajza, shtëpi, lule, djem. Absent = no plural in use. */
  plural?: string;
  // ── verbs ──
  /**
   * Conjugation class, by the present stem: 'oj' vowel stems in -oj / -uaj / -yej / -ej / -ij (punoj, shkruaj, lyej,
   * blej, fshij); 'cons' consonant stems (hap, mbyll, marr, flas); 'vowel' short vowel stems (ha, pi, di, fle, lë,
   * vë, zë); 'irr' given wholly by `forms` (jam, kam).
   */
  cls?: 'oj' | 'cons' | 'vowel' | 'irr';
  /** Second and third person singular present when the stem changes: marr → merr, flas → flet (2sg flet, 3sg flet), dal → del. "2sg/3sg" or one form for both. */
  pres23?: string;
  /** First person singular aorist, whole form: punova, hapa, mora, fola, dhashë. */
  aorist?: string;
  /** Third person singular aorist when it does not follow from the first: dha, tha, pa, qe, erdhi. */
  aorist3?: string;
  /** Participle, whole form: punuar, hapur, marrë, folur, dhënë. */
  participle?: string;
  /** True when the verb has non-active forms in ordinary use (laj → lahem); 'only' when it exists only so (pendohem). */
  nonActive?: boolean | 'only';
  // ── adjectives (and ordinals, possessives) ──
  /** Takes a linking article: i mirë, e mirë, të mirë, të mira. */
  articulated?: boolean;
  /** Feminine singular, masculine plural, feminine plural — whole forms, without the article. Absent = same as the lemma. */
  fem?: string;
  plM?: string;
  plF?: string;
  // ── any word ──
  /** Explicit forms that override or add to the rules: "form: tags" as in `sqMorph` (e.g. "është: 3 sg pres ind"). */
  forms?: string[];
  varieties?: string[];
  register?: RegisterTag[];
  /** What the word does, when a gloss would mislead (particles, the linking article): shown instead of a translation. */
  role?: string;
  /** For a preposition: the case it governs ('Nom' nga / te, 'Acc' në / me / për, 'Abl' prej / ndaj). */
  governs?: 'Nom' | 'Acc' | 'Abl' | 'Gen';
}

/** One generated or listed form of a lexeme. */
export interface SqForm {
  form: string;
  morph: Record<string, string>;
  /** Plain words: "definite accusative singular". */
  rule: string;
  varieties?: string[];
}

/**
 * One context-free reading of a written form. The engine returns every reading it can justify, best first; an
 * unknown word gets readings by its ending with `lemmaKnown: false` (they become `unconfirmed` candidates: confidence
 * 0.6 at most, no gloss) or none.
 */
export interface SqReading {
  lemma: string;
  pos: PartOfSpeech;
  morph: Record<string, string>;
  gloss?: string;
  /** 0.8–0.92 for a word-list word read by a listed form or a regular rule; lower for a guess. */
  confidence: number;
  lemmaKnown: boolean;
  /** Plain words: how the form was read ("definite accusative singular of libër"). */
  rule: string;
  origin: 'hand' | 'rule';
  /** Grammatical words inside one written token (ma = më + e; s'jam = s' + jam; jepma = jep + më + e). */
  parts?: WordPart[];
  role?: string;
  varieties?: string[];
  register?: RegisterTag[];
  /** An adjective, ordinal or possessive that stands after a linking article (the unit's lemma is "i " + lemma). */
  articulated?: boolean;
  /** A preposition's governed case. */
  governs?: SqLexeme['governs'];
  /**
   * The written form is not Standard spelling as it stands: it was typed without ë / ç, or it is a Gheg or an older form.
   * `standard` is the Standard Albanian form this reading was made from; the text itself is never changed.
   * `period` is a variety code of varieties.ts ('sq-ascii', 'aln', 'sq-pre1972').
   */
  relation?: { standard: string; period: string; confidence: number; rule: string };
}

/** A short object pronoun as the clitic table lists it. */
export interface SqClitic {
  form: string; // më, të, e, i, na, ju, u
  person: '1' | '2' | '3';
  number: 'Sing' | 'Plur';
  /** 'Acc', 'Dat' or both when one form serves for both (më, të, na, ju). */
  cases: Array<'Acc' | 'Dat'>;
  gloss: string;
}

/** A fused cluster: one written form, its component words in order. */
export interface SqCluster {
  form: string; // ma, ta, ia, jua, ua, m'i, t'i, m'u, t'u, iu, t'ia, t'ua
  /** Normalized component words, in order: ['më', 'e']. */
  components: string[];
  /** What each component is, in plain words, in the same order: ['to me', 'it / him / her']. */
  roles: string[];
  gloss: string;
  /** Where this cluster's make-up was checked ("drafter's knowledge — unverified", later a treebank or grammar reference). */
  attested: string;
}

// ───────────────────────────── tag shorthand for explicit forms ─────────────────────────────

const TAGS: Record<string, [string, string]> = {
  nom: ['Case', 'Nom'], acc: ['Case', 'Acc'], gen: ['Case', 'Gen'], dat: ['Case', 'Dat'], abl: ['Case', 'Abl'],
  sg: ['Number', 'Sing'], pl: ['Number', 'Plur'],
  m: ['Gender', 'Masc'], f: ['Gender', 'Fem'], n: ['Gender', 'Neut'],
  def: ['Definite', 'Def'], indef: ['Definite', 'Ind'],
  '1': ['Person', '1'], '2': ['Person', '2'], '3': ['Person', '3'],
  pres: ['Tense', 'Pres'], impf: ['Tense', 'Imp'], aor: ['Tense', 'Past'],
  ind: ['Mood', 'Ind'], subj: ['Mood', 'Sub'], imper: ['Mood', 'Imp'], opt: ['Mood', 'Opt'], adm: ['Mood', 'Adm'],
  act: ['Voice', 'Act'], mid: ['Voice', 'Mid'],
  ptcp: ['VerbForm', 'Part'],
  prs: ['PronType', 'Prs'], dem: ['PronType', 'Dem'], int: ['PronType', 'Int'], rel: ['PronType', 'Rel'], art: ['PronType', 'Art'],
  // 'ind' is the indicative mood: an indefinite or a negative pronoun is 'pind' / 'pneg'
  pind: ['PronType', 'Ind'], pneg: ['PronType', 'Neg'],
  poss: ['Poss', 'Yes'], clitic: ['Clitic', 'Yes'], cmp: ['Degree', 'Cmp'], sup: ['Degree', 'Sup'],
};
const ORDER: Record<string, string[]> = {
  Case: ['Nom', 'Acc', 'Gen', 'Dat', 'Abl'], Number: ['Sing', 'Plur'], Gender: ['Masc', 'Fem', 'Neut'], Definite: ['Def', 'Ind'],
  Person: ['1', '2', '3'], Tense: ['Pres', 'Imp', 'Past'], Mood: ['Ind', 'Sub', 'Imp', 'Opt', 'Adm'], Voice: ['Act', 'Mid'],
};

/**
 * "3 sg pres ind" → { Person: '3', Number: 'Sing', Tense: 'Pres', Mood: 'Ind', VerbForm: 'Fin' }. Several values of
 * one feature become a union in the conventional order ("gen dat abl sg indef" → Case 'Gen,Dat,Abl'). A finite verb
 * form (one with a tense or a mood; a person alone is a pronoun's) gets VerbForm 'Fin'. An unknown tag throws: a typo
 * must not pass.
 */
export function sqMorph(tags: string): Record<string, string> {
  const sets: Record<string, string[]> = {};
  for (const t of tags.trim().split(/\s+/).filter(Boolean)) {
    const hit = TAGS[t];
    if (!hit) throw new Error(`sqMorph: unknown tag "${t}" in "${tags}"`);
    const [k, v] = hit;
    if (!(sets[k] ??= []).includes(v)) sets[k].push(v);
  }
  const out: Record<string, string> = {};
  for (const [k, vs] of Object.entries(sets)) {
    const order = ORDER[k];
    out[k] = (order ? [...vs].sort((a, b) => order.indexOf(a) - order.indexOf(b)) : vs).join(',');
  }
  if (!out.VerbForm && (out.Tense || out.Mood)) out.VerbForm = 'Fin';
  return out;
}

/** Two feature values agree when their comma lists share a value (an absent value agrees with anything). */
export const sqAgree = (a: string | undefined, b: string | undefined): boolean =>
  a === undefined || b === undefined || a.split(',').some((x) => b.split(',').includes(x));

// ───────────────────────────── helpers for the word-list files ─────────────────────────────

type Extra = Partial<Omit<SqLexeme, 'lemma' | 'pos' | 'gloss'>>;

/** A noun: N('libër', 'm', 'libri', 'libra', 'book'). Pass `undefined` for the plural of a noun that has none. */
export const N = (lemma: string, gender: SqGender, def: string, plural: string | undefined, gloss: string, extra: Extra = {}): SqLexeme =>
  ({ lemma, pos: 'NOUN', gender, def, ...(plural ? { plural } : {}), gloss, ...extra });

/** A verb: V('punoj', 'oj', 'punova', 'punuar', 'to work'). Stem changes and irregular forms go in `extra`. */
export const V = (lemma: string, cls: NonNullable<SqLexeme['cls']>, aorist: string | undefined, participle: string | undefined, gloss: string, extra: Extra = {}): SqLexeme =>
  ({ lemma, pos: 'VERB', cls, ...(aorist ? { aorist } : {}), ...(participle ? { participle } : {}), gloss, ...extra });

/** An adjective: A('mirë', true, 'good', { plF: 'mira' }) is "i mirë"; A('besnik', false, 'faithful', { fem: 'besnike', plM: 'besnikë', plF: 'besnike' }). */
export const A = (lemma: string, articulated: boolean, gloss: string, extra: Extra = {}): SqLexeme =>
  ({ lemma, pos: 'ADJ', articulated, gloss, ...extra });

/** Any other word, with the forms it has: W('nuk', 'ADV', 'not'). */
export const W = (lemma: string, pos: PartOfSpeech, gloss: string, extra: Extra = {}): SqLexeme => ({ lemma, pos, gloss, ...extra });

/** The citation form shown to a learner: "i mirë" for an articulated adjective, the lemma otherwise. */
export const sqCitation = (lemma: string, articulated?: boolean): string => (articulated ? `i ${lemma}` : lemma);

export type { WordPart };
