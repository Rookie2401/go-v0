// @vitest-environment node
/**
 * Albanian in the variety framework: Standard Albanian and Gheg are learning varieties of one language. The registry agrees with the
 * pack; a reader records a dialect only when the sentence showed it; knowledge and review cards are kept per dialect; what is known
 * in one is familiarity in the other, never mastery.
 */
import { describe, expect, it } from 'vitest';
import {
  canonicalVarietyId, cardIdFor, classifiedVarietiesOf, defaultScope, defaultVarietyOf, hasLearningVarieties, knowledgeInVariety, learningVarietiesOf,
  selectableVarietiesOf, statedVarietyOf, transferEvidence, transferPriority, validateEvent, varietyOf, varietyRelation,
} from '../../packages/repository-contract/src';
import { albanianManifest } from '../../packages/language-packs/src/packs/sq';
import { buildSelectionEvent, encounterVariety, PENDING_IDENTITY } from '../../packages/golearn-extension/src/store';
import { parseSelection, registerAnalyser } from '../../packages/golearn-extension/src/parser';
import { sqAdapter } from '../../src/adapters/sq';
import { resolveScope } from '../../packages/goreview/src/scheduler/scope';
import { cardAdded, cardReviewed, day, knowledgeOf, lookup, mark, met } from './helpers';

const LIBER = 'lemma:sq:libër:NOUN';
const JAM = 'lemma:sq:jam:VERB';

describe('the registry: Albanian has learning varieties', () => {
  it('Standard and Gheg are the two a learner may choose; the others are recognised and kept apart', () => {
    expect(hasLearningVarieties('sq')).toBe(true);
    expect(learningVarietiesOf('sq').map((v) => v.id)).toEqual(['sq-standard', 'sq-gheg', 'sq-tosk', 'sq-arbereshe', 'sq-arvanitika']);
    expect(selectableVarietiesOf('sq').map((v) => v.id)).toEqual(['sq-standard', 'sq-gheg']);
    expect(defaultVarietyOf('sq')).toBe('sq-standard');
    for (const v of learningVarietiesOf('sq')) expect(v.parentLanguage).toBe('sq');
  });
  it('they are dialects of one time: one group, so what is known in one is close to the other', () => {
    expect(varietyRelation('sq', 'sq-standard', 'sq-gheg')).toBe('same-group');
    expect(varietyRelation('sq', 'sq-gheg', 'sq-arbereshe')).toBe('same-group');
    expect(varietyOf('sq', 'sq-gheg')?.relatedVarieties[0]).toBe('sq-standard');
  });
  it('the adapter’s codes and the ISO codes are aliases of the pack’s ids, never stored', () => {
    expect(canonicalVarietyId('sq', 'aln')).toBe('sq-gheg');
    expect(canonicalVarietyId('sq', 'aln-XK')).toBe('sq-gheg');
    expect(canonicalVarietyId('sq', 'sq')).toBe('sq-standard');
    expect(canonicalVarietyId('sq', 'als')).toBe('sq-tosk');
    expect(canonicalVarietyId('sq', 'aae')).toBe('sq-arbereshe');
    expect(canonicalVarietyId('sq', 'aat')).toBe('sq-arvanitika');
    expect(canonicalVarietyId('sq', 'sq-ascii')).toBeUndefined(); // a typing habit is not a dialect
    expect(canonicalVarietyId('sq', 'sq-pre1972')).toBeUndefined(); // nor is an older spelling
    expect(canonicalVarietyId('sq', 'el-koi')).toBeUndefined();
  });
  it('agrees with what the Albanian pack declares (same ids, same default, what it tells apart is what may be chosen)', () => {
    const manifest = albanianManifest();
    const known = new Set(learningVarietiesOf('sq').map((v) => v.id));
    for (const v of manifest.varieties) expect(known.has(v.varietyId), v.varietyId).toBe(true);
    expect(defaultVarietyOf('sq')).toBe(manifest.varietyId);
    expect(selectableVarietiesOf('sq').map((v) => v.id).sort()).toEqual(manifest.varieties.filter((v) => v.analysed).map((v) => v.varietyId).sort());
    expect(manifest.version).toBe(sqAdapter.version);
    // the adapter's own varieties marked as learning varieties are exactly the ones the registry lets a learner choose
    const learning = Object.values(sqAdapter.varieties ?? {}).filter((v) => v.learning).map((v) => canonicalVarietyId('sq', v.code)).sort();
    expect(learning).toEqual(selectableVarietiesOf('sq').map((v) => v.id).sort());
  });
});

describe('what a reader records', () => {
  const gheg = { varietyId: 'aln', label: 'Gheg', basis: 'the sentence has Gheg forms (asht, nji)', evidence: 'text' as const };
  const standard = { varietyId: 'sq', label: 'Standard Albanian', basis: 'forms the Standard writes', evidence: 'text' as const };
  const fallback = { varietyId: 'sq', label: 'Standard Albanian', basis: 'by default', evidence: 'default' as const };

  it('a dialect the sentence showed is recorded under the registry id; a default is not recorded', () => {
    expect(encounterVariety('sq', gheg, undefined)).toEqual({ varietyId: 'sq-gheg', basis: 'analysed' });
    expect(encounterVariety('sq', standard, undefined)).toEqual({ varietyId: 'sq-standard', basis: 'analysed' });
    expect(encounterVariety('sq', fallback, undefined)).toBeUndefined();
    expect(encounterVariety('sq', fallback, { languageId: 'sq', varietyId: 'sq-standard', basis: 'team-default', confidence: 0.3 })).toBeUndefined();
    // the learner's own statement comes first
    expect(encounterVariety('sq', standard, { languageId: 'sq', varietyId: 'sq-gheg', basis: 'override', confidence: 1 })).toEqual({ varietyId: 'sq-gheg', basis: 'declared' });
  });

  it('a card made from a Gheg sentence says so, and its lookup event carries the dialect', () => {
    registerAnalyser('sq', sqAdapter);
    const sentence = 'Ai asht nji djalë i mirë.';
    const at = sentence.indexOf('djalë');
    const card = parseSelection({ surface: 'djalë', languageId: 'sq', context: { kind: 'sentence', confidence: 1, sentence, selStart: at, selEnd: at + 'djalë'.length } });
    expect(card.period).toMatchObject({ varietyId: 'aln', label: 'Gheg', evidence: 'text' });
    expect(JSON.stringify(card)).toMatch(/This sentence is read as Gheg: the sentence has Gheg forms \(asht, nji\)/);
    // the same word in a Standard sentence, and in a sentence that shows nothing
    const std = 'Ai është një djalë i mirë.';
    const stdCard = parseSelection({ surface: 'djalë', languageId: 'sq', context: { kind: 'sentence', confidence: 1, sentence: std, selStart: std.indexOf('djalë'), selEnd: std.indexOf('djalë') + 5 } });
    expect(stdCard.period).toMatchObject({ varietyId: 'sq', label: 'Standard Albanian', evidence: 'text' });
    const plain = 'Djali ka libra.';
    const plainCard = parseSelection({ surface: 'libra', languageId: 'sq', context: { kind: 'sentence', confidence: 1, sentence: plain, selStart: plain.indexOf('libra'), selEnd: plain.indexOf('libra') + 5 } });
    expect(plainCard.period).toMatchObject({ varietyId: 'sq', evidence: 'default' });
    expect(encounterVariety('sq', plainCard.period, undefined)).toBeUndefined();
    const event = buildSelectionEvent({ card, readerId: 'web-generic', identity: { ...PENDING_IDENTITY, deviceId: 'd1' } as never, version: '1', sessionId: 's1', now: new Date('2026-11-18T10:00:00Z') });
    expect(validateEvent(event)).toEqual([]);
    expect(event.payload).toMatchObject({ variety: { varietyId: 'sq-gheg', basis: 'analysed' } });
    expect(statedVarietyOf(event)).toMatchObject({ varietyId: 'sq-gheg' });
  });
});

describe('knowledge is kept per dialect', () => {
  it('a word met in Gheg text and in Standard text has one identity and two standings', () => {
    const events = [...met(JAM, 'sq-gheg', 1, 'known', 'analysed'), ...met(JAM, 'sq-standard', 3, 'seen', 'analysed')];
    const row = knowledgeOf(events).find((r) => r.unitId === JAM)!;
    expect(classifiedVarietiesOf(row).sort()).toEqual(['sq-gheg', 'sq-standard']);
    expect(knowledgeInVariety(row, 'sq-gheg').knowledge.level).toBe('known');
    expect(knowledgeInVariety(row, 'sq-standard').knowledge.level).toBe('seen');
    expect(knowledgeInVariety(row, 'aln').knowledge.level).toBe('known'); // the adapter's code reads the same slice
  });
  it('a word met only in Gheg is not thereby known in Standard, but it is strong familiarity there', () => {
    const row = knowledgeOf(met(LIBER, 'sq-gheg', 1, 'known', 'analysed')).find((r) => r.unitId === LIBER)!;
    const inStandard = knowledgeInVariety(row, 'sq-standard');
    expect(inStandard.basis).toBe('not-met');
    expect(inStandard.knowledge.level).toBe('new');
    const transfer = transferEvidence(row, 'sq-standard');
    expect(transfer).toEqual([expect.objectContaining({ fromVarietyId: 'sq-gheg', relation: 'same-group', level: 'known', strength: 'strong' })]);
    expect(transferPriority(transfer)).toBe(2);
  });
  it('a word no sentence settled belongs to neither dialect and counts in both views, as before', () => {
    const events = [lookup(LIBER, { at: day(1), sentenceKey: 's1', weak: 'sq-standard' }), mark(LIBER, 'recognized', { at: day(1, 11), sentenceKey: 's1' })];
    const row = knowledgeOf(events).find((r) => r.unitId === LIBER)!;
    expect(classifiedVarietiesOf(row)).toEqual([]);
    expect(knowledgeInVariety(row, 'sq-standard')).toMatchObject({ basis: 'unsettled' });
    expect(knowledgeInVariety(row, 'sq-standard').knowledge.level).toBe('recognized');
    expect(knowledgeInVariety(row, 'sq-gheg').knowledge.level).toBe('recognized');
  });
});

describe('review identity and scope', () => {
  it('a Gheg card and a Standard card of one word are two cards; a card from before stays as it was', () => {
    const gheg = cardIdFor(JAM, 'written-recognition', 'sq-gheg'), standard = cardIdFor(JAM, 'written-recognition', 'sq-standard');
    expect(gheg).toBe('card:written-recognition@sq-gheg:lemma:sq:jam:VERB');
    expect(standard).not.toBe(gheg);
    expect(cardIdFor(JAM, 'written-recognition')).toBe('card:written-recognition:lemma:sq:jam:VERB');
  });
  it('answering the Gheg card says nothing about the Standard word', () => {
    const events = [
      ...met(JAM, 'sq-standard', 1, 'seen', 'analysed'),
      cardAdded(JAM, { at: day(2), variety: 'sq-gheg' }), cardReviewed(JAM, 3, { at: day(2, 12), variety: 'sq-gheg' }), cardReviewed(JAM, 3, { at: day(5), variety: 'sq-gheg' }),
    ];
    const row = knowledgeOf(events).find((r) => r.unitId === JAM)!;
    expect(knowledgeInVariety(row, 'sq-standard').knowledge.level).toBe('seen');
    expect(knowledgeInVariety(row, 'sq-gheg').knowledge.dimensions.readingRecognition.positive).toBeGreaterThan(0);
  });
  it('the default queue is one dialect: the enrolment’s, else Standard; a learner may choose Gheg or both', () => {
    expect(defaultScope('sq')).toMatchObject({ languageId: 'sq', varietyIds: ['sq-standard'] });
    expect(defaultScope('sq', 'sq-gheg')).toMatchObject({ varietyIds: ['sq-gheg'] });
    expect(resolveScope({ languageId: 'sq', enrolmentVarietyId: 'sq-standard' })).toMatchObject({ varietyIds: ['sq-standard'] });
    expect(resolveScope({ languageId: 'sq', chosen: { varietyIds: ['aln'] } })).toMatchObject({ varietyIds: ['sq-gheg'] });
    expect(resolveScope({ languageId: 'sq', chosen: { varietyIds: ['sq-standard', 'sq-gheg'] } })?.varietyIds).toEqual(['sq-standard', 'sq-gheg']);
  });
});
