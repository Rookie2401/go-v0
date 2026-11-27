/**
 * The sentence layer of the Russian analyser: the readings of each word of ONE sentence, ordered by its neighbours.
 *
 * Contract (docs/russian/PLAN.md): a rule here may MOVE a reading, LOWER a confidence and set `notes.context` (one plain sentence: why
 * this reading was put first); it never adds, removes or rewrites a reading. Where the sentence does not decide, the order the
 * context-free analyser gave stands (that order already carries the lemma counts and the feature priors, russian/analyze.ts).
 *
 * How it works. Every rule adds a small score to some readings of some tokens (a named function each, below). Agreement inside a noun
 * phrase is scored over the whole chain of neighbouring words at once (a max-sum pass over the readings, not word-pair by word-pair),
 * so that "эту красивую книгу" is read as one accusative phrase. The reading with the best score goes first; equal scores keep the
 * given order. The whole is run twice, because some rules look at what the first run made of a neighbour.
 *
 * MACHINE-DRAFTED rules (grammar descriptions of Russian, tuned on the development halves of UD Russian GSD and Taiga only); not
 * reviewed by a native speaker.
 */
import type { AnalysisCandidate, AnalyzedToken, RawToken } from '../../core';
import { ruWordCandidates } from './analyze';
import { RU_N_PRONOUNS, ruCasesOf, ruGovernmentFit, ruPrepositionOf } from './government';
import { ruKey } from './text';
import { RU_ANALYZER } from './version';

type Cand = AnalysisCandidate;

// ───────────────────────────── weights ─────────────────────────────

/** A reading a hard rule excludes loses this much confidence, down to the floor, so that the pack no longer calls the word conflicted. */
const HARD_LOWER = 0.2;
const HARD_FLOOR = 0.3;
const W = {
  /** What the base order's position costs, so that equal scores keep the given order. */
  tie: 0.001,
  /** A reading the context-free analyser holds less certain (rarer lemma, ё restored, register label) is held back by this per point of confidence. */
  confidence: 5,
  /** One link of agreement in case, number and gender between a modifier and the word after it. */
  agree: 1.0,
  govMain: 2.0, govMinor: 0.6, govNone: -1.2, verbAfterPrep: -3.0, prepReading: 1.0,
  numeral: 1.6,
  genitive: 0.9, negation: 1.6,
  subjectVerb: 1.0, subjectNom: 0.6,
  infinitive: 2.2, modal: 1.6,
  imperativeOut: -2.5,
  lexical: 2.0,
} as const;

// ───────────────────────────── small helpers ─────────────────────────────

const vals = (c: Cand, key: string): string[] => (c.morph[key] ? c.morph[key].split(',') : []);
const casesOf = (c: Cand): string[] => ruCasesOf(c.morph.Case);
const isPos = (c: Cand, ...pos: string[]): boolean => c.pos !== undefined && pos.includes(c.pos);
const hasVal = (c: Cand, key: string, v: string): boolean => vals(c, key).includes(v);
const isFin = (c: Cand): boolean => isPos(c, 'VERB', 'AUX') && hasVal(c, 'VerbForm', 'Fin');
const isInf = (c: Cand): boolean => isPos(c, 'VERB', 'AUX') && hasVal(c, 'VerbForm', 'Inf');
const isPart = (c: Cand): boolean => isPos(c, 'VERB') && hasVal(c, 'VerbForm', 'Part') && !!c.morph.Case;
const inter = (a: string[], b: string[]): string[] => a.filter((x) => b.includes(x));

/** A declining word that stands before a noun and agrees with it: adjective, determiner, numeral, participle, adjective-like pronoun. */
function isModifier(c: Cand): boolean {
  if (!c.morph.Case || c.morph.Variant === 'Short') return false;
  if (isPos(c, 'ADJ', 'DET', 'NUM')) return true;
  if (isPart(c)) return true;
  return isPos(c, 'PRON') && !c.morph.Person && (!!c.morph.Gender || hasVal(c, 'Number', 'Plur'));
}
/** A word a modifier can stand before. */
const isHeadLike = (c: Cand): boolean => !!c.morph.Case && (isPos(c, 'NOUN', 'PROPN', 'PRON', 'ADJ', 'DET', 'NUM') || isPart(c));
const isNoun = (c: Cand): boolean => isPos(c, 'NOUN', 'PROPN');
const isNominal = (c: Cand): boolean => !!c.morph.Case && (isPos(c, 'NOUN', 'PROPN', 'PRON', 'ADJ', 'DET', 'NUM') || isPart(c));

const CASE_WORDS: Record<string, string> = { Nom: 'nominative', Gen: 'genitive', Dat: 'dative', Acc: 'accusative', Ins: 'instrumental', Prep: 'prepositional' };
const caseWords = (cs: readonly string[]): string => cs.map((c) => CASE_WORDS[c] ?? c).join(' or ');

/** Whether a modifier reading and the reading after it agree in case, number and gender (and animacy in the accusative). */
export function ruAgrees(a: Cand, b: Cand): boolean {
  const cs = inter(casesOf(a), casesOf(b));
  if (!cs.length) return false;
  const ns = vals(a, 'Number').length && vals(b, 'Number').length ? inter(vals(a, 'Number'), vals(b, 'Number')) : vals(a, 'Number').length ? vals(a, 'Number') : vals(b, 'Number').length ? vals(b, 'Number') : ['Sing', 'Plur'];
  if (!ns.length) return false;
  if (ns.includes('Sing') && a.morph.Gender && b.morph.Gender && !inter(vals(a, 'Gender'), vals(b, 'Gender')).length) return false;
  if (cs.length === 1 && cs[0] === 'Acc' && a.morph.Animacy && b.morph.Animacy && inter(vals(a, 'Animacy'), vals(b, 'Animacy')).length === 0
    && (ns.includes('Plur') || hasVal(a, 'Gender', 'Masc'))) return false;
  return true;
}

// ───────────────────────────── the sentence ─────────────────────────────

interface Why { d: number; text: string }

/** What a HARD rule (a requirement of Russian grammar, not a preference) says about the readings of one token: which are compatible with it. */
interface Verdict { i: number; compat: boolean[]; rule: string; /** The rule is decisive: a compatible reading the context-free order had lowered as 'much rarer' gets that penalty back. */ restore?: boolean }

/** Words after which a noun stands in the genitive plural (or the genitive of quantity), and the numerals 2–4 that take the genitive singular. */
export const PAUCAL = new Set(['два', 'две', 'три', 'четыре', 'оба', 'обе', 'полтора', 'полторы']);
/** The numerals proper (the quantity words многo, мало, несколько … are a preference, not a requirement, and stay soft). */
const HARD_GEN_PLURAL = new Set(['пять', 'шесть', 'семь', 'восемь', 'девять', 'десять', 'одиннадцать', 'двенадцать', 'тринадцать', 'четырнадцать', 'пятнадцать', 'шестнадцать', 'семнадцать', 'восемнадцать', 'девятнадцать', 'двадцать', 'тридцать', 'сорок', 'пятьдесят', 'шестьдесят', 'семьдесят', 'восемьдесят', 'девяносто', 'сто', 'двести', 'триста', 'четыреста', 'пятьсот', 'шестьсот', 'семьсот', 'восемьсот', 'девятьсот']);
export const GEN_PLURAL = new Set([
  'пять', 'шесть', 'семь', 'восемь', 'девять', 'десять', 'одиннадцать', 'двенадцать', 'тринадцать', 'четырнадцать', 'пятнадцать', 'шестнадцать', 'семнадцать',
  'восемнадцать', 'девятнадцать', 'двадцать', 'тридцать', 'сорок', 'пятьдесят', 'шестьдесят', 'семьдесят', 'восемьдесят', 'девяносто', 'сто', 'двести', 'триста',
  'четыреста', 'пятьсот', 'шестьсот', 'семьсот', 'восемьсот', 'девятьсот', 'много', 'мало', 'несколько', 'сколько', 'столько', 'немного', 'немало', 'скольких',
  'многих', 'нескольких',
]);
/** Words and expressions of non-existence that take the genitive (нет, не было, не будет). */
const NEG_EXIST = new Set(['нет', 'нету']);
const NEG_AUX = new Set(['было', 'будет', 'станет', 'осталось', 'останется', 'бывает', 'хватает', 'хватило']);
/** Verbs (lemmas) and predicate words that take an infinitive. */
const INF_VERBS = new Set([
  'хотеть', 'мочь', 'смочь', 'уметь', 'суметь', 'начать', 'начинать', 'стать', 'продолжать', 'продолжить', 'кончить', 'кончать', 'закончить', 'перестать', 'переставать',
  'любить', 'решить', 'решать', 'пытаться', 'попытаться', 'собираться', 'успеть', 'успевать', 'бояться', 'желать', 'стараться', 'постараться', 'принять', 'привыкнуть',
  'предстоять', 'пора', 'должен', 'намереваться', 'отказаться', 'отказываться', 'разрешить', 'позволить', 'заставить', 'просить', 'попросить', 'учиться', 'научиться',
]);
const INF_WORDS = new Set(['надо', 'нужно', 'можно', 'нельзя', 'пора', 'лучше', 'следует', 'необходимо', 'должно', 'легко', 'трудно', 'приятно', 'интересно', 'хочется', 'придётся', 'придется']);
const HARD_INF_VERBS = new Set(['хотеть', 'мочь', 'смочь', 'уметь', 'суметь', 'начать', 'начинать', 'стать', 'продолжать', 'продолжить', 'кончить', 'кончать', 'закончить', 'перестать', 'переставать', 'пытаться', 'попытаться', 'собираться', 'успеть']);
const HARD_INF_WORDS = new Set(['надо', 'нужно', 'можно', 'нельзя']);
const IMP_BLOCK = new Set(['пусть', 'пускай', 'давай', 'давайте', 'да']);
const SUBJECT_PRON = new Set(['я', 'он', 'она', 'оно', 'мы', 'они']);

class Sentence {
  readonly n: number;
  readonly cands: Cand[][];
  readonly keys: string[];
  readonly word: boolean[];
  readonly clause: number[];
  readonly question: boolean[];
  /** The best reading of each token after the previous run (0 in the first). */
  best: number[];
  /** 0 in the first run (neighbours are judged by every reading they have), 1 in the second (by the reading the first run put first). */
  round = 0;
  score: number[][] = [];
  why: Why[][][] = [];
  /** The verdicts of the hard rules of the final run. */
  hard: Verdict[] = [];

  constructor(readonly tokens: RawToken[], cands: Cand[][]) {
    this.n = tokens.length;
    this.cands = cands;
    this.keys = tokens.map((t) => ruKey(t.normalized || t.surface));
    this.word = tokens.map((t, i) => t.isWord && cands[i].length > 0);
    this.best = tokens.map(() => 0);
    this.clause = [];
    this.question = [];
    let cl = 0;
    const ends: number[] = [];
    let start = 0;
    for (let i = 0; i < this.n; i++) {
      const t = tokens[i];
      if (!t.isWord && /[,;:—–!?.…()]/.test(t.surface)) cl++;
      this.clause.push(cl);
      if (!t.isWord && /[.!?…]/.test(t.surface)) { ends.push(i); for (let k = start; k <= i; k++) this.question[k] = /\?/.test(t.surface); start = i + 1; }
    }
    for (let k = start; k < this.n; k++) this.question[k] = false;
    this.reset();
  }

  reset(): void {
    this.score = this.cands.map((cs) => cs.map(() => 0));
    this.why = this.cands.map((cs) => cs.map(() => []));
    this.hard = [];
  }

  /**
   * A hard rule's verdict on token `i`: `ok` says which readings are compatible with it. Recorded in the final run only, and only when
   * the rule really separates the readings (some are compatible and some are not).
   */
  hardVerdict(i: number, ok: (c: Cand, k: number) => boolean, rule: string, restore = false): void {
    if (this.round < 1 || i < 0 || i >= this.n) return;
    const compat = this.cands[i].map((c, k) => ok(c, k));
    if (compat.some(Boolean) && compat.some((x) => !x)) this.hard.push({ i, compat, rule, ...(restore ? { restore } : {}) });
  }

  add(i: number, k: number, d: number, text: string): void {
    if (d === 0) return;
    this.score[i][k] += d;
    this.why[i][k].push({ d, text });
  }
  /** Adds to every reading of token `i` that satisfies `pred`. */
  addWhere(i: number, pred: (c: Cand) => boolean, d: number, text: string): void {
    if (i < 0 || i >= this.n) return;
    this.cands[i].forEach((c, k) => { if (pred(c)) this.add(i, k, d, text); });
  }
  top(i: number): Cand | undefined { return this.cands[i][this.best[i]]; }
  /** Whether a neighbour has a reading that satisfies `pred`: any reading in the first run, the first-placed one in the second. */
  mateHas(j: number, pred: (c: Cand) => boolean): boolean { if (this.round === 0) return this.any(j, pred); const t = this.top(j); return !!t && pred(t); }
  any(i: number, pred: (c: Cand) => boolean): boolean { return i >= 0 && i < this.n && this.cands[i].some(pred); }
  /** The next word token after `i` in the same clause (punctuation ends the search), or -1. */
  nextWord(i: number): number { return i + 1 < this.n && this.word[i + 1] && this.clause[i + 1] === this.clause[i] ? i + 1 : -1; }
  prevWord(i: number): number { return i - 1 >= 0 && this.word[i - 1] && this.clause[i - 1] === this.clause[i] ? i - 1 : -1; }
  /** The word before token i is 2, 3, 4 (or оба): the noun after it is genitive singular. */
  paucalAt(i: number): boolean { return i >= 1 && PAUCAL.has(this.keys[i - 1]); }
  surface(i: number): string { return this.tokens[i].surface; }
  clauseTokens(i: number): number[] { const out: number[] = []; for (let j = 0; j < this.n; j++) if (this.clause[j] === this.clause[i] && this.word[j]) out.push(j); return out; }
}

// ───────────────────────────── rule a: government of prepositions ─────────────────────────────

/** The nominal after a preposition is read in a case it governs; a finite verb right after one goes last; the preposition reading itself is confirmed. */
function rulePrepositionGovernment(s: Sentence): void {
  for (let i = 0; i < s.n; i++) {
    if (!s.word[i]) continue;
    const prep = ruPrepositionOf(s.keys[i]);
    if (!prep || !s.any(i, (c) => isPos(c, 'ADP'))) continue;
    const j = s.nextWord(i);
    const label = `after the preposition «${s.surface(i)}», which takes the ${caseWords([...prep.main, ...prep.minor])}`;
    if (j < 0) continue;
    let fits = false;
    const governs = s.round >= 1 && !!s.top(i) && isPos(s.top(i) as Cand, 'ADP');
    s.cands[j].forEach((c, k) => {
      if (isFin(c)) { s.add(j, k, W.verbAfterPrep, `a finite verb cannot follow «${s.surface(i)}» directly`); return; }
      if (!isNominal(c)) return;
      let fit = 0;
      for (const cs of casesOf(c)) fit = Math.max(fit, ruGovernmentFit(prep, cs));
      if (fit > 0) fits = true;
      s.add(j, k, fit === 2 ? W.govMain : fit === 1 ? W.govMinor : W.govNone, `${label}, and this reading is in the ${caseWords(casesOf(c).filter((x) => ruGovernmentFit(prep, x) > 0)) || 'a case it does not take'}`);
    });
    if (governs) {
      s.hardVerdict(j, (c) => !(isFin(c) || (isNominal(c) && casesOf(c).every((x) => ruGovernmentFit(prep, x) === 0))), `after the preposition «${s.surface(i)}», which takes the ${caseWords([...prep.main, ...prep.minor])}, the noun is in one of those cases`);
    }
    // the second locative (в лесу, в году) is the form after в and на when the noun has one
    if (prep.lemma === 'в' || prep.lemma === 'на') s.addWhere(j, (c) => isNominal(c) && vals(c, 'Case').includes('Loc') && !vals(c, 'Case').includes('Dat'), 0.8, `after «${s.surface(i)}» a noun with a second locative uses it (в лесу, в году)`);
    // a word that is a preposition and something else (надо, об, вокруг) is the preposition when a noun phrase in its case follows
    s.addWhere(i, (c) => isPos(c, 'ADP'), fits ? W.prepReading : -0.3, fits ? `a noun phrase in the case «${s.surface(i)}» takes follows` : 'no noun phrase in its case follows');
    // the forms with an initial н- (него, неё, них) are personal pronouns
    if (RU_N_PRONOUNS.has(s.keys[j])) {
      s.addWhere(j, (c) => isPos(c, 'PRON') && ['он', 'она', 'оно', 'они'].includes(c.lemma ?? ''), 2, `a form with н- after a preposition is a personal pronoun`);
      s.addWhere(j, (c) => isPos(c, 'PRON', 'DET') && ['его', 'её', 'их'].includes(c.lemma ?? ''), -2, 'a form with н- after a preposition is never the possessive');
    }
  }
}

// ───────────────────────────── rule b: agreement inside the noun phrase ─────────────────────────────

/** The score of the link between reading `a` of token `i` and reading `b` of token `i+1`: agreement of a modifier with the word it stands before. */
function linkScore(s: Sentence, i: number, a: Cand, b: Cand): number {
  if (!isModifier(a) || !isHeadLike(b)) return 0;
  if (ruAgrees(a, b)) return W.agree;
  // after 2, 3, 4 an adjective is in the genitive plural (or nominative plural feminine) and the noun in the genitive singular
  if (s.paucalAt(i) && inter(casesOf(a), ['Gen', 'Nom']).length && hasVal(a, 'Number', 'Plur') && isNoun(b) && casesOf(b).includes('Gen') && hasVal(b, 'Number', 'Sing')) return W.agree * 0.9;
  return 0;
}

/** Max-marginal scores of every reading over the chains of neighbouring words: the best total of unary scores and links with that reading fixed. */
function chainScores(s: Sentence, unary: number[][]): number[][] {
  const fwd: number[][] = [];
  const bwd: number[][] = [];
  const joined = (i: number): boolean => i + 1 < s.n && s.word[i] && s.word[i + 1];
  for (let i = 0; i < s.n; i++) {
    fwd.push(unary[i].map((u, k) => {
      if (i === 0 || !joined(i - 1)) return u;
      let best = -Infinity;
      s.cands[i - 1].forEach((a, l) => { best = Math.max(best, fwd[i - 1][l] + linkScore(s, i - 1, a, s.cands[i][k])); });
      return u + best;
    }));
  }
  for (let i = s.n - 1; i >= 0; i--) {
    bwd[i] = unary[i].map((_, k) => {
      if (!joined(i)) return 0;
      let best = -Infinity;
      s.cands[i + 1].forEach((b, l) => { best = Math.max(best, linkScore(s, i, s.cands[i][k], b) + unary[i + 1][l] + bwd[i + 1][l]); });
      return best;
    });
  }
  return unary.map((row, i) => row.map((_, k) => fwd[i][k] + bwd[i][k]));
}

/**
 * Agreement over a chain of neighbouring declining words (эту красивую книгу): when exactly ONE combination of readings agrees in case,
 * number and gender along the whole chain (and, for the first word, in a case the preceding preposition governs), that combination is
 * required. A chain is a run of adjacent words that have only nominal readings and link by agreement; a longer or ambiguous chain
 * (more than one combination, or too many to count) gets no verdict and stays a preference.
 */
function ruleChainAgreement(s: Sentence): void {
  if (s.round < 1) return;
  const nominalOnly = (i: number): boolean => s.word[i] && s.cands[i].every((c) => isNominal(c));
  const link = (a: Cand, b: Cand): boolean => isModifier(a) && isHeadLike(b) && ruAgrees(a, b);
  let i = 0;
  while (i < s.n) {
    if (!nominalOnly(i)) { i++; continue; }
    let j = i;
    while (j + 1 < s.n && nominalOnly(j + 1) && s.clause[j + 1] === s.clause[i] && s.cands[j].some((a) => s.cands[j + 1].some((b) => link(a, b)))) j++;
    if (j > i) chainVerdict(s, i, j, link);
    i = j + 1;
  }
}

function chainVerdict(s: Sentence, from: number, to: number, link: (a: Cand, b: Cand) => boolean): void {
  const len = to - from + 1;
  let space = 1;
  for (let t = from; t <= to; t++) space *= s.cands[t].length;
  if (len > 5 || space > 4000) return;
  // the preposition before the chain governs the case of its first word
  const p = from > 0 && s.word[from - 1] && s.clause[from - 1] === s.clause[from] ? ruPrepositionOf(s.keys[from - 1]) : undefined;
  const prepWord = p && s.top(from - 1) && isPos(s.top(from - 1) as Cand, 'ADP') ? p : undefined;
  const allowedFirst = (c: Cand): boolean => !prepWord || casesOf(c).some((x) => ruGovernmentFit(prepWord, x) > 0);
  const firsts = s.cands[from].map((c, k) => (allowedFirst(c) ? k : -1)).filter((k) => k >= 0);
  const start = firsts.length ? firsts : s.cands[from].map((_, k) => k);
  // a combination is the case, number, gender and animacy of every word: two readings that differ only in lemma or part of speech
  // (этот as determiner or as pronoun) are the same combination, and both stay compatible with it
  const sig = (c: Cand): string => [casesOf(c).slice().sort().join('+'), vals(c, 'Number').join('+'), vals(c, 'Gender').join('+'), vals(c, 'Animacy').join('+')].join('/');
  const found = new Set<string>();
  const walk = (t: number, chosen: number[]): void => {
    if (found.size > 1) return;
    if (t > to) { found.add(chosen.map((k, d) => sig(s.cands[from + d][k])).join('|')); return; }
    for (let k = 0; k < s.cands[t].length; k++) {
      if (!link(s.cands[t - 1][chosen[chosen.length - 1]], s.cands[t][k])) continue;
      chosen.push(k);
      walk(t + 1, chosen);
      chosen.pop();
    }
  };
  for (const k of start) { walk(from + 1, [k]); if (found.size > 1) break; }
  if (found.size !== 1) return;
  const sigs = [...found][0].split('|');
  const words = Array.from({ length: len }, (_, d) => '«' + s.surface(from + d) + '»').join(' ');
  const rule = `${words} agree in case, number and gender in only one way${prepWord ? ' (and the first word is in a case «' + s.surface(from - 1) + '» takes)' : ''}`;
  for (let d = 0; d < len; d++) s.hardVerdict(from + d, (c, k) => sig(c) === sigs[d] && (d > 0 || start.includes(k)), rule);
}

// ───────────────────────────── rule d: numerals ─────────────────────────────

/** After два / три / четыре the noun is genitive singular; after пять … and the words of quantity it is genitive plural; after один it agrees (rule b). */
function ruleNumerals(s: Sentence): void {
  for (let i = 0; i < s.n; i++) {
    if (!s.word[i]) continue;
    const key = s.keys[i];
    const paucal = PAUCAL.has(key);
    if (!paucal && !GEN_PLURAL.has(key)) continue;
    if (!s.any(i, (c) => isPos(c, 'NUM', 'ADV', 'DET', 'ADJ', 'PRON'))) continue;
    // walk over modifiers to the noun
    for (let j = i + 1, steps = 0; j < s.n && s.word[j] && s.clause[j] === s.clause[i] && steps < 4; j++, steps++) {
      const want = paucal ? 'Sing' : 'Plur';
      s.addWhere(j, (c) => isNoun(c) && casesOf(c).includes('Gen') && hasVal(c, 'Number', want), W.numeral,
        paucal ? `after «${s.surface(i)}» the noun is genitive singular` : `after «${s.surface(i)}» the noun is genitive plural`);
      if ((paucal || HARD_GEN_PLURAL.has(key)) && s.round >= 1 && s.top(i) && isPos(s.top(i) as Cand, 'NUM') && s.any(j, isNoun)) {
        s.hardVerdict(j, (c) => !isNoun(c) || (casesOf(c).includes('Gen') && hasVal(c, 'Number', want)),
          paucal ? `after два, три, четыре the noun is genitive singular («${s.surface(i)}»)` : `after пять and the higher numerals the noun is genitive plural («${s.surface(i)}»)`);
      }
      if (!s.any(j, (c) => isModifier(c) || isPos(c, 'NUM'))) break;
    }
  }
}

// ───────────────────────────── rule e: the genitive ─────────────────────────────

/** A genitive after a noun (книга брата), after нет / не было / не будет (genitive of negation); quantity words are in rule d. */
function ruleGenitive(s: Sentence): void {
  for (let j = 0; j < s.n; j++) {
    if (!s.word[j]) continue;
    const p = s.prevWord(j);
    if (p >= 0 && s.any(p, (c) => isNoun(c) && !!c.morph.Case) && !s.any(p, (c) => isPos(c, 'ADP')) && !(s.top(p) && isFin(s.top(p) as Cand))) {
      s.addWhere(j, (c) => isNominal(c) && !isPos(c, 'PRON') && casesOf(c).includes('Gen'), W.genitive, `a genitive may follow a noun («${s.surface(p)}»)`);
    }
  }
  for (let i = 0; i < s.n; i++) {
    if (!s.word[i]) continue;
    const key = s.keys[i];
    const neg = NEG_EXIST.has(key) || (key === 'не' && s.nextWord(i) >= 0 && NEG_AUX.has(s.keys[s.nextWord(i)]));
    if (!neg) continue;
    const from = key === 'не' ? s.nextWord(i) : i;
    for (let j = from + 1, steps = 0; j < s.n && s.word[j] && s.clause[j] === s.clause[i] && steps < 3; j++, steps++) {
      s.addWhere(j, (c) => isNominal(c) && casesOf(c).includes('Gen'), W.negation, `after «${key === 'не' ? 'не ' + s.surface(from) : s.surface(i)}» the genitive of negation stands`);
      if (s.round >= 1 && s.any(j, isNoun)) s.hardVerdict(j, (c) => !isNoun(c) || casesOf(c).includes('Gen'), `after нет, не было, не будет the thing that is absent is genitive («${key === 'не' ? 'не ' + s.surface(from) : s.surface(i)}»)`);
      if (!s.any(j, (c) => isModifier(c))) break;
    }
  }
}

// ───────────────────────────── rule c: subject and verb ─────────────────────────────

/** Whether a verb reading and a nominative reading agree: gender and number in the past, person and number otherwise. */
export function verbAgrees(v: Cand, n: Cand): boolean {
  const vn = vals(v, 'Number');
  const nn = vals(n, 'Number');
  if (vn.length && nn.length && !inter(vn, nn).length) return false;
  if (hasVal(v, 'Tense', 'Past')) {
    if (hasVal(n, 'Number', 'Sing') && v.morph.Gender && n.morph.Gender && !inter(vals(v, 'Gender'), vals(n, 'Gender')).length && !n.morph.Person) return false;
    if (n.morph.Person && v.morph.Gender && n.morph.Gender && !inter(vals(v, 'Gender'), vals(n, 'Gender')).length && vn.includes('Sing') && nn.length === 1) return false;
    return true;
  }
  const vp = vals(v, 'Person');
  const np = n.morph.Person ? vals(n, 'Person') : ['3'];
  return !vp.length || inter(vp, np).length > 0;
}
const isSubjectCand = (c: Cand): boolean => isPos(c, 'NOUN', 'PROPN', 'PRON') && casesOf(c).includes('Nom');

/** A past verb agrees in gender and number, a non-past verb in person and number, with a nominative subject in the clause; a nominative reading is preferred when the clause has a finite verb that agrees with it. */
function ruleSubjectVerb(s: Sentence): void {
  for (let i = 0; i < s.n; i++) {
    if (!s.word[i]) continue;
    const mates = s.clauseTokens(i).filter((j) => j !== i);
    if (s.round >= 1 && s.cands[i].some((c) => isFin(c) && hasVal(c, 'Tense', 'Past'))) {
      for (const j of [i - 1, i + 1]) {
        if (j < 0 || j >= s.n || !s.word[j] || s.clause[j] !== s.clause[i]) continue;
        const topN = s.cands[j][0];
        const clear = isSubjectCand(topN) && vals(topN, 'Case').length === 1 && vals(topN, 'Number').length === 1 && s.cands[j].slice(1).every((c) => c.confidence <= topN.confidence - 0.15) && topN.confidence >= 0.85;
        if (clear) s.hardVerdict(i, (c) => !(isFin(c) && hasVal(c, 'Tense', 'Past')) || verbAgrees(c, topN), `a past-tense verb agrees in gender and number with the subject «${s.surface(j)}» beside it`);
      }
    }
    s.cands[i].forEach((c, k) => {
      if (isFin(c) && !hasVal(c, 'Mood', 'Imp')) {
        const subj = mates.find((j) => s.mateHas(j, (n) => isSubjectCand(n) && verbAgrees(c, n)));
        if (subj !== undefined) s.add(i, k, W.subjectVerb, `agrees with «${s.surface(subj)}», a nominative in the same clause`);
      } else if (isSubjectCand(c)) {
        const verb = mates.find((j) => s.mateHas(j, (v) => isFin(v) && !hasVal(v, 'Mood', 'Imp') && verbAgrees(v, c)));
        if (verb !== undefined) s.add(i, k, W.subjectNom, `the subject of «${s.surface(verb)}», which agrees with it`);
      }
    });
  }
}


/** Light words that may stand between a subject and its finite verb (он не сел, она уже спала). */
const SUBJECT_LIGHT = new Set(['не', 'уже', 'ещё', 'еще', 'бы', 'же', 'тоже', 'также', 'всегда', 'сразу', 'вдруг', 'тогда', 'потом', 'всё', 'вновь']);
const SUBJECT_PRONOUNS = new Set([...SUBJECT_PRON, 'ты', 'вы']);

/**
 * A word right after its subject (a personal pronoun, or a clear nominative noun; «не», «уже» … may stand between) that has a finite verb
 * reading agreeing with the subject IS that verb: «Он сел в трамвай», «Кошка спала». Its other readings are forms of a noun that cannot
 * be the predicate (село, gen. pl.), so they are set aside, and a verb reading the context-free order had lowered as 'much rarer' is
 * no longer so. A word with no finite reading is left alone (the rule needs a verb reading to prefer).
 */
function ruleVerbAfterSubject(s: Sentence): void {
  for (let i = 0; i < s.n; i++) {
    if (!s.word[i]) continue;
    const isVerbal = (c: Cand): boolean => isFin(c) && !hasVal(c, 'Mood', 'Imp');
    if (!s.cands[i].some(isVerbal) || s.cands[i].every(isVerbal)) continue;
    let p = s.prevWord(i);
    while (p >= 0 && SUBJECT_LIGHT.has(s.keys[p])) p = s.prevWord(p);
    if (p < 0) continue;
    let subjects: Cand[] = [];
    if (SUBJECT_PRONOUNS.has(s.keys[p])) subjects = s.cands[p].filter((c) => isPos(c, 'PRON') && casesOf(c).includes('Nom'));
    else if (s.round >= 1) {
      const topN = s.top(p);
      if (topN && isSubjectCand(topN) && isNoun(topN) && vals(topN, 'Case').length === 1 && vals(topN, 'Number').length === 1 && s.cands[p].every((c) => c === topN || c.confidence <= topN.confidence - 0.15) && topN.confidence >= 0.85) subjects = [topN];
    }
    if (!subjects.length) continue;
    const fits = (c: Cand): boolean => isVerbal(c) && subjects.some((n) => verbAgrees(c, n));
    if (!s.cands[i].some(fits)) continue;
    s.addWhere(i, fits, 2, `it agrees with its subject «${s.surface(p)}» right before it`);
    s.hardVerdict(i, (c) => fits(c) || isFin(c), `«${s.surface(i)}» stands right after its subject «${s.surface(p)}» and is the verb that agrees with it`, true);
  }
}

/** Verbs that take the genitive (or a partitive one) where other verbs take the accusative. */
const GEN_VERBS = new Set([
  'ждать', 'ожидать', 'дожидаться', 'дождаться', 'бояться', 'опасаться', 'остерегаться', 'пугаться', 'желать', 'пожелать', 'хотеть', 'захотеть', 'требовать', 'потребовать',
  'добиваться', 'добиться', 'достигать', 'достигнуть', 'достичь', 'касаться', 'коснуться', 'избегать', 'избежать', 'лишать', 'лишить', 'лишаться', 'лишиться', 'просить', 'попросить',
  'искать', 'поискать', 'заслуживать', 'заслужить', 'придерживаться', 'держаться', 'хватать', 'хватить', 'недоставать', 'достаться', 'достать', 'стоить', 'бывать', 'быть',
  'набрать', 'набирать', 'выпить', 'пить', 'налить', 'наливать', 'принести', 'купить', 'взять', 'дать', 'съесть', 'добавить', 'добавлять', 'положить',
]);

/**
 * A noun form that can only be the genitive, right after a finite verb that takes the accusative, when ANOTHER word of the same spelling
 * can be the object (accusative) there: «принимали душ» is душ (the shower), not a form of душа (genitive plural, which needs a governor).
 * Only where such a homograph exists, never after a verb of genitive government, with a negation, or after a quantity word.
 */
function ruleObjectAfterVerb(s: Sentence): void {
  for (let j = 0; j < s.n; j++) {
    if (!s.word[j]) continue;
    const p = s.prevWord(j);
    if (p < 0 || s.round < 1) continue;
    const verb = s.top(p);
    if (!verb || !isFin(verb) || hasVal(verb, 'Mood', 'Imp') || GEN_VERBS.has(verb.lemma ?? '')) continue;
    const clause = s.clauseTokens(j);
    if (clause.some((x) => x < j && (['не', 'ни', 'нет', 'нету'].includes(s.keys[x]) || GEN_PLURAL.has(s.keys[x])))) continue;
    const accLemmas = new Set(s.cands[j].filter((c) => isNoun(c) && casesOf(c).includes('Acc')).map((c) => `${c.lemma}|${c.pos}`));
    if (!accLemmas.size) continue;
    const genOnly = (c: Cand): boolean => isNoun(c) && casesOf(c).length > 0 && casesOf(c).every((x) => x === 'Gen') && !accLemmas.has(`${c.lemma}|${c.pos}`);
    if (!s.cands[j].some(genOnly)) continue;
    s.addWhere(j, (c) => !genOnly(c), 1.5, `«${s.surface(p)}» takes an object in the accusative`);
    s.hardVerdict(j, (c) => !genOnly(c), `after «${s.surface(p)}», which takes the accusative, «${s.surface(j)}» is its object, and a form that is only genitive has no governor here`, true);
  }
}

/** A second nominative is not preferred: after a verb that already has a nominative subject before it, a nominal reading that is nominative only is held back and one that is accusative only is favoured. */
function ruleSecondNominative(s: Sentence): void {
  const COPULAS = new Set(['быть', 'являться', 'стать', 'казаться', 'оказаться', 'считаться', 'остаться']);
  const coord = new Set(['и', 'а', 'но', 'или', 'да', 'как', 'чем']);
  for (let v = 0; v < s.n; v++) {
    if (!s.word[v] || !s.mateHas(v, (c) => isFin(c) && !hasVal(c, 'Mood', 'Imp'))) continue;
    if (s.mateHas(v, (c) => isFin(c) && COPULAS.has(c.lemma ?? ''))) continue;
    const verb = s.round === 0 ? s.cands[v].find(isFin) : s.top(v);
    if (!verb) continue;
    const mates = s.clauseTokens(v);
    const subj = mates.find((j) => j < v && s.mateHas(j, (c) => isSubjectCand(c) && verbAgrees(verb, c)));
    if (subj === undefined) continue;
    for (const t of mates) {
      if (t <= v) continue;
      const p = s.prevWord(t);
      if (p >= 0 && (s.any(p, (c) => isPos(c, 'ADP', 'CONJ')) || coord.has(s.keys[p]))) continue;
      s.addWhere(t, (c) => isNominal(c) && !isPos(c, 'PRON') && casesOf(c).length === 1 && casesOf(c)[0] === 'Nom', -0.8, `«${s.surface(subj)}» is already the subject of «${s.surface(v)}», so a second nominative is unlikely`);
      s.addWhere(t, (c) => isNominal(c) && !isPos(c, 'PRON') && casesOf(c).length === 1 && casesOf(c)[0] === 'Acc', 0.5, `«${s.surface(subj)}» is already the subject of «${s.surface(v)}», so what follows is its object`);
    }
  }
}

// ───────────────────────────── rule f: verbs ─────────────────────────────

/** A form that can be an infinitive is one after a modal or phasal word; стали before an infinitive is the verb; есть after у + genitive is быть; an imperative goes last beside an explicit subject. */
function ruleVerbs(s: Sentence): void {
  for (let i = 0; i < s.n; i++) {
    if (!s.word[i]) continue;
    // the word after the trigger, skipping a negation or a light adverb
    let j = s.nextWord(i);
    if (j >= 0 && ['не', 'уже', 'ещё', 'еще', 'всё', 'все', 'бы', 'же', 'ли', 'также', 'тоже'].includes(s.keys[j])) j = s.nextWord(j);
    if (j >= 0) {
      const trigger = s.any(i, (c) => isPos(c, 'VERB', 'AUX') && (INF_VERBS.has(c.lemma ?? '') || (c.lemma === 'быть' && hasVal(c, 'Tense', 'Fut'))) && (isFin(c) || isInf(c)))
        || INF_WORDS.has(s.keys[i]);
      if (trigger && s.any(j, isInf)) {
        const label = `after «${s.surface(i)}», which takes an infinitive`;
        s.addWhere(j, isInf, W.infinitive, label);
        const topHere = s.top(i);
        if (s.round >= 1 && (HARD_INF_WORDS.has(s.keys[i]) || (topHere && isFin(topHere) && HARD_INF_VERBS.has(topHere.lemma ?? '')))) s.hardVerdict(j, isInf, `after «${s.surface(i)}» an infinitive stands`);
        s.addWhere(i, (c) => isPos(c, 'VERB', 'AUX') && (INF_VERBS.has(c.lemma ?? '') || c.lemma === 'быть') && isFin(c), W.modal, `it takes the infinitive «${s.surface(j)}» after it`);
        s.addWhere(i, (c) => isPos(c, 'ADJ', 'ADV', 'PART') && INF_WORDS.has(s.keys[i]), W.modal, `it takes the infinitive «${s.surface(j)}» after it`);
      }
    }
    // есть after у + genitive
    if (s.keys[i] === 'есть') {
      let u = false;
      for (let b = i - 1, steps = 0; b >= 0 && steps < 4 && s.word[b] && s.clause[b] === s.clause[i]; b--, steps++) if (s.keys[b] === 'у') u = true;
      if (u) s.addWhere(i, (c) => c.lemma === 'быть', 2, '«есть» after «у» + genitive is the verb «быть» («у меня есть …» = I have)');
    }
  }
  // an imperative goes last beside an explicit subject of another person
  for (let i = 0; i < s.n; i++) {
    if (!s.word[i] || !s.any(i, (c) => isFin(c) && hasVal(c, 'Mood', 'Imp'))) continue;
    const mates = s.clauseTokens(i).filter((j) => j !== i);
    const subj = mates.find((j) => SUBJECT_PRON.has(s.keys[j]) && s.any(j, (c) => isPos(c, 'PRON') && casesOf(c).includes('Nom')));
    if (subj === undefined) continue;
    if (mates.some((j) => IMP_BLOCK.has(s.keys[j]))) continue;
    s.addWhere(i, (c) => isFin(c) && hasVal(c, 'Mood', 'Imp'), W.imperativeOut, `the sentence has its own subject («${s.surface(subj)}»), so this is not an imperative`);
  }
}

// ───────────────────────────── rule g: words of several parts of speech ─────────────────────────────


/** что: the conjunction after a verb of saying or thinking and before a clause with its own subject; otherwise the pronoun. */
function ruleChto(s: Sentence, i: number): void {
  const p = i - 1;
  const comma = p >= 0 && !s.tokens[p].isWord && s.tokens[p].surface === ',';
  const j = s.nextWord(i);
  const nextClause = j >= 0 ? s.clauseTokens(j) : [];
  const ownSubject = nextClause.some((x) => s.any(x, (c) => isSubjectCand(c) && !isPos(c, 'NOUN', 'PROPN') ) && x !== i) || false;
  const afterPrep = s.prevWord(i) >= 0 && s.any(s.prevWord(i), (c) => isPos(c, 'ADP'));
  const verbNext = j >= 0 && s.any(j, (c) => isFin(c) || isInf(c));
  const nextNeutralOrInf = j >= 0 && s.any(j, (c) => isInf(c) || (isFin(c) && (hasVal(c, 'Gender', 'Neut') || (hasVal(c, 'Person', '3') && hasVal(c, 'Number', 'Sing')))));
  let pron = false;
  let why = '';
  if (afterPrep) { pron = true; why = 'after a preposition «что» is the pronoun (about what, with what)'; }
  else if (!comma && p < 0) { pron = true; why = 'at the start of a clause, before a verb, «что» is the pronoun (what)'; }
  else if (comma && !ownSubject && verbNext && nextNeutralOrInf) { pron = true; why = '«что» is the subject or object of the clause that follows (what happened / what to do), so it is the pronoun'; }
  else if (comma) { why = 'after a comma and before a clause with its own subject «что» joins two clauses (that)'; }
  if (pron) s.addWhere(i, (c) => isPos(c, 'PRON'), W.lexical, why);
  else if (why) s.addWhere(i, (c) => isPos(c, 'SCONJ', 'CONJ'), W.lexical, why);
}

/** это is the pronoun unless it stands before a noun it agrees with (это окно, with the determiner этот); the forms этого, этом, этому, этим likewise. */
function ruleEto(s: Sentence, i: number): void {
  const key = s.keys[i];
  const j = s.nextWord(i);
  let agreeing = false;
  if (j >= 0) {
    for (let x = j, steps = 0; x < s.n && s.word[x] && s.clause[x] === s.clause[i] && steps < 3; x++, steps++) {
      const modifierHere = s.any(x, isModifier);
      const hit = s.cands[x].some((n) => isNoun(n) && s.cands[i].some((d) => isPos(d, 'DET') && d.lemma === 'этот' && ruAgrees(d, n) && (key !== 'это' || (hasVal(n, 'Gender', 'Neut') && casesOf(n).some((q) => q === 'Nom' || q === 'Acc')))));
      if (hit) { agreeing = true; break; }
      if (!modifierHere) break;
    }
  }
  if (agreeing) s.addWhere(i, (c) => isPos(c, 'DET') && c.lemma === 'этот', W.lexical, `«${s.surface(i)}» agrees with the noun after it, so it is the determiner этот`);
  else s.addWhere(i, (c) => c.lemma === 'это' && isPos(c, 'PRON'), W.lexical, `no noun agrees with «${s.surface(i)}», so it is the pronoun это (this, that)`);
}

/** его / её / их: the possessive before a noun, the personal pronoun otherwise. */
function rulePossessive(s: Sentence, i: number): void {
  let nounAhead = false;
  for (let x = i + 1, steps = 0; x < s.n && s.word[x] && s.clause[x] === s.clause[i] && steps < 3; x++, steps++) {
    if (s.any(x, (c) => isNoun(c) && !!c.morph.Case) && !s.any(x, (c) => isPos(c, 'ADP', 'PART', 'CONJ', 'SCONJ'))) { nounAhead = true; break; }
    if (!s.any(x, isModifier)) break;
  }
  const key = s.keys[i];
  if (nounAhead) s.addWhere(i, (c) => c.lemma === key && isPos(c, 'PRON', 'DET'), W.lexical, `«${s.surface(i)}» stands before a noun, so it is the possessive (his, her, their)`);
  else s.addWhere(i, (c) => c.lemma !== key && isPos(c, 'PRON'), W.lexical, `no noun follows «${s.surface(i)}», so it is the personal pronoun (him, her, them)`);
}

/** все / всё: всё with a singular verb or alone as an object; все with a plural verb or a plural noun. */
function ruleVse(s: Sentence, i: number): void {
  const mates = s.clauseTokens(i).filter((j) => j !== i);
  const j = s.nextWord(i);
  const nextKey = j >= 0 ? s.keys[j] : '';
  const pluralNext = j >= 0 && (['они', 'мы', 'вы', 'эти', 'те', 'наши', 'ваши', 'свои', 'их'].includes(nextKey) || s.any(j, (c) => isNoun(c) && hasVal(c, 'Number', 'Plur') && !casesOf(c).includes('Gen') && casesOf(c).some((q) => q === 'Nom' || q === 'Acc')));
  const singularNext = j >= 0 && (['это', 'то', 'было', 'будет', 'остальное', 'хорошо', 'плохо', 'равно'].includes(nextKey));
  const verbs = mates.filter((x) => s.any(x, isFin));
  const verbPlural = verbs.some((x) => s.any(x, (c) => isFin(c) && hasVal(c, 'Number', 'Plur')));
  const verbNeutral = verbs.some((x) => s.any(x, (c) => isFin(c) && (hasVal(c, 'Gender', 'Neut') || (hasVal(c, 'Person', '3') && hasVal(c, 'Number', 'Sing')))));
  const subjectOther = mates.some((x) => x !== i && s.any(x, (c) => isSubjectCand(c) && hasVal(c, 'Number', 'Sing') && c.morph.Person !== undefined) && SUBJECT_PRON.has(s.keys[x]));
  const isAll = (c: Cand): boolean => c.lemma === 'всё' && isPos(c, 'PRON');
  const isEveryone = (c: Cand): boolean => (c.lemma === 'весь' || c.lemma === 'все') && isPos(c, 'DET', 'PRON') && hasVal(c, 'Number', 'Plur');
  if (pluralNext || (verbPlural && !subjectOther && !verbNeutral)) s.addWhere(i, isEveryone, W.lexical, `a plural word follows or agrees with «${s.surface(i)}», so it is все (all, everyone)`);
  else if (singularNext || subjectOther || (verbNeutral && !verbPlural)) s.addWhere(i, isAll, W.lexical, `«${s.surface(i)}» goes with a singular verb or another subject, so it is всё (everything)`);
}


/** то before «что» («то, что …», «не то, что …») is the pronoun то (that which), not a form of the determiner тот. */
function ruleTo(s: Sentence, i: number): void {
  let j = i + 1;
  if (j < s.n && !s.tokens[j].isWord && s.tokens[j].surface === ',') j++;
  if (j < s.n && s.word[j] && ['что', 'чтобы', 'как'].includes(s.keys[j])) s.addWhere(i, (c) => c.lemma === 'то' && isPos(c, 'PRON'), W.lexical, '«то» before «' + s.surface(j) + '» is the pronoun то: that which, the fact that');
}

/** Lemma pairs: the form is the preposition's variant, the particle, or the shorter word; fixed by the lexicon, not by the neighbours. */
function ruleFunctionWords(s: Sentence): void {
  for (let i = 0; i < s.n; i++) {
    if (!s.word[i]) continue;
    const key = s.keys[i];
    switch (key) {
      case 'что': ruleChto(s, i); break;
      case 'это': case 'этого': case 'этом': case 'этому': case 'этим': ruleEto(s, i); break;
      case 'его': case 'её': case 'ее': case 'их': rulePossessive(s, i); break;
      case 'все': case 'всё': ruleVse(s, i); break;
      case 'то': ruleTo(s, i); break;
      case 'когда': if (!s.question[i]) s.addWhere(i, (c) => isPos(c, 'SCONJ', 'CONJ'), W.lexical, 'in a statement «когда» joins a clause (when)'); else s.addWhere(i, (c) => isPos(c, 'ADV'), W.lexical, 'in a question «когда» asks about time (when?)'); break;
      default: break;
    }
  }
}



/** A short adjective right after a subject pronoun that it agrees with is the predicate («Она рада»: she is glad), not a second nominative noun. */
function ruleShortPredicate(s: Sentence): void {
  for (let j = 1; j < s.n; j++) {
    const p = s.prevWord(j);
    if (p < 0 || !s.word[j] || !SUBJECT_PRON.has(s.keys[p]) && !['ты', 'вы'].includes(s.keys[p])) continue;
    s.addWhere(j, (c) => isPos(c, 'ADJ') && c.morph.Variant === 'Short' && s.cands[p].some((n) => isPos(n, 'PRON') && casesOf(n).includes('Nom') && (hasVal(c, 'Number', 'Plur') ? hasVal(n, 'Number', 'Plur') || !n.morph.Number : !hasVal(n, 'Number', 'Plur') && (!n.morph.Gender || !c.morph.Gender || vals(c, 'Gender').some((g) => vals(n, 'Gender').includes(g))))),
      1.5, `a short adjective right after «${s.surface(p)}» that agrees with it is the predicate (she is glad)`);
  }
}

/** как, пока, чем: the subordinating conjunction unless the sentence is a question that opens with it (как) or a verb or preposition governs it (чем). */
function ruleSubordinators(s: Sentence): void {
  for (let i = 0; i < s.n; i++) {
    if (!s.word[i]) continue;
    const key = s.keys[i];
    if (key !== 'как' && key !== 'пока' && key !== 'чем') continue;
    const p = s.prevWord(i);
    const first = i === 0 || p < 0;
    if (key === 'как') {
      if (s.question[i] && first) s.addWhere(i, (c) => isPos(c, 'ADV'), W.lexical, '«как» opens a question: how?');
      else s.addWhere(i, (c) => isPos(c, 'SCONJ', 'CONJ'), W.lexical, '«как» joins what follows to the rest of the sentence (as, like, how)');
    } else if (key === 'пока') {
      if (s.question[i] || first && s.nextWord(i) < 0) s.addWhere(i, (c) => isPos(c, 'ADV'), W.lexical, '«пока» stands alone: for now');
      else if (s.nextWord(i) >= 0 && s.any(s.nextWord(i), (c) => isFin(c) || (isPos(c, 'PRON', 'NOUN') && casesOf(c).includes('Nom')))) s.addWhere(i, (c) => isPos(c, 'SCONJ', 'CONJ'), W.lexical, '«пока» opens a clause: while, until');
    } else if (p >= 0 && s.any(p, (c) => isPos(c, 'ADP') || (isFin(c) && !hasVal(c, 'Mood', 'Imp')))) s.addWhere(i, (c) => isPos(c, 'PRON'), W.lexical, '«чем» is governed by the word before it: with what');
    else s.addWhere(i, (c) => isPos(c, 'SCONJ', 'CONJ'), W.lexical, '«чем» introduces the second term of a comparison: than');
  }
}

// ───────────────────────────── the order ─────────────────────────────

function reasonFor(s: Sentence, i: number, k: number, final: number[][]): string | undefined {
  const own = [...s.why[i][k]].filter((w) => w.d > 0).sort((a, b) => b.d - a.d)[0];
  if (own) return own.text.charAt(0).toUpperCase() + own.text.slice(1) + '.';
  // agreement with a neighbour's best reading
  const c = s.cands[i][k];
  for (const d of [-1, 1]) {
    const j = i + d;
    if (j < 0 || j >= s.n || !s.word[j]) continue;
    const other = s.cands[j][final[j][0]];
    const ok = d === -1 ? isModifier(other) && isHeadLike(c) && ruAgrees(other, c) : isModifier(c) && isHeadLike(other) && ruAgrees(c, other);
    if (ok) return `Agrees in case, number and gender with «${s.surface(j)}».`;
  }
  return undefined;
}

/** The readings of each token reordered by the sentence; see the header for what a rule may and may not do. */
export function orderRuSentence(tokens: RawToken[], base: AnalysisCandidate[][]): AnalysisCandidate[][] {
  const s = new Sentence(tokens, base);
  let order: number[][] = base.map((cs) => cs.map((_, k) => k));
  let totals: number[][] = [];
  for (let round = 0; round < 2; round++) {
    s.round = round;
    s.reset();
    rulePrepositionGovernment(s);
    ruleChainAgreement(s);
    ruleNumerals(s);
    ruleGenitive(s);
    ruleSubjectVerb(s);
    ruleSecondNominative(s);
    ruleVerbAfterSubject(s);
    ruleObjectAfterVerb(s);
    ruleVerbs(s);
    ruleFunctionWords(s);
    ruleShortPredicate(s);
    ruleSubordinators(s);
    const unary = s.score.map((row, i) => { const top = Math.max(0, ...base[i].map((c) => c.confidence)); return row.map((v, k) => v - W.tie * k - W.confidence * (top - base[i][k].confidence)); });
    totals = chainScores(s, unary);
    order = totals.map((row) => row.map((_, k) => k).sort((a, b) => row[b] - row[a] || a - b));
    s.best = order.map((o) => o[0] ?? 0);
  }
  return base.map((cands, i) => {
    if (!tokens[i].isWord || cands.length < 2) return cands;
    const ord = order[i];
    // the hard rules: what every one of them allows; when they allow nothing together (two rules disagree), nothing is lowered
    const verdicts = s.hard.filter((v) => v.i === i);
    const allowed = verdicts.length ? cands.map((_, k) => verdicts.every((v) => v.compat[k])) : [];
    const hardApplies = verdicts.length > 0 && allowed.some(Boolean) && allowed[ord[0]];
    if (!hardApplies && ord.every((k, idx) => k === idx)) return cands;
    const first = ord[0];
    const out = ord.map((k, idx) => {
      const c: Cand = { ...cands[k], morph: { ...cands[k].morph } };
      if (cands[k].notes) c.notes = { ...cands[k].notes };
      const own = s.score[i][k];
      if (idx > 0 && own <= -1) c.confidence = Math.max(0.05, Math.round((c.confidence - 0.1) * 100) / 100);
      if (hardApplies && !allowed[k]) {
        // a reading the rule excludes: lowered by 0.20, never below 0.30, never raised
        const v = verdicts.find((x) => !x.compat[k])!;
        c.confidence = Math.min(c.confidence, Math.max(HARD_FLOOR, Math.round((cands[k].confidence - HARD_LOWER) * 100) / 100));
        c.notes = { ...c.notes, context: (c.notes?.context ? String(c.notes.context) + ' ' : '') + 'Set aside because ' + v.rule + '.' };
      } else if (hardApplies && allowed[k] && String(cands[k].notes?.context ?? '').startsWith('much rarer than') && verdicts.some((v) => v.restore && v.compat[k] && v.compat.some((x) => !x))) {
        // a decisive rule picks this reading: the context-free 'much rarer in running text' says nothing about THIS sentence, so its penalty is given back
        c.confidence = Math.min(0.9, Math.round((cands[k].confidence + 0.2) * 100) / 100);
      }
      return c;
    });
    if (hardApplies) {
      const v = verdicts.find((x) => x.compat.some((ok, k) => !ok && k !== first)) ?? verdicts[0];
      out[0].notes = { ...out[0].notes, context: v.rule.charAt(0).toUpperCase() + v.rule.slice(1) + '.' };
    } else if (first !== 0) {
      const why = reasonFor(s, i, first, order);
      if (why) out[0].notes = { ...out[0].notes, context: why };
    }
    return out;
  });
}

/** The analyser: the context-free readings of every word token, ordered by the sentence. */
export function ruAnalyze(tokens: RawToken[]): AnalyzedToken[] {
  const base = tokens.map((t) => (t.isWord ? ruWordCandidates(t) : []));
  const ordered = orderRuSentence(tokens, base);
  return tokens.map((t, i) => ({ token: t, candidates: t.isWord ? ordered[i] : [], analyzer: RU_ANALYZER }));
}

/** The adapter's `refine`: the same ordering after the importer put a dictionary's readings on some tokens (contract: core/adapters.ts). */
export function ruRefine(tokens: RawToken[], analyzed: AnalyzedToken[], analyzers: ReadonlySet<string>, given?: ReadonlySet<number>): AnalyzedToken[] {
  const own = (i: number): boolean => analyzed[i].analyzer === RU_ANALYZER && analyzers.has(RU_ANALYZER) && !given?.has(i);
  const base = tokens.map((t, i) => (!t.isWord ? [] : own(i) ? ruWordCandidates(t) : analyzed[i].candidates));
  const ordered = orderRuSentence(tokens, base);
  return tokens.map((t, i) => (!t.isWord || given?.has(i) || !analyzers.has(analyzed[i].analyzer) ? analyzed[i] : { ...analyzed[i], candidates: ordered[i] }));
}
