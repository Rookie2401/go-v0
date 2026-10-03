/**
 * GoListen's text-level evidence and resume queries. The event log is the source of truth; no parallel
 * mastery/progress table is maintained here. Reading, listening and production stay separate.
 */
import type { AudioAbandoned, AudioPlayed, AudioSegmentCompleted, DomainEvent, ListeningPositionSaved } from '../core/events';
import type { AppStore } from '../core/store';
import type { AudioSegment, Text } from '../core/model';
import { approvedForPlay, currentBindingValid } from './rights';
import { buildPlayerManifest } from './playerManifest';

export interface ListeningProgress {
  textId: string;
  contentVersion: number;
  sentencesTotal: number;
  /** Distinct current sentences for which an audio play was started; an attempt is not evidence of hearing. */
  attemptedSentences: number;
  /** Distinct current sentences completed with >=80% observed audible coverage, including unreviewed/machine-checked audio. */
  completedExposureSentences: number;
  /** Distinct current sentences with lawful, exact-bound speech + reviewed audio; legacy evidence is retained when stored rows prove it. */
  masteryEligibleSentences: number;
  /** Subset from human speech, suitable for a future unseen transfer attempt. */
  humanTransferSentences: number;
  /** Subset from reviewed synthetic speech, tracked as practice, not human transfer. */
  syntheticPracticeSentences: number;
  listenOnlySentences: number;
  transcriptAssistedSentences: number;
  slowedSentences: number;
  latestAt?: string;
  /** Aggregated provenance is shown as facts; no derived level or CEFR claim is made. */
  narrators: string[];
  varieties: string[];
  sources: string[];
  lastPosition?: { segmentId: string; positionMs: number; at: string; manifestId: string };
}

const ordered = (a: DomainEvent, b: DomainEvent) => a.at.localeCompare(b.at) || a.id.localeCompare(b.id);
const currentText = async (store: AppStore, textId: string): Promise<Text | undefined> => store.texts.get(textId);
const isListening = (e: DomainEvent): e is AudioPlayed | AudioSegmentCompleted | AudioAbandoned =>
  e.type === 'AudioPlayed' || e.type === 'AudioSegmentCompleted' || e.type === 'AudioAbandoned';

/**
 * Reuse a cursor only for the exact current manifest/text version and an intact playable, rights-cleared segment.
 * The event is a navigation checkpoint, never evidence that the learner heard that position.
 */
export async function latestListeningCheckpoint(
  store: AppStore, userId: string, textId: string, manifestId: string,
): Promise<{ segmentId: string; positionMs: number; at: string } | undefined> {
  const [text, manifest, all] = await Promise.all([
    currentText(store, textId), store.manifests.get(manifestId), store.events.where('userId', userId),
  ]);
  if (!text || !manifest || manifest.textId !== textId || manifest.contentVersion !== text.contentVersion) return undefined;
  const candidates = all.filter((e): e is ListeningPositionSaved => e.type === 'ListeningPositionSaved' && e.textId === textId && e.manifestId === manifestId)
    .sort((a, b) => b.at.localeCompare(a.at) || b.id.localeCompare(a.id));
  for (const e of candidates) {
    if (!Number.isFinite(e.positionMs) || e.positionMs <= 0) continue;
    const segment = await store.audioSegments.get(e.segmentId);
    if (!segment || segment.textId !== textId || segment.contentVersion !== text.contentVersion || segment.status !== 'ready' || !segment.assetId || !manifest.segmentIds.includes(segment.id)) continue;
    const asset = await store.audioAssets.get(segment.assetId);
    if (!asset || !(await store.assets.has(segment.assetId))) continue;
    const binding = asset.textBinding;
    if (!approvedForPlay(asset.rights) || !binding || binding.textId !== textId || binding.contentVersion !== text.contentVersion || !(await currentBindingValid(store, asset))) continue;
    const playerSegment = (await buildPlayerManifest(store, manifest)).segments.find((s) => s.segmentId === segment.id);
    if (!playerSegment?.ready) continue;
    const lo = playerSegment.rangeMs?.startMs ?? 0;
    const hi = playerSegment.rangeMs?.endMs ?? asset.durationMs;
    if (e.positionMs < lo || e.positionMs > hi || e.positionMs >= asset.durationMs) continue;
    return { segmentId: segment.id, positionMs: e.positionMs, at: e.at };
  }
  return undefined;
}

/** Event-derived progress for one text; it reports exposure separately from mastery-eligible evidence. */
export async function listeningProgress(store: AppStore, userId: string, textId: string): Promise<ListeningProgress> {
  const text = await currentText(store, textId);
  if (!text) throw new Error(`unknown text: ${textId}`);
  const sentences = (await store.sentences.where('textId', textId)).filter((s) => s.retiredInVersion === undefined);
  const live = new Set(sentences.map((s) => s.id));
  const events = (await store.events.where('userId', userId)).filter(isListening).filter((e) => e.textId === textId).sort(ordered);
  const exposed = new Set<string>(), completed = new Set<string>(), mastery = new Set<string>(), humanTransfer = new Set<string>(), syntheticPractice = new Set<string>(), listenOnly = new Set<string>(), assisted = new Set<string>(), slowed = new Set<string>();
  const narrators = new Set<string>(), varieties = new Set<string>(), sources = new Set<string>();
  let latestAt: string | undefined;
  const segments = new Map<string, AudioSegment>();
  for (const e of events) {
    latestAt = !latestAt || e.at > latestAt ? e.at : latestAt;
    const segment = segments.get(e.segmentId) ?? await store.audioSegments.get(e.segmentId);
    if (segment) segments.set(e.segmentId, segment);
    const assetId = e.assetId ?? segment?.assetId;
    const asset = assetId ? await store.audioAssets.get(assetId) : undefined;
    const lawfulCurrent = !!asset && !!segment && segment.textId === textId && segment.contentVersion === text.contentVersion
      && segment.assetId === asset.id && assetId === asset.id && approvedForPlay(asset.rights) && await currentBindingValid(store, asset)
      && bindingMatchesEvent(asset, e) && (e.sourceType === undefined || e.sourceType === asset.sourceType)
      && (e.audioKind === undefined || e.audioKind === asset.audioKind) && (e.qualityState === undefined || e.qualityState === asset.qualityState)
      && (e.narratorOrVoiceId === undefined || e.narratorOrVoiceId === asset.narratorOrVoiceId)
      && (e.variety === undefined || e.variety === asset.variety) && (e.locale === undefined || e.locale === asset.locale)
      && segment.sentenceIds.length === e.sentenceIds.length && segment.sentenceIds.every((sid) => e.sentenceIds.includes(sid));
    if (!lawfulCurrent) continue;
    for (const id of e.sentenceIds) if (live.has(id)) exposed.add(id);
    if (e.type !== 'AudioSegmentCompleted'
      || (e.audibleCoverageVersion === 'observed-playback@1' && (!Number.isFinite(e.heardCoverageRatio) || e.heardCoverageRatio! < 0.8 || e.heardCoverageRatio! > 1))
      || (e.audibleCoverageVersion === undefined && e.rightsApproved !== undefined && e.heardCoverageRatio !== undefined
        && (!Number.isFinite(e.heardCoverageRatio) || e.heardCoverageRatio < 0 || e.heardCoverageRatio > 1 || e.heardCoverageRatio < 0.8))) continue;
    for (const id of e.sentenceIds) if (live.has(id)) completed.add(id);
    if (e.narratorOrVoiceId) narrators.add(e.narratorOrVoiceId);
    if (e.variety ?? e.locale) varieties.add(e.variety ?? e.locale!);
    if (e.sourceType) sources.add(e.sourceType);
    if (e.transcriptVisible || e.revealedTranscript || e.revealedTranslation) {
      for (const id of e.sentenceIds) if (live.has(id)) assisted.add(id);
    } else {
      for (const id of e.sentenceIds) if (live.has(id)) listenOnly.add(id);
    }
    if (e.speed < 0.999) for (const id of e.sentenceIds) if (live.has(id)) slowed.add(id);
    // Machine-checked human recordings remain exposure-only. A synthetic voice can support separate practice only after
    // the current voice itself was auditioned; it is never included in humanTransferSentences.
    const quality = asset?.qualityState;
    const voice = segment ? await store.voices.get(segment.voiceConfigId) : undefined;
    const audioKind = asset ? kindOf(asset) : undefined;
    const voiceReviewed = !!voice && voice.isSpeech === true && ['reviewed', 'approved'].includes(voice.reviewStatus);
    const reviewed = e.voiceReviewed !== false && (audioKind === 'human'
      ? (quality === 'human_reviewed' || quality === 'approved') && (!voice || voiceReviewed)
      : audioKind === 'synthetic' && quality !== undefined && ['machine_checked', 'human_reviewed', 'approved'].includes(quality) && voiceReviewed);
    const eventProved = e.speech !== false && reviewed && e.rightsApproved !== false && e.exactTextBound !== false
      && asset?.isSpeech === true && !!audioKind && lawfulCurrent
      && (audioKind === 'synthetic' ? quality !== undefined && ['machine_checked', 'human_reviewed', 'approved'].includes(quality) : quality === 'human_reviewed' || quality === 'approved');
    if (eventProved) {
      for (const id of e.sentenceIds) if (live.has(id)) mastery.add(id);
      if (audioKind === 'human') for (const id of e.sentenceIds) if (live.has(id)) humanTransfer.add(id);
      if (audioKind === 'synthetic') for (const id of e.sentenceIds) if (live.has(id)) syntheticPractice.add(id);
    }
  }
  const all = await store.events.where('userId', userId);
  const cursors = all.filter((e): e is ListeningPositionSaved => e.type === 'ListeningPositionSaved' && e.textId === textId)
    .sort((a, b) => b.at.localeCompare(a.at) || b.id.localeCompare(a.id));
  let lastPosition: ListeningProgress['lastPosition'];
  for (const e of cursors) {
    const manifest = await store.manifests.get(e.manifestId);
    const validated = manifest ? await latestListeningCheckpoint(store, userId, textId, manifest.id) : undefined;
    if (validated && validated.segmentId === e.segmentId && validated.positionMs === e.positionMs && validated.at === e.at) {
      lastPosition = { ...validated, manifestId: manifest!.id }; break;
    }
  }
  return {
    textId, contentVersion: text.contentVersion, sentencesTotal: sentences.length,
    attemptedSentences: exposed.size, completedExposureSentences: completed.size, masteryEligibleSentences: mastery.size,
    humanTransferSentences: humanTransfer.size, syntheticPracticeSentences: syntheticPractice.size,
    listenOnlySentences: listenOnly.size, transcriptAssistedSentences: assisted.size, slowedSentences: slowed.size,
    latestAt, narrators: [...narrators].sort(), varieties: [...varieties].sort(), sources: [...sources].sort(), lastPosition,
  };
}

function bindingMatchesEvent(asset: import('../core/model').AudioAsset, e: AudioPlayed | AudioSegmentCompleted | AudioAbandoned): boolean {
  const b = asset.textBinding;
  return e.rightsApproved !== false && e.exactTextBound !== false && !!b && b.textId === e.textId
    && (e.contentVersion === undefined || b.contentVersion === e.contentVersion)
    && (e.textSha256 === undefined || b.textSha256 === e.textSha256)
    && (e.releaseId === undefined || b.releaseId === e.releaseId) && (e.editionId === undefined || b.editionId === e.editionId)
    && (e.rightsId === undefined || asset.rights?.id === e.rightsId)
    && asset.rights?.status === 'approved' && asset.rights.playInApp === true;
}

function kindOf(asset: import('../core/model').AudioAsset): 'human' | 'synthetic' | undefined {
  if (asset.audioKind) return asset.audioKind;
  if (asset.sourceType === 'generated-tts') return 'synthetic';
  if (asset.sourceType === 'human-recording' || asset.sourceType === 'licensed-recording') return 'human';
  return undefined;
}
