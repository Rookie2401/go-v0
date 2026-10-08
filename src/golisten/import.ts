import { ids, hash } from '../core/ids';
import type { AudioAsset, AudioManifest, AudioRightsRecord, AudioSegment, Sentence, Text, VoiceConfig } from '../core/model';
import type { AudioImportManifest, AudioImportResult, ImportRecord, ImportRecordingArgs } from '../core/contracts/golisten';
import { inspectWav } from './wav';
import { approvedForPlay, bindingFromManifest, canonicalTextSha256, editionIdOf, isThsv11, releaseIdOf, sha256Hex } from './rights';
import type { Runtime } from './types';

/** A template's unfilled slot ("<name of the speaker>"): the whole value is one bracketed placeholder. */
const PLACEHOLDER = /^<[^<>]*>$/;

function requiredText(v: unknown, name: string): asserts v is string {
  if (typeof v !== 'string' || !v.trim()) throw new Error(`GoListen import: ${name} is required`);
  if (PLACEHOLDER.test(v.trim())) throw new Error(`GoListen import: ${name} is still the template placeholder ${v.trim()}; fill it in`);
}

/** An optional statement (licence, attribution) may be absent, but never left as the template's placeholder. */
function optionalText(v: unknown, name: string): void {
  if (typeof v === 'string' && PLACEHOLDER.test(v.trim())) throw new Error(`GoListen import: ${name} is still the template placeholder ${v.trim()}; fill it in or leave it out`);
}

const ALIGNMENT_UNITS: ReadonlyArray<NonNullable<AudioImportManifest['alignment']>['unit']> = ['sentence', 'phrase', 'word'];
const WRITTEN_STANDARD_LANGS: ReadonlyArray<string> = ['nb', 'nn'];

/**
 * The optional speaker / written-standard / alignment declarations (docs/norway/SPEC.md §6). Every field may be absent; a manifest
 * that omits all of them is validated exactly as before. What is given is checked for shape, never for truth (a speaker's
 * "native" or "region" is the importer's statement).
 */
function validateRecordingMeta(m: AudioImportManifest, textLang: string): void {
  if (m.speaker !== undefined) {
    const sp = m.speaker as unknown;
    if (typeof sp !== 'object' || sp === null || Array.isArray(sp)) throw new Error('GoListen import: speaker must be an object with an id');
    requiredText(m.speaker.id, 'speaker id');
    if (m.speaker.native !== undefined && typeof m.speaker.native !== 'boolean') throw new Error('GoListen import: speaker native must be true or false');
    for (const [v, n] of [[m.speaker.region, 'speaker region'], [m.speaker.locality, 'speaker locality'], [m.speaker.dialect, 'speaker dialect']] as const) {
      if (v !== undefined && typeof v !== 'string') throw new Error(`GoListen import: ${n} must be text`);
      optionalText(v, n);
    }
  }
  if (m.writtenStandard !== undefined) {
    if (m.writtenStandard !== 'nb' && m.writtenStandard !== 'nn') throw new Error("GoListen import: writtenStandard must be 'nb' or 'nn'");
    if (!WRITTEN_STANDARD_LANGS.includes(textLang)) throw new Error(`GoListen import: writtenStandard applies only to Norwegian (nb, nn) texts, not ${textLang}`);
    if (m.writtenStandard !== textLang) throw new Error(`GoListen import: writtenStandard ${m.writtenStandard} does not match the text's language ${textLang}`);
  }
  if (m.alignment !== undefined) {
    const al = m.alignment as unknown;
    if (typeof al !== 'object' || al === null || Array.isArray(al)) throw new Error('GoListen import: alignment must be an object with a unit');
    if (!ALIGNMENT_UNITS.includes(m.alignment.unit)) throw new Error(`GoListen import: alignment unit must be one of ${ALIGNMENT_UNITS.join(', ')}`);
    if (m.alignment.method !== undefined) requiredText(m.alignment.method, 'alignment method');
    const c = m.alignment.confidence;
    if (c !== undefined && (typeof c !== 'number' || !Number.isFinite(c) || c < 0 || c > 1)) throw new Error('GoListen import: alignment confidence must be a number from 0 to 1');
  }
}

/** spokenTranscript: every sentenceId must be a current sentence of the bound text; each spoken wording is non-empty; no sentence twice. */
function validateSpokenTranscript(m: AudioImportManifest, sentences: ReadonlyMap<string, Sentence>): void {
  if (m.spokenTranscript === undefined) return;
  if (!Array.isArray(m.spokenTranscript)) throw new Error('GoListen import: spokenTranscript must be a list');
  const seen = new Set<string>();
  for (const t of m.spokenTranscript) {
    if (typeof t?.sentenceId !== 'string' || !sentences.has(t.sentenceId)) throw new Error(`GoListen import: spokenTranscript names an unknown or retired sentence ${String(t?.sentenceId)}`);
    if (seen.has(t.sentenceId)) throw new Error(`GoListen import: spokenTranscript has sentence ${t.sentenceId} twice`);
    seen.add(t.sentenceId);
    requiredText(t.spoken, `spoken wording of ${t.sentenceId}`);
  }
}

/** The declarations as they are stored on the asset: copies of the known fields only, and no key at all for what the manifest omitted. */
function recordingMetaOf(m: AudioImportManifest): Pick<AudioAsset, 'speaker' | 'writtenStandard' | 'spokenTranscript' | 'alignment'> {
  const sp = m.speaker;
  return {
    ...(sp ? { speaker: { id: sp.id.trim(), ...(sp.native !== undefined ? { native: sp.native } : {}), ...(sp.region !== undefined ? { region: sp.region } : {}),
      ...(sp.locality !== undefined ? { locality: sp.locality } : {}), ...(sp.dialect !== undefined ? { dialect: sp.dialect } : {}) } } : {}),
    ...(m.writtenStandard ? { writtenStandard: m.writtenStandard } : {}),
    ...(m.spokenTranscript ? { spokenTranscript: m.spokenTranscript.map((t) => ({ sentenceId: t.sentenceId, spoken: t.spoken })) } : {}),
    ...(m.alignment ? { alignment: { unit: m.alignment.unit, ...(m.alignment.method !== undefined ? { method: m.alignment.method } : {}),
      ...(m.alignment.confidence !== undefined ? { confidence: m.alignment.confidence } : {}) } } : {}),
  };
}
const metaKey = (a: Pick<AudioAsset, 'speaker' | 'writtenStandard' | 'spokenTranscript' | 'alignment'>): string =>
  JSON.stringify([a.speaker ?? null, a.writtenStandard ?? null, a.spokenTranscript ?? null, a.alignment ?? null]);

/** meta row holding what the importer declared and who (if anyone) reviewed; see ImportRecord. */
export const importRecordId = (assetId: string): string => `golisten-import:${assetId}`;

export async function readImportRecord(store: Runtime['store'], assetId: string): Promise<ImportRecord | undefined> {
  try {
    const row = await store.meta.get(importRecordId(assetId));
    return row ? JSON.parse(row.value) as ImportRecord : undefined;
  } catch { return undefined; }
}

/** A learner's statement is shown as such wherever the rights text surfaces. */
const STATED = 'Stated by the uploader, not verified: ';

export async function importRecordingFor(rt: Runtime, args: ImportRecordingArgs): Promise<AudioImportResult> {
  const m = args.manifest;
  const origin = args.origin;
  if (origin !== 'learner' && origin !== 'curated') throw new Error("GoListen import: origin must be 'learner' or 'curated'");
  const learner = origin === 'learner';
  const reviewer = typeof args.reviewer === 'string' ? args.reviewer.trim() : '';
  if (learner && args.reviewer !== undefined) throw new Error('GoListen import: a learner import cannot carry a reviewer; only a curated import records a named review');
  const claimsReview = m.qualityState === 'human_reviewed' || m.qualityState === 'approved';
  if (!learner && claimsReview && !reviewer) throw new Error('GoListen import: a recording marked human_reviewed or approved needs the name of the person who reviewed it (reviewer)');
  for (const [v, n] of [[m.id, 'manifest id'], [m.textId, 'text id'], [m.releaseId, 'release id'], [m.lang, 'language'], [m.locale, 'locale'], [m.narrator, 'narrator'], [m.recording?.owner, 'recording owner'], [m.recording?.basis, 'recording basis'], [m.performance?.performer, 'performer'], [m.performance?.permission, 'performance permission']] as const) requiredText(v, n);
  for (const [v, n] of [[m.variety, 'variety'], [m.recording?.license, 'recording licence'], [m.recording?.attribution, 'attribution'], [args.reviewer, 'reviewer']] as const) optionalText(v, n);
  const text: Text | undefined = await rt.store.texts.get(m.textId);
  if (!text) throw new Error(`GoListen import: text ${m.textId} not found`);
  if (m.kind !== 'human' && m.kind !== 'synthetic') throw new Error('GoListen import: audio kind must be human or synthetic');
  if (!['unreviewed', 'machine_checked', 'human_reviewed', 'approved', 'rejected'].includes(m.qualityState)) throw new Error('GoListen import: invalid quality state');
  if (m.qualityState === 'rejected') throw new Error('GoListen import: audio marked rejected cannot be imported as playable speech');
  if (isThsv11(text) || /\bTHSV\s*11\b|Thai Standard Version\s*2011/i.test(`${m.editionId ?? ''} ${m.releaseId}`)) throw new Error('GoListen import: THSV11 audio is prohibited and cannot be imported');
  if (text.lang !== m.lang) throw new Error(`GoListen import: language mismatch (${m.lang} vs ${text.lang})`);
  validateRecordingMeta(m, text.lang);
  if (m.contentVersion !== text.contentVersion || m.releaseId !== releaseIdOf(text)) throw new Error('GoListen import: stale or mismatched text release');
  const expectedEdition = editionIdOf(text);
  if (expectedEdition !== m.editionId) throw new Error('GoListen import: Bible edition mismatch');
  if (m.kind === 'synthetic') {
    const synth = m.syntheticProvider;
    if (!synth) throw new Error('GoListen import: synthetic provider terms are required');
    requiredText(synth.id, 'synthetic provider id'); requiredText(synth.terms, 'synthetic provider terms');
    if (!synth.retention || synth.retention === 'stored' && m.rights.providerRetention !== 'stored') throw new Error('GoListen import: synthetic provider retention terms are incomplete');
    if (m.textDerivative !== 'allowed' || m.rights.textDerivative !== 'allowed') throw new Error('GoListen import: explicit permission to synthesize this text is required');
    if (m.rights.providerRetention !== synth.retention) throw new Error('GoListen import: provider retention terms do not match rights evidence');
  }
  const sentences: Sentence[] = (await rt.store.sentences.where('textId', text.id))
    .filter((s) => s.retiredInVersion === undefined).sort((a, b) => a.index - b.index);
  const exactHash = await canonicalTextSha256(text.id, text.contentVersion, sentences);
  if (m.textSha256 !== exactHash) throw new Error('GoListen import: exact text SHA-256 mismatch');
  if (!Array.isArray(m.coverage) || m.coverage.length === 0) throw new Error('GoListen import: coverage is empty');
  const candidateRights: AudioRightsRecord = { ...m.rights, id: `rights:${m.id}`, providerId: m.syntheticProvider?.id, providerTerms: m.syntheticProvider?.terms,
    recordingOwner: m.recording.owner, recordingBasis: m.recording.basis, recordingLicense: m.recording.license,
    performanceOwner: m.performance.performer, performancePermission: m.performance.permission, attribution: m.recording.attribution };
  if (!approvedForPlay(candidateRights, m.kind)) throw new Error('GoListen import: recording rights are not approved for in-app playback');
  const map = new Map(sentences.map((s) => [s.id, s]));
  validateSpokenTranscript(m, map);
  let previousIndex = -1, previousEnd = 0;
  const covered = new Set<string>();
  for (const c of m.coverage) {
    const s = map.get(c.sentenceId);
    if (c.reviewState !== 'checked' && c.reviewState !== 'reviewed') throw new Error(`GoListen import: invalid alignment review state for ${c.sentenceId}`);
    if (!s || covered.has(c.sentenceId)) throw new Error(`GoListen import: unknown, retired, or duplicate sentence ${c.sentenceId}`);
    if (c.reviewState !== 'reviewed' && c.reviewState !== 'checked') throw new Error(`GoListen import: unreviewed alignment for ${c.sentenceId}`);
    if (!Number.isFinite(c.startMs) || !Number.isFinite(c.endMs) || c.startMs < 0 || c.endMs <= c.startMs) throw new Error(`GoListen import: invalid range for ${c.sentenceId}`);
    if (s.index <= previousIndex || c.startMs < previousEnd) throw new Error('GoListen import: ranges must follow text order and may not overlap');
    if ((c.sourceStart === undefined) !== (c.sourceEnd === undefined)) throw new Error(`GoListen import: both source offsets are required for ${c.sentenceId}`);
    if (c.sourceStart !== undefined && (c.sourceStart !== s.paraStart || c.sourceEnd !== s.paraEnd || !(c.sourceEnd! > c.sourceStart!))) throw new Error(`GoListen import: source offsets do not match canonical sentence ${c.sentenceId}`);
    if (c.sourceStart !== undefined) {
      const paragraph = await rt.store.paragraphs.get(s.paragraphId);
      if (paragraph?.originalText === undefined || paragraph.originalText.slice(c.sourceStart, c.sourceEnd) !== s.text) throw new Error(`GoListen import: paragraph source slice mismatch for ${c.sentenceId}`);
    }
    covered.add(c.sentenceId); previousIndex = s.index; previousEnd = c.endMs;
  }
  const wav = inspectWav(args.bytes);
  if (!wav.validation.ok || wav.durationMs === undefined || wav.sampleRate === undefined || wav.channels === undefined) throw new Error(`GoListen import: invalid WAV: ${wav.validation.problems.join('; ')}`);
  if (m.coverage.some((c) => c.endMs > wav.durationMs!)) throw new Error('GoListen import: alignment range exceeds WAV duration');
  const requiresSegmentation = m.coverage.length > 1 || m.coverage.length !== sentences.length || m.coverage[0].startMs > 0 || m.coverage[m.coverage.length - 1].endMs < wav.durationMs;
  if (requiresSegmentation && m.rights.segment !== true) throw new Error('GoListen import: segmentation permission is required for partial or cropped coverage');
  const assetId = await rt.store.assets.put(args.bytes, 'audio/wav');
  const now = rt.clock();
  // What this import establishes. A learner's manifest is the uploader's own statement: its quality claim is capped at
  // 'machine_checked' (the app checked the WAV, nobody reviewed it), no review is stamped, and the rights text is labelled.
  // A curated import with a named reviewer is the only way a review is recorded.
  const qualityState: AudioImportManifest['qualityState'] = learner && m.qualityState !== 'unreviewed' ? 'machine_checked' : m.qualityState;
  const reviewedAt = !learner && reviewer ? now : undefined;
  const rights: AudioRightsRecord = {
    ...m.rights, // first, so that a manifest cannot carry its own id, owner/basis labels or review stamp
    id: `rights:${hash(JSON.stringify([m.id, m.recording, m.performance, m.rights, m.syntheticProvider, m.textDerivative]))}`,
    recordingOwner: m.recording.owner, recordingBasis: learner ? `${STATED}${m.recording.basis}` : m.recording.basis,
    recordingLicense: m.recording.license, performanceOwner: m.performance.performer,
    performancePermission: learner ? `${STATED}${m.performance.permission}` : m.performance.permission, attribution: m.recording.attribution,
    status: m.rights.status, providerId: m.syntheticProvider?.id, providerTerms: m.syntheticProvider?.terms,
    providerRetention: m.syntheticProvider?.retention ?? m.rights.providerRetention, textDerivative: m.textDerivative ?? m.rights.textDerivative,
    reviewedAt,
  };
  const binding = bindingFromManifest({ textId: text.id, contentVersion: text.contentVersion, textSha256: exactHash, releaseId: releaseIdOf(text), editionId: expectedEdition });
  const prior: AudioAsset | undefined = await rt.store.audioAssets.get(assetId);
  const candidate: AudioAsset = {
    id: assetId, sourceType: m.kind === 'synthetic' ? 'generated-tts' : (m.recording.license ? 'licensed-recording' : 'human-recording'), audioKind: m.kind, lang: text.lang, locale: m.locale, mime: 'audio/wav',
    sampleRate: wav.sampleRate, channels: wav.channels, durationMs: Math.round(wav.durationMs), bytes: args.bytes.length,
    checksum: await sha256Hex(args.bytes), createdAt: prior?.createdAt ?? now, isSpeech: true, rights, textBinding: binding,
    narratorOrVoiceId: m.narrator, variety: m.variety, qualityState, validation: { ...wav.validation, ok: true, problems: [] },
    ...recordingMetaOf(m),
  };
  // Identical bytes already stored: the stored asset (and its review state) is kept. A learner import never changes it, and a
  // curated import may only raise an unreviewed / machine-checked asset to a reviewed one (with a named reviewer).
  let asset: AudioAsset = candidate;
  let upgraded = false;
  if (prior) {
    const sameFacts = prior.textBinding?.textId === binding.textId && prior.textBinding.textSha256 === binding.textSha256 && prior.textBinding.releaseId === binding.releaseId
      && prior.rights?.id === rights.id && prior.audioKind === candidate.audioKind && prior.sourceType === candidate.sourceType
      && prior.lang === candidate.lang && prior.locale === candidate.locale && prior.narratorOrVoiceId === candidate.narratorOrVoiceId
      && prior.variety === candidate.variety && metaKey(prior) === metaKey(candidate);
    const upgrade = !learner && prior.qualityState !== qualityState && (prior.qualityState === 'unreviewed' || prior.qualityState === 'machine_checked')
      && (qualityState === 'human_reviewed' || qualityState === 'approved');
    if (!sameFacts || (!learner && prior.qualityState !== qualityState && !upgrade)) {
      throw new Error('GoListen import: identical audio bytes already have different text, rights, speaker, language, or quality metadata');
    }
    if (upgrade) { asset = { ...prior, qualityState, rights: { ...prior.rights!, reviewedAt } }; upgraded = true; await rt.store.audioAssets.put(asset); } else asset = prior;
  } else await rt.store.audioAssets.put(candidate);

  // The voice of a learner import is never approved or reviewed (no one auditioned it); it also never shares an id with a
  // curated import, so a learner can neither downgrade nor impersonate a curated review.
  const voiceId = `${learner ? 'learner-import' : 'local-import'}:${hash(m.id)}`;
  const assetReviewed = !learner && claimsReview && asset.qualityState === qualityState;
  const voiceReview: VoiceConfig['reviewStatus'] = assetReviewed ? 'reviewed' : 'unreviewed';
  const voice: VoiceConfig = { id: voiceId, lang: text.lang, providerId: m.syntheticProvider?.id ?? 'local-import', engine: m.kind === 'synthetic' ? 'user-supplied-synthetic-wav' : 'user-supplied-wav', voiceId: m.narrator,
    requestedLocale: m.locale, actualLocale: m.locale, approved: m.kind === 'human' && voiceReview === 'reviewed', reviewStatus: voiceReview, isSpeech: true,
    providerVersion: 'import@1',
    qaNote: learner
      ? `Added by a learner on this device; kind (${m.kind}), quality (${m.qualityState}) and rights are the uploader's own statements and have not been reviewed. ${m.performance.permission}`
      : `Imported recording ${m.id}; ${m.performance.permission}${reviewer ? `; reviewed by ${reviewer} on ${now.slice(0, 10)}` : ''}` };
  await rt.store.voices.put(voice);
  // What was declared versus what was established. A learner record never replaces a curated one, and a later curated
  // import never rewrites who reviewed an asset unless it is the import that reviews it.
  const existingRecord = await readImportRecord(rt.store, asset.id);
  const keepExisting = !!existingRecord && existingRecord.origin === 'curated' && (learner || (!!existingRecord.reviewer && !upgraded));
  if (!keepExisting) {
    const record: ImportRecord = { assetId: asset.id, manifestId: m.id, origin, declaredKind: m.kind, declaredQualityState: m.qualityState, declaredRightsStatus: m.rights.status,
      ...(reviewer && !learner ? { reviewer, reviewedAt: now } : {}), importedAt: now };
    await rt.store.meta.put({ id: importRecordId(asset.id), value: JSON.stringify(record), updatedAt: now });
  }
  // Alignment review is a separate trust fact from the uploaded manifest. A learner can provide
  // useful checked timings, but cannot promote their own timing assertion into trusted review.
  const trustedAlignmentReview = !learner && !!reviewer;
  const orderedCoverage = m.coverage.map((c) => ({
    c: trustedAlignmentReview ? c : { ...c, reviewState: 'checked' as const },
    s: map.get(c.sentenceId)!,
  }));
  const segmentIds: string[] = [];
  const reviewedCoverage = orderedCoverage.every(({ c }) => c.reviewState === 'reviewed');
  const groups = reviewedCoverage ? orderedCoverage.map(({ c, s }) => ({ coverage: [c], sentences: [s] })) : [{ coverage: [], sentences: orderedCoverage.map(({ s }) => s) }];
  for (const group of groups) {
    const { coverage, sentences: groupedSentences } = group;
    const c = coverage[0];
    const s = groupedSentences[0];
    // A learner import has its own segments, so it can never rewrite the voice of a curated import's segments.
    const cacheKey = `import:${hash(`${learner ? 'learner|' : ''}${m.id}|${groupedSentences.map((x) => x.id).join(',')}|${assetId}`)}`;
    const segmentId = ids.audioSegment(cacheKey);
    const segment: AudioSegment = { id: segmentId, cacheKey, lang: text.lang, sentenceIds: groupedSentences.map((x) => x.id), textId: text.id,
      displayText: groupedSentences.map((x) => x.text).join(' '), speechText: groupedSentences.map((x) => x.text).join(' '), speechNormalization: [], pronunciationOverridesUsed: [], voiceConfigId: voiceId,
      assetId, status: 'ready', sequence: s.index, contentVersion: text.contentVersion };
    await rt.store.audioSegments.put(segment);
    if (c) await rt.store.alignments.put({ id: `al:${segmentId}:sentence:${s.id}`, segmentId, assetId, unit: 'sentence', unitId: s.id,
      startMs: c.startMs, endMs: c.endMs, sourceStart: c.sourceStart, sourceEnd: c.sourceEnd, method: 'manual', confidence: 1, alignerVersion: `import:${m.id}`, reviewState: 'reviewed' });
    segmentIds.push(segmentId);
  }
  const manifestId = ids.manifest(text.id, voiceId, text.contentVersion);
  const previous = await rt.store.manifests.get(manifestId);
  const manifest: AudioManifest = { id: manifestId, textId: text.id, lang: text.lang, voiceConfigId: voiceId,
    contentVersion: text.contentVersion, segmentIds, complete: m.coverage.length === sentences.length,
    ...(m.speaker ? { speakerId: m.speaker.id.trim() } : {}), ...(m.writtenStandard ? { writtenStandard: m.writtenStandard } : {}), ...(m.alignment ? { alignmentUnit: m.alignment.unit } : {}),
    createdAt: previous?.createdAt ?? now, updatedAt: now };
  await rt.store.manifests.put(manifest);
  return { manifest, asset, imported: segmentIds.length, reused: !!prior };
}
