/**
 * Spanish nouns, adjectives and derivation for the morphology engine: plurals (-s, -es, -ces, accent shifts), the
 * feminine of adjectives, the absolute superlative -ísimo, diminutives and augmentatives, adverbs in -mente, and the
 * contractions al / del.
 *
 * Nothing here guesses a lemma: every reading is built by GENERATING the forms of a candidate base and checking that
 * the written form is among them, and a candidate is only used when the caller's `known` says the lemma exists.
 */
import type { PartOfSpeech, WordPart } from '../../core';
import { nuclei, restress, stressInfo, stripAccents, transferStress, writeStress } from './morph-orth';

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
  // an unstressed -io goes whole before -ísimo (sucio → sucísimo, limpio → limpísimo); a stressed one keeps its i (frío → friísimo)
  const s = /[^aeiouáéíóú]io$/.test(lemma) ? suffixStem(lemma.slice(0, -2) + 'o') : suffixStem(lemma);
  if (!s || s.length < 2) return [];
  return [['ísimo', 'Masc', 'Sing'], ['ísima', 'Fem', 'Sing'], ['ísimos', 'Masc', 'Plur'], ['ísimas', 'Fem', 'Plur']].map(([suf, Gender, Number]) => ({
    form: s + suf, morph: { Gender, Number, Degree: 'Abs' },
  }));
}

/** [suffix family, degree]. The vowel of the suffix gives the gender. */
const DERIV: Array<[string, 'Dim' | 'Aug']> = [['it', 'Dim'], ['ill', 'Dim'], ['ic', 'Dim'], ['ot', 'Aug'], ['az', 'Aug']];

/** c → qu, g → gu, z → c before the i or e of a suffix. */
const softened = (s: string): string => (s.endsWith('z') ? s.slice(0, -1) + 'c' : s.endsWith('c') ? s.slice(0, -1) + 'qu' : s.endsWith('g') ? s + 'u' : s);

/**
 * How a base meets -ito / -illo: the stems the suffix is added to. Several where usage has several (pueblito and
 * pueblecito, panecito and pancito).
 *   casa → cas-; coche → cochec- (and coch-: cochito); camión, mujer → camionc-, mujerc-; pastel, reloj, lápiz → pastel-, reloj-, lapic-;
 *   café, sofá → cafec-, sofac-; one syllable ending in a consonant: flor → florec-, florc-; pez → pecec-;
 *   two syllables with ie / ue, or ending in -io, -ia: pueblo → pueblec-, piedra → piedrec-, barrio → barriec-.
 */
function diminutiveStems(lemma: string): string[] {
  const plain = stripAccents(lemma);
  const last = lemma[lemma.length - 1];
  const ns = nuclei(lemma);
  if (!ns.length) return [];
  if ('áéíóú'.includes(last)) return [plain + 'c'];
  if ('ao'.includes(last)) {
    const out = [suffixStem(lemma)!];
    const first = lemma.slice(ns[0][0], ns[0][1]);
    const final = ns[ns.length - 1];
    if (ns.length === 2 && (first === 'ie' || first === 'ue' || final[1] - final[0] === 2)) out.push(softened(plain.slice(0, -1)) + 'ec');
    return out;
  }
  if (last === 'e') return ns.length === 1 ? [plain + 'c'] : [plain + 'c', softened(plain.slice(0, -1))];
  if (ns.length === 1) return 'nrl'.includes(last) ? [plain + 'ec', plain + 'c'] : [softened(plain) + 'ec'];
  if ('nr'.includes(last)) return [plain + 'c'];
  return [softened(plain)];
}

export function derivativesOf(lemma: string): NominalForm[] {
  const out: NominalForm[] = [];
  const last = lemma[lemma.length - 1];
  const push = (base: string, Gender: string, Degree: string, plural = base + 's') => {
    out.push({ form: base, morph: { Gender, Number: 'Sing', Degree } });
    out.push({ form: plural, morph: { Gender, Number: 'Plur', Degree } });
  };
  for (const [fam, Degree] of DERIV) {
    let stems: string[] = [];
    if (fam === 'it' || fam === 'ill') stems = diminutiveStems(lemma);
    else if (fam === 'ic') stems = 'ao'.includes(last) ? [suffixStem(lemma)!] : [];
    // -ote, -azo begin with a vowel that changes no spelling: boca → bocota, bocaza; grande → grandote
    else if ('aoe'.includes(last) && (fam === 'ot' || last !== 'e')) stems = [stripAccents(lemma.slice(0, -1))];
    for (const st of stems) {
      if (st.length < 2) continue;
      if (fam === 'ot') push(st + 'ote', 'Masc', Degree); // the masculine is -ote (librote), the feminine -ota
      else push(st + fam + 'o', 'Masc', Degree);
      push(st + fam + 'a', 'Fem', Degree);
    }
  }
  return out;
}

const DERIV_ENDINGS = ['ísimo', 'ísima', 'ísimos', 'ísimas', 'ote', 'otes', ...['it', 'ill', 'ic', 'ot', 'az', 'cit', 'cill', 'ecit', 'ecill'].flatMap((f) => ['o', 'a', 'os', 'as'].map((v) => f + v))];

function derivationBases(f: string, stem: string): string[] {
  const c: string[] = [];
  for (const base of [stem, stem + 'o', stem + 'a', stem + 'e', stem + 'io']) c.push(base);
  if (stem.endsWith('qu')) c.push(stem.slice(0, -2) + 'co', stem.slice(0, -2) + 'ca');
  if (stem.endsWith('gu')) c.push(stem.slice(0, -1) + 'o', stem.slice(0, -1) + 'a');
  if (stem.endsWith('c')) c.push(stem.slice(0, -1) + 'z');
  if (stem.endsWith('bil')) c.push(stem.slice(0, -3) + 'ble');
  void f;
  return unique(c.flatMap(accentVariants));
}

// ---------------------------------------------------------------------------------------------------------------

/** All nominal and derived readings of a written form whose base the caller vouches for. */
export function analyzeNominal(form: string, known: Known, genderOf?: (lemma: string, pos: PartOfSpeech) => string | undefined): NominalReading[] {
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
        // a diminutive or augmentative of a noun keeps the noun's gender (niño → niñito, not niñita): the list's gender, else the ending's.
        // A noun whose final vowel is not its gender's keeps that vowel as well (el tema → el temita, la mano → la manito beside la manita)
        const vowel = lemma.endsWith('o') ? 'Masc' : lemma.endsWith('a') ? 'Fem' : undefined;
        const keeps = pos === 'NOUN' && !suf.startsWith('ísim') ? genderOf?.(lemma, pos) ?? vowel : undefined;
        for (const g of gens) if (g.form === form && (!keeps || g.morph.Gender === keeps || g.morph.Gender === vowel)) {
          push({
            lemma, pos, morph: keeps && g.morph.Gender !== keeps ? { ...g.morph, Gender: keeps } : g.morph, derived: true,
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

export interface NominalGuess { lemma: string; pos: PartOfSpeech; morph: Record<string, string>; rule: string; /** Lower is likelier: below 1 before the verb guesses, above 1 after them. */ rank: number }

/**
 * Guesses for a form no list vouches for, read from its ending where the ending is regular: a plural in -ces, -es,
 * -os, -as; a feminine in -ora or -a. They name a lemma the rules only infer (never a confirmed one), and each is
 * offered as a noun and as an adjective since the ending does not say which. A noun or adjective of people is given
 * both as the masculine it may be filed under and, for the feminine, as its own headword (a dictionary files doctora
 * sometimes under doctor, sometimes alone).
 * `noVerb`: the caller found no verb reading of the form at all, so an ending that is usually a verb's (-amos, -emos,
 * -imos) can only be a plural here (ramos, gramos, máximos, ánimos).
 */
export function guessNominal(f: string, noVerb = false): NominalGuess[] {
  if (f.length < 4 || !/^[a-záéíóúüñ]+$/.test(f) || !nuclei(f).length) return [];
  const loanPlural = /[^aeiouáéíóúüsx]s$/.test(f); // bits, comics, records: a consonant before the plural -s is a loanword's
  if (nuclei(f).length < 2 && !loanPlural) return [];
  const out: NominalGuess[] = [];
  const both = (lemma: string, morph: Record<string, string>, rank: number, rule: string, adjective = true) => {
    if (!nuclei(lemma).length) return;
    out.push({ lemma, pos: 'NOUN', morph, rank, rule });
    if (adjective) out.push({ lemma, pos: 'ADJ', morph, rank: rank + 0.01, rule });
  };
  const withStress = (base: string): string | undefined => transferStress(f, stripAccents(base), 0); // joven ← jóvenes, canción ← canciones
  const plural = f.endsWith('s');
  const sg = plural ? f.slice(0, -1) : f; // the form without a plural -s
  const Number = plural ? 'Plur' : 'Sing';
  const many = nuclei(f).length >= 3;
  /** The consonant masculine a feminine in -a may belong to (campeona ← campeón, burguesa ← burgués): the stress moves to the last syllable. */
  const oxytone = (base: string): string | undefined => {
    const plain = stripAccents(base);
    for (let i = plain.length - 1; i >= 0; i--) if ('aeiou'.includes(plain[i])) return writeStress(plain, i);
    return undefined;
  };
  // the diminutive of a word the list does not hold: its base, after the verb guesses (librito ← libro, vecinita ← vecina, camioncito ← camión)
  const dim = /^(.{3,}?)(c?)(it|ill)([oa])s?$/.exec(f);
  if (dim && many) {
    const [, stem, c, , v] = dim;
    const Gender = v === 'o' ? 'Masc' : 'Fem';
    // before -cito the base is whole (camión, amor, coche); a c that is the base's own stands for z (placita ← plaza); qu and gu for c and g
    const base = !c ? (stem.endsWith('qu') ? stem.slice(0, -2) + 'c' : stem.endsWith('gu') ? stem.slice(0, -1) : stem) + v
      : /[nr]$/.test(stem) ? oxytone(stem) : stem.endsWith('e') ? stem : stem + 'z' + v;
    if (base && nuclei(base).length >= 2) both(base, { Number, Gender, Degree: 'Dim' }, 1.6, `diminutive of a noun or adjective ${base}`, !c);
  }
  if (f.endsWith('ces')) {
    const l = withStress(f.slice(0, -3) + 'z');
    if (l) both(l, { Number: 'Plur' }, 0.8, `plural of a noun or adjective ${l} (-ces ← -z)`);
  } else if (f.endsWith('es')) {
    const cons = withStress(f.slice(0, -2));
    const e = /[íú]e$/.test(sg) ? undefined : sg; // not historíes: an accented -íe is a verb's
    // a consonant noun ends in one consonant after a vowel (doctor, canción, ciudad, francés, mes); anything else (calle, nombre) takes -s.
    // After such a consonant the -e noun is possible too (sedes ← sede, bailes ← baile): it follows, as a noun only.
    // Not after -or, -ón: Spanish has no nouns in -ore, -one (inspectores, camaleones are only inspector, camaleón)
    if (cons && /[íú]$/.test(cons)) both(cons, { Number: 'Plur' }, 1.5, `plural of a noun or adjective ${cons} (-es after a stressed vowel)`); // jabalíes, iraníes; envíes is a verb's, so after the verb guesses
    else if (cons && /[aeiouáéíóú][lrnd]$/.test(cons)) {
      both(cons, { Number: 'Plur' }, 0.8, `plural of a noun or adjective ${cons} (-es)`);
      if (e && !/(or|ón)$/.test(cons)) both(e, { Number: 'Plur' }, 1.5, `plural of the noun ${e} (-s)`, false);
    } else if (cons && /[áéíóú]s$/.test(cons)) {
      both(cons, { Number: 'Plur' }, 0.8, `plural of a noun or adjective ${cons} (-es)`); // burgueses ← burgués, compases ← compás
      if (e) both(e, { Number: 'Plur' }, 1.5, `plural of the noun ${e} (-s)`, false);
    } else if (cons && /oj$/.test(cons)) both(cons, { Number: 'Plur' }, 0.8, `plural of the noun ${cons} (-es)`, false); // relojes
    else if (e) both(e, { Number: 'Plur' }, /aje$/.test(e) ? 0.8 : 1.5, `plural of a noun or adjective ${e} (-s)`); // -aje is a noun's ending (viajes, paisajes)
  } else if (f.endsWith('os')) {
    // -amos, -emos, -imos are first-person plural verb endings, not a plural noun
    if (noVerb || !/[aeiáéí]mos$/.test(f)) both(sg, { Number: 'Plur' }, 0.8, `plural of a noun or adjective ${sg} (-s)`);
  } else if (/[dts]oras?$/.test(f)) {
    // -dora, -tora, -sora: the feminine of an agent noun in -or
    both(sg.slice(0, -1), { Number, Gender: 'Fem' }, 0.8, `feminine of a noun or adjective ${sg.slice(0, -1)} (-ora ← -or)`);
    both(sg, { Number, Gender: 'Fem' }, 0.9, plural ? `plural of the noun ${sg}` : `the noun ${sg} itself`, false);
  } else if (sg.endsWith('a')) {
    const o = sg.slice(0, -1) + 'o';
    const ista = sg.endsWith('ista'); // -ista is one form for both genders, noun and adjective (artista, socialista)
    // a feminine in -ora, -ona, -esa may belong to a masculine that ends in a consonant (señora ← señor, campeona ← campeón, burguesa ← burgués)
    const consonant = /or$/.test(sg.slice(0, -1)) ? sg.slice(0, -1) : many && /(on|es)$/.test(sg.slice(0, -1)) ? oxytone(sg.slice(0, -1)) : undefined;
    if (consonant) both(consonant, { Number, Gender: 'Fem' }, 1.4, `feminine of a noun or adjective ${consonant} (-a added to the consonant)`);
    if (!ista) both(o, { Number, Gender: 'Fem' }, 1.5, `feminine of a noun or adjective ${o} (-a ← -o)`);
    both(sg, { Number }, ista ? 0.8 : 1.5, plural ? `plural of a noun or adjective ${sg} (-s)` : `the noun ${sg} itself`, ista);
  } else if (/[iuíú]s$/.test(f) && !f.endsWith('sis')) { // not análisis, tesis: those are singular
    both(sg, { Number: 'Plur' }, 1.5, `plural of a noun or adjective ${sg} (-s)`);
  } else if (/[áéó]s$/.test(f)) {
    both(sg, { Number: 'Plur' }, 1.5, `plural of the noun ${sg} (-s after a stressed vowel)`, false); // sofás, cafés, dominós
  } else if (loanPlural) {
    both(sg, { Number: 'Plur' }, 0.8, `plural of the noun ${sg} (-s after a consonant, as in a loanword)`, false);
  }
  return out;
}

/** al = a + el, del = de + el. */
export function contractionParts(form: string): WordPart[] | undefined {
  if (form === 'al') return [{ text: 'a', start: 0, end: 1, lemma: 'a', pos: 'ADP' }, { text: 'l', start: 1, end: 2, lemma: 'el', pos: 'DET' }];
  if (form === 'del') return [{ text: 'de', start: 0, end: 2, lemma: 'de', pos: 'ADP' }, { text: 'l', start: 2, end: 3, lemma: 'el', pos: 'DET' }];
  return undefined;
}
