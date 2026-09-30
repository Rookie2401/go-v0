/**
 * Rule 5 — only reviewed real speech can count for listening.
 *
 * A listening completion is eligible only if its audio is real speech from a reviewed voice:
 *  - New events state it: `speech: true` AND `voiceReviewed: true` (both must be present and true). `speech: false` →
 *    non-speech-audio; `voiceReviewed: false` → unreviewed-voice.
 *  - Legacy events (no `speech` flag) are resolved segment → asset → voice from the store: an asset that is
 *    `isSpeech === false`, or whose generation provider is `fixture`, is non-speech-audio; a voice whose reviewStatus is
 *    not in REVIEW_OK (or not found) is an unreviewed-voice; no segment/asset row at all is unknown-asset.
 * Even for new events a stored asset that says `isSpeech === false` wins (fixtures can never produce evidence).
 * Excluded events stay in the log untouched; `auditEvidence` reports them.
 */
import { REVIEW_OK } from '../core';
import type { AudioAsset, AudioSegment, DomainEvent, EvidenceAudit, VoiceConfig } from '../core';
import type { Ctx } from './state';

export type AudioCompleted = Extract<DomainEvent, { type: 'AudioSegmentCompleted' }>;
export type Verdict = { eligible: true } | { eligible: false; reason: EvidenceAudit['excluded'][number]['reason'] };

const isFixtureAsset = (a: AudioAsset) => a.isSpeech === false || a.generation?.providerId === 'fixture';

export async function listenVerdict(ctx: Ctx, e: AudioCompleted): Promise<Verdict> {
  if (e.speech === false) return { eligible: false, reason: 'non-speech-audio' };
  const segment: AudioSegment | undefined = await ctx.store.audioSegments.get(e.segmentId);
  const assetId = e.assetId ?? segment?.assetId;
  const asset = assetId ? await ctx.store.audioAssets.get(assetId) : undefined;
  if (asset && isFixtureAsset(asset)) return { eligible: false, reason: 'non-speech-audio' };

  if (e.speech === true) {
    if (e.voiceReviewed !== true) return { eligible: false, reason: 'unreviewed-voice' };
    return { eligible: true };
  }

  // Legacy event: nothing was recorded on the event, so the store must prove it.
  if (!segment && !asset) return { eligible: false, reason: 'unknown-asset' };
  if (!asset) return { eligible: false, reason: 'unknown-asset' };
  if (asset.isSpeech !== true) return { eligible: false, reason: 'unknown-asset' }; // predates the flag and is not a fixture: unproven
  const voice: VoiceConfig | undefined = segment ? await ctx.store.voices.get(segment.voiceConfigId) : undefined;
  if (voice && voice.isSpeech === false) return { eligible: false, reason: 'non-speech-audio' };
  if (!voice || !REVIEW_OK.includes(voice.reviewStatus)) return { eligible: false, reason: 'unreviewed-voice' };
  return { eligible: true };
}
