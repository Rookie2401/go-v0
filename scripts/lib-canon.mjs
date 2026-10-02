/**
 * The order of the Bible's books and the number of chapters in each (the 66-book canon the bundled translations use),
 * and the running number of a chapter in it: Genesis 1 = 1 … Revelation 22 = 1189. A chapter's place in the canon is
 * the only chapter number under which a whole Bible reads in order, whichever chapters are bundled and whichever are
 * in the library. Plain JavaScript, so that both the .mjs build scripts and the .mts tools can import it.
 */

/** @type {ReadonlyArray<readonly [string, number]>} */
export const CANON = [
  ['GEN', 50], ['EXO', 40], ['LEV', 27], ['NUM', 36], ['DEU', 34], ['JOS', 24], ['JDG', 21], ['RUT', 4], ['1SA', 31], ['2SA', 24], ['1KI', 22], ['2KI', 25],
  ['1CH', 29], ['2CH', 36], ['EZR', 10], ['NEH', 13], ['EST', 10], ['JOB', 42], ['PSA', 150], ['PRO', 31], ['ECC', 12], ['SNG', 8], ['ISA', 66], ['JER', 52],
  ['LAM', 5], ['EZK', 48], ['DAN', 12], ['HOS', 14], ['JOL', 3], ['AMO', 9], ['OBA', 1], ['JON', 4], ['MIC', 7], ['NAM', 3], ['HAB', 3], ['ZEP', 3], ['HAG', 2],
  ['ZEC', 14], ['MAL', 4], ['MAT', 28], ['MRK', 16], ['LUK', 24], ['JHN', 21], ['ACT', 28], ['ROM', 16], ['1CO', 16], ['2CO', 13], ['GAL', 6], ['EPH', 6],
  ['PHP', 4], ['COL', 4], ['1TH', 5], ['2TH', 3], ['1TI', 6], ['2TI', 4], ['TIT', 3], ['PHM', 1], ['HEB', 13], ['JAS', 5], ['1PE', 5], ['2PE', 3], ['1JN', 5],
  ['2JN', 1], ['3JN', 1], ['JUD', 1], ['REV', 22],
];

/** @type {ReadonlyMap<string, number>} */
export const bookIndex = new Map(CANON.map(([b], i) => [b, i]));

/**
 * The running number of a chapter in the canon, or undefined for a book or chapter the canon does not have.
 * @param {string} book @param {number} chapter @returns {number | undefined}
 */
export function runningNumber(book, chapter) {
  const i = bookIndex.get(book);
  if (i === undefined || !Number.isInteger(chapter) || chapter < 1 || chapter > CANON[i][1]) return undefined;
  let n = 0;
  for (let k = 0; k < i; k++) n += CANON[k][1];
  return n + chapter;
}

export const CANON_CHAPTERS = CANON.reduce((n, [, c]) => n + c, 0);
