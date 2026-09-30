import { ids } from '../core/ids';
import type { AudioManifest, Sentence, Text } from '../core/model';
import type { AppStore } from '../core/store';
import type { Runtime } from './types';

/**
 * The sentences of the CURRENT content version, in reading order. Sentences retired by a later import
 * (`retiredInVersion`) are history only: they never get audio and never count toward completeness.
 * Order is `Sentence.index`, never derived from an id.
 */
export async function liveSentences(store: AppStore, textId: string): Promise<Sentence[]> {
  return (await store.sentences.where('textId', textId)).filter((s) => s.retiredInVersion === undefined).sort((a, b) => a.index - b.index);
}

/** complete = every live sentence of the text has a segment in the manifest and every one of them is ready. */
export async function manifestComplete(rt: Runtime, manifest: AudioManifest, sentenceCount: number): Promise<boolean> {
  if (manifest.segmentIds.length !== sentenceCount || sentenceCount === 0) return false;
  const segs = await rt.store.audioSegments.getMany([...new Set(manifest.segmentIds)]);
  return segs.every((s) => !!s && s.status === 'ready' && !!s.assetId);
}

/** Whole-text manifest: one entry per live sentence, in order, for every sentence whose segment exists (pending or ready). */
export async function writeManifest(rt: Runtime, text: Text, sentences: Sentence[], keyOf: Map<string, string>, voiceConfigId: string): Promise<AudioManifest> {
  const segmentIds: string[] = [];
  for (const s of sentences) {
    const key = keyOf.get(s.id);
    if (!key) continue;
    const id = ids.audioSegment(key);
    if (await rt.store.audioSegments.get(id)) segmentIds.push(id);
  }
  const id = ids.manifest(text.id, voiceConfigId, text.contentVersion);
  const existing = await rt.store.manifests.get(id);
  const now = rt.clock();
  const manifest: AudioManifest = {
    id, textId: text.id, lang: text.lang, voiceConfigId, contentVersion: text.contentVersion, segmentIds,
    complete: false, createdAt: existing?.createdAt ?? now, updatedAt: now,
  };
  manifest.complete = await manifestComplete(rt, manifest, sentences.length);
  await rt.store.manifests.put(manifest);
  return manifest;
}

/** Called when a job finishes: manifests containing the segment get their `complete` flag recomputed. */
export async function refreshManifestsFor(rt: Runtime, segmentId: string): Promise<void> {
  for (const m of await rt.store.manifests.all()) {
    if (!m.segmentIds.includes(segmentId)) continue;
    const text = await rt.store.texts.get(m.textId);
    if (!text || m.contentVersion !== text.contentVersion) continue; // an older version's manifest is history, not recomputed
    const count = (await liveSentences(rt.store, m.textId)).length;
    const complete = await manifestComplete(rt, m, count);
    if (complete !== m.complete) await rt.store.manifests.put({ ...m, complete, updatedAt: rt.clock() });
  }
}
