// @vitest-environment node
/**
 * Source-aware acquisition: a reader's events say which variety the text was in, and only on evidence
 * (packages/golearn-extension/src/store `encounterVariety`; the analysers' `periodEvidence`). The brief's Part VII.
 */
import { describe, expect, it } from 'vitest';
import { statedVarietyOf, validateEvent } from '../../packages/repository-contract/src';
import type { GoEvent } from '../../packages/repository-contract/src';
import { PENDING_IDENTITY, buildAnalysisShownEvent, buildAssistanceEvent, buildEncounterEvent, buildMarkEvent, buildPronunciationEvent, buildSelectionEvent, encounterVariety } from '../../packages/golearn-extension/src/store';
import { heAdapter } from '../../src/adapters/he';
import { elAdapter } from '../../src/adapters/el';
import { resetElPeriodMemory } from '../../src/adapters/greek/analyze';
import { MODEL_VERSION, foldEvents } from '../../packages/repository-engine/src';
import { knowledgeInVariety } from '../../packages/repository-contract/src';

const GEN_1_1 = 'בְּרֵאשִׁ֖ית בָּרָ֣א אֱלֹהִ֑ים אֵ֥ת הַשָּׁמַ֖יִם וְאֵ֥ת הָאָֽרֶץ׃';
const JOHN_1_1 = 'Ἐν ἀρχῇ ἦν ὁ λόγος, καὶ ὁ λόγος ἦν πρὸς τὸν θεόν, καὶ θεὸς ἦν ὁ λόγος.';
const MODERN_GREEK = 'Ο λόγος είναι ελεύθερος και οι άνθρωποι γράφουν βιβλία.';

const periodOf = (adapter: typeof heAdapter, text: string, varietyId?: string): { period?: unknown; evidence?: unknown } => {
  const tokens = adapter.tokenize(text);
  const notes = adapter.analyze(tokens, varietyId ? { varietyId } : undefined).flatMap((a) => a.candidates).find((c) => c.notes?.period)?.notes;
  return { period: notes?.period, evidence: notes?.periodEvidence };
};

describe('the analysers say how a sentence\'s period was settled', () => {
  it('cantillation is evidence in the text: Biblical Hebrew', () => {
    expect(periodOf(heAdapter, GEN_1_1)).toEqual({ period: 'he-bib', evidence: 'text' });
    // even when the caller targets Modern Hebrew
    expect(periodOf(heAdapter, GEN_1_1, 'he-mod')).toEqual({ period: 'he-bib', evidence: 'text' });
  });

  it('the Greek New Testament reads as Koine on its words; monotonic spelling reads as Modern Greek', () => {
    resetElPeriodMemory();
    expect(periodOf(elAdapter, JOHN_1_1)).toEqual({ period: 'el-koi', evidence: 'text' });
    // A Modern sentence is settled as Modern only when Modern readings are there to see (the Modern index is an asset a host installs).
    // With the compiled core alone its words match New Testament forms by their letters: the analyser then names a period and says the
    // sentence did NOT settle it, so nothing is recorded. A monotonic sentence is never recorded as an ancient variety on evidence.
    resetElPeriodMemory();
    const modern = periodOf(elAdapter, MODERN_GREEK);
    expect(modern.period === 'el-mod' ? modern.evidence : 'default').toBe(modern.evidence);
    expect(modern.period !== 'el-mod' && modern.evidence === 'text').toBe(false);
  });

  it('a single word, or a caller\'s variety deciding, is not evidence about the text', () => {
    resetElPeriodMemory();
    // λόγος alone is spelled the same in every period: whatever period it is read in, the sentence did not settle it
    expect(periodOf(elAdapter, 'λόγος').evidence).not.toBe('text');
    resetElPeriodMemory();
    expect(periodOf(elAdapter, 'λόγος', 'el-koi')).toEqual({ period: 'el-koi', evidence: 'declared' });
    // one unpointed Hebrew word with no cantillation: no majority to speak of
    expect(periodOf(heAdapter, 'אלהים').evidence).not.toBe('text');
  });
});

describe('`encounterVariety`: what a reader may record', () => {
  const text = { varietyId: 'he-bib', label: 'Biblical Hebrew', basis: 'cantillation', evidence: 'text' as const };
  const guess = { varietyId: 'he-mod', label: 'Modern Hebrew', basis: 'default', evidence: 'default' as const };

  it('the learner\'s or the reader\'s own statement first; then evidence in the sentence; then what the page declares', () => {
    expect(encounterVariety('he', guess, { languageId: 'he', varietyId: 'he-bib', basis: 'override', confidence: 1 })).toEqual({ varietyId: 'he-bib', basis: 'declared' });
    expect(encounterVariety('he', text, { languageId: 'he', varietyId: 'he-mod', basis: 'team-default', confidence: 0.3 })).toEqual({ varietyId: 'he-bib', basis: 'analysed' });
    expect(encounterVariety('he', text, { languageId: 'he', varietyId: 'he-mod', basis: 'document-metadata', confidence: 0.9 })).toEqual({ varietyId: 'he-bib', basis: 'analysed' });
    expect(encounterVariety('he', guess, { languageId: 'he', varietyId: 'he-bib', basis: 'document-metadata', confidence: 0.9 })).toEqual({ varietyId: 'he-bib', basis: 'declared' });
  });

  it('an enrolment default, a detection and an analyser\'s fallback record nothing', () => {
    expect(encounterVariety('he', guess, { languageId: 'he', varietyId: 'he-mod', basis: 'team-default', confidence: 0.3 })).toBeUndefined();
    expect(encounterVariety('he', guess, { languageId: 'he', varietyId: 'he-mod', basis: 'detection', confidence: 0.8 })).toBeUndefined();
    expect(encounterVariety('he', { ...guess, evidence: 'declared' }, undefined)).toBeUndefined();
    expect(encounterVariety('he', { varietyId: 'he-mod', label: '', basis: '' }, undefined)).toBeUndefined(); // an analyser that does not say
    expect(encounterVariety('he', undefined, undefined)).toBeUndefined();
  });

  it('a language without learning varieties records none, whatever it is told', () => {
    expect(encounterVariety('es', undefined, { languageId: 'es', varietyId: 'es-HN', basis: 'override', confidence: 1 })).toBeUndefined();
    expect(encounterVariety('de', { varietyId: 'de-AT', label: '', basis: '', evidence: 'text' }, undefined)).toBeUndefined();
  });
});

describe('every event of a card carries the variety of its text', () => {
  const cardOf = (languageId: string, unit: string, word: string, period?: unknown): any => ({
    languageId, surface: word, itemIds: [unit], packId: `pack:${languageId}`, analyzerId: 'test', confidence: 0.9, constructions: [], pronunciation: [], phrases: [],
    tokenCount: 1, provenance: 'lexicon', unconfirmed: false, context: { kind: 'sentence', confidence: 0.9, sentenceKey: `s-${word}` }, ...(period ? { period } : {}),
  });
  const ctx = (card: unknown, language?: unknown, minute = 0): any => ({ card, readerId: 'web-generic', identity: { ...PENDING_IDENTITY }, version: '0.1.0', sessionId: 's1',
    now: new Date(Date.parse('2026-11-17T10:00:00.000Z') + minute * 60_000), ...(language ? { language } : {}) });
  const UNIT = 'lemma:he:מלך:NOUN';
  const biblical = { varietyId: 'he-bib', label: 'Biblical Hebrew', basis: 'the text carries cantillation marks', evidence: 'text' };

  it('the lookup, the layers shown, a help request, a playback and a mark all say Biblical Hebrew, and all validate', () => {
    const c = ctx(cardOf('he', UNIT, 'מלך', biblical));
    const events: GoEvent[] = [buildSelectionEvent(c), buildAnalysisShownEvent(c, ['surface']), buildAssistanceEvent(c, 'morphology'),
      buildPronunciationEvent(c, { voice: 'synthetic', repeated: false }), buildMarkEvent(c, 'known')];
    for (const e of events) {
      expect(e.payload.variety, e.kind).toEqual({ varietyId: 'he-bib', basis: 'analysed' });
      expect(statedVarietyOf(e), e.kind).toEqual({ varietyId: 'he-bib', basis: 'analysed' });
      expect(validateEvent(e), e.kind).toEqual([]);
      expect(e.varietyId).toBeUndefined(); // the envelope keeps its old meaning (an enrolment's target) and is not used for this
    }
  });

  it('a reader that declares its text (Biblia) is recorded as declared, on the verse exposure too', () => {
    const language = { languageId: 'he', varietyId: 'he-bib', basis: 'override' as const, confidence: 1, source: 'biblia:Ps.65.5' };
    const c = ctx(cardOf('he', UNIT, 'מלך'), language);
    expect(buildMarkEvent(c, 'familiar').payload.variety).toEqual({ varietyId: 'he-bib', basis: 'declared' });
    const exposure = buildEncounterEvent({ languageId: 'he', itemIds: [UNIT], readerId: 'biblia', identity: { ...PENDING_IDENTITY }, version: '1', sessionId: 's1', now: new Date('2026-11-17T10:00:00.000Z'), language });
    expect(exposure.payload.variety).toEqual({ varietyId: 'he-bib', basis: 'declared' });
    expect(validateEvent(exposure)).toEqual([]);
  });

  it('a card with nothing to go on records no variety, and a Spanish card never does', () => {
    const plain = ctx(cardOf('he', UNIT, 'מלך', { varietyId: 'he-mod', label: 'Modern Hebrew', basis: 'by default', evidence: 'default' }), { languageId: 'he', varietyId: 'he-mod', basis: 'team-default', confidence: 0.3 });
    expect('variety' in buildSelectionEvent(plain).payload).toBe(false);
    expect('variety' in buildMarkEvent(plain, 'known').payload).toBe(false);
    const es = ctx(cardOf('es', 'lemma:es:libro:NOUN', 'libro'), { languageId: 'es', varietyId: 'es-HN', basis: 'override', confidence: 1 });
    expect('variety' in buildSelectionEvent(es).payload).toBe(false);
  });

  it('end to end: a word marked Known while reading the Bible is Known in Biblical Hebrew and New in Modern Hebrew', () => {
    const bible = ctx(cardOf('he', UNIT, 'מלך', biblical), undefined, 0);
    const rows = foldEvents([buildSelectionEvent(bible), buildMarkEvent(ctx(cardOf('he', UNIT, 'מלך', biblical), undefined, 1), 'known')], { modelVersion: MODEL_VERSION });
    const row = rows.find((r) => r.unitId === UNIT)!;
    expect(knowledgeInVariety(row, 'he-bib').knowledge.level).toBe('known');
    expect(knowledgeInVariety(row, 'he-mod').knowledge.level).toBe('new');
    // the same word then read in a Modern text the analyser could settle: Seen there, still Known in Biblical Hebrew
    const modern = { varietyId: 'he-mod', label: 'Modern Hebrew', basis: 'most words are Modern', evidence: 'text' };
    const news = buildSelectionEvent({ ...ctx(cardOf('he', UNIT, 'מלך', modern), undefined, 5), sessionId: 's2' });
    const later = foldEvents([buildSelectionEvent(bible), buildMarkEvent(ctx(cardOf('he', UNIT, 'מלך', biblical), undefined, 1), 'known'), news], { modelVersion: MODEL_VERSION }).find((r) => r.unitId === UNIT)!;
    expect(knowledgeInVariety(later, 'he-mod').knowledge.level).toBe('seen');
    expect(knowledgeInVariety(later, 'he-bib').knowledge.level).toBe('known');
  });
});
