/**
 * "You are working at: <stage>" with a quiet Change control, and a collapsed "How is this going?" that shows the stage
 * readiness signals and the reading pace. Advice only: no lock, no badge, no score. Each signal says in words what it
 * measured and whether it is met, not yet met, without enough reading yet, or not available.
 */
import { useEffect, useId, useState } from 'react';
import type { ReadingPace, Stage, StageReadiness } from '../../core';
import { useApp } from '../context';
import { Disclosure } from '../ui';
import { UnseenCheck } from './UnseenCheck';
import { SIGNAL_LABEL, SIGNAL_STATUS_WORD, paceLines } from './wording';
import './course.css';

export function StageStatus({ stages, current, onChange }: { stages: Stage[]; current: Stage; onChange(stageId: string): void }) {
  const [changing, setChanging] = useState(false);
  const selectId = useId();
  const panelId = useId();
  return (
    <section className="stage-status" aria-label="Your stage">
      <p className="stage-status__line">
        <span>You are working at: </span>
        <strong data-testid="current-stage">{current.label}</strong>
        <button
          type="button" className="btn btn--quiet btn--small stage-status__change" aria-expanded={changing} aria-controls={panelId}
          onClick={() => setChanging((v) => !v)}
        >
          Change
        </button>
      </p>
      <div id={panelId} hidden={!changing} className="stage-status__pick">
        <label htmlFor={selectId} className="label">Stage you are working at</label>
        <select
          id={selectId} value={current.id}
          onChange={(e) => { setChanging(false); if (e.target.value !== current.id) onChange(e.target.value); }}
        >
          {stages.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
        </select>
        <p className="card__note">
          {current.kind === 'shelf'
            ? 'This only decides which shelf the readiness below is about. The help the reader offers follows the shelf a text is on. You can read anything.'
            : 'This only decides which stage opens first and how much help the reader offers. You can read anything.'}
        </p>
      </div>
      <Disclosure label="How is this going?" lazy className="stage-status__going">
        <Going stage={current} />
      </Disclosure>
      <UnseenCheck stage={current} />
    </section>
  );
}

function Going({ stage }: { stage: Stage }) {
  const { golearn, userId, course, lang } = useApp();
  const [state, setState] = useState<{ readiness: StageReadiness; pace: ReadingPace } | 'error' | null>(null);
  useEffect(() => {
    let live = true;
    setState(null);
    void (async () => {
      await golearn.settled();
      const [readiness, pace] = await Promise.all([
        golearn.stageReadiness(userId, course.id, stage.id),
        golearn.readingPace(userId, { stageId: stage.id, lang }),
      ]);
      if (live) setState({ readiness, pace });
    })().catch(() => { if (live) setState('error'); });
    return () => { live = false; };
  }, [golearn, userId, course.id, lang, stage.id]);

  if (state === null) return <p className="muted" role="status">Looking at your reading…</p>;
  if (state === 'error') return <p className="muted" role="status">This could not be worked out just now. Nothing is lost; try again later.</p>;
  const { readiness, pace } = state;
  return (
    <div className="going" data-testid="readiness">
      <p className="going__explain">{readiness.explanation}</p>
      <ul className="going__signals" aria-label="What was looked at">
        {readiness.signals.map((s) => (
          <li key={s.key} data-signal={s.key} data-status={s.status}>
            <span className="going__name">{SIGNAL_LABEL[s.key] ?? s.key}</span>
            <span className="going__status">{SIGNAL_STATUS_WORD[s.status]}</span>
            <p className="card__note">{s.explanation}</p>
          </li>
        ))}
      </ul>
      <div className="going__pace" data-testid="pace">
        {paceLines(pace).map((l) => <p key={l} className="card__note">{l}</p>)}
      </div>
      <p className="card__note">This is advice from several signals, not a gate. Nothing is locked, and finishing a book does not decide it.</p>
    </div>
  );
}
