// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { createMemoryArea } from '../../packages/repository-sync/src';
import type { KeyValueArea } from '../../packages/repository-sync/src';
import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { clampPrefs, createIndexedDbKeyValueArea, createLocalEventLog, createScopedArea, createWebKeyValueArea, DEFAULT_PREFERENCES, removeByPrefix } from '../../packages/gopractice/state';
import { cardAdded, ids, reviewed } from './helpers';

const A = ids('L1', 'sq');

describe('the local event log', () => {
  it('appends idempotently on id and dedupeKey, keeps arrival order, and refuses invalid or foreign events', async () => {
    const log = createLocalEventLog(createMemoryArea());
    const e1 = cardAdded(A, 'zog', 'meaning-to-form', '2026-10-01T10:00:00.000Z');
    const e2 = reviewed(A, 'zog', 'meaning-to-form', 3, '2026-10-02T10:00:00.000Z');
    expect((await log.append('L1', [e1, e2])).map((o) => o.stored)).toEqual([true, true]);
    expect((await log.append('L1', [e1]))[0]).toMatchObject({ stored: false, duplicateOf: e1.id });
    expect((await log.append('L1', [{ ...e1, id: 'other-id' }]))[0]).toMatchObject({ stored: false, duplicateOf: e1.id }); // same dedupeKey
    expect((await log.append('L1', [{ ...e2, id: 'x', learnerId: 'L2' }]))[0].issues?.[0].path).toBe('learnerId');
    expect((await log.append('L1', [{ ...e2, id: 'y', kind: 'PageRead' as never }]))[0].issues?.length).toBeGreaterThan(0);
    const all = await log.list({ learnerId: 'L1' });
    expect(all.map((e) => e.id)).toEqual([e1.id, e2.id]);
    expect(all.map((e) => e.seq)).toEqual([1, 2]);
    expect(await log.head('L1')).toBe(2);
    expect((await log.get('L1', e2.id))?.kind).toBe('CardReviewed');
    expect(await log.get('L1', 'nothing')).toBeUndefined();
  });

  it('filters by language, kind, unit, time and cursor', async () => {
    const log = createLocalEventLog(createMemoryArea());
    const de = { learnerId: 'L1', enrolmentId: 'L1-e2', languageId: 'de' };
    await log.append('L1', [
      cardAdded(A, 'zog', 'meaning-to-form', '2026-10-01T10:00:00.000Z'), reviewed(A, 'zog', 'meaning-to-form', 3, '2026-10-02T10:00:00.000Z'),
      cardAdded(de, 'hund', 'meaning-to-form', '2026-10-03T10:00:00.000Z', { lang: 'de' }),
    ]);
    expect((await log.list({ learnerId: 'L1', languageId: 'de' })).length).toBe(1);
    expect((await log.list({ learnerId: 'L1', kinds: ['CardReviewed'] })).length).toBe(1);
    expect((await log.list({ learnerId: 'L1', unitId: 'lemma:sq:zog:NOUN' })).length).toBe(2);
    expect((await log.list({ learnerId: 'L1', since: '2026-10-02T00:00:00.000Z' })).length).toBe(2);
    expect((await log.list({ learnerId: 'L1', afterSeq: 2 })).length).toBe(1);
    expect((await log.list({ learnerId: 'L2' })).length).toBe(0);
  });

  it('commits a full pull page with bounded storage operations', async () => {
    const backing = createMemoryArea();
    const calls = { get: 0, set: 0 };
    const area: KeyValueArea = {
      async get(keys) { calls.get += 1; return backing.get(keys); },
      async set(items) { calls.set += 1; return backing.set(items); },
      remove: (keys) => backing.remove(keys),
      list: (prefix) => backing.list(prefix),
    };
    const log = createLocalEventLog(area);
    const page = Array.from({ length: 500 }, (_, i) => cardAdded(A, `batch-${i}`, 'meaning-to-form', `2026-10-01T10:${String(i % 60).padStart(2, '0')}:00.000Z`));

    calls.get = 0; calls.set = 0;
    const result = await log.append('L1', page);

    expect(result).toHaveLength(500);
    expect(result.every((row) => row.stored)).toBe(true);
    // One head read, one batched index read, one atomic bulk write; no per-row bridge/storage calls.
    expect(calls).toEqual({ get: 2, set: 1 });
    expect(await log.head('L1')).toBe(500);
    expect((await log.list({ learnerId: 'L1' })).map((e) => e.seq)).toEqual(Array.from({ length: 500 }, (_, i) => i + 1));
    calls.get = 0; calls.set = 0;
    const retry = await log.append('L1', page);
    expect(retry.every((row) => row.duplicateOf === row.id)).toBe(true);
    expect(calls).toEqual({ get: 2, set: 0 });
  });
});

describe('storage areas', () => {
  it('a scoped area cannot see or touch another prefix, and listing strips the prefix', async () => {
    const base = createMemoryArea();
    const a = createScopedArea(base, 'u:A:');
    const b = createScopedArea(base, 'u:B:');
    await a.set({ 'queue:1': { n: 1 }, 'queue:2': { n: 2 } });
    await b.set({ 'queue:1': { n: 9 } });
    expect(await a.list('queue:')).toEqual(['queue:1', 'queue:2']);
    expect(await b.list('queue:')).toEqual(['queue:1']);
    expect((await a.get('queue:1'))['queue:1']).toEqual({ n: 1 });
    expect(Object.keys(await a.get(null))).toEqual(['queue:1', 'queue:2']);
    await a.remove('queue:1');
    expect((await b.get('queue:1'))['queue:1']).toEqual({ n: 9 });
    expect(await removeByPrefix(base, ['u:B:'])).toBe(1);
  });

  it('the localStorage area round-trips JSON and lists by prefix', async () => {
    localStorage.clear();
    const area = createWebKeyValueArea(localStorage);
    await area.set({ 'p:b': { x: 1 }, 'p:a': [1, 2], other: 'z' });
    expect(await area.list('p:')).toEqual(['p:a', 'p:b']);
    expect((await area.get('p:b'))['p:b']).toEqual({ x: 1 });
    expect(Object.keys(await area.get(null)).sort()).toEqual(['other', 'p:a', 'p:b']);
    await area.remove(['p:a', 'p:b']);
    expect(await area.list('p:')).toEqual([]);
  });

  // 2026-10-26: the hosted edition keeps its rows in IndexedDB (localStorage's ~5 MB is shared by every app on the Pages origin and the
  // event log is one row per event: "The quota has been exceeded" on sync)
  it('the IndexedDB area round-trips JSON, lists by prefix in order, and reads every row', async () => {
    const area = createIndexedDbKeyValueArea(new IDBFactory(), 'gopractice-test');
    await area.set({ 'p:b': { x: 1, when: undefined }, 'p:a': [1, 2], other: 'z', 'q:1': 1 });
    expect(await area.list('p:')).toEqual(['p:a', 'p:b']);
    expect((await area.get('p:b'))['p:b']).toEqual({ x: 1 }); // through JSON, like localStorage: no undefined fields
    expect(await area.get(['p:a', 'missing'])).toEqual({ 'p:a': [1, 2] });
    expect(Object.keys(await area.get(null)).sort()).toEqual(['other', 'p:a', 'p:b', 'q:1']);
    expect(await area.list('')).toEqual(['other', 'p:a', 'p:b', 'q:1']);
    await area.remove(['p:a', 'p:b']);
    expect(await area.list('p:')).toEqual([]);
    expect((await area.get(null)).other).toBe('z');
  });

  it('moves GoReview\'s rows out of localStorage once (its prefixes only), marks the move, and leaves the other apps\' rows alone', async () => {
    localStorage.clear();
    localStorage.setItem('gopractice:session', JSON.stringify({ token: 't' }));
    localStorage.setItem('u:L1:log:e1', JSON.stringify({ id: 'e1' }));
    localStorage.setItem('golearn:session', JSON.stringify({ app: 'setup' })); // the setup app's row on the same origin
    localStorage.setItem('u:L1:broken', '{not json');
    const factory = new IDBFactory();
    const area = createIndexedDbKeyValueArea(factory, 'gopractice-move', { from: localStorage, prefixes: ['gopractice:', 'u:'] });
    expect(await area.get(['gopractice:session', 'u:L1:log:e1'])).toEqual({ 'gopractice:session': { token: 't' }, 'u:L1:log:e1': { id: 'e1' } });
    expect(localStorage.getItem('gopractice:session')).toBeNull();
    expect(localStorage.getItem('u:L1:log:e1')).toBeNull();
    expect(localStorage.getItem('golearn:session')).toBe(JSON.stringify({ app: 'setup' }));
    expect(localStorage.getItem('u:L1:broken')).toBe('{not json'); // unreadable: left where it was
    expect(localStorage.getItem('gopractice:moved-to-indexeddb')).toBe('1');
    // a second area over the same database and localStorage does not move anything again (a row written to localStorage later stays there)
    localStorage.setItem('gopractice:later', JSON.stringify(1));
    const again = createIndexedDbKeyValueArea(factory, 'gopractice-move', { from: localStorage, prefixes: ['gopractice:', 'u:'] });
    expect(await again.get('gopractice:later')).toEqual({});
    expect(localStorage.getItem('gopractice:later')).toBe('1');
  });

  it('falls back to localStorage when IndexedDB will not open', async () => {
    localStorage.clear();
    const broken = { open: () => { throw new Error('private window'); } } as unknown as IDBFactory;
    const area = createIndexedDbKeyValueArea(broken, 'gopractice-x', { from: localStorage, prefixes: ['gopractice:'] });
    await area.set({ 'gopractice:k': 7 });
    expect(localStorage.getItem('gopractice:k')).toBe('7');
    expect(await area.list('gopractice:')).toEqual(['gopractice:k']);
  });
});

describe('review preferences', () => {
  it('have defaults and are clamped', () => {
    expect(DEFAULT_PREFERENCES('sq')).toEqual({ languageId: 'sq', sessionMinutes: 10, maxNew: 5, dailyNewLimit: 5, practiceGoals: ['recognition','retrieval','application'], desiredRetention: 0.9, includeListening: false, grammarShare: 0.2, prioritizeSaved: true, cardsPerDeck: 10 });
    expect(clampPrefs({ languageId: 'sq', cardsPerDeck: 1 }).cardsPerDeck).toBe(5);
    expect(clampPrefs({ languageId: 'sq', cardsPerDeck: 9999 }).cardsPerDeck).toBe(60);
    expect(clampPrefs({ languageId: 'sq', cardsPerDeck: 12.6 }).cardsPerDeck).toBe(13);
    expect(clampPrefs({ languageId: 'sq', cardsPerDeck: Number.NaN }).cardsPerDeck).toBe(10);
    expect(clampPrefs({ languageId: 'sq', sessionMinutes: -4, maxNew: 1000, desiredRetention: 2, grammarShare: 5 })).toMatchObject({ sessionMinutes: 1, maxNew: 50, desiredRetention: 0.97, grammarShare: 1 });
    expect(clampPrefs({ languageId: 'sq', sessionMinutes: Number.NaN })).toMatchObject({ sessionMinutes: 10 });
    expect(clampPrefs({ languageId: 'sq', sessionMinutes: 0 })).toMatchObject({ sessionMinutes: 0 });
    expect(clampPrefs({ languageId: 'sq' }).practiceGoals).toEqual(['recognition','retrieval','application']);
    expect(clampPrefs({ languageId: 'sq', practiceGoals: ['listening','listening','bogus'] as never }).practiceGoals).toEqual(['listening']);
    expect(clampPrefs({ languageId: 'sq', practiceGoals: [] }).practiceGoals).toEqual([]);
  });
});
