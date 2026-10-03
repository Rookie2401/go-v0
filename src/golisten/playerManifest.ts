import type { AudioManifest } from '../core/model';
import type { AppStore } from '../core/store';
import type { PlayerManifestInput } from './player';
import { approvedForPlay, currentBindingValid } from './rights';

/** Turns a stored AudioManifest into the plain input the player state machine consumes. */
export async function buildPlayerManifest(store: AppStore, manifest: AudioManifest, opts: { allowFixture?: boolean } = {}): Promise<PlayerManifestInput> {
  const segs = await store.audioSegments.getMany(manifest.segmentIds);
  const paragraphIndex = new Map<string, number>();
  const segments: PlayerManifestInput['segments'] = [];
  for (let i = 0; i < manifest.segmentIds.length; i++) {
    const seg = segs[i];
    if (!seg) continue;
    let paragraph: number | undefined;
    const first = seg.sentenceIds.find((sid) => sid.startsWith(manifest.textId + '/'));
    if (first) {
      const sentence = await store.sentences.get(first);
      if (sentence) {
        if (!paragraphIndex.has(sentence.paragraphId)) paragraphIndex.set(sentence.paragraphId, (await store.paragraphs.get(sentence.paragraphId))?.index ?? 0);
        paragraph = paragraphIndex.get(sentence.paragraphId);
      }
    }
    const asset = seg.assetId ? await store.audioAssets.get(seg.assetId) : undefined;
    const alignments = await store.alignments.where('segmentId', seg.id);
    const alignment = asset?.textBinding ? alignments.find((a) => a.assetId === asset.id && a.unit === 'sentence' && a.unitId === first
      && a.reviewState === 'reviewed' && Number.isFinite(a.startMs) && Number.isFinite(a.endMs) && a.startMs >= 0 && a.endMs > a.startMs
      && a.endMs <= asset.durationMs && (a.startMs === 0 && a.endMs === asset.durationMs || asset.rights?.segment === true)) : undefined;
    const reviewedAlignmentIds = asset && alignments.filter((a) => a.assetId === asset.id && a.reviewState === 'reviewed'
      && Number.isFinite(a.startMs) && Number.isFinite(a.endMs) && a.startMs >= 0 && a.endMs > a.startMs && a.endMs <= asset.durationMs
      && (a.startMs === 0 && a.endMs === asset.durationMs || asset.rights?.segment === true)).map((a) => a.id);
    const reviewedAlignmentRanges = asset && alignments.filter((a) => a.assetId === asset.id && a.unit === 'phrase' && a.reviewState === 'reviewed'
      && Number.isFinite(a.startMs) && Number.isFinite(a.endMs) && a.startMs >= 0 && a.endMs > a.startMs && a.endMs <= asset.durationMs
      && (a.startMs === 0 && a.endMs === asset.durationMs || asset.rights?.segment === true))
      .map((a) => ({ id: a.id, unitId: a.unitId, unit: a.unit, startMs: a.startMs, endMs: a.endMs }));
    const exactTextBound = !!asset && await currentBindingValid(store, asset);
    const fixtureAllowed = opts.allowFixture === true && asset?.sourceType === 'generated-tts' && asset.isSpeech === false;
    const playAllowed = !!asset && (approvedForPlay(asset.rights, asset.audioKind) && exactTextBound || fixtureAllowed);
    const bytesPresent = !!asset && await store.assets.has(asset.id);
    segments.push({
      segmentId: seg.id,
      sentenceIds: seg.sentenceIds.filter((sid) => sid.startsWith(manifest.textId + '/')),
      ready: seg.status === 'ready' && !!seg.assetId && !!asset && bytesPresent && playAllowed,
      assetId: seg.assetId, durationMs: asset?.durationMs, paragraphIndex: paragraph,
      rangeMs: alignment ? { startMs: alignment.startMs, endMs: alignment.endMs } : undefined,
      sourceType: asset?.sourceType, narratorOrVoiceId: asset?.narratorOrVoiceId,
      audioKind: asset?.audioKind, qualityState: asset?.qualityState,
      playAllowed, offlineAllowed: approvedForPlay(asset?.rights, asset?.audioKind) && asset?.rights?.offline === true && exactTextBound,
      exactTextBound, variety: asset?.variety, alignmentReviewState: alignment?.reviewState, reviewedAlignmentIds, reviewedAlignmentRanges,
    });
  }
  return { manifestId: manifest.id, textId: manifest.textId, segments };
}
