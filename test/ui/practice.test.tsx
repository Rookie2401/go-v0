// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import type { ProductionRecorded } from '../../src/core';
import { ids } from '../../src/core';
import { createGoLearn } from '../../src/golearn';
import { createRetrieval, retrievalMetaId, parseRetrievalState } from '../../src/golearn/retrieval';
import type { RetrievalPrompt } from '../../src/golearn/retrieval';
import { AppRoutes, Shell } from '../../src/ui/App';
import { ES_STORY, buildSpanish } from '../golearn/fixtures';
import { createTestRegistry } from '../golearn/testAdapters';
import { button, byLabel, click, flush, makeHarness, q, qa, type as typeInto, USER } from './harness';
import type { Harness, Mounted } from './harness';

let mounted: Mounted | undefined;
afterEach(async () => { await mounted?.unmount(); mounted = undefined; });

const SESSION_A = '2026-01-01T10:00:00.000Z';
const SESSION_B = '2026-01-01T13:00:00.000Z'; // more than a sitting later

/** The UI harness with the REAL GoLearn and the test adapters (the fakes have no occurrences), and a story the learner has read twice. */
async function readerHarness(opts: { read?: boolean } = {}): Promise<Harness> {
  const h = await makeHarness();
  const adapters = createTestRegistry();
  const golearn = createGoLearn({ store: h.store, bus: h.bus, adapters });
  golearn.attach();
  h.services.golearn = golearn;
  h.services.adapters = adapters;
  await buildSpanish(h.store);
  if (opts.read !== false) {
    for (const [at, session] of [[SESSION_A, 'sa'], [SESSION_B, 'sb']] as const) {
      for (let i = 0; i < 4; i++) {
        await h.bus.emit({
          type: 'SentenceViewed', userId: USER, lang: 'es', session, surface: 'corpus', at, dedupeKey: `view:${USER}:${session}:${i}`,
          textId: ES_STORY, sentenceId: `${ES_STORY}/s${i}`, tokenIds: [],
        } as never);
      }
    }
  }
  return h;
}

/** What the page should ask first: the engine over the same store, same ordering. */
async function firstPrompt(h: Harness): Promise<RetrievalPrompt> {
  const r = createRetrieval({ store: h.store, bus: h.bus, adapters: h.services.adapters, golearn: h.services.golearn });
  return (await r.today(USER, 'es')).prompts[0];
}

const cloze = (c: HTMLElement) => q(c, '[data-testid="practice-cloze"]')!.textContent;

describe('Practice page', () => {
  it('asks a word of a sentence the learner read, blanked, with the title of its text', async () => {
    const h = await readerHarness();
    const expected = await firstPrompt(h);
    mounted = await h.mount(<Shell><AppRoutes /></Shell>, { router: '/practice' });
    const c = mounted.container;
    expect(q(c, '[data-testid="practice-prompt"]')).not.toBeNull();
    expect(c.textContent).toContain('from "Historia 1"');
    expect(c.textContent).toMatch(/Word 1 of \d+/);
    expect(cloze(c)).toBe(`${expected.before}_____${expected.after}`);
    // the blank is a word of the story's own sentence, and the answer is not on the page
    expect(c.textContent).not.toContain(expected.sentence);
    expect(expected.sentenceId.startsWith(ES_STORY)).toBe(true);
  });

  it('a correct answer records unaided production for that item and moves on', async () => {
    const h = await readerHarness();
    const expected = await firstPrompt(h);
    mounted = await h.mount(<Shell><AppRoutes /></Shell>, { router: '/practice' });
    const c = mounted.container;
    await typeInto(byLabel<HTMLInputElement>(c, 'Your answer'), expected.answer);
    await click(button(c, 'Check'));
    expect(q(c, '[data-testid="practice-feedback"]')!.textContent).toContain('Right.');
    expect(cloze(c)).toBe(expected.sentence); // the word now stands in its sentence

    const events = (await h.events('ProductionRecorded')) as ProductionRecorded[];
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ itemId: expected.itemId, kind: 'independent', modality: 'writing', sentenceText: expected.sentence });
    const state = await h.services.golearn.getItemState(USER, expected.itemId);
    expect(state?.writing.evidence).toBe(1);

    await click(button(c, 'Next'));
    expect(c.textContent).toMatch(/Word 2 of \d+/);
    const stored = parseRetrievalState((await h.store.meta.get(retrievalMetaId(USER, 'es')))?.value);
    expect(stored.items[expected.itemId]).toMatchObject({ level: 1, lastOutcome: 'independent' });
    expect(stored.doneToday).toBe(1);
  });

  it('a missing accent is accepted, with a note', async () => {
    const h = await readerHarness();
    const day = await createRetrieval({ store: h.store, bus: h.bus, adapters: h.services.adapters, golearn: h.services.golearn }).today(USER, 'es');
    const accented = day.prompts.findIndex((p) => p.answer === 'corazón');
    expect(accented).toBeGreaterThanOrEqual(0);
    mounted = await h.mount(<Shell><AppRoutes /></Shell>, { router: '/practice' });
    const c = mounted.container;
    for (let i = 0; i < accented; i++) { await click(button(c, 'Show the word')); await click(button(c, 'Next')); }
    await typeInto(byLabel<HTMLInputElement>(c, 'Your answer'), 'corazon');
    await click(button(c, 'Check'));
    expect(q(c, '[data-testid="practice-feedback"]')!.textContent).toContain('spelled with its marks');
    expect(((await h.events('ProductionRecorded')) as ProductionRecorded[]).map((e) => e.itemId)).toContain(ids.lemma('es', 'corazón', 'NOUN'));
  });

  it('hint flow: a wrong answer shows the first letter, a right one after it counts as assisted', async () => {
    const h = await readerHarness();
    const expected = await firstPrompt(h);
    mounted = await h.mount(<Shell><AppRoutes /></Shell>, { router: '/practice' });
    const c = mounted.container;
    await typeInto(byLabel<HTMLInputElement>(c, 'Your answer'), 'xyzzy');
    await click(button(c, 'Check'));
    expect(c.textContent).toContain('Not quite.');
    expect(c.textContent).toContain('It starts with');
    expect(q(c, '[data-testid="practice-blank"]')!.textContent!.startsWith(expected.firstLetter)).toBe(true);
    expect(await h.events('ProductionRecorded')).toHaveLength(0); // a miss changes nothing in GoLearn

    await typeInto(byLabel<HTMLInputElement>(c, 'Your answer'), expected.answer);
    await click(button(c, 'Check'));
    const events = (await h.events('ProductionRecorded')) as ProductionRecorded[];
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ itemId: expected.itemId, kind: 'assisted', modality: 'writing' });
    expect((await h.services.golearn.getItemState(USER, expected.itemId))?.writing.evidence).toBe(0.4);
  });

  it('two misses show the whole word and record nothing; the word is put 4 hours off', async () => {
    const h = await readerHarness();
    const expected = await firstPrompt(h);
    mounted = await h.mount(<Shell><AppRoutes /></Shell>, { router: '/practice' });
    const c = mounted.container;
    await typeInto(byLabel<HTMLInputElement>(c, 'Your answer'), 'xyzzy');
    await click(button(c, 'Check'));
    await typeInto(byLabel<HTMLInputElement>(c, 'Your answer'), 'plugh');
    await click(button(c, 'Check'));
    const feedback = q(c, '[data-testid="practice-feedback"]')!;
    expect(feedback.textContent).toContain('The word is');
    expect(feedback.textContent).toContain(expected.answer);
    expect(await h.events('ProductionRecorded')).toHaveLength(0);
    const sched = parseRetrievalState((await h.store.meta.get(retrievalMetaId(USER, 'es')))?.value).items[expected.itemId];
    expect(sched).toMatchObject({ lastOutcome: 'miss', level: 0 });
    expect(Date.parse(sched.dueAt!) - Date.parse(sched.lastAt!)).toBe(4 * 3600_000);
  });

  it('after the last prompt a summary says what came back unaided and what to look at again', async () => {
    const h = await readerHarness();
    mounted = await h.mount(<Shell><AppRoutes /></Shell>, { router: '/practice' });
    const c = mounted.container;
    const total = Number(/Word 1 of (\d+)/.exec(c.textContent!)![1]);
    expect(total).toBeGreaterThan(1);
    for (let i = 0; i < total; i++) { await click(button(c, 'Show the word')); await click(button(c, 'Next')); }
    const summary = q(c, '[data-testid="practice-summary"]')!;
    expect(summary.textContent).toContain(`${total} words: 0 on your own, 0 with the first letter, ${total} to look at again.`);
  });

  it('with no reading it says why there is nothing to practise', async () => {
    const h = await readerHarness({ read: false });
    mounted = await h.mount(<Shell><AppRoutes /></Shell>, { router: '/practice' });
    const empty = q(mounted.container, '[data-testid="practice-empty"]')!;
    expect(empty.textContent).toContain('Practice uses the sentences you have read');
    expect(q(mounted.container, '[data-testid="practice-prompt"]')).toBeNull();
  });
});

describe('entries', () => {
  it('Home shows Practice, after Reading, only when a prompt is due', async () => {
    const h = await readerHarness();
    mounted = await h.mount(<Shell><AppRoutes /></Shell>, { router: '/' });
    await flush(8);
    const names = qa(mounted.container, 'nav[aria-label="Start here"] .home__entry-name').map((x) => x.textContent);
    expect(names.slice(0, 2)).toEqual(['Reading', 'Practice']);
    expect(qa(mounted.container, 'a[href="/practice"]')).toHaveLength(1);
    expect(mounted.container.textContent).toContain('Words from what you read');
  });

  it('Home has no Practice entry for a learner who has read nothing', async () => {
    const h = await readerHarness({ read: false });
    mounted = await h.mount(<Shell><AppRoutes /></Shell>, { router: '/' });
    await flush(8);
    expect(qa(mounted.container, 'nav[aria-label="Start here"] .home__entry-name').map((x) => x.textContent)).not.toContain('Practice');
  });

  it('a Vocabulary row can be practised now: the word goes to the front of the set', async () => {
    const h = await readerHarness();
    mounted = await h.mount(<Shell><AppRoutes /></Shell>, { router: '/vocabulary' });
    await flush(8);
    const c = mounted.container;
    await click(byLabel(c, 'Practise pecado'));
    await flush(8);
    expect(q(c, '[data-testid="practice-prompt"]')).not.toBeNull();
    const queued = parseRetrievalState((await h.store.meta.get(retrievalMetaId(USER, 'es')))?.value).items[ids.form('es', 'pecado')];
    expect(queued?.queuedAt).toBeDefined();
    expect(cloze(c)).toContain('Dios perdona el _____.');
  });

  it('Practise says why when the word was never read in a sentence of the store', async () => {
    const h = await readerHarness();
    // a learner row for a word that no read sentence contains
    await h.store.learnerItems.put({
      id: ids.learnerItem(USER, ids.form('es', 'zorro')), userId: USER, lang: 'es', itemId: ids.form('es', 'zorro'), itemKind: 'form',
      reading: { level: 'encountered', confidence: 0, evidence: 0, exposures: 1, estimatedFamiliar: false, unassisted: 1, assisted: 0 },
      listening: { level: 'unseen', confidence: 0, evidence: 0, exposures: 0, estimatedFamiliar: false, unassisted: 0, assisted: 0 },
      writing: { level: 'unseen', confidence: 0, evidence: 0, exposures: 0, estimatedFamiliar: false, unassisted: 0, assisted: 0 },
      speaking: { level: 'unseen', confidence: 0, evidence: 0, exposures: 0, estimatedFamiliar: false, unassisted: 0, assisted: 0 },
      encounterCount: 1, textIds: [],
    });
    mounted = await h.mount(<Shell><AppRoutes /></Shell>, { router: '/vocabulary' });
    await flush(8);
    await click(byLabel(mounted.container, 'Practise zorro'));
    expect(mounted.container.textContent).toContain('No sentence you have read contains this word');
    expect(q(mounted.container, '[data-testid="practice-prompt"]')).toBeNull();
  });
});
