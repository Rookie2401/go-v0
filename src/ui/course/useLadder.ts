/**
 * Reads of the reading ladder for the active course, through the catalogue only (the UI never reads the stage / work tables
 * itself). `stages` is empty for a course without a ladder: that is how a page knows there is none.
 */
import { useCallback, useEffect, useState } from 'react';
import type { Stage, Text, Work } from '../../core';
import { useApp } from '../context';

export interface Ladder {
  stages: Stage[];
  works: Work[];
  textsByWork: Map<string, Text[]>;
  /** The stage the learner is working at (the stored choice, else the catalogue's own pick, else the first). */
  current: Stage | undefined;
}

export interface LadderState {
  /** null while loading. */
  ladder: Ladder | null;
  error: string | null;
  reload(): void;
}

export function useLadder(): LadderState {
  const { catalog, course, userId } = useApp();
  const [ladder, setLadder] = useState<Ladder | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  const reload = useCallback(() => setTick((n) => n + 1), []);

  useEffect(() => {
    let live = true;
    setError(null);
    void (async () => {
      const stages = await catalog.stages(course.id);
      if (stages.length === 0) { if (live) setLadder({ stages, works: [], textsByWork: new Map(), current: undefined }); return; }
      const [works, current] = await Promise.all([catalog.works(course.id), catalog.currentStage(userId, course.id)]);
      const rows = await Promise.all(works.map(async (w) => [w.id, await catalog.textsOf(w.id)] as const));
      if (live) setLadder({ stages, works, textsByWork: new Map(rows), current: current ?? stages[0] });
    })().catch((e: unknown) => { if (live) setError(e instanceof Error ? e.message : String(e)); });
    return () => { live = false; };
  }, [catalog, course.id, userId, tick]);

  return { ladder, error, reload };
}

/** Just the stages and the current one (Home's door). `stages` is null while loading. */
export function useCurrentStage(): { stages: Stage[] | null; current: Stage | undefined } {
  const { catalog, course, userId } = useApp();
  const [state, setState] = useState<{ stages: Stage[] | null; current: Stage | undefined }>({ stages: null, current: undefined });
  useEffect(() => {
    let live = true;
    setState({ stages: null, current: undefined });
    void (async () => {
      const stages = await catalog.stages(course.id);
      const current = stages.length > 0 ? (await catalog.currentStage(userId, course.id)) ?? stages[0] : undefined;
      if (live) setState({ stages, current });
    })().catch(() => { if (live) setState({ stages: [], current: undefined }); });
    return () => { live = false; };
  }, [catalog, course.id, userId]);
  return state;
}
