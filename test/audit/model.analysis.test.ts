// @vitest-environment node
/**
 * AUDIT §17 (continued) — corrections, invalidation, aliases and what the review pipeline does with a wrong analysis.
 * Real pieces: linguistics service over the store, the projection engine's candidates, GoReview's facts provider,
 * `gatherCandidates` / `decideIntake`, the FSRS deck fold.
 *
 * Defects found were first written as `it.fails(...)` (the assertion states the CORRECT behaviour). D1 to D5 are FIXED and
 * their tests are plain `it` now ("DEFECT Dn (fixed)"): they are the regression tests of the fix.
 */
import { describe, expect, it } from 'vitest';
import { sqAdapter } from '../../src/adapters/sq';
import { albanianManifest } from '../../packages/language-packs/src';
import { affectedByInvalidation } from '../../packages/repository-engine/src';
import { validateEvent } from '../../packages/repository-contract/src';
import type { ReviewCandidate } from '../../packages/repository-contract/src';
import { createFactsProvider } from '../../packages/goreview/src/facts';
import { buildCardAdded, createFsrsScheduler, foldDeck, itemIdFor } from '../../packages/goreview/src/scheduler';
import { buildExercise } from '../../packages/goreview/src/exercises';
import { decideIntake, gatherCandidates } from '../../packages/goreview/src/intake';
import type { IntakeInput, ReviewPreferences } from '../../packages/goreview/src/types';
import {
  append, changed, ENROL, ev, flushRowsAfterAll, grammar, LEARNER, LEM, makeWorld, normal, note, recognition, resolve, rowsOf, CONSTR, FORM, SENT_SHKOLLE, iso, BASE_MS, DAY,
} from './model.support';
import type { World } from './model.support';

flushRowsAfterAll('model.analysis');

const NOW = '2026-10-09T12:00:00.000Z';
const PREFS: ReviewPreferences = { languageId: 'sq', sessionMinutes: 10, maxNew: 3, desiredRetention: 0.9, includeListening: true, grammarShare: 0.3, prioritizeSaved: true };
const AUDIO = { available: true, eligibleForEvidence: false, reason: 'synthetic' };

function factsProviderOf(w: World) {
  return createFactsProvider({
    unit: async (id) => { const l = await w.linguistics.lookup(id); return l.unit ? { unit: l.unit, relations: [...l.relations.out, ...l.relations.in], analyses: l.analyses } : undefined; },
    pack: { manifest: albanianManifest(), runtime: { gloss: async () => undefined } },
    adapter: sqAdapter,
    now: () => NOW,
  });
}

/** Learner struggled with `unitId`: two lookups and a failed card, so the engine proposes it. */
async function struggle(w: World, unitId: string, kind: 'recognition' | 'grammar' = 'recognition', constructionId?: string) {
  const lookup = () => ev('SelectionLookedUp', [unitId], { tokenCount: 1, contextKind: 'sentence', contextConfidence: 1, readerId: 'r', helpShown: ['gloss'] }, { app: 'golearn-app' });
  await append(w, lookup(), lookup(), kind === 'recognition' ? recognition([unitId], false) : grammar([unitId], constructionId ?? unitId, false));
}

const candidateOf = async (w: World, unitId: string): Promise<ReviewCandidate> => {
  const c = (await w.engine.candidates(LEARNER, ENROL, { now: NOW })).find((x) => x.unitId === unitId);
  if (!c) throw new Error(`${unitId} is not a candidate`);
  return c;
};

const intakeFor = (candidate: ReviewCandidate, over: Partial<IntakeInput> = {}): IntakeInput =>
  ({ candidate, existing: [], audio: AUDIO, saved: new Set(), preferences: PREFS, now: NOW, ...over });

// ═════════════════════════════ A. a reviewer correction ═════════════════════════════

describe.each(['memory', 'sqlite'] as const)('§17 a reviewer correction on the %s store', (kind) => {
  const CORRECTED_AT = '2026-10-09T09:00:00.000Z';
  const correction = { lexemeId: 'lemma:sq:jam:VERB', features: { Mood: 'Ind', Tense: 'Pres' }, by: 'reviewer' as const, reason: 'the verb is meant here' };

  it('invalidates the old analysis, supersedes it with a verified one, and keeps the old row (history)', async () => {
    const w = await makeWorld(kind);
    const r = await resolve(w, 'jetë');
    expect(r.analysis.status).toBe('conflicted');
    expect(r.analysis.candidates.length).toBe(3);
    const out = await w.linguistics.correct(r.formId, correction, CORRECTED_AT);

    const old = (await w.store.getAnalysis(r.analysis.analysisId))!;
    expect(old.status).toBe('invalidated');
    expect(old.supersededBy).toBe(out.analysis.analysisId);
    expect(old.reason).toMatch(/Corrected by reviewer: the verb is meant here/);
    expect(old.candidates).toEqual(r.analysis.candidates); // the row remains as it was: nothing is deleted or rewritten
    expect(out.analysis.status).toBe('verified');
    expect(out.analysis.chosen).toBe(0);
    expect(out.analysis.candidates[0]!.provenance).toMatchObject({ source: 'reviewer', validatedBy: 'reviewer', validatedAt: CORRECTED_AT });
    expect(out.invalidated.map((a) => a.analysisId)).toEqual([r.analysis.analysisId]);
    const live = (await w.store.analysesOfForm(r.formId)).filter((a) => a.status !== 'invalidated');
    expect(live.map((a) => a.analysisId)).toEqual([out.analysis.analysisId]);
    note(`A1-${kind}`, '§17', `reviewer correct() on the conflicted form jetë (${kind} store)`, 'old analysis invalidated + supersededBy new; new analysis verified, chosen; old row intact', `old ${old.status} → ${old.supersededBy?.slice(-34)}; new ${out.analysis.status}; live analyses ${live.length}`);
  });

  it('affectedByInvalidation names every lexeme, sense and construction the invalidated analysis pointed at (the review items to re-check)', async () => {
    const w = await makeWorld(kind);
    const r = await resolve(w, 'jetë');
    await w.linguistics.correct(r.formId, correction, CORRECTED_AT);
    const old = (await w.store.getAnalysis(r.analysis.analysisId))!;
    const named = affectedByInvalidation(old);
    const expected = [...new Set(r.analysis.candidates.flatMap((c) => [c.lexemeId, c.senseId, ...(c.constructionIds ?? [])].filter((x): x is string => !!x)))].sort();
    expect(named).toEqual(expected);
    expect(named).toEqual(expect.arrayContaining(['lemma:sq:jetë:NOUN', 'lemma:sq:jam:VERB']));
    expect(named.filter((i) => i.startsWith('morph:')).length).toBe(3);
    note(`A2-${kind}`, '§17', `affectedByInvalidation(old analysis of jetë) (${kind})`, 'all lexemes, senses and constructions of all 3 readings (7 ids)', `${named.length} ids: ${named.join(' ; ')}`);
    expect(named.length).toBe(7);
  });

  it('the learner\'s history is not rewritten by a correction: the knowledge rows are identical before and after', async () => {
    const w = await makeWorld(kind);
    const r = await resolve(w, 'jetë');
    await struggle(w, 'lemma:sq:jetë:NOUN');
    const before = await rowsOf(w);
    await w.linguistics.correct(r.formId, correction, CORRECTED_AT);
    await w.engine.project(LEARNER);
    const after = await rowsOf(w);
    expect(changed(before, after)).toEqual([]);
    expect(normal(await w.engine.rebuild(LEARNER))).toBe(normal(after.values()));
  });
});

describe('§17 the invalidation helpers agree on which units are affected', () => {
  it('DEFECT D3 (fixed): linguistics.invalidate() and affectedByInvalidation() name the same units (the service omits senses)', async () => {
    const w = await makeWorld('memory');
    const r = await resolve(w, 'nëna');
    const engineNames = affectedByInvalidation(r.analysis);
    const serviceNames = (await w.linguistics.invalidate(r.analysis.analysisId, 'wrong parse')).affectedUnitIds.sort();
    note('D3', '§17', 'service.invalidate().affectedUnitIds vs engine affectedByInvalidation()', 'identical lists', `service ${serviceNames.length} ids; engine ${engineNames.length} ids (both include sense ids)`);
    expect(serviceNames).toEqual(engineNames);
  });
});

describe('§17 a corrected analysis does not unlock a form that was conflicted', () => {
  it('DEFECT D4 (fixed): after a reviewer-verified correction the form is eligible for review again', async () => {
    const w = await makeWorld('memory');
    const r = await resolve(w, 'jetë');
    await struggle(w, r.formId);
    expect((await candidateOf(w, r.formId)).eligibility).toMatchObject({ eligible: false, status: 'conflicted' });
    await w.linguistics.correct(r.formId, { lexemeId: 'lemma:sq:jam:VERB', features: { Mood: 'Ind', Tense: 'Pres' }, by: 'reviewer' }, '2026-10-09T09:00:00.000Z');
    const live = (await w.store.analysesOfForm(r.formId)).filter((a) => a.status !== 'invalidated');
    expect(live.map((a) => a.status)).toEqual(['verified']);
    const after = await candidateOf(w, r.formId);
    note('D4', '§17', 'form eligibility after a reviewer-verified correction', 'eligible (the only live analysis is verified)', `eligible=${after.eligibility.eligible}, status=${after.eligibility.status}; form unit row now '${(await w.store.getUnits([r.formId]))[0]!.status}'`);
    expect(after.eligibility.eligible).toBe(true);
  });
});

// ═════════════════════════════ B. a wrong parse cannot become an exercise ═════════════════════════════

describe('§17 intake refuses a candidate whose analysis is conflicted, invalidated or provisional-for-grammar', () => {
  it('conflicted form (jetë, two lemmas within 0.15): needs-validation', async () => {
    const w = await makeWorld('memory');
    const r = await resolve(w, 'jetë');
    await struggle(w, r.formId);
    const c = await candidateOf(w, r.formId);
    expect(c.eligibility).toMatchObject({ eligible: false, status: 'conflicted' });
    const out = decideIntake(intakeFor(c));
    expect(out.decision).toBe('needs-validation');
    expect(out.proposed).toBeUndefined(); // nothing is proposed to add to the deck
    note('B1', '§17', 'intake on a conflicted form', 'needs-validation, no proposed exercise', `${out.decision}: ${out.reasons.join(' | ')}`);
  });

  it('invalidated analysis (reviewer withdrew the only parse): needs-validation', async () => {
    const w = await makeWorld('memory');
    const r = await resolve(w, 'shkollë', SENT_SHKOLLE);
    await struggle(w, FORM);
    expect((await candidateOf(w, FORM)).eligibility.eligible).toBe(true); // before: a high-confidence reading may be asked
    const inv = await w.linguistics.invalidate(r.analysis.analysisId, 'the parse is wrong');
    expect(inv.affectedUnitIds).toContain(LEM);
    const c = await candidateOf(w, FORM);
    expect(c.eligibility).toMatchObject({ eligible: false, status: 'invalidated' });
    const out = decideIntake(intakeFor(c));
    expect(out.decision).toBe('needs-validation');
    note('B2', '§17', 'intake after the only analysis of a form was invalidated', 'eligibility false/invalidated; needs-validation', `${out.decision}: ${out.reasons.join(' | ')}`);
  });

  it('the builder is the backstop: with the only analysis invalidated, no authoritative exercise can be built from the real facts', async () => {
    const w = await makeWorld('memory');
    const r = await resolve(w, 'shkollë', SENT_SHKOLLE);
    await struggle(w, FORM);
    const facts = factsProviderOf(w);
    const target = { unitId: FORM, unitKind: 'form', languageId: 'sq', dimension: 'written-recognition' as const };
    const ctx = { now: NOW, random: () => 0.5 };
    const before = await buildExercise('written-recognition', target, (await facts.factsFor(FORM, 'sq'))!, ctx);
    expect('unavailable' in before).toBe(false); // sanity: a high-confidence form with a gloss is buildable
    await w.linguistics.invalidate(r.analysis.analysisId, 'the parse is wrong');
    const after = await buildExercise('written-recognition', target, (await facts.factsFor(FORM, 'sq'))!, ctx);
    expect('unavailable' in after && after.unavailable).toBe(true);
    expect('unavailable' in after ? after.reason : '').toMatch(/invalidated/);
    for (const family of ['meaning-to-form', 'morphological-identification', 'sentence-completion'] as const) {
      const t = { ...target, dimension: family === 'meaning-to-form' ? 'meaning-to-target-retrieval' as const : family === 'morphological-identification' ? 'morphological-analysis' as const : 'productive-recall' as const };
      const x = await buildExercise(family, t, (await facts.factsFor(FORM, 'sq'))!, ctx);
      expect('unavailable' in x && x.unavailable, family).toBe(true);
    }
    note('B3', '§17', 'exercise build for a form whose only analysis was invalidated (real facts provider)', 'every family unavailable: "every analysis of this form is invalidated"', 'written-recognition, meaning-to-form, morphological-identification, sentence-completion all unavailable: ' + ('unavailable' in after ? after.reason : ''));
  });

  it('intake rule 2 works when the pack facts themselves say conflicted: too-uncertain, nothing proposed (real facts provider on a conflicted unit)', async () => {
    const w = await makeWorld('memory');
    const r = await resolve(w, 'jetë');
    const f = (await factsProviderOf(w).factsFor(r.formId, 'sq'))!;
    expect(f.status).toBe('conflicted');
    const eligible: ReviewCandidate = { unitId: r.formId, kind: 'form', score: 0.8, reasons: [{ rule: 'demonstratedError', weight: 0.25 }], targetDimension: 'readingRecognition', eligibility: { eligible: true, status: 'verified', caveats: [] }, cost: 0.2 };
    const out = decideIntake(intakeFor(eligible, { facts: f }));
    expect(out.decision).toBe('too-uncertain');
    expect(out.proposed).toBeUndefined();
    note('B6', '§17', 'intake rule 2 with facts.status conflicted (candidate wrongly eligible)', 'too-uncertain, nothing proposed', `${out.decision}: ${out.reasons.join(' | ')}`);
  });

  it('DEFECT D5 (fixed): intake rule 2 ("the pack facts say invalidated → too-uncertain") fires when a candidate computed before the invalidation reaches intake', async () => {
    const w = await makeWorld('memory');
    const r = await resolve(w, 'shkollë', SENT_SHKOLLE);
    await struggle(w, FORM);
    const stale = await w.engine.candidates(LEARNER, ENROL, { now: NOW });
    expect(stale.find((c) => c.unitId === FORM)!.eligibility.eligible).toBe(true);
    await w.linguistics.invalidate(r.analysis.analysisId, 'the parse is wrong'); // a reviewer works while the session is being planned
    const facts = factsProviderOf(w);
    const f = (await facts.factsFor(FORM, 'sq'))!;
    const outcomes = await gatherCandidates({
      api: { candidates: async () => stale, knowledge: async (ids) => w.engine.knowledge(LEARNER, ids) },
      facts, audio: async () => AUDIO, deck: [], saved: new Set(), preferences: PREFS, now: NOW, enrolmentId: ENROL,
    });
    const mine = outcomes.find((o) => o.unitId === FORM)!;
    note('D5', '§17', 'stale eligible candidate + invalidated analysis through gatherCandidates', 'too-uncertain / needs-validation, nothing proposed', `${mine.decision}, proposed ${mine.proposed?.family}; facts.status=${f.status} but facts.analyses=[${f.analyses.map((a) => a.status)}]`);
    expect(mine.proposed).toBeUndefined();
    expect(['too-uncertain', 'needs-validation']).toContain(mine.decision);
  });

  it('a provisional rule-derived construction cannot become a grammar exercise; a recognition of its form may, with a caveat', async () => {
    const w = await makeWorld('memory');
    const r = await resolve(w, 'librin', 'Fëmijët lexojnë librin.');
    const cons = r.analysis.candidates[0]!.constructionIds![0]!;
    expect(r.analysis.status).toBe('provisional');
    await struggle(w, cons, 'grammar');
    const g = await candidateOf(w, cons);
    expect(g.targetDimension).toBe('grammaticalUnderstanding');
    const refused = decideIntake(intakeFor(g));
    expect(refused.decision).toBe('needs-validation');

    await struggle(w, r.formId);
    const rec = await candidateOf(w, r.formId);
    expect(rec.targetDimension).toBe('readingRecognition');
    const allowed = decideIntake(intakeFor(rec));
    expect(['test-now', 'test-later']).toContain(allowed.decision);
    expect(allowed.reasons.join(' ')).toMatch(/provisional/);
    note('B4', '§17', 'provisional (rule-derived) analysis: grammar vs recognition target', 'grammar target refused (needs-validation); recognition target allowed with a provisional caveat', `grammar → ${refused.decision}; recognition → ${allowed.decision} (${allowed.reasons.find((x) => /caveat/.test(x))?.slice(0, 70)}…)`);
  });

  it('control: a high-confidence analysis IS allowed through, so the refusals above are about status and not a blanket refusal', async () => {
    const w = await makeWorld('memory');
    await resolve(w, 'shkollë', SENT_SHKOLLE);
    await struggle(w, CONSTR, 'grammar');
    await struggle(w, CONSTR, 'grammar');
    const c = await candidateOf(w, CONSTR);
    expect(c.eligibility.eligible).toBe(true);
    const out = decideIntake(intakeFor(c));
    expect(['test-now', 'test-later']).toContain(out.decision);
    expect(out.proposed?.family).toBe('grammar-application');
    note('B5', '§17', 'control: high-confidence construction with repeated grammar failures', 'test-now/test-later as grammar-application', `${out.decision} as ${out.proposed?.family}; score ${c.score}`);
  });

  it('an invalidated unit that is already in the deck is not proposed twice, and an explicit dismissal is not re-proposed', () => {
    const cand: ReviewCandidate = { unitId: FORM, kind: 'form', score: 0.8, reasons: [{ rule: 'demonstratedError', weight: 0.25 }], targetDimension: 'readingRecognition', eligibility: { eligible: true, status: 'high-confidence', caveats: [] }, cost: 0.2 };
    const mk = (status: 'active' | 'dismissed'): IntakeInput['existing'][number] => ({
      itemId: itemIdFor(FORM, 'written-recognition'), unitId: FORM, unitKind: 'form', languageId: 'sq', dimension: 'written-recognition', family: 'written-recognition',
      addedAt: NOW, addedBy: 'intake', reasons: [], status, history: [],
      schedule: createFsrsScheduler().newState(NOW),
    });
    expect(decideIntake(intakeFor(cand, { existing: [mk('active')] })).decision).toBe('already-covered');
    expect(decideIntake(intakeFor(cand, { existing: [mk('dismissed')] })).decision).toBe('low-priority');
  });
});

// ═════════════════════════════ C. ReviewItemInvalidated ═════════════════════════════

describe('§17 ReviewItemInvalidated: what it does and what it does not', () => {
  const invalidatedEvent = (itemId: string, unitId: string, at: string) => ev('ReviewItemInvalidated', [unitId], { reason: 'analysis-invalidated', cardId: itemId }, { cardId: itemId, at, evidence: { quality: 'none' } });

  it('is a valid contract event of the shape GoReview\'s runner writes, and it is not evidence about the learner', async () => {
    const w = await makeWorld('memory');
    await resolve(w, 'shkollë', SENT_SHKOLLE);
    await append(w, recognition([LEM], false));
    const before = await rowsOf(w);
    const e = invalidatedEvent(itemIdFor(LEM, 'written-recognition'), LEM, iso(BASE_MS + DAY));
    expect(validateEvent(e)).toEqual([]);
    await append(w, e);
    expect(changed(before, await rowsOf(w))).toEqual([]);
    note('C1', '§17', 'ReviewItemInvalidated as evidence', 'valid event; no knowledge dimension moves', 'valid; 0 dimensions moved');
  });

  it('engine: the card stops counting as "covered", so the unit is a candidate again (existingCoverage reason disappears)', async () => {
    const w = await makeWorld('memory');
    await resolve(w, 'shkollë', SENT_SHKOLLE);
    await struggle(w, LEM);
    const itemId = itemIdFor(LEM, 'written-recognition');
    await append(w, ev('CardAdded', [LEM], { unitId: LEM }, { cardId: itemId, at: iso(BASE_MS + 10 * DAY) }));
    const covered = await candidateOf(w, LEM);
    expect(covered.reasons.map((r) => r.rule)).toContain('existingCoverage');
    await append(w, invalidatedEvent(itemId, LEM, iso(BASE_MS + 11 * DAY)));
    const afterInv = await candidateOf(w, LEM);
    expect(afterInv.reasons.map((r) => r.rule)).not.toContain('existingCoverage');
    expect(afterInv.score).toBeGreaterThan(covered.score);
    note('C2', '§17', 'engine candidates after CardAdded → ReviewItemInvalidated', 'existingCoverage (-0.3) present while the card stands, absent after the invalidation', `score ${covered.score} → ${afterInv.score}`);
  });

  it('DEFECT D1 (fixed): GoReview\'s deck fold withdraws an item when its key was reported wrong (ReviewItemInvalidated)', () => {
    const sched = createFsrsScheduler();
    const itemId = itemIdFor(LEM, 'written-recognition');
    const added = buildCardAdded({ learnerId: LEARNER, enrolmentId: ENROL, languageId: 'sq', at: iso(BASE_MS), deviceId: 'dev-A', unitId: LEM, unitKind: 'lexeme', dimension: 'written-recognition', family: 'written-recognition', addedBy: 'intake' });
    const inv = invalidatedEvent(itemId, LEM, iso(BASE_MS + DAY));
    const fold = foldDeck([added, inv], sched, { now: iso(BASE_MS + 2 * DAY) });
    const item = fold.items.find((i) => i.itemId === itemId)!;
    note('D1', '§17', 'deck fold after ReviewItemInvalidated { analysis-invalidated, cardId }', 'item is no longer active (withdrawn) or at least reported in `ignored`', `status=${item.status}; ignored=${JSON.stringify(fold.ignored)}; unscored=${JSON.stringify(fold.unscored)}; suspendedReason=${item.suspendedReason}`);
    expect(item.suspendedReason).toBe('analysis-invalidated');
    // the item is out of the plan too: nothing is built on the invalidated analysis
    expect(foldDeck([added, inv], sched, { now: iso(BASE_MS + 2 * DAY) }).ignored).toEqual([]);
    expect(item.status).not.toBe('active');
  });
});

// ═════════════════════════════ D. aliases ═════════════════════════════

describe('§17 aliases: certain re-targets evidence, uncertain leaves it where it is', () => {
  const OLD = 'lemma:sq:old:NOUN';
  const NEW = 'lemma:sq:new:NOUN';

  it('a CERTAIN alias (>= 0.9) moves the evidence to the new id on rebuild; an UNCERTAIN one (< 0.9) does not', async () => {
    const certain = await makeWorld('memory');
    await append(certain, recognition([OLD], false), recognition([OLD], true));
    const m1 = await certain.linguistics.migrate('8', '9', [{ oldId: OLD, newId: NEW, reason: 'lemma renamed', confidence: 0.95 }]);
    expect(m1.aliases[0]!.mapping).toBe('certain');
    await certain.engine.rebuild(LEARNER);
    const c = await rowsOf(certain);
    expect([...c.keys()]).toEqual([NEW]);
    expect(c.get(NEW)!.dimensions.readingRecognition.observations).toBe(2);
    expect((await certain.engine.knowledge(LEARNER, [OLD])).map((r) => r.unitId)).toEqual([NEW]); // asking by the old id finds the new row

    const uncertain = await makeWorld('memory');
    await append(uncertain, recognition([OLD], false), recognition([OLD], true));
    const m2 = await uncertain.linguistics.migrate('8', '9', [{ oldId: OLD, newId: NEW, reason: 'maybe the same word', confidence: 0.6 }]);
    expect(m2.aliases[0]!.mapping).toBe('uncertain');
    await uncertain.engine.rebuild(LEARNER);
    const u = await rowsOf(uncertain);
    expect([...u.keys()]).toEqual([OLD]); // evidence stays on the old id
    expect(u.has(NEW)).toBe(false);
    expect((await uncertain.engine.knowledge(LEARNER, [OLD])).map((r) => r.unitId)).toEqual([OLD]);
    note('A3', '§17', 'alias certain (0.95) vs uncertain (0.6), after rebuild', 'certain: rows keyed by the new id, 2 observations; uncertain: rows stay on the old id, new id has none', `certain → [${[...c.keys()]}] obs ${c.get(NEW)!.dimensions.readingRecognition.observations}; uncertain → [${[...u.keys()]}]`);
  });

  it('an alias chain old → mid → new (all certain) lands on the final id; a cycle terminates', async () => {
    const w = await makeWorld('memory');
    await append(w, recognition([OLD], true));
    await w.linguistics.migrate('7', '8', [{ oldId: OLD, newId: 'lemma:sq:mid:NOUN', reason: 'r1', confidence: 0.99 }]);
    await w.linguistics.migrate('8', '9', [{ oldId: 'lemma:sq:mid:NOUN', newId: NEW, reason: 'r2', confidence: 0.99 }]);
    await w.engine.rebuild(LEARNER);
    expect([...(await rowsOf(w)).keys()]).toEqual([NEW]);

    const cyc = await makeWorld('memory');
    await append(cyc, recognition(['lemma:sq:a:NOUN'], true));
    await cyc.linguistics.migrate('8', '9', [{ oldId: 'lemma:sq:a:NOUN', newId: 'lemma:sq:b:NOUN', reason: 'x', confidence: 0.99 }, { oldId: 'lemma:sq:b:NOUN', newId: 'lemma:sq:a:NOUN', reason: 'y', confidence: 0.99 }]);
    await expect(cyc.engine.rebuild(LEARNER)).resolves.toBeDefined();
    expect((await rowsOf(cyc)).size).toBe(1);
  });

  it('a retirement (no new id) creates no alias and leaves the evidence where it is', async () => {
    const w = await makeWorld('memory');
    await append(w, recognition([OLD], true));
    const m = await w.linguistics.migrate('8', '9', [{ oldId: OLD, reason: 'retired', confidence: 1 }]);
    expect(m.aliases).toEqual([]);
    expect(m.unmapped).toEqual([OLD]);
    await w.engine.rebuild(LEARNER);
    expect([...(await rowsOf(w)).keys()]).toEqual([OLD]);
  });

  it('DEFECT D2 (fixed): a certain alias added after evidence exists is visible to the incremental engine without a manual rebuild (live == rebuild)', async () => {
    const w = await makeWorld('memory');
    await append(w, recognition([OLD], false), recognition([OLD], false));
    await w.linguistics.migrate('8', '9', [{ oldId: OLD, newId: NEW, reason: 'renamed', confidence: 0.95 }]);
    const byOld = (await w.engine.knowledge(LEARNER, [OLD])).map((r) => r.unitId);
    await append(w, recognition([OLD], false)); // one more event arrives: the incremental path folds only what it sees as new
    const live = await w.engine.knowledge(LEARNER);
    const rebuilt = await w.engine.rebuild(LEARNER);
    note('D2', '§17', 'alias added after evidence, no rebuild', 'knowledge(old id) finds the learner\'s row; live rows == rebuilt rows', `knowledge([old]) → [${byOld}] (row exists under the old key but the read resolves to the new id); live rows ${live.length} [${live.map((r) => `${r.unitId}:${r.dimensions.readingRecognition.observations}`)}] vs rebuilt ${rebuilt.length} [${rebuilt.map((r) => `${r.unitId}:${r.dimensions.readingRecognition.observations}`)}]`);
    expect(byOld.length).toBe(1);
    expect(normal(live)).toBe(normal(rebuilt));
  });
});
