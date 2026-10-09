/**
 * Gathers the Repository's review candidates and runs intake over them. Knowledge is fetched in ONE batch for all
 * candidates; pack facts are fetched only for the candidates the first (fact-free) pass would test (test-now /
 * test-later), then intake runs again with the facts so a conflicted analysis or missing facts can still stop the item.
 */
import type { ReviewCandidate, UnitKnowledge } from '../../../repository-contract/src';
import type { AudioAvailability, DeckItem, FactsProvider, IntakeOutcome, ReviewPreferences } from '../types';
import { decideIntake } from './intake';

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

  // First pass without facts, for every candidate; only the ones it would test need the Repository's unit view and the pack's facts.
  const passes = candidates.map((candidate) => {
    const base = { candidate, knowledge: knowledge[candidate.unitId], existing: deck, audio, saved, preferences, now };
    return { candidate, base, first: decideIntake(base) };
  });
  const testable = passes.filter((p) => p.first.decision === 'test-now' || p.first.decision === 'test-later').map((p) => p.candidate.unitId);
  // One batched read of those units (chunks of 50) instead of one request each; a provider that cannot batch just answers one by one.
  try { await (deps.facts as PrimableFacts).prime?.([...new Set(testable)]); } catch { /* factsFor still works one by one */ }

  const out: IntakeOutcome[] = [];
  for (const { candidate, base, first } of passes) {
    if (first.decision !== 'test-now' && first.decision !== 'test-later') { out.push(first); continue; }
    try {
      const facts = await deps.facts.factsFor(candidate.unitId, preferences.languageId);
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
