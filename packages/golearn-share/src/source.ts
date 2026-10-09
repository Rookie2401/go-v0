import type { SourceRef } from '../../repository-contract/src';
import type { SharedPassage } from './mechanism';
import { cleanText } from './text';

const MAX_TITLE = 120;
const MAX_LOCATOR = 200;

/** The URL's path, or its host when it has none. Never the query, the fragment, credentials or a port. */
export function urlLocator(raw: string | undefined): string | undefined {
  if (!raw) return undefined;
  let u: URL;
  try { u = new URL(raw.trim()); } catch { return undefined; }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return undefined;
  const path = u.pathname && u.pathname !== '/' ? u.pathname : u.hostname;
  return path.slice(0, MAX_LOCATOR) || undefined;
}

/** A title is kept only when it is a title: not empty, and not the shared text (some senders put the quotation in the subject). */
function titleOf(p: Pick<SharedPassage, 'title' | 'text'>): string | undefined {
  if (!p.title) return undefined;
  const t = cleanText(p.title).text;
  if (!t) return undefined;
  const text = typeof p.text === 'string' ? cleanText(p.text).text : '';
  if (text && (text.includes(t) || t.includes(text))) return undefined;
  return t.slice(0, MAX_TITLE);
}

const appOf = (p: Pick<SharedPassage, 'sourceApp'>): string | undefined => {
  const a = p.sourceApp ? cleanText(p.sourceApp).text.slice(0, 100) : '';
  return a || undefined;
};

/**
 * Where a share came from, built from the link, the title and the sending app only — never from the text. A link makes it a
 * web source (path only); otherwise a named app or a title makes it a reading-app source (`ebook`, unverified: the platform
 * does not say what kind of app it is); with none of the three there is no source.
 */
export function sharedSourceRef(p: Pick<SharedPassage, 'url' | 'title' | 'sourceApp' | 'text'>): SourceRef | undefined {
  const title = titleOf(p);
  const locator = urlLocator(p.url);
  if (locator) return { kind: 'web', ...(title ? { title } : {}), locator };
  const app = appOf(p);
  if (app || title) return { kind: 'ebook', ...(title ? { title } : {}), ...(app ? { locator: `app:${app}` } : {}) };
  return undefined;
}
