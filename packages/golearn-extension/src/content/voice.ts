/**
 * Pronunciation in the page, through GoListen's DEVICE provider only.
 *
 * The content script has no network, so it uses the strict device-voice rules of GoListen (a voice is used only when its
 * language tag is one the registry accepts; an English voice is never "close enough"; a voice that is not local needs
 * the learner's remote-speech consent) and nothing else. Recorded and remote voices are not played inside web pages by
 * this version; GoListen's top-level `createGoListen` is not imported because it carries the remote provider's network
 * code, which must not be in the content bundle (test/extension/bundle.test.ts).
 *
 * Synthetic speech is practice and exposure: it is reported as `PronunciationPlayed`, never as listening evidence.
 */
import type { PlaybackHandle, PlaybackState } from '../../../golisten/src/contracts';
import type { GoListenEnv } from '../../../golisten/src/environment';
import type { FetchResponseLike, SpeechLike as GoSpeech, SpeechUtteranceLike } from '../../../golisten/src/ports';
import { clampRate, createPlayback } from '../../../golisten/src/playback';
import { createHtmlAudioPort, clipDriver } from '../../../golisten/src/providers/audio';
import { DEVICE_PRACTICE_NOTE, deviceDriver, findNativeVoice, prepareDevice } from '../../../golisten/src/providers/device';
import { prepareRemote } from '../../../golisten/src/providers/remote';
import { albanianRegistry, pronunciationRegistries, deviceRegistry, type VoiceRegistry } from '../../../golisten/src/registry';
import { languageNameOf } from '../protocol';
import type { SpeechMessage, SpeechReply } from '../speechProtocol';
import type { PlayResult, PronounceAvailability, Pronouncer } from '../popup/view';

export interface DevicePronouncerOptions {
  /** `window.speechSynthesis`, or null when there is none. */
  speech: GoSpeech | null;
  /** Whether the learner has consented to a voice that sends text to the browser vendor (read each time it is used). */
  remoteConsent?: () => boolean;
  /** Host-owned source rights; absent permission refuses browser cloud speech. */
  processingPermission?: () => 'allowed' | 'unknown' | 'forbidden';
  /** Read the current setting before each availability check and playback; failures revoke permission. */
  refreshConsent?: (languageId: string) => Promise<boolean>;
  utterance?: (text: string) => SpeechUtteranceLike;
  now?: () => number;
  voiceWaitMs?: number;
}

import { DEVICE_TAGS } from './voiceTags';
export { DEVICE_TAGS, hasDeviceVoice } from './voiceTags';

function registryFor(languageId: string): VoiceRegistry {
  return languageId === 'sq' ? albanianRegistry() : deviceRegistry(languageId, [...(DEVICE_TAGS[languageId] ?? [languageId])], languageNameOf(languageId));
}

export function createDevicePronouncer(opts: DevicePronouncerOptions): Pronouncer {
  const refreshConsent = async (lang: string): Promise<boolean> => {
    if (!opts.refreshConsent) return opts.remoteConsent?.() === true;
    try { return await opts.refreshConsent(lang) === true; }
    catch { return false; }
  };
  const makeUtterance = opts.utterance ?? ((text: string): SpeechUtteranceLike => {
    const C = (globalThis as { SpeechSynthesisUtterance?: new (t: string) => SpeechUtteranceLike }).SpeechSynthesisUtterance;
    if (!C) throw new Error('speech synthesis utterances are not available');
    return new C(text);
  });
  const env: GoListenEnv = {
    consent: () => ({ remoteSpeech: opts.remoteConsent?.() === true }),
    speech: opts.speech ?? undefined,
    utterance: makeUtterance,
    proxyBase: '',
    now: opts.now ?? (() => Date.now()),
    voiceWaitMs: opts.voiceWaitMs ?? 300,
    cache: new Map(),
  };
  const registries = new Map<string, VoiceRegistry>();
  const registry = (lang: string): VoiceRegistry => { let r = registries.get(lang); if (!r) { r = registryFor(lang); registries.set(lang, r); } return r; };
  let current: PlaybackHandle | undefined;
  let rate = 1;
  const playbackListeners = new Set<(state: PlaybackState) => void>();
  const publish = (state: PlaybackState): void => { for (const cb of [...playbackListeners]) { try { cb(state); } catch { /* UI callbacks do not break playback */ } } };
  let offState: (() => void) | undefined;

  let operation = 0;
  const clearPlayback = (): void => { offState?.(); offState = undefined; try { current?.dispose(); } catch { /* already gone */ } current = undefined; publish('idle'); };
  const stop = (): void => { operation++; clearPlayback(); };
  // Consent belongs to this operation: a concurrent availability refresh must not grant another request permission.
  const operationEnv = (remoteSpeech: boolean): GoListenEnv => ({ ...env, consent: () => ({ remoteSpeech: opts.refreshConsent ? remoteSpeech : opts.remoteConsent?.() === true }) });

  return {
    async availability(lang): Promise<PronounceAvailability> {
      const consent = await refreshConsent(lang);
      if (!env.speech) return { available: false, note: 'Speech is not available in this browser.' };
      const out = await prepareDevice({ languageId: lang, text: 'x', kind: 'word', processingPermission: 'allowed' }, registry(lang), operationEnv(consent));
      if (!out.ok) return { available: false, note: out.message };
      return { available: true, note: `${DEVICE_PRACTICE_NOTE} ${out.prepared.voice.execution === 'remote' ? 'This browser voice is not local: it sends text to its speech service; you allowed remote speech.' : 'Nothing is sent anywhere.'}` };
    },

    async play(text, lang, context?: { varietyId?: string; kind?: 'word' | 'phrase' | 'sentence' }): Promise<PlayResult> {
      const mine = ++operation;
      clearPlayback();
      const cancelled = (): PlayResult => ({ ok: false, message: 'Pronunciation was stopped.' });
      const consent = await refreshConsent(lang);
      if (mine !== operation) return cancelled();
      if (!env.speech) return { ok: false, message: 'Speech is not available in this browser.' };
      const out = await prepareDevice({ languageId: lang, varietyId: context?.varietyId, text, kind: context?.kind ?? 'word', processingPermission: opts.processingPermission?.() }, registry(lang), operationEnv(consent));
      if (mine !== operation) return cancelled();
      if (!out.ok) return { ok: false, message: out.message };
      const p = out.prepared;
      // Device voice discovery can wait for voiceschanged; refresh remote permission again at actual playback.
      const playbackConsent = p.voice.execution === 'remote' ? await refreshConsent(lang) : consent;
      if (mine !== operation) return cancelled();
      if (p.voice.execution === 'remote' && !playbackConsent) return { ok: false, message: 'Remote speech is off.' };
      const native = findNativeVoice(env, registry(lang), p.voice.voiceId);
      if (!native || p.audio.kind !== 'device') return { ok: false, message: 'The voice is no longer available.' };
      const handle = createPlayback(deviceDriver(operationEnv(playbackConsent), native, p.audio.text), { now: env.now, rate });
      current = handle;
      offState = handle.onState?.(publish);
      handle.play();
      if (handle.state === 'error') { stop(); return { ok: false, message: 'The device could not play that.' }; }
      return { ok: true, voice: 'synthetic', voiceId: p.voice.voiceId };
    },

    stop,
    setRate(value) { rate = clampRate(value); current?.setRate(rate); },
    onPlaybackState(cb) { playbackListeners.add(cb); return () => { playbackListeners.delete(cb); }; },

    onChange(cb) {
      const s = opts.speech;
      if (!s?.addEventListener) return () => {};
      s.addEventListener('voiceschanged', cb);
      return () => s.removeEventListener?.('voiceschanged', cb);
    },
  };
}

/** Privileged speech bridge. The content script supplies no endpoint or credential. */
export interface GoListenPronouncerOptions extends DevicePronouncerOptions {
  speechBridge: (request: SpeechMessage) => Promise<SpeechReply | undefined>;
  localOnly?: () => boolean;
  audio?: import('../../../golisten/src/ports').AudioPort;
  objectUrl?: import('../../../golisten/src/ports').ObjectUrlPort;
}
type PronunciationContext = { readerId?: string; varietyId?: string; kind?: SpeechMessage['kind'] };

export function createGoListenPronouncer(opts: GoListenPronouncerOptions): Pronouncer {
  // Browser cloud voices cannot enforce reader rights. Fallback uses confirmed local voices only.
  const base = createDevicePronouncer({ ...opts, remoteConsent: () => false, refreshConsent: async () => false });
  const audio = opts.audio ?? createHtmlAudioPort();
  const objectUrl = opts.objectUrl ?? (typeof URL !== 'undefined' && URL.createObjectURL ? { create: (b: Blob) => URL.createObjectURL(b), revoke: (u: string) => URL.revokeObjectURL(u) } : undefined);
  const registries = new Map(pronunciationRegistries().map(r => [r.languageId, r]));
  let operation = 0, requestSequence = 0, rate = 1;
  let current: PlaybackHandle | undefined, offState: (() => void) | undefined;
  const pending = new Map<string, string>();
  const listeners = new Set<(s: PlaybackState) => void>();
  const publish = (s: PlaybackState) => { for (const cb of [...listeners]) { try { cb(s); } catch { /* UI */ } } };
  const cancelled = (): PlayResult => ({ ok: false, message: 'Pronunciation was stopped.' });
  const stop = () => {
    operation++;
    for (const [requestId, languageId] of pending) void opts.speechBridge({ op: 'cancel', requestId, languageId }).catch(() => undefined);
    pending.clear(); offState?.(); offState = undefined;
    current?.dispose(); current = undefined; base.stop?.(); publish('idle');
  };
  const consent = async (lang: string): Promise<boolean> => {
    if (opts.localOnly?.() === true) return false;
    try { return await (opts.refreshConsent?.(lang) ?? Promise.resolve(opts.remoteConsent?.() === true)); } catch { return false; }
  };
  const availabilityRequest = async (op: 'status' | 'voices', lang: string): Promise<SpeechReply | undefined> => {
    try {
      return await opts.speechBridge({ op, requestId: `listen:availability:${++requestSequence}`, languageId: lang });
    } catch { return undefined; }
  };
  const bridgeFailure = (reply: SpeechReply | undefined, fallback: string): string => {
    // The background bridge deliberately returns a safe, user-facing message outside json(). Keep it here;
    // converting the reply to an empty response is what used to turn every failure into "no device voice".
    const message = typeof reply?.message === 'string' ? reply.message.trim() : '';
    return message ? message.slice(0, 240) : fallback;
  };
  const localOrRemoteDiagnostic = async (lang: string, diagnostic: string): Promise<PronounceAvailability> => {
    const local = await base.availability(lang);
    return local.available
      ? { available: true, note: `${local.note} Azure speech unavailable: ${diagnostic}` }
      : { available: false, note: diagnostic };
  };
  const environment = (lang: string, context?: PronunciationContext): GoListenEnv => ({
    consent: () => ({ remoteSpeech: true, localOnly: opts.localOnly?.() === true }),
    fetch: async (url, init): Promise<FetchResponseLike> => {
      const op = url.endsWith('/status') ? 'status' : url.includes('/voices?') ? 'voices' : 'synthesize';
      const requestId = `listen:${++requestSequence}`;
      const payload = init?.body ? JSON.parse(init.body) as Record<string, unknown> : {};
      pending.set(requestId, lang);
      try {
        const reply = await opts.speechBridge({ op, requestId, languageId: lang, readerId: context?.readerId,
          varietyId: context?.varietyId, text: typeof payload.text === 'string' ? payload.text : undefined,
          kind: context?.kind ?? 'word', voice: typeof payload.voice === 'string' ? payload.voice : undefined,
          locale: typeof payload.locale === 'string' ? payload.locale : undefined });
        const r = reply ?? { ok: false, status: 503 };
        return { ok: r.ok, status: r.status,
          headers: { get: name => name.toLowerCase() === 'content-type' && op === 'synthesize' && r.ok ? 'audio/wav' : 'application/json' },
          json: async () => r.json ?? {}, blob: async () => new Blob([new Uint8Array(r.bytes ?? [])], { type: 'audio/wav' }) };
      } finally { pending.delete(requestId); }
    },
    audio, objectUrl, utterance: opts.utterance ?? (() => { throw new Error('No utterance port'); }),
    proxyBase: '/api/speech', now: opts.now ?? Date.now, voiceWaitMs: opts.voiceWaitMs ?? 0, cache: new Map(),
  });
  return {
    async availability(lang) {
      const localOnly = opts.localOnly?.() === true;
      if (localOnly) return localOrRemoteDiagnostic(lang, 'Local-only speech is on.');
      if (!(await consent(lang))) return localOrRemoteDiagnostic(lang,
        opts.localOnly ? 'Remote speech is off.' : 'Remote speech is off or local-only speech is on. Check GoLearn Privacy.');
      const reg = registries.get(lang);
      const entry = reg?.entries.find((e) => e.provider === 'remote' && e.source.kind === 'remote');
      if (!entry || entry.source.kind !== 'remote') return localOrRemoteDiagnostic(lang, `No Azure voice is registered for ${lang}.`);
      const providerVoice = entry.source.providerVoice;

      const status = await availabilityRequest('status', lang);
      if (!status?.ok) {
        const message = bridgeFailure(status, 'The speech backend is unavailable. Check the connection.');
        if (status?.status === 401 || /authentication failed|unauthorized/i.test(message)) return localOrRemoteDiagnostic(lang, message);
        return localOrRemoteDiagnostic(lang, message);
      }
      const configured = (status.json as { configured?: unknown } | undefined)?.configured;
      if (configured !== true) return localOrRemoteDiagnostic(lang, 'The authenticated speech backend is not configured.');

      const voices = await availabilityRequest('voices', lang);
      if (!voices?.ok) {
        const message = bridgeFailure(voices, 'The speech backend is unavailable. Check the connection.');
        return localOrRemoteDiagnostic(lang, message);
      }
      const listed = (voices.json as { voices?: Array<{ id?: unknown }> } | undefined)?.voices;
      if (!Array.isArray(listed)) return localOrRemoteDiagnostic(lang, bridgeFailure(voices, 'The speech backend returned an invalid voice list.'));
      if (!listed.some((v) => v && v.id === providerVoice)) {
        return localOrRemoteDiagnostic(lang, `No Azure voice is available for ${lang}.`);
      }
      return { available: true, note: 'Azure Neural speech through your authenticated backend; source permission is checked when you ask to play.' };
    },
    async play(text, lang, context) {
      stop(); const mine = operation;
      const reg = registries.get(lang);
      let remoteFailure: PlayResult | undefined;
      if (reg && audio && objectUrl && await consent(lang)) {
        if (mine !== operation) return cancelled();
        const env = environment(lang, context);
        const out = await prepareRemote({ languageId: lang, varietyId: context?.varietyId, text,
          kind: context?.kind ?? 'word', processingPermission: 'allowed' }, reg, env);
        if (out.ok && out.prepared.audio.kind === 'remote') {
          const url = out.prepared.audio.url;
          const allowed = await consent(lang);
          if (mine !== operation || !allowed) { objectUrl.revoke(url); return cancelled(); }
          const handle = createPlayback(clipDriver(audio, url, () => objectUrl.revoke(url)), { now: env.now, rate });
          current = handle; offState = handle.onState?.(publish); handle.play();
          return handle.state === 'error' ? { ok: false, message: 'The browser could not play speech audio.' } : { ok: true, voice: 'synthetic', voiceId: out.prepared.voice.voiceId };
        }
        // Keep the privileged/provider failure available for the no-local-voice case. Falling
        // through is useful when a matching local voice exists, but its generic "no device
        // voice" error hides the actionable remote status on devices such as Hindi-only pages.
        if (!out.ok) remoteFailure = { ok: false, message: out.message };
      }
      if (mine !== operation) return cancelled();
      const fallback = await base.play(text, lang, context);
      return !fallback.ok && remoteFailure ? remoteFailure : fallback;
    },
    stop,
    setRate(value) { rate = clampRate(value); current?.setRate(rate); base.setRate?.(rate); },
    onPlaybackState(cb) { listeners.add(cb); const off = base.onPlaybackState?.(cb); return () => { listeners.delete(cb); off?.(); }; },
    onChange: base.onChange,
  };
}
