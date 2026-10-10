/**
 * Hindi paradigm generation (GoLearn Linguistic Engine V2, Stage 3): the forms a lexeme takes, as the shared
 * `GeneratedParadigm` shape of src/core/paradigm.ts, produced ONLY from what the adapter's own morphology generates
 * (`inflectHindi`: the noun / adjective / pronoun / verb rules and the irregular tables, plus the spellings the word list
 * adds). Nothing here has a rule of its own: the cells are the generated forms under the features the analysis gives
 * them, so `cellOf(paradigm, hindiCellFeatures(pos, morph))` finds the cell of any analysed form.
 *
 *   noun       Case (Dir, Obl, Voc) x Number. Gender is a fact of the word (a note and the template), not an axis. The
 *              postpositions that take the oblique are a note.
 *   adjective  an adjective in -a: Gender x Number x Case (the masculine has a direct and an oblique; the feminine has no
 *              case, as in the analysis). An adjective that does not change: one cell and a note. Possessives (mera) are
 *              `determiner-paradigm` with the same shape.
 *   pronoun    Case (Dir, Obl = the stem before a postposition, Erg, Dat, Gen) with the postposition written onto the stem
 *              (Adp: se, mem, par) as further Obl cells.
 *   verb       the SINGLE-WORD forms: stem, infinitive, habitual (imperfective) participle and perfective participle
 *              (Gender x Number), the conjunctive, the subjunctive, the future, the commands, and for hona the present
 *              and past of the copula. The habitual present / past, the progressive, the present perfect and pluperfect,
 *              compound verbs and light verbs are CONSTRUCTIONS (`constructions`): the auxiliary carries tense, the
 *              participle carries aspect and agreement. A whole tense is never filed under one participle.
 *
 * What it will not do: a lemma outside the word list gets nothing, except a verb in -na with a well-formed stem
 * (Hindi verb morphology is regular and productive): its paradigm is made from the same rules, says "guessed from the
 * ending" in its notes and has no word-list facts (ne, causative). Nouns and adjectives are never guessed from a lemma.
 * A lemma of more than one word (a light verb, ghrna karna) gets nothing.
 */
import type { GeneratedParadigm, Paradigm, ParadigmCell, ParadigmLayout, PartOfSpeech } from '../../core';
import { featureKey, mergeParadigm } from '../../core/paradigm';
import { hiTableTagsDetail, isSingleWord } from './table-tags';
import { inflectHindi, type HindiLemmaInfo } from './morphology';
import { fixNasal, fold, glide, kindOf } from './morph-orth';
import { IRREG, stemClass, validStemStart } from './morph-verb';

type Features = Record<string, string>;
interface Cell { features: Features; form: string; note?: string }

/** What the paradigm needs from the adapter's word list (kept out of this file so it does not import hi.ts). */
export interface HiParadigmContext {
  /** The word-list entry of the lemma with this part of speech (the listed spelling), with the forms the row lists by hand. */
  listed(lemma: string, pos: PartOfSpeech): { lemma: string; info?: HindiLemmaInfo; forms: ReadonlyArray<{ form: string; morph: Record<string, string> }> } | undefined;
}

const nfc = (s: string): string => s.normalize('NFC');
const GENDER_WORD: Record<string, string> = { Masc: 'masculine', Fem: 'feminine' };

/** The construction ids (hindi/construction-data.ts) a verb's table points to instead of cells. */
export const HI_VERB_CONSTRUCTIONS: readonly string[] = [
  'habitual-present', 'habitual-past', 'progressive', 'present-perfect', 'pluperfect', 'ergative-ne', 'compound-verb', 'auxiliary-chain', 'passive', 'ability-sakna', 'conditional', 'contrary-to-fact',
];

// ───────────────────────────── analysis features <-> cell features ─────────────────────────────

/**
 * The feature bundle of the paradigm cell an analysed form belongs to. A noun's cell is Case x Number (Gender is the word's);
 * an adjective's or possessive's is Gender x Number x Case; a verb's keeps its verb features without the Voice mark of a
 * causative (a note says so) and a progressive auxiliary reading is the perfective participle's cell; a pronoun's is Case
 * (and Number only when `opts.numberAxis`). Undefined when the morph names no cell of that kind.
 */
export function hindiCellFeatures(pos: PartOfSpeech, morph: Record<string, string>, opts: { numberAxis?: boolean } = {}): Features | undefined {
  const pick = (keys: string[]): Features => { const f: Features = {}; for (const k of keys) if (morph[k] !== undefined) f[k] = morph[k]; return f; };
  switch (pos) {
    case 'NOUN': case 'PROPN': return morph.Case || morph.Number ? pick(['Case', 'Number']) : undefined;
    case 'ADJ': case 'DET': case 'NUM': return pick(['Gender', 'Number', 'Case']);
    case 'PRON': return morph.Case ? pick(opts.numberAxis ? ['Case', 'Number'] : ['Case']) : undefined;
    case 'VERB': case 'AUX': {
      const { Voice: _v, Poss: _p, ...rest } = morph;
      void _v; void _p;
      if (rest.Aspect === 'Prog') rest.Aspect = 'Perf';
      // the word list's hand-written infinitive says only VerbForm=Inf (and Case=Obl): the rules' cells are masculine, direct unless oblique
      if (rest.VerbForm === 'Inf') { rest.Gender ??= 'Masc'; if (rest.Gender === 'Masc') rest.Case ??= 'Dir'; }
      return rest;
    }
    default: return undefined;
  }
}

/**
 * The cells of a paradigm that an ANALYSIS reading names. A reading from the word list's hand-written forms can leave a feature
 * open (a noun's lemma form carries no Case: direct and oblique alike), where a cell has exactly one value; the reading is
 * normalised like a cell (`hindiCellFeatures`) and a cell matches when every feature BOTH state agrees. `surface` (optional)
 * keeps only cells whose form (or an alternative spelling) is that written form. `cellOf` finds the cell when the reading is exact.
 */
export function hindiCellsFor(paradigm: Pick<Paradigm, 'cells'>, pos: PartOfSpeech, morph: Record<string, string>, surface?: string): ParadigmCell[] {
  const f = hindiCellFeatures(pos, morph, { numberAxis: true }) ?? Object.fromEntries(Object.entries(morph));
  const s = surface?.normalize('NFC');
  // the bare stem is also the command to तू (the analysis reads it as the stem; both name the same written form)
  const stemReading = (pos === 'VERB' || pos === 'AUX') && f.VerbForm === 'Stem';
  return paradigm.cells.filter((c) => (Object.entries(c.features).every(([k, v]) => f[k] === undefined || f[k].split(',').includes(v)) || (stemReading && c.features.Mood === 'Imp' && c.features.Polite === 'Infm'))
    && (!s || c.form.normalize('NFC') === s || (c.alternatives ?? []).some((a) => a.normalize('NFC') === s)));
}

const dedupe = (cells: Cell[]): Cell[] => {
  const seen = new Set<string>();
  return cells.filter((c) => { const k = `${featureKey(c.features)}|${c.form}`; if (seen.has(k)) return false; seen.add(k); return true; });
};

/** Spelling variants of a generated form, listed after the main cells so the merge keeps them as alternatives (the glide: nae / naye, kiie / kiye). */
function spellingVariants(cells: Cell[]): Cell[] {
  const out: Cell[] = [];
  for (const c of cells) {
    const g = nfc(glide(c.form));
    // the dictionary writes the nasal of a plural ending as an anusvara (आयें, करें); the rules write a chandrabindu after an independent vowel (आएँ)
    for (const v of [g, fixNasal(g), fold(c.form), fold(g)]) if (v !== c.form) out.push({ features: c.features, form: v });
  }
  return out;
}

/** Word-list forms that the rules do not give, kept as alternatives of the cell they name (never a cell of their own). */
function handVariants(cells: Cell[], listed: ReturnType<HiParadigmContext['listed']>, pos: PartOfSpeech): Cell[] {
  if (!listed) return [];
  const have = new Set(cells.map((c) => c.form));
  const keys = new Set(cells.map((c) => featureKey(c.features)));
  const out: Cell[] = [];
  for (const h of listed.forms) {
    const form = nfc(h.form);
    if (have.has(form)) continue;
    const f = hindiCellFeatures(pos, h.morph);
    if (f && keys.has(featureKey(f))) out.push({ features: f, form });
  }
  return out;
}

const withVariants = (cells: Cell[], listed: ReturnType<HiParadigmContext['listed']>, pos: PartOfSpeech): Cell[] =>
  dedupe([...cells, ...spellingVariants(cells), ...handVariants(cells, listed, pos)]);

// ───────────────────────────── nouns ─────────────────────────────

const CASE_ROWS: Array<[string, string]> = [['Dir', 'direct (subject, or object with no postposition)'], ['Obl', 'oblique (before a postposition)'], ['Voc', 'vocative (calling someone)']];
const NUMBER_COLS: Array<[string, string]> = [['Sing', 'singular'], ['Plur', 'plural']];
const NOUN_LAYOUT: ParadigmLayout = { columns: { key: 'Number', values: NUMBER_COLS }, rows: { key: 'Case', values: CASE_ROWS } };

const INDEP_AA = /[ुूेैोौ]आ[ँं]?$/;
/** The class of a noun, in words (what morph-noun.ts keys its rules on). */
function nounTemplate(lemma: string, gender: string, invariant: boolean): string | undefined {
  const m = gender === 'Masc';
  const g = m ? 'masculine' : 'feminine';
  if (INDEP_AA.test(lemma)) return `${g} noun in an independent -आ (कौआ, कुआँ)`;
  switch (kindOf(lemma)) {
    case 'C': return `${g} noun with no marked ending (${m ? 'घर' : 'किताब'})`;
    case 'aa': return m ? (invariant ? 'masculine noun in -ा that keeps it (पिता)' : 'masculine noun in -ा that changes (लड़का)') : lemma.endsWith('िया') && lemma.length > 3 ? 'feminine noun in -िया (चिड़िया)' : 'feminine noun in -ा (माता)';
    case 'ii': case 'i': return m ? 'masculine noun in -ी / -ि (आदमी)' : 'feminine noun in -ी / -ि (लड़की)';
    case 'uu': case 'u': return m ? 'masculine noun in -ू / -ु (भालू)' : 'feminine noun in -ू / -ु (बहू)';
    case 'e': case 'ai': case 'o': case 'au': return `${g} noun in -े / -ो / -ै / -ौ`;
    default: return undefined;
  }
}

function nounParadigm(lemma: string, pos: PartOfSpeech, listed: NonNullable<ReturnType<HiParadigmContext['listed']>>, hint?: { features?: Features }): GeneratedParadigm | undefined {
  const rows = inflectHindi(lemma, pos, listed.info);
  if (!rows.length) return undefined;
  const genders = [...new Set(rows.map((r) => r.morph.Gender).filter((g): g is string => !!g))];
  const wanted = hint?.features?.Gender;
  const gender = wanted && genders.includes(wanted) ? wanted : genders.includes('Masc') ? 'Masc' : genders[0];
  const chosen = rows.filter((r) => !r.morph.Gender || r.morph.Gender === gender);
  const cells = withVariants(
    chosen.map((r) => ({ features: hindiCellFeatures(pos, r.morph) ?? {}, form: nfc(r.form) })).filter((c) => c.features.Case),
    listed, pos,
  );
  if (!cells.length) return undefined;
  const notes: string[] = [];
  if (gender) notes.push(`${GENDER_WORD[gender] ?? gender} noun: the gender decides how adjectives, का / के / की and the verb agree with it.`);
  if (genders.length > 1) {
    const other = rows.filter((r) => r.morph.Gender && r.morph.Gender !== gender);
    const differing = other.filter((r) => !cells.some((c) => c.features.Case === r.morph.Case && c.features.Number === r.morph.Number && c.form === nfc(r.form)));
    notes.push(`The word list allows both genders for this word; the forms are the ${GENDER_WORD[gender ?? 'Masc']} ones.${differing.length ? ` As a ${GENDER_WORD[other[0].morph.Gender]} noun it differs in: ${[...new Set(differing.map((r) => `${r.morph.Case === 'Dir' ? 'direct' : r.morph.Case === 'Obl' ? 'oblique' : 'vocative'} ${r.morph.Number === 'Plur' ? 'plural' : 'singular'} ${nfc(r.form)}`))].join(', ')}.` : ''}`);
  }
  notes.push('The oblique stands before every postposition: को, से, में, पर, का / के / की, तक, के लिए, ने (लड़के को, घरों में, लड़के ने). The direct has no postposition. Where the oblique singular looks like the direct (घर), only a following postposition tells them apart.');
  notes.push('The vocative is the form used to call someone (लड़के!); the plural vocative drops the nasal of the oblique plural (लड़को!).');
  if (listed.info?.invariant) notes.push('The word list marks this noun as one that does not change in the singular (पिता, राजा).');
  const template = gender ? nounTemplate(lemma, gender, !!listed.info?.invariant) : undefined;
  return { kind: 'noun-declension', cells, layout: NOUN_LAYOUT, notes, ...(template ? { template } : {}) };
}

// ───────────────────────────── adjectives (and possessives) ─────────────────────────────

const ADJ_LAYOUT: ParadigmLayout = {
  columns: { key: 'Number', values: NUMBER_COLS },
  rows: { key: 'Case', values: [...CASE_ROWS, ['', 'any case (the feminine does not change)']] },
  sections: ['Gender'],
  labels: { Gender: { Masc: 'masculine', Fem: 'feminine', '': 'does not agree' } },
};

function adjectiveParadigm(lemma: string, pos: PartOfSpeech, listed: NonNullable<ReturnType<HiParadigmContext['listed']>>): GeneratedParadigm | undefined {
  let rows = inflectHindi(lemma, pos, listed.info);
  // an ordinal in -वाँ (पाँचवाँ) agrees, but the rules know only -ा: the word list writes out its forms
  if (rows.length <= 1 && listed.forms.some((f) => f.morph.Gender)) rows = listed.forms.map((f) => ({ form: f.form, morph: f.morph }));
  if (!rows.length) return undefined;
  const cells = withVariants(rows.map((r) => ({ features: hindiCellFeatures(pos, r.morph) ?? {}, form: nfc(r.form) })), listed, pos);
  const agrees = cells.some((c) => c.features.Gender);
  const notes: string[] = [];
  if (agrees) {
    notes.push('The adjective agrees with its noun in gender and number: -ा masculine singular, -े masculine plural and before a postposition, -ी feminine. The masculine direct plural and the oblique forms look alike (-े).');
    notes.push('The feminine has no case: the same -ी form stands before a postposition and without one. The vocative (dictionary table only) of the masculine is the -े form.');
  } else {
    notes.push('This adjective does not change: the same form stands with every noun, gender, number and case (सुंदर लड़का, सुंदर लड़की, सुंदर लड़के).');
  }
  if (pos === 'DET' && cells.some((c) => c.features.Gender)) notes.push('A possessive agrees with the thing possessed, not with the owner: मेरा घर, मेरी किताब, मेरे घर में.');
  notes.push('The word list gives an adjective no degree: the comparative (से अधिक) and the superlative (सबसे) are constructions.');
  const template = agrees
    ? lemma.length > 2 && lemma.endsWith('या') ? 'adjective in -या (नया: नए, नई)' : lemma.endsWith('ाँ') ? 'ordinal in -वाँ' : 'adjective in -ा (agrees: -ा / -े / -ी)'
    : 'adjective that does not change (सुंदर)';
  return { kind: pos === 'DET' ? 'determiner-paradigm' : 'adjective-declension', cells, layout: ADJ_LAYOUT, notes, template };
}

// ───────────────────────────── pronouns ─────────────────────────────

const PRON_LAYOUT: ParadigmLayout = {
  columns: { key: 'Adp', values: [['', 'the form on its own'], ['से', '+ से'], ['में', '+ में'], ['पर', '+ पर'], ['तक', '+ तक']] },
  rows: { key: 'Case', values: [['Dir', 'direct'], ['Obl', 'oblique stem (before a postposition)'], ['Erg', 'with ने (ergative)'], ['Dat', 'to / for (को)'], ['Gen', 'of (का)']] },
  sections: ['Number'],
  labels: { Number: { Sing: 'singular', Plur: 'plural' } },
};
/** The emphatic forms (यही, इसी: the pronoun + ही) are readings of their own in the closed table; they are not cells of the pronoun. */
const EMPHATIC = new Set(['यही', 'वही', 'इसी', 'उसी', 'इन्हीं', 'उन्हीं']);
const POSTP = ['से', 'में', 'पर'];
/** The possessive words that are not the oblique stem + का (morph-pronoun.ts `poss`). */
const POSS_OF: Record<string, string> = { 'मैं': 'मेरा', 'हम': 'हमारा', 'तू': 'तेरा', 'तुम': 'तुम्हारा' };

function pronounParadigm(lemma: string, pos: PartOfSpeech): GeneratedParadigm | undefined {
  const rows = inflectHindi(lemma, 'PRON').filter((r) => r.morph.Case && !EMPHATIC.has(nfc(r.form)));
  if (!rows.length) return undefined;
  const nonDir = rows.filter((r) => r.morph.Case !== 'Dir');
  const numberAxis = new Set(nonDir.map((r) => r.morph.Number).filter(Boolean)).size > 1;
  const f = (m: Features, extra: Features = {}): Features => {
    const base = hindiCellFeatures('PRON', m, { numberAxis: numberAxis && m.Case !== 'Dir' }) ?? {};
    return { ...base, ...extra };
  };
  const oblForms = new Set(rows.filter((r) => r.morph.Case === 'Obl').map((r) => nfc(r.form)));
  const cells: Cell[] = [];
  const withPp = (form: string): string | undefined => POSTP.find((pp) => form.endsWith(pp) && form.length > pp.length + 1);
  for (const r of rows.filter((x) => x.morph.Case === 'Dir')) cells.push({ features: f(r.morph), form: nfc(r.form) });
  for (const r of rows.filter((x) => x.morph.Case === 'Obl' && !withPp(nfc(x.form)))) cells.push({ features: f(r.morph), form: nfc(r.form) });
  for (const r of rows.filter((x) => x.morph.Case === 'Erg')) cells.push({ features: f(r.morph), form: nfc(r.form) });
  // the fused dative (मुझे) first, then the word written with को (मुझको)
  const dat = rows.filter((x) => x.morph.Case === 'Dat');
  for (const r of [...dat.filter((x) => !nfc(x.form).endsWith('को')), ...dat.filter((x) => nfc(x.form).endsWith('को'))]) cells.push({ features: f(r.morph), form: nfc(r.form) });
  for (const r of rows.filter((x) => x.morph.Case === 'Obl')) {
    const pp = withPp(nfc(r.form));
    if (pp) cells.push({ features: f(r.morph, { Adp: pp }), form: nfc(r.form) });
  }
  // the genitive: the fused one of the relative / interrogative pronouns (जिसका), or the possessive word of a personal one (मेरा)
  const gens = rows.filter((x) => x.morph.Case === 'Gen' && x.morph.Gender === 'Masc' && x.morph.Number === 'Sing');
  if (gens.length) {
    for (const g of gens) cells.push({ features: f(g.morph), form: nfc(g.form), note: 'agrees like का / के / की with the thing owned' });
  } else {
    // a personal pronoun's possessive is a word of its own (मेरा), or its oblique stem + का (उसका)
    const stem = [...oblForms].sort((a, b) => a.length - b.length)[0];
    const cand = POSS_OF[lemma] ?? (stem ? `${stem}का` : undefined);
    const head = cand ? inflectHindi(cand, 'DET').find((x) => x.morph.Poss === 'Yes' && x.morph.Gender === 'Masc' && x.morph.Number === 'Sing' && x.morph.Case === 'Dir') : undefined;
    if (cand && head) cells.push({ features: f({ Case: 'Gen', ...(numberAxis ? { Number: 'Sing' } : {}) }), form: nfc(head.form), note: `a possessive word that agrees like an adjective (${nfc(cand)}: -ा / -े / -ी)` });
  }
  const notes = [
    'Before a postposition a pronoun takes its oblique stem (मुझ + से = मुझसे); the postposition is written onto the stem. The form with ने (मैंने) and the fused dative (मुझे) are forms of their own.',
    'The से row of the dictionary\'s pronoun tables is flagged as an error by the dictionary itself: the से, में and पर forms here are the adapter\'s, formed by the rule.',
  ];
  const first = rows.find((r) => r.morph.Case === 'Dir')?.morph;
  if (first?.Person) notes.push(`${first.Polite === 'Form' ? 'Polite' : first.Polite === 'Fam' ? 'Familiar' : first.Polite === 'Infm' ? 'Intimate' : ''} ${first.Person === '1' ? 'first' : first.Person === '2' ? 'second' : 'third'} person${first.Number ? (first.Number === 'Plur' ? ', plural' : ', singular') : ''}.`.trim().replace(/^./, (c) => c.toUpperCase()));
  return { kind: pos === 'DET' ? 'determiner-paradigm' : 'pronoun-paradigm', cells: dedupe(cells), layout: PRON_LAYOUT, notes, template: 'closed pronoun table (the word list gives every form)' };
}


// ───────────────────────────── verbs ─────────────────────────────

const VERB_LAYOUT: ParadigmLayout = {
  columns: { key: 'Number', values: NUMBER_COLS },
  rows: { key: 'Person', values: [['', 'one cell (agrees with gender and number, not person)'], ['1', 'first person (मैं, हम)'], ['2', 'second person (तू, तुम, आप)'], ['3', 'third person (वह, वे)']] },
  sections: ['VerbForm', 'Mood', 'Tense', 'Aspect', 'Gender', 'Case', 'Polite'],
  labels: {
    VerbForm: { Stem: 'stem', Inf: 'infinitive (stem + ना)', Part: 'participle', Conv: 'conjunctive (having done)', Fin: 'finite forms' },
    Mood: { Ind: 'indicative', Sub: 'subjunctive', Imp: 'command' },
    Tense: { Pres: 'present (होना)', Past: 'past (होना)', Fut: 'future' },
    Aspect: { Imp: 'habitual (imperfective) participle: stem + ता', Perf: 'perfective participle (also the simple past)' },
    Gender: { Masc: 'masculine', Fem: 'feminine' },
    Case: { Dir: 'direct', Obl: 'oblique' },
    Polite: { Infm: 'to तू (intimate)', Fam: 'to तुम (familiar)', Form: 'to आप (polite)' },
  },
};

const FORM_RANK: Record<string, number> = { Stem: 0, Inf: 1, Part: 2, Conv: 3, Fin: 4 };
const MOOD_RANK: Record<string, number> = { Sub: 0, Ind: 1, Imp: 2 };
const verbRank = (c: Cell): number[] => {
  const f = c.features;
  return [FORM_RANK[f.VerbForm ?? ''] ?? 9, f.Aspect === 'Perf' ? 1 : 0, MOOD_RANK[f.Mood ?? ''] ?? 9, f.Tense === 'Pres' ? 0 : f.Tense === 'Past' ? 1 : f.Tense === 'Fut' ? 2 : -1, f.Gender === 'Fem' ? 1 : 0, f.Case === 'Obl' ? 1 : 0, ['Infm', 'Fam', 'Form'].indexOf(f.Polite ?? ''), Number(f.Person ?? 0), f.Number === 'Plur' ? 1 : 0];
};
const cmpRank = (a: number[], b: number[]): number => { for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return a[i] - b[i]; return 0; };

const CONSTRUCTION_NOTE = 'Not cells, because they are built with other words. The AUXILIARY carries the tense (है, था, होगा) and the PARTICIPLE carries the aspect and the agreement in gender and number: habitual present = habitual participle + है (करता है), habitual past = habitual participle + था, progressive = stem + रहा + है / था (कर रहा है), present perfect = perfective participle + है (किया है), pluperfect = perfective participle + था. The perfective participle on its own is the simple past (उसने किया). A participle is a piece of these constructions, never the whole tense.';
const LIGHT_NOTE = 'A verb of this table can also be the second part of a compound verb (कर दिया, उठ गया: the stem + देना / जाना / लेना … adds a shade of meaning) or the light verb of a conjunct verb (काम करना, घृणा करना: the noun carries the meaning, करना / होना carries the tense and person). Those combinations are constructions and have no table of their own; this table is the verb alone.';

function verbParadigm(lemma: string, pos: PartOfSpeech, listed: ReturnType<HiParadigmContext['listed']>, guessed: boolean): GeneratedParadigm | undefined {
  const info = listed?.info;
  const rows = inflectHindi(lemma, pos, info);
  if (!rows.length) return undefined;
  const primary: Cell[] = [];
  const dups: Cell[] = [];
  for (const r of rows) {
    if (r.morph.Aspect === 'Prog') continue; // the progressive auxiliary reading of रहा is the perfective participle's cell
    const features = hindiCellFeatures(pos, r.morph);
    if (!features) continue;
    // the feminine -ी before a plural helping verb (रही हैं) is not the plural cell's own form (the -ीं form is)
    const auxPlural = r.morph.VerbForm === 'Part' && r.morph.Gender === 'Fem' && r.morph.Number === 'Plur' && !/[ंँ]$/.test(r.form);
    (auxPlural ? dups : primary).push({ features, form: nfc(r.form) });
  }
  for (const d of dups) {
    const main = primary.find((p) => featureKey(p.features) === featureKey(d.features));
    if (main) main.note ??= `the feminine -ी (${d.form}) stands for the plural too before a plural helping verb (रही हैं, गई थीं)`;
  }
  const sorted = dedupe([...primary].sort((a, b) => cmpRank(verbRank(a), verbRank(b))));
  const cells = dedupe([...sorted, ...dups, ...spellingVariants(sorted), ...handVariants(sorted, listed, pos)]);
  const stem = lemma.slice(0, -2);
  const cls = stemClass(stem);
  const notes: string[] = [];
  if (guessed) notes.push(`Guessed from the ending: ${lemma} is not in the word list, so these are the forms the regular rules give a verb with the stem ${stem}, unconfirmed. Hindi verbs are mostly regular, but an irregular perfective or a stem the rules cannot see would not show here.`);
  notes.push(CONSTRUCTION_NOTE);
  notes.push(LIGHT_NOTE);
  notes.push('The future is the subjunctive + -गा / -गी / -गे, agreeing with the doer in gender (करूँगा, करेगी); the plain subjunctive (करूँ, करे) is the same cell without -गा. The form shared by several persons is one cell for each person.');
  if (info?.ergative === true) notes.push('The word list says this verb takes ने in the perfective: उसने किया, and the participle then agrees with the object.');
  else if (info?.ergative === false) notes.push('The word list says this verb does not take ने in the perfective: वह गया, and the participle agrees with the doer.');
  if (info?.causativeOf) notes.push(`A causative of ${info.causativeOf} (to have / make someone do it). The cells carry no mark for this: the analysis marks every form Voice=Cau.`);
  if (stem === 'रह') notes.push('रहा / रही / रहे is also the progressive auxiliary (कर रहा है): the same word, so the same cell.');
  if (stem === 'हो') notes.push('होना is the verb "to be / to become": the present (हूँ, है, हैं, हो) and past (था, थी, थे, थीं) are single words of this verb and are cells here; as an auxiliary it builds the constructions above.');
  if (cells.some((c) => c.features.VerbForm === 'Conv')) notes.push('The conjunctive (having done) is the stem + कर, or + के; the usual spelling of the joined form is करके (stem + कर + के). The rules give stem + कर and stem + के.');
  if (!cells.some((c) => c.features.Mood === 'Sub')) notes.push('No subjunctive, future or command is generated for this verb.');
  const irregular = IRREG[stem] ? 'irregular verb (some forms listed by hand)' : cls ? ({ C: 'verb with a consonant stem', A: 'verb with a stem in -ा', I: 'verb with a stem in -ी', U: 'verb with a stem in -ू', E: 'verb with a stem in -े', O: 'verb with a stem in -ो' } as const)[cls] : undefined;
  return { kind: 'verb-conjugation', cells, layout: VERB_LAYOUT, notes, constructions: [...HI_VERB_CONSTRUCTIONS], ...(irregular && !guessed ? { template: irregular } : {}) };
}

// ───────────────────────────── the adapter's method ─────────────────────────────

/** `LanguageAdapter.paradigm`: the generated paradigm of a word of the list (or a verb in -ना, guessed), else undefined. */
export function hiParadigm(lemma: string, pos: PartOfSpeech, hint: { features?: Features; surface?: string } | undefined, ctx: HiParadigmContext): GeneratedParadigm | undefined {
  const l = nfc(lemma).trim();
  if (!l || /\s/u.test(l)) return undefined;
  switch (pos) {
    case 'NOUN': case 'PROPN': {
      const listed = ctx.listed(l, pos);
      return listed ? nounParadigm(l, pos, listed, hint) : undefined;
    }
    case 'ADJ': case 'NUM': {
      const listed = ctx.listed(l, pos);
      return listed ? adjectiveParadigm(l, 'ADJ', listed) : undefined;
    }
    case 'DET': {
      const listed = ctx.listed(l, 'DET');
      if (!listed) return undefined;
      const rows = inflectHindi(l, 'DET', listed.info);
      return rows.some((r) => r.morph.Case === 'Erg' || r.morph.Case === 'Dat') ? pronounParadigm(l, 'DET') : adjectiveParadigm(l, 'DET', listed);
    }
    case 'PRON': {
      const listed = ctx.listed(l, 'PRON');
      if (!listed) return undefined;
      const rows = inflectHindi(l, 'PRON');
      // a possessive (मेरा) listed as a pronoun has an adjective's forms
      if (!rows.length) return adjectiveParadigm(l, 'DET', listed);
      return pronounParadigm(l, 'PRON');
    }
    case 'VERB': case 'AUX': {
      const listed = ctx.listed(l, pos) ?? ctx.listed(l, pos === 'VERB' ? 'AUX' : 'VERB');
      if (listed) return verbParadigm(l, pos, listed, false);
      const stem = l.endsWith('ना') && l.length > 3 ? l.slice(0, -2) : undefined;
      if (!stem || !stemClass(stem) || !validStemStart(stem)) return undefined;
      return verbParadigm(l, 'VERB', undefined, true);
    }
    default: return undefined;
  }
}

// ───────────────────────────── the dictionary half, merged ─────────────────────────────

export interface HiTableRow { form: string; tags: readonly string[] }

/** Split a table's rows where a new inflection template starts (an entry of two genders has two tables back to back). */
function segments(rows: readonly HiTableRow[]): HiTableRow[][] {
  const out: HiTableRow[][] = [];
  for (const r of rows) {
    if (r.tags.includes('table-tags') || out.length === 0) out.push([]);
    out[out.length - 1].push(r);
  }
  return out.filter((s) => s.length);
}

const DEFAULT_KIND: Partial<Record<PartOfSpeech, Paradigm['kind']>> = {
  NOUN: 'noun-declension', PROPN: 'noun-declension', ADJ: 'adjective-declension', DET: 'determiner-paradigm', VERB: 'verb-conjugation', AUX: 'verb-conjugation', PRON: 'pronoun-paradigm',
};

export interface HiTableCells { cells: Cell[]; skipped: Record<string, number>; unknown: string[]; tables: number }

/**
 * The dictionary's cells for one lexeme: the rows (`form` and `tags` as kaikki gives them) mapped with `hiTableTagsDetail`
 * (a row that stands for several persons gives several cells). When the entry has more than one table (a noun of two
 * genders) the table that agrees best with the generated forms is used. A form of more than one word is a construction
 * (or a light-verb form) and is not a cell.
 */
export function hiTableCells(rows: readonly HiTableRow[], pos: PartOfSpeech, generated?: GeneratedParadigm): HiTableCells {
  const skipped: Record<string, number> = {};
  const unknown = new Set<string>();
  const gen = new Map((generated?.cells ?? []).map((c) => [featureKey(c.features), new Set<string>([nfc(c.form)])] as const));
  for (const c of generated?.cells ?? []) gen.get(featureKey(c.features))!.add(nfc(c.form));
  const mapTable = (seg: readonly HiTableRow[]): { cells: Cell[]; score: number } => {
    const cells: Cell[] = [];
    let score = 0;
    for (const r of seg) {
      const d = hiTableTagsDetail(r.tags, pos, r.form);
      for (const t of d.unknown) unknown.add(t);
      if (d.skipped) { skipped[d.skipped] = (skipped[d.skipped] ?? 0) + 1; continue; }
      const verbal = pos === 'VERB' || pos === 'AUX';
      const form = nfc(r.form.trim());
      if (!form) continue;
      // a verb form of more than one word is a construction (the one-word check is the mapper's; this catches the rest)
      if (verbal && !isSingleWord(form)) { skipped.construction = (skipped.construction ?? 0) + 1; continue; }
      for (const b of d.bundles) {
        cells.push({ features: b, form });
        if (gen.get(featureKey(b))?.has(form)) score++;
      }
    }
    return { cells, score };
  };
  // a verb's rows are one table (the entry's second table holds the compound tenses); a noun of two genders has two
  const segs = pos === 'VERB' || pos === 'AUX' ? [[...rows]] : segments(rows);
  const mapped = segs.map(mapTable);
  // the table that agrees best (the first on a tie)
  let best = 0;
  mapped.forEach((m, i) => { if (m.score > mapped[best].score) best = i; });
  // the dictionary's spelling that agrees with the rules goes first (a cell lists पे and पर; the rules' form is पर)
  const chosen = [...(mapped[best]?.cells ?? [])].map((c, i) => ({ c, i, hit: gen.get(featureKey(c.features))?.has(c.form) ? 0 : 1 })).sort((a, b) => a.hit - b.hit || a.i - b.i).map((x) => x.c);
  return { cells: chosen, skipped, unknown: [...unknown], tables: segs.length };
}

/**
 * The paradigm of a lexeme with the dictionary's table merged in (verified / supported / generated / conflicted per
 * cell). Returns undefined when neither the adapter nor the table has a cell.
 */
export function hiParadigmFromTable(
  lemma: string, pos: PartOfSpeech, rows: readonly HiTableRow[], ctx: HiParadigmContext,
  opts: { dictionarySource?: { id: string; label: string; licence?: string }; hint?: { features?: Features; surface?: string }; analyzerId?: string } = {},
): Paradigm | undefined {
  const g = hiParadigm(lemma, pos, opts.hint, ctx);
  const t = hiTableCells(rows, pos, g);
  if (!g && t.cells.length === 0) return undefined;
  const base: Omit<Paradigm, 'cells' | 'status'> = {
    languageId: 'hi', lemma, pos, kind: g?.kind ?? DEFAULT_KIND[pos] ?? 'none',
    ...(g?.layout ? { layout: g.layout } : {}),
    ...(g?.template ? { template: g.template } : {}),
    notes: g?.notes ?? ['The adapter does not generate this word (it is not in the word list): the forms are the dictionary\'s table alone.'],
    sources: [
      ...(g ? [{ id: opts.analyzerId ?? 'adapter-hi', label: 'Hindi word-form rules and word list (machine-drafted, no native review)' }] : []),
      ...(t.cells.length ? [opts.dictionarySource ?? { id: 'kaikki-hi', label: 'Wiktionary Hindi inflection tables via kaikki.org', licence: 'CC BY-SA 4.0' }] : []),
    ],
    ...(g?.constructions ? { constructions: g.constructions } : {}),
  };
  return mergeParadigm(base, g?.cells ?? [], t.cells);
}

export type { ParadigmCell };
