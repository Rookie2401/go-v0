/**
 * The Biblical Aramaic analyser's static description: version, varieties, support and source. Kept apart from the
 * corpus seed so a bundle that only names the analyser (the extension's background worker) does not carry the data.
 */
import type { LanguageAdapter } from '../../core';

export const ARC_VERSION = '2';
export const ARC_ANALYZER = 'adapter-arc@2';
export const ARC_SOURCE_ID = 'oshb-aramaic';
export const ARC_VARIETIES = {
  'arc-bib': { code: 'arc-bib', label: 'Biblical Aramaic', kind: 'period' as const,
    note: 'Corpus-backed Biblical Aramaic readings from the OSHB source. Other dialects are not analysed.' },
};
/** Metadata, not an assertion that every family member is supported. */
export const ARAMAIC_FAMILY = {
  name: 'Aramaic', supported: ['arc-bib'],
  future: ['Targum Onkelos', 'Targum Jonathan', 'Imperial Aramaic', 'Qumran Aramaic', 'Classical Syriac (syc, Syrc)'],
} as const;

export const ARC_SUPPORT: NonNullable<LanguageAdapter['support']> = {
  tokenization: 'dependable', sentenceSegmentation: 'limited', lemmatization: 'seed-only', morphology: 'limited',
  phraseDetection: 'none', productionChecks: 'none',
  limitations: [
    'The analyser recognizes only attested forms in the bundled corpus; it does not generate or guess unattested forms. Unknown forms remain unresolved.',
    'OSHB supplies morphology; Open Scriptures Strong supplies lexical headwords and base meanings. No independent scholarly review is claimed.',
    'Selected-word glosses remain attached to attested readings. arcLexiconLookup can look up indexed headwords or forms, but does not generate a candidate for an unattested citation form; the pack runtime does not expose a separate dictionary service.',
    'Unpointed forms keep every matching pointed source analysis at reduced confidence. Sentence syntax is not parsed.',
    'Roots, productive paradigms, cognates, Targumic Aramaic, Imperial Aramaic and Syriac are not implemented.',
    'Base meanings are lexical help, not verified inflected translations. No historical pronunciation recording or voice is supplied.',
  ],
};

export const ARC_SOURCES: NonNullable<LanguageAdapter['sources']> = {
  [ARC_SOURCE_ID]: {
    id: ARC_SOURCE_ID, label: 'OSHB Biblical Aramaic morphology; Open Scriptures Strong lexical transcription',
    origin: 'dictionary', reviewStatus: 'external', licence: 'CC BY 4.0. Original work of the Open Scriptures Hebrew Bible available at https://github.com/openscriptures/morphhb',
    version: 'OSHB Aramaic annotations, corpus snapshot 2026-11-05',
  },
};
