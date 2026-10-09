// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { noCapabilities, validateCapabilities, type ReaderCapabilities } from '../../packages/golearn-extension/src/contract/readerCapabilities';
import { UnsupportedAdapter, WebGenericAdapter, chooseAdapter, describePage } from '../../packages/golearn-extension/src/adapters';
import type { PageDescriptor } from '../../packages/golearn-extension/src/contract/readerAdapter';

const page = (url: string, contentType = 'text/html'): PageDescriptor => {
  const u = new URL(url);
  return { href: u.href, protocol: u.protocol, host: u.host, pathname: u.pathname, contentType };
};

const good: ReaderCapabilities = {
  readerId: 'x', userTriggeredSelection: true, wordSelection: true, selectedTextAvailable: true, sentenceContext: 'full', adjacentContext: true,
  stableAnchors: { kind: 'dom-range' }, popupPositioning: 'range-rect', layoutChangeHandling: 'observer', persistentAnnotation: { supported: false },
  offline: true, contentAccessRestrictions: 'none stated', contextConfidence: 0.8, requiredPermissions: ['activeTab'],
};

describe('ReaderCapabilities', () => {
  it('a consistent declaration validates', () => {
    expect(validateCapabilities(good)).toEqual([]);
  });

  it('refuses claims the other fields contradict', () => {
    expect(validateCapabilities({ ...good, sentenceContext: 'none' })).toEqual(expect.arrayContaining(['sentenceContext none requires contextConfidence 0', 'adjacentContext cannot be claimed without sentence context']));
    expect(validateCapabilities({ ...good, selectedTextAvailable: false })).toEqual(expect.arrayContaining(['sentence context cannot be claimed when the selected text is unavailable', 'wordSelection cannot be claimed when the selected text is unavailable']));
    expect(validateCapabilities({ ...good, contextConfidence: 1.4 })).toContain('contextConfidence must be within 0..1');
    expect(validateCapabilities({ ...good, sentenceContext: 'full', contextConfidence: 0.2 })).toContain('sentenceContext full requires contextConfidence of at least 0.5');
    expect(validateCapabilities({ ...good, stableAnchors: { kind: 'none' } })).toContain('range-rect positioning needs an anchor');
    expect(validateCapabilities({ ...good, userTriggeredSelection: false })).toContain('every lookup must be user-triggered');
  });

  it('persistent annotation is only claimable with a terms review', () => {
    const bad = { ...good, persistentAnnotation: { supported: true, mechanism: 'highlight', termsReviewed: false } } as unknown as ReaderCapabilities;
    expect(validateCapabilities(bad)).toContain('persistent annotation needs a terms review');
    expect(validateCapabilities({ ...good, persistentAnnotation: { supported: true, mechanism: 'highlight', termsReviewed: true } })).toEqual([]);
  });
});

describe('the adapters\' declarations', () => {
  it('web-generic declares what it can do, claims no persistent annotation, and validates', () => {
    const c = new WebGenericAdapter({ doc: document }).capabilities();
    expect(validateCapabilities(c)).toEqual([]);
    expect(c.readerId).toBe('web-generic');
    expect(c.persistentAnnotation).toEqual({ supported: false });
    expect(c.requiredPermissions).toEqual(['activeTab']);
    expect(c.offline).toBe(true);
    expect(c.userTriggeredSelection).toBe(true);
    expect(c.platform).toBe('web');
    expect(c.version).toBeUndefined(); // not discoverable from an ordinary page: not guessed
  });

  it('unsupported declares nothing', () => {
    const a = new UnsupportedAdapter();
    const c = a.capabilities();
    expect(validateCapabilities(c)).toEqual([]);
    expect(c).toMatchObject({ wordSelection: false, selectedTextAvailable: false, sentenceContext: 'none', contextConfidence: 0, adjacentContext: false });
    expect(a.selection()).toMatchObject({ ok: false, reason: 'unsupported' });
    expect(a.context(document.createRange())).toMatchObject({ kind: 'none', confidence: 0 });
    expect(a.sourceRef()).toBeUndefined();
    expect(noCapabilities('r', 'why').contentAccessRestrictions).toBe('why');
  });
});

describe('choosing an adapter', () => {
  const web = new WebGenericAdapter({ doc: document });
  const un = new UnsupportedAdapter();
  it('web-generic takes ordinary http, https and file pages', () => {
    for (const u of ['https://example.org/a', 'http://localhost:3000/x', 'file:///C:/books/a.html']) expect(web.matches(page(u))).toBe(true);
  });
  it('browser pages, extension pages, PDFs and other content types are not matched', () => {
    for (const u of ['chrome://settings/', 'chrome-extension://abc/popup.html', 'about:blank', 'view-source:https://example.org/']) {
      const p = u.includes('://') ? page(u) : { href: u, protocol: u.split(':')[0] + ':', host: '', pathname: '' };
      expect(web.matches(p)).toBe(false);
    }
    expect(web.matches(page('https://example.org/a.pdf', 'application/pdf'))).toBe(false);
    expect(web.matches(page('https://example.org/data', 'application/json'))).toBe(false);
  });
  it('declines the ebook reader web apps whose terms are not reviewed', () => {
    for (const u of ['https://read.amazon.com/', 'https://read.kobo.com/x', 'https://kindle.amazon.com/']) expect(web.matches(page(u))).toBe(false);
    expect(web.matches(page('https://www.amazon.com/dp/1'))).toBe(true);
  });
  it('falls back to unsupported', () => {
    expect(chooseAdapter(page('https://read.amazon.com/'), [web, un]).id).toBe('unsupported');
    expect(chooseAdapter(page('https://example.org/'), [web, un]).id).toBe('web-generic');
    expect(chooseAdapter(page('chrome://x/'), [web]).id).toBe('unsupported');
  });
  it('describes the current page without its content', () => {
    const d = describePage(document);
    expect(Object.keys(d).sort()).toEqual(['contentType', 'host', 'href', 'pathname', 'protocol', 'title']);
  });
});
