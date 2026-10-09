/** In-memory LinguisticStore for the linguistics tests. Relations are append-only on purpose: the service must not duplicate. */
import type { FormAnalysis, LanguagePackInfo, LinguisticStore, LinguisticUnit, UnitAlias, UnitRelation } from '../../../packages/repository-contract/src';

export interface FakeStore extends LinguisticStore {
  units: Map<string, LinguisticUnit>;
  relations: UnitRelation[];
  analyses: Map<string, FormAnalysis>;
  aliases: UnitAlias[];
  writes: { units: number; relations: number; analyses: number };
}

export function fakeStore(): FakeStore {
  const units = new Map<string, LinguisticUnit>();
  const relations: UnitRelation[] = [];
  const analyses = new Map<string, FormAnalysis>();
  const aliases: UnitAlias[] = [];
  const packs = new Map<string, LanguagePackInfo>();
  const writes = { units: 0, relations: 0, analyses: 0 };
  return {
    units, relations, analyses, aliases, writes,
    async getUnits(ids) { return ids.map((i) => units.get(i)).filter((u): u is LinguisticUnit => !!u); },
    async putUnits(us) { for (const u of us) { units.set(u.unitId, structuredClone(u)); writes.units++; } },
    async findUnits(q) {
      return [...units.values()].filter((u) => u.languageId === q.languageId && (!q.kind || u.kind === q.kind) && (!q.label || u.label === q.label)).slice(0, q.limit ?? 100);
    },
    async relationsOf(id, dir = 'both') {
      return relations.filter((r) => (dir !== 'in' && r.fromId === id) || (dir !== 'out' && r.toId === id));
    },
    async putRelations(rs) { for (const r of rs) { relations.push(structuredClone(r)); writes.relations++; } },
    async getAnalysis(id) { return analyses.get(id); },
    async analysesOfForm(formId, sentenceKey) {
      return [...analyses.values()].filter((a) => a.formId === formId && (sentenceKey === undefined || a.sentenceKey === sentenceKey));
    },
    async putAnalyses(as) { for (const a of as) { analyses.set(a.analysisId, structuredClone(a)); writes.analyses++; } },
    async invalidateAnalysis(id, reason, supersededBy) {
      const a = analyses.get(id);
      if (a) analyses.set(id, { ...a, status: 'invalidated', reason, ...(supersededBy ? { supersededBy } : {}) });
    },
    async aliasesFor(ids) { return aliases.filter((a) => ids.includes(a.oldId) || ids.includes(a.newId)); },
    async putAliases(as) { aliases.push(...as); },
    async getPack(packId) { return packs.get(packId); },
    async putPack(p) { packs.set(p.packId, p); },
    async listPacks() { return [...packs.values()]; },
  };
}
