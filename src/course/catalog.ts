/**
 * The course catalogue: the reading ladder of a course (stages and the works recommended at each) held in the store, and
 * the questions the reader and the course pages ask of it.
 *
 * `install` seeds the store from the ladder data (src/course/thai.ts for `thailand-th`). A work listed in the ladder is a
 * RECOMMENDATION; it becomes readable only when texts for it are imported (each text carries `workId` + `chapter`).
 * Rights are recorded, never assumed: once a person has verified a work's rights or its bibliography, a later install
 * never overwrites what he recorded.
 *
 * The stage the learner is working at is his own choice when he has made one (meta `stage:<userId>:<courseId>`);
 * otherwise it is the first stage whose readiness verdict is not 'ready-to-advance' (advice from GoLearn, never a lock).
 */
import type { AppStore, AssistanceProfile, CourseCatalog, GoLearn, Stage, Stream, Text, Work } from '../core';
import { DEFAULT_ASSISTANCE } from '../core';
import { GERMAN_COURSE_ID, GERMAN_SHELVES, GERMAN_STREAMS, GERMAN_WORKS } from './german';
import { SPANISH_COURSE_ID, SPANISH_SHELVES, SPANISH_STREAMS, SPANISH_WORKS } from './spanish';
import { THAI_COURSE_ID, THAI_STAGES, THAI_WORKS } from './thai';

export interface CourseCatalogDeps {
  store: AppStore;
  /** Needed for currentStage (stage readiness). Without it currentStage returns the stored choice or the first stage. */
  golearn?: Pick<GoLearn, 'stageReadiness'>;
  /** Time source for the stored choice (tests). */
  clock?: () => string;
}

/** The `meta` row that holds the learner's chosen stage for a course (value = stage id). */
export const stageMetaId = (userId: string, courseId: string) => `stage:${userId}:${courseId}`;

/** The ladders this build ships: course id → stages and works. A course without an entry has no ladder. */
const LADDERS: Record<string, { stages: Stage[]; works: Work[] }> = {
  [THAI_COURSE_ID]: { stages: THAI_STAGES, works: THAI_WORKS },
  // Spanish: the stages are SHELVES (a browsing orientation of a large library, never a gate)
  [SPANISH_COURSE_ID]: { stages: SPANISH_SHELVES, works: SPANISH_WORKS },
  [GERMAN_COURSE_ID]: { stages: GERMAN_SHELVES, works: GERMAN_WORKS },
};

/** The content streams of the courses that have them. */
const STREAMS: Record<string, Stream[]> = {
  [SPANISH_COURSE_ID]: SPANISH_STREAMS,
  [GERMAN_COURSE_ID]: GERMAN_STREAMS,
};

/** Accent- and case-insensitive text for matching titles and authors. */
const fold = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/** Bibliographic fields of a work (what `bibliographyVerified` vouches for). */
const BIBLIOGRAPHY = ['title', 'author', 'publisher', 'edition', 'isbn', 'source', 'digitalAvailability', 'bibliographyVerified'] as const;

/** Fresh ladder data, except that what a person has verified (rights or bibliography) keeps its stored value. */
export function mergeWork(fresh: Work, stored: Work | undefined): Work {
  const row: Work = structuredClone(fresh);
  if (!stored || !(stored.rights?.verified || stored.bibliographyVerified)) return row;
  const keep = row as unknown as Record<string, unknown>;
  const was = stored as unknown as Record<string, unknown>;
  keep.rights = structuredClone(stored.rights);
  for (const f of BIBLIOGRAPHY) {
    if (was[f] === undefined) delete keep[f]; else keep[f] = was[f];
  }
  return row;
}

const byStageThenWork = (stageIndex: Map<string, number>) => (a: Work, b: Work) =>
  (stageIndex.get(a.stageId) ?? 1e9) - (stageIndex.get(b.stageId) ?? 1e9)
  || Number(b.role === 'spine') - Number(a.role === 'spine')
  || a.order - b.order
  || (a.id < b.id ? -1 : 1);

export function createCourseCatalog(deps: CourseCatalogDeps): CourseCatalog {
  const { store, golearn } = deps;
  const clock = deps.clock ?? (() => new Date().toISOString());

  const stages = async (courseId: string): Promise<Stage[]> =>
    (await store.stages.where('courseId', courseId)).sort((a, b) => a.index - b.index || (a.id < b.id ? -1 : 1));

  const catalog: CourseCatalog = {
    async install(courseId) {
      const ladder = LADDERS[courseId];
      if (!ladder) return; // a course without a ladder: nothing to install
      const storedWorks = await store.works.getMany(ladder.works.map((w) => w.id));
      await store.transaction(['stages', 'works'], async () => {
        await store.stages.bulkPut(ladder.stages.map((s) => structuredClone(s)));
        await store.works.bulkPut(ladder.works.map((w, i) => mergeWork(w, storedWorks[i])));
      });
    },

    stages,

    async streams(courseId) {
      return structuredClone(STREAMS[courseId] ?? []).sort((a, b) => a.order - b.order || (a.key < b.key ? -1 : 1));
    },

    async findWorks(q) {
      const needle = q.text ? fold(q.text.trim()) : '';
      const order = new Map((await stages(q.courseId)).map((s) => [s.id, s.index]));
      const matched = (await store.works.where('courseId', q.courseId)).filter((w) =>
        (!q.stream || (w.streams ?? []).includes(q.stream))
        && (!q.stageId || w.stageId === q.stageId)
        && (!q.domain || (w.domains ?? []).includes(q.domain))
        && (!q.variety || w.variety === q.variety)
        && (!q.rights || (w.rights.state ?? '') === q.rights)
        && (!needle || fold(w.title).includes(needle) || fold(w.author ?? '').includes(needle))).sort(byStageThenWork(order));
      const offset = Math.max(0, q.offset ?? 0);
      const limit = Math.min(200, Math.max(1, q.limit ?? 30));
      return { total: matched.length, items: matched.slice(offset, offset + limit) };
    },

    async works(courseId, stageId) {
      const order = new Map((await stages(courseId)).map((s) => [s.id, s.index]));
      return (await store.works.where('courseId', courseId))
        .filter((w) => !stageId || w.stageId === stageId)
        .sort(byStageThenWork(order));
    },

    work: (workId) => store.works.get(workId),

    async textsOf(workId) {
      return (await store.texts.where('workId', workId)).sort((a: Text, b: Text) =>
        (a.chapter?.index ?? Number.POSITIVE_INFINITY) - (b.chapter?.index ?? Number.POSITIVE_INFINITY)
        || (a.title < b.title ? -1 : a.title > b.title ? 1 : 0)
        || (a.id < b.id ? -1 : 1));
    },

    async stageOfText(textId) {
      const text = await store.texts.get(textId);
      if (!text?.workId) return undefined;
      const work = await store.works.get(text.workId);
      return work ? store.stages.get(work.stageId) : undefined;
    },

    async assistanceFor({ courseId, textId, currentStageId }) {
      const copy = (p: AssistanceProfile): AssistanceProfile => structuredClone(p);
      // A shelf never changes the reader: the word sheet is the same everywhere (the shelf's profile is the default one).
      const profile = (s: Stage) => (s.kind === 'shelf' ? copy(DEFAULT_ASSISTANCE) : copy(s.assistance));
      if (textId) {
        const stage = await catalog.stageOfText(textId);
        if (stage && stage.courseId === courseId) return profile(stage);
      }
      if (currentStageId) {
        const stage = await store.stages.get(currentStageId);
        if (stage && stage.courseId === courseId) return profile(stage);
      }
      return copy(DEFAULT_ASSISTANCE);
    },

    async currentStage(userId, courseId) {
      const all = await stages(courseId);
      if (all.length === 0) return undefined;
      if (all.every((s) => s.kind === 'shelf')) return undefined; // shelves are for browsing: there is no stage the learner is "at"
      const stored = await store.meta.get(stageMetaId(userId, courseId));
      const chosen = stored ? all.find((s) => s.id === stored.value) : undefined;
      if (chosen) return chosen;
      if (!golearn) return all[0];
      for (const s of all) {
        if ((await golearn.stageReadiness(userId, courseId, s.id)).verdict !== 'ready-to-advance') return s;
      }
      return all[all.length - 1]; // ready to move past every stage: the last one is where he is
    },

    async setCurrentStage(userId, courseId, stageId) {
      const stage = await store.stages.get(stageId);
      if (!stage || stage.courseId !== courseId) throw new Error(`unknown stage for ${courseId}: ${stageId}`);
      await store.meta.put({ id: stageMetaId(userId, courseId), value: stageId, updatedAt: clock() });
    },
  };
  return catalog;
}
