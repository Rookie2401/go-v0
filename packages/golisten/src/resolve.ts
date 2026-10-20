/**
 * Provider order, preparation, failure aggregation and opening a prepared voice as a playback handle. Shared by
 * ordinary pronunciation and by the assessment source, so both see the same voices under the same rules.
 */
import type { PlaybackHandle, PronunciationFailure, PronunciationRequest, ProviderKind } from './contracts';
import type { GoListenEnv } from './environment';
import { createPlayback, failedPlayback } from './playback';
import { clipDriver } from './providers/audio';
import { deviceDriver, findNativeVoice, prepareDevice } from './providers/device';
import { prepareRecorded } from './providers/recorded';
import { prepareRemote } from './providers/remote';
import { fail } from './providers/types';
import type { Failure, Prepared, PrepareOutcome, Req } from './providers/types';
import type { VoiceRegistry } from './registry';

/**
 * Azure is the primary synthetic voice when the learner has enabled remote speech and
 * the server has a working key.  The resolver still falls through immediately when
 * consent, connectivity, or server configuration is absent, so local device voices
 * remain the natural local-only path.  Recorded material is retained as an explicit
 * preference (or a future reviewed source) rather than silently winning over the
 * configured pronunciation service.
 */
export const DEFAULT_ORDER: readonly ProviderKind[] = ['remote', 'recorded', 'device'];

/** The providers to try, in order. A request for a specific voice only ever tries the provider that voice belongs to. */
export function providerOrder(req: Pick<PronunciationRequest, 'preferred' | 'voiceId'>): ProviderKind[] {
  if (req.voiceId) {
    if (req.voiceId.startsWith('device:')) return ['device'];
    if (req.voiceId.startsWith('recording:')) return ['recorded'];
    return ['remote'];
  }
  const first = req.preferred && DEFAULT_ORDER.includes(req.preferred) ? [req.preferred] : [];
  return [...first, ...DEFAULT_ORDER.filter((p) => p !== req.preferred)];
}

export async function prepareWith(kind: ProviderKind, req: Req, registry: VoiceRegistry, env: GoListenEnv): Promise<PrepareOutcome> {
  try {
    if (kind === 'recorded') return await prepareRecorded(req, registry, env);
    if (kind === 'device') return await prepareDevice(req, registry, env);
    return await prepareRemote(req, registry, env);
  } catch {
    return fail('provider-error', `The ${kind} voice failed unexpectedly.`); // never the text
  }
}

const PRIORITY: PronunciationFailure[] = ['provider-error', 'offline', 'no-consent', 'wrong-language-voice', 'unsupported-kind', 'no-voice'];

/** The first prepared voice in `order`, or the single most informative failure with actionable alternatives. */
export async function resolveFirst(order: ProviderKind[], req: Req, registry: VoiceRegistry | undefined, env: GoListenEnv): Promise<PrepareOutcome> {
  if (!registry) return fail('no-voice', `No voices are registered for ${req.languageId}.`, ['Continue without audio: GoLearn works text-first.']);
  const failures: Failure[] = [];
  for (const kind of order) {
    if (req.signal?.aborted) return fail('offline', 'Pronunciation was cancelled.');
    const out = await prepareWith(kind, req, registry, env);
    if (req.signal?.aborted) {
      if (out.ok && out.prepared.ownsUrl && out.prepared.audio.kind !== 'device') env.objectUrl?.revoke(out.prepared.audio.url);
      return fail('offline', 'Pronunciation was cancelled.');
    }
    if (out.ok) return out;
    failures.push(out);
  }
  const top = [...failures].sort((a, b) => PRIORITY.indexOf(a.reason) - PRIORITY.indexOf(b.reason))[0] ?? fail('no-voice', 'No voice is available.');
  // the most actionable reason leads; the other providers' messages follow so the learner sees the whole picture
  const messages = [...new Set([top, ...failures].map((f) => f.message))];
  return fail(top.reason, messages.join(' '), alternativesFor(failures, registry));
}

function alternativesFor(failures: Failure[], registry: VoiceRegistry): string[] {
  const seen = new Set(failures.map((f) => f.reason));
  const out: string[] = [];
  if (seen.has('no-consent')) out.push('Turn on remote speech in Settings to hear a synthetic voice (the text is sent to a speech service).');
  if (registry.entries.some((e) => e.source.kind === 'device')) out.push(`Install a ${registry.languageId} voice in the device's speech settings; it will appear here.`);
  if (seen.has('offline')) out.push('Check the connection and try again.');
  out.push(...registry.gaps);
  if (registry.phonetics) out.push('Continue without audio: the phonetic notes for this text are still available.');
  else out.push('Continue without audio: GoLearn works text-first.');
  return [...new Set(out)];
}

/** Opens a prepared voice as a playback handle. Never throws; an unplayable voice gives a handle in state 'error'. */
export function openPlayback(p: Pick<Prepared, 'voice' | 'audio' | 'ownsUrl'>, registry: VoiceRegistry, env: GoListenEnv, rate?: number): PlaybackHandle {
  try {
    const a = p.audio;
    if (a.kind === 'device') {
      const native = findNativeVoice(env, registry, p.voice.voiceId);
      if (!native || !env.speech) return failedPlayback(env.now);
      return createPlayback(deviceDriver(env, native, a.text), { now: env.now, rate });
    }
    if (!env.audio) return failedPlayback(env.now);
    const revoke = p.ownsUrl && env.objectUrl ? () => env.objectUrl!.revoke(a.url) : undefined;
    return createPlayback(clipDriver(env.audio, a.url, revoke), { now: env.now, rate });
  } catch {
    return failedPlayback(env.now);
  }
}
