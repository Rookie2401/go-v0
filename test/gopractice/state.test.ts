// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { createMemoryArea } from '../../packages/repository-sync/src';
import { clampPrefs, createLocalEventLog, createScopedArea, createWebKeyValueArea, DEFAULT_PREFERENCES, removeByPrefix } from '../../packages/gopractice/state';
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
});

describe('review preferences', () => {
  it('have defaults and are clamped', () => {
    expect(DEFAULT_PREFERENCES('sq')).toEqual({ languageId: 'sq', sessionMinutes: 10, maxNew: 5, desiredRetention: 0.9, includeListening: false, grammarShare: 0.2, prioritizeSaved: true });
    expect(clampPrefs({ languageId: 'sq', sessionMinutes: -4, maxNew: 1000, desiredRetention: 2, grammarShare: 5 })).toMatchObject({ sessionMinutes: 1, maxNew: 50, desiredRetention: 0.97, grammarShare: 1 });
    expect(clampPrefs({ languageId: 'sq', sessionMinutes: Number.NaN })).toMatchObject({ sessionMinutes: 10 });
    expect(clampPrefs({ languageId: 'sq', sessionMinutes: 0 })).toMatchObject({ sessionMinutes: 0 });
  });
});
