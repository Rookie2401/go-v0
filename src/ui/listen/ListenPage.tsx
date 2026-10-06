import { useEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import type { LanguageCode, Text } from '../../core';
import { useApp } from '../context';
import { isTestimonyText, nameOfLang, textPath } from '../format';
import { BackLink, Topbar } from '../ui';
import { useListenEnabled } from '../reader/useListen';
import { Player } from '../player/Player';
import type { PlayerControls } from '../player/Player';
import { listeningProgress } from '../../golisten/progress';
import type { ListeningProgress } from '../../golisten/progress';

type Gate = { state: 'loading' } | { state: 'ok'; text: Text } | { state: 'missing' } | { state: 'language'; lang: LanguageCode } | { state: 'unpublished' };
type ListenMode = 'only' | 'read-listen' | 'listen-first';

/** A listening session stays outside Reader until the learner explicitly opens text support. */
export function ListenPage() {
  const { textId = '' } = useParams();
  const { store, bus, lang, golisten, userId } = useApp();
  const listenEnabled = useListenEnabled();
  const location = useLocation();
  const navigate = useNavigate();
  const [gate, setGate] = useState<Gate>({ state: 'loading' });
  const [mode, setMode] = useState<ListenMode>('only');
  const [audioState, setAudioState] = useState<'loading' | 'ready' | 'unavailable'>('loading');
  const [audioReason, setAudioReason] = useState('');
  const [progress, setProgress] = useState<ListeningProgress | null>(null);
  const [handoffError, setHandoffError] = useState<string | null>(null);
  const [handoffPending, setHandoffPending] = useState(false);
  const controls = useRef<PlayerControls | null>(null);

  useEffect(() => {
    if (!listenEnabled) return;
    let live = true;
    setGate({ state: 'loading' });
    const requestedMode = (location.state as { mode?: unknown } | null)?.mode;
    setMode(requestedMode === 'read-listen' ? 'read-listen' : 'only'); setAudioState('loading');
    void (async () => {
      const text = await store.texts.get(textId);
      const corpus = text ? await store.corpora.get(text.corpusId) : undefined;
      let next: Gate;
      if (!text || (text.listeningAssessmentId !== undefined || text.readingAssessmentId !== undefined) || isTestimonyText(text, corpus ? new Map([[corpus.id, corpus]]) : undefined)) next = { state: 'missing' };
      else if (text.lang !== lang) next = { state: 'language', lang: text.lang };
      else if (text.published !== true) next = { state: 'unpublished' };
      else next = { state: 'ok', text };
      if (!live) return;
      setGate(next);
      if (next.state === 'ok') {
        const status = await golisten.audioStatus(next.text.id);
        if (!live) return;
        const playable = status.state === 'ready' || status.state === 'preview-only';
        setAudioState(playable ? 'ready' : 'unavailable');
        setAudioReason(status.reason ?? 'No approved recording is available for this passage yet.');
        const p = await listeningProgress(store, userId, next.text.id);
        if (live) setProgress(p);
      }
    })().catch(() => { if (live) { setAudioState('unavailable'); setAudioReason('Audio could not be checked.'); setGate((g) => g.state === 'loading' ? { state: 'missing' } : g); } });
    return () => { live = false; };
  }, [store, golisten, textId, lang, userId, location.key, location.state, listenEnabled]);

  // Refresh only when this text's completed exposure is recorded. Position ticks are navigation
  // checkpoints and should never trigger an event-log scan or be presented as heard progress.
  useEffect(() => bus.subscribe((event) => {
    if (event.type !== 'AudioSegmentCompleted' || event.userId !== userId || event.textId !== textId) return;
    void listeningProgress(store, userId, textId).then(setProgress).catch(() => undefined);
  }), [bus, store, userId, textId]);

  const header = <Topbar title="GoListen" left={<BackLink to="/listen" label="Listening" />} />;
  if (!listenEnabled) return <div>
    <Topbar title="GoListen" left={<BackLink to="/" label="Home" />} />
    <main className="page page--narrow">
      <p role="status">GoListen is not available in this version.</p>
      <p className="home__links"><Link to="/">Home</Link><Link to="/read">GoLearn reading</Link></p>
    </main>
  </div>;
  if (gate.state === 'loading') return <div>{header}<div className="page"><p role="status" className="muted">Opening listening passage…</p></div></div>;
  if (gate.state !== 'ok') {
    if (gate.state === 'missing') return <div>{header}<div className="page"><p role="alert">This passage is not available for listening.</p></div></div>;
    if (gate.state === 'language') return <div>{header}<div className="page"><p role="alert">This passage is in {nameOfLang(gate.lang)}, not the language you are learning. Switch team in Settings to listen.</p></div></div>;
    return <div>{header}<div className="page" data-testid="listen-unpublished"><p role="alert">This passage is not published for listening.</p><p className="card__note">Preview mode in Settings can show unreviewed material.</p></div></div>;
  }
  const text = gate.text;

  const transcriptMode = mode === 'read-listen' ? 'visible' : mode === 'listen-first' ? 'reveal-after' : 'hidden';
  const choose = (next: ListenMode) => {
    setMode(next);
    controls.current?.setTranscriptMode(next === 'read-listen' ? 'visible' : next === 'listen-first' ? 'reveal-after' : 'hidden');
  };
  const openSupport = async () => {
    if (handoffPending) return;
    setHandoffPending(true);
    setHandoffError(null);
    try {
      // Persist where the learner paused before moving to reading. Record the transcript reveal
      // before GoLearn's Reader records the text opening.
      await controls.current?.savePosition();
      await controls.current?.revealForHandoff();
      navigate(textPath(text));
    } catch (error) {
      setHandoffError(error instanceof Error ? error.message : 'Could not save your listening position. Try again.');
    } finally {
      setHandoffPending(false);
    }
  };
  const passageLabel = text.kind === 'scripture'
    ? `Scripture passage${text.scripture ? ` · chapter ${text.scripture.chapter}` : text.chapter ? ` · chapter ${text.chapter.index}` : ''}`
    : `Listening passage${text.chapter ? ` · chapter ${text.chapter.index}` : ''}`;

  return <div>
    {header}
    <main className="page page--narrow route-fade" data-testid="golisten-session" data-listen-mode={mode}>
      <h1>{passageLabel}</h1>
      <p className="card__note">Listen before reading. Opening text support starts a GoLearn reading session.</p>
      <div className="segmented" role="group" aria-label="Listening mode">
        <button type="button" aria-pressed={mode === 'only'} onClick={() => choose('only')}>Listen only</button>
        <button type="button" aria-pressed={mode === 'read-listen'} onClick={() => choose('read-listen')}>Read + listen</button>
        <button type="button" aria-pressed={mode === 'listen-first'} onClick={() => choose('listen-first')}>Listen first</button>
      </div>
      {audioState === 'loading' && <p role="status" className="muted">Checking this recording…</p>}
      {progress && <div className="card__note" data-testid="listen-progress">
        <p>Heard: {progress.completedExposureSentences} of {progress.sentencesTotal} sentences. Hearing a passage does not by itself show understanding.</p>
        {progress.masteryEligibleSentences === 0 && <p>This recording has not been reviewed for listening evidence.</p>}
        <details><summary>About listening progress</summary>
          <p>Exposure counts only after at least 80% of a sentence was audibly played. A separate audio-quality and source review determines whether listening evidence is eligible. Neither measure is a comprehension score.</p>
          <p>Quality-eligible sentences: {progress.masteryEligibleSentences}. Sources: {progress.sources.length ? progress.sources.join(', ') : 'none recorded'}.</p>
        </details>
      </div>}
      {audioState === 'unavailable' && <div className="note" role="status"><p>{audioReason}</p><p>GoListen does not create speech unless the text and recording rights permit it. You can still <Link to={textPath(text)}>read this passage</Link>.</p></div>}
      {audioState === 'ready' && <Player key={text.id} textId={text.id} controlRef={controls} defaultTranscriptMode={transcriptMode} allowSynthesis={false} />}
      {handoffError && <p role="alert" className="error" data-testid="listen-handoff-error">{handoffError}</p>}
      {audioState === 'ready' && <button type="button" className="btn btn--small btn--quiet" disabled={handoffPending} onClick={() => { void openSupport(); }}>{handoffPending ? 'Saving listening position…' : 'Open text and word support'}</button>}
      <p className="home__links"><Link to="/listen">Listening library</Link><Link to={text.kind === 'scripture' ? '/scripture' : '/read'}>Back to {text.kind === 'scripture' ? 'Scripture' : 'GoLearn'}</Link></p>
    </main>
  </div>;
}
