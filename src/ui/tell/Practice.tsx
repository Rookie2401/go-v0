/**
 * Practise saying it (/tell) — GoTell's productive engine, for the learner.
 *
 * One meaning at a time, chosen by the scheduler ("what you are almost able to say on your own"). He writes first; help
 * comes only when he asks, one smallest step at a time, and every step is shown with what it is. Three kinds of language
 * are kept visibly apart: MY LANGUAGE (an attempt with no help), MY LANGUAGE WITH ASSISTANCE (an attempt after help), and
 * MODEL LANGUAGE (wording GoTell showed — not his; catalog-drafted wording is labelled when not yet reviewed by a native speaker). Feedback says whether the
 * MEANING came across and, separately, whether the checker found something; the checker's fix is never shown unasked.
 */
import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import type { AssistanceStep, PracticeTask, ProductiveGoalState, ProductiveLevel, SemanticGoal, TellAttemptRecord, Text } from '../../core';
import { useApp } from '../context';
import { isTestimonyText, textPath } from '../format';
import { BackLink, Disclosure, Topbar } from '../ui';
import './tell.css';

export const LEVEL_TEXT: Record<ProductiveLevel, string> = {
  0: 'not yet said', 1: 'said after seeing a model', 2: 'said with a lot of help', 3: 'said after a small hint',
  4: 'said on your own once', 5: 'said on your own on two days', 6: 'said on your own in a new kind of task', 7: 'used in your own testimony',
};

const FAMILY_TEXT: Record<PracticeTask['family'], string> = {
  express: 'Say it', 'answer-question': 'Answer', 'testimony-part': 'Part of your testimony', retell: 'Retell', transfer: 'Put it together',
};

const STEP_TEXT: Record<AssistanceStep['tier'], string> = { none: 'Another way to put it', cue: 'Hint', scaffold: 'Part of the wording', model: 'Model' };

export function Practice() {
  const { gotell, store, userId, lang } = useApp();
  const practice = gotell.practice;
  const [task, setTask] = useState<PracticeTask | null | undefined>(undefined);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [states, setStates] = useState<Array<{ goal: SemanticGoal; state: ProductiveGoalState }>>([]);
  const [own, setOwn] = useState('');
  const [ownNote, setOwnNote] = useState<string | null>(null);
  const [retellText, setRetellText] = useState<Text | null>(null);

  const fail = (e: unknown) => setError(e instanceof Error ? e.message : String(e));

  const refreshStates = useCallback(async () => {
    if (!practice) return;
    const [goals, st] = await Promise.all([practice.goals(userId, lang), practice.states(userId, lang)]);
    setStates(goals.map((goal) => ({ goal, state: st.find((s) => s.goalId === goal.id)! })).filter((x) => x.state));
  }, [practice, userId, lang]);

  const load = useCallback(async (goalId?: string) => {
    if (!practice) return;
    setBusy(true); setError(null);
    try {
      setTask((await practice.next(userId, lang, goalId ? { goalId } : undefined)) ?? null);
      setText('');
      await refreshStates();
    } catch (e) { fail(e); } finally { setBusy(false); }
  }, [practice, userId, lang, refreshStates]);

  useEffect(() => { setTask(undefined); void load(); }, [load]);
  useEffect(() => {
    let live = true;
    setRetellText(null);
    const sourceId = task?.family === 'retell' ? task.retellSource?.textId : undefined;
    if (!sourceId) return () => { live = false; };
    void Promise.all([store.texts.get(sourceId), store.corpora.all()]).then(([source, corpora]) => {
      const byCorpus = new Map(corpora.map((corpus) => [corpus.id, corpus]));
      if (live && source && source.lang === lang && source.published === true
        && source.listeningAssessmentId === undefined && source.readingAssessmentId === undefined && !isTestimonyText(source, byCorpus)) setRetellText(source);
    }).catch(() => undefined);
    return () => { live = false; };
  }, [store, lang, task?.family, task?.retellSource?.textId]);

  if (!practice) {
    return (
      <div>
        <Topbar title="Practise saying it" left={<BackLink to="/testimony" label="My Testimony" />} />
        <div className="page page--narrow"><p className="muted">Practice is not available in this version.</p></div>
      </div>
    );
  }

  const submit = async () => {
    if (!task || text.trim() === '') return;
    setBusy(true); setError(null);
    try { setTask((await practice.submit(userId, task.taskId, text)).task); await refreshStates(); } catch (e) { fail(e); } finally { setBusy(false); }
  };
  const hint = async () => {
    if (!task) return;
    setBusy(true); setError(null);
    try { setTask(await practice.hint(userId, task.taskId)); } catch (e) { fail(e); } finally { setBusy(false); }
  };
  const skip = async () => {
    if (!task) return;
    setBusy(true);
    try { if (task.open) await practice.close(userId, task.taskId); } catch (e) { fail(e); } finally { setBusy(false); }
    await load();
  };
  const addOwn = async () => {
    if (own.trim() === '') return;
    const r = await practice.defineGoal(userId, lang, { meaning: own });
    setOwnNote(r.ok ? `Added: "${r.goal.meaning}". It needs: ${r.goal.components.map((c) => c.english).join(', ')}.` : r.reason);
    if (r.ok) { setOwn(''); await refreshStates(); }
  };

  const last = task?.attempts.at(-1);
  const done = !!task && !task.open;

  return (
    <div>
      <Topbar title="Practise saying it" left={<BackLink to="/testimony" label="My Testimony" />} />
      <div className="page page--narrow tell route-fade">
        <p className="soft">One meaning at a time: say it in your own words first. Ask for help only when you need it — it comes one small step at a time.</p>
        {error && <p role="alert" className="error">{error}</p>}
        {task === undefined && <p className="muted" role="status">Choosing what to practise…</p>}
        {task === null && <p className="muted">There is nothing to practise in this language yet.</p>}

        {task && (
          <section className="tell-task" aria-label="Practice task" data-task-id={task.taskId} data-family={task.family}>
            <p className="chip">{FAMILY_TEXT[task.family]}</p>
            {task.family === 'retell' && task.retellSource && (
              <p className="card__note" data-testid="retell-source">
                {retellText ? <>Source: <Link to={textPath(retellText)}>{retellText.title}</Link></> : 'The source passage is no longer available in this language.'}
              </p>
            )}
            <p className="tell-prompt">{task.prompt}</p>
            <Disclosure label="Why this one?" className="tell-why">
              <ul className="card__text" aria-label="Selected because">
                {task.selection.chosenByLearner && <li>You chose it.</li>}
                {task.selection.reasons.map((r) => <li key={r}>{r}</li>)}
                <li>{task.selection.familyReason}</li>
                <li>{task.selection.startReason}</li>
              </ul>
            </Disclosure>

            {task.assistance.length > 0 && (
              <ol className="tell-steps" aria-label="Help shown">
                {task.assistance.map((s) => (
                  <li key={s.id} className={`tell-step tell-step--${s.tier}`} data-kind={s.kind}>
                    <span className="label">{STEP_TEXT[s.tier]}</span>
                    {(s.tier === 'model' || (s.source === 'catalog-model' && s.review === 'unreviewed')) && (
                      <span className="tell-zone tell-zone--model">
                        MODEL LANGUAGE — not your words{s.review === 'unreviewed' ? '; not yet reviewed by a native speaker' : ''}
                      </span>
                    )}
                    <p className="tell-step__text" lang={s.tier === 'model' || s.tier === 'scaffold' ? lang : undefined}>{s.content}</p>
                    {s.options && <p className="faint">Choose one: {s.options.join(' · ')}</p>}
                  </li>
                ))}
              </ol>
            )}

            {task.attempts.length > 0 && (
              <ol className="tell-attempts" aria-label="Your attempts">
                {task.attempts.map((a) => <AttemptView key={a.attemptId} attempt={a} lang={lang} />)}
              </ol>
            )}

            {!done && (
              <>
                <label className="field">
                  <span className="label">Your words</span>
                  <textarea className="editor" lang={lang} rows={3} value={text} spellCheck={false} aria-label="Your words" onChange={(e) => setText(e.target.value)} />
                </label>
                <div className="actions">
                  <button type="button" className="btn btn--primary" disabled={busy || text.trim() === ''} onClick={() => { void submit(); }}>Check</button>
                  {task.nextHint && (
                    <button type="button" className="btn" disabled={busy} onClick={() => { void hint(); }}>Hint: {task.nextHint.label.toLowerCase()}</button>
                  )}
                  <button type="button" className="btn btn--quiet" disabled={busy} onClick={() => { void skip(); }}>Another one</button>
                </div>
              </>
            )}
            {done && last && (
              <div className="note" role="status" data-testid="tell-done">
                <p><strong>{task.closedAs === 'model-reproduced' ? 'You said it with the model in front of you.' : 'You said it.'}</strong> {last.levelBefore !== last.levelAfter ? `P${last.levelBefore} → P${last.levelAfter}: ${LEVEL_TEXT[last.levelAfter]}.` : `Still P${last.levelAfter}: ${LEVEL_TEXT[last.levelAfter]}.`}</p>
                <p className="card__note">{last.rule}</p>
                <div className="actions"><button type="button" className="btn btn--primary" onClick={() => { void load(); }}>Next</button></div>
              </div>
            )}
          </section>
        )}

        <Disclosure label="Something you want to be able to say" className="tell-own">
          <label className="field">
            <span className="card__note">Write the meaning in English. GoTell keeps the meaning, not a translation, and will tell you if it cannot yet recognise its ideas.</span>
            <input type="text" value={own} onChange={(e) => setOwn(e.target.value)} aria-label="What you want to be able to say, in English" />
          </label>
          <button type="button" className="btn btn--small" disabled={own.trim() === ''} onClick={() => { void addOwn(); }}>Add it</button>
          {ownNote && <p className="card__note" role="status">{ownNote}</p>}
        </Disclosure>

        <section aria-label="What you can say" className="tell-states">
          <h2 className="section-head">What you can say</h2>
          <ul className="entrylist">
            {states.map(({ goal, state }) => (
              <li key={goal.id} className="entry entry--static" data-goal-id={goal.id} data-level={state.level}>
                <div className="history-head">
                  <span>{goal.meaning}</span>
                  <span className="chip">{`P${state.level}`} · {LEVEL_TEXT[state.level]}</span>
                </div>
                <button type="button" className="btn btn--small btn--quiet" disabled={busy} onClick={() => { void load(goal.id); }}>Practise this</button>
              </li>
            ))}
          </ul>
          <p className="faint"><a href="#/tell/inspect">How GoTell decides (developer view)</a></p>
        </section>
      </div>
    </div>
  );
}

function AttemptView({ attempt: a, lang }: { attempt: TellAttemptRecord; lang: string }) {
  const zone = a.tier === 'none' ? 'MY LANGUAGE' : 'MY LANGUAGE WITH ASSISTANCE';
  const m = a.meaning;
  return (
    <li className={`tell-attempt tell-attempt--${a.outcome}`} data-outcome={a.outcome}>
      <span className={`tell-zone tell-zone--${a.tier === 'none' ? 'mine' : 'assisted'}`}>{zone}</span>
      <p lang={lang} className="tell-attempt__text">{a.text}</p>
      <p className="card__note">
        {m.success && m.knownLanguageWords.length === 0 ? 'The meaning comes across.' : m.polarity !== 'ok' ? 'The meaning is reversed (yes/no).' : m.knownLanguageWords.length > 0 ? 'Part of it is in English.' : `The meaning is not complete yet: ${m.missing.length} idea${m.missing.length === 1 ? '' : 's'} missing.`}
        {' '}
        {a.language.noIssuesDetected ? 'The checker found nothing (it does not catch everything).' : `The checker found ${a.language.findings.length} thing${a.language.findings.length === 1 ? '' : 's'} to look at — ask for a hint to see where.`}
      </p>
      {a.selfRepair && <p className="faint">You repaired it yourself.</p>}
    </li>
  );
}
