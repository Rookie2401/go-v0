/**
 * Rebuild candidates for installable-language words whose events reached the account but whose
 * analyser never materialised a Repository catalogue unit. This is deliberately
 * read-only: pack facts are used as inputs to the Repository's existing ranking
 * function and never written back to the account catalogue.
 */
import { rankCandidates } from '../../repository-local/src/ranking';
import type { Dimension, GoEvent, LinguisticUnit, ReviewCandidate, UnitKnowledge } from '../../repository-contract/src';
import type { RepositoryApi, VocabularyItem } from '../../repository-service/src/api';
import type { DeckItem, ReviewPreferences, UnitFacts } from '../src/types';
import type { FactsProvider } from '../src/types';
import type { RecoveryResult } from './ports';

const UNIT_BATCH = 50;
const FACTS_PARALLEL = 8;

const isRecoverableUnitId = (id: string, languageId: string): boolean =>
  id.startsWith(`form:${languageId}:`) || id.startsWith(`lemma:${languageId}:`);

const FAMILY_DIMENSION: Record<string, Dimension> = {
  'written-recognition': 'readingRecognition', 'phrase-comprehension': 'phraseComprehension',
  'meaning-recall': 'readingRecognition', 'audio-to-meaning': 'listeningRecognition', 'auditory-recognition': 'listeningRecognition',
  'auditory-transcription': 'listeningRecognition', 'meaning-to-target-retrieval': 'productiveRetrieval', 'meaning-to-form': 'productiveRetrieval',
  'morphological-identification': 'grammaticalUnderstanding', 'morphological-analysis': 'grammaticalUnderstanding',
  'grammar-application': 'grammaticalUnderstanding', 'construction-understanding': 'grammaticalUnderstanding',
  'sentence-completion': 'contextualProduction', 'productive-recall': 'contextualProduction',
};
const objectiveForFamily = (family: string): Dimension | undefined => FAMILY_DIMENSION[family];

function cardStates(deck: readonly DeckItem[]): Map<string, { covered: boolean; coveredDimensions?: ReadonlySet<Dimension>; blockedDimensions?: ReadonlySet<Dimension>; blocked?: boolean; lastReviewAt?: string }> {
  const out = new Map<string, { covered: boolean; coveredDimensions?: ReadonlySet<Dimension>; blockedDimensions?: ReadonlySet<Dimension>; blocked?: boolean; lastReviewAt?: string }>();
  for (const item of deck) {
    const row = out.get(item.unitId) ?? { covered: false };
    const dimension = objectiveForFamily(item.family);
    if (dimension) {
      const covered = new Set(row.coveredDimensions ?? []);
      if (item.status === 'active' || item.status === 'snoozed') covered.add(dimension);
      row.coveredDimensions = covered;
      if (item.status === 'suspended' || item.status === 'dismissed' || item.invalidatedAt) {
        const blocked = new Set(row.blockedDimensions ?? []);
        blocked.add(dimension);
        row.blockedDimensions = blocked;
      }
    }
    const lastReviewAt = item.history.filter(entry => !entry.retracted && !entry.scheduleExcluded && !entry.conflict)
      .map(entry => entry.at).sort().at(-1);
    if (lastReviewAt && (!row.lastReviewAt || lastReviewAt > row.lastReviewAt)) row.lastReviewAt = lastReviewAt;
    out.set(item.unitId, row);
  }
  return out;
}

function objectiveDimensions(prefs: ReviewPreferences): Dimension[] {
  return [
    ...(prefs.practiceGoals?.includes('retrieval') ? ['productiveRetrieval' as const] : []),
    ...(prefs.practiceGoals?.includes('application') ? ['grammaticalUnderstanding' as const, 'contextualProduction' as const] : []),
    ...(prefs.includeListening && prefs.practiceGoals?.includes('listening') ? ['listeningRecognition' as const] : []),
    ...(prefs.practiceGoals?.includes('recognition') ? ['readingRecognition' as const] : []),
  ];
}

async function genuinelyMissing(api: RepositoryApi, ids: string[]): Promise<{ missing: Set<string>; complete: boolean }> {
  const missing = new Set<string>();
  let complete = true;
  for (let i = 0; i < ids.length; i += UNIT_BATCH) {
    const batch = ids.slice(i, i + UNIT_BATCH);
    try {
      const response = await api.units(batch);
      if (!response.ok) { complete = false; continue; } // uncertainty must not authorize a recovered candidate
      for (const id of response.data.missing) missing.add(id);
    } catch { complete = false; }
  }
  return { missing, complete };
}

export interface RecoverCandidatesInput {
  api: RepositoryApi;
  facts: FactsProvider;
  enrolmentId: string;
  languageId: string;
  varietyId?: string;
  prefs: ReviewPreferences;
  events: GoEvent[];
  deck: DeckItem[];
  knowledge: UnitKnowledge[];
  unresolvedVocabulary: VocabularyItem[];
  existingCandidates: ReviewCandidate[];
  now: string;
}

/**
 * Use only pack-derived, local facts for IDs the account confirms are
 * absent. Existing catalogue units, including invalidated or conflicted ones,
 * stay under the Repository's authority.
 */
export async function recoverCandidates(input: RecoverCandidatesInput): Promise<RecoveryResult> {
  const languageId = input.languageId;
  const knowledgeById = new Map(input.knowledge.filter(row => row.languageId === languageId).map(row => [row.unitId, row]));
  const protectedCandidateIds = new Set(input.existingCandidates
    .filter(candidate => candidate.eligibility.status !== 'unknown')
    .map(candidate => candidate.unitId));
  const eligibleIds = [...new Set(input.unresolvedVocabulary
    .filter(item => !item.unit)
    .map(item => item.knowledge.unitId)
    .filter((id): id is string => typeof id === 'string' && isRecoverableUnitId(id, languageId)))]
    .filter(id => knowledgeById.has(id))
    .filter(id => !protectedCandidateIds.has(id));
  if (!eligibleIds.length) return { candidates: [], complete: true };

  const absent = await genuinelyMissing(input.api, eligibleIds);
  const ids = eligibleIds.filter(id => absent.missing.has(id));
  if (!ids.length) return { candidates: [], complete: absent.complete, ...(absent.complete ? {} : { note: `The Repository could not confirm whether ${languageId} vocabulary units are missing.` }) };

  const primable = input.facts as FactsProvider & { prime?(unitIds: string[], varietyId?: string): Promise<void>; clearPrime?(): void };
  try { await primable.prime?.(ids, input.varietyId); }
  catch { return { candidates: [], complete: false, note: `${languageId} pack assets could not be prepared.` }; }
  const recovered = new Map<string, UnitFacts>();
  let factsComplete = true;
  try {
    for (let i = 0; i < ids.length; i += FACTS_PARALLEL) {
      const group = ids.slice(i, i + FACTS_PARALLEL);
      const values = await Promise.all(group.map(async id => {
        try { return [id, await input.facts.factsFor(id, languageId, input.varietyId), false] as const; }
        catch { return [id, undefined, true] as const; }
      }));
      for (const [id, facts, failed] of values) {
        if (failed) { factsComplete = false; continue; }
        if (!facts) continue; // validly prepared pack facts can still have no analysis for a surface
        if (facts.unit.unitId !== id || facts.unit.languageId !== languageId) { factsComplete = false; continue; }
        if (facts.status === 'invalidated' || facts.status === 'conflicted' || facts.status === 'requires-review') continue;
        if (!facts.unit.provenance?.ref?.startsWith('goreview-facts:pack-derived@')) { factsComplete = false; continue; }
        recovered.set(id, facts);
      }
    }
  } finally {
    primable.clearPrime?.();
  }
  if (!recovered.size) return { candidates: [], complete: absent.complete && factsComplete,
    ...(!absent.complete || !factsComplete ? { note: `${languageId} pack facts could not be loaded for the unresolved vocabulary.` } : {}) };

  const rows = ids.flatMap(id => {
    const row = knowledgeById.get(id);
    return row && recovered.has(id) ? [row] : [];
  });
  const units = new Map<string, LinguisticUnit>();
  const analyses = new Map<string, NonNullable<UnitFacts['analyses']>>();
  const realizedBy = new Map<string, string[]>();
  for (const [id, facts] of recovered) {
    units.set(id, facts.unit);
    analyses.set(id, facts.analyses);
    for (const constructionId of facts.constructionIds) {
      const forms = realizedBy.get(constructionId) ?? [];
      forms.push(id);
      realizedBy.set(constructionId, forms);
    }
  }
  let enrolments;
  try { enrolments = await input.api.listEnrolments(); }
  catch { return { candidates: [], complete: false, note: `${languageId} enrolment could not be confirmed.` }; }
  if (!enrolments.ok) return { candidates: [], complete: false, note: `${languageId} enrolment could not be confirmed.` };
  const enrolment = enrolments.data.enrolments.find(row => row.enrolmentId === input.enrolmentId && row.languageId === languageId && !row.endedAt);
  if (!enrolment) return { candidates: [], complete: false, note: `${languageId} enrolment could not be confirmed.` };
  const candidates = rankCandidates({
    rows, units, analyses, realizedBy, cards: cardStates(input.deck), goals: enrolment.goals,
    now: input.now, limit: rows.length, objectiveDimensions: objectiveDimensions(input.prefs),
  });
  const complete = absent.complete && factsComplete;
  // rankCandidates can synthesize morphology candidates from realizedBy. This recovery
  // path authorizes only the exact IDs the account confirmed are absent and for which
  // we loaded facts; unrelated synthesized IDs remain under the catalogue pipeline.
  const recoveredIds = new Set(ids);
  return { candidates: candidates.filter(candidate => recoveredIds.has(candidate.unitId)), complete,
    ...(!complete ? { note: `Some ${languageId} pack facts could not be loaded; recovered candidates may be incomplete.` } : {}) };
}

/** Backwards-compatible name for the original Hebrew-only caller. */
export const recoverHebrewCandidates = recoverCandidates;

