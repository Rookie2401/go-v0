/**
 * Modern Greek prose (2026-11-13). The audit of that date read two Wikipedia articles and found that some of the commonest written forms of the
 * language had no reading: σε + the article written as one word (στο ×7, στον, στις, στους) and abbreviations (π.χ. ×5, αρχ.). Until then
 * Modern Greek had never been measured and Greek had no gold set.
 *
 *  - The rules (contractions.ts, abbreviations.ts, the sentence splitter) are tested with the compiled core alone: they need no index.
 *  - The regression reads 294 words of real prose (greek-modern-gold.json: the sentences are Greek Wikipedia's, CC BY-SA 4.0; the lemma and part
 *    of speech of every word were written by hand before looking at the analyser, by a Claude session, NOT by a native speaker) with the full
 *    indexes installed, and holds the analyser to what it reaches today. It runs only where the indexes are built (they are local assets).
 *    GREEK_MODERN_REPORT=1 prints every disagreement.
 */
import fs from 'node:fs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { AnalysisCandidate, RawToken } from '../../src/core';
import { elAdapter } from '../../src/adapters/el';
import { resetElPeriodMemory } from '../../src/adapters/greek/analyze';
import { elAbbreviation, elAbbreviationStop } from '../../src/adapters/greek/abbreviations';
import { seContraction } from '../../src/adapters/greek/contractions';
import { type GreekFormIndex, installGreekIndex, resetGreekIndexes } from '../../src/adapters/greek/index-store';

function read(text: string): { tokens: RawToken[]; first: Array<AnalysisCandidate | undefined>; all: AnalysisCandidate[][] } {
  resetElPeriodMemory();
  const tokens = elAdapter.tokenize(text);
  const analyses = elAdapter.analyze(tokens);
  return { tokens, first: analyses.map((a) => a.candidates[0]), all: analyses.map((a) => a.candidates) };
}
const of = (r: ReturnType<typeof read>, surface: string, nth = 0): AnalysisCandidate[] => {
  const hits = r.tokens.map((t, i) => (t.isWord && t.surface === surface ? i : -1)).filter((i) => i >= 0);
  if (hits[nth] === undefined) throw new Error(`no token "${surface}" (${nth})`);
  return r.all[hits[nth]];
};

describe('σε + the article, written as one word', () => {
  const FORMS: Array<[string, string, Record<string, string>]> = [
    ['στο', 'το', { Case: 'Acc', Number: 'Sing', Gender: 'Neut' }], ['στον', 'τον', { Case: 'Acc', Number: 'Sing', Gender: 'Masc' }],
    ['στη', 'την', { Case: 'Acc', Number: 'Sing', Gender: 'Fem' }], ['στην', 'την', { Case: 'Acc', Number: 'Sing', Gender: 'Fem' }],
    ['στου', 'του', { Case: 'Gen', Number: 'Sing', Gender: 'Masc' }], ['στης', 'της', { Case: 'Gen', Number: 'Sing', Gender: 'Fem' }],
    ['στους', 'τους', { Case: 'Acc', Number: 'Plur', Gender: 'Masc' }], ['στις', 'τις', { Case: 'Acc', Number: 'Plur', Gender: 'Fem' }],
    ['στα', 'τα', { Case: 'Acc', Number: 'Plur', Gender: 'Neut' }], ['στων', 'των', { Case: 'Gen', Number: 'Plur' }],
  ];

  it('each of the ten is read as the preposition σε with its article as a part of the word', () => {
    for (const [form, article, morph] of FORMS) {
      const c = read(`Πήγε ${form} σπίτι.`).all[1][0];
      expect(c, form).toMatchObject({ lemma: 'σε', pos: 'ADP', varieties: ['el-mod'], origin: 'rule' });
      expect(c.gloss, form).toMatch(/\+ the$/);
      expect(c.notes?.contraction, form).toBe(`σε + ${article}`);
      expect(c.parts, form).toHaveLength(2);
      expect(c.parts![0], form).toMatchObject({ text: 'σ', start: 0, end: 1, lemma: 'σε', pos: 'ADP' });
      expect(c.parts![1], form).toMatchObject({ text: form.slice(1), start: 1, end: form.length, lemma: 'ο', pos: 'DET' });
      expect(c.parts![1].morph, form).toMatchObject({ ...morph, Definite: 'Def', PronType: 'Art' });
      expect(c.parts!.map((p) => p.text).join(''), form).toBe(form);
    }
  });

  it('a spelling that serves two articles gives both, the usual one first, and says what the other is', () => {
    const sto = read('Πήγε στο σπίτι.').all[1];
    expect(sto.filter((c) => c.lemma === 'σε').map((c) => c.parts![1].morph!.Gender)).toEqual(['Neut', 'Masc']);
    expect(sto[0].confidence).toBeGreaterThan(sto[1].confidence);
    expect(String(sto[1].notes?.reading)).toMatch(/without its final ν/);
    const stou = read('Πήγε στου Γιάννη.').all[1];
    expect(stou.filter((c) => c.lemma === 'σε').map((c) => c.parts![1].morph!.Gender)).toEqual(['Masc', 'Neut']);
    expect(read('στων').all[0][0].parts![1].morph).not.toHaveProperty('Gender'); // the genitive plural has one form for the three genders
  });

  it('a capital first letter is the same word, and the sentence is read as Modern Greek', () => {
    const r = read('Στην Ευρώπη το ψωμί είναι η βασική τροφή.');
    expect(r.first[0]).toMatchObject({ lemma: 'σε', pos: 'ADP', notes: { period: 'el-mod' } });
    expect(r.first[0]!.parts![1]).toMatchObject({ text: 'την', lemma: 'ο' });
  });

  it('the list is closed: σε itself, the bare articles and look-alikes are not contractions', () => {
    for (const w of ['σε', 'το', 'την', 'στ', 'στοά', 'στόμα', 'στους;', 'στό']) expect(seContraction(w), w).toBeUndefined();
    expect(read('Η στοά είναι μεγάλη.').all[1].some((c) => c.notes?.contraction)).toBe(false);
  });
});

describe('a Modern sentence that quotes an ancient word', () => {
  it('stays Modern: the polytonic word is its quotation, and the Modern readings stay first', () => {
    const r = read('Το ψωμί (αρχ. ἄρτος) είναι στο σπίτι και όχι στην αγορά.');
    expect(of(r, 'στο')[0]).toMatchObject({ lemma: 'σε', notes: { period: 'el-mod' } });
    expect(String(of(r, 'στο')[0].notes?.periodBasis)).toBe('monotonic spelling with 1 quoted polytonic word; read as Modern Greek');
    expect(of(r, 'στην')[0].lemma).toBe('σε');
  });

  it('polytonic text stays ancient: a properly spelled ancient sentence has no word that begins with a vowel and no breathing', () => {
    const john = read('Ἐν ἀρχῇ ἦν ὁ λόγος, καὶ ὁ λόγος ἦν πρὸς τὸν θεόν, καὶ θεὸς ἦν ὁ λόγος.');
    expect(john.first[0]?.notes?.period).toBe('el-koi');
    // an ancient quotation with Modern words around it that show neither system (they begin with consonants) is still read as ancient
    const prayer = read('Τὸν ἄρτον ἡμῶν τὸν ἐπιούσιον δὸς ἡμῖν σήμερον, Χριστιανική Προσευχή.');
    expect(['el-koi', 'el-att']).toContain(prayer.first[0]?.notes?.period);
  });
});

describe('Modern Greek abbreviations', () => {
  it('π.χ., κ.λπ., κ.ά., κ.ο.κ. and the others written with inner stops are read whole, with the words they stand for', () => {
    const r = read('Περιέχει φρούτα (π.χ. μήλα), ζάχαρη κ.λπ., τυρί κ.ά. και ούτω καθεξής, κ.ο.κ. στις 5 μ.μ. περίπου.');
    expect(of(r, 'π.χ')[0]).toMatchObject({ lemma: 'π.χ.', pos: 'ADV', origin: 'rule', varieties: ['el-mod'], notes: { abbreviation: 'παραδείγματος χάριν' } });
    expect(of(r, 'π.χ')[0].gloss).toBe('for example (short for παραδείγματος χάριν)');
    expect(of(r, 'κ.λπ')[0]).toMatchObject({ lemma: 'κ.λπ.', notes: { abbreviation: 'και λοιπά' } });
    expect(of(r, 'κ.ά')[0].notes?.abbreviation).toBe('και άλλα');
    expect(of(r, 'κ.ο.κ')[0].notes?.abbreviation).toBe('και ούτω καθεξής');
    expect(of(r, 'μ.μ')[0].gloss).toMatch(/^p\.m\./);
  });

  it('π.Χ. is "before Christ" and π.χ. "for example": the capital decides', () => {
    const r = read('Τον 5ο αι. π.Χ. και το 300 μ.Χ. έτρωγαν π.χ. ψωμί.');
    expect(of(r, 'π.Χ')[0]).toMatchObject({ lemma: 'π.Χ.', notes: { abbreviation: 'προ Χριστού' } });
    expect(of(r, 'μ.Χ')[0].notes?.abbreviation).toBe('μετά Χριστόν');
    expect(of(r, 'π.χ')[0].notes?.abbreviation).toBe('παραδείγματος χάριν');
    expect(of(r, 'αι')[0]).toMatchObject({ lemma: 'αι.', pos: 'NOUN', notes: { abbreviation: 'αιώνας' } });
  });

  it('a short one is an abbreviation only with its full stop: αρχ. before an ancient word, but not the letters alone', () => {
    const r = read('Το ψωμί (αρχ. ἄρτος) είναι τροφή.');
    expect(of(r, 'αρχ')[0]).toMatchObject({ lemma: 'αρχ.', notes: { abbreviation: 'αρχαία ελληνική' } });
    expect(elAbbreviation('αρχ', 'αρχ', false)).toBeUndefined();
    expect(elAbbreviation('κ', 'κ', false)).toBeUndefined();
    expect(elAbbreviation('κ', 'κ', true)?.expansion).toBe('κύριος');
    expect(elAbbreviation('αι', 'αι', false)).toBeUndefined();
    expect(elAbbreviation('μ.χ', 'μ.χ', true)).toBeUndefined(); // only μ.Χ. with its capital is an abbreviation
    expect(read('Το αρχ είναι λάθος.').all[1].some((c) => c.notes?.abbreviation)).toBe(false);
  });

  it('names written as initials in capitals are read as the name before the diagram-label reading, in Modern text', () => {
    const r = read('Ζει στις ΗΠΑ και όχι στην ΕΕ.');
    expect(of(r, 'ΗΠΑ')[0]).toMatchObject({ lemma: 'ΗΠΑ', notes: { abbreviation: 'Ηνωμένες Πολιτείες Αμερικής' } });
    expect(of(r, 'ΕΕ')[0].gloss).toMatch(/European Union/);
    expect(of(r, 'ΗΠΑ').some((c) => /diagram label/.test(String(c.notes?.rule)))).toBe(true); // kept behind, not removed
  });

  it("γι' is για: the Modern elision whose apostrophe is a token of its own", () => {
    const r = read("Διαλύονται στο νερό και γι' αυτό λέγεται διαλύτης.");
    const gi = of(r, 'γι')[0];
    if (gi) expect(String(gi.notes?.rule)).toMatch(/elided για/); // για itself is in the Modern index; with the core alone there is no reading to give
    expect(of(r, 'στο')[0].lemma).toBe('σε');
  });
});

describe('the sentence splitter and abbreviations', () => {
  const sentences = (text: string): string[] => elAdapter.segmentSentences(text).map((s) => s.text);

  it("an abbreviation's full stop does not end the sentence when the text goes on in small letters", () => {
    expect(sentences('Περιέχει φρούτα (π.χ. μήλα), ζάχαρη, λαχανικά (π.χ. μαρούλι) ή σπόρους.')).toHaveLength(1);
    expect(sentences('Το ψωμί (αρχ. ἄρτος) είναι τροφή.')).toHaveLength(1);
    expect(sentences('Τον 5ο αι. π.Χ. και το 300 μ.Χ. περίπου έτρωγαν ψωμί.')).toHaveLength(1);
    expect(sentences('Τρώνε τυρί, γάλα κ.λπ. και ψωμί.')).toHaveLength(1);
  });

  it('before a capital it does end it, unless the abbreviation is a title', () => {
    expect(sentences('Τρώνε τυρί, γάλα κ.λπ. Το ψωμί είναι τροφή.')).toEqual(['Τρώνε τυρί, γάλα κ.λπ.', 'Το ψωμί είναι τροφή.']);
    expect(sentences('Ήρθε ο κ. Παπαδόπουλος με τον Δρ. Νίκο.')).toHaveLength(1);
    expect(sentences('Έγινε το 300 π.Χ. Η Ρώμη μεγάλωσε.')).toHaveLength(2);
  });

  it('an ordinary word before a full stop still ends the sentence, and so does a long word that only ends like an abbreviation', () => {
    expect(sentences('Είναι τροφή. είναι καλή.')).toHaveLength(2);
    expect(sentences('Το βλ. είναι σύντμηση. το ξέρουμε.')).toHaveLength(2);
    expect(elAbbreviationStop('είδε τον μονάρχ. και', 'είδε τον μονάρχ'.length)).toBe(false); // -αρχ at the end of a longer word is not αρχ.
    expect(elAbbreviationStop('το π.χ. μήλα', 'το π.χ'.length)).toBe(true);
    expect(elAbbreviationStop('το π.χ.', 'το π.χ'.length)).toBe(false); // nothing follows: the sentence ends
  });
});

// ───────────── the regression on real prose (needs the built indexes) ─────────────

type GoldWord = [string, string[] | null, string[] | null, string?];
interface Gold { sentences: Array<{ text: string; words: GoldWord[] }> }
const gold = JSON.parse(fs.readFileSync('test/adapters/greek-modern-gold.json', 'utf8')) as Gold;
const fold = (s: string): string => s.normalize('NFC').toLowerCase();

describe('the hand-written readings themselves', () => {
  it('cover every word token of their sentences, in order, and count about 300 words', () => {
    let counted = 0;
    for (const s of gold.sentences) {
      const words = elAdapter.tokenize(s.text).filter((t) => t.isWord).map((t) => t.surface);
      expect(s.words.map((w) => w[0]), s.text.slice(0, 40)).toEqual(words);
      for (const w of s.words) {
        if (w[1] === null) { expect(w[3], w[0]).toBeTruthy(); continue; }
        expect(w[1].length && w[2]!.length, w[0]).toBeGreaterThan(0);
        counted += 1;
      }
    }
    expect(counted).toBe(294);
    expect(gold.sentences.every((s) => elAdapter.segmentSentences(s.text).length === 1)).toBe(true); // each is one sentence to the splitter too
  });
});

const FULL = ['public/lexicon/el/koine-index.json', 'public/lexicon/el/ancient-index.json', 'public/lexicon/el/modern-index.json'];
describe.skipIf(!FULL.every((f) => fs.existsSync(f)))('real Modern Greek prose, with the full indexes installed (built locally)', () => {
  beforeAll(() => { for (const f of FULL) installGreekIndex(JSON.parse(fs.readFileSync(f, 'utf8')) as GreekFormIndex); }, 300_000);
  afterAll(() => resetGreekIndexes((id) => id === 'morphgnt-sblgnt-core'));

  it('σε and με are the prepositions first; a pronoun form is its own pronoun, not "a form of τα" (the address of the pronoun table in Wiktionary)', () => {
    const r = read("Το ψωμί είναι η βασική τροφή σε αντίθεση με την Ασία του πλανήτη μας και γι' αυτό αυτής.");
    expect(of(r, 'σε')[0]).toMatchObject({ lemma: 'σε', pos: 'ADP' });
    expect(of(r, 'με')[0]).toMatchObject({ lemma: 'με', pos: 'ADP' });
    expect(of(r, 'σε').some((c) => c.pos === 'PRON')).toBe(true); // the pronoun σε ("you") is kept behind, not removed
    expect(of(r, 'αυτό')[0].lemma).toBe('αυτός');
    expect(of(r, 'αυτής')[0].lemma).toBe('αυτός');
    expect(of(r, 'μας')[0].lemma).toBe('μας');
    expect(of(r, 'γι')[0].lemma).toBe('για');
    expect(of(r, 'του')[0]).toMatchObject({ lemma: 'ο', pos: 'DET' });
    for (const w of ['σε', 'με', 'αυτό', 'αυτής', 'μας']) expect(of(r, w)[0].notes?.lemmaId, w).not.toBe('τα|PRON');
  });

  it('a quoted ancient word leaves the sentence Modern with the indexes installed too (στη is not ἵστημι)', () => {
    const r = read('Το νερό (ὕδωρ στην αρχαία ελληνική γλώσσα) είναι στη φύση.');
    expect(of(r, 'στη')[0]).toMatchObject({ lemma: 'σε', notes: { period: 'el-mod' } });
    expect(of(r, 'γλώσσα')[0]).toMatchObject({ lemma: 'γλώσσα', varieties: ['el-mod'] });
    expect(of(r, 'ὕδωρ')[0].lemma).toBe('ὕδωρ'); // the quoted word keeps its own ancient reading
  });

  it('294 words of two Wikipedia articles: coverage, and the first reading against the hand-written lemma and part of speech', () => {
    let counted = 0, covered = 0, lemmaOk = 0, posOk = 0, bothOk = 0, modern = 0;
    const uncovered: string[] = [], wrongLemma: string[] = [], wrongPos: string[] = [];
    for (const s of gold.sentences) {
      const r = read(s.text);
      const words = r.tokens.map((t, i) => ({ t, i })).filter((x) => x.t.isWord);
      words.forEach(({ t, i }, k) => {
        const [, lemmas, parts] = s.words[k];
        if (!lemmas || !parts) return;
        counted += 1;
        const c = r.first[i];
        if (!c) { uncovered.push(t.surface); return; }
        covered += 1;
        if (c.notes?.period === 'el-mod') modern += 1;
        const l = lemmas.map(fold).includes(fold(c.lemma ?? ''));
        const p = parts.includes(c.pos ?? '');
        if (l) lemmaOk += 1; else wrongLemma.push(`${t.surface}: ${c.lemma} (${c.pos}), wanted ${lemmas[0]}`);
        if (p) posOk += 1; else wrongPos.push(`${t.surface}: ${c.pos} (${c.lemma}), wanted ${parts.join('/')}`);
        if (l && p) bothOk += 1;
      });
    }
    if (process.env.GREEK_MODERN_REPORT === '1') {
      console.log(JSON.stringify({ counted, covered, lemmaOk, posOk, bothOk, modern }));
      console.log('UNCOVERED\n' + uncovered.join('\n'));
      console.log('LEMMA\n' + wrongLemma.join('\n'));
      console.log('POS\n' + wrongPos.join('\n'));
    }
    expect(counted).toBe(294);
    // the audit's findings: every contraction and abbreviation of these sentences has a reading
    expect(uncovered.filter((w) => /^(στ[οηα]ν?|στους|στις|στου|στης|στων|π\.χ|αρχ|γι)$/i.test(w))).toEqual([]);
    // floors: what the analyser reaches on 2026-11-13. A fall is a regression; a rise is to be written down here.
    expect(covered).toBeGreaterThanOrEqual(FLOOR.covered);
    expect(lemmaOk).toBeGreaterThanOrEqual(FLOOR.lemma);
    expect(posOk).toBeGreaterThanOrEqual(FLOOR.pos);
    expect(bothOk).toBeGreaterThanOrEqual(FLOOR.both);
    expect(modern).toBeGreaterThanOrEqual(FLOOR.modern);
  }, 300_000);
});

/** Measured on 2026-11-13 over the 294 counted words (docs/greek/MODERN-AUDIT.md has the table and every disagreement). */
const FLOOR = { covered: 289, lemma: 278, pos: 282, both: 277, modern: 289 };
