/**
 * Readings of the lexicon's nouns and adjectives: one reading per (lemma, gender, number) for a noun and per
 * (lemma, degree) for an adjective, each with ALL the cells its written form fills.
 */
import type { DeAdjective, DeCell, DeNoun, DeReading } from './types';
import { morphOfCells } from './types';
import { adjectiveForms } from './morph-adjective';
import { describeGermanMorph } from './morph-describe';
import { nounForms } from './morph-noun';

export type Entry = [string, DeReading];

const NOUN_OLDER_RULE = 'older dative singular in -e (dem Manne), as in the Luther Bible and older literature';

function nounNote(noun: DeNoun): string {
  if (noun.adjectival) return ' (declined like an adjective)';
  if (noun.weak) return ' (weak, n-declension)';
  if (noun.gender === 'pl') return ' (plural only)';
  return '';
}

/** Index entries (written form, reading) for every form of a noun. */
export function nounEntries(noun: DeNoun): Entry[] {
  const out: Entry[] = [];
  const forms = nounForms(noun);
  for (const f of forms) {
    const groups: DeCell[][] = [f.cells.filter((c) => c.g !== 'p'), f.cells.filter((c) => c.g === 'p')];
    for (const cells of groups) {
      if (!cells.length) continue;
      const morph = morphOfCells(cells);
      let rule: string;
      if (f.older) {
        const same = forms.find((x) => !x.older && x.form === f.form);
        rule = `noun ${noun.lemma}: ${NOUN_OLDER_RULE}${same ? `; the same spelling is also ${describeGermanMorph(morphOfCells(same.cells))}` : ''}`;
      } else {
        rule = `noun ${noun.lemma}${nounNote(noun)}: ${describeGermanMorph(morph)}`;
      }
      const reading: DeReading = {
        lemma: noun.lemma, pos: 'NOUN', morph, cells, confidence: f.older ? 0.8 : 0.9, rule, lemmaKnown: true, gloss: noun.gloss,
      };
      if (f.older) reading.register = ['literary'];
      else if (noun.register) reading.register = [...noun.register];
      if (noun.varieties) reading.varieties = [...noun.varieties];
      out.push([f.form, reading]);
    }
  }
  return out;
}

const DEGREE_NAME = { pos: '', cmp: 'comparative ', sup: 'superlative ' } as const;

/** Index entries (lower-case written form, reading) for every form of an adjective in all three degrees. */
export function adjectiveEntries(adj: DeAdjective): Entry[] {
  const out: Entry[] = [];
  const base = (degree: 'pos' | 'cmp' | 'sup') => {
    const reading: Partial<DeReading> = { lemma: adj.lemma, pos: 'ADJ', lemmaKnown: true, gloss: adj.gloss };
    if (adj.register) reading.register = [...adj.register];
    if (adj.varieties) reading.varieties = [...adj.varieties];
    const dm: Record<string, string> = degree === 'cmp' ? { Degree: 'Cmp' } : degree === 'sup' ? { Degree: 'Sup' } : {};
    return { reading, degree: dm };
  };
  for (const degree of ['pos', 'cmp', 'sup'] as const) {
    const af = adjectiveForms(adj, degree);
    const { reading, degree: dm } = base(degree);
    if (af.uninflected !== undefined) {
      const morph = { ...dm };
      out.push([af.uninflected.toLowerCase(), {
        ...reading, morph, confidence: 0.88,
        rule: `${DEGREE_NAME[degree]}adjective ${adj.lemma}, uninflected: predicative or adverbial`,
      } as DeReading]);
    }
    for (const f of af.forms) {
      const morph = { ...dm, ...morphOfCells(f.cells) };
      const rule = adj.indeclinable
        ? `indeclinable adjective ${adj.lemma}: one form in every case, gender and number, and predicative`
        : `adjective ${adj.lemma}: ${describeGermanMorph(morph)}`;
      out.push([f.form.toLowerCase(), { ...reading, morph, cells: f.cells, confidence: 0.9, rule } as DeReading]);
    }
  }
  return out;
}
