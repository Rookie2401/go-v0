/**
 * Player — the listening controls for one text: the GoListen `PlayerMachine` (DOM-free state machine)
 * wrapped around an HTMLAudioElement.
 *
 *  - The machine decides; this component performs its effects: load / play / pause / seek / setRate /
 *    prefetch, and turns its `emit` effects into listening events through `emitPlayerEffects`.
 *  - `preservesPitch = true` always; playbackRate is clamped to 0.7–1.25 (never naive resampling).
 *  - One-key sentence replay: R (global, ignored while typing) or the Replay button.
 *  - Loop sentence, prev/next sentence, prev/next paragraph, transcript modes, prefetch of upcoming URLs.
 *  - Shows provider/voice; when the voice's provider is "fixture" a visible
 *    "fixture audio — not speech" badge is always rendered.
 *  - Playing audio never touches reading evidence (GoLearn decides what listening events mean).
 *  - What is shown is driven by `golisten.audioStatus(textId)`, for every state: unavailable (no provider — you can
 *    still read), not generated, generating, ready, stale (earlier version), failed (reason + retry) and
 *    preview-only (playable and clearly labelled; real audio may count as exposure without quality-eligible evidence).
 */
import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import type { KeyboardEvent as ReactKeyboardEvent, MutableRefObject } from 'react';
import type { AudioManifest, AudioSegment, AudioStatus, PlayerState, VoiceConfig } from '../../core';
import {
  MAX_SPEED, MIN_SPEED, PlayerMachine, buildPlayerManifest, clampSpeed, emitPlayerEffects, isTranscriptVisible, listeningEmitter,
} from '../../golisten';
import type { PlayerEffect, PlayerManifestInput, PlayerModel, TranscriptMode } from '../../golisten';
import { useApp } from '../context';
import { useListenEnabled } from '../reader/useListen';
import { setPref, usePref, usePreview } from '../prefs';
import { I, IconBtn } from '../ui';
import { configureAudio, isEditableTarget } from './audio';
import { latestListeningCheckpoint } from '../../golisten/progress';

/**
 * GoListen's status reasons are already learner-facing sentences ("Audio is not available — no speech provider is
 * configured. You can still read."). Show them as they are; only wrap a bare fragment.
 */
const unavailableLine = (reason?: string) =>
  reason && /audio is not available|you can still read/i.test(reason)
    ? reason.trim()
    : `Audio is not available — ${reason ? reason.trim().replace(/[.]$/, '') : 'no speech provider is configured'}. You can still read.`;


export interface PlayerChange {
  segment?: AudioSegment;
  state: PlayerState;
  /** Whether a sentence's text should currently be hidden (listening-first transcript modes). */
  concealed: (sentenceId: string) => boolean;
}

/** Imperative handle for a host page (testimony rehearsal): jump to a sentence, play, replay. */
export interface PlayerControls {
  /** Flush the current durable listening position before a host navigates away. */
  savePosition(): Promise<void>;
  seekSentence(sentenceId: string): void;
  play(): void;
  replay(): void;
  setTranscriptMode(mode: TranscriptMode): void;
  revealForHandoff(): Promise<void>;
}

export interface PlayerProps {
  textId: string;
  onChange?: (info: PlayerChange) => void;
  controlRef?: MutableRefObject<PlayerControls | null>;
  /** Override the saved transcript preference for a fresh GoListen session. */
  defaultTranscriptMode?: TranscriptMode;
  /** Synthesis is hidden from production reading/listening surfaces until a lawful synthesis path is configured. */
  allowSynthesis?: boolean;
}

type Status = 'loading' | 'unavailable' | 'none' | 'generating' | 'preparing' | 'stale' | 'failed' | 'ready' | 'error';

const TRANSCRIPT_LABELS: Record<TranscriptMode, string> = {
  visible: 'Show text',
  hidden: 'Listen only (hide text)',
  'reveal-current': 'Tap to reveal',
  'reveal-after': 'Reveal after playing',
};

/** The parts of the model that change what is on screen (position ticks alone do not). */
const viewKey = (m: PlayerModel) =>
  [m.segmentIndex, m.playing, Math.floor(m.positionMs / 250), m.speed, m.transcriptMode, m.revealed.join(','), m.started, m.completed, m.finished, m.loop.unit, m.manifest.segments.length, m.manifest.segments.filter((s) => s.ready).length].join('|');

/** With listening switched off the player does not exist: nothing renders and GoListen is never called. */
export function Player(props: PlayerProps) {
  return useListenEnabled() ? <PlayerBody {...props} /> : null;
}

function PlayerBody({ textId, onChange, controlRef, defaultTranscriptMode, allowSynthesis = true }: PlayerProps) {
  const { store, bus, golisten, userId, lang, session } = useApp();
  const preview = usePreview();
  const [audio, setAudio] = useState<AudioStatus | undefined>();
  const speedId = useId();
  // The store lets the emitter resolve segment -> asset -> voice, so events say whether this was reviewed real speech.
  const emitter = useMemo(() => listeningEmitter(bus, { userId, lang, session, textId, store }), [bus, userId, lang, session, textId, store]);

  const [status, setStatus] = useState<Status>('loading');
  const [error, setError] = useState<string | null>(null);
  const [manifest, setManifest] = useState<AudioManifest | undefined>();
  const [segments, setSegments] = useState<Map<string, AudioSegment>>(new Map());
  const [voice, setVoice] = useState<VoiceConfig | undefined>();
  const [fixtureAsset, setFixtureAsset] = useState(false);
  const [unplayable, setUnplayable] = useState(false);
  const [model, setModel] = useState<PlayerModel | null>(null);

  // Preferences seed a new machine once; later changes flow through the machine, never back in here
  // (a dependency on them would rebuild the player, and stop playback, every time speed changes).
  const [speedPref] = usePref('speed');
  const [transcriptPref] = usePref('transcript');
  const initialPrefs = useRef({ speed: speedPref, transcriptMode: defaultTranscriptMode ?? transcriptPref });

  const machineRef = useRef<PlayerMachine | null>(null);
  const lastKey = useRef('');
  const audioRef = useRef<HTMLAudioElement>(null);
  const prefetchRef = useRef<HTMLAudioElement | null>(null);
  const queue = useRef<Promise<void>>(Promise.resolve());
  const emitterRef = useRef(emitter);
  emitterRef.current = emitter;
  const lastPositionSaved = useRef<{ at: number; segmentId: string; ms: number } | null>(null);

  const urlForAsset = useCallback(async (assetId: string | undefined) => {
    if (!assetId) return undefined;
    // Re-check rights at each load, replay, and resume. The store owns object-URL reuse; a UI cache
    // could let a revoked recording keep playing from a stale URL.
    return golisten.assetUrl(assetId);
  }, [golisten]);

  // ── perform the machine's effects against the <audio> element, in order ──
  const perform = useCallback(async (m: PlayerModel, effects: PlayerEffect[]) => {
    const audio = audioRef.current;
    let playbackBlocked = false;
    if (audio) {
      for (const fx of effects) {
        switch (fx.type) {
          case 'load': {
            const url = await urlForAsset(fx.assetId);
            if (!url) { playbackBlocked = true; setUnplayable(true); machineRef.current?.dispatch({ type: 'pause' }); break; }
            setUnplayable(false);
            if (audio.dataset.src !== url) { audio.src = url; audio.dataset.src = url; }
            audio.currentTime = 0;
            break;
          }
          case 'setRate': configureAudio(audio, fx.rate); break;
          case 'seek': audio.currentTime = fx.ms / 1000; break;
          case 'play': {
            const active = m.manifest.segments[m.segmentIndex];
            const currentUrl = await urlForAsset(active?.assetId);
            if (!currentUrl) { playbackBlocked = true; setUnplayable(true); audio.pause(); machineRef.current?.dispatch({ type: 'pause' }); break; }
            setUnplayable(false);
            if (audio.dataset.src !== currentUrl) { audio.src = currentUrl; audio.dataset.src = currentUrl; }
            const p = audio.play() as Promise<void> | undefined;
            // Autoplay blocked / interrupted: stay paused, the learner can press play again.
            p?.catch(() => { machineRef.current?.dispatch({ type: 'pause' }); });
            break;
          }
          case 'pause': audio.pause(); break;
          case 'prefetch': {
            const urls = await Promise.all(fx.assetIds.map((id) => urlForAsset(id)));
            const first = urls[0];
            if (first && typeof Audio !== 'undefined') {
              const warm = prefetchRef.current ?? new Audio();
              warm.preload = 'auto';
              if (warm.dataset.src !== first) { warm.src = first; warm.dataset.src = first; }
              prefetchRef.current = warm;
            }
            break;
          }
          case 'emit': break; // handled below, in order, by emitPlayerEffects
        }
      }
    }
    await emitPlayerEffects(emitterRef.current, m, playbackBlocked ? [] : effects);
  }, [urlForAsset]);

  const attach = useCallback((input: PlayerManifestInput) => {
    machineRef.current = new PlayerMachine(input, initialPrefs.current);
    lastKey.current = '';
    const machine = machineRef.current;
    machine.subscribe((m, effects) => {
      const key = viewKey(m);
      if (key !== lastKey.current) { lastKey.current = key; setModel(m); }
      if (effects.length) queue.current = queue.current.then(() => perform(m, effects)).catch(() => undefined);
    });
    setModel(machine.state);
    lastKey.current = viewKey(machine.state);
  }, [perform]);

  const reload = useCallback(async () => {
    // The honest state of this text's audio decides everything below.
    const st = await golisten.audioStatus(textId, { preview });
    setAudio(st);
    // PARTIAL generation (some sentences ready, some failed for good): the ready ones stay playable, and the reason says which failed.
    const partial = st.state === 'failed' && st.readySegments > 0;
    if (st.state === 'unavailable' || st.state === 'not-generated' || st.state === 'generating' || (st.state === 'failed' && !partial) || st.state === 'stale') {
      machineRef.current = null; setModel(null); setManifest(undefined);
      setStatus(st.state === 'not-generated' ? 'none' : st.state);
      return;
    }
    const m = await golisten.getManifest(textId);
    setManifest(m);
    if (!m || m.segmentIds.length === 0) { machineRef.current = null; setModel(null); setStatus('none'); return; }
    const input = await buildPlayerManifest(store, m, { allowFixture: preview });
    const rows = (await Promise.all(m.segmentIds.map((id) => golisten.getSegment(id)))).filter((s): s is AudioSegment => !!s);
    setSegments(new Map(rows.map((s) => [s.id, s])));
    if (machineRef.current && machineRef.current.state.manifest.manifestId === input.manifestId) {
      machineRef.current.dispatch({ type: 'manifestUpdated', manifest: input });
    } else {
      attach(input);
      const checkpoint = await latestListeningCheckpoint(store, userId, textId, m.id);
      if (checkpoint) machineRef.current?.dispatch({ type: 'restorePosition', segmentId: checkpoint.segmentId, positionMs: checkpoint.positionMs });
    }
    const v = await store.voices.get(m.voiceConfigId);
    setVoice(v);
    if (!v) {
      const firstAsset = rows.find((r) => r.assetId)?.assetId;
      const a = firstAsset ? await golisten.getAsset(firstAsset) : undefined;
      setFixtureAsset(a?.generation?.providerId === 'fixture');
    }
    setStatus('ready');
  }, [golisten, store, userId, textId, attach, preview]);

  useEffect(() => {
    let live = true;
    setStatus('loading');
    reload().catch((e: unknown) => { if (live) { setError(e instanceof Error ? e.message : String(e)); setStatus('error'); } });
    return () => { live = false; };
  }, [reload]);

  // While audio is being made, keep asking how far it has got.
  // Queued jobs only run when something runs them (saving a version only queues them), so every tick also kicks the
  // queue — but never while no usable provider exists, and never two kicks at once.
  const generating = audio?.state === 'generating';
  const kicking = useRef(false);
  useEffect(() => {
    if (!generating) return;
    let live = true;
    const t = setTimeout(() => {
      void (async () => {
        if (!kicking.current) {
          kicking.current = true;
          try {
            if ((await golisten.availability()).available) await golisten.runJobs();
          } catch { /* a failed kick shows up as a failed status on the reload below */ } finally { kicking.current = false; }
        }
        if (live) await reload();
      })().catch(() => undefined);
    }, 1500);
    return () => { live = false; clearTimeout(t); };
  }, [generating, audio, reload, golisten]);

  const prepare = useCallback(async () => {
    setStatus('preparing');
    setError(null);
    try {
      await golisten.ensureAudio(textId, { runNow: true });
      await reload();
    } catch (e) {
      if (e instanceof Error && e.name === 'AudioUnavailable') {
        // No provider after all (credentials removed, say): show the honest unavailable state, not an error.
        await reload().catch(() => undefined);
        return;
      }
      setError(e instanceof Error ? e.message : String(e));
      setStatus('error');
    }
  }, [golisten, textId, reload]);

  const dispatch = useCallback((a: Parameters<PlayerMachine['dispatch']>[0]) => {
    const machine = machineRef.current;
    if (!machine) return;
    machine.dispatch(a);
    if (a.type === 'setSpeed' || a.type === 'stepSpeed') setPref('speed', machine.state.speed);
    if (a.type === 'setTranscriptMode') setPref('transcript', machine.state.transcriptMode);
  }, []);

  const savePosition = useCallback(async (force = false): Promise<void> => {
    const m = machineRef.current?.state;
    const seg = m?.manifest.segments[m.segmentIndex];
    if (!m || !seg || m.positionMs <= 0 || !m.manifestId) return;
    const now = Date.now();
    const last = lastPositionSaved.current;
    if (!force && last && last.segmentId === seg.segmentId && now - last.at < 5000 && Math.abs(last.ms - m.positionMs) < 4000) return;
    await emitterRef.current.positionSaved({ manifestId: m.manifestId, segmentId: seg.segmentId, positionMs: Math.round(m.positionMs) });
    lastPositionSaved.current = { at: now, segmentId: seg.segmentId, ms: m.positionMs };
  }, []);

  const wasPlaying = useRef(false);
  useEffect(() => {
    if (model && !model.playing && model.positionMs > 0) void savePosition(wasPlaying.current).catch(() => undefined);
    wasPlaying.current = !!model?.playing;
  }, [model, savePosition]);

  useEffect(() => {
    const onVisibility = () => { if (document.visibilityState === 'hidden') void savePosition(true).catch(() => undefined); };
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, [savePosition]);

  useEffect(() => {
    if (!controlRef) return;
    controlRef.current = {
      savePosition: () => savePosition(true),
      seekSentence: (sentenceId) => dispatch({ type: 'seekSentence', sentenceId }),
      play: () => dispatch({ type: 'play' }),
      replay: () => dispatch({ type: 'replay' }),
      setTranscriptMode: (mode) => dispatch({ type: 'setTranscriptMode', mode }),
      revealForHandoff: async () => {
        const machine = machineRef.current;
        if (machine && !isTranscriptVisible(machine.state, machine.state.segmentIndex)) dispatch({ type: 'revealTranscript' });
        await queue.current;
        if (machineRef.current) dispatch({ type: 'setTranscriptMode', mode: 'visible' });
        await queue.current;
      },
    };
    return () => { controlRef.current = null; };
  }, [controlRef, dispatch, savePosition]);

  // Leaving mid-sentence is an abandonment; always stop the audio.
  useEffect(() => () => {
    const machine = machineRef.current;
    const audio = audioRef.current;
    if (machine) {
      const m = machine.state;
      const seg = m.manifest.segments[m.segmentIndex];
      if (m.started && !m.completed && m.positionMs > 0 && seg) {
        void emitterRef.current.abandoned({ segmentId: seg.segmentId, sentenceIds: seg.sentenceIds }, { speed: m.speed, transcriptVisible: isTranscriptVisible(m, m.segmentIndex) }, Math.round(m.positionMs));
      }
      if (m.positionMs > 0 && seg && m.manifestId) void emitterRef.current.positionSaved({ manifestId: m.manifestId, segmentId: seg.segmentId, positionMs: Math.round(m.positionMs) });
    }
    audio?.pause();
    prefetchRef.current = null;
  }, []);

  // Tell the parent which sentence is playing and what to conceal.
  const current = model ? segments.get(model.manifest.segments[model.segmentIndex]?.segmentId ?? '') : undefined;
  const concealed = useCallback((sentenceId: string) => {
    const m = machineRef.current?.state;
    if (!m) return false;
    const i = m.manifest.segments.findIndex((s) => s.sentenceIds.includes(sentenceId));
    return i < 0 ? false : !isTranscriptVisible(m, i);
  }, []);
  useEffect(() => {
    if (!model) return;
    onChange?.({
      segment: current,
      state: { manifestId: model.manifestId, segmentIndex: model.segmentIndex, playing: model.playing, speed: model.speed, transcriptMode: model.transcriptMode, loop: model.loop },
      concealed,
    });
    // onChange is intentionally not a dependency: a new callback identity must not re-announce.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [model, current, concealed]);

  // ── keyboard: R replays from anywhere outside a text field; the rest only inside the player ──
  useEffect(() => {
    if (status !== 'ready') return;
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.key.toLowerCase() === 'r' && !isEditableTarget(e.target)) { e.preventDefault(); dispatch({ type: 'replay' }); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [status, dispatch]);

  const onPlayerKey = (e: ReactKeyboardEvent) => {
    if (isEditableTarget(e.target) || (e.target as HTMLElement).tagName === 'BUTTON') return;
    if (e.key === ' ') { e.preventDefault(); dispatch({ type: 'toggle' }); }
    else if (e.key === 'ArrowRight') { e.preventDefault(); dispatch({ type: 'next' }); }
    else if (e.key === 'ArrowLeft') { e.preventDefault(); dispatch({ type: 'prev' }); }
  };

  // ── render ──
  const currentSource = model?.manifest.segments[model.segmentIndex]?.sourceType;
  const isFixture = (currentSource === 'generated-tts' && voice?.providerId === 'fixture') || (!currentSource && !voice && fixtureAsset);
  const fallbackAccent = voice && voice.actualLocale !== voice.requestedLocale;

  const stateProp = audio?.state ?? status;
  if (status === 'loading') return <section className="player" aria-label="Audio player"><p className="card__note" role="status">Loading audio…</p></section>;
  if (status === 'error') return (
    <section className="player" aria-label="Audio player" data-audio-state="error">
      <p role="alert" className="error">Audio problem: {error}</p>
      <button type="button" className="btn btn--small btn--quiet" onClick={() => { void prepare(); }}>Try again</button>
    </section>
  );
  if (status === 'unavailable') return (
    <section className="player" aria-label="Audio player" data-audio-state="unavailable">
      <p className="note" role="status" data-testid="audio-unavailable">{unavailableLine(audio?.reason)}</p>
    </section>
  );
  if (status === 'generating') return (
    <section className="player" aria-label="Audio player" data-audio-state="generating">
      <p className="card__note" role="status" data-testid="audio-generating">
        Preparing audio… {audio?.readySegments ?? 0} of {audio?.totalSegments ?? 0} sentences ready.
      </p>
      {audio?.reason && /retried|error/i.test(audio.reason) && <p className="card__note">{audio.reason}</p>}
    </section>
  );
  if (status === 'failed') return (
    <section className="player" aria-label="Audio player" data-audio-state="failed">
      <p role="alert" className="error" data-testid="audio-failed">
        Audio could not be made. {audio?.reason ?? ''}
      </p>
      <button type="button" className="btn btn--small btn--quiet" onClick={() => { void prepare(); }}>Try again</button>
    </section>
  );
  if (status === 'stale') return (
    <section className="player" aria-label="Audio player" data-audio-state="stale">
      <p className="note note--warn" role="status" data-testid="audio-stale">
        This audio is for an earlier version of the text, so it is not played. {audio?.reason ?? 'Regenerate it to hear what is written now.'}
      </p>
      <button type="button" className="btn btn--small" onClick={() => { void prepare(); }}>Regenerate audio</button>
    </section>
  );
  if (status === 'none' || status === 'preparing' || !model) return (
    <section className="player" aria-label="Audio player" data-audio-state={stateProp}>
      {allowSynthesis
        ? <button type="button" className="btn btn--small" disabled={status === 'preparing'} onClick={() => { void prepare(); }}>
          {status === 'preparing' ? 'Preparing audio…' : 'Prepare audio for this text'}
        </button>
        : <p className="note" role="status">No recording is attached to this text yet. Add a recording with its rights details in GoListen.</p>}
      <p className="card__note" data-testid="audio-privacy">
        {audio?.isSpeech
          ? `The sentences of this text are sent to the speech provider (${audio.providerId ?? 'your speech provider'}) to make the audio; the audio is then kept on this device.`
          : 'This placeholder audio is generated on this device; nothing is uploaded.'}
      </p>
    </section>
  );

  const segs = model.manifest.segments;
  const readyCount = segs.filter((s) => s.ready).length;
  const hasParagraphs = new Set(segs.map((s) => s.paragraphIndex).filter((p) => p !== undefined)).size > 1;
  const showTranscript = current ? isTranscriptVisible(model, model.segmentIndex) : false;
  const activePlayerSegment = model.manifest.segments[model.segmentIndex];
  const seekStart = activePlayerSegment?.rangeMs?.startMs ?? 0;
  const seekEnd = activePlayerSegment?.rangeMs?.endMs ?? activePlayerSegment?.durationMs ?? 0;
  const skip = (delta: number) => dispatch({ type: 'seekPosition', ms: model.positionMs + delta });
  const endAtObservedPosition = (mediaTimeSeconds: number) => {
    const observedPositionMs = mediaTimeSeconds * 1000;
    if (Number.isFinite(observedPositionMs) && observedPositionMs >= 0) dispatch({ type: 'ended', observedPositionMs });
    else dispatch({ type: 'ended' });
  };

  return (
    <section className="player" aria-label="Audio player" data-audio-state={stateProp} onKeyDown={onPlayerKey}>
      <audio
        ref={audioRef}
        preload="auto"
        onEnded={(e) => endAtObservedPosition(e.currentTarget.currentTime)}
        onError={() => dispatch({ type: 'playbackError' })}
        onTimeUpdate={(e) => {
          // Muted or zero-volume playback is not hearing: the machine counts a tick only while the element is audible.
          dispatch({ type: 'position', ms: e.currentTarget.currentTime * 1000, observedAtMs: performance.now(), muted: e.currentTarget.muted, volume: e.currentTarget.volume });
          const m = machineRef.current?.state;
          const seg = m?.manifest.segments[m.segmentIndex];
          if (seg?.rangeMs && e.currentTarget.currentTime * 1000 >= seg.rangeMs.endMs - 40) endAtObservedPosition(e.currentTarget.currentTime);
          const now = Date.now();
          if (m && seg && m.manifestId && m.positionMs > 0 && (!lastPositionSaved.current || lastPositionSaved.current.segmentId !== seg.segmentId || now - lastPositionSaved.current.at >= 5000)) {
            lastPositionSaved.current = { at: now, segmentId: seg.segmentId, ms: m.positionMs };
            void emitterRef.current.positionSaved({ manifestId: m.manifestId, segmentId: seg.segmentId, positionMs: Math.round(m.positionMs) });
          }
        }}
      />
      <div className="player__bar" role="group" aria-label="Playback controls">
        <IconBtn label="Previous sentence" onClick={() => dispatch({ type: 'prev' })}>{I.prev}</IconBtn>
        <IconBtn label={model.playing ? 'Pause' : 'Play'} active={model.playing} className="iconbtn--primary play" onClick={() => dispatch({ type: 'toggle' })}>
          {model.playing ? I.pause : I.play}
        </IconBtn>
        <IconBtn label="Next sentence" onClick={() => dispatch({ type: 'next' })}>{I.next}</IconBtn>
        <IconBtn label="Replay sentence (R)" className="player__replay" onClick={() => dispatch({ type: 'replay' })}>
          {I.replay}<span className="kbd" aria-hidden="true">R</span>
        </IconBtn>
        <IconBtn label="Loop sentence" active={model.loop.unit === 'sentence'} onClick={() => dispatch({ type: 'setLoop', unit: model.loop.unit === 'sentence' ? 'none' : 'sentence' })}>{I.loop}</IconBtn>
        {hasParagraphs && (
          <>
            <IconBtn label="Previous paragraph" onClick={() => dispatch({ type: 'seekParagraph', delta: -1 })}>{I.prevPara}</IconBtn>
            <IconBtn label="Next paragraph" onClick={() => dispatch({ type: 'seekParagraph', delta: 1 })}>{I.nextPara}</IconBtn>
          </>
        )}
        <span className="player__status" aria-live="polite">
          {current?.sentenceIds.length === 1 ? `Sentence ${model.segmentIndex + 1} of ${segs.length}` : `Passage segment ${model.segmentIndex + 1} of ${segs.length}`}
          {model.positionMs > 0 && !model.started && ' · resume position saved'}
          {model.speed < 0.999 && ' · slowed'}
          {readyCount < segs.length && ` · ${segs.length - readyCount} without audio`}
          {model.loop.unit === 'sentence' && ' · looping'}
        </span>
        {isFixture && <span className="chip chip--wine" data-testid="fixture-badge">fixture audio — not speech</span>}
        {audio?.state === 'preview-only' && !isFixture && <span className="chip chip--wine" data-testid="preview-audio-badge">
          {activePlayerSegment?.sourceType === 'human-recording' || activePlayerSegment?.sourceType === 'licensed-recording' ? 'Unreviewed recording' : 'Unreviewed audio'}
        </span>}
        {audio?.state === 'preview-only' && isFixture && <span className="chip chip--wine" data-testid="preview-audio-badge">fixture audio — not counted</span>}
        {activePlayerSegment?.sourceType && <span className="chip" data-testid="audio-source-kind">
          {activePlayerSegment.sourceType === 'human-recording' || activePlayerSegment.sourceType === 'licensed-recording' ? 'Human recording' : activePlayerSegment.sourceType === 'generated-tts' ? 'Synthetic audio' : activePlayerSegment.sourceType}
        </span>}
        {activePlayerSegment?.narratorOrVoiceId && <span className="chip" data-testid="audio-narrator">{activePlayerSegment.narratorOrVoiceId}</span>}
      </div>
      {seekEnd > seekStart && <div className="player__seek" role="group" aria-label="Seek current listening unit">
        <button type="button" className="btn btn--small btn--quiet" aria-label="Skip back 10 seconds" onClick={() => skip(-10000)}>−10s</button>
        <input
          type="range" min={seekStart} max={seekEnd} step={250} value={Math.max(seekStart, Math.min(seekEnd, model.positionMs))}
          aria-label="Seek within current listening unit"
          aria-valuetext={`${Math.floor(model.positionMs / 1000)} seconds`}
          onChange={(e) => dispatch({ type: 'seekPosition', ms: Number(e.target.value) })}
        />
        <button type="button" className="btn btn--small btn--quiet" aria-label="Skip forward 10 seconds" onClick={() => skip(10000)}>+10s</button>
      </div>}
      {audio?.state === 'failed' && (
        <div className="note note--warn" role="status" data-testid="audio-partial">
          <p>{audio.reason ?? `${audio.readySegments} of ${audio.totalSegments} sentences ready; ${audio.failedSegments} failed.`}</p>
          <button type="button" className="btn btn--small btn--quiet" onClick={() => { void prepare(); }}>Try the missing sentences again</button>
        </div>
      )}
      {audio?.state === 'preview-only' && !isFixture && (
        <p className="note note--warn" role="note" data-testid="preview-audio-note">
          {activePlayerSegment?.sourceType === 'human-recording' || activePlayerSegment?.sourceType === 'licensed-recording'
            ? 'You can record listening exposure, but this recording has not passed human review for listening evidence.'
            : activePlayerSegment?.audioKind === 'synthetic'
              ? 'Synthetic speech: practice only, not counted as listening.'
              : 'You can record listening exposure, but this audio has not passed quality review for listening evidence.'}
        </p>
      )}
      {audio?.state === 'preview-only' && isFixture && (
        <p className="note note--warn" role="note" data-testid="preview-audio-note">Fixture audio is not speech and does not count toward your listening progress.</p>
      )}
      {audio?.state === 'ready' && audio.evidenceEligible === false && activePlayerSegment?.audioKind === 'synthetic' && (
        <p className="note" role="note" data-testid="practice-audio-note">Synthetic speech: practice only, not counted as listening.</p>
      )}

      <details className="player__more">
        <summary className="btn btn--small btn--quiet">Speed &amp; transcript</summary>
        <div className="sheet__row">
          <label htmlFor={speedId}>Speed {model.speed.toFixed(2)}×</label>
          <input
            id={speedId}
            type="range" min={MIN_SPEED} max={MAX_SPEED} step={0.05} value={model.speed}
            aria-label="Playback speed" aria-valuetext={`${model.speed.toFixed(2)} times`}
            onChange={(e) => dispatch({ type: 'setSpeed', speed: clampSpeed(Number(e.target.value)) })}
          />
        </div>
        <div className="sheet__row sheet__row--top">
          <span className="label">Transcript</span>
          <div className="segmented" role="group" aria-label="Transcript mode">
            {(Object.keys(TRANSCRIPT_LABELS) as TranscriptMode[]).map((m) => (
              <button key={m} type="button" aria-pressed={model.transcriptMode === m} onClick={() => dispatch({ type: 'setTranscriptMode', mode: m })}>{TRANSCRIPT_LABELS[m]}</button>
            ))}
          </div>
        </div>
        {isFixture && <p className="note note--warn">This voice is placeholder audio, not speech. It is here so the player can be tried before a real voice is set up.</p>}
        {voice && currentSource !== 'human-recording' && currentSource !== 'licensed-recording' && (
          <p className="card__note" data-testid="voice-info">
            {voice.providerId} · {voice.voiceId} · {voice.actualLocale}
            {fallbackAccent ? ` (fallback accent; wanted ${voice.requestedLocale})` : ''}
            {voice.approved ? '' : ' · voice not yet reviewed'}
          </p>
        )}
      </details>

      {unplayable && <p className="note note--warn" role="status">Audio for this sentence is not ready.</p>}
      {manifest && !manifest.complete && (
        <button type="button" className="btn btn--small btn--quiet" onClick={() => { void prepare(); }}>Prepare the missing audio</button>
      )}

      {current && (
        <div className="transcript" aria-label="Transcript">
          {showTranscript ? (
            <p lang={current.lang}>{current.displayText}</p>
          ) : model.transcriptMode === 'visible' ? null : (
            <>
              <button type="button" className="btn btn--small btn--quiet" onClick={() => dispatch({ type: 'revealTranscript' })}>Show this sentence</button>
              <p className="card__note">
                {model.transcriptMode === 'reveal-after' ? 'It also appears once it has played.' : model.transcriptMode === 'reveal-current' ? 'It appears once you start it.' : 'Transcript hidden.'}
              </p>
            </>
          )}
        </div>
      )}
    </section>
  );
}
