/**
 * A stand-in for the Spanish morphology engine (src/adapters/spanish/morphology.ts is owned by another package):
 * a small table of forms with the readings a real engine gives them. The adapter tests that must not depend on the
 * engine mock the module with this file. `lemmaKnown` and the confidence follow the engine's contract: a lemma
 * confirmed by `knownLemma` is 0.85, an inferred one 0.5.
 */
import type { PartOfSpeech, WordPart } from '../../src/core';

interface Reading { lemma: string; pos: PartOfSpeech; morph: Record<string, string>; varieties?: string[]; parts?: WordPart[]; rule: string; afterFinite?: boolean }
type KnownLemma = (lemma: string, pos?: PartOfSpeech) => boolean;

const V = (lemma: string, morph: Record<string, string>, extra: Partial<Reading> = {}): Reading =>
  ({ lemma, pos: 'VERB', morph, rule: `double: ${lemma} ${JSON.stringify(morph)}`, ...extra });
const fin = (Person: string, Number: string, Tense: string, Mood = 'Ind') => ({ VerbForm: 'Fin', Mood, Tense, Person, Number });

const TABLE: Record<string, Reading[]> = {
  voy: [V('ir', fin('1', 'Sing', 'Pres'))],
  vas: [V('ir', fin('2', 'Sing', 'Pres'))],
  va: [V('ir', fin('3', 'Sing', 'Pres'))],
  vamos: [V('ir', fin('1', 'Plur', 'Pres'))],
  comiendo: [V('comer', { VerbForm: 'Ger' })],
  estudiando: [V('estudiar', { VerbForm: 'Ger' })],
  comido: [V('comer', { VerbForm: 'Part', Gender: 'Masc', Number: 'Sing' })],
  hablado: [V('hablar', { VerbForm: 'Part', Gender: 'Masc', Number: 'Sing' })],
  habla: [V('hablar', fin('3', 'Sing', 'Pres'))],
  hablan: [V('hablar', fin('3', 'Plur', 'Pres'))],
  hablamos: [V('hablar', fin('1', 'Plur', 'Pres')), V('hablar', fin('1', 'Plur', 'Past', 'Ind'))],
  llevo: [V('llevar', fin('1', 'Sing', 'Pres'))],
  acabo: [V('acabar', fin('1', 'Sing', 'Pres'))],
  acabé: [V('acabar', fin('1', 'Sing', 'Past'))],
  gusta: [V('gustar', fin('3', 'Sing', 'Pres'))],
  encanta: [V('encantar', fin('3', 'Sing', 'Pres'))],
  tuviera: [V('tener', fin('1,3', 'Sing', 'Imp', 'Sub'))],
  viajaría: [V('viajar', fin('1,3', 'Sing', 'Pres', 'Cnd'))],
  llueva: [V('llover', fin('3', 'Sing', 'Pres', 'Sub'))],
  llegues: [V('llegar', fin('2', 'Sing', 'Pres', 'Sub'))],
  entiendas: [V('entender', fin('2', 'Sing', 'Pres', 'Sub'))],
  vengas: [V('venir', fin('2', 'Sing', 'Pres', 'Sub'))],
  hubiéramos: [V('haber', fin('1', 'Plur', 'Imp', 'Sub'), { pos: 'AUX' })],
  dijo: [V('decir', fin('3', 'Sing', 'Past'))],
  dijeron: [V('decir', fin('3', 'Plur', 'Past'))],
  tenés: [V('tener', fin('2', 'Sing', 'Pres'), { varieties: ['voseo'] })],
  hablás: [V('hablar', fin('2', 'Sing', 'Pres'), { varieties: ['voseo'] })],
  tenéis: [V('tener', fin('2', 'Plur', 'Pres'), { varieties: ['vosotros'] })],
  hablad: [V('hablar', { VerbForm: 'Fin', Mood: 'Imp', Person: '2', Number: 'Plur' }, { varieties: ['vosotros'] })],
  cuenta: [V('contar', fin('3', 'Sing', 'Pres'))],
  decírselo: [V('decir', { VerbForm: 'Inf' }, {
    parts: [
      { text: 'decír', start: 0, end: 5, lemma: 'decir', pos: 'VERB', morph: { VerbForm: 'Inf' } },
      { text: 'se', start: 5, end: 7, lemma: 'se', pos: 'PRON', role: 'indirect object pronoun' },
      { text: 'lo', start: 7, end: 9, lemma: 'lo', pos: 'PRON', role: 'direct object pronoun' },
    ],
  })],
  comprarlo: [V('comprar', { VerbForm: 'Inf' }, { parts: [
    { text: 'comprar', start: 0, end: 7, lemma: 'comprar', pos: 'VERB' },
    { text: 'lo', start: 7, end: 9, lemma: 'lo', pos: 'PRON', role: 'direct object pronoun' },
  ] })],
  dámelo: [V('dar', { VerbForm: 'Fin', Mood: 'Imp', Person: '2', Number: 'Sing' }, { parts: [
    { text: 'dá', start: 0, end: 2, lemma: 'dar', pos: 'VERB', morph: { VerbForm: 'Fin', Mood: 'Imp', Person: '2', Number: 'Sing' } },
    { text: 'me', start: 2, end: 4, lemma: 'me', pos: 'PRON', role: 'indirect object pronoun' },
    { text: 'lo', start: 4, end: 6, lemma: 'lo', pos: 'PRON', role: 'direct object pronoun' },
  ] })],
  // a pronoun after a conjugated verb, as the engine gives it (afterFinite)
  díjole: [V('decir', fin('3', 'Sing', 'Past'), { afterFinite: true, parts: [
    { text: 'díjo', start: 0, end: 4, lemma: 'decir', pos: 'VERB', morph: fin('3', 'Sing', 'Past') },
    { text: 'le', start: 4, end: 6, lemma: 'le', pos: 'PRON', role: 'object pronoun' },
  ] })],
  hallábase: [V('hallar', fin('3', 'Sing', 'Imp'), { afterFinite: true, parts: [
    { text: 'hallába', start: 0, end: 7, lemma: 'hallar', pos: 'VERB', morph: fin('3', 'Sing', 'Imp') },
    { text: 'se', start: 7, end: 9, lemma: 'se', pos: 'PRON', role: 'reflexive' },
  ] })],
  // a word the engine can only guess at: a lemma that is not in the word list
  zapatear: [V('zapatear', { VerbForm: 'Inf' })],
  alta: [{ lemma: 'alto', pos: 'ADJ', morph: { Gender: 'Fem', Number: 'Sing' }, rule: 'double: feminine' }],
  cansada: [{ lemma: 'cansado', pos: 'ADJ', morph: { Gender: 'Fem', Number: 'Sing' }, rule: 'double: feminine' }],
  cansado: [{ lemma: 'cansado', pos: 'ADJ', morph: { Gender: 'Masc', Number: 'Sing' }, rule: 'double: masculine' }],
  di: [V('dar', fin('1', 'Sing', 'Past'))],
  manejo: [V('manejar', fin('1', 'Sing', 'Pres'))],
  como: [V('comer', fin('1', 'Sing', 'Pres'))],
  para: [V('parar', fin('3', 'Sing', 'Pres'))],
  fue: [V('ser', fin('3', 'Sing', 'Past'), { pos: 'AUX' }), V('ir', fin('3', 'Sing', 'Past'))],
  dio: [V('dar', fin('3', 'Sing', 'Past'))],
  casa: [V('casar', fin('3', 'Sing', 'Pres'))],
  libros: [{ lemma: 'libro', pos: 'NOUN', morph: { Gender: 'Masc', Number: 'Plur' }, rule: 'double: regular plural' }],
  grandes: [{ lemma: 'grande', pos: 'ADJ', morph: { Number: 'Plur' }, rule: 'double: regular plural' }],
  buena: [{ lemma: 'bueno', pos: 'ADJ', morph: { Gender: 'Fem', Number: 'Sing' }, rule: 'double: feminine' }],
  tardes: [{ lemma: 'tarde', pos: 'NOUN', morph: { Gender: 'Fem', Number: 'Plur' }, rule: 'double: regular plural' }],
};

export function analyzeSpanishForm(form: string, opts?: { knownLemma?: KnownLemma }) {
  const known: KnownLemma = opts?.knownLemma ?? (() => false);
  return (TABLE[form] ?? []).map((r) => {
    const lemmaKnown = known(r.lemma, r.pos);
    return { ...r, parts: r.parts?.map((p) => ({ ...p })), lemmaKnown, confidence: lemmaKnown ? 0.85 : 0.5 };
  }).sort((a, b) => b.confidence - a.confidence);
}

export function describeSpanishMorph(morph: Record<string, string>): string {
  return `double: ${Object.entries(morph).map(([k, v]) => `${k}=${v}`).join(' ')}`;
}

export function conjugateSpanish(): undefined {
  return undefined;
}
