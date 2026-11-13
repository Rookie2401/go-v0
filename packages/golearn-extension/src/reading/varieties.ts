/**
 * Reading Analysis chooses a TEXT variety, not a separate GoLearn language.
 * The underlying Hebrew/Greek Repository rows predate variety-aware IDs;
 * their legacy state must never be called confidently known in a particular period.
 *
 * These IDs are reserved for future variant-scoped projections. Existing rows are
 * never migrated, rewritten, or silently attributed to a new period.
 */
import { mapLanguageTag } from '../language/resolve';

export const TEXT_VARIETIES: Readonly<Record<string, readonly { id: string; label: string }[]>> = {
  he: [
    { id: 'he-bib', label: 'Biblical Hebrew' },
    { id: 'he-mod', label: 'Modern Hebrew' },
  ],
  el: [
    { id: 'el-hom', label: 'Homeric Greek' },
    { id: 'el-att', label: 'Attic Greek' },
    { id: 'el-koi', label: 'Koine Greek' },
    { id: 'el-mod', label: 'Modern Greek' },
  ],
};

export const needsTextVariety = (languageId: string): boolean =>
  Object.prototype.hasOwnProperty.call(TEXT_VARIETIES, languageId);

export function validTextVariety(languageId: string, varietyId: string | undefined): boolean {
  const options = TEXT_VARIETIES[languageId];
  return !options || !!varietyId && options.some((v) => v.id === varietyId);
}

/**
 * Only an unambiguous explicit HTML/BCP47 tag may select a period automatically.
 * Bare 'he' and 'el' are not evidence of Biblical vs Modern usage.
 * An unqualified 'grc' does not distinguish Homeric, Attic and Koine.
 */
export function declaredTextVariety(languageId: string, tag: string | undefined): string | undefined {
  if (!tag?.trim() || !needsTextVariety(languageId)) return undefined;
  const normalized = tag.trim().toLowerCase().replace(/_/gu, '-');
  if (normalized === 'hbo' || normalized.startsWith('hbo-')) return languageId === 'he' ? 'he-bib' : undefined;
  if (normalized === 'grc-x-koine' || normalized.startsWith('grc-x-koine-')) return languageId === 'el' ? 'el-koi' : undefined;
  const mapping = mapLanguageTag(tag);
  if (mapping.kind !== 'pack' || mapping.languageId !== languageId) return undefined;
  // The resolver maps generic 'grc' to Attic as a convenience for cards.
  // That is not strong enough evidence to infer the period for reading coverage.
  if (normalized === 'grc' || normalized.startsWith('grc-') && !normalized.includes('koine')) return undefined;
  if (normalized === 'he' || normalized === 'el' || normalized.startsWith('he-') || normalized.startsWith('el-')) return undefined;
  return mapping.varietyId && validTextVariety(languageId, mapping.varietyId) ? mapping.varietyId : undefined;
}

/** A future safe projection may record a variety-specific form or lemma row. */
export function scopedVarietyUnitId(id: string, languageId: string, varietyId: string): string | undefined {
  const form = `form:${languageId}:`;
  const lemma = `lemma:${languageId}:`;
  if (id.startsWith(form)) return `form:${languageId}:${varietyId}:${id.slice(form.length)}`;
  if (id.startsWith(lemma)) return `lemma:${languageId}:${varietyId}:${id.slice(lemma.length)}`;
  return undefined;
}
