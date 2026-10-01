/**
 * Spanish verb generator, part 1: endings, spelling changes and the form generator itself.
 *
 * A verb is described by a `Paradigm` (its stems, plus any whole forms that override the rules). `generateForms`
 * turns a paradigm into every form with its features. Stem-changing classes live in verb-stem.ts, the irregular
 * tables in verb-irregular.ts, and verbs.ts picks the right paradigm for a lemma.
 *
 * Speed: the morph objects and variety arrays of a slot are shared (frozen) between all verbs; spelling flags are
 * worked out once per paradigm, not once per form.
 */
import { restress, stripAccents } from './morph-orth';

export type Cls = 'ar' | 'er' | 'ir';
export type Pers = '1s' | '2s' | '3s' | '1p' | '2p' | '3p';
export const PERSONS: Pers[] = ['1s', '2s', '3s', '1p', '2p', '3p'];

export interface FormRec { form: string; morph: Record<string, string>; varieties?: string[] }

export interface Paradigm {
  lemma: string;
  cls: Cls;
  /** The lemma without its -ar / -er / -ir / -ír. */
  stem: string;
  /** Present 2s 3s 3p, imperative tú, and (by default) the stem of the present subjunctive in 1s 2s 3s 3p. */
  presStrong: string;
  /** Present 1s. */
  pres1: string;
  /** Present 1p 2p and voseo. */
  presWeak: string;
  subStrong: string;
  /** Present subjunctive 1p 2p. */
  subWeak: string;
  /** Gerund and the 3rd-person preterite when they take a changed stem (pedir → pid-). */
  stemPret3: string;
  /** Whole-form overrides by slot id ("pres.1s", "pret.3p", "imp.2s", "ger", "part" …). */
  over?: Record<string, string[]>;
  /** Slot-id prefixes that do not exist for this verb ("imp.", "pres.vos" …). */
  skip?: string[];
  /** Stem for future / conditional when it is not the infinitive (tendr-). */
  fut?: string;
  /** The verb is in the group that writes -oz- / -ez- for -zc- (cocer, mecer). */
  zNotZc?: boolean;
  /** Marks that the class was assumed, not looked up (verb-stem.ts). */
  assumed?: string;
  /** Provenance for the rule text: 'regular' | 'stem-change' | 'irregular'. */
  kind: 'regular' | 'stem-change' | 'irregular';
}

const ER_IMPF = ['ía', 'ías', 'ía', 'íamos', 'íais', 'ían'];
export const ENDINGS = {
  ar: { pres: ['o', 'as', 'a', 'amos', 'áis', 'an'], vos: 'ás', impf: ['aba', 'abas', 'aba', 'ábamos', 'abais', 'aban'], pret: ['é', 'aste', 'ó', 'amos', 'asteis', 'aron'], sub: ['e', 'es', 'e', 'emos', 'éis', 'en'], ger: 'ando', part: 'ado' },
  er: { pres: ['o', 'es', 'e', 'emos', 'éis', 'en'], vos: 'és', impf: ER_IMPF, pret: ['í', 'iste', 'ió', 'imos', 'isteis', 'ieron'], sub: ['a', 'as', 'a', 'amos', 'áis', 'an'], ger: 'iendo', part: 'ido' },
  ir: { pres: ['o', 'es', 'e', 'imos', 'ís', 'en'], vos: 'ís', impf: ER_IMPF, pret: ['í', 'iste', 'ió', 'imos', 'isteis', 'ieron'], sub: ['a', 'as', 'a', 'amos', 'áis', 'an'], ger: 'iendo', part: 'ido' },
} as const;
const FUT = ['é', 'ás', 'á', 'emos', 'éis', 'án'];
const CND = ['ía', 'ías', 'ía', 'íamos', 'íais', 'ían'];
const NUM: Record<string, string> = { s: 'Sing', p: 'Plur' };
const isV = (c: string | undefined) => !!c && 'aeiouáéíóúü'.includes(c);

/** -iar verbs that stress the i in the singular and 3p (enviar → envío). Others (cambiar, estudiar) do not. */
export const IAR_ACCENTED = new Set([
  'enviar', 'reenviar', 'guiar', 'criar', 'fiar', 'confiar', 'desconfiar', 'variar', 'vaciar', 'esquiar', 'ampliar', 'liar',
  'aliar', 'rociar', 'espiar', 'enfriar', 'resfriar', 'desviar', 'extraviar', 'fotografiar', 'telegrafiar', 'contrariar',
  'ansiar', 'aviar', 'ataviar', 'piar', 'arriar', 'desafiar', 'amnistiar', 'malcriar', 'reciar', 'inventariar', 'desvariar',
]);
export function accentedIU(lemma: string): boolean {
  if (lemma.endsWith('iar')) return IAR_ACCENTED.has(lemma);
  if (lemma.endsWith('uar')) return !/[gcq]uar$/.test(lemma);
  return false;
}

const Z_NOT_ZC = new Set(['cocer', 'escocer', 'recocer', 'mecer', 'remecer']);

type Joiner = (stem: string, ending: string) => string;

/**
 * Build the function that joins a stem and an ending and applies the spelling changes: busqué, llegué, empecé,
 * averigüé, escojo, sigo, venzo, conozco, construyo, leyó, bulló, leíste. The lemma's shape is read once.
 */
export function makeJoiner(p: Pick<Paradigm, 'lemma' | 'cls' | 'zNotZc'>): Joiner {
  const lem = p.lemma;
  if (p.cls === 'ar') {
    const guar = lem.endsWith('guar');
    return (stem, ending) => {
      const e0 = ending[0];
      let s = stem;
      if (e0 === 'e' || e0 === 'é') {
        if (s.endsWith('c')) s = s.slice(0, -1) + 'qu';
        else if (s.endsWith('gu') && guar) s = s.slice(0, -1) + 'ü';
        else if (s.endsWith('g')) s += 'u';
        else if (s.endsWith('z')) s = s.slice(0, -1) + 'c';
      }
      return s + ending;
    };
  }
  const gerGir = /g[ei]r$/.test(lem);
  const guir = lem.endsWith('guir');
  const cerCir = /c[ei]r$/.test(lem);
  const uir = /[^gq]uir$/.test(lem);
  const noZc = !!p.zNotZc || Z_NOT_ZC.has(lem);
  return (stem, ending) => {
    const e0 = ending[0];
    let s = stem;
    let e = ending;
    if ('aáoó'.includes(e0)) {
      if (gerGir && s.endsWith('g')) s = s.slice(0, -1) + 'j';
      else if (guir && s.endsWith('gu')) s = s.slice(0, -1);
      else if (cerCir && s.endsWith('c')) s = s.slice(0, -1) + (isV(s[s.length - 2]) && !noZc ? 'zc' : 'z');
    }
    const lead = e.startsWith('ió') || e.startsWith('ie');
    if (lead && (s.endsWith('ñ') || s.endsWith('ll'))) e = e.slice(1);
    else if (uir && s.endsWith('u')) {
      if ('aeo'.includes(e0)) s += 'y';
      else if (lead) { s += 'y'; e = e.slice(1); }
    } else if (!uir && 'aeo'.includes(s[s.length - 1] ?? '-')) {
      // leer, caer, oír: unstressed i between vowels becomes y; stressed i keeps a written accent (leíste)
      if (lead) { s += 'y'; e = e.slice(1); }
      else if (e.startsWith('iste') || e.startsWith('imos') || e === 'ido') e = 'í' + e.slice(1);
    }
    return s + e;
  };
}

/** One-off join (kept for callers outside the generator). */
export function joinStem(p: Pick<Paradigm, 'lemma' | 'cls' | 'zNotZc'>, stem: string, ending: string): string {
  return makeJoiner(p)(stem, ending);
}

const accentLast = (w: string): string => {
  for (let i = w.length - 1; i >= 0; i--) if ('aeiou'.includes(w[i])) return w.slice(0, i) + { a: 'á', e: 'é', i: 'í', o: 'ó', u: 'ú' }[w[i] as 'a'] + w.slice(i + 1);
  return w;
};

export function stemOf(lemma: string): { stem: string; cls: Cls } | undefined {
  const m = /^(.*?)(ar|er|ir|ír)$/.exec(lemma);
  if (!m || !m[1] || !/[aeiouáéíóú]/.test(m[1])) return undefined;
  return { stem: m[1], cls: m[2] === 'ír' ? 'ir' : (m[2] as Cls) };
}

/** A paradigm for a verb with no irregularity at all. */
export function regularParadigm(lemma: string): Paradigm | undefined {
  const st = stemOf(lemma);
  if (!st) return undefined;
  const { stem, cls } = st;
  const acc = cls === 'ar' && accentedIU(lemma) ? stem.slice(0, -1) + { i: 'í', u: 'ú' }[stem[stem.length - 1] as 'i'] : stem;
  return {
    lemma, cls, stem, presStrong: acc, pres1: acc, presWeak: stem, subStrong: acc, subWeak: stem, stemPret3: stem, kind: 'regular',
  };
}

type Slots = Record<string, string[]>;

function baseSlots(p: Paradigm): Slots {
  const E = ENDINGS[p.cls];
  const j = makeJoiner(p);
  const slots: Slots = {};
  slots.inf = [p.lemma];
  slots.ger = [j(p.stemPret3, E.ger)];
  slots.part = [j(p.stem, E.part)];
  const futStem = p.fut ?? stripAccents(p.lemma);
  PERSONS.forEach((pr, i) => {
    const strong = i < 3 || i === 5;
    slots[`pres.${pr}`] = [j(i === 0 ? p.pres1 : strong ? p.presStrong : p.presWeak, E.pres[i])];
    slots[`impf.${pr}`] = [j(p.stem, E.impf[i])];
    slots[`pret.${pr}`] = [j(strong && i !== 0 && i !== 1 ? p.stemPret3 : p.stem, E.pret[i])];
    slots[`fut.${pr}`] = [futStem + FUT[i]];
    slots[`cnd.${pr}`] = [futStem + CND[i]];
    slots[`subp.${pr}`] = [j(strong ? p.subStrong : p.subWeak, E.sub[i])];
  });
  slots['pres.vos'] = [j(p.presWeak, E.vos)];
  // the second-person plural in -des that Golden Age prose still wrote (amábades, teníades, amaríades)
  if (!p.over?.['impf.1s']) slots['impf.2pd'] = [j(p.stem, p.cls === 'ar' ? 'ábades' : 'íades')];
  slots['cnd.2pd'] = [futStem + 'íades'];
  return slots;
}

/** Imperative: tú = 3s present; usted / nosotros / ustedes = subjunctive; vosotros = infinitive with -d; vos = infinitive without -r. */
function deriveImperatives(slots: Slots, p: Paradigm): void {
  slots['imp.2s'] = [slots['pres.3s'][0]];
  slots['imp.3s'] = [slots['subp.3s'][0]];
  slots['imp.1p'] = [slots['subp.1p'][0]];
  slots['imp.2p'] = [p.lemma.slice(0, -1) + 'd'];
  slots['imp.3p'] = [slots['subp.3p'][0]];
  slots['imp.vos'] = p.lemma.length > 3 ? [accentLast(p.lemma.slice(0, -1))] : [];
}

const SUBJ_ENDINGS: Array<[string, string[], string]> = [
  ['subr', ['ra', 'ras', 'ra', 'ramos', 'rais', 'ran'], 'rades'],
  ['subs', ['se', 'ses', 'se', 'semos', 'seis', 'sen'], 'sedes'],
  ['subf', ['re', 'res', 're', 'remos', 'reis', 'ren'], 'redes'],
];

/** The three imperfect subjunctives built from the 3p preterite: hablaron → hablara / hablase / hablare. */
function derivedSubjunctives(slots: Slots): void {
  const p3 = slots['pret.3p'][0];
  if (!p3.endsWith('ron')) return;
  const base = p3.slice(0, -3);
  const stressed = accentLast(base);
  for (const [id, ends, des] of SUBJ_ENDINGS) {
    PERSONS.forEach((pr, i) => { slots[`${id}.${pr}`] = [(i === 3 ? stressed : base) + ends[i]]; });
    slots[`${id}.2pd`] = [stressed + des];
  }
}

// --- shared morph objects -----------------------------------------------------------------------------------------

const VOSEO: readonly string[] = Object.freeze(['voseo']);
const VOSOTROS: readonly string[] = Object.freeze(['vosotros']);
const HIST: readonly string[] = Object.freeze(['es-hist']);
const VOSOTROS_HIST: readonly string[] = Object.freeze(['vosotros', 'es-hist']);
const morphCache = new Map<string, Record<string, string>>();
function morphOf(key: string, make: () => Record<string, string>): Record<string, string> {
  let m = morphCache.get(key);
  if (!m) { m = Object.freeze(make()) as Record<string, string>; morphCache.set(key, m); }
  return m;
}

const DERIVED_SLOT = /^(imp|subr|subs|subf)\./;

export function generateForms(p: Paradigm): FormRec[] {
  const slots = baseSlots(p);
  const over = p.over ? Object.entries(p.over) : [];
  for (const [k, v] of over) if (!DERIVED_SLOT.test(k)) slots[k] = v;
  deriveImperatives(slots, p);
  derivedSubjunctives(slots);
  for (const [k, v] of over) if (DERIVED_SLOT.test(k)) slots[k] = v;
  for (const pre of p.skip ?? []) for (const k of Object.keys(slots)) if (k === pre || k.startsWith(pre)) delete slots[k];
  if (slots['pres.vos']?.[0] === slots['pres.2s']?.[0]) delete slots['pres.vos']; // voseo identical to tú adds nothing
  const out: FormRec[] = [];
  const seen = new Set<string>();
  const add = (forms: string[] | undefined, key: string, make: () => Record<string, string>, vs?: readonly string[]) => {
    if (!forms) return;
    for (const f of forms) {
      if (!f) continue;
      const k = key + '|' + f;
      if (seen.has(k)) continue;
      seen.add(k);
      out.push(vs ? { form: f, morph: morphOf(key, make), varieties: vs as string[] } : { form: f, morph: morphOf(key, make) });
    }
  };
  add(slots.inf, 'inf', () => ({ VerbForm: 'Inf' }));
  add(slots.ger, 'ger', () => ({ VerbForm: 'Ger' }));
  for (const f of slots.part ?? []) {
    const b = f.slice(0, -1);
    add([f], 'part.ms', () => ({ VerbForm: 'Part', Gender: 'Masc', Number: 'Sing' }));
    add([b + 'a'], 'part.fs', () => ({ VerbForm: 'Part', Gender: 'Fem', Number: 'Sing' }));
    add([b + 'os'], 'part.mp', () => ({ VerbForm: 'Part', Gender: 'Masc', Number: 'Plur' }));
    add([b + 'as'], 'part.fp', () => ({ VerbForm: 'Part', Gender: 'Fem', Number: 'Plur' }));
  }
  const fin = (mood: string, tense: string | null, id: string, extra: Record<string, string> = {}) => {
    for (const pr of PERSONS) {
      const vs = pr === '2p' ? (id === 'subf' ? VOSOTROS_HIST : VOSOTROS) : id === 'subf' ? HIST : undefined;
      add(slots[`${id}.${pr}`], `${id}.${pr}`, () => ({ VerbForm: 'Fin', Mood: mood, ...(tense ? { Tense: tense } : {}), Person: pr[0], Number: NUM[pr[1]], ...extra }), vs);
    }
    add(slots[`${id}.2pd`], `${id}.2pd`, () => ({ VerbForm: 'Fin', Mood: mood, ...(tense ? { Tense: tense } : {}), Person: '2', Number: 'Plur', ...extra }), VOSOTROS_HIST);
  };
  fin('Ind', 'Pres', 'pres');
  add(slots['pres.vos'], 'pres.vos', () => ({ VerbForm: 'Fin', Mood: 'Ind', Tense: 'Pres', Person: '2', Number: 'Sing' }), VOSEO);
  fin('Ind', 'Imp', 'impf');
  fin('Ind', 'Past', 'pret');
  fin('Ind', 'Fut', 'fut');
  fin('Cnd', null, 'cnd');
  fin('Sub', 'Pres', 'subp');
  fin('Sub', 'Imp', 'subr', { Variant: 'Ra' });
  fin('Sub', 'Imp', 'subs', { Variant: 'Se' });
  fin('Sub', 'Fut', 'subf');
  const imp = (id: string, person: string, number: string, extra: Record<string, string> = {}, vs?: readonly string[]) =>
    add(slots[id], id, () => ({ VerbForm: 'Fin', Mood: 'Imp', Person: person, Number: number, ...extra }), vs);
  imp('imp.2s', '2', 'Sing');
  imp('imp.3s', '3', 'Sing', { Polite: 'Form' });
  imp('imp.1p', '1', 'Plur');
  imp('imp.2p', '2', 'Plur', {}, VOSOTROS);
  imp('imp.3p', '3', 'Plur', { Polite: 'Form' });
  // a vos imperative identical to the tú form adds nothing
  const tu = slots['imp.2s']?.[0];
  imp('imp.vos', '2', 'Sing', {}, VOSEO);
  return tu ? out.filter((r) => !(r.varieties === VOSEO && r.morph.Mood === 'Imp' && r.form === tu)) : out;
}

/** Attach the stress-preserving join used for prefixed verbs (verbs.ts). */
export const withPrefix = (prefix: string, form: string): string => restress(form, prefix, '') ?? prefix + form;
