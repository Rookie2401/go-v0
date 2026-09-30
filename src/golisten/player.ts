/**
 * DOM-free player state machine.
 *
 * The UI wraps this around an HTMLAudioElement (`preservesPitch = true`; speed changes must never
 * resample pitch) and feeds it actions: user intents ('next', 'replay', 'setSpeed', ...) and media
 * callbacks ('position', 'ended'). `dispatch` returns effects for the UI to perform (load a source,
 * play, seek, set the rate, prefetch) plus `emit` effects describing listening events, which
 * `emitPlayerEffects` (events.ts) turns into domain events with correct dedupe keys.
 *
 * Nothing here knows about audio decoding, timing of real media, or learner evidence.
 */
import type { PlayerState } from '../core/contracts/golisten';

export const MIN_SPEED = 0.7;
export const MAX_SPEED = 1.25;
export const SPEED_STEP = 0.05;
export const RESTART_THRESHOLD_MS = 2000;

export function clampSpeed(v: number): number {
  if (!Number.isFinite(v)) return 1;
  return Math.round(Math.min(MAX_SPEED, Math.max(MIN_SPEED, v)) * 100) / 100;
}

export type TranscriptMode = PlayerState['transcriptMode'];

export interface PlayerSegmentInfo {
  segmentId: string;
  sentenceIds: string[];
  /** Only ready segments (validated asset) are playable. */
  ready: boolean;
  assetId?: string;
  durationMs?: number;
  paragraphIndex?: number;
}

export interface PlayerManifestInput {
  manifestId: string;
  textId: string;
  segments: PlayerSegmentInfo[];
}

export interface PlayerModel extends PlayerState {
  readonly manifest: PlayerManifestInput;
  positionMs: number;
  /** The current segment's pass has started (a 'played' event was emitted for it). */
  started: boolean;
  /** The current segment's pass ran to its end. */
  completed: boolean;
  /** Everything after the last playable segment finished. */
  finished: boolean;
  /** Replays of the current segment in this session (explicit replays + loop repeats). */
  replayCount: number;
  /** Segment indexes whose transcript the learner explicitly revealed. */
  revealed: number[];
  loopRange?: { startMs: number; endMs: number };
  /** Aligned unit (phraseOccurrenceId / tokenId) being looped, for PhraseReplayed. */
  loopUnitId?: string;
  /** Segment indexes already announced to the prefetcher. */
  prefetched: number[];
  prefetchWindow: number;
  autoAdvance: boolean;
}

export type PlayerAction =
  | { type: 'play' } | { type: 'pause' } | { type: 'toggle' }
  | { type: 'next' } | { type: 'prev' }
  | { type: 'seekSegment'; index: number }
  | { type: 'seekSentence'; sentenceId: string }
  | { type: 'seekParagraph'; delta: 1 | -1 }
  | { type: 'replay' }
  | { type: 'setLoop'; unit: PlayerState['loop']['unit']; alignmentId?: string; unitId?: string; range?: { startMs: number; endMs: number } }
  | { type: 'setSpeed'; speed: number } | { type: 'stepSpeed'; delta: 1 | -1 }
  | { type: 'setTranscriptMode'; mode: TranscriptMode }
  | { type: 'revealTranscript' }
  | { type: 'position'; ms: number }
  | { type: 'ended' }
  /** The media element failed or was aborted (decode error, asset missing): the pass is abandoned, never completed. */
  | { type: 'playbackError' }
  | { type: 'manifestUpdated'; manifest: PlayerManifestInput };

export interface EmitView { speed: number; transcriptVisible: boolean }

export type PlayerEmit =
  | { event: 'played'; segmentIndex: number; view: EmitView }
  | { event: 'completed'; segmentIndex: number; view: EmitView; replayCount: number; revealedTranscript: boolean }
  | { event: 'replayed'; segmentIndex: number; view: EmitView; count: number }
  | { event: 'phraseReplayed'; segmentIndex: number; view: EmitView; alignmentId: string; unitId: string }
  | { event: 'seeked'; fromSegmentIndex?: number; toSegmentIndex: number }
  | { event: 'speedChanged'; from: number; to: number }
  | { event: 'transcriptRevealed'; segmentIndex: number; view: EmitView }
  | { event: 'abandoned'; segmentIndex: number; view: EmitView; positionMs: number };

export type PlayerEffect =
  | { type: 'load'; segmentIndex: number; segmentId: string; assetId?: string }
  | { type: 'play' } | { type: 'pause' }
  | { type: 'seek'; ms: number }
  | { type: 'setRate'; rate: number; preservesPitch: true }
  | { type: 'prefetch'; segmentIndexes: number[]; assetIds: string[] }
  | { type: 'emit' } & PlayerEmitEffect;

type PlayerEmitEffect = { emit: PlayerEmit };

export interface PlayerOptions {
  speed?: number;
  transcriptMode?: TranscriptMode;
  prefetchWindow?: number;
  autoAdvance?: boolean;
}

// ───────────────────────── queries ─────────────────────────

export function isTranscriptVisible(m: PlayerModel, index: number): boolean {
  switch (m.transcriptMode) {
    case 'visible': return true;
    case 'hidden': return m.revealed.includes(index);
    case 'reveal-current': return m.revealed.includes(index) || (index === m.segmentIndex && m.started);
    case 'reveal-after': return m.revealed.includes(index) || index < m.segmentIndex || (index === m.segmentIndex && m.completed);
  }
}

export const playableIndexes = (manifest: PlayerManifestInput): number[] =>
  manifest.segments.flatMap((s, i) => (s.ready && !!s.assetId ? [i] : []));

const isPlayable = (m: PlayerManifestInput, i: number) => !!m.segments[i]?.ready && !!m.segments[i]?.assetId;
const nextPlayable = (m: PlayerManifestInput, from: number, dir: 1 | -1): number | undefined => {
  for (let i = from + dir; i >= 0 && i < m.segments.length; i += dir) if (isPlayable(m, i)) return i;
  return undefined;
};

export function createPlayerModel(manifest: PlayerManifestInput, opts: PlayerOptions = {}): PlayerModel {
  const first = playableIndexes(manifest)[0] ?? 0;
  return {
    manifest, manifestId: manifest.manifestId, segmentIndex: first, playing: false, speed: clampSpeed(opts.speed ?? 1),
    transcriptMode: opts.transcriptMode ?? 'hidden', loop: { unit: 'none' },
    positionMs: 0, started: false, completed: false, finished: false, replayCount: 0, revealed: [], prefetched: [],
    prefetchWindow: opts.prefetchWindow ?? 2, autoAdvance: opts.autoAdvance ?? true,
  };
}

// ───────────────────────── reducer ─────────────────────────

const view = (m: PlayerModel, index = m.segmentIndex): EmitView => ({ speed: m.speed, transcriptVisible: isTranscriptVisible(m, index) });
const emit = (e: PlayerEmit): PlayerEffect => ({ type: 'emit', emit: e });

function prefetchEffects(m: PlayerModel): { model: PlayerModel; effects: PlayerEffect[] } {
  const want: number[] = [];
  let i = m.segmentIndex;
  while (want.length < m.prefetchWindow) {
    const n = nextPlayable(m.manifest, i, 1);
    if (n === undefined) break;
    want.push(n);
    i = n;
  }
  const fresh = want.filter((x) => !m.prefetched.includes(x));
  if (fresh.length === 0) return { model: m, effects: [] };
  return {
    model: { ...m, prefetched: [...m.prefetched, ...fresh] },
    effects: [{ type: 'prefetch', segmentIndexes: fresh, assetIds: fresh.map((x) => m.manifest.segments[x].assetId!) }],
  };
}

/** Moves to `index` (must be playable). Emits abandoned for a half-heard pass and seeked. */
function moveTo(m: PlayerModel, index: number, opts: { play: boolean }): { model: PlayerModel; effects: PlayerEffect[] } {
  const effects: PlayerEffect[] = [];
  const from = m.segmentIndex;
  if (m.started && !m.completed && m.positionMs > 0 && from !== index) {
    effects.push(emit({ event: 'abandoned', segmentIndex: from, view: view(m), positionMs: m.positionMs }));
  }
  effects.push(emit({ event: 'seeked', fromSegmentIndex: from, toSegmentIndex: index }));
  const seg = m.manifest.segments[index];
  let next: PlayerModel = {
    ...m, segmentIndex: index, positionMs: 0, started: false, completed: false, finished: false, replayCount: 0,
    playing: opts.play, loopRange: m.loop.unit === 'phrase' ? m.loopRange : undefined,
  };
  effects.push({ type: 'load', segmentIndex: index, segmentId: seg.segmentId, assetId: seg.assetId });
  effects.push({ type: 'setRate', rate: next.speed, preservesPitch: true });
  if (opts.play) {
    next = { ...next, started: true };
    effects.push({ type: 'play' });
    effects.push(emit({ event: 'played', segmentIndex: index, view: view(next) }));
  }
  const pf = prefetchEffects(next);
  return { model: pf.model, effects: [...effects, ...pf.effects] };
}

export function reducePlayer(m: PlayerModel, a: PlayerAction): { model: PlayerModel; effects: PlayerEffect[] } {
  const none = { model: m, effects: [] as PlayerEffect[] };
  switch (a.type) {
    case 'play': {
      if (playableIndexes(m.manifest).length === 0) return none;
      if (m.playing) return none;
      let idx = m.segmentIndex;
      if (!isPlayable(m.manifest, idx)) idx = nextPlayable(m.manifest, idx, 1) ?? playableIndexes(m.manifest)[0];
      if (m.finished) return moveTo({ ...m, segmentIndex: idx }, playableIndexes(m.manifest)[0], { play: true });
      if (idx !== m.segmentIndex) return moveTo(m, idx, { play: true });
      if (m.completed) return reducePlayer({ ...m, playing: false }, { type: 'replay' }); // play after a finished pass = deliberate replay
      if (!m.started) {
        const started: PlayerModel = { ...m, playing: true, started: true };
        const pf = prefetchEffects(started);
        return {
          model: pf.model,
          effects: [
            { type: 'load', segmentIndex: idx, segmentId: m.manifest.segments[idx].segmentId, assetId: m.manifest.segments[idx].assetId },
            { type: 'setRate', rate: m.speed, preservesPitch: true }, { type: 'play' },
            emit({ event: 'played', segmentIndex: idx, view: view(started) }), ...pf.effects,
          ],
        };
      }
      return { model: { ...m, playing: true }, effects: [{ type: 'play' }] }; // resume, not a new pass
    }
    case 'pause':
      return m.playing ? { model: { ...m, playing: false }, effects: [{ type: 'pause' }] } : none;
    case 'toggle':
      return reducePlayer(m, { type: m.playing ? 'pause' : 'play' });
    case 'next': {
      const n = nextPlayable(m.manifest, m.segmentIndex, 1);
      if (n === undefined) return none;
      return moveTo(m, n, { play: m.playing });
    }
    case 'prev': {
      if (m.positionMs > RESTART_THRESHOLD_MS) return reducePlayer(m, { type: 'replay' });
      const p = nextPlayable(m.manifest, m.segmentIndex, -1);
      if (p === undefined) return reducePlayer(m, { type: 'replay' });
      return moveTo(m, p, { play: m.playing });
    }
    case 'seekSegment':
      if (!isPlayable(m.manifest, a.index) || a.index === m.segmentIndex) return none;
      return moveTo(m, a.index, { play: m.playing });
    case 'seekSentence': {
      const i = m.manifest.segments.findIndex((s) => s.sentenceIds.includes(a.sentenceId));
      if (i < 0 || !isPlayable(m.manifest, i) || i === m.segmentIndex) return none;
      return moveTo(m, i, { play: m.playing });
    }
    case 'seekParagraph': {
      const cur = m.manifest.segments[m.segmentIndex]?.paragraphIndex;
      if (cur === undefined) return none;
      const order = m.manifest.segments.flatMap((s, i) => (isPlayable(m.manifest, i) && s.paragraphIndex !== undefined ? [{ i, p: s.paragraphIndex }] : []));
      const target = a.delta === 1
        ? order.find((o) => o.p > cur)
        : (() => { // start of the previous paragraph
          const prevP = Math.max(...order.filter((o) => o.p < cur).map((o) => o.p), -1);
          return prevP < 0 ? undefined : order.find((o) => o.p === prevP);
        })();
      if (!target) return none;
      return moveTo(m, target.i, { play: m.playing });
    }
    case 'replay': {
      if (!isPlayable(m.manifest, m.segmentIndex)) return none;
      const seg = m.manifest.segments[m.segmentIndex];
      const count = m.replayCount + 1;
      const model: PlayerModel = { ...m, positionMs: 0, started: true, completed: false, finished: false, playing: true, replayCount: count };
      return {
        model,
        effects: [
          { type: 'load', segmentIndex: m.segmentIndex, segmentId: seg.segmentId, assetId: seg.assetId },
          { type: 'setRate', rate: m.speed, preservesPitch: true }, { type: 'seek', ms: 0 }, { type: 'play' },
          emit({ event: 'replayed', segmentIndex: m.segmentIndex, view: view(model), count }),
        ],
      };
    }
    case 'setLoop': {
      const range = a.unit === 'phrase' ? a.range : undefined;
      if (a.unit === 'phrase' && (!a.alignmentId || !range || !(range.endMs > range.startMs))) return none; // a phrase loop needs a real aligned range
      return { model: { ...m, loop: { unit: a.unit, alignmentId: a.unit === 'phrase' ? a.alignmentId : undefined }, loopRange: range, loopUnitId: a.unit === 'phrase' ? a.unitId ?? a.alignmentId : undefined }, effects: [] };
    }
    case 'setSpeed':
    case 'stepSpeed': {
      const to = clampSpeed(a.type === 'setSpeed' ? a.speed : m.speed + a.delta * SPEED_STEP);
      if (to === m.speed) return none;
      return {
        model: { ...m, speed: to },
        effects: [{ type: 'setRate', rate: to, preservesPitch: true }, emit({ event: 'speedChanged', from: m.speed, to })],
      };
    }
    case 'setTranscriptMode':
      return a.mode === m.transcriptMode ? none : { model: { ...m, transcriptMode: a.mode }, effects: [] };
    case 'revealTranscript': {
      if (m.revealed.includes(m.segmentIndex) || m.transcriptMode === 'visible') return none;
      const model: PlayerModel = { ...m, revealed: [...m.revealed, m.segmentIndex] };
      return { model, effects: [emit({ event: 'transcriptRevealed', segmentIndex: m.segmentIndex, view: view(model) })] };
    }
    case 'position': {
      const model: PlayerModel = { ...m, positionMs: Math.max(0, a.ms) };
      if (m.loop.unit === 'phrase' && m.loopRange && m.playing && a.ms >= m.loopRange.endMs) {
        return {
          model: { ...model, positionMs: m.loopRange.startMs },
          effects: [{ type: 'seek', ms: m.loopRange.startMs }, emit({ event: 'phraseReplayed', segmentIndex: m.segmentIndex, view: view(m), alignmentId: m.loop.alignmentId!, unitId: m.loopUnitId ?? m.loop.alignmentId! })],
        };
      }
      return { model, effects: [] };
    }
    case 'ended': {
      if (!m.started || m.completed) return none; // a stray/duplicate media callback
      const completedEffects: PlayerEffect[] = [emit({
        event: 'completed', segmentIndex: m.segmentIndex, view: view(m), replayCount: m.replayCount, revealedTranscript: isTranscriptVisible(m, m.segmentIndex),
      })];
      const done: PlayerModel = { ...m, completed: true, positionMs: 0 };
      if (m.loop.unit === 'sentence' || (m.loop.unit === 'phrase' && m.loopRange)) {
        const start = m.loop.unit === 'phrase' ? m.loopRange!.startMs : 0;
        const count = m.replayCount + 1;
        const model: PlayerModel = { ...done, completed: false, started: true, playing: true, replayCount: count, positionMs: start };
        return {
          model,
          effects: [...completedEffects, { type: 'seek', ms: start }, { type: 'play' }, emit({ event: 'replayed', segmentIndex: m.segmentIndex, view: view(model), count })],
        };
      }
      const n = nextPlayable(m.manifest, m.segmentIndex, 1);
      if (n === undefined || !m.autoAdvance) {
        return { model: { ...done, playing: false, finished: n === undefined }, effects: [...completedEffects, { type: 'pause' }] };
      }
      const moved = moveTo(done, n, { play: true });
      return { model: moved.model, effects: [...completedEffects, ...moved.effects] };
    }
    case 'playbackError': {
      if (!m.started || m.completed) return none;
      return {
        model: { ...m, playing: false, started: false, positionMs: 0 },
        effects: [{ type: 'pause' }, emit({ event: 'abandoned', segmentIndex: m.segmentIndex, view: view(m), positionMs: m.positionMs })],
      };
    }
    case 'manifestUpdated': {
      const same = a.manifest.manifestId === m.manifest.manifestId;
      const current = m.manifest.segments[m.segmentIndex]?.segmentId;
      const idx = same && current ? a.manifest.segments.findIndex((s) => s.segmentId === current) : -1;
      const model: PlayerModel = { ...m, manifest: a.manifest, manifestId: a.manifest.manifestId, segmentIndex: idx >= 0 ? idx : same ? m.segmentIndex : playableIndexes(a.manifest)[0] ?? 0, prefetched: [] };
      const pf = prefetchEffects(model);
      return { model: pf.model, effects: pf.effects };
    }
  }
}

/** Convenience wrapper holding the model and notifying subscribers. Pure logic stays in `reducePlayer`. */
export class PlayerMachine {
  private model: PlayerModel;
  private listeners = new Set<(m: PlayerModel, effects: PlayerEffect[]) => void>();
  constructor(manifest: PlayerManifestInput, opts?: PlayerOptions) { this.model = createPlayerModel(manifest, opts); }
  get state(): PlayerModel { return this.model; }
  subscribe(fn: (m: PlayerModel, effects: PlayerEffect[]) => void): () => void { this.listeners.add(fn); return () => this.listeners.delete(fn); }
  dispatch(action: PlayerAction): PlayerEffect[] {
    const r = reducePlayer(this.model, action);
    this.model = r.model;
    for (const l of this.listeners) l(this.model, r.effects);
    return r.effects;
  }
}
