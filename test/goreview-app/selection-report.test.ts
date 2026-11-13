// @vitest-environment jsdom
/**
 * The selection report (packages/goreview/app/selectionReport.ts): one row per deck card, class card and intake outcome,
 * each with a stable machine-readable code; unit ids only unless labels are asked for; and the #/developer "Why these cards" section.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildSelectionReport, selectionReportJson } from '../../packages/goreview/app/selectionReport';
import type { ReviewModel } from '../../packages/goreview/app/workspace';
import { FACTS_NOT_EXAMINED } from '../../packages/goreview/src/intake/intake';
import { planSession } from '../../packages/goreview/src/planner/planner';
import type { DeckItem, IntakeOutcome } from '../../packages/goreview/src/types';
import { audioOk, candidate, deckItem, dueItem, fakeScheduler, knowledge, NOW, prefs, scheduleState, testNow } from '../goreview/intake/fixtures';
import { destroyRigs, flush, makeRig, until } from './helpers';

afterEach(() => { destroyRigs(); Reflect.deleteProperty(navigator, 'clipboard'); });

const FUTURE = '2026-10-12T10:00:00.000Z';
const U = { zog: 'lemma:sq:zog:NOUN', mace: 'lemma:sq:mace:NOUN', qen: 'lemma:sq:qen:NOUN', det: 'lemma:sq:det:NOUN', shtepi: 'lemma:sq:shtepi:NOUN', diell: 'lemma:sq:diell:NOUN', cls: 'class:sq:hello' };

function fixture(withPlan = true) {
  const deck: DeckItem[] = [
    dueItem(U.zog, 0.3), dueItem(U.mace, 0.5),
    deckItem({ unitId: U.qen, schedule: scheduleState({ due: FUTURE }) }),
    dueItem(U.det, 0.4, 'written-recognition', { status: 'snoozed', snoozedUntil: FUTURE }),
  ];
  const classDeck: DeckItem[] = [deckItem({ unitId: U.cls, schedule: scheduleState({ due: FUTURE }) })];
  const outcomes: IntakeOutcome[] = [
    testNow(U.shtepi),
    { unitId: U.diell, decision: 'needs-validation', reasons: ['the facts need validation before testing'], candidate: candidate({ unitId: U.diell }) },
  ];
  const know = [knowledge(U.shtepi)];
  const model = {
    identity: { learnerId: 'L1', enrolmentId: 'E1', languageId: 'sq' }, prefs: prefs(), events: [], deck, classDeck,
    counts: { due: 2, learning: 0, fresh: 0, suspended: 0, snoozed: 1, dismissed: 0, total: 4 }, audio: audioOk, outcomes, knowledge: know,
    dismissed: [], choices: {}, saved: new Set<string>(), candidateSource: 'live', now: NOW, algorithm: 'fake', parametersVersion: '0',
  } as unknown as ReviewModel;
  const plan = planSession({ deck, intake: withPlan ? outcomes : [], preferences: prefs(), audio: audioOk, scheduler: fakeScheduler, now: NOW, random: () => 0.5, knowledge: know });
  return { model, plan };
}

describe('buildSelectionReport', () => {
  it('files a word whose facts were not fetched under its own code and count, never under facts-unavailable or low priority', () => {
    const { model, plan } = fixture();
    const unchecked: IntakeOutcome = { unitId: 'lemma:sq:hene:NOUN', decision: 'low-priority', reasons: ['score 0.05', FACTS_NOT_EXAMINED, 'candidate rank 9 of 9 (comparison 0.04; base score 0.05; reading usefulness 0.00; lower candidate rank)'],
      proposed: { dimension: 'written-recognition', family: 'written-recognition' }, candidate: candidate({ unitId: 'lemma:sq:hene:NOUN' }) };
    const report = buildSelectionReport({ ...model, outcomes: [...model.outcomes, unchecked] }, plan);
    expect(report.rows.find(r => r.unitId === unchecked.unitId)).toMatchObject({ status: 'excluded', code: 'facts-not-checked', detail: FACTS_NOT_EXAMINED, intakeDecision: 'low-priority' });
    expect(report.rows.find(r => r.unitId === unchecked.unitId)!.intakeRank).toBeUndefined();
    expect(report.counts.notYetChecked).toBe(1);
  });

  it('gives every deck card, class card and intake outcome exactly one row with the expected code', () => {
    const { model, plan } = fixture();
    const report = buildSelectionReport(model, plan);
    expect(report.rows).toHaveLength(7);
    expect(new Set(report.rows.map(r => r.unitId)).size).toBe(7);
    const by = Object.fromEntries(report.rows.map(r => [r.unitId, r]));
    expect(by[U.zog]).toMatchObject({ kind: 'deck', status: 'selected', code: 'selected', cardId: expect.stringContaining(U.zog) });
    expect(by[U.mace]).toMatchObject({ kind: 'deck', status: 'selected', code: 'selected' });
    // deck fill (2026-11-03): the not-due card completes the deck as early practice, so it is selected with the stable code 'deck-fill'
    expect(by[U.qen]).toMatchObject({ kind: 'deck', status: 'selected', code: 'deck-fill', queue: 'due' });
    expect(by[U.det]).toMatchObject({ kind: 'deck', status: 'excluded', code: 'snoozed' });
    expect(by[U.cls]).toMatchObject({ kind: 'class', status: 'excluded', code: 'scheduled-not-due' });
    expect(by[U.shtepi]).toMatchObject({ kind: 'candidate', status: 'selected', code: 'selected', intakeDecision: 'test-now' });
    expect(by[U.diell]).toMatchObject({ kind: 'candidate', status: 'excluded', code: 'facts-unavailable', intakeDecision: 'needs-validation' });
    expect(by[U.zog]!.retrievability).toBeGreaterThan(0);
    expect(by[U.zog]!.queue).toBe('due');
    expect(by[U.qen]!.due).toBe(FUTURE);
  });

  it("reports a deck-fill item with the stable code 'deck-fill' and its queue, and every due item still as 'selected'", () => {
    const { model, plan } = fixture();
    const fill = plan.items.filter(p => p.presentationReason === 'deck-fill');
    expect(fill.map(p => p.item.unitId)).toEqual([U.qen]);
    const rows = buildSelectionReport(model, plan).rows;
    expect(rows.filter(r => r.code === 'deck-fill').map(r => [r.unitId, r.status, r.queue])).toEqual([[U.qen, 'selected', 'due']]);
    for (const unit of [U.zog, U.mace, U.shtepi]) expect(rows.find(r => r.unitId === unit)!.code, unit).toBe('selected');
    expect(rows.filter(r => r.cardId === fill[0]!.item.itemId)).toHaveLength(1); // still exactly one row per card
    expect(selectionReportJson(buildSelectionReport(model, plan))).toContain('"code": "deck-fill"');
  });

  it('counts add up', () => {
    const { model, plan } = fixture();
    const { counts, rows } = buildSelectionReport(model, plan);
    expect(counts).toEqual({ vocabularyUnits: 7, knowledgeRows: 1, candidates: 2, deckCards: 4, classCards: 1, selected: 4, skipped: plan.skipped.length, withheld: 0, notYetChecked: 0 });
    expect(counts.selected).toBe(rows.filter(r => r.status === 'selected').length);
    expect(counts.deckCards + counts.classCards + counts.candidates).toBe(rows.length);
    expect(counts.selected).toBe(plan.items.length);
  });

  it('reports Current learning plus fresh items separately from due Review Deck items in the combined plan', () => {
    const { model } = fixture();
    const learning = deckItem({ unitId: 'form:sq:learning', schedule: scheduleState({ phase: 'learning', due: NOW }) });
    const expanded = { ...model, deck: [...model.deck, learning] };
    const plan = planSession({ deck: expanded.deck, intake: expanded.outcomes, preferences: prefs(), audio: audioOk,
      scheduler: fakeScheduler, now: NOW, random: () => 0.5, knowledge: expanded.knowledge });
    const report = buildSelectionReport(expanded, plan);
    expect(plan.items.find(p => p.item.unitId === learning.unitId)?.queue).toBe('learning');
    // deck fill (2026-11-03): the one not-due spaced review completes the deck as early practice, so it counts among the Review Deck items and once as fill
    expect(report.planning).toMatchObject({ currentDeckItemsInPlan: 2, reviewDeckItemsInPlan: 3, remediationItemsInPlan: 0, fillItemsInPlan: 1 });
  });

  it('reports only verified candidate form-to-base-word merges as word-family coverage', () => {
    const { model, plan } = fixture();
    const merged = { unitId: 'form:sq:known-form', decision: 'redundant' as const,
      reasons: ['merged into canonical lexeme lemma:sq:known:NOUN through one reliable lexical form-of relation; one encounter creates one reading-recognition objective'],
      candidate: candidate({ unitId: 'form:sq:known-form' }) };
    const report = buildSelectionReport({ ...model, outcomes: [...model.outcomes, merged] } as unknown as ReviewModel, plan);
    expect(report.coverage).toMatchObject({ candidateFormsMergedToVerifiedBaseWord: 1, verifiedBaseWordsInCandidateMerge: 1 });
  });

  it('derives codes for cards the plan neither selected nor recorded, and marks an unplanned test-now outcome outranked', () => {
    const { model, plan } = fixture(false);
    const bare = { ...plan, items: [], skipped: [] };
    const by = Object.fromEntries(buildSelectionReport(model, bare).rows.map(r => [r.unitId, r]));
    expect(by[U.zog]).toMatchObject({ status: 'excluded', code: 'outranked' });
    expect(by[U.qen]!.code).toBe('scheduled-not-due');
    expect(by[U.qen]!.detail).toContain(FUTURE);
    expect(by[U.det]!.code).toBe('snoozed');
    expect(by[U.shtepi]).toMatchObject({ status: 'excluded', code: 'outranked' });
  });

  it('carries no label by default, and the word only with includeLabels', () => {
    const { model, plan } = fixture();
    const plain = buildSelectionReport(model, plan);
    expect(plain.rows.every(r => !('label' in r))).toBe(true);
    expect(selectionReportJson(plain)).not.toContain('"label"');
    const labelled = buildSelectionReport(model, plan, { includeLabels: true });
    expect(labelled.rows.find(r => r.unitId === U.zog)!.label).toBe('zog');
    expect(labelled.rows.every(r => typeof r.label === 'string')).toBe(true);
  });

  it('masks a word that an engine reason repeats unless labels are requested', () => {
    const { model, plan } = fixture();
    const target = plan.skipped[0]!.itemId;
    const noisy = { ...plan, skipped: [{ itemId: target, why: 'held back because ' + target.replace(/^card:[^:]+:/, '').split(':')[2] + ' was asked recently', code: 'other' as const }] };
    const row = (labels: boolean) => buildSelectionReport(model, noisy, { includeLabels: labels }).rows.find(r => r.cardId === target)!;
    const word = target.replace(/^card:[^:]+:/, '').split(':')[2]!;
    expect(row(false).detail).toBe('held back because [word] was asked recently');
    expect(row(true).detail).toContain(word);
  });

  it('writes stable, parseable 2-space JSON with no email or credentials, and passes knowledgeStatus and withheld through', () => {
    const { model, plan } = fixture();
    const extended = { ...model, knowledgeStatus: { z: 1, a: 2 }, withheld: [{ unitId: 'x' }, { unitId: 'y' }] } as unknown as ReviewModel;
    const a = selectionReportJson(buildSelectionReport(extended, plan));
    const b = selectionReportJson(buildSelectionReport(extended, plan));
    expect(a).toBe(b);
    const parsed = JSON.parse(a);
    expect(Object.keys(parsed)).toEqual([...Object.keys(parsed)].sort());
    expect(a.split('\n')[1]).toMatch(/^ {2}"/);
    expect(parsed.knowledge).toEqual({ a: 2, z: 1 });
    expect(Object.keys(parsed.knowledge)).toEqual(['a', 'z']);
    expect(parsed.counts.withheld).toBe(2);
    expect(parsed.policy).toMatchObject({ algorithm: expect.stringContaining('fsrs'), priorityPolicyVersion: expect.stringContaining('knowability-priority') });
    expect(a).not.toMatch(/[A-Za-z0-9._+-]+@[A-Za-z0-9-]+[.][a-z]{2,}|password|token/i);
    expect(JSON.parse(selectionReportJson(buildSelectionReport(model, plan)))).not.toHaveProperty('knowledge');
  });
});

describe('#/developer: Why these cards', () => {
  it('renders the section, builds the report on a press and copies the JSON', async () => {
    const writeText = vi.fn(async (_text: string) => undefined);
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    const rig = await makeRig({ signedIn: true });
    await rig.go('developer');
    await until(() => !!rig.root.querySelector('#why-these-cards'), 'the section');
    expect(rig.q('#why-h').textContent).toBe('Why these cards');
    expect(rig.q('#why-build').textContent).toBe('Build selection report');
    expect(rig.q('#why-copy').textContent).toBe('Copy diagnostic JSON');
    expect(rig.q('#why-these-cards').textContent).toContain('unit ids (which can contain word forms)');
    expect(rig.root.querySelector('#why-rows')).toBeNull(); // built on demand, not on page load
    rig.q('#why-build').click();
    await until(() => !!rig.root.querySelector('#why-counts'), 'the report');
    expect(rig.q('#why-counts').textContent).toContain('Deck cards');
    rig.q('#why-copy').click();
    await until(() => writeText.mock.calls.length > 0, 'the clipboard write');
    const text = writeText.mock.calls[0]![0] as string;
    const parsed = JSON.parse(text);
    expect(parsed.rows).toBeInstanceOf(Array);
    expect(parsed.counts).toHaveProperty('vocabularyUnits');
    expect(text).not.toMatch(/[A-Za-z0-9._+-]+@[A-Za-z0-9-]+[.][a-z]{2,}/i);
    await flush(2);
    expect(rig.q('#why-these-cards .status').textContent).toContain('copied');
  });

  it('says so, without throwing, when the clipboard is unavailable', async () => {
    Object.defineProperty(navigator, 'clipboard', { value: undefined, configurable: true });
    const rig = await makeRig({ signedIn: true });
    await rig.go('developer');
    await until(() => !!rig.root.querySelector('#why-copy'), 'the button');
    rig.q('#why-copy').click();
    await until(() => (rig.q('#why-these-cards .status').textContent ?? '').includes('Could not copy'), 'the clipboard refusal');
  });
});
