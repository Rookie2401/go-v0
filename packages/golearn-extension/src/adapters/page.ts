import type { PageDescriptor } from '../contract/readerAdapter';

/**
 * `true` only in the harness build (`vite build --mode content-harness` -> dist/content.harness.js), where the build defines it. In
 * every other build (`ext:build`, the production extension) the define makes it the literal `false`, and the fixture branch below is
 * removed by the minifier: the production `content.js` contains neither the attribute name nor this identifier (asserted by
 * test/extension/bundle.test.ts). Under Vitest nothing defines it, so it is read from the global at call time (a test sets
 * `globalThis.__GOLEARN_HARNESS__ = true` to exercise the harness build); an undefined global is `false`.
 */
declare const __GOLEARN_HARNESS__: boolean | undefined;

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);

/**
 * The page as the registry sees it. In the HARNESS BUILD ONLY, fixtures served from localhost may carry `<html data-fixture-url>`
 * naming the site they model, so the browser pass exercises the site adapter. A real page never gets this treatment: the hook is
 * not compiled into the production script at all, and in the harness build it is limited to loopback hosts. The fixture address
 * decides which registry entry MATCHES the page and nothing else: an entry's `enabled`, `status`, `termsReview` and `restrictions`
 * come from the (frozen) registry object, so a fixture can neither switch a refused site on nor loosen a restriction.
 */
export function describePage(doc: Document): PageDescriptor {
  const l = doc.defaultView?.location;
  if (typeof __GOLEARN_HARNESS__ !== 'undefined' && __GOLEARN_HARNESS__ && l && LOCAL_HOSTS.has(l.hostname)) {
    const fixture = doc.documentElement?.getAttribute('data-fixture-url');
    if (fixture) {
      try { const u = new URL(fixture); return { href: u.href, protocol: u.protocol, host: u.host, pathname: u.pathname, title: doc.title, contentType: doc.contentType }; } catch { /* fall through to the real location */ }
    }
  }
  return { href: l?.href ?? '', protocol: l?.protocol ?? '', host: l?.host ?? '', pathname: l?.pathname ?? '', title: doc.title, contentType: doc.contentType };
}
