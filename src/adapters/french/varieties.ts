/**
 * The varieties of French the adapter can label (see core/variety.ts for how a course uses them). Nothing is hidden: a
 * word or form of another variety is recognised and labelled. Machine-drafted, not checked by a native speaker.
 *
 * The label table below was written after counting the region tags the French extract (kaikki.org) really uses in its
 * senses: Louisiana 711, Quebec 655, Canada 364, France 265, Belgium 253, Switzerland 131, Africa 45, Canadian 28, Rwanda 22,
 * Morocco 21, Congo 14, Lyon 11, Paris 10, Montreal 8 … (and none for Ivory Coast or Senegal, so those are not listed).
 */
import type { Variety } from '../../core';

export const FR_VARIETIES: Readonly<Record<string, Variety>> = {
  'fr-FR': { code: 'fr-FR', label: 'France', kind: 'national', note: 'The French of France: the usual reference standard.' },
  'fr-CA': { code: 'fr-CA', label: 'Canada (Québec)', kind: 'national', note: 'The French of Canada, above all of Québec.' },
  'fr-BE': { code: 'fr-BE', label: 'Belgium', kind: 'national', note: 'The French of Belgium (septante, nonante, and more).' },
  'fr-CH': { code: 'fr-CH', label: 'Switzerland', kind: 'national', note: 'The French of French-speaking Switzerland (septante, huitante, nonante).' },
  'fr-africa': { code: 'fr-africa', label: 'Francophone Africa', kind: 'supranational', note: 'Usage shared by the French-speaking countries of Africa.' },
  'fr-louisiana': { code: 'fr-louisiana', label: 'Louisiana French', kind: 'regional', note: 'The French of Louisiana (Cajun and Creole communities).' },
  'fr-hist': { code: 'fr-hist', label: 'older French', kind: 'historical', note: 'Spelling or usage from before the modern standard; the text is kept as written.' },
};

/** Codes the adapter tags words with, for tests and tools that must not accept an unknown tag. */
export const FR_VARIETY_CODES: readonly string[] = Object.keys(FR_VARIETIES);

/**
 * A dictionary's region labels → the variety code each one says, no wider (lower-case keys; look a label up lower-cased).
 * Only regions are listed: a usage label (slang, obsolete, dated …) is not a variety, and nothing is guessed. Labels that
 * name a place with no code of its own here (Luxembourg, the Antilles, Guyana, Europe, North America, a French province
 * such as Alsace or Normandy) are left out rather than widened or narrowed.
 */
export const FR_LABEL_VARIETIES: Readonly<Record<string, string>> = {
  france: 'fr-FR',
  quebec: 'fr-CA', canada: 'fr-CA', canadian: 'fr-CA', 'canadian-french': 'fr-CA', montreal: 'fr-CA', ontario: 'fr-CA', newfoundland: 'fr-CA',
  belgium: 'fr-BE',
  switzerland: 'fr-CH', fribourg: 'fr-CH', valais: 'fr-CH',
  louisiana: 'fr-louisiana',
  africa: 'fr-africa', rwanda: 'fr-africa', congo: 'fr-africa', morocco: 'fr-africa', 'southern-africa': 'fr-africa',
};
