/**
 * Interpretation providers (e.g. a future LLM) — validated, advisory, never authoritative.
 *
 * No provider ships: GoTell's meaning assessment is deterministic (assess.ts). When one is configured, its raw output is
 * checked here against a strict shape; anything malformed, out of range or naming unknown concepts is rejected with a reason.
 * A valid answer is stored on the attempt as `evaluator.advisory`, with whether it agrees with the deterministic assessment.
 * It cannot make an attempt successful, change a level, alter the attempt text or the assistance record — the service never
 * reads it back for any decision.
 */
import type { AdvisoryInterpretation, InterpretationProvider, LanguageCode, MeaningAssessment, SemanticGoal } from '../../core';
import { CONCEPT_IDS } from '../concepts';

const KNOWN = new Set<string>(CONCEPT_IDS);

export function validateInterpretation(providerId: string, raw: unknown, goal: SemanticGoal, meaning: MeaningAssessment): { ok: true; advisory: AdvisoryInterpretation } | { ok: false; reason: string } {
  if (!raw || typeof raw !== 'object') return { ok: false, reason: 'not an object' };
  const r = raw as Record<string, unknown>;
  if (!Array.isArray(r.concepts) || !r.concepts.every((c) => typeof c === 'string')) return { ok: false, reason: 'concepts must be an array of strings' };
  const unknown = (r.concepts as string[]).filter((c) => !KNOWN.has(c));
  if (unknown.length) return { ok: false, reason: `unknown concept(s): ${unknown.join(', ')}` };
  if (typeof r.confidence !== 'number' || !Number.isFinite(r.confidence) || r.confidence < 0 || r.confidence > 1) return { ok: false, reason: 'confidence must be a number in 0..1' };
  if (r.note !== undefined && (typeof r.note !== 'string' || r.note.length > 300)) return { ok: false, reason: 'note must be a short string' };
  const concepts = [...new Set(r.concepts as string[])];
  const saysAll = goal.components.every((c) => concepts.includes(c.concept));
  return {
    ok: true,
    advisory: { providerId, concepts, confidence: r.confidence, ...(r.note ? { note: r.note as string } : {}), agrees: saysAll === meaning.success },
  };
}

/** Ask the provider, with a time limit; never throws (a failing provider changes nothing). */
export async function consult(provider: InterpretationProvider | undefined, args: { lang: LanguageCode; goal: SemanticGoal; text: string }, meaning: MeaningAssessment, timeoutMs = 4000): Promise<{ advisory?: AdvisoryInterpretation; rejected?: string }> {
  if (!provider) return {};
  try {
    const raw = await Promise.race([provider.interpret(args), new Promise<never>((_, rej) => setTimeout(() => rej(new Error('timeout')), timeoutMs))]);
    const v = validateInterpretation(provider.id, raw, args.goal, meaning);
    return v.ok ? { advisory: v.advisory } : { rejected: `${provider.id}: ${v.reason}` };
  } catch (e) {
    return { rejected: `${provider.id}: ${(e as Error).message}` };
  }
}
