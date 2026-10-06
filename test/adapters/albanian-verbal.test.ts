/**
 * Albanian verbal morphology (package Q2): full paradigms of the verbs the course leans on, the union rules (Person
 * '2,3', Mood 'Ind,Sub'), the `forms` override, readings by ending for an unknown verb, and checks over the whole list.
 * The expected paradigms are written out here independently of the rules; they are the drafter's knowledge of Standard
 * Albanian and have not been checked by a native speaker.
 */
import { describe, expect, it } from 'vitest';
import { guessVerb, verbForms } from '../../src/adapters/albanian/morph-verb';
import { SQ_VERBS } from '../../src/adapters/albanian/lexicon-verbs';
import { V } from '../../src/adapters/albanian/types';
import type { SqForm } from '../../src/adapters/albanian/types';

const lex = (lemma: string) => {
  const l = SQ_VERBS.find((v) => v.lemma === lemma);
  if (!l) throw new Error(`no verb ${lemma}`);
  return l;
};
const formsOf = (lemma: string): SqForm[] => verbForms(lex(lemma));
const NUM = ['Sing', 'Sing', 'Sing', 'Plur', 'Plur', 'Plur'];
const PER = ['1', '2', '3', '1', '2', '3'];

/** Does some reading of `form` carry every wanted feature value (a comma union contains it)? */
const reads = (forms: SqForm[], form: string, want: Record<string, string>): boolean =>
  forms.some((f) => f.form === form && Object.entries(want).every(([k, v]) => (f.morph[k] ?? '').split(',').includes(v)));

/** Six forms of one tense and mood, persons in order 1sg 2sg 3sg 1pl 2pl 3pl. */
function paradigm(lemma: string, tense: string | undefined, mood: string, six: string[], voice = 'Act'): void {
  const forms = formsOf(lemma);
  six.forEach((form, i) => {
    const want: Record<string, string> = { Person: PER[i], Number: NUM[i], Mood: mood, Voice: voice, VerbForm: 'Fin' };
    if (tense) want.Tense = tense;
    expect(reads(forms, form, want), `${lemma}: ${form} as ${tense ?? ''} ${mood} ${voice} person ${i + 1}`).toBe(true);
  });
}

const distinct = (lemma: string): string[] => [...new Set(formsOf(lemma).map((f) => f.form))].sort();

describe('regular verbs in -oj', () => {
  it('punoj: every active form', () => {
    paradigm('punoj', 'Pres', 'Ind', ['punoj', 'punon', 'punon', 'punojmë', 'punoni', 'punojnë']);
    paradigm('punoj', 'Imp', 'Ind', ['punoja', 'punoje', 'punonte', 'punonim', 'punonit', 'punonin']);
    paradigm('punoj', 'Past', 'Ind', ['punova', 'punove', 'punoi', 'punuam', 'punuat', 'punuan']);
    paradigm('punoj', 'Pres', 'Sub', ['punoj', 'punosh', 'punojë', 'punojmë', 'punoni', 'punojnë']);
    paradigm('punoj', undefined, 'Opt', ['punofsha', 'punofsh', 'punoftë', 'punofshim', 'punofshi', 'punofshin']);
    paradigm('punoj', 'Pres', 'Adm', ['punuakam', 'punuake', 'punuaka', 'punuakemi', 'punuakeni', 'punuakan']);
    const f = formsOf('punoj');
    expect(reads(f, 'puno', { Mood: 'Imp', Person: '2', Number: 'Sing' })).toBe(true);
    expect(reads(f, 'punoni', { Mood: 'Imp', Person: '2', Number: 'Plur' })).toBe(true);
    expect(f.find((x) => x.form === 'punuar')!.morph).toEqual({ VerbForm: 'Part' });
  });

  it('punoj: the whole set of written forms is exactly this', () => {
    expect(distinct('punoj')).toEqual(
      [
        'punoj', 'punon', 'punojmë', 'punoni', 'punojnë', 'punosh', 'punojë',
        'punoja', 'punoje', 'punonte', 'punonim', 'punonit', 'punonin',
        'punova', 'punove', 'punoi', 'punuam', 'punuat', 'punuan', 'puno', 'punuar',
        'punofsha', 'punofsh', 'punoftë', 'punofshim', 'punofshi', 'punofshin',
        'punuakam', 'punuake', 'punuaka', 'punuakemi', 'punuakeni', 'punuakan',
        'punohem', 'punohesh', 'punohet', 'punohemi', 'punoheni', 'punohen',
        'punohesha', 'punoheshe', 'punohej', 'punoheshim', 'punoheshit', 'punoheshin', 'punohu', 'punohuni', 'punua',
      ].sort(),
    );
  });

  it('punoj: non-active', () => {
    paradigm('punoj', 'Pres', 'Ind', ['punohem', 'punohesh', 'punohet', 'punohemi', 'punoheni', 'punohen'], 'Mid');
    paradigm('punoj', 'Pres', 'Sub', ['punohem', 'punohesh', 'punohet', 'punohemi', 'punoheni', 'punohen'], 'Mid');
    paradigm('punoj', 'Imp', 'Ind', ['punohesha', 'punoheshe', 'punohej', 'punoheshim', 'punoheshit', 'punoheshin'], 'Mid');
    const f = formsOf('punoj');
    expect(reads(f, 'punohu', { Mood: 'Imp', Voice: 'Mid', Person: '2', Number: 'Sing' })).toBe(true);
    expect(reads(f, 'punohuni', { Mood: 'Imp', Voice: 'Mid', Person: '2', Number: 'Plur' })).toBe(true);
    expect(f.find((x) => x.form === 'punua')!.morph).toEqual({ Person: '3', Number: 'Sing', Tense: 'Past', Mood: 'Ind', Voice: 'Mid', VerbForm: 'Fin' });
  });

  it('shkruaj: -uaj verbs keep the -a- in the active, lose it in the non-active', () => {
    paradigm('shkruaj', 'Pres', 'Ind', ['shkruaj', 'shkruan', 'shkruan', 'shkruajmë', 'shkruani', 'shkruajnë']);
    paradigm('shkruaj', 'Imp', 'Ind', ['shkruaja', 'shkruaje', 'shkruante', 'shkruanim', 'shkruanit', 'shkruanin']);
    paradigm('shkruaj', 'Past', 'Ind', ['shkrova', 'shkrove', 'shkroi', 'shkruam', 'shkruat', 'shkruan']);
    paradigm('shkruaj', 'Pres', 'Sub', ['shkruaj', 'shkruash', 'shkruajë', 'shkruajmë', 'shkruani', 'shkruajnë']);
    paradigm('shkruaj', 'Pres', 'Ind', ['shkruhem', 'shkruhesh', 'shkruhet', 'shkruhemi', 'shkruheni', 'shkruhen'], 'Mid');
    const f = formsOf('shkruaj');
    expect(reads(f, 'shkruaj', { Mood: 'Imp', Person: '2', Number: 'Sing' })).toBe(true);
    expect(reads(f, 'shkruar', { VerbForm: 'Part' })).toBe(true);
    expect(f.some((x) => x.morph.Mood === 'Opt' || x.morph.Mood === 'Adm')).toBe(false); // not generated outside -oj
  });

  it('blej: u-aorist, and the non-active stem blih-', () => {
    paradigm('blej', 'Pres', 'Ind', ['blej', 'blen', 'blen', 'blejmë', 'bleni', 'blejnë']);
    paradigm('blej', 'Past', 'Ind', ['bleva', 'bleve', 'bleu', 'blemë', 'bletë', 'blenë']);
    paradigm('blej', 'Pres', 'Sub', ['blej', 'blesh', 'blejë', 'blejmë', 'bleni', 'blejnë']);
    paradigm('blej', 'Pres', 'Ind', ['blihem', 'blihesh', 'blihet', 'blihemi', 'bliheni', 'blihen'], 'Mid');
    expect(reads(formsOf('blej'), 'blerë', { VerbForm: 'Part' })).toBe(true);
    expect(formsOf('blej').some((f) => f.form === 'blehem')).toBe(false);
  });
});

describe('consonant and vowel stems', () => {
  it('hap', () => {
    paradigm('hap', 'Pres', 'Ind', ['hap', 'hap', 'hap', 'hapim', 'hapni', 'hapin']);
    paradigm('hap', 'Imp', 'Ind', ['hapja', 'hapje', 'hapte', 'hapnim', 'hapnit', 'hapnin']);
    paradigm('hap', 'Past', 'Ind', ['hapa', 'hape', 'hapi', 'hapëm', 'hapët', 'hapën']);
    paradigm('hap', 'Pres', 'Sub', ['hap', 'hapësh', 'hapë', 'hapim', 'hapni', 'hapin']);
    paradigm('hap', 'Pres', 'Ind', ['hapem', 'hapesh', 'hapet', 'hapemi', 'hapeni', 'hapen'], 'Mid');
    const f = formsOf('hap');
    expect(reads(f, 'hap', { Mood: 'Imp', Person: '2', Number: 'Sing' })).toBe(true);
    expect(reads(f, 'hapni', { Mood: 'Imp', Person: '2', Number: 'Plur' })).toBe(true);
    expect(reads(f, 'hapur', { VerbForm: 'Part' })).toBe(true);
    // hapi is the active 3sg aorist; the non-active 3sg aorist is the bare stem (u hap)
    expect(reads(f, 'hap', { Voice: 'Mid', Tense: 'Past', Person: '3', Number: 'Sing' })).toBe(true);
    expect(f.some((x) => x.morph.Mood === 'Opt')).toBe(false);
  });

  it('marr (stem change merr-)', () => {
    paradigm('marr', 'Pres', 'Ind', ['marr', 'merr', 'merr', 'marrim', 'merrni', 'marrin']);
    paradigm('marr', 'Imp', 'Ind', ['merrja', 'merrje', 'merrte', 'merrnim', 'merrnit', 'merrnin']);
    paradigm('marr', 'Past', 'Ind', ['mora', 'more', 'mori', 'morëm', 'morët', 'morën']);
    paradigm('marr', 'Pres', 'Sub', ['marr', 'marrësh', 'marrë', 'marrim', 'merrni', 'marrin']);
    paradigm('marr', 'Pres', 'Ind', ['merrem', 'merresh', 'merret', 'merremi', 'merreni', 'merren'], 'Mid');
    const f = formsOf('marr');
    expect(reads(f, 'merr', { Mood: 'Imp', Person: '2', Number: 'Sing' })).toBe(true);
    expect(reads(f, 'merrni', { Mood: 'Imp', Person: '2', Number: 'Plur' })).toBe(true);
    expect(reads(f, 'marrë', { VerbForm: 'Part' })).toBe(true);
  });

  it('flas (flet, flisni, fol)', () => {
    paradigm('flas', 'Pres', 'Ind', ['flas', 'flet', 'flet', 'flasim', 'flisni', 'flasin']);
    paradigm('flas', 'Imp', 'Ind', ['flisja', 'flisje', 'fliste', 'flisnim', 'flisnit', 'flisnin']);
    paradigm('flas', 'Past', 'Ind', ['fola', 'fole', 'foli', 'folëm', 'folët', 'folën']);
    paradigm('flas', 'Pres', 'Sub', ['flas', 'flasësh', 'flasë', 'flasim', 'flisni', 'flasin']);
    paradigm('flas', 'Pres', 'Ind', ['flitem', 'flitesh', 'flitet', 'flitemi', 'fliteni', 'fliten'], 'Mid');
    const f = formsOf('flas');
    expect(reads(f, 'fol', { Mood: 'Imp', Person: '2', Number: 'Sing' })).toBe(true);
    expect(reads(f, 'flisni', { Mood: 'Imp', Person: '2', Number: 'Plur' })).toBe(true);
    expect(f.some((x) => x.form === 'flet' && x.morph.Mood === 'Imp')).toBe(false); // no imperative guessed from the 3sg
    expect(reads(f, 'folur', { VerbForm: 'Part' })).toBe(true);
  });

  it('dal (del, dilni, dil)', () => {
    paradigm('dal', 'Pres', 'Ind', ['dal', 'del', 'del', 'dalim', 'dilni', 'dalin']);
    paradigm('dal', 'Imp', 'Ind', ['dilja', 'dilje', 'dilte', 'dilnim', 'dilnit', 'dilnin']);
    paradigm('dal', 'Past', 'Ind', ['dola', 'dole', 'doli', 'dolëm', 'dolët', 'dolën']);
    paradigm('dal', 'Pres', 'Sub', ['dal', 'dalësh', 'dalë', 'dalim', 'dilni', 'dalin']);
    const f = formsOf('dal');
    expect(reads(f, 'dil', { Mood: 'Imp', Person: '2', Number: 'Sing' })).toBe(true);
    expect(reads(f, 'dilni', { Mood: 'Imp', Person: '2', Number: 'Plur' })).toBe(true);
    expect(reads(f, 'dalë', { VerbForm: 'Part' })).toBe(true);
    expect(reads(f, 'dalë', { Mood: 'Sub', Person: '3' })).toBe(true); // the participle and the 3sg subjunctive look alike
  });

  it('ha', () => {
    paradigm('ha', 'Pres', 'Ind', ['ha', 'ha', 'ha', 'hamë', 'hani', 'hanë']);
    paradigm('ha', 'Imp', 'Ind', ['haja', 'haje', 'hante', 'hanim', 'hanit', 'hanin']);
    paradigm('ha', 'Past', 'Ind', ['hëngra', 'hëngre', 'hëngri', 'hëngrëm', 'hëngrët', 'hëngrën']);
    paradigm('ha', 'Pres', 'Sub', ['ha', 'hash', 'hajë', 'hamë', 'hani', 'hanë']);
    const f = formsOf('ha');
    expect(reads(f, 'ha', { Mood: 'Imp', Person: '2', Number: 'Sing' })).toBe(true);
    expect(reads(f, 'hani', { Mood: 'Imp', Person: '2', Number: 'Plur' })).toBe(true);
    expect(reads(f, 'ngrënë', { VerbForm: 'Part' })).toBe(true);
  });

  it('pi (u-aorist, pimë both present and aorist)', () => {
    paradigm('pi', 'Pres', 'Ind', ['pi', 'pi', 'pi', 'pimë', 'pini', 'pinë']);
    paradigm('pi', 'Imp', 'Ind', ['pija', 'pije', 'pinte', 'pinim', 'pinit', 'pinin']);
    paradigm('pi', 'Past', 'Ind', ['piva', 'pive', 'piu', 'pimë', 'pitë', 'pinë']);
    paradigm('pi', 'Pres', 'Sub', ['pi', 'pish', 'pijë', 'pimë', 'pini', 'pinë']);
    const f = formsOf('pi');
    expect(f.filter((x) => x.form === 'pimë')).toHaveLength(2);
    expect(f.filter((x) => x.form === 'pinë')).toHaveLength(2);
    expect(reads(f, 'pirë', { VerbForm: 'Part' })).toBe(true);
  });

  it('jap (jep, jepni, dhashë)', () => {
    paradigm('jap', 'Pres', 'Ind', ['jap', 'jep', 'jep', 'japim', 'jepni', 'japin']);
    paradigm('jap', 'Imp', 'Ind', ['jepja', 'jepje', 'jepte', 'jepnim', 'jepnit', 'jepnin']);
    paradigm('jap', 'Past', 'Ind', ['dhashë', 'dhe', 'dha', 'dhamë', 'dhatë', 'dhanë']);
    paradigm('jap', 'Pres', 'Sub', ['jap', 'japësh', 'japë', 'japim', 'jepni', 'japin']);
    const f = formsOf('jap');
    expect(reads(f, 'jep', { Mood: 'Imp', Person: '2', Number: 'Sing' })).toBe(true);
    expect(reads(f, 'dhënë', { VerbForm: 'Part' })).toBe(true);
    expect(reads(f, 'jepem', { Voice: 'Mid', Person: '1' })).toBe(true);
  });

  it('shoh (sheh, shihni, pashë)', () => {
    paradigm('shoh', 'Pres', 'Ind', ['shoh', 'sheh', 'sheh', 'shohim', 'shihni', 'shohin']);
    paradigm('shoh', 'Imp', 'Ind', ['shihja', 'shihje', 'shihte', 'shihnim', 'shihnit', 'shihnin']);
    paradigm('shoh', 'Past', 'Ind', ['pashë', 'pe', 'pa', 'pamë', 'patë', 'panë']);
    paradigm('shoh', 'Pres', 'Sub', ['shoh', 'shohësh', 'shohë', 'shohim', 'shihni', 'shohin']);
    paradigm('shoh', 'Pres', 'Ind', ['shihem', 'shihesh', 'shihet', 'shihemi', 'shiheni', 'shihen'], 'Mid');
    const f = formsOf('shoh');
    expect(reads(f, 'shih', { Mood: 'Imp', Person: '2', Number: 'Sing' })).toBe(true);
    expect(reads(f, 'shihni', { Mood: 'Imp', Person: '2', Number: 'Plur' })).toBe(true);
    expect(reads(f, 'parë', { VerbForm: 'Part' })).toBe(true);
  });
});

describe('irregular verbs', () => {
  it('jam', () => {
    paradigm('jam', 'Pres', 'Ind', ['jam', 'je', 'është', 'jemi', 'jeni', 'janë']);
    paradigm('jam', 'Imp', 'Ind', ['isha', 'ishe', 'ishte', 'ishim', 'ishit', 'ishin']);
    paradigm('jam', 'Past', 'Ind', ['qeshë', 'qe', 'qe', 'qemë', 'qetë', 'qenë']);
    paradigm('jam', 'Pres', 'Sub', ['jem', 'jesh', 'jetë', 'jemi', 'jeni', 'jenë']);
    paradigm('jam', undefined, 'Opt', ['qofsha', 'qofsh', 'qoftë', 'qofshim', 'qofshi', 'qofshin']);
    paradigm('jam', 'Pres', 'Adm', ['qenkam', 'qenke', 'qenka', 'qenkemi', 'qenkeni', 'qenkan']);
    const f = formsOf('jam');
    expect(reads(f, 'ji', { Mood: 'Imp', Person: '2', Number: 'Sing' })).toBe(true);
    expect(reads(f, 'jini', { Mood: 'Imp', Person: '2', Number: 'Plur' })).toBe(true);
    expect(reads(f, 'qenë', { VerbForm: 'Part' })).toBe(true);
    expect(reads(f, 'qenë', { Tense: 'Past', Person: '3', Number: 'Plur' })).toBe(true);
  });

  it('kam', () => {
    paradigm('kam', 'Pres', 'Ind', ['kam', 'ke', 'ka', 'kemi', 'keni', 'kanë']);
    paradigm('kam', 'Imp', 'Ind', ['kisha', 'kishe', 'kishte', 'kishim', 'kishit', 'kishin']);
    paradigm('kam', 'Past', 'Ind', ['pata', 'pate', 'pati', 'patëm', 'patët', 'patën']);
    paradigm('kam', 'Pres', 'Sub', ['kem', 'kesh', 'ketë', 'kemi', 'keni', 'kenë']);
    const f = formsOf('kam');
    expect(reads(f, 'ki', { Mood: 'Imp', Person: '2', Number: 'Sing' })).toBe(true);
    expect(reads(f, 'kini', { Mood: 'Imp', Person: '2', Number: 'Plur' })).toBe(true);
    expect(reads(f, 'pasur', { VerbForm: 'Part' })).toBe(true);
    expect(reads(f, 'paska', { Mood: 'Adm', Person: '3' })).toBe(true);
  });

  it('them', () => {
    paradigm('them', 'Pres', 'Ind', ['them', 'thua', 'thotë', 'themi', 'thoni', 'thonë']);
    paradigm('them', 'Imp', 'Ind', ['thosha', 'thoshe', 'thoshte', 'thoshim', 'thoshit', 'thoshin']);
    paradigm('them', 'Past', 'Ind', ['thashë', 'the', 'tha', 'thamë', 'thatë', 'thanë']);
    paradigm('them', 'Pres', 'Sub', ['them', 'thuash', 'thotë', 'themi', 'thoni', 'thonë']);
    paradigm('them', 'Pres', 'Ind', ['thuhem', 'thuhesh', 'thuhet', 'thuhemi', 'thuheni', 'thuhen'], 'Mid');
    const f = formsOf('them');
    expect(reads(f, 'thuaj', { Mood: 'Imp', Person: '2', Number: 'Sing' })).toBe(true);
    expect(reads(f, 'thoni', { Mood: 'Imp', Person: '2', Number: 'Plur' })).toBe(true);
    expect(reads(f, 'thënë', { VerbForm: 'Part' })).toBe(true);
  });

  it('dua (and duhet)', () => {
    paradigm('dua', 'Pres', 'Ind', ['dua', 'do', 'do', 'duam', 'doni', 'duan']);
    paradigm('dua', 'Imp', 'Ind', ['doja', 'doje', 'donte', 'donim', 'donit', 'donin']);
    paradigm('dua', 'Past', 'Ind', ['desha', 'deshe', 'deshi', 'deshëm', 'deshët', 'deshën']);
    paradigm('dua', 'Pres', 'Sub', ['dua', 'duash', 'dashë', 'duam', 'doni', 'duan']);
    paradigm('dua', 'Pres', 'Ind', ['duhem', 'duhesh', 'duhet', 'duhemi', 'duheni', 'duhen'], 'Mid');
    paradigm('dua', 'Imp', 'Ind', ['duhesha', 'duheshe', 'duhej', 'duheshim', 'duheshit', 'duheshin'], 'Mid');
    expect(reads(formsOf('dua'), 'dashur', { VerbForm: 'Part' })).toBe(true);
  });

  it('vij', () => {
    paradigm('vij', 'Pres', 'Ind', ['vij', 'vjen', 'vjen', 'vijmë', 'vini', 'vijnë']);
    paradigm('vij', 'Imp', 'Ind', ['vija', 'vije', 'vinte', 'vinim', 'vinit', 'vinin']);
    paradigm('vij', 'Past', 'Ind', ['erdha', 'erdhe', 'erdhi', 'erdhëm', 'erdhët', 'erdhën']);
    paradigm('vij', 'Pres', 'Sub', ['vij', 'vish', 'vijë', 'vijmë', 'vini', 'vijnë']);
    const f = formsOf('vij');
    expect(reads(f, 'eja', { Mood: 'Imp', Person: '2', Number: 'Sing' })).toBe(true);
    expect(reads(f, 'ejani', { Mood: 'Imp', Person: '2', Number: 'Plur' })).toBe(true);
    expect(reads(f, 'ardhur', { VerbForm: 'Part' })).toBe(true);
  });

  it('bie and iki', () => {
    paradigm('bie', 'Pres', 'Ind', ['bie', 'bie', 'bie', 'biem', 'bieni', 'bien']);
    paradigm('bie', 'Past', 'Ind', ['rashë', 're', 'ra', 'ramë', 'ratë', 'ranë']);
    paradigm('bie', 'Imp', 'Ind', ['bija', 'bije', 'binte', 'binim', 'binit', 'binin']);
    paradigm('iki', 'Pres', 'Ind', ['iki', 'ikën', 'ikën', 'ikim', 'ikni', 'ikin']);
    paradigm('iki', 'Past', 'Ind', ['ika', 'ike', 'iku', 'ikëm', 'ikët', 'ikën']);
    expect(reads(formsOf('iki'), 'ikur', { VerbForm: 'Part' })).toBe(true);
  });

  it('lë, vë, zë (mixed aorists stated in forms)', () => {
    paradigm('lë', 'Past', 'Ind', ['lashë', 'le', 'la', 'lamë', 'latë', 'lanë']);
    paradigm('lë', 'Pres', 'Sub', ['lë', 'lësh', 'lërë', 'lëmë', 'lini', 'lënë']);
    paradigm('vë', 'Past', 'Ind', ['vura', 'vure', 'vuri', 'vumë', 'vutë', 'vunë']);
    paradigm('zë', 'Past', 'Ind', ['zura', 'zure', 'zuri', 'zumë', 'zutë', 'zunë']);
    paradigm('bëj', 'Past', 'Ind', ['bëra', 'bëre', 'bëri', 'bëmë', 'bëtë', 'bënë']);
    paradigm('rri', 'Pres', 'Ind', ['rri', 'rri', 'rri', 'rrimë', 'rrini', 'rrinë']);
    paradigm('fle', 'Pres', 'Sub', ['fle', 'flesh', 'flejë', 'flemë', 'flini', 'flenë']);
    paradigm('di', 'Past', 'Ind', ['dita', 'dite', 'diti', 'ditëm', 'ditët', 'ditën']);
    expect(formsOf('vë').some((f) => f.form === 'vurëm')).toBe(false);
    expect(reads(formsOf('bëj'), 'bë', { Voice: 'Mid', Tense: 'Past', Person: '3' })).toBe(true); // u bë
    expect(formsOf('bëj').some((f) => f.form === 'bër')).toBe(false);
  });
});

describe('analyzer check, part 2: classes fixed', () => {
  it('vowel stems in -e / -ë take the i-stem in the 2nd plural (present and imperative), not in the 1st or 3rd plural', () => {
    for (const [lemma, i2, pl1, pl3] of [['fle', 'flini', 'flemë', 'flenë'], ['lë', 'lini', 'lëmë', 'lënë'], ['vë', 'vini', 'vëmë', 'vënë'], ['zë', 'zini', 'zëmë', 'zënë'], ['ngre', 'ngrini', 'ngremë', 'ngrenë']]) {
      const f = formsOf(lemma);
      expect(reads(f, i2, { Person: '2', Number: 'Plur', Tense: 'Pres' }), `${lemma}: ${i2}`).toBe(true);
      expect(reads(f, i2, { Person: '2', Number: 'Plur', Mood: 'Imp' }), `${lemma}: imperative ${i2}`).toBe(true);
      expect(reads(f, pl1, { Person: '1', Number: 'Plur' }), `${lemma}: ${pl1}`).toBe(true);
      expect(reads(f, pl3, { Person: '3', Number: 'Plur', Tense: 'Pres' }), `${lemma}: ${pl3}`).toBe(true);
      expect(f.some((x) => x.form === `${lemma}ni`)).toBe(false);
    }
    // stems in -a / -i keep their vowel
    expect(reads(formsOf('ha'), 'hani', { Person: '2', Number: 'Plur', Mood: 'Imp' })).toBe(true);
    expect(reads(formsOf('pi'), 'pini', { Person: '2', Number: 'Plur', Tense: 'Pres' })).toBe(true);
  });

  it('ndez: e becomes i before -ni and in the imperfect (a lexical fact of the verb, stated in forms)', () => {
    paradigm('ndez', 'Pres', 'Ind', ['ndez', 'ndez', 'ndez', 'ndezim', 'ndizni', 'ndezin']);
    paradigm('ndez', 'Imp', 'Ind', ['ndizja', 'ndizje', 'ndizte', 'ndiznim', 'ndiznit', 'ndiznin']);
    expect(reads(formsOf('ndez'), 'ndizni', { Mood: 'Imp', Person: '2', Number: 'Plur' })).toBe(true);
    expect(formsOf('ndez').some((x) => x.form === 'ndezni' || x.form === 'ndezte')).toBe(false);
  });

  it('short verbs in -j with an -ra aorist have the strong plural: hyra / hymë, as bëra / bëmë', () => {
    paradigm('hyj', 'Past', 'Ind', ['hyra', 'hyre', 'hyri', 'hymë', 'hytë', 'hynë']);
    expect(formsOf('hyj').some((x) => x.form === 'hyrëm' || x.form === 'hyrët' || x.form === 'hyrën')).toBe(false);
    expect(reads(formsOf('hyj'), 'hyrë', { VerbForm: 'Part' })).toBe(true);
    // marr keeps the weak plural: mora / morëm
    expect(reads(formsOf('marr'), 'morëm', { Tense: 'Past', Person: '1', Number: 'Plur' })).toBe(true);
  });

  it('kam: optative paça, paç, pastë, paçim, paçi, paçin', () => {
    paradigm('kam', undefined, 'Opt', ['paça', 'paç', 'pastë', 'paçim', 'paçi', 'paçin']);
    expect(formsOf('kam').some((x) => x.form === 'pasha' || x.form === 'pashim')).toBe(false);
  });
});

describe('laj / lahem, pendohem', () => {
  it('laj with its non-active', () => {
    paradigm('laj', 'Pres', 'Ind', ['laj', 'lan', 'lan', 'lajmë', 'lani', 'lajnë']);
    paradigm('laj', 'Imp', 'Ind', ['laja', 'laje', 'lante', 'lanim', 'lanit', 'lanin']);
    paradigm('laj', 'Past', 'Ind', ['lava', 'lave', 'lau', 'lamë', 'latë', 'lanë']);
    paradigm('laj', 'Pres', 'Sub', ['laj', 'lash', 'lajë', 'lajmë', 'lani', 'lajnë']);
    paradigm('laj', 'Pres', 'Ind', ['lahem', 'lahesh', 'lahet', 'lahemi', 'laheni', 'lahen'], 'Mid');
    paradigm('laj', 'Imp', 'Ind', ['lahesha', 'laheshe', 'lahej', 'laheshim', 'laheshit', 'laheshin'], 'Mid');
    const f = formsOf('laj');
    expect(reads(f, 'lahu', { Mood: 'Imp', Voice: 'Mid', Person: '2', Number: 'Sing' })).toBe(true);
    expect(reads(f, 'lahuni', { Mood: 'Imp', Voice: 'Mid', Person: '2', Number: 'Plur' })).toBe(true);
    expect(reads(f, 'larë', { VerbForm: 'Part' })).toBe(true);
    // lau is the active 3sg aorist; the non-active 3sg is the bare stem (u la)
    expect(reads(f, 'la', { Voice: 'Mid', Tense: 'Past', Person: '3', Number: 'Sing' })).toBe(true);
    expect(reads(f, 'lau', { Voice: 'Act', Tense: 'Past', Person: '3' })).toBe(true);
  });

  it('pendohem is non-active only: the lemma is the non-active 1sg', () => {
    paradigm('pendohem', 'Pres', 'Ind', ['pendohem', 'pendohesh', 'pendohet', 'pendohemi', 'pendoheni', 'pendohen'], 'Mid');
    paradigm('pendohem', 'Imp', 'Ind', ['pendohesha', 'pendoheshe', 'pendohej', 'pendoheshim', 'pendoheshit', 'pendoheshin'], 'Mid');
    const f = formsOf('pendohem');
    expect(reads(f, 'pendohu', { Mood: 'Imp', Voice: 'Mid', Person: '2', Number: 'Sing' })).toBe(true);
    expect(reads(f, 'pendohuni', { Mood: 'Imp', Voice: 'Mid', Person: '2', Number: 'Plur' })).toBe(true);
    expect(reads(f, 'penduar', { VerbForm: 'Part' })).toBe(true);
    expect(reads(f, 'pendua', { Voice: 'Mid', Tense: 'Past', Person: '3', Number: 'Sing' })).toBe(true);
    expect(f.some((x) => x.form === 'pendoj' || x.form === 'pendon')).toBe(false); // no active present
    // the aorist is written with the active endings (u pendova, u penduam) and is non-active all the same
    expect(reads(f, 'pendova', { Voice: 'Mid', Tense: 'Past', Person: '1', Number: 'Sing' })).toBe(true);
    expect(reads(f, 'penduam', { Voice: 'Mid', Tense: 'Past', Person: '1', Number: 'Plur' })).toBe(true);
    expect(f.every((x) => x.morph.Voice !== 'Act')).toBe(true);
  });

  it('other deponents: lutem, përgjigjem, kthehem', () => {
    paradigm('lutem', 'Pres', 'Ind', ['lutem', 'lutesh', 'lutet', 'lutemi', 'luteni', 'luten'], 'Mid');
    expect(reads(formsOf('lutem'), 'lut', { Voice: 'Mid', Tense: 'Past', Person: '3' })).toBe(true); // u lut
    expect(reads(formsOf('lutem'), 'lutu', { Mood: 'Imp', Voice: 'Mid' })).toBe(true);
    expect(reads(formsOf('përgjigjem'), 'përgjigju', { Mood: 'Imp', Voice: 'Mid', Number: 'Sing' })).toBe(true);
    expect(reads(formsOf('kthehem'), 'kthye', { Voice: 'Mid', Tense: 'Past', Person: '3' })).toBe(true); // u kthye
  });
});

describe('the union rules', () => {
  it('a form shared by 2sg and 3sg is one reading with Person "2,3"', () => {
    const punon = formsOf('punoj').filter((f) => f.form === 'punon');
    expect(punon).toHaveLength(1);
    expect(punon[0].morph).toEqual({ Person: '2,3', Number: 'Sing', Tense: 'Pres', Mood: 'Ind', Voice: 'Act', VerbForm: 'Fin' });
    const qe = formsOf('jam').filter((f) => f.form === 'qe');
    expect(qe).toHaveLength(1);
    expect(qe[0].morph.Person).toBe('2,3');
    expect(qe[0].morph.Tense).toBe('Past');
  });

  it('a form that is the present of both indicative and subjunctive is one reading with Mood "Ind,Sub"', () => {
    const punoj = formsOf('punoj').filter((f) => f.form === 'punoj');
    expect(punoj).toHaveLength(1);
    expect(punoj[0].morph).toEqual({ Person: '1', Number: 'Sing', Tense: 'Pres', Mood: 'Ind,Sub', Voice: 'Act', VerbForm: 'Fin' });
    const punojme = formsOf('punoj').filter((f) => f.form === 'punojmë');
    expect(punojme).toHaveLength(1);
    expect(punojme[0].morph.Mood).toBe('Ind,Sub');
    // the 2sg and 3sg differ in the subjunctive: separate forms, Mood Sub only
    expect(formsOf('punoj').find((f) => f.form === 'punosh')!.morph.Mood).toBe('Sub');
    expect(formsOf('punoj').find((f) => f.form === 'punojë')!.morph.Mood).toBe('Sub');
  });

  it('the imperative is a separate reading even where it equals a present form', () => {
    const punoni = formsOf('punoj').filter((f) => f.form === 'punoni');
    expect(punoni.map((f) => f.morph.Mood).sort()).toEqual(['Imp', 'Ind,Sub']);
    const hap = formsOf('hap').filter((f) => f.form === 'hap' && f.morph.Voice === 'Act');
    expect(hap).toHaveLength(3);
    expect(hap.map((f) => `${f.morph.Person}/${f.morph.Mood}`).sort()).toEqual(['1/Ind,Sub', '2,3/Ind', '2/Imp'].sort());
  });

  it('no verb has two readings with the same form and the same feature bundle', () => {
    for (const v of SQ_VERBS) {
      const seen = new Set<string>();
      for (const f of verbForms(v)) {
        const k = `${f.form}|${JSON.stringify(Object.entries(f.morph).sort())}`;
        expect(seen.has(k), `${v.lemma}: duplicate reading of ${f.form}`).toBe(false);
        seen.add(k);
      }
    }
  });
});

describe('the explicit forms of a lexeme', () => {
  it('an explicit form replaces the rule form of the same bundle, and may add readings', () => {
    const base = V('punoj', 'oj', 'punova', 'punuar', 'to work');
    const custom = V('punoj', 'oj', 'punova', 'punuar', 'to work', { forms: ['punosh: 2 sg pres ind', 'punuaka: 3 sg pres adm'] });
    expect(verbForms(base).find((f) => f.form === 'punon')!.morph.Person).toBe('2,3');
    // the 2sg indicative is now punosh (also the 2sg subjunctive: one reading Ind,Sub); punon is left to the 3sg
    const f = verbForms(custom);
    expect(f.find((x) => x.form === 'punon')!.morph.Person).toBe('3');
    expect(f.find((x) => x.form === 'punosh')!.morph).toMatchObject({ Person: '2', Mood: 'Ind,Sub' });
    // the same bundle given twice is two readings of the new set
    expect(f.find((x) => x.form === 'punuaka')!.morph).toMatchObject({ Person: '3', Tense: 'Pres', Mood: 'Adm' });
    // a participle and an aorist are replaced as well
    const odd = V('punoj', 'oj', 'punova', 'punuar', 'x', { forms: ['punuarë: ptcp', 'punova: 1 sg aor ind', 'punovam: 1 sg aor ind'] });
    const g = verbForms(odd);
    expect(g.some((x) => x.form === 'punuar')).toBe(false);
    expect(g.some((x) => x.form === 'punuarë' && x.morph.VerbForm === 'Part')).toBe(true);
    expect(g.filter((x) => x.morph.Tense === 'Past' && x.morph.Person === '1' && x.morph.Number === 'Sing').map((x) => x.form).sort()).toEqual(['punova', 'punovam']);
  });

  it('a union of tags is split and joined again', () => {
    const w = V('xjam', 'irr', undefined, undefined, 'x', { forms: ['a: 1 sg pres ind subj', 'b: 2 sg pres ind', 'b: 3 sg pres ind'] });
    const f = verbForms(w);
    expect(f.find((x) => x.form === 'a')!.morph).toEqual({ Person: '1', Number: 'Sing', Tense: 'Pres', Mood: 'Ind,Sub', Voice: 'Act', VerbForm: 'Fin' });
    expect(f.find((x) => x.form === 'b')!.morph.Person).toBe('2,3');
  });

  it("class 'irr' takes everything from forms (and nothing is made up)", () => {
    const w = V('xjam', 'irr', 'xaorist', undefined, 'x', { forms: ['xa: 1 sg pres ind'] });
    expect(verbForms(w).map((f) => f.form)).toEqual(['xa']);
  });

  it('a stated second present stem or non-active stem carries through the paradigm', () => {
    const w = V('flas', 'cons', 'fola', 'folur', 'x', { pres23: 'flet', nonActive: true, forms: ['flisni: 2 pl pres ind', 'flitem: 1 sg pres ind mid'] });
    const f = verbForms(w);
    expect(reads(f, 'flisja', { Tense: 'Imp', Person: '1' })).toBe(true);
    expect(reads(f, 'flitesha', { Tense: 'Imp', Voice: 'Mid', Person: '1' })).toBe(true);
    expect(f.some((x) => x.form === 'fletni')).toBe(false);
  });

  it('rule text is plain words', () => {
    const f = formsOf('punoj');
    expect(f.find((x) => x.form === 'punon')!.rule).toBe('present indicative, second or third person singular, of punoj');
    expect(f.find((x) => x.form === 'punoj')!.rule).toBe('present indicative or subjunctive, first person singular, of punoj');
    expect(f.find((x) => x.form === 'punova')!.rule).toBe('aorist, first person singular, of punoj');
    expect(f.find((x) => x.form === 'punuar')!.rule).toBe('participle of punoj');
    expect(f.find((x) => x.form === 'punohet')!.rule).toMatch(/^non-active present/);
  });
});

describe('guessVerb', () => {
  it('reads an unknown verb by its ending, as a guess', () => {
    const r = guessVerb('ndërtojmë');
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({ lemma: 'ndërtoj', pos: 'VERB', lemmaKnown: false, origin: 'rule' });
    expect(r[0].morph).toMatchObject({ Person: '1', Number: 'Plur', Tense: 'Pres', VerbForm: 'Fin' });
    expect(r[0].confidence).toBeLessThanOrEqual(0.5);
    expect(r[0].gloss).toBeUndefined();
    expect(r[0].rule).toMatch(/guess/);
  });

  it('knows the clear endings', () => {
    const lemmaOf = (w: string) => guessVerb(w)[0]?.lemma;
    expect(lemmaOf('kërkonim')).toBe('kërkoj');
    expect(lemmaOf('kërkonin')).toBe('kërkoj');
    expect(lemmaOf('kërkonte')).toBe('kërkoj');
    expect(lemmaOf('kërkojnë')).toBe('kërkoj');
    expect(lemmaOf('kërkova')).toBe('kërkoj');
    expect(lemmaOf('kërkoi')).toBe('kërkoj');
    expect(lemmaOf('kërkuar')).toBe('kërkoj');
    expect(lemmaOf('kërkohet')).toBe('kërkoj');
    expect(lemmaOf('kërkohen')).toBe('kërkoj');
    expect(guessVerb('kërkohet')[0].morph).toMatchObject({ Voice: 'Mid', Person: '3', Number: 'Sing' });
    expect(guessVerb('kërkuar')[0].morph).toEqual({ VerbForm: 'Part' });
  });

  it('is capped at three readings, each marked down and without a gloss', () => {
    for (const w of ['punoni', 'shkruan', 'ndërtojnë', 'dëgjuan', 'mësuat', 'lutohen']) {
      const r = guessVerb(w);
      expect(r.length).toBeGreaterThan(0);
      expect(r.length).toBeLessThanOrEqual(3);
      for (const x of r) {
        expect(x.lemmaKnown).toBe(false);
        expect(x.confidence).toBeLessThanOrEqual(0.5);
        expect(x.gloss).toBeUndefined();
        expect(x.origin).toBe('rule');
      }
    }
    expect(guessVerb('punoni').length).toBe(2); // present and imperative
    expect(guessVerb('shkruan').map((x) => x.lemma)).toEqual(['shkroj', 'shkruaj']);
  });

  it('says nothing when the ending says nothing', () => {
    for (const w of ['libri', 'shtëpia', 'mirë', 'hapur', 'oni', 'xoni', 'ojmë', 'punoj', 'nga', '']) expect(guessVerb(w)).toEqual([]);
  });

  it('normalises case', () => {
    expect(guessVerb('Ndërtojmë')[0]?.lemma).toBe('ndërtoj');
  });
});

describe('the whole word list', () => {
  const nfcLower = (s: string) => s === s.normalize('NFC') && s === s.toLowerCase();

  it('is large and has no duplicate lemma', () => {
    expect(SQ_VERBS.length).toBeGreaterThanOrEqual(200);
    const lemmas = SQ_VERBS.map((v) => v.lemma);
    expect(new Set(lemmas).size).toBe(lemmas.length);
  });

  it('every verb has a gloss, an aorist and a participle (or is irregular and lists them)', () => {
    for (const v of SQ_VERBS) {
      expect(v.pos).toBe('VERB');
      expect(v.gloss.length, v.lemma).toBeGreaterThan(2);
      if (v.cls === 'irr') {
        const f = verbForms(v);
        expect(f.some((x) => x.morph.VerbForm === 'Part'), `${v.lemma}: participle`).toBe(true);
        expect(f.some((x) => x.morph.Tense === 'Past'), `${v.lemma}: aorist`).toBe(true);
      } else {
        expect(v.aorist, `${v.lemma}: aorist`).toBeTruthy();
        expect(v.participle, `${v.lemma}: participle`).toBeTruthy();
      }
    }
  });

  it('every verb makes forms without throwing; every form is NFC lower case with a rule and a person-or-participle', () => {
    for (const v of SQ_VERBS) {
      expect(nfcLower(v.lemma), v.lemma).toBe(true);
      const f = verbForms(v);
      expect(f.length, v.lemma).toBeGreaterThan(8);
      for (const x of f) {
        expect(nfcLower(x.form), `${v.lemma}: ${x.form}`).toBe(true);
        expect(x.rule.length).toBeGreaterThan(5);
        expect(x.morph.VerbForm === 'Part' || (x.morph.VerbForm === 'Fin' && !!x.morph.Person && !!x.morph.Number), `${v.lemma}: ${x.form}`).toBe(true);
        expect(x.morph.Voice === undefined ? x.morph.VerbForm === 'Part' : ['Act', 'Mid'].includes(x.morph.Voice), `${v.lemma}: ${x.form}`).toBe(true);
      }
    }
  });

  it('the rules reproduce the stated principal parts (lemma, aorist 1sg, participle) as forms', () => {
    for (const v of SQ_VERBS) {
      const f = verbForms(v);
      if (v.nonActive === 'only') {
        expect(reads(f, v.lemma, { Person: '1', Number: 'Sing', Tense: 'Pres', Voice: 'Mid' }), `${v.lemma}: lemma`).toBe(true);
      } else {
        expect(reads(f, v.lemma, { Person: '1', Number: 'Sing', Tense: 'Pres', Voice: 'Act' }), `${v.lemma}: lemma`).toBe(true);
        if (v.cls !== 'irr') expect(reads(f, v.aorist!, { Person: '1', Number: 'Sing', Tense: 'Past', Voice: 'Act' }), `${v.lemma}: aorist ${v.aorist}`).toBe(true);
      }
      if (v.participle) expect(reads(f, v.participle, { VerbForm: 'Part' }), `${v.lemma}: participle`).toBe(true);
    }
  });

  it('every non-irregular active verb has all six persons of present, aorist and (but for ë-stems) imperfect', () => {
    for (const v of SQ_VERBS) {
      if (v.cls === 'irr' || v.nonActive === 'only') continue;
      const f = verbForms(v);
      for (let i = 0; i < 6; i++) {
        const base = { Person: PER[i], Number: NUM[i], Voice: 'Act' };
        expect(f.some((x) => x.morph.Tense === 'Pres' && sameBundle(x, { ...base, Mood: 'Ind' })), `${v.lemma}: present ${i}`).toBe(true);
        expect(f.some((x) => x.morph.Tense === 'Past' && sameBundle(x, base)), `${v.lemma}: aorist ${i}`).toBe(true);
        if (!v.lemma.endsWith('ë')) expect(f.some((x) => x.morph.Tense === 'Imp' && sameBundle(x, base)), `${v.lemma}: imperfect ${i}`).toBe(true);
      }
    }
    function sameBundle(x: SqForm, want: Record<string, string>): boolean {
      return Object.entries(want).every(([k, val]) => (x.morph[k] ?? '').split(',').includes(val));
    }
  });

  it('counts by class', () => {
    const n = (c: string) => SQ_VERBS.filter((v) => v.cls === c).length;
    expect(n('oj') + n('cons') + n('vowel') + n('irr')).toBe(SQ_VERBS.length);
    expect(n('irr')).toBeGreaterThanOrEqual(7);
    expect(SQ_VERBS.filter((v) => v.nonActive === 'only').length).toBeGreaterThanOrEqual(20);
  });

  it('holds the verbs the course leans on', () => {
    for (const l of ['jam', 'kam', 'bëj', 'shkoj', 'vij', 'them', 'flas', 'shoh', 'dëgjoj', 'ha', 'pi', 'fle', 'punoj', 'mësoj', 'lexoj', 'shkruaj', 'luaj', 'blej', 'shes', 'jap', 'marr', 'dua', 'di', 'njoh', 'kuptoj', 'pyes', 'hap', 'mbyll', 'hyj', 'dal', 'rri', 'pres', 'gjej', 'humb', 'ndihmoj', 'mendoj', 'besoj', 'kujtoj', 'harroj', 'filloj', 'mbaroj', 'jetoj', 'vdes', 'lutem', 'pendohem', 'përgjigjem', 'ulem', 'ringjallem', 'bekoj', 'predikoj', 'dëshmoj', 'shërbej', 'ndjek', 'kryqëzoj', 'adhuroj', 'shpëtoj', 'rrëfej', 'fal']) {
      expect(SQ_VERBS.some((v) => v.lemma === l), l).toBe(true);
    }
  });
});
