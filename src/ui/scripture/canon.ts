/**
 * The Scripture page's canon tree, in the shape of Biblia's Home: testament → division → book. The 66-book Protestant
 * canon in the order and with the chapter counts of src/library/canon.ts (CANON), which stays the one source of both.
 *
 * NATIVE BOOK NAMES come from each edition's own headings, read from the USFM files on disk (data/sources), not from a
 * course list and not from memory:
 *   - Spanish (es): Reina-Valera 1909, the `\h` running header of data/sources/es-bible/usfm (equal to `\toc2`).
 *     RV1909's own headings are kept as they are, including "San Mateo" and "San Lucas".
 *   - German (de): Luther 1912, the `\h` running header of data/sources/de-bible/usfm (equal to `\toc2`).
 *     One typo in the source heading is corrected here: 1 Chronicles reads "1. Chonik" in the file, "1. Chronik" below.
 *   - Hindi (hi): the Indian Revised Version's own `\h` headers (eBible hin2017), as extracted into
 *     data/review/library-audit/hi-book-names-irv.json. They are the edition's names, not a course list.
 *   - Thai (th): Biblica Open Thai Common Version 2025, the `\h` header of data/sources/th/usfm-full/release/USX_1.
 *     Three source headings are normalised: zero-width spaces (U+200B, line-break hints) are removed, "2ซามูเอล" gets its
 *     space ("2 ซามูเอล"), and 2 John, which the file abbreviates as "2 ยน.", is written out as "2 ยอห์น".
 * Nothing was drafted from memory except the testament and division TITLES below (and the English names), which are MACHINE-DRAFTED
 * and NOT REVIEWED BY A NATIVE SPEAKER. The UI therefore always keeps the English name beside the native one, so a wrong
 * native name stays visible.
 */
import { CANON } from '../../library/canon';

export type ScriptureLang = 'es' | 'th' | 'hi' | 'de';
export const SCRIPTURE_LANGS: readonly ScriptureLang[] = ['es', 'th', 'hi', 'de'];

/** Per book: [USFM code, English, Spanish, German, Hindi, Thai], in canon order. */
const NAMES: ReadonlyArray<readonly [string, string, string, string, string, string]> = [
  ['GEN', 'Genesis', 'Génesis', '1. Mose', 'उत्पत्ति', 'ปฐมกาล'],
  ['EXO', 'Exodus', 'Éxodo', '2. Mose', 'निर्गमन', 'อพยพ'],
  ['LEV', 'Leviticus', 'Levítico', '3. Mose', 'लैव्यव्यवस्था', 'เลวีนิติ'],
  ['NUM', 'Numbers', 'Números', '4. Mose', 'गिनती', 'กันดารวิถี'],
  ['DEU', 'Deuteronomy', 'Deuteronomio', '5. Mose', 'व्यवस्थाविवरण', 'เฉลยธรรมบัญญัติ'],
  ['JOS', 'Joshua', 'Josué', 'Josua', 'यहोशू', 'โยชูวา'],
  ['JDG', 'Judges', 'Jueces', 'Richter', 'न्यायियों', 'ผู้วินิจฉัย'],
  ['RUT', 'Ruth', 'Rut', 'Ruth', 'रूत', 'นางรูธ'],
  ['1SA', '1 Samuel', '1 Samuel', '1. Samuel', '1 शमूएल', '1 ซามูเอล'],
  ['2SA', '2 Samuel', '2 Samuel', '2. Samuel', '2 शमूएल', '2 ซามูเอล'],
  ['1KI', '1 Kings', '1 Reyes', '1. Könige', '1 राजाओं', '1 พงศ์กษัตริย์'],
  ['2KI', '2 Kings', '2 Reyes', '2. Könige', '2 राजाओं', '2 พงศ์กษัตริย์'],
  ['1CH', '1 Chronicles', '1 Crónicas', '1. Chronik', '1 इतिहास', '1 พงศาวดาร'],
  ['2CH', '2 Chronicles', '2 Crónicas', '2. Chronik', '2 इतिहास', '2 พงศาวดาร'],
  ['EZR', 'Ezra', 'Esdras', 'Esra', 'एज्रा', 'เอสรา'],
  ['NEH', 'Nehemiah', 'Nehemías', 'Nehemia', 'नहेम्याह', 'เนหะมีย์'],
  ['EST', 'Esther', 'Ester', 'Esther', 'एस्तेर', 'เอสเธอร์'],
  ['JOB', 'Job', 'Job', 'Hiob', 'अय्यूब', 'โยบ'],
  ['PSA', 'Psalms', 'Salmos', 'Psalmen', 'भजन संहिता', 'สดุดี'],
  ['PRO', 'Proverbs', 'Proverbios', 'Sprüche', 'नीतिवचन', 'สุภาษิต'],
  ['ECC', 'Ecclesiastes', 'Eclesiastés', 'Prediger', 'सभोपदेशक', 'ปัญญาจารย์'],
  ['SNG', 'Song of Songs', 'Cantar de los Cantares', 'Hohelied', 'श्रेष्ठगीत', 'เพลงโซโลมอน'],
  ['ISA', 'Isaiah', 'Isaías', 'Jesaja', 'यशायाह', 'อิสยาห์'],
  ['JER', 'Jeremiah', 'Jeremías', 'Jeremia', 'यिर्मयाह', 'เยเรมีย์'],
  ['LAM', 'Lamentations', 'Lamentaciones', 'Klagelieder', 'विलापगीत', 'เพลงคร่ำครวญ'],
  ['EZK', 'Ezekiel', 'Ezequiel', 'Hesekiel', 'यहेजकेल', 'เอเสเคียล'],
  ['DAN', 'Daniel', 'Daniel', 'Daniel', 'दानिय्येल', 'ดาเนียล'],
  ['HOS', 'Hosea', 'Oseas', 'Hosea', 'होशे', 'โฮเชยา'],
  ['JOL', 'Joel', 'Joel', 'Joel', 'योएल', 'โยเอล'],
  ['AMO', 'Amos', 'Amós', 'Amos', 'आमोस', 'อาโมส'],
  ['OBA', 'Obadiah', 'Abdías', 'Obadja', 'ओबद्याह', 'โอบาดีห์'],
  ['JON', 'Jonah', 'Jonás', 'Jona', 'योना', 'โยนาห์'],
  ['MIC', 'Micah', 'Miqueas', 'Micha', 'मीका', 'มีคาห์'],
  ['NAM', 'Nahum', 'Nahum', 'Nahum', 'नहूम', 'นาฮูม'],
  ['HAB', 'Habakkuk', 'Habacuc', 'Habakuk', 'हबक्कूक', 'ฮาบากุก'],
  ['ZEP', 'Zephaniah', 'Sofonías', 'Zephanja', 'सपन्याह', 'เศฟันยาห์'],
  ['HAG', 'Haggai', 'Hageo', 'Haggai', 'हाग्गै', 'ฮักกัย'],
  ['ZEC', 'Zechariah', 'Zacarías', 'Sacharja', 'जकर्याह', 'เศคาริยาห์'],
  ['MAL', 'Malachi', 'Malaquías', 'Maleachi', 'मलाकी', 'มาลาคี'],
  ['MAT', 'Matthew', 'San Mateo', 'Matthäus', 'मत्ती', 'มัทธิว'],
  ['MRK', 'Mark', 'Marcos', 'Markus', 'मरकुस', 'มาระโก'],
  ['LUK', 'Luke', 'San Lucas', 'Lukas', 'लूका', 'ลูกา'],
  ['JHN', 'John', 'Juan', 'Johannes', 'यूहन्ना', 'ยอห์น'],
  ['ACT', 'Acts', 'Hechos', 'Apostelgeschichte', 'प्रेरितों के काम', 'กิจการของอัครทูต'],
  ['ROM', 'Romans', 'Romanos', 'Römer', 'रोमियों', 'โรม'],
  ['1CO', '1 Corinthians', '1 Corintios', '1. Korinther', '1 कुरिन्थियों', '1 โครินธ์'],
  ['2CO', '2 Corinthians', '2 Corintios', '2. Korinther', '2 कुरिन्थियों', '2 โครินธ์'],
  ['GAL', 'Galatians', 'Gálatas', 'Galater', 'गलातियों', 'กาลาเทีย'],
  ['EPH', 'Ephesians', 'Efesios', 'Epheser', 'इफिसियों', 'เอเฟซัส'],
  ['PHP', 'Philippians', 'Filipenses', 'Philipper', 'फिलिप्पियों', 'ฟีลิปปี'],
  ['COL', 'Colossians', 'Colosenses', 'Kolosser', 'कुलुस्सियों', 'โคโลสี'],
  ['1TH', '1 Thessalonians', '1 Tesalonicenses', '1. Thessalonicher', '1 थिस्सलुनीकियों', '1 เธสะโลนิกา'],
  ['2TH', '2 Thessalonians', '2 Tesalonicenses', '2. Thessalonicher', '2 थिस्सलुनीकियों', '2 เธสะโลนิกา'],
  ['1TI', '1 Timothy', '1 Timoteo', '1. Timotheus', '1 तीमुथियुस', '1 ทิโมธี'],
  ['2TI', '2 Timothy', '2 Timoteo', '2. Timotheus', '2 तीमुथियुस', '2 ทิโมธี'],
  ['TIT', 'Titus', 'Tito', 'Titus', 'तीतुस', 'ทิตัส'],
  ['PHM', 'Philemon', 'Filemón', 'Philemon', 'फिलेमोन', 'ฟีเลโมน'],
  ['HEB', 'Hebrews', 'Hebreos', 'Hebräer', 'इब्रानियों', 'ฮีบรู'],
  ['JAS', 'James', 'Santiago', 'Jakobus', 'याकूब', 'ยากอบ'],
  ['1PE', '1 Peter', '1 Pedro', '1. Petrus', '1 पतरस', '1 เปโตร'],
  ['2PE', '2 Peter', '2 Pedro', '2. Petrus', '2 पतरस', '2 เปโตร'],
  ['1JN', '1 John', '1 Juan', '1. Johannes', '1 यूहन्ना', '1 ยอห์น'],
  ['2JN', '2 John', '2 Juan', '2. Johannes', '2 यूहन्ना', '2 ยอห์น'],
  ['3JN', '3 John', '3 Juan', '3. Johannes', '3 यूहन्ना', '3 ยอห์น'],
  ['JUD', 'Jude', 'Judas', 'Judas', 'यहूदा', 'ยูดา'],
  ['REV', 'Revelation', 'Apocalipsis', 'Offenbarung', 'प्रकाशितवाक्य', 'วิวรณ์'],
];

const COLUMN: Record<ScriptureLang, 2 | 3 | 4 | 5> = { es: 2, de: 3, hi: 4, th: 5 };

/** Every book's names, keyed by USFM code. */
export const BOOK_NAMES: ReadonlyMap<string, Readonly<Record<'en' | ScriptureLang, string>>> = new Map(
  NAMES.map((r) => [r[0], { en: r[1], es: r[2], de: r[3], hi: r[4], th: r[5] }]),
);

export interface BookNode {
  /** USFM code (GEN, PSA, 1JN …) */
  code: string;
  /** English name */
  en: string;
  /** Name in the language, from that language's edition */
  native: string;
  /** Chapters the canon says the book has */
  chapters: number;
}
export interface DivisionNode {
  id: string;
  /** English title */
  title: string;
  native: string;
  books: BookNode[];
}
export interface TestamentNode {
  id: string;
  title: string;
  native: string;
  divisions: DivisionNode[];
}

/** Division and testament titles per language. MACHINE-DRAFTED, not reviewed by a native speaker. */
const TITLES: Record<string, Record<ScriptureLang, string>> = {
  OT: { es: 'Antiguo Testamento', de: 'Altes Testament', hi: 'पुराना नियम', th: 'พันธสัญญาเดิม' },
  NT: { es: 'Nuevo Testamento', de: 'Neues Testament', hi: 'नया नियम', th: 'พันธสัญญาใหม่' },
  law: { es: 'La Ley', de: 'Das Gesetz', hi: 'व्यवस्था', th: 'ธรรมบัญญัติ' },
  history: { es: 'Libros históricos', de: 'Geschichtsbücher', hi: 'इतिहास की पुस्तकें', th: 'หนังสือประวัติศาสตร์' },
  poetry: { es: 'Poesía y sabiduría', de: 'Poesie und Weisheit', hi: 'काव्य और बुद्धि', th: 'กวีนิพนธ์และปัญญา' },
  major: { es: 'Profetas mayores', de: 'Große Propheten', hi: 'बड़े भविष्यद्वक्ता', th: 'ผู้เผยพระวจนะใหญ่' },
  minor: { es: 'Profetas menores', de: 'Kleine Propheten', hi: 'छोटे भविष्यद्वक्ता', th: 'ผู้เผยพระวจนะเล็ก' },
  histories: { es: 'Evangelios y Hechos', de: 'Evangelien und Apostelgeschichte', hi: 'सुसमाचार और प्रेरितों के काम', th: 'พระกิตติคุณและกิจการ' },
  epistles: { es: 'Cartas y Apocalipsis', de: 'Briefe und Offenbarung', hi: 'पत्रियाँ और प्रकाशितवाक्य', th: 'จดหมายฝากและวิวรณ์' },
};

/** Biblia's shape: the Old Testament in five divisions, the New in two (Histories; Epistles, with Revelation among the letters). */
const SHAPE: ReadonlyArray<{ id: string; title: string; divisions: ReadonlyArray<{ id: string; title: string; count: number }> }> = [
  {
    id: 'OT', title: 'Old Testament',
    divisions: [
      { id: 'law', title: 'Pentateuch', count: 5 },
      { id: 'history', title: 'Historical books', count: 12 },
      { id: 'poetry', title: 'Poetry and wisdom', count: 5 },
      { id: 'major', title: 'Major prophets', count: 5 },
      { id: 'minor', title: 'Minor prophets', count: 12 },
    ],
  },
  {
    id: 'NT', title: 'New Testament',
    divisions: [
      { id: 'histories', title: 'Histories', count: 5 },
      { id: 'epistles', title: 'Epistles', count: 22 },
    ],
  },
];

/** The name of a book in a language, or the code itself for a code the canon does not have. */
export function bookName(lang: ScriptureLang, code: string): string {
  const row = NAMES.find((r) => r[0] === code);
  return row ? row[COLUMN[lang]] : code;
}

/** The English name of a book. */
export function bookNameEn(code: string): string {
  return BOOK_NAMES.get(code)?.en ?? code;
}

/** The whole canon as a tree with the language's native names. */
export function canonTree(lang: ScriptureLang): TestamentNode[] {
  let at = 0;
  return SHAPE.map((t) => ({
    id: t.id,
    title: t.title,
    native: TITLES[t.id][lang],
    divisions: t.divisions.map((d) => {
      const books = CANON.slice(at, at + d.count).map(([code, chapters]) => ({ code, en: bookNameEn(code), native: bookName(lang, code), chapters }));
      at += d.count;
      return { id: d.id, title: d.title, native: TITLES[d.id][lang], books };
    }),
  }));
}

/** Where a running canon number falls: Genesis 1 = 1 … Revelation 22 = 1189. */
export function placeOfRunning(n: number): { book: string; chapter: number } | undefined {
  if (!Number.isInteger(n) || n < 1) return undefined;
  let rest = n;
  for (const [book, chapters] of CANON) {
    if (rest <= chapters) return { book, chapter: rest };
    rest -= chapters;
  }
  return undefined;
}

export function isScriptureLang(lang: string): lang is ScriptureLang {
  return (SCRIPTURE_LANGS as readonly string[]).includes(lang);
}
