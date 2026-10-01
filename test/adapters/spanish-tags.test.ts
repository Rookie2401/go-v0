/**
 * The dictionary's labels on an inflected form, read by the Spanish adapter: `morphFromTags` (features) and
 * `varietiesFromTags` (region and usage labels). The label sets are the ones the Spanish dictionary really carries
 * on form-of senses. Each verb set is also checked against what the adapter's own rules say about a concrete form with
 * those labels: a rule reading and a dictionary reading of one form must not contradict each other (the importer
 * treats a comma list as a set, and two lists agree when they intersect).
 */
import { describe, expect, it } from 'vitest';
import { varietyStanding, type VarietyPolicy } from '../../src/core';
import { createAdapterRegistry } from '../../src/adapters';
import { ES_LABEL_VARIETIES } from '../../src/adapters/spanish/varieties';

const es = createAdapterRegistry().get('es');
const morph = (labels: string) => es.morphFromTags!(labels.split(' '));
const varieties = (labels: string) => es.varietiesFromTags!(labels.split(' '));

/** The importer's agreement test: a feature both state shares a value (comma lists are sets). */
function agrees(a: Record<string, string>, b: Record<string, string>): boolean {
  for (const k of Object.keys(a)) {
    if (b[k] === undefined) continue;
    const bs = new Set(b[k].split(','));
    if (!a[k].split(',').some((v) => bs.has(v))) return false;
  }
  return true;
}
const readings = (form: string, lemma: string) =>
  es.analyze(es.tokenize(form))[0].candidates.filter((c) => c.lemma === lemma && (c.pos === 'VERB' || c.pos === 'AUX' || c.pos === 'NOUN' || c.pos === 'ADJ'));

interface Row { labels: string; morph: Record<string, string>; form?: string; lemma?: string; why?: string }
const FIN = { VerbForm: 'Fin' };

const VERB_ROWS: Row[] = [
  // two persons in one sense
  { labels: 'form-of first-person third-person singular imperfect subjunctive', morph: { ...FIN, Mood: 'Sub', Tense: 'Imp', Person: '1,3', Number: 'Sing' }, form: 'hablara', lemma: 'hablar' },
  { labels: 'form-of first-person third-person singular imperfect subjunctive', morph: { ...FIN, Mood: 'Sub', Tense: 'Imp', Person: '1,3', Number: 'Sing' }, form: 'comiese', lemma: 'comer' },
  { labels: 'form-of first-person third-person singular present subjunctive', morph: { ...FIN, Mood: 'Sub', Tense: 'Pres', Person: '1,3', Number: 'Sing' }, form: 'hable', lemma: 'hablar' },
  { labels: 'form-of first-person third-person singular present subjunctive', morph: { ...FIN, Mood: 'Sub', Tense: 'Pres', Person: '1,3', Number: 'Sing' }, form: 'tenga', lemma: 'tener' },
  { labels: 'form-of first-person third-person singular present subjunctive', morph: { ...FIN, Mood: 'Sub', Tense: 'Pres', Person: '1,3', Number: 'Sing' }, form: 'vaya', lemma: 'ir' },
  { labels: 'form-of conditional first-person singular third-person', morph: { ...FIN, Mood: 'Cnd', Person: '1,3', Number: 'Sing' }, form: 'hablaría', lemma: 'hablar' },
  { labels: 'form-of conditional first-person singular third-person', morph: { ...FIN, Mood: 'Cnd', Person: '1,3', Number: 'Sing' }, form: 'sería', lemma: 'ser' },
  { labels: 'form-of first-person third-person singular future subjunctive', morph: { ...FIN, Mood: 'Sub', Tense: 'Fut', Person: '1,3', Number: 'Sing' }, form: 'viviere', lemma: 'vivir' },
  { labels: 'form-of first-person third-person singular imperfect indicative', morph: { ...FIN, Mood: 'Ind', Tense: 'Imp', Person: '1,3', Number: 'Sing' }, form: 'comía', lemma: 'comer' },
  { labels: 'form-of first-person third-person singular imperfect subjunctive', morph: { ...FIN, Mood: 'Sub', Tense: 'Imp', Person: '1,3', Number: 'Sing' }, form: 'fuera', lemma: 'ir' },
  { labels: 'form-of first-person third-person singular imperfect subjunctive', morph: { ...FIN, Mood: 'Sub', Tense: 'Imp', Person: '1,3', Number: 'Sing' }, form: 'fuera', lemma: 'ser' },
  // two tenses in one sense
  { labels: 'form-of first-person indicative plural present preterite', morph: { ...FIN, Mood: 'Ind', Tense: 'Pres,Past', Person: '1', Number: 'Plur' }, form: 'hablamos', lemma: 'hablar' },
  { labels: 'form-of first-person indicative plural present preterite', morph: { ...FIN, Mood: 'Ind', Tense: 'Pres,Past', Person: '1', Number: 'Plur' }, form: 'vivimos', lemma: 'vivir' },
  // one person, one tense (the label order does not matter)
  { labels: 'form-of indicative preterite singular third-person', morph: { ...FIN, Mood: 'Ind', Tense: 'Past', Person: '3', Number: 'Sing' }, form: 'comió', lemma: 'comer' },
  { labels: 'third-person plural present indicative form-of', morph: { ...FIN, Mood: 'Ind', Tense: 'Pres', Person: '3', Number: 'Plur' }, form: 'tienen', lemma: 'tener' },
  { labels: 'form-of first-person future indicative singular', morph: { ...FIN, Mood: 'Ind', Tense: 'Fut', Person: '1', Number: 'Sing' }, form: 'iré', lemma: 'ir' },
  { labels: 'form-of first-person imperfect indicative plural', morph: { ...FIN, Mood: 'Ind', Tense: 'Imp', Person: '1', Number: 'Plur' }, form: 'hablábamos', lemma: 'hablar' },
  { labels: 'form-of first-person indicative present singular', morph: { ...FIN, Mood: 'Ind', Tense: 'Pres', Person: '1', Number: 'Sing' }, form: 'soy', lemma: 'ser' },
  // imperatives: the mood with the person and number given; the usted / ustedes command is formal, as in the engine
  { labels: 'form-of imperative second-person singular', morph: { ...FIN, Mood: 'Imp', Person: '2', Number: 'Sing' }, form: 'habla', lemma: 'hablar' },
  { labels: 'form-of imperative second-person singular', morph: { ...FIN, Mood: 'Imp', Person: '2', Number: 'Sing' }, form: 'ten', lemma: 'tener' },
  { labels: 'form-of imperative singular third-person', morph: { ...FIN, Mood: 'Imp', Person: '3', Number: 'Sing', Polite: 'Form' }, form: 'hable', lemma: 'hablar' },
  { labels: 'form-of imperative plural third-person', morph: { ...FIN, Mood: 'Imp', Person: '3', Number: 'Plur', Polite: 'Form' }, form: 'hablen', lemma: 'hablar' },
  { labels: 'form-of first-person imperative plural', morph: { ...FIN, Mood: 'Imp', Person: '1', Number: 'Plur' }, form: 'hablemos', lemma: 'hablar' },
  { labels: 'form-of imperative plural second-person', morph: { ...FIN, Mood: 'Imp', Person: '2', Number: 'Plur' }, form: 'hablad', lemma: 'hablar' },
  { labels: 'form-of imperative plural second-person', morph: { ...FIN, Mood: 'Imp', Person: '2', Number: 'Plur' }, form: 'vivid', lemma: 'vivir' },
  // combined forms: object-* and the pronoun's case describe the pronoun, not the verb
  { labels: 'form-of imperative object-second-person object-singular second-person singular with-voseo', morph: { ...FIN, Mood: 'Imp', Person: '2', Number: 'Sing' }, form: 'hablame', lemma: 'hablar' },
  { labels: 'accusative form-of infinitive object-masculine object-singular object-third-person', morph: { VerbForm: 'Inf' }, form: 'hablarlo', lemma: 'hablar' },
  { labels: 'dative form-of infinitive object-second-person object-singular', morph: { VerbForm: 'Inf' }, form: 'hablarte', lemma: 'hablar' },
  { labels: 'form-of infinitive object-feminine object-plural object-third-person reflexive', morph: { VerbForm: 'Inf' } },
  // non-finite forms: "past" belongs to the participle, never to a finite tense
  { labels: 'form-of participle past masculine singular', morph: { VerbForm: 'Part', Gender: 'Masc', Number: 'Sing' }, form: 'hablado', lemma: 'hablar' },
  { labels: 'form-of participle past feminine singular', morph: { VerbForm: 'Part', Gender: 'Fem', Number: 'Sing' }, form: 'comida', lemma: 'comer' },
  { labels: 'form-of participle past masculine plural', morph: { VerbForm: 'Part', Gender: 'Masc', Number: 'Plur' }, form: 'vividos', lemma: 'vivir' },
  { labels: 'form-of participle past', morph: { VerbForm: 'Part' }, form: 'tenido', lemma: 'tener' },
  { labels: 'form-of gerund', morph: { VerbForm: 'Ger' }, form: 'hablando', lemma: 'hablar' },
  { labels: 'form-of infinitive', morph: { VerbForm: 'Inf' }, form: 'hablar', lemma: 'hablar' },
  { labels: 'form-of gerund object-third-person object-singular accusative', morph: { VerbForm: 'Ger' } },
];

const NOMINAL_ROWS: Row[] = [
  { labels: 'form-of plural', morph: { Number: 'Plur' }, form: 'gatos', lemma: 'gato' },
  { labels: 'form-of feminine singular', morph: { Gender: 'Fem', Number: 'Sing' }, form: 'niña', lemma: 'niña' },
  { labels: 'form-of masculine plural', morph: { Gender: 'Masc', Number: 'Plur' }, form: 'niños', lemma: 'niño' },
  { labels: 'diminutive feminine form-of singular', morph: { Gender: 'Fem', Number: 'Sing', Degree: 'Dim' }, form: 'casita', lemma: 'casa' },
  { labels: 'diminutive feminine form-of plural', morph: { Gender: 'Fem', Number: 'Plur', Degree: 'Dim' }, form: 'casitas', lemma: 'casa' },
  { labels: 'augmentative form-of masculine singular', morph: { Gender: 'Masc', Number: 'Sing', Degree: 'Aug' } },
  { labels: 'form-of feminine plural', morph: { Gender: 'Fem', Number: 'Plur' }, form: 'rojas', lemma: 'rojo' },
  { labels: 'form-of superlative masculine singular', morph: { Gender: 'Masc', Number: 'Sing', Degree: 'Abs' }, form: 'buenísimo', lemma: 'bueno', why: 'the engine calls -ísimo "Abs"' },
  { labels: 'form-of superlative feminine singular', morph: { Gender: 'Fem', Number: 'Sing', Degree: 'Abs' }, form: 'buenísima', lemma: 'bueno' },
  { labels: 'comparative form-of', morph: { Degree: 'Cmp' } },
  { labels: 'diminutive form-of masculine singular', morph: { Gender: 'Masc', Number: 'Sing', Degree: 'Dim' }, form: 'perrito', lemma: 'perro' },
];

describe('morphFromTags: label sets of the dictionary → the features the rules use', () => {
  for (const r of [...VERB_ROWS, ...NOMINAL_ROWS]) {
    it(`${r.labels}${r.form ? ` (${r.form})` : ''}`, () => {
      expect(morph(r.labels)).toEqual(r.morph);
    });
  }

  it('agrees with the adapter\'s own reading of each concrete form (no contradiction under the set-intersection test)', () => {
    let checked = 0;
    for (const r of [...VERB_ROWS, ...NOMINAL_ROWS]) {
      if (!r.form || !r.lemma) continue;
      const own = readings(r.form, r.lemma);
      expect(own.length, `${r.form} has a reading of ${r.lemma}`).toBeGreaterThan(0);
      const dict = morph(r.labels);
      expect(own.some((c) => agrees(c.morph, dict) && agrees(dict, c.morph)), `${r.form}: ${JSON.stringify(dict)} against ${JSON.stringify(own.map((c) => c.morph))}`).toBe(true);
      checked++;
    }
    expect(checked).toBeGreaterThan(40);
  });

  it('the usted command is the formal imperative reading of the engine, not only a present subjunctive', () => {
    const dict = morph('form-of imperative singular third-person');
    const hits = readings('hable', 'hablar').filter((c) => c.morph.Mood === 'Imp');
    expect(hits).toHaveLength(1);
    expect(hits[0].morph).toEqual(dict);
  });

  it('the label order does not matter, and a repeated label changes nothing', () => {
    const labels = 'form-of first-person third-person singular imperfect subjunctive'.split(' ');
    const a = es.morphFromTags!(labels);
    expect(es.morphFromTags!([...labels].reverse())).toEqual(a);
    expect(es.morphFromTags!([...labels, ...labels])).toEqual(a);
    expect(es.morphFromTags!(['Third-Person', 'SINGULAR', 'Present', 'Indicative'])).toEqual({ ...FIN, Mood: 'Ind', Tense: 'Pres', Person: '3', Number: 'Sing' });
  });

  it('"past" alone is not a tense; usage, structure and region labels say nothing about the form', () => {
    expect(morph('past')).toEqual({});
    expect(morph('form-of obsolete rare proscribed vulgar colloquial archaic nonstandard dated dialectal humorous slang euphemistic derogatory formal uncommon')).toEqual({});
    expect(morph('morpheme invariable plural-only by-personal-gender possessive demonstrative neuter personal pronoun objective interrogative impersonal prepositional')).toEqual({ });
    expect(morph('Mexico Spain Latin-America with-voseo')).toEqual({});
    expect(morph('')).toEqual({});
    expect(morph('first-person singular present')).toEqual({ Tense: 'Pres', Person: '1', Number: 'Sing' }); // no mood: no VerbForm either
    // a participle has no person, mood or tense even when the sense carries them
    expect(morph('participle past third-person present')).toEqual({ VerbForm: 'Part' });
  });

  it('the pronoun of a combined form never becomes the verb\'s own feature', () => {
    const own = morph('form-of imperative second-person singular');
    const combined = morph('form-of imperative object-first-person object-plural object-masculine accusative dative reflexive second-person singular');
    expect(combined).toEqual(own);
  });
});

describe('varietiesFromTags: region and usage labels → variety codes', () => {
  const ROWS: [string, string[]][] = [
    ['Honduras', ['es-HN']], ['Central-America', ['es-CA']], ['Latin-America', ['es-419']], ['Spain', ['es-ES']], ['Mexico', ['es-MX']], ['Caribbean', ['es-CAR']],
    ['with-voseo', ['voseo']],
    ['El-Salvador', ['es-SV']], ['Nicaragua', ['es-NI']], ['Guatemala', ['es-GT']], ['Costa-Rica', ['es-CR']], ['Panama', ['es-PA']],
    ['Cuba', ['es-CU']], ['Puerto-Rico', ['es-PR']], ['Dominican-Republic', ['es-DO']],
    ['Colombia', ['es-CO']], ['Venezuela', ['es-VE']], ['Chile', ['es-CL']], ['Paraguay', ['es-PY']],
    ['Peru', ['es-PE']], ['Bolivia', ['es-BO']], ['Ecuador', ['es-EC']],
    ['Rioplatense', ['es-AR']], ['Argentina', ['es-ARG']], ['Uruguay', ['es-UY']],
    ['Canary-Islands', ['es-ES-CN']], ['Andalusia', ['es-ES-AN']], ['South-America', ['es-SA']], ['Philippines', ['es-PH']], ['US', ['es-US']],
  ];
  for (const [label, codes] of ROWS) it(label, () => expect(es.varietiesFromTags!([label])).toEqual(codes));

  it('several labels: de-duplicated, in the order given, labels of another kind ignored', () => {
    expect(varieties('Honduras form-of El-Salvador Honduras with-voseo obsolete')).toEqual(['es-HN', 'es-SV', 'voseo']);
    expect(varieties('with-voseo Mexico')).toEqual(['voseo', 'es-MX']);
    expect(es.varietiesFromTags!(['honduras', 'HONDURAS', 'Spain'])).toEqual(['es-HN', 'es-ES']);
  });

  it('unknown labels give nothing (never a guess)', () => {
    expect(varieties('obsolete rare proscribed vulgar colloquial slang Atlantis Hispanic-America form-of')).toEqual([]);
    expect(es.varietiesFromTags!([])).toEqual([]);
  });

  it('a country is never widened: each national label has its own national code', () => {
    for (const label of ['el-salvador', 'nicaragua', 'guatemala', 'costa-rica', 'panama', 'cuba', 'puerto-rico', 'dominican-republic', 'colombia', 'venezuela', 'chile', 'paraguay', 'peru', 'bolivia', 'ecuador', 'argentina', 'uruguay', 'philippines', 'us', 'honduras', 'mexico', 'spain']) {
      const v = es.varieties![ES_LABEL_VARIETIES[label]];
      expect(v?.kind, label).toBe('national');
    }
    // Rioplatense is the region the old code es-AR already names; Argentina alone is a national code inside it
    expect(es.varieties!['es-AR']).toMatchObject({ kind: 'regional', label: 'Río de la Plata' });
    expect(es.varieties!['es-ARG']).toMatchObject({ kind: 'national', label: 'Argentina', parent: 'es-AR' });
  });

  it('every code it can return is a variety of the adapter, with a label, and its parent exists', () => {
    for (const code of new Set(Object.values(ES_LABEL_VARIETIES))) {
      const v = es.varieties![code];
      expect(v, code).toBeDefined();
      expect(v.code).toBe(code);
      expect(v.label.length, code).toBeGreaterThan(0);
      if (v.parent) expect(es.varieties![v.parent], `${code} → ${v.parent}`).toBeDefined();
    }
  });

  it('parents and kinds', () => {
    const parents: Record<string, string | undefined> = {
      'es-SV': 'es-CA', 'es-NI': 'es-CA', 'es-GT': 'es-CA', 'es-CR': 'es-CA', 'es-PA': 'es-CA',
      'es-CU': 'es-CAR', 'es-PR': 'es-CAR', 'es-DO': 'es-CAR',
      'es-CO': 'es-419', 'es-VE': 'es-419', 'es-CL': 'es-419', 'es-PY': 'es-419', 'es-SA': 'es-419',
      'es-PE': 'es-AND', 'es-BO': 'es-AND', 'es-EC': 'es-AND',
      'es-UY': 'es-AR', 'es-ARG': 'es-AR', 'es-ES-CN': 'es-ES', 'es-ES-AN': 'es-ES', 'es-PH': undefined, 'es-US': undefined,
    };
    for (const [code, parent] of Object.entries(parents)) expect(es.varieties![code]?.parent, code).toBe(parent);
    for (const code of ['es-ES-CN', 'es-ES-AN', 'es-SA']) expect(es.varieties![code].kind).toBe('regional');
  });
});

describe('the standing of a labelled word for a Honduran learner', () => {
  const policy: VarietyPolicy = { target: 'es-HN', within: ['es-CA', 'es-419'], activeFeatures: ['voseo'] };
  const standing = (labels: string) => varietyStanding(es.varietiesFromTags!(labels.split(' ')), policy, es.varieties);

  it('Honduras is the target, Central America lies within it, a sibling country is receptive', () => {
    expect(standing('Honduras')).toBe('target');
    expect(standing('Central-America')).toBe('within-target');
    expect(standing('El-Salvador')).toBe('receptive');
    expect(standing('Honduras El-Salvador')).toBe('target');
    expect(standing('Spain')).toBe('receptive');
    expect(standing('Latin-America')).toBe('within-target');
    expect(standing('with-voseo')).toBe('target');
    expect(standing('Argentina')).toBe('receptive');
    expect(standing('Canary-Islands')).toBe('receptive');
    expect(standing('obsolete')).toBe('general');
  });
});
