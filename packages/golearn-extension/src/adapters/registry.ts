/**
 * The reader registry: ONE entry per reading environment, as data. It says which hosts an adapter answers for, what the
 * adapter will declare, how far it has been verified, whether a person has reviewed the environment's terms, and what the
 * learner is offered when the adapter cannot read. The content script builds its adapters from this list; the decline
 * list that used to be a literal in `webGeneric.ts` is derived from it.
 *
 * Rules (docs/ecosystem/reader/ADAPTER-REGISTRY.md):
 *  - `status` and `termsReview` change only with evidence (a measured session, a test) or a person's review. Every new
 *    site entry starts `unverified`; `termsReview.reviewed` is the literal `false` and cannot be set to `true` here.
 *  - An entry whose status is `blocked`, `permission-required` or `unsupported`, or whose `enabled` is false, REFUSES: its
 *    adapter reads nothing and says why (`refusal`). It is never "just tried".
 *  - Host patterns are exact hosts, `*.example.com` (any subdomain), and `*.name.*` (a label in the middle with a TLD
 *    after it), each optionally limited to a path prefix. Matching uses the host and path only, never the content.
 *  - No URL appears in this file (the content bundle is checked for hard-wired addresses).
 *  - `restrictions` says what the environment's terms allow (text retention, remote processing, audio retention, export,
 *    sharing, review examples). It is trusted configuration: the site adapter copies it onto every source reference from
 *    the ENTRY, never from the page's own metadata, and the registry is deeply frozen, so neither a page nor a fixture
 *    address can change an entry's `enabled`, `status`, `termsReview` or `restrictions`.
 */
import { noCapabilities, type ReaderCapabilities } from '../contract/readerCapabilities';
import type { PageDescriptor, Permission, SourceRestrictions } from '../contract/readerAdapter';

export const READER_STATUSES = ['verified', 'partially-verified', 'selection-only', 'unverified', 'permission-required', 'blocked', 'unsupported'] as const;
export type ReaderStatus = (typeof READER_STATUSES)[number];

export const FALLBACKS = ['selection-only', 'controlled-reader', 'share-bridge', 'none'] as const;
export type Fallback = (typeof FALLBACKS)[number];

export const FRAME_POLICIES = ['top-only', 'same-origin-frames', 'declare-cross-origin'] as const;
export type FramePolicy = (typeof FRAME_POLICIES)[number];

/** A host (exact, `*.suffix`, or `*.name.*`) and an optional path prefix (`/books/reader` matches `/books/reader/x`). */
export interface HostPattern { host: string; pathPrefix?: string }

/** Whether a person has reviewed the environment's terms. The type admits only `false`: only a person's review, recorded in a reviewed commit, may change this. */
export interface TermsReview { reviewed: false; note: string; url?: string }

export interface SiteOptions {
  /** Selectors of the reading area. A selection must start and end inside one; `[]` accepts any text outside `ignore`. */
  containers: string[];
  /** Selectors of reader chrome, menus, footnote markers and the site's own lookup popup: never read, and a selection that starts or ends in one is refused. */
  ignore: string[];
  frames: FramePolicy;
  /** Chapters are loaded or replaced by script: the live range is re-checked on every mutation and nothing is prefetched. */
  dynamicContent: boolean;
  /** How GoLearn lives beside the site's own dictionary or lookup. */
  nativeLookupCoexistence: string;
  /** A Scripture site whose source reference is parsed from the URL (and a verse wrapper), never from text. */
  scripture?: 'biblegateway' | 'youversion';
  /** The first path segment may be a locale (`/es/...`): a documented URL fact usable as language evidence. */
  pathLocale?: boolean;
  /** A query parameter of the site's own URL that names the story's language (`langName=en`): a documented URL fact usable as language evidence. */
  urlLanguageParam?: string;
}

export interface ReaderRegistryEntry {
  readerId: string;
  title: string;
  /** `web-generic` is the default for ordinary pages; `site` is the configurable adapter; `controlled` lives in another package. */
  adapter: 'web-generic' | 'site' | 'controlled';
  hosts: HostPattern[];
  status: ReaderStatus;
  /** False = the adapter refuses and says `refusal`. */
  enabled: boolean;
  experimental?: boolean;
  termsReview: TermsReview;
  /** What the adapter reports from `capabilities()` when it can read (it narrows this per selection, never widens it). */
  capabilities: ReaderCapabilities;
  fallback: Fallback;
  /** What the environment's terms allow. Conservative: `unknown` where nobody has reviewed the terms (consumers treat it as `forbidden`). */
  restrictions: SourceRestrictions;
  notes: string;
  /** The one line shown when the adapter refuses; required for every refusing entry. */
  refusal?: string;
  site?: SiteOptions;
}

// ───────────────────────────── declarations ─────────────────────────────

const WEB_RESTRICTION = 'Visible text of the top document and same-origin frames only; form fields, editable regions and cross-origin frames are not read.';

function readable(readerId: string, platform: string, restriction: string, over: Partial<ReaderCapabilities> = {}): ReaderCapabilities {
  return {
    readerId, platform,
    userTriggeredSelection: true, wordSelection: true, selectedTextAvailable: true,
    sentenceContext: 'full', adjacentContext: true,
    stableAnchors: { kind: 'dom-range', note: 'A live Range; valid only until the page re-renders. No persistent anchor is stored.' },
    popupPositioning: 'range-rect', layoutChangeHandling: 'observer', persistentAnnotation: { supported: false }, offline: true,
    contentAccessRestrictions: restriction, contextConfidence: 0.9, requiredPermissions: ['activeTab'],
    ...over,
  };
}

const refused = (readerId: string, platform: string, why: string): ReaderCapabilities => ({ ...noCapabilities(readerId, why), platform });

const notReviewed = (note: string): TermsReview => ({ reviewed: false, note });
const UNREVIEWED = 'No review of this environment\'s terms has been recorded; reading is limited to what the learner selects, in memory, for one lookup.';

const allOf = (p: Permission): SourceRestrictions => ({ textRetention: p, remoteProcessing: p, audioRetention: p, export: p, sharing: p, reviewExamples: p });
/** Nobody has reviewed the terms: nothing is claimed either way. */
const UNKNOWN_RESTRICTIONS = allOf('unknown');
/** The terms (or the site itself) forbid every use; the adapter refuses anyway. */
const FORBIDDEN_RESTRICTIONS = allOf('forbidden');
/** Licensed Scripture text: nothing of the verse is kept, sent to a remote service or turned into a review example. */
const SCRIPTURE_RESTRICTIONS: SourceRestrictions = { textRetention: 'forbidden', remoteProcessing: 'forbidden', audioRetention: 'unknown', export: 'unknown', sharing: 'unknown', reviewExamples: 'forbidden' };

/** Reader chrome common to every site: toolbars, menus, dialogs, tooltips, hidden nodes, navigation and buttons. */
const CHROME_IGNORE = ['[role="toolbar"]', '[role="menu"]', '[role="menubar"]', '[role="dialog"]', '[role="tooltip"]', '[aria-hidden="true"]', 'nav', 'button', '[data-golearn-ignore]'];

// ───────────────────────────── the entries ─────────────────────────────

/** Freezes a value and everything reachable from it (plain objects and arrays only). */
function deepFreeze<T>(value: T): T {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const v of Object.values(value as Record<string, unknown>)) deepFreeze(v);
  }
  return value;
}

/** The registry is frozen all the way down: a page, a fixture address or a bug cannot change an entry's status, terms review, enabled flag or restrictions at run time. */
export const READER_REGISTRY: readonly ReaderRegistryEntry[] = deepFreeze<ReaderRegistryEntry[]>([
  {
    readerId: 'web-generic', title: 'Ordinary web page', adapter: 'web-generic', hosts: [],
    status: 'partially-verified', enabled: true,
    termsReview: notReviewed('Ordinary pages: the learner reads their own page; no site agreement is involved. Nothing is stored or sent from the page.'),
    capabilities: readable('web-generic', 'web', WEB_RESTRICTION),
    fallback: 'selection-only',
    restrictions: UNKNOWN_RESTRICTIONS,
    notes: 'The default. Verified full-context on local harness pages in a real Chromium; not verified as an installed extension on third-party sites.',
  },
  {
    readerId: 'epub-local', title: 'Controlled reader (local EPUB)', adapter: 'controlled', hosts: [],
    status: 'verified', enabled: true,
    termsReview: notReviewed('The owner\'s own reader for DRM-free files; the claim that it has no third-party terms awaits the owner\'s confirmation.'),
    capabilities: readable('epub-local', 'epub-local', 'DRM-free files only; protected EPUBs are refused.', { stableAnchors: { kind: 'cfi', note: 'EPUB CFI; re-found after pagination, reflow and re-render.' } }),
    fallback: 'none',
    restrictions: { ...UNKNOWN_RESTRICTIONS, export: 'allowed' },
    notes: 'Lives in packages/controlled-reader (its own adapter); never selected by host. Listed so the registry is the complete inventory.',
  },
  {
    readerId: 'play-books', title: 'Google Play Books (web reader)', adapter: 'site',
    hosts: [{ host: 'play.google.com', pathPrefix: '/books/reader' }],
    status: 'unverified', enabled: true,
    termsReview: notReviewed(UNREVIEWED),
    capabilities: refused('play-books', 'web', 'The reading frame is expected to be cross-origin: the browser does not let this script read its text. Only the browser\'s own copy of a selection can be used, for the word alone.'),
    fallback: 'selection-only',
    restrictions: UNKNOWN_RESTRICTIONS,
    notes: 'Public sources report a cross-origin rendering frame; not measured in a session. Expected behaviour: cross-origin-frame failure, then a word-only lookup from the browser\'s selection text. Probed 2026-10-09: the reader address redirects to the store without a session; nothing further could be observed.',
    site: { containers: [], ignore: CHROME_IGNORE, frames: 'declare-cross-origin', dynamicContent: true, nativeLookupCoexistence: 'The reader has its own selection menu; GoLearn opens only on the learner\'s own gesture and does not touch that menu.' },
  },
  {
    readerId: 'kobo-web', title: 'Kobo web reader', adapter: 'site',
    hosts: [{ host: 'read.kobo.com' }],
    status: 'permission-required', enabled: false,
    termsReview: notReviewed('The terms page could not be read (403) when last checked; the Terms of Sale restrict reproduction. A person must review before any reading.'),
    capabilities: refused('kobo-web', 'web', 'Declined until a person has reviewed the reader\'s terms; nothing is read.'),
    fallback: 'share-bridge',
    restrictions: FORBIDDEN_RESTRICTIONS,
    notes: 'Previously a literal in the decline list; now data. Contractually unresolved. Probed 2026-10-09: the reader address redirects to the vendor\'s apps page without a session.',
    refusal: 'GoLearn does not read this reader until its terms have been reviewed. Nothing was read.',
  },
  {
    readerId: 'kindle-web', title: 'Kindle for Web', adapter: 'site',
    hosts: [{ host: 'read.amazon.com' }, { host: 'kindle.amazon.com' }],
    status: 'blocked', enabled: false,
    termsReview: notReviewed('Technically blocked: the page is drawn as bitmaps and the selection is empty (measured 2026-10-08). Terms unreviewed.'),
    capabilities: refused('kindle-web', 'web', 'The text is drawn as pictures; there is no selected text to read and reading pixels is forbidden.'),
    fallback: 'share-bridge',
    restrictions: FORBIDDEN_RESTRICTIONS,
    notes: 'getSelection() is always empty; the only lawful route is the reader\'s own Copy or Notebook, which the learner pastes. DRM is never removed. Probed 2026-10-09: the address shows a sign-in landing page without a session.',
    refusal: 'GoLearn cannot read this reader: it draws each page as a picture. Nothing was read.',
  },
  {
    readerId: 'libroteka', title: 'Libroteka (Albanian ebooks)', adapter: 'site',
    hosts: [{ host: 'libroteka.al' }, { host: '*.libroteka.al' }],
    status: 'unverified', enabled: true,
    termsReview: notReviewed(UNREVIEWED),
    capabilities: readable('libroteka', 'web', WEB_RESTRICTION),
    fallback: 'controlled-reader',
    restrictions: UNKNOWN_RESTRICTIONS,
    notes: 'Reading happens only after purchase, so the reading view is unmeasured; the fixture models a plain article with chapter navigation that replaces the content. Fallback for DRM-free downloads is the controlled reader. Probed 2026-10-09: book pages are /liber/<slug>/<id>, og:type=book, html lang=sq; no reader or sample control on public pages.',
    site: { containers: [], ignore: [...CHROME_IGNORE, '.chapter-nav', '.reader-menu'], frames: 'same-origin-frames', dynamicContent: true, nativeLookupCoexistence: 'None known.' },
  },
  {
    readerId: 'kanah', title: 'Kanah (Albanian reading app)', adapter: 'site',
    hosts: [{ host: 'kanah.app' }, { host: '*.kanah.app' }],
    status: 'unverified', enabled: true,
    termsReview: notReviewed(UNREVIEWED),
    capabilities: readable('kanah', 'web', WEB_RESTRICTION),
    fallback: 'selection-only',
    restrictions: UNKNOWN_RESTRICTIONS,
    notes: 'The chapter is expected in a same-origin sandboxed iframe as paragraph blocks in a multi-column paginated body, with previous/next buttons in the top document; the top document\'s own selection sees nothing, so frames are read. Unverified for any Albanian title (needs an account). Probed 2026-10-09 on a public sample story: the story reader is at /stories/<id>/chapters/<n>/text; a selection inside the frame read back exactly; frame lang follows the story; the URL carries langId and langName.',
    site: { containers: [], ignore: [...CHROME_IGNORE, '.chapter-nav', '.reader-menu'], frames: 'same-origin-frames', dynamicContent: true, urlLanguageParam: 'langName', nativeLookupCoexistence: 'None known.' },
  },
  {
    readerId: 'tolino-webreader', title: 'tolino webreader', adapter: 'site',
    hosts: [{ host: 'webreader.mytolino.com' }, { host: '*.tolino.*' }],
    status: 'unverified', enabled: true,
    termsReview: notReviewed(UNREVIEWED),
    capabilities: readable('tolino-webreader', 'web', 'Same-origin reading frames only (vendor claim, unverified); cross-origin frames and the reader toolbar are not read.', { contextConfidence: 0.8 }),
    fallback: 'selection-only',
    restrictions: UNKNOWN_RESTRICTIONS,
    notes: 'Content is expected inside a same-origin iframe with a toolbar overlay (a vendor claim; unverified). Needs frame injection when installed. Probed 2026-10-09: the address shows a country dialog and then a sign-in; nothing was accepted or entered.',
    site: { containers: [], ignore: [...CHROME_IGNORE, '.reader-toolbar', '.toolbar'], frames: 'same-origin-frames', dynamicContent: true, nativeLookupCoexistence: 'The reader has its own dictionary on selection; GoLearn ignores that popup and does not alter it.' },
  },
  {
    readerId: 'vivlio-casadellibro', title: 'Vivlio / Casa del Libro ebooks', adapter: 'site',
    hosts: [{ host: 'ebooks.casadellibro.com' }, { host: '*.vivlio.*' }],
    status: 'unverified', enabled: true,
    termsReview: notReviewed(UNREVIEWED),
    capabilities: readable('vivlio-casadellibro', 'web', 'Same-origin reading frames only (unverified); cross-origin frames and the reader toolbar are not read.', { contextConfidence: 0.8 }),
    fallback: 'selection-only',
    restrictions: UNKNOWN_RESTRICTIONS,
    notes: 'Content is expected inside a same-origin iframe with a toolbar overlay (unverified). The same engine family as tolino is not assumed. Probed 2026-10-09: the web reader shows a terms-acceptance gate and then a sign-in; neither was accepted.',
    site: { containers: [], ignore: [...CHROME_IGNORE, '.reader-toolbar', '.toolbar'], frames: 'same-origin-frames', dynamicContent: true, nativeLookupCoexistence: 'None known.' },
  },
  {
    readerId: 'readawrite', title: 'readAwrite (Thai web novels)', adapter: 'site',
    hosts: [{ host: 'readawrite.com' }, { host: '*.readawrite.com' }],
    status: 'blocked', enabled: false,
    termsReview: notReviewed('Terms pending the research lane. The site itself prevents selecting its text; GoLearn does not override that.'),
    capabilities: refused('readawrite', 'web', 'The site prevents text selection (user-select: none, context menu disabled); GoLearn does not override it, so nothing is read.'),
    fallback: 'none',
    restrictions: FORBIDDEN_RESTRICTIONS,
    notes: 'Blocked by the site\'s own copy protection: the paragraph spans carry user-select: none and the context menu is disabled, so a learner cannot select. GoLearn never injects CSS or scripts to defeat that. Probed 2026-10-09: chapter /c/<32-hex>, story /a/<32-hex>, html lang=th; about 54 paragraph spans inside a container filled by the site\'s script after load (dynamic); Thai runs without spaces. The fixture reproduces user-select: none.',
    refusal: 'GoLearn cannot read this site: it prevents text selection (user-select: none, context menu disabled). Nothing was read.',
    site: { containers: ['.loadedContent', '.chapter-content', 'article', '[data-chapter]'], ignore: [...CHROME_IGNORE, '.reader-menu', '.comments', '.ad'], frames: 'top-only', dynamicContent: true, nativeLookupCoexistence: 'None known.' },
  },
  {
    readerId: 'mebmarket', title: 'MEB Market', adapter: 'site',
    hosts: [{ host: 'mebmarket.com' }, { host: '*.mebmarket.com' }],
    status: 'unsupported', enabled: false,
    termsReview: notReviewed('Books are read only in the provider\'s native reader; there is no web text to read. Terms unreviewed.'),
    capabilities: refused('mebmarket', 'web', 'The books are read in the provider\'s own native reader; nothing on the web page can be read.'),
    fallback: 'none',
    restrictions: UNKNOWN_RESTRICTIONS,
    notes: 'Native reader only. Listed so the learner is told plainly, instead of a silent failure. Probed 2026-10-09: no browser reader exists (installed apps only).',
    refusal: 'GoLearn cannot read this service: its books open only in its own app. Nothing was read.',
  },
  {
    readerId: 'pratilipi', title: 'Pratilipi (Hindi stories)', adapter: 'site',
    hosts: [{ host: 'pratilipi.com' }, { host: '*.pratilipi.com' }],
    status: 'permission-required', enabled: false, experimental: true,
    termsReview: notReviewed('Stories are written by third parties; no review of the site\'s terms or of the authors\' rights has been done. Disabled until a person decides.'),
    capabilities: refused('pratilipi', 'web', 'Disabled until a person has reviewed the site\'s terms; nothing is read.'),
    fallback: 'share-bridge',
    restrictions: FORBIDDEN_RESTRICTIONS,
    notes: 'Experimental. Chapters load dynamically; the adapter exists to be turned on after a review, and its fixture proves it refuses while disabled. Probed 2026-10-09 (Hindi host): /read/<slug>-<id> is public for the first part; paragraph blocks in .book-content (plus paywalled blocks and a login popup element); html lang=hi, og:locale hi_IN, a [lang=hi] ancestor; user-select auto; NFC text with many combining marks; the next part is a navigation link, not in-page loading.',
    refusal: 'GoLearn is switched off for this site until its terms have been reviewed. Nothing was read.',
    site: { containers: ['.book-content'], ignore: [...CHROME_IGNORE, '.superfan-text', '.login-popup'], frames: 'top-only', dynamicContent: true, nativeLookupCoexistence: 'None known.' },
  },
  {
    readerId: 'biblegateway', title: 'BibleGateway', adapter: 'site',
    hosts: [{ host: 'biblegateway.com' }, { host: '*.biblegateway.com' }],
    status: 'unverified', enabled: true,
    termsReview: notReviewed('Translations are licensed to the site; only the learner\'s own selection is read and no verse text is stored or sent. Terms unreviewed.'),
    capabilities: readable('biblegateway', 'web', 'Only the selected passage text is read; footnote markers, cross references and verse numbers are skipped; the reference is parsed from the URL and the verse numbers, never from text.'),
    fallback: 'selection-only',
    restrictions: SCRIPTURE_RESTRICTIONS,
    notes: 'Reference from the URL (search and version parameters); the verse number from the nearest preceding verse-number marker. Probed 2026-10-09 (public page, not the installed extension): selectable, context available. Text sits in the top document under main.page-content as paragraph blocks; verse numbers are sup.versenum, cross-reference markers sup.crossreference, footnote markers sup.footnote (all sup markers are dropped from the sentence); html lang=en with a content-language meta; version and reference only in the URL; the many cross-origin ad and consent frames are not the text (frame policy top-only).',
    site: {
      containers: ['main.page-content', '.passage-text', '.passage-content'],
      ignore: [...CHROME_IGNORE, 'sup', '.footnotes', '.crossrefs', '.passage-display-version', '.copyright'],
      frames: 'top-only', dynamicContent: false, scripture: 'biblegateway',
      nativeLookupCoexistence: 'The site\'s own word-study and cross-reference popups are ignored and not altered.',
    },
  },
  {
    readerId: 'youversion', title: 'YouVersion Bible', adapter: 'site',
    hosts: [{ host: 'bible.com' }, { host: '*.bible.com' }],
    status: 'unverified', enabled: true,
    termsReview: notReviewed('Translations are licensed to the site; only the learner\'s own selection is read and no verse text is stored or sent. Terms unreviewed.'),
    capabilities: readable('youversion', 'web', 'Only the selected passage text is read; verse labels and notes are skipped; the reference is parsed from the URL and the verse wrapper\'s data attribute, never from text.'),
    fallback: 'selection-only',
    restrictions: SCRIPTURE_RESTRICTIONS,
    notes: 'Reference from the URL path (version id, book.chapter.verse, abbreviation) and the verse wrapper\'s data-usfm attribute when the page has one. Probed 2026-10-09: the URL scheme is confirmed as /bible/<versionId>/<BOOK>.<chapter>[.<verse>[-<verse>]].<ABBR>; the verse-landing page shows the passage in a plain card with no data-usfm (html lang=en, og:locale en_US, no frames); the chapter reader showed the site\'s own client error twice, so the [data-usfm] structure (the fixture models the documented markup) is unverified.',
    site: {
      containers: [],
      ignore: [...CHROME_IGNORE, '[class*="ChapterContent_label"]', '[class*="ChapterContent_note"]', '.label', '.note'],
      frames: 'top-only', dynamicContent: true, scripture: 'youversion', pathLocale: true,
      nativeLookupCoexistence: 'The site\'s own verse action bar is ignored and not altered.',
    },
  },
]);

export const registryEntry = (readerId: string): ReaderRegistryEntry | undefined => READER_REGISTRY.find((e) => e.readerId === readerId);

/** The default entry for ordinary pages. */
export const DEFAULT_ENTRY: ReaderRegistryEntry = READER_REGISTRY[0];

/** An entry that refuses to read: a refusing status, or switched off. */
export const REFUSING_STATUSES: ReadonlySet<ReaderStatus> = new Set<ReaderStatus>(['blocked', 'permission-required', 'unsupported']);
export const entryRefuses = (e: ReaderRegistryEntry): boolean => !e.enabled || REFUSING_STATUSES.has(e.status);

// ───────────────────────────── matching ─────────────────────────────

/** A trailing `*` stands for a top-level domain: one label (`com`, `de`), or a second-level plus a country code (`co.uk`). */
const TLD = '(?:[a-z]{2,24}|(?:co|com|org|net|ac|gov|edu)\\.[a-z]{2})';
const regexCache = new Map<string, RegExp>();

function hostRegex(pattern: string): RegExp {
  let re = regexCache.get(pattern);
  if (!re) {
    const labels = pattern.toLowerCase().split('.');
    const parts = labels.map((l, i) => {
      if (l !== '*') return l.replace(/[^a-z0-9-]/g, '');
      return i === 0 ? '(?:[a-z0-9-]+\\.)+' : TLD;
    });
    // a leading `*` already carries its dot; join the rest with literal dots
    const body = labels[0] === '*' ? parts[0] + parts.slice(1).join('\\.') : parts.join('\\.');
    re = new RegExp(`^${body}$`);
    regexCache.set(pattern, re);
  }
  return re;
}

export function hostMatches(pattern: string, host: string): boolean {
  const h = host.toLowerCase().replace(/:\d+$/, '').replace(/\.$/, '');
  return !!h && hostRegex(pattern).test(h);
}

const isHttp = (page: Pick<PageDescriptor, 'href' | 'protocol'>): boolean => /^https?:$/i.test(page.protocol || (page.href.match(/^([a-z][a-z0-9+.-]*:)/i)?.[1] ?? ''));

/** Does this entry's host list name the page? Uses only the host and the path (and the scheme, to exclude non-web pages). */
export function entryMatches(entry: ReaderRegistryEntry, page: Pick<PageDescriptor, 'href' | 'protocol' | 'host' | 'pathname'>): boolean {
  if (!isHttp(page)) return false;
  const host = page.host || (() => { try { return new URL(page.href).host; } catch { return ''; } })();
  const path = page.pathname || (() => { try { return new URL(page.href).pathname; } catch { return '/'; } })();
  return entry.hosts.some((h) => hostMatches(h.host, host) && (!h.pathPrefix || path === h.pathPrefix || path.startsWith(h.pathPrefix)));
}

/** The registry entry for a page: the first host match, else the default for ordinary web and file pages, else undefined (unsupported). */
export function matchEntry(page: Pick<PageDescriptor, 'href' | 'protocol' | 'host' | 'pathname'>): ReaderRegistryEntry | undefined {
  for (const e of READER_REGISTRY) if (e.hosts.length && entryMatches(e, page)) return e;
  return /^(https?|file):$/i.test(page.protocol || (page.href.match(/^([a-z][a-z0-9+.-]*:)/i)?.[1] ?? '')) ? DEFAULT_ENTRY : undefined;
}

/**
 * The plain hosts web-generic declines: every host of a refusing entry, with a leading `*.` removed (a suffix match covers
 * subdomains) and with patterns that are not a plain domain or that are limited to a path left out.
 */
export function declinedHostsFromRegistry(): string[] {
  const out: string[] = [];
  for (const e of READER_REGISTRY) {
    if (!entryRefuses(e)) continue;
    for (const h of e.hosts) {
      if (h.pathPrefix) continue;
      const base = h.host.replace(/^\*\./, '');
      if (!base.includes('*') && !out.includes(base)) out.push(base);
    }
  }
  return out;
}
