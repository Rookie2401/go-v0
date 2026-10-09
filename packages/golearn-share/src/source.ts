import { UNKNOWN_RESTRICTIONS, type ShareSourceRef } from '../../repository-contract/src';
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
 * Where a share came from (contract v3 `share` source): the mechanism it arrived by, the sending app and the title when there are
 * any, and the link's path (never the query, the fragment or the text). The mechanism is always known, so a share always has a
 * source. Its `restrictions` are all `unknown`: nobody reviewed the terms of whatever the sender copied from, and a sender cannot
 * grant a permission by what it sends.
 */
export function sharedSourceRef(p: Pick<SharedPassage, 'mechanism' | 'url' | 'title' | 'sourceApp' | 'text'>): ShareSourceRef {
  const title = titleOf(p);
  const locator = urlLocator(p.url);
  const app = appOf(p);
  return {
    kind: 'share', mechanism: p.mechanism,
    ...(app ? { sourceApp: app } : {}), ...(title ? { title } : {}), ...(locator ? { locator } : {}),
    restrictions: { ...UNKNOWN_RESTRICTIONS },
  };
}
