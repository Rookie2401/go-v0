// @vitest-environment jsdom
/**
 * GoReview loads from this device (2026-11-10, the owner: "the loading is so inconsistent and unstable").
 * The rule: no screen and no press awaits the network when this device holds a usable local copy. The network only refreshes the copy in the
 * background; when a refresh changes something the open screens repaint. A press waits for an already running refresh at most PRESS_WAIT_MS.
 *
 * Each test seeds an account with a deck and a complete snapshot (the home is loaded once with the service answering), then makes EVERY service
 * request hang: the connection is accepted and nothing ever comes back.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { holdOutOf } from '../../packages/goreview/app/deckModel';
import { createApp } from '../../packages/goreview/app/app';
import { readSnapshot } from '../../packages/goreview/app/snapshot';
import { currentReviewModel, loadReviewModel, PRESS_WAIT_MS, refreshIdle, reviewTiming } from '../../packages/goreview/app/workspace';
import { candidate, defaultService, destroyRigs, dueCard, ids, key, knowledgeRow, makeRig, reopen, reviewed, seed, shownLabel, type, until, type FakeService, type Rig } from '../goreview-app/helpers';

const A = ids('L1', 'sq');
const PREFS = { languageId: 'sq', sessionMinutes: 0, maxNew: 5, cardsPerDeck: 5, desiredRetention: 0.9, includeListening: false, grammarShare: 0.2, prioritizeSaved: true, practiceGoals: ['recognition' as const] };
const TIMING = { ...reviewTiming };
/** Real time a press may take: the bounded wait plus a margin for the work after it. */
const MARGIN_MS = 1_800;

afterEach(() => { destroyRigs(); Object.assign(reviewTiming, TIMING); });

/** Candidates the Repository proposes, each a word read before (recognized), so intake admits it as a new card. */
const offer = (service: FakeService, labels: string[]): void => {
  const proposed = labels.map((l, i) => candidate(l, 0.9 - i * 0.05));
  service.candidates.set('L1-e1', proposed);
  service.knowledge.set('L1', proposed.map((c) => ({ ...knowledgeRow('L1', c.unitId, 'sq', {}), level: 'recognized' as const })));
};
const WORDS = ['det', 'diell', 'hene', 'yll'];
const MORE_WORDS = [...WORDS, 'qiell', 'mal', 'lum', 'pyll', 'fushe', 'det2', 're', 'shi'];
const cards = (rig: Rig, id: string): number => Number(rig.q(`#${id}`).getAttribute('data-cards'));
const click = (el: Element): void => (el as HTMLElement).click();
/** Where the service's request log and answer count stood when it was hung: the tests count from there. */
let requestMark = 0, answeredMark = 0;
const counted = (service: FakeService, name: string): number => service.requests.slice(requestMark).filter((r) => r === name).length;
const answeredSinceHang = (service: FakeService): number => service.answered - answeredMark;
const answeredCandidates = (service: FakeService): number => service.calls.filter((c) => c === 'candidates').length;

/** The account the rule is tested on: a signed-in learner with a deck (two due cards and new words) and the home's complete snapshot on this device. */
async function seedAccount(words = WORDS): Promise<{ service: FakeService; rig: Rig }> {
  const service = defaultService();
  const rig = await makeRig({ service, signedIn: true });
  await rig.app.ctx.state.setPrefs('L1', PREFS);
  offer(service, words);
  // zog: answered Again, so still drilled (Current Deck); mace: Again, then Easy a day later, so an established review that has come due (Review Deck)
  await seed(rig, [...dueCard(A, 'zog', 'meaning-to-form'), ...dueCard(A, 'mace', 'meaning-to-form'), reviewed(A, 'mace', 'meaning-to-form', 4, '2026-09-02T10:00:00.000Z')]);
  await reopen(rig);
  // the complete snapshot of THIS deck (the one the home wrote before the words were offered holds none of them)
  await until(async () => (await readSnapshot(rig.app.ctx, 'L1', 'sq'))?.model?.candidates?.length === words.length, 'the complete snapshot on this device', 400);
  expect(cards(rig, 'start-session')).toBeGreaterThan(0);
  return { service, rig };
}

/** A new app over the same storage, with the service hung when asked, and the launch screen in the page. Resolves when the first screen has rendered. */
async function coldStart(prev: Rig, opts: { hang?: boolean } = {}): Promise<Rig> {
  prev.app.destroy();
  requestMark = prev.service.requests.length; answeredMark = prev.service.answered;
  if (opts.hang !== false) prev.service.hang();
  return makeRig({ service: prev.service, area: prev.area, splash: true });
}

const splashGone = (): boolean => { const el = document.getElementById('goreview-splash'); return !el || el.classList.contains('out'); };
/** The home is first-painted: the launch screen is dismissed and the deck rows are in the page. */
const firstPaint = (rig: Rig): boolean => splashGone() && !!rig.root.querySelector('#start-session') && !!rig.root.querySelector('#start-review')
  && !!rig.root.querySelector('#current-deck .deck-row');

/** Plays a started session to its summary with typed answers. */
async function playOut(rig: Rig): Promise<void> {
  for (let i = 0; i < 20 && !rig.root.querySelector('#summary'); i++) {
    await until(() => !!rig.root.querySelector('#session .exercise') || !!rig.root.querySelector('#summary'), 'a card or the summary');
    if (rig.root.querySelector('#summary')) break;
    const input = rig.root.querySelector<HTMLInputElement>('#answer-input');
    if (input) { type(input, shownLabel(rig)); key('Enter', input); } // a typed question
    else rig.qa('.choice')[0]!.click(); // a choice: whichever, the grade does not matter here
    await until(() => !!rig.root.querySelector('#feedback'), 'the feedback');
    rig.q('#next').click();
  }
  await until(() => !!rig.root.querySelector('#summary'), 'the summary');
}

describe('GoReview with this device\'s copy and a service that never answers', () => {
  it('(a) a cold start paints the home with its decks, resolves, and dismisses the splash, with no request answered', async () => {
    const { rig: first } = await seedAccount();
    const rig = await coldStart(first); // makeRig awaits app.ready(): it resolves although nothing is answered
    await until(() => firstPaint(rig), 'the first paint: splash dismissed and the deck rows in the page', 600);
    expect(cards(rig, 'start-session')).toBeGreaterThan(0);
    expect(cards(rig, 'start-review')).toBeGreaterThan(0);
    expect(rig.q('#current-deck').textContent).toContain('Current Deck');
    expect(answeredSinceHang(rig.service)).toBe(0);
    expect(counted(rig.service, 'candidates')).toBeGreaterThan(0); // the refresh was started, and is still waiting
  }, 20_000);

  it('(b) Current Deck starts a session and shows its first card within PRESS_WAIT_MS plus a margin', async () => {
    const { rig: first } = await seedAccount();
    const rig = await coldStart(first);
    await until(() => firstPaint(rig), 'the first paint', 600);
    const at = Date.now();
    click(rig.q('#start-session'));
    await until(() => rig.app.current() === 'review/session' && !!rig.root.querySelector('#session .exercise'), 'the first card', 800);
    expect(Date.now() - at).toBeLessThan(PRESS_WAIT_MS + MARGIN_MS);
    expect(answeredSinceHang(rig.service)).toBe(0);
  }, 20_000);

  it('(b) Begin new deck on a model older than five minutes waits at most PRESS_WAIT_MS for the running refresh, then plans from this device', async () => {
    const { rig: first } = await seedAccount(MORE_WORDS);
    const rig = await coldStart(first);
    await until(() => firstPaint(rig), 'the first paint', 600);
    // the painted model is now too old to plan from as it is (the five-minute rule), so the press asks for a fresh one: from this device, not the service
    rig.clock.set(new Date(rig.clock.now.getTime() + 6 * 60_000).toISOString());
    const at = Date.now();
    click(rig.q('#start-new'));
    await until(() => rig.app.current() === 'review/session' && !!rig.root.querySelector('#session .exercise'), `the new deck: ${rig.q('#review-home .status')?.textContent}`, 800);
    const took = Date.now() - at;
    expect(took).toBeGreaterThanOrEqual(PRESS_WAIT_MS - 200); // it did wait for the refresh that was running...
    expect(took).toBeLessThan(PRESS_WAIT_MS + MARGIN_MS);      // ...and no longer
    expect(rig.app.ctx.run.active!.plan.items.some((p) => p.isNew)).toBe(true);
    expect([...(await holdOutOf(rig.app.ctx, 'L1', 'sq'))]).toEqual([]);
    expect(answeredSinceHang(rig.service)).toBe(0);
  }, 20_000);

  it('(c) a finished session paints its summary with the Next section, and Begin next deck works', async () => {
    const { rig: first } = await seedAccount(MORE_WORDS);
    const rig = await coldStart(first);
    await until(() => firstPaint(rig), 'the first paint', 600);
    click(rig.q('#start-session'));
    await until(() => !!rig.root.querySelector('#session .exercise'), 'the first card', 800);
    await playOut(rig);
    const at = Date.now();
    await until(() => !!rig.root.querySelector('#summary-next'), 'the Next section', 200);
    expect(rig.q('#summary-next').textContent).toContain('Next scheduled session');
    expect(rig.q('#summary-next').textContent).not.toContain('Loading what comes next');
    const next = rig.q<HTMLButtonElement>('#continue-due-work');
    expect(next.disabled).toBe(false);
    click(next);
    await until(() => !!rig.root.querySelector('#session .exercise'), 'the next deck\'s first card', 800);
    expect(Date.now() - at).toBeLessThan(PRESS_WAIT_MS + MARGIN_MS);
    expect(answeredSinceHang(rig.service)).toBe(0);
  }, 30_000);

  it('(d) Saved decks, My vocab and the remediation page open', async () => {
    const { rig: first } = await seedAccount();
    const rig = await coldStart(first);
    await until(() => firstPaint(rig), 'the first paint', 600);
    await rig.go('review/decks');
    expect(rig.root.querySelector('#decks-title')).not.toBeNull();
    await rig.go('review/vocab');
    expect(rig.root.querySelector('#vocab-title')).not.toBeNull();
    expect(rig.root.querySelector('#vocab-list')).not.toBeNull();
    await rig.go('review/remediation');
    expect(rig.root.querySelector('#remediation-h')).not.toBeNull();
    await rig.go('review/details');
    expect(rig.root.querySelector('#due-summary')).not.toBeNull();
    expect(answeredSinceHang(rig.service)).toBe(0);
  }, 30_000);

  it('(e) with the service answering again one refresh runs, however many ask, and the home repaints with the new data', async () => {
    const { rig: first } = await seedAccount(['det']); // one new word on this device's copy
    const before = answeredCandidates(first.service);
    const rig = await coldStart(first);
    await until(() => firstPaint(rig), 'the first paint', 600);
    const small = cards(rig, 'start-session');
    // while the service was away, GoLearn read more words: the refresh brings them
    offer(rig.service, MORE_WORDS);
    // ten screens ask at once: they share the one refresh that is already running (hung)
    const asking = await Promise.all(Array.from({ length: 10 }, () => currentReviewModel(rig.app.ctx)));
    expect(asking.every((m) => m && m.provisional)).toBe(true); // all answered at once from this device's copy
    expect(counted(rig.service, 'candidates')).toBe(1);
    rig.service.release();
    await refreshIdle(rig.app.ctx);
    await until(() => cards(rig, 'start-session') > small, 'the home repainted with the new words', 400);
    expect(answeredCandidates(rig.service) - before).toBe(1); // one load for everything
    // and a burst of live loads after that is still one
    const loads = answeredCandidates(rig.service);
    await Promise.all(Array.from({ length: 6 }, () => loadReviewModel(rig.app.ctx)));
    expect(answeredCandidates(rig.service) - loads).toBe(1);
  }, 30_000);

  it('(f) with no copy on this device the home shows its loading state, then the not-loaded state at the deadline, and repaints when the service answers', async () => {
    const { rig: first } = await seedAccount();
    first.app.destroy();
    for (const k of [...await first.area.list('gopractice:snapshot:'), ...await first.area.list('gopractice:candidates:')]) await first.area.remove(k);
    first.service.hang();
    reviewTiming.refreshDeadlineMs = 400;
    // not makeRig: it waits for the first screen, and this is about what is on screen before that
    const root = document.createElement('div');
    root.id = 'app';
    document.body.innerHTML = '';
    document.body.append(root);
    const app = createApp(root, { ...first.deps });
    const at = Date.now();
    await until(() => !!root.querySelector('#review-home .go-loading'), 'the loading state', 200);
    expect(root.querySelector('#current-deck')).toBeNull();
    await app.ready();
    expect(Date.now() - at).toBeGreaterThanOrEqual(300); // it waited for the deadline, not for the service
    expect(Date.now() - at).toBeLessThan(400 + MARGIN_MS);
    expect(root.querySelector('#deck-not-loaded')).not.toBeNull();
    expect(root.querySelector('#review-home .go-loading')).toBeNull();
    // the live load was never abandoned: when the service answers the home repaints with its deck
    first.service.release();
    await until(() => !!root.querySelector('#current-deck') && Number(root.querySelector('#start-session')?.getAttribute('data-cards')) > 0, 'the deck once the service answered', 400);
    app.destroy();
  }, 30_000);

  it('(g) a stale cached profile does not block: /me hangs and the home still paints', async () => {
    const { rig: first } = await seedAccount();
    const profile = await first.app.ctx.state.getProfile();
    expect(profile).toBeDefined();
    await first.app.ctx.state.setProfile({ ...profile!, fetchedAt: '2026-10-01T00:00:00.000Z' }); // far older than ten minutes
    const rig = await coldStart(first);
    await until(() => firstPaint(rig), 'the first paint', 600);
    expect(counted(rig.service, 'me')).toBeGreaterThan(0); // it was asked, in the background
    expect(answeredSinceHang(rig.service)).toBe(0);
    expect(cards(rig, 'start-session')).toBeGreaterThan(0);
  }, 20_000);
});

describe('the service address survives a failed config.json', () => {
  const store = (): Pick<Storage, 'getItem' | 'setItem'> & { data: Map<string, string> } => {
    const data = new Map<string, string>();
    return { data, getItem: (k) => data.get(k) ?? null, setItem: (k, v) => { data.set(k, v); } };
  };
  const answering = (body: string): typeof fetch => (async () => new Response(body, { status: 200 })) as unknown as typeof fetch;
  const failing: typeof fetch = (async () => { throw new Error('offline'); }) as unknown as typeof fetch;
  const hanging: typeof fetch = (() => new Promise(() => undefined)) as unknown as typeof fetch;

  it('keeps the last good config.json and uses it when the next load fails or hangs; "none" only when there never was one', async () => {
    const { resolveConfig, CONFIG_KEY } = await import('../../packages/goreview/app/config');
    const kept = store();
    const first = await resolveConfig(answering(JSON.stringify({ serviceUrl: 'https://repository.example.org' })), kept);
    expect(first).toEqual({ config: { serviceUrl: 'https://repository.example.org' }, source: 'file' });
    expect(kept.data.has(CONFIG_KEY)).toBe(true);
    expect((await resolveConfig(failing, kept)).config.serviceUrl).toBe('https://repository.example.org');
    expect((await resolveConfig(failing, kept)).source).toBe('saved');
    const at = Date.now();
    expect((await resolveConfig(hanging, kept, { waitMs: 100 })).source).toBe('saved'); // a hung file does not hold the start
    expect(Date.now() - at).toBeLessThan(1_000);
    // a dev-server answer that is not JSON is a failed load too, and nothing is kept from it
    const empty = store();
    expect(await resolveConfig(answering('<!doctype html>'), empty)).toEqual({ config: {}, source: 'none' });
    expect(empty.data.size).toBe(0);
    expect((await resolveConfig(failing, undefined)).source).toBe('none');
  });
});
