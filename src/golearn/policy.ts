/**
 * GoLearn evidence policy — `evidence@6` (stored item state is an incrementally updated AGGREGATE, agg.ts, instead of being re-derived from
 * every encounter on every fold; the numbers and rules below are unchanged from evidence@5, which added writing-system `orth` items and
 * decoding help (`DecodingRevealed`) on top of evidence@4's SCOPE of help, item-targeted vs sentence-level, and evidence@3's time-derived
 * sittings, version-pinned encounters, explicit completion). The single place where assistance discounts, modality rules and
 * level thresholds live (ARCHITECTURE §8, PLAN2 "Evidence policy v2"). Nothing here is a grade: help never
 * subtracts, it only limits how far an item can be credited.
 *
 * ── The four kinds of receptive (reading / listening) encounter ──
 *   exposure      the sentence was on screen / real speech was played, no help used, no demonstration
 *                 → counts in `exposures`; contributes 0 evidence; level capped at `encountered`.
 *   assisted      the learner used help on that item (gloss, phrase, morphology, sentence explanation, English
 *                 rescue; for listening: transcript or translation shown) → counts in `assisted`; contributes 0
 *                 evidence; level capped at `recognized_with_help`.
 *   demonstrated  the learner reported understanding ALL of the sentence (ComprehensionReported degree 'all') and
 *                 no help was used on that item in that sitting → evidence = readingWeight(0) = 1 (reading) or
 *                 listeningWeight(speed, replays) (listening; replays/slow speed discount it).
 *   (an explicit ItemMarked `known` is a demonstration of that one item and lives in `manualMark`, see state.ts)
 *   Production (writing / speaking) is always demonstration; weights below.
 *
 * ── Receptive levels (evidence = Σ demonstrated weights; units = distinct demonstrated (sentence, sitting)) ──
 *   unseen               no encounter at all
 *   encountered          any encounter (exposure or assisted) — the ceiling for exposure-only items
 *   recognized_with_help ≥ 2 assisted encounters, OR ≥ 1 demonstrated unit — the ceiling for assisted-only items
 *   recognized           demonstrated units ≥ 2 AND evidence ≥ 1.5   (two separate sentences or sittings)
 *   rapid                demonstrated units ≥ 5 AND evidence ≥ 4.0
 *  `defaultPolicy.level(dimension, evidence, units, assisted)` takes exactly those numbers; `units` for receptive
 *  dimensions is the count of demonstrated units, NOT the count of unassisted encounters (that one is only
 *  reported on DimensionState.unassisted).
 *
 * ── Productive levels (writing / speaking; evidence = Σ production weights, unassisted = independent + self-repaired) ──
 *   unseen               no production
 *   used_with_assistance any production evidence (assisted / copied only, or not yet independent)
 *   used_independently   unassisted ≥ 1 AND evidence ≥ 0.8
 *   automatic            evidence ≥ 4.0 AND unassisted ≥ 3
 *
 * ── Production weight ── independent 1.0 > self-repaired 0.8 > assisted 0.4 > copied 0.2
 * ── Listening weight ── base 1.0 × speed × replays × reveals (floor 0.05, always positive; only applied when the
 *    listening encounter is demonstrated)
 *   speed   : <1.0 scales linearly from 0.6 (at ≤0.7x) to 1.0 (at 1.0x); >1.0 gains up to +10 % (cap 1.1)
 *   replays : 1 - 0.15 per replay, floor 0.5
 *   transcript shown ×0.6 · translation revealed ×0.25 (such an encounter is `assisted`, so these only matter for the
 *   potential weight used to choose the better of two completions in one sitting)
 *
 * ── Writing-system items (evidence@6) ──
 *   A word token of a reading encounter also yields `orth` items (ids.orth(lang, feature): consonant class, vowel pattern, tone mark,
 *   tone rule …) from the adapter's decoding of the written form. They are folded exactly like other items (exposure on a view,
 *   assisted by help, demonstrated by a report) but only for READING encounters, and they never enter word coverage, vocabulary
 *   lists, recommendations or the word estimates. Opening the decoding of a word (`DecodingRevealed`) is item-targeted help (level 1)
 *   for the word's form and for each orth item of the decoding; the romanization rescue is kept on the encounter (`romanized`).
 *   `NoteOpened` is context and has no effect on evidence.
 *
 * ── The scope of help (since evidence@4) ──
 *   Help is evidence about WHAT the learner needed, so it only counts against what it was about:
 *   item-targeted   word gloss / phrase / grammar help (assistance 1–3): "he needed help with THIS item".
 *   sentence-level  sentence explanation / English rescue — including the whole-passage "Parallel English" (assistance 4–5):
 *                   "the English was shown for this sentence". It says nothing about any one word.
 *   Both make the encounter `assisted` (it can never demonstrate, weight 0, and it is not a help-free exposure), and both
 *   stay inside the (sentence, sitting) they were used in: they never touch encounters of other sentences or other sittings.
 *   They differ in one thing only — the estimate veto below. `Encounter.itemHelp` keeps the item-targeted part apart from
 *   `Encounter.assistance` (which is the max of both). A listening encounter with the transcript shown (assistance 2) counts as
 *   item-targeted (conservative); a translation reveal (5) is sentence-level.
 *
 * ── Estimate ("likely familiar", never "known") ──
 *   estimatedFamiliar = ≥ 4 help-free encounters (assistance 0; sentence-level-helped encounters are NOT help-free) in the
 *   dimension, across ≥ 2 distinct SITTINGS (derived from event time, see sitting.ts; never the UI's session id), AND no
 *   item-targeted help among the item's last 2 encounters (a sentence-level-helped encounter in that tail does NOT veto:
 *   it never withdraws an estimate earned help-free elsewhere), AND the item is not already `recognized`. Receptive dimensions only.
 *   Confidence for an estimate-only item is 0.30 (a cautious belief); otherwise e / (e + 2) of demonstrated evidence.
 *   Same evidence ⇒ same estimate: it is a pure function of the encounters, which are a pure function of the log.
 *
 * ── Coverage bands (soft, lexical only; computed from demonstrated + estimated coverage) ──
 *   ≥ 0.95 comfortable · ≥ 0.88 productive-challenge · ≥ 0.75 difficult · else stretch
 */
import type { AssistanceLevel, ComfortBand, EvidencePolicy, LearnerLevel, ProductionKind } from '../core';
import { LEVEL_ORDER } from '../core';

/** Version of the evidence rules; stored per user in `meta`. Bump whenever a rule above changes. */
export const POLICY_VERSION = 'evidence@6';

export const READING_WEIGHTS: readonly number[] = [1.0, 0.85, 0.65, 0.45, 0.3, 0.15];

export const PRODUCTION_WEIGHTS: Record<ProductionKind, number> = {
  independent: 1.0,
  'self-repaired': 0.8,
  assisted: 0.4,
  copied: 0.2,
};

export const LEVEL_THRESHOLDS = {
  receptive: {
    /** assisted encounters needed for `recognized_with_help` when nothing has been demonstrated yet */
    recognizedWithHelp: { assisted: 2, demonstratedUnits: 1 },
    recognized: { evidence: 1.5, demonstratedUnits: 2 },
    rapid: { evidence: 4.0, demonstratedUnits: 5 },
  },
  productive: {
    usedIndependently: { evidence: 0.8, unassisted: 1 },
    automatic: { evidence: 4.0, unassisted: 3 },
  },
} as const;

/** Estimate rule (receptive dimensions). */
export const ESTIMATE = { minUnassisted: 4, minSittings: 2, cleanTail: 2, confidence: 0.3 } as const;

export const BAND_THRESHOLDS = { comfortable: 0.95, productiveChallenge: 0.88, difficult: 0.75 } as const;

/** Reference demonstrated evidence at which an item is roughly "recognized"; only used to rank prerequisites. */
export const RECOGNIZED_EVIDENCE_REF = LEVEL_THRESHOLDS.receptive.recognized.evidence;

/** A lemma link is only used to build lemma knowledge when the analysis is at least this confident (or human). */
export const LEMMA_MIN_CONFIDENCE = 0.5;
/** tokenSupport flags an analysis as `uncertain` below this confidence (or when another reading competes with it). */
export const UNCERTAIN_BELOW = 0.6;
/**
 * Another reading competes when its confidence is within this margin of the chosen one. A reading the analyzer has
 * marked down (the neighbours decided against it: "la casa" is not a form of casar) is still listed on the word
 * sheet, but it no longer makes the chosen reading "possibly …".
 */
export const COMPETING_MARGIN = 0.2;

/** Recommendation: a text is a `reread` candidate when at least this share of the word encounters of its latest reading sitting needed help. */
export const HEAVY_HELP_FRACTION = 0.4;

/**
 * Production encounters are stored as `Encounter`s whose `assistance` field encodes the production kind
 * (also stored as `productionKind`): independent 0 · self-repaired 1 · assisted 3 · copied 5.
 * `Encounter.productionKind` is the authoritative kind; `assistance` is kept populated for weighting and as a fallback.
 */
export const PRODUCTION_ASSISTANCE: Record<ProductionKind, AssistanceLevel> = {
  independent: 0,
  'self-repaired': 1,
  assisted: 3,
  copied: 5,
};

export function productionKindOf(assistance: AssistanceLevel): ProductionKind {
  if (assistance <= 0) return 'independent';
  if (assistance <= 2) return 'self-repaired';
  if (assistance <= 4) return 'assisted';
  return 'copied';
}

/** Assistance recorded on a listening encounter: transcript visible = 2, translation revealed = 5. */
export const LISTEN_ASSISTANCE = { none: 0, transcript: 2, translation: 5 } as const;

const round6 = (n: number) => Math.round(n * 1e6) / 1e6;
const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

function receptiveLevel(evidence: number, units: number, assisted: number): LearnerLevel {
  if (evidence <= 0 && units <= 0 && assisted <= 0) return 'unseen';
  const t = LEVEL_THRESHOLDS.receptive;
  if (units >= t.rapid.demonstratedUnits && evidence >= t.rapid.evidence) return 'rapid';
  if (units >= t.recognized.demonstratedUnits && evidence >= t.recognized.evidence) return 'recognized';
  if (units >= t.recognizedWithHelp.demonstratedUnits || assisted >= t.recognizedWithHelp.assisted) return 'recognized_with_help';
  return 'encountered';
}

function productiveLevel(evidence: number, unassisted: number, assisted: number): LearnerLevel {
  if (evidence <= 0 && unassisted <= 0 && assisted <= 0) return 'unseen';
  const t = LEVEL_THRESHOLDS.productive;
  if (evidence >= t.automatic.evidence && unassisted >= t.automatic.unassisted) return 'automatic';
  if (evidence >= t.usedIndependently.evidence && unassisted >= t.usedIndependently.unassisted) return 'used_independently';
  return 'used_with_assistance';
}

export const defaultPolicy: EvidencePolicy = {
  readingWeight(assistance) {
    const i = clamp(Math.round(Number(assistance)), 0, READING_WEIGHTS.length - 1);
    return READING_WEIGHTS[i];
  },
  listeningWeight({ speed, replays, transcriptRevealed, translationRevealed }) {
    const s = Number.isFinite(speed) ? speed : 1;
    const speedF = s >= 1 ? Math.min(1.1, 1 + 0.4 * (s - 1)) : clamp(0.6 + (0.4 * (s - 0.7)) / 0.3, 0.6, 1);
    const replayF = Math.max(0.5, 1 - 0.15 * Math.max(0, replays));
    let w = speedF * replayF;
    if (transcriptRevealed) w *= 0.6;
    if (translationRevealed) w *= 0.25;
    return round6(Math.max(0.05, w));
  },
  productionWeight(kind) {
    return PRODUCTION_WEIGHTS[kind];
  },
  /**
   * Receptive: (demonstrated evidence, demonstrated units, assisted encounters).
   * Productive: (production evidence, unassisted productions, assisted productions).
   */
  level(dimension, evidence, unitsOrUnassisted, assisted) {
    const e = round6(evidence);
    return dimension === 'reading' || dimension === 'listening'
      ? receptiveLevel(e, unitsOrUnassisted, assisted)
      : productiveLevel(e, unitsOrUnassisted, assisted);
  },
};

/** Soft confidence belief from demonstrated evidence: e / (e + 2). A belief, not a grade. */
export function confidenceFor(evidence: number): number {
  if (evidence <= 0) return 0;
  return Math.round((evidence / (evidence + 2)) * 1e4) / 1e4;
}

export function bandFor(effectiveCoverage: number): ComfortBand {
  if (effectiveCoverage >= BAND_THRESHOLDS.comfortable) return 'comfortable';
  if (effectiveCoverage >= BAND_THRESHOLDS.productiveChallenge) return 'productive-challenge';
  if (effectiveCoverage >= BAND_THRESHOLDS.difficult) return 'difficult';
  return 'stretch';
}

export function levelIndex(level: string): number {
  const i = LEVEL_ORDER.indexOf(level as LearnerLevel);
  if (i < 0) throw new Error(`unknown learner level: ${level}`);
  return i;
}

export const levelAtLeast = (level: string, min: string) => levelIndex(level) >= levelIndex(min);

export function toLevel(level: string): LearnerLevel {
  return LEVEL_ORDER[levelIndex(level)];
}

/**
 * Stage readiness, reading pace and difficulty forecast: every threshold in one place. PROVISIONAL — chosen by the course
 * owner's brief (docs/PLAN5.md), not calibrated on learners. They produce advice and labelled estimates, never a gate.
 */
export const READINESS = {
  /** Below this many distinct sentences seen in the stage, or with fewer than `minSignalsWithData` signals holding data, the verdict is insufficient-data. */
  minSentencesSeen: 150,
  minSignalsWithData: 4,
  /** lexical-coverage: shown-understood + likely-familiar share of the stage's imported texts. */
  lexicalCoverage: 0.95,
  /** The window of recent sentences (by time) that lookup-rate, sentence-rescue-rate and decoding look at. */
  windowSentences: 300,
  /** The fewest sentences in that window for lookup-rate, sentence-rescue-rate and decoding to say anything. */
  minWindowSentences: 30,
  /** lookup-rate: lookups (word, phrase, grammar, decoding) per 100 words in the window, at most. */
  lookupsPer100Words: 4,
  /** sentence-rescue-rate: explanations / English shown per 100 sentences in the window, at most. */
  rescuesPer100Sentences: 5,
  /** reported-comprehension: share of reports 'all' or 'most', and the fewest reports that count. */
  reportedComprehension: { share: 0.8, minReports: 3 },
  /** unfamiliar-material: predicted coverage needed on unopened texts of the next stage, else of this stage. */
  unfamiliarNextStage: 0.9,
  unfamiliarSameStage: 0.95,
  /** retention: items first met at least `days` ago and met again within the last `days`; share without item-targeted help; fewest items. */
  retention: { days: 7, share: 0.85, minItems: 30 },
  /** decoding (pre-reader stage only): DecodingRevealed per 100 words in the window, at most; romanization rescues allowed in the last `romanizationWindow` sentences. */
  decoding: { revealedPer100Words: 10, romanizationRescues: 0, romanizationWindow: 100 },
  /** listening: only with reviewed real-speech evidence. Fewest heard sentences, and the listening coverage of the heard sentences needed. */
  listening: { minSentences: 30, coverage: 0.8 },
  /** reading pace: a words-per-minute figure needs this many timed sentences; the trend compares the last `sittings` sittings with the `sittings` before. */
  pace: { minTimedSentences: 30, minTimedPerSitting: 5, sittings: 3, change: 0.1 },
} as const;

/** Difficulty forecast: provisional constants. */
export const FORECAST = {
  /** A new word is "useful" when it occurs this often in the text plus the other texts of its work, or this often across every stored text. */
  usefulInWork: 2,
  usefulInLibrary: 3,
  /** Unanalysed words above this share of the text get their own line in `limits`. */
  unanalysedShare: 0.05,
  /** Fewer distinct word forms met than this ⇒ the estimate of what the learner knows rests on very little. */
  minHistoryForms: 50,
  /** A phrase is "weak" when its last this-many encounters needed item-targeted help. */
  weakPhraseTail: 2,
} as const;

/**
 * Personal difficulty (scoreProfile): the cut-offs that turn a measured share into "low / moderate / high". Coarse on purpose and
 * PROVISIONAL, like READINESS: they exist to say things in words, not to grade a text. For "higher is harder" measures a value up to
 * `low` is low, up to `moderate` is moderate, above is high.
 */
export const PERSONAL = {
  /** Coverage factor: at least `low` ⇒ low difficulty, at least `moderate` ⇒ moderate, else high. (Same cut-offs as the comfort bands.) */
  coverage: { low: BAND_THRESHOLDS.comfortable, moderate: BAND_THRESHOLDS.productiveChallenge },
  newShare: { low: 0.03, moderate: 0.08 },
  newPatterns: { low: 0, moderate: 2 },
  newPhraseShare: { low: 0.25, moderate: 0.6 },
  meanSentenceWords: { low: 12, moderate: 20 },
  subordinatorsPerSentence: { low: 0.5, moderate: 1 },
  subjunctiveShare: { low: 0.01, moderate: 0.04 },
  cliticShare: { low: 0.02, moderate: 0.06 },
  regionalShare: { low: 0.02, moderate: 0.08 },
  historicalShare: { low: 0, moderate: 0.05 },
  properNounShare: { low: 0.03, moderate: 0.08 },
  /** Domain familiarity: at least `low` ⇒ low difficulty, at least `moderate` ⇒ moderate, else high. */
  domain: { low: 0.8, moderate: 0.5 },
  unanalysedShare: { low: 0.02, moderate: 0.05 },
  // Structure that German (and any language whose analyses state it) adds. First guesses, not tuned on any learner.
  /** Share of the text's word tokens that are new compounds with a component he does not know (partial + opaque occurrences / words). */
  compoundPartsUnknownShare: { low: 0.01, moderate: 0.03 },
  /** Mean number of words between the two ends of a verb bracket (finite verb … participle, infinitive or separated prefix). */
  bracketDistance: { low: 2, moderate: 5 },
  genitiveShare: { low: 0.03, moderate: 0.07 },
  /** Per sentence. */
  passivePerSentence: { low: 0.1, moderate: 0.3 },
  relativePerSentence: { low: 0.2, moderate: 0.5 },
  participialPerSentence: { low: 0.05, moderate: 0.2 },
  nominalizationShare: { low: 0.03, moderate: 0.08 },
  /** Share of the words written in an older spelling. */
  olderSpellingShare: { low: 0, moderate: 0.05 },
  /** Share of words in a register layer beyond everyday usage (formal Sanskrit-derived words, biblical vocabulary …). */
  registerShare: { low: 0.1, moderate: 0.25 },
  /** "Little history": fewer than this share of the text's most frequent forms have ever been met. */
  historyTopForms: 50,
  historyMinShare: 0.2,
  /** Cap on the lists of weak items / new items carried in a ProfileScore. */
  listCap: 50,
  /** Variety tags that are not regional Spanish for the factor of that name. */
  historicalTag: 'es-hist',
} as const;

/** Library ranking weights and targets (provisional, coarse). Weights sum to 1. */
export const RANKING = {
  weights: { comprehensibility: 0.45, challenge: 0.05, interest: 0.15, reinforcement: 0.12, regional: 0.08, novelty: 0.08, quality: 0.07 },
  /** The coverage each `challenge` option asks for: the comprehensibility score PEAKS here, not at 100 %. */
  targetCoverage: { easy: 0.97, steady: 0.93, stretch: 0.88 },
  /** How far below the target the score falls to 0, and how gently it falls above it. */
  belowSpan: 0.3,
  aboveSlope: 1.5,
  /** The number of new constructions each option is comfortable with. */
  idealNewPatterns: { easy: 0, steady: 1, stretch: 3 },
  /** Weak items that make a text fully valuable as natural reinforcement. */
  reinforcementFull: 8,
  /** A candidate counts as authentic-and-comprehensible at this predicted coverage. */
  authenticComprehensible: 0.9,
  /** Controlled texts: their weight is multiplied by 1 - this x (share of authentic candidates that are comprehensible). */
  controlledFade: 0.7,
  /** Controlled and authentic texts within this coverage of each other are "of comparable comprehensibility". */
  comparableCoverage: 0.05,
  /** At most this many consecutive results from one work. */
  maxConsecutiveFromWork: 2,
  /** A result whose author equals the previous result's keeps this share of its score. */
  sameAuthorKeeps: 0.9,
  /** A part must contribute at least this much of the score to be told as a reason. */
  reasonMin: 0.04,
} as const;

/**
 * Rescue dependence (rescue.ts): provisional values, not calibrated on learners. A trend is stated only from
 * `minUnitsForTrend` sentence readings; a change counts when the later rate differs from the earlier one by `change`
 * (relative) and by at least `minAbsoluteChange` (per 100), so that 1 → 0 on a handful of sentences is not "falling".
 */
export const RESCUE = {
  minUnitsForTrend: 60,
  change: 0.25,
  minAbsoluteChange: 2,
} as const;
