/**
 * Rehearsal for a saved testimony version.
 *
 * Each accepted revision is a private Text (`revision.textId`, kind "testimony"), so its audio is an
 * ordinary manifest: the same `Player` used for every other text gives whole-testimony playback,
 * per-sentence replay (R), loop, speed and transcript modes. Shadowing attempts and recordings are
 * listening events that carry the real `segmentId` / `sentenceIds` from that manifest (through
 * `listeningEmitter`), so GoLearn can fold listening evidence for the learner's own sentences.
 * No pronunciation scoring: you record, you listen back, you decide.
 *
 * TODO(integration): recordings are stored via `store.assets` + a `recordings` row (the GoListen contract
 * has no recording method). Sentence ids are matched to revision sentences through the manifest's
 * `sentenceIds` (the Text's live sentences in order), falling back to position.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { AppStore, AudioSegment, EventBus, LanguageCode, TestimonyRevision, UserRecording } from '../../core';
import { listeningEmitter } from '../../golisten';
import type { ListeningEmitter } from '../../golisten';
import { useApp } from '../context';
import { usePref } from '../prefs';
import { I, IconBtn } from '../ui';
import { Player } from '../player/Player';
import type { PlayerControls } from '../player/Player';
import { recordingSupported, startRecording } from './recorder';
import type { ActiveRecording } from './recorder';

// One emitter per (bus, user, session, text): its pass/attempt counters must survive remounts within a
// session, or a repeated attempt would be deduped away.
const emitters = new WeakMap<EventBus, Map<string, ListeningEmitter>>();
function emitterFor(bus: EventBus, ctx: { userId: string; lang: LanguageCode; session: string; textId: string; store: AppStore }): ListeningEmitter {
  let byKey = emitters.get(bus);
  if (!byKey) { byKey = new Map(); emitters.set(bus, byKey); }
  const key = `${ctx.userId}|${ctx.session}|${ctx.textId}`;
  let e = byKey.get(key);
  if (!e) { e = listeningEmitter(bus, { ...ctx, surface: 'testimony' }); byKey.set(key, e); }
  return e;
}

/**
 * `currentDraft`: what is in the editor right now. The audio is always for the saved version's own text; when the
 * draft has moved on, say so plainly so nobody rehearses words they are no longer going to say.
 */
export function RevisionAudio({ revision, currentDraft }: { revision: TestimonyRevision; currentDraft?: string }) {
  const { store, bus, golisten, userId, lang, session } = useApp();
  const textId = revision.textId;
  const [speed] = usePref('speed');
  const controls = useRef<PlayerControls | null>(null);
  const activeRecording = useRef<ActiveRecording | null>(null);
  const supported = recordingSupported();

  const [message, setMessage] = useState<string | null>(null);
  const [shadow, setShadow] = useState<Record<number, number>>({});
  const [recordings, setRecordings] = useState<Record<number, Array<{ rec: UserRecording; url?: string }>>>({});
  const [recordingIndex, setRecordingIndex] = useState<number | null>(null);

  const emitter = useMemo(() => (textId ? emitterFor(bus, { userId, lang, session, textId, store }) : null), [bus, userId, lang, session, textId, store]);
  // Real sentence ids of the private testimony Text, in the order of its current content version. (Ingested sentences
  // are keyed by content, so an id is never derived from a position.)
  const [sentenceIds, setSentenceIds] = useState<string[]>([]);
  useEffect(() => {
    if (!textId) return;
    let live = true;
    void store.sentences.where('textId', textId).then((rows) => {
      if (live) setSentenceIds(rows.filter((s) => s.retiredInVersion === undefined).sort((a, b) => a.index - b.index).map((s) => s.id));
    });
    return () => { live = false; };
  }, [store, textId]);
  const sentenceIdFor = useCallback((index: number) => sentenceIds[index], [sentenceIds]);

  /** The manifest segment for one revision sentence (fresh lookup: the manifest may have just been prepared). */
  const segmentFor = useCallback(async (index: number): Promise<AudioSegment | undefined> => {
    if (!textId) return undefined;
    const manifest = await golisten.getManifest(textId);
    if (!manifest) return undefined;
    const segs = (await Promise.all(manifest.segmentIds.map((id) => golisten.getSegment(id)))).filter((s): s is AudioSegment => !!s);
    const wanted = sentenceIdFor(index);
    return (wanted ? segs.find((s) => s.sentenceIds.includes(wanted)) : undefined) ?? segs[index];
  }, [golisten, textId, sentenceIdFor]);

  // Shadowing counts (from the event log, by segment) and existing recordings for this version.
  useEffect(() => {
    if (!textId) return;
    let live = true;
    void (async () => {
      const events = await bus.history({ userId, types: ['ShadowingAttempt'] });
      const counts: Record<number, number> = {};
      for (const s of revision.sentences) {
        const seg = await segmentFor(s.index);
        counts[s.index] = seg ? events.filter((e) => e.type === 'ShadowingAttempt' && e.segmentId === seg.id).length : 0;
      }
      const recs = (await store.recordings.where('userId', userId)).filter((r) => r.target.testimonyRevisionId === revision.id);
      const grouped: Record<number, Array<{ rec: UserRecording; url?: string }>> = {};
      for (const rec of recs.sort((a, b) => a.attempt - b.attempt)) {
        (grouped[rec.target.testimonySentenceIndex ?? 0] ??= []).push({ rec, url: await store.assets.url(rec.assetId) });
      }
      if (live) { setShadow(counts); setRecordings(grouped); }
    })();
    return () => { live = false; };
  }, [bus, store, userId, revision, textId, segmentFor]);

  useEffect(() => () => { activeRecording.current?.stop().catch(() => undefined); }, []);

  const playSentence = useCallback((index: number) => {
    const sentenceId = sentenceIdFor(index);
    if (!sentenceId) return;
    controls.current?.seekSentence(sentenceId);
    controls.current?.play();
  }, [sentenceIdFor]);

  const playAll = useCallback(() => {
    const first = revision.sentences[0];
    if (first) playSentence(first.index);
  }, [revision, playSentence]);

  const countShadow = useCallback(async (index: number): Promise<boolean> => {
    if (!emitter) return false;
    const seg = await segmentFor(index);
    if (!seg) { setMessage('Prepare the audio first; attempts are recorded against the audio of that sentence.'); return false; }
    setShadow((prev) => ({ ...prev, [index]: (prev[index] ?? 0) + 1 }));
    await emitter.shadowingAttempt({ segmentId: seg.id, sentenceIds: seg.sentenceIds }, { speed, transcriptVisible: true });
    return true;
  }, [emitter, segmentFor, speed]);

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
        const seg = await segmentFor(index);
        const sentenceId = seg?.sentenceIds[0] ?? sentenceIdFor(index);
        const attempt = (recordings[index]?.length ?? 0) + 1;
        const rec: UserRecording = {
          id: `rec:${userId}:${revision.id}#${index}:${attempt}`,
          userId, lang, assetId, attempt, createdAt: new Date().toISOString(),
          target: { sentenceId, testimonyRevisionId: revision.id, testimonySentenceIndex: index, text: sentence.text },
        };
        await store.recordings.put(rec);
        const url = await store.assets.url(assetId);
        setRecordings((prev) => ({ ...prev, [index]: [...(prev[index] ?? []), { rec, url }] }));
        await emitter?.recordingCreated({ recordingId: rec.id, targetText: sentence.text, sentenceId, testimonyRevisionId: revision.id });
        await countShadow(index); // a recorded take is one shadowing attempt
      } catch (e) {
        setMessage(`Could not save the recording: ${e instanceof Error ? e.message : String(e)}`);
      }
      return;
    }
    if (activeRecording.current) return; // one at a time
    try {
      activeRecording.current = await startRecording();
      setRecordingIndex(index);
    } catch (e) {
      setMessage(`Microphone unavailable: ${e instanceof Error ? e.message : String(e)}`);
    }
  }, [recordingIndex, recordings, store, revision, userId, lang, emitter, segmentFor, sentenceIdFor, countShadow]);

  if (!textId) {
    return (
      <section className="rehearse" aria-label="Listen and rehearse">
        <h3 className="label">Audio for version {revision.number}</h3>
        <p className="card__note">Audio is not available for this version.</p>
      </section>
    );
  }

  return (
    <section className="rehearse" aria-label="Listen and rehearse">
      <div className="rehearse-head">
        <h3 className="label">Audio for version {revision.number}</h3>
      </div>
      {currentDraft !== undefined && currentDraft.trim() !== revision.fullText.trim() && (
        <p className="note note--warn" role="note" data-testid="draft-differs">
          This audio is for version {revision.number}, not for the text in your editor now. Save the editor text as a new version to hear it.
        </p>
      )}
      <Player key={textId} textId={textId} controlRef={controls} />
      <div className="card__actions">
        <button type="button" className="btn btn--primary" onClick={playAll}>Play whole testimony</button>
      </div>
      <p className="card__note">Play a sentence, say it along with the voice, then count the attempt or record yourself and listen back.</p>
      {message && <p role="status" className="note">{message}</p>}
      <ol className="list rehearse-list">
        {revision.sentences.map((s) => (
          <li key={s.index} className="list__row rehearse__row">
            <span className="rehearse-text" lang={lang}>{s.text}</span>
            <span className="rehearse-actions">
              <IconBtn label={`Play sentence ${s.index + 1}`} onClick={() => playSentence(s.index)}>{I.play}</IconBtn>
              <button type="button" className="btn btn--small btn--quiet" aria-label={`Count a shadowing attempt for sentence ${s.index + 1}`} onClick={() => { void countShadow(s.index); }}>shadowed</button>
              <span className="list__meta" aria-label={`Shadowed ${shadow[s.index] ?? 0} times`} data-testid={`shadow-${s.index}`}>{shadow[s.index] ?? 0}×</span>
              {supported ? (
                <button type="button" className="btn btn--small btn--quiet" aria-pressed={recordingIndex === s.index} aria-label={recordingIndex === s.index ? `Stop recording sentence ${s.index + 1}` : `Record sentence ${s.index + 1}`} onClick={() => { void toggleRecord(s.index); }}>
                  {recordingIndex === s.index ? I.stop : I.dot}
                  {recordingIndex === s.index ? 'stop' : 'record'}
                </button>
              ) : null}
            </span>
            {(recordings[s.index] ?? []).map(({ rec, url }) => (
              <span key={rec.id} className="take card__prov">
                take {rec.attempt} {url && <audio controls preload="none" src={url} aria-label={`Your recording, take ${rec.attempt}`} />}
              </span>
            ))}
          </li>
        ))}
      </ol>
      {!supported && <p className="card__note">Recording is not available in this browser; playback and counting still work.</p>}
    </section>
  );
}
