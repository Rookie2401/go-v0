/**
 * Albanian constructions and phrase units, on the real engine (`sqAnalyze`): every construction fires on its own shape
 * and stays silent on a near miss, and the confidence of a pattern never exceeds what its readings allow. The words are
 * those of the word list (probed with scripts/probe-sq.mts); the test sentences are the checks, not a corpus.
 */
import { describe, expect, it } from 'vitest';
import type { AnalyzedToken, PatternCandidate, RawToken } from '../../src/core';
import { makeWordTokenizer, matchPhraseRules } from '../../src/adapters/shared';
import { sqAnalyze } from '../../src/adapters/albanian/analyze';
import { sqNormalize } from '../../src/adapters/albanian/orthography';
import { SQ_CONSTRUCTIONS, detectSqConstructions } from '../../src/adapters/albanian/constructions';
import { SQ_PHRASE_RULES, SQ_PHRASE_UNITS, buildSqPhraseRules } from '../../src/adapters/albanian/phrases';

// ───────────────────────────── helpers ─────────────────────────────

const tokenize = makeWordTokenizer({ locale: 'sq', normalize: sqNormalize });
const CATALOGUE = new Set(SQ_CONSTRUCTIONS.map((c) => c.key));
/** Every key any test sentence produced: the catalogue must be covered by it, and it must be inside the catalogue. */
const emitted = new Set<string>();

function run(text: string) {
  const tokens: RawToken[] = tokenize(text);
  const analyses: AnalyzedToken[] = sqAnalyze(tokens);
  const out = detectSqConstructions(tokens, analyses);
  for (const p of out) {
    emitted.add(p.key);
    expect(p.confidence, `${text}: ${p.key}`).toBeGreaterThan(0);
    expect(p.confidence, `${text}: ${p.key}`).toBeLessThanOrEqual(0.95);
    expect(p.tokenIndexes.length).toBeGreaterThan(0);
    for (const i of p.tokenIndexes) expect(tokens[i]?.isWord, `${text}: ${p.key} token ${i}`).toBe(true);
    expect([...p.tokenIndexes].sort((a, b) => a - b)).toEqual(p.tokenIndexes);
    // the confidence of a pattern is at most the best reading of each of its tokens (the worst reading it relies on is lower still)
    for (const i of p.tokenIndexes) {
      const best = Math.max(0, ...(analyses[i]?.candidates ?? []).map((c) => c.confidence));
      if (analyses[i]?.candidates.length) expect(p.confidence, `${text}: ${p.key} at "${tokens[i].surface}"`).toBeLessThanOrEqual(best);
    }
  }
  const surfaces = (p: PatternCandidate): string => p.tokenIndexes.map((i) => tokens[i].surface).join('+');
  const find = (key: string): PatternCandidate | undefined => out.find((p) => p.key === key);
  const keys = (): string[] => out.map((p) => p.key);
  return { tokens, analyses, out, find, keys, surfaces };
}

// ───────────────────────────── the catalogue ─────────────────────────────

describe('the construction catalogue', () => {
  it('has unique keys, stages 0–9, and plain explanations with an Albanian example', () => {
    expect(CATALOGUE.size).toBe(SQ_CONSTRUCTIONS.length);
    for (const c of SQ_CONSTRUCTIONS) {
      expect(c.key, c.key).toMatch(/^[a-z]+(-[a-z]+)*$/);
      expect(Number.isInteger(c.stage) && c.stage >= 0 && c.stage <= 9, c.key).toBe(true);
      expect(c.title.length, c.key).toBeGreaterThan(5);
      expect(c.explanation.length, c.key).toBeGreaterThan(60);
      expect(c.explanation.length, c.key).toBeLessThan(330);
      expect(c.explanation, c.key).toMatch(/\(/u); // the meaning of the Albanian example, in brackets
      expect(c.example, c.key).toMatch(/ — /u);
    }
  });

  it('names a stage for every group the course lists', () => {
    const stage = (key: string): number => SQ_CONSTRUCTIONS.find((c) => c.key === key)?.stage ?? -1;
    for (const k of ['definite-noun-ending', 'linking-article-adjective', 'negation-nuk', 'question-a']) expect(stage(k), k).toBeLessThanOrEqual(1);
    for (const k of ['clitic-doubling', 'subjunctive-te', 'future', 'possessive-after-noun', 'genitive-linking-article']) {
      expect(stage(k), k).toBeGreaterThanOrEqual(2);
      expect(stage(k), k).toBeLessThanOrEqual(3);
    }
    for (const k of ['perfect', 'non-active-u', 'clitic-cluster', 'relative-clause', 'gerund-duke', 'purpose-per-te']) {
      expect(stage(k), k).toBeGreaterThanOrEqual(4);
      expect(stage(k), k).toBeLessThanOrEqual(6);
    }
    for (const k of ['admirative', 'optative', 'without-pa', 'as-soon-me-te', 'conditional']) expect(stage(k), k).toBeGreaterThanOrEqual(7);
  });

  it('shows each construction in its own example: the detector finds the key in the Albanian part', () => {
    for (const c of SQ_CONSTRUCTIONS) {
      const sentence = c.example.split(' — ')[0];
      expect(run(sentence).keys(), `${c.key}: ${sentence}`).toContain(c.key);
    }
  });
});

// ───────────────────────────── what each construction picks ─────────────────────────────

/** [sentence, key, the tokens the pattern holds, joined with +] */
const POSITIVE: Array<[string, string, string]> = [
  // nouns and the linking article
  ['Kam librin.', 'definite-noun-ending', 'librin'],
  ['Ajo e pa shtëpinë.', 'definite-noun-ending', 'shtëpinë'],
  ['Djali i mirë ka një libër.', 'linking-article-adjective', 'i+mirë'],
  ['Ai ka një libër të ri.', 'linking-article-adjective', 'të+ri'],
  ['Shtëpia është e madhe.', 'linking-article-adjective', 'e+madhe'],
  ['Libri i djalit është mbi tavolinë.', 'genitive-linking-article', 'Libri+i+djalit'],
  ['Shtëpia e vajzës është e madhe.', 'genitive-linking-article', 'Shtëpia+e+vajzës'],
  ['Perëndia e fali mëkatin tim.', 'possessive-after-noun', 'mëkatin+tim'],
  ['Libri im është mbi tavolinë.', 'possessive-after-noun', 'Libri+im'],
  ['Unë shkoj te mjeku.', 'nominative-after-preposition', 'te+mjeku'],
  ['Ajo vjen nga shkolla.', 'nominative-after-preposition', 'nga+shkolla'],
  ['Ajo jeton larg qytetit.', 'ablative-after-preposition', 'larg+qytetit'],
  ['Ai vjen prej shkollës.', 'ablative-after-preposition', 'prej+shkollës'],
  ['Ai jeton afër shkollës.', 'ablative-after-preposition', 'afër+shkollës'],
  // short pronouns
  ['Ai më pa.', 'object-pronoun-before-verb', 'më+pa'],
  ['Nuk e kam parë.', 'object-pronoun-before-verb', 'e+kam'],
  ['Ma dha.', 'clitic-cluster', 'Ma'],
  ['Ia dhashë djalit.', 'clitic-cluster', 'Ia'],
  ["Dua t'ia jap.", 'clitic-cluster', "t'ia"],
  ['Dua ta shoh.', 'clitic-cluster', 'ta'],
  ['Ai e pa djalin.', 'clitic-doubling', 'e+pa+djalin'],
  ['Perëndia e fali mëkatin tim.', 'clitic-doubling', 'e+fali+mëkatin'],
  ['I dhashë djalit librin.', 'clitic-doubling', 'I+dhashë+djalit'],
  ['Më pa mua.', 'clitic-doubling', 'Më+pa+mua'],
  ['I pashë librat.', 'clitic-doubling', 'I+pashë+librat'],
  ['Jepma!', 'imperative-pronoun', 'Jepma'],
  ['Thuaji!', 'imperative-pronoun', 'Thuaji'],
  ['Më thuaj.', 'imperative-pronoun', 'Më+thuaj'],
  // të, do, mund, nuk, mos, po, a
  ['Fillova të kuptoj.', 'subjunctive-te', 'të+kuptoj'],
  ['Dua të vij.', 'subjunctive-te', 'të+vij'],
  ['Dua ta shoh.', 'subjunctive-te', 'ta+shoh'],
  ['Dua të mos shkoj.', 'subjunctive-te', 'të+shkoj'],
  ['Ai do të punojë nesër.', 'future', 'do+të+punojë'],
  ['Ai do të punonte.', 'conditional', 'do+të+punonte'],
  ['Mund të vij nesër.', 'modal-te', 'Mund+të+vij'],
  ['Ai duhet të punojë.', 'modal-te', 'duhet+të+punojë'],
  ['Nuk punoj sot.', 'negation-nuk', 'Nuk+punoj'],
  ["S'jam i ri.", 'negation-nuk', "S'jam"],
  ["S'e pashë.", 'negation-nuk', "S'e+pashë"],
  ['Mos shko!', 'negation-mos', 'Mos+shko'],
  ['Dua të mos shkoj.', 'negation-mos', 'mos+shkoj'],
  ['Mos ma jep.', 'negation-mos', 'Mos+jep'],
  ['Ai po lexon librin.', 'progressive-po', 'po+lexon'],
  ['Ai po lexonte librin.', 'progressive-po', 'po+lexonte'],
  ['A vjen ai?', 'question-a', 'A+vjen'],
  ['A e ke parë?', 'question-a', 'A+ke'],
  // participles
  ['Ai punon duke dëgjuar muzikë.', 'gerund-duke', 'duke+dëgjuar'],
  ['Ai punon për të jetuar.', 'purpose-per-te', 'për+të+jetuar'],
  ['Ai punon për të bërë një gjë.', 'purpose-per-te', 'për+të+bërë'],
  ['Ai iku pa folur.', 'without-pa', 'pa+folur'],
  ['Me të mbaruar punën, shkova në shtëpi.', 'as-soon-me-te', 'Me+të+mbaruar'],
  ['Kam punuar sot.', 'perfect', 'Kam+punuar'],
  ['Ai ka ardhur.', 'perfect', 'ka+ardhur'],
  ['E kam parë.', 'perfect', 'kam+parë'],
  ['Ata kishin punuar.', 'pluperfect', 'kishin+punuar'],
  ['Kisha punuar sot.', 'pluperfect', 'Kisha+punuar'],
  // voice and mood
  ['Unë u lava.', 'non-active-u', 'u+lava'],
  ['Ai lahet çdo ditë.', 'non-active-present', 'lahet'],
  ['Unë lahem çdo ditë.', 'non-active-present', 'lahem'],
  ['Ai qenka i madh.', 'admirative', 'qenka'],
  ['Qofsh i lumtur!', 'optative', 'Qofsh'],
  ['Qoftë i lavdëruar!', 'optative', 'Qoftë'],
  // comparison and the relative clause
  ['Ai është më i madh se unë.', 'comparative', 'më+i+madh+se'],
  ['Ai flet më mirë se unë.', 'comparative', 'më+mirë+se'],
  ['Ky libër është më i mirë.', 'comparative', 'më+i+mirë'],
  ['Ky është shoku më i mirë.', 'superlative', 'shoku+më+i+mirë'],
  ['Ai ndihmon shokun më të vogël.', 'superlative', 'shokun+më+të+vogël'],
  ['Libri që lexoj është i mirë.', 'relative-clause', 'Libri+që+lexoj'],
  ['Burri, i cili punon, është i mirë.', 'relative-clause', 'Burri+i+cili+punon'],
];

describe('Albanian constructions: each fires on its own shape', () => {
  for (const [sentence, key, held] of POSITIVE) {
    it(`${key}: ${sentence}`, () => {
      const r = run(sentence);
      const hits = r.out.filter((p) => p.key === key);
      expect(hits.map(r.surfaces), sentence).toContain(held);
    });
  }
});

// ───────────────────────────── near misses ─────────────────────────────

/** [sentence, a key that must not be produced, why] */
const NEGATIVE: Array<[string, string]> = [
  // the definite ending: an indefinite noun
  ['Kam libër.', 'definite-noun-ending'],
  // the linking article: "e" the object pronoun, "i" the dative pronoun, a plain adjective with no article
  ['Ai e pa djalin.', 'linking-article-adjective'],
  ['Ai i dha librin.', 'linking-article-adjective'],
  ['Ai është gati.', 'linking-article-adjective'],
  // the genitive: the article before an adjective is not a genitive article
  ['Djali i mirë ka një libër.', 'genitive-linking-article'],
  ['Ai ka një libër të ri.', 'genitive-linking-article'],
  // the possessive: after an indefinite noun it is an error, not the pattern; a demonstrative is not a possessive
  ['Kam mëkat tim.', 'possessive-after-noun'],
  ['Ky libër është mbi tavolinë.', 'possessive-after-noun'],
  // case after a preposition: the other case, a preposition with an accusative, a pronoun after nga
  ['Ai vjen prej shkollës.', 'nominative-after-preposition'],
  ['Ajo vjen nga shkolla.', 'ablative-after-preposition'],
  ['Ai është në shtëpi.', 'ablative-after-preposition'],
  ['Ajo jeton afër.', 'ablative-after-preposition'],
  // the object pronoun: më = "more", u = the non-active particle, a verb with no pronoun
  ['Ai është më i madh se unë.', 'object-pronoun-before-verb'],
  ['Unë u lava.', 'object-pronoun-before-verb'],
  ['Ai punon.', 'object-pronoun-before-verb'],
  // clusters: two pronouns written apart, negation with a verb, a command with a pronoun on it
  ['Na e dha.', 'clitic-cluster'],
  ["S'jam i ri.", 'clitic-cluster'],
  ["S'e pashë.", 'clitic-cluster'],
  ['Jepma!', 'clitic-cluster'],
  // doubling: no pronoun, a plural object against "e", an object inside a preposition phrase, an indefinite object
  ['Ai pa djalin.', 'clitic-doubling'],
  ['E pashë librat.', 'clitic-doubling'],
  ['Ai e pa në shtëpi.', 'clitic-doubling'],
  ['E pashë një libër.', 'clitic-doubling'],
  // a command: with mos in front, or an ambiguous form (jep = give, gives)
  ['Mos më thuaj.', 'imperative-pronoun'],
  ['Ma jep librin.', 'imperative-pronoun'],
  // të: the linking article, the object pronoun, an undecided të at the start, and the other patterns that hold të
  ['Ai ka një libër të ri.', 'subjunctive-te'],
  ['Të shoh.', 'subjunctive-te'],
  ['Ai do të punojë nesër.', 'subjunctive-te'],
  ['Mund të vij nesër.', 'subjunctive-te'],
  ['Ai punon për të jetuar.', 'subjunctive-te'],
  // do: the verb dua; do të with a present is not a conditional, with an imperfect not a future
  ['Ai do librin.', 'future'],
  ['Ai do të punojë nesër.', 'conditional'],
  ['Ai do të punonte.', 'future'],
  // modal: dua të is not mund të
  ['Dua të vij.', 'modal-te'],
  // nuk and mos: each stays with its own
  ['Mos shko!', 'negation-nuk'],
  ['Nuk punoj sot.', 'negation-mos'],
  // po = "yes", a verb with no po
  ['Po, punoj.', 'progressive-po'],
  ['Ai lexon librin.', 'progressive-po'],
  // the question: no a, a not at the start of a clause
  ['Ai vjen.', 'question-a'],
  // participles: duke, për, pa, me with no participle after them
  ['Ai punon.', 'gerund-duke'],
  ['Ai punon për një libër.', 'purpose-per-te'],
  ['Ai iku pa libër.', 'without-pa'],
  ['Ai e pa djalin.', 'without-pa'],
  ['Ai flet me mjekun.', 'as-soon-me-te'],
  // the perfect: kam with a noun, the pluperfect "kisha" as the noun kishë
  ['Kam libër.', 'perfect'],
  ['Ai ka një libër.', 'perfect'],
  ['Kisha është e madhe.', 'pluperfect'],
  ['Kam punuar sot.', 'pluperfect'],
  ['Kisha punuar sot.', 'perfect'],
  // non-active: u as the pronoun "to them", an active verb, duhet (a verb of its own)
  ['U dhashë librat.', 'non-active-u'],
  ['Ai punon.', 'non-active-present'],
  ['Ai duhet të punojë.', 'non-active-present'],
  // moods
  ['Ai është i mirë.', 'admirative'],
  ['Ai është i mirë.', 'optative'],
  ['Në qoftë se vjen, shkoj.', 'optative'],
  ['Qoftë burrë, qoftë grua.', 'optative'],
  // comparison: më shumë = "more", a comparative is not a superlative, a superlative needs the noun right before më
  ['Ai flet më shumë.', 'comparative'],
  ['Ky libër është më i mirë.', 'superlative'],
  ['Ky është shoku më i mirë.', 'comparative'],
  // the relative clause: që as "that" after a verb, an adverb before që
  ['Mendoj që vjen.', 'relative-clause'],
  ['Kështu që ai punon.', 'relative-clause'],
];

describe('Albanian constructions: a near miss stays silent', () => {
  for (const [sentence, key] of NEGATIVE) {
    it(`no ${key}: ${sentence}`, () => {
      expect(run(sentence).keys(), sentence).not.toContain(key);
    });
  }
});

// ───────────────────────────── honesty ─────────────────────────────

/** A copy of the analyses in which one token's chosen reading is changed. */
function altered(text: string, surface: string, change: (c: AnalyzedToken['candidates'][number]) => void): { tokens: RawToken[]; out: PatternCandidate[] } {
  const tokens = tokenize(text);
  const analyses = sqAnalyze(tokens).map((a) => ({ ...a, candidates: a.candidates.map((c) => ({ ...c, notes: { ...(c.notes ?? {}) }, morph: { ...c.morph } })) }));
  const i = tokens.findIndex((t) => t.surface === surface);
  expect(i, surface).toBeGreaterThanOrEqual(0);
  change(analyses[i].candidates[0]);
  return { tokens, out: detectSqConstructions(tokens, analyses) };
}

describe('Albanian constructions: the confidence is never more than the readings allow', () => {
  it('a disputed reading caps the pattern at 0.5', () => {
    const base = run('Ai ka ardhur.').find('perfect');
    expect(base?.confidence).toBeGreaterThan(0.5);
    const r = altered('Ai ka ardhur.', 'ardhur', (c) => { c.notes = { ...c.notes, disputed: 'the word list and the UniParser analyzer differ on this reading' }; });
    expect(r.out.find((p) => p.key === 'perfect')?.confidence).toBeLessThanOrEqual(0.5);
  });

  it('an unconfirmed reading (a rule\'s guess) caps the pattern at 0.5', () => {
    const r = altered('Ai ka ardhur.', 'ka', (c) => { c.unconfirmed = true; });
    expect(r.out.find((p) => p.key === 'perfect')?.confidence).toBeLessThanOrEqual(0.5);
  });

  it('the pattern is no more certain than the weakest reading it relies on', () => {
    const r = altered('Ai ka ardhur.', 'ardhur', (c) => { c.confidence = 0.3; });
    expect(r.out.find((p) => p.key === 'perfect')?.confidence).toBeLessThanOrEqual(0.3);
    const s = altered('Kam librin.', 'librin', (c) => { c.confidence = 0.42; });
    expect(s.out.find((p) => p.key === 'definite-noun-ending')?.confidence).toBeLessThanOrEqual(0.42);
  });

  it('a word the list does not have (a guess by its ending) gives a pattern of 0.5 at most', () => {
    const r = run('Ai ka vizituar Nartën.');
    expect(r.find('definite-noun-ending')?.confidence).toBeLessThanOrEqual(0.5);
    const lone = run('Ai ka lëvduar.');
    expect(lone.find('perfect')?.confidence).toBeLessThanOrEqual(0.5);
  });

  it('a reading that has a rival the sentence did not rule out is capped at 0.55', () => {
    // libri: the definite nominative, or "of a book"
    const r = run('Libri është mbi tavolinë.');
    expect(r.find('definite-noun-ending')?.confidence).toBeLessThanOrEqual(0.55);
    // kisha: the sentence layer reads it as the auxiliary because a participle follows (sentence-perfect.ts), so the
    // pattern is as certain as that reading and no longer capped as an undecided rival
    expect(run('Kisha punuar sot.').find('pluperfect')?.confidence).toBeLessThanOrEqual(0.85);
    expect(run('Kisha punuar sot.').find('pluperfect')?.confidence).toBeGreaterThan(0.55);
    // and then the noun reading is not also counted as a definite ending
    expect(run('Kisha punuar sot.').keys()).not.toContain('definite-noun-ending');
  });

  it('mund / duhet are read by their written form and capped at 0.7', () => {
    expect(run('Mund të vij nesër.').find('modal-te')?.confidence).toBeLessThanOrEqual(0.7);
    expect(run('Ai duhet të punojë.').find('modal-te')?.confidence).toBeLessThanOrEqual(0.7);
  });

  it('a little word with a rival the sentence did not decide is left unnamed', () => {
    // "Të shoh" is "I see you" or "(that) I see": the sentence does not say
    const r = run('Të shoh.');
    expect(r.keys()).not.toContain('subjunctive-te');
    expect(r.keys()).not.toContain('object-pronoun-before-verb');
    // "po" alone is "yes", not the progressive particle
    expect(run('Po, punoj.').keys()).not.toContain('progressive-po');
  });

  it('detecting patterns never changes the readings', () => {
    const tokens = tokenize('Perëndia e fali mëkatin tim. Dua t\'ia jap. Ai është më i madh se unë.');
    const analyses = sqAnalyze(tokens);
    const before = JSON.stringify(analyses);
    detectSqConstructions(tokens, analyses);
    expect(JSON.stringify(analyses)).toBe(before);
  });

  it('an empty sentence, punctuation and unknown words give nothing and do not throw', () => {
    expect(run('').out).toEqual([]);
    expect(run('. , !').out).toEqual([]);
    expect(run('Zhurmuesi punon.').out).toEqual([]);
  });

  it('gives the make-up of a fused cluster in the explanation', () => {
    expect(run('Ma dha.').find('clitic-cluster')?.explanation).toContain('ma = më + e');
    expect(run("Dua t'ia jap.").find('clitic-cluster')?.explanation).toContain("t'ia = ");
  });
});

// ───────────────────────────── the catalogue and the detector agree ─────────────────────────────

describe('catalogue coverage', () => {
  it('every key of the catalogue is produced by at least one test sentence, and every produced key is in the catalogue', () => {
    // make sure the whole table above has run (the tests of this file may be filtered)
    for (const [s] of POSITIVE) run(s);
    for (const [s] of NEGATIVE) run(s);
    for (const c of SQ_CONSTRUCTIONS) run(c.example.split(' — ')[0]);
    const missing = SQ_CONSTRUCTIONS.map((c) => c.key).filter((k) => !emitted.has(k));
    const unknown = [...emitted].filter((k) => !CATALOGUE.has(k));
    expect(missing).toEqual([]);
    expect(unknown).toEqual([]);
  });

  it('every pattern carries the catalogue\'s title', () => {
    const r = run('Perëndia e fali mëkatin tim.');
    for (const p of r.out) expect(p.title).toBe(SQ_CONSTRUCTIONS.find((c) => c.key === p.key)?.title);
  });
});

// ───────────────────────────── the seed adapter's checks (src/adapters/sq.ts) ─────────────────────────────

describe('the new code keeps what the seed adapter did (test/adapters/sq.test.ts)', () => {
  const patterns = (text: string): string[] => run(text).keys();
  const phrases = (text: string): string[] => {
    const tokens = tokenize(text);
    return matchPhraseRules(tokens, sqAnalyze(tokens), SQ_PHRASE_RULES, sqNormalize).map((p) => p.pattern.join(' '));
  };

  it('definite-noun-ending, clitic-doubling, subjunctive-te, possessive-after-noun', () => {
    expect(patterns('Kam librin.')).toContain('definite-noun-ending');
    expect(patterns('Perëndia e fali mëkatin tim.')).toContain('clitic-doubling');
    expect(patterns('Perëndia e fali mëkatin tim.')).toContain('possessive-after-noun');
    expect(patterns('Fillova të kuptoj.')).toContain('subjunctive-te');
  });

  it('the three phrase rules', () => {
    expect(phrases('Kur isha i ri, kisha mëkat.')).toContain('kur jam i ri');
    expect(phrases('Një ditë fillova të kuptoj mëkatin tim.')).toContain('filloj të kuptoj');
    expect(phrases('Nuk besoja te Perëndia.')).toContain('besoj te _');
    expect(phrases('që kushdo që beson tek ai të mos humbasë')).toContain('besoj te _');
    expect(phrases('Besoj në Perëndi.')).toContain('besoj te _');
  });

  it('the seed rules come first and keep their patterns', () => {
    expect(SQ_PHRASE_RULES.slice(0, 3).map((r) => r.pattern)).toEqual([['kur', 'jam', 'i', 'ri'], ['filloj', 'të', 'kuptoj'], ['besoj', 'te', '_']]);
  });
});

// ───────────────────────────── phrase units ─────────────────────────────

describe('Albanian phrase units', () => {
  const found = (text: string): string[] => {
    const tokens = tokenize(text);
    return matchPhraseRules(tokens, sqAnalyze(tokens), SQ_PHRASE_RULES, sqNormalize).map((p) => p.pattern.join(' '));
  };

  /** [sentence, the pattern it must hold] */
  const SENTENCES: Array<[string, string]> = [
    ['Për shembull, ai punon.', 'për shembull'],
    ['Me të vërtetë, ai erdhi.', 'me të vërtetë'],
    ['Për fat të mirë, ai erdhi.', 'për fat të mirë'],
    ['Sa është ora?', 'sa është ora'],
    ['Si je?', 'si je'],
    ['Si jeni?', 'si je'],
    ['Si quhesh?', 'si quhesh'],
    ['Unë quhem Ana.', 'quhem _'],
    ['Sa vjeç je?', 'sa vjeç je'],
    ['Mirë se vini!', 'mirë se vini'],
    ['Paç fat!', 'paç fat'],
    ['Ju lutem!', 'ju lutem'],
    ['Më vjen keq.', 'më vjen keq'],
    ['Ditën e mirë!', 'ditën e mirë'],
    ['Një herë e një kohë ishte një mbret.', 'një herë e një kohë'],
    ['Çdo ditë ai punon.', 'çdo ditë'],
    ['Në qoftë se vjen, shkoj.', 'në qoftë se'],
    ['Ka shumë frikë nga qeni.', 'kam frikë nga _'],
    ['Kemi nevojë për ndihmë.', 'kam nevojë për _'],
    ['Më pëlqen filmi.', 'më pëlqej'],
    ['Na duhet ndihmë.', 'më duhet'],
    ['Unë jam nga Shqipëria.', 'jam nga _'],
    ['Ai vjen nga Tirana.', 'vij nga _'],
    ['Ai shkon tek mjeku.', 'shkoj te _'],
    ['Flas me shokun.', 'flas me _'],
    ['Ata flasin për luftën.', 'flas për _'],
    ['Kujdesem për familjen.', 'kujdesem për _'],
    ['Marrim pjesë në takim.', 'marr pjesë në _'],
    ['Sot bën ftohtë.', 'bëj ftohtë'],
    ['Bie shi sot.', 'bie shi'],
    ['Sa më shumë lexoj, aq më shumë kuptoj.', 'sa më aq më'],
    ['Jo vetëm që punon, por edhe këndon.', 'jo vetëm por edhe'],
  ];
  for (const [sentence, pattern] of SENTENCES) {
    it(`${pattern}: ${sentence}`, () => {
      expect(found(sentence), sentence).toContain(pattern);
    });
  }

  it('does not match a unit that only looks like one', () => {
    expect(found('Si është ai?')).not.toContain('si je');
    expect(found('Ai më fali.')).not.toContain('më falni');
    expect(found('Ai vjen.')).toEqual([]);
  });

  it('every unit has a gloss, a kind and words, and parses into a rule that matches its own words', () => {
    const rules = buildSqPhraseRules();
    expect(rules).toHaveLength(SQ_PHRASE_UNITS.length);
    expect(SQ_PHRASE_RULES).toHaveLength(SQ_PHRASE_UNITS.length + 3);
    for (const r of rules) {
      expect(r.gloss.length, r.display).toBeGreaterThan(1);
      expect(['collocation', 'formula', 'idiom', 'frame', 'construction']).toContain(r.kind);
      expect(r.pattern.length, r.display).toBeGreaterThan(1);
    }
    // the first alternative of every item, a slot as a name: the rule finds its own words
    for (const [spec, , , display] of SQ_PHRASE_UNITS) {
      const words = spec.split(/\s+/u).filter((w) => w !== '..').flatMap((w) => (w === '...' ? ['gjë', 'tjetër'] : w === '_' ? ['Ana'] : [w.split('|')[0]]));
      const tokens = tokenize(words.join(' '));
      const analyses: AnalyzedToken[] = tokens.map((t) => ({ token: t, candidates: [], analyzer: 'test' }));
      const hits = matchPhraseRules(tokens, analyses, rules, sqNormalize);
      expect(hits.map((h) => h.display), spec).toContain(display ?? rules[SQ_PHRASE_UNITS.findIndex((u) => u[0] === spec)].display);
    }
  });

  it('has no two units with the same words', () => {
    const seen = new Set<string>();
    for (const r of SQ_PHRASE_RULES) {
      const key = r.pattern.join(' ');
      expect(seen.has(key), key).toBe(false);
      seen.add(key);
    }
  });
});
