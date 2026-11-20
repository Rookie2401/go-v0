/**
 * French nouns and adjectives for the morphology engine (MORPH package, docs/french/PLAN.md): plurals, feminines,
 * adverbs in -ment, and guesses from the ending. MACHINE-DRAFTED from standard grammar tables, not checked by a native speaker.
 *
 * Nothing here guesses a lemma: every reading is built by GENERATING the forms of a candidate base and checking that the
 * written form is among them, and a candidate is only used when the caller's `known` says the lemma exists. A final -s, -x or
 * -z is NOT taken to be a plural unless the singular is known; `guessNominal` offers the plural of an unknown word only as an
 * inferred reading beside the singular one.
 */
import type { PartOfSpeech } from '../../core';

export type Known = (lemma: string, pos: PartOfSpeech) => boolean;
export interface NominalForm { form: string; morph: Record<string, string> }
export interface NominalReading {
  lemma: string;
  pos: PartOfSpeech;
  morph: Record<string, string>;
  rule: string;
  /** Derivations (an adverb in -ment, the feminine counterpart of a noun) are weaker evidence than inflections. */
  derived: boolean;
  /** The reading is the feminine counterpart of a masculine noun: dropped by the caller when a verb or another word explains the form. */
  counterpart?: boolean;
}

const unique = <T>(xs: T[]): T[] => [...new Set(xs)];
const set = (s: string): ReadonlySet<string> => new Set(s.split(/\s+/).filter(Boolean));

// ---------------------------------------------------------------------------------------------------------------
// plurals

/** Irregular plurals (the list of every form the plural has). */
const PLURAL_IRR: Record<string, string[]> = {
  œil: ['yeux', 'œils'], ciel: ['cieux', 'ciels'], aïeul: ['aïeuls', 'aïeux'], travail: ['travaux', 'travails'],
  monsieur: ['messieurs'], madame: ['mesdames'], mademoiselle: ['mesdemoiselles'], bonhomme: ['bonshommes'], gentilhomme: ['gentilshommes'],
  monseigneur: ['messeigneurs'], ail: ['ails', 'aulx'], 'grand-mère': ['grands-mères'], 'grand-père': ['grands-pères'], 'grand-parent': ['grands-parents'],
  'beau-père': ['beaux-pères'], 'belle-mère': ['belles-mères'], 'beau-frère': ['beaux-frères'], 'belle-sœur': ['belles-sœurs'],
  'arc-en-ciel': ['arcs-en-ciel'], 'chef-lieu': ['chefs-lieux'], "chef-d'œuvre": ["chefs-d'œuvre"], 'rendez-vous': ['rendez-vous'],
  'porte-monnaie': ['porte-monnaie'], 'gratte-ciel': ['gratte-ciel'], 'week-end': ['week-ends'], 'après-midi': ['après-midi', 'après-midis'],
  'coffre-fort': ['coffres-forts'], 'sous-sol': ['sous-sols'], 'tire-bouchon': ['tire-bouchons'], 'chou-fleur': ['choux-fleurs'],
};

/** -ou nouns with -oux; every other -ou takes -s. */
const OU_OUX = set('bijou caillou chou genou hibou joujou pou');
/** -eu, -au words with -s. */
const EU_AU_S = set('bleu pneu émeu enfeu landau sarrau');
/** -al words with -s (the others take -aux). */
const AL_S = set('bal bocal cal caracal carnaval cérémonial chacal choral copal festival gavial mistral narval nopal pal récital régal rorqual serval étal aval val sisal santal bancal fatal natal naval tonal causal glacial pascal');
/** -al words with both. */
const AL_BOTH = set('banal final idéal austral boréal');
/** -ail words with -aux; every other -ail takes -ails. */
const AIL_AUX = set('bail corail émail soupirail vantail vitrail ventail fermail gemmail');

/** The plural(s) of a singular noun or adjective. Empty when the form is not one this module inflects. */
export function pluralsOf(sg: string): string[] {
  if (sg.length < 2) return [];
  const irr = PLURAL_IRR[sg];
  if (irr) return irr;
  if (/[\s']/.test(sg) || sg.includes('-')) return [];
  if (/[sxz]$/.test(sg)) return [sg];
  if (sg.endsWith('eau') || (sg.endsWith('au') && !EU_AU_S.has(sg))) return [sg + 'x'];
  if (sg.endsWith('au')) return [sg + 's'];
  if (/eu$|œu$/.test(sg)) return EU_AU_S.has(sg) ? [sg + 's'] : [sg + 'x'];
  if (sg.endsWith('ou')) return OU_OUX.has(sg) ? [sg + 'x'] : [sg + 's'];
  if (sg.endsWith('al')) {
    if (AL_BOTH.has(sg)) return [sg.slice(0, -2) + 'aux', sg + 's'];
    return AL_S.has(sg) ? [sg + 's'] : [sg.slice(0, -2) + 'aux'];
  }
  if (sg.endsWith('ail')) return AIL_AUX.has(sg) ? [sg.slice(0, -3) + 'aux'] : [sg + 's'];
  return [sg + 's'];
}

// ---------------------------------------------------------------------------------------------------------------
// feminines

/** Whole irregular feminines (adjectives and a few nouns). */
const FEM_IRR: Record<string, string[]> = {
  beau: ['belle'], nouveau: ['nouvelle'], vieux: ['vieille'], fou: ['folle'], mou: ['molle'], jumeau: ['jumelle'],
  doux: ['douce'], faux: ['fausse'], roux: ['rousse'], long: ['longue'], oblong: ['oblongue'], frais: ['fraîche'],
  épais: ['épaisse'], gros: ['grosse'], gras: ['grasse'], bas: ['basse'], las: ['lasse'], gentil: ['gentille'],
  favori: ['favorite'], malin: ['maligne'], bénin: ['bénigne'], tiers: ['tierce'], sec: ['sèche'], blanc: ['blanche'],
  franc: ['franche'], bref: ['brève'], nul: ['nulle'], sot: ['sotte'], vieillot: ['vieillotte'], pâlot: ['pâlotte'],
  maigriot: ['maigriotte'], jeunot: ['jeunotte'], boulot: ['boulotte'], bellot: ['bellotte'], coi: ['coite'], métis: ['métisse'],
  exprès: ['expresse'], profès: ['professe'], paysan: ['paysanne'], grec: ['grecque'], turc: ['turque'], ammoniac: ['ammoniaque'],
  chat: ['chatte'], loup: ['louve'], compagnon: ['compagne'], duc: ['duchesse'], comte: ['comtesse'], prince: ['princesse'],
  maître: ['maîtresse'], hôte: ['hôtesse'], poète: ['poétesse'], tigre: ['tigresse'], âne: ['ânesse'], prêtre: ['prêtresse'],
  traître: ['traîtresse'], dieu: ['déesse'], héros: ['héroïne'], tuteur: ['tutrice'], 'sauf': ['sauve'],
  enchanteur: ['enchanteresse'], vengeur: ['vengeresse'], pécheur: ['pécheresse'], demandeur: ['demanderesse'], défendeur: ['défenderesse'], bailleur: ['bailleresse'],
  chasseur: ['chasseuse', 'chasseresse'], hébreu: ['hébraïque'],
};
/** The masculine forms used before a vowel. */
const VOWEL_FORM: Record<string, string> = { beau: 'bel', nouveau: 'nouvel', vieux: 'vieil', fou: 'fol', mou: 'mol' };
/** -et → -ète. */
const ET_ETE = set('complet incomplet concret discret indiscret inquiet replet secret désuet quiet');
/** -eur with -e (meilleure). */
const EUR_E = set('meilleur supérieur inférieur antérieur postérieur intérieur extérieur ultérieur majeur mineur ingénieur prieur docteur professeur');
/** -teur with -teuse; every other -teur takes -trice. */
const TEUR_TEUSE = set('chanteur menteur porteur acheteur flatteur sauteur visiteur dompteur conteur batteur quêteur transporteur rapporteur emporteur coupeur');

/** The feminine form(s) of a masculine adjective or noun. Empty when there is none by rule; the word itself when it ends in -e. */
export function feminineOf(m: string): string[] {
  const irr = FEM_IRR[m];
  if (irr) return irr;
  if (m.length < 2 || /[\s']/.test(m) || m.includes('-')) return [];
  if (m.endsWith('e')) return [m];
  if (m.endsWith('eau')) return [];
  if (m.endsWith('eux')) return [m.slice(0, -1) + 'se'];
  if (m.endsWith('oux')) return [m.slice(0, -1) + 'se'];
  if (/x$/.test(m)) return [];
  if (m.endsWith('eur')) {
    if (EUR_E.has(m)) return [m + 'e'];
    if (m.endsWith('teur')) return TEUR_TEUSE.has(m) || /(porteur|chanteur)$/.test(m) ? [m.slice(0, -1) + 'se'] : [m.slice(0, -3) + 'rice'];
    return [m.slice(0, -1) + 'se'];
  }
  if (m.endsWith('er')) return [m.slice(0, -2) + 'ère'];
  if (m.endsWith('f')) return [m.slice(0, -1) + 've'];
  if (/(el|eil)$/.test(m)) return [m + 'le'];
  if (/(en|on)$/.test(m)) return [m + 'ne'];
  if (m.endsWith('et')) return [ET_ETE.has(m) ? m.slice(0, -2) + 'ète' : m + 'te'];
  if (m.endsWith('c')) return [m.slice(0, -1) + 'que'];
  if (m.endsWith('gu')) return [m + 'ë'];
  if (m.endsWith('g')) return [m + 'ue'];
  return [m + 'e'];
}

/**
 * The feminines the analyser tries for a word the list vouches for: the rule's own and, for a -teur word, the other
 * ending too (the rule cannot tell amatrice from prometteuse: the Latin -teur of lecteur takes -trice, the verb's -eur of
 * chanteur takes -euse, and a few words follow neither). Generation of the paradigm table uses `feminineOf` alone.
 */
export function feminineCandidates(m: string): string[] {
  const primary = feminineOf(m);
  if (!m.endsWith('teur') || FEM_IRR[m] || EUR_E.has(m)) return primary;
  return unique([...primary, m.slice(0, -3) + 'rice', m.slice(0, -1) + 'se']);
}

// ---------------------------------------------------------------------------------------------------------------
// generation

/**
 * Every inflected form of a noun or adjective with its features. Nouns carry Gender when `gender` is 'Masc' or 'Fem'.
 * `wide`: the analyser's view, with the alternative feminines of `feminineCandidates`.
 */
export function nominalForms(lemma: string, pos: PartOfSpeech, gender?: string, wide = false): NominalForm[] {
  const out: NominalForm[] = [];
  const add = (form: string, morph: Record<string, string>) => {
    if (!out.some((o) => o.form === form && o.morph.Number === morph.Number && o.morph.Gender === morph.Gender)) out.push({ form, morph });
  };
  if (pos === 'NOUN') {
    const g: Record<string, string> = gender && /^(Masc|Fem|Fem,Masc)$/.test(gender) ? { Gender: gender } : {};
    add(lemma, { ...g, Number: 'Sing' });
    for (const p of pluralsOf(lemma)) add(p, { ...g, Number: 'Plur' });
    return out;
  }
  if (pos !== 'ADJ') return out;
  const fems = wide ? feminineCandidates(lemma) : feminineOf(lemma);
  add(lemma, { Gender: 'Masc', Number: 'Sing' });
  const vowel = VOWEL_FORM[lemma];
  if (vowel) add(vowel, { Gender: 'Masc', Number: 'Sing' });
  for (const p of pluralsOf(lemma)) add(p, { Gender: 'Masc', Number: 'Plur' });
  for (const f of fems) {
    add(f, { Gender: 'Fem', Number: 'Sing' });
    for (const p of pluralsOf(f)) add(p, { Gender: 'Fem', Number: 'Plur' });
  }
  return out;
}

/** The feminine counterpart of a masculine noun (chanteur → chanteuse, lion → lionne), only when it differs from the noun. */
export function nounFeminineForms(lemma: string, wide = false): NominalForm[] {
  const out: NominalForm[] = [];
  for (const f of wide ? feminineCandidates(lemma) : feminineOf(lemma)) {
    if (f === lemma) continue;
    out.push({ form: f, morph: { Gender: 'Fem', Number: 'Sing' } });
    for (const p of pluralsOf(f)) out.push({ form: p, morph: { Gender: 'Fem', Number: 'Plur' } });
  }
  return out;
}

// ---------------------------------------------------------------------------------------------------------------
// analysis by generation

/** Candidate singular bases of a plural-looking form. */
function pluralBases(f: string): string[] {
  const c: string[] = [f];
  if (f.endsWith('s') && f.length > 2) c.push(f.slice(0, -1));
  if (f.endsWith('x')) {
    c.push(f.slice(0, -1));
    if (f.endsWith('aux')) c.push(f.slice(0, -3) + 'al', f.slice(0, -3) + 'ail', f.slice(0, -1));
    if (f.endsWith('eux')) c.push(f.slice(0, -1), f.slice(0, -1) + 'x');
    if (f.endsWith('oux')) c.push(f.slice(0, -1));
  }
  for (const [sg, pls] of Object.entries(PLURAL_IRR)) if (pls.includes(f)) c.push(sg);
  return unique(c);
}

/** [feminine ending, masculine endings it may come from]. Generation then decides. */
const FEM_REV: Array<[string, string[]]> = [
  ['ère', ['er']], ['euse', ['eux', 'eur']], ['trice', ['teur']], ['eresse', ['eur']], ['esse', ['', 'e']], ['ve', ['f']], ['ive', ['if']], ['ève', ['ef']],
  ['sse', ['s', 'x']], ['se', ['x']], ['ce', ['x']], ['che', ['c']], ['èche', ['ec']], ['que', ['c', 'g']], ['gue', ['g']], ['guë', ['gu']],
  ['ète', ['et']], ['ette', ['et', 'at']], ['otte', ['ot']], ['elle', ['el', 'eau']], ['olle', ['ou']], ['eille', ['eil', 'eux']], ['ille', ['il']],
  ['enne', ['en']], ['onne', ['on']], ['anne', ['an']], ['ine', ['in']], ['igne', ['in']], ['ite', ['i']], ['ulle', ['ul']], ['ve', ['f']],
  ['ie', ['i']], ['ée', ['é']], ['ue', ['u']], ['e', ['']],
];

/** Candidate masculine bases of a feminine-looking form. */
function feminineBases(f: string): string[] {
  const c: string[] = [];
  for (const [fe, mascs] of FEM_REV) {
    if (!f.endsWith(fe) || f.length <= fe.length) continue;
    const stem = f.slice(0, -fe.length);
    for (const m of mascs) c.push(stem + m);
  }
  if (f.endsWith('ce')) c.push(f.slice(0, -2) + 'c');
  return unique(c);
}

const PLAIN_VOWEL = /[aeiouyàâäéèêëîïôöùûü]$/;

/**
 * An adverb in -ment: the adjective it comes from. lentement ← lent, heureusement ← heureux, vraiment ← vrai, évidemment ← évident,
 * constamment ← constant, énormément ← énorme. Each candidate is checked by generating the adjective's feminine.
 */
export function adverbBases(f: string): string[] {
  if (!f.endsWith('ment') || f.length < 7) return [];
  const stem = f.slice(0, -4);
  const out: string[] = [];
  const fromFeminine = (fe: string) => { out.push(...feminineBases(fe), fe); };
  fromFeminine(stem); // lente, rapide, heureuse
  if (f.endsWith('emment')) out.push(stem.slice(0, -2) + 'ent'); // évidemment ← évident
  if (f.endsWith('amment')) out.push(stem.slice(0, -2) + 'ant'); // constamment ← constant
  if (stem.endsWith('é')) fromFeminine(stem.slice(0, -1) + 'e'); // énormément
  if (PLAIN_VOWEL.test(stem)) out.push(stem); // vraiment, poliment, absolument
  if (stem.endsWith('i')) out.push(stem + 'l'); // gentiment ← gentil
  if (stem === 'gaie' || stem === 'gaî') out.push('gai');
  return unique(out);
}

/** All nominal and derived readings of a written form whose base the caller vouches for. */
export function analyzeNominal(form: string, known: Known, genderOf?: (lemma: string, pos: PartOfSpeech) => string | undefined): NominalReading[] {
  const out: NominalReading[] = [];
  const seen = new Set<string>();
  const push = (r: NominalReading) => {
    const k = JSON.stringify([r.lemma, r.pos, r.morph]);
    if (!seen.has(k)) { seen.add(k); out.push(r); }
  };
  const word = (pos: PartOfSpeech) => (pos === 'NOUN' ? 'noun' : 'adjective');
  const describe = (m: Record<string, string>) => `${m.Gender === 'Fem' ? 'feminine ' : m.Gender === 'Masc' ? 'masculine ' : ''}${m.Number === 'Plur' ? 'plural' : 'singular'}`;
  const bases = pluralBases(form);
  for (const lemma of bases) {
    for (const pos of ['NOUN', 'ADJ'] as PartOfSpeech[]) {
      if (!known(lemma, pos)) continue;
      const gender = pos === 'NOUN' ? genderOf?.(lemma, pos) : undefined;
      for (const nf of nominalForms(lemma, pos, gender, true)) {
        if (nf.form !== form) continue;
        push({ lemma, pos, morph: nf.morph, derived: false, rule: lemma === form ? `the ${word(pos)} itself` : `${word(pos)} ${lemma}: ${describe(nf.morph)}` });
      }
    }
  }
  // the adjective's feminine and the plural of a feminine: blanches ← blanc
  for (const b of bases) {
    for (const lemma of feminineBases(b)) {
      if (!known(lemma, 'ADJ')) continue;
      for (const nf of nominalForms(lemma, 'ADJ', undefined, true)) {
        if (nf.form !== form) continue;
        push({ lemma, pos: 'ADJ', morph: nf.morph, derived: false, rule: `adjective ${lemma}: ${describe(nf.morph)}` });
      }
    }
  }
  // the feminine counterpart of a masculine noun (chanteuse, lionne, étudiante): a weaker reading, offered only when nothing
  // else explains the form (a word the list holds as a headword, or the plural of a known word, is not read as a counterpart)
  // (a word that is both noun and adjective in the list, japonais / japonaise, has its feminine as a noun as well)
  {
    const nounBases = unique(bases.flatMap(feminineBases));
    for (const lemma of nounBases) {
      if (!known(lemma, 'NOUN')) continue;
      const alsoAdjective = known(lemma, 'ADJ');
      if (out.length && !alsoAdjective) continue;
      const g = genderOf?.(lemma, 'NOUN');
      if (g === 'Fem') continue;
      for (const nf of nounFeminineForms(lemma, true)) {
        if (nf.form !== form) continue;
        push({ lemma, pos: 'NOUN', morph: nf.morph, derived: !alsoAdjective, ...(alsoAdjective ? {} : { counterpart: true }), rule: `noun ${lemma}: the feminine counterpart, ${describe(nf.morph)}` });
      }
    }
  }
  // the masculine before a vowel (bel, nouvel, vieil, fol, mol) is a form of the adjective's lemma
  for (const [m, v] of Object.entries(VOWEL_FORM)) {
    if (form === v && known(m, 'ADJ')) push({ lemma: m, pos: 'ADJ', morph: { Gender: 'Masc', Number: 'Sing' }, derived: false, rule: `adjective ${m}: masculine singular before a vowel` });
  }
  // adverbs in -ment
  for (const lemma of adverbBases(form)) {
    if (!known(lemma, 'ADJ')) continue;
    // the adverb is the adjective's feminine + -ment, or the masculine when it ends in a vowel: check by generation
    const stem = form.slice(0, -4);
    const feminine = feminineOf(lemma);
    const okay = feminine.some((fe) => fe === stem || fe.slice(0, -1) + 'é' === stem) || (PLAIN_VOWEL.test(lemma) && lemma === stem)
      || (lemma.endsWith('ent') && stem === lemma.slice(0, -3) + 'em') || (lemma.endsWith('ant') && stem === lemma.slice(0, -3) + 'am')
      || (lemma.endsWith('il') && stem === lemma.slice(0, -1)) || lemma === 'gai';
    if (okay) push({ lemma, pos: 'ADV', morph: {}, derived: true, rule: `adverb in -ment from the adjective ${lemma}` });
  }
  return out;
}

// ---------------------------------------------------------------------------------------------------------------
// guesses from the ending

export interface NominalGuess { lemma: string; pos: PartOfSpeech; morph: Record<string, string>; rule: string; /** Lower is likelier. */ rank: number }

const FEM_ENDINGS = /(tion|sion|xion|té|ence|ance|ure|ie|ette|esse|ée|ude|ise|ine|ade|ière|eur)$/;
const FEM_NOUN_SUFFIX: Array<[RegExp, string]> = [
  [/(tion|sion|xion)$/, 'Fem'], [/(té|tié)$/, 'Fem'], [/(ence|ance)$/, 'Fem'], [/ure$/, 'Fem'], [/(ette|esse|ée|ude|ade|ière)$/, 'Fem'], [/ie$/, 'Fem'],
  [/(ment|age|isme|eau|ier|oir|ateur)$/, 'Masc'],
];
void FEM_ENDINGS;

/**
 * Guesses for a form no list vouches for, read from its ending. They name a lemma the rules only infer, never a confirmed one.
 *   - a final -s, -x, -z is offered BOTH as the word itself and as a plural (the ending does not say which), noun and adjective;
 *   - -aux ← -al, -eaux ← -eau; -euses, -ives, -trices … feminine plurals of an adjective;
 *   - -tion, -té, -ence, -ure, -ie, -ette … a feminine noun; -ment, -age, -isme, -eau a masculine noun; -ement and -ément also an adverb.
 * `noVerb`: no verb reading was found at all.
 */
export function guessNominal(f: string, noVerb = false): NominalGuess[] {
  if (f.length < 4 || !/^[a-zàâäçéèêëîïôöùûüœæ]+$/.test(f)) return [];
  const out: NominalGuess[] = [];
  const add = (lemma: string, pos: PartOfSpeech, morph: Record<string, string>, rank: number, rule: string) => {
    if (lemma.length >= 2) out.push({ lemma, pos, morph, rank, rule });
  };
  const plural = /[sx]$/.test(f);
  // endings that mark a noun
  const nounGender = FEM_NOUN_SUFFIX.find(([re]) => re.test(f) || re.test(f.replace(/s$/, '')))?.[1];
  const singularForm = f.replace(/s$/, '');
  if (nounGender) {
    const g = nounGender;
    const sg = FEM_NOUN_SUFFIX.some(([re]) => re.test(f)) ? f : singularForm;
    const isPlural = sg !== f;
    add(sg, 'NOUN', { Gender: g, Number: isPlural ? 'Plur' : 'Sing' }, 0.8, `${g === 'Fem' ? 'feminine' : 'masculine'} noun by its ending${isPlural ? '; plural -s' : ''}: the lemma is inferred`);
  }
  if (/(aux)$/.test(f)) {
    add(f.slice(0, -3) + 'al', 'NOUN', { Number: 'Plur' }, 0.9, 'plural of a noun in -al (-aux): inferred');
    add(f.slice(0, -3) + 'al', 'ADJ', { Number: 'Plur', Gender: 'Masc' }, 0.95, 'masculine plural of an adjective in -al (-aux): inferred');
  } else if (/eaux$/.test(f)) {
    add(f.slice(0, -1), 'NOUN', { Number: 'Plur' }, 0.9, 'plural of a noun in -eau (-eaux): inferred');
  } else if (/(euses)$/.test(f)) {
    add(f.slice(0, -4) + 'eux', 'ADJ', { Gender: 'Fem', Number: 'Plur' }, 1.0, 'feminine plural of an adjective in -eux (-euses): inferred');
  } else if (/euse$/.test(f)) {
    add(f.slice(0, -4) + 'eux', 'ADJ', { Gender: 'Fem', Number: 'Sing' }, 1.0, 'feminine of an adjective in -eux (-euse): inferred');
  } else if (/ives?$/.test(f)) {
    const base = f.replace(/ves?$/, 'f');
    add(base, 'ADJ', { Gender: 'Fem', Number: f.endsWith('s') ? 'Plur' : 'Sing' }, 1.0, 'feminine of an adjective in -if (-ive): inferred');
  }
  if (plural) {
    // the ending does not say whether -s or -x is a plural: the word itself first when it looks like a singular in -is, -us, -os, -ès, -ais, -ois
    const looksSingular = /(is|us|os|ès|ais|ois|ens|ans|ers|ars|ors)$/.test(f) && !/(ions|ures|ences|ances|tés)$/.test(f);
    if (!/(aux|eaux|euses)$/.test(f) && f.endsWith('s')) {
      add(f, 'NOUN', { Number: 'Sing' }, looksSingular ? 0.9 : 1.2, 'the noun itself, ending in -s (an -s is no proof of a plural)');
      add(singularForm, 'NOUN', { Number: 'Plur' }, looksSingular ? 1.2 : 0.95, `plural of a noun ${singularForm} (-s): inferred, the singular is not known`);
      add(singularForm, 'ADJ', { Number: 'Plur' }, 1.3, `plural of an adjective ${singularForm} (-s): inferred, the singular is not known`);
    } else if (f.endsWith('x') && !/(aux|eaux)$/.test(f)) {
      add(f, 'NOUN', { Number: 'Sing' }, 1.1, 'the noun itself, ending in -x (an -x is no proof of a plural)');
    }
  }
  // plurals the ending alone does not give, each checked by generation: cieux ← ciel, gentilshommes ← gentilhomme, lieux ← lieu
  for (const b of pluralBases(f)) {
    if (b === f || b.length < 3 || b === singularForm || !pluralsOf(b).includes(f)) continue;
    add(b, 'NOUN', { Number: 'Plur' }, 0.95, `plural of a noun ${b}: inferred, the singular is not known`);
    add(b, 'ADJ', { Gender: 'Masc', Number: 'Plur' }, 1.3, `masculine plural of an adjective ${b}: inferred, the singular is not known`);
  }
  // a feminine, checked by generation: japonaise ← japonais, brute ← brut, lente ← lent
  if (f.length >= 5 && /e$|es$/.test(f)) {
    const fs = f.endsWith('s') ? f.slice(0, -1) : f;
    const number = fs === f ? 'Sing' : 'Plur';
    for (const m of feminineBases(fs)) {
      if (m === fs || m.length < 3 || /[aeiouyéèêàâîôû]$/.test(m) || !feminineOf(m).includes(fs)) continue;
      add(m, 'ADJ', { Gender: 'Fem', Number: number }, 1.4, `feminine of an adjective ${m}: inferred, the masculine is not known`);
      add(m, 'NOUN', { Gender: 'Fem', Number: number }, 1.45, `feminine counterpart of a noun ${m}: inferred, the masculine is not known`);
    }
  }
  // adverbs in -ment: the ending is also a noun's (vêtement); -emment and -amment are adverbs only
  if (/(emment|amment)$/.test(f)) add(f, 'ADV', {}, 0.7, 'adverb in -emment / -amment: the lemma is the word itself, inferred');
  else if (/ément$/.test(f) && f.length > 8) add(f, 'ADV', {}, 0.9, 'adverb in -ément: inferred');
  else if (/ement$/.test(f) && f.length > 8 && noVerb) add(f, 'ADV', {}, 1.1, 'adverb in -ement: inferred');
  return out;
}
