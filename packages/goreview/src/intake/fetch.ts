/**
 * Gathers the Repository's review candidates and runs intake over them. Knowledge is fetched in ONE batch for all
 * candidates; pack facts are fetched only for the candidates the first (fact-free) pass would test (test-now /
 * test-later), then intake runs again with the facts so a conflicted analysis or missing facts can still stop the item.
 */
import type { GoEvent, ReviewCandidate, UnitKnowledge } from '../../../repository-contract/src';
import type { AudioAvailability, DeckItem, FactsProvider, IntakeOutcome, ReviewPreferences } from '../types';
import { decideIntake } from './intake';

/** Recognition aliasing does not assert that every morphological feature is verified. */
const reliableFormLink = (relation: import('../../../repository-contract/src').UnitRelation): boolean =>
  relation.status === 'verified' || relation.status === 'high-confidence' ||
  (relation.status === 'provisional' && relation.confidence >= 0.9 && relation.provenance.confidence >= 0.9
    && ['hand-lexicon', 'reviewer'].includes(relation.provenance.source));

export interface GatherDeps {
  api: {
    candidates(enrolmentId: string, limit: number): Promise<ReviewCandidate[]>;
    /** One batch for every candidate; a record by unit id or a plain array (the engine returns an array). */
    knowledge(unitIds: string[]): Promise<Record<string, UnitKnowledge> | UnitKnowledge[]>;
  };
  facts: FactsProvider;
  audio: (languageId: string) => Promise<AudioAvailability>;
  deck: DeckItem[];
  saved: Set<string>;
  preferences: ReviewPreferences;
  now: string;
  enrolmentId: string;
  /** How many candidates to ask the Repository for (default 40). */
  limit?: number;
  readingSignals?: GoEvent[];
  secondaryPractice?: boolean;
}

export const DEFAULT_CANDIDATE_LIMIT = 40;

const toRecord = (k: Record<string, UnitKnowledge> | UnitKnowledge[]): Record<string, UnitKnowledge> =>
  Array.isArray(k) ? Object.fromEntries(k.map((r) => [r.unitId, r])) : k;

/** A facts provider that can fetch the Repository's units for many candidates at once (`createFactsProvider` does, over a client with `units`). */
export type PrimableFacts = FactsProvider & { prime?(unitIds: string[]): Promise<void> };

export async function gatherCandidates(deps: GatherDeps): Promise<IntakeOutcome[]> {
  const { preferences, deck, saved, now } = deps;
  const candidates = await deps.api.candidates(deps.enrolmentId, deps.limit ?? DEFAULT_CANDIDATE_LIMIT);
  if (!candidates.length) return [];
  const knowledge = toRecord(await deps.api.knowledge([...new Set(candidates.map((c) => c.unitId))]));
  let audio: AudioAvailability;
  try { audio = await deps.audio(preferences.languageId); } catch (e) {
    audio = { available: false, eligibleForEvidence: false, reason: `audio availability could not be determined (${e instanceof Error ? e.message : String(e)})` };
  }

  // First pass without facts, for every candidate; only the ones it would test need pack facts.
  const passes = candidates.map((candidate) => {
    const base = { candidate, knowledge: knowledge[candidate.unitId], existing: deck, audio, saved, preferences, now, readingSignals: deps.readingSignals, secondaryPractice: deps.secondaryPractice };
    return { candidate, base, first: decideIntake(base) };
  });
  const testable = passes.filter((p) => p.first.decision === 'test-now' || p.first.decision === 'test-later').map((p) => p.candidate.unitId);
  // One batched read of those units (chunks of 50) instead of one request each; a provider that cannot batch just answers one by one.
  try { await (deps.facts as PrimableFacts).prime?.([...new Set(testable)]); } catch { /* factsFor still works one by one */ }

  const factsByUnit = new Map<string, Awaited<ReturnType<FactsProvider['factsFor']>>>();
  const factErrors = new Map<string, string>();
  for (const id of new Set(testable)) {
    try { factsByUnit.set(id, await deps.facts.factsFor(id, preferences.languageId)); }
    catch (e) { factErrors.set(id, e instanceof Error ? e.message : String(e)); }
  }

  // A previous app version may already have created a recognition card for the inflected form.
  // Read its verified relation too, so a later canonical-lemma candidate does not create a second
  // default reading objective. Dismissed cards do not count as coverage; suspended and snoozed
  // cards remain learner-owned targets and keep their status/history intact.
  const existingFormRecognition = !deps.secondaryPractice ? deck.filter((item) =>
    item.unitKind === 'form' && item.dimension === 'written-recognition' && item.status !== 'dismissed') : [];
  for (const item of existingFormRecognition) {
    if (factsByUnit.has(item.unitId) || factErrors.has(item.unitId)) continue;
    try { factsByUnit.set(item.unitId, await deps.facts.factsFor(item.unitId, preferences.languageId)); }
    catch (e) { factErrors.set(item.unitId, e instanceof Error ? e.message : String(e)); }
  }

  // One token's inflected form and its canonical lemma are the same default reading objective.
  // Merge only a single verified form-of edge into a present canonical lexeme objective; ambiguity,
  // provisional links, and explicit secondary-practice requests remain separate.
  const candidateById = new Map(candidates.map((candidate) => [candidate.unitId, candidate] as const));
  const mergedForms = new Map<string, string>();
  const coveredCanonicalLexemes = new Map<string, string>();
  if (!deps.secondaryPractice) {
    for (const item of existingFormRecognition) {
      const links = (factsByUnit.get(item.unitId)?.relations ?? []).filter((relation) =>
        relation.fromId === item.unitId && relation.relation === 'form-of' && reliableFormLink(relation) && relation.toId.startsWith('lemma:'));
      const targets = [...new Set(links.map((relation) => relation.toId))];
      const formFacts = factsByUnit.get(item.unitId);
      const hasAmbiguousReading = (formFacts?.analyses ?? []).some((analysis) => {
        if (analysis.status === 'invalidated') return false;
        const readings = new Set(analysis.candidates.filter((reading) => reading.lexemeId || reading.senseId).map((reading) => `${reading.lexemeId ?? ''}|${reading.senseId ?? ''}`));
        return readings.size > 1;
      });
      if (links.length !== 1 || targets.length !== 1 || hasAmbiguousReading) continue;
      const lexemeId = targets[0];
      const canonicalCandidate = candidateById.get(lexemeId);
      if (canonicalCandidate?.kind === 'lexeme' && canonicalCandidate.targetDimension === 'readingRecognition') {
        coveredCanonicalLexemes.set(lexemeId, item.unitId);
      }
    }

    for (const { candidate } of passes) {
      if (candidate.kind !== 'form' || candidate.targetDimension !== 'readingRecognition' || !testable.includes(candidate.unitId)) continue;
      const links = (factsByUnit.get(candidate.unitId)?.relations ?? []).filter((relation) =>
        relation.fromId === candidate.unitId && relation.relation === 'form-of' && reliableFormLink(relation) && relation.toId.startsWith('lemma:'));
      const targets = [...new Set(links.map((relation) => relation.toId))];
      if (links.length !== 1 || targets.length !== 1) continue;
      const formFacts = factsByUnit.get(candidate.unitId);
      const hasAmbiguousReading = (formFacts?.analyses ?? []).some((analysis) => {
        if (analysis.status === 'invalidated') return false;
        const readings = new Set(analysis.candidates.filter((reading) => reading.lexemeId || reading.senseId).map((reading) => `${reading.lexemeId ?? ''}|${reading.senseId ?? ''}`));
        return readings.size > 1;
      });
      if (hasAmbiguousReading) continue;
      const lexemeId = targets[0];
      const canonicalCandidate = candidateById.get(lexemeId);
      const canonicalKnowledge = knowledge[lexemeId];
      const canonicalRecognitionAlreadyInDeck = deck.some((item) => item.unitId === lexemeId &&
        (item.dimension === 'written-recognition' || item.dimension === 'phrase-comprehension') && item.status !== 'dismissed');
      if ((canonicalCandidate?.kind === 'lexeme' && canonicalCandidate.targetDimension === 'readingRecognition') || canonicalKnowledge || canonicalRecognitionAlreadyInDeck) {
        mergedForms.set(candidate.unitId, lexemeId);
      }
    }
  }

  const out: IntakeOutcome[] = [];
  for (const { candidate, base, first } of passes) {
    const coveredByForm = coveredCanonicalLexemes.get(candidate.unitId);
    if (coveredByForm) {
      out.push({ ...first, decision: 'already-covered', proposed: undefined, reasons: [`canonical lexeme is already represented by existing form recognition ${coveredByForm}; its card status and history are preserved`, ...first.reasons] });
      continue;
    }
    const canonicalLexemeId = mergedForms.get(candidate.unitId);
    if (canonicalLexemeId) {
      out.push({ ...first, decision: 'redundant', proposed: undefined, reasons: [`merged into canonical lexeme ${canonicalLexemeId} through one reliable lexical form-of relation; one encounter creates one reading-recognition objective`, ...first.reasons] });
      continue;
    }
    if (first.decision !== 'test-now' && first.decision !== 'test-later') { out.push(first); continue; }
    try {
      if (factErrors.has(candidate.unitId)) throw new Error(factErrors.get(candidate.unitId));
      const facts = factsByUnit.get(candidate.unitId);
      if (!facts) {
        out.push({ ...first, decision: 'needs-validation', reasons: ['the pack has no verified facts for this unit, so no exercise can be built', ...first.reasons] });
        continue;
      }
      out.push(decideIntake({ ...base, facts }));
    } catch (e) {
      out.push({ ...first, decision: 'needs-validation', reasons: [`pack facts could not be read (${e instanceof Error ? e.message : String(e)})`, ...first.reasons] });
    }
  }
  return out;
}
