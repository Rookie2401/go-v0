/**
 * GoTell evidence: what a saved version tells the Repository, and what it does not.
 *
 * One `DraftSaved` per saved version and one `ProductionRecorded` per sentence. No event ever carries sentence text: a
 * sentence is identified by an FNV hash (`sentenceKey`) and the draft by its id; the words stay in the private document.
 * A sentence the learner copied from a model or had an AI write is HISTORY (`evidence.quality: 'none'`, assisted, never
 * `usedCorrectly: true`), not production credit. `usedCorrectly` is `true` only when the analysis found no issues in that
 * sentence and the checker covers it; accepting a correction never makes it true.
 *
 * Mapping (see README for the table):
 *   record.mode  guided|missionary|testimony → 'guided';  free|narrative → 'free';  targeted → 'retrieval'
 *   assistance level  1,2 → hint;  3 → example;  4 → correction;  5 → example;  6 → translation
 *   assisted = authorship is neither 'independent' nor 'reproduced-later' (or any help is listed)
 */
import { CONTRACT_VERSION, validateEvent } from '../../../repository-contract/src';
import type { AssistanceKind, GoEvent } from '../../../repository-contract/src';
import { newEventId } from '../../../repository-sync/src';
import { countWords, sentenceKey as hashSentence } from '../documents/text';
import { toDate, type TimeSource } from '../documents/time';
import type { AssistanceLevel, Authorship, DraftAnalysis, DraftRecord, DraftVersion, Identity, SentenceAnalysis, WritingEvidence, WritingMode } from '../types';

export const PRODUCER_VERSION = '1';
export const MAX_SUBJECT_UNITS = 24;

export type ObservationMode = 'free' | 'guided' | 'retrieval';

export function observationMode(mode: WritingMode): ObservationMode {
  switch (mode) {
    case 'guided': case 'missionary': case 'testimony': return 'guided';
    case 'targeted': return 'retrieval';
    default: return 'free';
  }
}

export function assistanceKind(level: AssistanceLevel): AssistanceKind {
  switch (level) {
    case 1: case 2: return 'hint';
    case 3: case 5: return 'example';
    case 4: return 'correction';
    default: return 'translation';
  }
}

export function assistanceKinds(levels: readonly AssistanceLevel[]): AssistanceKind[] {
  return [...new Set(levels.map(assistanceKind))];
}

export const isAssisted = (a: Authorship): boolean => a !== 'independent' && a !== 'reproduced-later';
/** History, not production: the learner did not write it. */
export const isNoCredit = (a: Authorship): boolean => a === 'copied-from-model' || a === 'ai-generated';

export interface EvidenceOptions {
  /** The analysis of the saved text. Used only for sentences whose text it matches exactly; a stale analysis is ignored. */
  analysis?: DraftAnalysis;
  /**
   * Whether the checker really looked at what this sentence needed. Default: `coverageParts.checked` and an analysis
   * that is not invalidated, conflicted or absent. A caller that knows better says so here.
   */
  checkerCovers?: (s: SentenceAnalysis) => boolean;
  /** The pack id for `provenance` (the analysis names an analyzer and a pack version, not a pack id). */
  packId?: string;
}

/**
 * Default: the checker really ran on the sentence (`coverageParts.checked`; the coverage line itself is never empty, it
 * always names the areas not checked) and the analysis it rests on is not invalidated, conflicted or absent. Found by the
 * §14 certification: the earlier default demanded an empty coverage line, so no sentence written through the app was
 * ever judged `usedCorrectly: true` and GoTell never contributed contextual-production evidence.
 */
const defaultCovers = (s: SentenceAnalysis): boolean =>
  s.coverageParts?.checked === true && s.analysisStatus !== 'invalidated' && s.analysisStatus !== 'conflicted' && s.analysisStatus !== 'none';

function base(identity: Identity, now: TimeSource, kind: GoEvent['kind'], subject: GoEvent['subject'], payload: Record<string, unknown>): GoEvent {
  const at = toDate(now);
  return {
    id: newEventId(identity.deviceId, at.getTime()), v: CONTRACT_VERSION, learnerId: identity.learnerId, enrolmentId: identity.enrolmentId,
    languageId: identity.languageId, ...(identity.varietyId ? { varietyId: identity.varietyId } : {}), at: at.toISOString(),
    producer: { app: 'gopractice-tell', version: PRODUCER_VERSION, deviceId: identity.deviceId, surface: 'writing' }, kind, subject, payload,
  };
}

const plural = (n: number, one: string, many: string): string => `${n} ${n === 1 ? one : many}`;

export function writingEvidence(record: DraftRecord, version: DraftVersion, identity: Identity, now: TimeSource, opts: EvidenceOptions = {}): WritingEvidence {
  const events: GoEvent[] = [];
  const mode = observationMode(record.mode);
  const analysis = opts.analysis && opts.analysis.draftId === record.draftId ? opts.analysis : undefined;
  const covers = opts.checkerCovers ?? defaultCovers;
  const sentences = version.sentences.filter((s) => /[\p{L}\p{N}]/u.test(s.text));
  const wordCount = countWords(version.text);

  events.push({
    ...base(identity, now, 'DraftSaved', { draftId: record.draftId }, { draftId: record.draftId, versionId: version.versionId, sentences: sentences.length, wordCount }),
    dedupeKey: `tell:saved:${record.draftId}:${version.versionId}`,
    evidence: { quality: 'none' },
  });

  const tally = { byAuthorship: new Map<Authorship, number>(), judgedTrue: 0, unjudged: 0 };
  const seen = new Set<string>();
  for (let i = 0; i < sentences.length; i++) {
    const s = sentences[i];
    const key = hashSentence(s.text);
    const noCredit = isNoCredit(s.authorship);
    const sa = analysis?.sentences.find((a) => a.text === s.text);
    const clean = !noCredit && !!sa && sa.issues.length === 0 && covers(sa) && (s.authorship === 'independent' || s.authorship === 'after-hint' || s.authorship === 'reproduced-later');
    const kinds: AssistanceKind[] = noCredit ? ['translation'] : assistanceKinds(s.assistance);
    const assisted = noCredit || isAssisted(s.authorship) || kinds.length > 0;
    const words = countWords(s.text);
    const units = noCredit || !sa ? [] : [...new Set(sa.unitIds)].slice(0, MAX_SUBJECT_UNITS);
    const usedCorrectly: boolean | 'unjudged' = clean ? true : 'unjudged';
    tally.byAuthorship.set(s.authorship, (tally.byAuthorship.get(s.authorship) ?? 0) + 1);
    if (clean) tally.judgedTrue++; else tally.unjudged++;
    // The same sentence in the same state is one observation, however many versions or saves repeat it.
    const dedupe = `tell:production:${record.draftId}:${key}:${s.authorship}`;
    if (seen.has(dedupe)) continue;
    seen.add(dedupe);

    const ev: GoEvent = {
      ...base(identity, now, 'ProductionRecorded', { ...(units.length ? { itemIds: units } : {}), sentenceKey: key, draftId: record.draftId, sourceRef: { kind: 'writing' } }, {
        mode, assisted, assistance: kinds, usedCorrectly, authorship: s.authorship, draftId: record.draftId, sentenceKey: key, wordCount: words,
      }),
      dedupeKey: dedupe,
      evidence: noCredit ? { quality: 'none', assisted: true } : { quality: clean && !assisted ? 'moderate' : 'weak', assisted, sourceReliability: clean ? 0.8 : 0.5 },
    };
    if (sa && !noCredit) {
      ev.processing = { packVersion: analysis!.packVersion };
      if (opts.packId) ev.provenance = { packId: opts.packId, analyzerId: analysis!.analyzerId, status: sa.analysisStatus === 'none' ? undefined : sa.analysisStatus };
    }
    events.push(ev);
  }

  for (const e of events) {
    const issues = validateEvent(e);
    if (issues.length) throw new Error(`GoTell built an invalid ${e.kind} event: ${issues.map((x) => `${x.path} ${x.message}`).join('; ')}`);
  }
  return { events, summary: summarise(version, sentences.length, wordCount, tally) };
}

function summarise(version: DraftVersion, n: number, words: number, t: { byAuthorship: Map<Authorship, number>; judgedTrue: number; unjudged: number }): string[] {
  const lines = [`Saved ${version.versionId} of this draft: ${plural(n, 'sentence', 'sentences')}, ${plural(words, 'word', 'words')}. Only counts and hashes were recorded; your text stays in your private document.`];
  const label: Record<Authorship, string> = {
    independent: 'independent', 'after-hint': 'written after a hint', 'revised-after-feedback': 'revised after feedback', 'reproduced-later': 'reproduced later',
    'copied-from-model': 'copied from a model', 'ai-generated': 'AI-generated',
  };
  const credited = [...t.byAuthorship].filter(([a]) => !isNoCredit(a));
  const creditedN = credited.reduce((m, [, c]) => m + c, 0);
  if (creditedN) {
    const judged = t.judgedTrue ? `${t.judgedTrue} judged correct by the checker${t.unjudged ? `, ${t.unjudged} unjudged` : ''}` : 'judged unjudged';
    lines.push(`${plural(creditedN, 'sentence', 'sentences')} recorded as ${credited.map(([a, c]) => (credited.length > 1 ? `${c} ${label[a]}` : label[a])).join(', ')}, ${judged}.`);
  }
  for (const a of ['copied-from-model', 'ai-generated'] as const) {
    const c = t.byAuthorship.get(a) ?? 0;
    if (c) lines.push(`${plural(c, 'sentence', 'sentences')} ${label[a]}: no production credit.`);
  }
  if (!n) lines.push('No sentences to record.');
  return lines;
}

// ───────────────────────────── corrections ─────────────────────────────

export interface CorrectionResponseInput {
  correctionId: string;
  issueIds: string[];
  categories: string[];
  /** The checker's note that a correction changes meaning (negation, chronology, a key term); description only, never learner text. */
  meaningChange?: string;
  draftId?: string;
  /** The hash of the sentence the correction was about. */
  sentenceKey?: string;
  /** The earlier event this refers to (typically the sentence's ProductionRecorded), when its id is known. */
  correctionOf?: string;
}

function correctionEvent(kind: 'CorrectionAccepted' | 'CorrectionRejected', input: CorrectionResponseInput, identity: Identity, now: TimeSource): GoEvent {
  const e: GoEvent = {
    ...base(identity, now, kind, { ...(input.draftId ? { draftId: input.draftId } : {}), ...(input.sentenceKey ? { sentenceKey: input.sentenceKey } : {}) }, {
      correctionId: input.correctionId, issueIds: [...input.issueIds], categories: [...input.categories],
      ...(input.meaningChange !== undefined ? { meaningChange: input.meaningChange.slice(0, 200) } : {}),
      ...(input.draftId ? { draftId: input.draftId } : {}),
    }),
    // one response per correction; repeating the click does not repeat the evidence
    dedupeKey: `tell:${kind === 'CorrectionAccepted' ? 'accepted' : 'rejected'}:${input.correctionId}`,
    // a response to a suggestion says the learner decided; it is not a demonstration of the language
    evidence: { quality: 'none', assisted: true },
  };
  if (input.correctionOf) e.correctionOf = input.correctionOf;
  const issues = validateEvent(e);
  if (issues.length) throw new Error(`GoTell built an invalid ${kind} event: ${issues.map((x) => `${x.path} ${x.message}`).join('; ')}`);
  return e;
}

export const correctionAccepted = (input: CorrectionResponseInput, identity: Identity, now: TimeSource): GoEvent => correctionEvent('CorrectionAccepted', input, identity, now);
export const correctionRejected = (input: CorrectionResponseInput, identity: Identity, now: TimeSource): GoEvent => correctionEvent('CorrectionRejected', input, identity, now);

/** Exposed for tests and callers that need the same key the events carry. */
export const sentenceKeyOf = hashSentence;
