/**
 * Job runner. One job per cache key (job id = cacheKey), so scheduling the same work twice is a no-op.
 *
 * Invariants:
 *  - The segment becomes `ready` LAST, after the asset bytes, the AudioAsset row and the alignments
 *    are written, and only for bytes that passed `inspectWav`. A crash can leave an orphan asset, never
 *    a ready segment without one.
 *  - Bytes that fail validation are never stored.
 *  - Retries re-derive the same request and content-address the bytes, so a retry can never produce a second asset.
 *  - Exponential backoff (`nextAttemptAt`; a provider's Retry-After is honoured), `maxAttempts` then `dead`.
 *    A failure that a retry cannot fix (rejected key, malformed request: `retryable === false`) goes dead at once.
 *  - A job whose provider is not usable right now (no credentials this session, offline, fixture disabled) is
 *    SKIPPED: it consumes no attempt and stays queued; `audioStatus` explains the wait.
 */
import { hash } from '../core/ids';
import type { AudioAsset, AudioJob, AudioSegment, PronunciationEntry } from '../core/model';
import type { SynthesisRequest, SynthesisResult } from '../core/contracts/golisten';
import { writeMarkAlignments, writeSentenceAlignments } from './alignment';
import { refreshManifestsFor } from './manifest';
import { buildSsml, lexiconVersionOf } from './pronunciation';
import { describeError } from './errors';
import { usability } from './providers';
import { PIPELINE_NORMALIZER_SUFFIX, addMs, type Runtime } from './types';
import { inspectWav } from './wav';
import { sha256Hex } from './rights';

const STALE_RUNNING_MS = 60_000;
const DURATION_TOLERANCE_MS = 100;
const MAX_LOG = 40;

const MAX_RETRY_AFTER_MS = 3_600_000;

export type JobOutcome = 'succeeded' | 'failed' | 'dead' | 'skipped';

export function isEligible(job: AudioJob, nowIso: string): boolean {
  const now = Date.parse(nowIso);
  if (job.status === 'queued') return true;
  if (job.status === 'failed') return !job.nextAttemptAt || Date.parse(job.nextAttemptAt) <= now;
  if (job.status === 'running') return Date.parse(job.updatedAt) + STALE_RUNNING_MS <= now;
  return false;
}

const pushLog = (job: AudioJob, at: string, message: string): AudioJob['log'] => [...job.log, { at, message }].slice(-MAX_LOG);

export async function runJob(rt: Runtime, jobId: string, nowIso: string): Promise<JobOutcome> {
  if (rt.inFlight.has(jobId)) return 'skipped';
  rt.inFlight.add(jobId); // claim synchronously, before any await, so concurrent callers cannot both run it
  try {
    const job = await rt.store.audioJobs.get(jobId);
    if (!job || !isEligible(job, nowIso)) return 'skipped';
    return await execute(rt, job, nowIso);
  } finally {
    rt.inFlight.delete(jobId);
  }
}

export async function runEligibleJobs(rt: Runtime, opts: { max?: number; now?: string } = {}): Promise<number> {
  const now = opts.now ?? rt.clock();
  const jobs = (await rt.store.audioJobs.all()).filter((j) => isEligible(j, now)).sort((a, b) => (a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1 : a.id < b.id ? -1 : 1));
  let processed = 0;
  for (const j of jobs) {
    if (opts.max !== undefined && processed >= opts.max) break;
    if ((await runJob(rt, j.id, now)) !== 'skipped') processed++;
  }
  return processed;
}

async function execute(rt: Runtime, startJob: AudioJob, now: string): Promise<JobOutcome> {
  const segment = await rt.store.audioSegments.get(startJob.segmentId);
  if (segment) {
    const v = await rt.store.voices.get(segment.voiceConfigId);
    const p = v ? rt.providers.get(v.providerId) : undefined;
    if (p && !(await usability(rt, p)).usable) return 'skipped'; // wait for the provider; no attempt is consumed
  }
  const attempt = startJob.attempts + 1;
  let job: AudioJob = { ...startJob, status: 'running', attempts: attempt, updatedAt: now, log: pushLog(startJob, now, `attempt ${attempt}/${startJob.maxAttempts} started`) };
  await rt.store.audioJobs.put(job);
  try {
    if (!segment) throw new Error(`segment ${startJob.segmentId} is missing`);
    const { asset, notes } = await synthesizeAndStore(rt, segment);
    job = { ...job, log: notes.reduce((log, n) => [...log, { at: now, message: n }].slice(-MAX_LOG), job.log) };
    await rt.store.audioSegments.put({ ...segment, assetId: asset.id, status: 'ready' }); // ready LAST
    job = { ...job, status: 'succeeded', lastError: undefined, nextAttemptAt: undefined, updatedAt: rt.clock(), log: pushLog(job, now, `succeeded: asset ${asset.id} (${asset.durationMs} ms)`) };
    await rt.store.audioJobs.put(job);
    await refreshManifestsFor(rt, segment.id);
    return 'succeeded';
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    const info = describeError(e);
    const dead = !info.retryable || attempt >= job.maxAttempts;
    const backoff = Math.min(rt.backoffBaseMs * 2 ** (attempt - 1), rt.backoffMaxMs);
    const delay = Math.min(Math.max(backoff, info.retryAfterMs ?? 0), Math.max(rt.backoffMaxMs, MAX_RETRY_AFTER_MS));
    job = {
      ...job, status: dead ? 'dead' : 'failed', lastError: message,
      nextAttemptAt: dead ? undefined : addMs(now, delay), updatedAt: rt.clock(),
      log: pushLog(job, now, dead ? (info.retryable ? `dead after ${attempt} attempts: ${message}` : `dead at attempt ${attempt} (not retryable): ${message}`) : `failed (${message}); retry after ${delay} ms`),
    };
    await rt.store.audioJobs.put(job);
    if (segment && dead) {
      await rt.store.audioSegments.put({ ...segment, status: 'failed', assetId: undefined });
      await refreshManifestsFor(rt, segment.id);
    }
    return dead ? 'dead' : 'failed';
  }
}

async function synthesizeAndStore(rt: Runtime, segment: AudioSegment): Promise<{ asset: AudioAsset; notes: string[] }> {
  const notes: string[] = [];
  const voice = await rt.store.voices.get(segment.voiceConfigId);
  if (!voice) throw new Error(`voice config ${segment.voiceConfigId} is missing`);
  const provider = rt.providers.get(voice.providerId);
  if (!provider) throw new Error(`provider ${voice.providerId} is not registered`);
  const caps = provider.capabilities();
  const adapter = rt.adapters.get(segment.lang);
  const wordBoundaries = adapter.display.wordSeparator !== '';

  const entries: PronunciationEntry[] = [];
  for (const id of segment.pronunciationOverridesUsed) {
    const e = await rt.store.pronunciations.get(id);
    if (!e) throw new Error(`pronunciation entry ${id} is missing; cache key no longer reproducible`);
    entries.push(e);
  }
  const ssmlEntries = entries.filter((e) => e.mechanism === 'ssml-phoneme' || e.mechanism === 'lang-tag');
  const format = caps.outputFormats.includes('audio/wav') ? 'audio/wav' : caps.outputFormats[0] ?? 'audio/wav';
  const req: SynthesisRequest = {
    text: segment.speechText, lang: segment.lang, locale: voice.actualLocale, voiceId: voice.voiceId, format, settings: rt.settings,
    ...(ssmlEntries.length ? { ssml: buildSsml(segment.speechText, ssmlEntries, voice.actualLocale, { wordBoundaries }) } : {}),
  };
  const result: SynthesisResult = await provider.synthesize(req);

  // ── validate (the gate) ──
  let problems: string[];
  let measured: { durationMs: number; sampleRate: number; channels: number } | undefined;
  let validation;
  if (result.mime === 'audio/wav' || result.mime === 'audio/x-wav' || result.mime === 'audio/wave') {
    const insp = inspectWav(result.bytes, { expectedSampleRate: result.sampleRate, expectedChannels: result.channels });
    validation = insp.validation;
    problems = [...validation.problems];
    if (insp.durationMs !== undefined && insp.sampleRate !== undefined && insp.channels !== undefined) {
      measured = { durationMs: insp.durationMs, sampleRate: insp.sampleRate, channels: insp.channels };
      if (Math.abs(insp.durationMs - result.durationMs) > DURATION_TOLERANCE_MS) problems.push(`declared-duration-mismatch: provider said ${Math.round(result.durationMs)} ms, measured ${Math.round(insp.durationMs)} ms`);
    }
  } else {
    problems = [`unvalidatable-format: ${result.mime}`];
    validation = { ok: false, problems };
  }
  if (problems.length > 0 || !measured) throw new Error(`audio validation failed: ${problems.join('; ') || 'unmeasurable'}`);
  const finalValidation = { ...validation, ok: true, problems: [] as string[] };

  // ── content-addressed asset ──
  const assetId = await rt.store.assets.put(result.bytes, result.mime);
  let asset = await rt.store.audioAssets.get(assetId);
  if (!asset) {
    asset = {
      id: assetId, sourceType: 'generated-tts', audioKind: 'synthetic', lang: segment.lang, locale: result.actualLocale, mime: result.mime,
      isSpeech: provider.isSpeech === true, // a non-speech provider's audio can never earn listening evidence
      sampleRate: measured.sampleRate, channels: measured.channels, durationMs: Math.round(measured.durationMs), bytes: result.bytes.length,
      checksum: await sha256Hex(result.bytes), createdAt: rt.clock(),
      narratorOrVoiceId: voice.voiceId,
      // Synthesis terms cannot be inferred from permission to display text. Untyped legacy jobs remain blocked.
      rights: segment.generationRights ?? { id: `rights:unresolved:${assetId}`, status: 'pending', recordingOwner: 'unknown', recordingBasis: 'unknown',
        performanceOwner: provider.id, performancePermission: 'provider terms not recorded', playInApp: false, stream: false,
        offline: false, redistribute: false, segment: false, transform: false, textDerivative: 'unknown', providerRetention: 'unknown' },
      textBinding: segment.textBinding,
      generation: {
        providerId: provider.id, engine: result.engine ?? voice.engine, voiceId: voice.voiceId, settings: { ...rt.settings },
        sourceTextHash: hash(segment.displayText), sourceTextSha256: await sha256Hex(new TextEncoder().encode(segment.displayText)), speechTextHash: hash(segment.speechText),
        normalizerVersion: `${adapter.speechNormalize(segment.displayText).normalizerVersion}+${PIPELINE_NORMALIZER_SUFFIX}`,
        pronunciationLexiconVersion: lexiconVersionOf(entries), softwareVersion: `${rt.softwareVersion}; ${provider.id}@${provider.version}`,
      },
      validation: finalValidation,
    };
    await rt.store.audioAssets.put(asset);
  } else if (asset.isSpeech !== true || provider.isSpeech !== true) {
    // Same bytes claimed by a non-speech producer: fail closed, the asset is non-speech.
    if (asset.isSpeech !== false) { asset = { ...asset, isSpeech: false }; await rt.store.audioAssets.put(asset); }
  }
  notes.push(`asset ${assetId} validated (peak ${validation.peak?.toFixed(2)}, ${Math.round(measured.durationMs)} ms)`);

  // ── honesty about the locale ──
  if (result.actualLocale.toLowerCase() !== voice.actualLocale.toLowerCase()) {
    notes.push(`locale mismatch: voice config expected ${voice.actualLocale}, provider delivered ${result.actualLocale}; recorded on the asset and voice config`);
    await rt.store.voices.put({ ...voice, actualLocale: result.actualLocale, qaNote: [voice.qaNote, `Provider delivered ${result.actualLocale}, not ${voice.actualLocale}.`].filter(Boolean).join(' ') });
  }

  // ── alignments ──
  await writeSentenceAlignments(rt, segment, asset);
  if (result.wordMarks && result.wordMarks.length > 0) {
    if (!caps.wordBoundaries) {
      notes.push('provider returned word marks but does not declare trustworthy word boundaries: ignored');
    } else {
      const r = await writeMarkAlignments(rt, segment, asset, result.wordMarks, segment.speechText, `provider:${provider.id}@${provider.version}`);
      notes.push(r.note ?? `word alignment from provider marks: ${r.written} aligned, ${r.dropped} marks unmapped`);
    }
  }
  return { asset, notes };
}
