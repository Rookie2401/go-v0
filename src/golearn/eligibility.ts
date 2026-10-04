/**
 * Listening eligibility. Only REVIEWED HUMAN (real) speech is listening evidence. Synthetic speech may be played as practice but
 * never counts, whatever its quality state, voice audition or rights: it is excluded as `synthetic-audio` ("exposure only").
 *
 * What is read from where (evidence@8):
 *   - identity and lawfulness are checked LIVE against the store, because they can be revoked: the asset and its stored bytes, rights,
 *     exact text binding (textId / contentVersion / SHA-256 / release / edition), voice review, human quality not downgraded.
 *     A change to any of them is applied by `invalidateListening` (index.ts), which rebuilds from the log;
 *   - the DESCRIPTIVE facts (narrator, variety, locale, quality wording) are the event's own snapshot and are never compared with
 *     the asset as it is today, so a legitimate later edit of a description cannot orphan history.
 *
 * Credit: a completion counts only with `audibleCoverageVersion === 'observed-playback@1'` and a finite ratio in [0, 1]. A one-sentence
 * segment is credited at LISTEN_CREDIT.single; a longer passage only when essentially complete (LISTEN_CREDIT.passage) — between
 * the two it credits nothing (`partial-passage`); an event that names `heardSentenceIds` credits exactly those. A legacy completion
 * (no observation) counts for nothing (`insufficient-audible-coverage`): nothing real was ever observed by it.
 */
import { REVIEW_OK } from '../core';
import type { AudioAsset, AudioSegment, DomainEvent, EvidenceAudit, VoiceConfig } from '../core';
import type { Ctx } from './state';
import { LISTEN_CREDIT } from './policy';
import { approvedForPlay, currentBindingValid } from '../golisten/rights';

export type AudioCompleted = Extract<DomainEvent, { type: 'AudioSegmentCompleted' }>;
export type Verdict =
  | { eligible: true; /** the sentences of the event this pass is credited for (a subset of `sentenceIds`, in event order) */ creditedSentenceIds: string[] }
  | { eligible: false; reason: EvidenceAudit['excluded'][number]['reason'] };

const isFixtureAsset = (a: AudioAsset) => a.isSpeech === false || a.generation?.providerId === 'fixture';
const HUMAN_QUALITY: ReadonlySet<string> = new Set(['human_reviewed', 'approved']);

export async function listenVerdict(ctx: Ctx, e: AudioCompleted): Promise<Verdict> {
  if (e.speech === false) return { eligible: false, reason: 'non-speech-audio' };
  const segment: AudioSegment | undefined = await ctx.store.audioSegments.get(e.segmentId);
  // Older log rows predate the asset snapshot and resolve through their persisted segment (they are excluded below by coverage,
  // but the audit still names the asset they would have meant).
  const resolvedAssetId = e.assetId ?? (e.audibleCoverageVersion === undefined ? segment?.assetId : undefined);
  if (!segment || !resolvedAssetId || (e.assetId !== undefined && segment.assetId !== e.assetId) || segment.textId !== e.textId) return { eligible: false, reason: 'unknown-asset' };
  const asset = await ctx.store.audioAssets.get(resolvedAssetId);
  if (!asset || !(await ctx.store.assets.has(resolvedAssetId))) return { eligible: false, reason: 'unknown-asset' };
  if (isFixtureAsset(asset)) return { eligible: false, reason: 'non-speech-audio' };
  if ((await ctx.store.texts.get(e.textId))?.listeningAssessmentId) return { eligible: false, reason: 'assessment-material' };
  const audioKind = asset.audioKind ?? (asset.sourceType === 'generated-tts' ? 'synthetic' : asset.sourceType === 'human-recording' || asset.sourceType === 'licensed-recording' ? 'human' : undefined);
  if (!audioKind) return { eligible: false, reason: 'unknown-asset' };
  // Synthetic speech is practice, never evidence — whatever its review, rights or coverage.
  if (audioKind === 'synthetic') return { eligible: false, reason: 'synthetic-audio' };
  if (!approvedForPlay(asset.rights) || e.rightsApproved === false || (e.rightsId !== undefined && e.rightsId !== asset.rights.id)) return { eligible: false, reason: 'rights-not-cleared' };

  // Observed coverage: no observation, no credit.
  const ratio = e.heardCoverageRatio;
  if (e.audibleCoverageVersion !== 'observed-playback@1' || typeof ratio !== 'number' || !Number.isFinite(ratio) || ratio < 0 || ratio > 1) return { eligible: false, reason: 'insufficient-audible-coverage' };

  const text = await ctx.store.texts.get(e.textId);
  if (!text || (e.contentVersion !== undefined && text.contentVersion !== e.contentVersion) || segment.contentVersion !== text.contentVersion) return { eligible: false, reason: 'stale-text-binding' };
  const binding = asset.textBinding;
  if (!binding || e.exactTextBound === false || binding.textId !== e.textId || binding.contentVersion !== text.contentVersion
    || (e.textSha256 !== undefined && binding.textSha256 !== e.textSha256) || (e.releaseId !== undefined && binding.releaseId !== e.releaseId) || (e.editionId !== undefined && binding.editionId !== e.editionId)
    || !(await currentBindingValid(ctx.store, asset))) return { eligible: false, reason: 'stale-text-binding' };
  if (segment.sentenceIds.length !== e.sentenceIds.length || segment.sentenceIds.some((id) => !e.sentenceIds.includes(id))) return { eligible: false, reason: 'sentence-mismatch' };
  for (const id of e.sentenceIds) {
    const sentence = await ctx.store.sentences.get(id);
    if (!sentence || sentence.textId !== e.textId || sentence.retiredInVersion !== undefined) return { eligible: false, reason: 'sentence-mismatch' };
  }
  // What was heard and whether it was lawful: the source and the kind. (Narrator, variety, locale and quality wording are the
  // event's snapshot; they are not compared with the asset's present description.)
  if ((e.sourceType !== undefined && e.sourceType !== asset.sourceType) || (e.audioKind !== undefined && e.audioKind !== audioKind)) return { eligible: false, reason: 'unknown-asset' };
  // Human recordings need human QA — as the event recorded it, and not downgraded or rejected since.
  const quality = e.qualityState ?? asset.qualityState;
  if (!HUMAN_QUALITY.has(quality as string) || !HUMAN_QUALITY.has(asset.qualityState as string)) return { eligible: false, reason: 'machine-checked-audio' };
  const voice: VoiceConfig | undefined = await ctx.store.voices.get(segment.voiceConfigId);
  if (asset.isSpeech !== true || (voice && voice.isSpeech !== true)) return { eligible: false, reason: 'non-speech-audio' };
  if (e.voiceReviewed === false || (voice && !REVIEW_OK.includes(voice.reviewStatus))) return { eligible: false, reason: 'unreviewed-voice' };
  // A human recording is audited by its own quality state (above), so a missing voice row is no obstacle.

  // Which sentences were heard.
  if (e.heardSentenceIds !== undefined) {
    const heard = new Set(e.heardSentenceIds);
    if ([...heard].some((id) => !e.sentenceIds.includes(id))) return { eligible: false, reason: 'sentence-mismatch' };
    const credited = e.sentenceIds.filter((id) => heard.has(id));
    return credited.length > 0 ? { eligible: true, creditedSentenceIds: credited } : { eligible: false, reason: 'insufficient-audible-coverage' };
  }
  if (ratio < LISTEN_CREDIT.single) return { eligible: false, reason: 'insufficient-audible-coverage' };
  if (e.sentenceIds.length > 1 && ratio < LISTEN_CREDIT.passage) return { eligible: false, reason: 'partial-passage' };
  return { eligible: true, creditedSentenceIds: [...e.sentenceIds] };
}

/**
 * Whether a text has at least one lawful, exact-bound, reviewed HUMAN recording whose bytes are stored — the only audio that can ever
 * produce listening evidence. A text voiced only by synthetic speech has none (so listening is never recommended "as real speech").
 */
export async function hasHumanReviewedRecording(ctx: Ctx, textId: string): Promise<boolean> {
  const seen = new Set<string>();
  for (const seg of await ctx.store.audioSegments.where('textId', textId)) {
    if (!seg.assetId || seen.has(seg.assetId)) continue;
    seen.add(seg.assetId);
    const asset = await ctx.store.audioAssets.get(seg.assetId);
    if (!asset || isFixtureAsset(asset) || asset.isSpeech !== true) continue;
    const kind = asset.audioKind ?? (asset.sourceType === 'human-recording' || asset.sourceType === 'licensed-recording' ? 'human' : undefined);
    if (kind !== 'human' || !HUMAN_QUALITY.has(asset.qualityState as string)) continue;
    if (!(await ctx.store.assets.has(asset.id)) || !approvedForPlay(asset.rights) || !(await currentBindingValid(ctx.store, asset))) continue;
    return true;
  }
  return false;
}
