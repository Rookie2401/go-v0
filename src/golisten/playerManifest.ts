import type { AudioManifest } from '../core/model';
import type { AppStore } from '../core/store';
import type { PlayerManifestInput } from './player';

/** Turns a stored AudioManifest into the plain input the player state machine consumes. */
export async function buildPlayerManifest(store: AppStore, manifest: AudioManifest): Promise<PlayerManifestInput> {
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
    segments.push({
      segmentId: seg.id,
      sentenceIds: seg.sentenceIds.filter((sid) => sid.startsWith(manifest.textId + '/')),
      ready: seg.status === 'ready' && !!seg.assetId && !!asset,
      assetId: seg.assetId, durationMs: asset?.durationMs, paragraphIndex: paragraph,
    });
  }
  return { manifestId: manifest.id, textId: manifest.textId, segments };
}
