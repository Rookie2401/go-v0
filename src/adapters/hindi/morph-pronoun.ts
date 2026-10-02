/**
 * Hindi pronouns, possessives and pronoun + postposition words: a closed table (package H2, docs/PLAN12.md).
 * MACHINE-DRAFTED from the author's own knowledge of Hindi; no external source.
 *
 * The table is generated once from a short list of definitions: each pronoun has a direct form, an oblique stem, an
 * ergative base (मैं + ने, but उस + ने and उन्हों + ने), a fused dative (मुझे, उन्हें) and the postpositions that are
 * written onto the stem (को से में पर, and का के की, which make a possessive: उसका). A word written with its
 * postposition is ONE reading with `parts` (the stem, kind 'stem', its lemma the direct form; the postposition, kind
 * 'clitic', pos ADP), and `Case` is what the postposition gives (ने Erg, को Dat, का के की Gen, otherwise Obl).
 * A noun written together with a postposition is not attempted: standard spelling separates them.
 */
import type { PartOfSpeech, WordPart } from '../../core';
import { fold } from './morph-orth';
import { adjForms } from './morph-noun';
import type { Ctx, Raw } from './morph-types';

interface Row {
  /** The form as written (chandrabindu spelling), for paradigm listings. */
  form?: string;
  lemma: string;
  pos: PartOfSpeech;
  morph: Record<string, string>;
  parts?: WordPart[];
  rule: string;
  /** Emitted only when the word list vouches for the lemma with this very part of speech (the determiner use of यह, कोई …). */
  optional?: boolean;
}

interface Group { n?: string; erg?: string; stem?: string; dat?: string; bare?: string; poss?: boolean }
interface Def {
  l: string; t: string; p?: string; n?: string; pol?: string;
  dir: string[]; det?: boolean; groups?: Group[];
  /** Non-analytic possessive: [lemma] agreeing like an adjective (मेरा / मेरे / मेरी). */
  poss?: string;
}

const DEFS: Def[] = [
  { l: 'मैं', t: 'Prs', p: '1', n: 'Sing', dir: ['मैं'], poss: 'मेरा', groups: [{ erg: 'मैं', stem: 'मुझ', dat: 'मुझे', bare: 'मुझ' }] },
  { l: 'हम', t: 'Prs', p: '1', n: 'Plur', dir: ['हम'], poss: 'हमारा', groups: [{ erg: 'हम', stem: 'हम', dat: 'हमें' }] },
  { l: 'तू', t: 'Prs', p: '2', n: 'Sing', pol: 'Infm', dir: ['तू'], poss: 'तेरा', groups: [{ erg: 'तू', stem: 'तुझ', dat: 'तुझे', bare: 'तुझ' }] },
  { l: 'तुम', t: 'Prs', p: '2', pol: 'Fam', dir: ['तुम'], poss: 'तुम्हारा', groups: [{ erg: 'तुम', stem: 'तुम', dat: 'तुम्हें' }] },
  { l: 'आप', t: 'Prs', p: '2', pol: 'Form', dir: ['आप'], groups: [{ erg: 'आप', stem: 'आप', poss: true }] },
  { l: 'यह', t: 'Dem', p: '3', n: 'Sing', dir: ['यह'], det: true, groups: [{ erg: 'इस', stem: 'इस', dat: 'इसे', bare: 'इस', poss: true }] },
  { l: 'वह', t: 'Dem', p: '3', n: 'Sing', dir: ['वह'], det: true, groups: [{ erg: 'उस', stem: 'उस', dat: 'उसे', bare: 'उस', poss: true }] },
  { l: 'ये', t: 'Dem', p: '3', n: 'Plur', dir: ['ये'], det: true, groups: [{ erg: 'इन्हों', stem: 'इन', dat: 'इन्हें', bare: 'इन', poss: true }] },
  { l: 'वे', t: 'Dem', p: '3', n: 'Plur', dir: ['वे'], det: true, groups: [{ erg: 'उन्हों', stem: 'उन', dat: 'उन्हें', bare: 'उन', poss: true }] },
  {
    l: 'कौन', t: 'Int', p: '3', dir: ['कौन'], det: true,
    groups: [{ n: 'Sing', erg: 'किस', stem: 'किस', dat: 'किसे', bare: 'किस', poss: true }, { n: 'Plur', erg: 'किन्हों', stem: 'किन', dat: 'किन्हें', bare: 'किन', poss: true }],
  },
  {
    l: 'जो', t: 'Rel', p: '3', dir: ['जो'], det: true,
    groups: [{ n: 'Sing', erg: 'जिस', stem: 'जिस', dat: 'जिसे', bare: 'जिस', poss: true }, { n: 'Plur', erg: 'जिन्हों', stem: 'जिन', dat: 'जिन्हें', bare: 'जिन', poss: true }],
  },
  { l: 'क्या', t: 'Int', dir: ['क्या'], det: true },
  { l: 'कोई', t: 'Ind', dir: ['कोई'], det: true, groups: [{ erg: 'किसी', stem: 'किसी', bare: 'किसी', poss: true }] },
  { l: 'कुछ', t: 'Ind', dir: ['कुछ'], det: true },
  { l: 'सब', t: 'Ind', dir: ['सब'], det: true, groups: [{ erg: 'सब', stem: 'सब', poss: true }] },
];

/** The closed adjective-like words: they agree in -ा / -े / -ी. */
const AGREEING: Array<{ lemma: string; pos: PartOfSpeech; extra: Record<string, string>; rule: string }> = [
  { lemma: 'का', pos: 'ADP', extra: {}, rule: 'genitive का, agreeing with what is possessed' },
  { lemma: 'वाला', pos: 'ADJ', extra: {}, rule: 'वाला, agreeing like an adjective' },
  { lemma: 'सा', pos: 'ADJ', extra: {}, rule: '-सा (somewhat, like), agreeing like an adjective' },
  { lemma: 'अपना', pos: 'DET', extra: { Poss: 'Yes', Reflex: 'Yes' }, rule: 'reflexive possessive अपना (one\'s own), agreeing like an adjective' },
];

const POSTPOSITIONS: Array<[string, string]> = [['को', 'Dat'], ['से', 'Obl'], ['में', 'Obl'], ['पर', 'Obl']];
const GEN: Array<[string, Array<Record<string, string>>]> = [
  ['का', [{ Gender: 'Masc', Number: 'Sing' }]],
  ['के', [{ Gender: 'Masc', Number: 'Sing' }, { Gender: 'Masc', Number: 'Plur' }]],
  ['की', [{ Gender: 'Fem', Number: 'Sing' }, { Gender: 'Fem', Number: 'Plur' }]],
];

let INDEX: Map<string, Row[]> | undefined;

function put(form: string, row: Row): void {
  const k = fold(form);
  const r = { ...row, form };
  const list = INDEX!.get(k);
  if (list) list.push(r); else INDEX!.set(k, [r]);
}

const person = (d: Def, g?: Group): Record<string, string> => {
  const m: Record<string, string> = { PronType: d.t };
  if (d.p) m.Person = d.p;
  const n = g?.n ?? d.n;
  if (n) m.Number = n;
  if (d.pol) m.Polite = d.pol;
  return m;
};

function stemPart(text: string, d: Def, g: Group): WordPart {
  return { text, start: 0, end: text.length, lemma: d.l, pos: 'PRON', kind: 'stem', morph: { ...person(d, g) }, role: text === d.l ? 'pronoun' : 'oblique stem' };
}
const ppPart = (at: number, pp: string, caseVal: string): WordPart => ({
  text: pp, start: at, end: at + pp.length, lemma: pp === 'के' || pp === 'की' ? 'का' : pp, pos: 'ADP', kind: 'clitic', role: 'postposition', morph: { Case: caseVal },
});

function build(): void {
  INDEX = new Map();
  for (const d of DEFS) {
    const dirMorph = { ...person(d), Case: 'Dir' };
    for (const f of d.dir) {
      put(f, { lemma: d.l, pos: 'PRON', morph: { ...dirMorph }, rule: `pronoun ${d.l}, direct form` });
      if (d.det) put(f, { lemma: d.l, pos: 'DET', morph: { ...dirMorph }, rule: `${d.l} used before a noun, direct form`, optional: true });
    }
    if (d.poss) {
      const extra = { Poss: 'Yes', ...person(d) };
      for (const f of adjForms(d.poss)) {
        put(f.form, { lemma: d.poss, pos: 'DET', morph: { ...extra, ...f.morph }, rule: `possessive of ${d.l} (${d.poss}), agreeing like an adjective: ${[f.morph.Gender, f.morph.Number, f.morph.Case].filter(Boolean).join(' ')}` });
      }
    }
    for (const g of d.groups ?? []) {
      const base = person(d, g);
      if (g.erg) {
        const form = g.erg + 'ने';
        put(form, { lemma: d.l, pos: 'PRON', morph: { ...base, Case: 'Erg' }, parts: [stemPart(g.erg, d, g), ppPart(g.erg.length, 'ने', 'Erg')], rule: `${d.l}: ${g.erg} + ने (ergative)` });
      }
      if (g.dat) put(g.dat, { lemma: d.l, pos: 'PRON', morph: { ...base, Case: 'Dat' }, rule: `${d.l}, fused dative (${g.dat}: to / for ${d.l})` });
      if (g.bare) {
        put(g.bare, { lemma: d.l, pos: 'PRON', morph: { ...base, Case: 'Obl' }, rule: `${d.l}, oblique stem (before a postposition)` });
        if (d.det) put(g.bare, { lemma: d.l, pos: 'DET', morph: { ...base, Case: 'Obl' }, rule: `${d.l} used before a noun, oblique form`, optional: true });
      }
      if (g.stem) {
        for (const [pp, c] of POSTPOSITIONS) {
          put(g.stem + pp, { lemma: d.l, pos: 'PRON', morph: { ...base, Case: c }, parts: [stemPart(g.stem, d, g), ppPart(g.stem.length, pp, c)], rule: `${d.l}: ${g.stem} + ${pp}` });
        }
        if (g.poss) {
          // relative, interrogative and indefinite pronouns: the fused genitive keeps the pronoun's direct form as its lemma (जिसका → जो);
          // the personal and demonstrative ones have a possessive lemma of their own (उसका)
          const direct = d.t === 'Rel' || d.t === 'Int' || d.t === 'Ind';
          const lemma = direct ? d.l : g.stem + 'का';
          const { Number: pn, ...noNumber } = base;
          const pm = direct ? (pn ? { ...noNumber, 'Number[psor]': pn } : noNumber) : { ...base, Poss: 'Yes' };
          for (const [pp, agr] of GEN) {
            for (const a of agr) {
              put(g.stem + pp, {
                lemma, pos: direct ? 'PRON' : 'DET', morph: { ...pm, Case: 'Gen', ...a },
                parts: [stemPart(g.stem, d, g), ppPart(g.stem.length, pp, 'Gen')], rule: `possessive of ${d.l}: ${g.stem} + ${pp}`,
              });
            }
          }
        }
      }
    }
  }
  for (const [form, lemma, caseV] of [['यही', 'यह', 'Dir'], ['वही', 'वह', 'Dir'], ['इसी', 'यह', 'Obl'], ['उसी', 'वह', 'Obl'], ['इन्हीं', 'ये', 'Obl'], ['उन्हीं', 'वे', 'Obl']] as const) {
    const d = DEFS.find((x) => x.l === lemma)!;
    put(form, { lemma, pos: 'PRON', morph: { ...person(d), Case: caseV }, rule: `${lemma} + ही (emphatic: just this / that)` });
  }
  for (const a of AGREEING) {
    for (const f of adjForms(a.lemma)) put(f.form, { lemma: a.lemma, pos: a.pos, morph: { ...a.extra, ...f.morph }, rule: a.rule });
  }
}

/** The closed-class readings of a folded form. */
export function pronounReadings(w: string, ctx: Ctx): Raw[] {
  if (!INDEX) build();
  const rows = INDEX!.get(w);
  if (!rows) return [];
  const out: Raw[] = [];
  for (const r of rows) {
    if (r.optional && !ctx.known(r.lemma, r.pos)) continue;
    out.push({
      lemma: r.lemma, pos: r.pos, morph: { ...r.morph }, ...(r.parts ? { parts: r.parts.map((p) => ({ ...p, ...(p.morph ? { morph: { ...p.morph } } : {}) })) } : {}),
      rule: r.rule, known: ctx.knownAny(r.lemma, r.pos), tier: 'closed', prior: 0.6, paradigm: r.lemma,
    });
  }
  return out;
}

/** Forms of a closed-class lemma (मैं, उसका, मेरा, का …) with their features; empty for any other lemma. */
export function inflectClosed(lemma: string): Array<{ form: string; morph: Record<string, string> }> | undefined {
  if (!INDEX) build();
  const rows: Array<{ form: string; morph: Record<string, string> }> = [];
  for (const [key, list] of INDEX!) {
    for (const r of list) if (r.lemma === lemma && !r.optional) rows.push({ form: r.form ?? key, morph: { ...r.morph } });
  }
  return rows.length ? rows : undefined;
}
