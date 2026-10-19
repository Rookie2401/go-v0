/**
 * Full paradigms of the Latin demonstrative, relative, interrogative and indefinite pronouns. The Romance app's closed tables hold
 * only some of their forms (no dative / ablative plural of ipse, no idem beyond the nominative); these tables replace them for the
 * lemmas listed, so every case, number and gender is a cell. Plain spelling, no macrons.
 */
import type { Cell } from './types';

const CASES = ['Nom', 'Gen', 'Dat', 'Acc', 'Abl'] as const;
const GENDERS = ['Masc', 'Fem', 'Neut'] as const;

/** Forms in the order Masc Sing, Fem Sing, Neut Sing, Masc Plur, Fem Plur, Neut Plur, each Nom Gen Dat Acc Abl; `a|b` gives variants. */
type Table = string[][];

const ILLE = (s: string, neut: string): Table => [
  [`${s}e`, `${s}ius`, `${s}i`, `${s}um`, `${s}o`], [`${s}a`, `${s}ius`, `${s}i`, `${s}am`, `${s}a`], [neut, `${s}ius`, `${s}i`, neut, `${s}o`],
  [`${s}i`, `${s}orum`, `${s}is`, `${s}os`, `${s}is`], [`${s}ae`, `${s}arum`, `${s}is`, `${s}as`, `${s}is`], [`${s}a`, `${s}orum`, `${s}is`, `${s}a`, `${s}is`],
];

const QUI: Table = [
  ['qui', 'cuius', 'cui', 'quem', 'quo'], ['quae', 'cuius', 'cui', 'quam', 'qua'], ['quod', 'cuius', 'cui', 'quod', 'quo'],
  ['qui', 'quorum', 'quibus|quis', 'quos', 'quibus|quis'], ['quae', 'quarum', 'quibus|quis', 'quas', 'quibus|quis'], ['quae', 'quorum', 'quibus|quis', 'quae', 'quibus|quis'],
];

const IPSE_ROWS: Table = [
  ['ipse|ipsus', 'ipsius', 'ipsi', 'ipsum', 'ipso'], ['ipsa', 'ipsius', 'ipsi', 'ipsam', 'ipsa'], ['ipsum', 'ipsius', 'ipsi', 'ipsum', 'ipso'],
  ['ipsi', 'ipsorum', 'ipsis', 'ipsos', 'ipsis'], ['ipsae', 'ipsarum', 'ipsis', 'ipsas', 'ipsis'], ['ipsa', 'ipsorum', 'ipsis', 'ipsa', 'ipsis'],
];

export const PRONOUN_TABLES: Record<string, { table: Table; pronType: string }> = {
  is: { pronType: 'Dem', table: [
    ['is', 'eius', 'ei', 'eum', 'eo'], ['ea', 'eius', 'ei', 'eam', 'ea'], ['id', 'eius', 'ei', 'id', 'eo'],
    ['ii|ei|i', 'eorum', 'iis|eis|is', 'eos', 'iis|eis|is'], ['eae', 'earum', 'iis|eis|is', 'eas', 'iis|eis|is'], ['ea', 'eorum', 'iis|eis|is', 'ea', 'iis|eis|is'],
  ] },
  hic: { pronType: 'Dem', table: [
    ['hic', 'huius', 'huic', 'hunc', 'hoc'], ['haec', 'huius', 'huic', 'hanc', 'hac'], ['hoc', 'huius', 'huic', 'hoc', 'hoc'],
    ['hi|hii', 'horum', 'his', 'hos', 'his'], ['hae', 'harum', 'his', 'has', 'his'], ['haec', 'horum', 'his', 'haec', 'his'],
  ] },
  ille: { pronType: 'Dem', table: ILLE('ill', 'illud') },
  iste: { pronType: 'Dem', table: ILLE('ist', 'istud') },
  ipse: { pronType: 'Emp', table: [
    ['ipse|ipsus', 'ipsius', 'ipsi', 'ipsum', 'ipso'], ['ipsa', 'ipsius', 'ipsi', 'ipsam', 'ipsa'], ['ipsum', 'ipsius', 'ipsi', 'ipsum', 'ipso'],
    ['ipsi', 'ipsorum', 'ipsis', 'ipsos', 'ipsis'], ['ipsae', 'ipsarum', 'ipsis', 'ipsas', 'ipsis'], ['ipsa', 'ipsorum', 'ipsis', 'ipsa', 'ipsis'],
  ] },
  idem: { pronType: 'Dem', table: [
    ['idem', 'eiusdem', 'eidem', 'eundem', 'eodem'], ['eadem', 'eiusdem', 'eidem', 'eandem', 'eadem'], ['idem', 'eiusdem', 'eidem', 'idem', 'eodem'],
    ['iidem|eidem|idem', 'eorundem', 'iisdem|eisdem|isdem', 'eosdem', 'iisdem|eisdem|isdem'], ['eaedem', 'earundem', 'iisdem|eisdem|isdem', 'easdem', 'iisdem|eisdem|isdem'], ['eadem', 'eorundem', 'iisdem|eisdem|isdem', 'eadem', 'iisdem|eisdem|isdem'],
  ] },
  semetipse: { pronType: 'Emp', table: IPSE_ROWS.map((row) => row.map((f) => f.split('|').map((x) => x.replace(/^ips/, 'semetips')).join('|'))) },
  ambo: { pronType: 'Ind', table: [[], [], [], ['ambo|ambae', 'amborum', 'ambobus|ambis', 'ambos|ambo', 'ambobus|ambis'], ['ambae', 'ambarum', 'ambabus', 'ambas', 'ambabus'], ['ambo', 'amborum', 'ambobus|ambis', 'ambo', 'ambobus|ambis']] },
  qui: { pronType: 'Rel', table: QUI },
  unusquisque: { pronType: 'Ind', table: [
    ['unusquisque', 'uniuscuiusque', 'unicuique', 'unumquemque', 'unoquoque'], ['unaquaeque', 'uniuscuiusque', 'unicuique', 'unamquamque', 'unaquaque'], ['unumquodque|unumquidque', 'uniuscuiusque', 'unicuique', 'unumquodque|unumquidque', 'unoquoque'],
  ] },
  uterque: { pronType: 'Ind', table: [
    ['uterque', 'utriusque', 'utrique', 'utrumque', 'utroque'], ['utraque', 'utriusque', 'utrique', 'utramque', 'utraque'], ['utrumque', 'utriusque', 'utrique', 'utrumque', 'utroque'],
    ['utrique', 'utrorumque', 'utrisque', 'utrosque', 'utrisque'], ['utraeque', 'utrarumque', 'utrisque', 'utrasque', 'utrisque'], ['utraque', 'utrorumque', 'utrisque', 'utraque', 'utrisque'],
  ] },
  quis: { pronType: 'Int', table: QUI.map((row, i) => (i === 0 ? ['quis|qui', ...row.slice(1)] : i === 2 ? ['quid|quod', row[1], row[2], 'quid|quod', row[4]] : row)) },
};

/** Pronouns built by putting a prefix or suffix on the forms of qui: [lemma, prefix, suffix, pronType, neuter nominative / accusative]. */
export const PRONOUN_BUILT: Array<{ lemma: string; base: string; prefix?: string; suffix?: string; pronType: string; nasal?: boolean; neut?: string; gloss: string; count: number }> = [
  { lemma: 'aliquis', base: 'qui', prefix: 'ali', pronType: 'Ind', neut: 'aliquid|aliquod', gloss: 'someone, something, some', count: 300 },
  { lemma: 'quidam', base: 'qui', suffix: 'dam', pronType: 'Ind', nasal: true, neut: 'quiddam|quoddam', gloss: 'a certain one, a certain', count: 200 },
  { lemma: 'quisque', base: 'qui', suffix: 'que', pronType: 'Ind', neut: 'quidque|quodque', gloss: 'each, every one', count: 150 },
  { lemma: 'quisquam', base: 'qui', suffix: 'quam', pronType: 'Ind', neut: 'quicquam|quidquam', gloss: 'anyone at all', count: 50 },
  { lemma: 'quicumque', base: 'qui', suffix: 'cumque', pronType: 'Rel', gloss: 'whoever, whatever', count: 200 },
  { lemma: 'quicunque', base: 'qui', suffix: 'cunque', pronType: 'Rel', gloss: 'whoever, whatever', count: 40 },
  { lemma: 'quisquis', base: 'qui', suffix: 'REDUP', pronType: 'Rel', neut: 'quidquid|quicquid', gloss: 'whoever, whatever', count: 60 },
  { lemma: 'quispiam', base: 'qui', suffix: 'piam', pronType: 'Ind', neut: 'quidpiam|quippiam|quodpiam', gloss: 'someone, anyone', count: 20 },
  { lemma: 'quilibet', base: 'qui', suffix: 'libet', pronType: 'Ind', neut: 'quidlibet|quodlibet', gloss: 'anyone you like', count: 20 },
  { lemma: 'quivis', base: 'qui', suffix: 'vis', pronType: 'Ind', neut: 'quidvis|quodvis', gloss: 'anyone you wish', count: 20 },
  { lemma: 'ecquis', base: 'qui', prefix: 'ec', pronType: 'Int', neut: 'ecquid|ecquod', gloss: 'is there anyone who', count: 10 },
];

export function pronounCells(lemma: string): Cell[] | undefined {
  const t = PRONOUN_TABLES[lemma];
  if (!t) return undefined;
  const out: Cell[] = [];
  t.table.forEach((row, i) => {
    const gender = GENDERS[i % 3];
    const number = i < 3 ? 'Sing' : 'Plur';
    row.forEach((forms, c) => {
      forms.split('|').forEach((form, k) => out.push({ form, features: { Case: CASES[c], Number: number, Gender: gender, PronType: t.pronType }, ...(k > 0 ? { note: 'variant' } : {}) }));
    });
  });
  if (lemma === 'hic') {
    // the demonstrative with the particle -ce: huiusce, hosce, hisce, hocce
    for (const c of [...out]) if (/[sc]$/.test(c.form) && c.note !== 'variant') out.push({ form: c.form + 'ce', features: c.features, note: 'variant' });
  }
  return out;
}

/** The forms of qui with an element added, for the indefinite pronouns. */
export function builtPronounCells(spec: (typeof PRONOUN_BUILT)[number]): Cell[] {
  const base = pronounCells(spec.base) ?? [];
  const out: Cell[] = [];
  for (const cell of base) {
    if (cell.note === 'variant' && spec.prefix) continue;
    let forms = [cell.form];
    let whole = false;
    const sgNomAcc = cell.features.Number === 'Sing' && (cell.features.Case === 'Nom' || cell.features.Case === 'Acc');
    if (cell.features.Gender === 'Neut' && sgNomAcc && spec.neut) { forms = spec.neut.split('|'); whole = true; }
    else if (spec.prefix && cell.features.Case === 'Nom' && cell.features.Number === 'Sing' && cell.features.Gender === 'Masc') forms = ['quis', 'qui'];
    else if (spec.prefix && ((cell.features.Case === 'Nom' && cell.features.Number === 'Sing' && cell.features.Gender === 'Fem') || (cell.features.Gender === 'Neut' && cell.features.Number === 'Plur' && (cell.features.Case === 'Nom' || cell.features.Case === 'Acc')))) forms = ['qua', cell.form];
    for (const f of forms) {
      let form = f;
      if (whole) { /* the neuter forms are given whole */ }
      else if (spec.prefix) form = spec.prefix + f;
      else if (spec.suffix === 'REDUP') form = f + f;
      else if (spec.nasal) form = /rum$/.test(f) ? f.replace(/rum$/, 'rundam') : /m$/.test(f) ? f.slice(0, -1) + 'ndam' : f + 'dam';
      else if (spec.suffix) form = f + spec.suffix;
      out.push({ form, features: { ...cell.features, PronType: spec.pronType }, ...(cell.note ? { note: cell.note } : {}) });
    }
  }
  return out;
}
