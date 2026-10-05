/**
 * Rule-engine classes found by tuning against the dev half of the dictionary's inflection data (scripts/eval-es-morph.mts):
 * attached pronouns on a vosotros command, stress-shifting verbs, voseo present subjunctive and the 2010 monosyllable
 * spelling, noun / adjective guesses for words no list holds, and a diminutive that keeps the gender of its noun.
 * The forms below are chosen here, from the class each failure belonged to; they are not the evaluation's own forms.
 */
import { describe, expect, it } from 'vitest';
import { createAdapterRegistry } from '../../src/adapters';
import { analyzeSpanishForm } from '../../src/adapters/spanish/morphology';

const es = createAdapterRegistry().get('es');
const read = (form: string) => es.analyze(es.tokenize(form))[0].candidates;
const has = (form: string, lemma: string, pos = 'VERB') => read(form).some((c) => c.lemma === lemma && (c.pos === pos || (pos === 'VERB' && c.pos === 'AUX')));
const find = (form: string, lemma: string, pos = 'VERB') => read(form).find((c) => c.lemma === lemma && (c.pos === pos || (pos === 'VERB' && c.pos === 'AUX')));

describe('attached pronouns on a vosotros command', () => {
  it('a verb of the word list, one or two pronouns (cosedlo, dádmelo)', () => {
    const c = find('cosedlo', 'coser')!;
    expect(c.morph).toMatchObject({ Mood: 'Imp', Person: '2', Number: 'Plur' });
    expect(c.parts?.map((p) => p.text)).toEqual(['cosed', 'lo']);
    const d = find('dádmelo', 'dar')!;
    expect(d.parts?.map((p) => p.text)).toEqual(['dád', 'me', 'lo']);
  });

  it('a verb outside the word list is a guess, and the first one: the command with its pronoun', () => {
    for (const [form, lemma, verb] of [['recogedlas', 'recoger', 'recoged'], ['abrazadle', 'abrazar', 'abrazad'], ['vestidlo', 'vestir', 'vestid']]) {
      const first = read(form)[0];
      expect(first.lemma, form).toBe(lemma);
      expect(first.morph).toMatchObject({ Mood: 'Imp', Person: '2', Number: 'Plur' });
      expect(first.parts?.[0].text).toBe(verb);
      if (first.notes?.lemmaStatus === 'inferred by the rules') expect(first.unconfirmed).toBe(true);
    }
  });

  it('os alone still needs the d to drop, and se alone is not a vosotros command', () => {
    expect(has('levantaos', 'levantar')).toBe(true);
    expect(read('levantados').some((c) => c.parts?.length)).toBe(false);
    expect(read('cantadse').some((c) => c.lemma === 'cantar' && c.parts?.length)).toBe(false);
  });
});

describe('two pronouns on an infinitive of a verb outside the word list', () => {
  it('the lemma has no accent: esparcir, not esparcír', () => {
    for (const [form, lemma] of [['esparcírselo', 'esparcir'], ['sumergírmelo', 'sumergir'], ['surcírnoslo', 'surcir']]) {
      const first = read(form)[0];
      expect(first.lemma, form).toBe(lemma);
      expect(first.morph.VerbForm).toBe('Inf');
      expect(first.parts).toHaveLength(3);
      expect(first.unconfirmed).toBe(true);
    }
  });

  it('no guess is an infinitive with a written accent except -aír, -eír, -oír; no infinitive ends in -ier, -iir, -uer', () => {
    const forms = ['zurcírselo', 'esparcirse', 'cocinaría', 'porfían', 'bruñíamos', 'coloreó', 'hurgaremos', 'repartíamos', 'fregaban', 'delinquías', 'emprendieron', 'rubricó', 'litografían'];
    for (const f of forms) for (const c of read(f)) {
      if (!c.lemma || c.pos !== 'VERB') continue;
      expect(/[^aeo]ír$/.test(c.lemma), `${f} → ${c.lemma}`).toBe(false);
      expect(/(?:[iu]er|iir)$/.test(c.lemma), `${f} → ${c.lemma}`).toBe(false);
    }
    // the real ones stay
    expect(has('sonreírle', 'sonreír')).toBe(true);
    expect(has('oírlo', 'oír')).toBe(true);
  });
});

describe('verbs with a spelling change in the stem, with pronouns attached', () => {
  it('-uir and -üir: diluir, redargüir (diluyendo, redarguyó) but redargüimos', () => {
    expect(find('diluyéndose', 'diluir')?.parts?.map((p) => p.text)).toEqual(['diluyéndo', 'se']);
    expect(has('redarguyó', 'redargüir')).toBe(true);
    expect(has('redarguyéndola', 'redargüir')).toBe(true);
    expect(has('redargüimos', 'redargüir')).toBe(true);
    expect(analyzeSpanishForm('redarguyáis', { knownLemma: (l) => l === 'redargüir' }).some((a) => a.lemma === 'redargüir')).toBe(true);
  });

  it('-uir has its y before á too (destruyáis, construyáis)', () => {
    for (const w of ['destruyáis', 'distribuyáis']) expect(read(w).some((c) => c.morph.Mood === 'Sub' && c.morph.Person === '2' && c.morph.Number === 'Plur'), w).toBe(true);
  });

  it('a usted or ustedes command with its accent and a pronoun: insinúenme, evacúelo', () => {
    expect(find('insinúenme', 'insinuar')?.parts?.map((p) => p.text)).toEqual(['insinúen', 'me']);
    expect(find('evacúelo', 'evacuar')?.morph).toMatchObject({ Mood: 'Imp', Person: '3' });
    expect(find('continúelo', 'continuar')?.parts?.map((p) => p.text)).toEqual(['continúe', 'lo']);
  });
});

describe('-cuar verbs are written both ways', () => {
  it('evacúo and evacuo, adecúa and adecua, licúen and licuen', () => {
    for (const [a, b, lemma] of [['evacúan', 'evacuan', 'evacuar'], ['adecúa', 'adecua', 'adecuar'], ['licúen', 'licuen', 'licuar']]) {
      expect(has(a, lemma), a).toBe(true);
      expect(has(b, lemma), b).toBe(true);
    }
    // the accent is not invented for -guar, -quar-less verbs
    expect(has('averigüe', 'averiguar')).toBe(true);
    expect(read('averigúe').some((c) => c.lemma === 'averiguar')).toBe(false);
  });
});

describe('verbs that keep a hiatus: the stressed stem has a written accent', () => {
  it('a verb outside the word list, from the accent alone (aúna, cohíbe, maúlla, descafeína, enraízan)', () => {
    for (const [form, lemma] of [['aúna', 'aunar'], ['cohíbe', 'cohibir'], ['maúlla', 'maullar'], ['descafeína', 'descafeinar'], ['enraízan', 'enraizar'], ['ahúman', 'ahumar']]) {
      const c = find(form, lemma);
      expect(c, form).toBeDefined();
      expect(c!.morph.VerbForm).toBe('Fin');
      expect(c!.notes?.lemmaStatus).not.toBe('in the word list'); // nothing vouches for these lemmas here
    }
  });

  it('the unaccented forms keep their diphthong or hiatus (cohibimos, aunamos) and a regular verb is not turned into one', () => {
    expect(has('cohibimos', 'cohibir')).toBe(true);
    expect(has('aunamos', 'aunar')).toBe(true);
    // bailar: baila has no accent, so no hiatus reading is made for it
    expect(analyzeSpanishForm('baila', {}).map((a) => a.lemma)).toContain('bailar');
  });

  it('an unlisted -iar verb with the accent of the enviar class (litografían, rubrican is regular)', () => {
    expect(has('litografían', 'litografiar')).toBe(true);
    expect(has('cinematografío', 'cinematografiar')).toBe(true);
  });

  it('a verb the word list knows keeps its confidence: reúne, reúnen are reunir at 0.7 or more', () => {
    const c = find('reúnen', 'reunir')!;
    expect(c.confidence).toBeGreaterThanOrEqual(0.7);
    expect(c.unconfirmed).toBeUndefined();
  });
});

describe('voseo in the present subjunctive', () => {
  it('-ar: -és, with the variety voseo (hablés, llevés, busqués, pagués)', () => {
    for (const [form, lemma] of [['hablés', 'hablar'], ['llevés', 'llevar'], ['busqués', 'buscar'], ['pagués', 'pagar'], ['cruzés', 'cruzar']]) {
      const c = read(form).find((x) => x.lemma === lemma && x.morph.Mood === 'Sub');
      expect(c, form).toBeDefined();
      expect(c!.morph).toMatchObject({ Person: '2', Number: 'Sing', Tense: 'Pres' });
      expect(c!.varieties, form).toContain('voseo');
    }
  });

  it('-er and -ir: -ás; a stem change follows the nosotros stem (pidás, durmás, tengás)', () => {
    for (const [form, lemma] of [['vendás', 'vender'], ['pidás', 'pedir'], ['durmás', 'dormir'], ['tengás', 'tener'], ['vayás', 'ir'], ['seás', 'ser'], ['sintás', 'sentir']]) {
      const c = read(form).find((x) => x.lemma === lemma && x.morph.Mood === 'Sub');
      expect(c, form).toBeDefined();
      expect(c!.varieties, form).toContain('voseo');
    }
  });

  it('for a verb outside the list the voseo reading is a guess and says voseo', () => {
    const c = read('sobrevolés').find((x) => x.lemma === 'sobrevolar');
    expect(c).toBeDefined();
    expect(c!.varieties).toContain('voseo');
    expect(c!.unconfirmed).toBe(true);
  });
});

describe('the 2010 spelling of monosyllables: no accent on a diphthong (crie, crio, guio, vos cries)', () => {
  it('criar, guiar, fiar and liar', () => {
    expect(find('crio', 'criar')?.morph).toMatchObject({ Tense: 'Past', Person: '3', Number: 'Sing' });
    expect(find('crie', 'criar')?.morph).toMatchObject({ Tense: 'Past', Person: '1', Number: 'Sing' });
    expect(find('guio', 'guiar')?.morph).toMatchObject({ Tense: 'Past', Person: '3' });
    expect(find('fiais', 'fiar')?.morph).toMatchObject({ Person: '2', Number: 'Plur' });
    const cries = find('cries', 'criar')!;
    expect(cries.morph).toMatchObject({ Mood: 'Sub', Person: '2', Number: 'Sing' });
    expect(cries.varieties).toContain('voseo');
    const crias = find('crias', 'criar')!;
    expect(crias.morph).toMatchObject({ Mood: 'Ind', Tense: 'Pres', Person: '2' });
    expect(crias.varieties).toContain('voseo');
  });

  it('the older spelling is still read, and a diacritic accent stays (dé, sé)', () => {
    expect(has('crió', 'criar')).toBe(true);
    expect(has('guió', 'guiar')).toBe(true);
    expect(read('dé').every((c) => c.lemma === 'dar')).toBe(true);
    expect(read('dé').length).toBeGreaterThan(0);
  });
});

describe('prefixed irregular verbs, with a prefix before a prefix', () => {
  it('descomponer, presuponer, indisponer, desavenir', () => {
    for (const [form, lemma] of [['descompusieron', 'descomponer'], ['presupusimos', 'presuponer'], ['indispuso', 'indisponer'], ['desavinieron', 'desavenir'], ['predispondré', 'predisponer'], ['desaviene', 'desavenir']]) {
      expect(has(form, lemma), form).toBe(true);
    }
  });

  it('the families that were missing a prefix: advenir, substraer, supervenir', () => {
    expect(has('advino', 'advenir')).toBe(true);
    expect(has('substrajeron', 'substraer')).toBe(true);
    expect(has('supervendrá', 'supervenir')).toBe(true);
  });

  it('satisfacer is irregular like hacer', () => {
    expect(find('satisfizo', 'satisfacer')?.morph).toMatchObject({ Tense: 'Past', Person: '3' });
    expect(find('satisfago', 'satisfacer')?.morph).toMatchObject({ Tense: 'Pres', Person: '1' });
    expect(find('satisfecho', 'satisfacer')?.morph.VerbForm).toBe('Part');
    expect(find('satisfaré', 'satisfacer')?.morph).toMatchObject({ Tense: 'Fut' });
    expect(read('satisfaz').some((c) => c.lemma === 'satisfacer' && c.morph.Mood === 'Imp')).toBe(true);
  });
});

describe('stem changes: avergonzar and the dieresis; henchir', () => {
  it('o>ue after g is güe (avergüenzo), and the other forms keep the o', () => {
    expect(has('avergüenzan', 'avergonzar')).toBe(true);
    expect(has('avergonzamos', 'avergonzar')).toBe(true);
    expect(has('agüera', 'agorar')).toBe(true);
    expect(read('avergoncé').some((c) => c.lemma === 'avergonzar')).toBe(true);
  });
});

describe('the usted command of an irregular verb that has no tú command', () => {
  it('caber and poder: quepa, quepan, pueda, puedan are also commands; cabed too; no tú command', () => {
    for (const form of ['quepa', 'quepan', 'pueda', 'puedan']) {
      expect(read(form).some((c) => c.morph.Mood === 'Imp' && c.morph.Person === '3'), form).toBe(true);
    }
    expect(has('cabed', 'caber')).toBe(true);
    expect(read('cabe').some((c) => c.lemma === 'caber' && c.morph.Mood === 'Imp' && c.morph.Person === '2' && c.morph.Number === 'Sing')).toBe(false);
  });
});

describe('a diminutive keeps the gender of its noun', () => {
  it('niño → niñito (not niñita), casa → casita, hijo → hijito, hija → hijita', () => {
    const dim = (form: string, lemma: string) => read(form).find((c) => c.lemma === lemma && c.morph.Degree === 'Dim');
    expect(dim('hijito', 'hijo')?.morph.Gender).toBe('Masc');
    expect(dim('hijita', 'hija')?.morph.Gender).toBe('Fem');
    expect(dim('hijito', 'hija')).toBeUndefined();
    expect(dim('hijita', 'hijo')).toBeUndefined();
    expect(dim('casita', 'casa')?.morph.Gender).toBe('Fem');
    expect(dim('casito', 'casa')).toBeUndefined();
    expect(dim('librito', 'libro')?.morph.Gender).toBe('Masc');
    expect(dim('librita', 'libro')).toBeUndefined();
  });

  it('a noun is not read as the augmentative of a noun of the other gender (pelotas ← pelo)', () => {
    expect(read('pelotas').some((c) => c.lemma === 'pelo' && c.morph.Degree === 'Aug')).toBe(false);
    expect(read('pelotas').some((c) => c.lemma === 'pelota')).toBe(true);
    // an adjective takes both genders
    expect(read('buenita').some((c) => c.lemma === 'bueno' && c.morph.Gender === 'Fem' && c.morph.Degree === 'Dim')).toBe(true);
    expect(read('buenito').some((c) => c.lemma === 'bueno' && c.morph.Gender === 'Masc' && c.morph.Degree === 'Dim')).toBe(true);
  });
});

describe('noun and adjective guesses for a word no list holds', () => {
  const guess = (form: string) => read(form).filter((c) => c.pos === 'NOUN' || c.pos === 'ADJ');

  it('a plural in -ces, -es, -os, -as names a singular, marked as a guess', () => {
    for (const [form, lemma] of [['lombrices', 'lombriz'], ['cicatrices', 'cicatriz'], ['alféreces', 'alférez'], ['camaleones', 'camaleón'], ['inspectores', 'inspector'], ['velódromos', 'velódromo'], ['tribus', 'tribu']]) {
      const c = guess(form).find((x) => x.lemma === lemma);
      expect(c, form).toBeDefined();
      expect(c!.unconfirmed, form).toBe(true);
      expect(c!.origin).toBe('rule');
      expect(c!.gloss).toBeUndefined();
      expect(c!.confidence).toBeLessThanOrEqual(0.6);
      expect(c!.morph.Number).toBe('Plur');
    }
  });

  it('a plural in -s after a consonant is a loanword plural (podcasts, hashtags)', () => {
    for (const [form, lemma] of [['podcasts', 'podcast'], ['hashtags', 'hashtag'], ['kebabs', 'kebab']]) {
      expect(guess(form).find((c) => c.lemma === lemma)?.unconfirmed, form).toBe(true);
    }
  });

  it('a feminine in -ora is offered as the masculine in -or and as its own headword; other feminines in -a as the masculine in -o', () => {
    const d = guess('inspectora');
    expect(d.map((c) => c.lemma)).toEqual(expect.arrayContaining(['inspector', 'inspectora']));
    expect(d.find((c) => c.lemma === 'inspector')!.morph.Gender).toBe('Fem');
    expect(guess('inspectoras').map((c) => c.lemma)).toEqual(expect.arrayContaining(['inspector', 'inspectora']));
    expect(guess('boticaria').map((c) => c.lemma)).toEqual(expect.arrayContaining(['boticario', 'boticaria']));
    for (const c of guess('inspectora')) expect(c.unconfirmed).toBe(true);
  });

  it('both a noun and an adjective for the masculine / singular lemma, at most a handful of guesses', () => {
    const g = guess('inspectores');
    expect(g.map((c) => c.pos).sort()).toEqual(['ADJ', 'NOUN']);
    for (const f of ['inspectora', 'lombrices', 'boticaria', 'podcasts', 'camaleones']) expect(guess(f).length, f).toBeLessThanOrEqual(4);
  });

  it('they come first where the ending is a noun\'s and after the verb guesses where it is not', () => {
    expect(read('lombrices')[0].pos).toBe('NOUN');
    expect(read('inspectoras')[0].pos).toBe('NOUN');
    expect(read('boticaria')[0].pos).toBe('VERB');
  });

  it('never beside a reading the word list vouches for, and not for a verb form', () => {
    for (const f of ['casas', 'libros', 'cantas', 'hablamos', 'tienes', 'niñas', 'doctor', 'hijas']) {
      for (const c of read(f)) expect(c.unconfirmed, `${f} ${c.lemma}`).toBeUndefined();
    }
    // first-person plural endings and verbs with attached pronouns are not read as plural nouns
    for (const f of ['hurgamos', 'repartiremos', 'esparcírselo', 'recogedlas']) expect(guess(f).filter((c) => c.unconfirmed), f).toEqual([]);
    // -íes, -úes is written alike for a tú subjunctive (historíes, actúes) and for the plural of a noun in a stressed -í, -ú
    // (jabalíes, tabúes): the shape does not say which, so both are offered, the verb first, and never a noun in -íe
    for (const [f, verb, noun] of [['historíes', 'historiar', 'historí'], ['jabalíes', 'jabaliar', 'jabalí'], ['tabúes', 'tabuar', 'tabú']]) {
      expect(read(f)[0], f).toMatchObject({ lemma: verb, pos: 'VERB' });
      expect(guess(f).map((c) => c.lemma), f).toContain(noun);
      expect(guess(f).some((c) => /[íú]e$/.test(c.lemma ?? '')), f).toBe(false);
    }
    // an older spelling of a word the list knows gets verb guesses at most, as before, no noun guess
    for (const c of read('fazer')) if (c.unconfirmed) expect(c.pos).toBe('VERB');
  });

  it('a word the dictionary of the engine alone cannot read stays unread (no vowel, a digit)', () => {
    expect(read('xzq')).toEqual([]);
    expect(analyzeSpanishForm('pst', { knownLemma: () => false })).toEqual([]);
  });
});

describe('attached pronouns on a nosotros command', () => {
  const parts = (form: string, lemma: string) => find(form, lemma)?.parts?.map((p) => p.text);

  it('the -s goes before nos and os, and is written once before se', () => {
    expect(parts('lavémonos', 'lavar')).toEqual(['lavémo', 'nos']);
    expect(parts('sentémoos', 'sentar')).toEqual(['sentémo', 'os']);
    expect(parts('digámoselo', 'decir')).toEqual(['digámo', 'se', 'lo']);
    expect(parts('pongámonoslo', 'poner')).toEqual(['pongámo', 'nos', 'lo']);
    expect(parts('démosela', 'dar')).toEqual(['démo', 'se', 'la']);
    for (const f of ['lavémonos', 'sentémoos', 'digámoselo']) expect(read(f)[0].morph, f).toMatchObject({ Mood: 'Imp', Person: '1', Number: 'Plur' });
  });

  it('before any other pronoun the -s stays: ayudémoste, cantémoslo, digámosle', () => {
    expect(parts('ayudémoste', 'ayudar')).toEqual(['ayudémos', 'te']);
    expect(parts('cantémoslo', 'cantar')).toEqual(['cantémos', 'lo']);
    expect(parts('digámosle', 'decir')).toEqual(['digámos', 'le']);
  });

  it('a form that keeps the -s before nos, or drops it before another pronoun, is not read so', () => {
    expect(read('lavémosnos').some((c) => c.lemma === 'lavar')).toBe(false);
    expect(read('cantémolo').some((c) => c.lemma === 'cantar')).toBe(false);
    // te and os on a third-person command stay impossible (digan + te); where the same letters are also a statement
    // (sienten + te = te sienten) what is left is that literary order, a reading from the shape alone
    expect(read('dígante').some((c) => c.lemma === 'decir' || c.unconfirmed !== true)).toBe(false);
    expect(read('siéntente').every((c) => !c.parts?.length || (c.morph.Mood === 'Ind' && c.unconfirmed === true))).toBe(true);
  });

  it('for a verb outside the word list it is the first guess, with no plural-noun guess beside it', () => {
    for (const [form, lemma] of [['acurruquémonos', 'acurrucar'], ['surquémoos', 'surcar'], ['esquivémonos', 'esquivar']]) {
      const first = read(form)[0];
      expect(first, form).toMatchObject({ lemma, pos: 'VERB', unconfirmed: true });
      expect(first.parts).toHaveLength(2);
      expect(read(form).some((c) => c.pos === 'NOUN' || c.pos === 'ADJ'), form).toBe(false);
    }
  });
});

describe('a vosotros command of a verb in -uir with os: the i takes an accent (huíos)', () => {
  it('construíos, instruíos, and still reíos, oíos, partíos', () => {
    for (const [form, lemma] of [['construíos', 'construir'], ['instruíos', 'instruir'], ['distribuíos', 'distribuir'], ['reíos', 'reír'], ['oíos', 'oír'], ['partíos', 'partir']]) {
      const c = find(form, lemma);
      expect(c, form).toBeDefined();
      expect(c!.morph).toMatchObject({ Mood: 'Imp', Person: '2', Number: 'Plur' });
      expect(c!.parts?.map((p) => p.text).join('+'), form).toBe(`${form.slice(0, -2)}+os`);
    }
    // the participle keeps its diphthong: no accent, no pronoun
    expect(read('construidos').some((c) => c.parts?.length)).toBe(false);
    expect(find('construidos', 'construir')?.morph.VerbForm).toBe('Part');
  });
});

describe('more prefixed relatives of the irregular verbs', () => {
  it('antever, desasir, manutener', () => {
    expect(find('antevisto', 'antever')?.morph.VerbForm).toBe('Part');
    expect(find('antevé', 'antever')?.morph).toMatchObject({ Tense: 'Pres', Person: '3' });
    expect(find('desasgo', 'desasir')?.morph).toMatchObject({ Tense: 'Pres', Person: '1' });
    expect(find('manutuvo', 'manutener')?.morph).toMatchObject({ Tense: 'Past', Person: '3' });
  });
});

describe('a plural in -amos, -emos, -imos that no verb explains', () => {
  const guess = (form: string) => read(form).filter((c) => c.pos === 'NOUN' || c.pos === 'ADJ').map((c) => c.lemma);

  it('gramos, ánimos, máximos, tramos: a plural, as a guess', () => {
    for (const [form, lemma] of [['gramos', 'gramo'], ['ánimos', 'ánimo'], ['máximos', 'máximo'], ['tramos', 'tramo']]) {
      expect(guess(form), form).toContain(lemma);
      for (const c of read(form)) expect(c.unconfirmed, form).toBe(true);
    }
  });

  it('where a verb explains the form the ending stays a verb\'s (hurgamos, extremos)', () => {
    expect(guess('hurgamos')).toEqual([]);
    expect(read('hurgamos')[0].pos).toBe('VERB');
  });
});

describe('a plural in -es after -or, -ón: no noun in -ore, -one is guessed', () => {
  const lemmas = (form: string) => read(form).filter((c) => c.pos === 'NOUN').map((c) => c.lemma);

  it('escultores, camaleones give only the consonant noun; pasteles, sedes also the noun in -e', () => {
    expect(lemmas('escultores')).toEqual(['escultor']);
    expect(lemmas('camaleones')).toEqual(['camaleón']);
    expect(lemmas('pinceles')).toEqual(['pincel', 'pincele']);
    expect(lemmas('aludes')).toEqual(['alud', 'alude']);
  });
});

describe('the flag and the version', () => {
  it('every guess the engine adds is unconfirmed, and the adapter is version 5', () => {
    expect(es.version).toBe('10');
    for (const f of ['inspectora', 'lombrices', 'podcasts', 'esparcírselo', 'aúna', 'litografían']) {
      for (const c of read(f)) if (c.notes?.lemmaStatus === 'inferred by the rules') expect(c.unconfirmed, `${f} ${c.lemma}`).toBe(true);
    }
  });
});
