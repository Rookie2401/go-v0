import { describe, expect, it } from 'vitest';
import { adapter, applySuggestion, best, errors, patterns, phrases, run } from './helpers';
import { sqNumberToWords } from '../../src/adapters/sq';

const sq = adapter('sq');

describe('Albanian adapter', () => {
  it('reports definiteness and case (libri vs libër)', () => {
    expect(best(run('sq', 'libër'), 'libër').morph).toMatchObject({ Definite: 'Ind', Gender: 'Masc' });
    expect(best(run('sq', 'libri'), 'libri').morph).toMatchObject({ Definite: 'Def', Case: 'Nom' });
    expect(best(run('sq', 'librin'), 'librin').morph).toMatchObject({ Definite: 'Def', Case: 'Acc' });
    expect(best(run('sq', 'zemrën time'), 'zemrën').morph).toMatchObject({ Definite: 'Def', Case: 'Acc', Gender: 'Fem' });
    expect(best(run('sq', 'zemrën time'), 'zemrën').lemma).toBe('zemër');
    expect(patterns('sq', 'Kam librin.').map((p) => p.key)).toContain('definite-noun-ending');
  });

  it('keeps ë and ç in forms', () => {
    const r = run('sq', 'Çfarë? Perëndia.');
    expect(r.tokens.filter((t) => t.isWord).map((t) => t.normalized)).toEqual(['çfarë', 'perëndia']);
    expect(sq.searchNormalize('Zemër')).toBe('zemer');
  });

  it('resolves the clitics e / i / më / të from the next word, honestly', () => {
    const verb = run('sq', 'Perëndia e fali mëkatin tim.');
    expect(best(verb, 'e').pos).toBe('PRON');
    expect(best(verb, 'e').notes).toMatchObject({ clitic: 'yes' });
    expect(best(verb, 'e').morph).toMatchObject({ Person: '3', Case: 'Acc' });
    const art = run('sq', 'Ai është i ri.');
    expect(best(art, 'i').pos).toBe('DET');
    const dat = run('sq', 'Ai më do.');
    expect(best(dat, 'më').pos).toBe('PRON');
    const link = run('sq', 'Shihni e vërteta.'); // "e" before a noun → linking article; low confidence
    expect(best(link, 'e').pos).toBe('DET');
    // the subjunctive particle
    expect(best(run('sq', 'fillova të kuptoj'), 'të').pos).toBe('PART');
    // with no context the clitic stays ambiguous and low-confidence
    const alone = run('sq', 'e');
    expect(alone.analyses[0].candidates.length).toBeGreaterThan(1);
    expect(alone.analyses[0].candidates.every((c) => c.confidence <= 0.4)).toBe(true);
  });

  it('detects clitic doubling and the subjunctive të', () => {
    expect(patterns('sq', 'Perëndia e fali mëkatin tim.').map((p) => p.key)).toContain('clitic-doubling');
    expect(patterns('sq', 'Fillova të kuptoj.').map((p) => p.key)).toContain('subjunctive-te');
  });

  it('detects the three target phrases in story and Bible wording', () => {
    expect(phrases('sq', 'Kur isha i ri, kisha mëkat.').map((p) => p.pattern.join(' '))).toContain('kur jam i ri');
    expect(phrases('sq', 'Një ditë fillova të kuptoj mëkatin tim.').map((p) => p.pattern.join(' '))).toContain('filloj të kuptoj');
    expect(phrases('sq', 'Nuk besoja te Perëndia.').map((p) => p.pattern.join(' '))).toContain('besoj te _');
    expect(phrases('sq', 'që kushdo që beson tek ai të mos humbasë').map((p) => p.pattern.join(' '))).toContain('besoj te _');
  });

  it('segments sentences', () => {
    expect(sq.segmentSentences('Ai erdhi. Pse? Sepse dua.').map((s) => s.text)).toEqual(['Ai erdhi.', 'Pse?', 'Sepse dua.']);
  });

  it('unknown words stay empty', () => {
    expect(run('sq', 'kompjuter').analyses[0].candidates).toEqual([]);
  });

  describe('checkProduction', () => {
    it('after te/tek the noun is definite', () => {
      const e = errors('sq', 'besoj te libër');
      expect(e).toHaveLength(1);
      expect(e[0].category).toBe('definiteness');
      expect(applySuggestion('besoj te libër', e[0].suggestion!)).toBe('besoj te libri');
      expect(errors('sq', 'besoj te libri')).toEqual([]);
      expect(errors('sq', 'besoj te Perëndia')).toEqual([]);
    });
    it('noun + possessive takes the definite form (accusative after a preposition or verb)', () => {
      const e = errors('sq', 'kam mëkat në zemër time');
      expect(e.some((x) => x.category === 'definiteness')).toBe(true);
      const fix = e.find((x) => x.suggestion)!;
      expect(applySuggestion('kam mëkat në zemër time', fix.suggestion!)).toBe('kam mëkat në zemrën time');
      expect(errors('sq', 'kam mëkat në zemrën time')).toEqual([]);
    });
  });

  describe('speechNormalize', () => {
    it('expands numbers and strips verse markers', () => {
      const r = sq.speechNormalize('Ai ka 21 libra [16] dhe 2025 lekë, p.sh. 100%.', { isScripture: true });
      expect(r.speechText).toBe('Ai ka njëzet e një libra dhe dy mijë e njëzet e pesë lekë, për shembull njëqind përqind.');
      expect(r.normalizerVersion).toBe('speech-sq@1');
    });
    it('number words', () => {
      expect([0, 7, 14, 30, 105, 999].map(sqNumberToWord)).toEqual(['zero', 'shtatë', 'katërmbëdhjetë', 'tridhjetë', 'njëqind e pesë', 'nëntëqind e nëntëdhjetë e nëntë']);
    });
  });
});

function sqNumberToWord(n: number) { return sqNumberToWords(n); }
