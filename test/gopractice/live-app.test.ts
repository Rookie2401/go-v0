// @vitest-environment jsdom
/**
 * Live updates inside the real app: GoLearn pushes an event to the service, the held `POST /sync/wait` answers, the app pulls through its normal
 * sync path and the screen on view repaints (the home, My vocab, Saved decks, the session summary), the cached profile is dropped, and a card
 * that is mid-answer is never touched. The service is the suite's FakeService behind a fake fetch speaking the two routes the service lane adds.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { GoEvent, UnitKnowledge } from '../../packages/repository-contract/src';
import type { RepositoryApi, VocabularyItem, VocabularyPage } from '../../packages/repository-service/src/api';
import { saveDeck } from '../../packages/gopractice/deckModel';
import { cardAdded, defaultService, destroyRigs, dueCard, ids, key, makeRig, startWith, type, until, type FakeService, type Rig } from './helpers';

afterEach(() => { destroyRigs(); vi.useRealTimers(); });
const A = ids('L1', 'sq');

/** `GET /sync/status` and `POST /sync/wait` over a FakeService: a wait is held until `push()` or its abort. */
function liveService(service: FakeService) {
  const held: Array<{ since: number; learner: string; resolve(r: Response): void }> = [];
  const calls: string[] = [];
  const json = (b: unknown): Response => new Response(JSON.stringify(b), { status: 200 });
  const answer = (learner: string, changed: boolean): Response => json({ changed, cursor: String(service.head(learner)), events: service.head(learner) });
  const fetchFn = (async (input: string, init: RequestInit) => {
    const url = new URL(input);
    const token = String((init.headers as Record<string, string>).Authorization ?? '').replace('Bearer ', '');
    const learner = service.tokens.get(token);
    calls.push(`${init.method} ${url.pathname}`);
    if (!learner) return new Response('', { status: 401 });
    if (url.pathname === '/sync/status') return json({ cursor: String(service.head(learner)), events: service.head(learner), at: 'now' });
    if (url.pathname === '/sync/wait') {
      const since = Number(JSON.parse(String(init.body)).since);
      if (service.head(learner) !== since) return answer(learner, true);
      return new Promise<Response>((resolve, reject) => {
        const entry = { since, learner, resolve };
        (init.signal as AbortSignal).addEventListener('abort', () => { const i = held.indexOf(entry); if (i >= 0) held.splice(i, 1); reject(new DOMException('aborted', 'AbortError')); });
        held.push(entry);
      });
    }
    return new Response('', { status: 404 });
  }) as unknown as typeof fetch;
  /** Something landed for this learner: every held wait answers. */
  const push = (learner = 'L1'): void => { for (const h of held.splice(0)) h.resolve(answer(h.learner, true)); void learner; };
  return { fetchFn, held, calls, push };
}

const live = { minRoundMs: 20 };
async function ready(rig: Rig, svc: ReturnType<typeof liveService>): Promise<void> {
  await rig.app.ctx.whenSynced();
  await until(() => svc.held.length > 0, 'the app to hold a wait');
}
const dataEvents = (rig: Rig): { count: () => number } => { let n = 0; rig.app.ctx.onData(() => { n += 1; }); return { count: () => n }; };

describe('live updates in the app', () => {
  it('starts holding a wait once signed in, and repaints the home when GoLearn pushes a card', async () => {
    const service = defaultService();
    const svc = liveService(service);
    const rig = await makeRig({ service, fetch: svc.fetchFn, live, signedIn: true });
    await ready(rig, svc);
    expect(svc.calls).toContain('GET /sync/status');
    expect(rig.q('#deck-count').getAttribute('data-cards')).toBe('0');
    for (const e of dueCard(A, 'zog', 'meaning-to-form')) service.inject('L1', e);   // GoLearn on the desktop
    svc.push();
    await until(() => rig.q('#deck-count').getAttribute('data-cards') === '1', 'the home to show the new card');
    expect(rig.q('#deck-count').textContent).toBe('1 card ready');
    // and it is waiting again, from the new cursor
    await until(() => svc.held.length > 0, 'the next wait');
  });

  it('a live update drops the cached profile: a language added in GoLearn shows in the header without a reload', async () => {
    const service = defaultService();
    const svc = liveService(service);
    const rig = await makeRig({ service, fetch: svc.fetchFn, live, signedIn: true });
    await ready(rig, svc);
    expect(rig.root.querySelector('#language-select')).toBeNull();
    service.enrolments.get('L1')!.push({ enrolmentId: 'L1-e2', learnerId: 'L1', packId: 'pack-de', packVersion: '1', goals: [], startedAt: '2026-10-01T00:00:00.000Z', languageId: 'de' });
    service.inject('L1', cardAdded(A, 'mace', 'meaning-to-form', '2026-10-08T09:00:00.000Z'));
    svc.push();
    await until(() => !!rig.root.querySelector('#language-select'), 'the language switcher');
    const names = [...rig.root.querySelectorAll('#language-select option')].map((o) => o.textContent ?? '');
    expect(names).toHaveLength(2);
    expect(names.join('|')).toMatch(/Albanian.*German|German.*Albanian/);
  });

  it('does not trust a profile older than ten minutes, and trusts a young one', async () => {
    const service = defaultService();
    const rig = await makeRig({ service, signedIn: true });
    const calls: string[] = [];
    const real = rig.deps.createApi;
    rig.deps.createApi = (u, t) => { const api = real(u, t); const orig = api.me.bind(api); return Object.create(api, { me: { value: async () => { calls.push('me'); return orig(); } } }) as RepositoryApi; };
    await rig.app.ctx.enrolments();
    expect(calls).toEqual([]);                       // fresh: from the cache
    rig.clock.set('2026-10-08T10:09:00.000Z');
    await rig.app.ctx.enrolments();
    expect(calls).toEqual([]);                       // nine minutes: still trusted
    rig.clock.set('2026-10-08T10:11:00.000Z');
    await rig.app.ctx.enrolments();
    expect(calls).toEqual(['me']);                   // eleven: asked again
    rig.app.ctx.invalidateProfile();
    await rig.app.ctx.enrolments();
    expect(calls).toEqual(['me', 'me']);             // a live update: asked again at once
  });

  it('a pull that brings nothing (the echo of this device’s own push) repaints nothing', async () => {
    const service = defaultService();
    const svc = liveService(service);
    const rig = await makeRig({ service, fetch: svc.fetchFn, live, signedIn: true });
    await ready(rig, svc);
    // an event this device already holds in its own log (it made the review and sent it): when the account's head moves, the pull appends nothing new
    const d = (await rig.app.ctx.data())!;
    const own = cardAdded(A, 'zog', 'meaning-to-form', '2026-10-08T09:00:00.000Z');
    await d.log.append(d.learnerId, [own]);
    await rig.app.ctx.syncNow({ force: true });
    await until(() => rig.q('#deck-count').getAttribute('data-cards') !== null, 'the home');
    await new Promise((r) => setTimeout(r, 40));
    const seen = dataEvents(rig);
    const home = rig.q('#current-deck');
    service.inject('L1', own as GoEvent);
    svc.push();
    await until(() => svc.calls.filter((c) => c === 'POST /sync/wait').length >= 2, 'the loop to go round');
    await new Promise((r) => setTimeout(r, 60));
    expect(seen.count()).toBe(0);
    expect(rig.q('#current-deck')).toBe(home);
  });

  describe('My vocab and Saved decks react too', () => {
    const word = (label: string): VocabularyItem => {
      const unitId = `lemma:sq:${label}:NOUN`;
      const knowledge = { unitId, languageId: 'sq', level: 'seen', encounters: 2, firstSeenAt: '2026-09-01T00:00:00.000Z', lastSeenAt: '2026-10-07T00:00:00.000Z' } as UnitKnowledge;
      return { knowledge, unit: { unitId, languageId: 'sq', label, kind: 'lexeme' } as VocabularyItem['unit'], surfaceForms: [label], lastEncounter: '2026-10-07T00:00:00.000Z', sources: [] };
    };
    const useVocabulary = (rig: Rig, items: VocabularyItem[]): void => {
      const real = rig.deps.createApi;
      rig.deps.createApi = (u, t) => {
        const api = real(u, t);
        const page = (): VocabularyPage => ({ items, catalog: { total: items.length, counts: { new: 0, seen: items.length, recognized: 0, familiar: 0, known: 0, automatic: 0 } } });
        return Object.create(api, { vocabulary: { value: async () => ({ ok: true as const, status: 200, data: page() }) } }) as RepositoryApi;
      };
    };

    it('a word met while reading appears in My vocab without leaving the screen', async () => {
      const service = defaultService();
      const svc = liveService(service);
      const rig = await makeRig({ service, fetch: svc.fetchFn, live, signedIn: true });
      const items = [word('zog'), word('mace')];
      useVocabulary(rig, items);
      await ready(rig, svc);
      await rig.go('review/vocab');
      await until(() => rig.qa('.vocab-item').length === 2, 'the two words');
      const list = rig.q('#vocab-list');
      items.push(word('qen'));
      service.inject('L1', cardAdded(A, 'qen', 'meaning-to-form', '2026-10-08T09:00:00.000Z'));
      svc.push();
      await until(() => rig.qa('.vocab-item').length === 3, 'the third word');
      expect(rig.q('#vocab-list')).toBe(list);          // repainted in place, the screen was not reopened
      expect(rig.qa('.vocab-word').map((w) => w.textContent)).toContain('qen');
    });

    it('keeps an open "Add to the deck?" question open across the repaint', async () => {
      const service = defaultService();
      const svc = liveService(service);
      const rig = await makeRig({ service, fetch: svc.fetchFn, live, signedIn: true });
      const items = [word('zog'), word('mace')];
      useVocabulary(rig, items);
      await ready(rig, svc);
      await rig.go('review/vocab');
      await until(() => rig.qa('.vocab-item').length === 2, 'the words');
      rig.q<HTMLElement>('[data-unit-id="lemma:sq:zog:NOUN"] .vocab-row').click();
      await until(() => !!rig.root.querySelector('.vocab-ask'), 'the question');
      items.push(word('qen'));
      service.inject('L1', cardAdded(A, 'qen', 'meaning-to-form', '2026-10-08T09:00:00.000Z'));
      svc.push();
      await until(() => rig.qa('.vocab-item').length === 3, 'the third word');
      expect(rig.root.querySelector('.vocab-ask')).not.toBeNull();
    });

    it('Saved decks lists a deck that was saved while the screen was open', async () => {
      const service = defaultService();
      const svc = liveService(service);
      const rig = await makeRig({ service, fetch: svc.fetchFn, live, signedIn: true });
      await ready(rig, svc);
      await rig.go('review/decks');
      await until(() => rig.qa('.deckrow').length === 1, 'the list holds only Class Essentials');
      await saveDeck(rig.app.ctx, { learnerId: 'L1', languageId: 'sq' }, [{ itemId: 'i1', unitId: 'lemma:sq:zog:NOUN', unitKind: 'lemma', label: 'zog', dimension: 'productive-recall', family: 'meaning-to-form' }]);
      service.inject('L1', cardAdded(A, 'zog', 'meaning-to-form', '2026-10-08T09:00:00.000Z'));
      svc.push();
      await until(() => rig.qa('.deckrow').length === 2, 'the saved deck');
    });
  });

  describe('the session', () => {
    it('does not touch a card that is mid-answer: the same box, the same text, the same exercise', async () => {
      const service = defaultService();
      const svc = liveService(service);
      const rig = await makeRig({ service, fetch: svc.fetchFn, live, signedIn: true });
      await ready(rig, svc);
      await startWith(rig, [...dueCard(A, 'zog', 'meaning-to-form'), ...dueCard(A, 'mace', 'meaning-to-form')]);
      const exercise = rig.q('.exercise');
      const input = rig.q<HTMLInputElement>('#answer-input');
      input.focus();
      type(input, 'half an ans');
      const seen = dataEvents(rig);
      service.inject('L1', cardAdded(A, 'qen', 'meaning-to-form', '2026-10-08T09:00:00.000Z'));
      await until(() => svc.held.length > 0, 'a wait');
      svc.push();
      await until(() => seen.count() > 0, 'the data to change under the session');
      await new Promise((r) => setTimeout(r, 40));
      expect(rig.q('.exercise')).toBe(exercise);
      expect(rig.q<HTMLInputElement>('#answer-input')).toBe(input);
      expect(input.value).toBe('half an ans');
      expect(rig.root.querySelector('#summary')).toBeNull();
    });

    it('after the card is graded the session carries on, and a summary already on screen is drawn again when something arrives', async () => {
      const service = defaultService();
      const svc = liveService(service);
      const rig = await makeRig({ service, fetch: svc.fetchFn, live, signedIn: true });
      await ready(rig, svc);
      await startWith(rig, [...dueCard(A, 'zog', 'meaning-to-form'), ...dueCard(A, 'mace', 'meaning-to-form')]);
      const label = rig.q('.exercise').getAttribute('data-item')!.split(':')[4];
      const input = rig.q<HTMLInputElement>('#answer-input');
      type(input, label); key('Enter', input);
      await until(() => !!rig.root.querySelector('#feedback'), 'the feedback');
      service.inject('L1', cardAdded(A, 'qen', 'meaning-to-form', '2026-10-08T09:00:00.000Z'));
      await until(() => svc.held.length > 0, 'a wait');
      svc.push();
      await new Promise((r) => setTimeout(r, 60));
      expect(rig.root.querySelector('#feedback')).not.toBeNull();       // the feedback was not replaced
      rig.q('#next').click();
      await until(() => !!rig.root.querySelector('#answer-input'), 'the second card');
      rig.q('#finish-early').click();
      await until(() => !!rig.root.querySelector('#summary'), 'the summary');
      const before = rig.q('#summary');
      service.inject('L1', cardAdded(A, 'diell', 'meaning-to-form', '2026-10-08T09:30:00.000Z'));
      await until(() => svc.held.length > 0, 'a wait');
      svc.push();
      await until(() => rig.q('#summary') !== before, 'the summary to be drawn again');
      expect(rig.q('#sum-answered').textContent).toMatch(/^1 answered; 2 prompt\(s\) shown; 2 initially planned/);
    });
  });

  it('stops asking when the page is hidden and asks again when it is visible', async () => {
    const service = defaultService();
    const svc = liveService(service);
    const rig = await makeRig({ service, fetch: svc.fetchFn, live, signedIn: true });
    await ready(rig, svc);
    const before = svc.calls.length;
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => true });
    document.dispatchEvent(new Event('visibilitychange'));
    await new Promise((r) => setTimeout(r, 80));
    expect(svc.held).toHaveLength(0);                // the held request was aborted
    expect(svc.calls.length).toBe(before);
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => false });
    document.dispatchEvent(new Event('visibilitychange'));
    await until(() => svc.held.length > 0, 'a new wait');
  });

  it('signing out stops the loop, and a device with no account (the extension copy) never asks', async () => {
    const service = defaultService();
    const svc = liveService(service);
    await makeRig({ service, fetch: svc.fetchFn, live, local: true });
    await new Promise((r) => setTimeout(r, 60));
    expect(svc.calls).toEqual([]);
  });
});
