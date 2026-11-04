import { describe, expect, it } from 'vitest';
import type { GoEvent } from '../../packages/repository-contract/src';
import { MAX_ITEM_IDS, validateEvent } from '../../packages/repository-contract/src';
import { observationsOf } from '../../packages/repository-engine/src/evidence';
import { createMemoryStore } from '../../packages/repository-store/src/memory';
import { GREEK, HEBREW } from '../../packages/goreview-ecclesia/src/languages';
import { ECCLESIA_READER_ID, mapEncounter, mapEncounters, recordEncounters, scopedEvents, verseUnitIds } from '../../packages/goreview-ecclesia/src/encounters';
import type { EncounterContext } from '../../packages/goreview-ecclesia/src/encounters';
import type { ReadingEncounter } from '../../packages/goreview-ecclesia/src/contract';
import { JOHN_1, JOHN_1_1_18, lexemeOf, passage } from './fixtures/greek-john';

const identity = { learnerId: 'L-ecclesia', enrolmentId: 'E-grc', deviceId: 'D-1' };
const ctx: EncounterContext = { profile: GREEK, identity };
const AT = '2026-11-04T09:00:00.000Z';
const v1 = JOHN_1_1_18.verses[0]!;
const logos = v1.tokens[4]!; // λόγος,
const LOGOS = lexemeOf('λόγος', 'NOUN');

const allValid = (events: GoEvent[]): void => { for (const e of events) expect(validateEvent(e), e.id).toEqual([]); };
const noText = (events: GoEvent[]): void => { for (const e of events) expect(JSON.stringify(e)).not.toMatch(/Ἐν ἀρχῇ ἦν/u); };

describe('reading encounters → Repository events', () => {
  it('passage-viewed: one EncounterRecorded per verse, every form and lexeme, exposure only, typed Scripture reference', () => {
    const m = mapEncounter({ kind: 'passage-viewed', encounterId: 'r1:1', at: AT, passage: { book: 'JHN', chapter: 1, verse: 1, verseEnd: 5 }, verses: passage(1, 5).verses }, ctx);
    expect(m.events).toHaveLength(5);
    allValid(m.events); noText(m.events);
    const e = m.events[0]!;
    expect(e.kind).toBe('EncounterRecorded');
    expect(e.subject.sentenceKey).toBe('v:JHN.1.1');
    expect(e.subject.sourceRef).toMatchObject({ kind: 'scripture', translationId: 'SBLGNT', book: 'JHN', chapter: 1, verse: 1 });
    expect(e.subject.itemIds).toEqual(verseUnitIds(GREEK, v1.tokens));
    expect(e.subject.itemIds).toContain(LOGOS);
    expect(e.subject.itemIds).toContain('form:el:λόγος');
    expect(e.payload).toMatchObject({ contextKind: 'sentence', tokenCount: 17, readerId: ECCLESIA_READER_ID, language: { languageId: 'el', varietyId: 'el-koi', basis: 'book-metadata', override: false } });
    expect(e.producer).toMatchObject({ app: 'golearn-app', surface: 'ecclesia:passage-viewed' });
    expect(e.languageId).toBe('el'); expect(e.varietyId).toBe('el-koi');
    // the engine reads it as exposure of each unit, nothing more
    const obs = observationsOf(e);
    expect(obs.every((o) => o.dimension === 'exposure')).toBe(true);
    expect(obs.map((o) => o.unitId)).toContain(LOGOS);
  });

  it('is idempotent: the same encounter yields byte-identical events; a different encounter id yields other ids', () => {
    const enc: ReadingEncounter = { kind: 'word-selected', encounterId: 'r1:7', at: AT, passage: JOHN_1, verse: 1, token: logos };
    const a = mapEncounter(enc, ctx), b = mapEncounter(enc, ctx);
    expect(a).toEqual(b);
    expect(a.events[0]!.dedupeKey).toBe('ecclesia:word-selected:r1:7');
    const c = mapEncounter({ ...enc, encounterId: 'r1:8' }, ctx);
    expect(c.events[0]!.id).not.toBe(a.events[0]!.id);
    // another device, same encounter id: a different event id (ids are per device), same dedupe key per learner
    const d = mapEncounter(enc, { ...ctx, identity: { ...identity, deviceId: 'D-2' } });
    expect(d.events[0]!.id).not.toBe(a.events[0]!.id);
    expect(d.events[0]!.dedupeKey).toBe(a.events[0]!.dedupeKey);
  });

  it('the Repository store keeps one copy of a retried encounter', async () => {
    const store = createMemoryStore();
    const sink = { record: async (events: GoEvent[]) => { await store.append(identity.learnerId, events); } };
    const enc: ReadingEncounter = { kind: 'word-selected', encounterId: 'r1:9', at: AT, passage: JOHN_1, verse: 1, token: logos };
    await recordEncounters([enc], ctx, sink);
    await recordEncounters([enc], ctx, sink); // the retry
    const stored = await store.list({ learnerId: identity.learnerId });
    expect(stored).toHaveLength(1);
  });

  it('word-selected is a lookup of the form, the lexeme and the construction, with a one-word surface', () => {
    const [e] = mapEncounter({ kind: 'word-selected', encounterId: 'r1:2', at: AT, passage: JOHN_1, verse: 1, token: logos }, ctx).events;
    allValid([e!]);
    expect(e!.kind).toBe('SelectionLookedUp');
    expect(e!.subject.itemIds).toEqual(['form:el:λόγος', LOGOS, 'morph:el:NOUN:Case=Nom|Gender=Masc|Number=Sing']);
    expect(e!.payload).toMatchObject({ surface: 'λόγος', tokenCount: 1, contextKind: 'sentence', contextConfidence: 1, readerId: 'ecclesia', helpShown: [] });
    expect(observationsOf(e!).map((o) => o.counter)).toContain('lookup');
  });

  it('help (definition, morphology, translation, explanation) is AssistanceRequested: exposure and an assistance count, never a judgement', () => {
    const def = mapEncounter({ kind: 'definition-revealed', encounterId: 'r1:3', at: AT, passage: JOHN_1, verse: 1, token: logos, depth: 'brief' }, ctx).events[0]!;
    const morph = mapEncounter({ kind: 'morphology-revealed', encounterId: 'r1:4', at: AT, passage: JOHN_1, verse: 1, token: logos }, ctx).events[0]!;
    const tr = mapEncounter({ kind: 'translation-revealed', encounterId: 'r1:5', at: AT, passage: JOHN_1, verse: 1, tokens: v1.tokens }, ctx).events[0]!;
    const ex = mapEncounter({ kind: 'context-explained', encounterId: 'r1:6', at: AT, passage: JOHN_1, verse: 1, tokens: v1.tokens }, ctx).events[0]!;
    allValid([def, morph, tr, ex]); noText([def, morph, tr, ex]);
    expect(def.payload).toMatchObject({ assistance: 'gloss', layer: 'definition', depth: 'brief' });
    expect(morph.payload).toMatchObject({ assistance: 'morphology' });
    expect(morph.subject.itemIds![1]).toMatch(/^morph:el:NOUN:/);
    expect(tr.payload).toMatchObject({ assistance: 'translation', layer: 'verse' });
    expect(tr.subject.itemIds).toEqual(verseUnitIds(GREEK, v1.tokens));
    expect(ex.payload).toMatchObject({ assistance: 'grammar', layer: 'context' });
    for (const e of [def, morph, tr, ex]) {
      const obs = observationsOf(e);
      expect(obs.length).toBeGreaterThan(0);
      expect(obs.every((o) => o.dimension === 'exposure' && o.counter === 'assistance')).toBe(true);
    }
  });

  it('passage-completed is a weak self-report per verse: reading recognition without help, assisted recognition with help', () => {
    const clean = mapEncounter({ kind: 'passage-completed', encounterId: 'r1:10', at: AT, passage: { book: 'JHN', chapter: 1, verse: 1, verseEnd: 2 }, verses: passage(1, 2).verses, helpUsed: false }, ctx).events;
    const helped = mapEncounter({ kind: 'passage-completed', encounterId: 'r1:11', at: AT, passage: { book: 'JHN', chapter: 1, verse: 1, verseEnd: 2 }, verses: passage(1, 2).verses, helpUsed: true }, ctx).events;
    allValid([...clean, ...helped]);
    expect(clean).toHaveLength(2);
    expect(clean[0]!.kind).toBe('UnderstoodMarked');
    expect(clean[0]!.payload).toMatchObject({ scope: 'passage', helpUsed: false, tokenCount: 17 });
    expect(clean[0]!.evidence).toMatchObject({ quality: 'weak', assisted: false });
    const cleanObs = observationsOf(clean[0]!).filter((o) => o.unitId === LOGOS);
    expect(cleanObs.some((o) => o.dimension === 'readingRecognition' && o.outcome === 'positive')).toBe(true);
    const helpedObs = observationsOf(helped[0]!).filter((o) => o.unitId === LOGOS);
    expect(helpedObs.some((o) => o.dimension === 'assistedRecognition' && o.outcome === 'positive')).toBe(true);
    expect(helpedObs.some((o) => o.dimension === 'readingRecognition')).toBe(false);
  });

  it('word-marked carries the level (or a bookmark, noted as no evidence)', () => {
    const known = mapEncounter({ kind: 'word-marked', encounterId: 'r1:12', at: AT, passage: JOHN_1, verse: 1, token: logos, mark: 'known' }, ctx);
    const saved = mapEncounter({ kind: 'word-marked', encounterId: 'r1:13', at: AT, passage: JOHN_1, verse: 1, token: logos, mark: 'saved' }, ctx);
    allValid([...known.events, ...saved.events]);
    expect(known.events[0]!.kind).toBe('ItemMarked');
    expect(known.events[0]!.payload).toEqual({ mark: 'known' });
    expect(observationsOf(known.events[0]!).some((o) => o.selfMark === 'known')).toBe(true);
    expect(observationsOf(saved.events[0]!)).toEqual([]);
    expect(saved.notes[0]).toMatch(/bookmark/);
  });

  it('splits a verse with more than MAX_ITEM_IDS units into chunks with distinct dedupe keys', () => {
    const many = Array.from({ length: 130 }, (_, i) => ({ index: i, surface: `w${i}`, lemma: `l${i}`, pos: 'NOUN' as const }));
    const m = mapEncounter({ kind: 'passage-viewed', encounterId: 'big', at: AT, passage: { book: 'PSA', chapter: 119, verse: 1 }, verses: [{ verse: 1, tokens: many }] }, ctx);
    expect(m.events).toHaveLength(2);
    expect(m.events[0]!.subject.itemIds!.length).toBe(MAX_ITEM_IDS);
    expect(m.events[0]!.dedupeKey).toBe('ecclesia:passage-viewed:big:1:0');
    expect(m.events[1]!.dedupeKey).toBe('ecclesia:passage-viewed:big:1:1');
    allValid(m.events);
  });

  it('refuses malformed encounters instead of recording something doubtful', () => {
    expect(() => mapEncounter({ kind: 'word-selected', encounterId: '', at: AT, passage: JOHN_1, verse: 1, token: logos }, ctx)).toThrow(/encounterId/);
    expect(() => mapEncounter({ kind: 'word-selected', encounterId: 'x', at: 'yesterday', passage: JOHN_1, verse: 1, token: logos }, ctx)).toThrow(/ISO instant/);
    expect(() => mapEncounter({ kind: 'word-selected', encounterId: 'x', at: AT, passage: { book: 'JHN', chapter: 1, verse: 1, verseEnd: 5 }, verse: 9, token: logos }, ctx)).toThrow(/outside/);
    expect(() => mapEncounter({ kind: 'word-selected', encounterId: 'x', at: AT, passage: { book: 'John', chapter: 1, verse: 1 }, verse: 1, token: logos }, ctx)).toThrow(/USFM/);
  });

  it('mapEncounters keeps order and scopedEvents keeps one learner and language', () => {
    const ms = mapEncounters([
      { kind: 'passage-viewed', encounterId: 'a', at: AT, passage: JOHN_1, verses: passage(1, 1).verses },
      { kind: 'word-selected', encounterId: 'b', at: AT, passage: JOHN_1, verse: 1, token: logos },
    ], ctx);
    expect(ms.map((m) => m.kind)).toEqual(['passage-viewed', 'word-selected']);
    const he = mapEncounter({ kind: 'word-selected', encounterId: 'h', at: AT, passage: { book: 'GEN', chapter: 1, verse: 1 }, verse: 1, token: { index: 0, surface: 'בְּרֵאשִׁ֖ית', lemma: 'רֵאשִׁית', pos: 'NOUN' } }, { profile: HEBREW, identity });
    const all = [...ms.flatMap((m) => m.events), ...he.events];
    expect(scopedEvents(all, { learnerId: identity.learnerId, languageId: 'el' })).toHaveLength(2);
    expect(scopedEvents(all, { learnerId: identity.learnerId, languageId: 'he' })).toHaveLength(1);
    expect(scopedEvents(all, { learnerId: 'someone-else', languageId: 'el' })).toHaveLength(0);
  });
});
