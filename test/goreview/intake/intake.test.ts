import { describe, expect, it } from 'vitest';
import { cardReasonFor, decideIntake, explainIntake, explainsReasons, proposeFor, rankComparativePriority } from '../../../packages/goreview/src/intake/intake';
import { gatherCandidates } from '../../../packages/goreview/src/intake/fetch';
import type { UnitKnowledge } from '../../../packages/repository-contract/src';
import type { UnitFacts } from '../../../packages/goreview/src/types';
import { audioNone, audioOk, audioPractice, candidate, deckItem, facts, intakeInput, knowledge, NOW, prefs } from './fixtures';

describe('decideIntake: eligibility', () => {
  it('not eligible → needs-validation with the eligibility reason', () => {
    const o = decideIntake(intakeInput({ candidate: candidate({ eligibility: { eligible: false, status: 'conflicted', reason: 'two analyses disagree' } }) }));
    expect(o.decision).toBe('needs-validation');
    expect(o.reasons.join(' ')).toContain('two analyses disagree');
    expect(o.proposed).toBeUndefined();
  });

  it('a provisional analysis is allowed for a recognition dimension, with a caveat', () => {
    const o = decideIntake(intakeInput({ candidate: candidate({ eligibility: { eligible: false, status: 'provisional', reason: 'unreviewed rule' } }) }));
    expect(o.decision).toBe('test-now');
    expect(o.reasons.some((r) => r.startsWith('caveat:'))).toBe(true);
  });

  it('a provisional analysis is NOT allowed for a non-recognition dimension', () => {
    const o = decideIntake(intakeInput({ candidate: candidate({ targetDimension: 'productiveRetrieval', eligibility: { eligible: false, status: 'provisional', reason: 'unreviewed rule' } }) }));
    expect(o.decision).toBe('needs-validation');
  });

  it('eligible but provisional + grammar dimension → needs-validation', () => {
    const o = decideIntake(intakeInput({ candidate: candidate({ kind: 'morph-construction', targetDimension: 'grammaticalUnderstanding', eligibility: { eligible: true, status: 'provisional', caveats: [] } }) }));
    expect(o.decision).toBe('needs-validation');
    expect(o.reasons[0]).toContain('provisional');
  });

  it('pack facts that are conflicted → too-uncertain', () => {
    const o = decideIntake(intakeInput({ facts: facts('form:sq:librin', { status: 'conflicted' }) }));
    expect(o.decision).toBe('too-uncertain');
  });

  it('eligibility caveats ride along in the reasons', () => {
    const o = decideIntake(intakeInput({ candidate: candidate({ eligibility: { eligible: true, status: 'high-confidence', caveats: ['gloss from dictionary'] } }) }));
    expect(o.decision).toBe('test-now');
    expect(o.reasons).toContain('caveat: gloss from dictionary');
  });
});

describe('decideIntake: deck and knowledge', () => {
  it('an active deck item for the same unit AND dimension → already-covered', () => {
    const o = decideIntake(intakeInput({ existing: [deckItem()] }));
    expect(o.decision).toBe('already-covered');
    expect(o.reasons[0]).toContain('already in the deck');
  });

  it('the same unit in a different dimension is NOT covered', () => {
    const o = decideIntake(intakeInput({ existing: [deckItem({ family: 'meaning-to-form' })] }));
    expect(o.decision).toBe('test-now');
  });

  it('recognition default checks coverage against its proposed dimension, not the candidate production target', () => {
    const o = decideIntake(intakeInput({
      candidate: candidate({ targetDimension: 'productiveRetrieval' }),
      existing: [deckItem({ family: 'written-recognition' })],
    }));
    expect(o.decision).toBe('already-covered');
    expect(o.proposed).toBeUndefined();
  });

  it('snoozed and suspended items count as covered; a dismissed one is not re-proposed', () => {
    expect(decideIntake(intakeInput({ existing: [deckItem({ status: 'snoozed' })] })).decision).toBe('already-covered');
    const s = decideIntake(intakeInput({ existing: [deckItem({ status: 'suspended' })] }));
    expect(s.decision).toBe('already-covered');
    expect(s.reasons[0]).toContain('suspended');
    const d = decideIntake(intakeInput({ existing: [deckItem({ status: 'dismissed' })] }));
    expect(d.decision).toBe('low-priority');
    expect(d.reasons[0]).toContain('removed');
  });

  it('a deck item for a construction that explains this unit → redundant', () => {
    const construction = candidate({ unitId: 'morph:sq:def.acc.sg', kind: 'morph-construction', explains: ['form:sq:librin', 'form:sq:shtëpinë'] });
    const cardItem = deckItem({ unitId: construction.unitId, family: 'grammar-application', reasons: [cardReasonFor(construction, 'repeated failures')] });
    expect(explainsReasons(construction)).toEqual(['explains:form:sq:librin', 'explains:form:sq:shtëpinë']);
    const o = decideIntake(intakeInput({ existing: [cardItem] }));
    expect(o.decision).toBe('redundant');
    expect(o.reasons[0]).toContain('morph:sq:def.acc.sg');
  });

  it('a suspended explaining construction does not make the unit redundant', () => {
    const construction = candidate({ unitId: 'morph:x', explains: ['form:sq:librin'] });
    const cardItem = deckItem({ unitId: 'morph:x', family: 'grammar-application', status: 'suspended', reasons: [cardReasonFor(construction, 'x')] });
    expect(decideIntake(intakeInput({ existing: [cardItem] })).decision).toBe('test-now');
  });

  it('well established (confidence ≥ 0.8 and score ≥ 0.85) → already-covered', () => {
    const k = knowledge('form:sq:librin', { readingRecognition: { score: 0.9, confidence: 0.85, observations: 6 } });
    const o = decideIntake(intakeInput({ knowledge: k }));
    expect(o.decision).toBe('already-covered');
    expect(o.reasons[0]).toContain('well established');
  });

  it('high score but low confidence is not "well established"', () => {
    const k = knowledge('form:sq:librin', { readingRecognition: { score: 0.95, confidence: 0.5 } });
    expect(decideIntake(intakeInput({ knowledge: k })).decision).toBe('test-now');
  });

  it('high confidence but middling score is not "well established"', () => {
    const k = knowledge('form:sq:librin', { readingRecognition: { score: 0.6, confidence: 0.95 } });
    expect(decideIntake(intakeInput({ knowledge: k })).decision).toBe('test-now');
  });
});

describe('decideIntake: score, saved and the proposal', () => {
  it('a New-stage item stays out automatically, but a typed explicit request permits written recognition', () => {
    const c = candidate();
    const newKnowledge = { ...knowledge(c.unitId), level: 'new' as const };
    expect(decideIntake(intakeInput({ candidate: c, knowledge: newKnowledge })).decision).toBe('low-priority');
    const requested = decideIntake(intakeInput({
      candidate: c, knowledge: newKnowledge, saved: new Set([c.unitId]), intent: {kind:'explicit',reason:'selected-vocabulary',requestedAt:NOW}, preferences: prefs({ prioritizeSaved: false }),
    }));
    expect(requested.decision).toBe('test-now');
    expect(requested.proposed?.family).toBe('written-recognition');
    expect(requested.explicitlySelected).toBe(true);
  });

  it('score below 0.15 → low comparative priority with a retained proposal', () => {
    const o = decideIntake(intakeInput({ candidate: candidate({ score: 0.1 }) }));
    expect(o.decision).toBe('low-priority');
    expect(o.reasons[0]).toContain('0.10');
    expect(o.proposed?.family).toBe('written-recognition');
  });

  it('ranks all eligible proposals comparatively, including scores below 0.15', () => {
    const low = decideIntake(intakeInput({ candidate: candidate({ unitId: 'form:sq:low', score: 0.05 }) }));
    const high = decideIntake(intakeInput({ candidate: candidate({ unitId: 'form:sq:high', score: 0.1 }) }));
    const equalB = decideIntake(intakeInput({ candidate: candidate({ unitId: 'form:sq:b', score: 0.1 }) }));
    const equalA = decideIntake(intakeInput({ candidate: candidate({ unitId: 'form:sq:a', score: 0.1 }) }));
    const ranked = rankComparativePriority([low, high, equalB, equalA], { limit: 2 });
    expect(ranked.map((o) => o.unitId)).toEqual(['form:sq:a', 'form:sq:b', 'form:sq:high', 'form:sq:low']);
    expect(ranked.slice(0, 2).every((o) => o.decision === 'test-now')).toBe(true);
    expect(ranked.slice(2).every((o) => o.decision === 'low-priority')).toBe(true);
    expect(ranked.at(-1)?.reasons.at(-1)).toContain('comparatively lower priority');
  });

  it('prioritizes explicitly saved proposals only when requested by the ranking options', () => {
    const saved = candidate({ unitId: 'form:sq:saved', score: 0.05 });
    const unsaved = candidate({ unitId: 'form:sq:unsaved', score: 0.9 });
    const savedOutcome = decideIntake(intakeInput({ candidate: saved, saved: new Set([saved.unitId]) }));
    const unsavedOutcome = decideIntake(intakeInput({ candidate: unsaved }));
    expect(rankComparativePriority([savedOutcome, unsavedOutcome], { limit: 1 }).map((o) => o.unitId)[0]).toBe('form:sq:unsaved');
    expect(rankComparativePriority([savedOutcome, unsavedOutcome], { limit: 1, prioritizeSaved: true }).map((o) => o.unitId)[0]).toBe('form:sq:saved');
  });

  it('score ≥ 0.5 → test-now; between → test-later', () => {
    expect(decideIntake(intakeInput({ candidate: candidate({ score: 0.5 }) })).decision).toBe('test-now');
    const later = decideIntake(intakeInput({ candidate: candidate({ score: 0.3 }) }));
    expect(later.decision).toBe('test-later');
    expect(later.proposed?.family).toBe('written-recognition');
  });

  it('a saved unit is test-now even with a low score, when prioritizeSaved', () => {
    const c = candidate({ score: 0.2 });
    const o = decideIntake(intakeInput({ candidate: c, saved: new Set([c.unitId]) }));
    expect(o.decision).toBe('test-now');
    expect(o.reasons).toContain('saved by the learner (prioritised)');
    expect(decideIntake(intakeInput({ candidate: c, saved: new Set([c.unitId]), preferences: prefs({ prioritizeSaved: false }) })).decision).toBe('test-later');
  });

  it('saved does not override already-covered', () => {
    const c = candidate();
    const o = decideIntake(intakeInput({ candidate: c, existing: [deckItem()], saved: new Set([c.unitId]) }));
    expect(o.decision).toBe('already-covered');
  });

  it('maps the target dimension to an assessment dimension and a family', () => {
    expect(proposeFor(candidate())).toEqual({ dimension: 'written-recognition', family: 'written-recognition' });
    expect(proposeFor(candidate({ kind: 'multiword' }))).toEqual({ dimension: 'phrase-comprehension', family: 'phrase-comprehension' });
    expect(proposeFor(candidate({ targetDimension: 'productiveRetrieval' }))).toEqual({ dimension: 'written-recognition', family: 'written-recognition' });
    expect(proposeFor(candidate({ targetDimension: 'productiveRetrieval' }), true)).toEqual({ dimension: 'meaning-to-target-retrieval', family: 'meaning-to-form' });
    expect(proposeFor(candidate({ targetDimension: 'grammaticalUnderstanding', kind: 'form' }), true)).toEqual({ dimension: 'morphological-analysis', family: 'morphological-identification' });
    expect(proposeFor(candidate({ targetDimension: 'grammaticalUnderstanding', kind: 'morph-construction' }), true)).toEqual({ dimension: 'construction-understanding', family: 'grammar-application' });
    expect(proposeFor(candidate({ targetDimension: 'listeningRecognition' }), true)).toEqual({ dimension: 'auditory-recognition', family: 'audio-to-meaning' });
    expect(proposeFor(candidate({ targetDimension: 'contextualProduction' }), true)).toEqual({ dimension: 'productive-recall', family: 'sentence-completion' });
  });
});

describe('decideIntake: audio', () => {
  const listening = candidate({ targetDimension: 'listeningRecognition', score: 0.9 });

  it('audio available and evidence-eligible → test-now as audio-to-meaning', () => {
    const o = decideIntake(intakeInput({ candidate: listening, audio: audioOk, secondaryPractice: true }));
    expect(o.decision).toBe('test-now');
    expect(o.proposed?.family).toBe('audio-to-meaning');
  });

  it('audio unavailable → test-later "no suitable audio", proposal kept, never a written substitute', () => {
    const o = decideIntake(intakeInput({ candidate: listening, audio: audioNone, secondaryPractice: true }));
    expect(o.decision).toBe('test-later');
    expect(o.reasons.join(' ')).toContain('no suitable audio');
    expect(o.proposed?.family).toBe('audio-to-meaning');
  });

  it('audio available but practice-only → test-later (cannot be listening evidence)', () => {
    const o = decideIntake(intakeInput({ candidate: listening, audio: audioPractice, secondaryPractice: true }));
    expect(o.decision).toBe('test-later');
    expect(o.reasons.join(' ')).toContain('practice only');
  });

  it('listening switched off → test-later', () => {
    const o = decideIntake(intakeInput({ candidate: listening, preferences: prefs({ includeListening: false }), secondaryPractice: true }));
    expect(o.decision).toBe('test-later');
    expect(o.reasons.join(' ')).toContain('switched off');
  });

  it('does not let an unsupported fetched unit back a listening objective', () => {
    const listeningObjective = candidate({ targetDimension: 'readingRecognition', objectiveDimension: 'listeningRecognition' });
    const unsupported = facts(listeningObjective.unitId, { unit: { ...facts(listeningObjective.unitId).unit, provenance: { source: 'rule', ref: 'unsupported', confidence: 1, validation: 'unsupported' } } as UnitFacts['unit'] });
    expect(decideIntake(intakeInput({ candidate: listeningObjective, facts: unsupported, audio: audioOk, knowledge: knowledge(listeningObjective.unitId, { readingRecognition: { score: 0.9, confidence: 0.9 } }) })).decision).toBe('needs-validation');
  });

  it('does not let facts from an incompatible variety back a secondary objective', () => {
    const listeningObjective = candidate({ targetDimension: 'readingRecognition', objectiveDimension: 'listeningRecognition' });
    const source = facts(listeningObjective.unitId);
    const incompatible = facts(listeningObjective.unitId, { unit: { ...source.unit, varietyId: 'sq-XX' } });
    expect(decideIntake(intakeInput({ candidate: listeningObjective, facts: incompatible, preferences: prefs({ varietyId: 'sq-YY' }), audio: audioOk })).decision).toBe('needs-validation');
  });

  it('a saved listening unit still waits for audio', () => {
    const o = decideIntake(intakeInput({ candidate: listening, audio: audioNone, saved: new Set([listening.unitId]), secondaryPractice: true }));
    expect(o.decision).toBe('test-later');
  });

  it('audio availability does not affect written targets', () => {
    expect(decideIntake(intakeInput({ audio: audioNone })).decision).toBe('test-now');
  });
});

describe('explainIntake', () => {
  it('reads as one line with the headline, the skill and the reasons', () => {
    const s = explainIntake(decideIntake(intakeInput()));
    expect(s.startsWith('Test now as written-recognition: ')).toBe(true);
    expect(s).toContain('looked-up-often (3 lookups this week)');
    const t = explainIntake(decideIntake(intakeInput({ candidate: candidate({ score: 0.05 }) })));
    expect(t.startsWith('Low comparative priority as written-recognition: ')).toBe(true);
  });
});

describe('gatherCandidates', () => {
  const units = ['form:sq:a', 'form:sq:b', 'form:sq:c', 'form:sq:d'];
  const cands = [
    candidate({ unitId: units[0], score: 0.8 }),
    candidate({ unitId: units[1], score: 0.4 }),
    candidate({ unitId: units[2], score: 0.05 }),
    candidate({ unitId: units[3], score: 0.9 }),
  ];

  function deps(over: Record<string, unknown> = {}) {
    const calls = { knowledge: [] as string[][], facts: [] as string[], candidates: [] as Array<[string, number]> };
    const base = {
      api: {
        candidates: async (enrolmentId: string, limit: number) => { calls.candidates.push([enrolmentId, limit]); return cands; },
        knowledge: async (ids: string[]) => { calls.knowledge.push(ids); return [...units.slice(0,3).map(id=>knowledge(id)), knowledge(units[3], { readingRecognition: { score: 0.95, confidence: 0.9 } })] as UnitKnowledge[]; },
      },
      facts: { factsFor: async (id: string) => { calls.facts.push(id); return facts(id); } },
      audio: async () => audioOk,
      deck: [], saved: new Set<string>(), preferences: prefs(), now: NOW, enrolmentId: 'E1',
    };
    return { calls, deps: { ...base, ...over } };
  }

  it('fetches knowledge once in a batch and facts only for test-now / test-later', async () => {
    const { calls, deps: d } = deps();
    const out = await gatherCandidates(d);
    expect(calls.candidates).toEqual([['E1', 40]]);
    expect(calls.knowledge).toHaveLength(1);
    expect(calls.knowledge[0]).toEqual(units);
    expect(out.map((o) => [o.unitId, o.decision])).toEqual([
      ['form:sq:a', 'test-now'], ['form:sq:b', 'test-now'], ['form:sq:c', 'test-now'], ['form:sq:d', 'already-covered'],
    ]);
    expect(calls.facts).toEqual(['form:sq:a', 'form:sq:b', 'form:sq:c']); // low comparative-priority proposals still need verified facts
    expect(out[2].proposed?.family).toBe('written-recognition');
  });

  it('no pack facts → needs-validation', async () => {
    const { deps: d } = deps({ facts: { factsFor: async () => undefined } });
    const out = await gatherCandidates(d);
    expect(out[0].decision).toBe('needs-validation');
    expect(out[0].reasons[0]).toContain('no verified facts');
  });

  it('incomplete pack facts are rejected safely before provenance is read', async () => {
    const { deps: d } = deps({ facts: { factsFor: async (id: string, languageId: string) => ({
      unit: { unitId: id, languageId }, relations: [], analyses: [], glosses: [],
    }) as unknown as UnitFacts } });
    const out = await gatherCandidates(d);
    expect(out[0].decision).toBe('needs-validation');
    expect(out[0].reasons.join(' ')).toContain('facts are incomplete');
  });

  it.each([
    ['facts status', { status: 'verified-ish' }],
    ['unit status', { unit: { ...facts('form:sq:a').unit, status: 'trusted' } }],
    ['provenance validation', { unit: { ...facts('form:sq:a').unit, provenance: { ...facts('form:sq:a').unit.provenance, validation: 'almost-production' } } }],
  ])('rejects malformed %s without treating it as verified', (_name, override) => {
    const malformed = facts('form:sq:librin', override as Partial<UnitFacts>);
    const out = decideIntake(intakeInput({ facts: malformed }));
    expect(out.decision).toBe('needs-validation');
    expect(out.reasons.join(' ')).toContain('facts are incomplete');
  });

  it('keeps valid provisional recognition usable while withholding provisional production', () => {
    const source = facts('form:sq:librin');
    const provisional = facts('form:sq:librin', { status: 'provisional', unit: { ...source.unit,
      status: 'provisional', provenance: { ...source.unit.provenance, validation: 'unreviewed' } } });
    const recognition = decideIntake(intakeInput({ facts: provisional, candidate: candidate({ eligibility: { eligible: false, status: 'provisional', reason: 'unreviewed resource' } }) }));
    expect(recognition.decision).toBe('test-now');
    const productionCandidate = candidate({ targetDimension: 'productiveRetrieval', objectiveDimension: 'productiveRetrieval', eligibility: { eligible: true, status: 'provisional', caveats: [] } });
    const production = decideIntake(intakeInput({ candidate: productionCandidate, facts: provisional }));
    expect(production.decision).toBe('needs-validation');
  });

  it('conflicted pack facts stop an otherwise test-now unit', async () => {
    const { deps: d } = deps({ facts: { factsFor: async (id: string) => facts(id, { status: 'conflicted' }) } });
    const out = await gatherCandidates(d);
    expect(out[0].decision).toBe('too-uncertain');
  });

  it('a throwing facts provider degrades to needs-validation, not a crash', async () => {
    const { deps: d } = deps({ facts: { factsFor: async () => { throw new Error('pack unreadable'); } } });
    const out = await gatherCandidates(d);
    expect(out[0].decision).toBe('needs-validation');
    expect(out[0].reasons[0]).toContain('pack unreadable');
  });

  it('a failing audio probe means no audio, not an error', async () => {
    const lc = candidate({ unitId: 'form:sq:l', targetDimension: 'listeningRecognition', score: 0.9 });
    const { deps: d } = deps({
      api: { candidates: async () => [lc], knowledge: async () => [knowledge(lc.unitId)] },
      audio: async () => { throw new Error('probe failed'); },
      secondaryPractice: true,
    });
    const out = await gatherCandidates(d);
    expect(out[0].decision).toBe('test-later');
    expect(out[0].reasons.join(' ')).toContain('probe failed');
  });

  it('merges a verified form into its canonical lexeme for one reading encounter, but leaves morphology practice separate', async () => {
    const formId = 'form:sq:shkolle';
    const lexemeId = 'lemma:sq:shkollë:NOUN';
    const formCandidate = candidate({ unitId: formId, kind: 'form', score: 0.9 });
    const lexemeCandidate = candidate({ unitId: lexemeId, kind: 'lexeme', score: 0.8 });
    const relation = {
      fromId: formId, relation: 'form-of' as const, toId: lexemeId, confidence: 1, status: 'verified' as const,
      provenance: { source: 'hand-lexicon' as const, ref: 'pack:sq:test', confidence: 1 },
    };
    const localDeps = deps({
      api: {
        candidates: async () => [formCandidate, lexemeCandidate],
        knowledge: async () => [knowledge(formId), knowledge(lexemeId)],
      },
      facts: { factsFor: async (id: string) => facts(id, id === formId ? { relations: [relation] } : {}) },
    });
    const out = await gatherCandidates(localDeps.deps);
    expect(out.map((row) => [row.unitId, row.decision])).toEqual([
      [formId, 'redundant'], [lexemeId, 'test-now'],
    ]);
    expect(out[0].reasons[0]).toContain(`canonical lexeme ${lexemeId}`);

    const morphology = candidate({ unitId: formId, kind: 'form', targetDimension: 'grammaticalUnderstanding' });
    const separate = await gatherCandidates(deps({
      secondaryPractice: true,
      api: { candidates: async () => [morphology, lexemeCandidate], knowledge: async () => [knowledge(formId), knowledge(lexemeId)] },
      facts: { factsFor: async (id: string) => {
        if (id !== formId) return facts(id);
        const formFacts = facts(id);
        return facts(id, { relations: [relation], unit: { ...formFacts.unit, provenance: { ...formFacts.unit.provenance, validation: 'production-validated' } } });
      } },
    }).deps);
    expect(separate[0].decision).toBe('test-now');
    expect(separate[0].proposed?.family).toBe('morphological-identification');
    expect(separate[1].decision).toBe('test-now');

    const ambiguous = await gatherCandidates(deps({
      api: {
        candidates: async () => [formCandidate, lexemeCandidate],
        knowledge: async () => [knowledge(formId), knowledge(lexemeId)],
      },
      facts: { factsFor: async (id: string) => facts(id, id === formId ? {
        relations: [relation],
        analyses: [{
          analysisId: 'ambiguous-analysis', formId, languageId: 'sq', candidates: [
            { lexemeId, senseId: 'sense:one', confidence: 0.5, provenance: relation.provenance },
            { lexemeId, senseId: 'sense:two', confidence: 0.5, provenance: relation.provenance },
          ], status: 'high-confidence', analyzerId: 'test', packId: 'pack:sq', packVersion: '1', createdAt: NOW,
        }],
      } : {}) },
    }).deps);
    expect(ambiguous[0].decision).toBe('test-now');
  });

  it('does not add a canonical lexeme when a legacy form-recognition card already covers it', async () => {
    const formId = 'form:sq:shkolle';
    const lexemeId = 'lemma:sq:shkollë:NOUN';
    const lexemeCandidate = candidate({ unitId: lexemeId, kind: 'lexeme', score: 0.8 });
    const relation = {
      fromId: formId, relation: 'form-of' as const, toId: lexemeId, confidence: 1, status: 'verified' as const,
      provenance: { source: 'hand-lexicon' as const, ref: 'pack:sq:test', confidence: 1 },
    };
    const existingForm = (status: 'active' | 'suspended' | 'dismissed') => deckItem({ unitId: formId, unitKind: 'form', status });
    const gather = (status: 'active' | 'suspended' | 'dismissed') => gatherCandidates(deps({
      api: {
        candidates: async () => [lexemeCandidate],
        knowledge: async () => [knowledge(lexemeId)],
      },
      deck: [existingForm(status)],
      facts: { factsFor: async (id: string) => facts(id, id === formId ? { relations: [relation] } : {}) },
    }).deps);

    for (const status of ['active', 'suspended'] as const) {
      const [outcome] = await gather(status);
      expect(outcome.decision).toBe('already-covered');
      expect(outcome.reasons[0]).toContain(`existing form recognition ${formId}`);
    }
    expect((await gather('dismissed'))[0].decision).toBe('test-now');
  });

  it.each([
    ['hand-lexicon', 1, 'redundant'], ['rule', 1, 'test-now'], ['hand-lexicon', 0.4, 'test-now'],
  ] as const)('aliases provisional %s links at confidence %s only when the lexical source warrants it', async (source, confidence, expected) => {
    const formId = 'form:sq:shkollë';
    const lexemeId = 'lemma:sq:shkollë:NOUN';
    const rows = [candidate({ unitId: formId, kind: 'form' }), candidate({ unitId: lexemeId, kind: 'lexeme' })];
    const result = await gatherCandidates(deps({
      api: { candidates: async () => rows, knowledge: async () => rows.map((r) => knowledge(r.unitId)) },
      facts: { factsFor: async (id: string) => facts(id, id === formId ? { analyses: [{
        analysisId: 'single-sense', formId, languageId: 'sq', status: 'high-confidence',
        analyzerId: 'test', packId: 'pack:sq', packVersion: '1', createdAt: NOW,
        candidates: [{ lexemeId, senseId: 'sense:school', confidence: 1, provenance: { source: 'hand-lexicon', ref: 'pack:sq:test', confidence: 1 } }],
      }], relations: [{
        fromId: formId, toId: lexemeId, relation: 'form-of', status: 'provisional', confidence,
        provenance: { source, ref: 'pack:sq:test', confidence },
      }] } : {}) },
    }).deps);
    expect(result[0].decision).toBe(expected);
  });

  it('no candidates → no calls beyond the candidate query', async () => {
    const { calls, deps: d } = deps({ api: { candidates: async () => [], knowledge: async (ids: string[]) => { calls.knowledge.push(ids); return []; } } });
    expect(await gatherCandidates(d)).toEqual([]);
    expect(calls.knowledge).toEqual([]);
  });
});
