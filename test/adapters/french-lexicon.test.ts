/**
 * The French hand lexicon (src/adapters/french): every row parses, nothing is listed twice, the closed classes are complete
 * with every form, être / avoir / aller hold their whole paradigms, the elided forms exist, and the variety tags are known.
 * The test builds a `Lexicon` from the rows itself with `normalizeFr`; it does not read the adapter (src/adapters/fr.ts).
 */
import { describe, expect, it } from 'vitest';
import { Lexicon, type LexEntry } from '../../src/adapters/shared';
import { normalizeFr } from '../../src/adapters/french/orth';
import { annotationKey } from '../../src/adapters/french/types';
import { buildRows, mergeAnnotations, parseRows, type FrRow } from '../../src/adapters/french/entries';
import { FUNCTION_ROWS } from '../../src/adapters/french/function-words';
import { VERB_ROWS } from '../../src/adapters/french/lexicon-verbs';
import { NOUN_ROWS } from '../../src/adapters/french/lexicon-nouns';
import { ADJECTIVE_ROWS, ADVERB_ROWS, PROPER_ROWS } from '../../src/adapters/french/lexicon-modifiers';
import { FR_LABEL_VARIETIES, FR_VARIETIES, FR_VARIETY_CODES } from '../../src/adapters/french/varieties';

const SOURCES: Array<[string, string]> = [
  ['function-words', FUNCTION_ROWS], ['lexicon-verbs', VERB_ROWS], ['lexicon-nouns', NOUN_ROWS],
  ['lexicon-modifiers:ADJ', ADJECTIVE_ROWS], ['lexicon-modifiers:ADV', ADVERB_ROWS], ['lexicon-modifiers:PROPN', PROPER_ROWS],
];

const problems: string[] = [];
const rowsByFile = new Map<string, FrRow[]>();
for (const [label, src] of SOURCES) rowsByFile.set(label, parseRows(src, label, problems));
const allRows = [...rowsByFile.values()].flat();
const buildProblems: string[] = [];
const built = buildRows(allRows, new Set(), buildProblems);
const lex = new Lexicon(built.entries, normalizeFr);
const annotations = mergeAnnotations(built.annotations);

const readings = (form: string) => lex.lookup(normalizeFr(form));
const lemmasOf = (form: string, pos?: string) => [...new Set(readings(form).filter((h) => !pos || h.entry.pos === pos).map((h) => h.entry.lemma))];
const hasReading = (form: string, lemma: string, pos: string, feats: Record<string, string> = {}) =>
  readings(form).some((h) => h.entry.lemma === lemma && h.entry.pos === pos
    && Object.entries(feats).every(([k, v]) => (h.form.morph[k] ?? '').split(',').includes(v)));
const countPos = (pos: string) => allRows.filter((r) => r.pos === pos).length;
const adjectiveLemmas = new Set(rowsByFile.get('lexicon-modifiers:ADJ')!.map((r) => r.lemma));

describe('French lexicon: integrity', () => {
  it('every row of every file is read: no row was skipped as malformed, and every row builds', () => {
    expect(problems).toEqual([]);
    expect(buildProblems).toEqual([]);
  });

  it('no lemma + part of speech is listed twice across the files', () => {
    expect(built.duplicates).toEqual([]);
  });

  it('holds the promised sizes', () => {
    const nouns = rowsByFile.get('lexicon-nouns')!.length;
    expect(rowsByFile.get('lexicon-verbs')!.length).toBeGreaterThanOrEqual(550);
    expect(nouns).toBeGreaterThanOrEqual(1000);
    expect(rowsByFile.get('lexicon-modifiers:ADJ')!.length).toBeGreaterThanOrEqual(400);
    expect(rowsByFile.get('lexicon-modifiers:ADV')!.length).toBeGreaterThanOrEqual(200);
    expect(countPos('PROPN')).toBeGreaterThanOrEqual(150);
  });

  it('every noun has a gender, on every form; verbs are infinitives; adjectives start from the masculine or the common singular', () => {
    for (const e of built.entries) {
      expect(e.gloss.trim(), e.lemma).not.toBe('');
      expect(e.gloss, e.lemma).not.toMatch(/\.$/u);
      if (e.pos === 'NOUN') for (const f of e.forms) expect(f.morph.Gender, `${e.lemma}: ${f.form}`).toBeDefined();
      if (e.pos === 'VERB' && e.forms.length === 1) {
        expect(e.forms[0].morph.VerbForm, e.lemma).toBe('Inf');
        expect(e.lemma, e.lemma).toMatch(/(er|ir|ïr|re|oir)$/u);
      }
      // the ordinals in function-words.ts (deuxième …) are the same in both genders and carry none
      if (e.pos === 'ADJ' && adjectiveLemmas.has(e.lemma)) for (const f of e.forms) expect(f.morph.Gender, `${e.lemma}: ${f.form}`).toBeDefined();
    }
  });

  it('the row format refuses a malformed line instead of dropping a word', () => {
    expect(() => parseRows('# NOUN\nmaison/f: house')).toThrow(/lemma = gloss/);
    expect(() => parseRows('# NOUN\nmaison/f = house [fr-XX]')).toThrow(/unknown variety/);
    expect(() => parseRows('# NOUN\nmaison/f = house [wrong!]')).toThrow(/unknown tag/);
    expect(() => parseRows('maison/f = house')).toThrow(/before any section/);
    expect(() => parseRows('# NOPE\n')).toThrow(/unknown part of speech/);
    const [r] = parseRows('# NOUN\nchar/m = car [fr-CA colloquial]');
    expect(r).toMatchObject({ lemma: 'char', gender: 'm', varieties: ['fr-CA'], register: ['colloquial'] });
  });

  it('the row tags: h-aspiré, être, être/avoir, pronominal and the contraction components', () => {
    const rows = parseRows('# NOUN\nhéros/m = hero [h-aspiré]\n# VERB\nvenir = to come [être]\nsortir = to go out [être/avoir]\nsouvenir = to remember [pronominal]\n# ADP\nau = to the [+à+le] | au:m sg');
    expect(rows[0].hAspire).toBe(true);
    expect(rows[1].aux).toBe('être');
    expect(rows[2].aux).toBe('both');
    expect(rows[3].pronominal).toBe(true);
    expect(rows[4].components).toEqual(['à', 'le']);
    const b = buildRows(rows);
    expect(b.annotations.get(annotationKey('héros', 'NOUN'))).toEqual({ hAspire: true });
    expect(b.annotations.get(annotationKey('venir', 'VERB'))).toEqual({ aux: 'être' });
    expect(b.annotations.get(annotationKey('sortir', 'VERB'))).toEqual({ aux: 'both' });
    expect(b.annotations.get(annotationKey('souvenir', 'VERB'))).toEqual({ pronominal: true });
    expect(b.entries.find((e: LexEntry) => e.lemma === 'au')!.notes).toEqual({ components: ['à', 'le'] });
  });

  it('a /mf noun is both genders; an explicit form list builds only those forms; a plain adjective starts masculine singular', () => {
    const b = buildRows(parseRows('# NOUN\nélève/mf = pupil\ncheval/m = horse | cheval:m sg; chevaux:m pl\n# ADJ\ngrand = big\nrapide/mf = fast\n# VERB\nparler = to speak'));
    const by = (l: string) => b.entries.find((e: LexEntry) => e.lemma === l)!;
    expect(by('élève').forms).toEqual([{ form: 'élève', morph: { Gender: 'Fem,Masc', Number: 'Sing' } }]);
    expect(by('cheval').forms.map((f) => f.form)).toEqual(['cheval', 'chevaux']);
    expect(by('grand').forms[0].morph).toEqual({ Gender: 'Masc', Number: 'Sing' });
    expect(by('rapide').forms[0].morph).toEqual({ Gender: 'Fem,Masc', Number: 'Sing' });
    expect(by('parler').forms[0].morph).toEqual({ VerbForm: 'Inf' });
  });

  it('the irregular plurals and invariable nouns are listed', () => {
    for (const [lemma, plural] of [['cheval', 'chevaux'], ['journal', 'journaux'], ['animal', 'animaux'], ['travail', 'travaux'], ['œil', 'yeux'], ['ciel', 'cieux'],
      ['monsieur', 'messieurs'], ['madame', 'mesdames'], ['mademoiselle', 'mesdemoiselles'], ['bijou', 'bijoux'], ['genou', 'genoux'], ['hibou', 'hiboux'], ['mal', 'maux'],
      ['hôpital', 'hôpitaux'], ['grand-mère', 'grands-mères']]) {
      expect(hasReading(plural, lemma, 'NOUN', { Number: 'Plur' }), `${plural} → ${lemma}`).toBe(true);
      expect(hasReading(lemma, lemma, 'NOUN', { Number: 'Sing' }), lemma).toBe(true);
    }
    for (const w of ['fils', 'bras', 'temps', 'corps', 'prix', 'voix', 'nez', 'fois', 'pays', 'mois', 'bois', 'dos', 'cas', 'vers']) {
      expect(hasReading(w, w, 'NOUN', { Number: 'Sing' }), `${w} singular`).toBe(true);
      expect(hasReading(w, w, 'NOUN', { Number: 'Plur' }), `${w} plural`).toBe(true);
    }
    expect(lemmasOf('belles', 'ADJ')).toEqual(['beau']);
    expect(hasReading('bel', 'beau', 'ADJ', { Gender: 'Masc', Number: 'Sing' })).toBe(true);
    expect(hasReading('vieil', 'vieux', 'ADJ')).toBe(true);
    expect(hasReading('nouvelle', 'nouveau', 'ADJ', { Gender: 'Fem' })).toBe(true);
  });

  it('the aspirated h is marked on the words that have it, and only on them', () => {
    for (const w of ['héros', 'haine', 'hasard', 'honte', 'hache']) {
      const hit = allRows.find((r) => r.lemma === w);
      if (hit) expect(hit.hAspire, w).toBe(true);
    }
    expect(annotations.get(annotationKey('héros', 'NOUN'))?.hAspire).toBe(true);
    expect(annotations.get(annotationKey('haine', 'NOUN'))?.hAspire).toBe(true);
    expect(annotations.get(annotationKey('homme', 'NOUN'))?.hAspire).toBeUndefined();
    expect(annotations.get(annotationKey('hôtel', 'NOUN'))?.hAspire).toBeUndefined();
  });

  it('the verbs of the être list and the pronominal verbs are tagged', () => {
    for (const v of ['venir', 'arriver', 'partir', 'entrer', 'tomber', 'rester', 'naître', 'mourir', 'devenir', 'revenir']) {
      expect(annotations.get(annotationKey(v, 'VERB'))?.aux, v).toBe('être');
    }
    for (const v of ['sortir', 'monter', 'descendre', 'passer', 'rentrer', 'retourner']) expect(annotations.get(annotationKey(v, 'VERB'))?.aux, v).toBe('both');
    for (const v of ['souvenir', 'taire', 'blottir', 'évanouir']) expect(annotations.get(annotationKey(v, 'VERB'))?.pronominal, v).toBe(true);
  });
});

describe('French lexicon: the elided forms', () => {
  it('l\' belongs to the article and to the pronoun le', () => {
    expect(hasReading("l'", 'le', 'DET', { Definite: 'Def' })).toBe(true);
    expect(hasReading("l'", 'le', 'PRON', { Case: 'Acc' })).toBe(true);
    expect(hasReading('la', 'le', 'DET', { Gender: 'Fem' })).toBe(true);
    expect(hasReading('la', 'le', 'PRON', { Gender: 'Fem' })).toBe(true);
  });

  it('every other elision exists as a form of the right lemma', () => {
    const cases: Array<[string, string, string]> = [
      ["qu'", 'que', 'SCONJ'], ["qu'", 'que', 'PRON'], ["j'", 'je', 'PRON'], ["n'", 'ne', 'PART'], ["d'", 'de', 'ADP'], ["c'", 'ce', 'PRON'], ["s'", 'se', 'PRON'],
      ["s'", 'si', 'SCONJ'], ["m'", 'me', 'PRON'], ["t'", 'te', 'PRON'], ["jusqu'", 'jusque', 'ADP'], ["lorsqu'", 'lorsque', 'SCONJ'],
      ["puisqu'", 'puisque', 'SCONJ'], ["quoiqu'", 'quoique', 'SCONJ'], ["ç'", 'ce', 'PRON'], ["l'", 'le', 'DET'],
    ];
    for (const [form, lemma, pos] of cases) expect(hasReading(form, lemma, pos), `${form} → ${lemma}/${pos}`).toBe(true);
  });

  it('the typographic apostrophe finds the same entries', () => {
    expect(lemmasOf('l’')).toEqual(lemmasOf("l'"));
    expect(lemmasOf('qu’')).toContain('que');
  });

  it('the euphonic t has no meaning and is its own particle', () => {
    expect(hasReading('t', 't', 'PART')).toBe(true);
    expect(lex.find('t', 'PART')!.gloss).toMatch(/no meaning/u);
  });
});

describe('French lexicon: the closed classes', () => {
  it('du and des each have at least two readings: the contraction and the article', () => {
    for (const w of ['du', 'des']) {
      const kinds = new Set(readings(w).map((h) => `${h.entry.pos}:${h.entry.lemma}`));
      expect(kinds.size, w).toBeGreaterThanOrEqual(2);
    }
    expect(hasReading('du', 'du', 'ADP')).toBe(true);
    expect(hasReading('du', 'du', 'DET', { PronType: 'Part' })).toBe(true);
    expect(hasReading('des', 'des', 'ADP')).toBe(true);
    expect(hasReading('des', 'un', 'DET', { Definite: 'Ind', Number: 'Plur' })).toBe(true);
    expect(hasReading('des', 'du', 'DET', { PronType: 'Part' })).toBe(true);
  });

  it('au, aux, du and des carry their halves as components', () => {
    const comp = (l: string) => lex.find(l, 'ADP')!.notes?.components;
    expect(comp('au')).toEqual(['à', 'le']);
    expect(comp('aux')).toEqual(['à', 'les']);
    expect(comp('du')).toEqual(['de', 'le']);
    expect(comp('des')).toEqual(['de', 'les']);
    expect(lex.find('duquel', 'PRON')!.notes?.components).toEqual(['de', 'lequel']);
    expect(lex.find('auxquelles', 'PRON')!.notes?.components).toEqual(['à', 'lesquelles']);
  });

  it('plus has both its readings, and the negation is complete', () => {
    const forms = lex.find('plus', 'ADV')!.forms;
    expect(forms.some((f) => f.morph.Polarity === 'Neg')).toBe(true);
    expect(forms.some((f) => f.morph.Polarity === undefined)).toBe(true);
    expect(hasReading('ne', 'ne', 'PART', { Polarity: 'Neg' })).toBe(true);
    for (const w of ['pas', 'jamais', 'point', 'guère']) expect(hasReading(w, w, 'ADV', { Polarity: 'Neg' }), w).toBe(true);
    for (const w of ['rien', 'personne', 'aucun']) expect(hasReading(w, w, 'PRON', { Polarity: 'Neg' }), w).toBe(true);
  });

  const must: Record<string, string[]> = {
    DET: ['le', 'la', 'les', 'un', 'une', 'des', 'du', 'ce', 'cet', 'cette', 'ces', 'mon', 'ma', 'mes', 'ton', 'ta', 'tes', 'son', 'sa', 'ses', 'notre', 'nos', 'votre', 'vos', 'leur', 'leurs',
      'quel', 'quelle', 'quels', 'quelles', 'quelque', 'quelques', 'chaque', 'aucun', 'aucune', 'nul', 'nulle', 'plusieurs', 'certain', 'certaines', 'tout', 'toute', 'tous', 'toutes', 'même', 'mêmes',
      'autre', 'autres', 'tel', 'telle', 'tels', 'telles'],
    PRON: ['je', 'tu', 'il', 'elle', 'on', 'nous', 'vous', 'ils', 'elles', 'me', 'te', 'se', 'le', 'la', 'les', 'lui', 'leur', 'y', 'en', 'moi', 'toi', 'soi', 'eux', 'moi-même', 'toi-même', 'lui-même',
      'elle-même', 'soi-même', 'nous-mêmes', 'vous-mêmes', 'eux-mêmes', 'elles-mêmes', 'ce', 'ceci', 'cela', 'ça', 'celui', 'celle', 'ceux', 'celles', 'celui-ci', 'celui-là', 'celle-ci', 'celle-là',
      'ceux-ci', 'ceux-là', 'celles-ci', 'celles-là', 'mien', 'mienne', 'miens', 'miennes', 'tien', 'sien', 'nôtre', 'nôtres', 'vôtre', 'vôtres', 'leur', 'qui', 'que', 'quoi', 'dont', 'lequel',
      'laquelle', 'lesquels', 'lesquelles', 'auquel', 'auxquels', 'auxquelles', 'duquel', 'desquels', 'desquelles', "quelqu'un", "quelqu'une", 'quelques-uns', 'quelques-unes', 'chacun', 'chacune',
      'personne', 'rien', 'tout', 'tous', 'plusieurs', 'autrui', 'quiconque'],
    ADP: ['à', 'de', 'en', 'dans', 'sur', 'sous', 'avec', 'sans', 'pour', 'par', 'chez', 'vers', 'entre', 'contre', 'depuis', 'pendant', 'avant', 'après', 'devant', 'derrière', 'jusque', 'dès', 'parmi',
      'selon', 'sauf', 'malgré', 'envers', 'hors', 'outre', 'durant', 'suivant', 'concernant', 'au', 'aux', 'du', 'des', 'par-dessus', 'par-dessous', 'vis-à-vis', 'au-dessus', 'au-dessous'],
    CONJ: ['et', 'ou', 'mais', 'donc', 'or', 'ni', 'car', 'soit'],
    SCONJ: ['que', 'si', 'quand', 'comme', 'lorsque', 'puisque', 'quoique', 'parce', 'tandis', 'afin', 'pourvu'],
    ADV: ['pas', 'plus', 'jamais', 'point', 'guère', 'où', 'comment', 'pourquoi', 'combien', 'quand', 'loin', 'près', 'autour', 'ainsi', 'alors', 'puis', 'ensuite', 'enfin', 'sinon', 'pourtant',
      'cependant', 'néanmoins', 'toutefois', 'très', 'bien', 'mal', 'peu', 'beaucoup', 'trop', 'assez', 'aussi', 'encore', 'déjà', 'toujours', 'souvent', 'ici', 'là', 'là-bas', 'ailleurs', 'partout',
      'maintenant', "aujourd'hui", 'hier', 'demain', 'bientôt', 'tôt', 'tard', 'vite', 'ensemble', 'seulement', 'vraiment', 'presque', 'plutôt', 'surtout', 'même', 'peut-être'],
    PART: ['ne', 't', 'voici', 'voilà'],
    NUM: ['zéro', 'un', 'une', 'deux', 'trois', 'quatre', 'cinq', 'six', 'sept', 'huit', 'neuf', 'dix', 'onze', 'douze', 'treize', 'quatorze', 'quinze', 'seize', 'dix-sept', 'dix-huit', 'dix-neuf', 'vingt',
      'trente', 'quarante', 'cinquante', 'soixante', 'soixante-dix', 'quatre-vingts', 'quatre-vingt', 'quatre-vingt-dix', 'cent', 'cents', 'mille', 'million', 'milliard', 'vingt-deux', 'soixante-quinze',
      'quatre-vingt-quatorze', 'septante', 'huitante', 'nonante'],
    ADJ: ['premier', 'première', 'deuxième', 'second', 'seconde', 'troisième', 'quatrième', 'cinquième', 'dixième', 'dernier', 'dernière'],
    INTJ: ['oui', 'non', 'si', 'bonjour', 'bonsoir', 'salut', 'merci', 'pardon', 'voilà', 'voici', 'hélas', 'ah', 'oh', 'eh', 'bah', 'hein', 'euh', 'tiens', 'allô', 'adieu', 'bravo', 'zut', 'chut'],
  };
  for (const [pos, words] of Object.entries(must)) {
    it(`${pos}: ${words.length} words are present`, () => {
      expect(words.filter((w) => !readings(w).some((h) => h.entry.pos === pos))).toEqual([]);
    });
  }

  it('Belgian and Swiss numerals carry their variety', () => {
    expect(annotations.get(annotationKey('septante', 'NUM'))?.varieties).toEqual(['fr-BE', 'fr-CH']);
    expect(annotations.get(annotationKey('nonante', 'NUM'))?.varieties).toEqual(['fr-BE', 'fr-CH']);
    expect(annotations.get(annotationKey('huitante', 'NUM'))?.varieties).toEqual(['fr-CH']);
    expect(annotations.get(annotationKey('soixante-dix', 'NUM'))?.varieties).toBeUndefined();
  });

  it('articles, pronouns and determiners carry gender, number, person and case', () => {
    expect(hasReading('les', 'le', 'DET', { Definite: 'Def', Number: 'Plur', PronType: 'Art' })).toBe(true);
    expect(hasReading('une', 'un', 'DET', { Definite: 'Ind', Gender: 'Fem', Number: 'Sing' })).toBe(true);
    expect(hasReading('elle', 'elle', 'PRON', { Person: '3', Gender: 'Fem', Case: 'Nom' })).toBe(true);
    expect(hasReading('nous', 'nous', 'PRON', { Person: '1', Number: 'Plur', Case: 'Nom' })).toBe(true);
    expect(hasReading('nous', 'nous', 'PRON', { Reflex: 'Yes' })).toBe(true);
    expect(hasReading('se', 'se', 'PRON', { Reflex: 'Yes', Person: '3' })).toBe(true);
    expect(hasReading('lui', 'lui', 'PRON', { Case: 'Dat' })).toBe(true);
    expect(hasReading('leur', 'leur', 'PRON', { Case: 'Dat', Number: 'Plur' })).toBe(true);
    expect(hasReading('leur', 'leur', 'DET', { Poss: 'Yes' })).toBe(true);
    expect(hasReading('leur', 'leur', 'PRON', { Poss: 'Yes' })).toBe(true);
    expect(hasReading('cette', 'ce', 'DET', { PronType: 'Dem', Gender: 'Fem' })).toBe(true);
    expect(hasReading('mes', 'mon', 'DET', { Poss: 'Yes', Number: 'Plur' })).toBe(true);
    expect(hasReading('quelles', 'quel', 'DET', { PronType: 'Int', Gender: 'Fem', Number: 'Plur' })).toBe(true);
    expect(hasReading('que', 'que', 'PRON', { PronType: 'Rel' })).toBe(true);
    expect(hasReading('moi', 'moi', 'PRON', { Stress: 'Yes' })).toBe(true);
  });

  it('le, la and les are the article AND the pronoun; en is the pronoun AND the preposition', () => {
    for (const w of ['le', 'la', 'les']) {
      expect(readings(w).some((h) => h.entry.pos === 'DET'), `${w} DET`).toBe(true);
      expect(readings(w).some((h) => h.entry.pos === 'PRON'), `${w} PRON`).toBe(true);
    }
    expect(hasReading('en', 'en', 'PRON')).toBe(true);
    expect(hasReading('en', 'en', 'ADP')).toBe(true);
  });
});

describe('French lexicon: être, avoir and aller', () => {
  const fin = (extra: Record<string, string>) => ({ VerbForm: 'Fin', ...extra });
  const checks: Array<[string, string, string, Record<string, string>]> = [
    ['suis', 'être', 'AUX', fin({ Person: '1', Number: 'Sing', Tense: 'Pres', Mood: 'Ind' })],
    ['es', 'être', 'AUX', fin({ Person: '2', Number: 'Sing', Tense: 'Pres', Mood: 'Ind' })],
    ['est', 'être', 'AUX', fin({ Person: '3', Number: 'Sing', Tense: 'Pres', Mood: 'Ind' })],
    ['sommes', 'être', 'AUX', fin({ Person: '1', Number: 'Plur', Tense: 'Pres' })],
    ['êtes', 'être', 'AUX', fin({ Person: '2', Number: 'Plur', Tense: 'Pres' })],
    ['sont', 'être', 'AUX', fin({ Person: '3', Number: 'Plur', Tense: 'Pres' })],
    ['étais', 'être', 'AUX', fin({ Person: '1', Tense: 'Imp', Mood: 'Ind' })],
    ['fus', 'être', 'AUX', fin({ Person: '1', Tense: 'Past', Mood: 'Ind' })],
    ['fut', 'être', 'AUX', fin({ Person: '3', Number: 'Sing', Tense: 'Past', Mood: 'Ind' })],
    ['furent', 'être', 'AUX', fin({ Person: '3', Number: 'Plur', Tense: 'Past', Mood: 'Ind' })],
    ['serai', 'être', 'AUX', fin({ Person: '1', Tense: 'Fut', Mood: 'Ind' })],
    ['serais', 'être', 'AUX', fin({ Person: '1', Mood: 'Cnd', Tense: 'Pres' })],
    ['sois', 'être', 'AUX', fin({ Person: '2', Mood: 'Sub', Tense: 'Pres' })],
    ['soit', 'être', 'AUX', fin({ Person: '3', Mood: 'Sub', Tense: 'Pres' })],
    ['soyons', 'être', 'AUX', fin({ Person: '1', Number: 'Plur', Mood: 'Imp' })],
    ['fût', 'être', 'AUX', fin({ Person: '3', Mood: 'Sub', Tense: 'Imp' })],
    ['été', 'être', 'AUX', { VerbForm: 'Part', Tense: 'Past' }],
    ['étant', 'être', 'AUX', { VerbForm: 'Part', Tense: 'Pres' }],
    ['ai', 'avoir', 'AUX', fin({ Person: '1', Number: 'Sing', Tense: 'Pres', Mood: 'Ind' })],
    ['as', 'avoir', 'AUX', fin({ Person: '2', Number: 'Sing', Tense: 'Pres' })],
    ['a', 'avoir', 'AUX', fin({ Person: '3', Number: 'Sing', Tense: 'Pres' })],
    ['avons', 'avoir', 'AUX', fin({ Person: '1', Number: 'Plur', Tense: 'Pres' })],
    ['avez', 'avoir', 'AUX', fin({ Person: '2', Number: 'Plur', Tense: 'Pres' })],
    ['ont', 'avoir', 'AUX', fin({ Person: '3', Number: 'Plur', Tense: 'Pres' })],
    ['eus', 'avoir', 'AUX', fin({ Person: '1', Tense: 'Past', Mood: 'Ind' })],
    ['eut', 'avoir', 'AUX', fin({ Person: '3', Tense: 'Past', Mood: 'Ind' })],
    ['aurai', 'avoir', 'AUX', fin({ Person: '1', Tense: 'Fut' })],
    ['aie', 'avoir', 'AUX', fin({ Person: '1', Mood: 'Sub', Tense: 'Pres' })],
    ['ait', 'avoir', 'AUX', fin({ Person: '3', Mood: 'Sub', Tense: 'Pres' })],
    ['eût', 'avoir', 'AUX', fin({ Person: '3', Mood: 'Sub', Tense: 'Imp' })],
    ['eu', 'avoir', 'AUX', { VerbForm: 'Part', Tense: 'Past', Gender: 'Masc', Number: 'Sing' }],
    ['ayant', 'avoir', 'AUX', { VerbForm: 'Part', Tense: 'Pres' }],
    ['vais', 'aller', 'VERB', fin({ Person: '1', Number: 'Sing', Tense: 'Pres', Mood: 'Ind' })],
    ['vas', 'aller', 'VERB', fin({ Person: '2', Number: 'Sing', Tense: 'Pres' })],
    ['va', 'aller', 'VERB', fin({ Person: '3', Number: 'Sing', Tense: 'Pres' })],
    ['allons', 'aller', 'VERB', fin({ Person: '1', Number: 'Plur', Tense: 'Pres' })],
    ['allez', 'aller', 'VERB', fin({ Person: '2', Number: 'Plur', Tense: 'Pres' })],
    ['vont', 'aller', 'VERB', fin({ Person: '3', Number: 'Plur', Tense: 'Pres' })],
    ['irai', 'aller', 'VERB', fin({ Person: '1', Tense: 'Fut', Mood: 'Ind' })],
    ['aille', 'aller', 'VERB', fin({ Person: '1', Mood: 'Sub', Tense: 'Pres' })],
    ['allé', 'aller', 'VERB', { VerbForm: 'Part', Tense: 'Past', Gender: 'Masc', Number: 'Sing' }],
  ];
  for (const [form, lemma, pos, feats] of checks) {
    it(`${form} is a form of ${lemma} (${JSON.stringify(feats)})`, () => {
      expect(hasReading(form, lemma, pos, feats)).toBe(true);
    });
  }

  it('each paradigm holds every simple tense: forms for je tu il nous vous ils in six tenses and moods, the imperative and the participles', () => {
    const count = (l: string, pos: 'AUX' | 'VERB') => lex.find(l, pos)!.forms.length;
    expect(count('être', 'AUX')).toBe(1 + 6 * 7 + 3 + 2);
    expect(count('avoir', 'AUX')).toBe(1 + 6 * 7 + 3 + 1 + 4);
    expect(count('aller', 'VERB')).toBe(1 + 6 * 7 + 3 + 1 + 4);
    expect(hasReading('être', 'être', 'AUX', { VerbForm: 'Inf' })).toBe(true);
    expect(hasReading('serions', 'être', 'AUX', { Mood: 'Cnd', Person: '1', Number: 'Plur' })).toBe(true);
    expect(hasReading('fussiez', 'être', 'AUX', { Mood: 'Sub', Tense: 'Imp', Person: '2' })).toBe(true);
    expect(hasReading('eussent', 'avoir', 'AUX', { Mood: 'Sub', Tense: 'Imp', Person: '3', Number: 'Plur' })).toBe(true);
    expect(hasReading('allassions', 'aller', 'VERB', { Mood: 'Sub', Tense: 'Imp', Person: '1' })).toBe(true);
    expect(hasReading('ayez', 'avoir', 'AUX', { Mood: 'Imp', Person: '2', Number: 'Plur' })).toBe(true);
    expect(hasReading('va', 'aller', 'VERB', { Mood: 'Imp', Person: '2' })).toBe(true);
  });
});

describe('French lexicon: varieties', () => {
  it('every variety tag used in a row is a known code, and each code is defined', () => {
    const used = new Set(allRows.flatMap((r) => r.varieties));
    for (const code of used) expect(FR_VARIETY_CODES).toContain(code);
    for (const code of FR_VARIETY_CODES) expect(FR_VARIETIES[code].code).toBe(code);
    for (const code of Object.values(FR_LABEL_VARIETIES)) expect(FR_VARIETY_CODES).toContain(code);
    for (const key of Object.keys(FR_LABEL_VARIETIES)) expect(key).toBe(key.toLowerCase());
  });

  it('the seven varieties are defined with their kind', () => {
    expect(Object.keys(FR_VARIETIES).sort()).toEqual(['fr-BE', 'fr-CA', 'fr-CH', 'fr-FR', 'fr-africa', 'fr-hist', 'fr-louisiana']);
    expect(FR_VARIETIES['fr-africa'].kind).toBe('supranational');
    expect(FR_VARIETIES['fr-hist'].kind).toBe('historical');
    expect(FR_VARIETIES['fr-CA'].label).toMatch(/Canada/u);
  });

  it('region labels map to exactly the region they name, and nothing that is not a region', () => {
    expect(FR_LABEL_VARIETIES.quebec).toBe('fr-CA');
    expect(FR_LABEL_VARIETIES.belgium).toBe('fr-BE');
    expect(FR_LABEL_VARIETIES.switzerland).toBe('fr-CH');
    expect(FR_LABEL_VARIETIES.louisiana).toBe('fr-louisiana');
    expect(FR_LABEL_VARIETIES.france).toBe('fr-FR');
    expect(FR_LABEL_VARIETIES.africa).toBe('fr-africa');
    for (const usage of ['slang', 'obsolete', 'dated', 'colloquial', 'informal', 'figuratively', 'archaic', 'literary', 'vulgar']) expect(FR_LABEL_VARIETIES[usage], usage).toBeUndefined();
    // a label for a place with no code of its own is not widened to a bigger one
    for (const wide of ['north-america', 'europe', 'luxembourg', 'antilles']) expect(FR_LABEL_VARIETIES[wide], wide).toBeUndefined();
  });
});
