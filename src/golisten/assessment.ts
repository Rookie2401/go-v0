/**
 * Guardrails for a future listening transfer check. No assessment text is currently registered, so the
 * public availability check fails closed. The only captured outcome is explicitly learner self-report;
 * this module does not produce a listening level or CEFR claim.
 */
import type { EventBus, ListeningAssessmentStarted, ListeningAssessmentSubmitted } from '../core/events';
import type { AppStore } from '../core/store';
import type { LanguageCode, Text } from '../core/model';
import { approvedForPlay, currentBindingValid } from './rights';

export interface ListeningAssessmentRegistryEntry {
  id: string;
  textId: string;
  manifestId: string;
  contentVersion: number;
  sentenceIds: string[];
  approved: true;
  basis: 'learner-self-report-only';
}

export interface ListeningAssessmentAttempt {
  attemptId: string;
  textId: string;
  manifestId: string;
  contentVersion: number;
  sentenceIds: string[];
  /** The session namespace keeps standard training play events tied to this challenge. */
  session: string;
  speed: 1;
  transcriptHidden: true;
  preview: false;
}

export type ListeningAssessmentAvailability =
  | { state: 'unavailable'; reason: string }
  | { state: 'contaminated'; reason: string }
  | { state: 'ready'; text: Text; entry: ListeningAssessmentRegistryEntry };

const lockId = (assessmentId: string) => `listening-assessment-registry:${assessmentId}`;

/** Check a protected, exact, previously unheard item. Missing registry rows are unavailable, never inferred. */
export async function listeningAssessmentAvailability(
  store: AppStore, userId: string, textId: string, opts: { preview?: boolean } = {},
): Promise<ListeningAssessmentAvailability> {
  if (opts.preview) return { state: 'unavailable', reason: 'Assessment mode is disabled in preview.' };
  const text = await store.texts.get(textId);
  if (!text || !text.published) return { state: 'unavailable', reason: 'The protected assessment text is not published.' };
  const id = (text as Text & { listeningAssessmentId?: string }).listeningAssessmentId;
  if (!id) return { state: 'unavailable', reason: 'This text is not registered for listening assessment.' };
  const row = await store.meta.get(lockId(id));
  if (!row) return { state: 'unavailable', reason: 'No approved assessment registry entry exists for this text.' };
  let entry: ListeningAssessmentRegistryEntry;
  try { entry = JSON.parse(row.value) as ListeningAssessmentRegistryEntry; }
  catch { return { state: 'unavailable', reason: 'The assessment registry entry is invalid.' }; }
  if (entry.approved !== true || entry.basis !== 'learner-self-report-only' || entry.id !== id || entry.textId !== textId
    || entry.contentVersion !== text.contentVersion || !Array.isArray(entry.sentenceIds) || entry.sentenceIds.length === 0
    || new Set(entry.sentenceIds).size !== entry.sentenceIds.length) {
    return { state: 'unavailable', reason: 'The approved assessment entry does not match the current text release.' };
  }
  const manifest = await store.manifests.get(entry.manifestId);
  if (!manifest || manifest.textId !== text.id || manifest.contentVersion !== text.contentVersion) return { state: 'unavailable', reason: 'Approved audio for this exact text release is unavailable.' };
  const segments = (await store.audioSegments.getMany(manifest.segmentIds)).filter((s) => !!s);
  const ids = segments.flatMap((s) => s.sentenceIds);
  if (ids.length !== entry.sentenceIds.length || new Set(ids).size !== ids.length || entry.sentenceIds.some((id) => !ids.includes(id))) {
    return { state: 'unavailable', reason: 'The audio does not cover the registered assessment units exactly.' };
  }
  for (const segment of segments) {
    if (segment.status !== 'ready' || segment.textId !== text.id || segment.contentVersion !== text.contentVersion || !segment.assetId) return { state: 'unavailable', reason: 'A registered assessment audio unit is not ready.' };
    const asset = await store.audioAssets.get(segment.assetId);
    const voice = await store.voices.get(segment.voiceConfigId);
    if (!asset || !(await store.assets.has(asset.id)) || asset.audioKind !== 'human' || asset.isSpeech !== true
      || !['human_reviewed', 'approved'].includes(asset.qualityState ?? '') || !approvedForPlay(asset.rights)
      || !(await currentBindingValid(store, asset)) || (voice && (voice.isSpeech !== true || !['reviewed', 'approved'].includes(voice.reviewStatus)))) {
      return { state: 'unavailable', reason: 'Assessment requires current, approved, human-reviewed speech with cleared playback rights.' };
    }
  }
  const userEvents = await store.events.where('userId', userId);
  const targetSentences = new Set(entry.sentenceIds);
  const targetRows = (await store.sentences.getMany(entry.sentenceIds)).filter((s) => !!s);
  if (targetRows.length !== entry.sentenceIds.length || targetRows.some((s) => s.textId !== textId || s.retiredInVersion !== undefined)) return { state: 'unavailable', reason: 'An assessment sentence is missing or retired.' };
  const targetHashes = new Set(targetRows.map((s) => s.textHash));
  let trained = userEvents.some((e) =>
    e.type === 'TextViewed' && e.textId === textId
    || e.type === 'TranscriptRevealed' && e.textId === textId
    || (e.type === 'AudioPlayed' || e.type === 'AudioSegmentCompleted' || e.type === 'AudioAbandoned') && e.textId === textId
    || e.type === 'ListeningAssessmentStarted' && e.textId === textId,
  );
  if (!trained) for (const e of userEvents) {
    const seenIds = e.type === 'SentenceViewed' ? [e.sentenceId]
      : e.type === 'EnglishRescueRevealed' || e.type === 'ComprehensionReported' ? e.sentenceIds
      : e.type === 'AudioPlayed' || e.type === 'AudioSegmentCompleted' || e.type === 'AudioAbandoned' || e.type === 'TranscriptRevealed' ? e.sentenceIds : [];
    if (seenIds.some((id) => targetSentences.has(id))) { trained = true; break; }
    if (seenIds.length) {
      const rows = await store.sentences.getMany(seenIds);
      if (rows.some((s) => !!s && targetHashes.has(s.textHash))) { trained = true; break; }
    }
  }
  if (trained) return { state: 'contaminated', reason: 'This learner has already read or heard the protected material.' };
  return { state: 'ready', text, entry };
}

/** Starts only in locked, unseen, normal-speed, transcript-hidden, non-preview mode. */
export async function startListeningAssessment(
  store: AppStore, bus: EventBus, args: { userId: string; lang: LanguageCode; textId: string; sessionId: string; preview?: boolean; clock?: () => string },
): Promise<{ state: 'unavailable' | 'contaminated'; reason: string } | { state: 'ready'; attempt: ListeningAssessmentAttempt; event: ListeningAssessmentStarted }> {
  const availability = await listeningAssessmentAvailability(store, args.userId, args.textId, { preview: args.preview });
  if (availability.state !== 'ready') return { state: availability.state, reason: availability.reason };
  if (args.lang !== availability.text.lang) return { state: 'unavailable', reason: 'The requested language does not match the registered assessment text.' };
  const attemptId = `listen-assessment:${args.userId}:${availability.entry.id}:${args.sessionId}`;
  const attempt: ListeningAssessmentAttempt = {
    attemptId, textId: args.textId, manifestId: availability.entry.manifestId, contentVersion: availability.entry.contentVersion,
    sentenceIds: [...availability.entry.sentenceIds], session: `assessment:${attemptId}`, speed: 1, transcriptHidden: true, preview: false,
  };
  const at = args.clock?.() ?? new Date().toISOString();
  const event = await bus.emit<ListeningAssessmentStarted>({
    type: 'ListeningAssessmentStarted', userId: args.userId, lang: args.lang, at, surface: 'listen',
    session: attempt.session, dedupeKey: `ListeningAssessmentStarted|${attemptId}`,
    attemptId, textId: attempt.textId, manifestId: attempt.manifestId, contentVersion: attempt.contentVersion,
    sentenceIds: attempt.sentenceIds, transcriptHidden: true, speed: 1, preview: false,
  });
  return event ? { state: 'ready', attempt, event } : { state: 'contaminated', reason: 'This assessment attempt was already recorded.' };
}

/** Records only a self-report and marks transcript reveal, slowdown or incomplete audio as contaminated. */
export async function submitListeningAssessment(
  store: AppStore, bus: EventBus, args: { userId: string; lang: LanguageCode; attempt: ListeningAssessmentAttempt; report: ListeningAssessmentSubmitted['report']; clock?: () => string },
): Promise<ListeningAssessmentSubmitted | null> {
  const rows = (await store.events.where('userId', args.userId)).filter((e): e is ListeningAssessmentStarted => e.type === 'ListeningAssessmentStarted' && e.attemptId === args.attempt.attemptId);
  const started = rows[0];
  if (rows.length !== 1 || !started || started.textId !== args.attempt.textId || started.manifestId !== args.attempt.manifestId || started.session !== args.attempt.session
    || started.contentVersion !== args.attempt.contentVersion || started.speed !== 1 || started.transcriptHidden !== true || started.preview !== false
    || args.attempt.speed !== 1 || args.attempt.transcriptHidden !== true || args.attempt.preview !== false
    || JSON.stringify(started.sentenceIds) !== JSON.stringify(args.attempt.sentenceIds)
    || started.lang !== args.lang || !args.attempt.session.startsWith(`assessment:${args.attempt.attemptId}`)) return null;
  const current = await store.texts.get(started.textId);
  if (!current || args.lang !== current.lang) return null;
  const lock = current?.listeningAssessmentId ? await store.meta.get(lockId(current.listeningAssessmentId)) : undefined;
  let registry: ListeningAssessmentRegistryEntry | undefined;
  try { if (lock) registry = JSON.parse(lock.value) as ListeningAssessmentRegistryEntry; } catch { return null; }
  if (!current || !current.published || current.contentVersion !== started.contentVersion || current.listeningAssessmentId !== registry?.id
    || registry?.approved !== true || registry.basis !== 'learner-self-report-only' || registry.textId !== started.textId
    || registry.manifestId !== started.manifestId || registry.contentVersion !== started.contentVersion
    || JSON.stringify(registry.sentenceIds) !== JSON.stringify(started.sentenceIds)) return null;
  const manifest = await store.manifests.get(started.manifestId);
  if (!manifest || manifest.textId !== started.textId || manifest.contentVersion !== current.contentVersion) return null;
  const segments = (await store.audioSegments.getMany(manifest.segmentIds)).filter((s) => !!s);
  for (const segment of segments) {
    const asset = segment.assetId ? await store.audioAssets.get(segment.assetId) : undefined;
    const voice = await store.voices.get(segment.voiceConfigId);
    if (segment.status !== 'ready' || !asset || !(await store.assets.has(asset.id)) || asset.audioKind !== 'human' || asset.isSpeech !== true
      || !['human_reviewed', 'approved'].includes(asset.qualityState ?? '') || !approvedForPlay(asset.rights)
      || !(await currentBindingValid(store, asset)) || !voice || voice.isSpeech !== true || !['reviewed', 'approved'].includes(voice.reviewStatus)) return null;
  }
  const session = (await store.events.where('session', args.attempt.session)).filter((e) => e.userId === args.userId && e.lang === args.lang);
  const reasons = new Set<string>();
  const completedSentences = new Set<string>();
  const challengeIds = new Set(started.sentenceIds);
  const challengeRows = (await store.sentences.getMany(started.sentenceIds)).filter((s) => !!s);
  const challengeHashes = new Set(challengeRows.map((s) => s.textHash));
  for (const e of session) {
    if ((e.type === 'TextViewed' && e.textId === started.textId)
      || (e.type === 'SentenceViewed' && challengeIds.has(e.sentenceId))
      || ((e.type === 'EnglishRescueRevealed' || e.type === 'ComprehensionReported') && e.sentenceIds.some((id) => challengeIds.has(id)))) reasons.add('assessment-material-opened-for-training');
    if (e.type === 'SentenceViewed' || e.type === 'EnglishRescueRevealed' || e.type === 'ComprehensionReported') {
      const ids = e.type === 'SentenceViewed' ? [e.sentenceId] : e.sentenceIds;
      if (!ids.some((id) => challengeIds.has(id))) {
        const rows = await store.sentences.getMany(ids);
        if (rows.some((s) => !!s && challengeHashes.has(s.textHash))) reasons.add('matching-assessment-text-seen');
      }
    }
    if (e.type === 'PlaybackSpeedChanged' && (e.to !== 1 || e.from !== 1)) reasons.add('playback-speed-changed');
    if (e.type === 'TranscriptRevealed' || (e.type === 'AudioSegmentCompleted' && (e.transcriptVisible || e.revealedTranscript || e.revealedTranslation))) reasons.add('transcript-or-translation-revealed');
    if (e.type === 'AudioPlayed' && (e.speed !== 1 || e.transcriptVisible)) reasons.add('non-challenge-playback-conditions');
    if (e.type === 'AudioSegmentCompleted' && e.textId === started.textId && Number.isFinite(e.heardCoverageRatio) && e.heardCoverageRatio! >= 0.8 && e.heardCoverageRatio! <= 1
      && e.audibleCoverageVersion === 'observed-playback@1' && e.speed === 1 && !e.transcriptVisible && !e.revealedTranscript && !e.revealedTranslation) {
      const segment = segments.find((s) => s.id === e.segmentId);
      const asset = segment?.assetId ? await store.audioAssets.get(segment.assetId) : undefined;
      const voice = segment ? await store.voices.get(segment.voiceConfigId) : undefined;
      const binding = asset?.textBinding;
      if (!segment || segment.textId !== started.textId || segment.contentVersion !== started.contentVersion || !manifest.segmentIds.includes(segment.id)
        || JSON.stringify([...segment.sentenceIds].sort()) !== JSON.stringify([...e.sentenceIds].sort())
        || !asset || e.assetId !== asset.id || e.rightsApproved !== true || e.exactTextBound !== true
        || e.rightsId !== asset.rights?.id || e.textSha256 !== binding?.textSha256
        || e.contentVersion !== started.contentVersion || e.releaseId !== binding?.releaseId || e.editionId !== binding?.editionId
        || e.audioKind !== asset.audioKind || e.qualityState !== asset.qualityState || e.sourceType !== asset.sourceType
        || !asset || asset.audioKind !== 'human' || asset.qualityState !== 'human_reviewed' && asset.qualityState !== 'approved'
        || !approvedForPlay(asset.rights) || !(await currentBindingValid(store, asset)) || (voice && (voice.isSpeech !== true || !['reviewed', 'approved'].includes(voice.reviewStatus)))) {
        reasons.add('audio-rights-or-review-invalid');
      } else for (const sid of e.sentenceIds) completedSentences.add(sid);
    }
  }
  const complete = args.attempt.sentenceIds.every((sid) => completedSentences.has(sid));
  const validity = reasons.size ? 'contaminated' : complete ? 'uncontaminated' : 'not-completed';
  return bus.emit<ListeningAssessmentSubmitted>({
    type: 'ListeningAssessmentSubmitted', userId: args.userId, lang: args.lang,
    at: args.clock?.() ?? new Date().toISOString(), surface: 'listen', session: args.attempt.session,
    dedupeKey: `ListeningAssessmentSubmitted|${args.attempt.attemptId}`, attemptId: args.attempt.attemptId,
    textId: args.attempt.textId, report: args.report, basis: 'learner-self-report', validity, contaminationReasons: [...reasons].sort(),
  });
}
