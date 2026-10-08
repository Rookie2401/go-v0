import type { LanguageCode } from '../core';

/** bundled: read in the lazy library. linked-online: an edition read at the publisher's or a distributor's site. not-bundled: no text is bundled yet (rights not verified) and the page only states why. */
export type BibleAccessStatus = 'bundled' | 'linked-online' | 'not-bundled';

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
  // Norwegian: no Bible is bundled yet. The publisher says the 1930 Bokmål and 1938 Nynorsk translations are in the public
  // domain but names no legal basis (docs/norway/SPEC.md section 9); neither is treated as verified. Bibel 2011 / 2024 are protected.
  nb: {
    lang: 'nb', translation: 'Bibelen 1930 (Bokmål)', edition: 'nor1930', status: 'not-bundled',
    sourceUrl: 'https://bibel.no/verbum/rettigheter-til-bruk-av-bibeltekst',
    method: 'No Bible text is bundled yet. the page of Bibelselskapet on the use of Bible text is the source of the rights statement; a three-verse seed excerpt (1 John 1:1-3) is held out of the release bundle until a person verifies it.',
    importMethod: 'An entitled personal .txt or unprotected .epub can be imported for ordinary reading on this device. The general importer does not create a verse-addressed Scripture edition.',
    rights: 'Bibelselskapet states that the 1930 Bokmål translation has "falt i det fri" (is free to use) but gives no legal basis, and no check has been made. The current translations (Bibel 2011, Bibel 2024) are protected and are not bundled.',
  },
  nn: {
    lang: 'nn', translation: 'Bibelen 1938 (Nynorsk)', edition: 'nor1938', status: 'not-bundled',
    sourceUrl: 'https://bibel.no/verbum/rettigheter-til-bruk-av-bibeltekst',
    method: 'No Bible text is bundled yet. the page of Bibelselskapet on the use of Bible text is the source of the rights statement; no digital 1938 text with a licence has been found, and the 1921 Studentmållaget translation is a different translation.',
    importMethod: 'An entitled personal .txt or unprotected .epub can be imported for ordinary reading on this device. The general importer does not create a verse-addressed Scripture edition.',
    rights: 'Bibelselskapet states that the 1938 Nynorsk translation has "falt i det fri" (is free to use) but gives no legal basis, and the reviser died in 1984, so the claim is unchecked. The current translations are protected and are not bundled.',
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
