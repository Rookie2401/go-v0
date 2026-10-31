// @vitest-environment jsdom
/**
 * The home comes back fast (the owner, 2026-10-28: "when going back from the settings or from the user profile it takes a long time"):
 *   - a return with the same events and preferences paints the home again from memory, with no request to the Repository;
 *   - a change the key cannot see (a deck saved) paints fresh; new events paint fresh;
 *   - the planner reads the units it may ask about in one batch (primeFacts) instead of one request per word;
 *   - the vocabulary's unit batches go out together, not one after the other;
 *   - the shell shows the loading mark while a screen opens.
 */
import { afterEach, describe, expect, it } from 'vitest';
import type { RepositoryApi } from '../../packages/repository-service/src/api';
import { createReviewEngine } from '../../packages/goreview/app/engine';
import { forgetPaintedHome } from '../../packages/goreview/app/screens/review';
import { loadVocab } from '../../packages/goreview/app/deckModel';
import type { AppContext } from '../../packages/goreview/app/context';
import { candidate, destroyRigs, dueCard, ids, makeRig, seed, until } from './helpers';

afterEach(() => { destroyRigs(); });

const calls = (rig: { service: { calls: string[] } }, name: string): number => rig.service.calls.filter((c) => c === name).length;
const vocabItem = (n: number) => {
  const unitId = `lemma:sq:w${n}:NOUN`;
  return { knowledge: { unitId, languageId: 'sq', level: 'recognized', encounters: 1 },
    unit: { unitId, languageId: 'sq', label: `w${n}`, kind: 'lexeme' }, surfaceForms: [], sources: [] };
};

describe('the home on a return', () => {
  it('paints scheduled work before a cold vocabulary page finishes, then refreshes its count', async () => {
    const rig = await makeRig({ signedIn: true });
    await seed(rig, [...dueCard(ids('L1', 'sq'), 'zog', 'meaning-to-form'), ...dueCard(ids('L1', 'sq'), 'mace', 'meaning-to-form')]);
    const base = (await rig.app.ctx.api()).api as unknown as Record<string, unknown>;
    let requested = 0, requestedBeforeDeckPaint = 0;
    let release!: (value: unknown) => void;
    const api = new Proxy(base, { get(target, key) {
      if (key === 'vocabulary') return () => {
        requested++;
        if (!rig.root.querySelector('#deck-count')) requestedBeforeDeckPaint++;
        return new Promise((resolve) => { release = resolve; });
      };
      return Reflect.get(target, key);
    } }) as unknown as RepositoryApi;
    rig.app.ctx.api = async () => ({ api, session: undefined, baseUrl: '' });
    forgetPaintedHome(rig.app.ctx);
    await rig.go('settings');
    await rig.go('review');
    await until(() => !!rig.root.querySelector('#deck-count'), 'the deck to paint without waiting for vocabulary');
    expect(requested).toBe(1);
    expect(requestedBeforeDeckPaint).toBe(0);
    expect(rig.q('#deck-count').textContent).toBe('2 cards ready');

    release({ ok: true, status: 200, data: { items: [], catalog: { total: 0, counts: {} } } });
    await until(() => rig.q('#vocab-count').getAttribute('data-completeness') === 'complete', 'the vocabulary load to finish');
  });

  it('paints again from memory after Settings and after the account page: no candidates request, the same entries', async () => {
    const rig = await makeRig({ signedIn: true });
    rig.service.candidates.set('e1', [candidate('lemma:sq:mace:NOUN', 0.9)]);
    await rig.go('review');
    await until(() => !!rig.root.querySelector('#deck-count'), 'the home');
    const first = rig.q('#deck-count').textContent;
    const before = calls(rig, 'candidates');
    expect(before).toBeGreaterThan(0);
    await rig.go('settings');
    await rig.go('review');
    await until(() => !!rig.root.querySelector('#deck-count'), 'the home again');
    expect(rig.q('#deck-count').textContent).toBe(first);
    expect(calls(rig, 'candidates')).toBe(before);
    await rig.go('account');
    await rig.go('review');
    await until(() => !!rig.root.querySelector('#deck-count'), 'the home a third time');
    expect(calls(rig, 'candidates')).toBe(before);
    expect(rig.root.querySelector('.go-loading')).toBeNull(); // nothing left to wait for
  });

  it('asks again when the events moved on (a card added) and when the deck size changed', async () => {
    const rig = await makeRig({ signedIn: true });
    rig.service.candidates.set('e1', [candidate('lemma:sq:mace:NOUN', 0.9)]);
    await rig.go('review');
    await until(() => !!rig.root.querySelector('#deck-count'), 'the home');
    const before = calls(rig, 'candidates');
    await seed(rig, [...dueCard(ids('L1', 'sq'), 'zog', 'meaning-to-form')]); // more events in the local log
    await rig.go('settings');
    await rig.go('review');
    await until(() => !!rig.root.querySelector('#deck-count'), 'the home after an event');
    expect(calls(rig, 'candidates')).toBeGreaterThan(before);
  });

  it('shows the loading mark while a screen opens', async () => {
    const rig = await makeRig({ signedIn: true });
    const opening = rig.go('settings');
    // the shell appends the mark before its first await
    expect(rig.root.querySelector('main .go-loading')?.textContent).toBe('Opening GoReview…');
    await opening;
    expect(rig.root.querySelector('main .go-loading')).toBeNull();
  });
});

describe('the planner and the vocabulary ask the Repository in batches', () => {
  it('loads past the old 6000-row cap and reports a complete 6100-word list', async () => {
    const queries: Array<string | undefined> = [];
    const api = {
      async vocabulary(query: { after?: string }) {
        queries.push(query.after);
        const offset = query.after ? Number(query.after) : 0;
        const items = Array.from({ length: Math.min(100, 6100 - offset) }, (_, i) => vocabItem(offset + i));
        const next = offset + items.length < 6100 ? String(offset + items.length) : undefined;
        return { ok: true as const, status: 200, data: { items, catalog: { total: 6100, counts: {} }, ...(next ? { nextCursor: next } : {}) } };
      },
    } as unknown as RepositoryApi;
    const ctx = { api: async () => ({ api, session: undefined, baseUrl: 'x' }), identity: async () => undefined,
      deps: { now: () => new Date('2026-10-28T00:00:00.000Z') } } as unknown as AppContext;

    const loaded = await loadVocab(ctx, 'sq');
    expect(queries).toHaveLength(61);
    expect(queries[60]).toBe('6000');
    expect(loaded).toMatchObject({ total: 6100, complete: true });
    expect(loaded.rows).toHaveLength(6100);
  });

  it('stops a repeated vocabulary cursor and labels the returned rows incomplete', async () => {
    const queries: Array<string | undefined> = [];
    const api = {
      async vocabulary(query: { after?: string }) {
        queries.push(query.after);
        const offset = query.after ? 100 : 0;
        const items = Array.from({ length: 100 }, (_, i) => vocabItem(offset + i));
        return { ok: true as const, status: 200, data: { items, catalog: { total: 200, counts: {} }, nextCursor: 'again' } };
      },
    } as unknown as RepositoryApi;
    const ctx = { api: async () => ({ api, session: undefined, baseUrl: 'x' }), identity: async () => undefined,
      deps: { now: () => new Date('2026-10-28T00:00:00.000Z') } } as unknown as AppContext;

    const loaded = await loadVocab(ctx, 'sq');
    expect(queries).toEqual([undefined, 'again']);
    expect(loaded).toMatchObject({ total: 200, complete: false, incompleteReason: 'cursor-loop' });
  });

  it('primeFacts hands the unit ids to the pack provider in one call; a provider without prime is left alone', async () => {
    const primed: string[][] = [];
    const provider = { factsFor: async () => undefined, prime: async (ids: string[]) => { primed.push(ids); } };
    const engine = createReviewEngine({ builders: {} as never, evidenceFor: (() => []) as never, ratingFor: (() => 3) as never, factsFor: () => provider as never });
    const api = {} as RepositoryApi;
    await engine.primeFacts!('sq', api, ['lemma:sq:a:NOUN', 'lemma:sq:b:NOUN']);
    expect(primed).toEqual([['lemma:sq:a:NOUN', 'lemma:sq:b:NOUN']]);
    const plain = createReviewEngine({ builders: {} as never, evidenceFor: (() => []) as never, ratingFor: (() => 3) as never, factsFor: () => ({ factsFor: async () => undefined }) as never });
    await expect(plain.primeFacts!('sq', api, ['lemma:sq:a:NOUN'])).resolves.toBeUndefined();
  });

  it('loadVocab sends the unit batches together: with three batches of forms, all three are in flight at once', async () => {
    const forms = Array.from({ length: 120 }, (_, i) => `form:sq:w${i}`);
    const items = forms.map((unitId) => ({ knowledge: { unitId, languageId: 'sq', level: 'seen', encounters: 2, firstSeenAt: '2026-10-01T00:00:00.000Z', lastSeenAt: '2026-10-02T00:00:00.000Z' }, unit: { unitId, languageId: 'sq', label: unitId.slice(8), kind: 'form' }, surfaceForms: [], sources: [] }));
    let inFlight = 0; let peak = 0; const batches: number[] = [];
    const api = {
      async vocabulary() { return { ok: true as const, status: 200, data: { items, catalog: { total: items.length, counts: {} } } }; },
      async units(ids: string[]) {
        inFlight += 1; peak = Math.max(peak, inFlight); batches.push(ids.length);
        await new Promise((r) => setTimeout(r, 5));
        inFlight -= 1;
        return { ok: true as const, status: 200, data: { units: Object.fromEntries(ids.map((id) => [id, { unit: { unitId: id }, relations: [], analyses: [] }])), missing: [] } };
      },
    };
    const ctx = { api: async () => ({ api, session: undefined, baseUrl: 'x' }), identity: async () => undefined, deps: { now: () => new Date('2026-10-28T00:00:00.000Z') } } as unknown as AppContext;
    const got = await loadVocab(ctx, 'sq');
    expect(got.rows).toHaveLength(120);
    expect(batches).toEqual([50, 50, 20]);
    expect(peak).toBe(3);
  });
});
