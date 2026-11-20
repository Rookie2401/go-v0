/**
 * French nouns and adjectives (MORPH package, docs/french/PLAN.md): plurals, feminines, analysis by generation, guesses.
 * Machine-drafted expectations from standard grammar tables, not checked by a native speaker.
 */
import { describe, expect, it } from 'vitest';
import type { PartOfSpeech } from '../../src/core';
import { analyzeNominal, feminineOf, guessNominal, nominalForms, pluralsOf } from '../../src/adapters/french/morph-nominal';

const known = (nouns: string[], adjs: string[] = []) => (l: string, p: PartOfSpeech) => (p === 'NOUN' ? nouns.includes(l) : p === 'ADJ' ? adjs.includes(l) : false);

describe('plurals', () => {
  it('-s by default', () => {
    for (const w of ['livre', 'table', 'chat', 'maison', 'ami', 'arbre', 'idée']) expect(pluralsOf(w)).toEqual([w + 's']);
  });
  it('-s, -x, -z do not change', () => {
    for (const w of ['bras', 'fils', 'prix', 'nez', 'souris', 'voix', 'gaz', 'corps', 'os', 'riz']) expect(pluralsOf(w)).toEqual([w]);
  });
  it('-eau, -au, -eu take -x; the exceptions take -s', () => {
    expect(pluralsOf('bateau')).toEqual(['bateaux']);
    expect(pluralsOf('eau')).toEqual(['eaux']);
    expect(pluralsOf('tuyau')).toEqual(['tuyaux']);
    expect(pluralsOf('feu')).toEqual(['feux']);
    expect(pluralsOf('cheveu')).toEqual(['cheveux']);
    expect(pluralsOf('vœu')).toEqual(['vœux']);
    for (const w of ['bleu', 'pneu', 'landau', 'émeu', 'sarrau']) expect(pluralsOf(w)).toEqual([w + 's']);
  });
  it('-ou: -s, except the seven in -oux', () => {
    expect(pluralsOf('trou')).toEqual(['trous']);
    expect(pluralsOf('fou')).toEqual(['fous']);
    for (const w of ['bijou', 'caillou', 'chou', 'genou', 'hibou', 'joujou', 'pou']) expect(pluralsOf(w)).toEqual([w + 'x']);
  });
  it('-al → -aux; bal, carnaval, festival, chacal, récital, régal take -s', () => {
    expect(pluralsOf('cheval')).toEqual(['chevaux']);
    expect(pluralsOf('journal')).toEqual(['journaux']);
    expect(pluralsOf('animal')).toEqual(['animaux']);
    expect(pluralsOf('national')).toEqual(['nationaux']);
    expect(pluralsOf('général')).toEqual(['généraux']);
    for (const w of ['bal', 'carnaval', 'festival', 'chacal', 'récital', 'régal']) expect(pluralsOf(w)).toEqual([w + 's']);
    // adjectives: banal, fatal, naval, natal, final are -s
    expect(pluralsOf('fatal')).toEqual(['fatals']);
    expect(pluralsOf('naval')).toEqual(['navals']);
    expect(pluralsOf('natal')).toEqual(['natals']);
    expect(pluralsOf('banal')).toContain('banals');
    expect(pluralsOf('final')).toContain('finals');
  });
  it('-ail → -ails; travail, bail, corail, émail, vitrail, soupirail → -aux', () => {
    for (const w of ['détail', 'rail', 'chandail', 'portail', 'éventail', 'gouvernail', 'attirail']) expect(pluralsOf(w)).toEqual([w + 's']);
    expect(pluralsOf('travail')).toContain('travaux');
    expect(pluralsOf('bail')).toEqual(['baux']);
    expect(pluralsOf('corail')).toEqual(['coraux']);
    expect(pluralsOf('émail')).toEqual(['émaux']);
    expect(pluralsOf('vitrail')).toEqual(['vitraux']);
    expect(pluralsOf('soupirail')).toEqual(['soupiraux']);
  });
  it('œil, ciel, aïeul, monsieur, madame, mademoiselle, bonhomme', () => {
    expect(pluralsOf('œil')).toContain('yeux');
    expect(pluralsOf('ciel')).toContain('cieux');
    expect(pluralsOf('aïeul')).toEqual(['aïeuls', 'aïeux']);
    expect(pluralsOf('monsieur')).toEqual(['messieurs']);
    expect(pluralsOf('madame')).toEqual(['mesdames']);
    expect(pluralsOf('mademoiselle')).toEqual(['mesdemoiselles']);
    expect(pluralsOf('bonhomme')).toEqual(['bonshommes']);
  });
  it('compound nouns only where listed', () => {
    expect(pluralsOf('grand-mère')).toEqual(['grands-mères']);
    expect(pluralsOf('arc-en-ciel')).toEqual(['arcs-en-ciel']);
    expect(pluralsOf('rendez-vous')).toEqual(['rendez-vous']);
    expect(pluralsOf('porte-clés')).toEqual([]);
    expect(pluralsOf('')).toEqual([]);
  });
});

describe('feminines of adjectives', () => {
  const cases: Array<[string, string]> = [
    // +e, and -e unchanged
    ['petit', 'petite'], ['grand', 'grande'], ['joli', 'jolie'], ['rouge', 'rouge'], ['jeune', 'jeune'], ['fatigué', 'fatiguée'], ['vu', 'vue'],
    // -er → -ère
    ['premier', 'première'], ['léger', 'légère'], ['étranger', 'étrangère'], ['dernier', 'dernière'],
    // -eux → -euse, -oux → -ouse
    ['heureux', 'heureuse'], ['sérieux', 'sérieuse'], ['amoureux', 'amoureuse'], ['jaloux', 'jalouse'], ['doux', 'douce'], ['faux', 'fausse'], ['roux', 'rousse'],
    // -f → -ve
    ['actif', 'active'], ['neuf', 'neuve'], ['vif', 'vive'], ['naïf', 'naïve'], ['bref', 'brève'],
    // doubling: -el, -eil, -en, -on, -et, -s
    ['cruel', 'cruelle'], ['réel', 'réelle'], ['pareil', 'pareille'], ['ancien', 'ancienne'], ['moyen', 'moyenne'], ['bon', 'bonne'], ['mignon', 'mignonne'],
    ['muet', 'muette'], ['net', 'nette'], ['violet', 'violette'], ['gros', 'grosse'], ['gras', 'grasse'], ['bas', 'basse'], ['las', 'lasse'], ['épais', 'épaisse'],
    ['sot', 'sotte'], ['nul', 'nulle'], ['gentil', 'gentille'],
    // -et → -ète
    ['complet', 'complète'], ['secret', 'secrète'], ['inquiet', 'inquiète'], ['discret', 'discrète'], ['concret', 'concrète'],
    // -c
    ['blanc', 'blanche'], ['franc', 'franche'], ['sec', 'sèche'], ['public', 'publique'], ['grec', 'grecque'], ['turc', 'turque'], ['caduc', 'caduque'],
    // -eur
    ['trompeur', 'trompeuse'], ['menteur', 'menteuse'], ['travailleur', 'travailleuse'], ['acteur', 'actrice'], ['directeur', 'directrice'],
    ['meilleur', 'meilleure'], ['supérieur', 'supérieure'], ['inférieur', 'inférieure'], ['majeur', 'majeure'],
    // -g, -gu
    ['long', 'longue'], ['oblong', 'oblongue'], ['aigu', 'aiguë'], ['ambigu', 'ambiguë'],
    // the rest
    ['beau', 'belle'], ['nouveau', 'nouvelle'], ['vieux', 'vieille'], ['fou', 'folle'], ['mou', 'molle'], ['frais', 'fraîche'], ['favori', 'favorite'],
    ['malin', 'maligne'], ['bénin', 'bénigne'], ['tiers', 'tierce'], ['jumeau', 'jumelle'],
  ];
  for (const [m, f] of cases) it(`${m} → ${f}`, () => expect(feminineOf(m)).toContain(f));

  it('the masculine before a vowel: bel, nouvel, vieil, fol, mol', () => {
    const forms = (l: string) => nominalForms(l, 'ADJ').filter((x) => x.morph.Gender === 'Masc' && x.morph.Number === 'Sing').map((x) => x.form);
    expect(forms('beau')).toEqual(['beau', 'bel']);
    expect(forms('nouveau')).toEqual(['nouveau', 'nouvel']);
    expect(forms('vieux')).toEqual(['vieux', 'vieil']);
    expect(forms('fou')).toEqual(['fou', 'fol']);
    expect(forms('mou')).toEqual(['mou', 'mol']);
  });
});

describe('nominalForms', () => {
  it('a noun: singular and plural, with Gender when given', () => {
    expect(nominalForms('cheval', 'NOUN', 'Masc')).toEqual([
      { form: 'cheval', morph: { Gender: 'Masc', Number: 'Sing' } },
      { form: 'chevaux', morph: { Gender: 'Masc', Number: 'Plur' } },
    ]);
    expect(nominalForms('fils', 'NOUN').map((f) => [f.form, f.morph.Number])).toEqual([['fils', 'Sing'], ['fils', 'Plur']]);
    expect(nominalForms('œil', 'NOUN').map((f) => f.form)).toEqual(['œil', 'yeux', 'œils']);
  });
  it('an adjective: four forms', () => {
    const f = nominalForms('heureux', 'ADJ');
    expect(f.find((x) => x.morph.Gender === 'Masc' && x.morph.Number === 'Plur')?.form).toBe('heureux');
    expect(f.find((x) => x.morph.Gender === 'Fem' && x.morph.Number === 'Sing')?.form).toBe('heureuse');
    expect(f.find((x) => x.morph.Gender === 'Fem' && x.morph.Number === 'Plur')?.form).toBe('heureuses');
    const n = nominalForms('national', 'ADJ');
    expect(n.map((x) => x.form)).toEqual(['national', 'nationaux', 'nationale', 'nationales']);
    expect(nominalForms('rouge', 'ADJ').map((x) => `${x.form}/${x.morph.Gender}/${x.morph.Number}`)).toEqual(['rouge/Masc/Sing', 'rouges/Masc/Plur', 'rouge/Fem/Sing', 'rouges/Fem/Plur']);
  });
  it('other parts of speech give nothing', () => {
    expect(nominalForms('très', 'ADV')).toEqual([]);
  });
});

describe('analysis by generation (the lemma must be known)', () => {
  const nouns = ['cheval', 'œil', 'journal', 'travail', 'bateau', 'chanteur', 'lion', 'étudiant', 'prix', 'ami', 'bijou'];
  const adjs = ['beau', 'vieux', 'heureux', 'blanc', 'national', 'doux', 'complet', 'long', 'public', 'nouveau', 'gentil', 'rouge', 'bon', 'lent', 'évident', 'constant', 'vrai', 'énorme', 'heureux'];
  const k = known(nouns, adjs);
  const read = (f: string) => analyzeNominal(f, k, (l) => (l === 'chanteur' || l === 'lion' || l === 'étudiant' ? 'Masc' : undefined)).map((r) => `${r.lemma}/${r.pos}/${JSON.stringify(r.morph)}`);

  it('plurals', () => {
    expect(read('chevaux')).toEqual(['cheval/NOUN/{"Number":"Plur"}']);
    expect(read('yeux')).toEqual(['œil/NOUN/{"Number":"Plur"}']);
    expect(read('travaux')).toEqual(['travail/NOUN/{"Number":"Plur"}']);
    expect(read('bateaux')).toEqual(['bateau/NOUN/{"Number":"Plur"}']);
    expect(read('bijoux')).toEqual(['bijou/NOUN/{"Number":"Plur"}']);
    expect(read('journaux')).toEqual(['journal/NOUN/{"Number":"Plur"}']);
  });
  it('an -s, -x or -z is not a plural unless the singular is known', () => {
    expect(read('prix')).toEqual(['prix/NOUN/{"Number":"Sing"}', 'prix/NOUN/{"Number":"Plur"}']);
    expect(read('tapis')).toEqual([]);
    expect(read('amis')).toEqual(['ami/NOUN/{"Number":"Plur"}']);
  });
  it('feminines', () => {
    expect(read('belle')).toEqual(['beau/ADJ/{"Gender":"Fem","Number":"Sing"}']);
    expect(read('belles')).toEqual(['beau/ADJ/{"Gender":"Fem","Number":"Plur"}']);
    expect(read('vieille')).toEqual(['vieux/ADJ/{"Gender":"Fem","Number":"Sing"}']);
    expect(read('heureuse')).toEqual(['heureux/ADJ/{"Gender":"Fem","Number":"Sing"}']);
    expect(read('blanche')).toEqual(['blanc/ADJ/{"Gender":"Fem","Number":"Sing"}']);
    expect(read('nationales')).toEqual(['national/ADJ/{"Gender":"Fem","Number":"Plur"}']);
    expect(read('nationaux')).toEqual(['national/ADJ/{"Gender":"Masc","Number":"Plur"}']);
    expect(read('douce')).toEqual(['doux/ADJ/{"Gender":"Fem","Number":"Sing"}']);
    expect(read('complète')).toEqual(['complet/ADJ/{"Gender":"Fem","Number":"Sing"}']);
    expect(read('longue')).toEqual(['long/ADJ/{"Gender":"Fem","Number":"Sing"}']);
    expect(read('publique')).toEqual(['public/ADJ/{"Gender":"Fem","Number":"Sing"}']);
    expect(read('gentille')).toEqual(['gentil/ADJ/{"Gender":"Fem","Number":"Sing"}']);
    expect(read('bonne')).toEqual(['bon/ADJ/{"Gender":"Fem","Number":"Sing"}']);
    expect(read('nouvelles')).toEqual(['nouveau/ADJ/{"Gender":"Fem","Number":"Plur"}']);
  });
  it('bel, nouvel, vieil', () => {
    expect(read('bel')).toEqual(['beau/ADJ/{"Gender":"Masc","Number":"Sing"}']);
    expect(read('vieil')).toEqual(['vieux/ADJ/{"Gender":"Masc","Number":"Sing"}']);
  });
  it('an invariable adjective: the same form for both genders', () => {
    const r = analyzeNominal('rouge', k);
    expect(r.map((x) => x.morph)).toEqual([{ Gender: 'Masc', Number: 'Sing' }, { Gender: 'Fem', Number: 'Sing' }]);
  });
  it('the feminine counterpart of a noun is a weaker reading', () => {
    const r = analyzeNominal('chanteuse', k, () => 'Masc');
    expect(r.map((x) => [x.lemma, x.pos, x.derived])).toEqual([['chanteur', 'NOUN', true]]);
    expect(r[0].morph).toEqual({ Gender: 'Fem', Number: 'Sing' });
    expect(analyzeNominal('lionnes', k, () => 'Masc').map((x) => x.morph)).toEqual([{ Gender: 'Fem', Number: 'Plur' }]);
    expect(analyzeNominal('étudiante', k, () => 'Masc').map((x) => x.lemma)).toEqual(['étudiant']);
  });
  it('adverbs in -ment come from a known adjective only', () => {
    const adv = (f: string) => analyzeNominal(f, k).filter((r) => r.pos === 'ADV').map((r) => r.lemma);
    expect(adv('lentement')).toEqual(['lent']);
    expect(adv('heureusement')).toEqual(['heureux']);
    expect(adv('évidemment')).toEqual(['évident']);
    expect(adv('constamment')).toEqual(['constant']);
    expect(adv('vraiment')).toEqual(['vrai']);
    expect(adv('énormément')).toEqual(['énorme']);
    expect(adv('doucement')).toEqual(['doux']);
    expect(adv('longuement')).toEqual(['long']);
    expect(adv('rapidement')).toEqual([]);
    expect(analyzeNominal('lentement', k)[0].derived).toBe(true);
  });
  it('nothing is read for a lemma the list does not hold', () => {
    expect(analyzeNominal('chevaux', () => false)).toEqual([]);
  });
});

describe('guesses from the ending (inferred, never confirmed)', () => {
  const g = (f: string) => guessNominal(f).map((x) => `${x.lemma}/${x.pos}/${JSON.stringify(x.morph)}`);
  it('a feminine noun in -tion, -té, -ence, -ure, -ie, -ette', () => {
    expect(g('nation')[0]).toBe('nation/NOUN/{"Gender":"Fem","Number":"Sing"}');
    expect(g('liberté')[0]).toBe('liberté/NOUN/{"Gender":"Fem","Number":"Sing"}');
    expect(g('patience')[0]).toBe('patience/NOUN/{"Gender":"Fem","Number":"Sing"}');
    expect(g('peinture')[0]).toBe('peinture/NOUN/{"Gender":"Fem","Number":"Sing"}');
    expect(g('boulangerie')[0]).toBe('boulangerie/NOUN/{"Gender":"Fem","Number":"Sing"}');
    expect(g('cigarette')[0]).toBe('cigarette/NOUN/{"Gender":"Fem","Number":"Sing"}');
    expect(g('actions')[0]).toBe('action/NOUN/{"Gender":"Fem","Number":"Plur"}');
  });
  it('a masculine noun in -ment, -age, -isme, -eau', () => {
    expect(g('mouvement')[0]).toBe('mouvement/NOUN/{"Gender":"Masc","Number":"Sing"}');
    expect(g('voyage')[0]).toBe('voyage/NOUN/{"Gender":"Masc","Number":"Sing"}');
    expect(g('réalisme')[0]).toBe('réalisme/NOUN/{"Gender":"Masc","Number":"Sing"}');
    expect(g('chapeau')[0]).toBe('chapeau/NOUN/{"Gender":"Masc","Number":"Sing"}');
  });
  it('-emment and -amment are adverbs; -ment alone is also a noun', () => {
    const best = (f: string) => [...guessNominal(f)].sort((a, b) => a.rank - b.rank)[0].pos;
    expect(best('évidemment')).toBe('ADV');
    expect(best('constamment')).toBe('ADV');
    expect(best('vêtement')).toBe('NOUN');
  });
  it('a final -s is offered as the word itself AND as a plural, never as a plural alone', () => {
    const r = guessNominal('tapis');
    expect(r.some((x) => x.morph.Number === 'Sing' && x.lemma === 'tapis')).toBe(true);
    expect(r.some((x) => x.morph.Number === 'Plur')).toBe(true);
    expect(r.every((x) => /inferred|no proof/.test(x.rule))).toBe(true);
    expect(r[0].lemma).toBe('tapis');
    // -aux is the plural of -al
    expect(g('journaux')).toContain('journal/NOUN/{"Number":"Plur"}');
    expect(g('heureuses')).toContain('heureux/ADJ/{"Gender":"Fem","Number":"Plur"}');
  });
  it('short or non-letter forms give nothing', () => {
    expect(guessNominal('un')).toEqual([]);
    expect(guessNominal('a1b2c3')).toEqual([]);
  });
});
