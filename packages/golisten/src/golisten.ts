/**
 * createGoListen: the one entry point. Hosts (the GoLearn extension now, GoReview next) hand it the voice registries,
 * the learner's consent and the browser ports; it hands back pronunciation, voice listings, playback events and an
 * assessment source. Nothing here reads a store, writes an event or imports an application: it returns payloads and
 * the caller decides whether and how to record them.
 *
 * pronounce() never throws and never blocks the reader: every failure is an `ok: false` result with a reason, a
 * message that never contains the text, and what the learner can do instead.
 */
import { createAssessmentSource } from './assessment';
import type { AssessmentSource, PhoneticDetail, PronunciationPlayedEvent, PronunciationRequest, PronunciationResult } from './contracts';
import type { GoListenEnv } from './environment';
import { clampRate } from './playback';
import { createHtmlAudioPort } from './providers/audio';
import { fail } from './providers/types';
import { languageAvailability, listVoices } from './listing';
import type { LanguageAvailability, ListedVoice } from './listing';
import type { AudioPort, ConsentState, FetchLike, ObjectUrlPort, SpeechLike, SpeechUtteranceLike } from './ports';
import { indexRegistries } from './registry';
import type { VoiceRegistry } from './registry';
import { openPlayback, providerOrder, resolveFirst } from './resolve';

export interface GoListenOptions {
  registries: VoiceRegistry[];
  consent: () => ConsentState;
  /** Default: `window.speechSynthesis` when present. */
  speech?: SpeechLike;
  /** Default: an HTMLAudioElement port when `Audio` exists. */
  audio?: AudioPort;
  /** Default: the global `fetch`. */
  fetch?: FetchLike;
  now?: () => number;
  /** Default: `new SpeechSynthesisUtterance(text)`. */
  utterance?: (text: string) => SpeechUtteranceLike;
  /** Default: `URL.createObjectURL` / `revokeObjectURL`. */
  objectUrl?: ObjectUrlPort;
  /** Base of the speech proxy. Default '/api/speech' (same origin). */
  speechProxyBase?: string;
  voiceWaitMs?: number;
}

export interface GoListen {
  pronounce(req: PronunciationRequest): Promise<PronunciationResult>;
  voices(languageId: string): Promise<ListedVoice[]>;
  availability(languageId: string): Promise<LanguageAvailability>;
  /** Phonetic notes that need no audio and no consent; `undefined` when the language has none or nothing to note. */
  phonetics(req: Pick<PronunciationRequest, 'languageId' | 'text' | 'kind'>): PhoneticDetail | undefined;
  /**
   * The PronunciationPlayed event payload for a pronunciation, or null when nothing was played. NEVER a ListeningAssessed
   * payload: playback is exposure, not comprehension, and synthetic speech is never evidence.
   */
  events(result: PronunciationResult, playbackEnded: boolean): PronunciationPlayedEvent | null;
  assessment(): AssessmentSource;
}

const KINDS = ['word', 'phrase', 'sentence'];

function defaultFetch(): FetchLike | undefined {
  const f = (globalThis as { fetch?: (url: string, init?: unknown) => Promise<unknown> }).fetch;
  return f ? ((url, init) => f.call(globalThis, url, init) as ReturnType<FetchLike>) : undefined;
}

function defaultUtterance(): (text: string) => SpeechUtteranceLike {
  return (text) => {
    const C = (globalThis as { SpeechSynthesisUtterance?: new (t: string) => SpeechUtteranceLike }).SpeechSynthesisUtterance;
    if (!C) throw new Error('speech synthesis utterances are not available');
    return new C(text);
  };
}

function defaultObjectUrl(): ObjectUrlPort | undefined {
  if (typeof URL === 'undefined' || typeof URL.createObjectURL !== 'function') return undefined;
  return { create: (b) => URL.createObjectURL(b), revoke: (u) => URL.revokeObjectURL(u) };
}

export function createGoListen(opts: GoListenOptions): GoListen {
  const registries = indexRegistries(opts.registries);
  const consent = () => {
    try { const c = opts.consent(); return { remoteSpeech: c.remoteSpeech === true, localOnly: c.localOnly === true }; } catch { return { remoteSpeech: false, localOnly: true }; }
  };
  const env: GoListenEnv = {
    consent,
    speech: opts.speech ?? (typeof speechSynthesis !== 'undefined' ? (speechSynthesis as unknown as SpeechLike) : undefined),
    audio: opts.audio ?? createHtmlAudioPort(),
    fetch: opts.fetch ?? defaultFetch(),
    objectUrl: opts.objectUrl ?? defaultObjectUrl(),
    utterance: opts.utterance ?? defaultUtterance(),
    proxyBase: (opts.speechProxyBase ?? '/api/speech').replace(/\/+$/, ''),
    now: opts.now ?? (() => Date.now()),
    voiceWaitMs: opts.voiceWaitMs ?? 300,
    cache: new Map(),
  };

  const phonetics: GoListen['phonetics'] = (req) => {
    try { return registries.get(req.languageId)?.phonetics?.(req.text, req.kind); } catch { return undefined; }
  };
  const assessment = createAssessmentSource({ registries, env });

  return {
    async pronounce(req) {
      try {
        const text = typeof req?.text === 'string' ? req.text.replace(/\s+/g, ' ').trim() : '';
        if (!text) return fail('unsupported-kind', 'There is nothing to say.');
        if (!KINDS.includes(req.kind)) return fail('unsupported-kind', 'GoListen pronounces a word, a phrase or a sentence.');
        const reg = registries.get(req.languageId);
        const request = { languageId: req.languageId, varietyId: req.varietyId, text, kind: req.kind, voiceId: req.voiceId, processingPermission: req.processingPermission, signal: req.signal };
        const out = await resolveFirst(providerOrder(req), request, reg, env);
        if (!out.ok) return out;
        const p = out.prepared;
        const playbackEnv = { ...env, consent: () => {
          const c = env.consent();
          return { ...c, remoteSpeech: c.remoteSpeech && req.processingPermission === 'allowed' && !req.signal?.aborted };
        } };
        const playback = openPlayback(p, reg!, playbackEnv, clampRate(req.rate));
        if (req.signal) {
          const abort = () => playback.dispose();
          req.signal.addEventListener('abort', abort, { once: true });
          const dispose = playback.dispose;
          playback.dispose = () => { req.signal?.removeEventListener('abort', abort); dispose(); };
          if (req.signal.aborted) { playback.dispose(); return fail('offline', 'Pronunciation was cancelled.'); }
        }
        if (req.autoplay) playback.play();
        const phonetic = phonetics({ languageId: req.languageId, text, kind: req.kind });
        return { ok: true, voice: p.voice, playback, provenance: p.provenance, ...(phonetic ? { phonetic } : {}) };
      } catch {
        return fail('provider-error', 'Pronunciation failed unexpectedly.', ['Continue without audio: GoLearn works text-first.']);
      }
    },

    voices: (languageId) => listVoices(registries.get(languageId), env),
    availability: (languageId) => languageAvailability(languageId, registries.get(languageId), env),
    phonetics,

    events(result, playbackEnded) {
      if (!result.ok) return null;
      const pb = result.playback;
      if (!playbackEnded && pb.state === 'idle' && pb.replays === 0) return null; // nothing was played
      const recorded = result.provenance.source === 'recording';
      const duration = playbackEnded ? pb.durationMs : undefined;
      return {
        kind: 'PronunciationPlayed',
        payload: {
          voice: recorded ? 'recorded' : 'synthetic', voiceId: result.voice.voiceId,
          ...(duration !== undefined ? { durationMs: Math.round(duration) } : {}), repeated: pb.replays > 0,
        },
        evidence: { quality: 'none', assisted: false },
      };
    },

    assessment: () => assessment,
  };
}
