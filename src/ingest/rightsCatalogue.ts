/**
 * The catalogue side of the rights gate: every work the courses export, looked up by language and slug. One place for
 * `npm run rights:check` and for a production build that says where it is released (server/rightsGate.ts).
 */
import type { Work } from '../core';
import type { RightsContext, WorkRightsRecord } from './rights';

/** Every catalogue the courses export: an export named *_WORKS is a list of works. */
export function catalogueWorks(courseExports: Record<string, unknown>): Work[] {
  return Object.entries(courseExports)
    .filter(([name, value]) => /_WORKS$/.test(name) && Array.isArray(value))
    .flatMap(([, value]) => value as Work[]);
}

export function workBySlug(works: readonly Work[]): (lang: string, slug: string) => Work | undefined {
  const byKey = new Map<string, Work>();
  for (const w of works) byKey.set(`${w.lang}|${w.id.split(':').pop()}`, w);
  return (lang, slug) => byKey.get(`${lang}|${slug}`) ?? works.find((w) => w.lang === lang && w.id.endsWith(`:${slug}`));
}

export const rightsRecordOf = (w: Work): WorkRightsRecord =>
  ({ state: w.rights.state, verifiedBy: w.rights.verifiedBy, verifiedAt: w.rights.verifiedAt, statusByJurisdiction: w.rights.statusByJurisdiction });

/** "US, DE , EU" → ['US', 'DE', 'EU']; empty or undefined → undefined (no claim about where the build is released). */
export function parseRelease(value: string | undefined): string[] | undefined {
  const list = (value ?? '').split(',').map((s) => s.trim()).filter(Boolean);
  return list.length ? list : undefined;
}

export function rightsContext(courseExports: Record<string, unknown>, release?: readonly string[]): RightsContext {
  const find = workBySlug(catalogueWorks(courseExports));
  return { work: (lang, slug) => { const w = find(lang, slug); return w ? rightsRecordOf(w) : undefined; }, ...(release?.length ? { release } : {}) };
}
