/**
 * GoListen - audio pipeline + provider abstraction + listening events + DOM-free player logic.
 * See QA.md and docs/SPEECH.md for what is verified (fixture pipeline; the Azure adapter and the same-origin proxy
 * provider against a mocked fetch) and what is not (every real voice; the live Azure service; the live proxy).
 *
 * No fixture by default: without a usable real provider, availability() is unavailable, audioStatus() is
 * 'unavailable', and ensureAudio throws AudioUnavailable before writing anything.
 */
import { REVIEW_OK } from '../core/model';
import type { AudioAlignment, AudioAsset, AudioJob, AudioManifest, AudioSegment, LanguageCode, ReviewStatus, VoiceConfig } from '../core/model';
import type { AudioStatus, GoListen, GoListenDiagnostics, ProviderAvailability, TtsProvider } from '../core/contracts/golisten';
import type { AudioImportResult, ImportRecordingArgs } from '../core/contracts/golisten';
import { FIXTURE_PROVIDER_ID, FixtureTtsProvider } from './fixtureProvider';
import { runEligibleJobs } from './jobs';
import { ensureAudioForText, ensureSentenceAudioFor } from './pipeline';
import { aggregateAvailability } from './providers';
import { audioStatusDetail, audioStatusFor, selectAudioManifest, type AudioStatusOptions, type FailedSentence } from './status';
import { GOLISTEN_VERSION, type GoListenDeps, type Runtime } from './types';
import { resolveVoiceConfig } from './voices';
import { importRecordingFor } from './import';
import { approvedForPlay, currentBindingValid, sha256Hex } from './rights';

export { computeCacheKey, type CacheKeyParts } from './cacheKey';
export { encodeWav, validateWav, inspectWav, type EncodeWavOptions, type ValidateWavOptions, type WavInspection, DEFAULT_SAMPLE_RATE } from './wav';
export { FixtureTtsProvider, FIXTURE_PROVIDER_ID, FIXTURE_ENGINE, FIXTURE_DISCLAIMER, fixtureChunks, renderFixtureChunks, type FixtureChunk } from './fixtureProvider';
export { AzureSpeechProvider, AZURE_PROVIDER_ID, AZURE_PROVIDER_VERSION, AZURE_ENGINE, AZURE_OUTPUT_FORMAT, AZURE_VOICES, type AzureSpeechOptions, type AzureVoiceEntry } from './azureProvider';
export { AudioUnavailableError, TtsProviderError, isAudioUnavailable, unavailableMessage, describeError, type ProviderErrorKind, type UnavailableReason } from './errors';
export { isVoiceReviewed } from './voices';
export type { AudioStatusOptions, FailedSentence } from './status';
export { ProxySpeechProvider, PROXY_PROVIDER_ID, PROXY_PROVIDER_VERSION_UNRESOLVED, PROXY_STATUS_PATH, type ProxySpeechOptions, type ProxyStatus } from './proxyProvider';
export { listeningEmitter, emitPlayerEffects, resolvePlaybackFacts, type ListeningEmitter, type ListeningContext, type SegmentRef, type PlaybackFacts } from './events';
export {
  PlayerMachine, createPlayerModel, reducePlayer, clampSpeed, isTranscriptVisible, playableIndexes, MIN_SPEED, MAX_SPEED, SPEED_STEP,
  type PlayerAction, type PlayerEffect, type PlayerEmit, type PlayerModel, type PlayerManifestInput, type PlayerSegmentInfo, type PlayerOptions, type TranscriptMode, type EmitView,
} from './player';
export { buildPlayerManifest } from './playerManifest';
export { planSpeech, stripVerseMarkers, type SpeechPlan } from './pipeline';
export { approvedForPlay, currentBindingValid, canonicalTextSha256, sha256Hex, releaseIdOf, editionIdOf, isThsv11 } from './rights';
export { latestListeningCheckpoint, listeningProgress } from './progress';
export { recommendListening } from './recommendations';
export { listeningAssessmentAvailability, startListeningAssessment, submitListeningAssessment } from './assessment';
export { type AudioGenerationAuthorization, type AudioImportManifest, type AudioImportResult, type OfflineAudioPackage, type ImportOrigin, type ImportRecord, type ImportRecordingArgs } from '../core/contracts/golisten';
export { readImportRecord, importRecordId } from './import';
export { SYNTHETIC_PRACTICE } from './status';
export { GOLISTEN_VERSION, type GoListenDeps } from './types';

/** Per-segment diagnostics plus the job state behind it (retries, next attempt, review status). */
export interface GoListenDiagnosticsV2 extends GoListenDiagnostics {
  segments: Array<GoListenDiagnostics['segments'][number] & {
    jobStatus?: AudioJob['status'];
    attempts?: number;
    maxAttempts?: number;
    nextAttemptAt?: string;
    isSpeech?: boolean;
    voiceReview?: VoiceConfig['reviewStatus'];
    providerVersion?: string;
  }>;
  /** Only when diagnostics(textId) is asked: the live sentences of that text whose audio failed for good, with the reason. */
  failedSentences?: FailedSentence[];
}

export interface GoListenService extends GoListen {
  /** Choose which registered provider resolveVoice uses for new voice configs. */
  setDefaultProvider(providerId: string): void;
  /** Remove a provider (e.g. the learner forgot the Azure key). Stored audio stays. */
  unregisterProvider(providerId: string): void;
  /** Turn development fixture audio on/off at runtime (the preview / "development fixture audio" preference). */
  setAllowFixture(allow: boolean): void;
  allowFixture(): boolean;
  /** Re-queue dead jobs (all, or the given job id) for another round of attempts. */
  retryDead(jobId?: string): Promise<number>;
  audioStatus(textId: string, opts?: AudioStatusOptions): Promise<AudioStatus>;
  diagnostics(textId?: string): Promise<GoListenDiagnosticsV2>;
  /**
   * Subscribe to changes that can alter whether a text's audio is listening evidence: a recording imported or re-imported,
   * rights revoked, a voice review changed. `textId` is the affected text, or undefined when it cannot be narrowed (a voice
   * shared by several texts). The app wires this to GoLearn's `invalidateListening` (src/app/bootstrap.ts); the listener is
   * awaited, after the change is stored. Returns an unsubscribe function. A failing listener never fails the change.
   */
  onEligibilityChange(listener: (textId?: string) => unknown): () => void;
  /** Withdraw the rights of an audio asset (status 'revoked'): it stops playing and stops being evidence. Returns the asset. */
  revokeRights(assetId: string): Promise<AudioAsset>;
}

export function createGoListen(deps: GoListenDeps): GoListenService {
  const providers = new Map<string, TtsProvider>();
  const allowFixture = deps.allowFixture === true;
  // The fixture exists only when explicitly allowed (tests, preview). Otherwise it is not even registered.
  if (allowFixture) { const fixture = new FixtureTtsProvider(); providers.set(fixture.id, fixture); }
  for (const p of deps.providers ?? []) providers.set(p.id, p);
  const rt: Runtime = {
    store: deps.store, bus: deps.bus, adapters: deps.adapters,
    clock: deps.clock ?? (() => new Date().toISOString()),
    softwareVersion: deps.softwareVersion ?? GOLISTEN_VERSION,
    providers, settings: { ...(deps.settings ?? {}) },
    maxAttempts: deps.maxAttempts ?? 4, backoffBaseMs: deps.backoffBaseMs ?? 1000, backoffMaxMs: deps.backoffMaxMs ?? 300_000,
    inFlight: new Set(), defaultProviderId: deps.defaultProviderId, allowFixture,
  };
  const { store } = rt;
  const eligibilityListeners = new Set<(textId?: string) => unknown>();
  const eligibilityChanged = async (textId?: string): Promise<void> => {
    for (const l of [...eligibilityListeners]) { try { await l(textId); } catch { /* the change itself already happened */ } }
  };

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
    unregisterProvider(providerId: string) {
      rt.providers.delete(providerId);
      if (rt.defaultProviderId === providerId) rt.defaultProviderId = undefined;
    },
    setAllowFixture(allow: boolean) {
      rt.allowFixture = allow;
      if (allow && !rt.providers.has(FIXTURE_PROVIDER_ID)) {
        const rest = [...rt.providers.entries()];
        rt.providers.clear();
        rt.providers.set(FIXTURE_PROVIDER_ID, new FixtureTtsProvider()); // keep the fixture first, as at construction
        for (const [k, v] of rest) rt.providers.set(k, v);
      }
      if (!allow && rt.defaultProviderId === FIXTURE_PROVIDER_ID) rt.defaultProviderId = undefined;
    },
    allowFixture() { return rt.allowFixture; },
    availability(): Promise<ProviderAvailability> { return aggregateAvailability(rt); },
    audioStatus: (textId: string, opts?: AudioStatusOptions) => audioStatusFor(rt, textId, opts),
    async setVoiceReview(voiceConfigId: string, status: ReviewStatus, note?: string): Promise<VoiceConfig> {
      const row = await store.voices.get(voiceConfigId);
      if (!row) throw new Error(`GoListen: voice config ${voiceConfigId} not found`);
      const line = `Review ${status} on ${rt.clock().slice(0, 10)}${note ? `: ${note}` : ''}.`;
      const next: VoiceConfig = {
        ...row, reviewStatus: status, isSpeech: row.isSpeech ?? false,
        // A person may record any decision, but a non-speech (fixture) voice is never "approved": it is not speech.
        approved: REVIEW_OK.includes(status) && row.isSpeech === true,
        qaNote: [row.qaNote, line].filter(Boolean).join(' '),
      };
      await store.voices.put(next);
      await eligibilityChanged(); // a voice can serve several texts: not narrowed to one
      return next;
    },
    onEligibilityChange(listener) { eligibilityListeners.add(listener); return () => { eligibilityListeners.delete(listener); }; },
    async revokeRights(assetId: string): Promise<AudioAsset> {
      const asset = await store.audioAssets.get(assetId);
      if (!asset?.rights) throw new Error(`GoListen: audio asset ${assetId} has no rights record`);
      const next: AudioAsset = { ...asset, rights: { ...asset.rights, status: 'revoked' } };
      await store.audioAssets.put(next);
      await eligibilityChanged(asset.textBinding?.scope === 'personal' ? undefined : asset.textBinding?.textId);
      return next;
    },
    resolveVoice(lang: LanguageCode, courseId?: string): Promise<VoiceConfig> { return resolveVoiceConfig(rt, lang, courseId); },
    ensureAudio: (textId, opts) => ensureAudioForText(rt, textId, opts),
    ensureSentenceAudio: (args) => ensureSentenceAudioFor(rt, args),
    importRecording: async (args: ImportRecordingArgs): Promise<AudioImportResult> => {
      const result = await importRecordingFor(rt, args);
      await eligibilityChanged(args.manifest.textId); // import or re-import can change what the text's audio is worth
      return result;
    },
    runJobs: (opts) => runEligibleJobs(rt, opts),

    async getManifest(textId: string, voiceConfigId?: string): Promise<AudioManifest | undefined> {
      if (!voiceConfigId) return selectAudioManifest(rt, textId);
      const rows = (await store.manifests.where('textId', textId)).filter((m) => !voiceConfigId || m.voiceConfigId === voiceConfigId);
      return rows.sort((a, b) => b.contentVersion - a.contentVersion || (a.updatedAt < b.updatedAt ? 1 : -1))[0];
    },
    getSegment: (id) => store.audioSegments.get(id),
    getAsset: (id) => store.audioAssets.get(id),
    async assetUrl(id) {
      const asset = await store.audioAssets.get(id);
      if (!asset) return undefined;
      if (asset.sourceType === 'generated-tts' && !asset.isSpeech && rt.allowFixture) return store.assets.url(id);
      if (!approvedForPlay(asset.rights, asset.audioKind) || !(await currentBindingValid(store, asset))) return undefined;
      return store.assets.url(id);
    },
    async offlinePackage(id) {
      const asset = await store.audioAssets.get(id);
      if (!asset || !approvedForPlay(asset.rights, asset.audioKind) || asset.rights.offline !== true || !(await currentBindingValid(store, asset))) return undefined;
      const stored = await store.assets.get(id);
      if (!stored) return undefined;
      if (await sha256Hex(stored.bytes) !== asset.checksum) return undefined;
      const alignments = (await store.alignments.where('assetId', id)).filter((a) => a.endMs <= asset.durationMs && a.startMs >= 0 && a.endMs > a.startMs);
      return { asset, bytes: stored.bytes, rights: asset.rights, textBinding: asset.textBinding!, alignments };
    },
    alignments: (segmentId): Promise<AudioAlignment[]> => store.alignments.where('segmentId', segmentId),

    async diagnostics(textId?: string): Promise<GoListenDiagnosticsV2> {
      const segments = textId ? await segmentsForText(textId) : await store.audioSegments.all();
      const jobRows = new Map((await store.audioJobs.all()).map((j) => [j.id, j]));
      const rows: GoListenDiagnosticsV2['segments'] = [];
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
          jobStatus: job?.status, attempts: job?.attempts, maxAttempts: job?.maxAttempts, nextAttemptAt: job?.nextAttemptAt,
          isSpeech: asset?.isSpeech ?? voice?.isSpeech, voiceReview: voice?.reviewStatus, providerVersion: voice?.providerVersion,
        });
      }
      const out: GoListenDiagnosticsV2 = { segments: rows, failedJobs, deadJobs };
      if (textId) out.failedSentences = (await audioStatusDetail(rt, textId)).failedSentences;
      return out;
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
