/**
 * Arabic shallow syntax: dependency relations between the words of ONE sentence, from the readings `analyze` and the sentence layer
 * gave (the first reading of each word). Rule based, deterministic, no data of its own; the vocabulary of core/syntax.ts (Universal
 * Dependencies). This is NOT a parser: it relates words that stand next to each other (or one word apart) by local rules and leaves every
 * other word without a relation.
 *
 * What it relates: a preposition to the noun it governs (`case`), the noun to the verb or noun before it (`obl` / `nmod`, with the other
 * choice kept as an alternative), the second term of a construct to the first (`nmod`), an adjective to its noun (`amod`), a demonstrative
 * (`det`), a number (`nummod`), a negation, future or aspect particle to its verb (`advmod`, `aux`), a subordinating particle (`mark`), a
 * subject and an object to their verb when the frame is plain (S V O; V S O; a pronoun before the verb), كَانَ to its predicate (`cop`), a
 * relative clause to its noun (`acl`), a conjunction to what it joins (`cc`). Every relation says what it relied on.
 *
 * MACHINE-DRAFTED; not reviewed by a native speaker or an Arabist.
 */
import type { AnalysisCandidate, AnalyzedToken, RawToken } from '../../core/adapters';
import type { DependencyRelation, SyntaxAlternative, SyntaxAnalysis, SyntaxRelation } from '../../core/syntax';
import * as G from './government';
import { ArSentence, arAdjectiveAgrees } from './sentence';
import { arKey } from './text';

export const AR_SYNTAX_ANALYZER = 'syntax-ar@1';
type Cand = AnalysisCandidate;
type Rel = DependencyRelation;

const LABEL: Partial<Record<Rel, (h: string) => string>> = {
  nsubj: (h) => `subject of «${h}»`, obj: (h) => `direct object of «${h}»`, obl: (h) => `adverbial phrase of «${h}» (place, time, means)`,
  nmod: (h) => `noun phrase that modifies «${h}» (the second term of a construct, or a prepositional phrase)`, amod: (h) => `adjective describing «${h}»`,
  det: (h) => `demonstrative of «${h}»`, nummod: (h) => `number of «${h}»`, case: (h) => `preposition of «${h}»`, advmod: (h) => `negation or adverb of «${h}»`,
  aux: (h) => `particle that sets the tense of «${h}»`, mark: (h) => `word that introduces the clause of «${h}»`, cop: (h) => `"to be" of «${h}»`,
  acl: (h) => `relative clause describing «${h}»`, cc: (h) => `conjunction before «${h}»`, root: () => 'the main word of the sentence',
};

const isVerb = (c: Cand | undefined): boolean => !!c && G.isFiniteVerb(c);
const isNounish = (c: Cand | undefined): boolean => !!c && (G.isPos(c, 'NOUN', 'PROPN') || (G.isPos(c, 'ADJ') && !!c.notes?.derivedFrom) || G.isPos(c, 'NUM'));
const kOf = (c: Cand | undefined): string => (c?.lemma ? arKey(c.lemma) : '');

/** The shallow dependency relations of one sentence, or undefined when it has no word with a reading. */
export function arSyntax(tokens: RawToken[], analyses: AnalyzedToken[]): SyntaxAnalysis | undefined {
  const n = tokens.length;
  const none = tokens.map(() => false);
  const s = new ArSentence(tokens, analyses.map((a) => a.candidates), none, none);
  const top = (i: number): Cand | undefined => (i >= 0 && i < n && tokens[i].isWord ? analyses[i]?.candidates[0] : undefined);
  const wordIdx = tokens.map((t, i) => (t.isWord && analyses[i]?.candidates.length ? i : -1)).filter((i) => i >= 0);
  if (!wordIdx.length) return undefined;
  const rels = new Map<number, SyntaxRelation>();
  const attach = (dep: number, head: number | undefined, relation: Rel, basis: string[], confidence: number, alternatives?: SyntaxAlternative[]): void => {
    if (rels.has(dep) || dep === head) return;
    const t = top(dep);
    const label = (LABEL[relation] ?? (() => relation))(head !== undefined ? tokens[head].surface : '');
    const conf = Math.min(confidence, t && t.confidence < 0.5 ? 0.5 : 1, t?.unconfirmed ? 0.4 : 1);
    rels.set(dep, { dependent: dep, ...(head !== undefined ? { head } : {}), relation, label, basis, confidence: Math.round(conf * 100) / 100, ...(alternatives?.length ? { alternatives } : {}), status: 'generated' });
  };
  const notes: string[] = ['Local rules over a window of one or two words, not a parser: words the rules cannot attach have no relation.'];
  const surf = (i: number): string => tokens[i].surface;

  for (const i of wordIdx) {
    const t = top(i);
    if (!t) continue;
    const j = s.next(i);
    const tj = j >= 0 ? top(j) : undefined;
    const k = j >= 0 ? s.next(j) : -1;

    // number → counted noun
    const nw = G.AR_NUMBER_WORDS[s.keys[i]];
    const bf = s.prev(i);
    if (nw && G.isPos(t, 'NUM', 'NOUN', 'ADJ') && !G.isTeenSecond(s.keys[i], bf >= 0 ? s.keys[bf] : undefined) && j >= 0 && s.any(j, G.isNominal) && (!(nw.kind === 'one' || nw.kind === 'two') || (G.AR_TEEN_UNITS.has(s.keys[i]) && G.AR_TEEN_KEYS.has(s.keys[j])))) {
      let last = i;
      let head = j;
      if (G.AR_TEEN_UNITS.has(s.keys[i]) && G.AR_TEEN_KEYS.has(s.keys[j]) && k >= 0 && s.any(k, G.isNominal)) { last = j; head = k; attach(j, k, 'nummod', ['the second word of 11–19 stands with its unit before the counted noun'], 0.55); }
      attach(i, head, 'nummod', ['a number before its counted noun'], 0.65);
      void last;
      continue;
    }
    // preposition → its noun
    const prep = G.AR_PREPOSITIONS.get(kOf(t));
    if (prep && G.isPos(t, 'ADP') && !G.hasSuffix(t) && j >= 0 && s.any(j, (c) => G.isNominal(c) || G.isPos(c, 'PRON', 'DET'))) {
      attach(i, j, 'case', [`the preposition «${surf(i)}» governs the genitive noun that follows`], t.confidence >= 0.5 && tj && isNounish(tj) ? 0.8 : 0.45);
      // the prepositional phrase belongs to the nearest verb to its left in the clause, or the nearest noun
      let v = -1, nn = -1;
      for (let b = s.prev(i); b >= 0; b = s.prev(b)) { if (isVerb(top(b)) && v < 0) v = b; else if ((isNounish(top(b)) || G.isPos(top(b)!, 'PRON')) && nn < 0) nn = b; }
      if (v >= 0 && v > nn) attach(j, v, 'obl', [`a prepositional phrase after the verb «${surf(v)}»`], 0.5, nn >= 0 ? [{ head: nn, relation: 'nmod', confidence: 0.35, why: 'it may also describe the noun before it' }] : undefined);
      else if (nn >= 0) attach(j, nn, 'nmod', [`a prepositional phrase after the noun «${surf(nn)}»`], 0.5, v >= 0 ? [{ head: v, relation: 'obl', confidence: 0.35, why: 'it may also belong to the verb' }] : undefined);
      continue;
    }
    // construct: second term → first term
    if (isNounish(t) && t.morph.Definite === 'Cons' && j >= 0 && s.effAll(j, (c) => G.isNominal(c) && (G.isDefinite(c) || (G.hasSuffix(c) && c.morph.Definite === 'Cons')) )) {
      attach(j, i, 'nmod', ['the second term of a construct: the first noun has no ال or tanwīn and a definite noun follows'], 0.7);
    }
    // demonstrative → its noun
    if (G.isDemonstrative(t) && j >= 0 && s.effAll(j, (c) => G.isNominal(c) && G.isDefinite(c))) attach(i, j, 'det', ['a demonstrative before a definite noun'], 0.7);
    // adjective → its noun
    if (tj && G.isPos(tj, 'ADJ') && isNounish(t) && !G.isPos(t, 'PROPN') && arAdjectiveAgrees(t, tj) && !(t.morph.Definite === 'Cons')) attach(j, i, 'amod', ['the adjective agrees with the noun before it in definiteness, gender and number'], 0.55);

    // particles → their verb
    if (j >= 0 && isVerb(tj)) {
      const key = kOf(t);
      if (G.isPos(t, 'PART', 'ADV', 'SCONJ', 'CONJ') && !G.hasSuffix(t)) {
        if (key in G.AR_NEGATION && key !== 'ما') attach(i, j, 'advmod', [`the negation «${surf(i)}» before its verb`], 0.75);
        else if (key === 'ما' && G.isPerfect(tj!)) attach(i, j, 'advmod', ['مَا before a perfect verb negates it'], 0.55);
        else if (key === 'قد' || key === 'سوف') attach(i, j, 'aux', [`«${surf(i)}» before the verb sets its meaning (perfect: has done; imperfect: may / will)`], 0.75);
        else if (G.AR_MOOD_PARTICLES[key]) attach(i, j, 'mark', [`«${surf(i)}» introduces a verb in the ${G.AR_MOOD_PARTICLES[key].moodWord}`], 0.65);
      }
    }
    // inna → its subject
    if (t.lemma && G.AR_INNA_LEMMAS.has(kOf(t)) && G.isPos(t, 'PART', 'SCONJ', 'CONJ') && j >= 0 && s.effAll(j, (c) => G.isNominal(c))) attach(i, j, 'mark', [`«${surf(i)}» is followed by its subject (accusative)`], 0.6);
    // kāna: cop of its predicate, subject of the predicate
    if (isVerb(t) && kOf(t) in G.AR_KANA_LEMMAS && !G.hasSuffix(t) && j >= 0 && k >= 0 && s.effAll(j, G.isNominal) && s.effAll(k, G.isNominal) && s.effAll(j, (c) => G.isDefinite(c) || G.hasSuffix(c))) {
      attach(i, k, 'cop', [`«${surf(i)}» links the subject «${surf(j)}» to its predicate «${surf(k)}»`], 0.6);
      attach(j, k, 'nsubj', [`the subject of «${surf(i)}» (nominative); the predicate is accusative`], 0.6);
    }
    // a relative pronoun: the verb after it is the relative clause of the noun before it
    if (G.isRelative(t) && kOf(t) === 'الذي' && isVerb(tj) && i > 0) {
      const ante = s.prev(i);
      if (ante >= 0 && isNounish(top(ante))) {
        attach(j, ante, 'acl', [`the clause after the relative «${surf(i)}» describes the noun «${surf(ante)}»`], 0.55);
        attach(i, j, 'nsubj', [`the relative pronoun is the subject of «${surf(j)}» (it may be its object: then a pronoun in the clause points back)`], 0.45, [{ head: j, relation: 'obj', confidence: 0.3, why: 'the relative pronoun may be the object' }]);
      }
    }
    // a conjunction → what it joins
    if (G.isPos(t, 'CONJ') && !G.hasSuffix(t) && j >= 0 && ['ثم', 'أو', 'بل', 'لكن', 'و', 'ف'].includes(kOf(t))) attach(i, j, 'cc', [`the conjunction «${surf(i)}» joins what follows to what came before`], 0.55);
  }

  // subjects and objects of verbs, where the frame is plain
  for (const i of wordIdx) {
    const t = top(i);
    if (!isVerb(t)) continue;
    const p = s.prev(i);
    const j = s.next(i);
    const k = j >= 0 ? s.next(j) : -1;
    const subj = (x: number): boolean => x >= 0 && !rels.has(x) && s.effAll(x, (c) => G.isNounLike(c) && !G.isPos(c, 'NUM'));
    // a pronoun before the verb is its subject
    if (p >= 0 && !rels.has(p) && G.isIndependentPronoun(top(p) as Cand)) { attach(p, i, 'nsubj', ['an independent pronoun before the verb is its subject'], 0.7); continue; }
    // S V O: a definite noun first in the clause, the verb, a definite noun
    if (p >= 0 && s.firstInClause(p) && subj(p) && s.effAll(p, (c) => G.isDefinite(c)) && !s.any(p, (c) => G.isFiniteVerb(c))) {
      attach(p, i, 'nsubj', ['a definite noun at the start of the clause, then the verb: the noun is its subject'], 0.55);
      if (subj(j) && j >= 0 && s.effAll(j, (c) => G.isDefinite(c))) attach(j, i, 'obj', ['a definite noun after the verb and its subject is the object'], 0.5);
      continue;
    }
    // V S O: verb first in the clause, two definite plain nouns
    if (s.firstInClause(i) && j >= 0 && k >= 0 && subj(j) && subj(k) && s.effAll(j, (c) => G.isPos(c, 'NOUN') && G.isDefinite(c)) && s.effAll(k, (c) => G.isPos(c, 'NOUN') && G.isDefinite(c))) {
      attach(j, i, 'nsubj', ['verb, subject, object: the first noun after the verb is its subject (the verb is singular)'], 0.6);
      attach(k, i, 'obj', ['verb, subject, object: the second noun is the object'], 0.6);
    }
  }
  // the main word: the first verb that is not a dependent, else nothing
  const rootAt = wordIdx.find((i) => isVerb(top(i)) && !rels.has(i));
  if (rootAt !== undefined) attach(rootAt, undefined, 'root', ['the first verb of the sentence that depends on nothing'], 0.5);

  const relations = [...rels.values()].sort((a, b) => a.dependent - b.dependent);
  const attached = relations.length / wordIdx.length;
  if (attached < 0.5) notes.push(`${wordIdx.length - relations.length} of ${wordIdx.length} words have no relation: this sentence is mostly beyond the rules.`);
  return { languageId: 'ar', analyzer: AR_SYNTAX_ANALYZER, tokens: tokens.map((t) => t.surface), relations, notes, attached: Math.round(attached * 100) / 100 };
}
