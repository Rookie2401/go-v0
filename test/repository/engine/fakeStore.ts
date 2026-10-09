/**
 * A small Map-based fake of the ports the projection engine consumes (EventLog, ProjectionStore, LinguisticStore,
 * TombstoneStore, IdentityStore.listEnrolments). `append` assigns seq in arrival order and dedupes on id. It counts
 * writes to the linguistic tables so tests can assert the engine never writes them.
 */
import type {
  AppendOutcome, AssistancePreferences, Enrolment, EventFilter, FormAnalysis, GoEvent, LanguagePackInfo, LinguisticUnit, StoredEvent, Tombstone,
  UnitAlias, UnitKnowledge, UnitRelation,
} from '../../../packages/repository-contract/src';
import type { EngineStore } from '../../../packages/repository-engine/src';

export class FakeStore implements EngineStore {
  events: StoredEvent[] = [];
  private seq = 0;
  knowledge = new Map<string, UnitKnowledge>(); // `${learnerId}\u0000${unitId}`
  cursors = new Map<string, { seq: number; modelVersion: string }>();
  prefs = new Map<string, AssistancePreferences>();
  units = new Map<string, LinguisticUnit>();
  relations: UnitRelation[] = [];
  analyses = new Map<string, FormAnalysis>();
  aliases: UnitAlias[] = [];
  packs: LanguagePackInfo[] = [];
  tombstones: Tombstone[] = [];
  enrolments: Enrolment[] = [];
  /** Number of linguistic-table writes (put*, invalidateAnalysis). */
  lingWrites = 0;

  async append(learnerId: string, events: GoEvent[]): Promise<AppendOutcome[]> {
    const out: AppendOutcome[] = [];
    for (const e of events) {
      const dup = this.events.find((x) => x.learnerId === learnerId && x.id === e.id);
      if (dup) { out.push({ id: e.id, stored: false, duplicateOf: dup.id }); continue; }
      this.events.push({ ...e, learnerId, seq: ++this.seq, recordedAt: e.recordedAt ?? '2026-10-08T00:00:00.000Z' });
      out.push({ id: e.id, stored: true });
    }
    return out;
  }
  async list(f: EventFilter): Promise<StoredEvent[]> {
    let r = this.events.filter((e) => e.learnerId === f.learnerId);
    if (f.languageId) r = r.filter((e) => e.languageId === f.languageId);
    if (f.kinds) r = r.filter((e) => f.kinds!.includes(e.kind));
    if (f.unitId) r = r.filter((e) => (e.subject.itemIds ?? []).includes(f.unitId!) || (e.payload as { constructionId?: string }).constructionId === f.unitId);
    if (f.since) r = r.filter((e) => Date.parse(e.at) >= Date.parse(f.since!));
    if (f.afterSeq !== undefined) r = r.filter((e) => e.seq > f.afterSeq!);
    r = [...r].sort((a, b) => a.seq - b.seq);
    return f.limit ? r.slice(0, f.limit) : r;
  }
  async get(learnerId: string, id: string): Promise<StoredEvent | undefined> { return this.events.find((e) => e.learnerId === learnerId && e.id === id); }
  async head(learnerId: string): Promise<number> { return this.events.filter((e) => e.learnerId === learnerId).reduce((m, e) => Math.max(m, e.seq), 0); }

  // projection store
  async getKnowledge(learnerId: string, unitIds?: string[]): Promise<UnitKnowledge[]> {
    return [...this.knowledge.values()].filter((r) => r.learnerId === learnerId && (!unitIds || unitIds.includes(r.unitId)));
  }
  async putKnowledge(rows: UnitKnowledge[]): Promise<void> { for (const r of rows) this.knowledge.set(`${r.learnerId}\u0000${r.unitId}`, JSON.parse(JSON.stringify(r))); }
  async clearKnowledge(learnerId: string): Promise<void> { for (const k of [...this.knowledge.keys()]) if (k.startsWith(`${learnerId}\u0000`)) this.knowledge.delete(k); }
  async getProjectionCursor(learnerId: string) { return this.cursors.get(learnerId); }
  async putProjectionCursor(learnerId: string, c: { seq: number; modelVersion: string }): Promise<void> { this.cursors.set(learnerId, c); }
  async getPreferences(learnerId: string, languageId?: string) { return this.prefs.get(`${learnerId}\u0000${languageId ?? ''}`); }
  async putPreferences(p: AssistancePreferences): Promise<void> { this.prefs.set(`${p.learnerId}\u0000${p.languageId ?? ''}`, p); }

  // linguistic store (reads by the engine; writes only by test setup, which are counted)
  async getUnits(ids: string[]): Promise<LinguisticUnit[]> { return ids.flatMap((i) => (this.units.has(i) ? [this.units.get(i)!] : [])); }
  async putUnits(us: LinguisticUnit[]): Promise<void> { this.lingWrites++; for (const u of us) this.units.set(u.unitId, u); }
  async findUnits(q: { languageId: string; kind?: string; label?: string; limit?: number }): Promise<LinguisticUnit[]> {
    return [...this.units.values()].filter((u) => u.languageId === q.languageId && (!q.kind || u.kind === q.kind) && (!q.label || u.label === q.label)).slice(0, q.limit);
  }
  async relationsOf(unitId: string, direction: 'out' | 'in' | 'both' = 'both'): Promise<UnitRelation[]> {
    return this.relations.filter((r) => ((direction !== 'in') && r.fromId === unitId) || ((direction !== 'out') && r.toId === unitId));
  }
  async putRelations(rs: UnitRelation[]): Promise<void> { this.lingWrites++; this.relations.push(...rs); }
  async getAnalysis(id: string) { return this.analyses.get(id); }
  async analysesOfForm(formId: string, sentenceKey?: string): Promise<FormAnalysis[]> {
    return [...this.analyses.values()].filter((a) => a.formId === formId && (sentenceKey === undefined || a.sentenceKey === sentenceKey));
  }
  async putAnalyses(as: FormAnalysis[]): Promise<void> { this.lingWrites++; for (const a of as) this.analyses.set(a.analysisId, a); }
  async invalidateAnalysis(id?: string, reason?: string, supersededBy?: string): Promise<void> {
    this.lingWrites++;
    const a = id === undefined ? undefined : this.analyses.get(id);
    if (a && id !== undefined) this.analyses.set(id, { ...a, status: 'invalidated', ...(reason ? { reason } : {}), ...(supersededBy ? { supersededBy } : {}) });
  }
  async aliasesFor(ids: string[]): Promise<UnitAlias[]> { return this.aliases.filter((a) => ids.includes(a.oldId)); }
  async putAliases(a: UnitAlias[]): Promise<void> { this.lingWrites++; this.aliases.push(...a); }
  async getPack(packId: string) { return this.packs.find((p) => p.packId === packId); }
  async putPack(p: LanguagePackInfo): Promise<void> { this.lingWrites++; this.packs.push(p); }
  async listPacks() { return this.packs; }

  async listTombstones(learnerId: string): Promise<Tombstone[]> { return this.tombstones.filter((t) => t.learnerId === learnerId); }
  async putTombstone(t: Tombstone): Promise<void> { this.tombstones.push(t); }
  async listEnrolments(learnerId: string): Promise<Enrolment[]> { return this.enrolments.filter((e) => e.learnerId === learnerId); }
}
