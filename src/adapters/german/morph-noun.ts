/**
 * Noun declension from the facts the lexicon lists (gender, genitive singular, plural, weak or adjectival,
 * irregular cells). The older dative singular in -e is generated too, as a separate entry marked `older`.
 */
import type { DeCase, DeCell, DeGender, DeNoun } from './types';
import { formsOnStem } from './morph-adjective';
import { addCells, sortCells } from './morph-util';

export interface NounForm { form: string; cells: DeCell[]; /** Older dative singular in -e (dem Manne): literary. */ older?: boolean }

/** Genitive singular when the lexicon gives none: -(e)s for masculine and neuter, none for feminine. */
function defaultGenitive(noun: DeNoun): string {
  if (noun.gender === 'f') return noun.lemma;
  return /[sßxz]$/.test(noun.lemma) ? `${noun.lemma}es` : `${noun.lemma}s`;
}

/** Accusative / dative singular of an n-declension noun: Student → Studenten, Name → Namen (from Namens), Herr → Herrn. */
function weakOblique(noun: DeNoun): string {
  const g = noun.genSg;
  if (g && g !== noun.lemma) return /(?:ens|ns)$/.test(g) && !g.endsWith('ss') ? g.slice(0, -1) : g;
  return noun.lemma.endsWith('e') ? `${noun.lemma}n` : `${noun.lemma}en`;
}

/** Dative plural: the plural plus -n, unless it already ends in -n or -s. */
function dativePlural(plural: string): string {
  return /[ns]$/.test(plural) ? plural : `${plural}n`;
}

/** The older dative singular (-e) of a strong masculine or neuter noun whose genitive is -es; otherwise undefined. */
export function olderDative(noun: DeNoun): string | undefined {
  if ((noun.gender !== 'm' && noun.gender !== 'n') || noun.weak || noun.adjectival) return undefined;
  if (noun.irregular?.['D sg'] || !noun.genSg) return undefined;
  if (noun.genSg !== `${noun.lemma}es` || /[aeiouäöüy]$/i.test(noun.lemma)) return undefined;
  return `${noun.lemma}e`;
}

/**
 * The other spelling of the genitive of a strong masculine or neuter noun: a row lists Mannes OR Manns. -s is added
 * to a listed -es unless the stem ends in s, ß, x, z, sch or st; -es to a listed -s on a one-syllable noun.
 */
function otherGenitive(noun: DeNoun): string | undefined {
  const g = noun.genSg;
  if ((noun.gender !== 'm' && noun.gender !== 'n') || noun.weak || noun.irregular?.['G sg'] || !g) return undefined;
  const l = noun.lemma;
  if (g === `${l}es`) return /(?:[sßxz]|sch|st)$/.test(l) ? undefined : `${l}s`;
  if (g === `${l}s` && (l.match(/[aeiouyäöü]+/gi) ?? []).length === 1) return `${l}es`;
  return undefined;
}

/** Adjectival nouns (der Deutsche, die Deutsche, ein Deutscher, die Deutschen): every gender and the plural; the row's gender is ignored. */
function adjectivalForms(noun: DeNoun): NounForm[] {
  const stem = noun.lemma.endsWith('e') ? noun.lemma.slice(0, -1) : noun.lemma;
  const out = new Map<string, DeCell[]>();
  for (const { form, cells } of formsOnStem(stem)) {
    const wanted = noun.gender === 'pl' ? cells.filter((c) => c.g === 'p') : cells;
    if (wanted.length) addCells(out, form, wanted);
  }
  return [...out].map(([form, cells]) => ({ form, cells: sortCells(cells) }));
}

/** Every form of a noun with its cells; an older entry (dem Manne) is separate and marked. */
export function nounForms(noun: DeNoun): NounForm[] {
  if (noun.adjectival) return adjectivalForms(noun);
  const irr = noun.irregular ?? {};
  const out = new Map<string, DeCell[]>();
  const put = (form: string, c: DeCase, g: DeGender | 'p'): void => addCells(out, form, [{ c, g }]);

  if (noun.gender !== 'pl') {
    const g: DeGender = noun.gender;
    const nom = irr['N sg'] ?? noun.lemma;
    const oblique = noun.weak ? weakOblique(noun) : nom;
    const gen = noun.weak ? (noun.genSg ?? oblique) : (noun.genSg ?? defaultGenitive(noun));
    put(nom, 'N', g);
    put(irr['A sg'] ?? oblique, 'A', g);
    put(irr['D sg'] ?? oblique, 'D', g);
    put(irr['G sg'] ?? gen, 'G', g);
    const other = otherGenitive(noun);
    if (other) put(other, 'G', g);
  }
  const plural = noun.gender === 'pl' ? (noun.plural ?? noun.lemma) : noun.plural;
  if (plural) {
    put(irr['N pl'] ?? plural, 'N', 'p');
    put(irr['A pl'] ?? plural, 'A', 'p');
    put(irr['G pl'] ?? plural, 'G', 'p');
    put(irr['D pl'] ?? dativePlural(plural), 'D', 'p');
  }
  const result: NounForm[] = [...out].map(([form, cells]) => ({ form, cells: sortCells(cells) }));
  const old = olderDative(noun);
  if (old && noun.gender !== 'pl') result.push({ form: old, cells: [{ c: 'D', g: noun.gender }], older: true });
  return result;
}
