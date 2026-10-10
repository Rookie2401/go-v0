/**
 * Measured floors for the gold tests (Linguistic Engine V2, Stage 8), 2026-10-10: each is the number scripts/gold-score.mts measured that day,
 * rounded down two points (conflictMax: rounded up two points). The gold labels are AI-judged and unreviewed (no native speaker), so a floor
 * guards against regression against an AI annotator; it is not a target and not a certificate of correctness. Never tune the engine to the gold set.
 * Regenerate only by re-measuring (npx vite-node --config scripts/vite.config.ts scripts/gold-score.mts --report), never by editing a number to make a test pass.
 */
export interface SetFloor { lemma: number; pos: number; f1: number; conflictMax: number }
export interface LangFloor { dev: SetFloor; hard: SetFloor; tokenAligned: number; roundTrip: number; dictHit: number; definition: number }
export const FLOORS: Record<string, LangFloor> = {
  "sq": {
    "dev": {
      "lemma": 0.92,
      "pos": 0.87,
      "f1": 0.84,
      "conflictMax": 0.04
    },
    "hard": {
      "lemma": 0.8,
      "pos": 0.83,
      "f1": 0.81,
      "conflictMax": 0.05
    },
    "tokenAligned": 0.98,
    "roundTrip": 0.87,
    "dictHit": 0.93,
    "definition": 0.98
  },
  "es": {
    "dev": {
      "lemma": 0.93,
      "pos": 0.91,
      "f1": 0.87,
      "conflictMax": 0.02
    },
    "hard": {
      "lemma": 0.96,
      "pos": 0.9,
      "f1": 0.94,
      "conflictMax": 0.04
    },
    "tokenAligned": 0.98,
    "roundTrip": 0.96,
    "dictHit": 0.98,
    "definition": 0.98
  },
  "de": {
    "dev": {
      "lemma": 0.94,
      "pos": 0.95,
      "f1": 0.8,
      "conflictMax": 0.04
    },
    "hard": {
      "lemma": 0.93,
      "pos": 0.92,
      "f1": 0.88,
      "conflictMax": 0.04
    },
    "tokenAligned": 0.98,
    "roundTrip": 0.93,
    "dictHit": 0.97,
    "definition": 0.97
  },
  "hi": {
    "dev": {
      "lemma": 0.92,
      "pos": 0.88,
      "f1": 0.8,
      "conflictMax": 0.04
    },
    "hard": {
      "lemma": 0.96,
      "pos": 0.75,
      "f1": 0.9,
      "conflictMax": 0.05
    },
    "tokenAligned": 0.98,
    "roundTrip": 0.78,
    "dictHit": 0.96,
    "definition": 0.98
  },
  "th": {
    "dev": {
      "lemma": 0.82,
      "pos": 0.71,
      "f1": 0,
      "conflictMax": 0.02
    },
    "hard": {
      "lemma": 0.61,
      "pos": 0.5,
      "f1": 0,
      "conflictMax": 0.07
    },
    "tokenAligned": 0.89,
    "roundTrip": 0,
    "dictHit": 0.82,
    "definition": 0.83
  },
  "nb": {
    "dev": {
      "lemma": 0.94,
      "pos": 0.97,
      "f1": 0.74,
      "conflictMax": 0.05
    },
    "hard": {
      "lemma": 0.7,
      "pos": 0.82,
      "f1": 0.67,
      "conflictMax": 0.16
    },
    "tokenAligned": 0.98,
    "roundTrip": 0.95,
    "dictHit": 0,
    "definition": 0
  },
  "nn": {
    "dev": {
      "lemma": 0.84,
      "pos": 0.93,
      "f1": 0.83,
      "conflictMax": 0.05
    },
    "hard": {
      "lemma": 0.66,
      "pos": 0.8,
      "f1": 0.76,
      "conflictMax": 0.06
    },
    "tokenAligned": 0.98,
    "roundTrip": 0.8,
    "dictHit": 0,
    "definition": 0
  }
};
