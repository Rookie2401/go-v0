/**
 * Stage 0 building blocks: a line of target text with tappable words (gloss, decoding, romanization only as a recorded
 * rescue), the word sheet, and the speaking box (hear the model, record yourself, compare, say how it went — never scored).
 */
import { useMemo, useRef, useState } from 'react';
import type { AppStore, LanguageAdapter, LanguageCode, Stage0Audio, Stage0Line, Stage0ProductionTask } from '../../core';
import { describeFeature, wordsOf } from '../../stage0/features';
import { normalizeAnswer } from '../../stage0/match';
import type { WordInfo } from '../../stage0/features';
import { recordingSupported, startRecording } from '../testimony/recorder';
import type { ActiveRecording } from '../testimony/recorder';
import type { Stage0Voice } from './audio';

export interface Piece { text: string; word?: WordInfo; index?: number }

/** The line cut into words and the spaces/punctuation between them, offsets kept (no whitespace assumption). */
export function piecesOf(adapter: LanguageAdapter, lang: LanguageCode, text: string): Piece[] {
  const words = wordsOf(adapter, lang, text);
  const out: Piece[] = [];
  let at = 0;
  words.forEach((w, i) => {
    if (w.start > at) out.push({ text: text.slice(at, w.start) });
    out.push({ text: text.slice(w.start, w.end), word: w, index: i });
    at = w.end;
  });
  if (at < text.length) out.push({ text: text.slice(at) });
  return out;
}

export function TargetLine({ adapter, lang, text, transliterate, segment, highlight, onWord }: {
  adapter: LanguageAdapter; lang: LanguageCode; text: string;
  /** Surfaces shown with their reading underneath (fading support). */
  transliterate?: string[];
  segment?: boolean;
  /** Words to highlight as new. */
  highlight?: Set<string>;
  onWord?(w: WordInfo, index: number): void;
}) {
  const pieces = useMemo(() => piecesOf(adapter, lang, text), [adapter, lang, text]);
  const roman = new Set(transliterate ?? []);
  return (
    <span className={`stage0-text stage0-text--${lang}`} lang={lang}>
      {pieces.map((p, i) => {
        if (!p.word) return <span key={i}>{p.text}</span>;
        const w = p.word;
        const showRoman = roman.has(w.surface) && !!w.romanization;
        const isNew = highlight?.has(w.normalized) ?? false;
        const body = (
          <button type="button" className={`stage0-word${isNew ? ' stage0-word--new' : ''}`} onClick={() => onWord?.(w, p.index!)} aria-label={`${w.surface}: open the word`}>
            {showRoman ? <ruby>{w.surface}<rt className="stage0-roman">{w.romanization}</rt></ruby> : w.surface}
          </button>
        );
        return <span key={i}>{segment && i > 0 && pieces[i - 1]?.word ? <span className="stage0-gap" aria-hidden="true">{' '}</span> : null}{body}</span>;
      })}
    </span>
  );
}

/** What a tap on a word shows: meaning first; for a script language the sound units; romanization only on request. */
export function WordSheet({ adapter, lang, word, script, onClose, onRomanize, name }: {
  adapter: LanguageAdapter; lang: LanguageCode; word: WordInfo; script: boolean; onClose(): void; onRomanize(): void;
  /** A name from the Stage 0 cast: shown as a name, never with a dictionary gloss of a look-alike word. */
  name?: { role: string };
}) {
  const [roman, setRoman] = useState(false);
  return (
    <div className="stage0-sheet" role="dialog" aria-label={`The word ${word.surface}`}>
      <p className="stage0-sheet__word" lang={lang}>{word.surface}</p>
      {name
        ? <p>A name — {name.role.split(';')[0]}.</p>
        : <p>{word.gloss ? `“${word.gloss}”` : 'No meaning on file for this word yet: read on, or open the English.'}{word.lemma && word.lemma !== word.normalized ? <span className="card__note"> — from {word.lemma}</span> : null}</p>}
      {script && word.syllables.length > 0 && (
        <div className="stage0-sheet__units" aria-label="Its sound units">
          {word.syllables.map((s, i) => (
            <span key={i} className="stage0-unit" lang={lang}>
              {s.text}
              {s.tone ? <small className="card__note"> {s.tone} tone</small> : null}
              {roman && s.romanization ? <small className="stage0-roman"> {s.romanization}</small> : null}
            </span>
          ))}
        </div>
      )}
      {script && word.features.length > 0 && (
        <ul className="card__text stage0-features">{word.features.slice(0, 6).map((f) => <li key={f}>{describeFeature(adapter, lang, f)}</li>)}</ul>
      )}
      <div className="actions">
        {script && !roman && word.romanization && <button type="button" className="btn btn--small btn--quiet" onClick={() => { setRoman(true); onRomanize(); }}>Show the romanization (rescue)</button>}
        <button type="button" className="btn btn--small" onClick={onClose}>Close</button>
      </div>
    </div>
  );
}

export function PlayButton({ voice, text, audio, label = 'Hear it' }: { voice: Stage0Voice; text: string; audio?: Stage0Audio; label?: string }) {
  const source = voice.sourceFor(audio);
  if (source === 'none') return null;
  return (
    <button type="button" className="btn btn--small stage0-play" onClick={() => { void voice.play(text, audio); }} aria-label={`${label}${source === 'computer-voice' ? ' (computer voice, practice)' : ''}`}>
      ▶ {label}{source === 'computer-voice' ? <small className="card__note"> computer voice</small> : null}
    </button>
  );
}

/** What a retelling is cued by: a picture and the English meaning. The target line is NOT part of it. */
export interface RetellCue { picture?: string; en: string }

/**
 * The cue for retelling `model`: the picture of the scene line it comes from (or the first line the task is based on), and the
 * English meaning — the English of the scene line that says exactly this, else the task's own English prompt (a personal answer,
 * such as the learner's own name, has no scene line to borrow from). Never the target line itself.
 */
export function retellCue(lang: LanguageCode, task: Pick<Stage0ProductionTask, 'prompt' | 'basedOn'>, lines: ReadonlyArray<Stage0Line> | undefined, model: string): RetellCue {
  const same = (lines ?? []).find((l) => normalizeAnswer(lang, l.text) === normalizeAnswer(lang, model));
  const picture = same?.picture ?? (lines ?? []).find((l) => task.basedOn.includes(l.id) && l.picture)?.picture;
  return { ...(picture ? { picture } : {}), en: same?.en ?? task.prompt };
}

/**
 * Retell it aloud. The cue is a picture and the English meaning; the target line stays hidden until the recording is made. Then
 * the model line appears beside the learner's recording, with "Compare: did you say the same thing?" (yes / partly / no) — the
 * learner's own judgement, recorded on the attempt. Recordings stay on this device; nothing is scored by a machine.
 */
export function SpeakBox({ voice, model, lang, store, userId, cue, onReveal, onDone }: {
  voice: Stage0Voice; model: string; lang: LanguageCode; store: AppStore; userId: string;
  cue: RetellCue;
  /** The model line has been revealed (the recording is made, or the learner said it without recording). */
  onReveal?(): void;
  onDone(recordingId: string | undefined, selfCheck: 'yes' | 'partly' | 'no'): void;
}) {
  const [rec, setRec] = useState<ActiveRecording | null>(null);
  const [url, setUrl] = useState<string | null>(null);
  const [recordingId, setRecordingId] = useState<string | undefined>();
  const [stage, setStage] = useState<'cue' | 'compare' | 'done'>('cue');
  const [err, setErr] = useState<string | null>(null);
  const attempt = useRef(0);
  const supported = recordingSupported();
  const reveal = () => { setStage('compare'); onReveal?.(); };
  const stop = async () => {
    if (!rec) return;
    const r = await rec.stop();
    setRec(null);
    const assetId = await store.assets.put(r.bytes, r.mime);
    attempt.current += 1;
    const id = `stage0-rec:${userId}:${Date.now().toString(36)}`;
    await store.recordings.put({ id, userId, lang, target: { text: model }, assetId, attempt: attempt.current, createdAt: new Date().toISOString() });
    setRecordingId(id);
    setUrl((await store.assets.url(assetId)) ?? null);
    reveal();
  };
  const finish = (s: 'yes' | 'partly' | 'no') => { setStage('done'); onDone(recordingId, s); };
  const canSkip = !supported || err !== null;
  return (
    <div className="stage0-speak" aria-label="Retell it aloud" data-stage={stage}>
      {stage === 'cue' && (
        <>
          <p className="stage0-cue" data-testid="stage0-cue">
            {cue.picture && <span className="stage0-picture" aria-hidden="true">{cue.picture} </span>}
            <span>{cue.en}</span>
          </p>
          <p className="card__note">Say it in your own words from memory — do not read it. The line itself appears after you have recorded.</p>
          <div className="actions">
            {supported && !rec && <button type="button" className="btn btn--small" onClick={() => { setErr(null); void startRecording().then(setRec, () => setErr('The microphone could not be opened. You can still say it aloud and compare.')); }}>● Record yourself</button>}
            {rec && <button type="button" className="btn btn--small btn--primary" onClick={() => { void stop(); }}>■ Stop</button>}
            {canSkip && !rec && <button type="button" className="btn btn--small btn--quiet" onClick={reveal}>I said it aloud — show the line</button>}
          </div>
          {!supported && <p className="card__note">This device cannot record here: say it aloud, then compare with the line.</p>}
          {err && <p className="card__note">{err}</p>}
        </>
      )}
      {stage !== 'cue' && (
        <>
          <div className="stage0-compare" data-testid="stage0-compare">
            <div className="stage0-compare__side">
              <span className="label">You said</span>
              {url ? <button type="button" className="btn btn--small" onClick={() => { void new Audio(url).play().catch(() => undefined); }}>▶ Hear yourself</button> : <span className="card__note">Not recorded on this device.</span>}
            </div>
            <div className="stage0-compare__side">
              <span className="label">The model</span>
              <span className="stage0-model" lang={lang}>{model}</span>
              <PlayButton voice={voice} text={model} label="Hear the model" />
            </div>
          </div>
          {stage === 'compare' ? (
            <div className="actions" role="group" aria-label="Compare: did you say the same thing?">
              <span className="card__note">Compare: did you say the same thing?</span>
              <button type="button" className="btn btn--small" onClick={() => finish('yes')}>Yes</button>
              <button type="button" className="btn btn--small" onClick={() => finish('partly')}>Partly</button>
              <button type="button" className="btn btn--small" onClick={() => finish('no')}>No</button>
            </div>
          ) : <p className="card__note">Noted. Your recording stays on this device, and a speaker can listen to it later; nothing here grades your pronunciation.</p>}
        </>
      )}
    </div>
  );
}
