/**
 * Biblia's editions: the same app and design over a different text. The original-languages edition (Biblia itself: the Tanakh in Hebrew and
 * the New Testament in Greek) and the Hindi edition (the Indian Revised Version, 2019), which is a separate system that works the same way:
 * its own site (rookie2401.github.io/biblia-hindi), its own browser storage (`storageNamespace`: sign-in, device id, offline queue and
 * preferences all apart from Biblia's), the same GoLearn account and Repository. An edition decides only what its text requires: the library
 * tree, the languages read, the numerals, the masthead, the reading-size setting and where it keeps its data. The reader, the GoLearn card,
 * the events, the levels and the settings page are the same code. The build picks the edition (--mode hi; vite.config.ts) and passes it to
 * the app; Biblia's own build is unchanged by it.
 */
import { TREE, type BibliaLang, type Testament } from './canon';

export type EditionId = 'original' | 'hi';

export interface Edition {
  id: EditionId;
  /** the languages of its text, whose analysers the reader registers */
  langs: readonly BibliaLang[];
  tree: Testament[];
  /** where its canon.json is (the book list with names, sections and verse counts) */
  canonPath: string;
  /** the key prefix of its device preferences (place, open library levels, reading settings): editions on one site keep their own */
  prefix: string;
  /** the native lines above "Biblia Sacra" on the home page */
  masthead: Array<{ text: string; lang: BibliaLang }>;
  subtitle: string;
  /** whether the full Biblical Hebrew / Koine Greek form indexes and the sharded tables are installed */
  fullIndexes: boolean;
  /** the verse numbers shown until the learner chooses ('native' = the text's own numerals) */
  verseNumbers: 'native' | 'decimal';
  /** the label of the "native numerals" choice in Settings */
  nativeNumeralsLabel: string;
  /** the letters on the level swatches of the legend */
  swatch: string;
  /** '' for Biblia (its storage as it has always been); otherwise every key the page stores is kept under this prefix (namespacedStorage) */
  storageNamespace: string;
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
};

/**
 * The Indian Revised Version in its own order (the Protestant canon): the Old Testament as Law, history, poetry and wisdom, prophets; the New
 * Testament as the original edition has it (narrative books, then the letters with Revelation). The Hindi names of the testaments and divisions
 * are the usual ones of Hindi Bibles (पुराना नियम, नया नियम); the division names were written for this app and await a Hindi speaker's review.
 */
export const HINDI_TREE: Testament[] = [
  {
    id: 'ot', title: 'Old Testament', native: 'पुराना नियम', lang: 'hi',
    divisions: [
      { id: 'Law', title: 'Law', native: 'व्यवस्था', sections: ['Law'] },
      { id: 'History', title: 'History', native: 'ऐतिहासिक पुस्तकें', sections: ['History'] },
      { id: 'Wisdom', title: 'Poetry & Wisdom', native: 'काव्य और ज्ञान', sections: ['Wisdom'] },
      { id: 'Prophets', title: 'Prophets', native: 'भविष्यद्वक्ता', sections: ['Prophets'] },
    ],
  },
  {
    id: 'nt', title: 'New Testament', native: 'नया नियम', lang: 'hi',
    divisions: [
      { id: 'Histories', title: 'Histories', native: 'सुसमाचार · प्रेरितों के काम', sections: ['Gospels', 'Acts'] },
      { id: 'Epistles', title: 'Epistles', native: 'पत्रियाँ · प्रकाशितवाक्य', sections: ['Paul', 'General', 'Revelation'] },
    ],
  },
];

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
};

export function editionOf(id: string | undefined): Edition {
  return id === 'hi' ? HINDI_EDITION : ORIGINAL_EDITION;
}

/** What a chapter is called in the text's language, before its number (the library's chapter rows, the "Continue reading" line). */
export const CHAPTER_WORD: Record<BibliaLang, string> = { he: 'פֶּרֶק', el: 'Κεφάλαιον', hi: 'अध्याय' };
/** The language's name in English, for the card and the notices. */
export const LANGUAGE_NAME: Record<BibliaLang, string> = { he: 'Hebrew', el: 'Greek', hi: 'Hindi' };
