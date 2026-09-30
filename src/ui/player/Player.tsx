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
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { KeyboardEvent as ReactKeyboardEvent, MutableRefObject } from 'react';
import type { AudioManifest, AudioSegment, PlayerState, VoiceConfig } from '../../core';
import {
  MAX_SPEED, MIN_SPEED, PlayerMachine, buildPlayerManifest, clampSpeed, emitPlayerEffects, isTranscriptVisible, listeningEmitter,
} from '../../golisten';
import type { PlayerEffect, PlayerManifestInput, PlayerModel, TranscriptMode } from '../../golisten';
import { useApp } from '../context';
import { setPref, usePref } from '../prefs';
import { configureAudio, isEditableTarget } from './audio';

export interface PlayerChange {
  segment?: AudioSegment;
  state: PlayerState;
  /** Whether a sentence's text should currently be hidden (listening-first transcript modes). */
  concealed: (sentenceId: string) => boolean;
}

/** Imperative handle for a host page (testimony rehearsal): jump to a sentence, play, replay. */
export interface PlayerControls {
  seekSentence(sentenceId: string): void;
  play(): void;
  replay(): void;
}

export interface PlayerProps {
  textId: string;
  onChange?: (info: PlayerChange) => void;
  controlRef?: MutableRefObject<PlayerControls | null>;
}

type Status = 'loading' | 'none' | 'preparing' | 'ready' | 'error';

const TRANSCRIPT_LABELS: Record<TranscriptMode, string> = {
  visible: 'Show text',
  hidden: 'Listen only (hide text)',
  'reveal-current': 'Tap to reveal',
  'reveal-after': 'Reveal after playing',
};

/** The parts of the model that change what is on screen (position ticks alone do not). */
const viewKey = (m: PlayerModel) =>
  [m.segmentIndex, m.playing, m.speed, m.transcriptMode, m.revealed.join(','), m.started, m.completed, m.finished, m.loop.unit, m.manifest.segments.length, m.manifest.segments.filter((s) => s.ready).length].join('|');

export function Player({ textId, onChange, controlRef }: PlayerProps) {
  const { store, bus, golisten, userId, lang, session } = useApp();
  const emitter = useMemo(() => listeningEmitter(bus, { userId, lang, session, textId }), [bus, userId, lang, session, textId]);

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
  const initialPrefs = useRef({ speed: speedPref, transcriptMode: transcriptPref });

  const machineRef = useRef<PlayerMachine | null>(null);
  const lastKey = useRef('');
  const audioRef = useRef<HTMLAudioElement>(null);
  const urlCache = useRef(new Map<string, string | undefined>());
  const prefetchRef = useRef<HTMLAudioElement | null>(null);
  const queue = useRef<Promise<void>>(Promise.resolve());
  const emitterRef = useRef(emitter);
  emitterRef.current = emitter;

  const urlForAsset = useCallback(async (assetId: string | undefined) => {
    if (!assetId) return undefined;
    if (urlCache.current.has(assetId)) return urlCache.current.get(assetId);
    const url = await golisten.assetUrl(assetId);
    urlCache.current.set(assetId, url);
    return url;
  }, [golisten]);

  // ── perform the machine's effects against the <audio> element, in order ──
  const perform = useCallback(async (m: PlayerModel, effects: PlayerEffect[]) => {
    const audio = audioRef.current;
    if (audio) {
      for (const fx of effects) {
        switch (fx.type) {
          case 'load': {
            const url = await urlForAsset(fx.assetId);
            if (!url) { setUnplayable(true); machineRef.current?.dispatch({ type: 'pause' }); break; }
            setUnplayable(false);
            if (audio.dataset.src !== url) { audio.src = url; audio.dataset.src = url; }
            audio.currentTime = 0;
            break;
          }
          case 'setRate': configureAudio(audio, fx.rate); break;
          case 'seek': audio.currentTime = fx.ms / 1000; break;
          case 'play': {
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
    await emitPlayerEffects(emitterRef.current, m, effects);
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
    const m = await golisten.getManifest(textId);
    setManifest(m);
    if (!m || m.segmentIds.length === 0) { machineRef.current = null; setModel(null); setStatus('none'); return; }
    const input = await buildPlayerManifest(store, m);
    const rows = (await Promise.all(m.segmentIds.map((id) => golisten.getSegment(id)))).filter((s): s is AudioSegment => !!s);
    setSegments(new Map(rows.map((s) => [s.id, s])));
    if (machineRef.current && machineRef.current.state.manifest.manifestId === input.manifestId) {
      machineRef.current.dispatch({ type: 'manifestUpdated', manifest: input });
    } else {
      attach(input);
    }
    const v = await store.voices.get(m.voiceConfigId);
    setVoice(v);
    if (!v) {
      const firstAsset = rows.find((r) => r.assetId)?.assetId;
      const a = firstAsset ? await golisten.getAsset(firstAsset) : undefined;
      setFixtureAsset(a?.generation?.providerId === 'fixture');
    }
    setStatus('ready');
  }, [golisten, store, textId, attach]);

  useEffect(() => {
    let live = true;
    setStatus('loading');
    reload().catch((e: unknown) => { if (live) { setError(e instanceof Error ? e.message : String(e)); setStatus('error'); } });
    return () => { live = false; };
  }, [reload]);

  const prepare = useCallback(async () => {
    setStatus('preparing');
    setError(null);
    try {
      await golisten.ensureAudio(textId, { runNow: true });
      await reload();
    } catch (e) {
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

  useEffect(() => {
    if (!controlRef) return;
    controlRef.current = {
      seekSentence: (sentenceId) => dispatch({ type: 'seekSentence', sentenceId }),
      play: () => dispatch({ type: 'play' }),
      replay: () => dispatch({ type: 'replay' }),
    };
    return () => { controlRef.current = null; };
  }, [controlRef, dispatch]);

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
  const isFixture = voice?.providerId === 'fixture' || (!voice && fixtureAsset);
  const fallbackAccent = voice && voice.actualLocale !== voice.requestedLocale;

  if (status === 'loading') return <section className="player" aria-label="Audio player"><p className="muted" role="status">Loading audio…</p></section>;
  if (status === 'error') return (
    <section className="player" aria-label="Audio player">
      <p role="alert">Audio problem: {error}</p>
      <button type="button" className="btn-quiet" onClick={() => { void prepare(); }}>Try again</button>
    </section>
  );
  if (status === 'none' || status === 'preparing' || !model) return (
    <section className="player" aria-label="Audio player">
      <button type="button" className="btn-quiet" disabled={status === 'preparing'} onClick={() => { void prepare(); }}>
        {status === 'preparing' ? 'Preparing audio…' : 'Prepare audio for this text'}
      </button>
      <p className="muted small">Audio is generated on this device and cached; nothing is uploaded.</p>
    </section>
  );

  const segs = model.manifest.segments;
  const readyCount = segs.filter((s) => s.ready).length;
  const hasParagraphs = new Set(segs.map((s) => s.paragraphIndex).filter((p) => p !== undefined)).size > 1;
  const showTranscript = current ? isTranscriptVisible(model, model.segmentIndex) : false;

  return (
    <section className="player" aria-label="Audio player" onKeyDown={onPlayerKey}>
      <audio
        ref={audioRef}
        preload="auto"
        onEnded={() => dispatch({ type: 'ended' })}
        onTimeUpdate={(e) => dispatch({ type: 'position', ms: e.currentTarget.currentTime * 1000 })}
      />
      <div className="player-meta">
        {isFixture && <span className="badge badge-warn" data-testid="fixture-badge">fixture audio — not speech</span>}
        {voice && (
          <span className="muted small" data-testid="voice-info">
            {voice.providerId} · {voice.voiceId} · {voice.actualLocale}
            {fallbackAccent ? ` (fallback accent; wanted ${voice.requestedLocale})` : ''}
            {voice.approved ? '' : ' · voice not yet reviewed'}
          </span>
        )}
      </div>

      <div className="player-controls" role="group" aria-label="Playback controls">
        <button type="button" onClick={() => dispatch({ type: 'prev' })} aria-label="Previous sentence">⏮</button>
        <button type="button" className="btn-primary play" onClick={() => dispatch({ type: 'toggle' })} aria-label={model.playing ? 'Pause' : 'Play'} aria-pressed={model.playing}>
          {model.playing ? '⏸' : '▶'}
        </button>
        <button type="button" onClick={() => dispatch({ type: 'next' })} aria-label="Next sentence">⏭</button>
        <button type="button" onClick={() => dispatch({ type: 'replay' })} aria-label="Replay sentence (R)" title="Replay sentence (R)">↺ <span className="kbd">R</span></button>
        <button type="button" aria-pressed={model.loop.unit === 'sentence'} aria-label="Loop sentence" onClick={() => dispatch({ type: 'setLoop', unit: model.loop.unit === 'sentence' ? 'none' : 'sentence' })}>⟲</button>
        {hasParagraphs && (
          <>
            <button type="button" onClick={() => dispatch({ type: 'seekParagraph', delta: -1 })} aria-label="Previous paragraph">¶⏮</button>
            <button type="button" onClick={() => dispatch({ type: 'seekParagraph', delta: 1 })} aria-label="Next paragraph">¶⏭</button>
          </>
        )}
      </div>

      <div className="player-row">
        <label className="tool">
          <span className="muted small">Speed {model.speed.toFixed(2)}×</span>{' '}
          <input
            type="range" min={MIN_SPEED} max={MAX_SPEED} step={0.05} value={model.speed}
            aria-label="Playback speed" aria-valuetext={`${model.speed.toFixed(2)} times`}
            onChange={(e) => dispatch({ type: 'setSpeed', speed: clampSpeed(Number(e.target.value)) })}
          />
        </label>
        <label className="tool">
          <span className="muted small">Transcript</span>{' '}
          <select value={model.transcriptMode} aria-label="Transcript mode" onChange={(e) => dispatch({ type: 'setTranscriptMode', mode: e.target.value as TranscriptMode })}>
            {(Object.keys(TRANSCRIPT_LABELS) as TranscriptMode[]).map((m) => <option key={m} value={m}>{TRANSCRIPT_LABELS[m]}</option>)}
          </select>
        </label>
      </div>

      <p className="player-status small" aria-live="polite">
        Sentence {model.segmentIndex + 1} of {segs.length}
        {readyCount < segs.length && ` · ${segs.length - readyCount} without audio`}
        {model.loop.unit === 'sentence' && ' · looping'}
      </p>
      {unplayable && <p className="muted small" role="status">Audio for this sentence is not ready.</p>}
      {manifest && !manifest.complete && (
        <button type="button" className="btn-quiet" onClick={() => { void prepare(); }}>Prepare the missing audio</button>
      )}

      {current && (
        <div className="transcript" aria-label="Transcript">
          {showTranscript ? (
            <p lang={current.lang}>{current.displayText}</p>
          ) : model.transcriptMode === 'visible' ? null : (
            <>
              <button type="button" className="btn-quiet" onClick={() => dispatch({ type: 'revealTranscript' })}>Show this sentence</button>
              <p className="muted small">
                {model.transcriptMode === 'reveal-after' ? 'It also appears once it has played.' : model.transcriptMode === 'reveal-current' ? 'It appears once you start it.' : 'Transcript hidden.'}
              </p>
            </>
          )}
        </div>
      )}
    </section>
  );
}
