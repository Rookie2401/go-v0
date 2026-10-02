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
    expect(best(verb, 'e').morph).toMatchObject({ Person: '3', Case: 'Acc', Clitic: 'Yes' });
    // the linking article and its adjective are one unit: both pieces carry the unit's lemma, "i ri"
    const art = run('sq', 'Ai është i ri.');
    expect(best(art, 'i')).toMatchObject({ lemma: 'i ri', pos: 'ADJ' });
    expect(best(art, 'i').unit).toBeDefined();
    expect(best(art, 'ri')).toMatchObject({ lemma: 'i ri', pos: 'ADJ' });
    const dat = run('sq', 'Ai më do.');
    expect(best(dat, 'më').pos).toBe('PRON');
    const link = run('sq', 'Shihni e vërteta.'); // "e" before an articulated adjective → its linking article
    expect(best(link, 'e')).toMatchObject({ lemma: 'i vërtetë', pos: 'ADJ' });
    // the subjunctive particle
    expect(best(run('sq', 'fillova të kuptoj'), 'të').pos).toBe('PART');
    // with no context the little word keeps every reading, and none is presented as certain
    const alone = run('sq', 'e');
    expect(alone.analyses[0].candidates.length).toBeGreaterThan(1);
    expect(new Set(alone.analyses[0].candidates.map((c) => c.pos))).toEqual(new Set(['PRON', 'DET', 'CONJ']));
    expect(alone.analyses[0].candidates.every((c) => c.confidence <= 0.6)).toBe(true);
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

  it('an unknown word is empty or a marked guess — never a confident reading', () => {
    expect(run('sq', 'xhuxhmaxhuxh').analyses[0].candidates).toEqual([]);
    for (const w of ['shqyrtoni', 'blorgu', 'flimpon']) {
      for (const c of run('sq', w).analyses[0].candidates) {
        expect(c.unconfirmed, w).toBe(true);
        expect(c.gloss, w).toBeUndefined();
        expect(c.confidence, w).toBeLessThanOrEqual(0.5);
      }
    }
  });

  it('names its sources, its varieties and its limits', () => {
    expect(sq.version).toBe('3');
    expect(Object.values(sq.sources ?? {}).every((s) => s.reviewStatus === 'machine-drafted')).toBe(true);
    expect(Object.keys(sq.varieties ?? {})).toEqual(expect.arrayContaining(['sq', 'aln', 'sq-ascii']));
    expect(sq.support.lemmatization).toBe('seed-only');
    expect(sq.support.limitations.join(' ')).toMatch(/no native speaker/);
    expect(sq.lemmaVariants?.('i mirë')).toEqual(['mirë']);
    expect(sq.lemmaVariants?.('libër')).toEqual([]);
  });

  it('refine leaves a token that is not its own exactly as it came', () => {
    const r = run('sq', 'Ai e pa librin.');
    const foreign = r.analyses.map((a, i) => (i === 0 ? { ...a, analyzer: 'author@1', candidates: [{ lemma: 'x', morph: {}, confidence: 1 }] } : a));
    const out = sq.refine!(r.tokens, foreign, new Set([r.analyses[1].analyzer]));
    expect(out[0]).toBe(foreign[0]);
    expect(out.find((a) => a.token.normalized === 'librin')?.candidates[0].lemma).toBe('libër');
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
