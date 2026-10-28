// @vitest-environment jsdom
/**
 * GoReview on a phone, offline: the snapshot (packages/gopractice/snapshot.ts) puts the home, My vocab and Saved decks back on screen with no
 * network, the events made meanwhile stay queued and go out when the network returns; and the review edition's own bits (title, first-launch
 * message, the "Update ready — reload" link).
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { UnitKnowledge } from '../../packages/repository-contract/src';
import type { RepositoryApi, VocabularyItem, VocabularyPage } from '../../packages/repository-service/src/api';
import { decksKey } from '../../packages/gopractice/deckModel';
import { readSnapshot, writeSnapshot } from '../../packages/gopractice/snapshot';
import { candidate, knowledgeRow, cardAdded, defaultService, destroyRigs, dueCard, flush, ids, makeRig, queued, reopen, seed, until, unitOf, type Rig } from './helpers';

const A = ids('L1', 'sq');
const click = (el: Element): void => (el as HTMLElement).click();
let online = true;
function setOnline(next: boolean): void {
  online = next;
  Object.defineProperty(window.navigator, 'onLine', { configurable: true, get: () => online });
  window.dispatchEvent(new Event(next ? 'online' : 'offline'));
}
afterEach(() => { destroyRigs(); online = true; Object.defineProperty(window.navigator, 'onLine', { configurable: true, get: () => true }); delete (window as unknown as Record<string, unknown>).__goreviewUpdate; delete (window as unknown as Record<string, unknown>).__goreviewApplyUpdate; });

const word = (label: string): VocabularyItem => {
  const unitId = unitOf(label);
  const knowledge = { unitId, languageId: 'sq', level: 'seen', encounters: 2, firstSeenAt: '2026-09-01T00:00:00.000Z', lastSeenAt: '2026-10-07T00:00:00.000Z' } as UnitKnowledge;
  return { knowledge, unit: { unitId, languageId: 'sq', label, kind: 'lexeme' } as VocabularyItem['unit'], surfaceForms: [label], lastEncounter: '2026-10-07T00:00:00.000Z', sources: [] };
};
/** The Repository's vocabulary list, answering until `net.down` is set (then it fails as a dead network does). */
function useVocabulary(rig: Rig, items: VocabularyItem[]): { down: boolean } {
  const net = { down: false };
  const real = rig.deps.createApi;
  rig.deps.createApi = (u, t) => {
    const api = real(u, t);
    const page: VocabularyPage = { items, catalog: { total: items.length, counts: { new: 0, seen: items.length, recognized: 0, familiar: 0, known: 0, automatic: 0 } } };
    return Object.create(api, { vocabulary: { value: async () => { if (net.down) throw new TypeError('Failed to fetch'); return { ok: true as const, status: 200, data: page }; } } }) as RepositoryApi;
  };
  return net;
}

describe('offline: My vocab', () => {
  it('shows the words this device saved when the service cannot be reached, says so, and writes the snapshot when it can', async () => {
    const service = defaultService();
    const rig = await makeRig({ service, signedIn: true });
    const net = useVocabulary(rig, [word('zog'), word('mace'), word('qen')]);
    await rig.go('review/vocab');
    await until(() => rig.qa('.vocab-item').length === 3, 'the words');
    const snap = await readSnapshot(rig.app.ctx, 'L1', 'sq');
    expect(snap?.vocab?.rows.map((r) => r.label).sort()).toEqual(['mace', 'qen', 'zog']);

    net.down = true; setOnline(false);
    await rig.go('review');
    await rig.go('review/vocab');
    await until(() => rig.qa('.vocab-item').length === 3, 'the saved words');
    expect(rig.q('.status').textContent).toMatch(/offline.*words this device saved on 2026-10-08/);
    expect(rig.qa('.vocab-word').map((w) => w.textContent).sort()).toEqual(['mace', 'qen', 'zog']);
    expect(rig.root.querySelector('#vocab-retry')).toBeNull();
  });

  it('with no snapshot yet (never loaded on this device) it says the words could not be loaded, as before', async () => {
    const rig = await makeRig({ signedIn: true });
    const net = useVocabulary(rig, [word('zog')]);
    net.down = true;
    await rig.go('review/vocab');
    await until(() => !!rig.root.querySelector('#vocab-retry'), 'the retry link');
    expect(rig.q('.status').textContent).toMatch(/could not be loaded/);
  });

  it('the home counts the saved words offline too', async () => {
    const rig = await makeRig({ signedIn: true });
    const net = useVocabulary(rig, [word('zog'), word('mace')]);
    await reopen(rig);
    await until(() => rig.q('#vocab-count').textContent === '2 words', 'the count');
    net.down = true; setOnline(false);
    await reopen(rig);
    await until(() => rig.q('#vocab-count').textContent === '2 words', 'the count offline');
  });

  it('a snapshot belongs to its learner and language and is forgotten with the account’s caches', async () => {
    const service = defaultService();
    service.addAccount('bo@example.org', 'pw', 'L2', [{ languageId: 'sq' }]);
    const rig = await makeRig({ service, signedIn: true });
    useVocabulary(rig, [word('zog')]);
    await rig.go('review/vocab');
    await until(() => rig.qa('.vocab-item').length === 1, 'the word');
    expect(await readSnapshot(rig.app.ctx, 'L1', 'sq')).toBeDefined();
    expect(await readSnapshot(rig.app.ctx, 'L2', 'sq')).toBeUndefined();
    await rig.app.ctx.signOut();
    expect(await readSnapshot(rig.app.ctx, 'L1', 'sq')).toBeUndefined();
  });
});

describe('offline: the home keeps its deck', () => {
  it('does not replay an offline cached proposal after its practice goal is disabled, and keeps due cards', async () => {
    const service = defaultService();
    const rig = await makeRig({ service, signedIn: true });
    await rig.app.ctx.state.setPrefs('L1', { languageId: 'sq', sessionMinutes: 10, maxNew: 2, desiredRetention: 0.9,
      includeListening: false, grammarShare: 0.2, prioritizeSaved: true, practiceGoals: ['recognition'] });
    await seed(rig, dueCard(A, 'mace', 'meaning-to-form'));
    const stale = candidate('det', 0.8, { objectiveDimension: 'productiveRetrieval' });
    await writeSnapshot(rig.app.ctx, 'L1', 'sq', { model: { savedAt: '2026-10-08T10:00:00.000Z', knowledge: [], outcomes: [{
      unitId: stale.unitId, candidate: stale, decision: 'test-now', reasons: ['saved productive proposal'],
      proposed: { dimension: 'meaning-to-target-retrieval', family: 'meaning-to-form' },
    }] } });
    service.allDown = true; setOnline(false);
    await rig.app.ctx.deps.area.remove(`gopractice:candidates:L1:L1-e1`);
    rig.deps.engine.intake = async () => { throw new Error('offline'); };
    await reopen(rig);
    expect(rig.root.querySelector(`#candidates [data-unit="${stale.unitId}"]`)).toBeNull();
    expect(Number(rig.q('#deck-count').getAttribute('data-cards'))).toBeGreaterThan(0);
  });

  it('the proposals of the last successful load stand in when intake cannot run offline, minus what the deck has taken', async () => {
    const service = defaultService();
    const rig = await makeRig({ service, signedIn: true });
    await rig.app.ctx.state.setPrefs('L1', { languageId: 'sq', sessionMinutes: 10, maxNew: 2, desiredRetention: 0.9, includeListening: false, grammarShare: 0.2, prioritizeSaved: true });
    service.candidates.set('L1-e1', [candidate('det', 0.8), candidate('diell', 0.5)]);
    service.knowledge.set('L1',['det','diell'].map(x=>({...knowledgeRow('L1',unitOf(x),'sq',{}),level:'recognized'})));
    await reopen(rig);
    const online = Number(rig.q('#deck-count').getAttribute('data-cards'));
    expect(online).toBeGreaterThan(0);
    expect((await readSnapshot(rig.app.ctx, 'L1', 'sq'))?.model?.outcomes.length).toBeGreaterThan(0);

    // a dead network, no cached candidate list, and an intake that needs the network
    service.allDown = true; setOnline(false);
    await rig.app.ctx.deps.area.remove(`gopractice:candidates:L1:L1-e1`);
    const engine = rig.deps.engine;
    const intake = engine.intake.bind(engine);
    engine.intake = async (req) => { if (service.allDown) throw new Error('offline'); return intake(req); };
    await reopen(rig);
    expect(Number(rig.q('#deck-count').getAttribute('data-cards'))).toBe(online);
    expect(rig.q<HTMLButtonElement>('#start-session').disabled).toBe(false);
  });

  it('without the snapshot the same offline home would be empty (the snapshot is what carries it)', async () => {
    const service = defaultService();
    const rig = await makeRig({ service, signedIn: true });
    await rig.app.ctx.state.setPrefs('L1', { languageId: 'sq', sessionMinutes: 10, maxNew: 2, desiredRetention: 0.9, includeListening: false, grammarShare: 0.2, prioritizeSaved: true });
    service.candidates.set('L1-e1', [candidate('det', 0.8)]);
    service.knowledge.set('L1',[{...knowledgeRow('L1',unitOf('det'),'sq',{}),level:'recognized'}]);
    await reopen(rig);
    expect(Number(rig.q('#deck-count').getAttribute('data-cards'))).toBeGreaterThan(0);
    service.allDown = true; setOnline(false);
    await rig.app.ctx.deps.area.remove(['gopractice:candidates:L1:L1-e1', 'gopractice:snapshot:L1:sq']);
    const engine = rig.deps.engine;
    engine.intake = async () => { throw new Error('offline'); };
    await reopen(rig);
    expect(Number(rig.q('#deck-count').getAttribute('data-cards'))).toBe(0);
  });

  it('Saved decks and the preferences come back from the snapshot if the storage lost them, and are never overwritten when present', async () => {
    const service = defaultService();
    const rig = await makeRig({ service, signedIn: true });
    await seed(rig, dueCard(A, 'zog', 'meaning-to-form'));
    await reopen(rig);
    await rig.app.ctx.state.setPrefs('L1', { languageId: 'sq', sessionMinutes: 25, maxNew: 3, desiredRetention: 0.9, includeListening: false, grammarShare: 0.2, prioritizeSaved: true });
    click(rig.q('#save-deck'));
    await until(() => rig.q('#previous-count').textContent === '2 saved', 'the saved deck');
    await rig.go('settings'); await rig.go('review');            // a load writes the snapshot with the deck and the prefs
    const snap = await readSnapshot(rig.app.ctx, 'L1', 'sq');
    expect(JSON.stringify(snap?.decks)).toContain('zog');
    expect(snap?.prefs?.sessionMinutes).toBe(25);

    await rig.app.ctx.deps.area.remove([decksKey('L1', 'sq'), 'gopractice:prefs:L1:sq']);   // storage lost both
    await reopen(rig);
    expect(rig.q('#previous-count').textContent).toBe('2 saved');
    expect((await rig.app.ctx.state.getPrefs('L1', 'sq')).sessionMinutes).toBe(25);
    await rig.go('review/decks');
    await until(() => rig.qa('.deckrow').length === 2, 'the deck in the list');

    // a record that is there is left alone
    await rig.app.ctx.state.setPrefs('L1', { languageId: 'sq', sessionMinutes: 12, maxNew: 3, desiredRetention: 0.9, includeListening: false, grammarShare: 0.2, prioritizeSaved: true });
    await reopen(rig);
    expect((await rig.app.ctx.state.getPrefs('L1', 'sq')).sessionMinutes).toBe(12);
  });
});

describe('offline: what is done meanwhile is kept and sent when the network returns', () => {
  it('queues the events, says "Offline · 1 waiting on this device", and flushes on reconnect', async () => {
    const service = defaultService();
    const rig = await makeRig({ service, signedIn: true });
    await rig.app.ctx.whenSynced();
    setOnline(false);
    service.netDown = true;
    await flush(3);
    const ectx = (await rig.app.ctx.eventContext())!;
    const e = cardAdded(A, 'zog', 'meaning-to-form', '2026-10-08T10:00:00.000Z');
    expect((await rig.app.ctx.record([{ ...e, id: 'offline-1', dedupeKey: undefined, producer: { ...e.producer, deviceId: ectx.deviceId } }])).queued).toBe(1);
    await rig.app.ctx.syncNow();
    await until(() => /Offline · 1 waiting on this device/.test(rig.q('#sync-indicator').textContent ?? ''), 'the offline indicator');
    expect((await queued(rig)).map((x) => x.id)).toEqual(['offline-1']);
    expect(service.storedEvents('L1').some((x) => x.id === 'offline-1')).toBe(false);

    service.netDown = false;
    setOnline(true);
    await until(() => service.storedEvents('L1').some((x) => x.id === 'offline-1'), 'the queued event to arrive');
    await until(async () => (await queued(rig)).length === 0, 'the queue to empty');
    await until(() => /Online · nothing waiting/.test(rig.q('#sync-indicator').textContent ?? ''), 'the online indicator');
  });
});

describe('the GoReview edition', () => {
  it('is titled GoReview (the home) and marks the page; the other screens say which screen', async () => {
    const rig = await makeRig({ edition: 'review', signedIn: true });
    expect(document.title).toBe('GoReview');
    expect(document.documentElement.getAttribute('data-edition')).toBe('review');
    await rig.go('settings');
    expect(document.title).toBe('GoReview — Settings');
  });

  it('the default build keeps its title', async () => {
    document.documentElement.removeAttribute('data-edition');
    const rig = await makeRig({ signedIn: true });
    expect(document.title).toBe('GoPractice — GoReview');
    expect(document.documentElement.hasAttribute('data-edition')).toBe(false);
    void rig;
  });

  it('first launch (no account on the phone): says GoReview shows what you read with GoLearn on the same account, and offers sign-in', async () => {
    const rig = await makeRig({ edition: 'review' });
    expect(rig.app.current()).toBe('signin');
    const card = rig.q('#review-first-launch');
    expect(card.textContent).toContain('GoReview shows what you read with GoLearn on the same account');
    expect(card.textContent).toMatch(/within seconds/);
    expect(rig.root.querySelector('#hosted-copy')).toBeNull();
    expect(rig.root.textContent).not.toMatch(/extension/i);
    expect(rig.q('#signin-form')).toBeTruthy();
  });

  it('the hosted GoPractice keeps its own first-launch text', async () => {
    const rig = await makeRig({});
    expect(rig.q('#hosted-copy').textContent).toContain('hosted copy of GoPractice');
    expect(rig.root.querySelector('#review-first-launch')).toBeNull();
  });

  it('shows a quiet "Update ready — reload" link only when a newer worker is waiting, and the link applies it', async () => {
    const rig = await makeRig({ edition: 'review', signedIn: true });
    expect(rig.root.querySelector('#update-ready')).toBeNull();
    const apply = vi.fn(() => true);
    (window as unknown as Record<string, unknown>).__goreviewApplyUpdate = apply;
    window.dispatchEvent(new Event('goreview:update-ready'));
    const link = rig.q('#update-ready');
    expect(link.textContent).toBe('Update ready — reload');
    expect(link.closest('header')).not.toBeNull();
    click(link);
    expect(apply).toHaveBeenCalledTimes(1);
    window.dispatchEvent(new Event('goreview:update-ready'));
    expect(rig.qa('#update-ready')).toHaveLength(1);
  });

  it('shows the link at once when the worker was already waiting before the app started', async () => {
    (window as unknown as Record<string, unknown>).__goreviewUpdate = { waiting: {} };
    const rig = await makeRig({ edition: 'review', signedIn: true });
    expect(rig.q('#update-ready').textContent).toBe('Update ready — reload');
  });
});
