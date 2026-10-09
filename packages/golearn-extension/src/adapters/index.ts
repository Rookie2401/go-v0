import type { PageDescriptor, ReaderAdapter } from '../contract/readerAdapter';
import { UnsupportedAdapter } from './unsupported';

export { WebGenericAdapter, DEFAULT_DECLINED_HOSTS, type WebGenericOptions } from './webGeneric';
export { UnsupportedAdapter, UNSUPPORTED_MESSAGE } from './unsupported';

export function describePage(doc: Document): PageDescriptor {
  const l = doc.defaultView?.location;
  return { href: l?.href ?? '', protocol: l?.protocol ?? '', host: l?.host ?? '', pathname: l?.pathname ?? '', title: doc.title, contentType: doc.contentType };
}

/** The first adapter that matches the page, else `unsupported`. Order matters: specific readers go before web-generic. */
export function chooseAdapter(page: PageDescriptor, candidates: ReaderAdapter[]): ReaderAdapter {
  for (const a of candidates) if (a.id !== 'unsupported' && a.matches(page)) return a;
  return candidates.find((a) => a.id === 'unsupported') ?? new UnsupportedAdapter();
}
