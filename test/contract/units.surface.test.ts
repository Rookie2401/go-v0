// @vitest-environment node
/**
 * `surfaceFromEncounterUnitId`: the one word a reader's unit id names, for registering a surface without any passage text.
 * Until 2026-11-25 its part-of-speech list lacked PROPN, CONJ and CLF, so names, conjunctions and Thai classifiers gave nothing
 * (found by the Korean pack's linguistic audit); and a Korean homonym's number must never come back as part of the word.
 */
import { describe, expect, it } from 'vitest';
import { surfaceFromEncounterUnitId } from '../../packages/repository-contract/src';

describe('the word a unit id names', () => {
  it('a form id gives the form; a lemma id gives the lemma without its part of speech', () => {
    expect(surfaceFromEncounterUnitId('form:sq:librin', 'sq')).toBe('librin');
    expect(surfaceFromEncounterUnitId('lemma:sq:libër:NOUN', 'sq')).toBe('libër');
    expect(surfaceFromEncounterUnitId('lemma:de:gehen:VERB', 'de')).toBe('gehen');
    expect(surfaceFromEncounterUnitId('lemma:sq:libër', 'sq')).toBe('libër');
  });

  it('every part of speech a reader writes is understood: names, conjunctions and classifiers too', () => {
    expect(surfaceFromEncounterUnitId('lemma:ko:서울:PROPN', 'ko')).toBe('서울');
    expect(surfaceFromEncounterUnitId('lemma:nb:og:CONJ', 'nb')).toBe('og');
    expect(surfaceFromEncounterUnitId('lemma:th:คน:CLF', 'th')).toBe('คน');
    for (const pos of ['NOUN', 'PROPN', 'VERB', 'AUX', 'ADJ', 'ADV', 'PRON', 'DET', 'ADP', 'CONJ', 'SCONJ', 'PART', 'NUM', 'INTJ', 'CLF', 'X']) {
      expect(surfaceFromEncounterUnitId(`lemma:es:casa:${pos}`, 'es'), pos).toBe('casa');
    }
  });

  it('a Korean homonym number is identity, not spelling: the word is the headword', () => {
    expect(surfaceFromEncounterUnitId('lemma:ko:눈²:NOUN', 'ko')).toBe('눈');
    expect(surfaceFromEncounterUnitId('lemma:ko:묻다¹:VERB', 'ko')).toBe('묻다');
    expect(surfaceFromEncounterUnitId('lemma:ko:배¹²:NOUN', 'ko')).toBe('배');
    expect(surfaceFromEncounterUnitId('lemma:ko:눈:NOUN', 'ko')).toBe('눈');
    // an exponent after anything but a Hangul syllable is part of the word
    expect(surfaceFromEncounterUnitId('lemma:de:m²:NOUN', 'de')).toBe('m²');
    expect(surfaceFromEncounterUnitId('form:ko:눈²', 'ko')).toBe('눈²'); // a FORM id is the text as written
  });

  it('refuses another language, a phrase, text with a space, and anything too long', () => {
    expect(surfaceFromEncounterUnitId('lemma:ko:서울:PROPN', 'he')).toBeUndefined();
    expect(surfaceFromEncounterUnitId('phrase:ko:a_b', 'ko')).toBeUndefined();
    expect(surfaceFromEncounterUnitId('form:ko:한 국', 'ko')).toBeUndefined();
    expect(surfaceFromEncounterUnitId(`form:ko:${'가'.repeat(121)}`, 'ko')).toBeUndefined();
    expect(surfaceFromEncounterUnitId(42, 'ko')).toBeUndefined();
  });
});
