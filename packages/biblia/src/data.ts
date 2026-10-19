/**
 * The texts, exactly as the Biblia app's build has them (packages/biblia/public/data, copied by npm run biblia:import):
 *   Hebrew  { book, chapters: [{ n, verses: [{ n, t, w, kq?, pe?, s?, nun?, note?, absent? }] }] }   t = the verse as MAM prints it; w = one
 *           Open Scriptures reading per maqaf-split content word: [lemma chain, morph code, segmented form?] or null (unaligned)
 *   Greek   { book, chapters: [{ n, verses: [{ n, w: [[printed, lemma, pos, parse?], …] }] }] }   MorphGNT per printed token
 * The reader shows `t` (Hebrew) or the printed tokens joined by spaces (Greek); the `w` columns are the sources' own readings of those
 * very words, not analysed here (PLAN14 §6: the Go analysers read the text; the full indexes carry the same readings).
 */
import { installHebrewIndex, type HebrewFormIndex } from '../../../src/adapters/hebrew/index-store';
import { installGreekIndex, type GreekFormIndex } from '../../../src/adapters/greek/index-store';
import type { BibliaLang } from './canon';

export type HeTok = [lemma: string, morph: string, seg?: string];
export type GrTok = [printed: string, lemma: string, pos: string, parse?: string];
export interface HeVerse { n: number; t: string; w: Array<HeTok | null>; kq?: Array<{ k: string; q: string }>; pe?: 1; s?: 1; nun?: 1; note?: string; absent?: 1 }
export interface GrVerse { n: number; w: GrTok[] }
export interface Chapter<V> { n: number; verses: V[] }
export interface HeBook { book: string; chapters: Chapter<HeVerse>[] }
export interface GrBook { book: string; chapters: Chapter<GrVerse>[] }
export type AnyBook = ({ lang: 'he' } & HeBook) | ({ lang: 'el' } & GrBook);

export interface DataSource { fetchJson(path: string): Promise<unknown> }

export const fetchJsonWith = (fetcher: typeof fetch, base = './'): DataSource => ({
  async fetchJson(path) {
    const r = await fetcher(`${base}${path}`);
    if (!r.ok) throw new Error(`${path}: ${r.status}`);
    return r.json();
  },
});

export class Texts {
  private readonly books = new Map<string, Promise<AnyBook>>();
  constructor(private readonly src: DataSource) {}
  loadBook(lang: BibliaLang, id: string): Promise<AnyBook> {
    const key = `${lang}/${id}`;
    let p = this.books.get(key);
    if (!p) {
      p = this.src.fetchJson(`data/${lang}/${id}.json`).then((j) => {
        const b = j as { book?: string; chapters?: unknown };
        if (!b || b.book !== id || !Array.isArray(b.chapters)) throw new Error(`${key}: not a book file`);
        return { lang, ...(b as HeBook | GrBook) } as AnyBook;
      });
      this.books.set(key, p);
      p.catch(() => this.books.delete(key));
    }
    return p;
  }
}

/** The Greek verse as text: the printed tokens joined by spaces (MorphGNT keeps punctuation on the token). */
export const greekVerseText = (v: GrVerse): string => v.w.map((t) => t[0]).join(' ');

/** The Aramaic chapters of the Tanakh (Daniel 2:4b–7:28, Ezra 4:8–6:18, 7:12–26, Jeremiah 10:11): a verse is Aramaic when its readings carry the A language letter. */
export const verseIsAramaic = (v: HeVerse): boolean => v.w.filter((t): t is HeTok => !!t).length > 0 && v.w.filter((t): t is HeTok => !!t).every((t) => t[1][0] === 'A');

export interface IndexLoad { he: boolean; el: boolean; notes: string[] }

/** Installs the full Biblical and Koine form indexes (public/lexicon/{he,el}, built locally) so every word of the text has its source's reading; says which could not be loaded. */
export async function installFullIndexes(src: DataSource): Promise<IndexLoad> {
  const out: IndexLoad = { he: false, el: false, notes: [] };
  try { installHebrewIndex((await src.fetchJson('lexicon/he/biblical-index.json')) as HebrewFormIndex); out.he = true; } catch (e) { out.notes.push(`The full Biblical Hebrew index is not available (${e instanceof Error ? e.message : String(e)}): only the commonest Biblical words are read.`); }
  try { installGreekIndex((await src.fetchJson('lexicon/el/koine-index.json')) as GreekFormIndex); out.el = true; } catch (e) { out.notes.push(`The full Koine index is not available (${e instanceof Error ? e.message : String(e)}): only the commonest New Testament words are read.`); }
  return out;
}
