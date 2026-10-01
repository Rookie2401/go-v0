/** The course catalogue on the memory store with the real Thai ladder. */
import { describe, expect, it, vi } from 'vitest';
import { DEFAULT_ASSISTANCE, buildFixtureText, createMemoryStore, ids } from '../../src/core';
import type { AppStore, Stage, Work } from '../../src/core';
import { THAI_ASSISTANCE, THAI_COURSE_ID, THAI_STAGES, THAI_WORKS, createCourseCatalog, stageMetaId } from '../../src/course';
import { createHarness } from '../golearn/harness';

const U = 'u1';
const w = (slug: string) => ids.work(THAI_COURSE_ID, slug);
const s = (key: string) => ids.stage(THAI_COURSE_ID, key);

async function chapter(store: AppStore, slug: string, workSlug: string | undefined, index: number | undefined, title: string) {
  const text = await buildFixtureText(store, {
    lang: 'th', slug, title, separator: '', sentences: [{ tokens: [{ surface: 'รัก', lemma: 'รัก', pos: 'VERB' }, { surface: 'โลก', lemma: 'โลก', pos: 'NOUN' }] }],
  });
  await store.texts.put({ ...text, ...(workSlug ? { workId: w(workSlug) } : {}), ...(index !== undefined ? { chapter: { index, title: `ตอน ${index}` } } : {}) });
  return text.id;
}

async function installed() {
  const store = createMemoryStore();
  const catalog = createCourseCatalog({ store });
  await catalog.install(THAI_COURSE_ID);
  return { store, catalog };
}

describe('install', () => {
  it('seeds the whole Thai ladder: every stage and every work, with their data intact', async () => {
    const { store, catalog } = await installed();
    expect(await store.stages.count()).toBe(THAI_STAGES.length);
    expect(await store.works.count()).toBe(THAI_WORKS.length);
    expect((await catalog.stages(THAI_COURSE_ID)).map((x) => x.key)).toEqual(['0', 'g1', 'g2', 'g3', 'g4', 'g5', 'g6', 'g7', 'g8', 'g9', 'open']);
    expect(await store.stages.get(s('g4'))).toEqual(THAI_STAGES.find((x) => x.key === 'g4'));
    expect(await store.works.get(w('kaeo-chom-kaen'))).toEqual(THAI_WORKS.find((x) => x.id === w('kaeo-chom-kaen')));
  });

  it('is idempotent', async () => {
    const { store, catalog } = await installed();
    const snapshot = async () => JSON.stringify([(await store.stages.all()).sort((a, b) => (a.id < b.id ? -1 : 1)), (await store.works.all()).sort((a, b) => (a.id < b.id ? -1 : 1))]);
    const once = await snapshot();
    await catalog.install(THAI_COURSE_ID);
    await catalog.install(THAI_COURSE_ID);
    expect(await snapshot()).toBe(once);
  });

  it('does nothing for a course without a ladder', async () => {
    const store = createMemoryStore();
    const catalog = createCourseCatalog({ store });
    await catalog.install('honduras-es');
    await catalog.install('no-such-course');
    expect(await store.stages.count()).toBe(0);
    expect(await store.works.count()).toBe(0);
    expect(await catalog.stages('honduras-es')).toEqual([]);
  });

  it('refreshes the ladder data of works nobody has verified (a later edit to the manifest reaches the store)', async () => {
    const { store, catalog } = await installed();
    const stored = (await store.works.get(w('kaeo-chom-kaen')))!;
    await store.works.put({ ...stored, title: 'edited locally', purpose: ['old'], rights: { ...stored.rights, canBundle: true } });
    await catalog.install(THAI_COURSE_ID);
    const after = (await store.works.get(w('kaeo-chom-kaen')))!;
    expect(after.title).toBe(THAI_WORKS.find((x) => x.id === stored.id)!.title);
    expect(after.rights.canBundle).toBe(false);
  });

  it('never overwrites rights a person has verified, nor the bibliography', async () => {
    const { store, catalog } = await installed();
    const rights = (await store.works.get(w('khang-lang-phap')))!;
    const verifiedRights: Work = {
      ...rights, rights: { ...rights.rights, copyrightStatus: 'public-domain', basis: 'Checked: author died 1974; term life + 50.', canBundle: true, userImportOnly: false, verified: true },
    };
    await store.works.put(verifiedRights);
    const bib = (await store.works.get(w('mom')))!;
    const verifiedBib: Work = { ...bib, author: 'ม.ร.ว. คึกฤทธิ์ ปราโมช (checked)', publisher: 'Checked publisher', isbn: '000', bibliographyVerified: true };
    await store.works.put(verifiedBib);

    await catalog.install(THAI_COURSE_ID);

    expect(await store.works.get(w('khang-lang-phap'))).toEqual(verifiedRights);
    const mom = (await store.works.get(w('mom')))!;
    expect(mom).toMatchObject({ author: 'ม.ร.ว. คึกฤทธิ์ ปราโมช (checked)', publisher: 'Checked publisher', isbn: '000', bibliographyVerified: true });
    // the rest of a verified work still follows the ladder
    expect(mom.purpose).toEqual(THAI_WORKS.find((x) => x.id === mom.id)!.purpose);
    // other works are unaffected
    expect((await store.works.get(w('mana-mani-1')))!.rights.verified).toBe(false);
  });

  it('keeps nothing that the manifest does not say true: no work is marked verified or bundleable by installing', async () => {
    const { store } = await installed();
    const all = await store.works.all();
    expect(all.every((x) => !x.rights.verified && !x.bibliographyVerified && !x.rights.canBundle && x.rights.userImportOnly)).toBe(true);
    expect(all.some((x) => x.rights.copyrightStatus === 'public-domain')).toBe(false);
  });
});

describe('stages and works', () => {
  it('works come spine first, then by order; within a stage and across stages', async () => {
    const { catalog } = await installed();
    const g1 = await catalog.works(THAI_COURSE_ID, s('g1'));
    expect(g1[0]).toMatchObject({ role: 'spine', title: 'มานะ มานี ป.1' });
    const roles = g1.map((x) => x.role);
    expect(roles.indexOf('subsidiary')).toBeGreaterThan(roles.lastIndexOf('spine'));
    expect(g1.map((x) => x.order)).toEqual([...g1.map((x) => x.order)].sort((a, b) => a - b));

    const stage0 = await catalog.works(THAI_COURSE_ID, s('0'));
    expect(stage0.map((x) => x.role)).toEqual(['spine', 'extensive', 'extensive', 'extensive', 'extensive', 'extensive', 'audio', 'audio', 'audio', 'audio', 'audio']);

    const all = await catalog.works(THAI_COURSE_ID);
    expect(all).toHaveLength(THAI_WORKS.length);
    // across the course the ladder reads in stage order
    const stageIndex = new Map(THAI_STAGES.map((x) => [x.id, x.index]));
    expect(all.map((x) => stageIndex.get(x.stageId)!)).toEqual([...all.map((x) => stageIndex.get(x.stageId)!)].sort((a, b) => a - b));
    expect(all[0].stageId).toBe(s('0'));
  });

  it('looks a work up by id', async () => {
    const { catalog } = await installed();
    expect((await catalog.work(w('luk-isan')))!.registers).toEqual(['standard', 'regional-isan']);
    expect(await catalog.work('work:thailand-th:nope')).toBeUndefined();
  });
});

describe('texts, stage of a text, assistance', () => {
  it('textsOf lists the imported chapters of a work in chapter order, then by title', async () => {
    const { store, catalog } = await installed();
    await chapter(store, 'c3', 'kaeo-chom-kaen', 3, 'ตอน 3');
    await chapter(store, 'c1', 'kaeo-chom-kaen', 1, 'ตอน 1');
    await chapter(store, 'c2b', 'kaeo-chom-kaen', 2, 'ข');
    await chapter(store, 'c2a', 'kaeo-chom-kaen', 2, 'ก');
    await chapter(store, 'nochap', 'kaeo-chom-kaen', undefined, 'ไม่มีตอน');
    await chapter(store, 'other', 'mana-mani-1', 1, 'อื่น');
    await chapter(store, 'free', undefined, undefined, 'ไม่อยู่ในหนังสือ');
    expect((await catalog.textsOf(w('kaeo-chom-kaen'))).map((x) => x.id)).toEqual(['c1', 'c2a', 'c2b', 'c3', 'nochap'].map((x) => ids.text('th', x)));
    expect(await catalog.textsOf(w('pet-hai'))).toEqual([]); // nothing imported yet
  });

  it('stageOfText follows the work; texts outside the ladder have none', async () => {
    const { store, catalog } = await installed();
    const a = await chapter(store, 'a', 'kaeo-chom-kaen', 1, 'a');
    const b = await chapter(store, 'b', undefined, undefined, 'b');
    const c = await chapter(store, 'c', 'not-in-the-ladder', 1, 'c');
    expect((await catalog.stageOfText(a))!.id).toBe(s('g4'));
    expect(await catalog.stageOfText(b)).toBeUndefined();
    expect(await catalog.stageOfText(c)).toBeUndefined();
    expect(await catalog.stageOfText('text:th:missing')).toBeUndefined();
  });

  it('assistanceFor: the text\'s stage, else the current stage, else the default', async () => {
    const { store, catalog } = await installed();
    const a = await chapter(store, 'a', 'kaeo-chom-kaen', 1, 'a'); // Grade 4
    const free = await chapter(store, 'free', undefined, undefined, 'free');
    expect(await catalog.assistanceFor({ courseId: THAI_COURSE_ID, textId: a })).toEqual(THAI_ASSISTANCE.g4);
    // the text's own stage wins over the learner's current stage
    expect(await catalog.assistanceFor({ courseId: THAI_COURSE_ID, textId: a, currentStageId: s('0') })).toEqual(THAI_ASSISTANCE.g4);
    // outside the ladder: the stage he is working at
    expect(await catalog.assistanceFor({ courseId: THAI_COURSE_ID, textId: free, currentStageId: s('0') })).toEqual(THAI_ASSISTANCE['0']);
    expect(await catalog.assistanceFor({ courseId: THAI_COURSE_ID, currentStageId: s('g9') })).toEqual(THAI_ASSISTANCE.g9);
    // nothing to go on, an unknown stage, a stage of another course: the way the word sheet has always worked
    expect(await catalog.assistanceFor({ courseId: THAI_COURSE_ID })).toEqual(DEFAULT_ASSISTANCE);
    expect(await catalog.assistanceFor({ courseId: THAI_COURSE_ID, currentStageId: 'stage:nope' })).toEqual(DEFAULT_ASSISTANCE);
    expect(await catalog.assistanceFor({ courseId: 'honduras-es', currentStageId: s('g1') })).toEqual(DEFAULT_ASSISTANCE);
    // a course that has no ladder at all
    const bare = createCourseCatalog({ store: createMemoryStore() });
    expect(await bare.assistanceFor({ courseId: 'honduras-es', textId: 'text:es:x', currentStageId: 'stage:x' })).toEqual(DEFAULT_ASSISTANCE);
  });

  it('hands out copies: changing a returned profile changes neither the default nor the stored stage', async () => {
    const { store, catalog } = await installed();
    const bare = await createCourseCatalog({ store: createMemoryStore() }).assistanceFor({ courseId: 'x' });
    bare.layers.push('note');
    expect(DEFAULT_ASSISTANCE.layers).not.toContain('note');
    const p = await catalog.assistanceFor({ courseId: THAI_COURSE_ID, currentStageId: s('g1') });
    p.layers.length = 0;
    expect((await store.stages.get(s('g1')))!.assistance.layers.length).toBeGreaterThan(0);
  });
});

describe('the current stage', () => {
  const verdicts = (v: Record<string, 'stay' | 'ready-to-advance' | 'insufficient-data'>) => ({
    stageReadiness: vi.fn(async (userId: string, courseId: string, stageId?: string) => ({
      userId, courseId, stageId: stageId!, signals: [], verdict: v[stageId!] ?? 'insufficient-data', explanation: '',
    })),
  });

  it('is the first stage without readiness advice', async () => {
    const { catalog } = await installed();
    expect((await catalog.currentStage(U, THAI_COURSE_ID))!.id).toBe(s('0'));
    expect(await catalog.currentStage(U, 'honduras-es')).toBeUndefined();
  });

  it('is the first stage whose verdict is not ready-to-advance', async () => {
    const { store } = await installed();
    const golearn = verdicts({ [s('0')]: 'ready-to-advance', [s('g1')]: 'ready-to-advance', [s('g2')]: 'stay', [s('g3')]: 'ready-to-advance' });
    const catalog = createCourseCatalog({ store, golearn });
    expect((await catalog.currentStage(U, THAI_COURSE_ID))!.id).toBe(s('g2')); // not g3: the first that is not ready
    expect(golearn.stageReadiness.mock.calls.map((c) => c[2])).toEqual([s('0'), s('g1'), s('g2')]); // stops at the first
    const insufficient = createCourseCatalog({ store, golearn: verdicts({ [s('0')]: 'ready-to-advance' }) });
    expect((await insufficient.currentStage(U, THAI_COURSE_ID))!.id).toBe(s('g1'));
  });

  it('is the last stage when he looks ready for every one', async () => {
    const { store } = await installed();
    const all = Object.fromEntries(THAI_STAGES.map((x) => [x.id, 'ready-to-advance' as const]));
    expect((await createCourseCatalog({ store, golearn: verdicts(all) }).currentStage(U, THAI_COURSE_ID))!.id).toBe(s('open'));
  });

  it('his own choice wins over the advice, persists, and is per learner and course', async () => {
    const { store } = await installed();
    const golearn = verdicts({});
    const catalog = createCourseCatalog({ store, golearn, clock: () => '2026-05-05T00:00:00.000Z' });
    await catalog.setCurrentStage(U, THAI_COURSE_ID, s('g5'));
    expect(await store.meta.get(stageMetaId(U, THAI_COURSE_ID))).toEqual({ id: `stage:${U}:${THAI_COURSE_ID}`, value: s('g5'), updatedAt: '2026-05-05T00:00:00.000Z' });
    expect((await catalog.currentStage(U, THAI_COURSE_ID))!.id).toBe(s('g5'));
    expect(golearn.stageReadiness).not.toHaveBeenCalled(); // no advice needed once he has chosen
    // a new catalogue over the same store sees it (it is stored, not remembered)
    expect((await createCourseCatalog({ store }).currentStage(U, THAI_COURSE_ID))!.id).toBe(s('g5'));
    expect((await createCourseCatalog({ store }).currentStage('someone-else', THAI_COURSE_ID))!.id).toBe(s('0'));
    await catalog.setCurrentStage(U, THAI_COURSE_ID, s('0'));
    expect((await catalog.currentStage(U, THAI_COURSE_ID))!.id).toBe(s('0'));
  });

  it('refuses a stage that does not belong to the course', async () => {
    const { store, catalog } = await installed();
    await expect(catalog.setCurrentStage(U, THAI_COURSE_ID, 'stage:nope')).rejects.toThrow(/unknown stage/);
    await expect(catalog.setCurrentStage(U, 'honduras-es', s('g1'))).rejects.toThrow(/unknown stage/);
    expect(await store.meta.get(stageMetaId(U, THAI_COURSE_ID))).toBeUndefined();
  });

  it('a stored choice that no longer names a stage is ignored', async () => {
    const { store, catalog } = await installed();
    await store.meta.put({ id: stageMetaId(U, THAI_COURSE_ID), value: 'stage:gone', updatedAt: 'x' });
    expect((await catalog.currentStage(U, THAI_COURSE_ID))!.id).toBe(s('0'));
  });

  it('works with the real GoLearn: a learner who has read nothing is at Stage 0, and readiness defaults to his chosen stage', async () => {
    const h = createHarness();
    const catalog = createCourseCatalog({ store: h.store, golearn: h.golearn });
    await catalog.install(THAI_COURSE_ID);
    expect((await catalog.currentStage(U, THAI_COURSE_ID))!.id).toBe(s('0'));
    await catalog.setCurrentStage(U, THAI_COURSE_ID, s('g3'));
    expect((await h.golearn.stageReadiness(U, THAI_COURSE_ID)).stageId).toBe(s('g3'));
    expect((await h.golearn.stageReadiness(U, THAI_COURSE_ID)).verdict).toBe('insufficient-data');
    const stage: Stage | undefined = await catalog.currentStage(U, THAI_COURSE_ID);
    expect(stage!.assistance).toEqual(THAI_ASSISTANCE.g3);
  });
});
