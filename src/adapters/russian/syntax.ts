/**
 * Russian shallow syntax: dependency relations between the words of ONE sentence, from the readings `analyze` gave (the first reading
 * of each word). Rule based, deterministic, no data of its own; the vocabulary of core/syntax.ts (Universal Dependencies).
 *
 * What it relates (and nothing more): a preposition to its noun (`case`, with the case it governs), an adjective, determiner, numeral
 * or participle to the noun it agrees with (`amod`, `det`, `nummod`), a nominative to the finite verb it agrees with (`nsubj`), an
 * accusative to its verb (`obj`), a dative (`iobj`), an instrumental or a prepositional phrase (`obl`), a genitive to the noun before
 * it (`nmod`), an infinitive to the modal or phasal word before it (`xcomp`), a negation to the word it negates (`advmod`), a
 * conjunction and what it joins (`cc`, `conj`). Every relation says what it relied on; where the rules could not rule out another
 * attachment (a feminine accusative looks like a nominative; a genitive may belong to the noun or to the verb) the alternative is kept.
 * A word the rules cannot attach has no relation. No parser is claimed: this is a set of local rules.
 *
 * MACHINE-DRAFTED; not reviewed by a native speaker.
 */
import type { AnalysisCandidate, AnalyzedToken, RawToken } from '../../core';
import type { DependencyRelation, SyntaxAlternative, SyntaxAnalysis, SyntaxRelation } from '../../core/syntax';
import { ruCasesOf, ruPrepositionOf } from './government';
import { ruAgrees, verbAgrees } from './sentence';
import { ruKey } from './text';

export const RU_SYNTAX_ANALYZER = 'syntax-ru@1';
type Cand = AnalysisCandidate;
type Rel = DependencyRelation;

const CASE_WORDS: Record<string, string> = { Nom: 'nominative', Gen: 'genitive', Dat: 'dative', Acc: 'accusative', Ins: 'instrumental', Prep: 'prepositional' };
const INF_TAKERS = new Set(['хотеть', 'мочь', 'смочь', 'уметь', 'суметь', 'начать', 'начинать', 'стать', 'продолжать', 'продолжить', 'кончить', 'кончать', 'закончить', 'перестать', 'любить', 'решить', 'пытаться', 'собираться', 'успеть', 'должен']);
const INF_WORDS = new Set(['надо', 'нужно', 'можно', 'нельзя', 'пора', 'лучше', 'необходимо']);
const COPULAS = new Set(['быть', 'стать', 'являться', 'казаться', 'оказаться', 'становиться', 'остаться', 'оставаться']);
const COORD = new Set(['и', 'а', 'но', 'или', 'да']);
const SUB_COMP = new Set(['что', 'чтобы', 'чтоб', 'будто', 'ли']);
const NEG = new Set(['не', 'ни']);

const vals = (c: Cand | undefined, k: string): string[] => (c?.morph[k] ? c.morph[k].split(',') : []);
const casesOf = (c: Cand | undefined): string[] => ruCasesOf(c?.morph.Case);
const isVerb = (c: Cand | undefined): boolean => !!c && (c.pos === 'VERB' || c.pos === 'AUX');
const isFin = (c: Cand | undefined): boolean => isVerb(c) && vals(c, 'VerbForm').length === 1 && vals(c, 'VerbForm')[0] === 'Fin';
const isInf = (c: Cand | undefined): boolean => isVerb(c) && vals(c, 'VerbForm').includes('Inf');
const isHead = (c: Cand | undefined): boolean => !!c && (c.pos === 'NOUN' || c.pos === 'PROPN' || (c.pos === 'PRON' && !!c.morph.Case && !(c.morph.Gender && !c.morph.Person && vals(c, 'Number').includes('Sing') && c.lemma !== 'он' && c.lemma !== 'она' && c.lemma !== 'оно')));
const isModifier = (c: Cand | undefined): boolean => !!c && !!c.morph.Case && c.morph.Variant !== 'Short' && (c.pos === 'ADJ' || c.pos === 'DET' || c.pos === 'NUM' || (isVerb(c) && vals(c, 'VerbForm').includes('Part')) || (c.pos === 'PRON' && !c.morph.Person && !!c.morph.Gender));

const LABEL: Partial<Record<Rel, (h: string) => string>> = {
  nsubj: (h) => `subject of «${h}»`, obj: (h) => `direct object of «${h}»`, iobj: (h) => `indirect object (the one it is given to or done for) of «${h}»`,
  obl: (h) => `adverbial phrase of «${h}» (place, time, instrument, manner)`, nmod: (h) => `noun phrase that modifies «${h}»`, amod: (h) => `adjective describing «${h}»`,
  det: (h) => `determiner of «${h}»`, nummod: (h) => `number of «${h}»`, case: (h) => `preposition of «${h}»`, xcomp: (h) => `infinitive that «${h}» takes`,
  advmod: (h) => `adverb or negation of «${h}»`, cc: (h) => `conjunction before «${h}»`, conj: (h) => `coordinated with «${h}»`, mark: (h) => `word that introduces the clause of «${h}»`,
  ccomp: (h) => `clause that «${h}» takes`, advcl: (h) => `adverbial clause or participle of «${h}»`, root: () => 'the main word of the sentence',
};

/** The shallow dependency relations of one sentence, or undefined when it has no word with a reading. */
export function ruSyntax(tokens: RawToken[], analyses: AnalyzedToken[]): SyntaxAnalysis | undefined {
  const n = tokens.length;
  const top = (i: number): Cand | undefined => (tokens[i]?.isWord ? analyses[i]?.candidates[0] : undefined);
  const word = (i: number): boolean => i >= 0 && i < n && tokens[i].isWord;
  const key = (i: number): string => ruKey(tokens[i].surface);
  const surf = (i: number): string => tokens[i].surface;
  const wordIdx = tokens.map((t, i) => (t.isWord && analyses[i]?.candidates.length ? i : -1)).filter((i) => i >= 0);
  if (!wordIdx.length) return undefined;

  // clauses: stretches between sentence-internal punctuation
  const clause: number[] = [];
  let cl = 0;
  for (let i = 0; i < n; i++) { if (!tokens[i].isWord && /[,;:—–!?.…()]/.test(tokens[i].surface)) cl++; clause.push(cl); }

  const rels = new Map<number, SyntaxRelation>();
  const notes: string[] = [];
  const attach = (dep: number, head: number | undefined, relation: Rel, basis: string[], confidence: number, alternatives?: SyntaxAlternative[]): void => {
    if (rels.has(dep) || dep === head) return;
    const label = (LABEL[relation] ?? (() => RELATION_FALLBACK[relation] ?? relation))(head !== undefined ? surf(head) : '');
    rels.set(dep, { dependent: dep, ...(head !== undefined ? { head } : {}), relation, label, basis, confidence: Math.min(confidence, top(dep)?.unconfirmed ? 0.5 : 1), ...(alternatives?.length ? { alternatives } : {}), status: 'generated' });
  };

  // ── the verbs ──
  const finites = wordIdx.filter((i) => isFin(top(i)));
  const subordinate = (v: number): boolean => { for (let i = v - 1; i >= 0 && clause[i] === clause[v]; i--) if (tokens[i].isWord && (SUB_COMP.has(key(i)) || (top(i)?.pos === 'SCONJ'))) return true; return false; };
  let root = finites.find((v) => !subordinate(v) && !SUB_COMP.has(key(v)));
  root ??= finites[0];
  root ??= wordIdx.find((i) => isVerb(top(i)));
  root ??= wordIdx.find((i) => top(i)?.pos === 'ADJ' && top(i)?.morph.Variant === 'Short');
  root ??= wordIdx.find((i) => key(i) === 'нет' || key(i) === 'нету');
  if (root !== undefined) rels.set(root, { dependent: root, relation: 'root', label: LABEL.root!(''), basis: [isFin(top(root)) ? 'the first finite verb that does not open a subordinate clause' : 'the only predicate the rules found'], confidence: 0.7, status: 'generated' });
  else notes.push('No verb or predicate was found, so the sentence has no main word.');

  // the verb a word belongs to: the finite verb of its clause, else the nearest verb, else the root
  const verbFor = (i: number): number | undefined => {
    const inClause = wordIdx.filter((j) => clause[j] === clause[i] && isVerb(top(j)) && j !== i);
    const fin = inClause.filter((j) => isFin(top(j)));
    if (fin.length) return fin.sort((a, b) => Math.abs(a - i) - Math.abs(b - i))[0];
    if (inClause.length) return inClause.sort((a, b) => Math.abs(a - i) - Math.abs(b - i))[0];
    return root !== undefined && root !== i ? root : undefined;
  };

  // ── noun phrases: heads, and the modifiers that agree with them ──
  const headOf = new Map<number, number>(); // modifier → its head
  const npStart = new Map<number, number>(); // head → first word of its phrase
  for (const h of wordIdx) {
    if (!isHead(top(h))) continue;
    let start = h;
    let right = h;
    for (let j = h - 1; word(j) && clause[j] === clause[h]; j--) {
      const c = top(j);
      if (!isModifier(c) || headOf.has(j)) break;
      if (!ruAgrees(c!, top(right)!)) break;
      headOf.set(j, h);
      start = j;
      right = j;
    }
    npStart.set(h, start);
  }
  for (const [m, h] of headOf) {
    const c = top(m)!;
    const rel: Rel = c.pos === 'NUM' ? 'nummod' : c.pos === 'DET' || c.pos === 'PRON' ? 'det' : 'amod';
    attach(m, h, rel, [`agrees with «${surf(h)}» in case, number and gender (${casesOf(c).map((x) => CASE_WORDS[x] ?? x).join(' or ')})`], 0.85);
  }

  // ── prepositions and their nouns ──
  const governedBy = new Map<number, number>(); // noun head → preposition
  for (const p of wordIdx) {
    const prep = ruPrepositionOf(key(p));
    if (!prep || !top(p) || top(p)!.pos !== 'ADP') continue;
    const h = wordIdx.find((j) => j > p && isHead(top(j)) && (npStart.get(j) ?? j) === p + 1) ?? (isHead(top(p + 1)) ? p + 1 : undefined);
    if (h === undefined) continue;
    const fits = casesOf(top(h)).filter((c) => [...prep.main, ...prep.minor].includes(c as 'Gen'));
    governedBy.set(h, p);
    attach(p, h, 'case', [`the preposition «${surf(p)}» takes the ${[...prep.main, ...prep.minor].map((c) => CASE_WORDS[c]).join(' or ')}`, fits.length ? `«${surf(h)}» is in a case it governs (${fits.map((c) => CASE_WORDS[c]).join(' or ')})` : `«${surf(h)}» is not in a case «${surf(p)}» governs: the reading may be wrong`], fits.length ? 0.85 : 0.5);
  }

  // ── the arguments of the verbs ──
  const claimedSubject = new Set<number>();
  for (const v of finites) {
    const vc = top(v)!;
    const noms = wordIdx.filter((j) => isHead(top(j)) && clause[j] === clause[v] && !governedBy.has(j) && casesOf(top(j)).includes('Nom') && !headOf.has(j) && !rels.has(j));
    const agreeing = noms.filter((j) => verbAgrees(vc, top(j)!));
    const pick = (agreeing.length ? agreeing : noms).find((j) => !claimedSubject.has(j));
    if (pick !== undefined && !(vc.morph.Mood === 'Imp')) {
      const alts: SyntaxAlternative[] = [];
      const c = top(pick)!;
      if (casesOf(c).includes('Acc')) alts.push({ head: v, relation: 'obj', confidence: 0.4, why: 'the form is also accusative (nominative and accusative look alike), so it could be the object' });
      claimedSubject.add(pick);
      attach(pick, v, 'nsubj', ['a nominative in the same clause', agreeing.includes(pick) ? `agrees with «${surf(v)}» in ${vals(vc, 'Tense')[0] === 'Past' ? 'gender and number' : 'person and number'}` : `does not agree with «${surf(v)}» in every feature: the subject is not certain`], agreeing.includes(pick) ? 0.8 : 0.5, alts);
    }
  }
  for (const h of wordIdx) {
    if (rels.has(h) || headOf.has(h) || !isHead(top(h))) continue;
    const c = top(h)!;
    const cs = casesOf(c);
    const p = governedBy.get(h);
    const start = npStart.get(h) ?? h;
    const before = p !== undefined ? p - 1 : start - 1;
    const nounBefore = word(before) && isHead(top(before)) && clause[before] === clause[h] ? before : (word(before) && headOf.has(before) ? headOf.get(before) : undefined);
    const verb = verbFor(h);
    if (p !== undefined) {
      const alts: SyntaxAlternative[] = [];
      if (nounBefore !== undefined && verb !== undefined) alts.push({ head: verb, relation: 'obl', confidence: 0.4, why: `the prepositional phrase could belong to the verb «${surf(verb)}» instead of the noun before it` });
      if (nounBefore !== undefined && cs.includes('Gen')) attach(h, nounBefore, 'nmod', [`follows the noun «${surf(nounBefore)}» after the preposition «${surf(p)}»`], 0.5, alts);
      else if (verb !== undefined) attach(h, verb, 'obl', [`the noun of the prepositional phrase «${surf(p)} …»; attaches to the verb of its clause`], 0.65, nounBefore !== undefined ? [{ head: nounBefore, relation: 'nmod', confidence: 0.4, why: `it could modify the noun «${surf(nounBefore)}» before the preposition` }] : []);
      continue;
    }
    if (cs.includes('Gen') && !cs.includes('Nom') && nounBefore !== undefined && !(isVerb(top(before)))) {
      attach(h, nounBefore, 'nmod', [`a genitive right after the noun «${surf(nounBefore)}» says whose it is or what kind`], 0.7, verb !== undefined ? [{ head: verb, relation: 'obl', confidence: 0.3, why: 'a genitive can also depend on the verb (negation, quantity)' }] : []);
      continue;
    }
    if (verb === undefined) continue;
    if (cs.length === 1 && cs[0] === 'Gen' && (key(verb) === 'нет' || key(verb) === 'нету' || (key(verb) === 'было' && word(verb - 1) && key(verb - 1) === 'не'))) attach(h, verb, 'nsubj', ['the genitive of negation names what is absent (the logical subject of нет)'], 0.65);
    else if (cs.length === 1 && cs[0] === 'Acc') attach(h, verb, 'obj', [`the accusative names what «${surf(verb)}» acts on`], 0.7);
    else if (cs.length === 1 && cs[0] === 'Dat') attach(h, verb, 'iobj', [`the dative names the one the action is for or given to`], 0.65);
    else if (cs.length === 1 && cs[0] === 'Ins') {
      if (COPULAS.has(top(verb)?.lemma ?? '')) attach(h, verb, 'xcomp', [`the instrumental after «${surf(verb)}» says what the subject is or becomes`], 0.65);
      else attach(h, verb, 'obl', ['an instrumental with no preposition: the instrument, manner or agent'], 0.55);
    } else if (cs.length === 1 && cs[0] === 'Gen') attach(h, verb, 'obl', ['a genitive with no noun before it: negation, quantity or a verb that takes the genitive'], 0.45);
    else if (cs.length > 1) {
      const alts: SyntaxAlternative[] = cs.filter((x) => x !== 'Nom').map((x): SyntaxAlternative => ({ head: verb, relation: x === 'Acc' ? 'obj' : x === 'Dat' ? 'iobj' : 'obl', confidence: 0.3, why: `the form could be ${CASE_WORDS[x] ?? x}` }));
      notes.push(`«${surf(h)}» has more than one case reading and the rules could not choose.`);
      void alts;
    }
  }

  // ── infinitives, clauses, adverbials ──
  for (const i of wordIdx) {
    const c = top(i);
    if (!c || rels.has(i)) continue;
    if (isInf(c)) {
      let j = i - 1;
      if (word(j) && NEG.has(key(j))) j--;
      const taker = word(j) && (INF_WORDS.has(key(j)) || (isVerb(top(j)) && INF_TAKERS.has(top(j)?.lemma ?? '')) || (top(j)?.lemma === 'быть' && vals(top(j), 'Tense').includes('Fut'))) ? j : undefined;
      if (taker !== undefined) attach(i, taker, 'xcomp', [`«${surf(taker)}» takes an infinitive`], 0.8);
      else if (root !== undefined && root !== i) attach(i, root, 'xcomp', ['an infinitive with no modal word before it: attached to the main verb as a guess'], 0.4);
    } else if (isVerb(c) && vals(c, 'VerbForm').includes('Conv')) {
      const v = verbFor(i);
      if (v !== undefined) attach(i, v, 'advcl', ['an adverbial participle names a second action of the same subject'], 0.6);
    } else if (isFin(c) && i !== root) {
      const sc = wordIdx.find((j) => j < i && clause[j] === clause[i] && (SUB_COMP.has(key(j)) || top(j)?.pos === 'SCONJ'));
      const before = root !== undefined && root < i ? root : root;
      if (before !== undefined) {
        attach(i, before, sc !== undefined && SUB_COMP.has(key(sc)) ? 'ccomp' : sc !== undefined ? 'advcl' : 'conj', [sc !== undefined ? `introduced by «${surf(sc)}»` : 'another finite verb in the sentence'], 0.5);
        if (sc !== undefined) attach(sc, i, 'mark', [`«${surf(sc)}» opens the clause of «${surf(i)}»`], 0.7);
      }
    }
  }
  for (const i of wordIdx) {
    const c = top(i);
    if (!c || rels.has(i)) continue;
    const k = key(i);
    if (NEG.has(k) && c.pos === 'PART') {
      const t = wordIdx.find((j) => j > i && clause[j] === clause[i] && (isVerb(top(j)) || top(j)?.pos === 'ADJ' || top(j)?.pos === 'ADV' || top(j)?.pos === 'NOUN'));
      if (t !== undefined) attach(i, t, 'advmod', [`negation: «${surf(i)}» stands before the word it negates`], 0.7);
    } else if (COORD.has(k) && (c.pos === 'CONJ')) {
      const next = wordIdx.find((j) => j > i && clause[j] >= clause[i] && clause[j] - clause[i] <= 1);
      const prevNp = [...wordIdx].reverse().find((j) => j < i && !headOf.has(j));
      if (next !== undefined && prevNp !== undefined) {
        const nextHead = headOf.get(next) ?? next;
        const sameKind = isHead(top(nextHead)) === isHead(top(prevNp)) && (isVerb(top(nextHead)) === isVerb(top(prevNp)));
        if (sameKind) { attach(i, nextHead, 'cc', [`«${surf(i)}» joins «${surf(prevNp)}» and «${surf(nextHead)}»`], 0.6); attach(nextHead, prevNp, 'conj', [`coordinated with «${surf(prevNp)}» by «${surf(i)}»`], 0.5); }
      }
    } else if (c.pos === 'ADV') {
      const v = verbFor(i);
      if (v !== undefined) attach(i, v, 'advmod', ['an adverb in the clause of this verb'], 0.5);
    }
  }

  const unattached = wordIdx.filter((i) => !rels.has(i));
  if (unattached.length) notes.push(`Not attached by the rules: ${unattached.slice(0, 8).map((i) => `«${surf(i)}»`).join(', ')}${unattached.length > 8 ? ' …' : ''}.`);
  notes.push('These relations come from local rules over the first reading of each word, not from a parser.');
  return {
    languageId: 'ru', analyzer: RU_SYNTAX_ANALYZER, tokens: tokens.map((t) => t.surface),
    relations: [...rels.values()].sort((a, b) => a.dependent - b.dependent),
    notes, attached: Math.round((100 * (wordIdx.length - unattached.length)) / wordIdx.length) / 100,
  };
}

const RELATION_FALLBACK: Partial<Record<Rel, string>> = {};
