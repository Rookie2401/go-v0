// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import {
  DEFAULT_DECLINED_HOSTS, FALLBACKS, FRAME_POLICIES, READER_REGISTRY, READER_STATUSES, SiteAdapter, UnsupportedAdapter, WebGenericAdapter,
  chooseAdapter, createAdapters, declinedHostsFromRegistry, entryRefuses, hostMatches, matchEntry, registryEntry,
} from '../../packages/golearn-extension/src/adapters';
import type { PageDescriptor } from '../../packages/golearn-extension/src/contract/readerAdapter';
import { validateCapabilities } from '../../packages/golearn-extension/src/contract/readerCapabilities';

const page = (url: string, contentType = 'text/html'): PageDescriptor => {
  const u = new URL(url);
  return { href: u.href, protocol: u.protocol, host: u.host, pathname: u.pathname, title: 'ignored', contentType };
};
const idFor = (url: string): string | undefined => matchEntry(page(url))?.readerId;

describe('the reader registry is consistent', () => {
  it('has one entry per environment with a unique id, and the expected ids', () => {
    const ids = READER_REGISTRY.map((e) => e.readerId);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.sort()).toEqual([
      'biblegateway', 'epub-local', 'kanah', 'kindle-web', 'kobo-web', 'libroteka', 'mebmarket', 'play-books',
      'pratilipi', 'readawrite', 'tolino-webreader', 'vivlio-casadellibro', 'web-generic', 'youversion',
    ]);
  });

  it('statuses, fallbacks and frame policies come from the closed sets', () => {
    expect(READER_STATUSES).toEqual(['verified', 'partially-verified', 'selection-only', 'unverified', 'permission-required', 'blocked', 'unsupported']);
    expect(FALLBACKS).toEqual(['selection-only', 'controlled-reader', 'share-bridge', 'none']);
    for (const e of READER_REGISTRY) {
      expect(READER_STATUSES, e.readerId).toContain(e.status);
      expect(FALLBACKS, e.readerId).toContain(e.fallback);
      if (e.site) expect(FRAME_POLICIES, e.readerId).toContain(e.site.frames);
    }
  });

  it('every entry declares capabilities that validate, under its own id', () => {
    for (const e of READER_REGISTRY) {
      expect(e.capabilities.readerId, e.readerId).toBe(e.readerId);
      expect(validateCapabilities(e.capabilities), e.readerId).toEqual([]);
      expect(e.capabilities.userTriggeredSelection).toBe(true);
    }
  });

  it('a person\'s terms review is never claimed: reviewed is false everywhere, and no entry carries an address', () => {
    for (const e of READER_REGISTRY) {
      expect(e.termsReview.reviewed, e.readerId).toBe(false);
      expect(e.termsReview.note.length, e.readerId).toBeGreaterThan(10);
      expect(e.notes.length, e.readerId).toBeGreaterThan(10);
    }
    expect(JSON.stringify(READER_REGISTRY)).not.toMatch(/https?:\/\//i);
  });

  it('every new site entry starts unverified, except the named refusals; the older two keep their measured status', () => {
    const refusing = new Set(['kindle-web', 'kobo-web', 'mebmarket', 'pratilipi', 'readawrite']);
    for (const e of READER_REGISTRY) {
      if (e.readerId === 'web-generic') expect(e.status).toBe('partially-verified');
      else if (e.readerId === 'epub-local') expect(e.status).toBe('verified');
      else if (!refusing.has(e.readerId)) expect(e.status, e.readerId).toBe('unverified');
    }
  });

  it('Kindle is blocked, Kobo permission-required, MEB unsupported, readAwrite blocked, Pratilipi permission-required, disabled and experimental', () => {
    expect(registryEntry('kindle-web')).toMatchObject({ status: 'blocked', enabled: false });
    expect(registryEntry('kobo-web')).toMatchObject({ status: 'permission-required', enabled: false });
    expect(registryEntry('mebmarket')).toMatchObject({ status: 'unsupported', enabled: false, fallback: 'none' });
    expect(registryEntry('readawrite')).toMatchObject({ status: 'blocked', enabled: false, fallback: 'none' });
    expect(registryEntry('pratilipi')).toMatchObject({ status: 'permission-required', enabled: false, experimental: true });
    expect(registryEntry('readawrite')!.refusal).toMatch(/user-select: none/);
  });

  it('a refusing entry is switched off, says why, and declares nothing readable; an enabled entry reads', () => {
    for (const e of READER_REGISTRY) {
      if (entryRefuses(e)) {
        expect(e.enabled, e.readerId).toBe(false);
        expect(e.refusal, e.readerId).toBeTruthy();
        expect(e.capabilities.selectedTextAvailable, e.readerId).toBe(false);
        expect(e.capabilities.sentenceContext, e.readerId).toBe('none');
      } else {
        expect(e.enabled, e.readerId).toBe(true);
      }
    }
  });

  it('every entry that was probed carries the date and the entry that the coordinator\'s probe named is not left blank', () => {
    for (const e of READER_REGISTRY.filter((x) => x.adapter === 'site')) expect(e.notes, e.readerId).toMatch(/Probed 2026-10-09/);
  });

  it('only site entries have hosts; web-generic and the controlled reader are never chosen by host', () => {
    for (const e of READER_REGISTRY) {
      if (e.adapter === 'site') expect(e.hosts.length, e.readerId).toBeGreaterThan(0); else expect(e.hosts, e.readerId).toEqual([]);
      if (e.adapter === 'site' && !entryRefuses(e)) expect(e.site, e.readerId).toBeTruthy();
    }
  });
});

describe('adapter selection by URL', () => {
  it.each([
    ['https://play.google.com/books/reader?id=x', 'play-books'],
    ['https://play.google.com/books/reader/x/y', 'play-books'],
    ['https://play.google.com/store/books', 'web-generic'],
    ['https://play.google.com/books', 'web-generic'],
    ['https://read.kobo.com/x', 'kobo-web'],
    ['https://read.amazon.com/', 'kindle-web'],
    ['https://kindle.amazon.com/', 'kindle-web'],
    ['https://www.amazon.com/dp/1', 'web-generic'],
    ['https://libroteka.al/liber/a/1', 'libroteka'],
    ['https://www.libroteka.al/liber/a/1', 'libroteka'],
    ['https://kanah.app/stories/1/chapters/2/text?langId=2', 'kanah'],
    ['https://app.kanah.app/', 'kanah'],
    ['https://webreader.mytolino.com/library/index.html', 'tolino-webreader'],
    ['https://shop.tolino.de/x', 'tolino-webreader'],
    ['https://webreader.tolino.co.uk/x', 'tolino-webreader'],
    ['https://ebooks.casadellibro.com/web/', 'vivlio-casadellibro'],
    ['https://reader.vivlio.com/x', 'vivlio-casadellibro'],
    ['https://readawrite.com/c/abc', 'readawrite'],
    ['https://mebmarket.com/', 'mebmarket'],
    ['https://hindi.pratilipi.com/read/x-1', 'pratilipi'],
    ['https://pratilipi.com/', 'pratilipi'],
    ['https://www.biblegateway.com/passage/?search=John+3:16&version=NIV', 'biblegateway'],
    ['https://www.bible.com/bible/111/JHN.3.16.NIV', 'youversion'],
    ['https://example.org/a', 'web-generic'],
    ['http://localhost:3000/x', 'web-generic'],
    ['file:///C:/books/a.html', 'web-generic'],
  ])('%s -> %s', (url, id) => { expect(idFor(url)).toBe(id); });

  it('look-alike hosts do not match, and non-web pages match nothing', () => {
    for (const u of ['https://notreadawrite.com/', 'https://read.kobo.com.evil.example/', 'https://x.tolino.evil.com/', 'https://bible.com.evil.example/', 'https://libroteka.al.evil.example/']) {
      expect(idFor(u), u).toBe('web-generic');
    }
    for (const u of ['chrome://settings/', 'chrome-extension://abc/popup.html', 'about:blank']) {
      const d = u.startsWith('about') ? { href: u, protocol: 'about:', host: '', pathname: 'blank' } : page(u);
      expect(matchEntry(d), u).toBeUndefined();
    }
  });

  it('matching uses only the href, protocol, host and path of the descriptor (no title, no content)', () => {
    expect(matchEntry({ href: 'https://hindi.pratilipi.com/read/x', protocol: 'https:', host: 'hindi.pratilipi.com', pathname: '/read/x' })?.readerId).toBe('pratilipi');
    expect(matchEntry({ href: 'https://hindi.pratilipi.com/read/x', protocol: '', host: '', pathname: '' })?.readerId).toBe('pratilipi');
  });

  it('host patterns: exact, *.suffix (not the bare domain unless listed) and *.name.* (a TLD after the name)', () => {
    expect(hostMatches('*.example.com', 'a.b.example.com')).toBe(true);
    expect(hostMatches('*.example.com', 'example.com')).toBe(false);
    expect(hostMatches('example.com', 'EXAMPLE.com:8080')).toBe(true);
    expect(hostMatches('*.tolino.*', 'a.tolino.de')).toBe(true);
    expect(hostMatches('*.tolino.*', 'a.tolino.co.uk')).toBe(true);
    expect(hostMatches('*.tolino.*', 'a.tolino.evil.com')).toBe(false);
    expect(hostMatches('*.tolino.*', 'tolino.de')).toBe(false);
  });

  it('the content script picks the adapter by registry match, with unsupported as the last resort', () => {
    const adapters = createAdapters(document);
    expect(adapters[adapters.length - 1]).toBeInstanceOf(UnsupportedAdapter);
    expect(adapters.filter((a) => a instanceof SiteAdapter).length).toBe(READER_REGISTRY.filter((e) => e.adapter === 'site').length);
    expect(chooseAdapter(page('https://www.biblegateway.com/passage/?search=John+3:16'), adapters).id).toBe('biblegateway');
    expect(chooseAdapter(page('https://read.amazon.com/'), adapters).id).toBe('kindle-web');
    expect(chooseAdapter(page('https://example.org/'), adapters).id).toBe('web-generic');
    expect(chooseAdapter(page('chrome://x/'), adapters).id).toBe('unsupported');
    expect(chooseAdapter(page('https://example.org/a.pdf', 'application/pdf'), adapters).id).toBe('unsupported');
    expect(chooseAdapter(page('https://play.google.com/books/reader?id=1', 'application/pdf'), adapters).id).toBe('unsupported');
  });

  it('every site adapter\'s own declaration validates, refusing or not', () => {
    for (const a of createAdapters(document).filter((x): x is SiteAdapter => x instanceof SiteAdapter)) {
      expect(validateCapabilities(a.capabilities()), a.id).toEqual([]);
      expect(a.capabilities().readerId).toBe(a.id);
      expect(a.capabilities().userTriggeredSelection).toBe(true);
    }
  });
});

describe('the decline list is registry data', () => {
  it('DEFAULT_DECLINED_HOSTS is derived from the refusing entries and still holds the three hosts it always held', () => {
    expect(DEFAULT_DECLINED_HOSTS).toEqual(declinedHostsFromRegistry());
    for (const h of ['read.amazon.com', 'kindle.amazon.com', 'read.kobo.com']) expect(DEFAULT_DECLINED_HOSTS).toContain(h);
    expect(DEFAULT_DECLINED_HOSTS).toContain('pratilipi.com');
    expect(DEFAULT_DECLINED_HOSTS).toContain('mebmarket.com');
    expect(DEFAULT_DECLINED_HOSTS).not.toContain('biblegateway.com');
  });

  it('web-generic declines those hosts and their subdomains', () => {
    const web = new WebGenericAdapter({ doc: document });
    for (const u of ['https://read.amazon.com/', 'https://read.kobo.com/x', 'https://kindle.amazon.com/', 'https://hindi.pratilipi.com/read/x', 'https://www.mebmarket.com/']) expect(web.matches(page(u)), u).toBe(false);
    expect(web.matches(page('https://www.amazon.com/dp/1'))).toBe(true);
  });
});
