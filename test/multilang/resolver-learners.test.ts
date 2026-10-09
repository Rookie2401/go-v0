// @vitest-environment node
/**
 * Multi-language extensibility, part 2: the Repository. The linguistics resolver reads Spanish through the same code as
 * Albanian (an adapter registry keyed by languageId, one unit-id derivation), and two learners (or one learner with two
 * enrolments) on the same store never collide: every unit id carries its language, knowledge rows, candidates and
 * invalidations are per language.
 */
import { describe, expect, it } from 'vitest';
import { CONTRACT_VERSION, validateEvent, type Enrolment, type GoEvent, type UnitKnowledge } from '../../packages/repository-contract/src';
import { createProjectionEngine } from '../../packages/repository-engine/src';
import { createLinguisticService, resolveSelection } from '../../packages/repository-linguistics/src';
import { createMemoryStore } from '../../packages/repository-store/src';
import { esAdapter } from '../../src/adapters/es';
import { sqAdapter } from '../../src/adapters/sq';

const NOW = '2026-10-09T09:00:00.000Z';
const ES_SENTENCE = 'Los niños leen los libros.';
const SQ_SENTENCE = 'Fëmijët lexojnë librin.';

describe('resolveSelection through the adapter registry', () => {
  it('resolves "libros" in a Spanish sentence to lemma:es:libro:NOUN with Number=Plur and a morph:es:NOUN construction', () => {
    const r = resolveSelection({ languageId: 'es', surface: 'libros', sentence: ES_SENTENCE, now: NOW });
    expect(r.formId).toBe('form:es:libros');
    const a = r.analysis;
    expect(a).toMatchObject({ languageId: 'es', formId: 'form:es:libros', packId: 'pack:es', packVersion: String(esAdapter.version), analyzerId: `adapter-es@${esAdapter.version}` });
    const chosen = a.candidates[a.chosen!];
    expect(chosen.lexemeId).toBe('lemma:es:libro:NOUN');
    expect(chosen.features).toMatchObject({ Number: 'Plur', Gender: 'Masc' });
    const cid = chosen.constructionIds![0];
    expect(cid).toMatch(/^morph:es:NOUN:/);
    expect(cid).toContain('Number=Plur');
    const unit = r.units.find((u) => u.unitId === cid)!;
    expect(unit).toMatchObject({ kind: 'morph-construction', languageId: 'es', pos: 'NOUN', packId: 'pack:es' });
    expect(unit.label).toMatch(/plural/);
    // the lexeme and the sense carry the language, the form is related to the lexeme, and the status rule is the same one
    expect(r.units.find((u) => u.unitId === 'lemma:es:libro:NOUN')).toMatchObject({ kind: 'lexeme', languageId: 'es', label: 'libro' });
    expect(r.relations.some((x) => x.fromId === 'form:es:libros' && x.relation === 'form-of' && x.toId === 'lemma:es:libro:NOUN')).toBe(true);
    expect(r.relations.some((x) => x.relation === 'realizes' && x.toId === cid)).toBe(true);
    expect(a.status).toBe('high-confidence');
    expect(r.coverage.known).toBe(true);
  });

  it('every unit and relation of a Spanish resolution is Spanish: no sq id, no sq pack, no Albanian varieties', () => {
    const r = resolveSelection({ languageId: 'es', surface: 'libros', sentence: ES_SENTENCE, now: NOW });
    for (const u of r.units) {
      expect(u.languageId, u.unitId).toBe('es');
      expect(u.packId, u.unitId).toBe('pack:es');
      expect(u.unitId, u.unitId).toMatch(/^(form|lemma|sense|morph|phrase|pron):es:/);
      expect(u.varietyId === undefined || u.varietyId.startsWith('es'), u.unitId).toBe(true);
    }
    for (const rel of r.relations) { expect(rel.fromId).toMatch(/:es:/); expect(rel.toId).toMatch(/:es:/); }
    expect(JSON.stringify(r)).not.toMatch(/:sq:|pack:sq|sq-standard/);
  });

  it('"librin" still resolves as before in Albanian (same ids, same pack, same status) and "libros" is not an Albanian word', () => {
    const r = resolveSelection({ languageId: 'sq', surface: 'librin', sentence: SQ_SENTENCE, now: NOW });
    expect(r.formId).toBe('form:sq:librin');
    expect(r.analysis).toMatchObject({ languageId: 'sq', packId: 'pack:sq', analyzerId: `adapter-sq@${sqAdapter.version}` });
    const chosen = r.analysis.candidates[r.analysis.chosen!];
    expect(chosen.lexemeId).toBe('lemma:sq:libër:NOUN');
    expect(chosen.features).toMatchObject({ Case: 'Acc', Definite: 'Def', Number: 'Sing', Gender: 'Masc' });
    expect(chosen.constructionIds![0]).toBe('morph:sq:NOUN:Case=Acc|Definite=Def|Gender=Masc|Number=Sing');
    expect(r.analysis.status).toBe('provisional');
    expect(JSON.stringify(r)).not.toMatch(/:es:|pack:es/);
  });

  it('the same surface in two languages gives two disjoint sets of units (no shared id)', () => {
    const es = resolveSelection({ languageId: 'es', surface: 'casa', sentence: 'La casa es grande.', now: NOW });
    const sq = resolveSelection({ languageId: 'sq', surface: 'casa', sentence: 'Ana ka një casa.', now: NOW });
    const ids = (r: typeof es) => new Set([...r.units.map((u) => u.unitId), r.formId, r.analysis.analysisId]);
    const a = ids(es);
    const b = ids(sq);
    expect([...a].filter((x) => b.has(x))).toEqual([]);
    expect(es.formId).toBe('form:es:casa');
    expect(sq.formId).toBe('form:sq:casa');
  });

  it('a Spanish multi-word selection and a Spanish word read alone are handled by the same paths', () => {
    const alone = resolveSelection({ languageId: 'es', surface: 'casa', now: NOW });
    expect(alone.coverage.notes.join(' ')).toMatch(/No sentence context/);
    expect(alone.analysis.sentenceKey).toBeUndefined();
    expect(alone.units.some((u) => u.unitId === 'lemma:es:casa:NOUN')).toBe(true);
    const phrase = resolveSelection({ languageId: 'es', surface: 'por favor', sentence: 'Dámelo, por favor.', now: NOW });
    expect(phrase.units.some((u) => u.kind === 'multiword' && u.unitId.startsWith('phrase:es:'))).toBe(true);
  });

  it('an unknown Spanish word keeps a single provisional form unit and says it is unknown to this pack; a language with no adapter still gets the generic form', () => {
    const r = resolveSelection({ languageId: 'es', surface: 'Xyzqwk', sentence: 'Xyzqwk es aquí.', now: NOW });
    expect(r.coverage.known).toBe(false);
    expect(r.coverage.notes.join(' ')).toMatch(/Spanish word list/);
    expect(r.units.every((u) => u.status === 'provisional')).toBe(true);
    const de = resolveSelection({ languageId: 'de', surface: 'Haus', now: NOW });
    expect(de.units).toHaveLength(1);
    expect(de.units[0]).toMatchObject({ unitId: 'form:de:haus', packId: 'pack:de:generic' });
    expect(resolveSelection({ languageId: 'es', surface: '123', now: NOW }).coverage.notes[0]).toMatch(/no Latin letters: the Spanish word list/);
    // inherited keys are not languages
    expect(resolveSelection({ languageId: 'constructor', surface: 'x', now: NOW }).units[0].packId).toBe('pack:constructor:generic');
  });
});

// ───────────────────────────── two languages on one memory store ─────────────────────────────

let n = 0;
function ev(learnerId: string, enrolmentId: string, languageId: string, kind: GoEvent['kind'], itemIds: string[], payload: Record<string, unknown>, minute: number, extra: Partial<GoEvent> = {}): GoEvent {
  n++;
  const e: GoEvent = {
    id: `ml-${String(n).padStart(4, '0')}`, v: CONTRACT_VERSION, learnerId, enrolmentId, languageId, at: `2026-10-08T10:${String(minute).padStart(2, '0')}:00.000Z`,
    producer: { app: 'golearn-app', version: '1', deviceId: `dev-${learnerId}` }, kind, subject: { itemIds }, payload, ...extra,
  };
  expect(validateEvent(e), e.id).toEqual([]);
  return e;
}
const lookup = (l: string, en: string, lang: string, ids: string[], minute: number) =>
  ev(l, en, lang, 'SelectionLookedUp', ids, { tokenCount: 1, contextKind: 'sentence', contextConfidence: 1, readerId: 'r', helpShown: ['gloss'] }, minute);
const missed = (l: string, en: string, lang: string, ids: string[], minute: number) =>
  ev(l, en, lang, 'CardReviewed', ids, { cardKind: 'recall', grade: 'again', correct: false, hinted: false }, minute);

const enrolment = (learnerId: string, enrolmentId: string, languageId: string, packVersion: string): Enrolment =>
  ({ enrolmentId, learnerId, languageId, packId: `pack:${languageId}`, packVersion, goals: [{ kind: 'reading' }], startedAt: '2026-10-01T00:00:00.000Z' });

async function world() {
  const store = createMemoryStore({ now: () => NOW });
  const svc = createLinguisticService(store, { now: () => NOW });
  const engine = createProjectionEngine({ store, now: () => NOW });
  // the same linguistic service resolves and stores both languages
  const sq = await svc.resolveAndStore({ languageId: 'sq', surface: 'librin', sentence: SQ_SENTENCE });
  const es = await svc.resolveAndStore({ languageId: 'es', surface: 'libros', sentence: ES_SENTENCE });
  const esCase = await svc.resolveAndStore({ languageId: 'es', surface: 'casa', sentence: 'La casa es grande.' });
  return { store, svc, engine, sq, es, esCase };
}

describe('two learners on one memory store: one in Albanian, one in Spanish', () => {
  it('knowledge rows are keyed by language-specific unit ids and never collide; candidates stay in their language', async () => {
    const { store, engine } = await world();
    await store.putEnrolment(enrolment('ana', 'en-ana-sq', 'sq', '9'));
    await store.putEnrolment(enrolment('ben', 'en-ben-es', 'es', '12'));
    const SQ = ['form:sq:librin', 'lemma:sq:libër:NOUN'];
    const ES = ['form:es:libros', 'lemma:es:libro:NOUN'];
    await store.append('ana', [lookup('ana', 'en-ana-sq', 'sq', SQ, 1), missed('ana', 'en-ana-sq', 'sq', SQ, 2)]);
    await store.append('ben', [lookup('ben', 'en-ben-es', 'es', ES, 1), missed('ben', 'en-ben-es', 'es', ES, 2)]);
    await engine.project('ana');
    await engine.project('ben');
    const a = await engine.knowledge('ana');
    const b = await engine.knowledge('ben');
    expect(a.map((r) => r.unitId).sort()).toEqual([...SQ].sort());
    expect(b.map((r) => r.unitId).sort()).toEqual([...ES].sort());
    expect(a.every((r) => r.languageId === 'sq' && r.unitId.includes(':sq:'))).toBe(true);
    expect(b.every((r) => r.languageId === 'es' && r.unitId.includes(':es:'))).toBe(true);
    expect(a.map((r) => r.unitId).filter((id) => b.some((r) => r.unitId === id))).toEqual([]);
    // each learner can only read their own rows, by id, and the other language's id answers nothing
    expect(await engine.knowledge('ana', ES)).toEqual([]);
    expect(await engine.knowledge('ben', SQ)).toEqual([]);

    const ca = await engine.candidates('ana', 'en-ana-sq');
    const cb = await engine.candidates('ben', 'en-ben-es');
    expect(cb.length).toBeGreaterThan(0);
    expect(ca.length).toBeGreaterThan(0);
    expect(cb.every((c) => /:es:/.test(c.unitId) && !/:sq:/.test(c.unitId))).toBe(true);
    expect(ca.every((c) => /:sq:/.test(c.unitId) && !/:es:/.test(c.unitId))).toBe(true);
  });

  it('one learner enrolled in both languages: the two enrolments keep separate rows and separate candidates', async () => {
    const { store, engine } = await world();
    await store.putEnrolment(enrolment('cy', 'en-cy-sq', 'sq', '9'));
    await store.putEnrolment(enrolment('cy', 'en-cy-es', 'es', '12'));
    const SQ = ['form:sq:librin', 'lemma:sq:libër:NOUN'];
    const ES = ['form:es:libros', 'lemma:es:libro:NOUN'];
    await store.append('cy', [
      lookup('cy', 'en-cy-sq', 'sq', SQ, 1), missed('cy', 'en-cy-sq', 'sq', SQ, 2),
      lookup('cy', 'en-cy-es', 'es', ES, 3), missed('cy', 'en-cy-es', 'es', ES, 4),
    ]);
    await engine.project('cy');
    const rows: UnitKnowledge[] = await engine.knowledge('cy');
    expect(new Set(rows.map((r) => r.unitId)).size).toBe(rows.length); // no id appears twice
    expect(rows.filter((r) => r.languageId === 'sq').map((r) => r.unitId).sort()).toEqual([...SQ].sort());
    expect(rows.filter((r) => r.languageId === 'es').map((r) => r.unitId).sort()).toEqual([...ES].sort());
    // exposure and recall counted per language: the same evidence gives the same figure in each, nothing summed across
    for (const id of [SQ[1], ES[1]]) {
      const r = rows.find((x) => x.unitId === id)!;
      expect(r.dimensions.exposure.observations).toBeGreaterThan(0);
      expect(r.dimensions.productiveRetrieval.negative).toBeGreaterThan(0);
    }
    const figure = (id: string) => rows.find((x) => x.unitId === id)!.dimensions.productiveRetrieval.negative;
    expect(figure(SQ[1])).toBe(figure(ES[1]));
    const es = await engine.candidates('cy', 'en-cy-es');
    const sq = await engine.candidates('cy', 'en-cy-sq');
    expect(es.length).toBeGreaterThan(0);
    expect(es.every((c) => /:es:/.test(c.unitId))).toBe(true);
    expect(sq.every((c) => /:sq:/.test(c.unitId))).toBe(true);
    // rebuilding from the log gives the same rows: the per-language separation is in the log, not an accident of the projection
    expect(JSON.stringify((await engine.rebuild('cy')).map((r) => r.unitId).sort())).toBe(JSON.stringify(rows.map((r) => r.unitId).sort()));
  });

  it('a correction in Spanish invalidates only Spanish analyses; the Albanian analysis of the same store is untouched', async () => {
    const { store, svc, sq, es } = await world();
    await svc.invalidate(es.analysis.analysisId, 'wrong reading');
    expect((await store.getAnalysis(es.analysis.analysisId))!.status).toBe('invalidated');
    expect((await store.getAnalysis(sq.analysis.analysisId))!.status).toBe(sq.analysis.status);
    expect((await store.getUnits(['lemma:sq:libër:NOUN']))[0].status).not.toBe('invalidated');
  });

  it('the store holds both languages’ units under their own ids, found by language', async () => {
    const { store } = await world();
    const esUnits = await store.findUnits({ languageId: 'es', limit: 100 });
    const sqUnits = await store.findUnits({ languageId: 'sq', limit: 100 });
    expect(esUnits.length).toBeGreaterThan(3);
    expect(sqUnits.length).toBeGreaterThan(3);
    expect(esUnits.every((u) => u.unitId.includes(':es:') && u.packId === 'pack:es')).toBe(true);
    expect(sqUnits.every((u) => u.unitId.includes(':sq:') && u.packId === 'pack:sq')).toBe(true);
    expect(new Set([...esUnits, ...sqUnits].map((u) => u.unitId)).size).toBe(esUnits.length + sqUnits.length);
  });
});
