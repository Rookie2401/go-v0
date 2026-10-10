import type { ProviderOutput, TranslationInput, TranslationProvider } from './provider';

export const MIGJENI_TITLE_REFERENCE_ID = 'reference:elsie:migjeni-title';
export const MIGJENI_TITLE_EN = 'Suffering Socrates or the satisfied pig';
export const MIGJENI_TITLE_ATTRIBUTION = 'Robert Elsie, Migjeni author profile; exact title reference, not a newly generated translation';

const REFERENCE_UNCERTAINTY = 'This reference covers this exact title only; it does not establish broader grammar or dialect equivalence.';

/**
 * Normalize only title formatting: Unicode composition/case, whitespace, optional outer quotes, punctuation, and the
 * documented orthographic spacing variation “apo” / “a po”. No words are removed, rewritten, or guessed.
 */
function normalizeTitle(value: string): string {
  let title = value.normalize('NFC').toLocaleLowerCase('sq').trim();
  title = title.replace(/^["'“”‘’«»]+|["'“”‘’«»]+$/gu, '').trim();
  title = title.replace(/[?.!]+$/gu, '').trim();
  if (/^[‐‑‒–—−-]|[‐‑‒–—−-]$/u.test(title)) return '';
  title = title.replace(/[‐‑‒–—−-]/gu, ' ');
  title = title.replace(/\ba\s+po\b/gu, 'apo');
  return title.replace(/\s+/gu, ' ');
}

const EXACT_TITLES = new Set([
  normalizeTitle('Sokrat i vuejtun a po derr i kënaqun'),
]);

export interface ReferenceTranslationOutput extends Extract<ProviderOutput, { kind: 'natural' }> {
  origin: 'reference';
  generated: false;
  reviewed: false;
  attribution: typeof MIGJENI_TITLE_ATTRIBUTION;
}

/** Exact, local title lookup backed by Robert Elsie's published Migjeni profile. It retains no learner input. */
export const migjeniTitleReferenceProvider: TranslationProvider & {
  translate(input: TranslationInput): Promise<ReferenceTranslationOutput>;
} = {
  id: MIGJENI_TITLE_REFERENCE_ID,
  mode: 'local',
  async translate(input) {
    const source = input.sourceLanguage.languageId?.toLowerCase();
    const target = input.targetLanguage.languageId?.toLowerCase();
    if (source !== 'sq' || target !== 'en' || !EXACT_TITLES.has(normalizeTitle(input.text))) {
      // The generic message contains no selected text and lets the engine continue to its next provider.
      throw new Error('No exact title reference is available.');
    }
    return {
      kind: 'natural',
      text: MIGJENI_TITLE_EN,
      origin: 'reference',
      generated: false,
      reviewed: false,
      attribution: MIGJENI_TITLE_ATTRIBUTION,
      uncertaintyNotes: [REFERENCE_UNCERTAINTY],
    };
  },
};
