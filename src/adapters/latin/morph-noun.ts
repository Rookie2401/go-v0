/**
 * Latin noun and adjective GENERATION: the cells (form + Case / Number / Gender / Degree) a lexeme takes, from its principal
 * parts. Spelling is plain (no macrons). Regular patterns of the five declensions; the i-stem rules of the third declension;
 * the few irregular nouns that matter in the Vulgate (deus, domus, Iesus) and the irregular comparisons (bonus, malus, magnus,
 * parvus, multus).
 *
 * Ported in substance from the Romance app (src/morphology/nounParadigm.ts, adjectiveParadigm.ts), which generates with macrons.
 */
import type { Cell, Feats } from './types';

const CASES = ['Nom', 'Gen', 'Dat', 'Acc', 'Abl', 'Voc'] as const;
type Case6 = (typeof CASES)[number];

/** Push the six singular or plural cells from a list of forms in the order Nom Gen Dat Acc Abl Voc; a form may be `a|b` for a main form and a variant. */
function six(out: Cell[], number: 'Sing' | 'Plur', forms: string[], extra: Feats = {}, note?: string): void {
  forms.forEach((f, i) => {
    for (const [k, form] of f.split('|').entries()) {
      out.push({ form, features: { Case: CASES[i], Number: number, ...extra }, ...(k > 0 ? { note: 'variant' } : note ? { note } : {}) });
    }
  });
}

const vowelGroups = (s: string): number => (s.match(/[aeiouy]+/g) ?? []).length;
const endsInTwoConsonants = (s: string): boolean => /[^aeiouy]{2}$/.test(s) || /x$/.test(s);
const NOT_ISTEM = new Set(['canis', 'iuvenis', 'vates', 'panis', 'senex', 'pater', 'mater', 'frater', 'accipiter', 'apis', 'volucris', 'sedes']);

/** Third declension masculine / feminine: does the genitive plural end in -ium? (Allen & Greenough: parisyllabic in -is / -es, or a monosyllable with two consonants before the -is.) */
export function isMascFemIStem(nom: string, stem: string): boolean {
  if (NOT_ISTEM.has(nom)) return false;
  if (/(is|es)$/.test(nom) && vowelGroups(nom) === vowelGroups(stem + 'is')) return true;
  return vowelGroups(nom) === 1 && endsInTwoConsonants(stem);
}
const isNeuterIStem = (nom: string): boolean => /(e|al|ar)$/.test(nom);

/** The declension a genitive singular names. */
export function declensionOf(gen: string, lemma?: string): '1' | '2' | '3' | '4' | '5' | undefined {
  if (/ae$/.test(gen)) return '1';
  // -ei is the genitive of the fifth declension (res, dies: nominative in -es) and of a second-declension noun in -eus / -aeus (puteus, Iudaeus)
  if (/ei$/.test(gen)) return lemma !== undefined && !/es$/.test(lemma) ? '2' : '5';
  if (/us$/.test(gen)) return '4';
  if (/is$/.test(gen)) return '3';
  if (/i$/.test(gen)) return '2';
  return undefined;
}

/** Fourth-declension nouns with a dative / ablative plural in -ubus beside -ibus (tribubus, artubus, lacubus, portubus). */
const UBUS = new Set(['tribus', 'artus', 'lacus', 'portus', 'partus', 'arcus', 'quercus', 'specus', 'pecu', 'veru']);

/** Hebrew names the Vulgate also declines with Latin endings: [case, ending added to the name ('+...'), or the whole form]. */
const LATINISED: Record<string, Array<[string, string]>> = {
  Iacob: [['Gen', '+i'], ['Dat', '+o'], ['Acc', '+um'], ['Abl', '+o']],
  Abraham: [['Gen', 'Abrahae'], ['Dat', 'Abrahae'], ['Acc', 'Abraham'], ['Abl', 'Abraham']],
  David: [['Gen', '+is'], ['Dat', '+i'], ['Acc', '+em'], ['Abl', '+e']],
  Ioseph: [['Gen', '+i'], ['Dat', '+o'], ['Acc', '+um'], ['Abl', '+o']],
  Isaac: [['Gen', '+i'], ['Dat', '+o'], ['Acc', '+um'], ['Abl', '+o']],
  Sion: [['Gen', '+is'], ['Dat', '+i']],
  Ierusalem: [['Gen', 'Ierosolymae'], ['Acc', 'Ierosolymam'], ['Abl', 'Ierosolymis']],
  Adam: [['Gen', '+i'], ['Acc', '+um']],
};

const AB_NOUNS = new Set(['dea', 'filia', 'mula', 'equa', 'liberta', 'nata', 'anima', 'serva', 'asina']);
/** Third-declension nouns with the accusative in -im beside -em (turrim, navim, puppim, sitim) and the ablative in -i. */
const ACC_IM = new Set(['turris', 'navis', 'puppis', 'sitis', 'securis', 'febris', 'tussis', 'restis', 'ravis', 'basis', 'pelvis', 'amussis', 'cucumis', 'vis']);

/** The cells of a noun. `gender` is m f n c (common) x (unknown), with a trailing `p` for a plural-only noun. */
export function nounCells(lemma: string, gen: string, gender: string): Cell[] {
  const out: Cell[] = [];
  // gender flags after the gender letter: p plural only, I forced i-stem (genitive plural -ium), K forced consonant stem
  const flags = gender.slice(1);
  const pluralOnly = flags.includes('p');
  const g = gender[0];
  const forceI = flags.includes('I') ? true : flags.includes('K') ? false : undefined;
  const greek = flags.includes('G');
  const lower = lemma.toLowerCase();
  if (lower === 'deus') {
    six(out, 'Sing', ['deus', 'dei', 'deo', 'deum', 'deo', 'deus']);
    six(out, 'Plur', ['dii|di|dei', 'deorum|deum', 'diis|dis|deis', 'deos', 'diis|dis|deis', 'dii|di|dei']);
    return out;
  }
  if (lower === 'domus') {
    six(out, 'Sing', ['domus', 'domus|domi', 'domui|domo', 'domum', 'domo|domu', 'domus']);
    out.push({ form: 'domi', features: { Case: 'Loc', Number: 'Sing' } });
    six(out, 'Plur', ['domus', 'domuum|domorum', 'domibus', 'domos|domus', 'domibus', 'domus']);
    return out;
  }
  if (lemma === 'vis') {
    six(out, 'Sing', ['vis', 'vis', 'vi', 'vim', 'vi', 'vis']);
    six(out, 'Plur', ['vires', 'virium', 'viribus', 'vires|viris', 'viribus', 'vires']);
    return out;
  }
  if (lemma === 'bos') {
    six(out, 'Sing', ['bos', 'bovis', 'bovi', 'bovem', 'bove', 'bos']);
    six(out, 'Plur', ['boves', 'boum|bovum', 'bobus|bubus', 'boves|bovis', 'bobus|bubus', 'boves']);
    return out;
  }
  if (lemma === 'Iuppiter') {
    six(out, 'Sing', ['Iuppiter', 'Iovis', 'Iovi', 'Iovem', 'Iove', 'Iuppiter']);
    return out;
  }
  if (lemma === 'Moyses') {
    six(out, 'Sing', ['Moyses', 'Moysi|Moysis', 'Moysi', 'Moysen|Moysem', 'Moyse', 'Moyses']);
    return out;
  }
  if (lemma === 'Iesus') {
    six(out, 'Sing', ['Iesus', 'Iesu', 'Iesu', 'Iesum', 'Iesu', 'Iesu']);
    return out;
  }
  if (!gen) {
    // a name the Vulgate leaves undeclined (Israel, David, Abraham): one form stands for every case
    for (const c of CASES) out.push({ form: lemma, features: { Case: c, Number: 'Sing' }, note: 'indeclinable' });
    // ... but some take Latin endings in places (Abrahae, Iacobi, Iacobum): listed as variants
    const latinised = LATINISED[lemma];
    if (latinised) for (const [c, ending] of latinised) out.push({ form: ending.startsWith('+') ? lemma + ending.slice(1) : ending, features: { Case: c, Number: 'Sing' }, note: 'variant' });
    return out;
  }
  const d = declensionOf(gen, lemma);
  if (!d) return out;
  const sg = (forms: string[]): void => { if (!pluralOnly) six(out, 'Sing', forms); };
  const pl = (forms: string[]): void => six(out, 'Plur', forms);
  if (d === '1') {
    const stem = gen.slice(0, -2);
    if (/e$/.test(lemma)) sg([lemma, stem + 'es', stem + 'ae', stem + 'en', lemma, lemma]);
    else if (/es$/.test(lemma)) sg([lemma, stem + 'ae|' + stem + 'es', stem + 'ae', stem + 'en|' + stem + 'am', stem + 'e|' + stem + 'a', stem + 'e|' + stem + 'a']);
    else if (/as$/.test(lemma)) sg([lemma, stem + 'ae', stem + 'ae', stem + 'an|' + stem + 'am', stem + 'a', stem + 'a']);
    else sg([lemma, stem + 'ae|' + stem + 'ai', stem + 'ae', stem + 'am', stem + 'a', lemma]);
    pl([stem + 'ae', stem + 'arum|' + stem + 'um', stem + 'is' + (AB_NOUNS.has(lower) ? '|' + stem + 'abus' : ''), stem + 'as', stem + 'is' + (AB_NOUNS.has(lower) ? '|' + stem + 'abus' : ''), stem + 'ae']);
  } else if (d === '2') {
    const stem = gen.slice(0, -1);
    if (g === 'n') {
      sg([lemma, stem + 'i', stem + 'o', lemma, stem + 'o', lemma]);
      pl([stem + 'a', stem + 'orum|' + stem + 'um', stem + 'is', stem + 'a', stem + 'is', stem + 'a']);
    } else {
      const voc = /ius$/.test(lemma) ? stem : /us$/.test(lemma) ? stem + 'e' : lemma;
      sg([lemma, stem + 'i' + (/ii$/.test(gen) ? '|' + stem : ''), stem + 'o', stem + 'um', stem + 'o', voc + (/^(Deus)$/.test(lemma) ? '|' + lemma : '')]);
      // locus has the neuter plural loca beside loci (loca deserta, loca sancta): an alternative in the three plural cells (2026-10-25)
      const het = lower === 'locus' ? '|loca' : '';
      pl([stem + 'i' + het, stem + 'orum|' + stem + 'um', stem + 'is', stem + 'os' + het, stem + 'is', stem + 'i' + het]);
    }
  } else if (d === '3') {
    const stem = gen.slice(0, -2);
    if (g === 'n') {
      const i = forceI ?? isNeuterIStem(lemma);
      sg([lemma, stem + 'is', stem + 'i', lemma, stem + (i ? 'i' : 'e'), lemma]);
      pl([stem + (i ? 'ia' : 'a'), stem + (i ? 'ium|' + stem + 'um' : 'um|' + stem + 'ium'), stem + 'ibus', stem + (i ? 'ia' : 'a'), stem + 'ibus', stem + (i ? 'ia' : 'a')]);
    } else {
      const i = forceI ?? isMascFemIStem(lemma.toLowerCase(), stem.toLowerCase());
      const acc = ACC_IM.has(lemma) ? stem + 'im|' + stem + 'em' : stem + 'em' + (greek ? '|' + stem + 'a' : '');
      sg([lemma, stem + 'is', stem + 'i', acc, stem + 'e' + (i || ACC_IM.has(lemma) ? '|' + stem + 'i' : ''), lemma]);
      pl([stem + 'es', stem + (i ? 'ium|' + stem + 'um' : 'um|' + stem + 'ium'), stem + 'ibus', stem + 'es' + (i || greek ? '|' + stem + (greek ? 'as' : 'is') : ''), stem + 'ibus', stem + 'es']);
    }
  } else if (d === '4') {
    const stem = gen.slice(0, -2);
    if (g === 'n') {
      sg([lemma, stem + 'us', stem + 'u', lemma, stem + 'u', lemma]);
      pl([stem + 'ua', stem + 'uum', stem + 'ibus', stem + 'ua', stem + 'ibus', stem + 'ua']);
    } else {
      sg([lemma, stem + 'us', stem + 'ui|' + stem + 'u', stem + 'um', stem + 'u', lemma]);
      const ubus = UBUS.has(lemma) ? '|' + stem + 'ubus' : '';
      pl([stem + 'us', stem + 'uum', stem + 'ibus' + ubus, stem + 'us', stem + 'ibus' + ubus, stem + 'us']);
    }
  } else {
    const stem = gen.slice(0, -2);
    const afterVowel = /[aeiou]$/.test(stem);
    sg([lemma, stem + 'ei' + (afterVowel ? '|' + stem + 'e' : ''), stem + 'ei' + (afterVowel ? '|' + stem + 'e' : ''), stem + 'em', stem + 'e', lemma]);
    pl([stem + 'es', stem + 'erum', stem + 'ebus', stem + 'es', stem + 'ebus', stem + 'es']);
  }
  return out;
}

// ─────────────────────────── adjectives ───────────────────────────

const GENDERS = ['Masc', 'Fem', 'Neut'] as const;
type G3 = (typeof GENDERS)[number];

function adjOut(out: Cell[], gender: G3, number: 'Sing' | 'Plur', forms: string[], extra: Feats): void {
  forms.forEach((f, i) => {
    for (const [k, form] of f.split('|').entries()) out.push({ form, features: { Case: CASES[i] as Case6, Number: number, Gender: gender, ...extra }, ...(k > 0 ? { note: 'variant' } : {}) });
  });
}

/** First / second declension (bonus -a -um) from a stem: masculine in -us (or the bare stem for -er), feminine -a, neuter -um. */
function cells12(masc: string, stem: string, fem: string, extra: Feats): Cell[] {
  const out: Cell[] = [];
  const stemM = /(us)$/.test(masc) ? masc.slice(0, -2) : stem;
  const voc = /ius$/.test(masc) ? stemM : /us$/.test(masc) ? stemM + 'e' : masc;
  adjOut(out, 'Masc', 'Sing', [masc, stemM + 'i', stemM + 'o', stemM + 'um', stemM + 'o', voc], extra);
  adjOut(out, 'Masc', 'Plur', [stemM + 'i', stemM + 'orum|' + stemM + 'um', stemM + 'is', stemM + 'os', stemM + 'is', stemM + 'i'], extra);
  const f = fem;
  const fstem = f.slice(0, -1);
  adjOut(out, 'Fem', 'Sing', [f, fstem + 'ae', fstem + 'ae', fstem + 'am', fstem + 'a', f], extra);
  adjOut(out, 'Fem', 'Plur', [fstem + 'ae', fstem + 'arum|' + fstem + 'um', fstem + 'is', fstem + 'as', fstem + 'is', fstem + 'ae'], extra);
  const n = fstem + 'um';
  adjOut(out, 'Neut', 'Sing', [n, stemM + 'i', stemM + 'o', n, stemM + 'o', n], extra);
  adjOut(out, 'Neut', 'Plur', [fstem + 'a', stemM + 'orum', stemM + 'is', fstem + 'a', stemM + 'is', fstem + 'a'], extra);
  return out;
}

/** Third declension: `stem` + the endings; nomMF / nomN are the nominative singulars (the same word for a one-termination adjective). */
function cells3(stem: string, nomM: string, nomF: string, nomN: string, extra: Feats, opts: { iStem?: boolean; ablE?: boolean } = {}): Cell[] {
  const out: Cell[] = [];
  const i = opts.iStem !== false;
  // the ablative in -i, and in -e beside it (omnipotente, forte): the Vulgate writes both
  const abl = opts.ablE ? stem + 'e|' + stem + 'i' : stem + 'i|' + stem + 'e';
  for (const [gender, nom] of [['Masc', nomM], ['Fem', nomF]] as const) {
    adjOut(out, gender, 'Sing', [nom, stem + 'is', stem + 'i', stem + 'em', abl, nom], extra);
    adjOut(out, gender, 'Plur', [stem + 'es', stem + (i ? 'ium|' + stem + 'um' : 'um'), stem + 'ibus', stem + 'es|' + stem + 'is', stem + 'ibus', stem + 'es'], extra);
  }
  adjOut(out, 'Neut', 'Sing', [nomN, stem + 'is', stem + 'i', nomN, abl, nomN], extra);
  adjOut(out, 'Neut', 'Plur', [stem + (i ? 'ia' : 'a'), stem + (i ? 'ium' : 'um'), stem + 'ibus', stem + (i ? 'ia' : 'a'), stem + 'ibus', stem + (i ? 'ia' : 'a')], extra);
  return out;
}

const IRREGULAR_COMPARISON: Record<string, { cmp: string; sup: string }> = {
  bonus: { cmp: 'melior', sup: 'optimus' }, malus: { cmp: 'peior', sup: 'pessimus' }, magnus: { cmp: 'maior', sup: 'maximus' },
  parvus: { cmp: 'minor', sup: 'minimus' }, multus: { cmp: 'plus', sup: 'plurimus' },
};
const LIMUS = new Set(['facilis', 'difficilis', 'similis', 'dissimilis', 'gracilis', 'humilis']);
/** Adjectives that do not compare (a participial or absolute sense): no comparative / superlative cells are generated. */
const NO_COMPARISON = new Set(['omnis', 'unus', 'totus', 'solus', 'ceterus', 'nullus', 'alius', 'summus', 'proximus', 'primus', 'ultimus', 'optimus', 'maximus', 'minimus', 'pessimus', 'plurimus', 'prior', 'ambo', 'nequam']);

/** The three degrees' stems: the positive stem (what -ior / -issimus attach to). */
/** The whole forms a Hebrew name takes with Latin endings (so that the prefix index can find them). */
export function latinisedForms(lemma: string): string[] {
  return (LATINISED[lemma] ?? []).map(([, e]) => (e.startsWith('+') ? lemma + e.slice(1) : e));
}

export function adjectiveStem(type: string, lemma: string, fem: string): string {
  if (type === 'cmp') return lemma.replace(/ior$/, '');
  return positiveStem(type, lemma, fem);
}
function positiveStem(type: string, lemma: string, fem: string): string {
  if (type === '12') return lemma.replace(/us$/, '');
  if (type === '12r') return fem.replace(/a$/, '');
  if (type === '3a') return fem.replace(/is$/, '');
  if (type === '3b') return lemma.replace(/is$/, '');
  return fem.replace(/is$/, ''); // 3x: fem holds the genitive
}

export function comparativeCells(stemCmp: string, extra: Feats = {}, mf = 'ior', n = 'ius'): Cell[] {
  const out: Cell[] = [];
  const nomMF = stemCmp + mf;
  const nomN = stemCmp + n;
  const s = nomMF;
  for (const gender of ['Masc', 'Fem'] as const) {
    adjOut(out, gender, 'Sing', [nomMF, s + 'is', s + 'i', s + 'em', s + 'e|' + s + 'i', nomMF], { Degree: 'Cmp', ...extra });
    adjOut(out, gender, 'Plur', [s + 'es', s + 'um', s + 'ibus', s + 'es|' + s + 'is', s + 'ibus', s + 'es'], { Degree: 'Cmp', ...extra });
  }
  adjOut(out, 'Neut', 'Sing', [nomN, s + 'is', s + 'i', nomN, s + 'e|' + s + 'i', nomN], { Degree: 'Cmp', ...extra });
  adjOut(out, 'Neut', 'Plur', [s.slice(0, -2) + 'ora', s + 'um', s + 'ibus', s.slice(0, -2) + 'ora', s + 'ibus', s.slice(0, -2) + 'ora'], { Degree: 'Cmp', ...extra });
  return out;
}

/** The cells of an adjective in all three degrees. `type`: 12 (bonus), 12r (pulcher), 3a (acer, acris, acre), 3b (fortis, forte), 3x (felix, felicis; `fem` holds the genitive). */
export function adjectiveCells(lemma: string, type: string, fem: string, neut: string, opts: { degrees?: boolean; cmpStem?: string; supStem?: string } = {}): Cell[] {
  let out: Cell[] = [];
  const stem = positiveStem(type, lemma, fem);
  if (type === '12') out = cells12(lemma, stem, fem, {});
  else if (type === '12r') out = cells12(lemma, stem, fem, {});
  else if (type === '3a') out = cells3(stem, lemma, fem, neut, {}, { iStem: true });
  else if (type === '3b') out = cells3(stem, lemma, lemma, neut, {}, { iStem: true });
  else if (type === 'cmp') return comparativeCells(lemma.replace(/ior$/, ''));
  else if (type === 'I') return [{ form: lemma, features: {}, note: 'indeclinable' }];
  else if (type === '3x') {
    const consonantal = /^(vetus|dives|pauper|princeps|inops|memor|particeps|superstes|compos|impos|sospes|caelebs|puber|deses|iuvenis|senex|dives|vetus)$/.test(lemma);
    out = cells3(stem, lemma, lemma, lemma, {}, { iStem: !consonantal, ablE: consonantal });
  } else return out;
  if (opts.degrees === false || NO_COMPARISON.has(lemma)) return out;
  // the comparative and superlative stems the dictionary gives, when it gives them (irregular ones: ulter, ultimus)
  if (opts.cmpStem || opts.supStem) {
    const extra: Cell[] = [];
    if (opts.cmpStem) extra.push(...comparativeCells(opts.cmpStem, {}, 'or', 'us'));
    if (opts.supStem) extra.push(...cells12(opts.supStem + 'mus', opts.supStem + 'm', opts.supStem + 'ma', { Degree: 'Sup' }));
    if (!IRREGULAR_COMPARISON[lemma]) return [...out, ...extra, ...regularDegrees(lemma, type, stem)];
    return [...out, ...extra];
  }
  // comparative and superlative
  const irr = IRREGULAR_COMPARISON[lemma];
  if (irr) {
    if (lemma === 'multus') {
      // plus: neuter singular noun-like (plus, pluris), plural plures / plura; the m/f plural declines
      const sup = cells12(irr.sup, irr.sup.replace(/us$/, ''), irr.sup.replace(/us$/, 'a'), { Degree: 'Sup' });
      const cmp: Cell[] = [];
      adjOut(cmp, 'Neut', 'Sing', ['plus', 'pluris', 'pluri', 'plus', 'plure', 'plus'], { Degree: 'Cmp' });
      for (const g of ['Masc', 'Fem'] as const) adjOut(cmp, g, 'Plur', ['plures', 'plurium', 'pluribus', 'plures|pluris', 'pluribus', 'plures'], { Degree: 'Cmp' });
      adjOut(cmp, 'Neut', 'Plur', ['plura', 'plurium', 'pluribus', 'plura', 'pluribus', 'plura'], { Degree: 'Cmp' });
      return [...out, ...cmp, ...sup];
    }
    return [...out, ...(lemma === 'parvus' ? comparativeCells('min', {}, 'or', 'us') : comparativeCells(irr.cmp.slice(0, -3))), ...cells12(irr.sup, irr.sup.replace(/us$/, ''), irr.sup.replace(/us$/, 'a'), { Degree: 'Sup' })];
  }
  return [...out, ...regularDegrees(lemma, type, stem)];
}

function regularDegrees(lemma: string, type: string, stem: string): Cell[] {
  const supStem = type === '12r' || type === '3a' ? lemma + 'rim' : LIMUS.has(lemma) ? stem + 'lim' : stem + 'issim';
  return [...comparativeCells(stem), ...cells12(supStem + 'us', supStem, supStem + 'a', { Degree: 'Sup' })];
}

/** The adverb of an adjective (clare, fortiter, prudenter) with its comparative and superlative, by the regular rule; undefined when the adjective's sense makes no adverb. */
export function adverbOf(lemma: string, type: string, fem: string): { positive: string; comparative: string; superlative: string } | undefined {
  if (NO_COMPARISON.has(lemma) && !IRREGULAR_COMPARISON[lemma]) return undefined;
  const stem = positiveStem(type, lemma, fem);
  if (lemma === 'bonus') return { positive: 'bene', comparative: 'melius', superlative: 'optime' };
  if (lemma === 'malus') return { positive: 'male', comparative: 'peius', superlative: 'pessime' };
  if (lemma === 'magnus') return { positive: 'magnopere', comparative: 'magis', superlative: 'maxime' };
  if (lemma === 'parvus') return { positive: 'parum', comparative: 'minus', superlative: 'minime' };
  if (lemma === 'multus') return { positive: 'multum', comparative: 'plus', superlative: 'plurimum' };
  const positive = type === '12' || type === '12r' ? stem + 'e' : type === '3x' && /ns$/.test(lemma) ? stem + 'er' : stem + 'iter';
  const supStem = type === '12r' || type === '3a' ? lemma + 'rim' : LIMUS.has(lemma) ? stem + 'lim' : stem + 'issim';
  return { positive, comparative: stem + 'ius', superlative: supStem + 'e' };
}
