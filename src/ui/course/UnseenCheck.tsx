/**
 * The unseen-text check (engine package R7), shown inside StageStatus only when one is due (src/golearn/assessment.ts: eight
 * finished texts since the last one and a week since it) or already under way.
 *
 *   offer     "A short check on a text you have not seen. It changes nothing in your record; it tells you how your reading is going."
 *   reading   the chosen text, opened in the ordinary reader: help is there and the reader counts it as it always does
 *   asking    R3's recall prompts (src/golearn/prompts.ts) for that text, one at a time. They are the measure. No answer is saved as
 *             evidence and nothing is reported as Understood: the only thing recorded is the one `UnseenCheckRecorded` event.
 *   result    "Unseen text: 2 of 3 right, 91 % of words known at the start". Readiness data; never a level, a grade or a CEFR label.
 *
 * Nothing here is a gate, and "Not now" always leaves. When the check has nothing to read at his reach it says so and asks nothing.
 */
import { useEffect, useMemo, useState } from 'react';
import type { LearnerItemState, Stage } from '../../core';
import { checkResultLine, createUnseenCheckService } from '../../golearn/assessment';
import type { PendingCheck, UnseenCheckResult, UnseenCheckService } from '../../golearn/assessment';
import { BLANK } from '../../golearn/prompts';
import type { RecallPrompt } from '../../golearn/prompts';
import { useApp } from '../context';
import { textPath } from '../format';
import { gather } from '../reader/Prompts';
import { useTextData } from '../reader/useTextData';
import { useNavigate } from 'react-router-dom';
import '../reader/prompts.css';

export const UNSEEN_EXPLANATION = 'A short check on a text you have not seen. It changes nothing in your record; it tells you how your reading is going.';

type View =
  | { kind: 'loading' }
  | { kind: 'hidden' }
  | { kind: 'offer' }
  | { kind: 'none' }
  | { kind: 'reading'; pending: PendingCheck }
  | { kind: 'asking'; pending: PendingCheck }
  | { kind: 'done'; result: UnseenCheckResult };

export function UnseenCheck({ stage, service }: { stage: Stage; service?: UnseenCheckService }) {
  const app = useApp();
  const { store, bus, adapters, golearn, userId, lang, library } = app;
  const navigate = useNavigate();
  const svc = useMemo<UnseenCheckService>(
    () => service ?? createUnseenCheckService({ store, bus, adapters, settled: typeof golearn.settled === 'function' ? () => golearn.settled() : undefined }),
    [service, store, bus, adapters, golearn],
  );
  const [view, setView] = useState<View>({ kind: 'loading' });
  const [error, setError] = useState<string | null>(null);
  const [last, setLast] = useState<UnseenCheckResult | undefined>(undefined);

  useEffect(() => {
    let live = true;
    setView({ kind: 'loading' });
    void svc.status(userId, lang).then(
      (s) => {
        if (!live) return;
        setLast(s.last);
        setView(s.pending ? { kind: 'reading', pending: s.pending } : s.due ? { kind: 'offer' } : { kind: 'hidden' });
      },
      () => { if (live) setView({ kind: 'hidden' }); }, // a failing read just means no offer
    );
    return () => { live = false; };
  }, [svc, userId, lang]);

  const begin = () => {
    setError(null);
    void svc.start(userId, lang, stage.id).then(
      (p) => setView(p ? { kind: 'reading', pending: p } : { kind: 'none' }),
      (e: unknown) => setError(e instanceof Error ? e.message : 'The check could not start just now.'),
    );
  };
  const open = (p: PendingCheck) => {
    setError(null);
    void (async () => {
      const resident = await store.texts.get(p.textId);
      navigate(textPath(resident ?? await library.open(p.textId)));
    })().catch((e: unknown) => setError(e instanceof Error ? e.message : 'Could not open this reading.'));
  };
  const letGo = () => { void svc.abandon(userId, lang).finally(() => setView({ kind: 'hidden' })); };

  if (view.kind === 'loading' || (view.kind === 'hidden' && !last)) return null;
  if (view.kind === 'hidden' && last) {
    return <p className="card__note unseen-check__last" data-testid="unseen-last">{checkResultLine(last)}</p>;
  }
  return (
    <section className="unseen-check" aria-label="Unseen-text check" data-testid="unseen-check">
      <h3 className="unseen-check__title">Unseen-text check</h3>
      {error && <p role="alert" className="error">{error}</p>}
      {view.kind === 'offer' && (
        <>
          <p className="card__note">{UNSEEN_EXPLANATION}</p>
          <div className="prompt__actions">
            <button type="button" className="btn btn--small" onClick={begin}>Choose a text</button>
            <button type="button" className="btn btn--small btn--quiet" onClick={() => setView({ kind: 'hidden' })}>Not now</button>
          </div>
        </>
      )}
      {view.kind === 'none' && (
        <p className="card__note" role="status">No text you have not seen sits at your reach just now, so nothing is asked of you. It will be offered again.</p>
      )}
      {view.kind === 'reading' && (
        <>
          <p className="card__note">{UNSEEN_EXPLANATION}</p>
          <p>Your text: <strong lang={view.pending.lang} data-testid="unseen-title">{view.pending.title}</strong></p>
          <p className="card__note">Read it as you like. Help is there when you want it, and the reader counts it as it always does. When you have finished, come back here for a few questions.</p>
          <div className="prompt__actions">
            <button type="button" className="btn btn--small" onClick={() => open(view.pending)}>Open the text</button>
            <button type="button" className="btn btn--small" onClick={() => setView({ kind: 'asking', pending: view.pending })}>I have read it: ask me</button>
            <button type="button" className="btn btn--small btn--quiet" onClick={letGo}>Let this one go</button>
          </div>
        </>
      )}
      {view.kind === 'asking' && (
        <Questions
          pending={view.pending}
          onResult={(r) => { setLast(r); setView({ kind: 'done', result: r }); }}
          onStop={() => setView({ kind: 'reading', pending: view.pending })}
          onNoQuestions={() => { void svc.abandon(userId, lang).finally(() => setView({ kind: 'none' })); }}
          record={(right, total) => svc.record(userId, view.pending, right, total)}
        />
      )}
      {view.kind === 'done' && (
        <>
          <p role="status" data-testid="unseen-result">{checkResultLine(view.result)}</p>
          <p className="card__note">This is how your reading is going, not a level. It counts as one of the measures under "How is this going?".</p>
        </>
      )}
    </section>
  );
}


type Answered = { right: boolean };

function Questions({ pending, onResult, onStop, onNoQuestions, record }: {
  pending: PendingCheck;
  onResult(r: UnseenCheckResult): void;
  onStop(): void;
  onNoQuestions(): void;
  record(right: number, total: number): Promise<UnseenCheckResult>;
}) {
  const app = useApp();
  const state = useTextData(pending.textId);
  const [prompts, setPrompts] = useState<RecallPrompt[] | null>(null);
  const [at, setAt] = useState(0);
  const [answers, setAnswers] = useState<Record<string, Answered>>({});
  const [picked, setPicked] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const data = state.status === 'ready' ? state.data : undefined;

  useEffect(() => {
    if (!data) return;
    let live = true;
    // Every sentence of the text may anchor a "did this happen" statement: its truth does not depend on his saying he understood it.
    const all = new Set(data.sentences.map((s) => s.id));
    const g = app.golearn;
    const wrapped = {
      ...app,
      golearn: {
        ...g,
        getItemState: async (userId: string, itemId: string): Promise<LearnerItemState | undefined> => {
          let row: LearnerItemState | undefined;
          try { row = typeof g.getItemState === 'function' ? await g.getItemState(userId, itemId) : undefined; } catch { row = undefined; }
          const level = row?.reading.level;
          if (level && level !== 'unseen' && level !== 'encountered') return row; // met before: its level stands (a weak word is asked about, a well-known one is not)
          return { ...(row ?? ({ itemId } as LearnerItemState)), reading: { ...(row?.reading ?? ({} as LearnerItemState['reading'])), level: 'recognized_with_help' } } as LearnerItemState;
        },
      },
    } as typeof app;
    void gather(wrapped, data, all).then((p) => { if (live) setPrompts(p); }, () => { if (live) setPrompts([]); });
    return () => { live = false; };
  }, [data, app]);

  useEffect(() => { if (prompts && prompts.length === 0) onNoQuestions(); }, [prompts, onNoQuestions]);

  if (state.status === 'missing' || state.status === 'error') {
    return (
      <>
        <p className="card__note" role="status">The text is not on this device yet. Open it first, read it, and come back.</p>
        <div className="prompt__actions"><button type="button" className="btn btn--small" onClick={onStop}>Back</button></div>
      </>
    );
  }
  if (!prompts) return <p className="muted" role="status">Getting the questions ready…</p>;
  if (prompts.length === 0) return null;

  const total = prompts.length;
  const p = prompts[at];
  const answer = answers[p.id];
  const last = at === total - 1;
  const lang = pending.lang;
  const answer1 = (id: string, choice: string, right: boolean) => {
    if (answers[id]) return;
    setPicked((m) => ({ ...m, [id]: choice }));
    setAnswers((m) => ({ ...m, [id]: { right } }));
  };
  const finish = () => {
    const right = prompts.filter((q) => answers[q.id]?.right).length;
    setError(null);
    void record(right, total).then(onResult, (e: unknown) => setError(e instanceof Error ? e.message : 'The result could not be saved just now.'));
  };

  return (
    <section className="reader__prompts" role="group" aria-label="Questions about the text">
      <div className="prompt__head"><span className="muted">Question {at + 1} of {total}</span></div>
      {p.kind === 'cloze' ? (
        <>
          <p className="prompt__ask">Which word is missing?</p>
          <p className="prompt__sentence" lang={lang} data-testid="unseen-sentence">{p.before}<span className="prompt__blank">{BLANK}</span>{p.after}</p>
          <div className="prompt__choices" role="group" aria-label="Choices">
            {p.choices.map((c) => (
              <button key={c} type="button" lang={lang} disabled={!!answer} aria-pressed={picked[p.id] === c} onClick={() => answer1(p.id, c, c === p.answer)}>{c}</button>
            ))}
          </div>
        </>
      ) : (
        <>
          <p className="prompt__ask">Did this happen in the text?</p>
          <p className="prompt__sentence" lang={lang} data-testid="unseen-sentence">{p.statement}</p>
          <div className="prompt__choices" role="group" aria-label="Choices">
            {([['yes', 'Yes'], ['no', 'No']] as const).map(([v, label]) => (
              <button key={v} type="button" disabled={!!answer} aria-pressed={picked[p.id] === v} onClick={() => answer1(p.id, v, (v === 'yes') === p.truth)}>{label}</button>
            ))}
          </div>
        </>
      )}
      {error && <p role="alert" className="error">{error}</p>}
      <div className="prompt__actions">
        {answer && (last
          ? <button type="button" className="btn btn--small" onClick={finish}>See the result</button>
          : <button type="button" className="btn btn--small" onClick={() => setAt((i) => i + 1)}>Next</button>)}
        <button type="button" className="btn btn--small btn--quiet" onClick={onStop}>Stop for now</button>
      </div>
    </section>
  );
}
