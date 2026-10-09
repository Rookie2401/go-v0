/**
 * The language a page DECLARES, read from metadata only: the nearest `lang` attribute above the selection, `html[lang]`,
 * `meta[name=language]` / `http-equiv=content-language`, `meta[property=og:locale]`. No page text is read or guessed
 * from: this is evidence for the language resolver (contract/language.ts), which decides.
 */
import type { AdapterLanguageEvidence } from '../contract/language';

export type DocumentLanguage = NonNullable<AdapterLanguageEvidence['documentLanguage']>;

const UNDETERMINED = new Set(['und', 'mul', 'zxx', 'mis', 'x', 'xx']);
const LEGACY: Record<string, string> = { iw: 'he', in: 'id', ji: 'yi' };

/** `en-US`, `th_TH`, `HI` -> the primary subtag, lower case (`en`, `th`, `hi`); undefined for a tag that names no language. */
export function primaryLanguage(tag: string | null | undefined): string | undefined {
  if (!tag) return undefined;
  const primary = tag.trim().toLowerCase().replace(/_/g, '-').split('-')[0];
  if (!/^[a-z]{2,3}$/.test(primary) || UNDETERMINED.has(primary)) return undefined;
  return LEGACY[primary] ?? primary;
}

/**
 * The declared tag with its region kept, normalised (`es-hn` -> `es-HN`, `th_TH` -> `th-TH`), so the language resolver can set a variety;
 * undefined when the tag is only a language (the primary language is already the evidence) or names no language.
 */
export function regionTag(tag: string | null | undefined): string | undefined {
  const primary = primaryLanguage(tag);
  if (!primary || !tag) return undefined;
  const rest = tag.trim().replace(/_/g, '-').split('-').slice(1).filter(Boolean);
  if (!rest.length) return undefined;
  const norm = rest.map((p) => (/^[A-Za-z]{4}$/.test(p) ? p[0].toUpperCase() + p.slice(1).toLowerCase() : /^([A-Za-z]{2}|d{3})$/.test(p) ? p.toUpperCase() : p.toLowerCase()));
  return [primary, ...norm].join('-');
}

const withTag = (d: DocumentLanguage, raw: string | null | undefined): DocumentLanguage => {
  const tag = regionTag(raw);
  return tag ? { ...d, tag } : d;
};

const CONFIDENCE = { 'element-lang': 0.9, 'html-lang': 0.8, meta: 0.6, 'og-locale': 0.55, url: 0.5 } as const;

/**
 * The best declared language, nearest first: a `lang` attribute on the selection's own block or an ancestor
 * (`element-lang`), `html[lang]` (`html-lang`), a language meta tag (`meta`), `og:locale` (`og-locale`), then `urlHint`
 * (a locale that the site's own URL carries; the caller says where it came from).
 */
export function documentLanguageOf(doc: Document, from: Element | null, urlHint?: string): DocumentLanguage | undefined {
  const root = doc.documentElement;
  for (let el: Element | null = from; el; el = el.parentElement) {
    if (!el.hasAttribute('lang')) continue;
    const id = primaryLanguage(el.getAttribute('lang'));
    if (id) return withTag({ languageId: id, source: el === root ? 'html-lang' : 'element-lang', confidence: CONFIDENCE[el === root ? 'html-lang' : 'element-lang'] }, el.getAttribute('lang'));
  }
  const htmlLang = primaryLanguage(root?.getAttribute('lang'));
  if (htmlLang) return withTag({ languageId: htmlLang, source: 'html-lang', confidence: CONFIDENCE['html-lang'] }, root?.getAttribute('lang'));
  const metaRaw = doc.querySelector('meta[name="language" i], meta[http-equiv="content-language" i]')?.getAttribute('content');
  const metaLang = primaryLanguage(metaRaw);
  if (metaLang) return withTag({ languageId: metaLang, source: 'meta', confidence: CONFIDENCE.meta }, metaRaw);
  const ogRaw = doc.querySelector('meta[property="og:locale"]')?.getAttribute('content');
  const og = primaryLanguage(ogRaw);
  if (og) return withTag({ languageId: og, source: 'og-locale', confidence: CONFIDENCE['og-locale'] }, ogRaw);
  const hint = primaryLanguage(urlHint);
  if (hint) return withTag({ languageId: hint, source: 'url', confidence: CONFIDENCE.url }, urlHint);
  return undefined;
}
