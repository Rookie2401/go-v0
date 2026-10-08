/**
 * Noun rows and the noun paradigm generator (Bokmål and Nynorsk). MACHINE-DRAFTED, pending native review.
 *
 * Row format:   lemma/g[~defsg][:plural][;defpl] = gloss [^] [#register]
 *   rom/n~rommet:0 = room          the definite singular written out when the rule would be wrong (rommet, teen)
 *
 *   bil/m = car                     masculine, plural by rule (bil-er, bil-ene)
 *   bok/f:bøker = book              feminine; Bokmål generates BOTH ei bok / boka and en bok / boken
 *   hus/n = house                   neuter, one syllable: zero plural (hus, husene / husa)
 *   eple/n:+r = apple               suffix spec: epler, eplene
 *   mann/m:menn;mennene = man       whole forms
 *   melk/m:- = milk                 no plural (mass noun)
 *   penger/pl = money               plural only
 *
 * Plural spec: `0` zero plural; `-` none; `+suffix` appended (`+er`, `+r`, `+ar`, `+e`); else whole forms joined by `|`.
 * `^` marks a row whose plural or definite forms the author is unsure of (recon cells marked (?)).
 */
import type { RegisterTag } from '../../core';
import type { NoGender, NoNoun, NoStandard } from './types';

const VOWELS = /[aeiouyæøå]/;

/** Number of vowel groups: a rough syllable count. */
export function syllables(w: string): number {
  return (w.toLowerCase().match(/[aeiouyæøå]+/g) ?? []).length;
}

const endsE = (w: string): boolean => /e$/.test(w);

function defaultPlural(lemma: string, g: NoGender, std: NoStandard): string[] {
  if (std === 'nb') {
    if (g === 'n') {
      if (syllables(lemma) === 1) return [lemma];
      return [endsE(lemma) ? `${lemma}r` : `${lemma}er`];
    }
    return [endsE(lemma) ? `${lemma}r` : `${lemma}er`];
  }
  // Nynorsk
  if (g === 'm') return [endsE(lemma) ? `${lemma.slice(0, -1)}ar` : `${lemma}ar`];
  if (g === 'f') return [endsE(lemma) ? `${lemma}r` : `${lemma}er`];
  return [lemma]; // neuter: zero plural
}

function applySuffix(lemma: string, suf: string): string {
  // +ar / +er / +r / +e after a lemma in -e: the e is dropped before a vowel, kept before r
  if (endsE(lemma) && /^[ae]/.test(suf)) return lemma.slice(0, -1) + suf;
  return lemma + suf;
}

/** Definite plural from an indefinite plural form. */
export function definitePlural(pl: string, g: NoGender, std: NoStandard, lemma: string): string[] {
  if (std === 'nb') {
    if (/er$/.test(lemma) && pl === `${lemma}e`) return [`${lemma}ne`]; // agent nouns: lærer, lærere, lærerne
    if (/er$/.test(pl) && pl !== lemma) return [`${pl.slice(0, -1)}ne`];
    if (endsE(pl)) return [`${pl}ne`];
    const out = [`${pl}ene`];
    if (g === 'n' && pl === lemma) out.push(endsE(pl) ? `${pl.slice(0, -1)}a` : `${pl}a`);
    return out;
  }
  if (/ar$/.test(pl)) return [`${pl.slice(0, -2)}ane`];
  if (/er$/.test(pl) && pl !== lemma) return [`${pl.slice(0, -1)}ne`];
  if (g === 'n' && pl === lemma) return [endsE(pl) ? `${pl.slice(0, -1)}a` : `${pl}a`];
  return [endsE(pl) ? `${pl}ne` : `${pl}ene`];
}

function definiteSingular(lemma: string, g: NoGender, std: NoStandard): NoNoun['defSg'] {
  const e = endsE(lemma);
  if (g === 'm') return [{ form: e ? `${lemma}n` : `${lemma}en`, gender: 'Masc' }];
  if (g === 'n') return [{ form: e ? `${lemma}t` : `${lemma}et`, gender: 'Neut' }];
  const fem = { form: e ? `${lemma.slice(0, -1)}a` : `${lemma}a`, gender: 'Fem' as const };
  if (std === 'nb') return [fem, { form: e ? `${lemma}n` : `${lemma}en`, gender: 'Masc' as const }];
  return [fem];
}

function parsePluralSpec(spec: string, lemma: string, g: NoGender, std: NoStandard): { plural: string[]; mass: boolean } {
  if (spec === '-') return { plural: [], mass: true };
  if (spec === '0') return { plural: [lemma], mass: false };
  if (spec === '') return { plural: defaultPlural(lemma, g, std), mass: false };
  return {
    plural: spec.split('|').map((p) => (p.startsWith('+') ? applySuffix(lemma, p.slice(1)) : p)),
    mass: false,
  };
}

export function parseNounRows(src: string, std: NoStandard): NoNoun[] {
  const out: NoNoun[] = [];
  for (const line of src.split('\n')) {
    const s = line.trim();
    if (!s || s.startsWith('//')) continue;
    const eq = s.indexOf('=');
    if (eq < 0) throw new Error(`noun row without "=": ${s}`);
    const head = s.slice(0, eq).trim();
    let gloss = s.slice(eq + 1).trim();
    const register: RegisterTag[] = [];
    let unverified = false;
    for (;;) {
      const m = /\s(\^|#[a-z-]+)$/.exec(gloss);
      if (!m) break;
      if (m[1] === '^') unverified = true; else register.push(m[1].slice(1) as RegisterTag);
      gloss = gloss.slice(0, m.index).trim();
    }
    const m = /^([^/:;~]+)\/(m|f|n|pl)(?:~([^:;]+))?(?::([^;]*))?(?:;(.+))?$/.exec(head);
    if (!m) throw new Error(`bad noun row head: ${head}`);
    const [, lemma, gcode, defOverride, plSpec = '', dpSpec] = m;
    if (gcode === 'pl') {
      const defPl = dpSpec ? dpSpec.split('|') : [endsE(lemma) ? `${lemma}ne` : /er$/.test(lemma) ? `${lemma.slice(0, -1)}ne` : `${lemma}ene`];
      out.push({
        lemma, gender: 'm', alsoMasc: false, gloss, massNoun: false, pluralOnly: true, plural: [lemma], defSg: [], defPl,
        source: 'machine-draft', unverified: unverified || undefined, register: register.length ? register : undefined,
      });
      continue;
    }
    const g = gcode as NoGender;
    const { plural, mass } = parsePluralSpec(plSpec, lemma, g, std);
    const defPl = mass ? [] : dpSpec ? dpSpec.split('|') : [...new Set(plural.flatMap((p) => definitePlural(p, g, std, lemma)))];
    out.push({
      lemma, gender: g, alsoMasc: std === 'nb' && g === 'f', gloss, massNoun: mass, plural,
      defSg: defOverride ? defOverride.split('|').map((form) => ({ form, gender: /a$/.test(form) && g === 'f' ? 'Fem' as const : g === 'm' ? 'Masc' as const : g === 'n' ? 'Neut' as const : 'Fem' as const })) : definiteSingular(lemma, g, std), defPl,
      source: 'machine-draft', unverified: unverified || undefined, register: register.length ? register : undefined,
    });
  }
  return out;
}

/** Proper nouns: `Norge = Norway`. One form (the genitive -s is read by the sentence layer). */
export function parseNameRows(src: string): NoNoun[] {
  const out: NoNoun[] = [];
  for (const line of src.split('\n')) {
    const s = line.trim();
    if (!s || s.startsWith('//')) continue;
    const [lemma, gloss] = s.split('=').map((x) => x.trim());
    out.push({ lemma, gender: 'm', alsoMasc: false, gloss, massNoun: true, plural: [], defSg: [], defPl: [], proper: true, source: 'machine-draft' });
  }
  return out;
}

export { VOWELS };
