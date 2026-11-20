/**
 * French orthography: the identity of a written form.
 *
 * `normalizeFr` is the vocabulary key of a form: NFC, lower case, and every typographic apostrophe as the straight one,
 * so l’homme and l'homme are one identity. Accents and ligatures are kept (côte ≠ cote ≠ côté; œuvre stays œuvre): a page
 * that writes "oeuvre" is helped by `ligatureVariants`, never by rewriting what it wrote.
 * `foldFr` is for searching only (people type "ecole", "coeur").
 */
import { nfc, stripMarks } from '../shared';

/** Characters a page may use for the apostrophe of an elision: ' ’ ʼ ‘ ′ ` ´ ＇ */
export const APOSTROPHES = "'’ʼ‘′`´＇";
const APOSTROPHE_RE = /[’ʼ‘′`´＇]/gu;
/** A hyphen a page may write between the parts of a word: - ‐ ‑ (the non-breaking hyphen). Dashes (– —) are punctuation, never part of a word. */
export const HYPHENS = '-‐‑';
const HYPHEN_RE = /[‐‑]/gu;

/** The vocabulary identity of a written form (see the file comment). */
export const normalizeFr = (s: string): string => nfc(s).toLocaleLowerCase('fr').replace(APOSTROPHE_RE, "'").replace(HYPHEN_RE, '-');

/** Search key: accents removed, ligatures opened (œ → oe, æ → ae), ç → c. Never a vocabulary identity. */
export const foldFr = (q: string): string => stripMarks(normalizeFr(q)).replace(/œ/g, 'oe').replace(/æ/g, 'ae').trim();

/** The other way a form may be written where a ligature is concerned: coeur → cœur, œuvre → oeuvre. Empty when the form has neither. */
export function ligatureVariants(normalized: string): string[] {
  const out = new Set<string>();
  if (normalized.includes('oe')) out.add(normalized.replace(/oe/g, 'œ'));
  if (normalized.includes('ae')) out.add(normalized.replace(/ae/g, 'æ'));
  if (normalized.includes('œ')) out.add(normalized.replace(/œ/g, 'oe'));
  if (normalized.includes('æ')) out.add(normalized.replace(/æ/g, 'ae'));
  out.delete(normalized);
  return [...out];
}
