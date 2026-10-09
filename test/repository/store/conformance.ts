/**
 * The behaviour every RepositoryStore must have, run against each implementation (memory.test.ts, sqlite.test.ts).
 * Each case opens a fresh store through `open()` and closes it afterwards.
 */
import { describe, expect, it } from 'vitest';
import { validateEvent } from '../../../packages/repository-contract/src';
import type { RepositoryStore } from '../../../packages/repository-contract/src';
import { applyTombstone, exportLearner, importLearner } from '../../../packages/repository-store/src';
import type { LearnerExport } from '../../../packages/repository-store/src';
import {
  L1, L2, account, alias, analysis, device, doc, encounter, enrolment, ev, knowledgeRow, pack, preferences, relation, session, tombstone, unit,
} from './fixtures';

export function storeConformance(name: string, open: () => Promise<RepositoryStore>): void {
  const withStore = (fn: (s: RepositoryStore) => Promise<void>) => async () => {
    const s = await open();
    try { await fn(s); } finally { await s.close(); }
  };

  describe(`${name}: the event log`, () => {
    it('the fixtures are valid events', () => {
      expect(validateEvent(ev('x'))).toEqual([]);
      expect(validateEvent(encounter('y'))).toEqual([]);
    });

    it('stores a valid event and returns it with seq and recordedAt', withStore(async (s) => {
      const before = Date.now();
      const out = await s.append(L1, [ev('e1')]);
      expect(out).toEqual([{ id: 'e1', stored: true }]);
      const got = await s.get(L1, 'e1');
      expect(got?.seq).toBe(1);
      expect(Date.parse(got!.recordedAt)).toBeGreaterThanOrEqual(before - 1000);
      expect(got).toMatchObject({ id: 'e1', kind: 'SelectionLookedUp', languageId: 'sq', payload: { surface: 'shtëpinë' } });
      expect(await s.get(L2, 'e1')).toBeUndefined();
      expect(await s.get(L1, 'nope')).toBeUndefined();
    }));

    it('refuses an invalid event with issues and stores nothing', withStore(async (s) => {
      const out = await s.append(L1, [ev('bad', { kind: 'PageRead' as never }), null as never, ev('good')]);
      expect(out[0]).toMatchObject({ id: 'bad', stored: false });
      expect(out[0].issues?.map((i) => i.path)).toContain('kind');
      expect(out[1]).toMatchObject({ id: '', stored: false });
      expect(out[1].issues?.length).toBeGreaterThan(0);
      expect(out[2]).toEqual({ id: 'good', stored: true });
      expect(await s.head(L1)).toBe(1);
      expect(await s.get(L1, 'bad')).toBeUndefined();
    }));

    it('refuses an event whose learnerId differs from the one appended under', withStore(async (s) => {
      const out = await s.append(L1, [ev('x1', { learnerId: L2 })]);
      expect(out[0].stored).toBe(false);
      expect(out[0].issues?.map((i) => i.path)).toContain('learnerId');
      expect(await s.list({ learnerId: L2 })).toEqual([]);
      expect(await s.list({ learnerId: L1 })).toEqual([]);
      expect(await s.head(L2)).toBe(0);
    }));

    it('refuses an empty learner id', withStore(async (s) => {
      const out = await s.append('', [ev('x1', { learnerId: '' })]);
      expect(out[0].stored).toBe(false);
    }));

    it('is idempotent on id across two append calls', withStore(async (s) => {
      expect(await s.append(L1, [ev('e1')])).toEqual([{ id: 'e1', stored: true }]);
      expect(await s.append(L1, [ev('e1', { at: '2026-10-09T00:00:00.000Z' })])).toEqual([{ id: 'e1', stored: false, duplicateOf: 'e1' }]);
      const all = await s.list({ learnerId: L1 });
      expect(all).toHaveLength(1);
      expect(all[0].at).toBe('2026-10-08T10:00:00.000Z'); // never overwritten
    }));

    it('de-duplicates inside one batch', withStore(async (s) => {
      const out = await s.append(L1, [ev('e1'), ev('e1'), ev('e2', { dedupeKey: 'k' }), ev('e3', { dedupeKey: 'k' })]);
      expect(out).toEqual([
        { id: 'e1', stored: true }, { id: 'e1', stored: false, duplicateOf: 'e1' },
        { id: 'e2', stored: true }, { id: 'e3', stored: false, duplicateOf: 'e2' },
      ]);
    }));

    it('is idempotent on (learnerId, dedupeKey) across calls and names the first event', withStore(async (s) => {
      await s.append(L1, [ev('e1', { dedupeKey: 'k1' })]);
      expect(await s.append(L1, [ev('e2', { dedupeKey: 'k1' })])).toEqual([{ id: 'e2', stored: false, duplicateOf: 'e1' }]);
      expect(await s.get(L1, 'e2')).toBeUndefined();
      // the same key from another learner is a different key
      expect(await s.append(L2, [ev('e3', { learnerId: L2, dedupeKey: 'k1' })])).toEqual([{ id: 'e3', stored: true }]);
    }));

    it('does not let one learner overwrite or probe another learner’s event id', withStore(async (s) => {
      await s.append(L1, [ev('e1')]);
      const out = await s.append(L2, [ev('e1', { learnerId: L2 })]);
      expect(out[0].stored).toBe(false);
      expect(out[0].duplicateOf).toBeUndefined();
      expect(out[0].issues).toBeDefined();
      expect(await s.list({ learnerId: L2 })).toEqual([]);
      expect((await s.get(L1, 'e1'))?.learnerId).toBe(L1);
    }));

    it('assigns a monotonic seq per learner in arrival order, independent of `at`', withStore(async (s) => {
      await s.append(L1, [ev('late', { at: '2026-10-09T10:00:00.000Z' })]);
      await s.append(L1, [ev('early', { at: '2026-10-01T10:00:00.000Z' })]);
      await s.append(L2, [ev('other', { learnerId: L2 })]);
      await s.append(L1, [ev('mid', { at: '2026-10-05T10:00:00.000Z' })]);
      const rows = await s.list({ learnerId: L1 });
      expect(rows.map((r) => [r.id, r.seq])).toEqual([['late', 1], ['early', 2], ['mid', 3]]);
      expect((await s.list({ learnerId: L2 })).map((r) => r.seq)).toEqual([1]);
    }));

    it('stamps recordedAt itself, replacing any supplied value, and ignores a supplied seq', withStore(async (s) => {
      const sent = { ...ev('e1'), recordedAt: '2001-01-01T00:00:00.000Z', seq: 99 } as ReturnType<typeof ev>;
      await s.append(L1, [sent]);
      const got = (await s.get(L1, 'e1'))!;
      expect(got.recordedAt).not.toBe('2001-01-01T00:00:00.000Z');
      expect(got.seq).toBe(1);
      expect(sent.recordedAt).toBe('2001-01-01T00:00:00.000Z'); // the caller's object is untouched
    }));

    it('head is the highest seq (0 when empty) and duplicates do not move it', withStore(async (s) => {
      expect(await s.head(L1)).toBe(0);
      await s.append(L1, [ev('e1'), ev('e2')]);
      await s.append(L1, [ev('e1')]);
      expect(await s.head(L1)).toBe(2);
      expect(await s.head(L2)).toBe(0);
    }));

    it('lists by seq with the kinds, language, unit, since and afterSeq filters', withStore(async (s) => {
      await s.append(L1, [
        ev('a', { at: '2026-10-01T10:00:00.000Z' }),
        encounter('b', { at: '2026-10-02T10:00:00.000Z', subject: { itemIds: ['lemma:sq:libër:NOUN', 'form:sq:librin'] } }),
        ev('c', { at: '2026-10-03T10:00:00.000Z', languageId: 'de', subject: { itemIds: ['lemma:de:Haus:NOUN'] } }),
        encounter('d', { at: '2026-10-04T10:00:00.000Z', subject: {} }),
      ]);
      const ids = async (f: Omit<Parameters<RepositoryStore['list']>[0], 'learnerId'>) => (await s.list({ learnerId: L1, ...f })).map((e) => e.id);
      expect(await ids({})).toEqual(['a', 'b', 'c', 'd']);
      expect(await ids({ kinds: ['EncounterRecorded'] })).toEqual(['b', 'd']);
      expect(await ids({ kinds: ['EncounterRecorded', 'SelectionLookedUp'] })).toEqual(['a', 'b', 'c', 'd']);
      expect(await ids({ kinds: [] })).toEqual([]);
      expect(await ids({ languageId: 'de' })).toEqual(['c']);
      expect(await ids({ unitId: 'form:sq:librin' })).toEqual(['b']);
      expect(await ids({ unitId: 'lemma:sq:shtëpi:NOUN' })).toEqual(['a']);
      expect(await ids({ unitId: 'lemma:sq:missing' })).toEqual([]);
      expect(await ids({ since: '2026-10-03T10:00:00.000Z' })).toEqual(['c', 'd']); // inclusive
      expect(await ids({ afterSeq: 2 })).toEqual(['c', 'd']);
      expect(await ids({ afterSeq: 4 })).toEqual([]);
      expect(await ids({ kinds: ['EncounterRecorded'], afterSeq: 2, since: '2026-10-01T00:00:00.000Z' })).toEqual(['d']);
      expect(await ids({ limit: 2 })).toEqual(['a', 'b']);
      expect(await ids({ limit: 2, afterSeq: 2 })).toEqual(['c', 'd']);
    }));

    it('compares `since` as an instant, not as text, across UTC offsets', withStore(async (s) => {
      // 10:00+02:00 is 08:00Z: earlier than 09:00Z although "10" > "09" as text.
      await s.append(L1, [ev('offset', { at: '2026-10-08T10:00:00.000+02:00' }), ev('utc', { at: '2026-10-08T09:30:00.000Z' })]);
      const ids = (await s.list({ learnerId: L1, since: '2026-10-08T09:00:00.000Z' })).map((e) => e.id);
      expect(ids).toEqual(['utc']);
    }));

    it('defaults the limit to 1000 and never returns more than 5000', withStore(async (s) => {
      const batch = Array.from({ length: 1005 }, (_, i) => ev(`e${i}`));
      await s.append(L1, batch);
      expect(await s.list({ learnerId: L1 })).toHaveLength(1000);
      expect(await s.list({ learnerId: L1, limit: 1_000_000 })).toHaveLength(1005);
      expect(await s.list({ learnerId: L1, afterSeq: 1000 })).toHaveLength(5);
    }));

    it('hands out copies: mutating a result changes nothing stored', withStore(async (s) => {
      await s.append(L1, [ev('e1')]);
      const got = (await s.get(L1, 'e1'))!;
      got.payload.surface = 'tampered';
      got.subject.itemIds!.push('x');
      expect(((await s.get(L1, 'e1'))!.payload as { surface: string }).surface).toBe('shtëpinë');
      expect((await s.get(L1, 'e1'))!.subject.itemIds).toEqual(['lemma:sq:shtëpi:NOUN']);
    }));

    it('stores unit ids and values containing quotes and SQL text literally', withStore(async (s) => {
      const nasty = "x'); DROP TABLE events;--";
      await s.append(L1, [ev('e1', { dedupeKey: nasty, subject: { itemIds: [nasty] } })]);
      expect((await s.list({ learnerId: L1, unitId: nasty })).map((e) => e.id)).toEqual(['e1']);
      await s.putUnits([unit(nasty)]);
      expect((await s.getUnits([nasty]))[0].unitId).toBe(nasty);
      expect(await s.head(L1)).toBe(1);
    }));
  });

  describe(`${name}: linguistic knowledge`, () => {
    it('upserts units by id and never lowers a status rank', withStore(async (s) => {
      await s.putUnits([unit('lemma:sq:a:NOUN', 'verified', { label: 'original' })]);
      await s.putUnits([unit('lemma:sq:a:NOUN', 'provisional', { label: 'replacement' })]);
      expect((await s.getUnits(['lemma:sq:a:NOUN']))[0]).toMatchObject({ status: 'verified', label: 'original' });
      await s.putUnits([unit('lemma:sq:a:NOUN', 'conflicted', { label: 'replacement' })]);
      expect((await s.getUnits(['lemma:sq:a:NOUN']))[0].status).toBe('verified');
      await s.putUnits([unit('lemma:sq:a:NOUN', 'verified', { label: 'same rank replaces' })]);
      expect((await s.getUnits(['lemma:sq:a:NOUN']))[0].label).toBe('same rank replaces');
      // raising is allowed
      await s.putUnits([unit('lemma:sq:b:NOUN', 'provisional')]);
      await s.putUnits([unit('lemma:sq:b:NOUN', 'high-confidence')]);
      expect((await s.getUnits(['lemma:sq:b:NOUN']))[0].status).toBe('high-confidence');
      // inside one batch, the later lower row loses to the earlier higher one
      await s.putUnits([unit('lemma:sq:c:NOUN', 'verified'), unit('lemma:sq:c:NOUN', 'provisional')]);
      expect((await s.getUnits(['lemma:sq:c:NOUN']))[0].status).toBe('verified');
    }));

    it('getUnits skips unknown ids and keeps the requested order; findUnits filters', withStore(async (s) => {
      await s.putUnits([
        unit('lemma:sq:b:NOUN', 'verified', { label: 'b' }),
        unit('lemma:sq:a:NOUN', 'verified', { label: 'a' }),
        unit('form:sq:a', 'verified', { kind: 'form', label: 'a' }),
        unit('lemma:de:a:NOUN', 'verified', { languageId: 'de', label: 'a' }),
      ]);
      expect((await s.getUnits(['lemma:sq:b:NOUN', 'missing', 'lemma:sq:a:NOUN', 'lemma:sq:b:NOUN'])).map((u) => u.unitId)).toEqual(['lemma:sq:b:NOUN', 'lemma:sq:a:NOUN']);
      expect((await s.findUnits({ languageId: 'sq' })).map((u) => u.unitId)).toEqual(['form:sq:a', 'lemma:sq:a:NOUN', 'lemma:sq:b:NOUN']);
      expect((await s.findUnits({ languageId: 'sq', kind: 'form' })).map((u) => u.unitId)).toEqual(['form:sq:a']);
      expect((await s.findUnits({ languageId: 'sq', label: 'a' })).map((u) => u.unitId)).toEqual(['form:sq:a', 'lemma:sq:a:NOUN']);
      expect((await s.findUnits({ languageId: 'sq', label: 'a', limit: 1 })).map((u) => u.unitId)).toEqual(['form:sq:a']);
      expect(await s.findUnits({ languageId: 'xx' })).toEqual([]);
    }));

    it('keeps relations by (from, relation, to), never lowering rank, and finds them by direction', withStore(async (s) => {
      await s.putRelations([relation('form:sq:a', 'lemma:sq:a:NOUN', 'verified'), relation('lemma:sq:a:NOUN', 'lemma:sq:b:NOUN', 'provisional', 'depends-on')]);
      await s.putRelations([relation('form:sq:a', 'lemma:sq:a:NOUN', 'provisional')]);
      expect((await s.relationsOf('form:sq:a', 'out'))[0].status).toBe('verified');
      expect(await s.relationsOf('form:sq:a', 'in')).toEqual([]);
      expect((await s.relationsOf('lemma:sq:a:NOUN', 'in')).map((r) => r.fromId)).toEqual(['form:sq:a']);
      expect((await s.relationsOf('lemma:sq:a:NOUN', 'out')).map((r) => r.toId)).toEqual(['lemma:sq:b:NOUN']);
      expect(await s.relationsOf('lemma:sq:a:NOUN')).toHaveLength(2);
      expect(await s.relationsOf('lemma:sq:a:NOUN', 'both')).toHaveLength(2);
      // a different relation kind between the same ends is a different row
      await s.putRelations([relation('form:sq:a', 'lemma:sq:a:NOUN', 'provisional', 'variant-of')]);
      expect(await s.relationsOf('form:sq:a', 'out')).toHaveLength(2);
    }));

    it('stores analyses, finds them by form and sentence, and invalidation keeps the row', withStore(async (s) => {
      await s.putAnalyses([analysis('an1'), analysis('an2', { sentenceKey: 's2' }), analysis('an3', { sentenceKey: undefined }), analysis('other', { formId: 'form:sq:x' })]);
      expect((await s.analysesOfForm('form:sq:librin')).map((a) => a.analysisId)).toEqual(['an1', 'an2', 'an3']);
      expect((await s.analysesOfForm('form:sq:librin', 's2')).map((a) => a.analysisId)).toEqual(['an2']);
      expect(await s.getAnalysis('nope')).toBeUndefined();
      await s.invalidateAnalysis('an1', 'wrong lexeme', 'an2');
      const a = (await s.getAnalysis('an1'))!;
      expect(a).toMatchObject({ status: 'invalidated', reason: 'wrong lexeme', supersededBy: 'an2', formId: 'form:sq:librin' });
      expect(a.candidates).toHaveLength(1); // the row remains, content intact
      expect((await s.analysesOfForm('form:sq:librin')).map((x) => x.analysisId)).toContain('an1');
      // a re-put cannot revive it, and an unknown id is a no-op
      await s.putAnalyses([analysis('an1', { status: 'verified' })]);
      expect((await s.getAnalysis('an1'))!.status).toBe('invalidated');
      await s.invalidateAnalysis('missing', 'x');
      expect(await s.getAnalysis('missing')).toBeUndefined();
    }));

    it('does not let a lower-ranked analysis replace a higher one', withStore(async (s) => {
      await s.putAnalyses([analysis('an1', { status: 'verified' })]);
      await s.putAnalyses([analysis('an1', { status: 'provisional' })]);
      expect((await s.getAnalysis('an1'))!.status).toBe('verified');
    }));

    it('stores aliases and finds them by old id', withStore(async (s) => {
      await s.putAliases([alias('lemma:sq:old:NOUN', 'lemma:sq:new:NOUN'), alias('lemma:sq:old:NOUN', 'lemma:sq:newer:NOUN', '3'), alias('lemma:sq:z:NOUN', 'lemma:sq:y:NOUN')]);
      await s.putAliases([alias('lemma:sq:old:NOUN', 'lemma:sq:new:NOUN')]); // idempotent
      expect((await s.aliasesFor(['lemma:sq:old:NOUN'])).map((a) => a.newId)).toEqual(['lemma:sq:new:NOUN', 'lemma:sq:newer:NOUN']);
      expect(await s.aliasesFor(['nothing'])).toEqual([]);
      expect(await s.aliasesFor([])).toEqual([]);
    }));

    it('stores packs by (id, version), returns the latest by number, lists by language', withStore(async (s) => {
      await s.putPack(pack('pack-sq', '2.9'));
      await s.putPack(pack('pack-sq', '2.10'));
      await s.putPack(pack('pack-de', '1', 'de'));
      expect((await s.getPack('pack-sq'))!.version).toBe('2.10');
      expect((await s.getPack('pack-sq', '2.9'))!.version).toBe('2.9');
      expect(await s.getPack('pack-sq', '9')).toBeUndefined();
      expect(await s.getPack('nope')).toBeUndefined();
      expect((await s.listPacks('sq')).map((p) => p.version)).toEqual(['2.9', '2.10']);
      expect((await s.listPacks()).map((p) => `${p.packId}@${p.version}`)).toEqual(['pack-de@1', 'pack-sq@2.9', 'pack-sq@2.10']);
      await s.putPack({ ...pack('pack-sq', '2.10'), reviewStatus: 'reviewed' });
      expect((await s.getPack('pack-sq', '2.10'))!.reviewStatus).toBe('reviewed');
    }));
  });

  describe(`${name}: derived state`, () => {
    it('stores knowledge rows per learner, replaces by unit, and clears one learner only', withStore(async (s) => {
      await s.putKnowledge([knowledgeRow(L1, 'u1'), knowledgeRow(L1, 'u2'), knowledgeRow(L2, 'u1')]);
      expect((await s.getKnowledge(L1)).map((k) => k.unitId)).toEqual(['u1', 'u2']);
      expect((await s.getKnowledge(L1, ['u2', 'zz'])).map((k) => k.unitId)).toEqual(['u2']);
      await s.putKnowledge([{ ...knowledgeRow(L1, 'u1'), uncertainty: 0.1, modelVersion: 'm2' }]);
      expect((await s.getKnowledge(L1, ['u1']))[0]).toMatchObject({ uncertainty: 0.1, modelVersion: 'm2' });
      await s.clearKnowledge(L1);
      expect(await s.getKnowledge(L1)).toEqual([]);
      expect(await s.getKnowledge(L2)).toHaveLength(1);
    }));

    it('stores the projection cursor per learner', withStore(async (s) => {
      expect(await s.getProjectionCursor(L1)).toBeUndefined();
      await s.putProjectionCursor(L1, { seq: 5, modelVersion: 'm1' });
      await s.putProjectionCursor(L1, { seq: 7, modelVersion: 'm2' });
      expect(await s.getProjectionCursor(L1)).toEqual({ seq: 7, modelVersion: 'm2' });
      expect(await s.getProjectionCursor(L2)).toBeUndefined();
    }));

    it('keeps the learner-wide preference row apart from each language row', withStore(async (s) => {
      expect(await s.getPreferences(L1)).toBeUndefined();
      await s.putPreferences(preferences(L1));
      await s.putPreferences({ ...preferences(L1, 'sq'), explanationDepth: { value: 'explanatory', origin: 'explicit' } });
      expect((await s.getPreferences(L1))!.explanationDepth.value).toBe('brief');
      expect((await s.getPreferences(L1, 'sq'))!.explanationDepth).toEqual({ value: 'explanatory', origin: 'explicit' });
      expect(await s.getPreferences(L1, 'de')).toBeUndefined();
      await s.putPreferences({ ...preferences(L1, 'sq'), updatedAt: '2026-10-09T00:00:00.000Z' });
      expect((await s.getPreferences(L1, 'sq'))!.updatedAt).toBe('2026-10-09T00:00:00.000Z');
    }));
  });

  describe(`${name}: private documents`, () => {
    it('creates at revision 1 from expectedRevision 0 and bumps on each accepted write', withStore(async (s) => {
      expect(await s.putDocument(doc(L1, 'd1', 'first'), 0)).toEqual({ ok: true });
      expect((await s.getDocument(L1, 'd1'))).toMatchObject({ body: 'first', revision: 1 });
      expect(await s.putDocument(doc(L1, 'd1', 'second', { revision: 99 }), 1)).toEqual({ ok: true });
      expect(await s.getDocument(L1, 'd1')).toMatchObject({ body: 'second', revision: 2 }); // the stored revision is expected + 1, whatever was sent
      expect((await s.listDocuments(L1)).map((d) => d.docId)).toEqual(['d1']);
      expect(await s.getDocument(L2, 'd1')).toBeUndefined();
    }));

    it('refuses a lost update and hands back the current row', withStore(async (s) => {
      await s.putDocument(doc(L1, 'd1', 'v1'), 0);
      await s.putDocument(doc(L1, 'd1', 'v2 from device A'), 1);
      const r = await s.putDocument(doc(L1, 'd1', 'v2 from device B', { deviceId: 'dev-2' }), 1);
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.current).toMatchObject({ body: 'v2 from device A', revision: 2 });
      expect((await s.getDocument(L1, 'd1'))!.body).toBe('v2 from device A');
      // creating over an existing document is a conflict too
      const again = await s.putDocument(doc(L1, 'd1', 'again'), 0);
      expect(again.ok).toBe(false);
      // a revision ahead of the store is a conflict as well
      expect((await s.putDocument(doc(L1, 'd1', 'ahead'), 5)).ok).toBe(false);
    }));

    it('cannot update a document that does not exist', withStore(async (s) => {
      await expect(s.putDocument(doc(L1, 'ghost', 'x'), 3)).rejects.toThrow(/expectedRevision 0/);
      expect(await s.getDocument(L1, 'ghost')).toBeUndefined();
    }));

    it('keeps documents of different learners apart, even with the same docId', withStore(async (s) => {
      await s.putDocument(doc(L1, 'd', 'mine'), 0);
      await s.putDocument(doc(L2, 'd', 'theirs', { learnerId: L2 }), 0);
      expect((await s.getDocument(L1, 'd'))!.body).toBe('mine');
      expect((await s.getDocument(L2, 'd'))!.body).toBe('theirs');
    }));

    it('deleteDocument blanks the body and sets deletedAt but keeps the row; a stale writer cannot resurrect it', withStore(async (s) => {
      await s.putDocument(doc(L1, 'd1', 'secret words'), 0);
      await s.deleteDocument(L1, 'd1');
      const d = (await s.getDocument(L1, 'd1'))!;
      expect(d.body).toBe('');
      expect(d.deletedAt).toBeTruthy();
      expect(d.title).toBe('A draft');
      expect((await s.listDocuments(L1)).map((x) => x.docId)).toEqual(['d1']);
      const stale = await s.putDocument(doc(L1, 'd1', 'secret words, edited offline'), 1);
      expect(stale.ok).toBe(false);
      expect((await s.getDocument(L1, 'd1'))!.body).toBe('');
      await s.deleteDocument(L1, 'never-existed'); // a no-op
      expect(await s.getDocument(L1, 'never-existed')).toBeUndefined();
    }));
  });

  describe(`${name}: identity`, () => {
    it('stores learners', withStore(async (s) => {
      expect(await s.getLearner(L1)).toBeUndefined();
      await s.putLearner({ learnerId: L1, displayName: 'Ana', createdAt: '2026-10-01T00:00:00.000Z' });
      await s.putLearner({ learnerId: L1, displayName: 'Ana M.', createdAt: '2026-10-01T00:00:00.000Z' });
      expect((await s.getLearner(L1))!.displayName).toBe('Ana M.');
    }));

    it('looks accounts up by email case-insensitively and trimmed, and keeps emails unique', withStore(async (s) => {
      await s.putAccount(account('acc-1', L1, '  Ana@Example.COM '));
      expect((await s.getAccountByEmail('ana@example.com'))).toMatchObject({ accountId: 'acc-1', email: 'ana@example.com', passwordHash: 'pbkdf2$hash' });
      expect((await s.getAccountByEmail(' ANA@EXAMPLE.COM'))!.accountId).toBe('acc-1');
      expect(await s.getAccountByEmail('other@example.com')).toBeUndefined();
      const plain = (await s.getAccount('acc-1'))!;
      expect(plain.learnerId).toBe(L1);
      expect(plain).not.toHaveProperty('passwordHash');
      await expect(s.putAccount(account('acc-2', L2, 'ANA@example.com'))).rejects.toThrow();
      await s.putAccount({ ...account('acc-1', L1, 'ana@example.com'), disabledAt: '2026-10-05T00:00:00.000Z' });
      expect((await s.getAccount('acc-1'))!.disabledAt).toBe('2026-10-05T00:00:00.000Z');
      await expect(s.putAccount(account('acc-1', L2, 'ana@example.com'))).rejects.toThrow(/another learner/);
    }));

    it('looks sessions up by token hash, never returns the hash, and revokes', withStore(async (s) => {
      await s.putSession(session('s1', L1, 'hash-1'));
      const got = (await s.getSessionByTokenHash('hash-1'))!;
      expect(got).toMatchObject({ sessionId: 's1', learnerId: L1 });
      expect(got).not.toHaveProperty('tokenHash');
      expect(got.revokedAt).toBeUndefined();
      expect(await s.getSessionByTokenHash('hash-2')).toBeUndefined();
      await s.revokeSession('s1', '2026-10-06T00:00:00.000Z');
      expect((await s.getSessionByTokenHash('hash-1'))!.revokedAt).toBe('2026-10-06T00:00:00.000Z');
      await s.revokeSession('s1', '2026-10-07T00:00:00.000Z'); // the first revocation stands
      expect((await s.getSessionByTokenHash('hash-1'))!.revokedAt).toBe('2026-10-06T00:00:00.000Z');
      await s.revokeSession('unknown', '2026-10-07T00:00:00.000Z');
      await expect(s.putSession(session('s2', L1, 'hash-1'))).rejects.toThrow();
    }));

    it('stores devices per learner', withStore(async (s) => {
      await s.putDevice(device(L1, 'dev-1'));
      await s.putDevice({ ...device(L1, 'dev-1'), lastSyncAt: '2026-10-08T00:00:00.000Z' });
      expect((await s.getDevice(L1, 'dev-1'))!.lastSyncAt).toBe('2026-10-08T00:00:00.000Z');
      expect(await s.getDevice(L2, 'dev-1')).toBeUndefined();
    }));

    it('stores enrolments with their goals, in start order, per learner', withStore(async (s) => {
      await s.putEnrolment(enrolment('en-2', L1, { startedAt: '2026-10-03T00:00:00.000Z', languageId: 'de' }));
      await s.putEnrolment(enrolment('en-1', L1));
      await s.putEnrolment(enrolment('en-x', L2));
      const list = await s.listEnrolments(L1);
      expect(list.map((e) => e.enrolmentId)).toEqual(['en-1', 'en-2']);
      expect(list[0].goals).toEqual([{ kind: 'reading', priority: 1 }, { kind: 'scripture' }]);
      await s.putEnrolment({ ...enrolment('en-1', L1), endedAt: '2026-10-09T00:00:00.000Z', goals: [] });
      expect((await s.listEnrolments(L1))[0]).toMatchObject({ endedAt: '2026-10-09T00:00:00.000Z', goals: [] });
      await expect(s.putEnrolment(enrolment('en-1', L2))).rejects.toThrow(/another learner/);
    }));

    it('stores teams and members; membership is its own record', withStore(async (s) => {
      await s.putTeam({ teamId: 't1', name: 'Honduras', defaultLanguageId: 'es', createdAt: '2026-10-01T00:00:00.000Z' });
      expect((await s.getTeam('t1'))!.name).toBe('Honduras');
      expect(await s.getTeam('t2')).toBeUndefined();
      await s.putTeamMember('t1', L2, 'member', '2026-10-03T00:00:00.000Z');
      await s.putTeamMember('t1', L1, 'leader', '2026-10-02T00:00:00.000Z');
      await s.putTeamMember('t1', L2, 'leader', '2026-10-03T00:00:00.000Z');
      expect(await s.listTeamMembers('t1')).toEqual([
        { learnerId: L1, role: 'leader', since: '2026-10-02T00:00:00.000Z' },
        { learnerId: L2, role: 'leader', since: '2026-10-03T00:00:00.000Z' },
      ]);
      expect(await s.listTeamMembers('t2')).toEqual([]);
    }));
  });

  describe(`${name}: tombstones`, () => {
    it('stores and lists tombstones per learner, oldest first, idempotently', withStore(async (s) => {
      const t1 = tombstone('t1', L1, { kind: 'event', id: 'e1' }, '2026-10-09T00:00:00.000Z');
      const t0 = tombstone('t0', L1, { kind: 'range', from: '2026-10-01T00:00:00.000Z', to: '2026-10-02T00:00:00.000Z' }, '2026-10-08T00:00:00.000Z');
      await s.putTombstone(t1);
      await s.putTombstone(t0);
      await s.putTombstone(t1);
      await s.putTombstone(tombstone('t9', L2, { kind: 'learner' }));
      expect((await s.listTombstones(L1)).map((t) => t.tombstoneId)).toEqual(['t0', 't1']);
      expect((await s.listTombstones(L1))[0].scope).toEqual(t0.scope);
      await expect(s.putTombstone(tombstone('t1', L2, { kind: 'learner' }))).rejects.toThrow(/another learner/);
    }));

    it('refuses to append an event that an event tombstone deleted', withStore(async (s) => {
      await s.putTombstone(tombstone('t1', L1, { kind: 'event', id: 'gone' }));
      const out = await s.append(L1, [ev('gone'), ev('fine')]);
      expect(out[0].stored).toBe(false);
      expect(out[1].stored).toBe(true);
    }));
  });

  describe(`${name}: transaction and erasure`, () => {
    it('transaction returns the value of fn', withStore(async (s) => {
      expect(await s.transaction(async () => { await s.append(L1, [ev('e1')]); return 42; })).toBe(42);
      expect(await s.head(L1)).toBe(1);
    }));

    it('eraseLearner removes everything of one learner and touches no other', withStore(async (s) => {
      for (const L of [L1, L2]) {
        await s.putLearner({ learnerId: L, createdAt: '2026-10-01T00:00:00.000Z' });
        await s.append(L, [ev(`${L}-a`, { learnerId: L }), ev(`${L}-b`, { learnerId: L, dedupeKey: `${L}-k` })]);
        await s.putKnowledge([knowledgeRow(L, 'u1'), knowledgeRow(L, 'u2')]);
        await s.putProjectionCursor(L, { seq: 2, modelVersion: 'm1' });
        await s.putPreferences(preferences(L));
        await s.putPreferences(preferences(L, 'sq'));
        await s.putDocument(doc(L, 'd1', 'text', { learnerId: L }), 0);
        await s.putAccount(account(`acc-${L}`, L, `${L}@example.com`));
        await s.putSession(session(`s-${L}`, L, `hash-${L}`));
        await s.putDevice(device(L, 'dev-1'));
        await s.putEnrolment(enrolment(`en-${L}`, L));
        await s.putTombstone(tombstone(`t-${L}`, L, { kind: 'event', id: 'zzz' }));
        await s.putTeamMember('team', L, 'member', '2026-10-01T00:00:00.000Z');
      }
      const counts = await s.eraseLearner(L1);
      expect(counts).toMatchObject({ events: 2, documents: 1, knowledge: 2 });

      expect(await s.list({ learnerId: L1 })).toEqual([]);
      expect(await s.head(L1)).toBe(0);
      expect(await s.getKnowledge(L1)).toEqual([]);
      expect(await s.getProjectionCursor(L1)).toBeUndefined();
      expect(await s.getPreferences(L1)).toBeUndefined();
      expect(await s.getPreferences(L1, 'sq')).toBeUndefined();
      expect(await s.listDocuments(L1)).toEqual([]);
      expect(await s.getAccountByEmail(`${L1}@example.com`)).toBeUndefined();
      expect(await s.getSessionByTokenHash(`hash-${L1}`)).toBeUndefined();
      expect(await s.getDevice(L1, 'dev-1')).toBeUndefined();
      expect(await s.listEnrolments(L1)).toEqual([]);
      expect(await s.listTombstones(L1)).toEqual([]);
      expect(await s.getLearner(L1)).toBeUndefined();
      expect((await s.listTeamMembers('team')).map((m) => m.learnerId)).toEqual([L2]);
      expect(await s.list({ learnerId: L1, unitId: 'lemma:sq:shtëpi:NOUN' })).toEqual([]);

      // the other learner is whole
      expect((await s.list({ learnerId: L2 })).map((e) => e.id)).toEqual([`${L2}-a`, `${L2}-b`]);
      expect(await s.head(L2)).toBe(2);
      expect(await s.getKnowledge(L2)).toHaveLength(2);
      expect(await s.getProjectionCursor(L2)).toEqual({ seq: 2, modelVersion: 'm1' });
      expect(await s.getPreferences(L2)).toBeDefined();
      expect((await s.getDocument(L2, 'd1'))!.body).toBe('text');
      expect(await s.getAccountByEmail(`${L2}@example.com`)).toBeDefined();
      expect(await s.getSessionByTokenHash(`hash-${L2}`)).toBeDefined();
      expect(await s.getDevice(L2, 'dev-1')).toBeDefined();
      expect(await s.listEnrolments(L2)).toHaveLength(1);
      expect(await s.listTombstones(L2)).toHaveLength(1);
      expect(await s.getLearner(L2)).toBeDefined();

      // an erased learner's dedupe keys and ids are free again, and seq restarts
      const again = await s.append(L1, [ev(`${L1}-b`, { dedupeKey: `${L1}-k` })]);
      expect(again).toEqual([{ id: `${L1}-b`, stored: true }]);
      expect((await s.get(L1, `${L1}-b`))!.seq).toBe(1);
    }));

    it('erasing an unknown learner is a harmless zero', withStore(async (s) => {
      expect(await s.eraseLearner('nobody')).toMatchObject({ events: 0, documents: 0, knowledge: 0 });
    }));
  });

  describe(`${name}: export and import`, () => {
    async function populate(s: RepositoryStore): Promise<void> {
      await s.putLearner({ learnerId: L1, displayName: 'Ana', createdAt: '2026-10-01T00:00:00.000Z' });
      await s.putEnrolment(enrolment('en-1', L1));
      await s.putDevice(device(L1, 'dev-1'));
      await s.putAccount(account('acc-1', L1, 'ana@example.com'));
      await s.putSession(session('s1', L1, 'hash-1'));
      await s.append(L1, [
        ev('e1', { at: '2026-10-05T10:00:00.000Z', dedupeKey: 'k1' }),
        encounter('e2', { at: '2026-10-01T10:00:00.000Z', subject: { itemIds: ['form:sq:librin'] } }),
        ev('e3', { languageId: 'de', at: '2026-10-03T10:00:00.000Z' }),
      ]);
      await s.putKnowledge([knowledgeRow(L1, 'u1')]);
      await s.putPreferences(preferences(L1));
      await s.putPreferences(preferences(L1, 'sq'));
      await s.putDocument(doc(L1, 'd1', 'Unë jam këtu.'), 0);
      await s.putDocument(doc(L1, 'd2', 'removed later'), 0);
      await s.deleteDocument(L1, 'd2');
      await s.putTombstone(tombstone('t1', L1, { kind: 'event', id: 'old' }));
    }

    it('exports every table of the learner and no credentials', withStore(async (s) => {
      await populate(s);
      await s.append(L2, [ev('other', { learnerId: L2 })]);
      const x = await exportLearner(s, L1, { now: () => '2026-10-10T00:00:00.000Z' });
      expect(x.format).toBe('go-repository-export@1');
      expect(x.exportedAt).toBe('2026-10-10T00:00:00.000Z');
      expect(x.learner?.displayName).toBe('Ana');
      expect(x.enrolments.map((e) => e.enrolmentId)).toEqual(['en-1']);
      expect(x.devices).toEqual(['dev-1']);
      expect(x.events.map((e) => [e.id, e.seq])).toEqual([['e1', 1], ['e2', 2], ['e3', 3]]);
      expect(x.events.every((e) => typeof e.recordedAt === 'string')).toBe(true);
      expect(x.knowledge.map((k) => k.unitId)).toEqual(['u1']);
      expect(x.preferences.map((p) => p.languageId ?? '')).toEqual(['', 'sq']);
      expect(x.documents.map((d) => [d.docId, d.body])).toEqual([['d1', 'Unë jam këtu.'], ['d2', '']]);
      expect(x.tombstones.map((t) => t.tombstoneId)).toEqual(['t1']);
      const json = JSON.stringify(x);
      expect(json).not.toContain('pbkdf2');
      expect(json).not.toContain('hash-1');
      expect(json).not.toContain('other');
    }));

    it('round-trips into a fresh store: same events, documents, enrolments, preferences, tombstones', withStore(async (s) => {
      await populate(s);
      const x = await exportLearner(s, L1);
      const wire = JSON.parse(JSON.stringify(x)) as LearnerExport; // through the file it would travel in
      const fresh = await open();
      try {
        const summary = await importLearner(fresh, wire);
        expect(summary.events).toEqual({ stored: 3, duplicates: 0, refused: 0 });
        const key = (e: { id: string; kind: string; payload: unknown; subject: unknown; at: string; languageId: string; dedupeKey?: string }) => ({ id: e.id, kind: e.kind, payload: e.payload, subject: e.subject, at: e.at, languageId: e.languageId, dedupeKey: e.dedupeKey });
        expect((await fresh.list({ learnerId: L1 })).map(key)).toEqual((await s.list({ learnerId: L1 })).map(key));
        expect((await fresh.list({ learnerId: L1 })).map((e) => e.seq)).toEqual([1, 2, 3]);
        expect((await fresh.listDocuments(L1)).map((d) => [d.docId, d.body, d.title, d.deletedAt === undefined])).toEqual((await s.listDocuments(L1)).map((d) => [d.docId, d.body, d.title, d.deletedAt === undefined]));
        expect((await fresh.listEnrolments(L1)).map((e) => e.enrolmentId)).toEqual(['en-1']);
        expect((await fresh.listEnrolments(L1))[0].goals).toEqual((await s.listEnrolments(L1))[0].goals);
        expect(await fresh.getPreferences(L1, 'sq')).toEqual(await s.getPreferences(L1, 'sq'));
        expect(await fresh.getPreferences(L1)).toEqual(await s.getPreferences(L1));
        expect((await fresh.listTombstones(L1)).map((t) => t.tombstoneId)).toEqual(['t1']);
        expect((await fresh.getLearner(L1))!.displayName).toBe('Ana');
        expect(await fresh.getKnowledge(L1)).toEqual([]); // derived: the engine rebuilds it
        expect(await fresh.getAccountByEmail('ana@example.com')).toBeUndefined(); // credentials never travel
        // the unitId index was rebuilt too
        expect((await fresh.list({ learnerId: L1, unitId: 'form:sq:librin' })).map((e) => e.id)).toEqual(['e2']);
      } finally { await fresh.close(); }
    }));

    it('importing twice changes nothing', withStore(async (s) => {
      await populate(s);
      const x = await exportLearner(s, L1);
      const fresh = await open();
      try {
        await importLearner(fresh, x);
        const second = await importLearner(fresh, x);
        expect(second.events).toEqual({ stored: 0, duplicates: 3, refused: 0 });
        expect(second.documents.stored).toBe(0);
        expect(await fresh.list({ learnerId: L1 })).toHaveLength(3);
        expect(await fresh.listDocuments(L1)).toHaveLength(2);
      } finally { await fresh.close(); }
    }));

    it('refuses something that is not an export', withStore(async (s) => {
      await expect(importLearner(s, { format: 'other' } as never)).rejects.toThrow(/export/);
    }));

    it('an import into a store already holding newer text keeps it', withStore(async (s) => {
      await populate(s);
      const x = await exportLearner(s, L1);
      await s.putDocument(doc(L1, 'd1', 'edited since the export'), 1);
      const summary = await importLearner(s, x);
      expect(summary.documents.skipped).toBe(2);
      expect((await s.getDocument(L1, 'd1'))!.body).toBe('edited since the export');
    }));
  });

  describe(`${name}: deletion by tombstone`, () => {
    const sourceA = { kind: 'ebook' as const, title: 'Book A', locator: 'ch1' };
    async function seed(s: RepositoryStore): Promise<void> {
      await s.append(L1, [
        ev('a1', { at: '2026-10-01T10:00:00.000Z', subject: { itemIds: ['u1'], sourceRef: sourceA } }),
        ev('a2', { at: '2026-10-02T10:00:00.000Z', subject: { itemIds: ['u1'], sourceRef: { kind: 'ebook', title: 'Book A', locator: 'ch2' } } }),
        ev('b1', { at: '2026-10-03T10:00:00.000Z', subject: { itemIds: ['u2'], sourceRef: { kind: 'ebook', title: 'Book B' } } }),
        ev('w1', { at: '2026-10-04T10:00:00.000Z', subject: { itemIds: ['u3'], sourceRef: { kind: 'web', title: 'Book A' } } }),
        ev('n1', { at: '2026-10-05T10:00:00.000Z', subject: { itemIds: ['u4'] } }),
      ]);
      await s.append(L2, [ev('x1', { learnerId: L2, at: '2026-10-02T11:00:00.000Z', subject: { itemIds: ['u1'], sourceRef: sourceA } })]);
      await s.putKnowledge([knowledgeRow(L1, 'u1')]);
      await s.putProjectionCursor(L1, { seq: 5, modelVersion: 'm1' });
    }
    const ids = async (s: RepositoryStore, L = L1) => (await s.list({ learnerId: L })).map((e) => e.id);

    it('by source removes exactly the events matching kind, title and locator', withStore(async (s) => {
      await seed(s);
      const t = tombstone('t1', L1, { kind: 'source', sourceRef: { kind: 'ebook', title: 'Book A' } });
      const r = await applyTombstone(s, t);
      expect(r).toMatchObject({ tombstoneId: 't1', scope: 'source', events: 2, knowledge: 1 });
      expect(await ids(s)).toEqual(['b1', 'w1', 'n1']); // same title but a web source stays; another book stays
      expect(await ids(s, L2)).toEqual(['x1']);
      expect((await s.listTombstones(L1)).map((x) => x.tombstoneId)).toEqual(['t1']);
      // derived rows from the deleted events are gone and the cursor rewound so the engine refolds
      expect(await s.getKnowledge(L1)).toEqual([]);
      expect(await s.getProjectionCursor(L1)).toEqual({ seq: 0, modelVersion: 'm1' });
      // and the index of unit ids went with them
      expect(await s.list({ learnerId: L1, unitId: 'u1' })).toEqual([]);
    }));

    it('by source with a locator removes only that locator', withStore(async (s) => {
      await seed(s);
      const r = await applyTombstone(s, tombstone('t1', L1, { kind: 'source', sourceRef: sourceA }));
      expect(r.events).toBe(1);
      expect(await ids(s)).toEqual(['a2', 'b1', 'w1', 'n1']);
    }));

    it('by range removes events with `at` in [from, to] inclusive', withStore(async (s) => {
      await seed(s);
      const r = await applyTombstone(s, tombstone('t2', L1, { kind: 'range', from: '2026-10-02T10:00:00.000Z', to: '2026-10-04T10:00:00.000Z' }));
      expect(r).toMatchObject({ scope: 'range', events: 3 });
      expect(await ids(s)).toEqual(['a1', 'n1']);
      expect(await ids(s, L2)).toEqual(['x1']);
      expect((await s.listTombstones(L1)).map((x) => x.tombstoneId)).toEqual(['t2']);
    }));

    it('by event removes that one event, and an unknown id removes nothing but still records', withStore(async (s) => {
      await seed(s);
      expect((await applyTombstone(s, tombstone('t3', L1, { kind: 'event', id: 'b1' }))).events).toBe(1);
      expect(await ids(s)).toEqual(['a1', 'a2', 'w1', 'n1']);
      expect((await applyTombstone(s, tombstone('t4', L1, { kind: 'event', id: 'nope' }))).events).toBe(0);
      expect(await ids(s)).toEqual(['a1', 'a2', 'w1', 'n1']);
      // an event id of another learner is not this learner's to delete
      expect((await applyTombstone(s, tombstone('t5', L1, { kind: 'event', id: 'x1' }))).events).toBe(0);
      expect(await ids(s, L2)).toEqual(['x1']);
      expect((await s.listTombstones(L1)).map((x) => x.tombstoneId)).toEqual(['t3', 't4', 't5']);
    }));

    it('a deleted event cannot be sent back by a stale device', withStore(async (s) => {
      await seed(s);
      await applyTombstone(s, tombstone('t3', L1, { kind: 'event', id: 'b1' }));
      const out = await s.append(L1, [ev('b1')]);
      expect(out[0].stored).toBe(false);
      expect(await ids(s)).not.toContain('b1');
    }));

    it('keeps seq and head monotonic after deletion (a sync cursor never sees a seq twice)', withStore(async (s) => {
      await seed(s);
      await applyTombstone(s, tombstone('t6', L1, { kind: 'event', id: 'n1' }));
      expect(await s.head(L1)).toBe(5);
      await s.append(L1, [ev('later')]);
      expect((await s.get(L1, 'later'))!.seq).toBe(6);
    }));

    it('by learner erases everything of that learner and only that learner', withStore(async (s) => {
      await seed(s);
      await s.putDocument(doc(L1, 'd1', 'private'), 0);
      const r = await applyTombstone(s, tombstone('t7', L1, { kind: 'learner' }));
      expect(r).toMatchObject({ scope: 'learner', events: 5, documents: 1, knowledge: 1 });
      expect(await ids(s)).toEqual([]);
      expect(await s.listDocuments(L1)).toEqual([]);
      expect(await ids(s, L2)).toEqual(['x1']);
    }));

    it('writes the tombstone first: it is in the export taken straight after', withStore(async (s) => {
      await seed(s);
      await applyTombstone(s, tombstone('t8', L1, { kind: 'event', id: 'a1' }));
      const x = await exportLearner(s, L1);
      expect(x.tombstones.map((t) => t.tombstoneId)).toEqual(['t8']);
      expect(x.events.map((e) => e.id)).not.toContain('a1');
    }));

    it('refuses a malformed tombstone before writing anything', withStore(async (s) => {
      await seed(s);
      await expect(applyTombstone(s, tombstone('bad', L1, { kind: 'range', from: '2026-10-05T00:00:00.000Z', to: '2026-10-01T00:00:00.000Z' }))).rejects.toThrow(/from <= to/);
      await expect(applyTombstone(s, tombstone('bad', L1, { kind: 'range', from: 'x', to: 'y' }))).rejects.toThrow();
      await expect(applyTombstone(s, tombstone('bad', L1, { kind: 'source', sourceRef: {} as never }))).rejects.toThrow(/kind/);
      expect(await s.listTombstones(L1)).toEqual([]);
      expect(await ids(s)).toHaveLength(5);
    }));
  });
}
