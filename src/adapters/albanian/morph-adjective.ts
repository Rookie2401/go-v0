/**
 * Adjective forms: gender and number (the linking article carries the case; the article is a fact of the lexeme,
 * `articulated`, and is never part of a form). Package Q1. Machine-drafted, not yet checked by a native speaker.
 *
 * From the lemma (masculine singular) and `fem`, `plM`, `plF` (absent = the lemma) the four cells masculine singular,
 * feminine singular, masculine plural, feminine plural are made; cells that share a written form become ONE reading with
 * Gender and Number as unions ("mirë": Masc,Fem and Sing,Plur) when the cells make a full grid, and otherwise one reading
 * per number ("bukur": Masc,Fem singular; Masc plural; and "bukura": Fem plural).
 *
 * `forms` on the lexeme ("form: tags") ADD readings or REPLACE the generated reading with the same Gender and Number.
 */
import type { SqForm, SqLexeme } from './types';
import { sqMorph } from './types';

type Cell = { gender: 'Masc' | 'Fem'; number: 'Sing' | 'Plur'; form: string };

const GENDER_WORD = { Masc: 'masculine', Fem: 'feminine' } as const;
const NUMBER_WORD = { Sing: 'singular', Plur: 'plural' } as const;

const keyOf = (m: Record<string, string>): string => `${m.Gender ?? ''}|${m.Number ?? ''}`;

export function adjectiveForms(lex: SqLexeme): SqForm[] {
  const l = lex.lemma;
  const cells: Cell[] = [
    { gender: 'Masc', number: 'Sing', form: l },
    { gender: 'Fem', number: 'Sing', form: lex.fem ?? l },
    { gender: 'Masc', number: 'Plur', form: lex.plM ?? l },
    { gender: 'Fem', number: 'Plur', form: lex.plF ?? l },
  ];
  const byForm = new Map<string, Cell[]>();
  for (const c of cells) {
    const f = c.form.normalize('NFC');
    const list = byForm.get(f);
    if (list) list.push(c);
    else byForm.set(f, [c]);
  }

  const out: SqForm[] = [];
  for (const [form, group] of byForm) {
    const sing = group.filter((c) => c.number === 'Sing').map((c) => c.gender);
    const plur = group.filter((c) => c.number === 'Plur').map((c) => c.gender);
    const sets: Array<{ genders: Array<'Masc' | 'Fem'>; numbers: Array<'Sing' | 'Plur'> }> = [];
    if (sing.length && plur.length && sing.join() === plur.join()) sets.push({ genders: sing, numbers: ['Sing', 'Plur'] });
    else {
      if (sing.length) sets.push({ genders: sing, numbers: ['Sing'] });
      if (plur.length) sets.push({ genders: plur, numbers: ['Plur'] });
    }
    for (const s of sets) {
      const g = s.genders.map((x) => GENDER_WORD[x]).join(' or ');
      const n = s.numbers.map((x) => NUMBER_WORD[x]).join(' or ');
      out.push({
        form,
        morph: { Gender: s.genders.join(','), Number: s.numbers.join(',') },
        rule: `${g} ${n} form of the adjective`,
      });
    }
  }

  for (const row of lex.forms ?? []) {
    const at = row.indexOf(':');
    if (at < 0) continue;
    const form = row.slice(0, at).trim().normalize('NFC');
    const morph = sqMorph(row.slice(at + 1));
    const k = keyOf(morph);
    for (let i = out.length - 1; i >= 0; i--) if (keyOf(out[i].morph) === k) out.splice(i, 1);
    out.push({ form, morph, rule: 'listed in the word list' });
  }
  return out;
}
