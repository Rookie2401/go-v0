/**
 * Rule checks on a learner's own Albanian (GoTell, "My Testimony"). An empty result means nothing was found, never
 * "correct": every check fires only on its own unambiguous shape, reads the facts it needs from the word list (a noun's
 * forms, a verb's forms, an adjective's forms, the case a preposition governs) and says nothing when a fact is missing.
 * A suggestion (an exact replacement with offsets in `sentence`) is offered only where the fix is certain; it keeps the
 * learner's capital letter. Machine-drafted rules, not checked by a native speaker.
 *
 * How the checks read the analysis. A check looks at the PLAUSIBLE readings of a token: the candidates within 0.1 of the
 * best one (the sentence layer marks the readings it rules out down to 0.4, so those fall away). A check fires only when
 * EVERY plausible reading of the token it blames has the shape it needs, so an ambiguous word (vajza = "the girl" or
 * "girls") never triggers a check that only one reading supports. A word the engine does not know (no reading, or only a
 * reading by ending) triggers nothing, not even a spelling error. A word that was only read through a spelling relation
 * (typed without ë / ç, a Gheg form) is judged by checks 1 and 2 alone. Confidence never exceeds 0.85 and goes down when
 * a token involved has several plausible readings or a disputed one.
 *
 * Checks (category):
 *   1. a word typed without ë / ç (spelling)
 *   2. a Gheg form with a Standard equivalent (dialect: said to be Gheg, never called an error)
 *   3. te / tek / nga + a noun that is not in the definite nominative (definiteness; case); noun + im / yt / ynë / juaj (definiteness)
 *   4. a noun not in the case its preposition governs: në, me, për … + accusative; prej, sipas, afër … + ablative (case)
 *   5. the linking article does not agree with the noun before it (agreement)
 *   6. the adjective form does not agree with the noun before it, where the word list knows the right form (agreement)
 *   7. a verb ending that does not go with the subject pronoun directly before it (conjugation)
 *   8. nuk where mos is needed: të nuk shkoj, nuk shko! (particle)
 *   9. do shkoj for do të shkoj (register: it is colloquial, not wrong)
 *  10. kam + the participle of a verb that makes its perfect with jam (conjugation)
 *
 * NOT built, on purpose: idiomaticity checks (unidiomatic but grammatical wording) need native-speaker data on collocations
 * and usage that does not exist yet, so no check here uses the category 'idiomaticity'. Also left out: the article of a
 * genitive chain (vajza e Anës), possessives written after a linking article (zemër e tij: an indefinite phrase is
 * grammatical, një mik i tij), the gender of a noun against its possessive, tense and mood choices, and old spelling.
 */
import type { AnalysisCandidate, AnalyzedToken, ErrorCandidate, RawToken } from '../../core';
import { matchCase } from '../shared';
import { linkingArticle } from './function-article';
import { adjectiveForms } from './morph-adjective';
import { nounForms } from './morph-noun';
import { verbForms } from './morph-verb';
import { SQ_LEXEMES } from './morphology';
import type { SqForm, SqLexeme } from './types';

type C = AnalysisCandidate;
interface Ctx { tokens: RawToken[]; analyses: AnalyzedToken[] }

// ───────────────────────────── small helpers ─────────────────────────────

const lower = (s: string): string => s.normalize('NFC').toLocaleLowerCase('sq');
const vals = (v: string | undefined): string[] => (v ? v.split(',') : []);
const isWordAt = (p: Ctx, i: number): boolean => i >= 0 && i < p.tokens.length && p.tokens[i].isWord;
const isNoun = (c: C): boolean => c.pos === 'NOUN' || c.pos === 'PROPN';
const isVerbal = (c: C): boolean => c.pos === 'VERB' || c.pos === 'AUX';
const isFinite = (c: C): boolean => isVerbal(c) && c.morph.VerbForm === 'Fin';
const isParticiple = (c: C): boolean => isVerbal(c) && c.morph.VerbForm === 'Part';
/** A reading that stands for the written word itself: not a guess by ending, not read through a spelling relation. */
const plain = (c: C): boolean => !c.unconfirmed && !c.orthography;

/** The readings of token i that are in the running: within 0.1 of the best (what the sentence layer ruled out is 0.4). */
function plausible(p: Ctx, i: number): C[] {
  const all = p.analyses[i]?.candidates ?? [];
  if (!all.length) return [];
  const top = Math.max(...all.map((c) => c.confidence));
  return all.filter((c) => c.confidence > top - 0.1 + 1e-9);
}

/** The plausible readings of token i when there are some and every one satisfies `pred`; otherwise undefined. */
function every(p: Ctx, i: number, pred: (c: C) => boolean): C[] | undefined {
  if (!isWordAt(p, i)) return undefined;
  const list = plausible(p, i);
  return list.length > 0 && list.every(pred) ? list : undefined;
}

/** A confidence: the base, less 0.1 for each involved token with several plausible readings, 0.1 for a disputed one, 0.15 for an unconfirmed one. */
function conf(base: number, ...involved: C[][]): number {
  let v = base;
  for (const list of involved) {
    if (list.length > 1) v -= 0.1;
    if (list.some((c) => c.notes?.disputed)) v -= 0.1;
    if (list.some((c) => c.unconfirmed)) v -= 0.15;
  }
  return Math.round(Math.max(0.3, Math.min(0.85, v)) * 100) / 100;
}

/** The replacement with the learner's capital letter (all capitals stay all capitals). */
function cased(surface: string, replacement: string): string {
  if (surface.length > 1 && surface === surface.toLocaleUpperCase('sq') && surface !== surface.toLocaleLowerCase('sq')) return replacement.toLocaleUpperCase('sq');
  return matchCase(surface, replacement);
}

const swap = (t: RawToken, replacement: string): ErrorCandidate['suggestion'] => ({ start: t.start, end: t.end, replacement: cased(t.surface, replacement) });

const CASE_NAME: Record<string, string> = { Nom: 'nominative', Acc: 'accusative', Gen: 'genitive', Dat: 'dative', Abl: 'ablative' };
/** "a, b or c" */
const orList = (xs: string[]): string => (xs.length < 2 ? xs.join('') : `${xs.slice(0, -1).join(', ')} or ${xs[xs.length - 1]}`);
const caseWords = (cs: string[]): string => orList([...new Set(cs)].map((c) => CASE_NAME[c] ?? c));
const quoted = (xs: string[]): string => orList(xs.map((x) => `"${x}"`));

// ───────────────────────────── the word list's facts ─────────────────────────────

type Group = 'N' | 'V' | 'A';
const groupOf = (pos: string): Group | undefined => (pos === 'NOUN' || pos === 'PROPN' ? 'N' : pos === 'VERB' || pos === 'AUX' ? 'V' : pos === 'ADJ' ? 'A' : undefined);

let lexIndex: Map<string, SqLexeme[]> | undefined;
/** The word-list entries of a lemma (any number: the caller decides what to do when it is not exactly one). */
function lexemesOf(group: Group, lemma: string): SqLexeme[] {
  if (!lexIndex) {
    lexIndex = new Map();
    for (const l of SQ_LEXEMES) {
      const g = groupOf(l.pos);
      if (!g) continue;
      const key = `${g}|${lower(l.lemma)}`;
      lexIndex.set(key, [...(lexIndex.get(key) ?? []), l]);
    }
  }
  return lexIndex.get(`${group}|${lower(lemma)}`) ?? [];
}

/** The one word-list entry the plausible readings of a token share (undefined if they differ or the list has several). */
function lexemeOfReadings(group: Group, list: C[], strip = ''): SqLexeme | undefined {
  const lemmas = new Set(list.map((c) => lower(c.lemma ?? '')));
  if (lemmas.size !== 1) return undefined;
  let lemma = [...lemmas][0];
  if (strip && lemma.startsWith(strip)) lemma = lemma.slice(strip.length);
  const found = lexemesOf(group, lemma);
  return found.length === 1 ? found[0] : undefined;
}

/** The one written form among `forms` whose features include every wanted value (undefined unless exactly one form fits). */
function onlyForm(forms: SqForm[], want: Record<string, string | undefined>): string | undefined {
  const hits = new Set<string>();
  for (const f of forms) {
    if (Object.entries(want).every(([k, v]) => v === undefined || vals(f.morph[k]).includes(v))) hits.add(f.form.normalize('NFC'));
  }
  return hits.size === 1 ? [...hits][0] : undefined;
}

const unionOf = (list: C[], key: string): string[] => [...new Set(list.flatMap((c) => vals(c.morph[key])))];
/** The single value of a feature across all the readings, or undefined when they differ or any is open. */
function single(list: C[], key: string): string | undefined {
  const s = unionOf(list, key);
  return s.length === 1 && list.every((c) => vals(c.morph[key]).length === 1) ? s[0] : undefined;
}

// ───────────────────────────── 1. spelling: a word typed without ë / ç ─────────────────────────────

function spelling(p: Ctx): ErrorCandidate[] {
  const out: ErrorCandidate[] = [];
  p.tokens.forEach((t, i) => {
    const list = every(p, i, (c) => c.orthography?.period === 'sq-ascii' && !c.unconfirmed);
    if (!list) return;
    const standards = [...new Set(list.map((c) => c.orthography!.modern))];
    if (!standards.length) return;
    const midName = i > 0 && /^\p{Lu}/u.test(t.surface) && p.tokens[i - 1].isWord;
    const disputed = list.some((c) => c.notes?.disputed) ? 0.1 : 0;
    if (standards.length === 1) {
      const fixed = cased(t.surface, standards[0]);
      out.push({
        category: 'spelling', tokenIndexes: [i], confidence: Math.round((midName ? 0.6 : 0.75 - disputed) * 100) / 100, affectsMeaning: false,
        message: `"${t.surface}" is written without its ë or ç; the Standard spelling is "${fixed}".${midName ? ' (Ignore this if it is a name.)' : ''}`,
        suggestion: swap(t, standards[0]),
      });
    } else {
      out.push({
        category: 'spelling', tokenIndexes: [i], confidence: 0.45, affectsMeaning: false,
        message: `"${t.surface}" is written without an ë or ç; it could be ${quoted(standards.map((s) => cased(t.surface, s)))}, and the spelling alone does not say which.`,
      });
    }
  });
  return out;
}

// ───────────────────────────── 2. dialect: a Gheg form ─────────────────────────────

function dialect(p: Ctx): ErrorCandidate[] {
  const out: ErrorCandidate[] = [];
  p.tokens.forEach((t, i) => {
    const list = every(p, i, (c) => !!c.orthography?.period.startsWith('aln') && !c.unconfirmed);
    if (!list) return;
    const standards = [...new Set(list.map((c) => c.orthography!.modern))];
    const sure = Math.max(...list.map((c) => c.orthography!.confidence));
    const disputed = list.some((c) => c.notes?.disputed) ? 0.1 : 0;
    const shown = standards.map((s) => cased(t.surface, s));
    if (standards.length === 1) {
      const listed = sure >= 0.7;
      out.push({
        category: 'dialect', tokenIndexes: [i], confidence: Math.round(Math.min(0.75, sure - disputed) * 100) / 100, affectsMeaning: false,
        message: listed
          ? `"${t.surface}" is a Gheg form (the dialect of the north). Standard Albanian writes "${shown[0]}". Nothing is wrong if you mean to write Gheg.`
          : `"${t.surface}" looks like a Gheg form (a regular correspondence, not a listed word). Standard Albanian would write "${shown[0]}". Ignore this if it is not Gheg.`,
        suggestion: swap(t, standards[0]),
      });
    } else {
      out.push({
        category: 'dialect', tokenIndexes: [i], confidence: 0.4, affectsMeaning: false,
        message: `"${t.surface}" looks like a Gheg form; Standard Albanian would write ${quoted(shown)}.`,
      });
    }
  });
  return out;
}

// ───────────────────────────── 3. definiteness ─────────────────────────────

/** Prepositions after which the noun stands in the definite nominative, and how sure the rule is. */
const NOMINATIVE_PREPOSITIONS: Record<string, { base: number; singularOnly: boolean }> = {
  te: { base: 0.8, singularOnly: false }, tek: { base: 0.8, singularOnly: false },
  // nga: the definite is the norm (nga shtëpia) but set phrases and quantified plurals have the indefinite
  nga: { base: 0.6, singularOnly: true },
};

/** te libër → te libri; te librin → te libri; nga shtëpi → nga shtëpia. The noun must stand directly after the preposition. */
function afterNominativePreposition(p: Ctx): ErrorCandidate[] {
  const out: ErrorCandidate[] = [];
  p.tokens.forEach((t, i) => {
    const rule = t.isWord ? NOMINATIVE_PREPOSITIONS[t.normalized] : undefined;
    if (!rule) return;
    const prep = every(p, i, (c) => c.pos === 'ADP' && plain(c));
    const noun = prep && every(p, i + 1, (c) => isNoun(c) && plain(c));
    if (!prep || !noun) return;
    // one reading that is a definite nominative is enough to say nothing
    if (noun.some((c) => vals(c.morph.Definite).includes('Def') && vals(c.morph.Case).includes('Nom'))) return;
    const lex = lexemeOfReadings('N', noun);
    const number = single(noun, 'Number');
    if (!number || (rule.singularOnly && number !== 'Sing')) return;
    const fix = lex ? onlyForm(nounForms(lex), { Case: 'Nom', Number: number, Definite: 'Def' }) : undefined;
    const nt = p.tokens[i + 1];
    if (noun.every((c) => c.morph.Definite === 'Ind')) {
      out.push({
        category: 'definiteness', tokenIndexes: [i, i + 1], confidence: conf(fix ? rule.base : rule.base - 0.15, prep, noun), affectsMeaning: false,
        message: rule.singularOnly
          ? `After "${t.surface}" the noun is normally definite${fix ? `: "${t.surface} ${fix}"` : ''} (the indefinite form turns up only in set phrases).`
          : `After "${t.surface}" the noun takes its definite form${fix ? `: "${t.surface} ${fix}"` : ''}.`,
        suggestion: fix ? swap(nt, fix) : undefined,
      });
    } else if (noun.every((c) => c.morph.Definite === 'Def')) {
      const cases = unionOf(noun, 'Case');
      if (!cases.length) return;
      out.push({
        category: 'case', tokenIndexes: [i, i + 1], confidence: conf(fix ? rule.base - 0.05 : rule.base - 0.2, prep, noun), affectsMeaning: false,
        message: `"${t.surface}" takes the nominative, but "${nt.surface}" is ${cases.length === 1 ? 'in the' : 'a'} ${caseWords(cases)} form${fix ? `: "${t.surface} ${fix}"` : ''}.`,
        suggestion: fix ? swap(nt, fix) : undefined,
      });
    }
  });
  return out;
}

/** The possessives that stand directly after a noun (not after a linking article): im, yt, ynë, juaj with all their forms. */
const barePossessive = (c: C): boolean => c.pos === 'DET' && c.morph.Poss === 'Yes' && c.notes?.articulated !== 'yes' && plain(c);

/** Parts of speech that may stand before a bare noun (not a determiner, a number, an adjective or an adverb: those make it indefinite). */
const BEFORE_BARE_NOUN = new Set(['VERB', 'AUX', 'ADP', 'PART', 'CONJ', 'SCONJ']);

/**
 * zemër time → zemrën time: a singular noun with no determiner before it and a possessive after it is definite. Silent
 * after a form of "jam" (a predicate such as "është shok imi" is not judged), after anything unknown, and for the
 * possessives that need a linking article (tij, saj, tyre: "një mik i tij" is an indefinite phrase and grammatical).
 */
function possessiveDefiniteness(p: Ctx): ErrorCandidate[] {
  const out: ErrorCandidate[] = [];
  p.tokens.forEach((t, i) => {
    if (!t.isWord) return;
    const noun = every(p, i, (c) => isNoun(c) && plain(c) && c.morph.Definite === 'Ind' && c.morph.Number === 'Sing');
    const poss = noun && every(p, i + 1, barePossessive);
    if (!noun || !poss) return;
    let prepReadings: C[] | undefined;
    if (i > 0 && p.tokens[i - 1].isWord) {
      prepReadings = every(p, i - 1, (c) => BEFORE_BARE_NOUN.has(c.pos ?? '') && c.lemma !== 'jam');
      if (!prepReadings) return;
    }
    const lex = lexemeOfReadings('N', noun);
    // the case the noun and its possessive share (the possessive's own form tells: ime is nominative, time accusative or oblique)
    const shared = unionOf(noun, 'Case').filter((k) => unionOf(poss, 'Case').includes(k));
    const kase = shared.length === 1 && (shared[0] === 'Nom' || shared[0] === 'Acc') ? shared[0] : undefined;
    // the case the position asks for, when the word in front says: a preposition governs one, a verb in front makes a direct object
    // (the accusative); after a particle or a conjunction, or at the start, the position is open. The fix must be in that case.
    const asked = prepReadings
      ? prepReadings.every((c) => c.pos === 'ADP') ? prepReadings.map((c) => String(c.notes?.governs ?? ''))
        : prepReadings.every(isVerbal) ? ['Acc'] : []
      : [];
    const fits = !kase || asked.length === 0 || asked.every((g) => g === kase);
    const fix = lex && kase && fits ? onlyForm(nounForms(lex), { Case: kase, Number: 'Sing', Definite: 'Def' }) : undefined;
    out.push({
      category: 'definiteness', tokenIndexes: [i, i + 1], confidence: conf(fix ? 0.75 : 0.55, noun, poss), affectsMeaning: false,
      message: `A noun followed by a possessive takes its definite form${fix ? `: "${fix} ${p.tokens[i + 1].surface}"` : ' (zemrën time, not zemër time)'}.`,
      suggestion: fix ? swap(t, fix) : undefined,
    });
  });
  return out;
}

// ───────────────────────────── 4. case after a preposition ─────────────────────────────

/** Not judged: më (a date, or a pronoun), pa (a verb, "without"), ndër (government not certain). */
const NOT_JUDGED_PREPOSITIONS = new Set(['më', 'pa', 'ndër']);

/**
 * në shtëpia → në shtëpinë; prej shtëpia → prej shtëpisë. The noun is the word after the preposition (one determiner or
 * number may stand between: në një shtëpi). Silent when the preposition has no governed case in the word list (te / tek /
 * nga, whose nominative is check 3), when any plausible reading of the noun is already in the governed case, and for
 * a word that is not a noun in every reading.
 */
function caseAfterPreposition(p: Ctx): ErrorCandidate[] {
  const out: ErrorCandidate[] = [];
  p.tokens.forEach((t, i) => {
    if (!t.isWord || NOT_JUDGED_PREPOSITIONS.has(t.normalized)) return;
    const prep = every(p, i, (c) => c.pos === 'ADP' && plain(c) && (c.notes?.governs === 'Acc' || c.notes?.governs === 'Abl'));
    if (!prep) return;
    const governs = new Set(prep.map((c) => String(c.notes?.governs)));
    if (governs.size !== 1) return;
    const want = [...governs][0];
    let j = i + 1;
    if (every(p, j, (c) => (c.pos === 'DET' && c.morph.PronType !== 'Art' && c.morph.Poss !== 'Yes') || c.pos === 'NUM')) j += 1;
    const noun = every(p, j, (c) => isNoun(c) && plain(c) && vals(c.morph.Case).length > 0);
    if (!noun || noun.some((c) => vals(c.morph.Case).includes(want))) return;
    const lex = lexemeOfReadings('N', noun);
    const fix = lex ? onlyForm(nounForms(lex), { Case: want, Number: single(noun, 'Number'), Definite: single(noun, 'Definite') }) : undefined;
    const cases = unionOf(noun, 'Case');
    const nt = p.tokens[j];
    out.push({
      category: 'case', tokenIndexes: [i, j], confidence: conf(fix ? 0.75 : 0.55, prep, noun), affectsMeaning: false,
      message: `"${t.surface}" takes the ${CASE_NAME[want]}, but "${nt.surface}" is in the ${caseWords(cases)}${fix ? `: "${fix}"` : ''}.`,
      suggestion: fix ? swap(nt, fix) : undefined,
    });
  });
  return out;
}

// ───────────────────────────── 5 and 6. noun + linking article + adjective ─────────────────────────────

type Gender = 'Masc' | 'Fem';
type Num = 'Sing' | 'Plur';
type Kase = 'Nom' | 'Acc' | 'Gen' | 'Dat' | 'Abl';
type Def = 'Def' | 'Ind';
interface Slot { gender: Gender; number: Num; kase: Kase; def: Def }

const ARTICLES = new Set(['i', 'e', 'të', 'së']);

/** Can a bare singular form that is only an indefinite genitive / dative / ablative stand here? Only after a determiner, a number or a preposition. */
function obliqueLicensed(p: Ctx, n: number): boolean {
  if (!isWordAt(p, n - 1)) return false;
  return plausible(p, n - 1).some((c) => c.pos === 'DET' || c.pos === 'NUM' || c.pos === 'ADP');
}

/**
 * Every (gender, number, case, definiteness) the plausible readings of a noun allow. Undefined when a feature is open or the
 * gender is not masculine / feminine (the neuter has no linking-article table). A singular indefinite form that is nothing
 * but a genitive / dative / ablative (djali = "of a boy") is dropped when nothing in front licenses it (a bare "djali e mirë"
 * is the definite nominative), unless that would leave nothing.
 */
function slotsOf(p: Ctx, n: number, noun: C[]): Slot[] | undefined {
  const genders = unionOf(noun, 'Gender');
  if (genders.length !== 1 || (genders[0] !== 'Masc' && genders[0] !== 'Fem')) return undefined;
  const out: Slot[] = [];
  for (const c of noun) {
    const ns = vals(c.morph.Number), ks = vals(c.morph.Case), ds = vals(c.morph.Definite);
    if (!ns.length || !ks.length || !ds.length) return undefined;
    for (const number of ns) for (const kase of ks) for (const def of ds) out.push({ gender: genders[0] as Gender, number: number as Num, kase: kase as Kase, def: def as Def });
  }
  const oblique = (s: Slot): boolean => s.number === 'Sing' && s.def === 'Ind' && (s.kase === 'Gen' || s.kase === 'Dat' || s.kase === 'Abl');
  if (!obliqueLicensed(p, n)) {
    const kept = out.filter((s) => !oblique(s));
    if (kept.length > 0) return kept;
  }
  return out;
}

const articlesFor = (slots: Slot[]): Set<string> =>
  new Set(slots.flatMap((s) => linkingArticle({ gender: s.gender, number: s.number, case: s.kase, definite: s.def, adjacent: true })));

interface Phrase { n: number; a?: number; j: number; noun: C[]; adjective: C[] }

/** Every noun directly followed by [a linking article and] an adjective, in the readings the checks can trust. */
function nounPhrases(p: Ctx, withArticle: boolean): Phrase[] {
  const out: Phrase[] = [];
  p.tokens.forEach((t, n) => {
    if (!t.isWord) return;
    const noun = every(p, n, (c) => isNoun(c) && plain(c));
    if (!noun) return;
    if (withArticle) {
      const a = n + 1, j = n + 2;
      if (!isWordAt(p, a) || !ARTICLES.has(p.tokens[a].normalized) || p.analyses[a].candidates[0]?.morph.PronType !== 'Art') return;
      const adjective = every(p, j, (c) => c.notes?.articulated === 'yes' && plain(c));
      if (adjective) out.push({ n, a, j, noun, adjective });
    } else {
      const adjective = every(p, n + 1, (c) => c.pos === 'ADJ' && c.notes?.articulated !== 'yes' && plain(c));
      if (adjective) out.push({ n, j: n + 1, noun, adjective });
    }
  });
  return out;
}

const GENDER_WORD: Record<string, string> = { Masc: 'masculine', Fem: 'feminine' };
const NUMBER_WORD: Record<string, string> = { Sing: 'singular', Plur: 'plural' };

/** The article the noun asks for must be the one written: vajza i mirë → vajza e mirë, djem i mirë → djem të mirë. */
function articleAgreement(p: Ctx): ErrorCandidate[] {
  const out: ErrorCandidate[] = [];
  for (const { n, a, noun } of nounPhrases(p, true)) {
    const slots = slotsOf(p, n, noun);
    if (!slots || a === undefined) continue;
    const at = p.tokens[a];
    const written = at.normalized;
    const allowed = articlesFor(slots);
    if (allowed.size === 0 || allowed.has(written)) continue;
    // the article the learner wrote that only fits one number (i, së: singular) says which reading of an ambiguous noun was meant
    const meant = written === 'i' || written === 'së' ? slots.filter((s) => s.number === 'Sing') : slots;
    const narrowed = articlesFor(meant.length > 0 ? meant : slots);
    const fix = narrowed.size === 1 ? [...narrowed][0] : undefined;
    const noun0 = p.tokens[n].surface;
    // certain when every reading of the noun asks for the same article; a guess from the article's own number otherwise
    const sure = allowed.size === 1;
    const kind = [GENDER_WORD[slots[0].gender], orList([...new Set((meant.length > 0 ? meant : slots).map((s) => NUMBER_WORD[s.number]))])].join(' ');
    out.push({
      category: 'agreement', tokenIndexes: [n, a], confidence: conf(fix ? (sure ? 0.8 : 0.7) : 0.6, noun), affectsMeaning: false,
      message: fix
        ? `The linking article has to agree with the noun before it: "${noun0}" (${kind}) takes "${fix}" here, not "${at.surface}".`
        : `The linking article "${at.surface}" does not fit "${noun0}"; here the noun asks for ${quoted([...allowed])}.`,
      suggestion: fix ? swap(at, fix) : undefined,
    });
  }
  return out;
}

/** vajzat e mirë → vajzat e mira, djem të mira → djem të mirë, vajzat besnik → vajzat besnike: the form the word list gives for the noun's gender and number. */
function adjectiveAgreement(p: Ctx): ErrorCandidate[] {
  const out: ErrorCandidate[] = [];
  for (const withArticle of [true, false]) {
    for (const { n, j, noun, adjective } of nounPhrases(p, withArticle)) {
      const slots = slotsOf(p, n, noun);
      if (!slots) continue;
      const lex = lexemeOfReadings('A', adjective, 'i ');
      if (!lex || (withArticle && !lex.articulated) || (!withArticle && lex.articulated)) continue;
      const forms = adjectiveForms(lex);
      const written = p.tokens[j].normalized;
      if (!forms.some((f) => lower(f.form) === written)) continue;
      const cells = new Map<string, string[]>();
      for (const s of slots) cells.set(`${s.gender}|${s.number}`, forms.filter((f) => vals(f.morph.Gender).includes(s.gender) && vals(f.morph.Number).includes(s.number)).map((f) => lower(f.form)));
      const expected = new Set([...cells.values()].flat());
      if (expected.size === 0 || [...cells.values()].some((c) => c.length === 0) || expected.has(written)) continue;
      const fix = expected.size === 1 ? [...expected][0] : undefined;
      const noun0 = p.tokens[n].surface;
      const kinds = [...new Set(slots.map((s) => `${GENDER_WORD[s.gender]} ${NUMBER_WORD[s.number]}`))];
      out.push({
        category: 'agreement', tokenIndexes: [n, j], confidence: conf(fix ? (withArticle ? 0.8 : 0.7) : 0.55, noun, adjective), affectsMeaning: false,
        message: `"${p.tokens[j].surface}" is not the form that goes with "${noun0}" (${kinds.join(' or ')})${fix ? `: "${fix}"` : `; this adjective has ${quoted([...expected])}`}.`,
        suggestion: fix ? swap(p.tokens[j], fix) : undefined,
      });
    }
  }
  return out;
}

// ───────────────────────────── 7. subject pronoun and verb ending ─────────────────────────────

/** Subject pronouns with their person and number. ju is left out (also the object pronoun "you"); i, e, të are not subjects. */
const SUBJECT: Record<string, { person: string; number: string }> = {
  unë: { person: '1', number: 'Sing' }, ti: { person: '2', number: 'Sing' }, ai: { person: '3', number: 'Sing' }, ajo: { person: '3', number: 'Sing' },
  ne: { person: '1', number: 'Plur' }, ata: { person: '3', number: 'Plur' }, ato: { person: '3', number: 'Plur' },
};
const PERSON_WORD: Record<string, string> = { '1': 'first', '2': 'second', '3': 'third' };
const personNumber = (persons: string[], numbers: string[]): string =>
  `${persons.map((x) => PERSON_WORD[x] ?? x).join(' or ')} person ${numbers.map((x) => NUMBER_WORD[x] ?? x).join(' or ')}`;

/** Words that join subjects (ti dhe ai shkoni: the verb agrees with both, not with the pronoun next to it). */
const JOINERS = new Set(['dhe', 'e', 'ose', 'edhe', 'apo', 'me']);

/**
 * unë shkon → unë shkoj, ne shkoj → ne shkojmë: the verb after a subject pronoun (nuk may stand between). Fires only when
 * no plausible reading of the verb has the pronoun's person and number. The fix is the verb's own form for the same
 * tense, mood and voice, when the word list gives exactly one (an indicative reading is preferred over an imperative).
 */
function subjectVerb(p: Ctx): ErrorCandidate[] {
  const out: ErrorCandidate[] = [];
  p.tokens.forEach((t, i) => {
    const subject = t.isWord ? SUBJECT[t.normalized] : undefined;
    if (!subject) return;
    const pron = every(p, i, (c) => c.pos === 'PRON' || c.pos === 'DET');
    if (!pron || !pron.some((c) => c.pos === 'PRON' && vals(c.morph.Case).includes('Nom') && plain(c))) return;
    if (i > 0 && p.tokens[i - 1].isWord && JOINERS.has(p.tokens[i - 1].normalized)) return;
    const v = isWordAt(p, i + 1) && p.tokens[i + 1].normalized === 'nuk' ? i + 2 : i + 1;
    const verb = every(p, v, (c) => isFinite(c) && plain(c));
    if (!verb) return;
    const agrees = verb.some((c) => (!c.morph.Person || vals(c.morph.Person).includes(subject.person)) && (!c.morph.Number || vals(c.morph.Number).includes(subject.number)));
    if (agrees) return;
    // the verb's own form for the pronoun's person and number, from the same tense / mood / voice
    const lex = lexemeOfReadings('V', verb);
    const preferred = verb.some((c) => vals(c.morph.Mood).includes('Ind')) ? verb.filter((c) => vals(c.morph.Mood).includes('Ind')) : verb;
    const fixes = new Set(preferred.map((c) => {
      const mood = vals(c.morph.Mood).includes('Ind') ? 'Ind' : vals(c.morph.Mood)[0];
      return lex ? onlyForm(verbForms(lex), { Person: subject.person, Number: subject.number, Tense: c.morph.Tense, Mood: mood, Voice: c.morph.Voice ?? 'Act' }) : undefined;
    }));
    const fix = fixes.size === 1 ? [...fixes][0] : undefined;
    const vt = p.tokens[v];
    out.push({
      category: 'conjugation', tokenIndexes: [i, v], confidence: conf(fix ? 0.8 : 0.6, pron, verb), affectsMeaning: false,
      message: `"${t.surface}" is ${personNumber([subject.person], [subject.number])}, but "${vt.surface}" is a ${personNumber(unionOf(verb, 'Person'), unionOf(verb, 'Number'))} form: the verb ending has to match the subject${fix ? ` ("${fix}")` : ''}.`,
      suggestion: fix ? swap(vt, fix) : undefined,
    });
  });
  return out;
}

// ───────────────────────────── 8. negation: nuk where mos is needed ─────────────────────────────

/**
 * të nuk shkoj → të mos shkoj (after the subjunctive particle the negative is mos, always); nuk shko! → mos shko! (a command is
 * negated with mos). The second fires only on a verb form that is an imperative and nothing else, and offers its
 * suggestion only when the sentence ends in "!": "nuk ki" might be a slip for the indicative "nuk ke".
 */
function negation(p: Ctx): ErrorCandidate[] {
  const out: ErrorCandidate[] = [];
  p.tokens.forEach((t, i) => {
    if (!t.isWord || t.normalized !== 'nuk') return;
    const nuk = every(p, i, (c) => c.pos === 'PART' && plain(c));
    if (!nuk) return;
    const afterTe = isWordAt(p, i - 1) && p.tokens[i - 1].normalized === 'të' && (p.analyses[i - 1].candidates ?? []).some((c) => c.pos === 'PART');
    if (afterTe) {
      const next = every(p, i + 1, (c) => (isFinite(c) || isParticiple(c)) && plain(c));
      if (!next) return;
      out.push({
        category: 'particle', tokenIndexes: [i - 1, i, i + 1], confidence: conf(0.8, nuk, next), affectsMeaning: false,
        message: `After the subjunctive particle "të" the negative is "mos", not "nuk": "të mos ${p.tokens[i + 1].surface}".`,
        suggestion: swap(t, 'mos'),
      });
      return;
    }
    const verb = every(p, i + 1, (c) => isFinite(c) && plain(c) && c.morph.Mood === 'Imp');
    if (!verb) return;
    const bang = p.tokens.slice(i + 2).some((x) => !x.isWord && x.surface.includes('!'));
    out.push({
      category: 'particle', tokenIndexes: [i, i + 1], confidence: conf(bang ? 0.75 : 0.55, nuk, verb), affectsMeaning: false,
      message: `A command is negated with "mos", not "nuk": "mos ${p.tokens[i + 1].surface}". (If you meant the indicative, "${p.tokens[i + 1].surface}" is not that form.)`,
      suggestion: bang ? swap(t, 'mos') : undefined,
    });
  });
  return out;
}

// ───────────────────────────── 9. the future without të ─────────────────────────────

/**
 * do shkoj → do të shkoj. Standard Albanian writes do + të + subjunctive, but "do shkoj" is common in speech, so this is a
 * note about register at low confidence, not an error. The suggestion (inserting të) is made only when the verb form is also a
 * subjunctive form (shkoj, shkojmë, shkoni, shkojnë); for shkon the subjunctive is another form (shkosh, shkojë): message only.
 */
function futureWithoutTe(p: Ctx): ErrorCandidate[] {
  const out: ErrorCandidate[] = [];
  p.tokens.forEach((t, i) => {
    if (!t.isWord || t.normalized !== 'do') return;
    const verb = every(p, i + 1, (c) => isFinite(c) && plain(c) && c.morph.Tense === 'Pres' && c.morph.Mood !== 'Imp');
    if (!verb) return;
    const subj = verb.every((c) => vals(c.morph.Mood).includes('Sub'));
    const vt = p.tokens[i + 1];
    out.push({
      category: 'register', tokenIndexes: [i, i + 1], confidence: subj ? 0.5 : 0.4, affectsMeaning: false,
      message: subj
        ? `The Standard future is "do të" + the verb: "${t.surface} të ${vt.surface}". Speakers often say "${t.surface} ${vt.surface}" without të, so this is a note on register, not a mistake in speech.`
        : `The Standard future is "do të" + a subjunctive form, and "${vt.surface}" is not one. Speakers often leave të out in speech, so this is a note on register.`,
      suggestion: subj ? { start: t.start, end: t.end, replacement: `${t.surface} të` } : undefined,
    });
  });
  return out;
}

// ───────────────────────────── 10. kam or jam before a participle ─────────────────────────────

/**
 * Verbs that exist only in the non-active AND whose participle no active verb shares, so their perfect is with jam and
 * never with kam: jam përpjekur, jam penduar. The word list marks many more verbs non-active-only, but several of them
 * have an active twin with the same participle (ulem and ul, lindem and lind, quhem and quaj) or take kam
 * (mundem: kam mundur); those are not judged.
 */
const JAM_ONLY = new Set(['përpiqem', 'pendohem', 'kujdesem', 'përgjigjem', 'ankohem', 'habitem']);

/** kam përpjekur → jam përpjekur; kishte penduar → ishte penduar. The suggestion only for the present and the imperfect. */
function auxiliary(p: Ctx): ErrorCandidate[] {
  const out: ErrorCandidate[] = [];
  p.tokens.forEach((t, i) => {
    if (!t.isWord) return;
    const have = every(p, i, (c) => isFinite(c) && c.lemma === 'kam' && plain(c));
    const part = have && every(p, i + 1, (c) => isParticiple(c) && plain(c));
    if (!have || !part) return;
    const lemmas = new Set(part.map((c) => c.lemma ?? ''));
    if (lemmas.size !== 1 || !JAM_ONLY.has([...lemmas][0])) return;
    const verb = lexemesOf('V', [...lemmas][0]);
    if (verb.length !== 1 || verb[0].nonActive !== 'only') return;
    const be = lexemesOf('V', 'jam');
    const fixes = new Set(have.map((c) => (be.length === 1 && (c.morph.Tense === 'Pres' || c.morph.Tense === 'Imp') && vals(c.morph.Mood).includes('Ind')
      ? onlyForm(verbForms(be[0]), { Person: single([c], 'Person'), Number: single([c], 'Number'), Tense: c.morph.Tense, Mood: 'Ind', Voice: 'Act' }) : undefined)));
    const fix = fixes.size === 1 ? [...fixes][0] : undefined;
    out.push({
      category: 'conjugation', tokenIndexes: [i, i + 1], confidence: conf(fix ? 0.8 : 0.65, have, part), affectsMeaning: false,
      message: `"${p.tokens[i + 1].surface}" belongs to a verb that exists only in the non-active, and its perfect is made with "jam", not "kam"${fix ? `: "${cased(p.tokens[i].surface, fix)} ${p.tokens[i + 1].surface}"` : ''}.`,
      suggestion: fix ? swap(p.tokens[i], fix) : undefined,
    });
  });
  return out;
}

// ───────────────────────────── all the checks ─────────────────────────────

/**
 * The checks over one sentence; `sentence` is the text the token offsets refer to (suggestions are offsets into it, so it
 * is not read here). Errors come in the order of the first token they concern; two errors with the same replacement of the
 * same span are one error (the more confident is kept).
 */
export function checkSqProduction(tokens: RawToken[], analyses: AnalyzedToken[], _sentence: string): ErrorCandidate[] {
  const p: Ctx = { tokens, analyses };
  const all = [
    ...spelling(p), ...dialect(p), ...afterNominativePreposition(p), ...possessiveDefiniteness(p), ...caseAfterPreposition(p),
    ...articleAgreement(p), ...adjectiveAgreement(p), ...subjectVerb(p), ...negation(p), ...futureWithoutTe(p), ...auxiliary(p),
  ];
  const kept = new Map<string, ErrorCandidate>();
  const rest: ErrorCandidate[] = [];
  for (const e of all) {
    if (!e.suggestion) { rest.push(e); continue; }
    const key = `${e.suggestion.start}:${e.suggestion.end}:${e.suggestion.replacement}`;
    const before = kept.get(key);
    if (!before || e.confidence > before.confidence) kept.set(key, e);
  }
  return [...kept.values(), ...rest].sort((a, b) => Math.min(...a.tokenIndexes) - Math.min(...b.tokenIndexes) || b.confidence - a.confidence);
}
