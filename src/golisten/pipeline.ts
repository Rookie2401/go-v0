/**
 * The audio pipeline (planning + scheduling; synthesis itself is in jobs.ts):
 *
 *   sentence -> adapter.speechNormalize -> verse-marker safety net -> pronunciation overrides
 *            -> cache key -> segment (pending, no assetId) -> idempotent job (id = cacheKey)
 *            -> [job runner: synthesize -> validate -> content-addressed asset -> segment ready
 *                -> by-construction sentence alignment] -> manifest
 */
import { hash, ids, parseSentenceId } from '../core/ids';
import type { AudioJob, AudioSegment, LanguageCode, PronunciationEntry, Sentence, Text, TransformationRecord, VoiceConfig } from '../core/model';
import type { EnsureAudioOptions, EnsureAudioResult, TtsProvider } from '../core/contracts/golisten';
import { computeCacheKey } from './cacheKey';
import { runJob } from './jobs';
import { liveSentences, writeManifest } from './manifest';
import { writeSentenceAlignments } from './alignment';
import { applicableEntries, applyPronunciation } from './pronunciation';
import { GOLISTEN_VERSION, PIPELINE_NORMALIZER_SUFFIX, type Runtime } from './types';
import { gateVoice, planVoice } from './voices';

// ───────────────────────── speech text ─────────────────────────

/**
 * Safety net behind the adapter: verse markers are never spoken. Bracketed numerals ("[16]", "[3-4]")
 * are always removed; superscript digits only for scripture (they can be a real "m²" elsewhere).
 * Returns the removed markers so the transformation is recorded, not silent.
 */
export function stripVerseMarkers(text: string, opts: { superscripts: boolean }): { text: string; removed: string[] } {
  const removed: string[] = [];
  let out = text.replace(/\[\s*\d+(?:\s*[-–,]\s*\d+)*\s*\]/gu, (m) => { removed.push(m); return ' '; });
  if (opts.superscripts) out = out.replace(/[⁰¹²³⁴-⁹]+/gu, (m) => { removed.push(m); return ' '; });
  if (removed.length === 0) return { text, removed };
  return { text: out.replace(/[ \t]{2,}/g, ' ').trim(), removed };
}

export interface SpeechPlan {
  cacheKey: string;
  displayText: string;
  displayTextHash: string;
  speechText: string;
  transformations: TransformationRecord[];
  overridesUsed: string[];
  lexiconVersion: string;
  normalizerVersion: string;
  /** Nothing speakable remains after normalization. */
  empty: boolean;
}

export async function planSpeech(rt: Runtime, a: {
  lang: LanguageCode; displayText: string; isScripture: boolean; voice: VoiceConfig; provider: TtsProvider; overrides: PronunciationEntry[];
}): Promise<SpeechPlan> {
  const adapter = rt.adapters.get(a.lang);
  const norm = adapter.speechNormalize(a.displayText, { isScripture: a.isScripture });
  const transformations = [...norm.transformations];
  let speech = norm.speechText;
  const stripped = stripVerseMarkers(speech, { superscripts: a.isScripture });
  if (stripped.removed.length) {
    speech = stripped.text;
    transformations.push({ at: rt.clock(), tool: GOLISTEN_VERSION, description: `verse marker(s) removed from speech text: ${stripped.removed.join(' ')}` });
  }
  const applied = applyPronunciation(
    a.displayText, speech, applicableEntries(a.overrides, { providerId: a.provider.id, voiceId: a.voice.voiceId }), a.provider.capabilities(),
    { wordBoundaries: adapter.display.wordSeparator !== '' },
  );
  for (const e of applied.used) transformations.push({ at: rt.clock(), tool: GOLISTEN_VERSION, description: `pronunciation override ${e.id} (${e.mechanism}) applied to "${e.match}"` });
  const displayTextHash = hash(a.displayText);
  const normalizerVersion = `${norm.normalizerVersion}+${PIPELINE_NORMALIZER_SUFFIX}`;
  const cacheKey = computeCacheKey({
    displayTextHash, speechText: applied.speechText, lang: a.lang, actualLocale: a.voice.actualLocale, providerId: a.provider.id,
    engine: a.voice.engine, voiceId: a.voice.voiceId, settings: rt.settings, normalizerVersion, lexiconVersion: applied.lexiconVersion,
    providerVersion: a.provider.version,
  });
  return {
    cacheKey, displayText: a.displayText, displayTextHash, speechText: applied.speechText, transformations,
    overridesUsed: applied.used.map((e) => e.id), lexiconVersion: applied.lexiconVersion, normalizerVersion,
    empty: !/[\p{L}\p{N}]/u.test(applied.speechText),
  };
}

// ───────────────────────── segments + jobs ─────────────────────────

interface SegmentMeta { lang: LanguageCode; textId: string; sentenceIds: string[]; sequence: number; contentVersion: number; voice: VoiceConfig }

type Upsert = { segment: AudioSegment; created: boolean; reusable: boolean };

async function upsertSegment(rt: Runtime, plan: SpeechPlan, m: SegmentMeta): Promise<Upsert> {
  const id = ids.audioSegment(plan.cacheKey);
  const existing = await rt.store.audioSegments.get(id);
  if (!existing) {
    const segment: AudioSegment = {
      id, cacheKey: plan.cacheKey, lang: m.lang, sentenceIds: m.sentenceIds, textId: m.textId,
      displayText: plan.displayText, speechText: plan.speechText, speechNormalization: plan.transformations,
      pronunciationOverridesUsed: plan.overridesUsed, voiceConfigId: m.voice.id,
      status: plan.empty ? 'failed' : 'pending', // never "ready", never an assetId, until a validated asset exists
      sequence: m.sequence, contentVersion: m.contentVersion,
    };
    await rt.store.audioSegments.put(segment);
    return { segment, created: true, reusable: false };
  }
  // Reuse. Keep sentence ids of other texts, replace this text's ids with the current group.
  const foreign = existing.sentenceIds.filter((sid) => parseSentenceId(sid).textId !== m.textId);
  const merged = [...new Set([...foreign, ...m.sentenceIds])];
  const sameText = existing.textId === m.textId;
  let segment: AudioSegment = {
    ...existing, sentenceIds: merged,
    ...(sameText ? { sequence: m.sequence, contentVersion: m.contentVersion } : {}),
  };
  let reusable = false;
  if (existing.status === 'ready' && existing.assetId) {
    if (await rt.store.assets.has(existing.assetId)) reusable = true;
    else segment = { ...segment, status: 'pending', assetId: undefined }; // bytes evicted: regenerate
  }
  if (JSON.stringify(segment) !== JSON.stringify(existing)) await rt.store.audioSegments.put(segment);
  return { segment, created: false, reusable };
}

async function ensureJob(rt: Runtime, segment: AudioSegment, plan: SpeechPlan): Promise<AudioJob> {
  const now = rt.clock();
  const existing = await rt.store.audioJobs.get(segment.cacheKey);
  if (!existing) {
    const job: AudioJob = plan.empty
      ? { id: segment.cacheKey, segmentId: segment.id, status: 'dead', attempts: 0, maxAttempts: rt.maxAttempts, lastError: 'empty speech text after normalization', log: [{ at: now, message: 'nothing speakable after normalization' }], createdAt: now, updatedAt: now }
      : { id: segment.cacheKey, segmentId: segment.id, status: 'queued', attempts: 0, maxAttempts: rt.maxAttempts, log: [{ at: now, message: 'queued' }], createdAt: now, updatedAt: now };
    await rt.store.audioJobs.put(job);
    return job;
  }
  if (existing.status === 'succeeded' && segment.status !== 'ready') {
    const job: AudioJob = { ...existing, status: 'queued', attempts: 0, lastError: undefined, nextAttemptAt: undefined, updatedAt: now, log: [...existing.log, { at: now, message: 'requeued: asset bytes missing' }].slice(-40) };
    await rt.store.audioJobs.put(job);
    return job;
  }
  return existing;
}

// ───────────────────────── voice selection ─────────────────────────

async function voiceFor(rt: Runtime, lang: LanguageCode, voiceConfigId?: string): Promise<{ voice: VoiceConfig; provider: TtsProvider }> {
  if (!voiceConfigId) {
    // Default voice. Throws AudioUnavailable (nothing written) when there is no usable provider.
    const plan = await planVoice(rt, lang);
    if (!plan.persisted) await rt.store.voices.put(plan.voice);
    return { voice: plan.voice, provider: plan.provider };
  }
  const row = await rt.store.voices.get(voiceConfigId);
  if (!row) throw new Error(`GoListen: voice config ${voiceConfigId} not found`);
  if (row.lang !== lang) throw new Error(`GoListen: voice config ${row.id} is ${row.lang}, text is ${lang}`);
  return gateVoice(rt, row);
}

// ───────────────────────── ensureAudio ─────────────────────────

export async function ensureAudioForText(rt: Runtime, textId: string, opts: EnsureAudioOptions = {}): Promise<EnsureAudioResult> {
  const text: Text | undefined = await rt.store.texts.get(textId);
  if (!text) throw new Error(`GoListen: text ${textId} not found`);
  const { voice, provider } = await voiceFor(rt, text.lang, opts.voiceConfigId); // the availability gate: throws before anything is written
  const all: Sentence[] = await liveSentences(rt.store, textId); // retired sentences never get audio
  const selected = opts.sentenceIds ? new Set(opts.sentenceIds) : undefined;
  const overrides = await rt.store.pronunciations.where('lang', text.lang);

  // Plan every sentence (cheap, no synthesis) so the manifest always describes the whole text.
  const plans = new Map<string, SpeechPlan>();
  const keyOf = new Map<string, string>();
  const groups = new Map<string, Sentence[]>();
  for (const s of all) {
    const isScripture = text.kind === 'scripture' || (s.verseRefs?.length ?? 0) > 0;
    const plan = await planSpeech(rt, { lang: text.lang, displayText: s.text, isScripture, voice, provider, overrides });
    plans.set(plan.cacheKey, plan);
    keyOf.set(s.id, plan.cacheKey);
    groups.set(plan.cacheKey, [...(groups.get(plan.cacheKey) ?? []), s]);
  }

  let created = 0, reused = 0;
  const toRun: string[] = [];
  const touched: string[] = [];
  for (const [key, sentences] of groups) {
    if (selected && !sentences.some((s) => selected.has(s.id))) continue;
    const plan = plans.get(key)!;
    const up = await upsertSegment(rt, plan, { lang: text.lang, textId, sentenceIds: sentences.map((s) => s.id), sequence: sentences[0].index, contentVersion: text.contentVersion, voice });
    touched.push(key);
    if (up.created) created++;
    if (up.reusable) {
      reused++;
      const asset = up.segment.assetId ? await rt.store.audioAssets.get(up.segment.assetId) : undefined;
      if (asset) await writeSentenceAlignments(rt, up.segment, asset); // idempotent; covers newly attached sentences
      continue;
    }
    const job = await ensureJob(rt, up.segment, plan);
    if (job.status === 'queued' || job.status === 'failed' || job.status === 'running') toRun.push(job.id);
  }

  if (opts.runNow) {
    const now = rt.clock();
    for (const id of toRun) await runJob(rt, id, now);
  }

  let failed = 0;
  for (const key of touched) {
    const seg = await rt.store.audioSegments.get(ids.audioSegment(key));
    const job = await rt.store.audioJobs.get(key);
    if (seg?.status === 'failed' || job?.status === 'failed' || job?.status === 'dead') failed++;
  }
  const manifest = await writeManifest(rt, text, all, keyOf, voice.id);
  return { manifest, created, reused, failed };
}

// ───────────────────────── testimony sentences ─────────────────────────

export async function ensureSentenceAudioFor(rt: Runtime, args: { lang: LanguageCode; text: string; ownerId: string; contextId: string; voiceConfigId?: string; runNow?: boolean }): Promise<AudioSegment> {
  if (!args.text.trim()) throw new Error('GoListen: cannot synthesize empty text');
  const { voice, provider } = await voiceFor(rt, args.lang, args.voiceConfigId);
  const overrides = await rt.store.pronunciations.where('lang', args.lang);
  const plan = await planSpeech(rt, { lang: args.lang, displayText: args.text, isScripture: false, voice, provider, overrides });
  // Content-addressed: an unchanged sentence in a later revision reuses the same segment (textId stays the first context).
  // TODO(contract): AudioSegment has no ownerId, so ownership of testimony audio is enforced by the caller (GoTell.assertOwner).
  const up = await upsertSegment(rt, plan, { lang: args.lang, textId: args.contextId, sentenceIds: [], sequence: 0, contentVersion: 1, voice });
  if (!up.reusable) {
    const job = await ensureJob(rt, up.segment, plan);
    if (args.runNow && (job.status === 'queued' || job.status === 'failed' || job.status === 'running')) await runJob(rt, job.id, rt.clock());
  }
  return (await rt.store.audioSegments.get(up.segment.id))!;
}
