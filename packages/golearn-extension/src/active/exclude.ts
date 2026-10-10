/**
 * GoLearn Active: the pages its content script is never registered for. Derived from the reader registry, not written
 * by hand: every entry that refuses to read (blocked, permission-required, unsupported, or switched off) contributes
 * its hosts as `excludeMatches` of the dynamic content script. The adapter is the second line: even if a page slipped
 * through (a pattern the match syntax cannot express), the scan asks the registry again and reads nothing on a
 * refusing entry (content/active.ts).
 */
import { READER_REGISTRY, entryRefuses, type HostPattern } from '../adapters/registry';

/** A registry host pattern as a WebExtension match pattern, or undefined when the syntax cannot express it (`*.name.*`). */
export function matchPatternOf(h: HostPattern): string | undefined {
  const host = h.host.toLowerCase();
  if (!host || /[^a-z0-9.*-]/.test(host)) return undefined;
  const labels = host.split('.');
  // a wildcard is allowed only as the whole first label; a wildcard anywhere else has no match-pattern form
  if (labels.slice(1).includes('*')) return undefined;
  if (labels[0] === '*' && labels.length < 2) return undefined;
  const path = h.pathPrefix ? (h.pathPrefix.startsWith('/') ? h.pathPrefix : `/${h.pathPrefix}`) : '/';
  return `*://${host}${path}*`;
}

/** The exclude list for the registered content script: every host of every refusing registry entry. */
export function activeExcludeMatches(): string[] {
  const out: string[] = [];
  for (const e of READER_REGISTRY) {
    if (!entryRefuses(e)) continue;
    for (const h of e.hosts) {
      const p = matchPatternOf(h);
      if (p && !out.includes(p)) out.push(p);
    }
  }
  return out;
}

/** The refusing hosts no match pattern could express (so a test can say so, and the scan's own check carries them). */
export function inexpressibleRefusingHosts(): HostPattern[] {
  const out: HostPattern[] = [];
  for (const e of READER_REGISTRY) if (entryRefuses(e)) for (const h of e.hosts) if (!matchPatternOf(h)) out.push(h);
  return out;
}
