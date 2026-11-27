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
import { koBareLemma, koEntryLemma, koSharedPos, lookupKoreanStem, type KoLexEntry } from './index-store';
import { PARTICLES } from './particles';
import { ENDINGS } from './endings';
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

/** The lexicon entry a reading names (its numbered or bare lemma string and class), or undefined. */
export function koEntryOf(lemma: string | undefined, pos: string | undefined): KoLexEntry | undefined {
  if (!lemma) return undefined;
  const bare = koBareLemma(lemma);
  for (const key of bare.length > 1 && bare.endsWith('다') ? [bare, bare.slice(0, -1)] : [bare]) {
    for (const hit of lookupKoreanStem(key)) {
      if (koEntryLemma(hit.entry) !== lemma && hit.entry.lemma !== lemma) continue;
      const shared = koSharedPos(hit.entry);
      if (!pos || shared === pos || (PREDICATE.has(pos) && !!shared && PREDICATE.has(shared))) return hit.entry;
    }
  }
  return undefined;
}

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

/** The priors-corpus count of a spelling (the lexicon's n, the largest over its entries): the count the sentence layer's rare-rival test reads. 0 = unseen. */
export function koLemmaCount(lemma: string | undefined): number {
  if (!lemma) return 0;
  const bare = koBareLemma(lemma);
  let n = 0;
  for (const key of bare.length > 1 && bare.endsWith('다') ? [bare, bare.slice(0, -1)] : [bare]) for (const h of lookupKoreanStem(key)) if (h.entry.lemma === bare) n = Math.max(n, h.entry.n ?? 0);
  return n;
}
/** The written forms an ending of the pack that attaches to the copula can have after 이 (or alone after a vowel): -(이)라, -(이)라고, -(이)라는, -(이)야 … (the endings table, pred 'C'). */
const COPULA_FORMS: ReadonlySet<string> = new Set(ENDINGS.filter((e) => e.pred.includes('C')).flatMap((e) => e.forms.filter((f) => f.attach === 'bare' && f.tail).flatMap((f) => [f.tail!, '이' + f.tail!])).concat(['이다']));
/** A reading made ONLY of function morphemes: the copula 이다 and endings or suffixes, no other stem. */
const functionOnly = (c: AnalysisCandidate): boolean => !!c.parts?.length && c.parts.every((p) => p.lemma === '이다' || p.kind === 'suffix') && c.parts.some((p) => p.lemma === '이다' || p.pos === 'ADP');
/** Every written form of every particle of the pack (은 는 이 가 을 를 에 의 도 만 와 과 …). */
export const PARTICLE_FORMS: ReadonlySet<string> = new Set(Object.values(PARTICLES).flatMap((p) => p.forms.map((f) => f.text)));
export const CLOSING = /[\p{Nd}A-Za-z'"\u2019\u201D)\]}\u3015\u300D\u300F\u3009\u300B%\uFF05>\uFF1E]$/u;

const GATE: Omit<ReviewGateOptions<AnalysisCandidate>, 'surface'> = {
  listed: (c) => koHeadwordListed(c.lemma, c.pos),
  undecided: (c) => c.notes?.homonym === 'undecided',
  // two readings of one headword (a noun and a counter of the same spelling) are not two sides: the meaning is the same word's
  sameHeadword: (a, b) => koBareLemma(a.lemma ?? '') === koBareLemma(b.lemma ?? ''),
  // (e) the entry has several really different senses and no hand override, own gloss or review mark decides the first meaning (the lexicon's `multi` flag)
  meaningUnreviewed: (c) => koEntryOf(c.lemma, c.pos)?.multi === true,
  band: KO_GATE_BAND,
  floor: KO_GATE_FLOOR,
  creditFloor: KO_CREDIT_FLOOR,
  // T-A': another listed word counts as a rival only if it is not rare by the pack's own test (count at least 30, or at least a quarter of the chosen headword's)
  rivalCount: (c) => koLemmaCount(c.lemma),
  rivalCommonAt: 30,
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
    // a particle that stands detached: its WHOLE form is a particle of the pack and it follows a closing quote or bracket, a number or Latin letters with no space (‘선’의, "책"은, UN의, 2025는)
    const prev = tokens[i - 1];
    const what = !prev || !(!prev.isWord || /^[A-Za-z]+$/u.test(prev.surface)) || t.start - prev.end > 1 || !CLOSING.test(prev.surface) ? undefined
      : PARTICLE_FORMS.has(t.surface) ? (Object.values(PARTICLES).find((p) => p.forms.some((f) => f.text === t.surface))?.tag === 'XSN' ? 'suffix' : 'particle')
        : COPULA_FORMS.has(t.surface) || a.candidates.some(functionOnly) ? 'copula with its ending' : undefined;
    if (what) {
      const reason = `Standing directly after a quotation mark, a bracket or a number, this is most likely the ${what} ${t.surface}, not a word of its own.`;
      for (const c of a.candidates) c.notes = { ...(c.notes ?? {}), reviewStatus: 'requires-review', reviewReason: reason, reviewGate: 'yes', reviewKind: 'other-listed-word' };
      return;
    }
    // T-A' (another listed word that is not rare could be meant) applies to a word read in a sentence, not to a lemma read alone (every look-alike of its spelling would hold it)
    applyReviewGate(a.candidates, { ...GATE, surface: t.surface, otherListedWord: words > 1 });
  });
}
