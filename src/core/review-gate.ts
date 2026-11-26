/**
 * The REVIEW GATE, language-neutral. A reading may become a GoReview card only when four things hold; this file states them once, for any
 * language, over what the caller hands in. It imports nothing (not the core barrel), so an adapter of any language can import this file alone.
 *
 *   (a) REAL HEADWORD   the reading's headword is a listed entry of the pack's lexicon or dictionary, confirmed: not a fragment of a split,
 *                       not an unlisted name, not an unattested compound (`listed` says; an `unconfirmed` reading never passes);
 *   (b) A MEANING       the reading has an English gloss;
 *   (c) DECIDED         the reading is not the undecided reading of a homonym set (`undecided`), is not below the credit floor, and has no
 *                       creditable rival of ANOTHER headword within `band` of its confidence (a two-sided form: both sides are held);
 *   (d) NOT KNOWN-WRONG the written form is not on the pack's known-limits list (`known`: surfaces the pack records as wrongly read).
 *
 * A reading that fails is MARKED, not removed: `notes.reviewStatus = 'requires-review'`, `notes.reviewReason` = one plain sentence a person can
 * read, `notes.reviewKind` (a ReviewKind: what kind of hold), `notes.reviewRivals` (string[]: the other headwords in play for 'two-words', best first) and `notes.reviewGate = 'yes'` (this gate made the mark; the parser and the page scan then credit such a reading to its written form,
 * not to a lemma, so no lemma unit is put on the way to a deck). The reading itself stays on the card. The engine's own rule refuses a
 * `requires-review` analysis (repository-engine eligibility.ts; GoReview's intake and pack facts read the same note through `statusOf`).
 * It is `requires-review` and never `conflicted`: `conflicted` is for sources that disagree.
 *
 * A pack may write reviewStatus + reviewReason + reviewKind WITHOUT reviewGate (not drilled, the lemma still credited: 'meaning-unreviewed') or WITH it (not drilled, credited to the form only: every kind this file writes, and 'other-variety').
 * The kinds this file never writes ('meaning-unreviewed', 'other-variety', and the stricter tests' two) are for packs and later switches.
 * Pure apart from writing those notes. Idempotent: a reading already marked by this gate is not marked again.
 */

/** The members of an analysis candidate the gate reads (every adapter's candidate has them). */
export interface GateCandidate {
  lemma?: string;
  pos?: string;
  gloss?: string;
  confidence: number;
  unconfirmed?: boolean;
  notes?: Record<string, unknown>;
}

export interface ReviewGateOptions<C extends GateCandidate> {
  /** (a) Is this reading's headword a listed entry of the lexicon or dictionary? */
  listed(candidate: C): boolean;
  /** (c) Is this the undecided reading of a homonym set (the reading that stands for several words)? Default: no. */
  undecided?(candidate: C): boolean;
  /** (c) Are these two readings the same headword (so not rivals)? Default: same lemma and same part of speech. */
  sameHeadword?(a: C, b: C): boolean;
  /** (c) Readings this close in confidence compete. The Repository's own number is 0.15. */
  band: number;
  /** (c) A reading below this is not made a card (a language may set it above the parser's own credit floor, as Korean does: fitted on a development half, docs/korean/DECK-AUDIT.md). */
  floor: number;
  /** (c) The parser's own credit floor (LEMMA_MIN_CONFIDENCE, 0.5): a rival below it is not a creditable side. Default: `floor`. */
  creditFloor?: number;
  /** (d) Why this written form is on the pack's known-limits list, or undefined when it is not. */
  known?(surface: string, candidate: C): string | undefined;
  /**
   * (c') Hold a reading when ANY other candidate of the token names a different headword that is a listed word, at any confidence ('other-listed-word'). Off by default. A language turns it on
   * for a word read in a sentence; a lemma read alone has every look-alike entry of its spelling as a rival, so it is not for that.
   */
  otherListedWord?: boolean;
  /** The written form of the token the candidates belong to. */
  surface: string;
}

const same = (a: GateCandidate, b: GateCandidate): boolean => (a.lemma ?? '') === (b.lemma ?? '') && (a.pos ?? '') === (b.pos ?? '');

/** What kind of hold it is, so that a screen need not read the sentence. 'other-listed-word' and 'unwritten-copula' are for the stricter tests, if a language switches them on. */
export type ReviewKind = 'unlisted' | 'no-meaning' | 'undecided-entry' | 'two-words' | 'low-confidence' | 'known-limit' | 'other-listed-word' | 'unwritten-copula' | 'meaning-unreviewed' | 'other-variety';

export interface ReviewDecision { reason: string; kind: ReviewKind; /** the OTHER headwords in play (for 'two-words' and 'other-listed-word'), best first, as the candidates' lemma strings */ rivals?: string[] }

/** The first rule a reading fails: its kind, one plain sentence, and (for two words) the other headwords; undefined when it passes all four. */
export function reviewDecision<C extends GateCandidate>(candidate: C, all: readonly C[], o: ReviewGateOptions<C>): ReviewDecision | undefined {
  if (!candidate.lemma || candidate.unconfirmed || !o.listed(candidate)) return { kind: 'unlisted', reason: 'The headword is not a listed word of the lexicon (a fragment, a name or an unattested compound), so it is not made a card.' };
  if (!candidate.gloss || !candidate.gloss.trim()) return { kind: 'no-meaning', reason: 'The headword has no English meaning in the lexicon, so it is not made a card.' };
  if (candidate.confidence < o.floor) return { kind: 'low-confidence', reason: 'The reading is below the confidence a card needs, so it is not made a card.' };
  if (o.undecided?.(candidate)) return { kind: 'undecided-entry', reason: 'The spelling stands for several words and nothing in the sentence decides which, so it is not made a card.' };
  const sameWord = o.sameHeadword ?? same;
  const rivals = all.filter((r) => r !== candidate && !sameWord(r, candidate) && !!r.lemma && !r.unconfirmed && r.confidence >= (o.creditFloor ?? o.floor) && Math.abs(r.confidence - candidate.confidence) <= o.band)
    .sort((x, y) => y.confidence - x.confidence);
  if (rivals.length) {
    const names = [...new Set(rivals.map((r) => r.lemma!))];
    return { kind: 'two-words', rivals: names, reason: `The form can be read as two different words (${candidate.lemma} or ${names[0]}) and the sentence does not settle which, so it is not made a card.` };
  }
  const known = o.known?.(o.surface, candidate);
  if (known) return { kind: 'known-limit', reason: known };
  if (o.otherListedWord) {
    const others = all.filter((r) => r !== candidate && !sameWord(r, candidate) && !!r.lemma && !r.unconfirmed && o.listed(r)).sort((x, y) => y.confidence - x.confidence);
    if (others.length) {
      const names = [...new Set(others.map((r) => r.lemma!))];
      return { kind: 'other-listed-word', rivals: names, reason: `The word list also has another word this form could be (${names.join(', ')}); a review card is only made from a form with one possible word.` };
    }
  }
  return undefined;
}

/** The first rule a reading fails, as one plain sentence; undefined when it passes all four. */
export const reviewReason = <C extends GateCandidate>(candidate: C, all: readonly C[], o: ReviewGateOptions<C>): string | undefined => reviewDecision(candidate, all, o)?.reason;

/** Marks every reading of one token that fails the gate. Returns the marked readings. */
export function applyReviewGate<C extends GateCandidate>(candidates: readonly C[], o: ReviewGateOptions<C>): C[] {
  const marked: C[] = [];
  const top = Math.max(0, ...candidates.map((c) => c.confidence));
  for (const c of candidates) {
    // a reading more than `band` below the best can never be the one credited (the parser and the scan credit the best): it is not marked, and a lemma read alone keeps its own status
    if (c.confidence < top - o.band && c.notes?.reviewGate !== 'yes') continue;
    if (c.notes?.reviewGate === 'yes') { marked.push(c); continue; }
    if (c.notes?.reviewStatus === 'requires-review') continue; // already questioned by the adapter itself for its own reason: left as it is
    const d = reviewDecision(c, candidates, o);
    if (!d) continue;
    c.notes = { ...(c.notes ?? {}), reviewStatus: 'requires-review', reviewReason: d.reason, reviewGate: 'yes', reviewKind: d.kind, ...(d.rivals?.length ? { reviewRivals: d.rivals } : {}) };
    marked.push(c);
  }
  return marked;
}

/** True when this gate marked the reading: callers that credit a lemma (the parser, the page scan) credit the written form instead. */
export const heldByReviewGate = (c: { notes?: Record<string, unknown> } | undefined): boolean => c?.notes?.reviewGate === 'yes';
