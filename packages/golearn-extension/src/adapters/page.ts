import type { PageDescriptor } from '../contract/readerAdapter';

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);

/**
 * The page as the registry sees it. Harness fixtures (served from localhost only) may carry `<html data-fixture-url>`
 * naming the site they model, so the browser pass exercises the site adapter; a real page never gets this treatment
 * because the hook is limited to loopback hosts.
 */
export function describePage(doc: Document): PageDescriptor {
  const l = doc.defaultView?.location;
  const fixture = doc.documentElement?.getAttribute('data-fixture-url');
  if (fixture && l && LOCAL_HOSTS.has(l.hostname)) {
    try { const u = new URL(fixture); return { href: u.href, protocol: u.protocol, host: u.host, pathname: u.pathname, title: doc.title, contentType: doc.contentType }; } catch { /* fall through to the real location */ }
  }
  return { href: l?.href ?? '', protocol: l?.protocol ?? '', host: l?.host ?? '', pathname: l?.pathname ?? '', title: doc.title, contentType: doc.contentType };
}
