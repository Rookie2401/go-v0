// @vitest-environment node
/**
 * Hebrew adapter, Biblical period: what adapter-he@1 really does with Masoretic text, from the compiled core alone and, when the
 * full indexes have been built locally (public/lexicon/he/*.json, git-ignored; npm run he:build-biblical / he:build-modern),
 * with them installed. Every expectation is a reading of the Open Scriptures morphology for that very word.
 */
import fs from 'node:fs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { heAdapter, heInstalledIndexes } from '../../src/adapters/he';
import { installHebrewIndex, resetHebrewIndexes, type HebrewFormIndex } from '../../src/adapters/hebrew/index-store';
import { gematriaValue } from '../../src/adapters/hebrew/numbers';
import { decodeOshb } from '../../src/adapters/hebrew/oshb';
import { consonantal, pointed, splitByLetters } from '../../src/adapters/hebrew/text';

const GEN_1_1 = 'בְּרֵאשִׁ֖ית בָּרָ֣א אֱלֹהִ֑ים אֵ֥ת הַשָּׁמַ֖יִם וְאֵ֥ת הָאָֽרֶץ׃';
const GEN_1_3 = 'וַיֹּ֥אמֶר אֱלֹהִ֖ים יְהִ֣י א֑וֹר וַֽיְהִי־אֽוֹר׃';
const run = (text: string, varietyId?: string) => {
  const tokens = heAdapter.tokenize(text);
  return { tokens, analyses: heAdapter.analyze(tokens, varietyId ? { varietyId } : undefined) };
};
const best = (text: string, surface: string, varietyId?: string) => {
  const r = run(text, varietyId);
  const i = r.tokens.findIndex((t) => t.surface === surface);
  if (i < 0) throw new Error(`no token ${surface}`);
  return r.analyses[i].candidates[0];
};

describe('text: marks and identities', () => {
  it('pointed() removes cantillation and meteg but keeps vowels and dagesh; consonantal() removes everything', () => {
    expect(pointed('בְּרֵאשִׁ֖ית')).toBe('בְּרֵאשִׁית');
    expect(consonantal('בְּרֵאשִׁ֖ית')).toBe('בראשית');
    expect(pointed('הָאָֽרֶץ׃')).toBe('הָאָרֶץ');
  });
  it('splitByLetters cuts at letter counts keeping marks with their letters', () => {
    expect(splitByLetters('בְּרֵאשִׁית', [1, 5])).toEqual(['בְּ', 'רֵאשִׁית']);
    expect(splitByLetters('בְּרֵאשִׁית', [1, 4])).toBeNull();
  });
  it('tokenize keeps an accented word whole, makes the maqaf and sof pasuq their own non-word tokens', () => {
    const t = heAdapter.tokenize(GEN_1_3);
    expect(t.filter((x) => x.isWord).map((x) => x.surface)).toEqual(['וַיֹּ֥אמֶר', 'אֱלֹהִ֖ים', 'יְהִ֣י', 'א֑וֹר', 'וַֽיְהִי', 'אֽוֹר']);
    expect(t.filter((x) => !x.isWord).map((x) => x.surface)).toEqual(['־', '׃']);
    for (const x of t) expect(GEN_1_3.slice(x.start, x.end)).toBe(x.surface);
  });
  it('segmentSentences ends a verse at sof pasuq and a Modern sentence at a full stop', () => {
    expect(heAdapter.segmentSentences(`${GEN_1_1} ${GEN_1_3}`).map((s) => s.text)).toEqual([GEN_1_1, GEN_1_3]);
    expect(heAdapter.segmentSentences('אני גר בירושלים. אתה גר בחיפה?').map((s) => s.text)).toEqual(['אני גר בירושלים.', 'אתה גר בחיפה?']);
  });
});

describe('OSHB codes', () => {
  it('decodes a wayyiqtol with a conjunction prefix', () => {
    const d = decodeOshb('c/559', 'HC/Vqw3ms');
    expect(d.pos).toBe('VERB');
    expect(d.morph).toEqual({ Binyan: 'Qal', Conj: 'Wayyiqtol', VerbForm: 'Fin', Person: '3', Gender: 'Masc', Number: 'Sing' });
    expect(d.prefixes.map((p) => p.code)).toEqual(['c']);
  });
  it('decodes a noun with article prefix, and a preposition with a fused article', () => {
    expect(decodeOshb('d/8064', 'HTd/Ncmpa').morph).toEqual({ Gender: 'Masc', Number: 'Plur', State: 'Abs', Definite: 'Def' });
    expect(decodeOshb('b/8064', 'HRd/Ncmpa').morph).toEqual({ Gender: 'Masc', Number: 'Plur', State: 'Abs', Definite: 'Def' });
    expect(decodeOshb('8064', 'HNcmpa').morph).toEqual({ Gender: 'Masc', Number: 'Plur', State: 'Abs' });
    expect(decodeOshb('b/8064', 'HRd/Ncmpa').prefixes[0].seg.morph).toEqual({ Definite: 'Def' });
  });
  it('decodes a noun with a pronominal suffix and an Aramaic verb', () => {
    const d = decodeOshb('1870', 'HNcbsc/Sp3ms');
    expect(d.suffix).toMatchObject({ pos: 'PRON', morph: { PronType: 'Prs', Person: '3', Gender: 'Masc', Number: 'Sing' } });
    const a = decodeOshb('560', 'AVqp3ms');
    expect(a.aramaic).toBe(true);
    expect(a.morph.Binyan).toBe('Peal');
  });
});

describe('the compiled core: closed classes and the commonest words', () => {
  it('reads אֱלֹהִים, אֵת, הַשָּׁמַיִם and וְאֵת from the core alone, each tagged Biblical, with the source’s count', () => {
    expect(heInstalledIndexes()).toContain('oshb-tanakh-core');
    const elohim = best(GEN_1_1, 'אֱלֹהִ֑ים');
    expect(elohim).toMatchObject({ lemma: 'אֱלֹהִים', pos: 'NOUN', morph: { Gender: 'Masc', Number: 'Plur', State: 'Abs' }, varieties: ['he-bib'], origin: 'dictionary', sourceId: 'oshb-tanakh' });
    expect(elohim.gloss).toMatch(/God|gods/);
    expect(String(elohim.notes?.attested)).toMatch(/× in the Tanakh/);
    expect(best(GEN_1_1, 'אֵ֥ת')).toMatchObject({ pos: 'PART', morph: { PartType: 'Obj' } });
    const shamayim = best(GEN_1_1, 'הַשָּׁמַ֖יִם');
    expect(shamayim).toMatchObject({ lemma: 'שָׁמַיִם', pos: 'NOUN', morph: { Gender: 'Masc', Number: 'Plur', State: 'Abs', Definite: 'Def' } });
    expect(shamayim.parts?.map((p) => [p.text, p.role])).toEqual([['הַ', 'the'], ['שָּׁמַ֖יִם', 'stem']]);
    const veet = best(GEN_1_1, 'וְאֵ֥ת');
    expect(veet.parts?.map((p) => p.lemma)).toEqual(['וְ', 'אֵת']);
  });
  it('the sentence is read as Biblical because it carries cantillation; every reading says so', () => {
    const c = best(GEN_1_1, 'אֱלֹהִ֑ים');
    expect(c.notes).toMatchObject({ period: 'he-bib' });
    expect(String(c.notes?.periodBasis)).toMatch(/cantillation/);
  });
  it('וַיֹּאמֶר is the Qal wayyiqtol of אָמַר with וְ as a part', () => {
    const c = best(GEN_1_3, 'וַיֹּ֥אמֶר');
    expect(c).toMatchObject({ lemma: 'אָמַר', pos: 'VERB', morph: { Binyan: 'Qal', Conj: 'Wayyiqtol', Person: '3', Gender: 'Masc', Number: 'Sing' } });
    expect(c.parts?.[0]).toMatchObject({ lemma: 'וְ', pos: 'CONJ', kind: 'clitic' });
    expect(heAdapter.describeMorph!(c.morph, c.pos)).toBe('Qal, wayyiqtol (narrative past), 3rd person masculine singular');
  });
  it('a word the core does not hold has NO reading (nothing guessed)', () => {
    expect(run('זְבוּלֻן').analyses[0].candidates.length === 0 || heInstalledIndexes().includes('oshb-tanakh')).toBe(true);
  });
  it('rules for a form the core does not hold as written: שֶׁ cut off (שֶׁהוּא), letters as a number (ג׳, י״ב), the Name written ה׳ or יי (לַייָ), a pointing the source lacks matched by its letters (שְׁלשָׁה)', () => {
    expect(best('שֶׁהוּא', 'שֶׁהוּא')).toMatchObject({ lemma: 'הוּא', origin: 'rule', notes: { rule: expect.stringMatching(/שֶׁ cut off by rule/) } });
    expect(best('ג׳ שָׁעוֹת', 'ג׳')).toMatchObject({ pos: 'NUM', gloss: '3', origin: 'rule' });
    expect(best('י״ב', 'י״ב')).toMatchObject({ pos: 'NUM', gloss: '12' });
    expect(gematriaValue('תשפו')).toBe(786);
    expect(gematriaValue('אב')).toBeNull(); // not descending: not a numeral
    expect(best("ה' אֱלֹהִים", "ה'")).toMatchObject({ origin: 'rule', notes: { rule: expect.stringMatching(/abbreviation of the Name/) } });
    const name = best('לַייָ', 'לַייָ');
    expect(name).toMatchObject({ origin: 'rule', notes: { rule: expect.stringMatching(/abbreviation of the Name/) } });
    expect(name.parts?.[0]).toMatchObject({ lemma: 'לְ', kind: 'clitic' });
    expect(best('שְׁלשָׁה', 'שְׁלשָׁה')).toMatchObject({ lemma: 'שָׁלוֹשׁ', unconfirmed: true, notes: { pointing: expect.stringMatching(/differs from the source/) } });
  });
  it('a prefix peels whatever order its marks are in: NFC puts the dagesh after the vowel (בְּ), and the article’s doubling dagesh is dropped from the rest', () => {
    expect(best('בְּבַיִת', 'בְּבַיִת')).toMatchObject({ lemma: 'בַּיִת', origin: 'dictionary' }); // attested as written: the source's own reading, no rule
    const b = best('בְּאֱלֹהִים', 'בְּאֱלֹהִים'); // this pointing is not attested: the prefix is cut off by rule
    expect(b).toMatchObject({ lemma: 'אֱלֹהִים', origin: 'rule' });
    expect(b.parts?.[0]).toMatchObject({ lemma: 'בְּ', kind: 'clitic' });
  });
  it('relate: same / inflection / none', () => {
    expect(heAdapter.relate('אֱלֹהִ֑ים', 'אֱלֹהִים')).toBe('same');
    expect(heAdapter.relate('וַיֹּ֥אמֶר', 'אָמַ֣ר')).toBe('inflection');
    expect(heAdapter.relate('אֱלֹהִים', 'אָמַר')).toBe('none');
  });
  it('transliterates a pointed word and refuses an unpointed one', () => {
    expect(heAdapter.pronunciation(heAdapter.tokenize('אֱלֹהִים')[0]).transliteration).toBe('elohim');
    expect(heAdapter.pronunciation(heAdapter.tokenize('בָּרָא')[0]).transliteration).toBe('bara');
    expect(heAdapter.pronunciation(heAdapter.tokenize('שָׁלוֹם')[0]).transliteration).toBe('shalom');
    const un = heAdapter.pronunciation(heAdapter.tokenize('שלום')[0]);
    expect(un.transliteration).toBeUndefined();
    expect(un.notes?.[0]).toMatch(/Unpointed/);
  });
});

const FULL_BIB = 'public/lexicon/he/biblical-index.json';
const FULL_MOD = 'public/lexicon/he/modern-index.json';
describe.skipIf(!fs.existsSync(FULL_BIB) || !fs.existsSync(FULL_MOD))('with the full indexes installed (built locally)', () => {
  beforeAll(() => {
    installHebrewIndex(JSON.parse(fs.readFileSync(FULL_BIB, 'utf8')) as HebrewFormIndex);
    installHebrewIndex(JSON.parse(fs.readFileSync(FULL_MOD, 'utf8')) as HebrewFormIndex);
  });
  afterAll(() => resetHebrewIndexes((id) => id === 'oshb-tanakh-core'));

  it('every word of Genesis 1:1 and 1:3 has a Biblical reading', () => {
    for (const text of [GEN_1_1, GEN_1_3]) {
      const r = run(text);
      r.tokens.forEach((t, i) => { if (t.isWord) expect(r.analyses[i].candidates[0]?.varieties, t.surface).toContain('he-bib'); });
    }
    // Open Scriptures reads בְּרֵאשִׁית as a construct ("in the beginning of …"), the reading behind "When God began to create"; the test states the source, not a preference
    expect(best(GEN_1_1, 'בְּרֵאשִׁ֖ית')).toMatchObject({ lemma: 'רֵאשִׁית', pos: 'NOUN', morph: { Gender: 'Fem', Number: 'Sing', State: 'Cons' } });
    expect(best(GEN_1_1, 'בְּרֵאשִׁ֖ית').parts?.map((p) => p.lemma)).toEqual(['בְּ', 'רֵאשִׁית']);
  });

  it('an unpointed Modern sentence is read as Modern Hebrew; Biblical readings of the same consonants are kept behind, with their points marked inferred', () => {
    const r = run('הילדים כותבים מכתב.');
    const kotvim = r.analyses[1].candidates;
    // כותבים is both "they write" (present of כָּתַב) and "writers" (plural of כּוֹתֵב): both readings are kept, Modern first; the tables carry no frequency, so neither is put above the other
    expect(kotvim[0]).toMatchObject({ varieties: ['he-mod'], notes: { period: 'he-mod' } });
    expect(['כָּתַב', 'כּוֹתֵב']).toContain(kotvim[0].lemma);
    const verb = kotvim.find((c) => c.lemma === 'כָּתַב' && c.pos === 'VERB');
    expect(verb?.morph).toMatchObject({ Conj: 'Pres', Gender: 'Masc', Number: 'Plur' });
    const bib = kotvim.find((c) => c.varieties?.includes('he-bib'));
    if (bib) expect(bib.notes).toMatchObject({ pointing: 'inferred' });
  });

  it('the declared variety breaks a tie, never a decided text: pointed Modern-and-Biblical words follow the caller, cantillated text does not', () => {
    const r = run('שָׁלוֹם', 'he-bib');
    expect(r.analyses[0].candidates[0].notes).toMatchObject({ period: 'he-bib' });
    const m = run('שָׁלוֹם', 'he-mod');
    expect(m.analyses[0].candidates[0].notes).toMatchObject({ period: 'he-mod' });
    expect(best(GEN_1_1, 'אֱלֹהִ֑ים', 'he-mod').notes).toMatchObject({ period: 'he-bib' });
  });

  it('a Modern verb form the tables list is read with its person, tense and binyan', () => {
    const c = run('כתבתי').analyses[0].candidates[0];
    expect(c).toMatchObject({ lemma: 'כָּתַב', pos: 'VERB', morph: { Conj: 'Past', Person: '1', Number: 'Sing', VerbForm: 'Fin' } });
  });

  it('a lemma held by the compiled core AND the full index is counted once in Variants (2,599 for אֱלֹהִים, not twice that)', () => {
    const v = heAdapter.variants!('אֱלֹהִים', 'NOUN', 'אֱלֹהִ֑ים');
    expect(v?.rows.find((r) => r.varietyId === 'he-bib')?.note).toMatch(/^2,599 occurrences/);
  });
  it('the Mishnaic plural ־ִין is read as the ־ִים form the tables hold, marked as a rule and counted as Mishnaic evidence', () => {
    const c = best('חַיָּבִין', 'חַיָּבִין');
    expect(c).toMatchObject({ lemma: 'חַיָּב', origin: 'rule', unconfirmed: true, notes: { rule: expect.stringMatching(/Mishnaic plural/) } });
    expect(c.varieties).toContain('he-mish');
  });
  it('the prefix morphemes OSHB cites by a letter have Hebrew headwords and glosses in the index (לוֹ is לְ "to, for", not "l")', () => {
    expect(best('וַיֹּאמֶר לוֹ', 'לוֹ')).toMatchObject({ lemma: 'לְ', gloss: 'to, for', pos: 'ADP' });
  });
  it('the Variants tab: כָּתַב is attested in the Tanakh and in the Modern tables; Mishnaic and Medieval say "not in our sources"', () => {
    const v = heAdapter.variants!('כָּתַב', 'VERB', 'כָּתַ֣ב');
    expect(v?.rows.map((r) => [r.varietyId, r.status])).toEqual([['he-bib', 'attested'], ['he-mish', 'not-in-sources'], ['he-med', 'not-in-sources'], ['he-mod', 'attested']]);
    expect(v?.rows[0].note).toMatch(/occurrences in the Tanakh/);
    expect(v?.rows[0].current).toBe(true);
  });

  it('the paradigm of אָמַר has attested cells only, laid out by person and number', () => {
    const p = heAdapter.paradigm!('אָמַר', 'VERB');
    expect(p?.kind).toBe('verb-conjugation');
    expect(p!.cells.length).toBeGreaterThan(20);
    const wayy3ms = p!.cells.find((c) => c.features.Conj === 'Wayyiqtol' && c.features.Person === '3' && c.features.Gender === 'Masc' && c.features.Number === 'Sing');
    expect(wayy3ms?.form).toBe('וַיֹּאמֶר'); // the sequential form keeps its וַ: it is the form
    const perf3ms = p!.cells.find((c) => c.features.Conj === 'Perf' && c.features.Person === '3' && c.features.Gender === 'Masc' && c.features.Number === 'Sing');
    expect(perf3ms?.form).toBe('אָמַר');
    expect(p!.notes[0]).toMatch(/nothing is generated/);
  });

  it('production checks: a non-final letter at the end is a spelling suggestion; a wayyiqtol in a Modern draft is a register note', () => {
    const t = heAdapter.tokenize('שלומ');
    const e = heAdapter.checkProduction(t, heAdapter.analyze(t), 'שלומ');
    expect(e[0]).toMatchObject({ category: 'spelling', suggestion: { replacement: 'שלום' } });
    const t2 = heAdapter.tokenize(GEN_1_3);
    const e2 = heAdapter.checkProduction(t2, heAdapter.analyze(t2), GEN_1_3, { varietyId: 'he-mod' });
    expect(e2.some((x) => x.category === 'register' && /wayyiqtol/.test(x.message))).toBe(true);
  });
});
