// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { buildFixtureText } from '../../src/core';
import type { Stage0ExitFinished, Stage0ExitStarted, TextCompleted } from '../../src/core';
import { bootstrap, bundleMetaId } from '../../src/app/bootstrap';
import { createIndexedMemoryStore } from '../../src/sim/store';
import { bundledLadder, ladderUnitDocuments, makeLadderSource } from '../../src/ladder/bundle';
import { createLadderPath } from '../../src/ladder/path';
import { loadBundledCorpus } from '../../src/ingest';
import { setPref, resetPrefsForTests } from '../../src/ui/prefs';
import { PathPage } from '../../src/ui/ladder/PathPage';
import { AppRoutes, Shell } from '../../src/ui/App';
import { makeHarness, q, qa } from './harness';
import type { Mounted } from './harness';

let mounted: Mounted | undefined;
beforeEach(() => { resetPrefsForTests(); });
afterEach(async () => { await mounted?.unmount(); mounted = undefined; resetPrefsForTests(); });

const person = { kind: 'person', name: 'Ana Pérez', competence: 'native', role: 'linguistic-reviewer' };
const step = (state: string, by: unknown) => ({ state, at: '2026-10-05', by });
const doc = (id: string, history: unknown[] | null) => ({
  schemaVersion: 2, id, lang: 'es', title: `Doc ${id}`, contentType: 'dialogue',
  sections: [{ paragraphs: [{ sentences: [{ text: 'Hola, me llamo Sam y vivo aquí.' }] }] }],
  ...(history ? { pipeline: { state: (history[history.length - 1] as { state: string }).state, history } } : {}),
});
const unit = (id: string, stage: string, domain: string) => ({ id, stage, kind: 'controlled', document: `units/${id}.json`, domain, title: `Unit ${id}` });
const DRAFT = [step('machine-draft', { kind: 'tool', name: 'agent' })];
const WAIT_REC = [...DRAFT, step('in-review', person), step('reviewed', person)];
const source = () => makeLadderSource({
  ladders: { 'data/ladder/es/ladder.json': { lang: 'es', version: 1, after: 'stage0', units: [
    unit('p1', 'a1-1', 'conversation'), unit('p2', 'a1-1', 'daily-life'), unit('p3', 'a1-2', 'narrative'), unit('p4', 'a2-1', 'narrative'), unit('p5', 'b1-bridge', 'nonfiction'),
  ] } },
  units: Object.fromEntries([['p1', null], ['p2', DRAFT], ['p3', null], ['p4', WAIT_REC], ['p5', DRAFT]].map(([id, h]) => [`data/ladder/es/units/${id}.json`, doc(id as string, h as unknown[] | null)])),
});

async function seed(h: Awaited<ReturnType<typeof makeHarness>>, published: Record<string, boolean>) {
  for (const [slug, pub] of Object.entries(published)) {
    await buildFixtureText(h.store, {
      lang: 'es', slug, title: `Unit ${slug}`, reviewStatus: pub ? 'reviewed' : 'unreviewed', published: pub,
      sentences: [{ tokens: [{ surface: 'Hola', lemma: 'hola' }, { surface: '.', isWord: false }] }],
    });
  }
}
const stage0Fake = (done: boolean) => ({
  available: () => true,
  overview: async () => ({
    lang: 'es', available: true, contentStatus: 'draft', meters: {}, after: [],
    steps: [{ step: { id: 's1', kind: 'scene', ref: 's1' }, title: 's1', status: done ? 'done' : 'new', detail: '' }, { step: { id: 's2', kind: 'scene', ref: 's2' }, title: 's2', status: done ? 'secure' : 'new', detail: '' }],
  }),
}) as never;

describe('Your path (#/path)', () => {
  it('before Stage 0 is done, the way on is Stage 0 itself (link /start) and no unit is "next"', async () => {
    const h = await makeHarness();
    h.services.stage0 = stage0Fake(false);
    await seed(h, { p1: true, p2: false, p3: true, p4: false, p5: false });
    mounted = await h.mount(<PathPage source={source()} />, { router: '/path' });
    const next = q(mounted.container, '[data-testid="path-next"]')!;
    expect(next.getAttribute('data-next')).toBe('stage0');
    expect(q(next, 'a')!.getAttribute('href')).toBe('/start');
    expect(q(mounted.container, '[data-testid="path-stage0"]')!.getAttribute('data-done')).toBe('false');
    expect(qa(mounted.container, '[data-state="next"]')).toHaveLength(0);
  });

  it('shows the units grouped A1 / A2 / B1 bridge in order, with domain and words, done / next / later', async () => {
    const h = await makeHarness();
    h.services.stage0 = stage0Fake(true);
    await seed(h, { p1: true, p2: false, p3: true, p4: false, p5: false });
    await h.bus.emit<TextCompleted>({ type: 'TextCompleted', userId: 'u1', lang: 'es', surface: 'corpus', session: 's', dedupeKey: 'd1', textId: 'text:es:p1' });
    mounted = await h.mount(<PathPage source={source()} />, { router: '/path' });
    const c = mounted.container;
    expect(qa(c, '.path__group h2').map((e) => e.textContent)).toEqual(['A1', 'A2', 'B1 bridge']);
    expect(qa(c, 'li[data-unit]').map((e) => [e.getAttribute('data-unit'), e.getAttribute('data-state')])).toEqual([
      ['p1', 'done'], ['p2', 'later'], ['p3', 'next'], ['p4', 'later'], ['p5', 'later'],
    ]);
    const p3 = q(c, 'li[data-unit="p3"]')!;
    expect(p3.textContent).toContain('Unit p3');
    expect(p3.textContent).toContain('story');
    expect(p3.textContent).toContain('about 7 words');
    expect(q(c, '[data-testid="path-next"]')!.textContent).toContain('Next: Unit p3');
    expect(q(c, '[data-testid="path-stage0"]')!.getAttribute('data-done')).toBe('true');
  });

  it('in normal mode an unpublished unit shows its pipeline state in plain words and has no link', async () => {
    const h = await makeHarness();
    await seed(h, { p1: true, p2: false, p3: true, p4: false, p5: false });
    mounted = await h.mount(<PathPage source={source()} />, { router: '/path' });
    const p2 = q(mounted.container, 'li[data-unit="p2"]')!;
    expect(p2.getAttribute('data-openable')).toBe('false');
    expect(q(p2, 'a')).toBeNull();
    expect(q(p2, '[data-testid="path-why"]')!.textContent).toContain('draft — waiting for a review by a native speaker');
    expect(q(q(mounted.container, 'li[data-unit="p4"]')!, '[data-testid="path-why"]')!.textContent).toContain('reviewed by Ana Pérez — waiting for a recording');
    expect(q(mounted.container, 'li[data-unit="p1"]')!.querySelector('a')!.getAttribute('href')).toBe('/read/text%3Aes%3Ap1');
    expect(q(mounted.container, '[data-testid="path-draft"]')!.textContent).toMatch(/AI model.*unless you turn preview on/);
  });

  it('in preview mode an unpublished unit opens', async () => {
    const h = await makeHarness();
    setPref('preview', true);
    await seed(h, { p1: true, p2: false, p3: true, p4: false, p5: false });
    mounted = await h.mount(<PathPage source={source()} />, { router: '/path' });
    const p2 = q(mounted.container, 'li[data-unit="p2"]')!;
    expect(p2.getAttribute('data-openable')).toBe('true');
    expect(q(p2, 'a')!.getAttribute('href')).toBe('/read/text%3Aes%3Ap2');
    expect(p2.textContent).toContain('(open in preview)');
  });

  it('says so when the language has no ladder', async () => {
    const h = await makeHarness();
    mounted = await h.mount(<PathPage source={makeLadderSource()} />, { router: '/path' });
    expect(q(mounted.container, '[data-testid="path-none"]')!.textContent).toMatch(/no ladder for Spanish yet/);
    expect(q(mounted.container, '[data-testid="path-draft"]')).toBeNull(); // no units, so no draft warning
  });

  it('is routed at /path in the app', async () => {
    const h = await makeHarness();
    mounted = await h.mount(<Shell><AppRoutes /></Shell>, { router: '/path' });
    expect(q(mounted.container, '.path')).not.toBeNull();
  });
});

describe('the bundled import and the registered path (real bootstrap, Albanian)', () => {
  it('imports the ladder\'s own unit documents with the language\'s corpus, as unpublished drafts, and the signature covers them', async () => {
    const lad = bundledLadder('sq');
    if (!lad) return;
    const store = createIndexedMemoryStore(); // indexed, same semantics (src/sim/store.ts): a real bootstrap's background work on the plain store's scans outlives the test and slows the next one
    const boot = await bootstrap({ store, courseId: 'albania-sq', features: { listen: false } });
    const own = ladderUnitDocuments('sq', undefined, loadBundledCorpus().filter((d) => d.lang === 'sq'));
    expect(own.length).toBeGreaterThan(0);
    const first = lad.units.find((u) => u.doc && !u.inPlace)!;
    const text = await store.texts.get(first.textId!);
    expect(text).toBeDefined();
    expect(text!.published).toBe(false); // machine-drafted until a person has reviewed it and a recording is attached
    expect(text!.unpublishedReasons.length).toBeGreaterThan(0);
    // the corpus went in whole, and the units beside it (a draft unit the importer rejects hides only itself, never the corpus)
    const sqTexts = await store.texts.where('lang', 'sq');
    expect(sqTexts.length).toBeGreaterThanOrEqual(loadBundledCorpus().filter((d) => d.lang === 'sq').length + 1);
    expect(sqTexts.length).toBeLessThanOrEqual(loadBundledCorpus().filter((d) => d.lang === 'sq').length + own.length);
    const sig = (await store.meta.get(bundleMetaId('sq')))!.value;
    // a second start imports nothing and keeps the signature
    const again = await bootstrap({ store, courseId: 'albania-sq', features: { listen: false } });
    expect(again.services.startup!.bundledReport).toBeUndefined();
    expect((await store.meta.get(bundleMetaId('sq')))!.value).toBe(sig);
    // the page's reading of it: the first unit of the real ladder is listed, not openable outside preview
    const view = await createLadderPath({ store }).view(boot.user!.id, 'sq');
    const row = view.groups.flatMap((g) => g.units).find((u) => u.unitId === first.unit.id)!;
    expect(row).toMatchObject({ installed: true, published: false, openable: false });
    expect(row.heldBack).toBeTruthy();
  });
});

describe('the registered path source in GoLearn\'s recommendations (real bootstrap, Albanian)', () => {
  it('offers "Next on your path" only once Stage 0 is done, and never an unpublished unit outside preview', async () => {
    const lad = bundledLadder('sq');
    if (!lad) return;
    const store = createIndexedMemoryStore(); // the in-memory store with indexes (src/sim/store.ts, same semantics): a long ladder makes the plain store's scans minutes slow
    const boot = await bootstrap({ store, courseId: 'albania-sq', features: { listen: false } });
    const userId = boot.user!.id;
    const first = lad.units.find((u) => u.textId)!;
    const title = first.unit.title ?? first.doc?.title;
    const wording = (recs: Array<{ explanation: string }>) => recs.map((r) => r.explanation).find((e) => e.startsWith('Next on your path'));
    // Stage 0 not done: the ladder offers nothing here (the path page says why)
    expect(wording(await boot.services.golearn.recommend(userId, { includeUnpublished: true }))).toBeUndefined();
    // an exit result with any verdict makes Stage 0 done
    const base = { userId, lang: 'sq' as const, surface: 'corpus' as const, session: 's', stepId: 'exit' };
    await boot.services.bus.emit<Stage0ExitStarted>({ ...base, type: 'Stage0ExitStarted', dedupeKey: 'x1', attemptId: 'a1', formId: 'f1', unseen: true, unavailable: [] });
    await boot.services.bus.emit<Stage0ExitFinished>({ ...base, type: 'Stage0ExitFinished', dedupeKey: 'x2', attemptId: 'a1', result: { attemptId: 'a1', formId: 'f1', startedAt: 't', unseen: true, sections: [], verdict: 'not-yet' } });
    const preview = await boot.services.golearn.recommend(userId, { includeUnpublished: true });
    expect(wording(preview)).toContain(`"${title}"`);
    // outside preview a draft is not offered as the next step
    const plain = await boot.services.golearn.recommend(userId, { includeUnpublished: false });
    expect(wording(plain)).toBeUndefined();
  });
});
