/**
 * GoListen - audio pipeline + provider abstraction + listening events + DOM-free player logic.
 * See QA.md for what is verified (fixture audio only) and what is not (every real voice).
 */
import type { AudioAlignment, AudioAsset, AudioJob, AudioManifest, AudioSegment, LanguageCode, VoiceConfig } from '../core/model';
import type { GoListen, GoListenDiagnostics, TtsProvider } from '../core/contracts/golisten';
import { FIXTURE_PROVIDER_ID, FixtureTtsProvider } from './fixtureProvider';
import { runEligibleJobs } from './jobs';
import { ensureAudioForText, ensureSentenceAudioFor } from './pipeline';
import { GOLISTEN_VERSION, type GoListenDeps, type Runtime } from './types';
import { resolveVoiceConfig } from './voices';

export { computeCacheKey, type CacheKeyParts } from './cacheKey';
export { encodeWav, validateWav, inspectWav, type EncodeWavOptions, type ValidateWavOptions, type WavInspection, DEFAULT_SAMPLE_RATE } from './wav';
export { FixtureTtsProvider, FIXTURE_PROVIDER_ID, FIXTURE_ENGINE, FIXTURE_DISCLAIMER, fixtureChunks, renderFixtureChunks, type FixtureChunk } from './fixtureProvider';
export { listeningEmitter, emitPlayerEffects, type ListeningEmitter, type ListeningContext, type SegmentRef } from './events';
export {
  PlayerMachine, createPlayerModel, reducePlayer, clampSpeed, isTranscriptVisible, playableIndexes, MIN_SPEED, MAX_SPEED, SPEED_STEP,
  type PlayerAction, type PlayerEffect, type PlayerEmit, type PlayerModel, type PlayerManifestInput, type PlayerSegmentInfo, type PlayerOptions, type TranscriptMode, type EmitView,
} from './player';
export { buildPlayerManifest } from './playerManifest';
export { planSpeech, stripVerseMarkers, type SpeechPlan } from './pipeline';
export { GOLISTEN_VERSION, type GoListenDeps } from './types';

export interface GoListenService extends GoListen {
  /** Choose which registered provider resolveVoice uses for new voice configs. */
  setDefaultProvider(providerId: string): void;
  /** Re-queue dead jobs (all, or the given job id) for another round of attempts. */
  retryDead(jobId?: string): Promise<number>;
}

export function createGoListen(deps: GoListenDeps): GoListenService {
  const providers = new Map<string, TtsProvider>();
  const fixture = new FixtureTtsProvider();
  providers.set(fixture.id, fixture);
  for (const p of deps.providers ?? []) providers.set(p.id, p);
  const rt: Runtime = {
    store: deps.store, bus: deps.bus, adapters: deps.adapters,
    clock: deps.clock ?? (() => new Date().toISOString()),
    softwareVersion: deps.softwareVersion ?? GOLISTEN_VERSION,
    providers, settings: { ...(deps.settings ?? {}) },
    maxAttempts: deps.maxAttempts ?? 4, backoffBaseMs: deps.backoffBaseMs ?? 1000, backoffMaxMs: deps.backoffMaxMs ?? 300_000,
    inFlight: new Set(), defaultProviderId: deps.defaultProviderId ?? FIXTURE_PROVIDER_ID,
  };
  const { store } = rt;

  const segmentsForText = async (textId: string): Promise<AudioSegment[]> => {
    const manifests = await store.manifests.where('textId', textId);
    const idsSeen = new Set(manifests.flatMap((m) => m.segmentIds));
    const fromManifests = (await store.audioSegments.getMany([...idsSeen])).filter((s): s is AudioSegment => !!s);
    const own = await store.audioSegments.where('textId', textId); // e.g. testimony contexts have no manifest
    return [...new Map([...fromManifests, ...own].map((s) => [s.id, s])).values()];
  };

  return {
    registerProvider(p: TtsProvider) { rt.providers.set(p.id, p); },
    providers() { return [...rt.providers.values()]; },
    setDefaultProvider(providerId: string) {
      if (!rt.providers.has(providerId)) throw new Error(`GoListen: provider "${providerId}" is not registered`);
      rt.defaultProviderId = providerId;
    },
    resolveVoice(lang: LanguageCode, courseId?: string): Promise<VoiceConfig> { return resolveVoiceConfig(rt, lang, courseId); },
    ensureAudio: (textId, opts) => ensureAudioForText(rt, textId, opts),
    ensureSentenceAudio: (args) => ensureSentenceAudioFor(rt, args),
    runJobs: (opts) => runEligibleJobs(rt, opts),

    async getManifest(textId: string, voiceConfigId?: string): Promise<AudioManifest | undefined> {
      const rows = (await store.manifests.where('textId', textId)).filter((m) => !voiceConfigId || m.voiceConfigId === voiceConfigId);
      return rows.sort((a, b) => b.contentVersion - a.contentVersion || (a.updatedAt < b.updatedAt ? 1 : -1))[0];
    },
    getSegment: (id) => store.audioSegments.get(id),
    getAsset: (id) => store.audioAssets.get(id),
    assetUrl: (id) => store.assets.url(id),
    alignments: (segmentId): Promise<AudioAlignment[]> => store.alignments.where('segmentId', segmentId),

    async diagnostics(textId?: string): Promise<GoListenDiagnostics> {
      const segments = textId ? await segmentsForText(textId) : await store.audioSegments.all();
      const jobRows = new Map((await store.audioJobs.all()).map((j) => [j.id, j]));
      const rows: GoListenDiagnostics['segments'] = [];
      let failedJobs = 0, deadJobs = 0;
      for (const seg of segments) {
        const voice = await store.voices.get(seg.voiceConfigId);
        const asset: AudioAsset | undefined = seg.assetId ? await store.audioAssets.get(seg.assetId) : undefined;
        const als = await store.alignments.where('segmentId', seg.id);
        const job = jobRows.get(seg.cacheKey);
        if (job?.status === 'failed') failedJobs++;
        if (job?.status === 'dead') deadJobs++;
        rows.push({
          segmentId: seg.id, status: seg.status, providerId: voice?.providerId, voiceId: voice?.voiceId,
          requestedLocale: voice?.requestedLocale, actualLocale: asset?.locale ?? voice?.actualLocale,
          overridesUsed: seg.pronunciationOverridesUsed, alignmentMethods: [...new Set(als.map((a) => a.method))].sort(),
          minAlignmentConfidence: als.length ? Math.min(...als.map((a) => a.confidence)) : undefined,
          validation: asset?.validation, lastError: job?.lastError, contentVersion: seg.contentVersion,
        });
      }
      return { segments: rows, failedJobs, deadJobs };
    },
    async jobs(status?: AudioJob['status']): Promise<AudioJob[]> {
      const rows = status ? await store.audioJobs.where('status', status) : await store.audioJobs.all();
      return rows.sort((a, b) => (a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1 : a.id < b.id ? -1 : 1));
    },
    async retryDead(jobId?: string): Promise<number> {
      const dead = (await store.audioJobs.where('status', 'dead')).filter((j) => !jobId || j.id === jobId);
      const now = rt.clock();
      let n = 0;
      for (const j of dead) {
        const seg = await store.audioSegments.get(j.segmentId);
        if (!seg || !/[\p{L}\p{N}]/u.test(seg.speechText)) continue; // nothing speakable: retrying cannot help
        await store.audioJobs.put({ ...j, status: 'queued', attempts: 0, lastError: undefined, nextAttemptAt: undefined, updatedAt: now, log: [...j.log, { at: now, message: 'retryDead: requeued' }].slice(-40) });
        await store.audioSegments.put({ ...seg, status: 'pending' });
        n++;
      }
      return n;
    },
  };
}
