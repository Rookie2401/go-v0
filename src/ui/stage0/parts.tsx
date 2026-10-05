/**
 * Stage 0 building blocks: a line of target text with tappable words (gloss, decoding, romanization only as a recorded
 * rescue), the word sheet, and the speaking box (hear the model, record yourself, compare, say how it went — never scored).
 */
import { useMemo, useRef, useState } from 'react';
import type { AppStore, LanguageAdapter, LanguageCode, Stage0Audio } from '../../core';
import { describeFeature, wordsOf } from '../../stage0/features';
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

/** Speak it: hear the model, record yourself, play both, say how it went. Nothing is scored by a machine. */
export function SpeakBox({ voice, model, lang, store, userId, onDone }: {
  voice: Stage0Voice; model: string; lang: LanguageCode; store: AppStore; userId: string;
  onDone(recordingId: string | undefined, selfCheck: 'like-model' | 'different' | 'unsure'): void;
}) {
  const [rec, setRec] = useState<ActiveRecording | null>(null);
  const [url, setUrl] = useState<string | null>(null);
  const [recordingId, setRecordingId] = useState<string | undefined>();
  const [done, setDone] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const attempt = useRef(0);
  const supported = recordingSupported();
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
  };
  const finish = (s: 'like-model' | 'different' | 'unsure') => { setDone(true); onDone(recordingId, s); };
  return (
    <div className="stage0-speak" aria-label="Say it aloud">
      <p className="card__note">Say it aloud: <span lang={lang}>{model}</span></p>
      <div className="actions">
        <PlayButton voice={voice} text={model} label="Hear the model" />
        {supported && !rec && <button type="button" className="btn btn--small" onClick={() => { setErr(null); void startRecording().then(setRec, () => setErr('The microphone could not be opened. You can still say it aloud and compare.')); }}>● Record yourself</button>}
        {rec && <button type="button" className="btn btn--small btn--primary" onClick={() => { void stop(); }}>■ Stop</button>}
        {url && <button type="button" className="btn btn--small" onClick={() => { void new Audio(url).play().catch(() => undefined); }}>▶ Hear yourself</button>}
      </div>
      {!supported && <p className="card__note">This device cannot record here: say it aloud, then compare with the model.</p>}
      {err && <p className="card__note">{err}</p>}
      {!done ? (
        <div className="actions">
          <span className="card__note">How did it go?</span>
          <button type="button" className="btn btn--small btn--quiet" onClick={() => finish('like-model')}>Like the model</button>
          <button type="button" className="btn btn--small btn--quiet" onClick={() => finish('different')}>Different</button>
          <button type="button" className="btn btn--small btn--quiet" onClick={() => finish('unsure')}>Not sure</button>
        </div>
      ) : <p className="card__note">Noted. A speaker can listen to your recordings later; nothing here grades your pronunciation.</p>}
    </div>
  );
}
