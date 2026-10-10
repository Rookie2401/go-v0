/**
 * Spanish paradigm generation (GoLearn Linguistic Engine V2, Stage 3): the complete table of a verb, noun or adjective
 * as feature-keyed cells (`src/core/paradigm.ts`), produced ONLY from what the adapter already generates — the
 * conjugation engine (`conjugateLemma`: rules, stem-change classes, the irregular tables), `pluralsOf` and
 * `nominalForms`. Nothing here invents a form: a cell exists when the engine produced a form for its features, and the
 * features are exactly the ones the analysis puts on that form, so `cellOf(paradigm, spanishCellFeatures(...))` finds
 * the cell of any analysed form. The dictionary half (kaikki tables) is `table-tags.ts`; the merge is `mergeParadigm`.
 *
 * Conventions (documented in docs/ecosystem/linguistics/PARADIGMS-es.md):
 *  - Voseo: the vos cells have the tú cell's features plus `Variety: 'Voseo'` (the analysis marks voseo only in
 *    `varieties`; a cell needs a feature to be told from tú). Voseo is the Honduran target (es-HN), tú is the unmarked cell.
 *  - Vosotros: Person 2, Plural, noted as Spain's form. Usted / ustedes are the 3rd-person cells.
 *  - Imperative: Mood Imp; the usted / ustedes commands carry `Polite: 'Form'` (as the analysis does). The negative command
 *    is the present subjunctive and is NOT a separate cell (a note says so).
 *  - Compound tenses (haber + participle) and periphrases (ir a + infinitive, estar + gerund) are CONSTRUCTIONS, listed in
 *    `constructions` (the ids of `constructions.ts`), never cells: they are phrases, not inflected words.
 *  - Reflexive verbs (lavarse): the cells are the forms of the base verb; the clitic is in each cell's `note`, never glued.
 *  - A noun's cells carry Number; Gender appears only as `Gender: 'Fem'` on the feminine counterpart (niño / niña) when
 *    the word list has it — the masculine (the lemma's own) cells have no Gender, as in the analysis of plurals.
 *  - A cell that lacks the layout's row key sits in the row whose value is ''.
 */
import { featureKey, type GeneratedParadigm, type ParadigmLayout } from '../../core/paradigm';
import type { PartOfSpeech } from '../../core/model';
import { IRREGULAR, IRREGULAR_PARTICIPLES } from './verb-irregular';
import { stemClassOf } from './verb-stem';
import { conjugateLemma, type Conjugation } from './verbs';
import { nominalForms, pluralsOf } from './morph-nominal';
import { restress } from './morph-orth';

/** What the paradigm needs from the adapter's word list (kept out of this file so it does not import es.ts). */
export interface ParadigmContext {
  /** Is the lemma in the course word list (any of the given part of speech)? */
  known(lemma: string, pos: PartOfSpeech): boolean;
  /** The Gender the word list gives the lemma ('Masc', 'Fem', or a comma list 'Fem,Masc' for a noun of both), if any. */
  genderOf(lemma: string, pos: PartOfSpeech): string | undefined;
}

type Cell = { features: Record<string, string>; form: string; note?: string };

/** The construction ids (constructions.ts keys) a verb's table points to instead of cells. */
export const VERB_CONSTRUCTIONS: readonly string[] = ['perfect-tense', 'ir-a-infinitive', 'estar-gerund'];

const NUM = ['Sing', 'Plur'] as const;
const PERSONS = ['1', '2', '3'] as const;

// ---------------------------------------------------------------------------------------------------------------
// analysis features → cell features

/**
 * The feature bundle of the paradigm cell an analysed form belongs to: the analysis morph, plus Variety=Voseo for a vos
 * reading (`varieties` includes 'voseo' and the form is second person singular). For a noun, Gender is dropped (the
 * cells of a noun carry Number) except Fem when the paradigm has a gender axis (`genderAxis`).
 */
export function spanishCellFeatures(pos: PartOfSpeech, morph: Record<string, string>, varieties?: readonly string[], opts: { genderAxis?: boolean } = {}): Record<string, string> {
  const f: Record<string, string> = { ...morph };
  if (pos === 'NOUN') {
    if (f.Gender === 'Masc' || !opts.genderAxis) delete f.Gender;
    return f;
  }
  if (pos === 'VERB' || pos === 'AUX') {
    // the older hand-written readings (soy, estás, hay) carry Tense and Mood but no VerbForm
    if (!f.VerbForm && (f.Mood || f.Tense) && f.Person) f.VerbForm = 'Fin';
    delete f.Aspect; // 'Aspect: Perf' on a hand-written preterite; the paradigm's preterite is Tense=Past
    if (f.Mood === 'Sub' && !f.Tense) f.Tense = 'Pres'; // a hand-written 'subj' is the present subjunctive
    if (f.Mood === 'Imp' || f.Mood === 'Cnd') delete f.Tense;
    if (varieties?.includes('voseo') && f.Person === '2' && f.Number === 'Sing') f.Variety = 'Voseo';
  }
  return f;
}

/**
 * The same, for a reading whose features are lists ("Person": "1,3" for era: first or third person): one bundle for every
 * combination, so each can be looked up with `cellOf`.
 */
export function spanishCellFeatureSets(pos: PartOfSpeech, morph: Record<string, string>, varieties?: readonly string[], opts: { genderAxis?: boolean } = {}): Array<Record<string, string>> {
  const base = spanishCellFeatures(pos, morph, varieties, opts);
  let sets: Array<Record<string, string>> = [{}];
  for (const [k, v] of Object.entries(base)) sets = sets.flatMap((s) => v.split(',').map((x) => ({ ...s, [k]: x })));
  // a hand-written reading of both an imperative and an indicative (perdona: Mood Imp,Ind) is a command only without Tense, and a third-person command is the formal one
  return sets.map((f) => {
    if (f.Mood === 'Imp' || f.Mood === 'Cnd') delete f.Tense;
    if (f.Mood === 'Imp' && f.Person === '3') f.Polite = 'Form';
    return f;
  });
}

// ---------------------------------------------------------------------------------------------------------------
// verbs

const LAYOUT_LABELS: ParadigmLayout['labels'] = {
  VerbForm: { Inf: 'infinitive', Ger: 'gerund', Part: 'participle', Fin: 'finite forms' },
  Mood: { Ind: 'indicative', Sub: 'subjunctive', Imp: 'imperative', Cnd: 'conditional' },
  Tense: { Pres: 'present', Imp: 'imperfect', Past: 'preterite', Fut: 'future' },
  Variant: { Ra: '-ra form', Se: '-se form' },
  Variety: { Voseo: 'vos (voseo: the everyday form in Honduras and Central America)' },
  Polite: { Form: 'formal (usted, ustedes)' },
  Gender: { '': 'masculine', Masc: 'masculine', Fem: 'feminine' },
};

const VERB_LAYOUT: ParadigmLayout = {
  columns: { key: 'Number', values: [['Sing', 'singular'], ['Plur', 'plural']] },
  rows: { key: 'Person', values: [['1', '1st person (yo / nosotros)'], ['2', '2nd person (tú, vos / vosotros)'], ['3', '3rd person (él, ella, usted / ellos, ellas, ustedes)']] },
  sections: ['VerbForm', 'Mood', 'Tense', 'Variant'],
  labels: LAYOUT_LABELS,
};

/** The finite tables, in the order the card shows them: [Mood, Tense, Variant, label]. */
const FINITE_TABLES: Array<[string, string | undefined, string | undefined]> = [
  ['Ind', 'Pres', undefined], ['Ind', 'Imp', undefined], ['Ind', 'Past', undefined], ['Ind', 'Fut', undefined],
  ['Cnd', undefined, undefined],
  ['Sub', 'Pres', undefined], ['Sub', 'Imp', 'Ra'], ['Sub', 'Imp', 'Se'], ['Sub', 'Fut', undefined],
];

/** Imperative cells: [Person, Number, formal?]. There is no first-person singular or (informal) third-person command. */
const IMPERATIVES: Array<[string, string, boolean]> = [['2', 'Sing', false], ['3', 'Sing', true], ['1', 'Plur', false], ['2', 'Plur', false], ['3', 'Plur', true]];

/** Irregular verbs whose endings are spelled so distinctively that any verb ending in them is a derivative (supone, retener, convenir, bendecir …). */
const DISTINCT_IRREGULAR_BASES = ['poner', 'venir', 'decir', 'hacer', 'facer', 'traer', 'tener', 'querer', 'valer', 'salir'];

const CLITIC: Record<string, string> = { '1Sing': 'me', '2Sing': 'te', '3Sing': 'se', '1Plur': 'nos', '2Plur': 'os', '3Plur': 'se' };

function templateOf(lemma: string, c: Conjugation): string {
  const cls = /(ar|er|ir|ír)$/.exec(lemma)?.[1]?.replace('ír', 'ir') ?? '';
  if (c.kind === 'irregular') return `irregular (${cls})`;
  if (c.kind === 'stem-change') {
    const k = stemClassOf(lemma) ?? (/^(re|des)/.test(lemma) ? stemClassOf(lemma.replace(/^(re|des)/, '')) : undefined);
    return `stem-changing -${cls}${k ? ` (${k.kind})` : ''}`;
  }
  return `regular -${cls}`;
}

/** The imperative with its clitic attached, as written: lávate, lavate (vos), lávese, lavémonos, lavaos, lávense. */
export function enclitic(form: string, person: string, number: string, lemma: string): string | undefined {
  const clitic = CLITIC[person + number];
  if (person === '1' && number === 'Plur') return form.endsWith('s') ? restress(form.slice(0, -1), '', 'nos') : undefined; // lavemos → lavémonos
  if (person === '2' && number === 'Plur') {
    if (!form.endsWith('d')) return undefined;
    if (lemma === 'ir') return 'idos';
    // lavad → lavaos; the -ir verbs keep the stress on the i: vestid → vestíos, oíd → oíos
    return /[ií]r$/.test(lemma) ? form.slice(0, -2) + 'íos' : form.slice(0, -1) + 'os';
  }
  return restress(form, '', clitic);
}

function verbParadigm(lemma: string, ctx: ParadigmContext): GeneratedParadigm | undefined {
  let base = lemma;
  let reflexive = false;
  let conj = conjugateLemma(base);
  if (!conj && /(ar|er|ir|ír)se$/.test(lemma)) {
    base = lemma.slice(0, -2);
    conj = conjugateLemma(base);
    reflexive = !!conj;
  }
  if (!conj) return undefined;
  // a verb that ends in an irregular base (apoNER, circunVENIR, antedeCIR) but whose prefix the engine does not list is conjugated by the
  // regular rules: that table would be wrong in every cell, so none is generated (the dictionary's table stands alone)
  if (conj.kind !== 'irregular' && DISTINCT_IRREGULAR_BASES.some((b) => base.length > b.length && base.endsWith(b))) return undefined;
  const noParticiple = conj.kind !== 'irregular' && /(scribir|cubrir)$/.test(base) && !IRREGULAR_PARTICIPLES.has(base);

  // the engine's forms by cell key; archaic -des forms are left out (the future subjunctive is archaic as a whole and kept)
  const byKey = new Map<string, string[]>();
  const add = (f: Record<string, string>, form: string) => { const k = featureKey(f); const l = byKey.get(k); if (l) { if (!l.includes(form)) l.push(form); } else byKey.set(k, [form]); };
  const futSubSeen = new Set<string>();
  for (const r of conj.forms) {
    const hist = r.varieties?.includes('es-hist');
    const futSub = r.morph.Mood === 'Sub' && r.morph.Tense === 'Fut';
    if (hist && !futSub) continue;
    if (futSub) { const pk = `${r.morph.Person}${r.morph.Number}`; if (r.morph.Person === '2' && r.morph.Number === 'Plur') { if (futSubSeen.has(pk)) continue; futSubSeen.add(pk); } }
    add(spanishCellFeatures('VERB', r.morph, r.varieties), r.form);
  }

  const cells: Cell[] = [];
  const skips = IRREGULAR[base]?.build().skip ?? [];
  const put = (features: Record<string, string>, notes: string[] = [], fallback?: string) => {
    const forms = byKey.get(featureKey(features)) ?? (fallback ? [fallback] : []);
    if (!forms.length) return;
    // the clitic of a reflexive verb goes in the note
    let note = notes.filter(Boolean).join('; ');
    if (reflexive) {
      const cl = clitic(features, forms[0], base);
      if (cl) note = note ? `${cl}; ${note}` : cl;
    }
    // the infinitive and gerund of a reflexive verb are cited with the clitic (lavarse, lavándose): that is the lemma's own spelling
    const glued = reflexive && (features.VerbForm === 'Inf' || features.VerbForm === 'Ger');
    for (const form of forms) cells.push({ features, form: glued ? (features.VerbForm === 'Inf' ? lemma : restress(form, '', 'se') ?? form) : form, ...(note ? { note } : {}) });
  };
  const clitic = (f: Record<string, string>, form: string, lemmaBase: string): string | undefined => {
    if (f.VerbForm === 'Inf') return `${base} + se`;
    if (f.VerbForm === 'Ger') return `${form} + se`;
    if (f.VerbForm !== 'Fin') return undefined;
    const c = CLITIC[f.Person + f.Number];
    if (!c) return undefined;
    if (f.Mood === 'Imp') return enclitic(form, f.Person, f.Number, lemmaBase);
    return `${c} ${form}`;
  };

  // non-finite forms
  put({ VerbForm: 'Inf' });
  put({ VerbForm: 'Ger' });
  if (!noParticiple) for (const [g, n] of [['Masc', 'Sing'], ['Fem', 'Sing'], ['Masc', 'Plur'], ['Fem', 'Plur']]) put({ VerbForm: 'Part', Gender: g, Number: n });

  // finite tables
  for (const [mood, tense, variant] of FINITE_TABLES) {
    for (const person of PERSONS) for (const number of NUM) {
      const features: Record<string, string> = { VerbForm: 'Fin', Mood: mood, ...(tense ? { Tense: tense } : {}), Person: person, Number: number, ...(variant ? { Variant: variant } : {}) };
      const notes: string[] = [];
      if (person === '2' && number === 'Plur') notes.push('vosotros (Spain)');
      if (mood === 'Sub' && tense === 'Fut') notes.push('archaic: the future subjunctive survives only in legal language and fixed sayings');
      put(features, notes);
      if (person === '2' && number === 'Sing' && ((mood === 'Ind' && tense === 'Pres') || (mood === 'Sub' && tense === 'Pres'))) {
        const vos = { ...features, Variety: 'Voseo' };
        const tu = byKey.get(featureKey(features))?.[0];
        const missingOk = mood === 'Ind' && !skips.includes('pres.vos'); // the engine leaves vos out of a table when it equals tú
        const same = !byKey.has(featureKey(vos)) && missingOk ? tu : undefined;
        put(vos, ['voseo (vos): the everyday "you" form in Honduras', same ? 'same as the tú form' : ''], same);
      }
    }
  }
  for (const [person, number, formal] of IMPERATIVES) {
    const features: Record<string, string> = { VerbForm: 'Fin', Mood: 'Imp', Person: person, Number: number, ...(formal ? { Polite: 'Form' } : {}) };
    const who = formal ? (number === 'Sing' ? 'usted' : 'ustedes') : person === '1' ? 'nosotros (let us)' : person === '2' && number === 'Sing' ? 'tú' : 'vosotros';
    const notes = [`command to ${who}`];
    if (person === '2' && number === 'Plur') notes.push('used in Spain; Latin America uses the ustedes command');
    put(features, notes);
    if (person === '2' && number === 'Sing') {
      const vos = { ...features, Variety: 'Voseo' };
      const tu = byKey.get(featureKey(features))?.[0];
      const same = !byKey.has(featureKey(vos)) && base.length > 3 && !skips.some((s) => s.startsWith('imp.')) ? tu : undefined;
      put(vos, ['voseo command (vos)', same ? 'same as the tú command' : ''], same);
    }
  }

  const notes: string[] = [];
  const known = ctx.known(base, 'VERB') || ctx.known(base, 'AUX');
  notes.push(`Template: ${templateOf(base, conj)}.`);
  if (conj.kind === 'irregular') notes.push('Irregular verb: the forms come from the course\'s irregular tables (a verb with a prefix, such as mantener or deshacer, follows its base).');
  if (noParticiple) notes.push('The participle is not generated: the engine does not know the irregular participle of this prefixed verb (-scrito / -cubierto).');
  if (conj.kind === 'regular' && !known) notes.push('Generated by the regular rules only: the lemma is in the word list and on no irregular or stem-change list, so a stem change it may have would not appear. If a dictionary table disagrees, trust the table.');
  if (reflexive) notes.push(`Reflexive verb (${lemma}): the cells are the forms of ${base}; the clitic (me, te, se, nos, os) is in each cell's note, not glued to the form.`);
  notes.push('The negative command is the present subjunctive (no hables, no hable, no hablemos, no habléis, no hablen); it is not a separate cell.');
  notes.push('Voseo (vos) is given beside tú: vos hablás, vos comés, vos vivís; the vos command is hablá, comé, viví. A vos cell marked "same as tú" has the tú form.');
  notes.push('Imperfect subjunctive has two interchangeable forms, -ra and -se (hablara / hablase); both are cells.');
  notes.push('Compound tenses (he hablado, había hablado, habré hablado …: haber + participle) and periphrases (voy a hablar, estoy hablando) are constructions, not inflected words: they are listed under constructions, not in the table.');
  notes.push('Not covered: archaic -des endings (amábades), a defective verb\'s missing persons are not marked, and a verb with a second accepted irregularity beyond the engine\'s tables.');

  return {
    kind: 'verb-conjugation',
    cells,
    layout: VERB_LAYOUT,
    template: templateOf(base, conj) + (reflexive ? ', reflexive' : ''),
    notes,
    constructions: [...VERB_CONSTRUCTIONS],
  };
}

// ---------------------------------------------------------------------------------------------------------------
// nouns and adjectives

const NOMINAL_LABELS: ParadigmLayout['labels'] = { Gender: { '': 'masculine', Masc: 'masculine', Fem: 'feminine' } };

function nounParadigm(lemma: string, ctx: ParadigmContext): GeneratedParadigm | undefined {
  const cells: Cell[] = [{ features: { Number: 'Sing' }, form: lemma }];
  const plurals = pluralsOf(lemma);
  for (const p of plurals) cells.push({ features: { Number: 'Plur' }, form: p, ...(p === lemma ? { note: 'same form in the plural' } : {}) });
  const notes: string[] = [];
  if (!plurals.length) notes.push('No plural by the rules for this ending; only the singular is given.');
  if (plurals.length > 1) notes.push('Two plurals are accepted; both are cells.');

  // the feminine counterpart (niño / niña), only when the word list has it
  let fem: string | undefined;
  const g = ctx.genderOf(lemma, 'NOUN');
  if (lemma.endsWith('o') && g !== 'Fem') {
    const f = lemma.slice(0, -1) + 'a';
    if (ctx.known(f, 'NOUN')) fem = f;
  } else {
    const f = /(or|ón|án|ín|és)$/.test(lemma) ? restress(lemma, '', 'a') : undefined;
    if (f && g !== 'Fem' && ctx.known(f, 'NOUN')) fem = f;
  }
  if (fem) {
    cells.push({ features: { Gender: 'Fem', Number: 'Sing' }, form: fem });
    for (const p of pluralsOf(fem)) cells.push({ features: { Gender: 'Fem', Number: 'Plur' }, form: p });
    notes.push(`Gender: ${lemma} is masculine; the feminine ${fem} is the other section. The masculine cells carry no Gender feature (as in the analysis of plurals).`);
  } else if (g === 'Masc,Fem' || g === 'Fem,Masc') {
    notes.push('The same form serves both genders (the article tells them apart).');
  }
  if (!ctx.known(lemma, 'NOUN')) notes.push('Plural by the spelling rules only: the word is not in the course word list, and a borrowed word (display, banner) often takes -s where the rules give -es.');
  notes.push('Not covered: diminutives, augmentatives and the -ísimo superlative (derivation, not inflection).');
  return {
    kind: 'noun-declension',
    cells,
    layout: { columns: { key: 'Number', values: [['Sing', 'singular'], ['Plur', 'plural']] }, rows: { key: 'Gender', values: fem ? [['', 'masculine'], ['Fem', 'feminine']] : [['', '']] }, labels: NOMINAL_LABELS },
    template: fem ? 'noun with a feminine counterpart' : 'noun',
    notes,
  };
}

function adjectiveParadigm(lemma: string): GeneratedParadigm | undefined {
  const forms = nominalForms(lemma, 'ADJ');
  if (!forms.length) return undefined;
  const gendered = forms.some((f) => f.morph.Gender);
  const cells: Cell[] = forms.map((f) => ({ features: { ...f.morph }, form: f.form }));
  const notes: string[] = [];
  if (!gendered) notes.push('Invariable in gender: one form for masculine and feminine (a single row); only the number changes.');
  notes.push('Not covered: the -ísimo superlative, comparatives (más grande; mejor, peor), and short forms before a noun (buen, gran): comparison and apocope are not generated.');
  const rows: Array<[string, string]> = gendered ? [['Masc', 'masculine'], ['Fem', 'feminine']] : [['', 'masculine and feminine']];
  return {
    kind: 'adjective-declension',
    cells,
    layout: { columns: { key: 'Number', values: [['Sing', 'singular'], ['Plur', 'plural']] }, rows: { key: 'Gender', values: rows }, labels: NOMINAL_LABELS },
    template: gendered ? 'adjective in -o/-a (or -or/-ora …)' : 'adjective, one form for both genders',
    notes,
  };
}

/** Does the letter-shape of this lemma allow a noun/adjective paradigm at all (a word, not a phrase or a number)? */
const WORD = /^[a-záéíóúüñ]+$/u;

/** The adapter's `paradigm()`: see the file comment. `undefined` when the engine cannot generate for this lemma and part of speech. */
export function spanishParadigm(lemma: string, pos: PartOfSpeech, ctx: ParadigmContext): GeneratedParadigm | undefined {
  const nfc = lemma.normalize('NFC');
  const l = nfc.toLowerCase();
  if (!WORD.test(l)) return undefined;
  // a capitalised noun (Pascua) keeps its capital; an acronym or mixed-case word (PC, iPhone) is not inflected by these rules
  const capital = nfc !== l;
  if (capital && (pos !== 'NOUN' || !/^[A-ZÁÉÍÓÚÑ][a-záéíóúüñ]*$/.test(nfc))) return undefined;
  switch (pos) {
    case 'VERB':
    case 'AUX': return verbParadigm(l, ctx);
    case 'NOUN': {
      const p = nounParadigm(l, ctx);
      if (!p || !capital) return p;
      const up = (f: string) => f[0].toUpperCase() + f.slice(1);
      return { ...p, cells: p.cells.map((c) => ({ ...c, form: up(c.form) })) };
    }
    case 'ADJ': return adjectiveParadigm(l);
    default: return undefined;
  }
}

/**
 * Put the dictionary form that equals a generated form FIRST for each cell. `mergeParadigm` judges a cell by the first
 * dictionary form it meets (later ones become alternatives), so a cell the dictionary lists with two spellings, the second
 * of which matches the rules, would otherwise be called conflicted. Pure reordering: no form is added or dropped.
 */
export function alignDictionaryCells<T extends { features: Record<string, string>; form: string }>(generated: ReadonlyArray<{ features: Record<string, string>; form: string }>, dictionary: readonly T[]): T[] {
  const gen = new Map<string, Set<string>>();
  for (const g of generated) { const k = featureKey(g.features); (gen.get(k) ?? gen.set(k, new Set()).get(k)!).add(g.form.normalize('NFC')); }
  const rank = (d: T) => (gen.get(featureKey(d.features))?.has(d.form.normalize('NFC')) ? 0 : 1);
  return dictionary.map((d, i) => ({ d, i })).sort((a, b) => rank(a.d) - rank(b.d) || a.i - b.i).map((x) => x.d);
}
