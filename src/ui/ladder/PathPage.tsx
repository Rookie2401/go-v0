/**
 * Your path (#/path) — the ladder of the active language (docs/LADDER.md): Stage 0 first, then the units in order, grouped A1 / A2 /
 * B1 bridge, each done / next / later. The units are machine-drafted until a native speaker has reviewed them and a person has
 * recorded them: in normal use an unpublished unit is listed with the reason it is held back and has no link; in preview mode it opens.
 * The logic is `createLadderPath` (src/ladder/path.ts); this page only shows it.
 */
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { createLadderPath } from '../../ladder/path';
import type { LadderSource } from '../../ladder/bundle';
import type { PathUnit, PathView, Stage0Status } from '../../ladder/path';
import { useApp } from '../context';
import { usePreview } from '../prefs';
import { BackLink, Topbar } from '../ui';
import './path.css';

const STATE_WORDS: Record<PathUnit['state'], string> = { done: 'done', next: 'next', later: 'later' };
const DOMAIN_WORDS: Record<string, string> = {
  'daily-life': 'daily life', conversation: 'conversation', narrative: 'story', practical: 'practical', explanation: 'explanation', biography: 'biography',
  instructions: 'instructions', correspondence: 'letters', nonfiction: 'nonfiction', scripture: 'Scripture',
};
const domainWords = (d: string): string => DOMAIN_WORDS[d] ?? d.replace(/-/g, ' ');

/** `source`: the bundled ladders (default: the real ones; tests pass a synthetic ladder). */
export function PathPage({ source }: { source?: LadderSource } = {}) {
  const { store, golearn, stage0, bus, userId, lang, course } = useApp();
  const preview = usePreview();
  const path = useMemo(() => createLadderPath({ store, golearn, ...(stage0 ? { stage0 } : {}), ...(source ? { source } : {}) }), [store, golearn, stage0, source]);
  const [view, setView] = useState<PathView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  // A finished text or a Stage 0 step moves the path: read it again.
  useEffect(() => bus.subscribe((e) => {
    if (e.userId === userId && (e.type === 'TextCompleted' || e.type === 'Stage0StepCompleted' || e.type === 'Stage0ExitFinished')) setTick((n) => n + 1);
  }), [bus, userId]);

  useEffect(() => {
    let live = true;
    void path.view(userId, lang, { preview }).then(
      (v) => { if (live) { setView(v); setError(null); } },
      (e) => { if (live) setError(e instanceof Error ? e.message : String(e)); },
    );
    return () => { live = false; };
  }, [path, userId, lang, preview, tick]);

  const name = course.title.split('→').pop()?.trim() ?? lang;

  return (
    <div>
      <Topbar title="Your path" left={<BackLink to="/" label="Home" />} />
      <div className="page page--narrow path route-fade">
        <h1 className="path__title">Your path in {name}</h1>
        <p className="soft">
          The order Go suggests for reading, from your first words towards texts written for native readers. It is a default route, not a cage: you can always read something else from the library.
        </p>
        {view?.hasLadder && <p className="note note--warn" role="note" data-testid="path-draft">
          These units are written with the help of an AI model. Until a native speaker has reviewed a unit and a person has recorded it, it is a draft: Go keeps drafts closed
          {preview ? ' — but preview mode is on, so you can open them. Expect mistakes.' : ' unless you turn preview on in Settings.'}
        </p>}
        {error && <p role="alert" className="error">{error}</p>}
        {!view && !error && <p className="muted" role="status">Reading your path…</p>}
        {view && !view.hasLadder && (
          <div data-testid="path-none">
            <p className="muted">There is no ladder for {name} yet.</p>
            <p><Link to="/read">Read from the library</Link></p>
          </div>
        )}
        {view?.hasLadder && (
          <>
            <NextStep view={view} />
            {view.stage0.applicable && <Stage0Line s={view.stage0} />}
            {view.groups.map((g) => (
              <section key={g.id} className="path__group" aria-label={g.label} data-group={g.id}>
                <h2 className="section-head">{g.label}</h2>
                <ol className="path__units">
                  {g.units.map((u) => <UnitRow key={u.unitId} unit={u} />)}
                </ol>
              </section>
            ))}
          </>
        )}
      </div>
    </div>
  );
}

function NextStep({ view }: { view: PathView }) {
  const n = view.next;
  if (n.kind === 'stage0') {
    return (
      <div className="actions" data-testid="path-next" data-next="stage0">
        <Link className="btn btn--primary" to={n.to}>{view.stage0.scenesDone > 0 ? 'Continue' : 'Begin'} with Stage 0</Link>
        <span className="card__note">Your path starts with Stage 0, the first scenes of the language.</span>
      </div>
    );
  }
  if (n.kind === 'unit') {
    return (
      <div className="actions" data-testid="path-next" data-next="unit" data-unit={n.unit.unitId}>
        <Link className="btn btn--primary" to={n.to}>Next: {n.unit.title}</Link>
        {!n.unit.published && <span className="card__note">A draft, open because preview is on.</span>}
      </div>
    );
  }
  if (n.kind === 'finished') return <p data-testid="path-next" data-next="finished"><strong>You have finished every unit on this path.</strong> The library is yours to read.</p>;
  return <p className="card__note" data-testid="path-next" data-next="waiting">{n.kind === 'waiting' ? n.reason : ''}</p>;
}

function Stage0Line({ s }: { s: Stage0Status }) {
  const verdict = s.verdict === 'ready' ? 'ready for real texts'
    : s.verdict === 'ready-provisional' ? 'ready for real texts, listening not yet tested'
    : s.verdict === 'not-yet' ? 'the result said not yet' : undefined;
  return (
    <section className="path__stage0" aria-label="Stage 0" data-testid="path-stage0" data-done={s.done}>
      <h2 className="section-head">Stage 0 — start from zero</h2>
      {s.done ? (
        <p>
          <span className="chip">done</span>{' '}
          {s.by === 'exit' ? `You passed the reading part of the Stage 0 check${verdict ? `: ${verdict}` : ''}.` : 'You opened this path yourself ("I know this already").'}{' '}
          <Link to="/start">Go back to Stage 0</Link>
        </p>
      ) : (
        <p>
          <span className="chip">{s.scenesDone > 0 ? 'started' : 'not started'}</span>{' '}
          {s.scenesDone} of {s.scenesTotal} scenes done. The units below open when the reading part of the Stage 0 check is passed{s.readingNotPassed ? ' (the reading part did not pass yet)' : ''}, or when you open the path yourself. <Link to="/start">Open Stage 0</Link>
        </p>
      )}
    </section>
  );
}

function UnitRow({ unit: u }: { unit: PathUnit }) {
  return (
    <li className={`path__unit path__unit--${u.state}`} data-unit={u.unitId} data-state={u.state} data-published={u.published} data-openable={u.openable}>
      <div className="path__line">
        {u.to ? <Link to={u.to}>{u.title}</Link> : <span className="path__closed">{u.title}</span>}
        <span className="chip">{STATE_WORDS[u.state]}</span>
      </div>
      <div className="card__note">
        {domainWords(u.domain)}{u.words ? ` · about ${u.words} words` : ''}
        {u.heldBack && <span className="path__why" data-testid="path-why"> — {u.heldBack}{u.openable ? ' (open in preview)' : ''}</span>}
      </div>
    </li>
  );
}
