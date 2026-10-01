/**
 * audioStatus - the honest, learner-facing state of one text's audio. Reads only; never writes, never throws.
 *
 * Decision order for the voice the text is (or would be) voiced with:
 *
 *   no manifest for that voice ............................ unavailable (no usable provider) | not-generated
 *   stored audio is fixture audio and the fixture is off .. unavailable
 *   manifest.contentVersion < text.contentVersion .......... stale
 *   a live sentence's segment is pending ................... generating (unavailable when the provider cannot run it;
 *                                                            failed when some sentence already failed and the rest wait)
 *   a live sentence's segment is failed / dead ............. failed (with the job's error)
 *   a live sentence has no segment (some others are ready) . stale      (none ready at all: not-generated)
 *   every live sentence ready, voice not reviewed real speech  preview-only
 *   every live sentence ready, reviewed real speech ......... ready      (the only state with evidenceEligible)
 *
 * Partial generation: when some live sentences are ready and others failed, the reason reads
 * "x of y sentences ready; n failed: <first error>" (plus "; k still generating" / "; k more wait for the provider"),
 * the state follows the rules above (generating while anything is pending and runnable, otherwise failed), and the
 * ready segments stay playable: the manifest lists every segment and the player skips the ones that are not ready.
 * `audioStatusDetail` also returns the failed sentences (id, index, text, error) for diagnostics.
 *
 * "Live" = not retired by a later import. A sentence is matched to its segment by recomputing the cache key
 * (display text + speech text + voice + provider version + lexicon ...), so an edited sentence is missing while its
 * neighbours stay ready; when the provider is not registered this session it falls back to the manifest's membership.
 */
import { ids } from '../core/ids';
import { REVIEW_OK } from '../core/model';
import type { AudioAsset, AudioJob, AudioManifest, AudioSegment, Sentence, Text, VoiceConfig } from '../core/model';
import type { AudioStatus } from '../core/contracts/golisten';
import { availabilityMessage, aggregateAvailability, usability } from './providers';
import { liveSentences } from './manifest';
import { planSpeech } from './pipeline';
import { FIXTURE_DISCLAIMER } from './fixtureProvider';
import type { Runtime } from './types';
import { planVoiceQuiet } from './voices';

export interface AudioStatusOptions {
  /** The caller is in preview mode (affects wording only: preview-only audio is never hidden or promoted). */
  preview?: boolean;
  /** Report on this voice instead of the default one. */
  voiceConfigId?: string;
}

type Group = { segmentId: string; seg?: AudioSegment; sentences: Sentence[] };
type Cls = 'ready' | 'pending' | 'failed' | 'missing';

/** One live sentence whose audio could not be produced (dead job / failed segment), with the reason. */
export interface FailedSentence { sentenceId: string; index: number; text: string; segmentId: string; error: string; attempts?: number }

export async function audioStatusFor(rt: Runtime, textId: string, opts: AudioStatusOptions = {}): Promise<AudioStatus> {
  return (await audioStatusDetail(rt, textId, opts)).status;
}

/** The status plus the live sentences that failed (for diagnostics: which sentences failed and why). Never throws. */
export async function audioStatusDetail(rt: Runtime, textId: string, opts: AudioStatusOptions = {}): Promise<{ status: AudioStatus; failedSentences: FailedSentence[] }> {
  const failedSentences: FailedSentence[] = [];
  try {
    return { status: await compute(rt, textId, opts, failedSentences), failedSentences };
  } catch (e) {
    return { status: blank(textId, 0, 'failed', `Audio status could not be determined: ${e instanceof Error ? e.message : String(e)}`), failedSentences: [] };
  }
}

function blank(textId: string, textContentVersion: number, state: AudioStatus['state'], reason?: string): AudioStatus {
  return { textId, state, reason, isSpeech: false, textContentVersion, readySegments: 0, totalSegments: 0, failedSegments: 0, evidenceEligible: false };
}

const voiceFields = (v: VoiceConfig | undefined) => v ? {
  providerId: v.providerId, providerVersion: v.providerVersion, voiceId: v.voiceId, requestedLocale: v.requestedLocale,
  deliveredLocale: v.actualLocale, voiceReview: v.reviewStatus ?? 'unreviewed',
} : {};

async function compute(rt: Runtime, textId: string, opts: AudioStatusOptions, failedOut: FailedSentence[]): Promise<AudioStatus> {
  const { store } = rt;
  const text: Text | undefined = await store.texts.get(textId);
  if (!text) return blank(textId, 0, 'unavailable', `Text ${textId} was not found, so it has no audio.`);
  const tcv = text.contentVersion;
  const live = await liveSentences(store, textId);
  const manifests = await store.manifests.where('textId', textId);

  // Which voice are we reporting on?
  const planned = opts.voiceConfigId ? undefined : await planVoiceQuiet(rt, text.lang);
  const wantedVoiceId = opts.voiceConfigId ?? planned?.voice.id;
  const pool = wantedVoiceId ? manifests.filter((m) => m.voiceConfigId === wantedVoiceId) : (planned ? [] : manifests);
  const manifest: AudioManifest | undefined = [...pool].sort((a, b) => b.contentVersion - a.contentVersion || (a.updatedAt < b.updatedAt ? 1 : -1))[0];

  if (!manifest) {
    const avail = await aggregateAvailability(rt);
    const v = planned?.voice;
    const base = { ...blank(textId, tcv, 'unavailable'), ...voiceFields(v), isSpeech: v?.isSpeech ?? false, totalSegments: live.length };
    if (!planned || !avail.available) return { ...base, state: 'unavailable', reason: availabilityMessage(avail.available ? { available: false, reason: 'no-provider' } : avail) };
    return { ...base, state: 'not-generated', reason: `No audio has been generated for this text yet (voice ${v!.voiceId}). Reading works without it.` };
  }

  const voice = await store.voices.get(manifest.voiceConfigId);
  if (!voice) return { ...blank(textId, tcv, 'failed', `The voice configuration ${manifest.voiceConfigId} is missing; regenerate the audio.`), audioContentVersion: manifest.contentVersion, totalSegments: live.length };
  const provider = rt.providers.get(voice.providerId);
  const speechVoice = voice.isSpeech === true;
  const head = { textId, ...voiceFields(voice), audioContentVersion: manifest.contentVersion, textContentVersion: tcv };

  // ── classify every live sentence's segment ──
  const groups = new Map<string, Group>();
  const add = (segmentId: string, s: Sentence, seg: AudioSegment | undefined) => {
    const g = groups.get(segmentId) ?? { segmentId, seg, sentences: [] };
    g.sentences.push(s);
    groups.set(segmentId, g);
  };
  let keyed = false;
  if (provider) {
    try {
      const overrides = await store.pronunciations.where('lang', text.lang);
      const planIds = new Map<string, string>();
      for (const s of live) {
        const isScripture = text.kind === 'scripture' || (s.verseRefs?.length ?? 0) > 0;
        const plan = await planSpeech(rt, { lang: text.lang, displayText: s.text, isScripture, voice, provider, overrides });
        planIds.set(s.id, ids.audioSegment(plan.cacheKey));
      }
      const segs = new Map((await store.audioSegments.getMany([...new Set(planIds.values())])).filter((x): x is AudioSegment => !!x).map((x) => [x.id, x]));
      for (const s of live) { const sid = planIds.get(s.id)!; add(segs.get(sid) ? sid : `missing:${sid}`, s, segs.get(sid)); }
      keyed = true;
    } catch { groups.clear(); }
  }
  if (!keyed) {
    const segs = (await store.audioSegments.getMany([...new Set(manifest.segmentIds)])).filter((x): x is AudioSegment => !!x);
    for (const s of live) {
      const seg = segs.find((x) => x.sentenceIds.includes(s.id));
      add(seg ? seg.id : `missing:${s.id}`, s, seg);
    }
  }

  const jobs = new Map<string, AudioJob>();
  const readyAssets: AudioAsset[] = [];
  let readyN = 0, failedN = 0, pendingN = 0, missingN = 0, retrying = 0;
  const errors: string[] = []; // errors of jobs that are being retried (not dead yet)
  const deadErrors: string[] = []; // errors of sentences that failed for good
  const markFailed = (g: Group, seg: AudioSegment, job: AudioJob | undefined): Cls => {
    const error = job?.lastError ?? 'no error was recorded';
    deadErrors.push(error);
    for (const s of g.sentences) failedOut.push({ sentenceId: s.id, index: s.index, text: s.text.length > 80 ? `${s.text.slice(0, 79)}…` : s.text, segmentId: seg.id, error, attempts: job?.attempts });
    return 'failed';
  };
  const cls = async (g: Group): Promise<Cls> => {
    const seg = g.seg;
    if (!seg) return 'missing';
    const job = await store.audioJobs.get(seg.cacheKey);
    if (job) jobs.set(seg.id, job);
    if (seg.status === 'ready' && seg.assetId) {
      const asset = await store.audioAssets.get(seg.assetId);
      if (asset && (await store.assets.has(seg.assetId))) { readyAssets.push(asset); return 'ready'; }
      return job && job.status === 'dead' ? markFailed(g, seg, job) : 'pending'; // bytes evicted: will be regenerated
    }
    if (seg.status === 'failed' || job?.status === 'dead') return markFailed(g, seg, job);
    if (job?.status === 'failed' && job.lastError) { errors.push(job.lastError); retrying++; }
    return 'pending';
  };
  for (const g of groups.values()) {
    const c = await cls(g);
    if (c === 'ready') readyN++; else if (c === 'failed') failedN++; else if (c === 'pending') pendingN++; else missingN++;
  }
  const total = groups.size;
  const counts = { readySegments: readyN, totalSegments: total, failedSegments: failedN };
  const allSpeech = readyAssets.length > 0 && readyAssets.every((a) => a.isSpeech === true);
  const out = (state: AudioStatus['state'], reason?: string): AudioStatus => ({
    ...head, ...counts, state, reason, isSpeech: speechVoice && (readyAssets.length === 0 || allSpeech),
    evidenceEligible: state === 'ready',
  });

  // Fixture audio left in the store while fixture audio is switched off.
  if (!speechVoice && !rt.allowFixture) {
    return out('unavailable', `Stored audio for this text is development fixture audio (not speech) and fixture audio is turned off. ${availabilityMessage(await aggregateAvailability(rt))}`);
  }
  if (manifest.contentVersion < tcv) {
    return out('stale', `This audio was made for version ${manifest.contentVersion} of the text; the text is now version ${tcv}. Regenerate the audio.`);
  }
  // Partial generation is stated as such: "x of y sentences ready; n failed: <first error>". The ready sentences stay
  // playable (the manifest lists every segment and the player skips the ones that are not ready).
  const firstDead = deadErrors[0];
  const partial = readyN > 0 && failedN > 0 ? `${readyN} of ${total} sentences ready; ${failedN} failed: ${firstDead}` : undefined;
  const couldNot = `${failedN} of ${total} sentence${total === 1 ? '' : 's'} could not be voiced: ${firstDead}`;
  if (pendingN > 0) {
    if (provider) {
      const u = await usability(rt, provider);
      if (!u.usable && failedN === 0) return out('unavailable', `Audio generation is waiting for the speech provider. ${availabilityMessage(u.why)}`);
      if (!u.usable) return out('failed', `${partial ?? couldNot}; ${pendingN} more wait for the speech provider. ${availabilityMessage(u.why)}`);
    }
    const retry = retrying > 0 ? ` ${retrying} ${retrying === 1 ? 'sentence is' : 'sentences are'} being retried after an error (${errors[0]}).` : '';
    if (partial) return out('generating', `${partial}; ${pendingN} still generating.${retry}`);
    return out('generating', `Generating audio: ${readyN} of ${total} ready.${retry}`);
  }
  if (failedN > 0) {
    const missing = missingN > 0 ? ` ${missingN} more ${missingN === 1 ? 'has' : 'have'} no audio yet.` : '';
    if (partial) return out('failed', `${partial}.${missing} The ready sentences can still be played. Fix the cause, then retry.`);
    return out('failed', `${couldNot}.${missing} Fix the cause, then retry.`);
  }
  if (missingN > 0) {
    if (readyN === 0) return out('not-generated', `No sentence of the current text has audio yet (voice ${voice.voiceId}).`);
    return out('stale', `${missingN} of ${total} sentence${total === 1 ? '' : 's'} of the current text have no audio (the text changed or audio was generated for part of it). Regenerate the audio.`);
  }

  // Everything is ready: is it evidence-eligible?
  const reviewed = REVIEW_OK.includes(voice.reviewStatus ?? 'unreviewed');
  if (speechVoice && allSpeech && reviewed) return out('ready');
  const hearHint = opts.preview ? '' : ' Turn on preview mode to listen.';
  if (!speechVoice || !allSpeech) return out('preview-only', `${FIXTURE_DISCLAIMER} Preview only: playing it never counts as listening evidence.${hearHint}`);
  const r = voice.reviewStatus ?? 'unreviewed';
  const why = r === 'rejected' ? 'was rejected in review' : r === 'in-review' ? 'is still being reviewed' : 'has not been auditioned yet';
  return out('preview-only', `Voice ${voice.voiceId} ${why}. Preview only: playing it earns no listening evidence until a person auditions it and marks it reviewed.${hearHint}`);
}
