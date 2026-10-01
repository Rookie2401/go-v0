/**
 * Spanish nouns, adjectives and derivation for the morphology engine: plurals (-s, -es, -ces, accent shifts), the
 * feminine of adjectives, the absolute superlative -ísimo, diminutives and augmentatives, adverbs in -mente, and the
 * contractions al / del.
 *
 * Nothing here guesses a lemma: every reading is built by GENERATING the forms of a candidate base and checking that
 * the written form is among them, and a candidate is only used when the caller's `known` says the lemma exists.
 */
import type { PartOfSpeech, WordPart } from '../../core';
import { nuclei, restress, stressInfo, stripAccents, transferStress } from './morph-orth';

export type Known = (lemma: string, pos: PartOfSpeech) => boolean;
export interface NominalForm { form: string; morph: Record<string, string> }
export interface NominalReading { lemma: string; pos: PartOfSpeech; morph: Record<string, string>; rule: string; /** Derivations are weaker evidence than inflections. */ derived: boolean }

const unique = <T>(xs: T[]): T[] => [...new Set(xs)];
const FEMININE_OR_EXCEPTIONS = new Set(['mayor', 'menor', 'mejor', 'peor', 'superior', 'inferior', 'anterior', 'posterior', 'interior', 'exterior', 'ulterior']);

/** The plural(s) of a singular noun or adjective. */
export function pluralsOf(sg: string): string[] {
  if (sg.length < 2 || !nuclei(sg).length) return [];
  const last = sg[sg.length - 1];
  const info = stressInfo(sg)!;
  const es = (): string[] => { const r = restress(sg, '', 'es'); return r ? [r] : []; };
  if ('aeo'.includes(last) || 'áéó'.includes(last)) return [sg + 's'];
  if ('íú'.includes(last)) return [sg + 's', sg + 'es'];
  if (last === 'z') { const r = restress(sg.slice(0, -1) + 'c', '', 'es'); return r ? [r] : []; }
  if (last === 's' || last === 'x') return info.fromEnd === 0 || info.total === 1 ? es() : [sg];
  if (last === 'y') return [sg + 'es'];
  if ('lrndj'.includes(last) || sg.endsWith('ch')) return es();
  if ('tcpbgkfm'.includes(last)) return [sg + 's'];
  return [];
}

const PERSON_ENDINGS = /(or|ón|án|ín|és|ol)$/;
/** Adjectives (and nouns of people) whose consonant-final masculine takes -a: trabajador → trabajadora, francés → francesa. */
const takesFeminineA = (l: string): boolean => PERSON_ENDINGS.test(l) && !FEMININE_OR_EXCEPTIONS.has(l);

/** Every inflected form of an adjective lemma with gender and number; nouns get number only. */
export function nominalForms(lemma: string, pos: PartOfSpeech): NominalForm[] {
  const out: NominalForm[] = [];
  const num = (form: string, Number: string, extra: Record<string, string> = {}) => out.push({ form, morph: { Number, ...extra } });
  if (pos === 'NOUN') {
    num(lemma, 'Sing');
    for (const p of pluralsOf(lemma)) num(p, 'Plur');
    return out;
  }
  if (pos !== 'ADJ') return out;
  const endsO = lemma.endsWith('o');
  const fem = endsO ? lemma.slice(0, -1) + 'a' : takesFeminineA(lemma) ? restress(lemma, '', 'a') : undefined;
  if (endsO || fem) {
    num(lemma, 'Sing', { Gender: 'Masc' });
    if (fem) num(fem, 'Sing', { Gender: 'Fem' });
    for (const p of pluralsOf(lemma)) num(p, 'Plur', { Gender: 'Masc' });
    if (fem) for (const p of pluralsOf(fem)) num(p, 'Plur', { Gender: 'Fem' });
  } else {
    num(lemma, 'Sing');
    for (const p of pluralsOf(lemma)) num(p, 'Plur');
  }
  return out;
}

/** F with its last `n` letters removed, as written and with the stress kept in place (jóvenes - es → joven). */
function cut(form: string, n: number): string[] {
  const s = form.slice(0, form.length - n);
  if (!s) return [];
  const t = transferStress(form, stripAccents(s), 0);
  return unique([s, ...(t ? [t] : [])]);
}

/** Plain candidates for the base of an inflected form. */
function inflectionBases(f: string): string[] {
  const c: string[] = [f];
  if (f.endsWith('s')) c.push(...cut(f, 1));
  if (f.endsWith('es')) c.push(...cut(f, 2));
  if (f.endsWith('ces')) for (const b of cut(f, 3)) c.push(b + 'z');
  if (f.endsWith('as')) c.push(...cut(f, 2).map((b) => b + 'o'), ...cut(f, 2));
  if (f.endsWith('os')) c.push(...cut(f, 2).map((b) => b + 'o'));
  if (f.endsWith('a')) c.push(...cut(f, 1).map((b) => b + 'o'), ...cut(f, 1));
  return unique(c);
}

function accentVariants(w: string): string[] {
  const out = [w];
  const plain = stripAccents(w);
  for (let i = 0; i < plain.length; i++) {
    if ('aeiou'.includes(plain[i])) out.push(plain.slice(0, i) + { a: 'á', e: 'é', i: 'í', o: 'ó', u: 'ú' }[plain[i] as 'a'] + plain.slice(i + 1));
  }
  if (plain !== w) out.push(plain);
  return unique(out);
}

// ---------------------------------------------------------------------------------------------------------------
// Superlatives, diminutives, augmentatives

/** The stem an -ísimo / -ito suffix attaches to: vowel dropped, c→qu g→gu z→c before the suffix's i, no accents. */
function suffixStem(lemma: string): string | undefined {
  let s = lemma;
  if (/ble$/.test(s)) return stripAccents(s.slice(0, -2)) + 'il';
  if ('aeo'.includes(s[s.length - 1])) s = s.slice(0, -1);
  else if (s.endsWith('z')) s = s.slice(0, -1) + 'c';
  if (s.endsWith('c')) s = s.slice(0, -1) + 'qu';
  else if (s.endsWith('g')) s += 'u';
  return stripAccents(s);
}

export function superlativesOf(lemma: string): NominalForm[] {
  const s = suffixStem(lemma);
  if (!s || s.length < 2) return [];
  return [['ísimo', 'Masc', 'Sing'], ['ísima', 'Fem', 'Sing'], ['ísimos', 'Masc', 'Plur'], ['ísimas', 'Fem', 'Plur']].map(([suf, Gender, Number]) => ({
    form: s + suf, morph: { Gender, Number, Degree: 'Abs' },
  }));
}

/** [suffix family, degree]. The vowel of the suffix gives the gender. */
const DERIV: Array<[string, 'Dim' | 'Aug']> = [['it', 'Dim'], ['ill', 'Dim'], ['ic', 'Dim'], ['ot', 'Aug'], ['az', 'Aug']];

export function derivativesOf(lemma: string): NominalForm[] {
  const out: NominalForm[] = [];
  const mono = nuclei(lemma).length === 1;
  const last = lemma[lemma.length - 1];
  for (const [fam, Degree] of DERIV) {
    // how the base meets the suffix: drop the final vowel; after -e, -n, -r (and in one-syllable consonant words) put -c- or -ec- first
    let stems: string[] = [];
    if ('ao'.includes(last)) stems = [suffixStem(lemma)!];
    else if (fam !== 'ic' && fam !== 'ot' && fam !== 'az' && last === 'e') stems = [stripAccents(lemma) + 'c'];
    else if (fam !== 'ic' && fam !== 'ot' && fam !== 'az' && 'nr'.includes(last)) stems = [stripAccents(lemma) + (mono ? 'ec' : 'c')];
    for (const st of stems) {
      if (st.length < 2) continue;
      for (const [v, Gender] of [['o', 'Masc'], ['a', 'Fem']] as const) {
        const base = st + fam + v;
        out.push({ form: base, morph: { Gender, Number: 'Sing', Degree } });
        out.push({ form: base + 's', morph: { Gender, Number: 'Plur', Degree } });
      }
    }
  }
  return out;
}

const DERIV_ENDINGS = ['ísimo', 'ísima', 'ísimos', 'ísimas', ...['it', 'ill', 'ic', 'ot', 'az', 'cit', 'cill', 'ecit', 'ecill'].flatMap((f) => ['o', 'a', 'os', 'as'].map((v) => f + v))];

function derivationBases(f: string, stem: string): string[] {
  const c: string[] = [];
  for (const base of [stem, stem + 'o', stem + 'a', stem + 'e']) c.push(base);
  if (stem.endsWith('qu')) c.push(stem.slice(0, -2) + 'co', stem.slice(0, -2) + 'ca');
  if (stem.endsWith('gu')) c.push(stem.slice(0, -1) + 'o', stem.slice(0, -1) + 'a');
  if (stem.endsWith('c')) c.push(stem.slice(0, -1) + 'z');
  if (stem.endsWith('bil')) c.push(stem.slice(0, -3) + 'ble');
  void f;
  return unique(c.flatMap(accentVariants));
}

// ---------------------------------------------------------------------------------------------------------------

/** All nominal and derived readings of a written form whose base the caller vouches for. */
export function analyzeNominal(form: string, known: Known): NominalReading[] {
  const out: NominalReading[] = [];
  const seen = new Set<string>();
  const push = (r: NominalReading) => {
    const k = JSON.stringify([r.lemma, r.pos, r.morph]);
    if (!seen.has(k)) { seen.add(k); out.push(r); }
  };
  const POS: PartOfSpeech[] = ['NOUN', 'ADJ'];
  for (const lemma of inflectionBases(form)) {
    for (const pos of POS) {
      if (!known(lemma, pos)) continue;
      for (const nf of nominalForms(lemma, pos)) {
        if (nf.form !== form) continue;
        push({ lemma, pos, morph: nf.morph, derived: false, rule: lemma === form ? `the ${pos === 'NOUN' ? 'noun' : 'adjective'} itself` : `${pos === 'NOUN' ? 'noun' : 'adjective'} ${lemma}: ${nf.morph.Gender ? nf.morph.Gender === 'Fem' ? 'feminine ' : 'masculine ' : ''}${nf.morph.Number === 'Plur' ? 'plural' : 'singular'}` });
      }
    }
  }
  // superlatives, diminutives, augmentatives
  for (const suf of DERIV_ENDINGS) {
    if (!form.endsWith(suf) || form.length <= suf.length + 1) continue;
    const stem = form.slice(0, form.length - suf.length);
    for (const lemma of derivationBases(form, stem)) {
      for (const pos of POS) {
        if (!known(lemma, pos)) continue;
        const gens = suf.startsWith('ísim') ? (pos === 'ADJ' ? superlativesOf(lemma) : []) : derivativesOf(lemma);
        for (const g of gens) if (g.form === form) {
          push({
            lemma, pos, morph: g.morph, derived: true,
            rule: g.morph.Degree === 'Abs' ? `superlative (-ísimo) of the adjective ${lemma}` : `${g.morph.Degree === 'Dim' ? 'diminutive' : 'augmentative'} of ${lemma}`,
          });
        }
      }
    }
  }
  // adverbs in -mente
  if (form.endsWith('mente') && form.length > 7) {
    const stem = form.slice(0, -5);
    for (const lemma of unique([stem.endsWith('a') ? stem.slice(0, -1) + 'o' : stem, stem])) {
      if (known(lemma, 'ADJ')) push({ lemma, pos: 'ADV', morph: {}, derived: true, rule: `adverb in -mente from the adjective ${lemma}` });
    }
  }
  return out;
}

/** al = a + el, del = de + el. */
export function contractionParts(form: string): WordPart[] | undefined {
  if (form === 'al') return [{ text: 'a', start: 0, end: 1, lemma: 'a', pos: 'ADP' }, { text: 'l', start: 1, end: 2, lemma: 'el', pos: 'DET' }];
  if (form === 'del') return [{ text: 'de', start: 0, end: 2, lemma: 'de', pos: 'ADP' }, { text: 'l', start: 2, end: 3, lemma: 'el', pos: 'DET' }];
  return undefined;
}
