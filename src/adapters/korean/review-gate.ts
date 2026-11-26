/**
 * The Korean side of the review gate (src/core/review-gate.ts holds the four rules; docs/korean/PLAN.md "The review gate"). It supplies what the
 * rules need: whether a headword is a listed entry of the stem lexicon, the undecided reading of a homonym set, the creditable band and floor, and the
 * known-limits list GENERATED from the common-word sweep's table (generated/known-limits.ts, by scripts/ko-known-limits.mts).
 *
 * `koReviewGate(tokens, analyses)` marks, in place, every reading that fails; the adapter calls it in ONE place (ko.ts `analyze`). A marked
 * reading stays on the GoLearn card and in Reading Analysis exactly as before; it is only not credited to a lemma and not drilled.
 */
import type { AnalysisCandidate, AnalyzedToken, RawToken } from '../../core';
import { applyReviewGate, type ReviewGateOptions } from '../../core/review-gate';
import { koBareLemma, koSharedPos, lookupKoreanStem } from './index-store';
import { KO_KNOWN_FRAME_NOUNS, KO_KNOWN_SURFACES } from './generated/known-limits';

/** Readings this close compete (the Repository's own number, packages/repository-linguistics/src/resolver.ts CLOSE). */
export const KO_GATE_BAND = 0.15;
/** The parser's credit floor (packages/golearn-extension/src/parser/index.ts LEMMA_MIN_CONFIDENCE): a rival below it is not a side. */
export const KO_CREDIT_FLOOR = 0.5;
/**
 * The floor for a CARD. Fitted on the FIRST half of the development sentences (docs/korean/DECK-AUDIT.md): readings at 0.60 (a non-standard form, a reading the sentence
 * demoted) were false in 57 % of the cards they made there, those at 0.84 and above in 2-3 %. Reported on the second half (61 % and 2 %): the cut holds.
 */
export const KO_GATE_FLOOR = 0.8;

const PREDICATE = new Set(['VERB', 'ADJ', 'AUX']);
const KNOWN = new Set(KO_KNOWN_SURFACES);
const FRAME_NOUNS = new Set(KO_KNOWN_FRAME_NOUNS);

/** Is this headword a listed entry (any lexicon installed: the compiled core, then the shards)? A predicate's stem is its headword without 다. */
export function koHeadwordListed(lemma: string | undefined, pos: string | undefined): boolean {
  if (!lemma) return false;
  const bare = koBareLemma(lemma);
  const keys = bare.length > 1 && bare.endsWith('다') ? [bare, bare.slice(0, -1)] : [bare];
  for (const key of keys) {
    for (const hit of lookupKoreanStem(key)) {
      if (hit.entry.lemma !== bare) continue;
      const shared = koSharedPos(hit.entry);
      // an auxiliary is a verb or an adjective of the lexicon (싶다 is listed as an adjective, 있다 as a verb): the predicate classes are one here
      if (!pos || shared === pos || (PREDICATE.has(pos) && !!shared && PREDICATE.has(shared))) return true;
    }
  }
  return false;
}

const GATE: Omit<ReviewGateOptions<AnalysisCandidate>, 'surface'> = {
  listed: (c) => koHeadwordListed(c.lemma, c.pos),
  undecided: (c) => c.notes?.homonym === 'undecided',
  // two readings of one headword (a noun and a counter of the same spelling) are not two sides: the meaning is the same word's
  sameHeadword: (a, b) => koBareLemma(a.lemma ?? '') === koBareLemma(b.lemma ?? ''),
  band: KO_GATE_BAND,
  floor: KO_GATE_FLOOR,
  creditFloor: KO_CREDIT_FLOOR,
  known: (surface, c) => {
    if (KNOWN.has(surface.normalize('NFC'))) return 'This written form is on the pack\'s list of forms it is known to read wrongly, so it is not made a card.';
    if (c.morph?.Particle && FRAME_NOUNS.has(koBareLemma(c.lemma ?? ''))) return 'This noun with a particle is on the pack\'s list of frames it is known to read wrongly, so it is not made a card.';
    return undefined;
  },
};

/** Marks, in place, the readings of each word token that fail the gate. Idempotent. */
export function koReviewGate(tokens: readonly RawToken[], analyses: readonly AnalyzedToken[]): void {
  const words = tokens.filter((t) => t.isWord).length;
  analyses.forEach((a, i) => {
    const t = tokens[i];
    if (!t?.isWord || !a.candidates.length) return;
    // T-A (another listed word could be meant, at any confidence) applies to a word read in a sentence, not to a lemma read alone (every look-alike of its spelling would hold it)
    applyReviewGate(a.candidates, { ...GATE, surface: t.surface, otherListedWord: words > 1 });
  });
}
