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
import { ALBANIAN_COURSE_ID, ALBANIAN_STAGES, ALBANIAN_STREAMS, ALBANIAN_WORKS } from './albanian';
import { GERMAN_COURSE_ID, GERMAN_LADDER_SHELF, GERMAN_SHELVES, GERMAN_STREAMS, GERMAN_WORKS } from './german';
import { HINDI_COURSE_ID, HINDI_OUTSIDE_ASSISTANCE, HINDI_SHELVES, HINDI_STREAMS, HINDI_WORKS } from './hindi';
import { LATIN_COURSE_ID, LATIN_SHELVES, LATIN_STREAMS, LATIN_WORKS } from './latin';
import { NORWEGIAN_COURSE_ID, NORWEGIAN_LADDER_SHELF, NORWEGIAN_SHELVES, NORWEGIAN_STREAMS, NORWEGIAN_WORKS } from './norwegian';
import { SPANISH_COURSE_ID, SPANISH_LADDER_SHELF, SPANISH_SHELVES, SPANISH_STREAMS, SPANISH_WORKS } from './spanish';
import { THAI_COURSE_ID, THAI_STAGES, THAI_STREAMS, THAI_WORKS } from './thai';
import { getStageContract } from './curriculumPolicy';

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
const LADDERS: Record<string, { stages: Stage[]; works: Work[]; outside?: AssistanceProfile }> = {
  [THAI_COURSE_ID]: { stages: THAI_STAGES, works: THAI_WORKS },
  // Spanish: the stages are SHELVES (a browsing orientation of a large library, never a gate)
  [SPANISH_COURSE_ID]: { stages: SPANISH_SHELVES, works: SPANISH_WORKS },
  [GERMAN_COURSE_ID]: { stages: GERMAN_SHELVES, works: GERMAN_WORKS },
  // Albanian: ten stages and an open stage, each with its help profile; a description of the course's own texts, never a gate
  [ALBANIAN_COURSE_ID]: { stages: ALBANIAN_STAGES, works: ALBANIAN_WORKS },
  // Hindi: shelves that carry a help profile each (decoding the script first at Stage 0); `outside` is the profile of a
  // text on no shelf (the learner's own book, his testimony)
  [HINDI_COURSE_ID]: { stages: HINDI_SHELVES, works: HINDI_WORKS, outside: HINDI_OUTSIDE_ASSISTANCE },
  // Norwegian: shelves like German (a browsing orientation, never a gate); empty until the Norwegian catalogue is filled in
  [NORWEGIAN_COURSE_ID]: { stages: NORWEGIAN_SHELVES, works: NORWEGIAN_WORKS },
  // Latin: shelves over the bundled public-domain works (Ritchie's Fabulae Faciles, Caesar, the Clementine Vulgate); a browsing orientation, never a gate
  [LATIN_COURSE_ID]: { stages: LATIN_SHELVES, works: LATIN_WORKS },
};

/**
 * The courses whose reading ladder (data/ladder/<lang>: a1-1 … b1-bridge) sits on the shelves for help: ladder stage → shelf
 * key. A ladder unit is a text with no work, so no shelf of its own; `assistanceFor` gives it the profile of the nearest shelf.
 * A course not listed here is untouched (Thai, Albanian and Hindi keep the answers they always gave).
 */
const LADDER_SHELF: Record<string, Record<string, string>> = {
  [SPANISH_COURSE_ID]: SPANISH_LADDER_SHELF,
  [GERMAN_COURSE_ID]: GERMAN_LADDER_SHELF,
  [NORWEGIAN_COURSE_ID]: NORWEGIAN_LADDER_SHELF,
};

/** The text id of a ladder unit the course authored: `text:es:es-a2-1-03` (the unit id is the slug; b1 units are `es-b1-NN`). */
const LADDER_UNIT_TEXT = /^text:([a-z]{2,3}):\1-(a1-1|a1-2|a2-1|a2-2|b1-bridge|b1)-\d+$/;

/** The content streams of the courses that have them. */
const STREAMS: Record<string, Stream[]> = {
  [THAI_COURSE_ID]: THAI_STREAMS,
  [SPANISH_COURSE_ID]: SPANISH_STREAMS,
  [GERMAN_COURSE_ID]: GERMAN_STREAMS,
  [ALBANIAN_COURSE_ID]: ALBANIAN_STREAMS,
  [HINDI_COURSE_ID]: HINDI_STREAMS,
  [NORWEGIAN_COURSE_ID]: NORWEGIAN_STREAMS,
  [LATIN_COURSE_ID]: LATIN_STREAMS,
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
        await store.stages.bulkPut(ladder.stages.map((s) => structuredClone({ ...s, contract: getStageContract(s) })));
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
      // The profile is the stage's or shelf's own. Every course's shelves fade the help along the shelves (Spanish, German and
      // Norwegian by gloss and English; Hindi also by decoding the script); a shelf with no profile of its own has the default.
      const profile = (s: Stage) => copy(s.assistance ?? DEFAULT_ASSISTANCE);
      // Where the learner is working sets the help of a text that is on no shelf (his own book, his testimony) for a stage course
      // (Thai, Albanian) and, as it always could, for Hindi. In Spanish, German and Norwegian a text gets the profile of the shelf
      // it is filed on, or of its ladder stage; a text on no shelf keeps the default word sheet, as before the shelves had profiles.
      const choiceSetsHelp = (s: Stage) => !(s.kind === 'shelf' && courseId in LADDER_SHELF);
      if (textId) {
        // Scripture is a continuous corpus beside the ladder (docs/THAI_COURSE.md section 3): the shelf its work is filed
        // on says nothing about how hard the learner finds it, so it takes the profile of the stage HE is working at. A
        // course whose learner has no current stage falls through to the work's own stage. In Spanish, German and Norwegian the
        // shelf he is working at never sets the help of a text (see `choiceSetsHelp`), so Scripture keeps its own shelf there.
        if (currentStageId) {
          const text = await store.texts.get(textId);
          const work = text?.workId ? await store.works.get(text.workId) : undefined;
          if (work?.role === 'scripture' && work.courseId === courseId) {
            const current = await store.stages.get(currentStageId);
            if (current && current.courseId === courseId && choiceSetsHelp(current)) return profile(current);
          }
        }
        const stage = await catalog.stageOfText(textId);
        if (stage && stage.courseId === courseId) return profile(stage);
        // A ladder unit has no work: its stage key (a1-1 … b1-bridge) names the nearest shelf, whose profile it takes, so the
        // help fades along the ladder whichever shelf the learner is browsing.
        const shelves = LADDER_SHELF[courseId];
        const unit = shelves ? LADDER_UNIT_TEXT.exec(textId) : null;
        if (shelves && unit) {
          const shelfKey = shelves[unit[2] === 'b1' ? 'b1-bridge' : unit[2]!];
          const shelf = LADDERS[courseId]?.stages.find((s) => s.key === shelfKey);
          if (shelf && (await store.texts.get(textId))?.workId === undefined) return profile(shelf);
        }
      }
      if (currentStageId) {
        const stage = await store.stages.get(currentStageId);
        if (stage && stage.courseId === courseId && choiceSetsHelp(stage)) return profile(stage);
      }
      return copy(LADDERS[courseId]?.outside ?? DEFAULT_ASSISTANCE);
    },

    async currentStage(userId, courseId) {
      const all = await stages(courseId);
      if (all.length === 0) return undefined;
      // A course whose stages are shelves (Spanish, German, Hindi, Norwegian) has a current stage by the same rule as the others:
      // his stored choice, else the first shelf whose readiness is not 'ready-to-advance'. It is advice that decides which shelf's
      // help the reader starts with and which readiness the course page shows; shelves still never lock anything.
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
