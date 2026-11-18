/**
 * Which reading of a written French form is meant here? A table of small, named rules over the neighbouring words, for the
 * cases a learner meets on every page: le / la / les / l' as article or object pronoun (le livre / je le vois), en as
 * preposition or pronoun (en France / j'en veux), que as relative, conjunction or "only" (le livre que je lis / je sais que /
 * je ne mange que du pain), si and s' (s'il vient / il s'appelle), du and des as article or contraction (du pain / près du
 * port), the nouns that are also verb forms (la porte / il porte), the participles that are also nouns (il est arrivé /
 * l'arrivée), and the verb cells one spelling shares (il dit: present or passé simple; que tu parles: subjunctive).
 *
 * What it is: an ORDERING of readings the analysis already has. The chosen reading moves to the front with `notes.context`
 * saying, in one plain line, which neighbour decided; the other readings stay, in their order, with their confidence lowered.
 * Nothing is invented and nothing is removed, so a wrong choice is still one tap away on the word sheet. Where the neighbours
 * do not decide, the order is left exactly as it came.
 * What it is not: a parser. A rule reads one or two words on each side, or walks a short chain of clitics and adverbs.
 *
 * Each rule states its cue in its `notes.context` line. A dictionary's reading (installed by the importer beside the
 * adapter's own) moves in front of the adapter's own only on a cue that leaves no room for the adapter's reading (`Cue`).
 * Machine-drafted rules, not checked by a native speaker; measured on the French fixtures and the UD French GSD dev split.
 */
import type { RawToken } from '../../core';
import {
  ARTICLES, BETWEEN_ADVERBS, type C, IMPERATIVE_CLITICS, INFINITIVE_PREPOSITIONS, INVERTED_SUBJECTS, LE_FORMS, NE_FORMS,
  OBJECT_CLITICS, PREPOSITIONS, PURE_CLITICS, QUANTIFIERS, QUE_FORMS, SUBJECT_ONLY, SUBJECT_PRONOUNS, SUBJUNCTIVE_CONJ_HEADS,
  SUBJUNCTIVE_CONJ_WORDS, SUBJUNCTIVE_VERBS, SUBJUNCTIVE_WORDS, clauseEnd, fits, has, hyphenAfter, hyphenBefore, isFinite,
  isImperative, isInfinitive, isOwn, isPastParticiple, isPause, isPresentParticiple, isStatement, isVerbal, nextWord,
  opensClause, prevWord, sentenceSpan, solid,
} from './context-shared';

/**
 * How much a neighbour says: "weak" — the likelier reading among equals; "strong" — the other readings do not fit here;
 * "certain" — nothing else can stand here (a pronoun after a command and its hyphen).
 */
type Cue = 'weak' | 'strong' | 'certain';
const CUE: Record<Cue, number> = { weak: 1, strong: 2, certain: 3 };
const FUNCTION_POS = new Set(['DET', 'PRON', 'ADP', 'CONJ', 'SCONJ', 'NUM', 'AUX', 'PART']);
/** May a cue of this weight put `c` first? A dictionary's reading needs a strong cue (a certain one before a function word of our own). */
function mayLead(list: readonly C[], c: C, cue: Cue): boolean {
  const head = list[0];
  if (c.origin !== 'dictionary' || !head || !isOwn(head)) return true;
  return CUE[cue] >= (head.origin === 'hand' && FUNCTION_POS.has(head.pos ?? '') ? CUE.certain : CUE.strong);
}

interface Choice { k: number; why: string; cue: Cue }
/** What a rule says: a reading to put first, `null` (the rule applies and the order stays as it is), or `undefined` (not this rule). */
type Verdict = Choice | null | undefined;

/** One token in its sentence, with the questions every rule asks about its neighbours. */
class Here {
  readonly w: string;
  readonly cands: C[];
  readonly prev: number | undefined;
  readonly next: number | undefined;
  constructor(readonly i: number, readonly tokens: RawToken[], readonly base: C[][]) {
    this.w = tokens[i].normalized;
    this.cands = base[i];
    this.prev = prevWord(tokens, i);
    this.next = nextWord(tokens, i);
  }
  form(k: number | undefined): string | undefined { return k === undefined ? undefined : this.tokens[k]?.isWord ? this.tokens[k].normalized : undefined; }
  own(k: number | undefined): C[] { return k === undefined ? [] : solid(this.base[k]); }
  top(k: number | undefined): C | undefined { return this.own(k)[0]; }
  prevOf(k: number | undefined): number | undefined { return k === undefined ? undefined : prevWord(this.tokens, k); }
  nextOf(k: number | undefined): number | undefined { return k === undefined ? undefined : nextWord(this.tokens, k); }
  /** Every reading of the adapter's own is a verb, and one is finite or an infinitive (aime, sont, faire — not porte, été, arrivée). */
  allVerbal(k: number | undefined): boolean {
    if (k === undefined) return false;
    const own = this.base[k].filter(isOwn);
    return own.length > 0 && own.every(isVerbal) && own.some((c) => isFinite(c) || isInfinitive(c));
  }
  someVerbal(k: number | undefined): boolean { return this.own(k).some(isVerbal); }
  /** The first reading of `cands` that satisfies `pred` and may lead on this cue. */
  pick(pred: (c: C) => boolean, why: string, cue: Cue): Choice | undefined {
    const k = this.cands.findIndex((c) => pred(c) && mayLead(this.cands, c, cue));
    return k < 0 ? undefined : { k, why, cue };
  }
}

// ── closed words the rules name (normalized) ──
const INTENSIFIERS = new Set(['très', 'si', 'bien', 'trop', 'assez', 'aussi', 'tout', 'plus', 'moins', 'tellement', 'fort', 'vraiment', 'peu']);
const COMPARATIVE_WORDS = new Set(['plus', 'moins', 'aussi', 'autant', 'davantage', 'mieux', 'meilleur', 'meilleure', 'meilleurs', 'meilleures', 'pire', 'pires', 'autre', 'autres', 'même', 'mêmes', 'tel', 'telle', 'tels', 'telles', 'tant', 'plutôt', 'si']);
/** The first word of a conjunction written "X que": bien que, parce que, alors que, dès que, à moins que … */
const QUE_CONJ_HEADS = new Set([
  'bien', 'pour', 'afin', 'avant', 'après', 'sans', 'parce', 'alors', 'tandis', 'dès', 'depuis', 'pendant', 'maintenant', 'ainsi',
  'tant', 'moins', 'sorte', 'façon', 'manière', 'condition', 'pourvu', 'peur', 'crainte', 'mesure', 'encore', 'sinon', 'selon', 'vu',
  'outre', 'sauf', 'lors', 'aussitôt', 'sitôt', 'non', 'attendant', 'autant', 'tel', 'telle', 'tels', 'telles',
]);
/** Antecedents of a relative clause that are pronouns: ce que, celui que … */
const RELATIVE_PRONOUN_HEADS = new Set(['ce', 'celui', 'celle', 'ceux', 'celles', 'cela', 'ceci', 'quelqu\'un', 'chacun', 'chacune', 'rien', 'tout']);
/** Pronouns other than je, tu, il … that stand as the subject of a third-person verb (celui-ci fait, cela suffit, personne ne). */
const SUBJECT_PRONOUN_WORDS = new Set(['celui-ci', 'celle-ci', 'ceux-ci', 'celles-ci', 'celui-là', 'celle-là', 'ceux-là', 'celles-là', 'cela', 'ceci', 'ça', 'chacun', 'chacune', "quelqu'un", 'tout', 'tous', 'toutes', 'rien', 'personne']);
/** Nouns that take a que-clause that is not a relative (le fait que, l'idée que): there the neighbours do not decide. */
const COMPLETIVE_NOUNS = new Set(['fait', 'idée', 'peur', 'espoir', 'preuve', 'sentiment', 'impression', 'certitude', 'crainte', 'condition', 'nouvelle', 'signe', 'pensée', 'opinion', 'avis', 'hypothèse', 'raison', 'chance', 'chances', 'risque', 'besoin', 'envie', 'manière', 'façon', 'sorte']);
/** Words after which du / des are de + the article: près du port, beaucoup des enfants, un des amis. */
const DE_HEADS = new Set([
  'près', 'loin', 'lors', 'autour', 'hors', 'auprès', 'au-dessus', 'au-dessous', 'au-delà', 'beaucoup', 'peu', 'trop', 'assez',
  'combien', 'tant', 'autant', 'plupart', 'un', 'une', 'chacun', 'chacune', 'aucun', 'aucune', 'plusieurs', 'certains', 'certaines',
  'celui', 'celle', 'ceux', 'celles', 'quelques-uns', 'quelques-unes', 'lequel', 'laquelle', 'lesquels', 'lesquelles',
]);
/** Verbs that govern de: venir du marché, parler des enfants, sortir de la maison. Lemmas. */
export const DE_VERBS: ReadonlySet<string> = new Set([
  'venir', 'revenir', 'provenir', 'sortir', 'ressortir', 'partir', 'repartir', 'parler', 'discuter', 'rêver', 'souvenir', 'occuper',
  'profiter', 'dépendre', 'descendre', 'tomber', 'approcher', 'éloigner', 'moquer', 'douter', 'traiter', 'agir', 'rentrer', 'arriver',
  'échapper', 'jouir', 'méfier', 'plaindre', 'inquiéter', 'hériter', 'témoigner', 'charger', 'sauter', 'emparer', 'débarrasser',
  'libérer', 'priver', 'féliciter', 'mourir', 'souffrir', 'tirer', 'éloigner', 'retirer', 'sortir', 'remplir', 'couvrir',
]);
/** Verbs of eating, having, wanting, getting, after which du / des are the article: manger du pain, avoir des amis. Lemmas. */
const ARTICLE_VERBS = new Set([
  'manger', 'boire', 'avoir', 'vouloir', 'acheter', 'prendre', 'faire', 'donner', 'chercher', 'trouver', 'vendre', 'offrir',
  'apporter', 'mettre', 'porter', 'cuire', 'demander', 'recevoir', 'produire', 'contenir', 'gagner', 'perdre', 'voir', 'servir',
  'préparer', 'cultiver', 'planter', 'commander', 'apprendre', 'écrire', 'lire', 'jouer', 'écouter', 'être',
]);

// ── what stands before and after ──
/** Is the le / la / les / l' at k the object pronoun (true), the article (false), or is that not decided here (undefined)? */
function leIsClitic(h: Here, k: number): boolean | undefined {
  if (hyphenBefore(h.tokens, k) !== undefined) return true;
  const p = h.prevOf(k);
  const pf = h.form(p);
  if (pf !== undefined) {
    if (SUBJECT_PRONOUNS.has(pf) && !afterPreposition(h, p as number)) return true;
    if (NE_FORMS.has(pf) || PURE_CLITICS.has(pf) || pf === "s'") return true;
  }
  const n = h.nextOf(k);
  const nf = h.form(n);
  if (nf === 'y' || nf === 'en') return true;
  const verbAfter = (v: number | undefined): boolean => {
    // de les niveler: a word the list does not hold, but that only an infinitive can be
    if (v !== undefined && h.base[v].length > 0 && !h.base[v].some(isOwn) && h.base[v].every(isInfinitive)) return true;
    if (!h.allVerbal(v)) return false;
    // l'ont, l'a, les avait: an article is never followed by a form of avoir or être
    if (h.own(v).every((c) => isFinite(c) && (c.lemma === 'avoir' || c.lemma === 'être'))) return true;
    // pour le faire, veut le voir, en le disant: an infinitive or a gerund needs nothing more
    if (h.own(v).some((c) => isInfinitive(c) || isPresentParticiple(c))) return true;
    // a conjugated verb needs a subject or a clause before the pronoun (Paul le voit, et le lit, qui les aime); after a
    // preposition or a verb, or opening a sentence, the word is more likely a noun the word list does not hold (pour le contrôle)
    if (pf === undefined) return hyphenAfter(h.tokens, v as number) !== undefined;
    if (PREPOSITIONS.has(pf) || h.someVerbal(p)) return false;
    const top = h.top(p);
    return ['et', 'ou', 'mais', 'qui', 'que', "qu'", 'puis', 'quand', 'si', 'comme', 'lorsque', "lorsqu'"].includes(pf) || top?.pos === 'NOUN' || top?.pos === 'PROPN' || top?.pos === 'PRON';
  };
  if (verbAfter(n)) return true;
  if ((nf === 'lui' || nf === 'leur') && verbAfter(h.nextOf(n))) return true;
  if (n !== undefined && h.own(n).length > 0) return false;
  return undefined;
}
function leurIsClitic(h: Here, k: number): boolean {
  if (hyphenBefore(h.tokens, k) !== undefined) return true;
  const p = h.prevOf(k);
  const pf = h.form(p);
  if (pf !== undefined && ((SUBJECT_PRONOUNS.has(pf) && !afterPreposition(h, p as number)) || NE_FORMS.has(pf) || PURE_CLITICS.has(pf)
    || (LE_FORMS.has(pf) && leIsClitic(h, p as number) === true))) return true;
  return h.allVerbal(h.nextOf(k));
}
/** Is the en at k the pronoun (j'en veux, il y en a, va-t'en) rather than the preposition (en France, en marchant)? */
function enIsPronoun(h: Here, k: number): boolean {
  if (hyphenBefore(h.tokens, k) !== undefined) return true;
  const p = h.prevOf(k);
  const pf = h.form(p);
  if (pf !== undefined && (PURE_CLITICS.has(pf) || pf === "s'" || NE_FORMS.has(pf) || pf === 'lui' || pf === 'leur' || pf === 'nous' || pf === 'vous'
    || (SUBJECT_PRONOUNS.has(pf) && !afterPreposition(h, p as number)))) return true;
  const n = h.nextOf(k);
  if (h.allVerbal(n) && !h.own(n).some(isPresentParticiple)) return true;
  // le coût en est, ainsi en découle: before a word read first as a conjugated verb (not en fait, en marche: nouns first)
  const top = h.top(n);
  return top !== undefined && isFinite(top) && (top.lemma === 'être' || top.lemma === 'avoir' || !h.own(n).some((c) => c.pos === 'NOUN'));
}
function afterPreposition(h: Here, k: number): boolean {
  const p = h.form(h.prevOf(k));
  return p !== undefined && PREPOSITIONS.has(p) && p !== 'en';
}
/** The determiner at k, if it is one here: the gender and number it gives its noun, and how sure that is. */
function determinerAt(h: Here, k: number | undefined): { gender?: string; number?: string; strong: boolean } | undefined {
  const f = h.form(k);
  if (f === undefined || k === undefined) return undefined;
  const det = h.own(k).find((c) => c.pos === 'DET');
  const agreement = { gender: det?.morph.Gender?.includes(',') ? undefined : det?.morph.Gender, number: det?.morph.Number?.includes(',') ? undefined : det?.morph.Number };
  if (LE_FORMS.has(f)) return leIsClitic(h, k) === true ? undefined : { ...agreement, strong: true };
  if (f === 'leur') return leurIsClitic(h, k) ? undefined : { ...agreement, strong: true };
  if (ARTICLES.has(f)) {
    // le son, un ton: after a determiner, son and ton are the nouns
    if ((f === 'son' || f === 'ton') && determinerAt(h, h.prevOf(k))) return undefined;
    return { ...agreement, strong: true };
  }
  if (QUANTIFIERS.has(f)) return { ...agreement, strong: false };
  if (h.top(k)?.pos === 'NUM' && f !== 'un' && f !== 'une') return { strong: false };
  return undefined;
}

/** A subject pronoun before the chain of ne and object clitics that ends at k (je ne le lui donne → je), with its person. */
function chainSubject(h: Here, k: number): { start: number; before: number | undefined; subject?: { person: string; number: string; form: string } } {
  let s = k;
  for (let steps = 0; steps < 6; steps++) {
    const p = h.prevOf(s);
    const pf = h.form(p);
    if (p === undefined || pf === undefined || !(OBJECT_CLITICS.has(pf) || NE_FORMS.has(pf))) break;
    if (pf === 'en' && !enIsPronoun(h, p)) break;
    if (LE_FORMS.has(pf) && leIsClitic(h, p) === false) break;
    s = p;
  }
  const before = h.prevOf(s);
  const bf = h.form(before);
  if (bf !== undefined && SUBJECT_PRONOUNS.has(bf) && !afterPreposition(h, before as number)) return { start: s, before, subject: { ...SUBJECT_PRONOUNS.get(bf)!, form: bf } };
  // nous nous levons, vous vous trompez: the first nous / vous of the chain is the subject
  const first = h.form(s);
  if ((first === 'nous' || first === 'vous') && s !== k) return { start: s, before, subject: { ...SUBJECT_PRONOUNS.get(first)!, form: first } };
  return { start: s, before };
}

/** An avoir or être before token i, with only adverbs, the inverted subject and its hyphens between (il a déjà fini; a-t-il fini). */
function auxiliaryBefore(h: Here): number | undefined {
  let k = h.i - 1;
  for (let steps = 0; k >= 0 && steps < 8; steps++) {
    const t = h.tokens[k];
    if (!t.isWord) {
      if (t.normalized === '-') { k--; continue; }
      return undefined;
    }
    const f = t.normalized;
    if (BETWEEN_ADVERBS.has(f) || f === 't' || (INVERTED_SUBJECTS.has(f) && hyphenBefore(h.tokens, k) !== undefined)) { k--; continue; }
    if (f === 'ailleurs' && h.form(k - 1) === "d'") { k -= 2; continue; } // n'a d'ailleurs fait
    if (!h.own(k).some((c) => isVerbal(c) && (c.lemma === 'avoir' || c.lemma === 'être'))) return undefined;
    // is that word the auxiliary here (qu'elle soit partie) and not its other reading (les avions)? Its own neighbours say;
    // the question only ever goes leftwards, so it ends
    const there = disambiguateFrench(k, h.tokens, h.base)[0];
    return there && isVerbal(there) && (there.lemma === 'avoir' || there.lemma === 'être') ? k : undefined;
  }
  return undefined;
}

/** Is the verb at i in a que-clause whose governing word asks for the subjunctive (il faut que tu viennes, bien qu'il soit)? */
function subjunctiveGoverned(h: Here): SubjunctiveTrigger | undefined {
  let k = h.i - 1;
  for (let steps = 0; k >= 0 && steps < 7; steps++) {
    const t = h.tokens[k];
    if (!t.isWord) return undefined;
    const f = t.normalized;
    if (QUE_FORMS.has(f)) return triggerBeforeQue(h, k);
    if (SUBJUNCTIVE_CONJ_WORDS.has(f)) return { label: t.surface.toLowerCase(), que: k, trigger: k };
    const top = h.top(k);
    const nominal = top !== undefined && ['DET', 'NOUN', 'ADJ', 'PROPN', 'NUM'].includes(top.pos ?? '') && !h.own(k).some(isFinite);
    if (!(OBJECT_CLITICS.has(f) || NE_FORMS.has(f) || SUBJECT_PRONOUNS.has(f) || nominal)) return undefined;
    k--;
  }
  return undefined;
}
function triggerBeforeQue(h: Here, q: number): SubjunctiveTrigger | undefined {
  const p = h.prevOf(q);
  const pf = h.form(p);
  if (p === undefined) return opensClause(h.tokens, q) && clauseEnd(h.tokens, q) !== '?' ? { label: 'que opening the sentence', que: q } : undefined;
  if (pf === 'ce' && h.form(h.prevOf(p)) === 'à') return { label: 'à ce que', que: q, trigger: p };
  if (pf !== undefined && SUBJUNCTIVE_CONJ_HEADS.has(pf)) {
    if (pf === 'bien' && !(opensClause(h.tokens, p) || isPause(h.tokens[p - 1]) || ['et', 'mais', 'ou', 'or'].includes(h.form(h.prevOf(p)) ?? ''))) return undefined;
    if (pf === 'moins' && h.form(h.prevOf(p)) !== 'à') return undefined;
    return { label: `${pf} que`, que: q, trigger: p };
  }
  if (pf !== undefined && SUBJUNCTIVE_WORDS.has(pf)) return { label: `${pf} que`, que: q, trigger: p };
  const verb = (k: number | undefined) => h.own(k).find((c) => isVerbal(c) && SUBJUNCTIVE_VERBS.has(c.lemma ?? ''));
  const v = verb(p);
  if (v) return { label: `${v.lemma} que`, que: q, trigger: p };
  const p2 = h.prevOf(p);
  const v2 = pf !== undefined && BETWEEN_ADVERBS.has(pf) ? verb(p2) : undefined;
  return v2 ? { label: `${v2.lemma} que`, que: q, trigger: p2 } : undefined;
}

/** What makes a verb subjunctive: the que (or quoique) and the word that governs it (il faut que: faut). */
export interface SubjunctiveTrigger { label: string; que: number; trigger?: number }
/**
 * The subjunctive trigger of the verb at token i, read over any list of readings per token (the context-free ones here, the
 * ordered ones in french/constructions.ts): undefined when the verb is not in such a que-clause.
 */
export function frenchSubjunctiveTrigger(i: number, tokens: RawToken[], readings: C[][]): SubjunctiveTrigger | undefined {
  return subjunctiveGoverned(new Here(i, tokens, readings));
}

/** In this sentence, is there another verb that is only a passé simple (il sortit), or an imparfait before this one? A story told in the past. */
function narrativePast(h: Here): boolean {
  const [a, b] = sentenceSpan(h.tokens, h.i);
  for (let j = a; j <= b; j++) {
    if (j === h.i || !h.tokens[j].isWord) continue;
    const own = h.own(j);
    if (own.length === 0 || !own.every(isFinite)) continue;
    if (own.every((c) => has(c, 'Mood', 'Ind') && has(c, 'Tense', 'Past'))) return true;
    if (j < h.i && own.every((c) => has(c, 'Mood', 'Ind') && has(c, 'Tense', 'Imp'))) return true;
  }
  return false;
}

/** Put first, among the readings that `pred` admits, the right cell: the subject's person, then the mood or tense the context asks for. */
function pickVerb(h: Here, pred: (c: C) => boolean, why: string, cue: Cue, subject?: { person: string; number: string }): Choice | undefined {
  let pool = h.cands.map((c, k) => ({ c, k })).filter(({ c }) => pred(c) && mayLead(h.cands, c, cue));
  // with a subject: a finite reading must agree with it in person and number (a command has no subject)
  const agrees = (c: C) => c.morph.Person !== undefined && fits(c, 'Person', subject?.person) && fits(c, 'Number', subject?.number);
  if (subject) pool = pool.filter(({ c }) => !isFinite(c) || (!isImperative(c) && agrees(c)));
  if (pool.length === 0) return undefined;
  const reasons: string[] = [why];
  const prefer = (p: (c: C) => boolean, reason: string) => {
    const yes = pool.filter(({ c }) => p(c));
    if (yes.length > 0 && yes.length < pool.length) { pool = [...yes, ...pool.filter(({ c }) => !p(c))]; reasons.push(reason); }
  };
  if (pool.some(({ c }) => has(c, 'Mood', 'Sub'))) {
    const trigger = subjunctiveGoverned(h);
    if (trigger) prefer((c) => has(c, 'Mood', 'Sub'), `after "${trigger.label}": the subjunctive`);
  }
  if (pool.some(({ c }) => has(c, 'Mood', 'Ind') && has(c, 'Tense', 'Past')) && pool.some(({ c }) => has(c, 'Mood', 'Ind') && has(c, 'Tense', 'Pres')) && narrativePast(h)) {
    prefer((c) => has(c, 'Tense', 'Past'), 'the sentence tells a story in the past: the passé simple');
  }
  return { k: pool[0].k, why: reasons.join('; '), cue };
}

/** The pronoun at a hyphen: the inverted subject of a question (viens-tu ? a-t-il ?) or the object of a command (donne-le). */
function invertedSubjectAfter(h: Here): string | undefined {
  let j = hyphenAfter(h.tokens, h.i);
  if (j !== undefined && h.form(j) === 't') j = hyphenAfter(h.tokens, j);
  const f = h.form(j);
  if (f === undefined || !INVERTED_SUBJECTS.has(f)) return undefined;
  if ((f === 'nous' || f === 'vous') && clauseEnd(h.tokens, h.i) !== '?') return undefined;
  return f;
}

// ── the rules, in the order they are asked; the first that gives a verdict decides ──
interface Rule { name: string; run(h: Here): Verdict }

const RULES: readonly Rule[] = [
  {
    name: 'pronoun after a hyphen',
    run: (h) => {
      const v = hyphenBefore(h.tokens, h.i);
      if (v === undefined || !h.cands.some((c) => c.pos === 'PRON') || !(h.someVerbal(v) || h.form(v) === 't')) return undefined;
      return h.pick((c) => c.pos === 'PRON', 'joined to the verb by a hyphen: a pronoun', 'certain') ?? null;
    },
  },
  {
    name: 'le, la, les, l\': article or object pronoun',
    run: (h) => {
      if (!LE_FORMS.has(h.w)) return undefined;
      const clitic = leIsClitic(h, h.i);
      if (clitic !== true) return null;
      const pf = h.form(h.prev);
      const why = pf !== undefined && (SUBJECT_PRONOUNS.has(pf) || NE_FORMS.has(pf) || PURE_CLITICS.has(pf) || pf === "s'")
        ? `after "${pf}": the object pronoun` : 'before a verb: the object pronoun';
      return h.pick((c) => c.pos === 'PRON', why, 'strong') ?? null;
    },
  },
  {
    name: 'leur: possessive, dative pronoun, or le leur',
    run: (h) => {
      if (h.w !== 'leur') return undefined;
      const pf = h.form(h.prev);
      if ((pf === 'le' || pf === 'la' || pf === 'les') && !h.own(h.next).some((c) => c.pos === 'NOUN' || c.pos === 'ADJ')) {
        return h.pick((c) => c.pos === 'PRON' && has(c, 'Poss', 'Yes'), `after "${pf}": the possessive pronoun (le leur, theirs)`, 'strong') ?? null;
      }
      if (leurIsClitic(h, h.i)) return h.pick((c) => c.pos === 'PRON' && has(c, 'Case', 'Dat'), 'before a verb: the pronoun "to them"', 'strong') ?? null;
      return null;
    },
  },
  {
    name: 'en: preposition or pronoun',
    run: (h) => {
      if (h.w !== 'en') return undefined;
      return enIsPronoun(h, h.i) ? h.pick((c) => c.pos === 'PRON', 'between the subject or another pronoun and the verb: the pronoun en', 'strong') ?? null : null;
    },
  },
  {
    name: 's\': si before il, se otherwise',
    run: (h) => {
      if (h.w !== "s'") return undefined;
      const nf = h.form(h.next);
      return nf === 'il' || nf === 'ils' ? h.pick((c) => c.lemma === 'si', `before "${nf}": si (if)`, 'certain') ?? null : h.pick((c) => c.lemma === 'se', 'before a verb: the reflexive se', 'strong') ?? null;
    },
  },
  {
    name: 'si: conjunction, adverb or "yes"',
    run: (h) => {
      if (h.w !== 'si') return undefined;
      const pf = h.form(h.prev);
      if (h.next === undefined) {
        const alone = h.prev === undefined || ['mais', 'que', 'oh', 'ah', 'et', 'eh'].includes(pf ?? '');
        return alone ? h.pick((c) => c.pos === 'INTJ', 'standing alone: "yes" (answering a negative question)', 'strong') ?? null : null;
      }
      const nf = h.form(h.next) as string;
      const top = h.top(h.next);
      const subjectNext = SUBJECT_PRONOUNS.has(nf) || ["c'", 'ce', 'cela', 'ça', 'personne', 'rien', 'chacun', "quelqu'un", 'tout', 'tous', 'on'].includes(nf)
        || determinerAt(h, h.next) !== undefined || top?.pos === 'PROPN' || (top?.pos === 'NOUN' && !h.own(h.next).some((c) => c.pos === 'ADJ' || c.pos === 'ADV'));
      if (subjectNext || pf === 'même' || pf === 'comme') return h.pick((c) => c.pos === 'SCONJ', 'before a subject: si (if)', 'strong') ?? null;
      if (top && (top.pos === 'ADJ' || top.pos === 'ADV' || isPastParticiple(top))) return h.pick((c) => c.pos === 'ADV', 'before an adjective or adverb: si (so)', 'strong') ?? null;
      return null;
    },
  },
  {
    name: 'que: relative, conjunction, "only" or interrogative',
    run: (h) => queRule(h),
  },
  {
    name: 'ce: determiner or pronoun',
    run: (h) => {
      if (h.w !== 'ce') return undefined;
      const nf = h.form(h.next);
      if (nf !== undefined && (['qui', 'que', "qu'", 'dont', "n'", 'ne', 'à', 'quoi'].includes(nf) || h.own(h.next).length > 0 && h.own(h.next).every(isFinite))) {
        return h.pick((c) => c.pos === 'PRON', nf === 'qui' || nf === 'que' || nf === "qu'" || nf === 'dont' || nf === 'quoi' ? `before "${nf}": the pronoun ce (what, that which)` : 'before a verb: the pronoun ce', 'strong') ?? null;
      }
      return null;
    },
  },
  {
    name: 'tout: determiner, pronoun or adverb',
    run: (h) => {
      if (h.w !== 'tout' && h.w !== 'toute' && h.w !== 'toutes') return undefined;
      const n = h.next;
      const nf = h.form(n);
      const own = h.own(n);
      const auxBefore = h.own(h.prev).some((c) => isVerbal(c) && c.lemma === 'avoir');
      if (n === undefined) return h.pick((c) => c.pos === 'PRON', 'with nothing after it: the pronoun (everything)', 'strong') ?? null;
      if (auxBefore && own.some(isPastParticiple)) return h.pick((c) => c.pos === 'PRON', 'between avoir and a participle: the pronoun (il a tout mangé)', 'strong') ?? null;
      if (nf !== undefined && (LE_FORMS.has(nf) || ARTICLES.has(nf) || QUANTIFIERS.has(nf))) return null;
      if (nf === 'à' || nf === 'de' || nf === 'en') return h.pick((c) => c.pos === 'ADV', `before "${nf}": the adverb (tout à fait, tout de suite, tout en …)`, 'weak') ?? null;
      if (own.length > 0 && !own.some((c) => c.pos === 'NOUN' || isFinite(c)) && (own[0].pos === 'ADJ' || own[0].pos === 'ADV')) return h.pick((c) => c.pos === 'ADV', 'before an adjective or adverb: the adverb (quite, very)', 'strong') ?? null;
      // tout est fini, tout va bien, tout a changé (not toutes sortes: a noun the list may not hold, read as a verb form)
      if (own.length > 0 && (own.every(isFinite) || (isFinite(own[0]) && ['être', 'avoir', 'aller', 'faire'].includes(own[0].lemma ?? '')))) return h.pick((c) => c.pos === 'PRON', 'before a verb: the pronoun (everything)', 'strong') ?? null;
      return null;
    },
  },
  {
    // added by the lead: the word list gives plus two readings (fr.ts listReadings), "more" first
    name: 'plus: "no longer" after ne, "more" otherwise',
    run: (h) => {
      if (h.w !== 'plus') return undefined;
      const negative = (c: C) => c.pos === 'ADV' && has(c, 'Polarity', 'Neg');
      if (!h.cands.some(negative) || !h.cands.some((c) => c.pos === 'ADV' && !negative(c))) return undefined;
      // a ne earlier in the same clause, with no pause and no other finite clause opened in between (at most eight words back)
      let k = h.prev, steps = 0;
      while (k !== undefined && steps < 8) {
        const f = h.form(k);
        if (f !== undefined && NE_FORMS.has(f)) return h.pick(negative, 'after ne: no longer, no more', 'certain') ?? null;
        if (f === 'que' || f === "qu'" || f === 'qui' || f === 'et' || f === 'mais') break;
        if (h.tokens.slice(k + 1, h.i).some((t) => !t.isWord && /[,;:.!?]/u.test(t.surface))) break;
        k = h.prevOf(k); steps++;
      }
      return undefined; // no ne: the order the word list gives ("more" first) stands; everyday speech may still mean "no longer" (j'en veux plus)
    },
  },
  {
    name: 'même: determiner or adverb',
    run: (h) => {
      if (h.w !== 'même') return undefined;
      const top = h.top(h.prev);
      // le même livre, la même chose: between a determiner and its noun it is the adjective "same" (added by the lead)
      if (determinerAt(h, h.prev) && h.own(h.next).some((c) => c.pos === 'NOUN') && h.cands.some((c) => c.pos === 'ADJ')) {
        return h.pick((c) => c.pos === 'ADJ', 'between a determiner and its noun: the adjective (same)', 'strong') ?? null;
      }
      if (determinerAt(h, h.prev) || top?.pos === 'NOUN' || top?.pos === 'PRON') return null;
      const n = h.next;
      const nf = h.form(n);
      const nt = h.top(n);
      if (n === undefined || nt === undefined) return null;
      if (nf === 'si' || nt.pos === 'PRON' || nt.pos === 'PROPN' || nt.pos === 'DET' || nt.pos === 'ADV' || nt.pos === 'ADP' || LE_FORMS.has(nf as string) || h.allVerbal(n) || isPastParticiple(nt)) {
        return h.pick((c) => c.pos === 'ADV', 'not after a determiner, before what it stresses: the adverb (even)', 'strong') ?? null;
      }
      return null;
    },
  },
  {
    name: 'du, des: article or de + le',
    run: (h) => {
      if (h.w !== 'du' && h.w !== 'des') return undefined;
      if (!h.cands.some((c) => c.pos === 'ADP')) return null;
      const p = h.prev;
      const pf = h.form(p);
      if (p === undefined || pf === undefined) return null;
      const contraction = (why: string) => h.pick((c) => c.pos === 'ADP', why, 'strong') ?? null;
      if (DE_HEADS.has(pf) || h.top(p)?.pos === 'NUM') return contraction(`after "${pf}": de + the article (of the)`);
      if (pf === 'partir' && h.form(h.prevOf(p)) === 'à') return contraction('after "à partir": de + the article');
      const verbs = h.own(p).filter(isVerbal);
      if (verbs.length > 0) {
        if (verbs.some((c) => DE_VERBS.has(c.lemma ?? '')) && !verbs.some((c) => ARTICLE_VERBS.has(c.lemma ?? ''))) return contraction(`after "${pf}", a verb that takes de: de + the article`);
        // manger du pain, avoir des amis: the article; any other verb does not decide
        return null;
      }
      const top = h.top(p);
      if (top?.pos === 'NOUN') return contraction(`after the noun "${pf}": de + the article (of the)`);
      if (top?.pos === 'ADJ' && ['plus', 'moins'].includes(h.form(h.prevOf(p)) ?? '')) return contraction('after a superlative: de + the article (of the)');
      return null;
    },
  },
  { name: 'verb with an inverted subject', run: (h) => {
    if (!h.cands.some(isFinite)) return undefined;
    const s = invertedSubjectAfter(h);
    if (!s) return undefined;
    const subject = s === 'ce' ? { person: '3', number: 'Sing' } : SUBJECT_PRONOUNS.get(s);
    return pickVerb(h, isStatement, `before the inverted subject "${s}": a conjugated verb`, 'strong', subject);
  } },
  { name: 'participle after avoir or être', run: (h) => {
    if (!h.cands.some(isPastParticiple)) return undefined;
    const a = auxiliaryBefore(h);
    if (a === undefined) return undefined;
    return h.pick(isPastParticiple, `after the auxiliary "${h.tokens[a].surface}": the past participle`, 'strong');
  } },
  { name: 'noun after a determiner', run: (h) => {
    if (!h.cands.some((c) => c.pos === 'NOUN' || c.pos === 'ADJ')) return undefined;
    const d = determinerAt(h, h.prev);
    if (!d) return undefined;
    const p = h.tokens[h.prev as number].surface;
    const agrees = (c: C) => fits(c, 'Gender', d.gender) && fits(c, 'Number', d.number);
    const cue: Cue = d.strong ? 'strong' : 'weak';
    // une longue route, un petit livre: between a determiner and a plain noun, the adjective
    const after = h.own(h.next);
    if (after.length > 0 && after[0].pos === 'NOUN' && !after.some((c) => c.pos === 'ADJ' || isVerbal(c)) && h.cands.some((c) => c.pos === 'ADJ')) {
      return h.pick((c) => c.pos === 'ADJ' && agrees(c), `between "${p}" and a noun: an adjective`, 'weak') ?? h.pick((c) => c.pos === 'ADJ', `between "${p}" and a noun: an adjective`, 'weak');
    }
    return h.pick((c) => c.pos === 'NOUN' && agrees(c), `after the determiner "${p}": a noun`, cue)
      ?? h.pick((c) => c.pos === 'NOUN', `after the determiner "${p}": a noun`, cue)
      ?? h.pick((c) => c.pos === 'ADJ' && agrees(c), `after the determiner "${p}": an adjective`, cue)
      ?? h.pick((c) => c.pos === 'ADJ', `after the determiner "${p}": an adjective`, cue);
  } },
  { name: 'noun after a determiner and an adjective', run: (h) => {
    if (!h.cands.some((c) => c.pos === 'NOUN')) return undefined;
    const top = h.top(h.prev);
    if (top?.pos !== 'ADJ' || h.own(h.prev).some(isVerbal) || !determinerAt(h, h.prevOf(h.prev))) return undefined;
    return h.pick((c) => c.pos === 'NOUN', `after "${h.form(h.prevOf(h.prev))} ${h.form(h.prev)}": a noun`, 'weak');
  } },
  { name: 'verb after its subject pronoun', run: (h) => {
    const pf = h.form(h.prev);
    if (pf === undefined || !SUBJECT_PRONOUNS.has(pf) || !h.cands.some(isStatement) || afterPreposition(h, h.prev as number)) return undefined;
    return pickVerb(h, isStatement, `after the subject "${h.tokens[h.prev as number].surface}": a conjugated verb`, SUBJECT_ONLY.has(pf) ? 'certain' : 'strong', SUBJECT_PRONOUNS.get(pf));
  } },
  { name: 'verb after ne or an object pronoun', run: (h) => {
    if (!h.cands.some((c) => isFinite(c) || isInfinitive(c))) return undefined;
    const p = h.prev;
    const pf = h.form(p);
    if (p === undefined || pf === undefined) return undefined;
    const clitic = PURE_CLITICS.has(pf) || NE_FORMS.has(pf) || pf === "s'" || pf === 'lui' || pf === 'nous' || pf === 'vous'
      || (LE_FORMS.has(pf) && leIsClitic(h, p) === true) || (pf === 'leur' && leurIsClitic(h, p)) || (pf === 'en' && enIsPronoun(h, p));
    if (!clitic) return undefined;
    const chain = chainSubject(h, h.i);
    const why = `after "${h.tokens[p].surface}": a verb`;
    if (chain.subject) return pickVerb(h, isStatement, why, 'strong', chain.subject) ?? h.pick(isFinite, why, 'strong');
    const bf = h.form(chain.before);
    if (chain.before !== undefined && ((bf !== undefined && PREPOSITIONS.has(bf)) || h.someVerbal(chain.before))) {
      return h.pick(isInfinitive, `${why}: after a preposition or a verb, the infinitive`, 'strong') ?? h.pick((c) => isFinite(c) || isInfinitive(c), why, 'strong');
    }
    if (opensClause(h.tokens, chain.start)) {
      const imp = h.pick(isImperative, `${why}: no subject, a command`, clauseEnd(h.tokens, h.i) === '!' ? 'strong' : 'weak');
      if (imp) return imp;
    }
    return pickVerb(h, isFinite, why, 'strong');
  } },
  { name: 'verb after qui', run: (h) => {
    if (h.form(h.prev) !== 'qui' || !h.cands.some(isStatement)) return undefined;
    return pickVerb(h, isStatement, 'after "qui": a conjugated verb', 'strong');
  } },
  { name: 'after a preposition', run: (h) => {
    const p = h.prev;
    const pf = h.form(p);
    if (p === undefined || pf === undefined || !PREPOSITIONS.has(pf) || (pf === 'en' && enIsPronoun(h, p))) return undefined;
    // sur son domaine, pour leur pays: a determiner of a noun phrase stays one
    if (h.cands[0].pos === 'DET') return null;
    if (pf === 'en' && h.cands.some(isPresentParticiple)) return h.pick(isPresentParticiple, 'after en: the present participle (en marchant)', 'strong');
    if (INFINITIVE_PREPOSITIONS.has(pf) && h.cands.some(isInfinitive)) return h.pick(isInfinitive, `after the preposition "${pf}": the infinitive`, 'strong');
    const negativePronoun = h.cands.some((c) => c.pos === 'PRON' && has(c, 'Polarity', 'Neg'));
    if (h.cands.some((c) => c.pos === 'NOUN') && !negativePronoun) return h.pick((c) => c.pos === 'NOUN', `after the preposition "${pf}": a noun`, 'strong');
    if (h.cands.some(isFinite) && h.cands.some((c) => !isFinite(c))) return h.pick((c) => !isFinite(c), `after the preposition "${pf}": not a conjugated verb`, 'weak');
    return undefined;
  } },
  { name: 'command at the start of a clause', run: (h) => {
    if (!h.cands.some(isImperative) || !opensClause(h.tokens, h.i)) return undefined;
    const j = hyphenAfter(h.tokens, h.i);
    const jf = h.form(j);
    const question = clauseEnd(h.tokens, h.i) === '?';
    const hyphenClitic = jf !== undefined && IMPERATIVE_CLITICS.has(jf) && !(question && (jf === 'nous' || jf === 'vous'));
    if (hyphenClitic) return h.pick(isImperative, `before "-${h.tokens[j as number].surface}": a command`, 'strong');
    if (jf !== undefined) return undefined;
    // a verb that opens its clause with no subject: a command; with "!" and its object or complement after it, even a
    // word read first as a noun (Ferme la porte !); a single word (Marche !) only when it is read first as a verb
    if (clauseEnd(h.tokens, h.i) === '!' && (isVerbal(h.cands[0]) || h.next !== undefined)) return h.pick(isImperative, 'opens an exclamation with no subject: a command', 'strong');
    if (!isVerbal(h.cands[0])) return undefined;
    if (question) return undefined;
    return h.pick(isImperative, 'opens the sentence with no subject: a command', 'weak');
  } },
  { name: 'verb after a noun subject', run: (h) => {
    const p = h.prev;
    const top = h.top(p);
    if (p === undefined || !top || h.cands.some((c) => c.pos === 'ADJ') || !h.cands.some(isStatement) || h.own(p).some(isVerbal)) return undefined;
    // le bruit nuit; Pathé fait: a noun after its determiner, or a name that opens its clause or follows a comma or "et"
    const nameOpens = opensClause(h.tokens, p) || isPause(h.tokens[p - 1]) || ['et', 'mais', 'puis'].includes(h.form(h.prevOf(p)) ?? '');
    const subjectNoun = (top.pos === 'NOUN' && determinerAt(h, h.prevOf(p)) !== undefined) || (top.pos === 'PROPN' && nameOpens)
      || (top.pos === 'PRON' && SUBJECT_PRONOUN_WORDS.has(h.form(p) as string) && !afterPreposition(h, p));
    if (!subjectNoun) return undefined;
    const number = top.morph.Number?.includes(',') ? undefined : top.morph.Number;
    return pickVerb(h, (c) => isStatement(c) && has(c, 'Person', '3') && fits(c, 'Number', number), `after its subject "${h.tokens[p].surface}": a conjugated verb`, 'weak');
  } },
  { name: 'adjective after its noun', run: (h) => {
    // le secrétaire général, des choix politiques: most French adjectives follow their noun and agree with it
    if (h.cands[0].pos !== 'NOUN' || !h.cands.some((c) => c.pos === 'ADJ')) return undefined;
    const top = h.top(h.prev);
    if (top?.pos !== 'NOUN' || h.base[h.prev as number].some((c) => isOwn(c) && isVerbal(c))) return undefined;
    const g = top.morph.Gender?.includes(',') ? undefined : top.morph.Gender;
    const n = top.morph.Number?.includes(',') ? undefined : top.morph.Number;
    return h.pick((c) => c.pos === 'ADJ' && fits(c, 'Gender', g) && fits(c, 'Number', n), `after the noun "${h.tokens[h.prev as number].surface}": an adjective that agrees with it`, 'weak');
  } },
  { name: 'after a conjugated verb', run: (h) => {
    // (the word before must be a verb by the adapter's own data, not a rule's guess at an unknown word: le détroit est)
    const own = h.prev === undefined ? [] : h.base[h.prev].filter(isOwn);
    if (own.length === 0 || !own.every(isVerbal) || !own.some(isFinite)) return undefined;
    if (h.cands.some((c) => c.pos === 'ADV') && h.cands.some((c) => c.pos === 'NOUN')) return h.pick((c) => c.pos === 'ADV', 'directly after a verb: the adverb', 'weak');
    const auxiliary = h.cands.some((c) => isFinite(c) && (c.lemma === 'être' || c.lemma === 'avoir'));
    if (!auxiliary && !own.some((c) => c.lemma === 'avoir' || c.lemma === 'être') && h.cands.some(isFinite) && h.cands.some((c) => !isVerbal(c))) {
      return h.pick((c) => !isVerbal(c), 'after a conjugated verb: its object or complement, not a second verb', 'weak');
    }
    return undefined;
  } },
  { name: 'mood and tense of a verb by its sentence', run: (h) => {
    // (only where the subjunctive trigger or the narrative past says something; otherwise the order stays)
    if (!h.cands.some(isFinite) || !isVerbal(h.cands[0])) return undefined;
    const lemma = h.cands[0].lemma;
    const r = pickVerb(h, (c) => isFinite(c) && c.lemma === lemma && !isImperative(c), '', 'weak');
    const why = r?.why.replace(/^; /u, '') ?? '';
    return r && why !== '' ? { ...r, why } : undefined;
  } },
];

function queRule(h: Here): Verdict {
  if (!QUE_FORMS.has(h.w)) return undefined;
  const sconj = (why: string, cue: Cue = 'strong') => h.pick((c) => c.pos === 'SCONJ', why, cue) ?? null;
  const p = h.prev;
  const pf = h.form(p);
  // je ne mange que du pain: ne before the verb, no other negative word, que after it → "only"
  if (restrictiveQue(h)) return h.pick((c) => c.pos === 'ADV', 'ne … que: "only"', 'strong') ?? null;
  // est-ce que, qu'est-ce que
  if (pf === 'ce' && p !== undefined && hyphenBefore(h.tokens, p) !== undefined) return sconj('after "est-ce": the conjunction of the question');
  if (p === undefined) {
    const nf = h.form(h.next);
    if (nf === 'est' && h.form(hyphenAfter(h.tokens, h.next as number)) === 'ce') return null; // qu'est-ce: the interrogative
    if (nf !== undefined && SUBJECT_PRONOUNS.has(nf) && opensClause(h.tokens, h.i) && clauseEnd(h.tokens, h.i) !== '?') return sconj('opens the sentence before a subject: the conjunction (que + subjunctive)', 'weak');
    return null;
  }
  if (pf === 'ce' && h.form(h.prevOf(p)) === 'à') return sconj('"à ce que": the conjunction');
  if (pf !== undefined && RELATIVE_PRONOUN_HEADS.has(pf)) return null;
  if (pf !== undefined && QUE_CONJ_HEADS.has(pf)) return sconj(`"${pf} que": a conjunction`);
  if (comparativeBefore(h)) return sconj('after a comparison (plus, moins, aussi …): the que of comparison');
  const verbal = (k: number | undefined) => {
    const own = h.own(k);
    return own.length > 0 && own.every(isVerbal);
  };
  if (verbal(p) || (pf !== undefined && INVERTED_SUBJECTS.has(pf) && hyphenBefore(h.tokens, p) !== undefined)) return sconj(`after the verb "${h.tokens[p].surface}": the conjunction (that)`);
  if (pf !== undefined && BETWEEN_ADVERBS.has(pf) && verbal(h.prevOf(p))) return sconj(`after "${h.tokens[h.prevOf(p) as number].surface} ${h.tokens[p].surface}": the conjunction (that)`);
  const top = h.top(p);
  if (top?.pos === 'ADJ' && !h.own(p).some((c) => c.pos === 'NOUN')) {
    const p2 = h.prevOf(p);
    if (p2 === undefined || verbal(p2) || INTENSIFIERS.has(h.form(p2) as string)) return sconj(`after the adjective "${h.tokens[p].surface}": the conjunction (that)`);
  }
  if (top && (top.pos === 'NOUN' || top.pos === 'PROPN') && !COMPLETIVE_NOUNS.has(pf as string)) return null;
  return null;
}

/** ne … que with no other negative word between and a verb between: the restrictive "only". */
function restrictiveQue(h: Here): boolean {
  let verb = false;
  let k = h.i - 1;
  for (let steps = 0; k >= 0 && steps < 10; steps++, k--) {
    const t = h.tokens[k];
    if (!t.isWord) {
      if (t.normalized === '-') continue;
      return false;
    }
    const f = t.normalized;
    if (NE_FORMS.has(f)) return verb;
    if (['pas', 'jamais', 'rien', 'personne', 'point', 'guère', 'aucun', 'aucune', 'plus'].includes(f) || QUE_FORMS.has(f)) return false;
    if (h.own(k).some(isVerbal)) verb = true;
  }
  return false;
}
/** A comparison word within the few words before que (plus grand que, aussi vite que, autre chose que), not a superlative (le plus beau livre que). */
function comparativeBefore(h: Here): boolean {
  let k = h.prev;
  for (let steps = 0; k !== undefined && steps < 4; steps++, k = h.prevOf(k)) {
    const f = h.form(k) as string;
    if (COMPARATIVE_WORDS.has(f)) {
      const before = h.form(h.prevOf(k));
      if (before !== undefined && (LE_FORMS.has(before) || ['mon', 'ton', 'son', 'ma', 'ta', 'sa', 'mes', 'tes', 'ses', 'notre', 'votre', 'leur', 'nos', 'vos', 'leurs'].includes(before))) return false;
      return true;
    }
    if (h.own(k).some(isFinite)) return false;
  }
  return false;
}

/**
 * The candidates of token i, reordered where the neighbours decide; the same array when they do not.
 * `base` is the context-free analysis of every token of the sentence (best first; a non-word token has none).
 */
export function disambiguateFrench(i: number, tokens: RawToken[], base: C[][]): C[] {
  const cands = base[i];
  if (!cands || cands.length < 2) return cands;
  // a capitalised word read first as a name (la Seine, à Paris, le Monde): the neighbours of a name say nothing about it
  if (cands[0].pos === 'PROPN' && /^\p{Lu}/u.test(tokens[i].surface)) return cands;
  const h = new Here(i, tokens, base);
  for (const rule of RULES) {
    const v = rule.run(h);
    if (v === undefined) continue;
    if (v === null || v.k === 0) return cands;
    const chosen = cands[v.k];
    const cap = v.cue === 'weak' ? chosen.confidence : Math.min(0.4, chosen.confidence);
    const moved: C = { ...chosen, notes: { ...(chosen.notes ?? {}), context: v.why } };
    return [moved, ...cands.filter((_, k) => k !== v.k).map((c) => (c.confidence > cap ? { ...c, confidence: cap } : c))];
  }
  return cands;
}

/** The names of the rules, in the order they are asked (for the tests and the documentation). */
export const FRENCH_CONTEXT_RULES: readonly string[] = RULES.map((r) => r.name);
