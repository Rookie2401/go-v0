/**
 * /course — the reading ladder of a course that has one (Thai): stages in order, the stage the learner is working at open and
 * the rest collapsed, each with its works grouped as main reading / also at this stage / nonfiction / extensive / listening.
 * A work is a recommendation; it becomes readable when the learner adds his own copy (see CopyImporter).
 *
 * Deliberately plain: no locks, no badges, no percentages on the list, nothing that looks like a score. For a course without
 * stages the route goes home.
 */
import { useMemo } from 'react';
import { Navigate } from 'react-router-dom';
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
  const { catalog, course, userId } = useApp();
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
  if (ladder.stages.length === 0) return <Navigate to="/" replace />;

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
          A path of real {languageName(course)} books, from the first steps in reading to open reading. The books are recommendations:
          Go does not supply them. You read each one from a copy of your own, and it stays on this device.
        </p>
        <StageStatus stages={ladder.stages} current={current} onChange={(id) => { void choose(id); }} />
        <div className="course__stages">
          {ladder.stages.map((s) => (
            // Re-keyed when it becomes the current stage, so it opens by itself after "Change".
            <StageSection
              key={`${s.id}|${s.id === current.id}`} stage={s} open={s.id === current.id}
              works={ladder.works.filter((w) => w.stageId === s.id)} visible={visibleByWork} progress={progress} onImported={reload}
            />
          ))}
        </div>
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
