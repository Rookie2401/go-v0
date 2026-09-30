/**
 * Listening events. The player (UI) calls these typed helpers; they fill `dedupeKey`s so that
 *  - a rerender / duplicate media callback cannot double count,
 *  - a deliberate replay is a new pass and counts again.
 *
 * Dedupe keys are scoped by session and segment. "Pass" = one listen-through of a segment; it advances
 * on every replay. Completion is deduped per segment per pass. Listening evidence itself (what the
 * event means for the learner) is decided by GoLearn, not here.
 *
 * Keep ONE emitter per listening session (e.g. in a useRef): its pass counters live in the emitter, so
 * a second emitter for the same session would restart at pass 0 and have its repeats deduped away.
 */
import type { AudioAbandoned, AudioPlayed, AudioReplayed, AudioSegmentCompleted, AudioSeeked, EventBus, PhraseReplayed, PlaybackSpeedChanged, ShadowingAttempt, Surface, TranscriptRevealed, UserRecordingCreated } from '../core/events';
import type { LanguageCode } from '../core/model';
import type { EmitView, PlayerEffect, PlayerModel } from './player';

export interface ListeningContext {
  userId: string;
  lang: LanguageCode;
  session: string;
  /** The text being listened to (or the testimony context id). */
  textId: string;
  surface?: Surface; // default 'listen'
  clock?: () => string;
}

export interface SegmentRef { segmentId: string; sentenceIds: string[] }

interface SegState { pass: number; replays: number; revealedTranscript: boolean; revealedTranslation: boolean; shadowing: number }

export interface ListeningEmitter {
  played(seg: SegmentRef, view: EmitView): Promise<AudioPlayed | null>;
  completed(seg: SegmentRef, view: EmitView, extra?: { revealedTranscript?: boolean; revealedTranslation?: boolean; replayCount?: number }): Promise<AudioSegmentCompleted | null>;
  replayed(seg: SegmentRef, view: EmitView): Promise<AudioReplayed | null>;
  phraseReplayed(seg: SegmentRef, view: EmitView, p: { alignmentId: string; unitId: string }): Promise<PhraseReplayed | null>;
  seeked(p: { fromSegmentId?: string; toSegmentId: string }): Promise<AudioSeeked | null>;
  speedChanged(p: { from: number; to: number }): Promise<PlaybackSpeedChanged | null>;
  transcriptRevealed(seg: SegmentRef, view: EmitView): Promise<TranscriptRevealed | null>;
  abandoned(seg: SegmentRef, view: EmitView, positionMs: number): Promise<AudioAbandoned | null>;
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
  const listen = (seg: SegmentRef, view: EmitView) => ({ textId: ctx.textId, segmentId: seg.segmentId, sentenceIds: seg.sentenceIds, speed: view.speed, transcriptVisible: view.transcriptVisible });
  const key = (type: string, segmentId: string, tail: string | number) => `${type}|${ctx.session}|${segmentId}|${tail}`;

  return {
    played: (seg, view) => bus.emit<AudioPlayed>({ type: 'AudioPlayed', ...base(key('AudioPlayed', seg.segmentId, st(seg.segmentId).pass)), ...listen(seg, view) }),
    completed: (seg, view, extra) => {
      const s = st(seg.segmentId);
      return bus.emit<AudioSegmentCompleted>({
        type: 'AudioSegmentCompleted', ...base(key('AudioSegmentCompleted', seg.segmentId, s.pass)), ...listen(seg, view),
        replayCount: extra?.replayCount ?? s.replays,
        revealedTranscript: extra?.revealedTranscript ?? (s.revealedTranscript || view.transcriptVisible),
        revealedTranslation: extra?.revealedTranslation ?? s.revealedTranslation,
      });
    },
    replayed: (seg, view) => {
      const s = st(seg.segmentId);
      s.replays += 1; s.pass += 1;
      return bus.emit<AudioReplayed>({ type: 'AudioReplayed', ...base(key('AudioReplayed', seg.segmentId, s.replays)), ...listen(seg, view), count: s.replays });
    },
    phraseReplayed: (seg, view, p) => bus.emit<PhraseReplayed>({ type: 'PhraseReplayed', ...base(`PhraseReplayed|${ctx.session}|${seg.segmentId}|${p.alignmentId}|${unique()}`), ...listen(seg, view), alignmentId: p.alignmentId, unitId: p.unitId }),
    seeked: (p) => bus.emit<AudioSeeked>({ type: 'AudioSeeked', ...base(`AudioSeeked|${ctx.session}|${unique()}`), textId: ctx.textId, fromSegmentId: p.fromSegmentId, toSegmentId: p.toSegmentId }),
    speedChanged: (p) => bus.emit<PlaybackSpeedChanged>({ type: 'PlaybackSpeedChanged', ...base(`PlaybackSpeedChanged|${ctx.session}|${unique()}`), textId: ctx.textId, from: p.from, to: p.to }),
    transcriptRevealed: (seg, view) => {
      st(seg.segmentId).revealedTranscript = true;
      return bus.emit<TranscriptRevealed>({ type: 'TranscriptRevealed', ...base(key('TranscriptRevealed', seg.segmentId, st(seg.segmentId).pass)), ...listen(seg, view) });
    },
    abandoned: (seg, view, positionMs) => bus.emit<AudioAbandoned>({ type: 'AudioAbandoned', ...base(key('AudioAbandoned', seg.segmentId, st(seg.segmentId).pass)), ...listen(seg, view), positionMs }),
    shadowingAttempt: (seg, view) => {
      const s = st(seg.segmentId);
      s.shadowing += 1;
      return bus.emit<ShadowingAttempt>({ type: 'ShadowingAttempt', ...base(key('ShadowingAttempt', seg.segmentId, s.shadowing)), ...listen(seg, view), attempt: s.shadowing });
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
  const seg = (i: number): SegmentRef => { const s = model.manifest.segments[i]; return { segmentId: s.segmentId, sentenceIds: s.sentenceIds }; };
  for (const fx of effects) {
    if (fx.type !== 'emit') continue;
    const e = fx.emit;
    switch (e.event) {
      case 'played': await emitter.played(seg(e.segmentIndex), e.view); break;
      case 'completed': await emitter.completed(seg(e.segmentIndex), e.view, { replayCount: e.replayCount, revealedTranscript: e.revealedTranscript }); break;
      case 'replayed': await emitter.replayed(seg(e.segmentIndex), e.view); break;
      case 'phraseReplayed': await emitter.phraseReplayed(seg(e.segmentIndex), e.view, { alignmentId: e.alignmentId, unitId: e.unitId }); break;
      case 'seeked': await emitter.seeked({ fromSegmentId: e.fromSegmentIndex === undefined ? undefined : seg(e.fromSegmentIndex).segmentId, toSegmentId: seg(e.toSegmentIndex).segmentId }); break;
      case 'speedChanged': await emitter.speedChanged({ from: e.from, to: e.to }); break;
      case 'transcriptRevealed': await emitter.transcriptRevealed(seg(e.segmentIndex), e.view); break;
      case 'abandoned': await emitter.abandoned(seg(e.segmentIndex), e.view, e.positionMs); break;
    }
  }
}
