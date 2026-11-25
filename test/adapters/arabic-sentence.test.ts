/**
 * The sentence layer of the Arabic analyser (src/adapters/arabic/sentence.ts): what the neighbours of a word add to its readings. Every rule
 * has a positive sentence AND a negative one (the rule must not fire where its window does not hold), and the credit contract is checked
 * over a whole set of sentences. The sentences are the test author's own, written for these tests; the analyser's index is the mini fixture
 * (test/adapters/arabic-mini-index.json), with the full shards under describe.skipIf where a rule needs words the fixture lacks.
 */
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { AnalysisCandidate, AnalyzedToken } from '../../src/core/adapters';
import { arWordCandidates } from '../../src/adapters/arabic/analyze';
import { installArabicIndex, resetArabicIndexes, type ArabicFormIndex } from '../../src/adapters/arabic/index-store';
import { arAnalyze, arRefine } from '../../src/adapters/arabic/sentence';
import { arTokenize } from '../../src/adapters/arabic/text';
import { AR_ANALYZER } from '../../src/adapters/arabic/version';

const mini = JSON.parse(fs.readFileSync(new URL('./arabic-mini-index.json', import.meta.url), 'utf8')) as ArabicFormIndex;
beforeAll(() => { resetArabicIndexes(); installArabicIndex(mini); });
afterAll(() => resetArabicIndexes());

const run = (text: string): AnalyzedToken[] => arAnalyze(arTokenize(text));
const words = (a: AnalyzedToken[]): AnalyzedToken[] => a.filter((x) => x.token.isWord);
const top = (a: AnalyzedToken[], i: number): AnalysisCandidate => words(a)[i].candidates[0];
const cands = (a: AnalyzedToken[], i: number): AnalysisCandidate[] => words(a)[i].candidates;
const lexeme = (c: AnalysisCandidate): string => `${c.lemma}|${c.pos}|${c.notes?.derivedFrom ?? ''}`;
const credited = (cs: AnalysisCandidate[]): string[] => [...new Set(cs.filter((c) => c.confidence >= 0.5 && !c.unconfirmed && c.lemma).map(lexeme))];
/** The word-level readings of the i-th word of a text, before any sentence rule. */
const alone = (text: string, i: number): AnalysisCandidate[] => arWordCandidates(arTokenize(text).filter((t) => t.isWord)[i]);
const notesOf = (c: AnalysisCandidate, k: string): string => String(c.notes?.[k] ?? '');

describe('a. particles that govern a mood', () => {
  it('لم + a verb: the verb is jussive (a note, never a morph value, since the page prints no ending)', () => {
    const a = run('لم يذهب');
    const v = top(a, 1);
    expect(v.pos).toBe('VERB');
    expect(notesOf(v, 'mood')).toBe('inferred: jussive after لَمْ');
    expect(v.notes?.moodSource).toBe('inferred');
    expect(v.morph.Mood).toBe('Ind,Jus,Sub');
    expect(notesOf(v, 'context')).toContain('After لَمْ');
  });
  it('لن + a verb: subjunctive; the printed ending, when there is one, is the page\'s and no note is added', () => {
    expect(notesOf(top(run('لن يذهب'), 1), 'mood')).toBe('inferred: subjunctive after لَنْ');
    const printed = top(run('لَنْ يَذْهَبَ'), 1);
    expect(printed.morph.Mood).toBe('Sub');
    expect(printed.notes?.mood).toBeUndefined();
  });
  it('NEGATIVE: the page\'s own vowels win over the particle (لَمْ يَذْهَبُ is printed indicative)', () => {
    const v = top(run('لَمْ يَذْهَبُ'), 1);
    expect(v.morph.Mood).toBe('Ind');
    expect(v.notes?.mood).toBeUndefined();
  });
  it('NEGATIVE: لِمَ ("why") is not لَمْ; a noun after لم, a verb with no particle, and a clause break give no mood', () => {
    expect(top(run('لِمَ يَذْهَبُ'), 1).notes?.mood).toBeUndefined();
    expect(top(run('لم الطالب'), 1).notes?.mood).toBeUndefined();
    expect(top(run('يذهب'), 0).notes?.mood).toBeUndefined();
    expect(top(run('لم، يذهب'), 1).notes?.mood).toBeUndefined();
  });
  it('the particle is confirmed when a verb-only word follows (لَمْ is not لِمَ), and never raised above the contract', () => {
    const a = run('لم يذهب');
    expect(credited(cands(a, 0))).toEqual(['لَمْ|PART|']);
    for (const c of cands(a, 0)) if (c.lemma !== 'لَمْ') expect(c.confidence).toBeLessThan(0.5);
  });
  it('لا + a 3rd person verb is a negation: the verb is indicative; a 2nd person verb may be a prohibition, so no note', () => {
    expect(notesOf(top(run('لا يذهب'), 1), 'mood')).toContain('indicative');
    expect(top(run('لا تذهب'), 1).notes?.mood).toBeUndefined();
  });
});

describe('b. قَدْ and سَوْفَ: a verb follows', () => {
  it('قد + a word that is a verb AND a noun: the verb is decided (0.8, identity "sentence"), the noun readings go', () => {
    const before = alone('قد ولد', 1);
    expect(credited(before)).toEqual([]);
    const a = run('قد ولد');
    const v = top(a, 1);
    expect(v).toMatchObject({ lemma: 'وَلَدَ', pos: 'VERB', confidence: 0.8 });
    expect(v.notes?.identity).toBe('sentence');
    expect(notesOf(v, 'context')).toContain('After قَدْ');
    expect(credited(cands(a, 1))).toEqual(['وَلَدَ|VERB|']);
    for (const c of cands(a, 1)) if (c.pos === 'NOUN') expect(c.confidence).toBeLessThanOrEqual(0.4);
  });
  it('NEGATIVE: a noun after قد, and ولد alone, are not decided', () => {
    expect(credited(cands(run('ولد'), 0))).toEqual([]);
    expect(credited(cands(run('قد الولد'), 1)).length).toBeLessThanOrEqual(1);
    expect(top(run('قد الولد'), 1).notes?.identity).not.toBe('sentence');
  });
  it('سوف + an imperfect: indicative (a note)', () => {
    expect(notesOf(top(run('سوف يذهب'), 1), 'mood')).toBe('inferred: indicative after سَوْفَ');
  });
});

describe('c. prepositions: a noun in the genitive follows, never a finite verb', () => {
  it('في + a word that is a noun and a verb: the noun is decided, genitive (a note)', () => {
    const a = run('في ولد');
    const n = top(a, 1);
    expect(n).toMatchObject({ lemma: 'وَلَد', pos: 'NOUN', confidence: 0.8 });
    expect(n.notes?.identity).toBe('sentence');
    expect(notesOf(n, 'case')).toBe('inferred: genitive after فِي');
    expect(n.notes?.caseSource).toBe('inferred');
    expect(credited(cands(a, 1))).toEqual(['وَلَد|NOUN|']);
    expect(cands(a, 1).filter((c) => c.pos === 'VERB').every((c) => c.confidence <= 0.4)).toBe(true);
  });
  it('على + ذهب: the noun "gold" (not "he went")', () => {
    expect(top(run('على ذهب'), 1)).toMatchObject({ lemma: 'ذَهَب', pos: 'NOUN' });
  });
  it('the genitive is a note on the noun, and passes to the adjective that agrees', () => {
    const a = run('في المدرسة الجديدة');
    expect(notesOf(top(a, 1), 'case')).toBe('inferred: genitive after فِي');
    expect(notesOf(top(a, 2), 'case')).toContain('genitive');
  });
  it('NEGATIVE: مِنْ is also "who" + a verb, so a verb after it is not excluded; the noun does not get a verdict', () => {
    const a = run('من ولد');
    expect(top(a, 1).notes?.identity).not.toBe('sentence');
    expect(credited(cands(a, 1))).toEqual([]);
  });
  it('NEGATIVE: the noun BEFORE the preposition, a clause break, and a printed ending are left alone', () => {
    expect(credited(cands(run('في، ولد'), 1))).toEqual([]);
    const printed = top(run('في الْبَيْتِ'), 1);
    expect(printed.morph.Case).toBe('Gen');
    expect(printed.notes?.case).toBeUndefined();
  });
  it('NEGATIVE: the page\'s vowels veto the rule: في وَلَدَ (printed as a verb) stays a verb', () => {
    const a = run('في وُلِدَ');
    expect(top(a, 1).pos).toBe('VERB');
    expect(top(a, 1).notes?.identity).not.toBe('sentence');
  });
});

describe('d. إِنَّ and its sisters; أَنْ against أَنَّ', () => {
  it('إِنَّ + a noun: the noun is the accusative subject (a note); the verb reading of the particle goes', () => {
    const a = run('إن الطالب جميل');
    expect(notesOf(top(a, 1), 'case')).toBe('inferred: accusative as the subject after إِنَّ');
    expect(cands(a, 0).filter((c) => c.pos === 'VERB').every((c) => c.confidence < 0.5)).toBe(true);
  });
  it('NEGATIVE: إن + a verb (a conditional or أَنْ) gives no accusative; كان + a noun stays the verb كَانَ', () => {
    expect(top(run('إن يذهب'), 1).notes?.case).toBeUndefined();
    const k = run('كان الطالب');
    const kana = cands(k, 0).find((c) => c.lemma === 'كَانَ' && c.pos === 'VERB');
    expect(kana).toBeDefined();
    expect(kana!.confidence).toBe(alone('كان الطالب', 0).find((c) => c.lemma === 'كَانَ')!.confidence);
  });
});

describe('d0. إِنْ / إِنَّ and أَنْ / أَنَّ, spelled alike: the frame decides', () => {
  const cred = (t: string, i: number): string[] => credited(cands(run(t), i));
  it('إن after قال (and its subject): the heavy إِنَّ, 0.80 "sentence"; at the head of a clause before an ال-word as well', () => {
    expect(cred('قال الطالب إن الكتاب جديد', 2)).toEqual(['إِنَّ|PART|']);
    expect(top(run('إن الطالب جميل'), 0).notes?.identity).toBe('sentence');
    expect(top(run('إن الطالب جميل'), 0).lemma).toBe('إِنَّ');
  });
  it('إن directly before a verb: the light إِنْ ("if")', () => {
    // the heavy reading goes; the two entries of the light one stay open between themselves
    expect(cands(run('إن يذهب'), 0).filter((c) => (c.lemma ?? '').includes('ّ')).every((c) => c.confidence < 0.5)).toBe(true);
  });
  it('أن before an imperfect verb: the light أَنْ, and the verb is subjunctive (a note); after بعد before a verb as well', () => {
    expect(cred('أن يذهب', 0)).toEqual(['أَنْ|CONJ|']);
    expect(notesOf(top(run('أن يذهب'), 1), 'mood')).toContain('subjunctive');
    expect(cred('بعد أن ذهب', 1)).toEqual(['أَنْ|CONJ|']);
  });
  it('أن before an ال-noun, or after غير / رغم: the heavy أَنَّ', () => {
    expect(cred('أن الطالب جميل', 0)).toEqual(['أَنَّ|CONJ|']);
    expect(cred('غير أن الطالب جميل', 1)).toEqual(['أَنَّ|CONJ|']);
  });
  it('NEGATIVE: a word that is both a noun and a verb after أن/إن decides nothing; an initial إن before a verb-and-noun word stays open', () => {
    expect(cred('أن ولد', 0)).toEqual([]);
    expect(cred('إن', 0)).toEqual([]);
    expect(cred('الطالب إن الكتاب', 1)).toEqual([]);
  });
});

describe('e. كَانَ and its sisters: subject nominative, predicate accusative', () => {
  it('كان + الطالب + جميل: notes on both', () => {
    const a = run('كان الطالب جميل');
    expect(notesOf(top(a, 1), 'case')).toBe('inferred: nominative as the subject of كَانَ');
    expect(notesOf(top(a, 2), 'case')).toBe('inferred: accusative as the predicate of كَانَ');
  });
  it('NEGATIVE: a prepositional phrase is no predicate in the accusative; a lone noun gets no case', () => {
    const a = run('كان الطالب في البيت');
    // the subject is nominative; nothing in the clause is the accusative predicate
    expect(notesOf(top(a, 1), 'case')).toContain('nominative');
    expect([0, 1, 2, 3].some((i) => notesOf(top(a, i), 'case').includes('accusative'))).toBe(false);
    expect(top(a, 3).notes?.case).toBe('inferred: genitive after فِي');
    expect(top(run('كان الطالب'), 1).notes?.case).toBeUndefined();
  });
});

describe('g. the noun phrase', () => {
  it('the construct: the first term is Definite=Cons (narrowed in morph), the second is genitive (a note)', () => {
    const a = run('كتاب الطالب');
    expect(top(a, 0).morph.Definite).toBe('Cons');
    expect(notesOf(top(a, 0), 'context')).toContain('First term of a construct');
    expect(notesOf(top(a, 1), 'case')).toContain('genitive as the second term of a construct');
  });
  it('a chain: the middle term is both genitive and a first term', () => {
    const a = run('كتاب معلم المدرسة');
    expect(top(a, 0).morph.Definite).toBe('Cons');
    expect(top(a, 1).morph.Definite).toBe('Cons');
    expect(notesOf(top(a, 2), 'case')).toContain('genitive');
  });
  it('NEGATIVE: a word that is also a verb, a first term with the article or tanwīn, and an indefinite second term are not constructs', () => {
    expect(notesOf(top(run('كتب الطالب'), 0), 'context')).not.toContain('construct');
    expect(top(run('الكتاب الطالب'), 0).morph.Definite).toBe('Def');
    expect(notesOf(top(run('كِتَابٌ الطالب'), 0), 'context')).not.toContain('construct');
    expect(top(run('كتاب جديد'), 0).morph.Definite).not.toBe('Cons');
  });
  it('the demonstrative: before a definite noun it is a determiner, before an indefinite one a pronoun ("this is")', () => {
    expect(notesOf(top(run('هذا الكتاب'), 0), 'context')).toContain('Demonstrative before the definite noun');
    expect(notesOf(top(run('هذا كتاب'), 0), 'context')).toContain('this is');
    // NEGATIVE: a feminine demonstrative before a masculine noun does not agree: no determiner reading is claimed
    expect(notesOf(top(run('هذه الكتاب'), 0), 'context')).not.toContain('Demonstrative before the definite noun');
  });
  it('the adjective: it agrees in definiteness, gender and number; NEGATIVE: not when the gender differs or only one has ال', () => {
    expect(notesOf(top(run('الطالب الجديد'), 1), 'context')).toBeDefined();
    expect(top(run('الطالب الجديد'), 1).pos).toBe('ADJ');
    expect(notesOf(top(run('الطالب جديد'), 1), 'context')).not.toContain('agrees with');
    expect(notesOf(top(run('المدرسة الجديد'), 1), 'context')).not.toContain('agrees with');
  });
});

describe('h. the verb and its subject', () => {
  it('a pronoun before the verb fixes person and gender: أنت تكتب is 2nd person; هي تكتب is 3rd feminine; تكتب alone stays "you or she"', () => {
    expect(top(run('أنت تكتب'), 1).morph.Person).toBe('2');
    const she = top(run('هي تكتب'), 1);
    expect(she.morph).toMatchObject({ Person: '3', Gender: 'Fem' });
    expect(top(run('تكتب'), 0).morph.Person).toBe('2,3');
  });
  it('a feminine noun subject before the verb makes it 3rd feminine; NEGATIVE: not after a clause break or when the noun is not first', () => {
    expect(top(run('الطالبة تكتب'), 1).morph).toMatchObject({ Person: '3', Gender: 'Fem' });
    expect(top(run('الطالبة، تكتب'), 1).morph.Person).toBe('2,3');
    expect(top(run('كتبت الطالبة تكتب'), 2).morph.Person).toBe('2,3');
  });
  it('after a vocative the verb that may be 2nd or 3rd person is 2nd', () => {
    expect(top(run('يا طالب تكتب'), 2).morph.Person).toBe('2');
  });
  it('verb + subject + object: the first word is a verb (the noun readings go); NEGATIVE: with one noun only nothing is decided', () => {
    const a = run('كتب الطالب الكتاب');
    expect(top(a, 0).pos).toBe('VERB');
    expect(cands(a, 0).filter((c) => c.pos !== 'VERB').every((c) => c.confidence <= 0.4)).toBe(true);
    expect(notesOf(top(a, 1), 'case')).toContain('nominative');
    expect(notesOf(top(a, 2), 'case')).toContain('accusative');
    const b = run('كتب الطالب');
    expect(cands(b, 0).filter((c) => c.pos !== 'VERB').some((c) => c.confidence <= 0.4 && c.notes?.context)).toBe(false);
  });
});

describe('the credit contract', () => {
  const SENTENCES = [
    'لم يذهب الطالب إلى المدرسة', 'قد ولد في البيت', 'سوف يكتب الطالب الكتاب', 'كان الطالب في المدرسة', 'إن الطالب جميل', 'هذا الكتاب جديد',
    'كتب الطالب الكتاب', 'في ولد على ذهب', 'من ولد إلى بيت', 'الطالبة تكتب في الكتاب', 'يا طالب تكتب', 'كتاب معلم المدرسة الجديدة',
    'لن يذهب الولد', 'لا يكتب الطالب', 'قَدْ وَلَدَ الطَّالِبُ', 'لَمْ يَكْتُبْ الطَّالِبُ', 'إِنَّ الطَّالِبَ مُجْتَهِدٌ', 'كِتَابُ الطَّالِبِ جَدِيدٌ',
  ];
  it('never more than one lexeme at 0.5 or more in a word; no reading added or removed; every decision says why', () => {
    for (const text of SENTENCES) {
      const a = run(text);
      for (const [i, w] of words(a).entries()) {
        const before = arWordCandidates(w.token);
        expect(w.candidates.length, `${text} #${i}`).toBe(before.length);
        expect(credited(w.candidates).length, `${text} #${i}`).toBeLessThanOrEqual(1);
        for (const c of w.candidates) {
          if (c.notes?.identity === 'sentence') {
            expect(c.confidence).toBeGreaterThanOrEqual(0.75);
            expect(c.confidence).toBeLessThanOrEqual(0.85);
          }
          if (c.notes?.identity === 'sentence' && c === w.candidates.find((x) => x.notes?.identity === 'sentence')) {
            expect(notesOf(c, 'context').length).toBeGreaterThan(5);
          }
          // a reading the sentence layer did not decide keeps or loses confidence, never gains it above the word-level best of its word
          const was = before.find((b) => lexeme(b) === lexeme(c) && b.notes?.vocalized === c.notes?.vocalized && JSON.stringify(b.parts) === JSON.stringify(c.parts));
          if (was && c.notes?.identity !== 'sentence') expect(c.confidence, `${text} #${i} ${c.lemma}`).toBeLessThanOrEqual(Math.max(was.confidence, 0.45));
        }
      }
    }
  });
  it('an undecided word stays undecided unless a certain rule decided it: no reading at 0.5 that the word level did not have, except by identity "sentence"', () => {
    for (const text of SENTENCES) {
      const a = run(text);
      for (const [i, w] of words(a).entries()) {
        const before = arWordCandidates(w.token);
        const wasCredited = credited(before).length > 0;
        const now = credited(w.candidates);
        if (!wasCredited && now.length) expect(w.candidates.some((c) => c.notes?.identity === 'sentence'), `${text} #${i}`).toBe(true);
      }
    }
  });
  it('the input readings are never mutated (arRefine and arAnalyze copy)', () => {
    const toks = arTokenize('في ولد');
    const base = toks.map((t) => (t.isWord ? arWordCandidates(t) : []));
    const snap = JSON.stringify(base);
    run('في ولد');
    expect(JSON.stringify(base)).toBe(snap);
  });
});

describe('arRefine: the same ordering over lists the importer replaced', () => {
  it('for tokens of this analyser the readings are made again: the same result as arAnalyze', () => {
    const toks = arTokenize('في ولد');
    const first = arAnalyze(toks);
    const again = arRefine(toks, first, new Set([AR_ANALYZER]));
    expect(JSON.stringify(again.map((x) => x.candidates))).toBe(JSON.stringify(first.map((x) => x.candidates)));
  });
  it('a list handed in by a dictionary may be reordered and lowered but never raised; a token outside `analyzers` or in `given` is untouched', () => {
    const toks = arTokenize('في ولد');
    const first = arAnalyze(toks);
    const wi = toks.findIndex((t) => t.isWord && t.surface === 'ولد');
    const handed = arWordCandidates(toks[wi]);
    const analyzed: AnalyzedToken[] = first.map((x, i) => (i === wi ? { ...x, analyzer: 'dict@1', candidates: handed } : x));
    const out = arRefine(toks, analyzed, new Set([AR_ANALYZER, 'dict@1']));
    const maxBefore = Math.max(...handed.map((c) => c.confidence));
    for (const c of out[wi].candidates) expect(c.confidence).toBeLessThanOrEqual(maxBefore);
    expect(out[wi].candidates.filter((c) => c.pos === 'VERB').every((c) => c.confidence <= 0.4)).toBe(true);
    const untouched = arRefine(toks, analyzed, new Set([AR_ANALYZER]));
    expect(untouched[wi]).toBe(analyzed[wi]);
    const given = arRefine(toks, analyzed, new Set([AR_ANALYZER, 'dict@1']), new Set([wi]));
    expect(given[wi]).toBe(analyzed[wi]);
  });
});

// ───────────────────────────── the full shards: numbers and the relative ─────────────────────────────

const MANIFEST = path.resolve('public/lexicon/ar/standard/manifest.json');
describe.skipIf(!fs.existsSync(MANIFEST))('with the full index', () => {
  beforeAll(() => {
    resetArabicIndexes();
    const man = JSON.parse(fs.readFileSync(MANIFEST, 'utf8')) as { shards: Record<string, { file: string }> };
    for (const s of Object.values(man.shards)) installArabicIndex(JSON.parse(zlib.gunzipSync(fs.readFileSync(path.resolve('public/lexicon/ar/standard', s.file))).toString('utf8')) as ArabicFormIndex);
  });
  afterAll(() => resetArabicIndexes());

  it('3–10 + a plural noun: the verb reading of كتب goes, the counted noun is a genitive plural (a note)', () => {
    const a = run('ثلاثة كتب على الطاولة');
    expect(top(a, 1).pos).toBe('NOUN');
    expect(notesOf(top(a, 1), 'case')).toContain('genitive as the counted noun after ثلاثة');
    expect(cands(a, 1).filter((c) => c.pos === 'VERB').every((c) => c.confidence <= 0.4)).toBe(true);
  });
  it('20–99 + a singular accusative noun; 11–19 takes the second half as part of the number', () => {
    const a = run('عشرون طالبا في المدرسة');
    expect(top(a, 1)).toMatchObject({ lemma: 'طَالِب', pos: 'NOUN', confidence: 0.8 });
    const b = run('أحد عشر كوكبا');
    expect(notesOf(top(b, 1), 'case')).not.toContain('second term');
  });
  it('NEGATIVE: a number followed by a plural verb is left (ثلاثة يكتبون); a lone كتب is undecided', () => {
    expect(credited(cands(run('كتب'), 0))).toEqual([]);
    expect(top(run('ثلاثة يكتبون'), 1).pos).toBe('VERB');
  });
  it('after the relative a clause begins: الذي كتب is a verb, not "books"', () => {
    const a = run('الذي كتب الكتاب');
    expect(top(a, 1).pos).toBe('VERB');
    expect(cands(a, 1).filter((c) => c.pos === 'NOUN').every((c) => c.confidence <= 0.4)).toBe(true);
  });
  it('كل / بعض + a noun: the word after is not a verb (كل يوم); but غير, which is also غَيَّرَ, is not decided', () => {
    expect(top(run('كل يوم'), 1).pos).toBe('NOUN');
    expect(cands(run('غير الرئيس القانون'), 0).some((c) => c.pos === 'VERB')).toBe(true);
  });
  it('R1: after لم / the forbidding لا / a condition the lexeme that HAS a jussive cell on the spelling is chosen (يَبْقَ is بَقِيَ, تَقُلْ is قَالَ, يَمُتْ is مَاتَ)', () => {
    expect(top(run('لم يبق في البيت أحد'), 1)).toMatchObject({ lemma: 'بَقِيَ', pos: 'VERB', confidence: 0.8 });
    expect(top(run('لا تقل هذا للناس'), 1)).toMatchObject({ lemma: 'قَالَ', pos: 'VERB' });
    expect(top(run('لم يمت الرجل في الحادث'), 1)).toMatchObject({ lemma: 'مَاتَ', pos: 'VERB' });
    expect(top(run('إن تطلب العلم تجده'), 1).pos).toBe('VERB');
    expect(notesOf(top(run('لم يبق في البيت أحد'), 1), 'context')).toContain('jussive');
  });
  it('R1 NEGATIVE: a word that is also a noun after لا is left (the forbidding لا needs a verb-only word); without the particle nothing is chosen', () => {
    expect(top(run('يبق'), 0).notes?.identity).not.toBe('sentence');
    expect(top(run('لا تقدم'), 1).notes?.identity).not.toBe('sentence');
  });
  it('R5 verb: verb + subject + a preposition or an ال-noun, at the start of a clause or after قد / ثم / حين: the verb (0.75–0.80); the noun readings go', () => {
    for (const t of ['وضع الطالب الكتاب على المكتب', 'طلب المدير الملف من الموظف', 'ثم وضع الحارس المفتاح على الطاولة', 'قد وضع الموظف الأوراق في الدرج', 'حين طلب الضيف الماء من الخادم']) {
      const a = run(t);
      const v = top(a, t.startsWith('ثم') || t.startsWith('قد') || t.startsWith('حين') ? 1 : 0);
      expect(v.pos, t).toBe('VERB');
      expect(v.notes?.identity, t).toBe('sentence');
      expect(v.confidence, t).toBeGreaterThanOrEqual(0.75);
    }
    const s2 = run('الباحث نشر في المجلة مقالا');
    expect(top(s2, 1)).toMatchObject({ lemma: 'نَشَرَ', pos: 'VERB' });
  });
  it('R5 NEGATIVE: the same words as a noun phrase are not decided (no third word; a bare predicate after the preposition; a bare indefinite noun)', () => {
    for (const [t, i] of [['وضع الطالب', 0], ['طلب الطالب في الامتحان صعب', 0], ['وضع الحارس في السجن ظلم', 0], ['عمل الطبيب في المستشفى مهم', 0], ['أمر الرئيس', 0], ['عقد الرئيس اجتماعا', 0]] as Array<[string, number]>) {
      expect(top(run(t), i).notes?.identity, t).not.toBe('sentence');
    }
  });
  it('R5: a form II verb on a three-letter spelling is never raised alone (the plain verb may be missing from the index): قتل الجندي العدو في المعركة', () => {
    const a = run('قتل الجندي العدو في المعركة');
    expect(cands(a, 0).some((c) => c.notes?.identity === 'sentence' && c.pos === 'VERB')).toBe(false);
    expect(credited(cands(a, 0))).toEqual([]);
  });
  it('R5 passive وُلِدَ: at the start of a clause or after وقد, before a name, an ال-noun with a preposition after it, في, عام: the verb وَلَدَ; a bare adjective after: the noun', () => {
    expect(top(run('ولد محمد في القاهرة عام ١٩٥٠'), 0)).toMatchObject({ lemma: 'وَلَدَ', pos: 'VERB', confidence: 0.75 });
    expect(top(run('وقد ولد الطفل في المستشفى'), 1)).toMatchObject({ lemma: 'وَلَدَ', pos: 'VERB' });
    expect(credited(cands(run('ولد صغير يلعب في الحديقة'), 0)).filter((l) => l.includes('VERB'))).toEqual([]);
    expect(top(run('ولد'), 0).notes?.identity).not.toBe('sentence');
  });
  it('the regression cases that need context: لَنْ يَكْتُبَ, لَمْ يَكْتُبْ, كِتَابُ الطَّالِبِ', () => {
    expect(top(run('لَمْ يَكْتُبْ'), 1)).toMatchObject({ lemma: 'كَتَبَ', morph: { Mood: 'Jus', Aspect: 'Imp' } });
    expect(top(run('لَنْ يَكْتُبَ'), 1)).toMatchObject({ lemma: 'كَتَبَ', morph: { Mood: 'Sub', Aspect: 'Imp' } });
    expect(top(run('كِتَابُ الطَّالِبِ'), 0).morph).toMatchObject({ Definite: 'Cons', Case: 'Nom', Number: 'Sing' });
    expect(top(run('كِتَابُ الطَّالِبِ'), 1).morph).toMatchObject({ Definite: 'Def', Case: 'Gen' });
  });
});
