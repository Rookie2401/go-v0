/**
 * Scripture references from documented page facts only: the URL of a BibleGateway or YouVersion page, and a verse
 * wrapper's `data-usfm` attribute. A reference is METADATA (translation, book, chapter, verse); the verse text is never
 * read into it, never part of it, and the page title (which may quote a verse) is never used for it.
 *
 *   BibleGateway   `/passage/?search=John+3:16&version=NIV`       (also `?search=1+John+4:7-8`, `?search=Psalm+23`)
 *   YouVersion     `/bible/<versionId>/<BOOK>.<chapter>.<verse>.<ABBR>`   (optional locale first: `/es/bible/...`)
 *
 * `book` is a USFM code (`JHN`), so the same book from two sites compares equal.
 */
import type { ScriptureSourceReference } from '../contract/readerAdapter';
import { primaryLanguage } from './languageMeta';

/** USFM code -> the names and abbreviations sites use (compared lower case with spaces, dots and apostrophes removed). */
const BOOKS = `GEN:genesis,gen,ge,gn|EXO:exodus,exod,exo,ex|LEV:leviticus,lev,le,lv|NUM:numbers,num,nu,nm,nb|DEU:deuteronomy,deut,deu,dt,de|JOS:joshua,josh,jos|JDG:judges,judg,jdg,jg|RUT:ruth,rut,ru|1SA:1samuel,1sam,1sa,1s|2SA:2samuel,2sam,2sa,2s|1KI:1kings,1kgs,1ki,1k|2KI:2kings,2kgs,2ki,2k|1CH:1chronicles,1chron,1chr,1ch|2CH:2chronicles,2chron,2chr,2ch|EZR:ezra,ezr|NEH:nehemiah,neh,ne|EST:esther,esth,est|JOB:job,jb|PSA:psalms,psalm,ps,psa,pss|PRO:proverbs,prov,pro,prv,pr|ECC:ecclesiastes,eccles,eccl,ecc,ec,qoh|SNG:songofsolomon,songofsongs,song,sos,sng,cant|ISA:isaiah,isa,is|JER:jeremiah,jer,je|LAM:lamentations,lam,la|EZK:ezekiel,ezek,eze,ezk|DAN:daniel,dan,da,dn|HOS:hosea,hos,ho|JOL:joel,joe,jl|AMO:amos,amo,am|OBA:obadiah,obad,oba,ob|JON:jonah,jon,jnh|MIC:micah,mic,mi|NAM:nahum,nah,na|HAB:habakkuk,hab,hb|ZEP:zephaniah,zeph,zep,zp|HAG:haggai,hag,hg|ZEC:zechariah,zech,zec,zc|MAL:malachi,mal,ml|MAT:matthew,matt,mat,mt|MRK:mark,mrk,mk,mr|LUK:luke,luk,lk|JHN:john,jhn,jn|ACT:acts,act,ac|ROM:romans,rom,ro,rm|1CO:1corinthians,1cor,1co|2CO:2corinthians,2cor,2co|GAL:galatians,gal,ga|EPH:ephesians,eph|PHP:philippians,phil,php,pp|COL:colossians,col|1TH:1thessalonians,1thess,1th|2TH:2thessalonians,2thess,2th|1TI:1timothy,1tim,1ti|2TI:2timothy,2tim,2ti|TIT:titus,tit|PHM:philemon,philem,phm,pm|HEB:hebrews,heb|JAS:james,jas,jm|1PE:1peter,1pet,1pe,1pt|2PE:2peter,2pet,2pe,2pt|1JN:1john,1jn,1jo|2JN:2john,2jn,2jo|3JN:3john,3jn,3jo|JUD:jude,jud|REV:revelation,rev,re,rv`;

const BOOK_BY_NAME = new Map<string, string>();
const USFM_CODES = new Set<string>();
for (const entry of BOOKS.split('|')) {
  const [code, names] = entry.split(':');
  USFM_CODES.add(code);
  BOOK_BY_NAME.set(code.toLowerCase(), code);
  for (const n of names.split(',')) BOOK_BY_NAME.set(n, code);
}

const ROMAN: Record<string, string> = { i: '1', ii: '2', iii: '3' };

/** `John`, `1 John`, `I John`, `Song of Solomon`, `Ps`, `JHN` -> a USFM code, or undefined for a name no table knows. */
export function usfmBook(raw: string): string | undefined {
  const compact = raw.toLowerCase().replace(/[\s.'’+_-]+/g, '');
  const roman = /^(iii|ii|i)(.+)$/.exec(compact);
  return BOOK_BY_NAME.get(compact) ?? (roman ? BOOK_BY_NAME.get(ROMAN[roman[1]] + roman[2]) : undefined);
}

/**
 * Languages of well-known translation codes (a hint for the language resolver, from the site's own version code; the
 * reader never inspects the verse text). Codes not listed give no hint.
 */
const VERSION_LANGUAGE: Record<string, string> = {
  NIV: 'en', ESV: 'en', KJV: 'en', NKJV: 'en', NASB: 'en', NASB1995: 'en', NLT: 'en', CSB: 'en', NRSV: 'en', RSV: 'en', ASV: 'en', WEB: 'en', AMP: 'en', MSG: 'en', NET: 'en', NIRV: 'en',
  RVR1960: 'es', RVR1995: 'es', NVI: 'es', LBLA: 'es', NTV: 'es', DHH: 'es',
  LUTH1545: 'de', SCH2000: 'de', LSG: 'fr', NR2006: 'it', VULGATE: 'la',
};
export const versionLanguage = (translationId: string): string | undefined => VERSION_LANGUAGE[translationId.toUpperCase()];

const positive = (s: string | undefined): number | undefined => {
  if (!s || !/^\d{1,3}$/.test(s)) return undefined;
  const n = parseInt(s, 10);
  return n > 0 ? n : undefined;
};

const finish = (translationId: string | undefined, book: string, chapter: number, verse: number | undefined, localeHint?: string): ScriptureSourceReference => {
  const t = (translationId ?? '').trim().slice(0, 24).replace(/[^A-Za-z0-9._-]/g, '') || 'unknown';
  const hint = versionLanguage(t) ?? primaryLanguage(localeHint);
  return { kind: 'scripture', translationId: t, book, chapter, ...(verse !== undefined ? { verse } : {}), ...(hint ? { languageHint: hint } : {}) };
};

/** BibleGateway: the first passage of `search` and the first of `version` (`NIV` or `NIV;ESV`). */
export function parseBibleGateway(url: URL): ScriptureSourceReference | undefined {
  const search = url.searchParams.get('search');
  if (!search) return undefined;
  const first = search.split(';')[0];
  const m = /^\s*((?:[1-3]|i{1,3})\s*)?([A-Za-z][A-Za-z .]*?)\s*(\d{1,3})(?:\s*[:.]\s*(\d{1,3}))?/.exec(first);
  if (!m) return undefined;
  const book = usfmBook((m[1] ?? '') + m[2]);
  const chapter = positive(m[3]);
  if (!book || chapter === undefined) return undefined;
  const version = (url.searchParams.get('version') ?? '').split(/[;,]/)[0].trim();
  return finish(version, book, chapter, positive(m[4]));
}

/** `JHN.3.16`, `JHN.3.16+JHN.3.17`, `JHN.3` -> book, chapter, verse (the first verse of a list or range). */
export function parseUsfmRef(raw: string): { book: string; chapter: number; verse?: number } | undefined {
  const first = raw.trim().split(/[+,\s]/)[0];
  const parts = first.split('.');
  const book = parts[0].toUpperCase();
  const chapter = positive(parts[1]);
  if (!USFM_CODES.has(book) || chapter === undefined) return undefined;
  const verse = positive(parts[2]?.split(/[-,]/)[0]);
  return { book, chapter, ...(verse !== undefined ? { verse } : {}) };
}

/** YouVersion: `/[locale/]bible/<versionId>/<BOOK>.<chapter>[.<verse>][.<ABBR>]`. */
export function parseYouVersion(url: URL): ScriptureSourceReference | undefined {
  const m = /^\/(?:([a-z]{2,3}(?:-[A-Za-z]{2,4})?)\/)?bible\/(\d{1,6})\/([^/]+?)\/?$/.exec(url.pathname);
  if (!m) return undefined;
  const segs = m[3].split('.');
  const abbrev = segs.length > 2 && /^[A-Za-z][A-Za-z0-9]{1,15}$/.test(segs[segs.length - 1]) ? segs[segs.length - 1] : undefined;
  const ref = parseUsfmRef(abbrev ? segs.slice(0, -1).join('.') : m[3]);
  if (!ref) return undefined;
  return finish(abbrev ?? m[2], ref.book, ref.chapter, ref.verse, m[1]);
}

/** The locale a YouVersion path carries (`/es/bible/...` -> `es`), as URL language evidence. */
export function youVersionLocale(url: URL): string | undefined {
  const m = /^\/([a-z]{2,3}(?:-[A-Za-z]{2,4})?)\/bible\//.exec(url.pathname);
  return primaryLanguage(m?.[1]);
}

export function parseScriptureUrl(site: 'biblegateway' | 'youversion', href: string): ScriptureSourceReference | undefined {
  let url: URL;
  try { url = new URL(href); } catch { return undefined; }
  return site === 'biblegateway' ? parseBibleGateway(url) : parseYouVersion(url);
}
