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
import type { AudioAlignment, AudioSourceType } from '../core/model';

export const MIN_SPEED = 0.7;
export const MAX_SPEED = 1.25;
export const SPEED_STEP = 0.05;
export const RESTART_THRESHOLD_MS = 2000;
/** The most a pass's first observed position tick (no earlier tick to measure wall time against) may count as heard. */
export const FIRST_TICK_MAX_MS = 1500;

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
  rangeMs?: { startMs: number; endMs: number };
  sourceType?: AudioSourceType;
  audioKind?: 'human' | 'synthetic';
  qualityState?: 'unreviewed' | 'machine_checked' | 'human_reviewed' | 'approved' | 'rejected';
  variety?: string;
  narratorOrVoiceId?: string;
  playAllowed?: boolean;
  offlineAllowed?: boolean;
  exactTextBound?: boolean;
  alignmentReviewState?: AudioAlignment['reviewState'];
  /** Persisted alignment ids whose reviewed ranges passed audio bounds validation. */
  reviewedAlignmentIds?: string[];
  /** Reviewed phrase ranges from the active persisted asset, with exact corpus unit identity. */
  reviewedAlignmentRanges?: Array<{ id: string; unitId: string; unit: AudioAlignment['unit']; startMs: number; endMs: number }>;
  /**
   * Reviewed per-sentence alignments of this segment's sentences on the asset timeline. Present only when EVERY sentence of
   * the segment has one; the player then reports which sentences were actually heard.
   */
  sentenceRanges?: Array<{ sentenceId: string; startMs: number; endMs: number }>;
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
  /** Lowest rate used in this pass; easing back up cannot erase the fact that speech was slowed. */
  passMinSpeed: number;
  /** Audibly covered ranges inferred from monotonic media progress, not seeks. */
  heardRanges: Array<{ startMs: number; endMs: number }>;
  lastPositionAtMs?: number;
  /** Sticky transcript exposure for the current pass. */
  passTranscriptExposed: boolean;
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
  /**
   * A media progress tick. It counts as heard only with `observedAtMs` and while audible: `muted` / `volume` come from the
   * media element (the UI always passes them; a tick that omits them is not treated as silent).
   */
  | { type: 'position'; ms: number; observedAtMs?: number; muted?: boolean; volume?: number }
  /** User timeline seek: moves the playhead but adds no heard coverage. */
  | { type: 'seekPosition'; ms: number }
  /** Restore a validated checkpoint without emitting play/completion evidence. */
  | { type: 'restorePosition'; segmentId: string; positionMs: number }
  /** Natural media end can arrive without a final `timeupdate`; this is the observed media playhead, not heard coverage. */
  | { type: 'ended'; observedPositionMs?: number }
  /** The media element failed or was aborted (decode error, asset missing): the pass is abandoned, never completed. */
  | { type: 'playbackError' }
  | { type: 'manifestUpdated'; manifest: PlayerManifestInput };

export interface EmitView { speed: number; transcriptVisible: boolean }

export type PlayerEmit =
  | { event: 'played'; segmentIndex: number; view: EmitView }
  | { event: 'completed'; segmentIndex: number; view: EmitView; replayCount: number; revealedTranscript: boolean; heardCoverageRatio: number; heardSentenceIds?: string[] }
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
  manifest.segments.flatMap((s, i) => (s.ready && !!s.assetId && s.playAllowed !== false ? [i] : []));

const isPlayable = (m: PlayerManifestInput, i: number) => !!m.segments[i]?.ready && !!m.segments[i]?.assetId && m.segments[i]?.playAllowed !== false;
const nextPlayable = (m: PlayerManifestInput, from: number, dir: 1 | -1): number | undefined => {
  for (let i = from + dir; i >= 0 && i < m.segments.length; i += dir) if (isPlayable(m, i)) return i;
  return undefined;
};

export function createPlayerModel(manifest: PlayerManifestInput, opts: PlayerOptions = {}): PlayerModel {
  const first = playableIndexes(manifest)[0] ?? 0;
  const rangeStart = manifest.segments[first]?.rangeMs?.startMs ?? 0;
  return {
    manifest, manifestId: manifest.manifestId, segmentIndex: first, playing: false, speed: clampSpeed(opts.speed ?? 1),
    transcriptMode: opts.transcriptMode ?? 'hidden', loop: { unit: 'none' },
    positionMs: rangeStart, started: false, completed: false, finished: false, replayCount: 0, revealed: [], prefetched: [],
    passMinSpeed: clampSpeed(opts.speed ?? 1), heardRanges: [], passTranscriptExposed: (opts.transcriptMode ?? 'hidden') === 'visible',
    prefetchWindow: opts.prefetchWindow ?? 2, autoAdvance: opts.autoAdvance ?? true,
  };
}

// ───────────────────────── reducer ─────────────────────────

const view = (m: PlayerModel, index = m.segmentIndex): EmitView => ({ speed: m.passMinSpeed, transcriptVisible: isTranscriptVisible(m, index) || (index === m.segmentIndex && m.passTranscriptExposed) });
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
    ...m, segmentIndex: index, positionMs: seg.rangeMs?.startMs ?? 0, started: false, completed: false, finished: false, replayCount: 0,
    passMinSpeed: m.speed, heardRanges: [], lastPositionAtMs: undefined, passTranscriptExposed: m.transcriptMode === 'visible',
    playing: opts.play, loopRange: m.loop.unit === 'phrase' ? m.loopRange : undefined,
  };
  effects.push({ type: 'load', segmentIndex: index, segmentId: seg.segmentId, assetId: seg.assetId });
  if (next.positionMs > 0) effects.push({ type: 'seek', ms: next.positionMs });
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
        const started: PlayerModel = { ...m, playing: true, started: true, passTranscriptExposed: m.transcriptMode === 'visible' };
        const pf = prefetchEffects(started);
        return {
          model: pf.model,
          effects: [
            { type: 'load', segmentIndex: idx, segmentId: m.manifest.segments[idx].segmentId, assetId: m.manifest.segments[idx].assetId },
            // A paused user seek or restored checkpoint is state, not evidence; still apply it
            // to the media element after load (including zero to clear any prior element offset).
            { type: 'seek', ms: m.positionMs },
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
      const start = seg.rangeMs?.startMs ?? 0;
      const model: PlayerModel = { ...m, positionMs: start, started: true, completed: false, finished: false, playing: true, replayCount: count, heardRanges: [], lastPositionAtMs: undefined, passMinSpeed: m.speed, passTranscriptExposed: m.transcriptMode === 'visible' };
      return {
        model,
        effects: [
          { type: 'load', segmentIndex: m.segmentIndex, segmentId: seg.segmentId, assetId: seg.assetId },
          { type: 'setRate', rate: m.speed, preservesPitch: true }, { type: 'seek', ms: start }, { type: 'play' },
          emit({ event: 'replayed', segmentIndex: m.segmentIndex, view: view(model), count }),
        ],
      };
    }
    case 'setLoop': {
      const segment = m.manifest.segments[m.segmentIndex];
      const supplied = a.unit === 'phrase' && a.alignmentId ? segment?.reviewedAlignmentRanges?.find((r) => r.id === a.alignmentId) : undefined;
      const lo = segment?.rangeMs?.startMs ?? 0;
      const hi = segment?.rangeMs?.endMs ?? segment?.durationMs ?? 0;
      if (a.unit === 'phrase' && (!supplied || supplied.unit !== 'phrase' || supplied.unitId !== a.unitId
        || !segment?.reviewedAlignmentIds?.includes(supplied.id) || !a.range
        || a.range.startMs !== supplied.startMs || a.range.endMs !== supplied.endMs
        || supplied.startMs < lo || supplied.endMs > hi || !(supplied.endMs > supplied.startMs))) return none;
      const range = a.unit === 'phrase' && supplied ? { startMs: supplied.startMs, endMs: supplied.endMs } : undefined;
      return { model: { ...m, loop: { unit: a.unit, alignmentId: a.unit === 'phrase' ? a.alignmentId : undefined }, loopRange: range, loopUnitId: a.unit === 'phrase' ? a.unitId ?? a.alignmentId : undefined }, effects: [] };
    }
    case 'setSpeed':
    case 'stepSpeed': {
      const to = clampSpeed(a.type === 'setSpeed' ? a.speed : m.speed + a.delta * SPEED_STEP);
      if (to === m.speed) return none;
      return {
        model: { ...m, speed: to, passMinSpeed: Math.min(m.passMinSpeed, to) },
        effects: [{ type: 'setRate', rate: to, preservesPitch: true }, emit({ event: 'speedChanged', from: m.speed, to })],
      };
    }
    case 'setTranscriptMode':
      return a.mode === m.transcriptMode ? none : { model: { ...m, transcriptMode: a.mode, passTranscriptExposed: m.passTranscriptExposed || (m.started && a.mode === 'visible') }, effects: [] };
    case 'revealTranscript': {
      if (m.revealed.includes(m.segmentIndex) || m.transcriptMode === 'visible') return none;
      const model: PlayerModel = { ...m, revealed: [...m.revealed, m.segmentIndex], passTranscriptExposed: m.started || m.passTranscriptExposed };
      return { model, effects: [emit({ event: 'transcriptRevealed', segmentIndex: m.segmentIndex, view: view(model) })] };
    }
    case 'position': {
      const segment = m.manifest.segments[m.segmentIndex];
      const lo = segment?.rangeMs?.startMs ?? 0;
      const hi = segment?.rangeMs?.endMs ?? segment?.durationMs ?? Number.MAX_SAFE_INTEGER;
      const nextMs = Math.max(lo, Math.min(hi, Number.isFinite(a.ms) ? a.ms : lo));
      const elapsed = a.observedAtMs !== undefined && m.lastPositionAtMs !== undefined ? Math.max(0, a.observedAtMs - m.lastPositionAtMs) : undefined;
      const delta = nextMs - m.positionMs;
      // "Heard" means audibly played. The tick must carry the time it was observed, the player must be audible (not muted,
      // volume above zero; the UI always passes both from the media element), and the progress jump must fit within the wall
      // time since the previous observed tick at the current playback rate (with a small scheduling allowance). A tick without
      // observedAtMs counts nothing. The first observed tick of a pass has no earlier tick to measure against; it may carry at
      // most one scheduling interval (FIRST_TICK_MAX_MS), never a larger jump. This rejects programmatic/user seeks, a
      // seek-to-end masquerading as heard coverage, and muted or zero-volume playback.
      const audibleOutput = a.muted !== true && !(a.volume !== undefined && !(a.volume > 0));
      const withinTime = elapsed !== undefined ? delta <= elapsed * m.speed * 1.6 + 180 : a.observedAtMs !== undefined && m.lastPositionAtMs === undefined && delta <= FIRST_TICK_MAX_MS;
      const audible = m.playing && m.started && delta > 0 && audibleOutput && a.observedAtMs !== undefined && withinTime;
      const heardRanges = audible ? mergeHeardRange(m.heardRanges, m.positionMs, nextMs) : m.heardRanges;
      const model: PlayerModel = { ...m, positionMs: nextMs, heardRanges, lastPositionAtMs: a.observedAtMs ?? m.lastPositionAtMs };
      if (m.loop.unit === 'phrase' && m.loopRange && m.playing && a.ms >= m.loopRange.endMs) {
        return {
          model: { ...model, positionMs: m.loopRange.startMs, lastPositionAtMs: undefined },
          effects: [{ type: 'seek', ms: m.loopRange.startMs }, emit({ event: 'phraseReplayed', segmentIndex: m.segmentIndex, view: view(m), alignmentId: m.loop.alignmentId!, unitId: m.loopUnitId ?? m.loop.alignmentId! })],
        };
      }
      return { model, effects: [] };
    }
    case 'seekPosition': {
      const seg = m.manifest.segments[m.segmentIndex];
      if (!seg) return none;
      const lo = seg.rangeMs?.startMs ?? 0;
      const hi = seg.rangeMs?.endMs ?? seg.durationMs ?? Number.MAX_SAFE_INTEGER;
      const ms = Math.max(lo, Math.min(hi, Number.isFinite(a.ms) ? a.ms : lo));
      const newPass = m.completed || m.finished;
      const count = newPass ? m.replayCount + 1 : m.replayCount;
      const model: PlayerModel = { ...m, positionMs: ms, lastPositionAtMs: undefined, started: newPass ? false : m.started, completed: false, finished: false,
        replayCount: count, heardRanges: newPass ? [] : m.heardRanges, passMinSpeed: newPass ? m.speed : m.passMinSpeed,
        passTranscriptExposed: newPass ? m.transcriptMode === 'visible' : m.passTranscriptExposed };
      return { model, effects: [{ type: 'seek', ms }, ...(newPass ? [emit({ event: 'replayed', segmentIndex: m.segmentIndex, view: view(model), count })] : [])] };
    }
    case 'ended': {
      if (!m.started || m.completed) return none; // a stray/duplicate media callback
      const segment = m.manifest.segments[m.segmentIndex];
      const durationMs = segment?.durationMs;
      const requiredStart = segment?.rangeMs?.startMs ?? 0;
      const requiredEnd = segment?.rangeMs?.endMs ?? durationMs ?? 0;
      const observedEndPosition = Number.isFinite(a.observedPositionMs)
        ? Math.max(requiredStart, Math.min(requiredEnd, a.observedPositionMs!))
        : m.positionMs;
      const requiredDuration = requiredEnd - requiredStart;
      const heard = coveredInRange(m.heardRanges, requiredStart, requiredEnd);
      // Unknown durations and less than 80% audible coverage cannot complete listening evidence. An ended
      // callback after seeking is recorded as an abandonment instead.
      if (!durationMs || requiredDuration <= 0 || heard / requiredDuration < 0.8) {
        return {
          model: { ...m, playing: false, started: false, positionMs: segment?.rangeMs?.startMs ?? 0, completed: false, heardRanges: [], lastPositionAtMs: undefined },
          effects: [{ type: 'pause' }, emit({ event: 'abandoned', segmentIndex: m.segmentIndex, view: view(m), positionMs: observedEndPosition })],
        };
      }
      // With reviewed per-sentence alignments the completion names which sentences were heard: a sentence counts when at
      // least 80% of its aligned range was heard. Without them the field is absent and the whole segment is credited.
      const sentenceRanges = segment?.sentenceRanges;
      const heardSentenceIds = sentenceRanges && sentenceRanges.length > 0 && sentenceRanges.length === segment.sentenceIds.length
        ? sentenceRanges.filter((r) => r.endMs > r.startMs && coveredInRange(m.heardRanges, r.startMs, r.endMs) / (r.endMs - r.startMs) >= 0.8).map((r) => r.sentenceId)
        : undefined;
      const completedEffects: PlayerEffect[] = [emit({
        event: 'completed', segmentIndex: m.segmentIndex, view: view(m), replayCount: m.replayCount, revealedTranscript: view(m).transcriptVisible, heardCoverageRatio: Math.min(1, heard / requiredDuration),
        ...(heardSentenceIds ? { heardSentenceIds } : {}),
      })];
      const done: PlayerModel = { ...m, completed: true, positionMs: requiredEnd };
      if (m.loop.unit === 'sentence' || (m.loop.unit === 'phrase' && m.loopRange)) {
        const start = m.loop.unit === 'phrase' ? m.loopRange!.startMs : segment?.rangeMs?.startMs ?? 0;
        const count = m.replayCount + 1;
        const model: PlayerModel = { ...done, completed: false, started: true, playing: true, replayCount: count, positionMs: start, heardRanges: [], lastPositionAtMs: undefined, passMinSpeed: m.speed, passTranscriptExposed: m.transcriptMode === 'visible' };
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
    case 'restorePosition': {
      const index = m.manifest.segments.findIndex((s) => s.segmentId === a.segmentId && isPlayable(m.manifest, m.manifest.segments.indexOf(s)));
      if (index < 0) return none;
      const segment = m.manifest.segments[index];
      const duration = segment.durationMs;
      const lo = segment.rangeMs?.startMs ?? 0;
      const hi = segment.rangeMs?.endMs ?? duration ?? 0;
      if (!duration || !Number.isFinite(a.positionMs) || a.positionMs <= lo || a.positionMs >= hi) return none;
      const seg = m.manifest.segments[index];
      const model: PlayerModel = { ...m, segmentIndex: index, positionMs: a.positionMs, playing: false, started: false, completed: false, finished: false, heardRanges: [], lastPositionAtMs: undefined, prefetched: [] };
      const pf = prefetchEffects(model);
      return { model: pf.model, effects: [{ type: 'load', segmentIndex: index, segmentId: seg.segmentId, assetId: seg.assetId }, { type: 'seek', ms: a.positionMs }, ...pf.effects] };
    }
  }
}

/** Merge one actually audible monotonic interval; seeks never call this helper. */
function mergeHeardRange(ranges: Array<{ startMs: number; endMs: number }>, startMs: number, endMs: number) {
  if (!(endMs > startMs)) return ranges;
  const all = [...ranges, { startMs, endMs }].sort((a, b) => a.startMs - b.startMs);
  const out: typeof all = [];
  for (const r of all) {
    const last = out[out.length - 1];
    if (last && r.startMs <= last.endMs + 80) last.endMs = Math.max(last.endMs, r.endMs);
    else out.push({ ...r });
  }
  return out;
}

function coveredMs(ranges: Array<{ startMs: number; endMs: number }>) { return ranges.reduce((n, r) => n + Math.max(0, r.endMs - r.startMs), 0); }
function coveredInRange(ranges: Array<{ startMs: number; endMs: number }>, lo: number, hi: number) {
  return coveredMs(ranges.map((r) => ({ startMs: Math.max(lo, r.startMs), endMs: Math.min(hi, r.endMs) })));
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
