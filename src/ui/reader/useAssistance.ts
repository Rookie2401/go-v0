/**
 * The assistance profile the reader should use for a text: the course catalogue's answer for the text's stage (or the
 * learner's current stage for a text outside the ladder). A course without a ladder — and an app whose catalogue is
 * not wired — gets DEFAULT_ASSISTANCE, which keeps the reader exactly as it always was.
 */
import { useEffect, useState } from 'react';
import { DEFAULT_ASSISTANCE } from '../../core';
import type { AssistanceProfile, CourseCatalog } from '../../core';
import { useApp } from '../context';

/** `null` while the profile is being read, so the reader does not flash chrome it is about to hide. */
export function useAssistance(textId: string): AssistanceProfile | null {
  // Tolerated missing at runtime (a test or an older wiring that provides no catalogue): the reader is then as it always was.
  const { userId, course, catalog } = useApp() as ReturnType<typeof useApp> & { catalog?: CourseCatalog };
  const [state, setState] = useState<{ key: string; profile: AssistanceProfile } | null>(null);
  const key = `${userId}|${course.id}|${textId}`;
  useEffect(() => {
    if (!catalog) return;
    let live = true;
    void (async () => {
      let profile = DEFAULT_ASSISTANCE;
      try {
        const current = await catalog.currentStage(userId, course.id);
        // The shelf a learner is working at is for readiness and the course page: it never sets the help of a text (a text on a
        // shelf has its shelf's profile, a ladder unit its stage's, a text on no shelf its course's off-shelf profile, e.g. Hindi's
        // romanization rescue), so only a stage of a ladder (Thai, Albanian) is passed on.
        const stageId = current && current.kind !== 'shelf' ? current.id : undefined;
        profile = (await catalog.assistanceFor({ courseId: course.id, textId, currentStageId: stageId })) ?? DEFAULT_ASSISTANCE;
      } catch { /* the ladder is a convenience: a failing catalogue leaves the reader as it always was */ }
      if (live) setState({ key, profile });
    })();
    return () => { live = false; };
  }, [catalog, userId, course.id, textId, key]);
  if (!catalog) return DEFAULT_ASSISTANCE;
  return state && state.key === key ? state.profile : null;
}
