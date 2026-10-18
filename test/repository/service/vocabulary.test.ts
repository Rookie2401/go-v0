// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { createHarness, makeEvent, signUp } from './fakes';
import { ev, knowledgeRow, unit } from '../store/fixtures';

describe('My Vocabulary API', () => {
  async function seed(h: ReturnType<typeof createHarness>, learnerId: string, rows: Array<{ id: string; label: string; level?: 'new' | 'seen' | 'recognized' | 'familiar' | 'known' | 'automatic'; retention?: number; uncertainty?: number }>) {
    await h.store.putUnits(rows.map((r) => unit(r.id, 'verified', { label: r.label })));
    await h.store.putKnowledge(rows.map((r) => ({ ...knowledgeRow(learnerId, r.id), level: r.level ?? 'seen', encounters: 1, retention: { ...knowledgeRow(learnerId, r.id).retention, estimate: r.retention ?? 0.5 }, uncertainty: r.uncertainty ?? 0.5 })));
  }

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

  it('globally orders every explicit mode, paginates beyond one store page, and keeps learners isolated', async () => {
    const h = createHarness();
    const one = await signUp(h, 'vocab-order@example.test');
    const two = await signUp(h, 'vocab-other@example.test');
    const rows = Array.from({ length: 117 }, (_, i) => ({
      id: `lemma:sq:word-${String(i).padStart(3, '0')}:NOUN`, label: `word-${String(i).padStart(3, '0')}`,
      level: (['new', 'seen', 'recognized', 'familiar', 'known', 'automatic'] as const)[i % 6], retention: (i % 9) / 10, uncertainty: (i % 5) / 5,
    }));
    await seed(h, one.learnerId, rows);
    await seed(h, two.learnerId, [{ id: 'lemma:sq:private:NOUN', label: 'private' }]);
    await h.store.append(one.learnerId, [
      ev('vocab:recent:0', { learnerId: one.learnerId, enrolmentId: one.enrolmentId!, kind: 'EncounterRecorded', at: '2026-10-01T00:00:00.000Z', subject: { itemIds: [rows[0].id] }, payload: { contextKind: 'fragment', surface: 'word-000' } }),
      ev('vocab:recent:1', { learnerId: one.learnerId, enrolmentId: one.enrolmentId!, kind: 'EncounterRecorded', at: '2026-10-02T00:00:00.000Z', subject: { itemIds: [rows[1].id] }, payload: { contextKind: 'fragment', surface: 'word-001' } }),
      ev('vocab:recent:2', { learnerId: one.learnerId, enrolmentId: one.enrolmentId!, kind: 'EncounterRecorded', at: '2026-10-03T00:00:00.000Z', subject: { itemIds: [rows[2].id] }, payload: { contextKind: 'fragment', surface: 'word-002' } }),
    ]);

    const knowledge = await one.api.vocabulary({ languageId: 'sq', sort: 'knowledge', limit: 100 });
    expect(knowledge.ok).toBe(true);
    if (!knowledge.ok) return;
    expect(knowledge.data.items).toHaveLength(100);
    expect(knowledge.data.nextCursor).toBeTruthy();
    const rest = await one.api.vocabulary({ languageId: 'sq', sort: 'knowledge', limit: 100, after: knowledge.data.nextCursor });
    expect(rest.ok && rest.data.items).toHaveLength(17);
    const allKnowledgeIds = [...knowledge.data.items, ...(rest.ok ? rest.data.items : [])].map((x) => x.knowledge.unitId);
    expect(allKnowledgeIds).toHaveLength(117);
    expect(new Set(allKnowledgeIds).size).toBe(117);
    const rank = (x: string) => ['new', 'seen', 'recognized', 'familiar', 'known', 'automatic'].indexOf(x);
    expect(knowledge.data.items.map((x) => rank(x.knowledge.level))).toEqual([...knowledge.data.items].map((x) => rank(x.knowledge.level)).sort((a, b) => a - b));
    expect((await one.api.vocabulary({ languageId: 'sq', sort: 'alphabetical', limit: 117 })).ok).toBe(true);
    const alpha = await one.api.vocabulary({ languageId: 'sq', sort: 'alphabetical', limit: 117 });
    expect(alpha.ok && alpha.data.items[0].unit?.label).toBe('word-000');
    const recent = await one.api.vocabulary({ languageId: 'sq', sort: 'recent', limit: 100 });
    expect(recent.ok && recent.data.items).toHaveLength(100);
    expect(recent.ok && recent.data.items.slice(0, 3).map((x) => x.knowledge.unitId)).toEqual(rows.slice(0, 3).reverse().map((x) => x.id));
    const isolated = await one.api.vocabulary({ languageId: 'sq', sort: 'alphabetical', search: 'private' });
    expect(isolated.ok && isolated.data.items).toHaveLength(0);
  });

  it('reorders after learner progress and rejects malformed sorted cursors', async () => {
    const h = createHarness();
    const user = await signUp(h, 'vocab-progress@example.test');
    const a = 'lemma:sq:alpha:NOUN';
    const b = 'lemma:sq:beta:NOUN';
    await seed(h, user.learnerId, [{ id: a, label: 'alpha', level: 'known' }, { id: b, label: 'beta', level: 'seen' }]);
    const before = await user.api.vocabulary({ languageId: 'sq', sort: 'knowledge', limit: 10 });
    expect(before.ok && before.data.items.map((x) => x.knowledge.unitId)).toEqual([b, a]);
    const marked = await user.api.appendEvents([makeEvent(user, { id: 'vocab:progress-mark', kind: 'ItemMarked', subject: { itemIds: [a] }, payload: { mark: 'new' } })]);
    expect(marked.ok && marked.data.stored).toBe(1);
    expect((await h.store.list({ learnerId: user.learnerId, kinds: ['ItemMarked'] })).map((e) => e.id)).toContain('vocab:progress-mark');
    // The fake service engine does not fold events; this is the projection commit made by that mark.
    await h.store.putKnowledge([{ ...knowledgeRow(user.learnerId, a), level: 'new', encounters: 2 }, { ...knowledgeRow(user.learnerId, b), level: 'seen', encounters: 1 }]);
    const after = await user.api.vocabulary({ languageId: 'sq', sort: 'knowledge', limit: 10 });
    expect(after.ok && after.data.items.map((x) => x.knowledge.unitId)).toEqual([a, b]);
    const first = await user.api.vocabulary({ languageId: 'sq', sort: 'knowledge', limit: 1 });
    expect(first.ok && first.data.nextCursor).toBeTruthy();
    if (first.ok && first.data.nextCursor) {
      const boundary = first.data.items[0].knowledge.unitId;
      const current = await h.store.getKnowledge(user.learnerId, [boundary]);
      await h.store.putKnowledge([{ ...current[0], retention: { ...current[0].retention, estimate: 0.01 } }]);
      const continued = await user.api.vocabulary({ languageId: 'sq', sort: 'knowledge', limit: 1, after: first.data.nextCursor });
      expect(continued.ok && continued.data.items).toHaveLength(1);
      expect(continued.ok && continued.data.items[0].knowledge.unitId).not.toBe(boundary);
    }
    const bad = await user.api.vocabulary({ languageId: 'sq', sort: 'knowledge', after: 'v1.not-json' });
    expect(!bad.ok && bad.status).toBe(422);
  });
});
