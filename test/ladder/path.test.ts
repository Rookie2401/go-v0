/**
 * "Your path" (src/ladder/path.ts): Stage 0 before the ladder, the first unit not completed that the learner may open,
 * unpublished units skipped outside preview but listed with their reason, and the reader GoLearn's recommendations use.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { StoreEventBus, buildFixtureText, createMemoryStore, seedBasics } from '../../src/core';
import type { AppStore, Stage0Overview, TextCompleted } from '../../src/core';
import { makeLadderSource } from '../../src/ladder/bundle';
import { createLadderPath, heldBackWords } from '../../src/ladder/path';

const U = 'u1';
const person = { kind: 'person', name: 'Ana Pérez', competence: 'native', role: 'linguistic-reviewer' };
const tool = { kind: 'tool', name: 'ladder drafting agent' };
const step = (state: string, by: unknown, extra: Record<string, unknown> = {}) => ({ state, at: '2026-10-05', by, ...extra });

const doc = (id: string, history: unknown[] | null) => ({
  schemaVersion: 2, id, lang: 'es', title: `Doc ${id}`, contentType: 'dialogue',
  sections: [{ paragraphs: [{ sentences: [{ text: 'Hola, me llamo Sam.' }] }] }],
  ...(history ? { pipeline: { state: (history[history.length - 1] as { state: string }).state, history } } : {}),
});

const ladder = (units: Array<Record<string, unknown>>, after: 'stage0' | null = 'stage0') => ({ lang: 'es', version: 1, ...(after ? { after } : {}), units });
const unit = (id: string, stage: string, extra: Record<string, unknown> = {}) => ({ id, stage, kind: 'controlled', document: `units/${id}.json`, domain: 'conversation', title: `Unit ${id}`, ...extra });

const DRAFT = [step('machine-draft', tool)];
const WAIT_REC = [step('machine-draft', tool), step('in-review', person), step('reviewed', person)];

/** units: u1 published+done-able, u2 draft (unpublished), u3 published, u4 reviewed but waiting for a recording, u5 (a2) published. */
const source = () => makeLadderSource({
  ladders: { 'data/ladder/es/ladder.json': ladder([unit('u1', 'a1-1'), unit('u2', 'a1-1'), unit('u3', 'a1-2'), unit('u4', 'a1-2'), unit('u5', 'a2-1')]) },
  units: Object.fromEntries([['u1', null], ['u2', DRAFT], ['u3', null], ['u4', WAIT_REC], ['u5', null]].map(([id, h]) => [`data/ladder/es/units/${id}.json`, doc(id as string, h as unknown[] | null)])),
});

async function seed(store: AppStore, published: Record<string, boolean>, reasons: Record<string, string[]> = {}) {
  await seedBasics(store, U, 'honduras-es');
  for (const [slug, pub] of Object.entries(published)) {
    await buildFixtureText(store, {
      lang: 'es', slug, title: `Unit ${slug}`, reviewStatus: pub ? 'reviewed' : 'unreviewed', published: pub,
      sentences: [{ tokens: [{ surface: 'Hola', lemma: 'hola' }, { surface: '.', isWord: false }] }],
    });
    if (!pub) await store.texts.put({ ...(await store.texts.get(`text:es:${slug}`))!, unpublishedReasons: reasons[slug] ?? ['waiting for a linguistic review by a person'] });
  }
}

const overview = (over: Partial<Stage0Overview> = {}): Stage0Overview => ({
  lang: 'es', available: true, contentStatus: 'Draft', steps: [], meters: {} as never, after: [], ...over,
});
const sceneStep = (id: string, status: 'new' | 'started' | 'done' | 'secure') => ({ step: { id, kind: 'scene', ref: id } as never, title: id, status, detail: '' });
const fakeStage0 = (ov: Stage0Overview | (() => Stage0Overview), available = true) => ({ available: () => available, overview: async () => (typeof ov === 'function' ? ov() : ov) });

let store: AppStore;
beforeEach(() => { store = createMemoryStore(); });

const complete = (bus: StoreEventBus, textId: string) =>
  bus.emit<TextCompleted>({ type: 'TextCompleted', userId: U, lang: 'es', surface: 'corpus', session: 's', dedupeKey: `done:${textId}`, textId });

describe('next step', () => {
  it('is Stage 0 (link /start) until Stage 0 is done', async () => {
    await seed(store, { u1: true, u2: false, u3: true, u4: false, u5: true });
    const stage0 = fakeStage0(overview({ steps: [sceneStep('a', 'done'), sceneStep('b', 'new')] }));
    const path = createLadderPath({ store, stage0, source: source() });
    const v = await path.view(U, 'es');
    expect(v.next).toEqual({ kind: 'stage0', to: '/start' });
    expect(v.stage0).toMatchObject({ applicable: true, done: false, scenesDone: 1, scenesTotal: 2 });
    expect(v.groups.flatMap((g) => g.units).some((u) => u.state === 'next')).toBe(false);
  });

  it('counts Stage 0 as done after an exit result with ANY verdict (the verdict is all that is read)', async () => {
    await seed(store, { u1: true, u2: false, u3: true, u4: false, u5: true });
    for (const verdict of ['ready', 'ready-provisional', 'not-yet'] as const) {
      const stage0 = fakeStage0(overview({ steps: [sceneStep('a', 'new')], exit: { attemptId: 'x', formId: 'f', startedAt: 't', unseen: true, sections: [], verdict } }));
      const v = await createLadderPath({ store, stage0, source: source() }).view(U, 'es');
      expect(v.stage0).toMatchObject({ done: true, by: 'exit', verdict });
      expect(v.next).toMatchObject({ kind: 'unit', unit: { unitId: 'u1' }, to: '/read/text%3Aes%3Au1' });
    }
  });

  it('counts Stage 0 as done when every scene is completed', async () => {
    await seed(store, { u1: true, u2: false, u3: true, u4: false, u5: true });
    const stage0 = fakeStage0(overview({ steps: [sceneStep('a', 'done'), sceneStep('b', 'secure')] }));
    const v = await createLadderPath({ store, stage0, source: source() }).view(U, 'es');
    expect(v.stage0).toMatchObject({ done: true, by: 'scenes' });
    expect(v.next.kind).toBe('unit');
  });

  it('does not wait for Stage 0 when the language has none, the ladder does not follow it, or it cannot be read', async () => {
    await seed(store, { u1: true, u2: false, u3: true, u4: false, u5: true });
    const none = await createLadderPath({ store, stage0: fakeStage0(overview(), false), source: source() }).view(U, 'es');
    expect(none.stage0.applicable).toBe(false);
    expect(none.next.kind).toBe('unit');
    const noStage0 = makeLadderSource({ ladders: { 'data/ladder/es/ladder.json': ladder([unit('u1', 'a1-1')], null) }, units: { 'data/ladder/es/units/u1.json': doc('u1', null) } });
    const unlinked = await createLadderPath({ store, stage0: fakeStage0(overview({ steps: [sceneStep('a', 'new')] })), source: noStage0 }).view(U, 'es');
    expect(unlinked.stage0.applicable).toBe(false);
    expect(unlinked.next.kind).toBe('unit');
    const broken = await createLadderPath({ store, stage0: fakeStage0(() => { throw new Error('boom'); }), source: source() }).view(U, 'es');
    expect(broken.next.kind).toBe('unit');
  });

  it('after Stage 0 it is the first unit not completed; the one before it is done', async () => {
    await seed(store, { u1: true, u2: false, u3: true, u4: false, u5: true });
    const bus = new StoreEventBus(store);
    await complete(bus, 'text:es:u1');
    const v = await createLadderPath({ store, source: source() }).view(U, 'es');
    const all = v.groups.flatMap((g) => g.units);
    expect(all.find((u) => u.unitId === 'u1')!.state).toBe('done');
    // u2 is a draft: skipped for "next" outside preview, so the next unit is u3
    expect(v.next).toMatchObject({ kind: 'unit', unit: { unitId: 'u3' } });
    expect(all.map((u) => u.state)).toEqual(['done', 'later', 'next', 'later', 'later']);
  });

  it('skips an unpublished unit outside preview but lists it with its reason; in preview it is the next unit and opens', async () => {
    await seed(store, { u1: true, u2: false, u3: true, u4: false, u5: true });
    const path = createLadderPath({ store, source: source() });
    const bus = new StoreEventBus(store);
    await complete(bus, 'text:es:u1');
    const normal = (await path.view(U, 'es')).groups.flatMap((g) => g.units).find((u) => u.unitId === 'u2')!;
    expect(normal).toMatchObject({ published: false, openable: false, state: 'later', heldBack: 'draft — waiting for a review by a native speaker' });
    expect(normal.to).toBeUndefined();
    const preview = await path.view(U, 'es', { preview: true });
    const u2 = preview.groups.flatMap((g) => g.units).find((u) => u.unitId === 'u2')!;
    expect(u2).toMatchObject({ openable: true, state: 'next', to: '/read/text%3Aes%3Au2' });
    expect(preview.next).toMatchObject({ kind: 'unit', unit: { unitId: 'u2' } });
  });

  it('says the pipeline state in plain words', async () => {
    await seed(store, { u1: true, u2: false, u3: true, u4: false, u5: true });
    const v = await createLadderPath({ store, source: source() }).view(U, 'es');
    const u4 = v.groups.flatMap((g) => g.units).find((u) => u.unitId === 'u4')!;
    expect(u4.heldBack).toBe('reviewed by Ana Pérez — waiting for a recording');
    expect(v.groups.flatMap((g) => g.units).find((u) => u.unitId === 'u3')!.heldBack).toBeUndefined();
  });

  it('is waiting (with the reason) when every remaining unit is a draft and preview is off; finished when all are done', async () => {
    await seed(store, { u1: true, u2: false, u3: false, u4: false, u5: false });
    const bus = new StoreEventBus(store);
    await complete(bus, 'text:es:u1');
    const path = createLadderPath({ store, source: source() });
    const w = (await path.view(U, 'es')).next;
    expect(w.kind).toBe('waiting');
    expect(w.kind === 'waiting' && w.reason).toMatch(/waiting for a review by a native speaker/);
    for (const id of ['u2', 'u3', 'u4', 'u5']) await complete(bus, `text:es:${id}`);
    const f = await path.view(U, 'es');
    expect(f.finished).toBe(true);
    expect(f.next).toEqual({ kind: 'finished' });
  });

  it('uses the reading record\'s finishedAt too (the rule GoLearn already uses)', async () => {
    await seed(store, { u1: true, u2: false, u3: true, u4: false, u5: true });
    const golearn = { readingProgressMany: async (_u: string, ids: string[]) => new Map(ids.map((id) => [id, { finishedAt: id === 'text:es:u1' ? '2026-10-05' : undefined } as never])) };
    const v = await createLadderPath({ store, golearn, source: source() }).view(U, 'es');
    expect(v.groups.flatMap((g) => g.units).find((u) => u.unitId === 'u1')!.state).toBe('done');
    expect(v.next).toMatchObject({ kind: 'unit', unit: { unitId: 'u3' } });
  });

  it('groups the units by stage (A1 / A2) and keeps ladder order; a unit not on this device is listed as such', async () => {
    await seed(store, { u1: true, u2: false, u3: true, u4: false }); // u5 not imported
    const v = await createLadderPath({ store, source: source() }).view(U, 'es');
    expect(v.groups.map((g) => [g.label, g.units.map((u) => u.unitId)])).toEqual([['A1', ['u1', 'u2', 'u3', 'u4']], ['A2', ['u5']]]);
    const u5 = v.groups[1]!.units[0]!;
    expect(u5).toMatchObject({ installed: false, openable: false, heldBack: 'not on this device yet' });
    expect(u5.words).toBe(4);
  });

  it('has no path for a language without a ladder', async () => {
    await seed(store, {});
    const v = await createLadderPath({ store, source: makeLadderSource() }).view(U, 'es');
    expect(v).toMatchObject({ hasLadder: false, next: { kind: 'none' } });
  });
});

describe('the reader GoLearn registers (setLadderPathSource)', () => {
  it('offers nothing before Stage 0 is done; after it, the units not completed in order, each with whether it is published', async () => {
    await seed(store, { u1: true, u2: false, u3: true, u4: false, u5: true });
    const ov = { steps: [sceneStep('a', 'new')] };
    const before = await createLadderPath({ store, stage0: fakeStage0(overview(ov)), source: source() }).source()({ userId: U, lang: 'es', completed: new Set() });
    expect(before).toBeUndefined();
    const bus = new StoreEventBus(store);
    await complete(bus, 'text:es:u1');
    const after = await createLadderPath({ store, stage0: fakeStage0(overview({ steps: [sceneStep('a', 'done')] })), source: source() })
      .source()({ userId: U, lang: 'es', completed: new Set(['text:es:u1']) });
    expect(after!.finished).toBe(false);
    expect(after!.steps.map((s) => [s.unitId, s.published])).toEqual([['u2', false], ['u3', true], ['u4', false], ['u5', true]]);
    expect(after!.steps[1]).toMatchObject({ textId: 'text:es:u3', title: 'Unit u3', stage: 'a1-2' });
  });

  it('is finished when every unit is completed, and absent for a language without a ladder', async () => {
    await seed(store, { u1: true, u2: false, u3: true, u4: false, u5: true });
    const all = new Set(['u1', 'u2', 'u3', 'u4', 'u5'].map((u) => `text:es:${u}`));
    const done = await createLadderPath({ store, source: source() }).source()({ userId: U, lang: 'es', completed: all });
    expect(done).toEqual({ steps: [], finished: true });
    expect(await createLadderPath({ store, source: makeLadderSource() }).source()({ userId: U, lang: 'es', completed: new Set() })).toBeUndefined();
  });
});

describe('heldBackWords', () => {
  it('follows the pipeline: draft, with a reviewer, corrections, new review, recording', () => {
    expect(heldBackWords(doc('x', DRAFT), undefined)).toBe('draft — waiting for a review by a native speaker');
    expect(heldBackWords(doc('x', [...DRAFT, step('in-review', person)]), undefined)).toBe('with a reviewer — waiting for the review to come back');
    expect(heldBackWords(doc('x', [...WAIT_REC, step('corrections-pending', person, { corrections: 3 })]), undefined)).toMatch(/corrections are being made/);
    expect(heldBackWords(doc('x', [...DRAFT, step('in-review', person), step('reviewed', person, { contentSignature: 'old' })]), undefined)).toMatch(/wording changed after the review/);
    expect(heldBackWords(doc('x', WAIT_REC), undefined)).toBe('reviewed by Ana Pérez — waiting for a recording');
    expect(heldBackWords(doc('x', null), { unpublishedReasons: ['rights are not cleared'] })).toBe('rights are not cleared');
  });
});

describe('Stage 0 through its folded state (the cheap way the real service offers)', () => {
  const cheap = (completed: string[], finished?: 'ready' | 'not-yet') => ({
    available: () => true,
    overview: async (): Promise<Stage0Overview> => { throw new Error('the overview computes coverage: not needed to know whether Stage 0 is done'); },
    pack: () => ({ path: { steps: [{ id: 's1', kind: 'scene' }, { id: 'snd', kind: 'sounds' }, { id: 's2', kind: 'scene' }, { id: 'exit', kind: 'exit' }] } }),
    state: async () => ({
      steps: new Map(completed.map((id) => [id, { completed: true }])),
      exits: finished ? [{ finished: { result: { verdict: finished } } }] : [{}],
    }),
  });

  it('reads scenes completed, or an exit with any verdict, without the overview', async () => {
    await seed(store, { u1: true, u2: false, u3: true, u4: false, u5: true });
    const some = await createLadderPath({ store, stage0: cheap(['s1']), source: source() }).view(U, 'es');
    expect(some.stage0).toMatchObject({ done: false, scenesDone: 1, scenesTotal: 2 });
    expect(some.next).toEqual({ kind: 'stage0', to: '/start' });
    const all = await createLadderPath({ store, stage0: cheap(['s1', 's2']), source: source() }).view(U, 'es');
    expect(all.stage0).toMatchObject({ done: true, by: 'scenes' });
    const exit = await createLadderPath({ store, stage0: cheap([], 'not-yet'), source: source() }).view(U, 'es');
    expect(exit.stage0).toMatchObject({ done: true, by: 'exit', verdict: 'not-yet' });
  });
});
