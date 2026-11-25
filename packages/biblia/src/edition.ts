/**
 * Biblia's editions: the same app and design over a different text. The original-languages edition (Biblia itself: the Tanakh in Hebrew and
 * the New Testament in Greek) and the translation editions — Hindi (Indian Revised Version, 2019), Thai (Biblica Open Thai Common Version,
 * 2025), German (Schlachter 1951) and Spanish (Reina-Valera 1909) — each a separate system that works the same way: its own site
 * (rookie2401.github.io/biblia-<name>), its own browser storage (`storageNamespace`: sign-in, device id, offline queue and preferences all
 * apart from Biblia's and from each other's), the same GoLearn account and Repository. An edition decides only what its text requires: the
 * library tree, the language read, the numerals, the masthead, the reading-size setting, the attribution its licence asks for and where it
 * keeps its data. The reader, the GoLearn card, the events, the levels and the settings page are the same code. The build picks the edition
 * (--mode <id> / standalone-<id>; vite.config.ts) and passes it to the app; Biblia's own build is unchanged by it.
 */
import { TREE, type BibliaLang, type Testament, type TranslationLang } from './canon';
import { IRV_ATTRIBUTION, IRV_OPTIONS } from './irv';
import type { UsfmOptions } from './usfm';

export type EditionId = 'original' | TranslationLang;

/** What the licence of a translation asks to be shown, and what Biblia changed (written beside the data as SOURCES.json too). */
export interface Attribution {
  /** the title in the text's own language */
  title: string;
  /** the title or a description in English */
  english: string;
  /** the copyright line ('Public domain' for a text without one) */
  copyright: string;
  /** a further notice the publisher asks to be shown (a trademark line), if any */
  notice?: string;
  licence: string;
  /** the licence's page; absent for the public domain */
  licenceUrl?: string;
  /** whether the licence asks that Biblia's copy carry the same licence */
  shareAlike: boolean;
  source: string;
  sourceLabel: string;
  sourceDate: string;
  changes: string;
}

/** A translation edition's text and language (absent on the original edition). */
export interface Translation {
  lang: TranslationLang;
  /** the language's name in English (the card, the notices, the settings) */
  languageName: string;
  /** the period line above the text */
  readAs: string;
  attribution: Attribution;
  /** the build's reading of the publisher's USFM (vite.config.ts and the tests) */
  usfm: { dir: string; file: RegExp; options: UsfmOptions };
  /** what the type of the page is, for Settings and the Sources page */
  typeNote: string;
  /** a font licence shipped with the edition, linked from Settings */
  fontLicence?: { label: string; href: string };
  /** the default reading size, px */
  size: number;
}

export interface Edition {
  id: EditionId;
  /** the languages of its text, whose analysers the reader registers */
  langs: readonly BibliaLang[];
  tree: Testament[];
  /** where its canon.json is (the book list with names, sections and verse counts) */
  canonPath: string;
  /** the key prefix of its device preferences (place, open library levels, reading settings) */
  prefix: string;
  /** the native lines above "Biblia Sacra" on the home page */
  masthead: Array<{ text: string; lang: BibliaLang }>;
  subtitle: string;
  /** whether the full Biblical Hebrew / Koine Greek form indexes and the sharded tables are installed */
  fullIndexes: boolean;
  /** the verse numbers shown until the learner chooses ('native' = the text's own numerals) */
  verseNumbers: 'native' | 'decimal';
  /** the label of the "native numerals" choice in Settings; '' when the text has no numerals of its own (1, 2, 3 are its numerals) */
  nativeNumeralsLabel: string;
  /** the letters on the level swatches of the legend */
  swatch: string;
  /** '' for Biblia (its storage as it has always been); otherwise every key the page stores is kept under this prefix (namespacedStorage) */
  storageNamespace: string;
  /** a translation edition's text and language */
  translation?: Translation;
  /** the site: its folder name on rookie2401.github.io, the page title and the installed app's name */
  site: { slug: string; title: string; appName: string; description: string };
}

/**
 * The page's storage seen through a prefix: every key the app, the account, the session, the recorder and the queue write is kept as
 * `<ns><key>`, so a second system on the same site (rookie2401.github.io) never reads, overwrites or clears what Biblia keeps. With '' it is
 * the storage itself, untouched.
 */
export function namespacedStorage(storage: Storage, ns: string): Storage {
  if (!ns) return storage;
  const own = (): string[] => {
    const keys: string[] = [];
    for (let i = 0; i < storage.length; i++) { const k = storage.key(i); if (k !== null && k.startsWith(ns)) keys.push(k.slice(ns.length)); }
    return keys;
  };
  return {
    get length() { return own().length; },
    key: (i: number) => own()[i] ?? null,
    getItem: (k: string) => storage.getItem(ns + k),
    setItem: (k: string, v: string) => storage.setItem(ns + k, v),
    removeItem: (k: string) => storage.removeItem(ns + k),
    clear: () => { for (const k of own()) storage.removeItem(ns + k); },
  };
}

export const ORIGINAL_EDITION: Edition = {
  id: 'original',
  langs: ['he', 'el'],
  tree: TREE,
  canonPath: 'data/canon.json',
  prefix: 'biblia:',
  masthead: [{ text: 'תַּנַ״ךְ', lang: 'he' }, { text: 'Ἡ Καινὴ Διαθήκη', lang: 'el' }],
  subtitle: 'The holy scripture in the original language with a linguistic apparatus underneath.',
  fullIndexes: true,
  verseNumbers: 'native',
  nativeNumeralsLabel: 'Hebrew / Greek',
  swatch: 'אα',
  storageNamespace: '',
  site: { slug: 'biblia', title: 'Biblia', appName: 'Biblia', description: 'The Tanakh and the Greek New Testament, read through GoLearn.' },
};

/**
 * A translation edition's library tree: the Protestant canon in its usual order, the Old Testament as Law, history, poetry and wisdom,
 * prophets; the New Testament as the original edition has it (narrative books, then the letters with Revelation). The names in the text's
 * language were written for this app and await a native speaker's review.
 */
function translationTree(lang: BibliaLang, n: { ot: string; nt: string; law: string; history: string; wisdom: string; prophets: string; histories: string; epistles: string }): Testament[] {
  return [
    {
      id: 'ot', title: 'Old Testament', native: n.ot, lang,
      divisions: [
        { id: 'Law', title: 'Law', native: n.law, sections: ['Law'] },
        { id: 'History', title: 'History', native: n.history, sections: ['History'] },
        { id: 'Wisdom', title: 'Poetry & Wisdom', native: n.wisdom, sections: ['Wisdom'] },
        { id: 'Prophets', title: 'Prophets', native: n.prophets, sections: ['Prophets'] },
      ],
    },
    {
      id: 'nt', title: 'New Testament', native: n.nt, lang,
      divisions: [
        { id: 'Histories', title: 'Histories', native: n.histories, sections: ['Gospels', 'Acts'] },
        { id: 'Epistles', title: 'Epistles', native: n.epistles, sections: ['Paul', 'General', 'Revelation'] },
      ],
    },
  ];
}

/** The usual names of Hindi Bibles for the testaments (पुराना नियम, नया नियम); the division names were written for this app and await review. */
export const HINDI_TREE: Testament[] = translationTree('hi', {
  ot: 'पुराना नियम', nt: 'नया नियम', law: 'व्यवस्था', history: 'ऐतिहासिक पुस्तकें', wisdom: 'काव्य और ज्ञान', prophets: 'भविष्यद्वक्ता',
  histories: 'सुसमाचार · प्रेरितों के काम', epistles: 'पत्रियाँ · प्रकाशितवाक्य',
});

export const HINDI_EDITION: Edition = {
  id: 'hi',
  langs: ['hi'],
  tree: HINDI_TREE,
  canonPath: 'data/hi/canon.json',
  prefix: 'biblia-hi:',
  masthead: [{ text: 'पवित्र बाइबल', lang: 'hi' }],
  subtitle: 'The holy scripture in Hindi with a linguistic apparatus underneath.',
  fullIndexes: false,
  // the IRV prints its verse numbers as 1, 2, 3; Devanagari digits are a choice in Settings
  verseNumbers: 'decimal',
  nativeNumeralsLabel: '१, २, ३',
  swatch: 'अ',
  storageNamespace: 'biblia-hindi/',
  translation: {
    lang: 'hi',
    languageName: 'Hindi',
    readAs: 'Read as Modern Standard Hindi (the Indian Revised Version, 2019), with the analyser GoLearn uses for Hindi.',
    attribution: { ...IRV_ATTRIBUTION, shareAlike: true },
    usfm: { dir: 'data/sources/hi/usfm', file: /^\d\d-([0-9A-Z]{3})hin2017\.usfm$/, options: IRV_OPTIONS },
    typeNote: 'EB Garamond (Latin) and Tiro Devanagari Hindi (Devanagari), under the SIL Open Font License 1.1, copied with their licences.',
    fontLicence: { label: 'Tiro Devanagari Hindi licence', href: './fonts/tiro-devanagari-hindi-OFL.txt' },
    size: 22,
  },
  site: { slug: 'biblia-hindi', title: 'Biblia — हिंदी', appName: 'Biblia हिंदी', description: 'The Hindi Bible (the Indian Revised Version, 2019), read through GoLearn. Sign in with your GoLearn account; every lookup and mark you make is recorded under your Hindi enrolment.' },
};

export const THAI_EDITION: Edition = {
  id: 'th',
  langs: ['th'],
  tree: translationTree('th', {
    ot: 'พันธสัญญาเดิม', nt: 'พันธสัญญาใหม่', law: 'ธรรมบัญญัติ', history: 'ประวัติศาสตร์', wisdom: 'บทกวีและปัญญา', prophets: 'ผู้เผยพระวจนะ',
    histories: 'พระกิตติคุณ · กิจการ', epistles: 'จดหมาย · วิวรณ์',
  }),
  canonPath: 'data/th/canon.json',
  prefix: 'biblia-th:',
  masthead: [{ text: 'พระคริสตธรรมคัมภีร์', lang: 'th' }],
  subtitle: 'The holy scripture in Thai with a linguistic apparatus underneath.',
  fullIndexes: false,
  // the OTCV prints its verse numbers as 1, 2, 3; Thai digits are a choice in Settings
  verseNumbers: 'decimal',
  nativeNumeralsLabel: '๑, ๒, ๓',
  swatch: 'ก',
  storageNamespace: 'biblia-thai/',
  translation: {
    lang: 'th',
    languageName: 'Thai',
    readAs: 'Read as Standard Thai (the Biblica Open Thai Common Version, 2025), with the analyser GoLearn uses for Thai.',
    attribution: {
      title: 'Biblica® พระคริสตธรรมคัมภีร์ ฉบับไทยสามัญแบบเปิด™ (สงวนลิขสิทธิ์ © 2025 โดย Biblica, Inc.)',
      english: 'Biblica® Open Thai Common Version™',
      copyright: 'Copyright © 2025 by Biblica, Inc.',
      notice: '“Biblica” is a trademark registered in the United States Patent and Trademark Office by Biblica, Inc. Used with permission.',
      licence: 'Creative Commons Attribution-ShareAlike 4.0 International',
      licenceUrl: 'https://creativecommons.org/licenses/by-sa/4.0/',
      shareAlike: true,
      source: 'https://open.bible/bibles/biblica-open-thai-common-version-2025',
      sourceLabel: 'Open.Bible',
      sourceDate: 'release of 2025-03-01',
      changes: 'The verse wording is unchanged. The section headings, parallel-passage references, speaker labels and footnotes of the edition are not shown, nor the numbers of the sixteen verses that modern texts omit and the OTCV gives only as a note (Matthew 17:21 …); the verses are laid out by Biblia. These changes are not endorsed by the original licensor.',
    },
    usfm: { dir: 'data/sources/th/usfm-full/release/USX_1', file: /^([0-9A-Z]{3})\.usfm$/, options: { markerSpace: 'delimiter' } },
    typeNote: 'EB Garamond (Latin, SIL Open Font License 1.1, copied with its licence); the Thai text is set in your device’s own Thai typeface.',
    size: 22,
  },
  site: { slug: 'biblia-thai', title: 'Biblia — ไทย', appName: 'Biblia ไทย', description: 'The Thai Bible (the Biblica Open Thai Common Version, 2025), read through GoLearn. Sign in with your GoLearn account; every lookup and mark you make is recorded under your Thai enrolment.' },
};

export const GERMAN_EDITION: Edition = {
  id: 'de',
  langs: ['de'],
  tree: translationTree('de', {
    ot: 'Altes Testament', nt: 'Neues Testament', law: 'Die fünf Bücher Mose', history: 'Geschichtsbücher', wisdom: 'Lehrbücher und Psalmen', prophets: 'Propheten',
    histories: 'Evangelien · Apostelgeschichte', epistles: 'Briefe · Offenbarung',
  }),
  canonPath: 'data/de/canon.json',
  prefix: 'biblia-de:',
  masthead: [{ text: 'Die Heilige Schrift', lang: 'de' }],
  subtitle: 'The holy scripture in German with a linguistic apparatus underneath.',
  fullIndexes: false,
  verseNumbers: 'decimal',
  nativeNumeralsLabel: '',
  swatch: 'Ä',
  storageNamespace: 'biblia-german/',
  translation: {
    lang: 'de',
    languageName: 'German',
    readAs: 'Read as German (the Schlachter Bible, 1951 revision, in the spelling of its time), with the analyser GoLearn uses for German.',
    attribution: {
      title: 'Die Schlachter-Bibel 1951',
      english: 'The Holy Bible in German, Schlachter 1951 version (translated by Franz Eugen Schlachter; revised 1951 by the Genfer Bibelgesellschaft)',
      copyright: 'Copyright © 1951 Genfer Bibelgesellschaft (Geneva Bible Society)',
      licence: 'Creative Commons Attribution 4.0',
      licenceUrl: 'https://creativecommons.org/licenses/by/4.0/',
      shareAlike: false,
      source: 'https://ebible.org/deu1951/',
      sourceLabel: 'eBible.org (deu1951)',
      sourceDate: 'source files dated 2025-12-12',
      changes: 'The verse wording is unchanged. The verse numbers of the German numbering that the source prints in brackets inside verses where it differs from the English numbering, e.g. “(03-2)”, are not shown (1,404 of them), nor Matthew 21:44, which the source leaves empty; the verses are laid out by Biblia. These changes are not endorsed by the original licensor.',
    },
    usfm: { dir: 'data/sources/de/usfm', file: /^\d\d-([0-9A-Z]{3})deu1951\.usfm$/, options: { dropPatterns: [/\(\d{1,3}-\d{1,3}\)/g] } },
    typeNote: 'EB Garamond, under the SIL Open Font License 1.1, copied with its licence.',
    size: 22,
  },
  site: { slug: 'biblia-german', title: 'Biblia — Deutsch', appName: 'Biblia Deutsch', description: 'The German Bible (Schlachter 1951), read through GoLearn. Sign in with your GoLearn account; every lookup and mark you make is recorded under your German enrolment.' },
};

export const SPANISH_EDITION: Edition = {
  id: 'es',
  langs: ['es'],
  tree: translationTree('es', {
    ot: 'Antiguo Testamento', nt: 'Nuevo Testamento', law: 'Pentateuco', history: 'Libros históricos', wisdom: 'Libros poéticos y sapienciales', prophets: 'Profetas',
    histories: 'Evangelios · Hechos', epistles: 'Epístolas · Apocalipsis',
  }),
  canonPath: 'data/es/canon.json',
  prefix: 'biblia-es:',
  masthead: [{ text: 'Santa Biblia', lang: 'es' }],
  subtitle: 'The holy scripture in Spanish with a linguistic apparatus underneath.',
  fullIndexes: false,
  verseNumbers: 'decimal',
  nativeNumeralsLabel: '',
  swatch: 'Ñ',
  storageNamespace: 'biblia-spanish/',
  translation: {
    lang: 'es',
    languageName: 'Spanish',
    readAs: 'Read as Spanish (the Reina-Valera revision of 1909, in the spelling of its time), with the analyser GoLearn uses for Spanish.',
    attribution: {
      title: 'Santa Biblia — Reina Valera 1909',
      english: 'The Holy Bible in Spanish, Reina-Valera translation, 1909 revision',
      copyright: 'Public domain',
      licence: 'Public domain',
      shareAlike: false,
      source: 'https://ebible.org/spaRV1909/',
      sourceLabel: 'eBible.org (spaRV1909)',
      sourceDate: 'source files dated 2015-08-10',
      changes: 'The verse wording is unchanged. The Strong’s numbers the source attaches to its words are not shown, nor the eighteen verse numbers it leaves empty where the Spanish numbering differs from the English (Jonah 1:17 is 2:1 here, its words in their place); the verses are laid out by Biblia.',
    },
    usfm: { dir: 'data/sources/es/usfm', file: /^\d\d-([0-9A-Z]{3})spaRV1909\.usfm$/, options: {} },
    typeNote: 'EB Garamond, under the SIL Open Font License 1.1, copied with its licence.',
    size: 22,
  },
  site: { slug: 'biblia-spanish', title: 'Biblia — Español', appName: 'Biblia Español', description: 'The Spanish Bible (Reina-Valera 1909), read through GoLearn. Sign in with your GoLearn account; every lookup and mark you make is recorded under your Spanish enrolment.' },
};

export const TRANSLATION_EDITIONS: readonly Edition[] = [HINDI_EDITION, THAI_EDITION, GERMAN_EDITION, SPANISH_EDITION];

export function editionOf(id: string | undefined): Edition {
  return TRANSLATION_EDITIONS.find((e) => e.id === id) ?? ORIGINAL_EDITION;
}

/** What a chapter is called in the text's language, before its number (the library's chapter rows, the "Continue reading" line). */
export const CHAPTER_WORD: Record<BibliaLang, string> = { he: 'פֶּרֶק', el: 'Κεφάλαιον', hi: 'अध्याय', th: 'บทที่', de: 'Kapitel', es: 'Capítulo' };
/** The language's name in English, for the card and the notices. */
export const LANGUAGE_NAME: Record<BibliaLang, string> = { he: 'Hebrew', el: 'Greek', hi: 'Hindi', th: 'Thai', de: 'German', es: 'Spanish' };
