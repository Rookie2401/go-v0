import { describe, expect, it } from 'vitest';
import { projectWordAnalysis } from '../../src/core/word-analysis';

describe('projectWordAnalysis', () => {
  it('keeps each meaning lane distinct and preserves nulls', () => {
    const projected = projectWordAnalysis({ lexicalMeaning: { text: 'I love', source: 'MorphGNT' } });
    expect(projected.language).toBeNull();
    expect(projected.surface).toBeNull();
    expect(projected.normalizedForm).toBeNull();
    expect(projected.lemma).toBeNull();
    expect(projected.pos).toBeNull();
    expect(projected.lexicalMeaning).toEqual({ text: 'I love', source: 'MorphGNT' });
    expect(projected.inflectedMeaning).toBeNull();
    expect(projected.contextualMeaning).toBeNull();
    expect(projected.sentenceContext).toBeNull();
    expect(projected.grammaticalFeatures).toEqual([]);
  });

  it('carries explicit feature provenance, confidence, ambiguity, and references', () => {
    expect(projectWordAnalysis({
      grammaticalFeatures: [{ key: 'Tense', value: 'Aor', source: 'MorphGNT', confidence: 0.8, ambiguity: ['aspect reading'] }],
      inflectedMeaning: { text: 'having loved', source: 'lexicon-form', confidence: 0.7 },
      contextualMeaning: { text: 'loved', source: 'sentence-context' },
      sentenceContext: { text: 'ὁ θεὸς ἠγάπησεν', source: 'JHN.3.16' },
      references: [{ label: 'John 3:16', source: 'MorphGNT', uri: 'JHN.3.16' }],
      confidence: 0.9,
      ambiguity: ['two senses remain plausible'],
    })).toEqual({
      language: null,
      surface: null,
      normalizedForm: null,
      lemma: null,
      pos: null,
      lexicalMeaning: null,
      grammaticalFeatures: [{ key: 'Tense', value: 'Aor', source: 'MorphGNT', confidence: 0.8, ambiguity: ['aspect reading'] }],
      inflectedMeaning: { text: 'having loved', source: 'lexicon-form', confidence: 0.7 },
      contextualMeaning: { text: 'loved', source: 'sentence-context' },
      sentenceContext: { text: 'ὁ θεὸς ἠγάπησεν', source: 'JHN.3.16' },
      references: [{ label: 'John 3:16', source: 'MorphGNT', uri: 'JHN.3.16' }],
      confidence: 0.9,
      ambiguity: ['two senses remain plausible'],
    });
  });

  it('bounds confidence, drops empty feature/meaning labels, and returns detached arrays', () => {
    const ambiguity = ['uncertain'];
    const features = [{ key: 'Case', value: 'Nom', ambiguity }];
    const result = projectWordAnalysis({ confidence: 4, ambiguity, grammaticalFeatures: features });
    expect(result.confidence).toBe(1);
    expect(result.ambiguity).toEqual(['uncertain']);
    expect(result.ambiguity).not.toBe(ambiguity);
    expect(result.grammaticalFeatures[0].ambiguity).not.toBe(ambiguity);
    expect(projectWordAnalysis({ lexicalMeaning: { text: '   ' }, grammaticalFeatures: [{ key: '', value: 'Plur' }] }).lexicalMeaning).toBeNull();
    expect(projectWordAnalysis({ grammaticalFeatures: [{ key: '', value: 'Plur' }] }).grammaticalFeatures).toEqual([]);
  });

  it('keeps language explicit and defaults normalizedForm to NFC surface', () => {
    const result = projectWordAnalysis({ language: 'el', surface: 'ά' });
    expect(result.language).toBe('el');
    expect(result.surface).toBe('ά');
    expect(result.normalizedForm).toBe('ά');
    expect(projectWordAnalysis({ language: '  ', surface: 'logos', normalizedForm: ' λόγος ' }).normalizedForm).toBe('λόγος');
  });

  it.each([
    { language: 'he', surface: 'כָּתְבוּ', features: [{ key: 'Number', value: 'Plur', source: 'fixture' }] },
    { language: 'la', surface: 'amāverunt', features: [{ key: 'Tense', value: 'Perf', source: 'fixture' }] },
    { language: 'es', surface: 'amarán', features: [{ key: 'Person', value: '3', source: 'fixture' }] },
    { language: 'de', surface: 'gingen', features: [{ key: 'Tense', value: 'Past', source: 'fixture' }] },
    { language: 'sq', surface: 'shkruan', features: [{ key: 'Mood', value: 'Ind', source: 'fixture' }] },
    { language: 'th', surface: 'กิน', features: [] },
    { language: 'hi', surface: 'लिखेंगे', features: [{ key: 'Tense', value: 'Fut', source: 'fixture' }] },
    { language: 'unknown', surface: 'form', features: [{ key: 'Case', value: 'Nom', source: 'fixture' }] },
  ])('keeps unsupported meaning lanes null for $language without altering supplied features', ({ language, surface, features }) => {
    const projected = projectWordAnalysis({
      language,
      surface,
      lexicalMeaning: { text: 'lemma gloss', source: 'dictionary' },
      grammaticalFeatures: features,
    });

    expect(projected.lexicalMeaning?.text).toBe('lemma gloss');
    expect(projected.inflectedMeaning).toBeNull();
    expect(projected.contextualMeaning).toBeNull();
    expect(projected.sentenceContext).toBeNull();
    expect(projected.grammaticalFeatures).toEqual(features);
    if (language === 'th') expect(projected.grammaticalFeatures).toEqual([]);
  });
});
