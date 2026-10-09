import { describe, expect, it } from 'vitest';
import { passageFromShareParams, pastedPassage, readShareParams, sharedSourceRef, urlLocator } from '../../packages/golearn-share/src';

describe('the source reference of a share', () => {
  it('keeps a link’s path only: no query, fragment, credentials, port or host when there is a path', () => {
    expect(urlLocator('https://user:pw@reader.example:8443/books/ch3?page=4&q=secret#frag')).toBe('/books/ch3');
    expect(urlLocator('https://reader.example/')).toBe('reader.example');
    expect(urlLocator('javascript:alert(1)')).toBeUndefined();
    expect(urlLocator('intent://x#Intent;scheme=http;end')).toBeUndefined();
    expect(urlLocator('not a url')).toBeUndefined();
    expect(urlLocator(undefined)).toBeUndefined();
  });

  const UNKNOWN = { textRetention: 'unknown', remoteProcessing: 'unknown', audioRetention: 'unknown', export: 'unknown', sharing: 'unknown', reviewExamples: 'unknown' };

  it('a share is always a `share` source: the mechanism, then the app, the title and the link’s path when there are any; the restrictions are all unknown', () => {
    expect(sharedSourceRef({ text: 'x', mechanism: 'web-share-target', url: 'https://a.example/p/1?z=1', title: 'Chapter 1' })).toEqual({ kind: 'share', mechanism: 'web-share-target', title: 'Chapter 1', locator: '/p/1', restrictions: UNKNOWN });
    expect(sharedSourceRef({ text: 'x', mechanism: 'android-send', sourceApp: 'com.example.reader', title: 'Novel' })).toEqual({ kind: 'share', mechanism: 'android-send', sourceApp: 'com.example.reader', title: 'Novel', restrictions: UNKNOWN });
    expect(sharedSourceRef({ text: 'x', mechanism: 'ios-share-extension', title: 'Novel' })).toEqual({ kind: 'share', mechanism: 'ios-share-extension', title: 'Novel', restrictions: UNKNOWN });
    // no link, app or title: the mechanism alone is still a source (the learner can delete "everything shared by clipboard")
    expect(sharedSourceRef({ text: 'x', mechanism: 'clipboard-import' })).toEqual({ kind: 'share', mechanism: 'clipboard-import', restrictions: UNKNOWN });
    expect(sharedSourceRef({ text: 'x', mechanism: 'deep-link', title: '   ', sourceApp: ' ' })).toEqual({ kind: 'share', mechanism: 'deep-link', restrictions: UNKNOWN });
  });

  it('a sender cannot grant a permission: nothing it sends reaches the restrictions', () => {
    const ref = sharedSourceRef({ text: 'x', mechanism: 'web-share-target', title: 'restrictions allowed', sourceApp: '{"export":"allowed"}', url: 'https://a.example/p?export=allowed' });
    expect(ref.restrictions).toEqual(UNKNOWN);
  });

  it('the restrictions object is a copy: changing one reference does not change the next', () => {
    const a = sharedSourceRef({ text: 'x', mechanism: 'clipboard-import' });
    (a.restrictions as Record<string, string>).export = 'allowed';
    expect(sharedSourceRef({ text: 'x', mechanism: 'clipboard-import' }).restrictions).toEqual(UNKNOWN);
  });

  it('is never built from the text: a title that repeats or contains the text is dropped, and long titles are cut', () => {
    const text = 'Unë po lexoj një libër të bukur.';
    const m = 'web-share-target' as const;
    expect(sharedSourceRef({ text, mechanism: m, title: text })).toEqual({ kind: 'share', mechanism: m, restrictions: UNKNOWN });
    expect(sharedSourceRef({ text, mechanism: m, title: `“${text}” — Kapitulli 1` , sourceApp: 'Reader' })).toEqual({ kind: 'share', mechanism: m, sourceApp: 'Reader', restrictions: UNKNOWN });
    expect(sharedSourceRef({ text: 'x', mechanism: m, title: 'T'.repeat(500), url: 'https://a.example/b' }).title).toHaveLength(120);
    expect(JSON.stringify(sharedSourceRef({ text, mechanism: m, url: `https://a.example/read?q=${encodeURIComponent(text)}` }))).not.toContain('libër');
  });
});

describe('the web share target’s query', () => {
  it('reads text, url and title from the search, and from a query after the hash route', () => {
    expect(readShareParams('?text=shtëpinë&url=https%3A%2F%2Fa.example%2Fb&title=Book')).toEqual({ text: 'shtëpinë', url: 'https://a.example/b', title: 'Book' });
    expect(readShareParams('', '#/share?text=hello+world&title=T')).toEqual({ text: 'hello world', title: 'T' });
    expect(readShareParams('?text=a', '#/share?text=b&url=https%3A%2F%2Fx.example')).toEqual({ text: 'a', url: 'https://x.example' });
    expect(readShareParams('?text=%E0%A4%A8%E0%A4%AE%E0%A4%B8%E0%A5%8D%E0%A4%A4%E0%A5%87')).toEqual({ text: 'नमस्ते' });
  });

  it('ignores empty values and unknown parameters', () => {
    expect(readShareParams('?text=&url=%20&other=1')).toEqual({});
    expect(readShareParams('')).toEqual({});
    expect(readShareParams('', '#/share')).toEqual({});
  });

  it('makes a passage only when there is text; the mechanism defaults to web-share-target and may be a deep link', () => {
    const now = new Date('2026-10-09T10:00:00.000Z');
    expect(passageFromShareParams({ url: 'https://a.example' }, { now })).toBeUndefined();
    expect(passageFromShareParams({ text: 'palabra', title: 'T' }, { now, languageHint: 'es' })).toEqual({ text: 'palabra', title: 'T', languageHint: 'es', receivedAt: now.toISOString(), mechanism: 'web-share-target' });
    expect(passageFromShareParams({ text: 'palabra' }, { now, mechanism: 'deep-link' })!.mechanism).toBe('deep-link');
    expect(pastedPassage('palabra', { now })).toEqual({ text: 'palabra', receivedAt: now.toISOString(), mechanism: 'clipboard-import' });
  });
});
