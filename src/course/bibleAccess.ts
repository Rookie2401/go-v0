import type { LanguageCode } from '../core';

export type BibleAccessStatus = 'bundled' | 'linked-online';

export interface BibleAccessRecord {
  lang: LanguageCode;
  translation: string;
  edition: string;
  status: BibleAccessStatus;
  sourceUrl: string;
  method: string;
  importMethod: string;
  rights: string;
  historicalVarieties?: readonly string[];
}

/** The lawful route for the Bible door in each course language.
 *
 * This registry describes access and provenance, not a second copy of catalogue
 * rights.  Scripture that is bundled is read from the lazy library; a personal
 * copy is handled by the existing on-device importer.
 */
export const BIBLE_ACCESS: Readonly<Record<LanguageCode, BibleAccessRecord>> = {
  de: {
    lang: 'de', translation: 'Lutherbibel 1912', edition: 'deu1912', status: 'bundled',
    sourceUrl: 'https://ebible.org/deu1912/',
    method: 'Official eBible.org USFM release, independently source-checked before publication.',
    importMethod: 'Read the bundled lazy library; an entitled personal copy may also be imported on this device.',
    rights: 'Public-domain edition as stated on the source copyright page; the source record and edition remain attached.',
  },
  es: {
    lang: 'es', translation: 'Reina-Valera 1909', edition: 'spaRV1909', status: 'bundled',
    sourceUrl: 'https://ebible.org/spaRV1909/',
    method: 'Official eBible.org USFM release, independently source-checked before publication.',
    importMethod: 'Read the bundled lazy library; an entitled personal copy may also be imported on this device.',
    rights: 'Public-domain edition as stated on the source copyright page; the source record and edition remain attached.',
  },
  hi: {
    lang: 'hi', translation: 'Indian Revised Version Hindi 2019', edition: 'hin2017', status: 'bundled',
    sourceUrl: 'https://ebible.org/hin2017/',
    method: 'Official eBible.org USFM release, independently source-checked before publication.',
    importMethod: 'Read the bundled lazy library; an entitled personal copy may also be imported on this device.',
    rights: 'Copyright © 2017, 2018, 2019 Bridge Connectivity Solutions; CC BY-SA 4.0 as stated by the rights holder on the source copyright page, with attribution retained.',
  },
  th: {
    lang: 'th', translation: 'Biblica Open Thai Common Version 2025', edition: 'otcv2025', status: 'bundled',
    sourceUrl: 'https://open.bible/bibles/biblica-open-thai-common-version-2025',
    method: 'Official Open.Bible release metadata and USX/USFM comparison.',
    importMethod: 'Read the bundled lazy library; an entitled personal copy may also be imported on this device.',
    rights: 'CC BY-SA 4.0 in the official release metadata, with attribution and share-alike retained.',
  },
  sq: {
    lang: 'sq', translation: 'Bibla Shqip “Së bashku” 2020', edition: 'AL', status: 'linked-online',
    sourceUrl: 'https://www.bible.com/versions/3631',
    method: 'YouVersion edition page identifies the translation, lists the books and chapters, and credits © Interconfessional Bible Society of Albania. This is a separate linked edition, not the unidentified ALB catalogue candidate.',
    importMethod: 'An entitled personal .txt or unprotected .epub can be imported for ordinary reading on this device. The general importer does not create a verse-addressed Scripture edition.',
    rights: 'Copyright and permission to bundle or redistribute are not established. No approved Albanian Bible text is available in GoLearn’s Scripture library.',
    historicalVarieties: ['Gheg (Kristoforidhi)', 'Tosk (Kristoforidhi)'],
  },
};

export function bibleAccessFor(lang: LanguageCode): BibleAccessRecord {
  return BIBLE_ACCESS[lang];
}
