/** GoLearn Active: the dynamic content script is never registered for a refusing reader; the list is derived from the registry, not written by hand. */
import { describe, expect, it } from 'vitest';
import { activeExcludeMatches, inexpressibleRefusingHosts, matchPatternOf } from '../../packages/golearn-extension/src/active/exclude';
import { READER_REGISTRY, entryRefuses } from '../../packages/golearn-extension/src/adapters/registry';

describe('matchPatternOf', () => {
  it('turns a registry host pattern into a WebExtension match pattern, with the path prefix when there is one', () => {
    expect(matchPatternOf({ host: 'read.amazon.com' })).toBe('*://read.amazon.com/*');
    expect(matchPatternOf({ host: '*.readawrite.com' })).toBe('*://*.readawrite.com/*');
    expect(matchPatternOf({ host: 'play.google.com', pathPrefix: '/books/reader' })).toBe('*://play.google.com/books/reader*');
  });

  it('has no form for a wildcard in the middle or at the end (`*.tolino.*`), and says so', () => {
    expect(matchPatternOf({ host: '*.tolino.*' })).toBeUndefined();
    expect(matchPatternOf({ host: 'a.*.b' })).toBeUndefined();
    expect(matchPatternOf({ host: '' })).toBeUndefined();
  });
});

describe('activeExcludeMatches', () => {
  const excluded = activeExcludeMatches();

  it('covers every host of every refusing entry (Kindle, Kobo, readAwrite, MEB, Pratilipi today)', () => {
    for (const e of READER_REGISTRY.filter(entryRefuses)) for (const h of e.hosts) expect(excluded, `${e.readerId} ${h.host}`).toContain(matchPatternOf(h));
    expect(excluded).toEqual(expect.arrayContaining(['*://read.amazon.com/*', '*://kindle.amazon.com/*', '*://read.kobo.com/*', '*://readawrite.com/*', '*://*.readawrite.com/*', '*://mebmarket.com/*', '*://*.mebmarket.com/*', '*://pratilipi.com/*', '*://*.pratilipi.com/*']));
  });

  it('excludes no enabled reader (BibleGateway, Kanah, Libroteka, tolino, Play Books stay readable) and no ordinary page', () => {
    for (const e of READER_REGISTRY.filter((x) => !entryRefuses(x))) for (const h of e.hosts) { const p = matchPatternOf(h); if (p) expect(excluded, `${e.readerId}`).not.toContain(p); }
    expect(excluded.some((p) => p === '*://*/*' || p === '<all_urls>')).toBe(false);
    expect(new Set(excluded).size).toBe(excluded.length);
  });

  it('every refusing host has a match-pattern form today (a future one that has none is still caught by the scan\'s own registry check)', () => {
    expect(inexpressibleRefusingHosts()).toEqual([]);
  });
});
