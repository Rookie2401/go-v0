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

  it('a link makes a web source with the title; an app or title alone makes a reading-app source; nothing makes none', () => {
    expect(sharedSourceRef({ text: 'x', url: 'https://a.example/p/1?z=1', title: 'Chapter 1' })).toEqual({ kind: 'web', title: 'Chapter 1', locator: '/p/1' });
    expect(sharedSourceRef({ text: 'x', sourceApp: 'com.example.reader', title: 'Novel' })).toEqual({ kind: 'ebook', title: 'Novel', locator: 'app:com.example.reader' });
    expect(sharedSourceRef({ text: 'x', title: 'Novel' })).toEqual({ kind: 'ebook', title: 'Novel' });
    expect(sharedSourceRef({ text: 'x' })).toBeUndefined();
    expect(sharedSourceRef({ text: 'x', title: '   ', sourceApp: ' ' })).toBeUndefined();
  });

  it('is never built from the text: a title that repeats or contains the text is dropped, and long titles are cut', () => {
    const text = 'Unë po lexoj një libër të bukur.';
    expect(sharedSourceRef({ text, title: text })).toBeUndefined();
    expect(sharedSourceRef({ text, title: `“${text}” — Kapitulli 1` , sourceApp: 'Reader' })).toEqual({ kind: 'ebook', locator: 'app:Reader' });
    expect(sharedSourceRef({ text: 'x', title: 'T'.repeat(500), url: 'https://a.example/b' })!.title).toHaveLength(120);
    expect(JSON.stringify(sharedSourceRef({ text, url: `https://a.example/read?q=${encodeURIComponent(text)}` }))).not.toContain('libër');
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
