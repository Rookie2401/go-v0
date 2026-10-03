/** Listening eligibility is source-aware: human recordings need human QA; reviewed, authorized synthetic speech may support
 * ordinary listening practice, but never human/native transfer claims. Both require current lawful text binding. */
import { REVIEW_OK } from '../core';
import type { AudioAsset, AudioSegment, DomainEvent, EvidenceAudit, VoiceConfig } from '../core';
import type { Ctx } from './state';
import { approvedForPlay, currentBindingValid } from '../golisten/rights';

export type AudioCompleted = Extract<DomainEvent, { type: 'AudioSegmentCompleted' }>;
export type Verdict = { eligible: true } | { eligible: false; reason: EvidenceAudit['excluded'][number]['reason'] };

const isFixtureAsset = (a: AudioAsset) => a.isSpeech === false || a.generation?.providerId === 'fixture';

export async function listenVerdict(ctx: Ctx, e: AudioCompleted): Promise<Verdict> {
  if (e.speech === false) return { eligible: false, reason: 'non-speech-audio' };
  const segment: AudioSegment | undefined = await ctx.store.audioSegments.get(e.segmentId);
  // New observed-playback events bind the asset id into the event. Older log rows
  // predate that snapshot and resolve through their persisted segment instead.
  const resolvedAssetId = e.assetId ?? (e.audibleCoverageVersion === undefined ? segment?.assetId : undefined);
  if (!segment || !resolvedAssetId || (e.assetId !== undefined && segment.assetId !== e.assetId) || segment.textId !== e.textId) return { eligible: false, reason: 'unknown-asset' };
  const asset = await ctx.store.audioAssets.get(resolvedAssetId);
  if (!asset || !(await ctx.store.assets.has(resolvedAssetId))) return { eligible: false, reason: 'unknown-asset' };
  if (isFixtureAsset(asset)) return { eligible: false, reason: 'non-speech-audio' };
  if ((await ctx.store.texts.get(e.textId))?.listeningAssessmentId) return { eligible: false, reason: 'assessment-material' };
  const audioKind = asset.audioKind ?? (asset.sourceType === 'generated-tts' ? 'synthetic' : asset.sourceType === 'human-recording' || asset.sourceType === 'licensed-recording' ? 'human' : undefined);
  if (!audioKind) return { eligible: false, reason: 'unknown-asset' };
  if (!approvedForPlay(asset.rights) || e.rightsApproved === false || (e.rightsId !== undefined && e.rightsId !== asset.rights.id)) return { eligible: false, reason: 'rights-not-cleared' };
  // New events carry an observed coverage ratio; old completion events are kept under their former end-callback contract.
  if (e.audibleCoverageVersion === 'observed-playback@1' && (!Number.isFinite(e.heardCoverageRatio) || e.heardCoverageRatio! < 0.8 || e.heardCoverageRatio! > 1)) return { eligible: false, reason: 'insufficient-audible-coverage' };
  if (e.audibleCoverageVersion === undefined && e.rightsApproved !== undefined && e.heardCoverageRatio !== undefined
    && (!Number.isFinite(e.heardCoverageRatio) || e.heardCoverageRatio < 0 || e.heardCoverageRatio > 1)) return { eligible: false, reason: 'insufficient-audible-coverage' };
  if (e.audibleCoverageVersion === undefined && e.rightsApproved !== undefined && e.heardCoverageRatio !== undefined && e.heardCoverageRatio < 0.8) return { eligible: false, reason: 'insufficient-audible-coverage' };
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
  if ((e.sourceType !== undefined && e.sourceType !== asset.sourceType) || (e.audioKind !== undefined && e.audioKind !== asset.audioKind)
    || (e.qualityState !== undefined && e.qualityState !== asset.qualityState) || (e.narratorOrVoiceId !== undefined && e.narratorOrVoiceId !== asset.narratorOrVoiceId)
    || (e.variety !== undefined && e.variety !== asset.variety) || (e.locale !== undefined && e.locale !== asset.locale)) return { eligible: false, reason: 'unknown-asset' };
  if (audioKind === 'human' && asset.qualityState !== 'human_reviewed' && asset.qualityState !== 'approved') return { eligible: false, reason: 'machine-checked-audio' };
  if (audioKind === 'synthetic' && asset.qualityState !== 'machine_checked' && asset.qualityState !== 'human_reviewed' && asset.qualityState !== 'approved') return { eligible: false, reason: 'machine-checked-audio' };
  const voice: VoiceConfig | undefined = await ctx.store.voices.get(segment.voiceConfigId);
  if (asset.isSpeech !== true || (voice && voice.isSpeech !== true)) return { eligible: false, reason: 'non-speech-audio' };
  if (e.voiceReviewed === false || (voice && !REVIEW_OK.includes(voice.reviewStatus))) return { eligible: false, reason: 'unreviewed-voice' };
  const assetAuditioned = audioKind === 'human' && (asset.qualityState === 'human_reviewed' || asset.qualityState === 'approved');
  if (audioKind === 'synthetic' && (!voice || !REVIEW_OK.includes(voice.reviewStatus)
    || e.audibleCoverageVersion !== undefined && e.voiceReviewed !== true)) return { eligible: false, reason: 'unreviewed-voice' };
  if (e.voiceReviewed !== true && !voice && !assetAuditioned) return { eligible: false, reason: 'unreviewed-voice' };
  return { eligible: true };
}
