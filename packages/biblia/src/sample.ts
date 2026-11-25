/**
 * The verse Settings shows as its live sample, one for each language Biblia reads: the first verse of Genesis (of John for Greek), exactly as the
 * edition's own data has it. Written here by a script from the built data (never typed by hand: the Hebrew carries its vowels and accents, the
 * Thai its zero-width spaces), as code points, so that no editor can alter a mark. test/biblia/settings.test.ts checks the Hebrew and the Greek
 * against the data files where they are present. The texts are the editions' own, under the licences the Sources page names.
 */
import type { BibliaLang } from './canon';

export const SAMPLE_VERSE: Readonly<Record<BibliaLang, string>> = {
  /** Genesis 1:1, Miqra according to the Masorah */
  he: '\u{5d1}\u{5bc}\u{5b0}\u{5e8}\u{5b5}\u{5d0}\u{5e9}\u{5c1}\u{5b4}\u{596}\u{5d9}\u{5ea} \u{5d1}\u{5bc}\u{5b8}\u{5e8}\u{5b8}\u{5a3}\u{5d0} \u{5d0}\u{5b1}\u{5dc}\u{5b9}\u{5d4}\u{5b4}\u{591}\u{5d9}\u{5dd} \u{5d0}\u{5b5}\u{5a5}\u{5ea} \u{5d4}\u{5b7}\u{5e9}\u{5c1}\u{5bc}\u{5b8}\u{5de}\u{5b7}\u{596}\u{5d9}\u{5b4}\u{5dd} \u{5d5}\u{5b0}\u{5d0}\u{5b5}\u{5a5}\u{5ea} \u{5d4}\u{5b8}\u{5d0}\u{5b8}\u{5bd}\u{5e8}\u{5b6}\u{5e5}\u{5c3}',
  /** John 1:1, The Greek New Testament: SBL Edition */
  el: '\u{1f18}\u{3bd} \u{1f00}\u{3c1}\u{3c7}\u{1fc7} \u{1f26}\u{3bd} \u{1f41} \u{3bb}\u{3cc}\u{3b3}\u{3bf}\u{3c2}, \u{3ba}\u{3b1}\u{1f76} \u{1f41} \u{3bb}\u{3cc}\u{3b3}\u{3bf}\u{3c2} \u{1f26}\u{3bd} \u{3c0}\u{3c1}\u{1f78}\u{3c2} \u{3c4}\u{1f78}\u{3bd} \u{3b8}\u{3b5}\u{3cc}\u{3bd}, \u{3ba}\u{3b1}\u{1f76} \u{3b8}\u{3b5}\u{1f78}\u{3c2} \u{1f26}\u{3bd} \u{1f41} \u{3bb}\u{3cc}\u{3b3}\u{3bf}\u{3c2}.',
  /** Genesis 1:1, Indian Revised Version (2019) */
  hi: '\u{906}\u{926}\u{93f} \u{92e}\u{947}\u{902} \u{92a}\u{930}\u{92e}\u{947}\u{936}\u{94d}\u{935}\u{930} \u{928}\u{947} \u{906}\u{915}\u{93e}\u{936} \u{914}\u{930} \u{92a}\u{943}\u{925}\u{94d}\u{935}\u{940} \u{915}\u{940} \u{938}\u{943}\u{937}\u{94d}\u{91f}\u{93f} \u{915}\u{940}\u{964}',
  /** Genesis 1:1, Open Thai Common Version */
  th: '\u{e43}\u{e19}\u{200b}\u{e1b}\u{e10}\u{e21}\u{e01}\u{e32}\u{e25} \u{e1e}\u{e23}\u{e30}\u{e40}\u{e08}\u{e49}\u{e32}\u{200b}\u{e2a}\u{e23}\u{e49}\u{e32}\u{e07}\u{200b}\u{e1f}\u{e49}\u{e32}\u{200b}\u{e2a}\u{e27}\u{e23}\u{e23}\u{e04}\u{e4c}\u{200b}\u{e41}\u{e25}\u{e30}\u{200b}\u{e42}\u{e25}\u{e01}',
  /** Genesis 1:1, Schlachter 1951 */
  de: 'Im Anfang schuf Gott den Himmel und die Erde.',
  /** Genesis 1:1, Reina-Valera 1909 */
  es: 'EN el principio cri\u{f3} Dios los cielos y la tierra.',
};
