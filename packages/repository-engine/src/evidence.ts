/**
 * Evidence rules: how one learner event becomes zero or more observations about knowledge units.
 *
 * The table below is DATA (every number is documented in README.md); the branches in `observationsOf` only choose a
 * row of it. Principles encoded here (and tested as named invariants):
 *  (a) a lookup / click is exposure, never understanding;
 *  (b) playing audio is exposure, never listening recognition; and synthetic speech is never listening evidence either:
 *      a ListeningAssessed whose voice is not a recording credits nothing, whatever evidence note the producer attached
 *      (GoListen's own rule, docs/GOLISTEN.md; audit D8);
 *  (c) accepting a correction is not independent production (CorrectionAccepted / Rejected produce nothing);
 *  (d) assisted observations feed `assistedRecognition`, never the independent dimensions;
 *  (e) a producer's declared `evidence.quality` / `evidence.sourceReliability` can lower a weight, never raise it;
 *  (j) a positive observation exists only when the payload itself says correct / usedCorrectly / understood;
 *  (k) projection@2: a phrase is understood as a whole (`phraseComprehension`), never inferred from its words, and never from
 *      a request for help; and an encounter whose language was only detected or defaulted weighs less than a stated one
 *      (`LANGUAGE_BASIS_FACTOR`), while one whose language is undetermined (nothing was parsed) produces no observation.
 */
import type { Dimension, GoEvent } from '../../repository-contract/src';

export type ObservationOutcome = 'positive' | 'negative' | 'exposure';
/** What kind of exposure an exposure observation is (kept so lookups, assistance and playbacks can be counted). */
export type ExposureCounter = 'encounter' | 'lookup' | 'assistance' | 'playback';

export interface Observation {
  learnerId: string;
  languageId: string;
  unitId: string;
  dimension: Dimension;
  outcome: ObservationOutcome;
  /** Effective evidence weight 0..1 = kind ceiling x quality factor x source reliability. */
  weight: number;
  /** True when help (hint, gloss, shown answer, correction) was present; assisted evidence never reaches independent dimensions. */
  assisted: boolean;
  difficulty?: number;
  /** Reliability of the source that produced the judgement (1 = graded answer, lower = self-report). */
  sourceReliability: number;
  at: string;
  sentenceKey?: string;
  eventId: string;
  counter?: ExposureCounter;
  /** How the language of an exposure was settled (`override`, `detection`, ... or `missing` for a v2 event); exposure observations of encounters and lookups only. */
  languageBasis?: string;
}

/** Multiplier applied to a weight by the producer's declared evidence quality. All <= 1: the engine never raises. */
export const QUALITY_FACTOR = { none: 0, weak: 0.5, moderate: 0.8, strong: 1 } as const;

/** The rule table: base weights (the kind's own ceiling) and reliabilities. See README for the reasoning. */
export const RULES = {
  exposure: { encounter: 0.2, lookup: 0.3, assistance: 0.3, playback: 0.2, unjudgedProduction: 0.3 },
  understood: { weight: 0.4, reliability: 0.4 },
  itemMark: { weight: 0.2, reliability: 0.3 },
  listening: { recorded: 0.8, synthetic: 0, hintedDiscount: 0.3, selfReportReliability: 0.5 },
  card: { recognition: 0.7, recall: 0.8, cloze: 0.8, grade: { again: 1.0, hard: 0.6, good: 0.8, easy: 1.0 } },
  grammar: { weight: 0.8 },
  production: { contextualPositive: 0.9, contextualNegative: 0.7, retrieval: 0.8 },
  assisted: { weight: 0.4 },
  /** projection@2. A phrase (`phrase:` id) is a multiword unit whose meaning is not the sum of its words. */
  phrase: {
    /** AssistanceRequested for a phrase or sentence: the learner needed help to read it (negative assistedRecognition, never phraseComprehension). */
    needed: 0.15,
    /** A recognition card or an assessment on a phrase, unhinted. */
    review: 0.7,
    /** A recall / cloze card on a phrase also shows the phrase was understood, at a lower weight than its productive-retrieval credit. */
    recallComprehension: 0.4,
    /** A correct unassisted ProductionRecorded on a phrase: the small comprehension credit beside contextualProduction. */
    productionPositive: 0.3,
    /** UnderstoodMarked (no help) on a phrase: a self-report. */
    selfReport: 0.3,
  },
} as const;

/**
 * Exposure weight factor by how the language of the encounter was settled (projection@2). Only ever lowers (principle (e)).
 * `undetermined` is 0: nothing was parsed, so there is nothing to observe. `missing` is a v2 event with no `language` block: counted in full.
 */
export const LANGUAGE_BASIS_FACTOR = {
  override: 1, 'book-metadata': 1, 'document-metadata': 1, detection: 0.7, 'team-default': 0.5, undetermined: 0, missing: 1,
} as const;
/** A basis string this table does not know (a newer producer): treated as the weakest known stated basis, never as certain. */
export const UNRECOGNISED_BASIS_FACTOR = 0.5;

/** Dimensions that only unassisted evidence may reach. */
const INDEPENDENT: ReadonlySet<Dimension> = new Set<Dimension>([
  'readingRecognition', 'listeningRecognition', 'productiveRetrieval', 'contextualProduction', 'grammaticalUnderstanding', 'phraseComprehension',
]);

/** A construction id (morphological or syntactic); AssessmentAnswered evidence is attributed to these. */
export const isConstructionId = (id: string): boolean => /^(morph|syntax):/u.test(id);
/** A phrase / multiword unit id (`unitIds.phrase`). */
export const isPhraseId = (id: string): boolean => id.startsWith('phrase:');

/** Authorship values that mean the sentence was NOT the learner's own unaided work (GoTell's `Authorship`). */
const INDEPENDENT_AUTHORSHIP: ReadonlySet<string> = new Set(['independent', 'reproduced-later']);
/** Authorship values that earn nothing at all: the words are a model's. */
const NO_CREDIT_AUTHORSHIP: ReadonlySet<string> = new Set(['copied-from-model', 'ai-generated']);

/** `{factor, basis}` of an event's `payload.language` block (projection@2). A missing block is a v2 event: factor 1, basis `missing`. */
export function languageWeighting(payload: Record<string, unknown>): { factor: number; basis: string } {
  const lang = payload.language;
  if (!lang || typeof lang !== 'object') return { factor: LANGUAGE_BASIS_FACTOR.missing, basis: 'missing' };
  const basis = (lang as { basis?: unknown }).basis;
  if (typeof basis !== 'string') return { factor: LANGUAGE_BASIS_FACTOR.missing, basis: 'missing' };
  if (Object.prototype.hasOwnProperty.call(LANGUAGE_BASIS_FACTOR, basis)) return { factor: LANGUAGE_BASIS_FACTOR[basis as keyof typeof LANGUAGE_BASIS_FACTOR], basis };
  return { factor: UNRECOGNISED_BASIS_FACTOR, basis };
}

const round9 = (x: number): number => Math.round(x * 1e9) / 1e9;
const clamp01 = (x: number): number => Math.min(1, Math.max(0, x));
const finite = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x);

type P = Record<string, unknown>;

interface Draft {
  unitIds: string[];
  dimension: Dimension;
  outcome: ObservationOutcome;
  base: number;
  assisted?: boolean;
  reliability?: number;
  counter?: ExposureCounter;
  /** Factor from the event's language basis (exposure of encounters and lookups only); absent = 1. */
  languageFactor?: number;
  languageBasis?: string;
}

/**
 * Observations of one event, at most one per (event, unit, dimension): a unit named twice in one event is observed once
 * per dimension (projection@2: a phrase can receive both a contextualProduction and a phraseComprehension credit).
 * Events with an unparseable `at`, or with `evidence.quality: 'none'`, produce nothing.
 */
export function observationsOf(event: GoEvent): Observation[] {
  if (!event || typeof event.at !== 'string' || Number.isNaN(Date.parse(event.at))) return [];
  const drafts = draftsOf(event);
  const q = event.evidence ? QUALITY_FACTOR[event.evidence.quality] ?? 1 : 1;
  const declared = finite(event.evidence?.sourceReliability) ? clamp01(event.evidence.sourceReliability) : 1;
  const payload = (event.payload ?? {}) as P;
  const difficulty = finite(payload.difficulty) ? clamp01(payload.difficulty) : undefined;
  const sentenceKey = event.subject?.sentenceKey ?? (typeof payload.sentenceKey === 'string' ? payload.sentenceKey : undefined);
  const seen = new Set<string>();
  const out: Observation[] = [];
  for (const d of drafts) {
    const assisted = d.assisted === true || event.evidence?.assisted === true;
    // (d): assisted evidence is routed to assistedRecognition; exposure stays exposure.
    const dimension: Dimension = assisted && INDEPENDENT.has(d.dimension) ? 'assistedRecognition' : d.dimension;
    const reliability = Math.min(d.reliability ?? 1, declared);
    // (e): the kind's ceiling is `base`; quality (<= 1) and reliability (<= 1) can only lower it.
    // (k): the language factor is <= 1 too. It scales the weight, not the reliability (the judgement's source is unchanged).
    const weight = round9(Math.min(d.base, d.base * q) * reliability * (d.languageFactor ?? 1));
    if (weight <= 0) continue;
    for (const unitId of d.unitIds) {
      const key = `${unitId}\u0000${dimension}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const o: Observation = {
        learnerId: event.learnerId, languageId: event.languageId, unitId, dimension, outcome: d.outcome, weight, assisted,
        sourceReliability: reliability, at: event.at, eventId: event.id,
      };
      if (difficulty !== undefined) o.difficulty = difficulty;
      if (sentenceKey) o.sentenceKey = sentenceKey;
      if (d.counter) o.counter = d.counter;
      if (d.languageBasis !== undefined) o.languageBasis = d.languageBasis;
      out.push(o);
    }
  }
  return out;
}

function draftsOf(e: GoEvent): Draft[] {
  const ids = [...new Set((e.subject?.itemIds ?? []).filter((i): i is string => typeof i === 'string' && i.length > 0))];
  const p = (e.payload ?? {}) as P;
  const R = RULES;
  const phrases = ids.filter(isPhraseId);
  const one = (d: Omit<Draft, 'unitIds'>, unitIds: string[] = ids): Draft[] => (unitIds.length ? [{ ...d, unitIds }] : []);
  /** An encounter or lookup exposure, weighted by how its language was settled; `undetermined` parsed nothing, so it observes nothing. */
  const languageExposure = (counter: ExposureCounter, base: number): Draft[] => {
    const { factor, basis } = languageWeighting(p);
    return factor <= 0 ? [] : one({ dimension: 'exposure', outcome: 'exposure', base, counter, languageFactor: factor, languageBasis: basis });
  };
  switch (e.kind) {
    case 'EncounterRecorded':
      return languageExposure('encounter', R.exposure.encounter);
    case 'SelectionLookedUp':
      return languageExposure('lookup', R.exposure.lookup);
    case 'AnalysisShown':
      return one({ dimension: 'exposure', outcome: 'exposure', base: R.exposure.assistance, counter: 'assistance' });
    case 'AssistanceRequested': {
      const exposure = one({ dimension: 'exposure', outcome: 'exposure', base: R.exposure.assistance, counter: 'assistance' });
      // projection@2: asking for a phrase or sentence gloss means the learner needed help to read it. That is assisted recognition
      // (negative: help was needed), never phraseComprehension, which only an unassisted judgement can raise.
      if (p.assistance === 'phrase' || p.assistance === 'sentence') {
        return [...exposure, ...one({ dimension: 'assistedRecognition', outcome: 'negative', base: R.phrase.needed, assisted: true }, phrases)];
      }
      return exposure;
    }
    case 'PronunciationPlayed':
    case 'ListeningCompleted':
      // (b): audio is exposure; the unit is not thereby recognised by ear.
      return one({ dimension: 'exposure', outcome: 'exposure', base: R.exposure.playback, counter: 'playback' });
    case 'UnderstoodMarked': {
      const help = p.helpUsed === true;
      const general = one({ dimension: help ? 'assistedRecognition' : 'readingRecognition', outcome: 'positive', base: R.understood.weight, assisted: help, reliability: R.understood.reliability });
      // projection@2: a self-reported "understood" on a phrase is a weak phraseComprehension credit (never when help was used).
      return help ? general : [...general, ...one({ dimension: 'phraseComprehension', outcome: 'positive', base: R.phrase.selfReport, reliability: R.understood.reliability }, phrases)];
    }
    case 'ItemMarked': {
      if (p.mark === 'known') return one({ dimension: 'readingRecognition', outcome: 'positive', base: R.itemMark.weight, reliability: R.itemMark.reliability });
      if (p.mark === 'learning') return one({ dimension: 'readingRecognition', outcome: 'negative', base: R.itemMark.weight, reliability: R.itemMark.reliability });
      return []; // saved / ignore: a bookmark is not evidence of knowledge either way
    }
    case 'ListeningAssessed': {
      if (p.answerShownBefore !== false || typeof p.correct !== 'boolean') return []; // not a listening assessment
      const hinted = p.hinted === true;
      const base = (p.voice === 'recorded' ? R.listening.recorded : R.listening.synthetic) * (1 - R.listening.hintedDiscount * (hinted ? 1 : 0));
      return one({
        dimension: hinted ? 'assistedRecognition' : 'listeningRecognition', outcome: p.correct ? 'positive' : 'negative', base: round9(base), assisted: hinted,
        reliability: p.responseMode === 'self-report' ? R.listening.selfReportReliability : 1,
      });
    }
    case 'CardReviewed': {
      if (typeof p.correct !== 'boolean') return [];
      const cardKind = p.cardKind === 'recall' || p.cardKind === 'cloze' ? p.cardKind : 'recognition';
      const gradeF = R.card.grade[p.grade as keyof typeof R.card.grade] ?? R.card.grade.good;
      // A shown answer (answerShownBefore) is help exactly as a hint is.
      const assisted = p.hinted === true || p.answerShownBefore === true;
      const dim: Dimension = cardKind === 'recognition' ? 'readingRecognition' : 'productiveRetrieval';
      const outcome: ObservationOutcome = p.correct ? 'positive' : 'negative';
      if (assisted) return one({ dimension: 'assistedRecognition', outcome, base: round9(R.assisted.weight * gradeF), assisted });
      // projection@2: a phrase is judged as a whole. A recognition card on it is phraseComprehension (instead of readingRecognition);
      // a recall / cloze card keeps its productiveRetrieval credit and adds a smaller phraseComprehension one.
      const plain = ids.filter((i) => !isPhraseId(i));
      return [
        ...one({ dimension: dim, outcome, base: round9(R.card[cardKind] * gradeF) }, cardKind === 'recognition' ? plain : ids),
        ...one({ dimension: 'phraseComprehension', outcome, base: round9((cardKind === 'recognition' ? R.phrase.review : R.phrase.recallComprehension) * gradeF) }, phrases),
      ];
    }
    case 'AssessmentAnswered': {
      if (typeof p.correct !== 'boolean') return [];
      const targets = [...new Set([...(typeof p.constructionId === 'string' && p.constructionId ? [p.constructionId] : []), ...ids.filter(isConstructionId)])];
      const hinted = p.hinted === true;
      const outcome: ObservationOutcome = p.correct ? 'positive' : 'negative';
      // A phrase named in the subject is judged as a whole (phraseComprehension); hinted answers go to assistedRecognition on both.
      return [
        ...one({ dimension: hinted ? 'assistedRecognition' : 'grammaticalUnderstanding', outcome, base: hinted ? R.assisted.weight : R.grammar.weight, assisted: hinted }, targets),
        ...one({ dimension: hinted ? 'assistedRecognition' : 'phraseComprehension', outcome, base: hinted ? R.assisted.weight : R.phrase.review, assisted: hinted }, phrases),
      ];
    }
    case 'ProductionRecorded': {
      const authorship = typeof p.authorship === 'string' ? p.authorship : undefined;
      // The payload's own authorship overrides a producer that forgot to set `assisted`: a sentence copied from a model or written by an AI
      // is the model's work, not the learner's (no judged observation at all), and any other non-independent authorship is assisted.
      if (authorship !== undefined && NO_CREDIT_AUTHORSHIP.has(authorship)) return [];
      const assisted = p.assisted === true || (authorship !== undefined && !INDEPENDENT_AUTHORSHIP.has(authorship)) || (Array.isArray(p.assistance) && p.assistance.length > 0);
      const retrieval = p.mode === 'retrieval';
      if (p.usedCorrectly === 'unjudged') return one({ dimension: 'exposure', outcome: 'exposure', base: R.exposure.unjudgedProduction, counter: 'encounter' });
      if (typeof p.usedCorrectly !== 'boolean') return [];
      if (assisted) return one({ dimension: 'assistedRecognition', outcome: p.usedCorrectly ? 'positive' : 'negative', base: R.assisted.weight, assisted: true });
      if (p.usedCorrectly) {
        return [
          ...one({ dimension: retrieval ? 'productiveRetrieval' : 'contextualProduction', outcome: 'positive', base: retrieval ? R.production.retrieval : R.production.contextualPositive }),
          // projection@2: using a phrase correctly also shows it was understood (a small credit; an error says nothing about comprehension).
          ...one({ dimension: 'phraseComprehension', outcome: 'positive', base: R.phrase.productionPositive }, phrases),
        ];
      }
      return one({ dimension: retrieval ? 'productiveRetrieval' : 'contextualProduction', outcome: 'negative', base: retrieval ? R.production.retrieval : R.production.contextualNegative });
    }
    // CorrectionAccepted / CorrectionRejected / DraftSaved / SentenceSubmitted: accepting a correction is copying, not independent
    // production (c); a saved draft or a submitted sentence is an artefact, judged later by ProductionRecorded.
    // AnalysisCorrected / ReviewItemInvalidated change linguistic or card state, not what the learner knows.
    // CardAdded / CardRemoved: scheduling bookkeeping (read by the candidate rules, not evidence).
    // The profile family (enrolment, pack, privacy, consent, preferences) is configuration, not evidence.
    default:
      return [];
  }
}

/**
 * Principle (j): a positive observation must trace to a payload that says so. True when `o` (a positive observation of
 * `event`) is justified: correct:true, usedCorrectly:true, an explicit "understood" mark (on the dimension its help flag
 * says) or an explicit "known" mark. Used by the invariant test and available to auditors of a projection version.
 */
export function isPositiveTraceable(event: GoEvent, o: Pick<Observation, 'dimension' | 'outcome'>): boolean {
  if (o.outcome !== 'positive') return true;
  const p = (event.payload ?? {}) as P;
  switch (event.kind) {
    case 'ListeningAssessed': case 'CardReviewed': case 'AssessmentAnswered': return p.correct === true;
    case 'ProductionRecorded': return p.usedCorrectly === true;
    case 'UnderstoodMarked': return o.dimension === 'readingRecognition' || o.dimension === 'phraseComprehension' ? p.helpUsed === false : p.helpUsed === true || event.evidence?.assisted === true;
    case 'ItemMarked': return p.mark === 'known';
    default: return false;
  }
}
