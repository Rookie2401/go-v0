/**
 * Albanian contextual syntax, part 1 (Linguistic Engine V2, Stage 4): the working state of one sentence, the way a word is
 * classified from the adapter's own readings, and the one place where a relation is recorded (`put`).
 *
 * Nothing here parses. A word is classified from its first reading (the sentence layer already ordered the readings);
 * the sets of Case / Number / Gender / Person it may have come from every reading that is nearly as good as the first,
 * so a form the sentence did not decide ("lule" = singular or plural, "kafe" = nominative or accusative) stays open and
 * the rules in syntax.ts keep both possibilities instead of choosing. Machine-drafted, not checked by a native speaker.
 */
import type { AnalysisCandidate, AnalyzedToken, RawToken } from '../../core';
import { RELATION_WORDS } from '../../core/syntax';
import type { DependencyRelation, SyntaxAlternative, SyntaxRelation } from '../../core/syntax';

export type C = AnalysisCandidate;

/** What a word is for the syntax rules (coarser than part of speech, finer where Albanian needs it). */
export type K =
  | 'verb' | 'ptcp' | 'noun' | 'pron' | 'clitic' | 'dem' | 'poss' | 'det' | 'num' | 'art' | 'adj' | 'adv' | 'adp' | 'cc' | 'sconj'
  | 'neg' | 'te' | 'fut' | 'prog' | 'qpart' | 'uvoice' | 'intj' | 'edhe' | 'other' | 'none';

export interface W {
  i: number;
  /** Normalized form. */
  s: string;
  c?: C;
  /** Every reading, best first. */
  alts: C[];
  k: K;
  lemma: string;
  /** An interrogative word (kush, çfarë, si, ku …). */
  wh: boolean;
  /** The reading is a guess from the ending (the word list does not know the word). */
  guessed: boolean;
  /** The values the readings that are nearly as good as the first one allow. Empty = the form says nothing. */
  cases: string[];
  nums: string[];
  genders: string[];
  persons: string[];
  defs: string[];
  /** The readings about as good as the first include a nominative and none is an accusative: the form can be a subject and cannot be an object. */
  nomStrong: boolean;
  /** A linking article and its adjective / possessive are one unit (sentence layer): the article points to the head. */
  unit?: { head: number; role: string; pieces: number[] };
}

export interface NP {
  /** The head word. */
  h: number;
  /** First and last token of the phrase (left dependents, right dependents, genitive chain). */
  start: number;
  end: number;
  /** The preposition that governs it. */
  pp?: number;
  /** Set when the phrase is a dependent of another phrase (genitive, apposition, conjunct, vocative): not an argument of a verb. */
  inner?: boolean;
}

export const vals = (v: string | undefined): string[] => (v ? v.split(',') : []);
export const inter = (a: string[], b: string[]): boolean => a.length === 0 || b.length === 0 || a.some((x) => b.includes(x));
const uniq = (xs: string[]): string[] => [...new Set(xs)];

export const PUNCT_BOUNDARY = /[,;:.!?…«»"“”()[\]—–-]/u;
export const isPunct = (t: RawToken): boolean => !t.isWord && /[^\s]/u.test(t.surface);

const NEG = new Set(['nuk', "s'", 'mos']);
const SUB_MARKERS = new Set(['se', 'që', 'sepse', 'nëse', 'pasi', 'ndërsa', 'megjithëse', 'ngaqë', 'derisa', 'sapo', 'kur']);
const WH_MARKERS = new Set(['pse', 'sa', 'si', 'ku']);
export const isSubMarkerWord = (s: string): boolean => SUB_MARKERS.has(s);
export const isWhMarkerWord = (s: string): boolean => WH_MARKERS.has(s);
const QUANT_ADV = new Set(['shumë', 'pak', 'aq', 'mjaft', 'disa']);
export const isQuantAdv = (s: string): boolean => QUANT_ADV.has(s);
const POSS_LEMMAS = new Set(['im', 'yt', 'ynë', 'juaj', 'tij', 'saj', 'tyre', 'jonë', 'tonë', 'ime', 'jote', 'sime', 'tuaj']);

const WH_WORDS = new Set(['ku', 'si', 'pse', 'kur', 'sa', 'kush', 'çfarë', 'cili', 'cila', 'kujt', "ç'"]);
const isWh = (s: string, c: C | undefined): boolean => c?.morph.PronType === 'Int' || (WH_WORDS.has(s) && (c?.pos === 'ADV' || c?.pos === 'PRON'));

function kindOf(t: RawToken, c: C | undefined): K {
  if (!c) return 'none';
  const s = t.normalized;
  if (c.unit?.role === 'linking article') return 'art';
  if (c.unit?.role === 'head') return c.pos === 'ADJ' ? 'adj' : 'poss';
  if (NEG.has(s)) return 'neg';
  if (SUB_MARKERS.has(s) && c.pos !== 'NOUN' && c.pos !== 'VERB' && c.pos !== 'AUX') return 'sconj';
  switch (c.pos) {
    case 'VERB': case 'AUX': return c.morph.VerbForm === 'Part' ? 'ptcp' : 'verb';
    case 'NOUN': case 'PROPN': return 'noun';
    case 'PRON': return c.morph.Clitic === 'Yes' ? 'clitic' : 'pron';
    case 'DET':
      if (c.morph.PronType === 'Art') return 'art';
      if (c.morph.PronType === 'Dem') return 'dem';
      if (c.morph.Poss === 'Yes' || POSS_LEMMAS.has(c.lemma ?? '')) return 'poss';
      return 'det';
    case 'NUM': return s === 'një' ? 'det' : 'num';
    case 'ADJ': return 'adj';
    case 'ADV': return 'adv';
    case 'ADP': return 'adp';
    case 'CONJ': return s === 'edhe' ? 'edhe' : 'cc';
    case 'SCONJ': return 'sconj';
    case 'INTJ': return 'intj';
    case 'PART':
      if (c.lemma === 'të') return 'te';
      if (c.lemma === 'do') return 'fut';
      if (c.lemma === 'po') return 'prog';
      if (c.lemma === 'a') return 'qpart';
      if (c.lemma === 'u') return 'uvoice';
      return 'other';
    default: return 'other';
  }
}

/** The readings that count for agreement: the first one and every other of the same part of speech that is nearly as good. */
function plausible(cands: C[]): C[] {
  const top = cands[0];
  if (!top) return [];
  const floor = Math.max(0.5, top.confidence - 0.1);
  return cands.filter((c, j) => j === 0 || (c.pos === top.pos && c.confidence >= floor));
}

export function classify(tokens: RawToken[], analyses: AnalyzedToken[]): Array<W | undefined> {
  return tokens.map((t, i) => {
    if (!t.isWord) return undefined;
    const cands = analyses[i]?.candidates ?? [];
    const c = cands[0];
    const ps = plausible(cands);
    const collect = (key: string): string[] => uniq(ps.flatMap((x) => vals(x.morph[key])));
    const w: W = {
      i, s: t.normalized, c, alts: cands, k: kindOf(t, c), lemma: c?.lemma ?? '', wh: isWh(t.normalized, c),
      guessed: !!c?.unconfirmed, cases: collect('Case'), nums: collect('Number'), genders: collect('Gender'), persons: collect('Person'), defs: collect('Definite'),
      nomStrong: ps.length > 0 && ps.some((x) => vals(x.morph.Case).includes('Nom')) && !ps.some((x) => vals(x.morph.Case).includes('Acc')),
    };
    if (c?.unit) w.unit = { head: c.unit.head, role: c.unit.role, pieces: c.unit.pieces };
    // a fused cluster whose first part is the particle të (ta = të + e) acts as the particle
    if (c?.parts?.length && c.parts[0].pos === 'PART' && c.parts[0].lemma === 'të') w.k = 'te';
    return w;
  });
}

// ───────────────────────────── the working state ─────────────────────────────

export interface State {
  tokens: RawToken[];
  W: Array<W | undefined>;
  /** Indexes of the word tokens, in order. */
  words: number[];
  rel: Map<number, SyntaxRelation>;
  np: Map<number, NP>;
  /** Any token of a noun phrase → its head. */
  headOf: Map<number, number>;
  /** First token of a noun phrase → its head. */
  startAt: Map<number, number>;
  notes: string[];
  put: (dep: number, head: number | undefined, relation: DependencyRelation, basis: string[], confidence: number, alts?: SyntaxAlternative[], label?: string) => boolean;
  has: (dep: number) => boolean;
  surf: (i: number | undefined) => string;
}

const LABEL: Partial<Record<DependencyRelation, (h: string) => string>> = {
  nsubj: (h) => `subject of '${h}'`,
  obj: (h) => `direct object of '${h}'`,
  iobj: (h) => `indirect object of '${h}' (to whom / for whom)`,
  obl: (h) => `adverbial phrase of '${h}' (place, time, manner, or an extra noun)`,
  nmod: (h) => `noun that modifies '${h}'`,
  amod: (h) => `adjective describing '${h}'`,
  det: (h) => `article / determiner of '${h}'`,
  case: (h) => `preposition of the phrase '${h}'`,
  aux: (h) => `auxiliary of '${h}'`,
  cop: (h) => `the verb 'to be' linking '${h}' to its subject`,
  mark: (h) => `word that introduces the clause of '${h}'`,
  advmod: (h) => `adverb of '${h}'`,
  advcl: (h) => `adverbial clause of '${h}'`,
  acl: (h) => `clause that describes '${h}'`,
  ccomp: (h) => `clause that is the object of '${h}'`,
  xcomp: (h) => `verb that completes '${h}' (can / wants / starts to …)`,
  conj: (h) => `coordinated with '${h}'`,
  cc: (h) => `'and' / 'but' joining '${h}'`,
  nummod: (h) => `number of '${h}'`,
  appos: (h) => `apposition of '${h}' (renames it)`,
  vocative: (h) => `person addressed (with '${h}')`,
  discourse: (h) => `discourse word with '${h}' (yes, no, hello …)`,
  expl: (h) => `short pronoun that repeats a noun of '${h}' (clitic doubling) or marks the non-active`,
  fixed: (h) => `part of the fixed expression with '${h}'`,
  punct: () => 'punctuation',
  dep: (h) => `attached to '${h}', relation not decided`,
  root: () => RELATION_WORDS.root,
};

export function makeState(tokens: RawToken[], W: Array<W | undefined>): State {
  const rel = new Map<number, SyntaxRelation>();
  const surf = (i: number | undefined): string => (i === undefined ? '' : tokens[i]?.surface ?? '');
  const cycles = (head: number, dep: number): boolean => {
    let h: number | undefined = head;
    for (let n = 0; h !== undefined && n < 200; n++) {
      if (h === dep) return true;
      h = rel.get(h)?.head;
    }
    return false;
  };
  const st: State = {
    tokens, W, words: tokens.flatMap((t, i) => (t.isWord ? [i] : [])), rel, np: new Map(), headOf: new Map(), startAt: new Map(), notes: [],
    has: (dep) => rel.has(dep),
    surf,
    put(dep, head, relation, basis, confidence, alts, label) {
      if (rel.has(dep)) return false;
      if (head !== undefined && (head === dep || cycles(head, dep))) return false;
      const b = basis.filter((x) => x.length > 0);
      let conf = confidence;
      const guess = [W[dep], head === undefined ? undefined : W[head]].filter((x): x is W => !!x && x.guessed);
      if (guess.length) { conf = Math.min(conf, 0.5); b.push(`the reading of '${guess.map((g) => surf(g.i)).join("', '")}' is a guess from its ending (the word list does not know it)`); }
      if (!b.length) b.push(`rule for ${relation}`);
      const kept = alts?.filter((a) => a.confidence > 0).map((a) => ({ ...a, confidence: Math.min(1, Math.max(0, a.confidence)) }));
      const r: SyntaxRelation = {
        dependent: dep, ...(head !== undefined ? { head } : {}), relation,
        label: label ?? (LABEL[relation] ?? ((h: string) => `${RELATION_WORDS[relation]} of '${h}'`))(surf(head)),
        basis: b, confidence: Math.min(1, Math.max(0, conf)),
        ...(kept?.length ? { alternatives: kept } : {}),
        status: kept?.some((a) => a.confidence >= 0.3) ? 'conflicted' : 'generated',
      };
      rel.set(dep, r);
      return true;
    },
  };
  return st;
}

// ───────────────────────────── small descriptions for the basis lines ─────────────────────────────

const CASE_WORDS: Record<string, string> = { Nom: 'nominative', Acc: 'accusative', Gen: 'genitive', Dat: 'dative', Abl: 'ablative' };
export const caseText = (w: W): string => (w.cases.length ? w.cases.map((c) => CASE_WORDS[c] ?? c).join(' / ') : 'no case shown');
export const numText = (w: W): string => (w.nums.length === 1 ? (w.nums[0] === 'Sing' ? 'singular' : 'plural') : 'singular or plural');
export const personText = (w: W): string => {
  const p = w.persons.length ? w.persons.join('/') : '3';
  return `${p}${p === '1' ? 'st' : p === '2' ? 'nd' : 'rd'} person ${numText(w)}`.trim();
};

/** Does a noun phrase head (or pronoun) agree with a finite verb in person and number? Pronouns carry a person; nouns are third person. */
export function agrees(subj: W, fin: W | undefined, plural: boolean): boolean {
  if (!fin) return true;
  const sp = subj.k === 'noun' || subj.k === 'dem' || subj.k === 'det' ? ['3'] : subj.persons.length ? subj.persons : ['3'];
  const sn = plural ? ['Plur'] : subj.nums;
  return inter(sp, fin.persons) && inter(sn, fin.nums);
}

/** Use another reading of a word (the sentence layer left two of equal weight and the clause has no verb): the word is re-read from it alone. */
export function reread(t: RawToken, w: W, c: C): void {
  w.c = c; w.k = kindOf(t, c); w.lemma = c.lemma ?? '';
  w.cases = vals(c.morph.Case); w.nums = vals(c.morph.Number); w.genders = vals(c.morph.Gender); w.persons = vals(c.morph.Person); w.defs = vals(c.morph.Definite); w.nomStrong = w.cases.includes('Nom') && !w.cases.includes('Acc');
  w.guessed = !!c.unconfirmed; w.wh = isWh(t.normalized, c);
}
