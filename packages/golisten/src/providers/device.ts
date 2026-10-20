/**
 * Device voices (the browser's speechSynthesis). Adapted from the repository's own practice voice
 * (src/ui/reader/useListen.ts `pickDeviceVoice`) with one deliberate difference: the match is STRICT. A voice is used
 * only when its language tag is one the registry accepts for the language; an English voice is never "close enough"
 * for Albanian and the device default is never a fallback. A voice that is not `localService` sends the text to the
 * browser vendor's cloud, so it needs the learner's remote-speech consent like any other remote voice.
 */
import type { PronunciationProvenance, VoiceDescriptor } from '../contracts';
import { deviceVoiceId, getDeviceVoices, langMatches, normalizeTag, speechVarietyLocale, tagRank } from '../environment';
import type { GoListenEnv } from '../environment';
import type { PlaybackDriver } from '../playback';
import type { SpeechLike, SpeechVoiceLike } from '../ports';
import { DEVICE_LICENCE, SYNTHETIC_LIMITATIONS } from '../registry';
import type { VoiceEntry, VoiceRegistry } from '../registry';
import { fail } from './types';
import type { PrepareOutcome, Req } from './types';

/** The sentence a learner is told about the device voice (same wording as the reader's PRACTICE_LABEL). */
export const DEVICE_PRACTICE_NOTE = 'Computer voice, practice only: not counted as listening.';

export interface DeviceMatch { voice: SpeechVoiceLike; descriptor: VoiceDescriptor; networked: boolean }

export function deviceDescriptor(entry: VoiceEntry, v: SpeechVoiceLike): VoiceDescriptor {
  // The platform only promises privacy when it explicitly marks a voice local.
  // Missing metadata is treated conservatively as networked; this prevents a
  // browser vendor's cloud voice from bypassing the remote-speech consent gate.
  const networked = v.localService !== true;
  return {
    voiceId: deviceVoiceId(v), languageId: entry.languageId, varietyId: regionOf(v.lang),
    provider: 'device', execution: networked ? 'remote' : 'local', synthetic: true,
    licence: DEVICE_LICENCE, qualityVerification: 'unverified',
    knownLimitations: [
      ...SYNTHETIC_LIMITATIONS,
      ...(networked ? ['This browser voice is not local: it sends the text to the browser vendor\'s speech service.'] : []),
    ],
    supports: [...entry.supports], suitableForAssessment: false, label: `Device voice: ${v.name} (${v.lang})`,
  };
}

/** 'sq_al' -> 'sq-AL'; a bare language tag carries no variety claim. */
const regionOf = (lang: string): string | undefined => {
  const [l, r] = normalizeTag(lang).split('-');
  return r ? `${l}-${r.toUpperCase()}` : undefined;
};

const deviceTags = (entry: VoiceEntry): string[] => (entry.source.kind === 'device' ? entry.source.langTags : []);
const normalizeLocale = (locale: string): string => locale.trim().replace(/_/g, '-').toLowerCase();

/** Every installed voice whose language is accepted for the entry, best first (local before network, listed tag order, default, name). */
export async function matchDeviceVoices(entry: VoiceEntry, env: GoListenEnv): Promise<{ matches: DeviceMatch[]; foreignLangs: string[] }> {
  const all = await getDeviceVoices(env);
  const tags = deviceTags(entry);
  const matches = all.filter((v) => langMatches(v.lang, tags)).map((voice) => ({ voice, descriptor: deviceDescriptor(entry, voice), networked: voice.localService !== true }));
  matches.sort((a, b) =>
    Number(a.networked) - Number(b.networked)
    || tagRank(a.voice.lang, tags) - tagRank(b.voice.lang, tags)
    || Number(!!b.voice.default) - Number(!!a.voice.default)
    || a.voice.name.localeCompare(b.voice.name));
  const foreign = [...new Set(all.filter((v) => !langMatches(v.lang, tags)).map((v) => v.lang))].sort();
  return { matches, foreignLangs: foreign };
}

/** Synchronous re-find of a device voice by id, for playback of an already prepared stimulus. Strict language check included. */
export function findNativeVoice(env: Pick<GoListenEnv, 'speech'>, registry: VoiceRegistry, voiceId: string): SpeechVoiceLike | undefined {
  let all: SpeechVoiceLike[] = [];
  try { all = env.speech?.getVoices() ?? []; } catch { return undefined; }
  const hit = all.find((v) => deviceVoiceId(v) === voiceId);
  if (!hit) return undefined;
  const ok = registry.entries.some((e) => e.source.kind === 'device' && langMatches(hit.lang, deviceTags(e)));
  return ok ? hit : undefined;
}

export async function prepareDevice(req: Req, registry: VoiceRegistry, env: GoListenEnv): Promise<PrepareOutcome> {
  const entries = registry.entries.filter((e) => e.source.kind === 'device');
  if (entries.length === 0) return fail('no-voice', `No device voice is registered for ${req.languageId}.`);
  if (!env.speech) return fail('no-voice', 'Speech synthesis is not available in this environment.');
  for (const entry of entries) {
    if (req.varietyId) {
      const wanted = speechVarietyLocale(req.languageId, req.varietyId);
      if (wanted === '__unsupported_gheg__') return fail('no-voice', 'No approved Gheg device voice is registered; the standard Albanian voice is not substituted.');
      if (!wanted) return fail('no-voice', `No device voice is registered for variety ${req.varietyId}.`);
      const acceptsVariety = deviceTags(entry).some((tag) => normalizeLocale(tag) === wanted);
      if (!acceptsVariety) return fail('no-voice', `This device has no ${req.languageId} voice for variety ${req.varietyId}; another variety is not substituted.`);
    }
    if (!entry.supports.includes(req.kind)) return fail('unsupported-kind', `Device voices here do not speak a ${req.kind}.`);
    const found = await matchDeviceVoices(entry, env);
    const standardAlias = req.varietyId && ['sq-standard', 'hi-standard', 'th-standard', 'nb', 'nn', 'he-mod', 'el-mod', 'he-bib', 'he-mish', 'he-med', 'arc-bib', 'el-koi', 'el-att', 'el-hom', 'el-med', 'la-ecclesiastical', 'la-classical'].includes(normalizeLocale(req.varietyId));
    const matches = req.varietyId
      ? found.matches.filter((m) => standardAlias || normalizeLocale(m.voice.lang) === speechVarietyLocale(req.languageId, req.varietyId))
      : found.matches;
    const foreignLangs = found.foreignLangs;

    if (req.voiceId?.startsWith('device:')) {
      const all = await getDeviceVoices(env);
      const named = all.find((v) => deviceVoiceId(v) === req.voiceId);
      if (!named) return fail('no-voice', 'The requested device voice is not installed.');
      if (!langMatches(named.lang, deviceTags(entry))) {
        return fail('wrong-language-voice', `The requested voice speaks ${named.lang}, not ${req.languageId}; it was not used.`);
      }
    }
    const wanted = req.voiceId?.startsWith('device:') ? matches.filter((m) => m.descriptor.voiceId === req.voiceId) : matches;
    if (wanted.length === 0) {
      const others = foreignLangs.length ? ` The device offers voices for other languages (${foreignLangs.join(', ')}); none of them is used.` : '';
      return fail('no-voice', `This device has no ${req.languageId} voice (accepted tags: ${deviceTags(entry).join(', ')}).${others}`);
    }
    const local = wanted.filter((m) => !m.networked);
    let chosen: DeviceMatch | undefined = local[0];
    if (!chosen) {
      if (req.processingPermission !== 'allowed') return fail('no-consent', 'Source permission is required for a browser voice that sends text to a network service.');
      if (env.consent().localOnly === true) return fail('no-consent', 'Local-only speech is on; this browser voice may send text to a network service.');
      if (!env.consent().remoteSpeech) {
        return fail('no-consent', `The only ${req.languageId} voice on this device sends the text to the browser vendor's speech service; remote speech is off.`);
      }
      chosen = wanted[0];
    }
    const provenance: PronunciationProvenance = {
      source: 'device-tts', voiceId: chosen.descriptor.voiceId, generatedFromText: true,
      note: `${DEVICE_PRACTICE_NOTE} ${chosen.networked ? 'This browser voice is not local.' : ''}`.trim(),
    };
    return { ok: true, prepared: { voice: chosen.descriptor, provenance, audio: { kind: 'device', text: req.text.replace(/\s+/g, ' ').trim() } } };
  }
  return fail('no-voice', `No device voice is registered for ${req.languageId}.`);
}

// Browser speech is global; a retired handle must not control its replacement.
const activeSpeech = new WeakMap<SpeechLike, { interrupted(): void }>();

export function deviceDriver(env: Pick<GoListenEnv, 'speech' | 'utterance' | 'consent'>, voice: SpeechVoiceLike, text: string): PlaybackDriver {
  const speech = env.speech!;
  let hearing: { interrupted(): void } | undefined;
  const owns = () => !!hearing && activeSpeech.get(speech) === hearing;
  const allowed = () => voice.localService === true || (env.consent().localOnly !== true && env.consent().remoteSpeech);
  const cancel = () => {
    if (!owns()) return;
    activeSpeech.delete(speech);
    hearing = undefined;
    speech.cancel();
  };
  return {
    start(rate, cb) {
      if (!allowed()) { cb.failed(); return; }
      const u = env.utterance(text);
      u.voice = voice;
      u.lang = voice.lang;
      u.rate = rate;
      const previous = activeSpeech.get(speech);
      activeSpeech.delete(speech);
      previous?.interrupted();
      speech.cancel();
      const mine = { interrupted: cb.interrupted };
      hearing = mine;
      activeSpeech.set(speech, mine);
      const finish = (notify: () => void) => {
        if (activeSpeech.get(speech) !== mine) return;
        activeSpeech.delete(speech);
        hearing = undefined;
        notify();
      };
      u.onend = () => finish(cb.ended);
      u.onerror = (ev) => finish(ev?.error === 'canceled' || ev?.error === 'interrupted' ? cb.interrupted : cb.failed);
      try { speech.speak(u); } catch (e) { cancel(); throw e; }
    },
    pause() { if (owns()) speech.pause(); },
    resume() {
      if (!owns()) return;
      if (!allowed()) { cancel(); throw new Error('Remote speech consent withdrawn'); }
      speech.resume();
    },
    cancel,
  };
}
