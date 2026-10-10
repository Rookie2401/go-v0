/**
 * Thai has no inflection tables, so no dictionary table tag maps to a feature of this adapter. The `forms` of a Thai entry in the
 * Wiktionary extract (kaikki) hold romanizations, variant spellings and, for a noun, its classifier and abstract-noun derivative (tags
 * "romanization", "alternative", "classifier", "abstract-noun", "obsolete" ...): none of them is an inflected form. The mapping is
 * therefore always `undefined`, which tells the paradigm merge that a row is not placed in any table
 * (`LanguageAdapter.featuresFromTableTags`). The classifier tag is real information for the card; it is not a paradigm cell.
 * See docs/ecosystem/linguistics/PARADIGMS-th.md.
 */
import type { PartOfSpeech } from '../../core/model';

export function thFeaturesFromTableTags(_tags: readonly string[], _pos: PartOfSpeech): Record<string, string> | undefined {
  return undefined;
}
