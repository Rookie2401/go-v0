/**
 * Coordinator's independent table for the Spanish morphology engine (not written by the package that built it).
 *
 * Each row: a written form, the lemma, and features the right reading must carry. The engine is told which lemmas
 * exist (as the adapter's lexicon would); a correct reading must then be confident (≥ 0.8). Rows marked ambiguous
 * must return every listed reading and none of them above 0.75. A form whose lemma is unknown may be analysed by
 * rule but never confidently. Features are UD style: Mood Ind/Sub/Imp/Cnd, Tense Pres/Imp/Past/Fut,
 * VerbForm Inf/Ger/Part, Person 1/2/3, Number Sing/Plur, Gender Masc/Fem.
 */
import { describe, expect, it } from 'vitest';
import { analyzeSpanishForm, conjugateSpanish, describeSpanishMorph } from '../../src/adapters/spanish/morphology';

const F = (s: string): Record<string, string> => {
  const m: Record<string, string> = {};
  for (const w of s.split(/\s+/).filter(Boolean)) {
    if (['Ind', 'Sub', 'Imp_', 'Cnd'].includes(w)) m.Mood = w === 'Imp_' ? 'Imp' : w;
    else if (['Pres', 'Imp', 'Past', 'Fut'].includes(w)) m.Tense = w;
    else if (['Inf', 'Ger', 'Part'].includes(w)) m.VerbForm = w;
    else if (['1', '2', '3'].includes(w)) m.Person = w;
    else if (['Sing', 'Plur'].includes(w)) m.Number = w;
    else if (['Masc', 'Fem'].includes(w)) m.Gender = w;
    else throw new Error(`bad feature ${w}`);
  }
  return m;
};
// "Imp" alone is the imperfect TENSE; the imperative MOOD is written "Imp_".

const VERBS = `
hablo|hablar|Ind Pres 1 Sing
hablas|hablar|Ind Pres 2 Sing
hablaban|hablar|Ind Imp 3 Plur
hablé|hablar|Ind Past 1 Sing
habló|hablar|Ind Past 3 Sing
hablaré|hablar|Ind Fut 1 Sing
hablaríamos|hablar|Cnd 1 Plur
habláramos|hablar|Sub Imp 1 Plur
hablasen|hablar|Sub Imp 3 Plur
hablando|hablar|Ger
hablado|hablar|Part Masc Sing
habladas|hablar|Part Fem Plur
comí|comer|Ind Past 1 Sing
comió|comer|Ind Past 3 Sing
comían|comer|Ind Imp 3 Plur
comeremos|comer|Ind Fut 1 Plur
comiendo|comer|Ger
vivieron|vivir|Ind Past 3 Plur
pienso|pensar|Ind Pres 1 Sing
piensan|pensar|Ind Pres 3 Plur
vuelvo|volver|Ind Pres 1 Sing
pidió|pedir|Ind Past 3 Sing
pidiendo|pedir|Ger
duermo|dormir|Ind Pres 1 Sing
durmió|dormir|Ind Past 3 Sing
durmiendo|dormir|Ger
juego|jugar|Ind Pres 1 Sing
jugué|jugar|Ind Past 1 Sing
sintió|sentir|Ind Past 3 Sing
busqué|buscar|Ind Past 1 Sing
llegué|llegar|Ind Past 1 Sing
empecé|empezar|Ind Past 1 Sing
conozco|conocer|Ind Pres 1 Sing
conduzco|conducir|Ind Pres 1 Sing
construyó|construir|Ind Past 3 Sing
leyó|leer|Ind Past 3 Sing
leyendo|leer|Ger
sigo|seguir|Ind Pres 1 Sing
escojo|escoger|Ind Pres 1 Sing
envío|enviar|Ind Pres 1 Sing
continúa|continuar|Ind Pres 3 Sing
soy|ser|Ind Pres 1 Sing
eres|ser|Ind Pres 2 Sing
somos|ser|Ind Pres 1 Plur
era|ser|Ind Imp
siendo|ser|Ger
sido|ser|Part
estoy|estar|Ind Pres 1 Sing
estuvo|estar|Ind Past 3 Sing
esté|estar|Sub Pres
he|haber|Ind Pres 1 Sing
hemos|haber|Ind Pres 1 Plur
había|haber|Ind Imp
hubo|haber|Ind Past 3 Sing
haya|haber|Sub Pres
hubiéramos|haber|Sub Imp 1 Plur
habrá|haber|Ind Fut 3 Sing
tengo|tener|Ind Pres 1 Sing
tiene|tener|Ind Pres 3 Sing
tuvo|tener|Ind Past 3 Sing
tendré|tener|Ind Fut 1 Sing
tenga|tener|Sub Pres
tuviera|tener|Sub Imp
voy|ir|Ind Pres 1 Sing
vamos|ir|Ind Pres 1 Plur
iba|ir|Ind Imp
vaya|ir|Sub Pres
yendo|ir|Ger
hago|hacer|Ind Pres 1 Sing
hizo|hacer|Ind Past 3 Sing
hice|hacer|Ind Past 1 Sing
haré|hacer|Ind Fut 1 Sing
hecho|hacer|Part Masc Sing
digo|decir|Ind Pres 1 Sing
dijo|decir|Ind Past 3 Sing
dijeron|decir|Ind Past 3 Plur
diré|decir|Ind Fut 1 Sing
dicho|decir|Part Masc Sing
diciendo|decir|Ger
puedo|poder|Ind Pres 1 Sing
pudo|poder|Ind Past 3 Sing
podrá|poder|Ind Fut 3 Sing
quiero|querer|Ind Pres 1 Sing
quiso|querer|Ind Past 3 Sing
supo|saber|Ind Past 3 Sing
sepa|saber|Sub Pres
vengo|venir|Ind Pres 1 Sing
vendrá|venir|Ind Fut 3 Sing
pongo|poner|Ind Pres 1 Sing
puso|poner|Ind Past 3 Sing
puesto|poner|Part Masc Sing
salgo|salir|Ind Pres 1 Sing
saldrá|salir|Ind Fut 3 Sing
doy|dar|Ind Pres 1 Sing
dio|dar|Ind Past 3 Sing
veo|ver|Ind Pres 1 Sing
vio|ver|Ind Past 3 Sing
visto|ver|Part Masc Sing
veía|ver|Ind Imp
traigo|traer|Ind Pres 1 Sing
trajo|traer|Ind Past 3 Sing
cayó|caer|Ind Past 3 Sing
oigo|oír|Ind Pres 1 Sing
oyó|oír|Ind Past 3 Sing
anduvo|andar|Ind Past 3 Sing
cupo|caber|Ind Past 3 Sing
`;

/** form | lemma | features | variety tag the reading must carry */
const VARIETY = `
tenés|tener|Ind Pres 2 Sing|voseo
hablás|hablar|Ind Pres 2 Sing|voseo
querés|querer|Ind Pres 2 Sing|voseo
podés|poder|Ind Pres 2 Sing|voseo
sos|ser|Ind Pres 2 Sing|voseo
tenéis|tener|Ind Pres 2 Plur|vosotros
habláis|hablar|Ind Pres 2 Plur|vosotros
sois|ser|Ind Pres 2 Plur|vosotros
habéis|haber|Ind Pres 2 Plur|vosotros
hablasteis|hablar|Ind Past 2 Plur|vosotros
hablad|hablar|Imp_ 2 Plur|vosotros
dijéremos|decir|Sub Fut 1 Plur|es-hist
confesáremos|confesar|Sub Fut 1 Plur|es-hist
`;

/** form | verb lemma | verb features | the attached pronouns in order */
const CLITICS = `
decírselo|decir|Inf|se lo
dámelo|dar|Imp_ 2 Sing|me lo
diciéndole|decir|Ger|le
vámonos|ir|1 Plur|nos
levantarse|levantar|Inf|se
verlo|ver|Inf|lo
dárselas|dar|Inf|se las
cállate|callar|Imp_ 2 Sing|te
dígame|decir|3 Sing|me
comprándolo|comprar|Ger|lo
`;

/** form | lemma | pos | features */
const NOMINALS = `
casas|casa|NOUN|Plur
libros|libro|NOUN|Plur
luces|luz|NOUN|Plur
jóvenes|joven|ADJ|Plur
ciudades|ciudad|NOUN|Plur
lápices|lápiz|NOUN|Plur
corazones|corazón|NOUN|Plur
buena|bueno|ADJ|Fem Sing
buenas|bueno|ADJ|Fem Plur
grandes|grande|ADJ|Plur
felices|feliz|ADJ|Plur
`;

/** form → every reading that must be present, as lemma:features */
const AMBIGUOUS: Array<[string, string[]]> = [
  ['hablamos', ['hablar:Ind Pres 1 Plur', 'hablar:Ind Past 1 Plur']],
  ['vivimos', ['vivir:Ind Pres 1 Plur', 'vivir:Ind Past 1 Plur']],
  ['fue', ['ser:Ind Past 3 Sing', 'ir:Ind Past 3 Sing']],
  ['fui', ['ser:Ind Past 1 Sing', 'ir:Ind Past 1 Sing']],
  ['fuera', ['ser:Sub Imp', 'ir:Sub Imp']],
  ['hable', ['hablar:Sub Pres 1 Sing', 'hablar:Sub Pres 3 Sing']],
  ['ve', ['ver:Ind Pres 3 Sing', 'ir:Imp_ 2 Sing']],
];

const rows = (s: string) => s.trim().split('\n').map((l) => l.split('|').map((x) => x.trim()));
const LEMMAS = new Set([
  ...rows(VERBS).map((r) => r[1]), ...rows(VARIETY).map((r) => r[1]), ...rows(CLITICS).map((r) => r[1]), ...rows(NOMINALS).map((r) => r[1]),
  'ser', 'ir', 'ver', 'hablar', 'vivir', 'rápido', 'lento', 'casa',
]);
const knownLemma = (lemma: string) => LEMMAS.has(lemma);
const has = (m: Record<string, string>, want: Record<string, string>) => Object.entries(want).every(([k, v]) => m[k] === v);
const show = (as: ReturnType<typeof analyzeSpanishForm>) => as.map((a) => `${a.lemma}/${a.pos}/${JSON.stringify(a.morph)}/${a.varieties ?? ''}@${a.confidence}`).join(' ; ');

describe('Spanish morphology engine — coordinator table', () => {
  it.each(rows(VERBS))('%s → %s (%s)', (form, lemma, feats) => {
    const as = analyzeSpanishForm(form, { knownLemma });
    const hit = as.find((a) => a.lemma === lemma && has(a.morph, F(feats)));
    expect(hit, `${form}: ${show(as)}`).toBeDefined();
    expect(hit!.lemmaKnown).toBe(true);
    // a unique correct reading is confident; a form with competing readings is capped (checked below)
    if (as.filter((a) => a.confidence >= 0.5).length === 1) expect(hit!.confidence, form).toBeGreaterThanOrEqual(0.8);
  });

  it.each(rows(VARIETY))('%s → %s (%s), tagged %s', (form, lemma, feats, tag) => {
    const as = analyzeSpanishForm(form, { knownLemma });
    const hit = as.find((a) => a.lemma === lemma && has(a.morph, F(feats)) && (a.varieties ?? []).includes(tag));
    expect(hit, `${form}: ${show(as)}`).toBeDefined();
  });

  it.each(rows(CLITICS))('%s = %s (%s) + %s', (form, lemma, feats, pronouns) => {
    const as = analyzeSpanishForm(form, { knownLemma });
    const hit = as.find((a) => a.lemma === lemma && has(a.morph, F(feats)) && (a.parts ?? []).length === pronouns.split(' ').length + 1);
    expect(hit, `${form}: ${show(as)}`).toBeDefined();
    const parts = hit!.parts!;
    expect(parts.slice(1).map((p) => p.text.toLowerCase())).toEqual(pronouns.split(' '));
    // the parts tile the written word exactly
    expect(parts[0].start).toBe(0);
    expect(parts.at(-1)!.end).toBe(form.length);
    for (let i = 0; i < parts.length; i++) {
      expect(form.slice(parts[i].start, parts[i].end)).toBe(parts[i].text);
      if (i > 0) expect(parts[i].start).toBe(parts[i - 1].end);
    }
    expect(parts[0].lemma).toBe(lemma);
  });

  it.each(rows(NOMINALS))('%s → %s (%s %s)', (form, lemma, pos, feats) => {
    const as = analyzeSpanishForm(form, { knownLemma });
    const hit = as.find((a) => a.lemma === lemma && a.pos === pos && has(a.morph, F(feats)));
    expect(hit, `${form}: ${show(as)}`).toBeDefined();
  });

  it.each(AMBIGUOUS)('%s keeps every reading and is not over-confident', (form, readings) => {
    const as = analyzeSpanishForm(form, { knownLemma });
    for (const r of readings) {
      const [lemma, feats] = r.split(':');
      expect(as.some((a) => a.lemma === lemma && has(a.morph, F(feats))), `${form} lacks ${r}: ${show(as)}`).toBe(true);
    }
    for (const a of as) expect(a.confidence, `${form}: ${show(as)}`).toBeLessThanOrEqual(0.75);
  });

  it('derivation: adverbs in -mente, superlatives and diminutives point to their base', () => {
    expect(analyzeSpanishForm('rápidamente', { knownLemma }).some((a) => a.lemma === 'rápido' && a.pos === 'ADV')).toBe(true);
    expect(analyzeSpanishForm('lentamente', { knownLemma }).some((a) => a.lemma === 'lento' && a.pos === 'ADV')).toBe(true);
    expect(analyzeSpanishForm('rapidísimo', { knownLemma }).some((a) => a.lemma === 'rápido')).toBe(true);
    expect(analyzeSpanishForm('casita', { knownLemma }).some((a) => a.lemma === 'casa')).toBe(true);
  });

  it('contractions are two parts', () => {
    for (const [form, a, b] of [['al', 'a', 'el'], ['del', 'de', 'el']] as const) {
      const hit = analyzeSpanishForm(form, { knownLemma }).find((x) => (x.parts ?? []).length === 2);
      expect(hit, form).toBeDefined();
      expect(hit!.parts!.map((p) => p.lemma)).toEqual([a, b]);
    }
  });

  it('a lemma nobody vouches for is never analysed confidently, and a non-word is not analysed at all', () => {
    const guess = analyzeSpanishForm('trabucaban', { knownLemma: () => false });
    for (const a of guess) { expect(a.lemmaKnown).toBe(false); expect(a.confidence).toBeLessThanOrEqual(0.6); }
    expect(guess.some((a) => a.lemma === 'trabucar' && has(a.morph, F('Ind Imp 3 Plur')))).toBe(true);
    expect(analyzeSpanishForm('xqzt', { knownLemma: () => false })).toEqual([]);
    expect(analyzeSpanishForm('', { knownLemma })).toEqual([]);
  });

  it('generates what it analyses: every form of a verb comes back to that verb', () => {
    for (const lemma of ['hablar', 'comer', 'vivir', 'tener', 'ser', 'ir', 'decir', 'pedir', 'dormir', 'conocer', 'empezar']) {
      const forms = conjugateSpanish(lemma);
      expect(forms, lemma).toBeDefined();
      expect(forms!.length, lemma).toBeGreaterThan(50);
      for (const f of forms!) {
        const as = analyzeSpanishForm(f.form, { knownLemma });
        expect(as.some((a) => a.lemma === lemma && has(a.morph, f.morph)), `${lemma}: ${f.form} ${JSON.stringify(f.morph)} ← ${show(as)}`).toBe(true);
      }
    }
  });

  it('describes a reading in plain words', () => {
    const d = describeSpanishMorph(F('Sub Imp 1 Plur')).toLowerCase();
    expect(d).toMatch(/first person/);
    expect(d).toMatch(/plural/);
    expect(d).toMatch(/imperfect subjunctive/);
  });
});
