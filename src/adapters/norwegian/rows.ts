/**
 * Row-format helpers shared by the hand-written Norwegian word lists.
 *
 * MACHINE-DRAFTED data (see types.ts). A closed-class row reads
 *
 *   lemma|POS|gloss|form:tags, form:tags, ...
 *
 * Tags are space-separated shorthands (below) or `Key=Value`; `#tag` is a register (`#colloquial`), `^` marks the cell
 * unverified. A form with no tags carries no features. `POS` is a Universal-Dependencies-style code.
 */
import type { PartOfSpeech, RegisterTag } from '../../core';
import type { NoWordForm } from './types';

export const POS_CODE: Record<string, PartOfSpeech> = {
  N: 'NOUN', PN: 'PROPN', V: 'VERB', AUX: 'AUX', ADJ: 'ADJ', ADV: 'ADV', PRON: 'PRON', DET: 'DET', ADP: 'ADP',
  CONJ: 'CONJ', SCONJ: 'SCONJ', PART: 'PART', NUM: 'NUM', INTJ: 'INTJ',
};

const SHORT: Record<string, Record<string, string>> = {
  sg: { Number: 'Sing' }, pl: { Number: 'Plur' },
  m: { Gender: 'Masc' }, f: { Gender: 'Fem' }, n: { Gender: 'Neut' }, mf: { Gender: 'Fem,Masc' },
  def: { Definite: 'Def' }, ind: { Definite: 'Ind' },
  nom: { Case: 'Nom' }, acc: { Case: 'Acc' }, gen: { Case: 'Gen' },
  '1': { Person: '1' }, '2': { Person: '2' }, '3': { Person: '3' },
  pres: { VerbForm: 'Fin', Tense: 'Pres' }, past: { VerbForm: 'Fin', Tense: 'Past' }, inf: { VerbForm: 'Inf' },
  ptcp: { VerbForm: 'Part', Tense: 'Past' }, imp: { VerbForm: 'Fin', Mood: 'Imp' }, pass: { Voice: 'Pass' },
  pos: { Degree: 'Pos' }, cmp: { Degree: 'Cmp' }, supl: { Degree: 'Sup' },
  refl: { Reflex: 'Yes' }, prs: { PronType: 'Prs' }, dem: { PronType: 'Dem' }, rel: { PronType: 'Rel' }, int: { PronType: 'Int' },
  art: { PronType: 'Art' }, indef: { PronType: 'Ind' }, tot: { PronType: 'Tot' }, negp: { PronType: 'Neg' }, poss: { Poss: 'Yes' },
  neg: { Polarity: 'Neg' }, ord: { NumType: 'Ord' }, card: { NumType: 'Card' }, rec: { PronType: 'Rcp' },
};

export function morphOf(tags: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const t of tags.split(/\s+/).filter(Boolean)) {
    const eq = t.indexOf('=');
    const kv: Record<string, string> | undefined = eq > 0 ? { [t.slice(0, eq)]: t.slice(eq + 1) } : SHORT[t];
    if (!kv) throw new Error(`unknown Norwegian morph tag "${t}"`);
    for (const [k, v] of Object.entries(kv)) out[k] = out[k] === undefined ? v : [...new Set([...out[k].split(','), ...v.split(',')])].sort().join(',');
  }
  return out;
}

/** "mf sg #colloquial ^" → morph + register + unverified. */
function parseTags(raw: string): { morph: Record<string, string>; register?: RegisterTag[]; unverified?: boolean; varieties?: string[] } {
  const reg: RegisterTag[] = [];
  const vars: string[] = [];
  let unverified = false;
  const rest: string[] = [];
  for (const t of raw.split(/\s+/).filter(Boolean)) {
    if (t === '^') unverified = true;
    else if (t.startsWith('#')) reg.push(t.slice(1) as RegisterTag);
    else if (t.startsWith('@')) vars.push(t.slice(1));
    else rest.push(t);
  }
  return { morph: morphOf(rest.join(' ')), register: reg.length ? reg : undefined, unverified: unverified || undefined, varieties: vars.length ? vars : undefined };
}

/** Parse closed-class rows into one NoWordForm per written form. A line starting with `//` or empty is skipped. */
export function parseWordRows(src: string, defaults: { rank?: number } = {}): NoWordForm[] {
  const out: NoWordForm[] = [];
  let rank = defaults.rank ?? 0;
  for (const line of src.split('\n')) {
    const s = line.trim();
    if (!s || s.startsWith('//')) continue;
    const [lemma, posCode, gloss, formsRaw = ''] = s.split('|').map((x) => x.trim());
    const pos = POS_CODE[posCode];
    if (!pos) throw new Error(`unknown POS code "${posCode}" in row "${s}"`);
    rank++;
    const forms = formsRaw ? formsRaw.split(',').map((x) => x.trim()).filter(Boolean) : [lemma];
    for (const f of forms) {
      const c = f.indexOf(':');
      const form = c < 0 ? f : f.slice(0, c);
      const tags = c < 0 ? { morph: {} } : parseTags(f.slice(c + 1));
      out.push({
        form, lemma, pos, gloss, morph: tags.morph, register: tags.register, varieties: tags.varieties,
        unverified: tags.unverified, source: 'machine-draft', rank,
      });
    }
  }
  return out;
}
