/**
 * Coordinator's judged table: single written forms of Standard Albanian and what they are, from the coordinator's
 * own knowledge of the language — written without looking at what the engine returns, and not shown to the packages
 * that built the engine. It checks the word-form engine (src/adapters/albanian/morphology.ts) form by form: each row
 * says "among the readings of this form there is one with this lemma, this part of speech and these features".
 *
 * A row here is one model's judgement, not a native speaker's: where a row and the engine differ, both are looked at
 * (and the UniParser analyzer is a third opinion, see scripts/sq-check-analyzer.mts) before either is changed.
 */
import { describe, expect, it } from 'vitest';
import { analyzeSqForm } from '../../src/adapters/albanian/morphology';
import { sqNormalize } from '../../src/adapters/albanian/orthography';
import { sqAgree } from '../../src/adapters/albanian/types';

/** "nom sg def" style shorthand for the judged rows (kept apart from the engine's own tag helper on purpose). */
const F: Record<string, [string, string]> = {
  nom: ['Case', 'Nom'], acc: ['Case', 'Acc'], gen: ['Case', 'Gen'], dat: ['Case', 'Dat'], abl: ['Case', 'Abl'],
  sg: ['Number', 'Sing'], pl: ['Number', 'Plur'], def: ['Definite', 'Def'], indef: ['Definite', 'Ind'],
  m: ['Gender', 'Masc'], f: ['Gender', 'Fem'],
  '1': ['Person', '1'], '2': ['Person', '2'], '3': ['Person', '3'],
  pres: ['Tense', 'Pres'], impf: ['Tense', 'Imp'], aor: ['Tense', 'Past'],
  ind: ['Mood', 'Ind'], subj: ['Mood', 'Sub'], imper: ['Mood', 'Imp'], mid: ['Voice', 'Mid'], act: ['Voice', 'Act'], ptcp: ['VerbForm', 'Part'],
};
const want = (tags: string): Record<string, string> => Object.fromEntries(tags.split(/\s+/).filter(Boolean).map((t) => { if (!F[t]) throw new Error(`unknown tag ${t}`); return F[t]; }));

function has(form: string, lemma: string, pos: string, tags: string): boolean {
  const w = want(tags);
  return analyzeSqForm(sqNormalize(form)).some((r) => r.lemmaKnown && r.lemma === lemma && (r.pos === pos || (pos === 'VERB' && r.pos === 'AUX'))
    && Object.entries(w).every(([k, v]) => r.morph[k] !== undefined && sqAgree(r.morph[k], v)));
}
const describeReadings = (form: string) => analyzeSqForm(sqNormalize(form)).map((r) => `${r.lemma}/${r.pos} ${JSON.stringify(r.morph)}`).join(' | ') || 'nothing';

type Row = [form: string, lemma: string, pos: string, tags: string];

const NOUNS: Row[] = [
  ['libër', 'libër', 'NOUN', 'nom sg indef m'], ['libri', 'libër', 'NOUN', 'nom sg def'], ['librin', 'libër', 'NOUN', 'acc sg def'],
  ['librit', 'libër', 'NOUN', 'dat sg def'], ['libri', 'libër', 'NOUN', 'dat sg indef'], ['libra', 'libër', 'NOUN', 'nom pl indef'],
  ['librat', 'libër', 'NOUN', 'acc pl def'], ['librave', 'libër', 'NOUN', 'gen pl'],
  ['vajzë', 'vajzë', 'NOUN', 'nom sg indef f'], ['vajza', 'vajzë', 'NOUN', 'nom sg def'], ['vajza', 'vajzë', 'NOUN', 'nom pl indef'],
  ['vajzën', 'vajzë', 'NOUN', 'acc sg def'], ['vajzës', 'vajzë', 'NOUN', 'dat sg def'], ['vajzat', 'vajzë', 'NOUN', 'nom pl def'], ['vajzave', 'vajzë', 'NOUN', 'dat pl'],
  ['djali', 'djalë', 'NOUN', 'nom sg def m'], ['djalin', 'djalë', 'NOUN', 'acc sg def'], ['djalit', 'djalë', 'NOUN', 'gen sg def'],
  ['djem', 'djalë', 'NOUN', 'nom pl indef'], ['djemtë', 'djalë', 'NOUN', 'nom pl def'], ['djemve', 'djalë', 'NOUN', 'dat pl'],
  ['shoku', 'shok', 'NOUN', 'nom sg def'], ['shokun', 'shok', 'NOUN', 'acc sg def'], ['shokut', 'shok', 'NOUN', 'dat sg def'],
  ['shokë', 'shok', 'NOUN', 'nom pl indef'], ['shokët', 'shok', 'NOUN', 'nom pl def'], ['shokëve', 'shok', 'NOUN', 'gen pl'],
  ['shtëpia', 'shtëpi', 'NOUN', 'nom sg def f'], ['shtëpinë', 'shtëpi', 'NOUN', 'acc sg def'], ['shtëpisë', 'shtëpi', 'NOUN', 'dat sg def'],
  ['shtëpitë', 'shtëpi', 'NOUN', 'nom pl def'], ['shtëpive', 'shtëpi', 'NOUN', 'gen pl'],
  ['mali', 'mal', 'NOUN', 'nom sg def'], ['malin', 'mal', 'NOUN', 'acc sg def'], ['male', 'mal', 'NOUN', 'nom pl indef'], ['malet', 'mal', 'NOUN', 'nom pl def'],
  ['dita', 'ditë', 'NOUN', 'nom sg def f'], ['ditën', 'ditë', 'NOUN', 'acc sg def'], ['ditës', 'ditë', 'NOUN', 'dat sg def'], ['ditët', 'ditë', 'NOUN', 'nom pl def'],
  ['gruaja', 'grua', 'NOUN', 'nom sg def f'], ['gruan', 'grua', 'NOUN', 'acc sg def'], ['gruas', 'grua', 'NOUN', 'dat sg def'], ['gra', 'grua', 'NOUN', 'nom pl indef'], ['gratë', 'grua', 'NOUN', 'nom pl def'],
  ['burri', 'burrë', 'NOUN', 'nom sg def m'], ['burrin', 'burrë', 'NOUN', 'acc sg def'], ['burra', 'burrë', 'NOUN', 'nom pl indef'], ['burrat', 'burrë', 'NOUN', 'nom pl def'],
  ['zemra', 'zemër', 'NOUN', 'nom sg def f'], ['zemrën', 'zemër', 'NOUN', 'acc sg def'], ['zemrës', 'zemër', 'NOUN', 'dat sg def'],
  ['motra', 'motër', 'NOUN', 'nom sg def f'], ['motrën', 'motër', 'NOUN', 'acc sg def'], ['motrat', 'motër', 'NOUN', 'nom pl def'],
  ['vëllai', 'vëlla', 'NOUN', 'nom sg def m'], ['vëllanë', 'vëlla', 'NOUN', 'acc sg def'], ['vëllezër', 'vëlla', 'NOUN', 'nom pl indef'], ['vëllezërit', 'vëlla', 'NOUN', 'nom pl def'],
  ['qyteti', 'qytet', 'NOUN', 'nom sg def'], ['qytetin', 'qytet', 'NOUN', 'acc sg def'], ['qytete', 'qytet', 'NOUN', 'nom pl indef'], ['qytetet', 'qytet', 'NOUN', 'nom pl def'],
  ['mësuesi', 'mësues', 'NOUN', 'nom sg def'], ['mësuesin', 'mësues', 'NOUN', 'acc sg def'], ['mësuesit', 'mësues', 'NOUN', 'nom pl def'], ['mësuesve', 'mësues', 'NOUN', 'dat pl'],
  ['uji', 'ujë', 'NOUN', 'nom sg def'], ['ujin', 'ujë', 'NOUN', 'acc sg def'],
  ['buka', 'bukë', 'NOUN', 'nom sg def f'], ['bukën', 'bukë', 'NOUN', 'acc sg def'],
  ['fjala', 'fjalë', 'NOUN', 'nom sg def f'], ['fjalën', 'fjalë', 'NOUN', 'acc sg def'], ['fjalët', 'fjalë', 'NOUN', 'nom pl def'],
  ['kisha', 'kishë', 'NOUN', 'nom sg def f'], ['kishën', 'kishë', 'NOUN', 'acc sg def'],
  ['dora', 'dorë', 'NOUN', 'nom sg def f'], ['dorën', 'dorë', 'NOUN', 'acc sg def'], ['duar', 'dorë', 'NOUN', 'nom pl indef'], ['duart', 'dorë', 'NOUN', 'nom pl def'],
];

const VERBS: Row[] = [
  ['jam', 'jam', 'VERB', '1 sg pres ind'], ['je', 'jam', 'VERB', '2 sg pres ind'], ['është', 'jam', 'VERB', '3 sg pres ind'],
  ['jemi', 'jam', 'VERB', '1 pl pres ind'], ['jeni', 'jam', 'VERB', '2 pl pres ind'], ['janë', 'jam', 'VERB', '3 pl pres ind'],
  ['isha', 'jam', 'VERB', '1 sg impf'], ['ishte', 'jam', 'VERB', '3 sg impf'], ['ishin', 'jam', 'VERB', '3 pl impf'],
  ['jetë', 'jam', 'VERB', '3 sg subj'], ['jesh', 'jam', 'VERB', '2 sg subj'], ['qenë', 'jam', 'VERB', 'ptcp'],
  ['kam', 'kam', 'VERB', '1 sg pres ind'], ['ke', 'kam', 'VERB', '2 sg pres ind'], ['ka', 'kam', 'VERB', '3 sg pres ind'],
  ['kemi', 'kam', 'VERB', '1 pl pres ind'], ['keni', 'kam', 'VERB', '2 pl pres ind'], ['kanë', 'kam', 'VERB', '3 pl pres ind'],
  ['kisha', 'kam', 'VERB', '1 sg impf'], ['kishte', 'kam', 'VERB', '3 sg impf'], ['pata', 'kam', 'VERB', '1 sg aor'], ['pati', 'kam', 'VERB', '3 sg aor'],
  ['ketë', 'kam', 'VERB', '3 sg subj'], ['kesh', 'kam', 'VERB', '2 sg subj'], ['pasur', 'kam', 'VERB', 'ptcp'],
  ['punoj', 'punoj', 'VERB', '1 sg pres ind'], ['punon', 'punoj', 'VERB', '3 sg pres ind'], ['punon', 'punoj', 'VERB', '2 sg pres ind'],
  ['punojmë', 'punoj', 'VERB', '1 pl pres ind'], ['punoni', 'punoj', 'VERB', '2 pl pres ind'], ['punojnë', 'punoj', 'VERB', '3 pl pres ind'],
  ['punoja', 'punoj', 'VERB', '1 sg impf'], ['punonte', 'punoj', 'VERB', '3 sg impf'], ['punonin', 'punoj', 'VERB', '3 pl impf'],
  ['punova', 'punoj', 'VERB', '1 sg aor'], ['punove', 'punoj', 'VERB', '2 sg aor'], ['punoi', 'punoj', 'VERB', '3 sg aor'],
  ['punuam', 'punoj', 'VERB', '1 pl aor'], ['punuat', 'punoj', 'VERB', '2 pl aor'], ['punuan', 'punoj', 'VERB', '3 pl aor'],
  ['punosh', 'punoj', 'VERB', '2 sg subj'], ['punojë', 'punoj', 'VERB', '3 sg subj'], ['puno', 'punoj', 'VERB', '2 sg imper'], ['punuar', 'punoj', 'VERB', 'ptcp'],
  ['hap', 'hap', 'VERB', '1 sg pres ind'], ['hapim', 'hap', 'VERB', '1 pl pres ind'], ['hapni', 'hap', 'VERB', '2 pl pres ind'], ['hapin', 'hap', 'VERB', '3 pl pres ind'],
  ['hapja', 'hap', 'VERB', '1 sg impf'], ['hapte', 'hap', 'VERB', '3 sg impf'], ['hapa', 'hap', 'VERB', '1 sg aor'], ['hapi', 'hap', 'VERB', '3 sg aor'],
  ['hapëm', 'hap', 'VERB', '1 pl aor'], ['hapën', 'hap', 'VERB', '3 pl aor'], ['hapësh', 'hap', 'VERB', '2 sg subj'], ['hapë', 'hap', 'VERB', '3 sg subj'], ['hapur', 'hap', 'VERB', 'ptcp'],
  ['shkova', 'shkoj', 'VERB', '1 sg aor'], ['shkoi', 'shkoj', 'VERB', '3 sg aor'], ['shkuar', 'shkoj', 'VERB', 'ptcp'],
  ['merr', 'marr', 'VERB', '3 sg pres ind'], ['marrim', 'marr', 'VERB', '1 pl pres ind'], ['merrni', 'marr', 'VERB', '2 pl pres ind'], ['marrin', 'marr', 'VERB', '3 pl pres ind'],
  ['mora', 'marr', 'VERB', '1 sg aor'], ['mori', 'marr', 'VERB', '3 sg aor'], ['morën', 'marr', 'VERB', '3 pl aor'], ['marrë', 'marr', 'VERB', 'ptcp'],
  ['jep', 'jap', 'VERB', '3 sg pres ind'], ['japim', 'jap', 'VERB', '1 pl pres ind'], ['jepni', 'jap', 'VERB', '2 pl pres ind'], ['japin', 'jap', 'VERB', '3 pl pres ind'],
  ['dhashë', 'jap', 'VERB', '1 sg aor'], ['dha', 'jap', 'VERB', '3 sg aor'], ['dhanë', 'jap', 'VERB', '3 pl aor'], ['dhënë', 'jap', 'VERB', 'ptcp'],
  ['thua', 'them', 'VERB', '2 sg pres ind'], ['thotë', 'them', 'VERB', '3 sg pres ind'], ['themi', 'them', 'VERB', '1 pl pres ind'], ['thonë', 'them', 'VERB', '3 pl pres ind'],
  ['thashë', 'them', 'VERB', '1 sg aor'], ['tha', 'them', 'VERB', '3 sg aor'], ['thanë', 'them', 'VERB', '3 pl aor'], ['thënë', 'them', 'VERB', 'ptcp'],
  ['sheh', 'shoh', 'VERB', '3 sg pres ind'], ['shohim', 'shoh', 'VERB', '1 pl pres ind'], ['shihni', 'shoh', 'VERB', '2 pl pres ind'], ['shohin', 'shoh', 'VERB', '3 pl pres ind'],
  ['pashë', 'shoh', 'VERB', '1 sg aor'], ['pa', 'shoh', 'VERB', '3 sg aor'], ['panë', 'shoh', 'VERB', '3 pl aor'], ['parë', 'shoh', 'VERB', 'ptcp'],
  ['vjen', 'vij', 'VERB', '3 sg pres ind'], ['vijmë', 'vij', 'VERB', '1 pl pres ind'], ['vini', 'vij', 'VERB', '2 pl pres ind'], ['vijnë', 'vij', 'VERB', '3 pl pres ind'],
  ['erdha', 'vij', 'VERB', '1 sg aor'], ['erdhi', 'vij', 'VERB', '3 sg aor'], ['erdhën', 'vij', 'VERB', '3 pl aor'], ['ardhur', 'vij', 'VERB', 'ptcp'],
  ['dua', 'dua', 'VERB', '1 sg pres ind'], ['do', 'dua', 'VERB', '3 sg pres ind'], ['duam', 'dua', 'VERB', '1 pl pres ind'], ['doni', 'dua', 'VERB', '2 pl pres ind'], ['duan', 'dua', 'VERB', '3 pl pres ind'],
  ['desha', 'dua', 'VERB', '1 sg aor'], ['deshi', 'dua', 'VERB', '3 sg aor'], ['dashur', 'dua', 'VERB', 'ptcp'],
  ['ha', 'ha', 'VERB', '1 sg pres ind'], ['hamë', 'ha', 'VERB', '1 pl pres ind'], ['hani', 'ha', 'VERB', '2 pl pres ind'], ['hanë', 'ha', 'VERB', '3 pl pres ind'],
  ['hëngra', 'ha', 'VERB', '1 sg aor'], ['hëngri', 'ha', 'VERB', '3 sg aor'], ['ngrënë', 'ha', 'VERB', 'ptcp'],
  ['pimë', 'pi', 'VERB', '1 pl pres ind'], ['piva', 'pi', 'VERB', '1 sg aor'], ['piu', 'pi', 'VERB', '3 sg aor'], ['pirë', 'pi', 'VERB', 'ptcp'],
  ['di', 'di', 'VERB', '1 sg pres ind'], ['dimë', 'di', 'VERB', '1 pl pres ind'], ['dinë', 'di', 'VERB', '3 pl pres ind'], ['dija', 'di', 'VERB', '1 sg impf'], ['dinte', 'di', 'VERB', '3 sg impf'], ['ditur', 'di', 'VERB', 'ptcp'],
  ['flet', 'flas', 'VERB', '3 sg pres ind'], ['flasim', 'flas', 'VERB', '1 pl pres ind'], ['flisni', 'flas', 'VERB', '2 pl pres ind'], ['flasin', 'flas', 'VERB', '3 pl pres ind'],
  ['fola', 'flas', 'VERB', '1 sg aor'], ['foli', 'flas', 'VERB', '3 sg aor'], ['folën', 'flas', 'VERB', '3 pl aor'], ['folur', 'flas', 'VERB', 'ptcp'],
  ['bën', 'bëj', 'VERB', '3 sg pres ind'], ['bëjmë', 'bëj', 'VERB', '1 pl pres ind'], ['bëra', 'bëj', 'VERB', '1 sg aor'], ['bëri', 'bëj', 'VERB', '3 sg aor'], ['bënë', 'bëj', 'VERB', '3 pl aor'], ['bërë', 'bëj', 'VERB', 'ptcp'],
  ['lahem', 'laj', 'VERB', '1 sg pres mid'], ['lahesh', 'laj', 'VERB', '2 sg pres mid'], ['lahet', 'laj', 'VERB', '3 sg pres mid'], ['lahen', 'laj', 'VERB', '3 pl pres mid'],
  ['flini', 'fle', 'VERB', '2 pl pres ind'], ['fjeta', 'fle', 'VERB', '1 sg aor'], ['fjetur', 'fle', 'VERB', 'ptcp'],
  ['lexoj', 'lexoj', 'VERB', '1 sg pres ind'], ['lexova', 'lexoj', 'VERB', '1 sg aor'], ['lexuar', 'lexoj', 'VERB', 'ptcp'],
  ['shkruan', 'shkruaj', 'VERB', '3 sg pres ind'], ['shkrova', 'shkruaj', 'VERB', '1 sg aor'], ['shkroi', 'shkruaj', 'VERB', '3 sg aor'], ['shkruar', 'shkruaj', 'VERB', 'ptcp'],
];

describe('Albanian word forms (coordinator\'s judged table)', () => {
  it.each(NOUNS)('noun: %s is %s/%s (%s)', (form, lemma, pos, tags) => {
    expect(has(form, lemma, pos, tags), describeReadings(form)).toBe(true);
  });
  it.each(VERBS)('verb: %s is %s/%s (%s)', (form, lemma, pos, tags) => {
    expect(has(form, lemma, pos, tags), describeReadings(form)).toBe(true);
  });

  it('adjectives with a linking article: forms, and the flag', () => {
    const adj = (form: string, lemma: string, g: string, n: string) => analyzeSqForm(form).some((r) => r.pos === 'ADJ' && r.lemma === lemma && r.articulated === true && sqAgree(r.morph.Gender, g) && sqAgree(r.morph.Number, n));
    expect(adj('mirë', 'mirë', 'Masc', 'Sing')).toBe(true);
    expect(adj('mirë', 'mirë', 'Fem', 'Sing')).toBe(true);
    expect(adj('mira', 'mirë', 'Fem', 'Plur')).toBe(true);
    expect(adj('madh', 'madh', 'Masc', 'Sing')).toBe(true);
    expect(adj('madhe', 'madh', 'Fem', 'Sing')).toBe(true);
    expect(adj('mëdhenj', 'madh', 'Masc', 'Plur')).toBe(true);
    expect(adj('mëdha', 'madh', 'Fem', 'Plur')).toBe(true);
    expect(adj('ri', 'ri', 'Masc', 'Sing')).toBe(true);
    expect(adj('re', 'ri', 'Fem', 'Sing')).toBe(true);
    expect(adj('rinj', 'ri', 'Masc', 'Plur')).toBe(true);
    expect(adj('reja', 'ri', 'Fem', 'Plur')).toBe(true);
    expect(adj('vogël', 'vogël', 'Masc', 'Sing')).toBe(true);
    expect(adj('vegjël', 'vogël', 'Masc', 'Plur')).toBe(true);
    expect(adj('vogla', 'vogël', 'Fem', 'Plur')).toBe(true);
    // one that takes no article
    expect(analyzeSqForm('besnik').some((r) => r.pos === 'ADJ' && !r.articulated)).toBe(true);
  });

  it('the little words keep every reading, none presented as certain', () => {
    const kinds = (form: string) => analyzeSqForm(form).map((r) => `${r.pos}${r.morph.Clitic ? ':clitic' : ''}${r.morph.PronType === 'Art' ? ':article' : ''}`);
    expect(kinds('e')).toEqual(expect.arrayContaining(['PRON:clitic', 'DET:article', 'CONJ']));
    expect(kinds('i')).toEqual(expect.arrayContaining(['PRON:clitic', 'DET:article']));
    expect(kinds('të')).toEqual(expect.arrayContaining(['PART', 'PRON:clitic', 'DET:article']));
    expect(kinds('së')).toEqual(expect.arrayContaining(['DET:article']));
    for (const w of ['e', 'i', 'të', 'më', 'u']) for (const r of analyzeSqForm(w)) expect(r.confidence, w).toBeLessThanOrEqual(0.6);
    // the linking article is not given an English word
    for (const w of ['e', 'i', 'të', 'së']) for (const r of analyzeSqForm(w).filter((x) => x.morph.PronType === 'Art')) { expect(r.gloss ?? '').toBe(''); expect(r.role ?? '').toMatch(/linking article/); }
  });

  it('fused short pronouns show their parts', () => {
    const parts = (form: string) => analyzeSqForm(sqNormalize(form)).filter((r) => r.parts?.length).map((r) => r.parts!.map((p) => p.lemma).join('+'));
    const made = (form: string) => analyzeSqForm(sqNormalize(form)).filter((r) => r.parts?.length).map((r) => r.rule);
    expect(made('ma').some((r) => /më \+ e/.test(r))).toBe(true);
    expect(made('ta').some((r) => /të \+ e/.test(r))).toBe(true);
    expect(parts('ta').length).toBeGreaterThanOrEqual(2); // to you + it; the particle të + it
    expect(made('ia').some((r) => /i \+ e/.test(r))).toBe(true);
    expect(made("t'i").some((r) => /të \+ i/.test(r))).toBe(true);
    expect(made("m'u").some((r) => /më \+ u/.test(r))).toBe(true);
    expect(made('ua').some((r) => /u \+ e/.test(r))).toBe(true);
    // the typographic apostrophe is the same word
    expect(analyzeSqForm(sqNormalize('t’i')).length).toBe(analyzeSqForm("t'i").length);
    // negation fused with a verb: the verb is still the verb
    const sjam = analyzeSqForm("s'jam");
    expect(sjam.some((r) => r.lemma === 'jam' && r.parts?.length === 2)).toBe(true);
  });

  it('prepositions state the case they govern', () => {
    const governs = (form: string) => analyzeSqForm(form).find((r) => r.pos === 'ADP')?.governs;
    expect(governs('në')).toBe('Acc');
    expect(governs('me')).toBe('Acc');
    expect(governs('për')).toBe('Acc');
    expect(governs('nga')).toBe('Nom');
    expect(governs('te')).toBe('Nom');
    expect(governs('prej')).toBe('Abl');
  });

  it('a word typed without ë / ç is read as the properly spelled word, and says so', () => {
    const r = analyzeSqForm('eshte');
    expect(r.length).toBeGreaterThan(0);
    expect(r[0].lemma).toBe('jam');
    expect(r[0].relation).toMatchObject({ standard: 'është', period: 'sq-ascii' });
    expect(r[0].confidence).toBeLessThanOrEqual(0.7);
    expect(analyzeSqForm('shtepi')[0]?.relation?.standard).toBe('shtëpi');
  });

  it('a Gheg form is related to its Standard equivalent, not treated as Standard', () => {
    const r = analyzeSqForm('asht');
    expect(r[0]?.lemma).toBe('jam');
    expect(r[0]?.relation).toMatchObject({ standard: 'është', period: 'aln' });
    expect(r[0]?.varieties).toContain('aln');
    const nji = analyzeSqForm('nji');
    expect(nji[0]?.relation?.standard).toBe('një');
  });

  it('recognises the Gheg osht spelling as the Standard copula equivalent', () => {
    for (const [form, standard] of [['osht', 'është']] as const) {
      const r = analyzeSqForm(form);
      expect(r[0]?.lemma).toBe('jam');
      expect(r[0]?.relation).toMatchObject({ standard, period: 'aln' });
      expect(r[0]?.varieties).toContain('aln');
    }
  });

  it('an unknown word is a marked guess or nothing — never a confident reading', () => {
    for (const w of ['zurfova', 'blorgave', 'xyzq']) {
      for (const r of analyzeSqForm(w)) {
        expect(r.lemmaKnown, w).toBe(false);
        expect(r.confidence, w).toBeLessThanOrEqual(0.5);
        expect(r.gloss, w).toBeUndefined();
      }
    }
    expect(analyzeSqForm('xyzq')).toEqual([]);
  });
});
