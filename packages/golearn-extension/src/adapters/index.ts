import type { PageDescriptor, ReaderAdapter } from '../contract/readerAdapter';
import { READER_REGISTRY } from './registry';
import { SiteAdapter } from './siteAdapter';
import { UnsupportedAdapter } from './unsupported';
import { WebGenericAdapter, type WebGenericOptions } from './webGeneric';

export { WebGenericAdapter, DEFAULT_DECLINED_HOSTS, type WebGenericOptions } from './webGeneric';
export { UnsupportedAdapter, UNSUPPORTED_MESSAGE } from './unsupported';
export { SiteAdapter, type SiteAdapterOptions } from './siteAdapter';
export {
  READER_REGISTRY, READER_STATUSES, FALLBACKS, FRAME_POLICIES, DEFAULT_ENTRY, REFUSING_STATUSES,
  registryEntry, entryMatches, entryRefuses, matchEntry, hostMatches, declinedHostsFromRegistry,
  type ReaderRegistryEntry, type ReaderStatus, type Fallback, type FramePolicy, type HostPattern, type SiteOptions, type TermsReview,
} from './registry';
export { parseScriptureUrl, parseBibleGateway, parseYouVersion, parseUsfmRef, usfmBook, versionLanguage } from './scripture';
export { documentLanguageOf, primaryLanguage } from './languageMeta';

export { describePage } from './page';

/** The first adapter that matches the page, else `unsupported`. Order matters: specific readers go before web-generic. */
export function chooseAdapter(page: PageDescriptor, candidates: ReaderAdapter[]): ReaderAdapter {
  for (const a of candidates) if (a.id !== 'unsupported' && a.matches(page)) return a;
  return candidates.find((a) => a.id === 'unsupported') ?? new UnsupportedAdapter();
}

/**
 * The adapters the content script uses, built from the registry: one site adapter per `site` entry (specific hosts), then
 * web-generic for every other ordinary page, then `unsupported` as the last resort.
 */
export function createAdapters(doc: Document, options: WebGenericOptions = {}): ReaderAdapter[] {
  const sites = READER_REGISTRY.filter((e) => e.adapter === 'site').map((entry) => new SiteAdapter({ ...options, doc, entry }));
  return [...sites, new WebGenericAdapter({ ...options, doc }), new UnsupportedAdapter()];
}
