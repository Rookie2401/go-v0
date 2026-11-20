/**
 * French verb generator, part 3: pick the paradigm for a lemma and cache its forms (MORPH package, docs/french/PLAN.md).
 * MACHINE-DRAFTED, not checked by a native speaker.
 *
 *   irregular family (verb-irregular.ts: être, avoir, aller, prendre and every verb ending in -prendre, venir and compounds …)
 *   → -er verb (spelling changes of the first group, envoyer) → -dre verb (the regular third-group class: vendre, perdre)
 *   → -ir verb: the second group (finir) is the DEFAULT for an -ir verb no table lists. That is a guess about the lemma
 *     (partir, sortir, dormir, sentir … are listed and are not -iss- verbs): `listed` tells which it was.
 * A pronominal verb (se souvenir, s'en aller, s'enfuir) is conjugated as the base verb; its auxiliary is être.
 *
 * `conjugateFrench` is the public function. `conjugateLemma` and `formsMatching` are for the analyser (morphology.ts): the
 * conjugation of a lemma is cached, and `strict` limits the irregular families to attested prefixes (used when nothing
 * vouches for the lemma, so that no junk prefix is believed).
 */
import type { FrConjugation } from './types';
import { BOTH_VERBS, ETRE_VERBS, expandIrr, familyOf, irrFor, type Fam } from './verb-irregular';
import { dreSpec, erSpec, generateForms, irSpec, type FrVerbForm, type VerbSpec } from './verb-regular';

export interface Conj extends FrConjugation {
  forms: FrVerbForm[];
  /** form → its records; built on first use by `formsMatching`. */
  index?: Map<string, FrVerbForm[]>;
}

/** What a family lacks, in plain words (a verb is listed here only when it is certain). */
const DEFECTIVE: Record<string, string> = {
  falloir: 'third person singular only (il faut)',
  pleuvoir: 'third person singular and plural only (il pleut, ils pleuvent)',
  déchoir: 'no imparfait and no participe présent',
  clore: 'no imparfait, passé simple, or subjonctif imparfait',
  absoudre: 'no passé simple',
  dissoudre: 'no passé simple',
  luire: 'no passé simple',
  traire: 'no passé simple',
  gésir: 'only the present, the imparfait and the participe présent',
};

const cache = new Map<string, Conj | null>();
const CAP = 2000;

/** The base lemma of a pronominal verb written with its pronoun: "se souvenir", "s'en aller", "s'enfuir". */
export function pronominalBase(lemma: string): string | undefined {
  const m = /^(?:se |s'en (?=aller$)|s')(.+)$/.exec(lemma);
  return m ? m[1] : undefined;
}

function auxOf(lemma: string, fam: Fam | undefined, prefix: string): 'avoir' | 'être' | 'both' {
  if (fam) {
    const irr = irrFor(fam.irr, prefix);
    if (irr.aux) return irr.aux;
  }
  if (ETRE_VERBS.has(lemma)) return 'être';
  if (BOTH_VERBS.has(lemma)) return 'both';
  return 'avoir';
}

function build(lemma: string, strict: boolean): Conj | undefined {
  const base = pronominalBase(lemma);
  if (base) {
    const inner = conjugateLemma(base, strict);
    return inner ? { ...inner, lemma, aux: 'être', index: undefined } : undefined;
  }
  // the spelling of the 1990 rectifications for -aître verbs: connaitre, paraitre, apparaitre (no circumflex before the t)
  if (/aitre$/.test(lemma)) {
    const traditional = conjugateLemma(lemma.replace(/aitre$/, 'aître'), strict);
    if (!traditional) return undefined;
    return {
      ...traditional, lemma, model: `conjugated like ${traditional.lemma} (spelling of the 1990 rectifications, no circumflex before the t)`,
      forms: traditional.forms.filter((x) => !x.spelling).map((x) => ({ ...x, form: x.form.replace(/aît/g, 'ait') })), index: undefined,
    };
  }
  const f = familyOf(lemma, strict);
  if (f) {
    const irr = irrFor(f.fam.irr, f.prefix);
    const spec = expandIrr(lemma, irr, f.prefix);
    const defective = DEFECTIVE[f.fam.tail];
    const forms = generateForms(spec);
    // connaît / connait, plaît / plait: the 1990 spelling beside the traditional one
    if (f.fam.tail === 'aître' || f.fam.tail === 'plaire') {
      for (const x of [...forms]) if (x.form.includes('aît')) forms.push({ ...x, form: x.form.replace(/aît/g, 'ait'), morph: { ...x.morph }, spelling: 'reform1990' });
    }
    return {
      lemma, group: '3', aux: auxOf(lemma, f.fam, f.prefix), listed: true,
      ...(lemma !== f.fam.model ? { model: `conjugated like ${f.fam.model}` } : {}),
      forms,
      ...(defective ? { defective } : {}),
    };
  }
  let spec: VerbSpec | undefined;
  let group: '1' | '2' | '3' = '1';
  let model: string | undefined;
  if (lemma.endsWith('er')) {
    spec = erSpec(lemma);
    if (/^r?envoyer$/.test(lemma)) model = 'conjugated like envoyer (futur enverr-)';
  } else if (lemma.endsWith('dre')) {
    spec = dreSpec(lemma);
    group = '3';
    model = 'conjugated like vendre';
  } else if (lemma.endsWith('ir')) {
    spec = irSpec(lemma);
    group = '2';
    model = 'conjugated like finir';
  }
  if (!spec) return undefined;
  return { lemma, group, aux: auxOf(lemma, undefined, ''), listed: false, ...(model ? { model } : {}), forms: generateForms(spec) };
}

/** The cached conjugation of a (normalized) lemma; undefined when the lemma is not a verb shape the engine can conjugate. */
export function conjugateLemma(lemma: string, strict = false): Conj | undefined {
  const key = strict ? `${lemma}|s` : lemma;
  const hit = cache.get(key);
  if (hit !== undefined) return hit ?? undefined;
  const made = build(lemma, strict) ?? null;
  if (cache.size > CAP) {
    let n = 0;
    for (const k of cache.keys()) { cache.delete(k); if (++n > CAP / 2) break; }
  }
  cache.set(key, made);
  return made ?? undefined;
}

const normalizeLemma = (s: string): string => s.normalize('NFC').toLowerCase().replace(/[’ʼ‘′`´＇]/g, "'").trim();

/**
 * Every simple form of a verb, each an `FrFormRec` with its features (one record per cell: parle is 1s and 3s present
 * indicative, 1s and 3s present subjunctive, 2s imperative). A form that is a variant of use, not a cell of its own (parles
 * before en or y), carries a `note`. Undefined when the lemma is not a verb shape.
 */
export function conjugateFrench(lemma: string): FrConjugation | undefined {
  const c = conjugateLemma(normalizeLemma(lemma));
  if (!c) return undefined;
  const { index: _index, ...rest } = c;
  void _index;
  return { ...rest, forms: c.forms.map((f) => ({ ...f, morph: { ...f.morph } })) };
}

/** The records of `conj` whose written form is `w` (an indexed lookup, not a scan). */
export function formsMatching(conj: Conj, w: string): FrVerbForm[] {
  let idx = conj.index;
  if (!idx) {
    idx = new Map();
    for (const f of conj.forms) { const l = idx.get(f.form); if (l) l.push(f); else idx.set(f.form, [f]); }
    conj.index = idx;
  }
  return idx.get(w) ?? [];
}
