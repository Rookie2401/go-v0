/**
 * GoTell inspector (/tell/inspect) — the developer view of the productive engine for the current learner and language.
 * Read-only: it calls schedule / states / attempts, none of which records anything.
 *   - the scheduler: every goal's score with each factor's value, weight, contribution and reason
 *   - productive state per goal: level, peak, the rule that set it, spacing, lapses, history
 *   - the attempt log: every immutable record, raw, with its assistance lineage and both assessments
 *   - the error taxonomy in use
 */
import { useEffect, useState } from 'react';
import type { ProductiveGoalState, ScheduleCandidate, SemanticGoal, TellAttemptRecord } from '../../core';
import { allErrorCodes } from '../../gotell';
import { useApp } from '../context';
import { formatDate } from '../format';
import { BackLink, Disclosure, Topbar } from '../ui';
import { LEVEL_TEXT } from './Practice';
import './tell.css';

export function TellInspector() {
  const { gotell, userId, lang } = useApp();
  const practice = gotell.practice;
  const [data, setData] = useState<{ schedule: ScheduleCandidate[]; states: ProductiveGoalState[]; goals: SemanticGoal[]; attempts: TellAttemptRecord[] } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!practice) return;
    let live = true;
    void Promise.all([practice.schedule(userId, lang), practice.states(userId, lang), practice.goals(userId, lang), practice.attempts(userId, lang)])
      .then(([schedule, states, goals, attempts]) => { if (live) setData({ schedule, states, goals, attempts }); })
      .catch((e: unknown) => { if (live) setError(e instanceof Error ? e.message : String(e)); });
    return () => { live = false; };
  }, [practice, userId, lang]);

  const meaningOf = (goalId: string) => data?.goals.find((g) => g.id === goalId)?.meaning ?? goalId;

  return (
    <div>
      <Topbar title="GoTell inspector" left={<BackLink to="/tell" label="Practice" />} />
      <div className="page tell-inspect route-fade">
        <p className="soft">Developer view: how GoTell chooses what to practise and what it knows about your production. Nothing here records anything.</p>
        {!practice && <p className="muted">The practice engine is not part of this version.</p>}
        {error && <p role="alert" className="error">{error}</p>}
        {practice && !data && !error && <p className="muted" role="status">Loading…</p>}
        {data && (
          <>
            <section aria-label="Scheduler">
              <h2 className="section-head">Scheduler ({data.schedule[0]?.selection.policy ?? '—'})</h2>
              <p className="card__note">Score = Σ weight × factor. Predicted success is a heuristic from level, reading input and lapses — not a measurement.</p>
              {data.schedule.map((c, i) => (
                <div key={c.goal.id} className="cand" data-goal-id={c.goal.id}>
                  <p><strong>{i + 1}. {c.goal.meaning}</strong> <span className="chip">score {c.selection.score.toFixed(3)}</span> <span className="chip">{c.family}</span> <span className="chip">P{c.state.level}</span> <span className="chip">predicted {Math.round(c.selection.predictedSuccess * 100)} %</span></p>
                  <p className="card__note">Selected because: {c.selection.reasons.join(' ')} · {c.selection.familyReason} · first hint at rung {c.selection.startRung}: {c.selection.startReason}</p>
                  <table aria-label={`Factors for ${c.goal.id}`}>
                    <thead><tr><th>factor</th><th>value</th><th>weight</th><th>contribution</th><th>reason</th></tr></thead>
                    <tbody>
                      {c.selection.factors.map((f) => (
                        <tr key={f.key}><td>{f.key}</td><td className="num">{f.value.toFixed(3)}</td><td className="num">{f.weight}</td><td className="num">{f.contribution.toFixed(3)}</td><td>{f.reason}</td></tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ))}
            </section>

            <section aria-label="Productive state">
              <h2 className="section-head">Productive state</h2>
              <table>
                <thead><tr><th>goal</th><th>level</th><th>peak</th><th>rule</th><th>due</th><th>lapses</th><th>independent days</th><th>task kinds</th></tr></thead>
                <tbody>
                  {data.states.map((s) => (
                    <tr key={s.goalId} data-goal-id={s.goalId}>
                      <td>{meaningOf(s.goalId)}</td><td className="num">P{s.level} {LEVEL_TEXT[s.level]}</td><td className="num">P{s.peak}</td><td>{s.rule}</td>
                      <td>{s.dueAt ? formatDate(s.dueAt) : '—'}</td><td className="num">{s.lapses}</td><td>{s.independentDays.join(', ') || '—'}</td><td>{s.independentFamilies.join(', ') || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>

            <section aria-label="Attempt log">
              <h2 className="section-head">Attempts ({data.attempts.length})</h2>
              {data.attempts.length === 0 ? <p className="muted">No attempts yet.</p> : (
                <ol className="entrylist">
                  {[...data.attempts].reverse().map((a) => (
                    <li key={a.attemptId} className="entry entry--static">
                      <p><span lang={lang}>{a.text}</span> — {a.outcome}, support {a.tier}, P{a.levelBefore} → P{a.levelAfter}{a.selfRepair ? ', self-repair' : ''}{a.afterModel ? ', after model' : ''}</p>
                      <p className="card__note">{a.rule}</p>
                      <Disclosure label="Raw record" lazy><pre>{JSON.stringify(a, null, 2)}</pre></Disclosure>
                    </li>
                  ))}
                </ol>
              )}
            </section>

            <section aria-label="Error taxonomy">
              <h2 className="section-head">Error taxonomy</h2>
              <table>
                <thead><tr><th>code</th><th>family</th><th>label</th></tr></thead>
                <tbody>{allErrorCodes().map((e) => <tr key={e.code}><td>{e.code}</td><td>{e.family}</td><td>{e.label}</td></tr>)}</tbody>
              </table>
            </section>
          </>
        )}
      </div>
    </div>
  );
}
