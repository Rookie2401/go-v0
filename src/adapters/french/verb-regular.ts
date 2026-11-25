/**
 * French verb generator, part 1: the form generator and the regular paradigms (MORPH package, docs/french/PLAN.md).
 * MACHINE-DRAFTED, not checked by a native speaker.
 *
 * A verb is described by a `VerbSpec`: every slot already expanded into written forms (a slot can hold alternatives:
 * paie / paye, assieds / assois). `generateForms` turns a spec into one `FrVerbForm` per cell (a record per cell, never a
 * merged record: "parle" is four cells, as in the Spanish engine; the analyser merges readings that differ only in person,
 * number or gender). The irregular tables are verb-irregular.ts, the choice of paradigm is verbs.ts.
 *
 * What is derived, never listed:
 *   - the subjonctif imparfait from the passé simple (2s -s + sse, sses, circumflex + t, ssions, ssiez, ssent);
 *   - the impératif from the present (2s loses its -s when the 1s ends in -e; 1p, 2p are the present's);
 *   - the conditionnel from the futur stems; the four forms of the past participle from its masculine singular.
 *
 * First-group spelling changes live in `erSpec`: -ger (mangeons), -cer (plaçons), -eler / -eter doubling (appelle, jette)
 * against the grave-accent verbs (achète, gèle), -e_er (lève), -é_er (cède, futur cédera), -yer (emploie; paie / paye), envoyer.
 */
import type { FrFormRec } from './types';

/** A generated form. `note` marks a form that is a variant of use, not a cell of its own (parles, before y or en: parles-en). */
export interface FrVerbForm extends FrFormRec {
  note?: string;
  /** 'reform1990': a spelling the 1990 rectifications allow beside the traditional one (cèderai, j'épèle). Never the only spelling. */
  spelling?: 'reform1990';
}

/** Six slots (1s 2s 3s 1p 2p 3p), each a list of alternative written forms ([] = the verb has no such form). */
export type S6 = string[][];

export interface VerbSpec {
  lemma: string;
  pres: S6;
  impf: S6;
  ps?: S6;
  fut?: S6;
  cnd?: S6;
  sub?: S6;
  subImp?: S6;
  /** Impératif 2s, 1p, 2p; undefined = the verb has none. */
  impr?: [string[], string[], string[]];
  /** The 2s command lost its -s (parle, va, ouvre): these are the forms with -s used before en and y (parles-en, vas-y). */
  imprLong?: string[];
  /** Masculine singular participle(s). */
  pp?: string[];
  /** [ms, fs, mp, fp] when the four forms are not the regular ones (dû, due, dus, dues). */
  ppForms?: [string, string, string, string];
  ppInvariable?: boolean;
  prp?: string[];
  /** Defective verb: finite forms only in these cells. */
  only?: Array<'3s' | '3p'>;
  /** Forms the 1990 rectifications allow beside the traditional ones (generated with `spelling: 'reform1990'`). */
  reform?: { pres?: S6; sub?: S6; fut?: S6; cnd?: S6; impr?: [string[], string[], string[]]; imprLong?: string[] };
}

const PERSONS: Array<[string, string]> = [['1', 'Sing'], ['2', 'Sing'], ['3', 'Sing'], ['1', 'Plur'], ['2', 'Plur'], ['3', 'Plur']];
const CELL = ['1s', '2s', '3s', '1p', '2p', '3p'] as const;

export const ENDINGS = {
  impf: ['ais', 'ais', 'ait', 'ions', 'iez', 'aient'],
  fut: ['ai', 'as', 'a', 'ons', 'ez', 'ont'],
  cnd: ['ais', 'ais', 'ait', 'ions', 'iez', 'aient'],
  subStrong: ['e', 'es', 'e', 'ent'],
  subWeak: ['ions', 'iez'],
  ps: {
    a: ['ai', 'as', 'a', 'âmes', 'âtes', 'èrent'],
    i: ['is', 'is', 'it', 'îmes', 'îtes', 'irent'],
    u: ['us', 'us', 'ut', 'ûmes', 'ûtes', 'urent'],
    in: ['ins', 'ins', 'int', 'înmes', 'întes', 'inrent'],
  },
} as const;

export type PsClass = keyof typeof ENDINGS.ps;

const withEnds = (stems: string[], ends: readonly string[], join: (s: string, e: string) => string = (s, e) => s + e): S6 =>
  ends.map((e) => stems.map((s) => join(s, e)));

export const impfFrom = (stems: string[], join?: (s: string, e: string) => string): S6 => withEnds(stems, ENDINGS.impf, join);
export const futFrom = (stems: string[]): S6 => withEnds(stems, ENDINGS.fut);
export const cndFrom = (stems: string[]): S6 => withEnds(stems, ENDINGS.cnd);
export const psFrom = (cls: PsClass, stems: string[], join?: (s: string, e: string) => string): S6 => withEnds(stems, ENDINGS.ps[cls], join);
export function subFrom(strong: string[], weak: string[], join: (s: string, e: string) => string = (s, e) => s + e): S6 {
  const [a, b, c, d] = ENDINGS.subStrong;
  const [p1, p2] = ENDINGS.subWeak;
  const st = (e: string) => strong.map((s) => join(s, e));
  const wk = (e: string) => weak.map((s) => join(s, e));
  return [st(a), st(b), st(c), wk(p1), wk(p2), st(d)];
}

/** The last vowel of a word with a circumflex (parla → parlâ), for the third person singular of the subjonctif imparfait. */
const CIRC: Record<string, string> = { a: 'â', e: 'ê', i: 'î', o: 'ô', u: 'û', î: 'î', û: 'û', â: 'â' };
export function subImpfFromPs(ps: S6): S6 | undefined {
  const second = ps[1];
  if (!second?.length) return undefined;
  const out: S6 = [[], [], [], [], [], []];
  for (const f of second) {
    if (!f.endsWith('s')) continue;
    const base = f.slice(0, -1);
    out[0].push(base + 'sse');
    out[1].push(base + 'sses');
    // haï- keeps its diaeresis (haït); otherwise the last vowel takes the circumflex (parlât, finît, vînt, fût)
    // the circumflex goes on the last vowel of the stem: parlâ-t, finî-t, vîn-t, fû-t
    let at = base.length - 1;
    while (at >= 0 && !(base[at] in CIRC)) at--;
    out[2].push(base.endsWith('ï') || at < 0 ? base + 't' : base.slice(0, at) + CIRC[base[at]] + base.slice(at + 1) + 't');
    out[3].push(base + 'ssions');
    out[4].push(base + 'ssiez');
    out[5].push(base + 'ssent');
  }
  return out[0].length ? out : undefined;
}

const unique = <T>(xs: T[]): T[] => [...new Set(xs)];

/** Every form of a spec, one record per cell. */
export function generateForms(sp: VerbSpec): FrVerbForm[] {
  const out: FrVerbForm[] = [];
  const seen = new Set<string>();
  const push = (form: string | undefined, morph: Record<string, string>, note?: string) => {
    if (!form) return;
    const k = `${form}|${JSON.stringify(morph)}|${note ?? ''}`;
    if (seen.has(k)) return;
    seen.add(k);
    out.push(note ? { form, morph, note } : { form, morph });
  };
  const allowed = (i: number) => !sp.only || sp.only.includes(CELL[i] as '3s' | '3p');
  const fin = (slots: S6 | undefined, mood: string, tense: string | null) => {
    if (!slots) return;
    slots.forEach((alts, i) => {
      if (!allowed(i)) return;
      const [p, n] = PERSONS[i];
      for (const f of alts) push(f, { VerbForm: 'Fin', Mood: mood, ...(tense ? { Tense: tense } : {}), Person: p, Number: n });
    });
  };
  push(sp.lemma, { VerbForm: 'Inf' });
  for (const f of sp.prp ?? []) push(f, { VerbForm: 'Part', Tense: 'Pres' });
  if (sp.ppInvariable) for (const f of sp.pp ?? []) push(f, { VerbForm: 'Part', Tense: 'Past' });
  else if (sp.ppForms) {
    const [ms, fs, mp, fp] = sp.ppForms;
    push(ms, { VerbForm: 'Part', Tense: 'Past', Gender: 'Masc', Number: 'Sing' });
    push(fs, { VerbForm: 'Part', Tense: 'Past', Gender: 'Fem', Number: 'Sing' });
    push(mp, { VerbForm: 'Part', Tense: 'Past', Gender: 'Masc', Number: 'Plur' });
    push(fp, { VerbForm: 'Part', Tense: 'Past', Gender: 'Fem', Number: 'Plur' });
  } else {
    for (const f of sp.pp ?? []) {
      push(f, { VerbForm: 'Part', Tense: 'Past', Gender: 'Masc', Number: 'Sing' });
      push(f + 'e', { VerbForm: 'Part', Tense: 'Past', Gender: 'Fem', Number: 'Sing' });
      push(/[sx]$/.test(f) ? f : f + 's', { VerbForm: 'Part', Tense: 'Past', Gender: 'Masc', Number: 'Plur' });
      push(f + 'es', { VerbForm: 'Part', Tense: 'Past', Gender: 'Fem', Number: 'Plur' });
    }
  }
  fin(sp.pres, 'Ind', 'Pres');
  fin(sp.impf, 'Ind', 'Imp');
  fin(sp.ps, 'Ind', 'Past');
  fin(sp.fut, 'Ind', 'Fut');
  fin(sp.cnd, 'Cnd', 'Pres');
  fin(sp.sub, 'Sub', 'Pres');
  fin(sp.subImp ?? (sp.ps ? subImpfFromPs(sp.ps) : undefined), 'Sub', 'Imp');
  if (sp.impr && !sp.only) {
    const [s2, p1, p2] = sp.impr;
    for (const f of s2) push(f, { VerbForm: 'Fin', Mood: 'Imp', Person: '2', Number: 'Sing' });
    for (const f of p1) push(f, { VerbForm: 'Fin', Mood: 'Imp', Person: '1', Number: 'Plur' });
    for (const f of p2) push(f, { VerbForm: 'Fin', Mood: 'Imp', Person: '2', Number: 'Plur' });
    for (const f of sp.imprLong ?? []) {
      push(f, { VerbForm: 'Fin', Mood: 'Imp', Person: '2', Number: 'Sing' }, 'with -s before en or y (parles-en, vas-y)');
    }
  }
  // the 1990 spellings: added after the traditional ones, never replacing them
  if (sp.reform) {
    const have = new Set(out.map((o) => `${o.form}|${JSON.stringify(o.morph)}`));
    const mark = (slots: S6 | undefined, mood: string, tense: string) => {
      slots?.forEach((alts, i) => {
        if (!allowed(i)) return;
        const [p, n] = PERSONS[i];
        for (const f of alts) {
          const morph = { VerbForm: 'Fin', Mood: mood, Tense: tense, Person: p, Number: n };
          if (!have.has(`${f}|${JSON.stringify(morph)}`)) { have.add(`${f}|${JSON.stringify(morph)}`); out.push({ form: f, morph, spelling: 'reform1990' }); }
        }
      });
    };
    mark(sp.reform.pres, 'Ind', 'Pres');
    mark(sp.reform.fut, 'Ind', 'Fut');
    mark(sp.reform.cnd, 'Cnd', 'Pres');
    mark(sp.reform.sub, 'Sub', 'Pres');
    const ri = sp.reform.impr;
    if (ri && !sp.only) {
      const mk = (f: string, p: string, n: string, note?: string) => {
        const morph = { VerbForm: 'Fin', Mood: 'Imp', Person: p, Number: n };
        const k = `${f}|${JSON.stringify(morph)}`;
        if (!have.has(k)) { have.add(k); out.push({ form: f, morph, spelling: 'reform1990', ...(note ? { note } : {}) }); }
      };
      for (const f of ri[0]) mk(f, '2', 'Sing');
      for (const f of sp.reform.imprLong ?? []) mk(f, '2', 'Sing', 'with -s before en or y (parles-en, vas-y)');
    }
  }
  return out;
}

/** Derive the impératif from the present: 2s without -s when the 1s ends in -e; 1p and 2p as in the present. */
export function imperativeFromPresent(pres: S6): { impr: [string[], string[], string[]]; imprLong?: string[] } {
  const s1 = pres[0] ?? [];
  const s2 = pres[1] ?? [];
  const drop = s1.length > 0 && s1.every((f) => f.endsWith('e')) && s2.every((f) => f.endsWith('s'));
  const two = drop ? s2.map((f) => f.slice(0, -1)) : s2;
  return { impr: [two, pres[3] ?? [], pres[4] ?? []], ...(drop ? { imprLong: s2 } : {}) };
}

// ---------------------------------------------------------------------------------------------------------------
// first group (-er)

/**
 * -eler / -eter verbs that take the grave accent (achète, gèle) instead of doubling the consonant (appelle, jette). Every other
 * verb in -eler or -eter doubles (appeler, jeter and their derivatives, épeler, renouveler, étiqueter, feuilleter, cacheter …).
 * After the Académie's 1990 rectifications many doubling verbs may take the grave as well; those variants are not generated.
 */
export const GRAVE_ELER_ETER: ReadonlySet<string> = new Set([
  'celer', 'déceler', 'receler', 'ciseler', 'démanteler', 'écarteler', 'geler', 'dégeler', 'congeler', 'surgeler', 'regeler', 'marteler',
  'modeler', 'remodeler', 'peler', 'harceler',
  'acheter', 'racheter', 'bégueter', 'corseter', 'crocheter', 'fileter', 'fureter', 'haleter',
]);

/** The first-group spelling kind of a lemma. */
export type ErKind = 'plain' | 'double' | 'grave' | 'acute' | 'y-i' | 'y-both' | 'y-keep';

export function erKind(lemma: string): ErKind {
  if (/eyer$/.test(lemma)) return 'y-keep';
  if (/ayer$/.test(lemma)) return 'y-both';
  if (/[oua]yer$/.test(lemma) || /yer$/.test(lemma)) return 'y-i';
  if (/(?:[^aeiouyàâäéèêëîïôöùûüœæ]|[qg]u)e[lt]er$/.test(lemma) || /^e[lt]er$/.test(lemma)) return GRAVE_ELER_ETER.has(lemma) ? 'grave' : 'double';
  if (/é(?:[^aeiouyàâäéèêëîïôöùûüœæ]{1,2}|gu|qu)er$/.test(lemma)) return 'acute';
  // lever, mener, semer, peser, dépecer, sevrer: one of c m n s v (not x: sexer, vexer, annexer are regular) after the e
  if (/[^aeiouyàâäéèêëîïôöùûüœæ]e(?:[cmnsv]|vr)er$/.test(lemma)) return 'grave';
  return 'plain';
}

/** Join a first-group stem and an ending with the spelling changes of -ger (mangeons) and -cer (plaçons). */
function erJoiner(lemma: string): (stem: string, ending: string) => string {
  const ger = lemma.endsWith('ger');
  const cer = lemma.endsWith('cer');
  return (stem, ending) => {
    if ((ger || cer) && /^[aâoô]/.test(ending)) {
      if (ger && stem.endsWith('g')) return stem + 'e' + ending;
      if (cer && stem.endsWith('c')) return stem.slice(0, -1) + 'ç' + ending;
    }
    return stem + ending;
  };
}

const ER_LEMMA = /^[a-zàâäçéèêëîïôöùûüœæ]+er$/;

/** The paradigm of a regular first-group verb (spelling changes included), or undefined when the lemma is not an -er verb shape. */
export function erSpec(lemma: string): VerbSpec | undefined {
  if (!ER_LEMMA.test(lemma) || lemma.length < 4 || !/[aeiouyàâäéèêëîïôöùûüœæ]/.test(lemma.slice(0, -2))) return undefined;
  const s = lemma.slice(0, -2);
  const kind = erKind(lemma);
  const J = erJoiner(lemma);
  let strong: string[] = [s];
  switch (kind) {
    case 'double': strong = [s + s[s.length - 1]]; break;
    case 'grave': strong = [s.replace(/e([^e]*)$/, 'è$1')]; break;
    case 'acute': strong = [s.replace(/é([^é]*)$/, 'è$1')]; break;
    case 'y-i': strong = [s.slice(0, -1) + 'i']; break;
    case 'y-both': strong = [s.slice(0, -1) + 'i', s]; break;
    default: break;
  }
  // the future and conditional stem: the strong stem (lèverai, appellerai, emploierai) except -é_er (céderai)
  let futStems = (kind === 'acute' ? [s] : strong).map((x) => x + 'er');
  if (/^r?envoyer$/.test(lemma)) futStems = [lemma.slice(0, -4) + 'err']; // enverrai, renverrai
  const pres: S6 = [
    strong.map((g) => g + 'e'), strong.map((g) => g + 'es'), strong.map((g) => g + 'e'),
    [J(s, 'ons')], [J(s, 'ez')], strong.map((g) => g + 'ent'),
  ];
  const ps = psFrom('a', [s], J);
  const spec: VerbSpec = {
    lemma,
    pres,
    impf: impfFrom([s], J),
    ps,
    fut: futFrom(futStems),
    cnd: cndFrom(futStems),
    sub: subFrom(strong, [s], J),
    pp: [J(s, 'é')],
    prp: [J(s, 'ant')],
    ...imperativeFromPresent(pres),
  };
  if (kind === 'acute') {
    // cédera (traditional) beside cèdera (1990)
    const futR = strong.map((x) => x + 'er');
    spec.reform = { fut: futFrom(futR), cnd: cndFrom(futR) };
  } else if (kind === 'double' && !/(appeler|jeter)$/.test(lemma)) {
    // épeler, étiqueter, décolleter …: épelle (traditional) beside épèle (1990); appeler and jeter and their compounds keep the doubling
    const g = [s.replace(/e([^e]*)$/, 'è$1')];
    const presR: S6 = [g.map((x) => x + 'e'), g.map((x) => x + 'es'), g.map((x) => x + 'e'), [], [], g.map((x) => x + 'ent')];
    const futR = g.map((x) => x + 'er');
    const imp = imperativeFromPresent([presR[0], presR[1], presR[2], pres[3], pres[4], presR[5]]);
    spec.reform = { pres: presR, sub: subFrom(g, [s], J), fut: futFrom(futR), cnd: cndFrom(futR), impr: [imp.impr[0], [], []], ...(imp.imprLong ? { imprLong: imp.imprLong } : {}) };
  }
  return spec;
}

// ---------------------------------------------------------------------------------------------------------------
// second group (-ir, -issons)

const IR_LEMMA = /^[a-zàâäçéèêëîïôöùûüœæ]+ir$/;

/** The paradigm of a regular -ir verb with -iss- (finir, choisir, réussir). */
export function irSpec(lemma: string): VerbSpec | undefined {
  if (!IR_LEMMA.test(lemma) || !/[aeiouyàâäéèêëîïôöùûüœæ]/.test(lemma.slice(0, -2))) return undefined;
  const s = lemma.slice(0, -2);
  const pres: S6 = [[s + 'is'], [s + 'is'], [s + 'it'], [s + 'issons'], [s + 'issez'], [s + 'issent']];
  return {
    lemma,
    pres,
    impf: impfFrom([s + 'iss']),
    ps: psFrom('i', [s]),
    fut: futFrom([s + 'ir']),
    cnd: cndFrom([s + 'ir']),
    sub: subFrom([s + 'iss'], [s + 'iss']),
    pp: [s + 'i'],
    prp: [s + 'issant'],
    impr: [[s + 'is'], [s + 'issons'], [s + 'issez']],
  };
}

// ---------------------------------------------------------------------------------------------------------------
// third group, regular -re (perdre, rendre, vendre, attendre, répondre …)

/** The regular -dre paradigm: vends, vend (no -t), vendons; vendis; vendrai; vendu. */
export function dreSpec(lemma: string): VerbSpec | undefined {
  if (!/^[a-zàâäçéèêëîïôöùûüœæ]+dre$/.test(lemma) || lemma.length < 5) return undefined;
  const s = lemma.slice(0, -2); // vend
  const pres: S6 = [[s + 's'], [s + 's'], [s], [s + 'ons'], [s + 'ez'], [s + 'ent']];
  return {
    lemma,
    pres,
    impf: impfFrom([s]),
    ps: psFrom('i', [s]),
    fut: futFrom([s + 'r']),
    cnd: cndFrom([s + 'r']),
    sub: subFrom([s], [s]),
    pp: [s + 'u'],
    prp: [s + 'ant'],
    impr: [[s + 's'], [s + 'ons'], [s + 'ez']],
  };
}

export { unique };
