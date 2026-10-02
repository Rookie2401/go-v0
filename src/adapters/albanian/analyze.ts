/**
 * From tokens to analysed tokens: every context-free reading of each word (morphology.ts) as an `AnalysisCandidate`,
 * then the sentence layer (sentence.ts) orders and narrows them. Coordinator's file.
 *
 * What a candidate carries, beyond lemma, part of speech, features, gloss and confidence:
 *   notes.rule          how the form was read, in plain words
 *   notes.articulated   'yes' on an adjective, ordinal or possessive that stands after a linking article
 *   notes.governs       the case a preposition governs
 *   notes.lemmaStatus   'in the word list' | 'inferred by the rules' (the second also sets `unconfirmed`)
 *   notes.disputed      set when the adapter's own data and the UniParser analyzer disagree about this reading
 *                       (see scripts/sq-check-analyzer.mts): the reading is kept, at 0.55 at most, until someone has looked
 *   parts               the grammatical words inside one written token (ma = më + e)
 *   orthography         the Standard form a reading was made from, when the written form is not Standard spelling
 *   varieties           'aln', 'sq-pre1972', 'sq-ascii' … when the form is not Standard as it stands
 * The lemma of an articulated adjective is its citation form with the article ("i mirë"), with or without a unit.
 */
import type { AnalysisCandidate, AnalyzedToken, RawToken } from '../../core';
import { SQ_DISPUTED } from './disputed';
import { analyzeSqForm } from './morphology';
import { orderSqSentence } from './sentence';
import { sqCitation, type SqReading } from './types';

export const SQ_VERSION = '2';
export const SQ_ANALYZER = `adapter-sq@${SQ_VERSION}`;
export const SQ_SOURCE_IDS = {
  hand: `${SQ_ANALYZER}:hand`,
  rules: `${SQ_ANALYZER}:rules`,
  phrases: `${SQ_ANALYZER}:phrases`,
  constructions: `${SQ_ANALYZER}:constructions`,
} as const;

/** A reading the two sources disagree about is not presented as certain. */
export const DISPUTED_MAX_CONFIDENCE = 0.55;

export function toCandidate(form: string, r: SqReading): AnalysisCandidate {
  const notes: Record<string, string | string[]> = { rule: r.rule, lemmaStatus: r.lemmaKnown ? 'in the word list' : 'inferred by the rules' };
  if (r.origin === 'rule') notes.source = 'rule';
  if (r.articulated) notes.articulated = 'yes';
  if (r.governs) notes.governs = r.governs;
  if (r.relation) notes.relation = r.relation.rule;
  let confidence = r.confidence;
  if (r.lemmaKnown && SQ_DISPUTED.has(`${r.relation?.standard ?? form}\t${r.lemma.normalize('NFC').toLocaleLowerCase('sq')}`)) {
    notes.disputed = 'the word list and the UniParser analyzer differ on this reading';
    confidence = Math.min(confidence, DISPUTED_MAX_CONFIDENCE);
  }
  const c: AnalysisCandidate = {
    lemma: sqCitation(r.lemma, r.articulated), pos: r.pos, morph: { ...r.morph }, notes, confidence,
    origin: r.origin, sourceId: r.origin === 'hand' ? SQ_SOURCE_IDS.hand : SQ_SOURCE_IDS.rules,
  };
  if (r.gloss) c.gloss = r.gloss;
  if (r.role) c.role = r.role;
  if (r.parts?.length) c.parts = r.parts.map((p) => ({ ...p, ...(p.morph ? { morph: { ...p.morph } } : {}) }));
  if (r.varieties?.length) c.varieties = [...r.varieties];
  if (r.register?.length) c.register = [...r.register];
  if (r.relation) c.orthography = { modern: r.relation.standard, period: r.relation.period, confidence: r.relation.confidence };
  if (!r.lemmaKnown) c.unconfirmed = true;
  return c;
}

/** Context-free candidates of one normalized form, best first. */
export const sqCandidates = (form: string): AnalysisCandidate[] => analyzeSqForm(form).map((r) => toCandidate(form, r));

/** The adapter's `analyze`: context-free readings of every word, then the sentence layer. */
export function sqAnalyze(tokens: RawToken[]): AnalyzedToken[] {
  const base = tokens.map((t) => (t.isWord ? sqCandidates(t.normalized) : []));
  const ordered = orderSqSentence(tokens, base);
  return tokens.map((t, i) => ({ token: t, candidates: t.isWord ? ordered[i] : [], analyzer: SQ_ANALYZER }));
}
