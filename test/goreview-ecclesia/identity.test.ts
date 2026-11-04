import { describe, expect, it } from 'vitest';
import { surfaceFromEncounterUnitId, validateSourceRef } from '../../packages/repository-contract/src';
import { ARAMAIC, GREEK, HEBREW, LATIN, PROFILES, profileOf, withOverrides } from '../../packages/goreview-ecclesia/src/languages';
import {
  cardIdFor, consonantal, formId, inPassage, lexemeId, morphId, normalizeWord, passageKey, scriptureRef, unitIdsOf, verseKey,
} from '../../packages/goreview-ecclesia/src/identity';
import { itemIdFor } from '../../packages/goreview/src/scheduler/deck';

describe('language profiles', () => {
  it('file the four languages under the shared Repository ids the existing adapters use', () => {
    expect(HEBREW.repository).toMatchObject({ languageId: 'he', varietyId: 'he-bib' });
    expect(ARAMAIC.repository).toMatchObject({ languageId: 'arc', varietyId: 'arc-bib' });
    expect(GREEK.repository).toMatchObject({ languageId: 'el', varietyId: 'el-koi' });
    expect(LATIN.repository).toMatchObject({ languageId: 'la' });
    expect(LATIN.repository.varietyId).toBeUndefined();
    expect(Object.keys(PROFILES).sort()).toEqual(['arc', 'grc', 'he', 'la']);
    expect(() => profileOf('xx' as never)).toThrow(/not an Ecclesia language/);
  });
  it('can be overridden without losing the rest (a reader that files Aramaic under its Hebrew enrolment)', () => {
    const p = withOverrides(ARAMAIC, { repository: { languageId: 'he', varietyId: 'arc-bib', packId: 'pack:he', packVersion: '1' }, familiarity: { targetLow: 0.75 } });
    expect(p.repository.languageId).toBe('he');
    expect(p.familiarity).toMatchObject({ targetLow: 0.75, targetHigh: 0.9, knownFrom: 'familiar' });
    expect(lexemeId(p, 'מֶלֶךְ', 'NOUN')).toBe('lemma:he:מֶלֶךְ:NOUN');
  });
});

describe('normalisation per script', () => {
  it('strips Hebrew cantillation and keeps the vowel points', () => {
    expect(normalizeWord('he', 'בְּרֵאשִׁ֖ית')).toBe('בְּרֵאשִׁית');
    expect(normalizeWord('he', 'הָאָֽרֶץ׃')).toBe('הָאָרֶץ');
    expect(normalizeWord('arc', 'נְחַוֵּֽא׃')).toBe('נְחַוֵּא');
    expect(consonantal('בְּרֵאשִׁ֖ית')).toBe('בראשית');
  });
  it('keeps Greek accents and the elision mark, drops edge punctuation', () => {
    expect(normalizeWord('grc', 'λόγος,')).toBe('λόγος');
    expect(normalizeWord('grc', 'ἀνθρώπων·')).toBe('ἀνθρώπων');
    expect(normalizeWord('grc', 'δι’')).toBe('δι’');
    expect(normalizeWord('grc', 'θεόν.')).toBe('θεόν');
  });
  it('lower-cases Latin and removes length marks and punctuation', () => {
    expect(normalizeWord('la', 'Verbum,')).toBe('verbum');
    expect(normalizeWord('la', 'Deum.')).toBe('deum');
    expect(normalizeWord('la', 'vīta')).toBe('vita');
    expect(normalizeWord('la', 'tenebræ')).toBe('tenebræ');
  });
  it('is idempotent and NFC', () => {
    for (const [lang, w] of [['he', 'בְּרֵאשִׁ֖ית'], ['grc', 'λόγος,'], ['la', 'Verbum,']] as const) {
      const once = normalizeWord(lang, w);
      expect(normalizeWord(lang, once)).toBe(once);
      expect(once).toBe(once.normalize('NFC'));
    }
  });
});

describe('unit ids', () => {
  it('follow the Repository builders, with the profile language', () => {
    expect(lexemeId(GREEK, 'λόγος', 'NOUN')).toBe('lemma:el:λόγος:NOUN');
    expect(formId(GREEK, 'λόγος,')).toBe('form:el:λόγος');
    expect(morphId(GREEK, 'NOUN', { Case: 'Nom', Number: 'Sing', Gender: 'Masc' })).toBe('morph:el:NOUN:Case=Nom|Gender=Masc|Number=Sing');
    expect(morphId(GREEK, 'ADP', undefined)).toBeUndefined();
    expect(lexemeId(HEBREW, 'רֵאשִׁית', 'NOUN')).toBe('lemma:he:רֵאשִׁית:NOUN');
    expect(lexemeId(ARAMAIC, 'מֶלֶךְ', 'NOUN')).toBe('lemma:arc:מֶלֶךְ:NOUN');
    expect(lexemeId(LATIN, 'Verbum', 'NOUN')).toBe('lemma:la:verbum:NOUN');
  });
  it('are the same from any passage, any token position and any punctuation (stable identity)', () => {
    const a = unitIdsOf(GREEK, { index: 4, surface: 'λόγος,', lemma: 'λόγος', pos: 'NOUN', features: { Case: 'Nom', Number: 'Sing', Gender: 'Masc' } });
    const b = unitIdsOf(GREEK, { index: 16, surface: 'λόγος.', lemma: 'λόγος', pos: 'NOUN', features: { Gender: 'Masc', Number: 'Sing', Case: 'Nom' } });
    expect(a).toEqual(b);
    expect(a.morph).toBe('morph:el:NOUN:Case=Nom|Gender=Masc|Number=Sing');
  });
  it('keep distinct lexemes apart (the same letters, another part of speech or another language)', () => {
    expect(lexemeId(GREEK, 'ὁ', 'DET')).not.toBe(lexemeId(GREEK, 'ὁ', 'PRON'));
    expect(lexemeId(HEBREW, 'מֶלֶךְ', 'NOUN')).not.toBe(lexemeId(ARAMAIC, 'מֶלֶךְ', 'NOUN'));
  });
  it('are recoverable by the service helper that registers encounters without surfaces', () => {
    expect(surfaceFromEncounterUnitId(formId(GREEK, 'λόγος,'), 'el')).toBe('λόγος');
    expect(surfaceFromEncounterUnitId(lexemeId(GREEK, 'λόγος', 'NOUN'), 'el')).toBe('λόγος');
    expect(surfaceFromEncounterUnitId(lexemeId(ARAMAIC, 'מֶלֶךְ', 'NOUN'), 'arc')).toBe('מֶלֶךְ');
  });
  it('refuse what cannot be an id', () => {
    expect(() => lexemeId(GREEK, 'ὁ λόγος', 'NOUN')).toThrow(/not a lemma/);
    expect(() => formId(LATIN, '')).toThrow(/not a single word/);
    expect(() => lexemeId(GREEK, 'λόγος', 'NO UN')).toThrow(/part of speech/);
  });
  it('card ids are GoReview’s item ids', () => {
    expect(cardIdFor('lemma:el:λόγος:NOUN', 'written-recognition')).toBe(itemIdFor('lemma:el:λόγος:NOUN', 'written-recognition'));
    expect(cardIdFor('lemma:el:λόγος:NOUN', 'written-recognition')).toBe('card:written-recognition:lemma:el:λόγος:NOUN');
  });
});

describe('passages', () => {
  it('keys and verse keys are coordinates only', () => {
    expect(passageKey({ book: 'JHN', chapter: 1, verse: 1, verseEnd: 18 })).toBe('JHN.1.1-18');
    expect(passageKey({ book: 'JHN', chapter: 1, verse: 1 })).toBe('JHN.1.1');
    expect(passageKey({ book: 'JHN', chapter: 1, verse: 1, verseEnd: 1 })).toBe('JHN.1.1');
    expect(verseKey({ book: 'GEN', chapter: 1, verse: 1 }, 1)).toBe('v:GEN.1.1');
    expect(inPassage({ book: 'JHN', chapter: 1, verse: 6, verseEnd: 8 }, 7)).toBe(true);
    expect(inPassage({ book: 'JHN', chapter: 1, verse: 6, verseEnd: 8 }, 9)).toBe(false);
  });
  it('refuse malformed references', () => {
    expect(() => passageKey({ book: 'John', chapter: 1, verse: 1 })).toThrow(/USFM/);
    expect(() => passageKey({ book: 'JHN', chapter: 0, verse: 1 })).toThrow(/chapter/);
    expect(() => passageKey({ book: 'JHN', chapter: 1, verse: 5, verseEnd: 4 })).toThrow(/range end/);
  });
  it('build a valid typed Scripture reference with the profile edition and restrictions, and no text', () => {
    const ref = scriptureRef(GREEK, { book: 'JHN', chapter: 1, verse: 1, verseEnd: 18 }, 3);
    expect(ref).toMatchObject({ kind: 'scripture', provider: 'other', translationId: 'SBLGNT', languageId: 'el', book: 'JHN', chapter: 1, verse: 3, confidence: 1 });
    expect(ref.verseEnd).toBeUndefined();
    expect(validateSourceRef(ref)).toEqual([]);
    const whole = scriptureRef(LATIN, { book: 'JHN', chapter: 1, verse: 1, verseEnd: 5 });
    expect(whole).toMatchObject({ translationId: 'VULG', verse: 1, verseEnd: 5, restrictions: { textRetention: 'allowed' } });
    expect(validateSourceRef(whole)).toEqual([]);
    expect(JSON.stringify(whole)).not.toMatch(/principio/);
  });
});
