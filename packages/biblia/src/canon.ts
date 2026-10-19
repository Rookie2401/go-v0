/**
 * The canon as the Biblia app organises it: 39 books of the Tanakh in Masoretic order (Torah, Neviʾim, Ketuvim), then the 27 of the Greek
 * New Testament (Gospels, Acts, Paul, General letters, Revelation). Names, sections and verse counts come from public/data/canon.json, copied
 * from the Biblia app's build (it derives them from the text files themselves). Chapter numbers are shown in the text's own numerals.
 */
export type BibliaLang = 'he' | 'el';

export interface BookInfo {
  id: string;
  lang: BibliaLang;
  en: string;
  native: string;
  section: string;
  /** verses per chapter */
  verses: number[];
}

export interface Division { id: string; title: string; native: string; sections: string[] }
export interface Testament { id: string; title: string; native: string; lang: BibliaLang; divisions: Division[] }

/** Tanakh in Masoretic order; the New Testament as narrative books and letters (Revelation, addressed to the seven churches, sits with the letters). */
export const TREE: Testament[] = [
  {
    id: 'tanakh', title: 'Tanakh', native: 'תַּנַ״ךְ', lang: 'he',
    divisions: [
      { id: 'Torah', title: 'Torah', native: 'תּוֹרָה', sections: ['Torah'] },
      { id: 'Neviim', title: 'Neviʾim · Prophets', native: 'נְבִיאִים', sections: ['Neviim'] },
      { id: 'Ketuvim', title: 'Ketuvim · Writings', native: 'כְּתוּבִים', sections: ['Ketuvim'] },
    ],
  },
  {
    id: 'nt', title: 'New Testament', native: 'Ἡ Καινὴ Διαθήκη', lang: 'el',
    divisions: [
      { id: 'Histories', title: 'Histories', native: 'Εὐαγγέλια · Πράξεις', sections: ['Gospels', 'Acts'] },
      { id: 'Epistles', title: 'Epistles', native: 'Ἐπιστολαί · Ἀποκάλυψις', sections: ['Paul', 'General', 'Revelation'] },
    ],
  },
];

export class Canon {
  private readonly byId: Map<string, BookInfo>;
  constructor(readonly books: BookInfo[]) { this.byId = new Map(books.map((b) => [b.id, b])); }
  book(id: string): BookInfo | undefined { return this.byId.get(id); }
  booksOf(d: Division): BookInfo[] { return d.sections.flatMap((s) => this.books.filter((b) => b.section === s)); }
  validRef(id: string, ch: number): boolean { const b = this.byId.get(id); return !!b && Number.isInteger(ch) && ch >= 1 && ch <= b.verses.length; }
  /** The chapter before / after, crossing into the neighbouring book of the canon; undefined at the ends. */
  adjacent(id: string, ch: number, dir: -1 | 1): { book: string; ch: number } | undefined {
    const b = this.byId.get(id);
    if (!b) return undefined;
    const next = ch + dir;
    if (next >= 1 && next <= b.verses.length) return { book: id, ch: next };
    const i = this.books.indexOf(b) + dir;
    const nb = this.books[i];
    if (!nb) return undefined;
    return { book: nb.id, ch: dir > 0 ? 1 : nb.verses.length };
  }
  refLabel(id: string, ch: number): string { const b = this.byId.get(id); return b ? `${b.en} ${ch}` : `${id} ${ch}`; }
}

export function parseCanon(json: unknown): Canon {
  if (!Array.isArray(json)) throw new Error('canon.json is not a list');
  const books: BookInfo[] = json.map((b) => {
    if (typeof b !== 'object' || b === null) throw new Error('bad canon row');
    const r = b as Record<string, unknown>;
    const lang = r.lang === 'he' || r.lang === 'el' ? r.lang : r.lang === 'gr' ? 'el' : undefined;
    if (!lang || typeof r.id !== 'string' || typeof r.en !== 'string' || typeof r.native !== 'string' || typeof r.section !== 'string' || !Array.isArray(r.verses)) throw new Error(`bad canon row ${String(r.id)}`);
    return { id: r.id, lang, en: r.en, native: r.native, section: r.section, verses: r.verses.map(Number) };
  });
  return new Canon(books);
}

// ───────────────────────────── numerals ─────────────────────────────

const HE_UNITS = ['', 'א', 'ב', 'ג', 'ד', 'ה', 'ו', 'ז', 'ח', 'ט'];
const HE_TENS = ['', 'י', 'כ', 'ל', 'מ', 'נ', 'ס', 'ע', 'פ', 'צ'];
const HE_HUNDREDS = ['', 'ק', 'ר', 'ש', 'ת'];
/** Hebrew numeral (gematria) for 1–999, with gershayim before the last letter (״) or a geresh after a single letter (׳); 15 and 16 as ט״ו / ט״ז. */
export function hebrewNumeral(n: number): string {
  if (!Number.isInteger(n) || n < 1 || n > 999) return String(n);
  let s = '';
  let r = n;
  while (r >= 400) { s += 'ת'; r -= 400; }
  if (r >= 100) { s += HE_HUNDREDS[Math.floor(r / 100)]; r %= 100; }
  if (r === 15) s += 'טו';
  else if (r === 16) s += 'טז';
  else { s += HE_TENS[Math.floor(r / 10)] + HE_UNITS[r % 10]; }
  return s.length === 1 ? `${s}׳` : `${s.slice(0, -1)}״${s.slice(-1)}`;
}

const EL_UNITS = ['', 'α', 'β', 'γ', 'δ', 'ε', 'ϛ', 'ζ', 'η', 'θ'];
const EL_TENS = ['', 'ι', 'κ', 'λ', 'μ', 'ν', 'ξ', 'ο', 'π', 'ϟ'];
const EL_HUNDREDS = ['', 'ρ', 'σ', 'τ', 'υ', 'φ', 'χ', 'ψ', 'ω', 'ϡ'];
/** Greek (Milesian) numeral for 1–999 with the keraia (ʹ). */
export function greekNumeral(n: number): string {
  if (!Number.isInteger(n) || n < 1 || n > 999) return String(n);
  return `${EL_HUNDREDS[Math.floor(n / 100)]}${EL_TENS[Math.floor((n % 100) / 10)]}${EL_UNITS[n % 10]}ʹ`;
}

export const numeral = (lang: BibliaLang, n: number): string => (lang === 'he' ? hebrewNumeral(n) : greekNumeral(n));
