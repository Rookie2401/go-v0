/**
 * GoLearn evidence policy — the single place where assistance discounts, modality rules and level
 * thresholds live (ARCHITECTURE §8). Nothing here is a grade: help lowers how much a view counts as
 * evidence, it never subtracts. Every weight is > 0.
 *
 * ── Reading weight by assistance level (0 none … 5 English rescue) ──
 *   0 none 1.00 · 1 gloss 0.85 · 2 phrase 0.65 · 3 morphology 0.45 · 4 sentence explanation 0.30 · 5 rescue 0.15
 *
 * ── Listening weight ── base 1.0 × speed × replays × reveals (floor 0.05, always positive)
 *   speed   : <1.0 scales linearly from 0.6 (at ≤0.7x) to 1.0 (at 1.0x); >1.0 gains up to +10 % (cap 1.1)
 *   replays : 1 - 0.15 per replay, floor 0.5
 *   transcript shown ×0.6 · translation revealed ×0.25
 *
 * ── Production weight ── independent 1.0 > self-repaired 0.8 > assisted 0.4 > copied 0.2
 *
 * ── Levels (per dimension; evidence = Σ weights, unassisted/assisted = encounter counts) ──
 *  reading & listening (receptive; the top level reachable is `rapid`):
 *    unseen               no encounter
 *    encountered          any encounter
 *    recognized_with_help evidence ≥ 1.5
 *    recognized           evidence ≥ 3.0 AND unassisted ≥ 2
 *    rapid                evidence ≥ 8.0 AND unassisted ≥ 5
 *  writing & speaking (productive):
 *    unseen               no production
 *    used_with_assistance any production evidence (assisted / copied only, or not yet independent)
 *    used_independently   unassisted ≥ 1 AND evidence ≥ 0.8   (independent and self-repaired count as unassisted)
 *    automatic            evidence ≥ 4.0 AND unassisted ≥ 3
 *
 * ── Coverage bands (soft, lexical only) ──
 *   known ≥ 0.95 comfortable · ≥ 0.88 productive-challenge · ≥ 0.75 difficult · else stretch
 */
import type { AssistanceLevel, ComfortBand, EvidencePolicy, LearnerLevel, ProductionKind } from '../core';
import { LEVEL_ORDER } from '../core';

export const READING_WEIGHTS: readonly number[] = [1.0, 0.85, 0.65, 0.45, 0.3, 0.15];

export const PRODUCTION_WEIGHTS: Record<ProductionKind, number> = {
  independent: 1.0,
  'self-repaired': 0.8,
  assisted: 0.4,
  copied: 0.2,
};

export const LEVEL_THRESHOLDS = {
  receptive: {
    recognizedWithHelp: { evidence: 1.5 },
    recognized: { evidence: 3.0, unassisted: 2 },
    rapid: { evidence: 8.0, unassisted: 5 },
  },
  productive: {
    usedIndependently: { evidence: 0.8, unassisted: 1 },
    automatic: { evidence: 4.0, unassisted: 3 },
  },
} as const;

export const BAND_THRESHOLDS = { comfortable: 0.95, productiveChallenge: 0.88, difficult: 0.75 } as const;

/** Reference evidence at which an item is roughly "recognized"; only used to rank prerequisites. */
export const RECOGNIZED_EVIDENCE_REF = LEVEL_THRESHOLDS.receptive.recognized.evidence;

/** A lemma link is only used to build lemma knowledge when the analysis is at least this confident (or human). */
export const LEMMA_MIN_CONFIDENCE = 0.5;
/** tokenSupport flags an analysis as `uncertain` below this confidence (or when alternatives exist). */
export const UNCERTAIN_BELOW = 0.6;

/**
 * Production encounters are stored as `Encounter`s whose `assistance` field encodes the production kind
 * (the contract has no `productionKind` column): independent 0 · self-repaired 1 · assisted 3 · copied 5.
 * TODO(contract): add `productionKind?: ProductionKind` to Encounter and drop this encoding.
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

function receptiveLevel(evidence: number, unassisted: number, assisted: number): LearnerLevel {
  if (evidence <= 0 && unassisted <= 0 && assisted <= 0) return 'unseen';
  const t = LEVEL_THRESHOLDS.receptive;
  if (evidence >= t.rapid.evidence && unassisted >= t.rapid.unassisted) return 'rapid';
  if (evidence >= t.recognized.evidence && unassisted >= t.recognized.unassisted) return 'recognized';
  if (evidence >= t.recognizedWithHelp.evidence) return 'recognized_with_help';
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
  level(dimension, evidence, unassisted, assisted) {
    const e = round6(evidence);
    return dimension === 'reading' || dimension === 'listening'
      ? receptiveLevel(e, unassisted, assisted)
      : productiveLevel(e, unassisted, assisted);
  },
};

/** Soft confidence belief from accumulated evidence: e / (e + 2). A belief, not a grade. */
export function confidenceFor(evidence: number): number {
  if (evidence <= 0) return 0;
  return Math.round((evidence / (evidence + 2)) * 1e4) / 1e4;
}

export function bandFor(knownLexicalCoverage: number): ComfortBand {
  if (knownLexicalCoverage >= BAND_THRESHOLDS.comfortable) return 'comfortable';
  if (knownLexicalCoverage >= BAND_THRESHOLDS.productiveChallenge) return 'productive-challenge';
  if (knownLexicalCoverage >= BAND_THRESHOLDS.difficult) return 'difficult';
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
