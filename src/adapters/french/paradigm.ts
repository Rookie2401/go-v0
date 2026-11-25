/**
 * French paradigm generation (MORPH package, docs/french/PLAN.md; same shape as spanish/paradigm.ts): the complete table of a
 * verb, noun or adjective as feature-keyed cells (`src/core/paradigm.ts`), produced ONLY from what the adapter already
 * generates (`conjugateLemma`, `pluralsOf`, `nominalForms`). Nothing here invents a form: a cell exists when the engine produced
 * a form for its features, and the features are exactly the ones the analysis puts on that form, so `cellOf(paradigm,
 * frenchCellFeatures(...))` finds the cell of any analysed form. The dictionary half (kaikki tables) is `table-tags.ts`; the
 * merge is `mergeParadigm`. MACHINE-DRAFTED, not checked by a native speaker.
 *
 * Conventions:
 *  - Verb cells: VerbForm Fin with Mood (Ind, Sub, Imp, Cnd), Tense (Pres, Imp, Past, Fut; the conditionnel is Mood Cnd + Tense
 *    Pres; a command has no Tense), Person, Number; the infinitive and the present participle one cell each; the past participle
 *    four cells (Gender × Number), or one when it does not agree (été, pu, ri).
 *  - The passé simple and the subjonctif imparfait are literary: a note says so. The impératif 2s of an -er verb has a second form
 *    with -s before en and y (parles-en, vas-y): it is a cell of the same features with a note.
 *  - Compound tenses (passé composé, plus-que-parfait …: avoir or être + participle) and the near future (aller + infinitive) are
 *    CONSTRUCTIONS, listed in `constructions` (the ids of docs/french/PLAN.md), never cells.
 *  - A pronominal verb (se laver): the cells are the forms of the base verb; the pronoun is in each cell's note.
 *  - A noun's cells carry Number; Gender appears only as `Gender: 'Fem'` on the feminine counterpart (chanteur / chanteuse) when
 *    the word list has it. An adjective's cells carry Gender and Number (the invariable ones carry the same form in both rows).
 */
import { featureKey, type GeneratedParadigm, type ParadigmLayout } from '../../core/paradigm';
import type { PartOfSpeech } from '../../core/model';
import { feminineOf, nominalForms, nounFeminineForms, pluralsOf } from './morph-nominal';
import { familyOf } from './verb-irregular';
import { conjugateLemma, pronominalBase, type Conj } from './verbs';

/** What the paradigm needs from the adapter's word list (kept out of this file so it does not import fr.ts). */
export interface ParadigmContext {
  /** Is the lemma in the word list (any of the given part of speech)? */
  known(lemma: string, pos: PartOfSpeech): boolean;
  /** The Gender the word list gives the lemma ('Masc', 'Fem', or a comma list 'Fem,Masc' for a noun of both), if any. */
  genderOf(lemma: string, pos: PartOfSpeech): string | undefined;
}

type Cell = { features: Record<string, string>; form: string; note?: string };

/** The construction ids a verb's table points to instead of cells (docs/french/PLAN.md). */
export const VERB_CONSTRUCTIONS: readonly string[] = ['passe-compose', 'plus-que-parfait', 'futur-proche'];

const NUM = ['Sing', 'Plur'] as const;
const PERSONS = ['1', '2', '3'] as const;

// ---------------------------------------------------------------------------------------------------------------
// analysis features → cell features

/**
 * The feature bundle of the paradigm cell an analysed form belongs to: the analysis morph, with the imperative's Tense dropped.
 * For a noun, Gender is dropped (the cells of a noun carry Number) except Fem when the paradigm has a gender axis (`genderAxis`).
 */
export function frenchCellFeatures(pos: PartOfSpeech, morph: Record<string, string>, _varieties?: readonly string[], opts: { genderAxis?: boolean } = {}): Record<string, string> {
  void _varieties;
  const f: Record<string, string> = { ...morph };
  if (pos === 'NOUN') {
    if (f.Gender === 'Masc' || !opts.genderAxis) delete f.Gender;
    return f;
  }
  if (pos === 'VERB' || pos === 'AUX') {
    if (!f.VerbForm && (f.Mood || f.Tense) && f.Person) f.VerbForm = 'Fin';
    if (f.Mood === 'Imp') delete f.Tense;
    if (f.Mood === 'Cnd') f.Tense = 'Pres';
  }
  return f;
}

/**
 * The same, for a reading whose features are lists ("Person": "1,3" for parle: first or third person): one bundle for every
 * combination, so each can be looked up with `cellOf`.
 */
export function frenchCellFeatureSets(pos: PartOfSpeech, morph: Record<string, string>, varieties?: readonly string[], opts: { genderAxis?: boolean } = {}): Array<Record<string, string>> {
  const base = frenchCellFeatures(pos, morph, varieties, opts);
  let sets: Array<Record<string, string>> = [{}];
  for (const [k, v] of Object.entries(base)) sets = sets.flatMap((s) => v.split(',').map((x) => ({ ...s, [k]: x })));
  return sets.map((f) => {
    if (f.Mood === 'Imp') delete f.Tense;
    if (f.Mood === 'Cnd') f.Tense = 'Pres';
    return f;
  });
}

// ---------------------------------------------------------------------------------------------------------------
// verbs

const LAYOUT_LABELS: ParadigmLayout['labels'] = {
  VerbForm: { Inf: 'infinitive', Part: 'participle', Fin: 'finite forms' },
  Mood: { Ind: 'indicative', Sub: 'subjunctive', Imp: 'imperative', Cnd: 'conditional' },
  Tense: { Pres: 'present', Imp: 'imperfect', Past: 'past', Fut: 'future' },
  Gender: { '': 'masculine', Masc: 'masculine', Fem: 'feminine' },
};

const VERB_LAYOUT: ParadigmLayout = {
  columns: { key: 'Number', values: [['Sing', 'singular'], ['Plur', 'plural']] },
  rows: { key: 'Person', values: [['1', '1st person (je / nous)'], ['2', '2nd person (tu / vous)'], ['3', '3rd person (il, elle / ils, elles)']] },
  sections: ['VerbForm', 'Mood', 'Tense'],
  labels: LAYOUT_LABELS,
};

/** The finite tables, in the order the card shows them: [Mood, Tense]. */
const FINITE_TABLES: Array<[string, string]> = [
  ['Ind', 'Pres'], ['Ind', 'Imp'], ['Ind', 'Past'], ['Ind', 'Fut'], ['Cnd', 'Pres'], ['Sub', 'Pres'], ['Sub', 'Imp'],
];

/** Imperative cells: [Person, Number]. There is no first-person singular or third-person command. */
const IMPERATIVES: Array<[string, string]> = [['2', 'Sing'], ['1', 'Plur'], ['2', 'Plur']];

const CLITIC: Record<string, string> = { '1Sing': 'me', '2Sing': 'te', '3Sing': 'se', '1Plur': 'nous', '2Plur': 'vous', '3Plur': 'se' };

function templateOf(lemma: string, c: Conj): string {
  if (c.listed) {
    const fam = familyOf(lemma);
    return fam && fam.fam.model !== lemma ? `irregular (like ${fam.fam.model})` : 'irregular';
  }
  return c.group === '1' ? 'regular -er' : c.group === '2' ? 'regular -ir (second group, -iss-)' : 'regular -re';
}

const AUX_NOTE: Record<string, string> = {
  avoir: 'The compound tenses are made with avoir (j\'ai parlé).',
  'être': 'The compound tenses are made with être (je suis allé, elle est partie).',
  both: 'The compound tenses are made with être when the verb is intransitive or of movement (je suis sorti) and with avoir when it has an object (j\'ai sorti le chien).',
};

function verbParadigm(lemma: string, ctx: ParadigmContext): GeneratedParadigm | undefined {
  const pron = pronominalBase(lemma);
  const base = pron ?? lemma;
  const conj = conjugateLemma(base);
  if (!conj) return undefined;
  const reflexive = !!pron;

  const byKey = new Map<string, Array<{ form: string; note?: string }>>();
  for (const r of conj.forms) {
    const k = featureKey(frenchCellFeatures('VERB', r.morph));
    const note = r.note ?? (r.spelling ? 'spelling of the 1990 rectifications, beside the traditional one' : undefined);
    const l = byKey.get(k) ?? [];
    if (!l.some((x) => x.form === r.form && x.note === note)) l.push({ form: r.form, ...(note ? { note } : {}) });
    byKey.set(k, l);
  }
  const cells: Cell[] = [];
  const clitic = (f: Record<string, string>, form: string): string | undefined => {
    if (f.VerbForm === 'Inf') return `se + ${base}`;
    if (f.VerbForm !== 'Fin') return undefined;
    const c = CLITIC[f.Person + f.Number];
    if (!c) return undefined;
    if (f.Mood === 'Imp') return f.Person === '2' && f.Number === 'Sing' ? `${form}-toi` : f.Person === '1' ? `${form}-nous` : `${form}-vous`;
    return `${c} ${form}`;
  };
  const put = (features: Record<string, string>, notes: string[] = []) => {
    const forms = byKey.get(featureKey(features)) ?? [];
    for (const { form, note: formNote } of forms) {
      const parts = [...notes, formNote ?? ''];
      if (reflexive) { const cl = clitic(features, form); if (cl) parts.unshift(cl); }
      const note = parts.filter(Boolean).join('; ');
      cells.push({ features, form, ...(note ? { note } : {}) });
    }
  };

  // non-finite forms
  put({ VerbForm: 'Inf' });
  put({ VerbForm: 'Part', Tense: 'Pres' });
  if (byKey.has(featureKey({ VerbForm: 'Part', Tense: 'Past' }))) put({ VerbForm: 'Part', Tense: 'Past' }, ['invariable: it does not agree']);
  else for (const [g, n] of [['Masc', 'Sing'], ['Fem', 'Sing'], ['Masc', 'Plur'], ['Fem', 'Plur']]) put({ VerbForm: 'Part', Tense: 'Past', Gender: g, Number: n });

  // finite tables
  for (const [mood, tense] of FINITE_TABLES) {
    for (const person of PERSONS) for (const number of NUM) {
      const features: Record<string, string> = { VerbForm: 'Fin', Mood: mood, Tense: tense, Person: person, Number: number };
      const notes: string[] = [];
      if (mood === 'Ind' && tense === 'Past') notes.push('literary: the passé simple is written, not spoken');
      if (mood === 'Sub' && tense === 'Imp') notes.push('literary: the subjonctif imparfait is written, not spoken');
      put(features, notes);
    }
  }
  for (const [person, number] of IMPERATIVES) {
    const features: Record<string, string> = { VerbForm: 'Fin', Mood: 'Imp', Person: person, Number: number };
    const who = person === '1' ? 'nous (let us)' : person === '2' && number === 'Sing' ? 'tu' : 'vous';
    put(features, [`command to ${who}`]);
  }

  const notes: string[] = [];
  const known = ctx.known(base, 'VERB') || ctx.known(base, 'AUX');
  notes.push(`Template: ${templateOf(base, conj)}.`);
  if (conj.listed && conj.model) notes.push(`Conjugated like ${conj.model.replace('conjugated like ', '')}: the forms come from the engine's irregular tables, with the prefix.`);
  else if (conj.listed) notes.push('Irregular verb: the forms come from the engine\'s irregular tables.');
  if (conj.group === '2' && !conj.listed) {
    notes.push(known
      ? 'An -ir verb the engine has no table for is conjugated as a second-group verb (finis, finissons); a verb such as partir, sortir, dormir or ouvrir is irregular and is listed. If a dictionary table disagrees, trust the table.'
      : 'Generated by the second-group rule only: the lemma is not in the word list, and an -ir verb may belong to the third group instead. If a dictionary table disagrees, trust the table.');
  } else if (!conj.listed && !known) notes.push('Generated by the regular rules only: the lemma is not in the word list. If a dictionary table disagrees, trust the table.');
  if (conj.defective) notes.push(`Defective verb: ${conj.defective}.`);
  notes.push(AUX_NOTE[conj.aux]);
  if (reflexive) notes.push(`Pronominal verb (${lemma}): the cells are the forms of ${base}; the pronoun (me, te, se, nous, vous) is in each cell's note, not glued to the form.`);
  notes.push('The passé simple and the subjonctif imparfait are literary tenses: ordinary speech and writing use the passé composé and the present subjunctive.');
  notes.push('The impératif has three forms (tu, nous, vous); a form without -s (parle, va, ouvre) takes it back before en and y (parles-en, vas-y), listed beside it.');
  notes.push('Compound tenses (passé composé, plus-que-parfait, futur antérieur …: avoir or être + the past participle) and the near future (aller + infinitive) are constructions, not inflected words: they are listed under constructions, not in the table.');
  notes.push('Spelling: where the 1990 rectifications allow another spelling (cèderai beside céderai, j\'épèle beside j\'épelle, connait beside connaît), it is a second form in the cell with a note; the traditional spelling comes first. Not covered: other 1990 changes, and a defective verb\'s missing persons are not marked beyond the note above.');

  return {
    kind: 'verb-conjugation',
    cells,
    layout: VERB_LAYOUT,
    template: templateOf(base, conj) + (reflexive ? ', pronominal' : ''),
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
  if (!plurals.length) notes.push('No plural by the rules for this word; only the singular is given.');
  if (plurals.length > 1) notes.push('Two plurals are in use (or the plural of one sense differs from the other); both are cells.');

  // the feminine counterpart (chanteur / chanteuse), only when the word list has it
  const g = ctx.genderOf(lemma, 'NOUN');
  let fem: string | undefined;
  if (g !== 'Fem') {
    for (const f of nounFeminineForms(lemma)) if (f.morph.Number === 'Sing' && ctx.known(f.form, 'NOUN')) { fem = f.form; break; }
  }
  if (fem) {
    cells.push({ features: { Gender: 'Fem', Number: 'Sing' }, form: fem });
    for (const p of pluralsOf(fem)) cells.push({ features: { Gender: 'Fem', Number: 'Plur' }, form: p });
    notes.push(`Gender: ${lemma} is masculine; the feminine ${fem} is the other section. The masculine cells carry no Gender feature (as in the analysis of plurals).`);
  } else if (g === 'Masc,Fem' || g === 'Fem,Masc') {
    notes.push('The same form serves both genders (the article tells them apart).');
  }
  if (!ctx.known(lemma, 'NOUN')) notes.push('Plural by the spelling rules only: the word is not in the word list, and an irregular plural (cheval, chevaux; œil, yeux) is only known from the engine\'s own list.');
  notes.push('Not covered: compound nouns (grand-mère, grands-mères) beyond a short list, and plurals that differ in sense.');
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
  if (forms.length <= 1) return undefined;
  const cells: Cell[] = forms.map((f) => ({ features: { ...f.morph }, form: f.form }));
  const vowel = nominalForms(lemma, 'ADJ').find((f) => f.morph.Gender === 'Masc' && f.morph.Number === 'Sing' && f.form !== lemma);
  if (vowel) { const c = cells.find((x) => x.form === vowel.form); if (c) c.note = 'masculine singular before a vowel or a mute h (un bel arbre)'; }
  const notes: string[] = [];
  const fem = feminineOf(lemma);
  if (fem.length === 1 && fem[0] === lemma) notes.push('Invariable in gender: the feminine is the same as the masculine (rouge); only the number changes.');
  if (/[sx]$/.test(lemma)) notes.push('The masculine plural is the same as the singular.');
  notes.push('Not covered: the comparative (meilleur, plus grand), the adverb in -ment, and agreement of a compound adjective (bleu clair).');
  return {
    kind: 'adjective-declension',
    cells,
    layout: { columns: { key: 'Number', values: [['Sing', 'singular'], ['Plur', 'plural']] }, rows: { key: 'Gender', values: [['Masc', 'masculine'], ['Fem', 'feminine']] }, labels: NOMINAL_LABELS },
    template: 'adjective',
    notes,
  };
}

/** Does the letter-shape of this lemma allow a paradigm at all (a word, not a phrase or a number)? */
const WORD = /^[a-zàâäçéèêëîïôöùûüÿœæ'-]+$/u;

/** The adapter's `paradigm()`: see the file comment. `undefined` when the engine cannot generate for this lemma and part of speech. */
export function frenchParadigm(lemma: string, pos: PartOfSpeech, ctx: ParadigmContext): GeneratedParadigm | undefined {
  const nfc = lemma.normalize('NFC');
  const l = nfc.toLowerCase().replace(/’/g, "'");
  // a pronominal verb is written with its pronoun (se laver, s'en aller, s'enfuir)
  const pronominal = (pos === 'VERB' || pos === 'AUX') && /^(?:se |s'en |s')[a-zàâäçéèêëîïôöùûüÿœæ]+$/.test(l);
  if (!pronominal && !WORD.test(l)) return undefined;
  // a capitalised noun (Pâques) keeps its capital; an acronym or mixed-case word is not inflected by these rules
  const capital = nfc !== l;
  if (capital && (pos !== 'NOUN' || !/^[A-ZÀÂÇÉÈÊËÎÏÔÙÛÜŒÆ][a-zàâäçéèêëîïôöùûüÿœæ'-]*$/.test(nfc))) return undefined;
  switch (pos) {
    case 'VERB':
    case 'AUX': return /-/.test(l) ? undefined : verbParadigm(l.replace(/’/g, "'"), ctx);
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
