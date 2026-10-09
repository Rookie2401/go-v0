/**
 * Contract v3 behaviour every store must have (run against memory and SQLite): provenance that survives a rewrite, the `requires-review`
 * status and the one path that lowers a status, provenance counts by origin and validation, source tombstones on the new reference kinds,
 * and the learner's export carrying the provenance of the units it refers to.
 */
import { describe, expect, it } from 'vitest';
import { exportLearner } from '../../../packages/repository-store/src';
import type { ConcreteStore } from '../../../packages/repository-store/src';
import { applyTombstone } from '../../../packages/repository-store/src';
import type { FormAnalysis, GoEvent, UnitCorrection, UnitProvenance } from '../../../packages/repository-contract/src';
import { L1, analysis, ev, relation, tombstone, unit } from './fixtures';

const CORRECTION: UnitCorrection = { at: '2026-10-09T10:00:00.000Z', by: 'learner', reason: 'the lemma looks wrong' };
const stamp = (over: Partial<UnitProvenance> = {}): UnitProvenance => ({ source: 'rule', ref: 'adapter-sq@9', confidence: 0.5, origin: 'learner-lookup', validation: 'experimental', ...over });

export function storeProvenanceConformance(name: string, open: () => Promise<ConcreteStore>): void {
  const withStore = (fn: (s: ConcreteStore) => Promise<void>) => async () => {
    const s = await open();
    try { await fn(s); } finally { await s.close(); }
  };

  describe(`${name}: contract v3 provenance`, () => {
    it('stores and returns a unit with every v3 provenance field as given', withStore(async (s) => {
      const prov = stamp({ licenceId: 'CC-BY-4.0', packVersion: '9', analyzerVersion: '9.1', alternatives: ['lemma:sq:b:NOUN'], corrections: [CORRECTION] });
      await s.putUnits([unit('lemma:sq:a:NOUN', 'provisional', { provenance: prov })]);
      expect((await s.getUnits(['lemma:sq:a:NOUN']))[0].provenance).toEqual(prov);
    }));

    it('stores the new status: a requires-review unit, relation and analysis', withStore(async (s) => {
      await s.putUnits([unit('lemma:sq:a:NOUN', 'requires-review')]);
      await s.putRelations([relation('form:sq:a', 'lemma:sq:a:NOUN', 'requires-review')]);
      await s.putAnalyses([analysis('an1', { status: 'requires-review' })]);
      expect((await s.getUnits(['lemma:sq:a:NOUN']))[0].status).toBe('requires-review');
      expect((await s.relationsOf('form:sq:a'))[0].status).toBe('requires-review');
      expect((await s.getAnalysis('an1'))!.status).toBe('requires-review');
    }));

    it('a rewrite by a producer that states no origin keeps the stored origin, validation and corrections', withStore(async (s) => {
      await s.putUnits([unit('lemma:sq:a:NOUN', 'provisional', { provenance: stamp({ corrections: [CORRECTION] }) })]);
      await s.putUnits([unit('lemma:sq:a:NOUN', 'provisional')]); // the v2-shaped re-resolution
      const got = (await s.getUnits(['lemma:sq:a:NOUN']))[0];
      expect(got.provenance).toMatchObject({ origin: 'learner-lookup', validation: 'experimental', corrections: [CORRECTION] });
      expect(got.provenance.ref).toBe('pack:sq:1'); // what the incoming row does state wins
    }));

    it('a rewrite that states an origin replaces it, and corrections are never dropped', withStore(async (s) => {
      await s.putUnits([unit('lemma:sq:a:NOUN', 'provisional', { provenance: stamp({ corrections: [CORRECTION] }) })]);
      await s.putUnits([unit('lemma:sq:a:NOUN', 'high-confidence', { provenance: stamp({ origin: 'reviewer', validation: 'production-validated' }) })]);
      const got = (await s.getUnits(['lemma:sq:a:NOUN']))[0];
      expect(got.status).toBe('high-confidence');
      expect(got.provenance).toMatchObject({ origin: 'reviewer', validation: 'production-validated', corrections: [CORRECTION] });
    }));

    it('a relation and an analysis carry their provenance the same way', withStore(async (s) => {
      await s.putRelations([{ ...relation('form:sq:a', 'lemma:sq:a:NOUN'), provenance: stamp() }]);
      await s.putRelations([relation('form:sq:a', 'lemma:sq:a:NOUN')]);
      expect((await s.relationsOf('form:sq:a'))[0].provenance).toMatchObject({ origin: 'learner-lookup', validation: 'experimental' });
      await s.putAnalyses([analysis('an1', { provenance: stamp() })]);
      await s.putAnalyses([analysis('an1')]);
      expect((await s.getAnalysis('an1'))!.provenance).toMatchObject({ origin: 'learner-lookup', validation: 'experimental' });
    }));

    it('requires-review is sticky: a re-resolution that comes back provisional does not clear it; a verdict does', withStore(async (s) => {
      await s.putUnits([unit('lemma:sq:a:NOUN', 'requires-review')]);
      await s.putUnits([unit('lemma:sq:a:NOUN', 'provisional')]);
      expect((await s.getUnits(['lemma:sq:a:NOUN']))[0].status).toBe('requires-review');
      await s.putUnits([unit('lemma:sq:a:NOUN', 'conflicted')]);
      expect((await s.getUnits(['lemma:sq:a:NOUN']))[0].status).toBe('requires-review');
      await s.putUnits([unit('lemma:sq:a:NOUN', 'high-confidence')]);
      expect((await s.getUnits(['lemma:sq:a:NOUN']))[0].status).toBe('high-confidence');
    }));

    it('a unit above requires-review is not lowered by a normal put, as before', withStore(async (s) => {
      await s.putUnits([unit('lemma:sq:a:NOUN', 'verified')]);
      await s.putUnits([unit('lemma:sq:a:NOUN', 'requires-review')]);
      expect((await s.getUnits(['lemma:sq:a:NOUN']))[0].status).toBe('verified');
    }));
  });

  describe(`${name}: recording a correction against a unit`, () => {
    const need = (s: ConcreteStore): NonNullable<ConcreteStore['recordUnitCorrection']> => {
      if (!s.recordUnitCorrection) throw new Error('the store has no recordUnitCorrection');
      return s.recordUnitCorrection.bind(s);
    };

    it('appends the correction and moves a provisional unit to requires-review', withStore(async (s) => {
      await s.putUnits([unit('lemma:sq:a:NOUN', 'provisional')]);
      const r = await need(s)('lemma:sq:a:NOUN', CORRECTION, true);
      expect(r).toMatchObject({ statusChanged: true, unit: { status: 'requires-review', provenance: { corrections: [CORRECTION] } } });
      const got = (await s.getUnits(['lemma:sq:a:NOUN']))[0];
      expect(got.status).toBe('requires-review');
      expect(got.provenance.corrections).toEqual([CORRECTION]);
      expect(got.provenance.ref).toBe('pack:sq:1'); // nothing else about the unit changed
    }));

    it('appends in order and keeps the earlier corrections', withStore(async (s) => {
      await s.putUnits([unit('lemma:sq:a:NOUN', 'provisional')]);
      const second: UnitCorrection = { ...CORRECTION, at: '2026-10-09T11:00:00.000Z', reason: 'still wrong' };
      await need(s)('lemma:sq:a:NOUN', CORRECTION, true);
      await need(s)('lemma:sq:a:NOUN', second, true);
      expect((await s.getUnits(['lemma:sq:a:NOUN']))[0].provenance.corrections).toEqual([CORRECTION, second]);
    }));

    it('a learner cannot lower a high-confidence or verified unit: the correction is recorded, the status stays', withStore(async (s) => {
      await s.putUnits([unit('lemma:sq:v:NOUN', 'verified'), unit('lemma:sq:h:NOUN', 'high-confidence'), unit('lemma:sq:c:NOUN', 'conflicted'), unit('lemma:sq:i:NOUN', 'invalidated')]);
      for (const id of ['lemma:sq:v:NOUN', 'lemma:sq:h:NOUN', 'lemma:sq:c:NOUN', 'lemma:sq:i:NOUN']) {
        const before = (await s.getUnits([id]))[0].status;
        const r = await need(s)(id, CORRECTION, true);
        expect(r!.statusChanged, id).toBe(false);
        expect(r!.unit.status, id).toBe(before);
        expect(r!.unit.provenance.corrections, id).toEqual([CORRECTION]);
      }
    }));

    it('a reviewer can lower a verified or high-confidence unit, but not a conflicted or invalidated one', withStore(async (s) => {
      await s.putUnits([unit('lemma:sq:v:NOUN', 'verified'), unit('lemma:sq:h:NOUN', 'high-confidence'), unit('lemma:sq:c:NOUN', 'conflicted'), unit('lemma:sq:i:NOUN', 'invalidated')]);
      const byReviewer: UnitCorrection = { ...CORRECTION, by: 'reviewer' };
      expect((await need(s)('lemma:sq:v:NOUN', byReviewer, true))!.unit.status).toBe('requires-review');
      expect((await need(s)('lemma:sq:h:NOUN', byReviewer, true))!.unit.status).toBe('requires-review');
      expect((await need(s)('lemma:sq:c:NOUN', byReviewer, true))!.unit.status).toBe('conflicted');
      expect((await need(s)('lemma:sq:i:NOUN', byReviewer, true))!.unit.status).toBe('invalidated');
    }));

    it('without the flag it only appends', withStore(async (s) => {
      await s.putUnits([unit('lemma:sq:a:NOUN', 'provisional')]);
      const r = await need(s)('lemma:sq:a:NOUN', CORRECTION, false);
      expect(r).toMatchObject({ statusChanged: false, unit: { status: 'provisional' } });
    }));

    it('answers undefined for a unit that does not exist, and writes nothing', withStore(async (s) => {
      expect(await need(s)('lemma:sq:none:NOUN', CORRECTION, true)).toBeUndefined();
      expect(await s.getUnits(['lemma:sq:none:NOUN'])).toEqual([]);
    }));

    it('keeps at most the newest 50 corrections', withStore(async (s) => {
      await s.putUnits([unit('lemma:sq:a:NOUN', 'provisional')]);
      for (let i = 0; i < 55; i++) await need(s)('lemma:sq:a:NOUN', { ...CORRECTION, reason: `r${i}` }, false);
      const list = (await s.getUnits(['lemma:sq:a:NOUN']))[0].provenance.corrections!;
      expect(list).toHaveLength(50);
      expect(list[0].reason).toBe('r5');
      expect(list[49].reason).toBe('r54');
    }));
  });

  describe(`${name}: provenance counts`, () => {
    it('counts rows by table, origin and validation; a row with none reads as import / unreviewed', withStore(async (s) => {
      await s.putUnits([
        unit('lemma:sq:a:NOUN'), unit('lemma:sq:b:NOUN'),
        unit('lemma:sq:c:NOUN', 'provisional', { provenance: stamp() }), unit('lemma:sq:d:NOUN', 'provisional', { provenance: stamp() }),
        unit('lemma:sq:e:NOUN', 'verified', { provenance: stamp({ origin: 'reviewer', validation: 'production-validated' }) }),
      ]);
      await s.putRelations([relation('form:sq:a', 'lemma:sq:a:NOUN'), { ...relation('form:sq:c', 'lemma:sq:c:NOUN'), provenance: stamp() }]);
      const candidates: FormAnalysis['candidates'] = [
        { confidence: 0.4, provenance: { source: 'rule', ref: 'x', confidence: 0.4, origin: 'dictionary' } },
        { confidence: 0.8, provenance: { source: 'rule', ref: 'x', confidence: 0.8, origin: 'rule-derived', validation: 'seed-only' } },
      ];
      await s.putAnalyses([analysis('an1', { candidates, chosen: 1 }), analysis('an2'), analysis('an3', { provenance: stamp() })]);
      expect(await s.provenanceStats()).toEqual([
        { table: 'analyses', origin: 'import', validation: 'unreviewed', count: 1 },
        { table: 'analyses', origin: 'learner-lookup', validation: 'experimental', count: 1 },
        { table: 'analyses', origin: 'rule-derived', validation: 'seed-only', count: 1 },
        { table: 'relations', origin: 'import', validation: 'unreviewed', count: 1 },
        { table: 'relations', origin: 'learner-lookup', validation: 'experimental', count: 1 },
        { table: 'units', origin: 'import', validation: 'unreviewed', count: 2 },
        { table: 'units', origin: 'learner-lookup', validation: 'experimental', count: 2 },
        { table: 'units', origin: 'reviewer', validation: 'production-validated', count: 1 },
      ]);
    }));

    it('follows a rewrite: the counts move with the row', withStore(async (s) => {
      await s.putUnits([unit('lemma:sq:a:NOUN')]);
      expect((await s.provenanceStats()).filter((c) => c.table === 'units')).toEqual([{ table: 'units', origin: 'import', validation: 'unreviewed', count: 1 }]);
      await s.putUnits([unit('lemma:sq:a:NOUN', 'provisional', { provenance: stamp() })]);
      expect((await s.provenanceStats()).filter((c) => c.table === 'units')).toEqual([{ table: 'units', origin: 'learner-lookup', validation: 'experimental', count: 1 }]);
    }));

    it('is empty for an empty store', withStore(async (s) => {
      expect(await s.provenanceStats()).toEqual([]);
    }));
  });

  describe(`${name}: the new reference kinds in events`, () => {
    const scripture = { kind: 'scripture', provider: 'biblegateway', translationId: 'NIV', book: 'JHN', chapter: 3, verse: 16, confidence: 0.9 } as const;
    const withRef = (id: string, sourceRef: GoEvent['subject']['sourceRef']): GoEvent => ev(id, { subject: { itemIds: ['lemma:sq:a:NOUN'], sourceRef } });

    it('stores v3 events with a scripture, share and media reference and returns them whole', withStore(async (s) => {
      const refs = [scripture, { kind: 'share', mechanism: 'clipboard-import', sourceApp: 'Notes' }, { kind: 'media', provider: 'p', mediaId: 'm', timestampMs: 5 }] as const;
      const out = await s.append(L1, refs.map((r, i) => withRef(`n${i}`, r as never)));
      expect(out.map((o) => o.stored)).toEqual([true, true, true]);
      expect((await s.list({ learnerId: L1 })).map((e) => e.subject.sourceRef)).toEqual(refs);
    }));

    it('refuses a malformed v3 reference with its path', withStore(async (s) => {
      const out = await s.append(L1, [withRef('bad', { ...scripture, book: 'john' } as never)]);
      expect(out[0].stored).toBe(false);
      expect(out[0].issues?.map((i) => i.path)).toContain('subject.sourceRef.book');
    }));

    it('a source tombstone can name a scripture chapter by its coordinates, or every scripture event by kind', withStore(async (s) => {
      await s.append(L1, [withRef('j316', scripture as never), withRef('j317', { ...scripture, verse: 17 } as never), withRef('j1', { ...scripture, chapter: 1, verse: 1 } as never), withRef('w', { kind: 'web', locator: '/a' })]);
      await applyTombstone(s, tombstone('t1', L1, { kind: 'source', sourceRef: { kind: 'scripture', locator: 'JHN.3.16' } }));
      expect((await s.list({ learnerId: L1 })).map((e) => e.id).sort()).toEqual(['j1', 'j317', 'w']);
      await applyTombstone(s, tombstone('t2', L1, { kind: 'source', sourceRef: { kind: 'scripture' } }));
      expect((await s.list({ learnerId: L1 })).map((e) => e.id)).toEqual(['w']);
    }));
  });

  describe(`${name}: the export carries unit provenance`, () => {
    it('lists the provenance of the units the learner\'s events refer to, with v2 defaults, and not the others', withStore(async (s) => {
      await s.putUnits([
        unit('lemma:sq:a:NOUN'),
        unit('lemma:sq:b:NOUN', 'provisional', { provenance: stamp({ corrections: [CORRECTION] }) }),
        unit('lemma:sq:other:NOUN', 'provisional', { provenance: stamp() }),
      ]);
      await s.append(L1, [ev('e1', { subject: { itemIds: ['lemma:sq:b:NOUN', 'lemma:sq:a:NOUN', 'lemma:sq:missing:NOUN'] } })]);
      const x = await exportLearner(s, L1);
      expect(x.unitProvenance!.map((u) => u.unitId)).toEqual(['lemma:sq:a:NOUN', 'lemma:sq:b:NOUN']);
      expect(x.unitProvenance![0].provenance).toMatchObject({ origin: 'import', validation: 'unreviewed' });
      expect(x.unitProvenance![1].provenance).toMatchObject({ origin: 'learner-lookup', validation: 'experimental', corrections: [CORRECTION] });
      expect(JSON.stringify(x.unitProvenance)).not.toContain('lemma:sq:other');
    }));

    it('is empty when no event refers to a stored unit', withStore(async (s) => {
      await s.append(L1, [ev('e1', { subject: { itemIds: ['lemma:sq:missing:NOUN'] } })]);
      expect((await exportLearner(s, L1)).unitProvenance).toEqual([]);
    }));
  });
}
