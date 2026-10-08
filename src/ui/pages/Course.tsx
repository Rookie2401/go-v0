/**
 * /course — the reading ladder of a course that has one (Thai): stages in order, the stage the learner is working at open and
 * the rest collapsed, each with its works grouped as main reading / also at this stage / nonfiction / extensive / listening.
 * A work is a recommendation; it becomes readable when the learner adds his own copy (see CopyImporter).
 *
 * Deliberately plain: no locks, no badges, no percentages on the list, nothing that looks like a score. A course whose stages are
 * shelves (Spanish, German, Hindi, Norwegian) shows the shelf the learner is working at with the same readiness and pace
 * ("How is this going?"); for a course without stages the route goes home.
 */
import { useEffect, useMemo, useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import type { Stage, Text, Work } from '../../core';
import { useApp } from '../context';
import { useReadingProgress } from '../coverage';
import { StageStatus } from '../course/StageStatus';
import { WorkCard } from '../course/WorkCard';
import { useLadder } from '../course/useLadder';
import { groupWorks } from '../course/wording';
import { isVisibleText, languageName } from '../format';
import { usePreview } from '../prefs';
import { BackLink, Disclosure, Topbar } from '../ui';
import '../course/course.css';

export function CoursePage() {
  const { catalog, course, userId, features } = useApp();
  const preview = usePreview();
  const { ladder, error, reload } = useLadder();

  const visibleByWork = useMemo(() => {
    const m = new Map<string, { shown: Text[]; held: number }>();
    for (const [workId, texts] of ladder?.textsByWork ?? []) {
      const shown = texts.filter((t) => isVisibleText(t, preview));
      m.set(workId, { shown, held: texts.length - shown.length });
    }
    return m;
  }, [ladder, preview]);
  const textIds = useMemo(() => [...visibleByWork.values()].flatMap((v) => v.shown.map((t) => t.id)), [visibleByWork]);
  const progress = useReadingProgress(textIds);

  const bar = <Topbar title="Reading ladder" left={<BackLink to="/" label="Home" />} />;
  if (error) return <div>{bar}<div className="page page--narrow"><p role="alert" className="error">Could not load the reading ladder: {error}</p></div></div>;
  if (ladder === null) return <div>{bar}<div className="page page--narrow"><p className="muted" role="status">Loading…</p></div></div>;
  // A course whose stages are shelves (Spanish, German, Hindi, Norwegian) has no ladder to list, but the learner still gets the
  // same honest signals: the shelf he is working at, and how that shelf is going.
  if (ladder.stages.length === 0) return <ShelfCourse />;

  const current = ladder.current ?? ladder.stages[0];
  const choose = async (stageId: string) => {
    await catalog.setCurrentStage(userId, course.id, stageId);
    reload();
  };

  return (
    <div>
      {bar}
      <div className="page page--narrow route-fade course">
        <p className="course__intro">
          A catalogue of {languageName(course)} reading, from first steps to open reading. Some texts are supplied under verified rights;
          other books are recommendations that require your own lawful copy.
        </p>
        <p className="card__note"><Link to="/curriculum">Reading path</Link> shows which stages have published material and which still have gaps.</p>
        <StageStatus stages={ladder.stages} current={current} onChange={(id) => { void choose(id); }} />
        <div className="course__stages">
          {ladder.stages.map((s) => (
            // Re-keyed when it becomes the current stage, so it opens by itself after "Change".
            <StageSection
              key={`${s.id}|${s.id === current.id}`} stage={s} open={s.id === current.id}
              works={ladder.works.filter((w) => w.stageId === s.id && (features.listen || w.role !== 'audio'))} visible={visibleByWork} progress={progress} onImported={reload}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

/**
 * The page of a course that has shelves instead of a ladder: the shelf the learner is working at (his choice, else the first
 * whose readiness is not yet "ready to advance"), "How is this going?" for it, and where to find the reading. The shelves
 * themselves are browsed from Explore and the reading path. For a course with no stages at all the route goes home.
 */
function ShelfCourse() {
  const { catalog, course, userId } = useApp();
  const [tick, setTick] = useState(0);
  const [state, setState] = useState<{ shelves: Stage[]; current: Stage | undefined } | 'error' | null>(null);
  useEffect(() => {
    let live = true;
    void (async () => {
      const shelves = await catalog.stages(course.id);
      const current = shelves.length > 0 ? (await catalog.currentStage(userId, course.id)) ?? shelves[0] : undefined;
      if (live) setState({ shelves, current });
    })().catch(() => { if (live) setState('error'); });
    return () => { live = false; };
  }, [catalog, course.id, userId, tick]);

  const bar = <Topbar title="Your reading" left={<BackLink to="/" label="Home" />} />;
  if (state === 'error') return <div>{bar}<div className="page page--narrow"><p role="alert" className="error">Could not load your reading shelves.</p></div></div>;
  if (state === null) return <div>{bar}<div className="page page--narrow"><p className="muted" role="status">Loading…</p></div></div>;
  if (!state.current) return <Navigate to="/" replace />;
  const choose = async (stageId: string) => {
    await catalog.setCurrentStage(userId, course.id, stageId);
    setTick((n) => n + 1);
  };
  return (
    <div>
      {bar}
      <div className="page page--narrow route-fade course" data-testid="shelf-course">
        <p className="course__intro">
          The {languageName(course)} library is arranged on shelves, from texts written for the course to open reading. A shelf is a
          place to browse and sets how much help the reader offers; it is never a gate.
        </p>
        <p className="card__note"><Link to="/explore">Explore</Link> opens the library, and <Link to="/path">Your path</Link> shows the units written for the course.</p>
        <StageStatus stages={state.shelves} current={state.current} onChange={(id) => { void choose(id); }} />
      </div>
    </div>
  );
}

function StageSection({ stage, open, works, visible, progress, onImported }: {
  stage: Stage; open: boolean; works: Work[]; visible: Map<string, { shown: Text[]; held: number }>;
  progress: ReturnType<typeof useReadingProgress>; onImported(): void;
}) {
  const groups = groupWorks(works);
  return (
    <section className="stage" aria-label={stage.label} data-stage={stage.id}>
      <Disclosure
        headingLevel={2} defaultOpen={open} lazy className="stage__disclosure"
        label={<>{stage.label}{stage.band && <span className="stage__band"> · {stage.band}</span>}</>}
      >
        {stage.purpose.length > 0 && (
          <ul className="stage__purpose reasons" aria-label={`What ${stage.label} is for`}>{stage.purpose.map((p) => <li key={p}>{p}</li>)}</ul>
        )}
        {stage.band && <p className="card__note">The band is an orientation, not a requirement.</p>}
        {groups.length === 0 && <p className="muted">No books are listed for this stage.</p>}
        {groups.map((g) => (
          <div key={g.key} className="stage__group" data-group={g.key}>
            <h3 className="stage__group-head label">{g.label}</h3>
            <ul className="list work-list">
              {g.works.map((w) => {
                const v = visible.get(w.id) ?? { shown: [], held: 0 };
                return <WorkCard key={w.id} work={w} texts={v.shown} held={v.held} progress={progress} onImported={onImported} />;
              })}
            </ul>
          </div>
        ))}
      </Disclosure>
    </section>
  );
}
