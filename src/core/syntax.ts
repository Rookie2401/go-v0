/**
 * Contextual syntax (Linguistic Engine V2, Stage 4): shallow dependency relations between the words of ONE sentence, as an
 * adapter's rules can state them, with a plain-words explanation and the alternatives it could not rule out. Pure data.
 *
 * Honesty rules. A relation is `generated` by rules (never "verified" by itself); when the adapter cannot decide between
 * two heads or two relations it keeps both (`alternatives`) and says why in `basis`; a word it cannot attach has no
 * relation (the card then says "role unknown" rather than guessing). Relation names follow Universal Dependencies where a
 * UD label fits, so the gold sets (Stage 8) can be scored against UD treebanks; a language-specific label is allowed when UD
 * has none and is explained in `label`.
 */
export type DependencyRelation =
  | 'root' | 'nsubj' | 'obj' | 'iobj' | 'obl' | 'nmod' | 'amod' | 'det' | 'case' | 'aux' | 'cop' | 'mark' | 'advmod' | 'advcl'
  | 'acl' | 'ccomp' | 'xcomp' | 'conj' | 'cc' | 'nummod' | 'appos' | 'vocative' | 'discourse' | 'expl' | 'compound' | 'flat'
  | 'fixed' | 'clf' | 'punct' | 'dep';

export interface SyntaxAlternative {
  head?: number;
  relation: DependencyRelation;
  confidence: number;
  /** Why this reading stays possible, in plain words. */
  why: string;
}

export interface SyntaxRelation {
  /** Token index in the sentence (the adapter's tokenizer; the same indexes as `AnalyzedToken`). */
  dependent: number;
  /** Token index of the head; absent for the root. */
  head?: number;
  relation: DependencyRelation;
  /** The relation in plain words for a learner ("subject of 'lexon'", "the object this verb takes"). */
  label: string;
  /** Why the rule attached it here: the morphology or the word order it relied on, in plain words (never empty). */
  basis: string[];
  confidence: number;
  /** Readings the rules could not rule out, best first (the chosen one is not repeated). */
  alternatives?: SyntaxAlternative[];
  status: 'generated' | 'conflicted';
}

export interface ClauseSpan {
  start: number;
  end: number;
  kind: 'main' | 'subordinate' | 'relative' | 'coordinate' | 'quote';
  /** The token that introduces it (a conjunction, a relative pronoun), when one does. */
  marker?: number;
  label: string;
}

export interface SyntaxAnalysis {
  languageId: string;
  analyzer: string;
  /** The token surfaces in sentence order, so a card can name neighbours without the tokens. */
  tokens: string[];
  relations: SyntaxRelation[];
  clauses?: ClauseSpan[];
  /** Honest remarks about the whole sentence: unattached words, a word order the rules do not model, a sentence too long. */
  notes: string[];
  /** The share of word tokens that got a relation (0..1), so a coverage probe needs no recount. */
  attached: number;
}

/** The relation of one token, if it has one, with the head's surface filled in for a card. */
export function relationOf(a: SyntaxAnalysis | undefined, index: number): (SyntaxRelation & { headSurface?: string }) | undefined {
  const r = a?.relations.find((x) => x.dependent === index);
  if (!r) return undefined;
  return { ...r, ...(r.head !== undefined && a!.tokens[r.head] !== undefined ? { headSurface: a!.tokens[r.head] } : {}) };
}

/** The tokens that depend on `index` (the head's children), in sentence order. */
export function dependentsOf(a: SyntaxAnalysis | undefined, index: number): SyntaxRelation[] {
  return (a?.relations ?? []).filter((x) => x.head === index).sort((x, y) => x.dependent - y.dependent);
}

/** Plain-words names for the relation labels, for a card and the docs (a language adapter may override in `label`). */
export const RELATION_WORDS: Record<DependencyRelation, string> = {
  root: 'the main word of the sentence', nsubj: 'subject', obj: 'direct object', iobj: 'indirect object', obl: 'adverbial phrase (time, place, manner)',
  nmod: 'noun modifying a noun', amod: 'adjective describing a noun', det: 'determiner / article', case: 'preposition or case marker', aux: 'auxiliary verb',
  cop: 'copula (is / are)', mark: 'subordinating word', advmod: 'adverb', advcl: 'adverbial clause', acl: 'clause describing a noun', ccomp: 'clause as object',
  xcomp: 'open complement (infinitive)', conj: 'coordinated with', cc: 'coordinating conjunction', nummod: 'number', appos: 'apposition', vocative: 'addressed person',
  discourse: 'discourse particle', expl: 'expletive', compound: 'part of a compound', flat: 'part of a name or fixed sequence', fixed: 'fixed expression',
  clf: 'classifier', punct: 'punctuation', dep: 'attached, relation not decided',
};
