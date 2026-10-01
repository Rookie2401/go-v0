/**
 * Spanish verb generator, part 3: the irregular verbs. Each entry builds the paradigm of its BASE verb; verbs.ts adds
 * the prefixed relatives (mantener, componer, deshacer, prever …) from the list of prefixes named here. Only forms
 * that are certain are written; a verb not listed here is conjugated by the regular and stem-change rules.
 */
import type { Cls, Paradigm } from './verb-regular';
import { stemChangeParadigm } from './verb-stem';

/** A paradigm with every stem set to `stem`; `o` overrides any field. */
export function irr(lemma: string, cls: Cls, stem: string, o: Partial<Paradigm> = {}): Paradigm {
  return { lemma, cls, stem, presStrong: stem, pres1: stem, presWeak: stem, subStrong: stem, subWeak: stem, stemPret3: stem, kind: 'irregular', ...o };
}

/** Strong preterite: stem + e, -iste, -o, -imos, -isteis, -ieron (-eron after j). */
export const strongPret = (stem: string): string[] => [
  stem + 'e', stem + 'iste', stem + 'o', stem + 'imos', stem + 'isteis', stem + (stem.endsWith('j') ? 'eron' : 'ieron'),
];

/** Overrides for a person-indexed tense. */
const six = (tense: string, forms: string[]): Record<string, string[]> =>
  Object.fromEntries(['1s', '2s', '3s', '1p', '2p', '3p'].map((pr, i) => [`${tense}.${pr}`, [forms[i]]]));

export interface IrregularEntry { build: () => Paradigm; prefixes?: string[] }

/** The paradigm of a stem-changing verb with some forms replaced. */
function stemPlus(lemma: string, kind: 'e>ie' | 'o>ue', o: Partial<Paradigm>): Paradigm {
  return { ...stemChangeParadigm(lemma, { kind, shift: false })!, kind: 'irregular', ...o };
}

export const IRREGULAR: Record<string, IrregularEntry> = {
  ser: {
    build: () => irr('ser', 'er', 's', {
      over: {
        ...six('pres', ['soy', 'eres', 'es', 'somos', 'sois', 'son']),
        'pres.vos': ['sos'],
        ...six('impf', ['era', 'eras', 'era', 'éramos', 'erais', 'eran']),
        ...six('pret', ['fui', 'fuiste', 'fue', 'fuimos', 'fuisteis', 'fueron']),
        ...six('subp', ['sea', 'seas', 'sea', 'seamos', 'seáis', 'sean']),
        'imp.2s': ['sé'], ger: ['siendo'], part: ['sido'],
      },
    }),
  },
  estar: {
    build: () => irr('estar', 'ar', 'est', {
      over: {
        ...six('pres', ['estoy', 'estás', 'está', 'estamos', 'estáis', 'están']),
        ...six('pret', strongPret('estuv')),
        ...six('subp', ['esté', 'estés', 'esté', 'estemos', 'estéis', 'estén']),
        'imp.2s': ['está'],
      },
    }),
  },
  haber: {
    build: () => irr('haber', 'er', 'hab', {
      fut: 'habr',
      over: {
        ...six('pres', ['he', 'has', 'ha', 'hemos', 'habéis', 'han']),
        'pres.3s': ['ha', 'hay'],
        ...six('pret', strongPret('hub')),
        ...six('subp', ['haya', 'hayas', 'haya', 'hayamos', 'hayáis', 'hayan']),
      },
      skip: ['imp.', 'pres.vos'],
    }),
  },
  ir: {
    build: () => irr('ir', 'ir', '', {
      over: {
        ...six('pres', ['voy', 'vas', 'va', 'vamos', 'vais', 'van']),
        ...six('impf', ['iba', 'ibas', 'iba', 'íbamos', 'ibais', 'iban']),
        ...six('pret', ['fui', 'fuiste', 'fue', 'fuimos', 'fuisteis', 'fueron']),
        ...six('subp', ['vaya', 'vayas', 'vaya', 'vayamos', 'vayáis', 'vayan']),
        'imp.2s': ['ve'], 'imp.1p': ['vamos', 'vayamos'], 'imp.2p': ['id'],
        ger: ['yendo'], part: ['ido'],
      },
    }),
  },
  dar: {
    build: () => irr('dar', 'ar', 'd', {
      over: {
        ...six('pres', ['doy', 'das', 'da', 'damos', 'dais', 'dan']),
        ...six('pret', ['di', 'diste', 'dio', 'dimos', 'disteis', 'dieron']),
        ...six('subp', ['dé', 'des', 'dé', 'demos', 'deis', 'den']),
        'imp.2s': ['da'],
      },
    }),
  },
  ver: {
    prefixes: ['pre', 'entre', 're'],
    build: () => irr('ver', 'er', 'v', {
      over: {
        ...six('pres', ['veo', 'ves', 've', 'vemos', 'veis', 'ven']),
        ...six('impf', ['veía', 'veías', 'veía', 'veíamos', 'veíais', 'veían']),
        ...six('pret', ['vi', 'viste', 'vio', 'vimos', 'visteis', 'vieron']),
        ...six('subp', ['vea', 'veas', 'vea', 'veamos', 'veáis', 'vean']),
        'imp.2s': ['ve'], part: ['visto'],
      },
    }),
  },
};

// Yo-form verbs with a changed stem and a strong preterite, future and conditional.
Object.assign(IRREGULAR, {
  tener: {
    prefixes: ['a', 'abs', 'con', 'de', 'entre', 'man', 'ob', 're', 'sos'],
    build: () => irr('tener', 'er', 'ten', {
      presStrong: 'tien', pres1: 'teng', subStrong: 'teng', subWeak: 'teng', fut: 'tendr',
      over: { ...six('pret', strongPret('tuv')), 'imp.2s': ['ten'] },
    }),
  },
  venir: {
    prefixes: ['a', 'con', 'contra', 'de', 'inter', 'pre', 'pro', 're', 'sobre', 'sub'],
    build: () => irr('venir', 'ir', 'ven', {
      presStrong: 'vien', pres1: 'veng', subStrong: 'veng', subWeak: 'veng', stemPret3: 'vin', fut: 'vendr',
      over: { ...six('pret', strongPret('vin')), 'imp.2s': ['ven'] },
    }),
  },
  poner: {
    prefixes: ['ante', 'com', 'contra', 'de', 'dis', 'ex', 'im', 'inter', 'o', 'pos', 'pre', 'pro', 're', 'sobre', 'su', 'super', 'trans', 'yuxta'],
    build: () => irr('poner', 'er', 'pon', {
      pres1: 'pong', subStrong: 'pong', subWeak: 'pong', fut: 'pondr',
      over: { ...six('pret', strongPret('pus')), 'imp.2s': ['pon'], part: ['puesto'] },
    }),
  },
  salir: {
    prefixes: ['sobre'],
    build: () => irr('salir', 'ir', 'sal', { pres1: 'salg', subStrong: 'salg', subWeak: 'salg', fut: 'saldr', over: { 'imp.2s': ['sal'] } }),
  },
  hacer: {
    prefixes: ['contra', 'des', 're'],
    build: () => irr('hacer', 'er', 'hac', {
      pres1: 'hag', subStrong: 'hag', subWeak: 'hag', fut: 'har',
      over: { ...six('pret', ['hice', 'hiciste', 'hizo', 'hicimos', 'hicisteis', 'hicieron']), 'imp.2s': ['haz'], part: ['hecho'] },
    }),
  },
  decir: {
    prefixes: ['contra', 'des', 'entre', 'inter', 'pre', 'ben', 'mal'],
    build: () => irr('decir', 'ir', 'dec', {
      presStrong: 'dic', pres1: 'dig', subStrong: 'dig', subWeak: 'dig', stemPret3: 'dic', fut: 'dir',
      over: { ...six('pret', strongPret('dij')), 'imp.2s': ['di'], part: ['dicho'] },
    }),
  },
  poder: {
    build: () => irr('poder', 'er', 'pod', {
      presStrong: 'pued', pres1: 'pued', subStrong: 'pued', stemPret3: 'pud', fut: 'podr',
      over: six('pret', strongPret('pud')), skip: ['imp.'],
    }),
  },
  querer: {
    build: () => stemPlus('querer', 'e>ie', { fut: 'querr', over: six('pret', strongPret('quis')) }),
  },
  saber: {
    build: () => irr('saber', 'er', 'sab', {
      subStrong: 'sep', subWeak: 'sep', fut: 'sabr',
      over: { ...six('pret', strongPret('sup')), 'pres.1s': ['sé'] },
    }),
  },
  caber: {
    build: () => irr('caber', 'er', 'cab', {
      pres1: 'quep', subStrong: 'quep', subWeak: 'quep', fut: 'cabr', over: six('pret', strongPret('cup')), skip: ['imp.'],
    }),
  },
  valer: {
    prefixes: ['equi', 'pre'],
    build: () => irr('valer', 'er', 'val', {
      pres1: 'valg', subStrong: 'valg', subWeak: 'valg', fut: 'valdr', over: { 'imp.2s': ['vale', 'val'] },
    }),
  },
  andar: {
    prefixes: ['des'],
    build: () => irr('andar', 'ar', 'and', { over: six('pret', strongPret('anduv')) }),
  },
  asir: {
    build: () => irr('asir', 'ir', 'as', { pres1: 'asg', subStrong: 'asg', subWeak: 'asg' }),
  },
  traer: {
    prefixes: ['a', 'abs', 'con', 'de', 'dis', 'ex', 'mal', 'pro', 're', 'sub', 'sus'],
    build: () => irr('traer', 'er', 'tra', { pres1: 'traig', subStrong: 'traig', subWeak: 'traig', over: six('pret', strongPret('traj')) }),
  },
  caer: {
    prefixes: ['de', 're'],
    build: () => irr('caer', 'er', 'ca', { pres1: 'caig', subStrong: 'caig', subWeak: 'caig' }),
  },
  oír: {
    prefixes: ['des', 'entre'],
    build: () => irr('oír', 'ir', 'o', { presStrong: 'oy', pres1: 'oig', subStrong: 'oig', subWeak: 'oig' }),
  },
  reír: {
    prefixes: ['son'],
    build: () => irr('reír', 'ir', 're', {
      presStrong: 'rí', pres1: 'rí', subStrong: 'rí', subWeak: 'ri',
      over: { ...six('pret', ['reí', 'reíste', 'rio', 'reímos', 'reísteis', 'rieron']), ger: ['riendo'], part: ['reído'] },
    }),
  },
  freír: {
    prefixes: ['so', 're'],
    build: () => irr('freír', 'ir', 'fre', {
      presStrong: 'frí', pres1: 'frí', subStrong: 'frí', subWeak: 'fri',
      over: { ...six('pret', ['freí', 'freíste', 'frio', 'freímos', 'freísteis', 'frieron']), ger: ['friendo'], part: ['frito', 'freído'] },
    }),
  },
} satisfies Record<string, IrregularEntry>);

// Irregular participles of verbs that are otherwise regular or stem-changing (vuelto, escrito, abierto, roto …).
// The regular participle is NOT generated for these. Prefixed relatives share the base's participle.
const PART_FAMILIES: Array<{ base: string; part: string[]; prefixes: string[] }> = [
  { base: 'volver', part: ['vuelto'], prefixes: ['', 'de', 'en', 're', 'desen'] },
  { base: 'solver', part: ['suelto'], prefixes: ['re', 'ab', 'di'] },
  { base: 'scribir', part: ['scrito'], prefixes: ['e', 'de', 'in', 'su', 'sub', 'pre', 'pro', 'trans', 'ad', 'circun', 'ree', 'sobre'] },
  { base: 'abrir', part: ['abierto'], prefixes: ['', 're', 'entre'] },
  { base: 'cubrir', part: ['cubierto'], prefixes: ['', 'des', 'en', 're', 'redes'] },
  { base: 'romper', part: ['roto'], prefixes: [''] },
  { base: 'morir', part: ['muerto'], prefixes: [''] },
  { base: 'imprimir', part: ['imprimido', 'impreso'], prefixes: ['', 're'] },
  { base: 'proveer', part: ['proveído', 'provisto'], prefixes: [''] },
];

/** lemma → masculine singular participle(s). */
export const IRREGULAR_PARTICIPLES: Map<string, string[]> = new Map();
const participleForms = new Map<string, string[]>();
for (const { base, part, prefixes } of PART_FAMILIES) {
  for (const pre of prefixes) {
    const lemma = pre + base;
    const fixed = part.map((x) => pre + x);
    IRREGULAR_PARTICIPLES.set(lemma, fixed);
    for (const m of fixed) for (const f of [m, m.slice(0, -1) + 'a', m.slice(0, -1) + 'os', m.slice(0, -1) + 'as']) {
      const l = participleForms.get(f) ?? [];
      if (!l.includes(lemma)) l.push(lemma);
      participleForms.set(f, l);
    }
  }
}

/** The lemmas whose irregular participle is written `form` (vuelto → volver, devuelto → devolver). */
export const irregularParticipleLemmas = (form: string): string[] => participleForms.get(form) ?? [];

