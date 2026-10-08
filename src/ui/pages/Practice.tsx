/**
 * Practice (#/practice): today's retrieval set, one prompt at a time. Each prompt is a sentence the learner has read, with one
 * word blanked; he types the word. A miss shows the first letter, a second miss shows the word. The engine
 * (src/golearn/retrieval) decides what is asked and when, and records a correct recall as ordinary production evidence; this
 * page only asks, shows and reports. Nothing here is a grade: the summary says what came back unaided and what to look at again.
 *
 * Also exported for the other screens: `useRetrieval` (the engine bound to the app's services) and `usePracticeDue` (Home shows its
 * entry only when at least one prompt is due).
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { createRetrieval } from '../../golearn/retrieval';
import type { Retrieval, RetrievalDay, RetrievalPrompt } from '../../golearn/retrieval';
import { useApp } from '../context';
import { BackLink, Topbar } from '../ui';

/** The retrieval engine over the app's store, bus, adapters and GoLearn. */
export function useRetrieval(): Retrieval {
  const { store, bus, adapters, golearn, currentSession } = useApp();
  return useMemo(() => createRetrieval({ store, bus, adapters, golearn, session: currentSession }), [store, bus, adapters, golearn, currentSession]);
}

/** True once it is known that the learner has at least one prompt due now (false while loading, and on any failure). */
export function usePracticeDue(): boolean {
  const { userId, lang } = useApp();
  const retrieval = useRetrieval();
  const [due, setDue] = useState(false);
  useEffect(() => {
    let live = true;
    setDue(false);
    retrieval.hasDue(userId, lang).then((v) => { if (live) setDue(v); }, () => { if (live) setDue(false); });
    return () => { live = false; };
  }, [retrieval, userId, lang]);
  return due;
}

/**
 * "Practise" on a Vocabulary row: puts that word at the front of today's set and opens Practice. Says so (and why) when no sentence
 * the learner has read contains the word, since a word is only ever asked inside a sentence he met it in.
 */
export function PractiseButton({ itemId, itemKind, word }: { itemId: string; itemKind: string; word: string }) {
  const { userId, lang } = useApp();
  const retrieval = useRetrieval();
  const navigate = useNavigate();
  const [problem, setProblem] = useState<string | null>(null);
  if (itemKind !== 'form' && itemKind !== 'lemma') return null;
  return (
    <>
      <button
        type="button" className="btn btn--small btn--quiet" aria-label={`Practise ${word}`}
        onClick={() => {
          setProblem(null);
          retrieval.queue(userId, lang, itemId).then((r) => { if (r.ok) navigate('/practice'); else setProblem(r.reason); }, (e: unknown) => setProblem(e instanceof Error ? e.message : String(e)));
        }}
      >Practise</button>
      {problem && <span className="faint" role="status"> {problem}</span>}
    </>
  );
}

type Stage = 'ask' | 'letter' | 'shown' | 'right';

interface Tally { independent: number; assisted: number; missed: string[] }

function untilText(iso: string, nowMs: number): string {
  const mins = Math.max(1, Math.round((Date.parse(iso) - nowMs) / 60_000));
  if (mins < 60) return `in about ${mins} ${mins === 1 ? 'minute' : 'minutes'}`;
  const hours = Math.round(mins / 60);
  if (hours < 36) return `in about ${hours} ${hours === 1 ? 'hour' : 'hours'}`;
  const days = Math.round(hours / 24);
  return `in about ${days} days`;
}

export function PracticePage() {
  const { userId, lang } = useApp();
  const retrieval = useRetrieval();
  const [day, setDay] = useState<RetrievalDay | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [index, setIndex] = useState(0);
  const [stage, setStage] = useState<Stage>('ask');
  const [typed, setTyped] = useState('');
  const [note, setNote] = useState<string | null>(null);
  const [tally, setTally] = useState<Tally>({ independent: 0, assisted: 0, missed: [] });
  const [busy, setBusy] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let live = true;
    retrieval.today(userId, lang).then((d) => { if (live) setDay(d); }, (e: unknown) => { if (live) setError(e instanceof Error ? e.message : String(e)); });
    return () => { live = false; };
  }, [retrieval, userId, lang]);

  const prompt: RetrievalPrompt | undefined = day?.prompts[index];
  useEffect(() => { if (stage !== 'shown' && stage !== 'right') input.current?.focus(); }, [prompt, stage]);

  const advance = useCallback(() => {
    setIndex((i) => i + 1);
    setStage('ask');
    setTyped('');
    setNote(null);
  }, []);

  const run = useCallback(async (fn: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try { await fn(); } catch (e) { setError(e instanceof Error ? e.message : String(e)); } finally { setBusy(false); }
  }, []);

  /** The whole word is shown: a miss on the schedule, nothing in GoLearn. */
  const reveal = useCallback(async (p: RetrievalPrompt) => {
    await retrieval.giveUp(userId, p);
    setTally((t) => ({ ...t, missed: [...t.missed, p.answer] }));
    setStage('shown');
  }, [retrieval, userId]);

  const check = (e: FormEvent) => {
    e.preventDefault();
    if (!prompt || busy || !typed.trim()) return;
    void run(async () => {
      const hint = stage === 'letter' ? 'letter' : 'none';
      const r = await retrieval.submit(userId, prompt, typed, hint);
      if (r.accepted) {
        setTally((t) => (r.outcome === 'assisted' ? { ...t, assisted: t.assisted + 1 } : { ...t, independent: t.independent + 1 }));
        setNote(r.note ?? null);
        setStage('right');
      } else if (stage === 'ask') {
        setTyped('');
        setNote('Not quite.');
        setStage('letter');
      } else {
        await reveal(prompt);
      }
    });
  };

  const bar = <Topbar title="Practice" left={<BackLink to="/" label="Home" />} />;
  if (error && !day) return <div>{bar}<div className="page page--narrow route-fade"><p role="alert" className="error">{error}</p></div></div>;
  if (!day) return <div>{bar}<div className="page page--narrow route-fade"><p className="muted" role="status">Loading…</p></div></div>;

  if (day.prompts.length === 0) {
    return (
      <div>
        {bar}
        <div className="page page--narrow route-fade" data-testid="practice-empty">
          {!day.hasReading ? (
            <>
              <p>Practice uses the sentences you have read.</p>
              <p className="muted">Read a story first. The words you meet there will come back here as short fill-in-the-blank questions, in the sentence where you met them.</p>
            </>
          ) : (
            <>
              <p>Nothing is due right now.</p>
              <p className="muted">
                {day.doneToday > 0 ? `You finished ${day.doneToday} ${day.doneToday === 1 ? 'prompt' : 'prompts'} today. ` : ''}
                {day.nextDueAt ? `The next word comes back ${untilText(day.nextDueAt, Date.now())}.` : 'Words you have met only once or twice come here after you read more.'}
              </p>
            </>
          )}
          <p><Link to="/read" className="btn btn--small">Go to reading</Link></p>
        </div>
      </div>
    );
  }

  if (!prompt) {
    const total = tally.independent + tally.assisted + tally.missed.length;
    return (
      <div>
        {bar}
        <div className="page page--narrow route-fade" data-testid="practice-summary">
          <h2 className="section-head">Done for now</h2>
          <p>
            {total} {total === 1 ? 'word' : 'words'}: {tally.independent} on your own, {tally.assisted} with the first letter, {tally.missed.length} to look at again.
          </p>
          {tally.missed.length > 0 && (
            <p>Look at again: <span lang={lang}>{tally.missed.join(', ')}</span>. They come back in a few hours.</p>
          )}
          <p className="muted">A word you got on your own returns later each time, so the set stays small.</p>
          <p><Link to="/" className="btn btn--small">Home</Link></p>
        </div>
      </div>
    );
  }

  const blank = stage === 'letter' ? `${prompt.firstLetter}${'_'.repeat(Math.max(3, Array.from(prompt.answer).length - 1))}` : stage === 'shown' || stage === 'right' ? prompt.answer : '_____';
  return (
    <div>
      {bar}
      <div className="page page--narrow route-fade" data-testid="practice-prompt">
        <p className="muted" role="status">Word {index + 1} of {day.prompts.length} · from "{prompt.textTitle}"</p>
        <p lang={lang} data-testid="practice-cloze" style={{ fontSize: '1.25em', lineHeight: 1.6 }}>
          {prompt.before}<strong data-testid="practice-blank">{blank}</strong>{prompt.after}
        </p>
        {error && <p role="alert" className="error">{error}</p>}
        {stage === 'ask' || stage === 'letter' ? (
          <form onSubmit={check}>
            {note && <p role="status">{note} It starts with <strong lang={lang}>{prompt.firstLetter}</strong>.</p>}
            <label className="field">
              <span className="label">Type the missing word</span>
              <input ref={input} type="text" lang={lang} value={typed} autoComplete="off" autoCapitalize="off" spellCheck={false} aria-label="Your answer" onChange={(e) => setTyped(e.target.value)} />
            </label>
            <div className="row">
              <button type="submit" className="btn btn--primary" disabled={busy || !typed.trim()}>Check</button>
              {stage === 'ask' && <button type="button" className="btn btn--quiet" disabled={busy} onClick={() => { setNote(null); setStage('letter'); }}>Show the first letter</button>}
              <button type="button" className="btn btn--quiet" disabled={busy} onClick={() => { void run(() => reveal(prompt)); }}>Show the word</button>
            </div>
          </form>
        ) : stage === 'right' ? (
          <div role="status" data-testid="practice-feedback">
            <p>Right.{note ? ` ${note}` : ''}</p>
            <button type="button" className="btn btn--primary" onClick={advance}>Next</button>
          </div>
        ) : (
          <div role="status" data-testid="practice-feedback">
            <p>The word is <strong lang={lang}>{prompt.answer}</strong>. It will come back in a few hours.</p>
            <button type="button" className="btn btn--primary" onClick={advance}>Next</button>
          </div>
        )}
      </div>
    </div>
  );
}
