/**
 * Hindi verb forms by rule: generation (package H2, docs/PLAN12.md). Machine-drafted from the author's own knowledge
 * of Hindi grammar; no external source. Analysis (morph-verb-read.ts) generates the same forms and keeps what matches,
 * so the two cannot disagree.
 *
 * A verb stem falls into one of six classes by its last letter: C (consonant: कर, देख), A (-ा: जा, खा, आ),
 * I (-ी: पी, जी, सी), U (-ू: छू), E (-े: ले, दे), O (-ो: सो, रो, हो). Endings are written as independent vowels
 * (ऊँ, ए, ओ, इए); `vend` turns them into matras after a consonant, drops or shortens the stem's vowel where the
 * spelling needs it (पी → पि+ए, छू → छु+आ, ले → ल+ूँ) and `fixNasal` writes ें not ेँ.
 */
import { fixNasal, glide, join, kindOf, shorten, uniq } from './morph-orth';

export type Cls = 'C' | 'A' | 'I' | 'U' | 'E' | 'O';

export function stemClass(stem: string): Cls | undefined {
  switch (kindOf(stem)) {
    case 'C': return 'C';
    case 'aa': return 'A';
    case 'ii': return 'I';
    case 'uu': return 'U';
    case 'e': return 'E';
    case 'o': return 'O';
    default: return undefined;
  }
}

/** A stem begins with a consonant or an independent vowel (never with a bare sign). */
export function validStemStart(stem: string): boolean {
  if (!stem) return false;
  const c = stem.charCodeAt(0);
  return (c >= 0x905 && c <= 0x914) || (c >= 0x915 && c <= 0x939) || (c >= 0x958 && c <= 0x95f);
}

export interface Slot {
  id: string;
  /** In plain words, for the `rule`. */
  label: string;
  /** One reading per entry (a form that is two things in one slot, e.g. ती: feminine singular or plural). */
  morphs: Array<Record<string, string>>;
  /** How diagnostic the ending is when the lemma is not known (0 = never guessed from). */
  evid: number;
  build(stem: string, cls: Cls): string[];
  /** The slot exists only for irregular stems (the copula). */
  irregOnly?: boolean;
}

function vend(stem: string, cls: Cls, ending: string): string {
  switch (cls) {
    case 'C': return join(stem, ending);
    case 'A': case 'O': return stem + ending;
    case 'I': case 'U': return shorten(stem) + ending;
    case 'E': {
      const base = stem.slice(0, -1);
      const first = ending[0];
      const rest = ending.slice(1);
      if (first === 'ऊ') return base + 'ू' + rest;
      if (first === 'ए') return stem + rest;
      if (first === 'ओ') return base + 'ो' + rest;
      return stem + ending;
    }
  }
}

/** The perfective participle: 0 masculine singular, 1 masculine plural, 2 feminine singular, 3 feminine plural. */
function perf(stem: string, cls: Cls, n: number): string {
  switch (cls) {
    case 'C': return stem + ['ा', 'े', 'ी', 'ीं'][n];
    case 'A': case 'O': return stem + ['या', 'ए', 'ई', 'ईं'][n];
    case 'I': { const s = shorten(stem); return n === 0 ? s + 'या' : n === 1 ? s + 'ए' : n === 2 ? stem : stem + 'ं'; }
    case 'E': { const b = stem.slice(0, -1); return b + ['िया', 'िए', 'ी', 'ीं'][n]; }
    case 'U': return shorten(stem) + ['आ', 'ए', 'ई', 'ईं'][n];
  }
}

function impFam(stem: string, cls: Cls): string[] {
  switch (cls) {
    case 'C': return [join(stem, 'ओ')];
    case 'A': case 'O': return [stem + 'ओ'];
    case 'I': return [shorten(stem) + 'यो', shorten(stem) + 'ओ', stem + 'ओ'];
    case 'U': return [shorten(stem) + 'ओ', stem + 'ओ'];
    case 'E': return [stem.slice(0, -1) + 'ो'];
  }
}

function impForm(stem: string, cls: Cls, fut: boolean): string[] {
  const g = fut ? 'गा' : '';
  switch (cls) {
    case 'C': return [join(stem, 'इए') + g];
    case 'A': case 'O': return [stem + 'इए' + g];
    case 'U': return [stem + 'इए' + g, shorten(stem) + 'इए' + g];
    case 'I': return [stem + 'जिए' + g];
    case 'E': return [stem.slice(0, -1) + 'ीजिए' + g];
  }
}

const sfx = (s: string) => (stem: string) => [stem + s];
const V = (ending: string) => (stem: string, cls: Cls) => [fixNasal(vend(stem, cls, ending))];
const PF = (n: number) => (stem: string, cls: Cls) => [perf(stem, cls, n)];
const none = (): string[] => [];

const PART_I = { VerbForm: 'Part', Aspect: 'Imp' };
const PART_P = { VerbForm: 'Part', Aspect: 'Perf' };
const SUB = { VerbForm: 'Fin', Mood: 'Sub' };
const FUT = { VerbForm: 'Fin', Mood: 'Ind', Tense: 'Fut' };
const IMP = { VerbForm: 'Fin', Mood: 'Imp', Person: '2' };
const COP = { VerbForm: 'Fin', Mood: 'Ind', Tense: 'Pres' };
const PAST = { VerbForm: 'Fin', Mood: 'Ind', Tense: 'Past' };

export const SLOTS: Slot[] = [
  { id: 'inf', label: 'infinitive (stem + ना)', morphs: [{ VerbForm: 'Inf', Gender: 'Masc', Case: 'Dir' }], evid: 0.58, build: sfx('ना') },
  { id: 'inf_obl', label: 'oblique infinitive (stem + ने)', morphs: [{ VerbForm: 'Inf', Gender: 'Masc', Case: 'Obl' }], evid: 0.5, build: sfx('ने') },
  { id: 'inf_f', label: 'feminine infinitive (stem + नी)', morphs: [{ VerbForm: 'Inf', Gender: 'Fem' }], evid: 0.45, build: sfx('नी') },
  { id: 'ipf_ms', label: 'imperfective participle (stem + ता)', morphs: [{ ...PART_I, Gender: 'Masc', Number: 'Sing' }], evid: 0.58, build: sfx('ता') },
  { id: 'ipf_mp', label: 'imperfective participle (stem + ते)', morphs: [{ ...PART_I, Gender: 'Masc', Number: 'Plur' }, { ...PART_I, Gender: 'Masc', Number: 'Sing', Case: 'Obl' }], evid: 0.58, build: sfx('ते') },
  { id: 'ipf_fs', label: 'imperfective participle (stem + ती)', morphs: [{ ...PART_I, Gender: 'Fem', Number: 'Sing' }, { ...PART_I, Gender: 'Fem', Number: 'Plur' }], evid: 0.55, build: sfx('ती') },
  { id: 'ipf_fp', label: 'imperfective participle (stem + तीं)', morphs: [{ ...PART_I, Gender: 'Fem', Number: 'Plur' }], evid: 0.58, build: sfx('तीं') },
  { id: 'pf_ms', label: 'perfective participle', morphs: [{ ...PART_P, Gender: 'Masc', Number: 'Sing' }], evid: 0.3, build: PF(0) },
  { id: 'pf_mp', label: 'perfective participle', morphs: [{ ...PART_P, Gender: 'Masc', Number: 'Plur' }], evid: 0.25, build: PF(1) },
  { id: 'pf_f', label: 'perfective participle', morphs: [{ ...PART_P, Gender: 'Fem', Number: 'Sing' }], evid: 0.25, build: PF(2) },
  { id: 'pf_fp', label: 'perfective participle', morphs: [{ ...PART_P, Gender: 'Fem', Number: 'Plur' }], evid: 0.4, build: PF(3) },
  { id: 'conv_kar', label: 'conjunctive (stem + कर)', morphs: [{ VerbForm: 'Conv' }], evid: 0.5, build: sfx('कर') },
  { id: 'conv_ke', label: 'conjunctive (stem + के)', morphs: [{ VerbForm: 'Conv' }], evid: 0.3, build: sfx('के') },
  { id: 'sub_1s', label: 'subjunctive, first person singular', morphs: [{ ...SUB, Person: '1', Number: 'Sing' }], evid: 0.4, build: V('ऊँ') },
  { id: 'sub_23s', label: 'subjunctive, second / third person singular', morphs: [{ ...SUB, Person: '2,3', Number: 'Sing' }], evid: 0.22, build: V('ए') },
  { id: 'sub_13p', label: 'subjunctive, first / third person plural (also polite आप)', morphs: [{ ...SUB, Person: '1,2,3', Number: 'Plur' }], evid: 0.25, build: V('एँ') },
  { id: 'sub_2p', label: 'subjunctive, तुम', morphs: [{ ...SUB, Person: '2', Polite: 'Fam' }], evid: 0.25, build: V('ओ') },
  { id: 'fut_1sm', label: 'future, first person singular masculine', morphs: [{ ...FUT, Person: '1', Number: 'Sing', Gender: 'Masc' }], evid: 0.58, build: V('ऊँगा') },
  { id: 'fut_1sf', label: 'future, first person singular feminine', morphs: [{ ...FUT, Person: '1', Number: 'Sing', Gender: 'Fem' }], evid: 0.58, build: V('ऊँगी') },
  { id: 'fut_23sm', label: 'future, second / third person singular masculine', morphs: [{ ...FUT, Person: '2,3', Number: 'Sing', Gender: 'Masc' }], evid: 0.58, build: V('एगा') },
  { id: 'fut_23sf', label: 'future, second / third person singular feminine', morphs: [{ ...FUT, Person: '2,3', Number: 'Sing', Gender: 'Fem' }], evid: 0.58, build: V('एगी') },
  { id: 'fut_pm', label: 'future, first / third person plural masculine (also polite आप)', morphs: [{ ...FUT, Person: '1,2,3', Number: 'Plur', Gender: 'Masc' }], evid: 0.58, build: V('एँगे') },
  { id: 'fut_pf', label: 'future, first / third person plural feminine (also polite आप)', morphs: [{ ...FUT, Person: '1,2,3', Number: 'Plur', Gender: 'Fem' }], evid: 0.58, build: V('एँगी') },
  { id: 'fut_2pm', label: 'future, तुम masculine', morphs: [{ ...FUT, Person: '2', Polite: 'Fam', Gender: 'Masc' }], evid: 0.55, build: V('ओगे') },
  { id: 'fut_2pf', label: 'future, तुम feminine', morphs: [{ ...FUT, Person: '2', Polite: 'Fam', Gender: 'Fem' }], evid: 0.55, build: V('ओगी') },
  { id: 'imp_infm', label: 'command to तू (the bare stem)', morphs: [{ ...IMP, Polite: 'Infm' }], evid: 0, build: (s) => [s] },
  { id: 'imp_fam', label: 'command to तुम (stem + ओ)', morphs: [{ ...IMP, Polite: 'Fam' }], evid: 0.25, build: impFam },
  { id: 'imp_form', label: 'polite command to आप (stem + इए)', morphs: [{ ...IMP, Polite: 'Form' }], evid: 0.55, build: (s, c) => impForm(s, c, false) },
  { id: 'imp_formfut', label: 'polite command to आप, later (stem + इएगा)', morphs: [{ ...IMP, Polite: 'Form', Tense: 'Fut' }], evid: 0.55, build: (s, c) => impForm(s, c, true) },
  { id: 'stem', label: 'bare stem', morphs: [{ VerbForm: 'Stem' }], evid: 0, build: (s) => [s] },
  { id: 'cop_1s', label: 'present of होना, first person singular', morphs: [{ ...COP, Person: '1', Number: 'Sing' }], evid: 0, build: none, irregOnly: true },
  { id: 'cop_23s', label: 'present of होना, second / third person singular', morphs: [{ ...COP, Person: '2,3', Number: 'Sing' }], evid: 0, build: none, irregOnly: true },
  { id: 'cop_p', label: 'present of होना, plural', morphs: [{ ...COP, Person: '1,2,3', Number: 'Plur' }], evid: 0, build: none, irregOnly: true },
  { id: 'cop_2p', label: 'present of होना, तुम', morphs: [{ ...COP, Person: '2', Polite: 'Fam' }], evid: 0, build: none, irregOnly: true },
  { id: 'cop_pms', label: 'past of होना, masculine singular', morphs: [{ ...PAST, Gender: 'Masc', Number: 'Sing' }], evid: 0, build: none, irregOnly: true },
  { id: 'cop_pmp', label: 'past of होना, masculine plural', morphs: [{ ...PAST, Gender: 'Masc', Number: 'Plur' }], evid: 0, build: none, irregOnly: true },
  { id: 'cop_pfs', label: 'past of होना, feminine singular', morphs: [{ ...PAST, Gender: 'Fem', Number: 'Sing' }], evid: 0, build: none, irregOnly: true },
  { id: 'cop_pfp', label: 'past of होना, feminine plural', morphs: [{ ...PAST, Gender: 'Fem', Number: 'Plur' }], evid: 0, build: none, irregOnly: true },
];

/** Slots whose forms an irregular stem lists itself (the rest are regular). Canonical spelling first. */
export const IRREG: Record<string, Record<string, string[]>> = {
  'जा': { pf_ms: ['गया'], pf_mp: ['गए'], pf_f: ['गई'], pf_fp: ['गईं'] }, // गये / गयी / गयीं come from the shared glide rule
  'कर': { pf_ms: ['किया'], pf_mp: ['किए'], pf_f: ['की'], pf_fp: ['कीं'], imp_form: ['कीजिए', 'करिए'], imp_formfut: ['कीजिएगा', 'करिएगा'] },
  'हो': {
    pf_ms: ['हुआ'], pf_mp: ['हुए'], pf_f: ['हुई'], pf_fp: ['हुईं'],
    cop_1s: ['हूँ'], cop_23s: ['है'], cop_p: ['हैं'], cop_2p: ['हो'],
    cop_pms: ['था'], cop_pmp: ['थे'], cop_pfs: ['थी'], cop_pfp: ['थीं'],
    sub_1s: ['होऊँ'], sub_23s: ['हो'], sub_13p: ['हों'], sub_2p: ['हो'],
    fut_1sm: ['हूँगा', 'होऊँगा'], fut_1sf: ['हूँगी', 'होऊँगी'], fut_23sm: ['होगा'], fut_23sf: ['होगी'],
    fut_pm: ['होंगे'], fut_pf: ['होंगी'], fut_2pm: ['होगे', 'होओगे'], fut_2pf: ['होगी', 'होओगी'],
    imp_fam: ['हो', 'होओ'], imp_form: ['होइए'], imp_formfut: ['होइएगा'],
  },
};

export const SLOT_BY_ID = new Map(SLOTS.map((s, i) => [s.id, i] as const));

/** The canonical spellings of a slot for a stem (irregular list or the rule); empty when the slot does not exist for it. */
export function slotCanon(stem: string, cls: Cls, slot: Slot): string[] {
  const irr = IRREG[stem]?.[slot.id];
  if (irr) return irr;
  if (slot.irregOnly) return [];
  return slot.build(stem, cls);
}

/** Canonical spellings plus the spelling with the glide य (आए / आये, कीजिए / कीजिये). */
export function slotForms(stem: string, cls: Cls, slot: Slot): string[] {
  const c = slotCanon(stem, cls, slot);
  if (!c.length) return c;
  const out: string[] = [];
  for (const f of c) { out.push(f); const g = glide(f); if (g !== f) out.push(g); }
  return uniq(out);
}
