/**
 * Rehearsal for a saved testimony version: per-sentence audio, whole-testimony playback, a shadowing
 * counter, and microphone recording (when MediaRecorder exists). No pronunciation scoring — you record,
 * you listen back, you decide.
 *
 * TODO(integration): recordings are stored through `store.assets` + a `recordings` row (the GoListen
 * contract has no recording method). GoTell's sentence audio contextId is assumed to be
 * `<revisionId>#<sentenceIndex>`; ensureSentenceAudio is idempotent by cache key, so a different
 * convention only costs one extra segment.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type {
  AudioPlayed, AudioSegment, AudioSegmentCompleted, ShadowingAttempt, TestimonyRevision, UserRecording, UserRecordingCreated,
} from '../../core';
import { ids } from '../../core';
import { useApp } from '../context';
import { makeEmitter, uniqueKey } from '../events';
import { usePref } from '../prefs';
import { createAudio } from '../player/audio';
import { recordingSupported, startRecording } from './recorder';
import type { ActiveRecording } from './recorder';

const contextIdFor = (revisionId: string, index: number) => `${revisionId}#${index}`;

export function RevisionAudio({ revision }: { revision: TestimonyRevision }) {
  const { store, bus, golisten, userId, lang, session } = useApp();
  const emitter = useMemo(() => makeEmitter({ bus, userId, lang, session }), [bus, userId, lang, session]);
  const [speed] = usePref('speed');

  const [message, setMessage] = useState<string | null>(null);
  const [playingIndex, setPlayingIndex] = useState<number | null>(null);
  const [wholePlaying, setWholePlaying] = useState(false);
  const [fixture, setFixture] = useState(false);
  const [shadow, setShadow] = useState<Record<number, number>>({});
  const [recordings, setRecordings] = useState<Record<number, Array<{ rec: UserRecording; url?: string }>>>({});
  const [recordingIndex, setRecordingIndex] = useState<number | null>(null);

  const segmentsRef = useRef(new Map<number, AudioSegment>());
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const resolveRef = useRef<((completed: boolean) => void) | null>(null);
  const wholeToken = useRef(0);
  const activeRecording = useRef<ActiveRecording | null>(null);
  const supported = recordingSupported();

  // Existing shadowing counts (from the event log) and recordings for this version.
  useEffect(() => {
    let live = true;
    void (async () => {
      const events = await bus.history({ userId, types: ['ShadowingAttempt'] });
      const counts: Record<number, number> = {};
      revision.sentences.forEach((s) => {
        const ctx = contextIdFor(revision.id, s.index);
        counts[s.index] = events.filter((e) => e.type === 'ShadowingAttempt' && e.textId === ctx).length;
      });
      const recs = (await store.recordings.where('userId', userId)).filter((r) => r.target.testimonyRevisionId === revision.id);
      const grouped: Record<number, Array<{ rec: UserRecording; url?: string }>> = {};
      for (const rec of recs.sort((a, b) => a.attempt - b.attempt)) {
        const idx = rec.target.testimonySentenceIndex ?? 0;
        (grouped[idx] ??= []).push({ rec, url: await store.assets.url(rec.assetId) });
      }
      if (live) { setShadow(counts); setRecordings(grouped); }
    })();
    return () => { live = false; };
  }, [bus, store, userId, revision]);

  const stopAudio = useCallback(() => {
    wholeToken.current += 1;
    audioRef.current?.pause();
    audioRef.current = null;
    resolveRef.current?.(false);
    resolveRef.current = null;
    setPlayingIndex(null);
    setWholePlaying(false);
  }, []);
  useEffect(() => stopAudio, [stopAudio]);
  useEffect(() => () => { activeRecording.current?.stop().catch(() => undefined); }, []);

  const ensureSegment = useCallback(async (index: number): Promise<AudioSegment | undefined> => {
    const cached = segmentsRef.current.get(index);
    if (cached?.assetId) return cached;
    const sentence = revision.sentences.find((s) => s.index === index);
    if (!sentence) return undefined;
    const seg = await golisten.ensureSentenceAudio({ lang, text: sentence.text, ownerId: userId, contextId: contextIdFor(revision.id, index), runNow: true });
    segmentsRef.current.set(index, seg);
    if (seg.assetId) {
      const asset = await golisten.getAsset(seg.assetId);
      if (asset?.generation?.providerId === 'fixture') setFixture(true);
    }
    return seg;
  }, [golisten, lang, userId, revision]);

  const listen = (seg: AudioSegment) => ({
    textId: seg.textId, segmentId: seg.id, sentenceIds: seg.sentenceIds, speed, transcriptVisible: true,
  });

  /** Plays one sentence; resolves true when it played to the end. */
  const playIndex = useCallback(async (index: number): Promise<boolean> => {
    audioRef.current?.pause();
    resolveRef.current?.(false);
    setMessage(null);
    const seg = await ensureSegment(index);
    if (!seg?.assetId) { setMessage('Audio for this sentence is not ready yet.'); return false; }
    const url = await golisten.assetUrl(seg.assetId);
    if (!url) { setMessage('Audio for this sentence is not available.'); return false; }
    const audio = createAudio(url, speed);
    audioRef.current = audio;
    setPlayingIndex(index);
    void emitter.emit<AudioPlayed>('testimony', { type: 'AudioPlayed', ...listen(seg), dedupeKey: uniqueKey('audioplayed') });
    return new Promise<boolean>((resolve) => {
      resolveRef.current = resolve;
      audio.onended = () => {
        void emitter.emit<AudioSegmentCompleted>('testimony', { type: 'AudioSegmentCompleted', ...listen(seg), replayCount: 0, revealedTranscript: true, revealedTranslation: false, dedupeKey: uniqueKey('audiocompleted') });
        resolveRef.current = null;
        setPlayingIndex((p) => (p === index ? null : p));
        resolve(true);
      };
      const p = audio.play() as Promise<void> | undefined;
      p?.catch(() => { resolveRef.current = null; setPlayingIndex(null); setMessage('The browser blocked playback. Press play again.'); resolve(false); });
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ensureSegment, golisten, emitter, speed]);

  const playWhole = useCallback(async () => {
    const token = ++wholeToken.current;
    setWholePlaying(true);
    for (const s of revision.sentences) {
      if (wholeToken.current !== token) return;
      const completed = await playIndex(s.index);
      if (!completed || wholeToken.current !== token) break;
    }
    if (wholeToken.current === token) { setWholePlaying(false); setPlayingIndex(null); }
  }, [revision, playIndex]);

  const countShadow = useCallback(async (index: number) => {
    const seg = await ensureSegment(index);
    if (!seg) return;
    const attempt = (shadow[index] ?? 0) + 1;
    setShadow((prev) => ({ ...prev, [index]: attempt }));
    await emitter.emit<ShadowingAttempt>('testimony', { type: 'ShadowingAttempt', ...listen(seg), attempt, dedupeKey: uniqueKey('shadow') });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ensureSegment, emitter, shadow, speed]);

  const toggleRecord = useCallback(async (index: number) => {
    setMessage(null);
    if (recordingIndex === index && activeRecording.current) {
      const active = activeRecording.current;
      activeRecording.current = null;
      setRecordingIndex(null);
      try {
        const { bytes, mime } = await active.stop();
        const assetId = await store.assets.put(bytes, mime);
        const sentence = revision.sentences.find((s) => s.index === index)!;
        const attempt = (recordings[index]?.length ?? 0) + 1;
        const rec: UserRecording = {
          id: `rec:${ids.learnerItem(userId, `${revision.id}#${index}`)}:${attempt}`,
          userId, lang, assetId, attempt, createdAt: new Date().toISOString(),
          target: { testimonyRevisionId: revision.id, testimonySentenceIndex: index, text: sentence.text },
        };
        await store.recordings.put(rec);
        const url = await store.assets.url(assetId);
        setRecordings((prev) => ({ ...prev, [index]: [...(prev[index] ?? []), { rec, url }] }));
        await emitter.emit<UserRecordingCreated>('testimony', { type: 'UserRecordingCreated', recordingId: rec.id, targetText: sentence.text, testimonyRevisionId: revision.id, dedupeKey: `recording:${rec.id}` });
        await countShadow(index);
      } catch (e) {
        setMessage(`Could not save the recording: ${e instanceof Error ? e.message : String(e)}`);
      }
      return;
    }
    if (activeRecording.current) return; // one at a time
    stopAudio();
    try {
      activeRecording.current = await startRecording();
      setRecordingIndex(index);
    } catch (e) {
      setMessage(`Microphone unavailable: ${e instanceof Error ? e.message : String(e)}`);
    }
  }, [recordingIndex, recordings, store, revision, userId, lang, emitter, countShadow, stopAudio]);

  return (
    <section className="rehearse" aria-label="Listen and rehearse">
      <div className="rehearse-head">
        <h3>Listen and rehearse — version {revision.number}</h3>
        {fixture && <span className="badge badge-warn" data-testid="fixture-badge">fixture audio — not speech</span>}
      </div>
      <div className="actions">
        {wholePlaying
          ? <button type="button" className="btn-quiet" onClick={stopAudio}>Stop</button>
          : <button type="button" className="btn-primary" onClick={() => { void playWhole(); }}>Play whole testimony</button>}
      </div>
      <p className="muted small">Play a sentence, say it along with the voice, then count the attempt or record yourself and listen back.</p>
      {message && <p role="status" className="small">{message}</p>}
      <ol className="rehearse-list">
        {revision.sentences.map((s) => (
          <li key={s.index} className={playingIndex === s.index ? 'is-active' : undefined}>
            <span className="rehearse-text" lang={lang}>{s.text}</span>
            <span className="rehearse-actions">
              <button type="button" className="mini" aria-label={`Play sentence ${s.index + 1}`} onClick={() => { void playIndex(s.index); }}>▶</button>
              <button type="button" className="mini" aria-label={`Count a shadowing attempt for sentence ${s.index + 1}`} onClick={() => { void countShadow(s.index); }}>shadowed</button>
              <span className="small muted" aria-label={`Shadowed ${shadow[s.index] ?? 0} times`} data-testid={`shadow-${s.index}`}>{shadow[s.index] ?? 0}×</span>
              {supported ? (
                <button type="button" className="mini" aria-pressed={recordingIndex === s.index} aria-label={recordingIndex === s.index ? `Stop recording sentence ${s.index + 1}` : `Record sentence ${s.index + 1}`} onClick={() => { void toggleRecord(s.index); }}>
                  {recordingIndex === s.index ? '■ stop' : '● record'}
                </button>
              ) : null}
            </span>
            {(recordings[s.index] ?? []).map(({ rec, url }) => (
              <span key={rec.id} className="take small muted">
                take {rec.attempt} {url && <audio controls preload="none" src={url} aria-label={`Your recording, take ${rec.attempt}`} />}
              </span>
            ))}
          </li>
        ))}
      </ol>
      {!supported && <p className="muted small">Recording is not available in this browser; playback and counting still work.</p>}
    </section>
  );
}
