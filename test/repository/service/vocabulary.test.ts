// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { createHarness, signUp } from './fakes';
import { ev, knowledgeRow, unit } from '../store/fixtures';

describe('My Vocabulary API', () => {
  it('returns encountered unreviewed rows, recent surface forms, safe source refs, and full catalog counts', async () => {
    const h = createHarness();
    const user = await signUp(h, 'vocab@example.test');
    const id = 'lemma:sq:libër:NOUN';
    await h.store.putUnits([unit(id, 'verified', { label: 'libër' })]);
    await h.store.putKnowledge([{ ...knowledgeRow(user.learnerId, id), level: 'new', encounters: 1 }]);
    const e = ev('vocab:encounter', {
      learnerId: user.learnerId, enrolmentId: user.enrolmentId!, kind: 'EncounterRecorded',
      at: '2026-10-08T10:00:00.000Z', subject: { itemIds: [id], sourceRef: { kind: 'demo', title: 'Demo' } },
      payload: { contextKind: 'fragment', surface: 'librin' },
    });
    await h.store.append(user.learnerId, [e]);

    const page = await user.api.vocabulary({ languageId: 'sq', limit: 1 });
    expect(page.ok).toBe(true);
    if (!page.ok) return;
    expect(page.data.catalog).toEqual({ total: 1, counts: { new: 1, seen: 0, recognized: 0, familiar: 0, known: 0, automatic: 0 } });
    expect(page.data.items).toHaveLength(1);
    expect(page.data.items[0]).toMatchObject({ knowledge: { unitId: id, level: 'new' }, unit: { label: 'libër' }, surfaceForms: expect.arrayContaining(['librin']), sources: [{ kind: 'demo', title: 'Demo' }] });
    const found = await user.api.vocabulary({ languageId: 'sq', search: 'librin' });
    expect(found.ok && found.data.items.map((x) => x.knowledge.unitId)).toEqual([id]);
  });

  it('filters by exact encounter dates, assistance requests, and source reference while keeping catalog totals unfiltered', async () => {
    const h = createHarness();
    const user = await signUp(h, 'vocab-filters@example.test');
    const id = 'lemma:sq:libër:NOUN';
    await h.store.putUnits([unit(id, 'verified', { label: 'libër' })]);
    await h.store.putKnowledge([{ ...knowledgeRow(user.learnerId, id), level: 'seen', encounters: 3 }]);
    const appended = await h.store.append(user.learnerId, [
      ev('vocab:old', { learnerId: user.learnerId, enrolmentId: user.enrolmentId!, kind: 'EncounterRecorded', at: '2026-10-01T10:00:00.000Z', subject: { itemIds: [id], sourceRef: { kind: 'demo', title: 'Reader A' } }, payload: { contextKind: 'fragment', surface: 'libri' } }),
      ev('vocab:help', { learnerId: user.learnerId, enrolmentId: user.enrolmentId!, kind: 'AssistanceRequested', at: '2026-10-05T10:00:00.000Z', subject: { itemIds: [id], sourceRef: { kind: 'demo', title: 'Reader B' } }, payload: { assistance: 'gloss' } }),
    ]);
    expect(appended.every((x) => x.stored)).toBe(true);
    expect(await h.store.getEncounterDateRanges?.(user.learnerId, 'sq', [id])).toMatchObject([{ unitId: id, firstEncounter: '2026-10-01T10:00:00.000Z', lastEncounter: '2026-10-05T10:00:00.000Z' }]);

    const debugCases = await Promise.all([
      user.api.vocabulary({ languageId: 'sq' }), user.api.vocabulary({ languageId: 'sq', requiresAssistance: true }),
      user.api.vocabulary({ languageId: 'sq', sourceRef: 'Reader B' }), user.api.vocabulary({ languageId: 'sq', firstEncounterFrom: '2026-10-01T00:00:00Z' }),
      user.api.vocabulary({ languageId: 'sq', minEncounters: 3 }),
    ]);
    expect(debugCases.map((x) => x.ok ? x.data.items.length : -1)).toEqual([1, 1, 1, 1, 1]);
    const assisted = await user.api.vocabulary({ languageId: 'sq', requiresAssistance: true, minEncounters: 3, firstEncounterFrom: '2026-10-01T00:00:00Z', lastEncounterTo: '2026-10-05T23:59:59Z', sourceRef: 'Reader B' });
    expect(assisted.ok && assisted.data.items.map((x) => x.knowledge.unitId)).toEqual([id]);
    if (assisted.ok) expect(assisted.data.catalog.total).toBe(1);
    const unassisted = await user.api.vocabulary({ languageId: 'sq', requiresAssistance: false });
    expect(unassisted.ok && unassisted.data.items).toHaveLength(0);
    const outsideDate = await user.api.vocabulary({ languageId: 'sq', lastEncounterFrom: '2026-10-06T00:00:00Z' });
    expect(outsideDate.ok && outsideDate.data.items).toHaveLength(0);
  });
});
