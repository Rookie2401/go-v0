/**
 * The varieties of Albanian the adapter can label. The course's active target is Standard Albanian; Gheg, Arbëresh,
 * Arvanitika and older spellings are recognised and labelled, never suppressed and never mixed into it. Package Q4.
 *
 * Machine-drafted and not checked by a native speaker.
 */
import type { Variety } from '../../core';

export const SQ_VARIETIES: Record<string, Variety> = {
  // The Standard is the official language of Albania and Kosovo (and has official status in North Macedonia), so it is not
  // the variety of one nation: 'supranational' is the nearest of the available kinds. It is the course's target.
  sq: { code: 'sq', label: 'Standard Albanian', kind: 'supranational', note: 'The written standard of Albania and Kosovo (the 1972 norm), taught and used across Albanian schooling, news and books; the language this course aims at.' },
  aln: { code: 'aln', label: 'Gheg', kind: 'regional', note: 'The dialect group of the north (northern Albania, Kosovo, North Macedonia, Montenegro) with no single written norm; recognise it, do not mix it into your Standard.' },
  // narrower labels: a Kosovo label is never widened to all of Gheg, nor Gheg narrowed to Kosovo
  'aln-XK': { code: 'aln-XK', label: 'Gheg of Kosovo', kind: 'regional', parent: 'aln', note: 'The Gheg spoken in Kosovo; one part of Gheg, not all of it.' },
  'aln-AL': { code: 'aln-AL', label: 'Gheg of northern Albania', kind: 'regional', parent: 'aln', note: 'The Gheg spoken in northern Albania; one part of Gheg, not all of it.' },
  // no parent: the Standard rests on Tosk, but dialectal Tosk is not the Standard
  als: { code: 'als', label: 'Tosk', kind: 'regional', note: 'The dialect group of the south, on which the Standard is largely based; dialectal Tosk is still not the Standard.' },
  aae: { code: 'aae', label: 'Arbëresh (Italy)', kind: 'regional', note: 'The Albanian of the old Albanian communities in southern Italy, with its own history and borrowings.' },
  aat: { code: 'aat', label: 'Arvanitika (Greece)', kind: 'regional', note: 'The Albanian of the old Albanian communities in Greece, now spoken by few.' },
  // not a variety of the language: a habit of typing. Listed so that a reading made from "eshte" can say what it is.
  'sq-ascii': { code: 'sq-ascii', label: 'typed without ë and ç', kind: 'feature', note: 'The word is written without its Albanian letters (eshte for është, cfare for çfarë), as much informal writing online is; Standard spelling has them.' },
  'sq-hist': { code: 'sq-hist', label: 'older Albanian', kind: 'historical', note: 'Words and spellings from before the modern standard; the text is kept as written.' },
  'sq-pre1972': { code: 'sq-pre1972', label: 'Albanian spelling before 1972', kind: 'historical', parent: 'sq-hist', note: 'Printed in the common Latin alphabet but before the 1972 norm, so spelling and some forms differ from today\'s.' },
  'sq-pre1908': { code: 'sq-pre1908', label: 'Albanian before the 1908 alphabet', kind: 'historical', parent: 'sq-hist', note: 'Written before the common alphabet of 1908, in other alphabets: a matter of the edition, recorded on the work.' },
};

/**
 * Dictionary labels (lower case, as a dictionary prints them) → the variety each one says, no wider.
 *
 * "dated" is NOT mapped to older Albanian: it says a word sounds old-fashioned today, not that it belongs to an earlier
 * stage of the language, and 'sq-hist' would tell the learner it is not used this way at all. Only "archaic" and
 * "obsolete" say that. A bare "dialectal" says a word is dialect but not which, so it maps to nothing.
 */
const LABEL_VARIETIES: Readonly<Record<string, string>> = {
  gheg: 'aln',
  tosk: 'als',
  kosovo: 'aln-XK',
  'arbëresh': 'aae', 'arbëreshë': 'aae', arberesh: 'aae', arbereshe: 'aae',
  arvanitika: 'aat',
  archaic: 'sq-hist',
  obsolete: 'sq-hist',
};

/** A dictionary's own region and usage labels ("Gheg", "Tosk", "Kosovo", "Arbëresh", "archaic") → variety codes above. */
export function sqVarietiesFromTags(tags: readonly string[]): string[] {
  const out: string[] = [];
  for (const t of tags) {
    const code = LABEL_VARIETIES[t.normalize('NFC').trim().toLowerCase()];
    if (code && !out.includes(code)) out.push(code);
  }
  return out;
}
