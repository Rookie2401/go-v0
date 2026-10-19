// @vitest-environment node
/**
 * Greek adapter: what adapter-el@1 really does with New Testament, Homeric and Modern text, from the compiled Koine core alone and,
 * when the full indexes have been built locally (public/lexicon/el/*.json, git-ignored; npm run el:build-koine / el:build-ancient /
 * el:build-modern), with them installed. Every expectation is a source's reading, never a preference.
 */
import fs from 'node:fs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { elAdapter, elInstalledIndexes } from '../../src/adapters/el';
import { installGreekIndex, resetGreekIndexes, type GreekFormIndex } from '../../src/adapters/greek/index-store';
import { resetElPeriodMemory } from '../../src/adapters/greek/analyze';
import { decodeMorphGnt } from '../../src/adapters/greek/morphgnt';
import { milesianValue } from '../../src/adapters/greek/numbers';
import { transliterateGreek } from '../../src/adapters/greek/pronunciation';
import { bare, elKey, toMonotonic } from '../../src/adapters/greek/text';

const JOHN_1_1 = 'Ἐν ἀρχῇ ἦν ὁ λόγος, καὶ ὁ λόγος ἦν πρὸς τὸν θεόν, καὶ θεὸς ἦν ὁ λόγος.';
const ILIAD_1_1 = 'Μῆνιν ἄειδε θεὰ Πηληϊάδεω Ἀχιλῆος οὐλομένην, ἣ μυρί᾽ Ἀχαιοῖς ἄλγε᾽ ἔθηκε,';
const MODERN = 'Ο λόγος είναι ελεύθερος και οι άνθρωποι γράφουν βιβλία.';
const run = (text: string, varietyId?: string) => { const tokens = elAdapter.tokenize(text); return { tokens, analyses: elAdapter.analyze(tokens, varietyId ? { varietyId } : undefined) }; };
const best = (text: string, surface: string, varietyId?: string) => {
  const r = run(text, varietyId);
  const i = r.tokens.findIndex((t) => t.surface === surface);
  if (i < 0) throw new Error(`no token ${surface}`);
  return r.analyses[i].candidates[0];
};

describe('text: keys and identities', () => {
  it('elKey keeps polytonic marks, lower-cases and folds a grave to the acute; bare strips everything but final sigma', () => {
    expect(elKey('Θεὸς')).toBe('θεός');
    expect(elKey('λόγος,'.replace(',', ''))).toBe('λόγος');
    expect(bare('ἀρχῇ')).toBe('αρχη');
    expect(bare('λόγος')).toBe('λογος');
    expect(toMonotonic('ἀρχῇ')).toBe('αρχή');
  });
  it('tokenize keeps accented words whole; the elision mark and punctuation are their own tokens', () => {
    const t = elAdapter.tokenize(ILIAD_1_1);
    expect(t.filter((x) => x.isWord).map((x) => x.surface)).toEqual(['Μῆνιν', 'ἄειδε', 'θεὰ', 'Πηληϊάδεω', 'Ἀχιλῆος', 'οὐλομένην', 'ἣ', 'μυρί', 'Ἀχαιοῖς', 'ἄλγε', 'ἔθηκε']);
    for (const x of t) expect(ILIAD_1_1.slice(x.start, x.end)).toBe(x.surface);
  });
  it('sentences end at the full stop and the Greek question mark, not at the ano teleia', () => {
    expect(elAdapter.segmentSentences('Τι κάνεις; Καλά· ευχαριστώ. Εσύ?').map((s) => s.text)).toEqual(['Τι κάνεις;', 'Καλά· ευχαριστώ.', 'Εσύ?']);
  });
});

describe('MorphGNT codes', () => {
  it('decodes a verb, a noun, the article and a pronoun', () => {
    expect(decodeMorphGnt('V-|3IAI-S--', 'εἰμί')).toEqual({ pos: 'VERB', morph: { Person: '3', Tense: 'Impf', Voice: 'Act', Mood: 'Ind', VerbForm: 'Fin', Number: 'Sing' } });
    expect(decodeMorphGnt('N-|----DSF-', 'ἀρχή')).toEqual({ pos: 'NOUN', morph: { Case: 'Dat', Number: 'Sing', Gender: 'Fem' } });
    expect(decodeMorphGnt('N-|----NSM-', 'Ἰησοῦς').pos).toBe('PROPN');
    expect(decodeMorphGnt('RA|----NSM-', 'ὁ')).toEqual({ pos: 'DET', morph: { Case: 'Nom', Number: 'Sing', Gender: 'Masc', Definite: 'Def' } });
    expect(decodeMorphGnt('RD|----NSM-', 'οὗτος').morph.PronType).toBe('Dem');
    expect(decodeMorphGnt('V-|-PAPNSM-', 'λέγω').morph).toEqual({ Tense: 'Pres', Voice: 'Act', VerbForm: 'Part', Case: 'Nom', Number: 'Sing', Gender: 'Masc' });
  });
});

describe('the compiled Koine core', () => {
  it('reads John 1:1 from the core alone: every word Koine, with the source’s count', () => {
    expect(elInstalledIndexes()).toContain('morphgnt-sblgnt-core');
    const r = run(JOHN_1_1);
    r.tokens.forEach((t, i) => { if (t.isWord) expect(r.analyses[i].candidates[0]?.varieties, t.surface).toEqual(['el-koi']); });
    const logos = best(JOHN_1_1, 'λόγος');
    expect(logos).toMatchObject({ lemma: 'λόγος', pos: 'NOUN', morph: { Case: 'Nom', Number: 'Sing', Gender: 'Masc' }, origin: 'dictionary', sourceId: 'morphgnt-sblgnt' });
    expect(logos.gloss).toMatch(/word/);
    expect(String(logos.notes?.attested)).toMatch(/× in the New Testament/);
    expect(String(logos.notes?.septuagint)).toMatch(/Septuagint/);
    expect(best(JOHN_1_1, 'ἦν')).toMatchObject({ lemma: 'εἰμί', pos: 'VERB', morph: { Person: '3', Tense: 'Impf', Mood: 'Ind', Number: 'Sing' } });
    expect(elAdapter.describeMorph!(best(JOHN_1_1, 'ἦν').morph, 'VERB')).toBe('imperfect active indicative, 3rd person singular');
    expect(best(JOHN_1_1, 'θεὸς')).toMatchObject({ lemma: 'θεός', morph: { Case: 'Nom' } }); // the grave is the acute of a word followed by another
  });
  it('the sentence is read as Koine because the words are New Testament words; every reading says so', () => {
    const c = best(JOHN_1_1, 'ἀρχῇ');
    expect(c.notes).toMatchObject({ period: 'el-koi' });
  });
  it('a monotonic spelling of a New Testament word is matched without its accents and says so', () => {
    const c = run('αρχη').analyses[0].candidates[0];
    expect(c).toMatchObject({ lemma: 'ἀρχή', notes: { accents: 'inferred' } });
  });
  it('a word the core does not hold has NO reading', () => {
    expect(run('Πηληϊάδεω').analyses[0].candidates).toEqual([]);
  });
  it('rules for a form no index holds, each marked as a rule: an elided stem ending in a vowel (διʼ), an apostrophe the edition set apart (οὔτ), crasis (τἀγαθόν), a diagram label (ΑΒΓ), letters with a keraia (ιϛʹ, α΄)', () => {
    expect(best('διʼ ἡμῶν', 'διʼ')).toMatchObject({ lemma: 'διά', origin: 'rule', notes: { rule: expect.stringMatching(/elided/) } });
    expect(best('οὔτ ἄλλο', 'οὔτ')).toMatchObject({ lemma: 'οὔτε', origin: 'rule', unconfirmed: true, notes: { rule: expect.stringMatching(/apostrophe is a separate character/) } });
    expect(best('τἀγαθόν', 'τἀγαθόν')).toMatchObject({ lemma: 'ἀγαθός', origin: 'rule', unconfirmed: true, notes: { rule: expect.stringMatching(/^crasis: τό \/ τά \+ ἀγαθόν/) } });
    expect(best('ΑΒΓ τρίγωνον', 'ΑΒΓ')).toMatchObject({ pos: 'X', origin: 'rule', unconfirmed: true, gloss: expect.stringMatching(/diagram label/) });
    expect(best('ιϛʹ', 'ιϛʹ')).toMatchObject({ pos: 'NUM', gloss: '16', origin: 'rule' });
    expect(run('α΄.').analyses[0].candidates[0]).toMatchObject({ pos: 'NUM', gloss: '1' }); // the keraia split off by the tokenizer: the next token says so
    expect(milesianValue('ρν')).toBe(150);
    expect(milesianValue('αα')).toBeNull();
    expect(elAdapter.analyze(elAdapter.tokenize('ξυλον')).every((a) => a.candidates.every((c) => c.pos !== 'X'))).toBe(true); // a lower-case word is never a label
  });
  it('ἄρα and τοι are not Homeric evidence: an Attic sentence with ἄρα is not read as Homeric', () => {
    const r = run('ἔστιν ἄρα τὸ ἀγαθὸν κοινόν τι.');
    expect(r.analyses[0].candidates[0].notes?.period).not.toBe('el-hom');
  });
  it('pronunciation: three named conventions for an ancient word, one for a Modern one', () => {
    expect(transliterateGreek('λόγος', 'modern')).toBe('loɣos');
    expect(transliterateGreek('λόγος', 'erasmian')).toBe('logos');
    expect(transliterateGreek('εἰρήνη', 'koine')).toBe('irene');
    expect(transliterateGreek('εἰρήνη', 'erasmian')).toBe('eirēnē');
    expect(transliterateGreek('ὁ', 'erasmian')).toBe('ho');
    const r = run(JOHN_1_1);
    const p = elAdapter.pronunciation(r.tokens[1], r.analyses[1]);
    expect((p.notes ?? []).join(' ')).toMatch(/Koine \(reconstructed\).*Erasmian.*Modern/s);
  });
  it('production: final sigma, polytonic in a Modern draft', () => {
    const t = elAdapter.tokenize('ο λογοσ');
    const errs = elAdapter.checkProduction(t, elAdapter.analyze(t), 'ο λογοσ');
    expect(errs.find((x) => x.category === 'spelling')).toMatchObject({ suggestion: { replacement: 'λογος' } });
    expect(errs.some((x) => x.category === 'dialect')).toBe(false); // ο matched the article ὁ without its breathing: no claim about its period
    const t2 = elAdapter.tokenize(JOHN_1_1);
    const e = elAdapter.checkProduction(t2, elAdapter.analyze(t2), JOHN_1_1, { varietyId: 'el-mod' });
    expect(e.some((x) => x.category === 'register' && /polytonic/.test(x.message))).toBe(true);
  });
});

const FULL = ['public/lexicon/el/koine-index.json', 'public/lexicon/el/ancient-index.json', 'public/lexicon/el/modern-index.json'];
describe.skipIf(!FULL.every((f) => fs.existsSync(f)))('with the full indexes installed (built locally)', () => {
  beforeAll(() => { for (const f of FULL) installGreekIndex(JSON.parse(fs.readFileSync(f, 'utf8')) as GreekFormIndex); });
  afterAll(() => resetGreekIndexes((id) => id === 'morphgnt-sblgnt-core'));

  it('Iliad 1.1 is read as Homeric: the Epic tables and forms carry most of its words', () => {
    const r = run(ILIAD_1_1);
    const menin = r.analyses[0].candidates[0];
    expect(menin).toMatchObject({ lemma: 'μῆνις', pos: 'NOUN', morph: { Case: 'Acc', Number: 'Sing' } });
    const periods = r.analyses.filter((a) => a.candidates.length).map((a) => a.candidates[0].notes?.period);
    expect(new Set(periods).size).toBe(1);
    expect(['el-hom', 'el-att']).toContain(periods[0]);
    expect(r.analyses.filter((a, i) => r.tokens[i].isWord && a.candidates.length).length).toBeGreaterThanOrEqual(7);
  });
  it('Modern Greek is read as Modern; the Ancient readings of the same letters are kept behind', () => {
    const r = run(MODERN);
    const logos = r.analyses[1].candidates;
    expect(logos[0]).toMatchObject({ lemma: 'λόγος', varieties: ['el-mod'], notes: { period: 'el-mod' } });
    expect(logos.some((c) => c.varieties?.includes('el-koi'))).toBe(true);
    expect(best(MODERN, 'γράφουν')).toMatchObject({ lemma: 'γράφω', pos: 'VERB', morph: { Person: '3', Number: 'Plur' } });
  });
  it('the declared variety breaks a tie, never a decided text', () => {
    expect(run('λόγος', 'el-att').analyses[0].candidates[0].notes).toMatchObject({ period: 'el-att' });
    expect(run('λόγος', 'el-koi').analyses[0].candidates[0].notes).toMatchObject({ period: 'el-koi' });
    expect(best(MODERN, 'λόγος', 'el-koi').notes).toMatchObject({ period: 'el-mod' }); // monotonic text with Modern readings stays Modern
  });
  it('a sentence whose spelling shows neither system (λόγος.) is read on in the period of the sentence before; with nothing before, as Modern', () => {
    resetElPeriodMemory();
    expect(run('λόγος.').analyses[0].candidates[0].notes).toMatchObject({ period: 'el-mod' });
    run(JOHN_1_1); // decided by its polytonic marks
    expect(run('λόγος.').analyses[0].candidates[0].notes).toMatchObject({ period: 'el-koi', periodBasis: expect.stringMatching(/period of the sentence before/) });
    expect(run('λόγος.', 'el-att').analyses[0].candidates[0].notes).toMatchObject({ period: 'el-att' }); // a declared variety still comes first
    resetElPeriodMemory();
  });
  it('a capital heading without breathings (ΑΞΙΩΜΑΤΑ) and a letter-numeral are not monotonic evidence', () => {
    resetElPeriodMemory();
    run(ILIAD_1_1);
    expect(run('ΑΞΙΩΜΑΤΑ α΄.').analyses[0].candidates[0]?.notes?.period ?? 'none').not.toBe('el-mod');
    resetElPeriodMemory();
  });
  it('the Variants tab for λόγος: Attic, Koine (with Septuagint count) and Modern attested; Homeric and Medieval honest about their sources', () => {
    const v = elAdapter.variants!('λόγος', 'NOUN', 'λόγος');
    expect(v?.rows.map((r) => r.varietyId)).toEqual(['el-hom', 'el-att', 'el-koi', 'el-med', 'el-mod']);
    const by = Object.fromEntries(v!.rows.map((r) => [r.varietyId, r]));
    expect(by['el-att'].status).toBe('attested');
    expect(by['el-koi']).toMatchObject({ status: 'attested' });
    expect(by['el-koi'].note).toMatch(/New Testament.*Septuagint/);
    expect(by['el-mod'].status).toBe('attested');
    expect(['attested', 'not-in-sources']).toContain(by['el-hom'].status);
    expect(by['el-med'].status).toBe('not-in-sources');
  });
  it('the paradigm of λόγος has the Attic declension cells and the New Testament attestations, nothing generated', () => {
    const p = elAdapter.paradigm!('λόγος', 'NOUN');
    expect(p?.kind).toBe('noun-declension');
    const gen = p!.cells.find((c) => c.features.Case === 'Gen' && c.features.Number === 'Sing' && !c.features.Dialect);
    expect(gen?.form).toBe('λόγου');
    expect(p!.notes[0]).toMatch(/nothing is generated/);
  });
});
