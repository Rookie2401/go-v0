/**
 * Other sources' grammatical labels → this adapter's features: a dictionary's labels (Wiktionary via kaikki.org) and
 * the tag strings of the UniParser Albanian analyzer. Unknown labels are ignored, never guessed. Package Q4 (dictionary
 * labels); the UniParser mapping is written once its real output has been seen.
 *
 * Conventions are those of types.ts: several values of one feature become a union in the conventional order
 * ('Gen,Dat'); a finite verb form (a mood, tense or person, and not a participle) gets VerbForm 'Fin'. The aorist is
 * Tense 'Past'; every non-active label (mediopassive, passive, non-active) is Voice 'Mid'. A label that is not listed
 * (including a bare "past" and "dialectal") is left out, not guessed.
 */

const LABELS: Readonly<Record<string, readonly [string, string]>> = {
  nominative: ['Case', 'Nom'], accusative: ['Case', 'Acc'], genitive: ['Case', 'Gen'], dative: ['Case', 'Dat'], ablative: ['Case', 'Abl'],
  singular: ['Number', 'Sing'], plural: ['Number', 'Plur'],
  definite: ['Definite', 'Def'], indefinite: ['Definite', 'Ind'],
  masculine: ['Gender', 'Masc'], feminine: ['Gender', 'Fem'], neuter: ['Gender', 'Neut'],
  'first-person': ['Person', '1'], 'second-person': ['Person', '2'], 'third-person': ['Person', '3'],
  present: ['Tense', 'Pres'], imperfect: ['Tense', 'Imp'], aorist: ['Tense', 'Past'],
  indicative: ['Mood', 'Ind'], subjunctive: ['Mood', 'Sub'], imperative: ['Mood', 'Imp'], optative: ['Mood', 'Opt'], admirative: ['Mood', 'Adm'],
  active: ['Voice', 'Act'], mediopassive: ['Voice', 'Mid'], passive: ['Voice', 'Mid'], 'non-active': ['Voice', 'Mid'],
  participle: ['VerbForm', 'Part'],
};

const ORDER: Readonly<Record<string, readonly string[]>> = {
  Case: ['Nom', 'Acc', 'Gen', 'Dat', 'Abl'], Number: ['Sing', 'Plur'], Gender: ['Masc', 'Fem', 'Neut'], Definite: ['Def', 'Ind'],
  Person: ['1', '2', '3'], Tense: ['Pres', 'Imp', 'Past'], Mood: ['Ind', 'Sub', 'Imp', 'Opt', 'Adm'], Voice: ['Act', 'Mid'],
};

export function sqMorphFromTags(tags: readonly string[]): Record<string, string> {
  const sets: Record<string, string[]> = {};
  for (const raw of tags) {
    const hit = LABELS[raw.normalize('NFC').trim().toLowerCase().replace(/\s+/g, '-')];
    if (!hit) continue;
    const [k, v] = hit;
    if (!(sets[k] ??= []).includes(v)) sets[k].push(v);
  }
  const out: Record<string, string> = {};
  for (const [k, vs] of Object.entries(sets)) {
    const order = ORDER[k];
    out[k] = (order ? [...vs].sort((a, b) => order.indexOf(a) - order.indexOf(b)) : vs).join(',');
  }
  if (!out.VerbForm && (out.Person || out.Tense || out.Mood)) out.VerbForm = 'Fin';
  return out;
}

// ───────────────────────────── the UniParser Albanian analyzer's tag strings ─────────────────────────────
//
// Written by the coordinator from the analyzer's real output (uniparser-albanian 2.3.0, MIT). A tag string is a comma
// list such as "NOUN,m,inanim,borr,it,sg,nom,def" or "V,vt,alb,deriv,2,sg,pres,ind,act". Etymology (alb, borr, lat, it,
// rom, slav, greek, turk …), animacy and transitivity tags are not morphology and are ignored here.

const UP_POS: Readonly<Record<string, string>> = {
  NOUN: 'NOUN', V: 'VERB', A: 'ADJ', ADV: 'ADV', PRO: 'PRON', NUM: 'NUM', PR: 'ADP', CONJ: 'CONJ', ART: 'DET', CLIT_PRO: 'PRON',
  PART: 'PART', VB_PART: 'PART', INTJ: 'INTJ',
};
const UP_TAGS: Readonly<Record<string, readonly [string, string]>> = {
  m: ['Gender', 'Masc'], f: ['Gender', 'Fem'], n: ['Gender', 'Neut'],
  sg: ['Number', 'Sing'], pl: ['Number', 'Plur'],
  nom: ['Case', 'Nom'], acc: ['Case', 'Acc'], abl: ['Case', 'Abl'], abl2: ['Case', 'Abl'],
  def: ['Definite', 'Def'], indef: ['Definite', 'Ind'],
  '1': ['Person', '1'], '2': ['Person', '2'], '3': ['Person', '3'],
  pres: ['Tense', 'Pres'], ipf: ['Tense', 'Imp'], aor: ['Tense', 'Past'],
  ind: ['Mood', 'Ind'], sbjv: ['Mood', 'Sub'], imp: ['Mood', 'Imp'], opt: ['Mood', 'Opt'], adm: ['Mood', 'Adm'],
  act: ['Voice', 'Act'], med: ['Voice', 'Mid'], pass: ['Voice', 'Mid'],
  ptcp: ['VerbForm', 'Part'],
};

export interface UniparserReading {
  /** This adapter's part of speech for the analyzer's first tag; undefined for a tag it does not use. */
  pos?: string;
  morph: Record<string, string>;
  /** The analyzer marks the form as Gheg ("Gheg") or as non-standard ("nonst"). */
  gheg: boolean;
  nonstandard: boolean;
  /** A preposition's case, from with_nom / with_acc / with_abl. */
  governs?: 'Nom' | 'Acc' | 'Abl';
  /** The linking article directly after a definite noun ("cont") or elsewhere ("dist"). */
  adjacent?: boolean;
  /** A fused pronoun pair: the analyzer's own labels, e.g. ['dat_1sg', 'acc_3sg']. */
  clitics: string[];
}

/** One analysis of the UniParser analyzer in this adapter's terms. Tags it does not know are ignored, never guessed. */
export function uniparserToReading(gramm: string): UniparserReading {
  const tags = gramm.split(',').map((t) => t.trim()).filter(Boolean);
  const sets: Record<string, string[]> = {};
  const add = (k: string, v: string) => { if (!(sets[k] ??= []).includes(v)) sets[k].push(v); };
  const out: UniparserReading = { pos: UP_POS[tags[0] ?? ''], morph: {}, gheg: false, nonstandard: false, clitics: [] };
  for (const t of tags) {
    const hit = UP_TAGS[t];
    if (hit) add(hit[0], hit[1]);
    else if (t === 'gen_dat') { add('Case', 'Gen'); add('Case', 'Dat'); }
    else if (t === 'unmkd') { add('Case', 'Nom'); add('Case', 'Acc'); } // the bare form: no case ending
    else if (t === 'mf') { add('Gender', 'Masc'); add('Gender', 'Fem'); }
    else if (t === 'Gheg') out.gheg = true;
    else if (t === 'nonst') out.nonstandard = true;
    else if (t === 'with_nom') out.governs = 'Nom';
    else if (t === 'with_acc') out.governs = 'Acc';
    else if (t === 'with_abl') out.governs = 'Abl';
    else if (t === 'cont') out.adjacent = true;
    else if (t === 'dist') out.adjacent = false;
    else if (/^(acc|dat)_[123](sg|pl)$/.test(t)) out.clitics.push(t);
  }
  for (const [k, vs] of Object.entries(sets)) {
    const order = ORDER[k];
    out.morph[k] = (order ? [...vs].sort((a, b) => order.indexOf(a) - order.indexOf(b)) : vs).join(',');
  }
  if (out.pos === 'VERB' && !out.morph.VerbForm && (out.morph.Tense || out.morph.Mood)) out.morph.VerbForm = 'Fin';
  return out;
}
