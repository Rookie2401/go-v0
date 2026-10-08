/**
 * The checks every shelf course's fading assistance profiles must pass (Spanish, German, Norwegian): one table of profiles per
 * course, a nearest-shelf map for the ladder units, and the catalogue's answers built on both. Used by
 * spanishCatalog / germanCatalog / norwegianCatalog tests; Thai, Albanian and Hindi are guarded by assistanceGolden.test.ts.
 */
import { describe, expect, it } from 'vitest';
import { DEFAULT_ASSISTANCE, buildFixtureText, createMemoryStore, ids } from '../../src/core';
import type { AssistanceProfile, GoLearn, LanguageCode, Stage, StageReadiness, Work } from '../../src/core';
import { createCourseCatalog } from '../../src/course';

const U = 'u1';
const RANK: Record<AssistanceProfile['englishRescue'], number> = { easy: 0, secondary: 1, deep: 2, 'on-request': 3 };

export interface ShelfSuite {
  name: string;
  courseId: string;
  lang: LanguageCode;
  shelves: Stage[];
  assistance: Record<string, AssistanceProfile>;
  ladderShelf: Record<string, string>;
  works: Work[];
  /** Does the dictionary give easy target-language definitions? (Spanish, German yes; Norwegian no.) */
  definitions: boolean;
  /** Shelf keys whose profile is the default word sheet ('open' reading, Scripture): left out of the fading order. */
  openKeys: string[];
  /** Does the shelf order go from easy to hard (Spanish, German)? Norwegian's shelves are by kind and era. */
  graded: boolean;
  /** The shelves whose English must be `easy` / `deep`. */
  easy: string[];
  deep: string[];
}

const verdicts = (map: Record<string, StageReadiness['verdict']>): Pick<GoLearn, 'stageReadiness'> => ({
  stageReadiness: async (userId, courseId, stageId) => ({ userId, courseId, stageId: stageId ?? '', verdict: map[stageId ?? ''] ?? 'insufficient-data', signals: [], explanation: '' }),
});

export function shelfProfileSuite(s: ShelfSuite) {
  const C = s.courseId;
  const key = (i: number) => s.shelves[i]!.key;
  const sid = (k: string) => ids.stage(C, k);
  async function installed(golearn?: Pick<GoLearn, 'stageReadiness'>) {
    const store = createMemoryStore();
    const catalog = createCourseCatalog({ store, golearn });
    await catalog.install(C);
    return { store, catalog };
  }
  const textOf = async (store: ReturnType<typeof createMemoryStore>, slug: string, workId?: string) => {
    const t = await buildFixtureText(store, { lang: s.lang as 'es', slug, sentences: [{ tokens: [{ surface: 'x', lemma: 'x' }] }] });
    await store.texts.put({ ...t, ...(workId ? { workId } : {}) });
    return t.id;
  };

  describe(`${s.name}: the fading assistance profiles`, () => {
    it('has a profile for exactly each shelf, and the stored shelves carry it', async () => {
      expect(Object.keys(s.assistance).sort()).toEqual(s.shelves.map((x) => x.key).sort());
      for (const shelf of s.shelves) expect(shelf.assistance).toEqual(s.assistance[shelf.key]);
      const { store } = await installed();
      for (const shelf of s.shelves) expect((await store.stages.get(shelf.id))!.assistance).toEqual(s.assistance[shelf.key]);
    });

    it('early shelves are gloss-first with English easy, later shelves have deep English and light visibility, and open reading is the default', () => {
      for (const k of s.easy) {
        const p = s.assistance[k]!;
        expect(p.englishRescue, `${k} englishRescue`).toBe('easy');
        expect(p.layers[0]).toBe('gloss');
        expect(['heavy', 'contextual']).toContain(p.visibility);
      }
      for (const k of s.deep) {
        const p = s.assistance[k]!;
        expect(p.englishRescue, `${k} englishRescue`).toBe('deep');
        expect(p.visibility, `${k} visibility`).toBe('light');
        expect(p.layers.indexOf('english')).toBeGreaterThan(p.layers.indexOf('sentence'));
      }
      for (const k of s.openKeys) expect(s.assistance[k]).toEqual(DEFAULT_ASSISTANCE);
      // 'english' is in every profile: the rescue is never removed, only moved
      for (const p of Object.values(s.assistance)) expect(p.layers).toContain('english');
    });

    it('target-language definitions follow the dictionary: on from the middle shelves where it has them, never where it has none', () => {
      for (const shelf of s.shelves) {
        const p = s.assistance[shelf.key]!;
        if (s.openKeys.includes(shelf.key)) continue;
        expect(p.layers.includes('definition'), `${shelf.key} definition layer`).toBe(p.targetLanguageDefinitions);
        if (!s.definitions) expect(p.targetLanguageDefinitions, `${shelf.key} definitions`).toBe(false);
      }
      if (s.definitions) {
        expect(s.assistance[key(0)]!.targetLanguageDefinitions).toBe(false);
        expect(s.deep.every((k) => s.assistance[k]!.targetLanguageDefinitions)).toBe(true);
      }
    });

    it('never needs a romanization or a decoding step, and keeps the rest of the profile shape', () => {
      for (const p of Object.values(s.assistance)) {
        expect(p.romanization).toBe('never');
        expect(p.decodingFirst).toBe(false);
        expect(['full', 'reduced', 'minimal']).toContain(p.chrome);
      }
    });

    if (s.graded) {
      it('the help fades along the shelves: English is never nearer the surface on a later shelf', () => {
        const ranks = s.shelves.filter((x) => !s.openKeys.includes(x.key)).map((x) => RANK[s.assistance[x.key]!.englishRescue]);
        expect(ranks).toEqual([...ranks].sort((a, b) => a - b));
        expect(new Set(ranks).size).toBeGreaterThanOrEqual(3);
      });
    }

    it('assistanceFor: a text on a shelf takes that shelf\'s profile, whatever shelf the learner is working at', async () => {
      const { store, catalog } = await installed();
      for (const k of [...s.easy.slice(0, 1), ...s.deep.slice(-1)]) {
        const work = s.works.find((w) => w.stageId === sid(k) && w.role !== 'scripture');
        if (!work) continue;
        const id = await textOf(store, `on-${k}`, work.id);
        expect(await catalog.assistanceFor({ courseId: C, textId: id })).toEqual(s.assistance[k]);
        expect(await catalog.assistanceFor({ courseId: C, textId: id, currentStageId: sid(key(s.shelves.length - 1)) })).toEqual(s.assistance[k]);
        expect(await catalog.assistanceFor({ courseId: C, textId: id, currentStageId: sid(key(0)) })).toEqual(s.assistance[k]);
      }
      // the early shelf has English easy, a later one deep
      expect(s.assistance[s.easy[0]!]!.englishRescue).toBe('easy');
      expect(s.assistance[s.deep[s.deep.length - 1]!]!.englishRescue).toBe('deep');
    });

    it('assistanceFor: a text on no shelf (his own book, his testimony) keeps the default word sheet, whatever shelf the learner is working at', async () => {
      const { store, catalog } = await installed();
      const free = await textOf(store, 'own-book');
      for (const shelf of s.shelves) {
        expect(await catalog.assistanceFor({ courseId: C, textId: free, currentStageId: shelf.id })).toEqual(DEFAULT_ASSISTANCE);
        expect(await catalog.assistanceFor({ courseId: C, currentStageId: shelf.id })).toEqual(DEFAULT_ASSISTANCE);
      }
      expect(await catalog.assistanceFor({ courseId: C, textId: free })).toEqual(DEFAULT_ASSISTANCE);
      expect(await catalog.assistanceFor({ courseId: C })).toEqual(DEFAULT_ASSISTANCE);
      expect(await catalog.assistanceFor({ courseId: C, currentStageId: 'stage:nope' })).toEqual(DEFAULT_ASSISTANCE);
    });

    it('assistanceFor: a ladder unit (no work) resolves to its stage\'s nearest shelf, by stage key', async () => {
      const { store, catalog } = await installed();
      const last = sid(key(s.shelves.length - 1)); // wherever he browses, the unit's own stage decides
      for (const [stage, shelfKey] of Object.entries(s.ladderShelf)) {
        const slug = `${s.lang}-${stage === 'b1-bridge' ? 'b1' : stage}-03`;
        const id = await textOf(store, slug);
        expect(id).toBe(`text:${s.lang}:${slug}`);
        expect(await catalog.assistanceFor({ courseId: C, textId: id }), stage).toEqual(s.assistance[shelfKey]);
        expect(await catalog.assistanceFor({ courseId: C, textId: id, currentStageId: last }), stage).toEqual(s.assistance[shelfKey]);
      }
      // a2-1 resolves to its shelf, with English no nearer than at a1-1
      const rank = (stage: string) => RANK[s.assistance[s.ladderShelf[stage]!]!.englishRescue];
      expect(rank('a1-1')).toBe(0);
      expect(rank('a2-1')).toBeGreaterThanOrEqual(rank('a1-2'));
      expect(rank('b1-bridge')).toBeGreaterThanOrEqual(rank('a2-2'));
      // every mapped shelf exists
      for (const shelfKey of Object.values(s.ladderShelf)) expect(s.shelves.map((x) => x.key)).toContain(shelfKey);
    });

    it('assistanceFor: only a text with no work and a ladder unit\'s id is a ladder unit', async () => {
      const { store, catalog } = await installed();
      const work = s.works.find((w) => w.stageId === sid(s.deep[0]!) && w.role !== 'scripture') ?? s.works.find((w) => w.role !== 'scripture')!;
      const withWork = await textOf(store, `${s.lang}-a1-1-01`, work.id);
      expect(await catalog.assistanceFor({ courseId: C, textId: withWork })).toEqual(s.assistance[work.stageId.split(':').pop()!]);
      const notAUnit = await textOf(store, `${s.lang}-a2-1-ch03`);
      expect(await catalog.assistanceFor({ courseId: C, textId: notAUnit, currentStageId: sid(s.deep[0]!) })).toEqual(DEFAULT_ASSISTANCE);
      const otherLang = await textOf(store, `zz-a1-1-01`);
      expect(await catalog.assistanceFor({ courseId: C, textId: otherLang, currentStageId: sid(s.deep[0]!) })).toEqual(DEFAULT_ASSISTANCE);
    });

    it('assistanceFor: Scripture keeps the profile of the shelf its work is filed on, whatever shelf the learner is working at', async () => {
      const { store, catalog } = await installed();
      // the course's own Scripture work when its catalogue lists one as such, else a stand-in filed on the open shelf
      const listed = s.works.find((w) => w.role === 'scripture');
      const bible: Work = listed ?? { ...s.works[s.works.length - 1]!, id: ids.work(C, 'stand-in-bible'), role: 'scripture', stageId: sid(key(s.shelves.length - 1)) };
      if (!listed) await store.works.put(bible);
      const id = await textOf(store, 'bible-1', bible.id);
      const own = s.assistance[bible.stageId.split(':').pop()!];
      for (const k of [s.easy[0]!, s.deep[s.deep.length - 1]!]) {
        expect(await catalog.assistanceFor({ courseId: C, textId: id, currentStageId: sid(k) })).toEqual(own);
      }
      expect(await catalog.assistanceFor({ courseId: C, textId: id })).toEqual(own);
    });

    it('hands out copies of the profile', async () => {
      const { store, catalog } = await installed();
      const p = await catalog.assistanceFor({ courseId: C, currentStageId: sid(key(0)) });
      p.layers.length = 0;
      expect((await store.stages.get(sid(key(0))))!.assistance.layers.length).toBeGreaterThan(0);
      expect(s.assistance[key(0)]!.layers.length).toBeGreaterThan(0);
    });
  });

  describe(`${s.name}: the current stage of a shelf course`, () => {
    it('is the first shelf without a golearn, and the stored choice wins', async () => {
      const { catalog } = await installed();
      expect((await catalog.currentStage(U, C))!.id).toBe(sid(key(0)));
      await catalog.setCurrentStage(U, C, sid(key(2)));
      expect((await catalog.currentStage(U, C))!.id).toBe(sid(key(2)));
      expect((await catalog.currentStage('someone-else', C))!.id).toBe(sid(key(0)));
      await expect(catalog.setCurrentStage(U, C, 'stage:nope')).rejects.toThrow();
    });

    it('otherwise is the first shelf whose readiness is not "ready to advance" (the rule the stage courses use)', async () => {
      const ready = verdicts({ [sid(key(0))]: 'ready-to-advance', [sid(key(1))]: 'ready-to-advance', [sid(key(2))]: 'stay' });
      const { catalog } = await installed(ready);
      expect((await catalog.currentStage(U, C))!.id).toBe(sid(key(2)));
      const none = await installed(verdicts({}));
      expect((await none.catalog.currentStage(U, C))!.id).toBe(sid(key(0)));
      const all = await installed({ stageReadiness: async (userId, courseId, stageId) => ({ userId, courseId, stageId: stageId ?? '', verdict: 'ready-to-advance', signals: [], explanation: '' }) });
      expect((await all.catalog.currentStage(U, C))!.id).toBe(sid(key(s.shelves.length - 1))); // ready to move past every shelf: the last is where he is
    });

    it('is a stage of this course only', async () => {
      const { catalog } = await installed();
      const stage = await catalog.currentStage(U, C);
      expect(stage!.courseId).toBe(C);
      expect(stage!.kind).toBe('shelf');
    });
  });
}
