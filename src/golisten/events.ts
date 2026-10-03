/**
 * Listening events. The player (UI) calls these typed helpers; they fill `dedupeKey`s so that
 *  - a rerender / duplicate media callback cannot double count,
 *  - a deliberate replay is a new pass and counts again.
 *
 * Dedupe keys are scoped by session and segment. "Pass" = one listen-through of a segment; it advances
 * on every replay. Completion is deduped per segment per pass. Listening evidence itself (what the
 * event means for the learner) is decided by GoLearn, not here.
 *
 * Evidence honesty (evidence policy v2, rule 5). Every listening event carries `assetId`, `speech` (the played
 * asset is real speech) and `voiceReviewed` (its voice was auditioned by a person), resolved from the stored
 * segment -> asset -> voice when the context has a `store`. Without a store the emitter trusts only what the caller
 * puts on the SegmentRef and otherwise fails closed (`speech: false`, `voiceReviewed: false`): unknown audio earns
 * no evidence. `AudioSegmentCompleted` is emitted only when playback of a READY asset really finished; completing a
 * segment that is not ready, or a failed / aborted play (`failed()`), emits `AudioAbandoned` instead.
 *
 * Keep ONE emitter per listening session (e.g. in a useRef): its pass counters live in the emitter, so
 * a second emitter for the same session would restart at pass 0 and have its repeats deduped away.
 */
import type { AudioAbandoned, AudioPlayed, AudioReplayed, AudioSegmentCompleted, AudioSeeked, EventBus, ListeningPositionSaved, PhraseReplayed, PlaybackSpeedChanged, ShadowingAttempt, Surface, TranscriptRevealed, UserRecordingCreated } from '../core/events';
import type { LanguageCode } from '../core/model';
import { REVIEW_OK } from '../core/model';
import type { AppStore } from '../core/store';
import { approvedForPlay, currentBindingValid } from './rights';
import type { EmitView, PlayerEffect, PlayerModel } from './player';

export interface ListeningContext {
  userId: string;
  lang: LanguageCode;
  session: string;
  /** The text being listened to (or the testimony context id). */
  textId: string;
  surface?: Surface; // default 'listen'
  clock?: () => string;
  /**
   * Lets the emitter resolve segment -> asset -> voice so events always carry `assetId` / `speech` / `voiceReviewed`
   * and completion is verified against a ready asset. Pass the app store. Without it the emitter fails closed.
   */
  store?: AppStore;
}

export interface SegmentRef {
  segmentId: string;
  sentenceIds: string[];
  /** Hints used only when the context has no store (the store, when present, is authoritative). */
  assetId?: string;
  ready?: boolean;
  speech?: boolean;
  voiceReviewed?: boolean;
}

/** What is known about the audio behind a segment at the moment an event is emitted. */
export interface PlaybackFacts {
  assetId?: string; ready: boolean; speech: boolean; voiceReviewed: boolean; sentenceIds?: string[];
  sourceType?: import('../core/model').AudioSourceType; audioKind?: 'human' | 'synthetic'; rightsId?: string; rightsApproved?: boolean;
  exactTextBound?: boolean; textSha256?: string; contentVersion?: number; releaseId?: string; editionId?: string;
  narratorOrVoiceId?: string; locale?: string; qualityState?: import('../core/model').AudioAsset['qualityState']; variety?: string;
}

export async function resolvePlaybackFacts(store: AppStore | undefined, seg: SegmentRef): Promise<PlaybackFacts> {
    if (!store) return { assetId: seg.assetId, ready: !!seg.assetId && seg.ready !== false, speech: false, voiceReviewed: false, sentenceIds: seg.sentenceIds };
  const segment = await store.audioSegments.get(seg.segmentId);
  if (!segment) return { ready: false, speech: false, voiceReviewed: false };
  const asset = segment.assetId ? await store.audioAssets.get(segment.assetId) : undefined;
  const bytes = segment.assetId ? await store.assets.has(segment.assetId) : false;
  const voice = await store.voices.get(segment.voiceConfigId);
  const text = await store.texts.get(segment.textId);
  const bound = !!asset && await currentBindingValid(store, asset);
  const exactIds = segment.sentenceIds.length === seg.sentenceIds.length && segment.sentenceIds.every((id) => seg.sentenceIds.includes(id));
  const rightsApproved = !!asset && approvedForPlay(asset.rights);
  const qualityReviewed = asset?.qualityState === 'human_reviewed' || asset?.qualityState === 'approved';
  const voiceAuditioned = !!voice && voice.isSpeech === true && REVIEW_OK.includes(voice.reviewStatus);
  const voiceReviewed = !!asset && (asset.audioKind === 'synthetic' ? voiceAuditioned : asset.audioKind === 'human' && qualityReviewed && (!voice || voiceAuditioned));
  return {
    assetId: segment.assetId,
    ready: segment.status === 'ready' && !!segment.assetId && !!asset && bytes && !!text && segment.textId === text.id && segment.contentVersion === text.contentVersion && bound && rightsApproved && exactIds,
    speech: asset?.isSpeech === true && (asset.audioKind === 'human' || asset.audioKind === 'synthetic') && (!voice || voice.isSpeech === true),
    voiceReviewed,
    sentenceIds: segment.sentenceIds,
    sourceType: asset?.sourceType, audioKind: asset?.audioKind, rightsId: asset?.rights?.id, rightsApproved,
    exactTextBound: bound, textSha256: asset?.textBinding?.textSha256, contentVersion: segment.contentVersion,
    releaseId: asset?.textBinding?.releaseId, editionId: asset?.textBinding?.editionId,
    narratorOrVoiceId: asset?.narratorOrVoiceId ?? voice?.voiceId, locale: asset?.locale, qualityState: asset?.qualityState, variety: asset?.variety,
  };
}

interface SegState { pass: number; replays: number; revealedTranscript: boolean; revealedTranslation: boolean; shadowing: number }

export interface ListeningEmitter {
  played(seg: SegmentRef, view: EmitView): Promise<AudioPlayed | null>;
  /** Emits AudioSegmentCompleted only for a ready asset; otherwise emits AudioAbandoned and returns null. */
  completed(seg: SegmentRef, view: EmitView, extra?: { revealedTranscript?: boolean; revealedTranslation?: boolean; replayCount?: number; positionMs?: number; heardCoverageRatio?: number }): Promise<AudioSegmentCompleted | null>;
  replayed(seg: SegmentRef, view: EmitView): Promise<AudioReplayed | null>;
  phraseReplayed(seg: SegmentRef, view: EmitView, p: { alignmentId: string; unitId: string }): Promise<PhraseReplayed | null>;
  seeked(p: { fromSegmentId?: string; toSegmentId: string }): Promise<AudioSeeked | null>;
  speedChanged(p: { from: number; to: number }): Promise<PlaybackSpeedChanged | null>;
  transcriptRevealed(seg: SegmentRef, view: EmitView): Promise<TranscriptRevealed | null>;
  abandoned(seg: SegmentRef, view: EmitView, positionMs: number): Promise<AudioAbandoned | null>;
  /** Playback of the segment failed or was aborted (media error, asset missing): AudioAbandoned, never a completion. */
  failed(seg: SegmentRef, view: EmitView, positionMs?: number): Promise<AudioAbandoned | null>;
  /** Save navigation state only; this event never enters the GoLearn evidence fold. */
  positionSaved(p: { manifestId: string; segmentId: string; positionMs: number }): Promise<ListeningPositionSaved | null>;
  shadowingAttempt(seg: SegmentRef, view: EmitView): Promise<ShadowingAttempt | null>;
  recordingCreated(p: { recordingId: string; targetText: string; sentenceId?: string; testimonyRevisionId?: string }): Promise<UserRecordingCreated | null>;
  /** The learner peeked at the English translation for this segment (recorded on its completion). */
  translationRevealed(segmentId: string): void;
  /** Current pass number of a segment (0 before any replay). */
  passOf(segmentId: string): number;
}

export function listeningEmitter(bus: EventBus, ctx: ListeningContext): ListeningEmitter {
  const surface = ctx.surface ?? 'listen';
  const state = new Map<string, SegState>();
  const st = (id: string): SegState => {
    let s = state.get(id);
    if (!s) { s = { pass: 0, replays: 0, revealedTranscript: false, revealedTranslation: false, shadowing: 0 }; state.set(id, s); }
    return s;
  };
  // Unique per deliberate action even if the emitter is recreated within a session.
  const nonce = `${Date.now().toString(36)}${Math.floor(Math.random() * 1e6).toString(36)}`;
  let action = 0;
  const unique = () => `${nonce}.${action++}`;
  const base = (dedupeKey: string) => ({ userId: ctx.userId, lang: ctx.lang, surface, session: ctx.session, dedupeKey, ...(ctx.clock ? { at: ctx.clock() } : {}) });
  const listen = async (seg: SegmentRef, view: EmitView) => {
    const f = await resolvePlaybackFacts(ctx.store, seg);
    return {
      textId: ctx.textId, segmentId: seg.segmentId, sentenceIds: f.sentenceIds ?? seg.sentenceIds,
      speed: view.speed, transcriptVisible: view.transcriptVisible, assetId: f.assetId, speech: f.speech, voiceReviewed: f.voiceReviewed,
      sourceType: f.sourceType, audioKind: f.audioKind, qualityState: f.qualityState, variety: f.variety,
      rightsId: f.rightsId, rightsApproved: f.rightsApproved, exactTextBound: f.exactTextBound, textSha256: f.textSha256,
      contentVersion: f.contentVersion, releaseId: f.releaseId, editionId: f.editionId, narratorOrVoiceId: f.narratorOrVoiceId, locale: f.locale,
    };
  };
  const key = (type: string, segmentId: string, tail: string | number) => `${type}|${ctx.session}|${segmentId}|${tail}`;
  const abandon = async (seg: SegmentRef, view: EmitView, positionMs: number) =>
    bus.emit<AudioAbandoned>({ type: 'AudioAbandoned', ...base(key('AudioAbandoned', seg.segmentId, st(seg.segmentId).pass)), ...(await listen(seg, view)), positionMs });

  return {
    played: async (seg, view) => bus.emit<AudioPlayed>({ type: 'AudioPlayed', ...base(key('AudioPlayed', seg.segmentId, st(seg.segmentId).pass)), ...(await listen(seg, view)) }),
    completed: async (seg, view, extra) => {
      const s = st(seg.segmentId);
      const facts = await resolvePlaybackFacts(ctx.store, seg);
      if (!facts.ready || extra?.heardCoverageRatio === undefined || !Number.isFinite(extra.heardCoverageRatio) || extra.heardCoverageRatio < 0.8) {
        await abandon(seg, view, extra?.positionMs ?? 0); return null;
      } // the asset wasn't playable or the event didn't prove meaningful audible coverage
      const playback = await listen(seg, view);
      return bus.emit<AudioSegmentCompleted>({
        type: 'AudioSegmentCompleted', ...base(key('AudioSegmentCompleted', seg.segmentId, s.pass)), ...playback,
        replayCount: extra?.replayCount ?? s.replays,
        revealedTranscript: extra?.revealedTranscript ?? (s.revealedTranscript || view.transcriptVisible),
        revealedTranslation: extra?.revealedTranslation ?? s.revealedTranslation,
        heardCoverageRatio: extra?.heardCoverageRatio,
        audibleCoverageVersion: 'observed-playback@1',
      });
    },
    replayed: async (seg, view) => {
      const s = st(seg.segmentId);
      s.replays += 1; s.pass += 1;
      return bus.emit<AudioReplayed>({ type: 'AudioReplayed', ...base(key('AudioReplayed', seg.segmentId, s.replays)), ...(await listen(seg, view)), count: s.replays });
    },
    phraseReplayed: async (seg, view, p) => bus.emit<PhraseReplayed>({ type: 'PhraseReplayed', ...base(`PhraseReplayed|${ctx.session}|${seg.segmentId}|${p.alignmentId}|${unique()}`), ...(await listen(seg, view)), alignmentId: p.alignmentId, unitId: p.unitId }),
    seeked: (p) => bus.emit<AudioSeeked>({ type: 'AudioSeeked', ...base(`AudioSeeked|${ctx.session}|${unique()}`), textId: ctx.textId, fromSegmentId: p.fromSegmentId, toSegmentId: p.toSegmentId }),
    speedChanged: (p) => bus.emit<PlaybackSpeedChanged>({ type: 'PlaybackSpeedChanged', ...base(`PlaybackSpeedChanged|${ctx.session}|${unique()}`), textId: ctx.textId, from: p.from, to: p.to }),
    transcriptRevealed: async (seg, view) => {
      st(seg.segmentId).revealedTranscript = true;
      return bus.emit<TranscriptRevealed>({ type: 'TranscriptRevealed', ...base(key('TranscriptRevealed', seg.segmentId, st(seg.segmentId).pass)), ...(await listen(seg, view)) });
    },
    abandoned: (seg, view, positionMs) => abandon(seg, view, positionMs),
    failed: (seg, view, positionMs = 0) => abandon(seg, view, positionMs),
    positionSaved: async ({ manifestId, segmentId, positionMs }) => {
      if (!ctx.store || !Number.isFinite(positionMs) || positionMs <= 0) return null;
      const [manifest, text, segment] = await Promise.all([
        ctx.store.manifests.get(manifestId), ctx.store.texts.get(ctx.textId), ctx.store.audioSegments.get(segmentId),
      ]);
      if (!manifest || manifest.textId !== ctx.textId || !text || manifest.contentVersion !== text.contentVersion
        || !segment || segment.textId !== ctx.textId || segment.contentVersion !== text.contentVersion
        || segment.status !== 'ready' || !segment.assetId || !manifest.segmentIds.includes(segment.id)) return null;
      const asset = await ctx.store.audioAssets.get(segment.assetId);
      if (!asset || positionMs >= asset.durationMs || !approvedForPlay(asset.rights) || !(await currentBindingValid(ctx.store, asset))) return null;
      return bus.emit<ListeningPositionSaved>({
        type: 'ListeningPositionSaved', ...base(`ListeningPositionSaved|${ctx.session}|${manifestId}|${segmentId}|${unique()}`),
        textId: ctx.textId, manifestId, segmentId, positionMs: Math.floor(positionMs),
      });
    },
    shadowingAttempt: async (seg, view) => {
      const s = st(seg.segmentId);
      s.shadowing += 1;
      return bus.emit<ShadowingAttempt>({ type: 'ShadowingAttempt', ...base(key('ShadowingAttempt', seg.segmentId, s.shadowing)), ...(await listen(seg, view)), attempt: s.shadowing });
    },
    recordingCreated: (p) => bus.emit<UserRecordingCreated>({ type: 'UserRecordingCreated', ...base(`UserRecordingCreated|${p.recordingId}`), recordingId: p.recordingId, targetText: p.targetText, sentenceId: p.sentenceId, testimonyRevisionId: p.testimonyRevisionId }),
    translationRevealed: (segmentId) => { st(segmentId).revealedTranslation = true; },
    passOf: (segmentId) => st(segmentId).pass,
  };
}

/**
 * Turns the `emit` effects produced by the player state machine into domain events (in order).
 * `model` supplies the segment list; every event carries the speed / transcript state captured
 * by the state machine at the moment of the action.
 */
export async function emitPlayerEffects(emitter: ListeningEmitter, model: Pick<PlayerModel, 'manifest'>, effects: PlayerEffect[]): Promise<void> {
  const seg = (i: number): SegmentRef => { const s = model.manifest.segments[i]; return { segmentId: s.segmentId, sentenceIds: s.sentenceIds, assetId: s.assetId, ready: s.ready }; };
  for (const fx of effects) {
    if (fx.type !== 'emit') continue;
    const e = fx.emit;
    switch (e.event) {
      case 'played': await emitter.played(seg(e.segmentIndex), e.view); break;
      case 'completed': await emitter.completed(seg(e.segmentIndex), e.view, { replayCount: e.replayCount, revealedTranscript: e.revealedTranscript, heardCoverageRatio: e.heardCoverageRatio }); break;
      case 'replayed': await emitter.replayed(seg(e.segmentIndex), e.view); break;
      case 'phraseReplayed': await emitter.phraseReplayed(seg(e.segmentIndex), e.view, { alignmentId: e.alignmentId, unitId: e.unitId }); break;
      case 'seeked': await emitter.seeked({ fromSegmentId: e.fromSegmentIndex === undefined ? undefined : seg(e.fromSegmentIndex).segmentId, toSegmentId: seg(e.toSegmentIndex).segmentId }); break;
      case 'speedChanged': await emitter.speedChanged({ from: e.from, to: e.to }); break;
      case 'transcriptRevealed': await emitter.transcriptRevealed(seg(e.segmentIndex), e.view); break;
      case 'abandoned': await emitter.abandoned(seg(e.segmentIndex), e.view, e.positionMs); break;
    }
  }
}
