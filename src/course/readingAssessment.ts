import type { LanguageCode, Text } from '../core/model';
import type { AppStore } from '../core/store';
import type { StageContract } from './curriculumPolicy';

export interface ReadingAssessmentSpec {
  id: string;
  textId: string;
  language: LanguageCode;
  stageId: string;
  contentVersion: number;
  rights: { cleared: boolean; basis: string; by: string; at: string };
  comparability: { reviewedBy: string; at: string; basis: string; dimensions: { vocabulary: string; syntax: string; length: string; register: string; genre: string } };
  thresholds: { comprehension: number; gist: number; detail: number; inference: number; maxLookupsPer100Words: number; maxRescueUses: number };
}
export interface AssessmentContext {
  userId: string;
  text: Text;
  encounteredTextIds: ReadonlySet<string>;
  encounteredWorkIds?: ReadonlySet<string>;
  courseTextIds: ReadonlySet<string>;
  recommendedTextIds: ReadonlySet<string>;
}
export function validateReadingAssessment(spec: ReadingAssessmentSpec, context: AssessmentContext): string[] {
  const reasons: string[] = [];
  const { text } = context;
  if (text.id !== spec.textId || text.lang !== spec.language || text.contentVersion !== spec.contentVersion) reasons.push('Assessment identity, language or wording version does not match');
  if (!spec.rights.cleared || !spec.rights.basis.trim() || !spec.rights.by.trim() || !spec.rights.at.trim() || text.personalCopy || text.sourceId === '') reasons.push('Assessment use rights are not established');
  if (context.encounteredTextIds.has(text.id) || (!!text.workId && context.encounteredWorkIds?.has(text.workId))) reasons.push('Learner has encountered this text or its work before');
  if (context.courseTextIds.has(text.id) || context.recommendedTextIds.has(text.id)) reasons.push('Assessment text belongs to the course or ordinary recommendations');
  const comparison = spec.comparability;
  if (!comparison.reviewedBy.trim() || !comparison.at.trim() || !comparison.basis.trim() || Object.values(comparison.dimensions).some(v => !v.trim())) reasons.push('Stage comparability needs documented vocabulary, syntax, length, register and genre review');
  if (['comprehension', 'gist', 'detail', 'inference'].some(k => { const value = spec.thresholds[k as 'comprehension']; return !Number.isFinite(value) || value < 0 || value > 1; }) || !Number.isFinite(spec.thresholds.maxLookupsPer100Words) || spec.thresholds.maxLookupsPer100Words < 0 || !Number.isInteger(spec.thresholds.maxRescueUses) || spec.thresholds.maxRescueUses < 0) reasons.push('Assessment thresholds are invalid');
  return reasons;
}
export interface ReadingAssessmentObservation {
  comprehension: number;
  gist: number;
  detail: number;
  inference: number;
  wordCount: number;
  lookupCount: number;
  rescueUses: number;
  readingTimeSeconds: number;
}
/** Separate reading record; creates no vocabulary, listening, speaking or CEFR evidence. */
export function recordReadingAssessment(spec: ReadingAssessmentSpec, context: AssessmentContext, observation: ReadingAssessmentObservation, completedAt: string) {
  const reasons = validateReadingAssessment(spec, context);
  if (['comprehension', 'gist', 'detail', 'inference'].some(k => { const v = observation[k as 'comprehension']; return !Number.isFinite(v) || v < 0 || v > 1; }) || !Number.isInteger(observation.wordCount) || observation.wordCount <= 0 || !Number.isInteger(observation.lookupCount) || observation.lookupCount < 0 || !Number.isInteger(observation.rescueUses) || observation.rescueUses < 0 || !Number.isFinite(observation.readingTimeSeconds) || observation.readingTimeSeconds <= 0 || !Number.isFinite(Date.parse(completedAt))) reasons.push('Assessment observations or completion date are invalid');
  if (reasons.length) throw new Error(reasons.join('; '));
  const lookupsPer100Words = observation.lookupCount * 100 / observation.wordCount;
  const t = spec.thresholds;
  const meetsReadingContract = observation.comprehension >= t.comprehension && observation.gist >= t.gist && observation.detail >= t.detail && observation.inference >= t.inference && lookupsPer100Words <= t.maxLookupsPer100Words && observation.rescueUses <= t.maxRescueUses;
  return { assessmentId: spec.id, textId: spec.textId, contentVersion: spec.contentVersion, userId: context.userId, stageId: spec.stageId, completedAt, ...observation, lookupsPer100Words, meetsReadingContract, dimension: 'reading' as const, cefrCertification: false as const };
}
export function isHeldOutReadingText(textId: string, specs: readonly ReadingAssessmentSpec[]): boolean { return specs.some(s => s.textId === textId); }

// ───────────── the runtime-picked unseen text (the periodic check; src/golearn/assessment.ts) ─────────────
// A protected assessment text (above) is authored, rights-cleared and registered ahead of time. The periodic check picks an
// ORDINARY library text at the learner's reach, holds it out of recommendation, and measures with the recall prompts. These
// validators say whether such a text may serve and produce the same `exitEvidence` shape STAGE_CONTRACTS declares for a stage.

/** The measures a stage's `exitEvidence` can name (curriculumPolicy.ts); a prompt-based check measures `comprehension`, and `lookups` / `rescue-use` / `reading-time` when the reader counted them. */
export type UnseenMeasure = 'comprehension' | 'gist' | 'detail' | 'inference' | 'lookups' | 'rescue-use' | 'reading-time';
/** Fewest words a text needs to serve as an unseen check. */
export const UNSEEN_MIN_WORDS = 120;

export type UnseenTextFacts = Pick<Text, 'id' | 'lang'> & Partial<Pick<Text, 'kind' | 'personalCopy' | 'workId' | 'editorialTags' | 'readingAssessmentId' | 'listeningAssessmentId'>> & {
  /** Word tokens of the text (the catalogue's `features.words`). */
  words: number;
};
export interface RuntimeUnseenContext {
  userId: string;
  text: UnseenTextFacts;
  encounteredTextIds: ReadonlySet<string>;
  encounteredWorkIds?: ReadonlySet<string>;
  /** The text is held out of recommendation (src/golearn/heldout.ts) from the moment it is picked. */
  heldOut: boolean;
}
/** Reasons a runtime-picked text may NOT serve as an unseen check; empty = it may. */
export function validateRuntimeUnseenText(context: RuntimeUnseenContext, minWords: number = UNSEEN_MIN_WORDS): string[] {
  const { text } = context;
  const reasons: string[] = [];
  if (text.kind === 'scripture') reasons.push('Scripture is never used as a check text');
  if (text.kind === 'testimony' || text.personalCopy) reasons.push('A private or personal-copy text is not used as a check text');
  if (text.readingAssessmentId !== undefined || text.listeningAssessmentId !== undefined) reasons.push('A protected assessment text goes through the registered assessment path');
  if ((text.editorialTags ?? []).includes('stage0')) reasons.push('A Stage 0 scene is not a check text');
  if (!Number.isFinite(text.words) || text.words < minWords) reasons.push(`A check text needs at least ${minWords} words`);
  if (context.encounteredTextIds.has(text.id) || (!!text.workId && context.encounteredWorkIds?.has(text.workId))) reasons.push('Learner has encountered this text or its work before');
  if (!context.heldOut) reasons.push('The text is not held out of recommendation');
  return reasons;
}
export interface UnseenCheckObservation {
  promptsRight: number;
  promptsTotal: number;
  /** Share of the text's words known at the pick (0..1). */
  coverageAtPick: number;
  lookupCount?: number;
  wordCount?: number;
  rescueUses?: number;
  readingTimeSeconds?: number;
}
export type StageExitEvidence = StageContract['exitEvidence'];
/** The record of one check: the `exitEvidence` a stage contract declares, with the measured values beside it. Never a level. */
export interface UnseenReadingRecord {
  exitEvidence: StageExitEvidence;
  values: Partial<Record<UnseenMeasure, number>>;
  textId: string;
  userId: string;
  completedAt: string;
  promptsRight: number;
  promptsTotal: number;
  coverageAtPick: number;
  dimension: 'reading';
  cefrCertification: false;
}
/** Builds the record (a separate reading record: no vocabulary, listening, speaking or CEFR evidence). Throws with the reasons when the text or the numbers do not qualify. */
export function recordUnseenReading(context: RuntimeUnseenContext, observation: UnseenCheckObservation, completedAt: string, minWords: number = UNSEEN_MIN_WORDS): UnseenReadingRecord {
  const reasons = validateRuntimeUnseenText(context, minWords);
  const o = observation;
  const count = (n: number | undefined) => n === undefined || (Number.isInteger(n) && n >= 0);
  if (!Number.isInteger(o.promptsTotal) || o.promptsTotal <= 0 || !Number.isInteger(o.promptsRight) || o.promptsRight < 0 || o.promptsRight > o.promptsTotal
    || !Number.isFinite(o.coverageAtPick) || o.coverageAtPick < 0 || o.coverageAtPick > 1
    || !count(o.lookupCount) || !count(o.rescueUses) || (o.wordCount !== undefined && !(Number.isInteger(o.wordCount) && o.wordCount > 0))
    || (o.readingTimeSeconds !== undefined && !(Number.isFinite(o.readingTimeSeconds) && o.readingTimeSeconds > 0)) || !Number.isFinite(Date.parse(completedAt))) {
    reasons.push('Check observations or completion date are invalid');
  }
  if (reasons.length) throw new Error(reasons.join('; '));
  const values: Partial<Record<UnseenMeasure, number>> = { comprehension: o.promptsRight / o.promptsTotal };
  if (o.lookupCount !== undefined) values.lookups = o.wordCount ? (o.lookupCount * 100) / o.wordCount : o.lookupCount;
  if (o.rescueUses !== undefined) values['rescue-use'] = o.rescueUses;
  if (o.readingTimeSeconds !== undefined) values['reading-time'] = o.readingTimeSeconds;
  return {
    exitEvidence: { kind: 'unseen-reading', measures: Object.keys(values), certification: false },
    values, textId: context.text.id, userId: context.userId, completedAt,
    promptsRight: o.promptsRight, promptsTotal: o.promptsTotal, coverageAtPick: o.coverageAtPick,
    dimension: 'reading', cefrCertification: false,
  };
}

interface StoredAttempt {
  id: string;
  userId: string;
  assessmentId: string;
  textId: string;
  workId?: string;
  startedAt: string;
  status: 'started' | 'completed';
  result?: ReturnType<typeof recordReadingAssessment>;
}
/** Held-out exposure/results live in meta, never ordinary encounter or mastery tables. */
export function createReadingAssessmentService(store: AppStore, specs: readonly ReadingAssessmentSpec[], recommendedTextIds: (userId: string) => Promise<ReadonlySet<string>>, clock: () => string = () => new Date().toISOString()) {
  const key = (userId: string, assessmentId: string) => `reading-assessment-attempt:${encodeURIComponent(userId)}:${encodeURIComponent(assessmentId)}`;
  const attempts = async (userId: string): Promise<StoredAttempt[]> => (await store.meta.all()).filter(row => row.id.startsWith(`reading-assessment-attempt:${encodeURIComponent(userId)}:`)).map(row => JSON.parse(row.value) as StoredAttempt);
  async function contextFor(userId: string, spec: ReadingAssessmentSpec, recommendations: ReadonlySet<string>, ownAttemptId?: string): Promise<AssessmentContext> {
    const [text, encounters, events, texts, previous, source, stage] = await Promise.all([
      store.texts.get(spec.textId), store.encounters.where('userId', userId), store.events.where('userId', userId), store.texts.all(), attempts(userId),
      store.texts.get(spec.textId).then(t => t ? store.sources.get(t.sourceId) : undefined), store.stages.get(spec.stageId),
    ]);
    if (!text || text.readingAssessmentId !== spec.id) throw new Error('Text is not registered as this held-out reading assessment');
    if (!source || ['unverified', 'personal-copy', 'user-private'].includes(source.rights)) throw new Error('Stored assessment source rights are not cleared');
    if (!stage || stage.lang !== spec.language) throw new Error('Assessment comparability references no matching stage');
    const seen = new Set(encounters.map(e => e.textId));
    for (const event of events) if ('textId' in event && typeof event.textId === 'string') seen.add(event.textId);
    for (const attempt of previous) if (attempt.id !== ownAttemptId) seen.add(attempt.textId);
    const seenWorks = new Set(texts.filter(t => t.workId && seen.has(t.id)).map(t => t.workId!));
    for (const attempt of previous) if (attempt.id !== ownAttemptId && attempt.workId) seenWorks.add(attempt.workId);
    return { userId, text, encounteredTextIds: seen, encounteredWorkIds: seenWorks, courseTextIds: new Set(texts.filter(t => t.workId && !t.readingAssessmentId).map(t => t.id)), recommendedTextIds: recommendations };
  }
  return {
    async start(userId: string, assessmentId: string) {
      const spec = specs.find(s => s.id === assessmentId);
      if (!spec) throw new Error('No approved reading assessment registry entry');
      const recommendations = await recommendedTextIds(userId);
      return store.transaction(['meta', 'texts', 'sources', 'stages', 'events', 'encounters'], async () => {
        const context = await contextFor(userId, spec, recommendations);
        const reasons = validateReadingAssessment(spec, context);
        if (reasons.length) throw new Error(reasons.join('; '));
        const startedAt = clock();
        const attempt: StoredAttempt = { id: key(userId, assessmentId), userId, assessmentId, textId: spec.textId, workId: context.text.workId, startedAt, status: 'started' };
        await store.meta.put({ id: attempt.id, value: JSON.stringify(attempt), updatedAt: startedAt });
        return structuredClone(attempt);
      });
    },
    async submit(userId: string, assessmentId: string, observation: ReadingAssessmentObservation) {
      const spec = specs.find(s => s.id === assessmentId);
      if (!spec) throw new Error('No approved reading assessment registry entry');
      const recommendations = await recommendedTextIds(userId);
      return store.transaction(['meta', 'texts', 'sources', 'stages', 'events', 'encounters'], async () => {
        const row = await store.meta.get(key(userId, assessmentId));
        if (!row) throw new Error('Start the unseen assessment before submitting results');
        const attempt = JSON.parse(row.value) as StoredAttempt;
        if (attempt.status !== 'started') throw new Error('Assessment attempt already completed');
        const context = await contextFor(userId, spec, recommendations, attempt.id);
        const completedAt = clock();
        const result = recordReadingAssessment(spec, context, observation, completedAt);
        await store.meta.put({ id: attempt.id, value: JSON.stringify({ ...attempt, status: 'completed', result }), updatedAt: completedAt });
        return result;
      });
    },
    results: async (userId: string) => (await attempts(userId)).filter(a => a.status === 'completed').map(a => a.result!),
  };
}
